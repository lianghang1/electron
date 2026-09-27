import { Buffer } from 'node:buffer'
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { deflateSync } from 'node:zlib'
/**
 * 统一图标生成器：单源设计光栅化，派生全平台所需格式。
 * 输出：
 *   build/icon.png   —— 1024 主图（Windows 兜底 / Linux deb / macOS icns 源）
 *   build/icon.ico   —— Windows 多尺寸（16/24/32/48/64/128/256，小尺寸 BMP 内嵌保证兼容）
 *   build/icon.icns  —— macOS（ic10=1024 / ic09=512 / ic08=256 / ic07=128，PNG 块内嵌）
 * 设计：深蓝渐变圆角方块 + 白色三瓣莲花 + 金色托线（殡仪自助终端品牌语义）。
 * 零依赖：PNG(BGRA->zlib store) / ICO(BMP+PNG) / ICNS(PNG 块) 全部手工编码。
 */

/* ---------------- 数学与形状 ---------------- */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const mix = (a, b, t) => a + (b - a) * clamp(t, 0, 1)

/** 圆角矩形含入判定（归一化坐标，方块 [0,1]，r 圆角半径比例） */
function inRoundRect(x, y, r = 0.215) {
  if (x < 0 || x > 1 || y < 0 || y > 1)
    return false
  const cx = clamp(x, r, 1 - r)
  const cy = clamp(y, r, 1 - r)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r
}

/**
 * 卵形花瓣含入判定：中心 (cx,cy)，半高 ry，最大半宽 rx，旋转 rot，瓣尖朝上。
 * 宽度沿纵轴呈正弦分布（两端收尖、中部最宽），再整体旋转。
 */
function inPetal(x, y, cx, cy, rx, ry, rot) {
  const dx = x - cx
  const dy = y - cy
  const c = Math.cos(-rot)
  const s = Math.sin(-rot)
  const u = dx * c - dy * s
  const v = dx * s + dy * c
  if (Math.abs(v) >= ry)
    return false
  const t = (v + ry) / (ry * 2) // 0=瓣尖(上) 1=瓣根(下)
  const w = rx * Math.sin(t * Math.PI) ** 0.65 * (1.12 - t * 0.45)
  return Math.abs(u) <= w
}

/** 三瓣莲花并集：中瓣直立高耸，侧瓣低斜外张，瓣间呈 V 形豁口 */
function inLotus(x, y) {
  const cx = 0.5
  const cy = 0.48
  return inPetal(x, y, cx, cy - 0.055, 0.078, 0.185, 0)
    || inPetal(x, y, cx - 0.115, cy + 0.045, 0.07, 0.13, -0.88)
    || inPetal(x, y, cx + 0.115, cy + 0.045, 0.07, 0.13, 0.88)
}

/** 金色托线含入判定（花瓣下方的细横条，微弧） */
function inGoldLine(x, y) {
  const t = x - 0.5
  const arc = 0.012 * (1 - (t * t) / 0.09)
  return Math.abs(y - (0.672 + arc)) < 0.0075 && Math.abs(t) < 0.16
}

/* ---------------- 光栅化（2x 超采样） ---------------- */

/** 逻辑尺寸 S 的 RGBA 缓冲（预乘前 straight alpha） */
function rasterize(S) {
  const SS = 2
  const N = S * SS
  const buf = Buffer.alloc(S * S * 4)
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px * SS + sx + 0.5) / N
          const y = (py * SS + sy + 0.5) / N
          let rr = 0
          let gg = 0
          let bb = 0
          let aa = 0
          if (inRoundRect(x, y)) {
            // 对角渐变：左上深 -> 右下中蓝，叠加顶部中央微光晕
            const diag = clamp((x + y) / 2, 0, 1)
            const glow = Math.max(0, 1 - Math.hypot(x - 0.5, y - 0.18) / 0.75)
            rr = mix(0.055, 0.145, diag) + glow * 0.05
            gg = mix(0.11, 0.30, diag) + glow * 0.07
            bb = mix(0.30, 0.72, diag) + glow * 0.08
            if (inLotus(x, y)) {
              rr = 0.97
              gg = 0.97
              bb = 0.96
            }
            else if (inGoldLine(x, y)) {
              rr = 0.84
              gg = 0.70
              bb = 0.46
            }
            aa = 1
          }
          r += rr
          g += gg
          b += bb
          a += aa
        }
      }
      const n = SS * SS
      const i = (py * S + px) * 4
      buf[i] = Math.round(clamp(r / n, 0, 1) * 255)
      buf[i + 1] = Math.round(clamp(g / n, 0, 1) * 255)
      buf[i + 2] = Math.round(clamp(b / n, 0, 1) * 255)
      buf[i + 3] = Math.round(clamp(a / n, 0, 1) * 255)
    }
  }
  return buf
}

/** 简单面积平均缩放（从大图缩小） */
function resize(src, from, to) {
  const buf = Buffer.alloc(to * to * 4)
  const ratio = from / to
  for (let y = 0; y < to; y++) {
    for (let x = 0; x < to; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let cnt = 0
      const x0 = Math.floor(x * ratio)
      const y0 = Math.floor(y * ratio)
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * ratio))
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * ratio))
      for (let yy = y0; yy < y1 && yy < from; yy++) {
        for (let xx = x0; xx < x1 && xx < from; xx++) {
          const i = (yy * from + xx) * 4
          r += src[i]
          g += src[i + 1]
          b += src[i + 2]
          a += src[i + 3]
          cnt++
        }
      }
      const o = (y * to + x) * 4
      buf[o] = Math.round(r / cnt)
      buf[o + 1] = Math.round(g / cnt)
      buf[o + 2] = Math.round(b / cnt)
      buf[o + 3] = Math.round(a / cnt)
    }
  }
  return buf
}

/* ---------------- PNG 编码（RGBA，filter 0，zlib deflate） ---------------- */

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++)
      c = (c >>> 1) ^ (0xEDB88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePNG(rgba, size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ---------------- ICO 编码（小尺寸 BMP 内嵌 + 256 PNG） ---------------- */

function encodeICO(main, sizes, mainSize) {
  const png256 = encodePNG(resize(main, mainSize, 256), 256)
  // 组装每项的实际数据体（256 用 PNG 内嵌，其余 BMP：BITMAPINFOHEADER + XOR(BGRA 倒序) + AND mask）
  const bodies = sizes.map((s) => {
    if (s === 256)
      return png256
    const img = resize(main, mainSize, s)
    const bi = Buffer.alloc(40)
    bi.writeUInt32LE(40, 0)
    bi.writeInt32LE(s, 4)
    bi.writeInt32LE(s * 2, 8) // 高度翻倍 = XOR + AND
    bi.writeUInt16LE(1, 12)
    bi.writeUInt16LE(32, 14)
    const xor = Buffer.alloc(s * s * 4)
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const si = (y * s + x) * 4 // top-down 源
        const di = ((s - 1 - y) * s + x) * 4 // bottom-up 目标
        xor[di] = img[si + 2] // B
        xor[di + 1] = img[si + 1] // G
        xor[di + 2] = img[si] // R
        xor[di + 3] = img[si + 3] // A
      }
    }
    const and = Buffer.alloc(s * ((s + 31) >> 5) * 4) // 全 0 = alpha 通道生效
    return Buffer.concat([bi, xor, and])
  })

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type icon
  header.writeUInt16LE(sizes.length, 4)
  const dir = Buffer.alloc(16 * sizes.length)
  let offset = 6 + dir.length
  sizes.forEach((s, idx) => {
    const o = idx * 16
    dir[o] = s === 256 ? 0 : s
    dir[o + 1] = s === 256 ? 0 : s
    dir[o + 4] = 1 // color planes
    dir.writeUInt16LE(32, o + 6) // bits per pixel
    dir.writeUInt32LE(bodies[idx].length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += bodies[idx].length
  })
  return Buffer.concat([header, dir, ...bodies])
}

/* ---------------- ICNS 编码（PNG 块内嵌） ---------------- */

function encodeICNS(main, mainSize) {
  const blocks = []
  const push = (type, size) => {
    const img = size === mainSize ? main : resize(main, mainSize, size)
    blocks.push(Buffer.concat([Buffer.from(type, 'ascii'), Buffer.alloc(4), encodePNG(img, size)]))
  }
  push('ic10', 1024)
  push('ic09', 512)
  push('ic08', 256)
  push('ic07', 128)
  const body = Buffer.concat(blocks)
  const head = Buffer.alloc(8)
  head.write('icns', 0, 'ascii')
  head.writeUInt32BE(8 + body.length, 4)
  return Buffer.concat([head, body])
}

/* ---------------- 主流程 ---------------- */

const MAIN = 1024
const root = path.resolve(process.argv[2] || 'build')
mkdirSync(root, { recursive: true })

console.time('rasterize 1024')
const main = rasterize(MAIN)
console.timeEnd('rasterize 1024')

writeFileSync(path.join(root, 'icon.png'), encodePNG(main, MAIN))
writeFileSync(path.join(root, 'icon.ico'), encodeICO(main, [16, 24, 32, 48, 64, 128, 256], MAIN))
writeFileSync(path.join(root, 'icon.icns'), encodeICNS(main, MAIN))

for (const f of ['icon.png', 'icon.ico', 'icon.icns'])
  console.log(f, `${Math.round(statSync(path.join(root, f)).size / 1024)}KB`)
