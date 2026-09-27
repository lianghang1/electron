import { Buffer } from 'node:buffer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { deflateSync } from 'node:zlib'

/**
 * 通用安装器品牌图生成器（全应用共享，单一设计源）。
 * 输出（写入本目录，随包提交，应用 yml 通过 nsis.installerSidebar 等引用）：
 *   installerSidebar.bmp    164×314  安装向导欢迎/完成页左侧竖图
 *   uninstallerSidebar.bmp  164×314  卸载向导左侧竖图（石墨色变体）
 *   installerHeader.bmp     150×57   向导每页顶部横幅
 * 尺寸为 NSIS MUI2 固定规格；构图按各画布比例专门设计（非缩放）。
 * 另在系统临时目录输出 PNG 预览便于人工审阅。
 */

/* ---------------- 基础几何 ---------------- */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const mix = (a, b, t) => a + (b - a) * clamp(t, 0, 1)
const mixRGB = (c1, c2, t) => [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)]

/** 圆角矩形（中心 cx,cy；hw/hh 为半宽半高；r 圆角，全圆时 r = hh） */
function inRoundRect(x, y, cx, cy, hw, hh, r) {
  const dx = Math.abs(x - cx)
  const dy = Math.abs(y - cy)
  if (dx > hw || dy > hh)
    return false
  const qx = Math.max(dx - (hw - r), 0)
  const qy = Math.max(dy - (hh - r), 0)
  return qx * qx + qy * qy <= r * r
}

/** 圆环 */
function inRing(x, y, cx, cy, rOuter, rInner) {
  const d2 = (x - cx) ** 2 + (y - cy) ** 2
  return d2 <= rOuter * rOuter && d2 >= rInner * rInner
}

/* ---------------- 设计语言：深色底 + 三横杠层次记号 ---------------- */

const PALETTE_INSTALL = { bgTop: [11, 24, 40], bgBottom: [28, 58, 94], accent: [94, 147, 196] }
const PALETTE_UNINSTALL = { bgTop: [33, 40, 50], bgBottom: [51, 59, 71], accent: [140, 152, 168] }

/** over：以透明度 a 把 col 叠加到背景色上 */
function createPainter(base) {
  return (a, col) => {
    base[0] = mix(base[0], col[0], a)
    base[1] = mix(base[1], col[1], a)
    base[2] = mix(base[2], col[2], a)
  }
}

/** 安装侧边竖图 164×314 */
function paintSidebar(p, x, y) {
  const t = clamp((x / 164) * 0.35 + (y / 314) * 0.65, 0, 1)
  const base = mixRGB(p.bgTop, p.bgBottom, t)
  const over = createPainter(base)
  // 出血水印环：右下 + 左上角，制造纵深
  if (inRing(x, y, 136, 332, 150, 128))
    over(0.05, [255, 255, 255])
  if (inRing(x, y, 18, 40, 60, 50))
    over(0.03, [255, 255, 255])
  // 品牌记号：三横杠（宽→窄，层次渐隐）
  const cx = 82
  const cy = 126
  if (inRoundRect(x, y, cx, cy - 11, 28, 2.5, 2.5))
    over(1.0, [255, 255, 255])
  if (inRoundRect(x, y, cx, cy, 19, 2.5, 2.5))
    over(0.72, [255, 255, 255])
  if (inRoundRect(x, y, cx, cy + 11, 11, 2.5, 2.5))
    over(0.46, [255, 255, 255])
  // 强调细线
  if (inRoundRect(x, y, cx, cy + 38, 22, 0.8, 0.8))
    over(0.9, p.accent)
  return base
}

/** 卸载侧边竖图 164×314：同构图，石墨降调 */
function paintUninstallSidebar(p, x, y) {
  const t = clamp((x / 164) * 0.35 + (y / 314) * 0.65, 0, 1)
  const base = mixRGB(p.bgTop, p.bgBottom, t)
  const over = createPainter(base)
  if (inRing(x, y, 136, 332, 150, 128))
    over(0.04, [255, 255, 255])
  const cx = 82
  const cy = 126
  if (inRoundRect(x, y, cx, cy - 11, 28, 2.5, 2.5))
    over(0.62, [255, 255, 255])
  if (inRoundRect(x, y, cx, cy, 19, 2.5, 2.5))
    over(0.45, [255, 255, 255])
  if (inRoundRect(x, y, cx, cy + 11, 11, 2.5, 2.5))
    over(0.30, [255, 255, 255])
  if (inRoundRect(x, y, cx, cy + 38, 22, 0.8, 0.8))
    over(0.5, p.accent)
  return base
}

/** 顶部横幅 150×57：左置迷你记号 + 右侧出血环 */
function paintHeader(p, x, y) {
  const t = clamp((x / 150) * 0.6 + (y / 57) * 0.4, 0, 1)
  const base = mixRGB(p.bgTop, p.bgBottom, t)
  const over = createPainter(base)
  if (inRing(x, y, 154, 12, 46, 38))
    over(0.05, [255, 255, 255])
  const cx = 24
  const cy = 28.5
  if (inRoundRect(x, y, cx, cy - 5, 12, 1.5, 1.5))
    over(1.0, [255, 255, 255])
  if (inRoundRect(x, y, cx, cy, 8, 1.5, 1.5))
    over(0.72, [255, 255, 255])
  if (inRoundRect(x, y, cx, cy + 5, 5, 1.5, 1.5))
    over(0.46, [255, 255, 255])
  if (inRoundRect(x, y, 132, 28.5, 6, 0.8, 0.8))
    over(0.9, p.accent)
  return base
}

/* ---------------- 光栅化（2x 超采样抗锯齿） ---------------- */

function rasterize(w, h, paint, S = 2) {
  const buf = Buffer.alloc(w * h * 4)
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      let r = 0
      let g = 0
      let b = 0
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const [rr, gg, bb] = paint((px * S + sx + 0.5) / S, (py * S + sy + 0.5) / S)
          r += rr
          g += gg
          b += bb
        }
      }
      const i = (py * w + px) * 4
      buf[i] = Math.round(r / (S * S))
      buf[i + 1] = Math.round(g / (S * S))
      buf[i + 2] = Math.round(b / (S * S))
      buf[i + 3] = 255
    }
  }
  return buf
}

/* ---------------- 24 位 BMP（行 4 字节对齐，自底向上） ---------------- */

function encodeBMP(rgba, w, h) {
  const stride = (w * 3 + 3) & ~3
  const pixelSize = stride * h
  const buf = Buffer.alloc(54 + pixelSize)
  buf[0] = 0x42
  buf[1] = 0x4D
  buf.writeUInt32LE(54 + pixelSize, 2)
  buf.writeUInt32LE(54, 10)
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(w, 18)
  buf.writeInt32LE(h, 22)
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(24, 28)
  buf.writeUInt32LE(pixelSize, 34)
  for (let y = 0; y < h; y++) {
    const srcY = h - 1 - y
    for (let x = 0; x < w; x++) {
      const si = (srcY * w + x) * 4
      const di = 54 + y * stride + x * 3
      buf[di] = rgba[si + 2]
      buf[di + 1] = rgba[si + 1]
      buf[di + 2] = rgba[si]
    }
  }
  return buf
}

/* ---------------- PNG（仅用于人工预览） ---------------- */

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

function encodePNG(rgba, w, h) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc(h * (w * 4 + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ---------------- 主流程 ---------------- */

const SPECS = [
  { name: 'installerSidebar', w: 164, h: 314, paint: paintSidebar },
  { name: 'uninstallerSidebar', w: 164, h: 314, paint: paintUninstallSidebar },
  { name: 'installerHeader', w: 150, h: 57, paint: paintHeader },
]

const outDir = dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const previewDir = join(tmpdir(), 'brand-preview')
mkdirSync(outDir, { recursive: true })
mkdirSync(previewDir, { recursive: true })

for (const spec of SPECS) {
  const rgba = rasterize(spec.w, spec.h, (x, y) => spec.paint(PALETTE_INSTALL, x, y))
  writeFileSync(join(outDir, `${spec.name}.bmp`), encodeBMP(rgba, spec.w, spec.h))
  const palette = spec.name === 'uninstallerSidebar' ? PALETTE_UNINSTALL : PALETTE_INSTALL
  const preview = rasterize(spec.w, spec.h, (x, y) => spec.paint(palette, x, y))
  writeFileSync(join(previewDir, `${spec.name}.png`), encodePNG(preview, spec.w, spec.h))
  console.log(`${spec.name}.bmp  ${spec.w}x${spec.h}`)
}
console.log(`预览: ${previewDir}`)
