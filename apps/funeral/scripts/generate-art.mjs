import { Buffer } from 'node:buffer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

/**
 * 生成殡仪终端美术资源（纯 Node，无外部依赖）：
 * - bg.png 1920×1080 全局背景：暖白米金·庄重大气（金环日晕 + 底部远山）
 * 色值与 src/styles/tokens.css 的「暖白米金」体系一致。
 * 用法：node scripts/generate-art.mjs
 */

/** PNG chunk：length + type + data + crc32 */
function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = crc32.table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
  }
  let crc = -1
  for (const byte of buf) crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

/** RGBA → PNG（filter 0 逐行，支持非正方形） */
function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const stride = w * 4
  const raw = Buffer.alloc(h * (stride + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF]
}

/** 确定性伪随机（LCG），保证每次生成结果一致 */
function lcg(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/**
 * 画布：RGB 浮点通道 + 加色/压暗两步混合。
 * 光晕、光环用加色（暗底上更透亮），暗角用压暗。
 */
function createCanvas(w, h, baseFill) {
  const px = new Float64Array(w * h * 3)
  for (let i = 0; i < w * h; i++) {
    px[i * 3] = baseFill[0]
    px[i * 3 + 1] = baseFill[1]
    px[i * 3 + 2] = baseFill[2]
  }
  return {
    w,
    h,
    px,
    /** 加色混合 */
    add(i, color, alpha) {
      px[i * 3] += color[0] * alpha
      px[i * 3 + 1] += color[1] * alpha
      px[i * 3 + 2] += color[2] * alpha
    },
    /** 压暗混合 */
    darken(i, color, alpha) {
      px[i * 3] = lerp(px[i * 3], color[0], alpha)
      px[i * 3 + 1] = lerp(px[i * 3 + 1], color[1], alpha)
      px[i * 3 + 2] = lerp(px[i * 3 + 2], color[2], alpha)
    },
    toRGBA() {
      const out = Buffer.alloc(w * h * 4)
      for (let i = 0; i < w * h; i++) {
        out[i * 4] = Math.min(255, Math.round(px[i * 3]))
        out[i * 4 + 1] = Math.min(255, Math.round(px[i * 3 + 1]))
        out[i * 4 + 2] = Math.min(255, Math.round(px[i * 3 + 2]))
        out[i * 4 + 3] = 255
      }
      return out
    },
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

/**
 * 日晕：浅底上用压暗混合（lerp 向暖色），径向高斯衰减。
 * 包围盒按衰减到 0.002 的裁止距离计算，避免切边
 */
function drawGlowDarken(canvas, cx, cy, radius, color, peak) {
  const { w, h } = canvas
  const sigma = radius / 2.2
  const dMax = Math.min(radius * 3, sigma * Math.sqrt(2 * Math.log(peak / 0.002)))
  const x0 = Math.max(0, Math.floor(cx - dMax))
  const x1 = Math.min(w - 1, Math.ceil(cx + dMax))
  const y0 = Math.max(0, Math.floor(cy - dMax))
  const y1 = Math.min(h - 1, Math.ceil(cy + dMax))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2
      const a = peak * Math.exp(-d2 / (2 * sigma * sigma))
      if (a < 0.002)
        continue
      canvas.darken(y * w + x, color, a)
    }
  }
}

/** 细金环（压暗版）：核心线 + 外扩辉光，浅底上呈现鎏金线 */
function drawRingInk(canvas, cx, cy, radius, color, coreAlpha, glowAlpha) {
  const { w, h } = canvas
  const span = radius + 90
  const x0 = Math.max(0, Math.floor(cx - span))
  const x1 = Math.min(w - 1, Math.ceil(cx + span))
  const y0 = Math.max(0, Math.floor(cy - span))
  const y1 = Math.min(h - 1, Math.ceil(cy + span))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.abs(Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) - radius)
      if (d > 80)
        continue
      const core = Math.exp(-(d * d) / (2 * 1.8 * 1.8))
      const halo = Math.exp(-(d * d) / (2 * 22 * 22))
      const a = coreAlpha * core + glowAlpha * halo
      if (a < 0.002)
        continue
      canvas.darken(y * w + x, color, a)
    }
  }
}

/** 光粒（压暗版）：深金小点，浅底上呈现鎏金微尘 */
function drawParticlesInk(canvas, list) {
  const { w, h } = canvas
  for (const p of list) {
    const r = p.r + p.r * 2.2
    const x0 = Math.max(0, Math.floor(p.x - r))
    const x1 = Math.min(w - 1, Math.ceil(p.x + r))
    const y0 = Math.max(0, Math.floor(p.y - r))
    const y1 = Math.min(h - 1, Math.ceil(p.y + r))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = (x - p.x) ** 2 + (y - p.y) ** 2
        const a = p.a * Math.exp(-d2 / (2 * (p.r * 0.9) ** 2))
        if (a < 0.004)
          continue
        canvas.darken(y * w + x, p.color, a)
      }
    }
  }
}

/** 远山剪影：两层正弦叠加轮廓，向下渐淡，庄重的地平线 */
function drawMountains(canvas, baseY, amp, wavelength, color, alpha, seed) {
  const { w, h } = canvas
  const rand = lcg(seed)
  const p1 = rand() * Math.PI * 2
  const p2 = rand() * Math.PI * 2
  for (let x = 0; x < w; x++) {
    const ySurface = baseY
      + Math.sin((x / wavelength) * Math.PI * 2 + p1) * amp
      + Math.sin((x / (wavelength * 0.37)) * Math.PI * 2 + p2) * amp * 0.45
    const yStart = Math.max(0, Math.floor(ySurface))
    for (let y = yStart; y < h; y++) {
      // 山体向下渐淡，避免底部死板
      const fade = 1 - Math.min(1, (y - ySurface) / (h - ySurface + 1)) * 0.4
      canvas.darken(y * w + x, color, alpha * fade)
    }
  }
}

const GOLD_INK = hexToRgb('#a8823c')

/** 背景 1920×1080：暖白米金·庄重大气——大面积留白 + 右上金环日晕 + 底部远山 */
function renderBg() {
  const w = 1920
  const h = 1080
  const canvas = createCanvas(w, h, [0, 0, 0])
  // 暖白→米金对角渐变：上白下暖，明亮干净
  fillDiagonal(canvas, hexToRgb('#fbf9f4'), hexToRgb('#f4edde'), hexToRgb('#e9ddc4'))

  // 顶部中央极淡暖调，衬深色标题区
  drawGlowDarken(canvas, w * 0.5, h * 0.05, w * 0.52, hexToRgb('#ebe0c4'), 0.22)

  // 右上日晕托底：大范围暖金晕染（纸上金晕的质感）
  drawGlowDarken(canvas, w * 0.895, h * 0.115, w * 0.16, hexToRgb('#e3d0a0'), 0.5)
  drawGlowDarken(canvas, w * 0.895, h * 0.115, w * 0.07, hexToRgb('#d6ba7c'), 0.32)

  // 鎏金细环：右上主环 + 同心弱环 + 左下呼应小环
  drawRingInk(canvas, w * 0.895, h * 0.115, w * 0.082, GOLD_INK, 0.55, 0.09)
  drawRingInk(canvas, w * 0.895, h * 0.115, w * 0.122, GOLD_INK, 0.18, 0.05)
  drawRingInk(canvas, w * 0.045, h * 0.97, w * 0.06, GOLD_INK, 0.26, 0.05)

  // 底部远山两层剪影：淡雅地平线
  drawMountains(canvas, h * 0.865, h * 0.05, w * 0.5, hexToRgb('#cfc4a8'), 0.45, 20260927)
  drawMountains(canvas, h * 0.925, h * 0.035, w * 0.34, hexToRgb('#beb191'), 0.5, 20260928)

  // 深金微尘：右上沿环密集，其余稀疏
  const rand = lcg(20260926)
  const particles = []
  for (let i = 0; i < 60; i++) {
    const nearRing = rand() < 0.6
    const angle = rand() * Math.PI * 2
    const dist = w * (0.04 + rand() * 0.12)
    particles.push({
      x: nearRing ? w * 0.895 + Math.cos(angle) * dist : rand() * w,
      y: nearRing ? h * 0.115 + Math.sin(angle) * dist * 0.8 : rand() * h * 0.85,
      r: 0.6 + rand() * 1.2,
      a: 0.1 + rand() * 0.28,
      color: hexToRgb('#8a6a2e'),
    })
  }
  drawParticlesInk(canvas, particles)

  return encodePNG(w, h, canvas.toRGBA())
}

/** 三段对角渐变底：top → mid → bottom */
function fillDiagonal(canvas, top, mid, bottom) {
  const { w, h, px } = canvas
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = Math.min(1, (y / h) * 0.86 + (x / w) * 0.14) * 2
      const i = y * w + x
      let r
      let g
      let b
      if (t < 1) {
        // 分段 smoothstep：保证接缝处导数连续，避免渐变折痕
        const u = t * t * (3 - 2 * t)
        r = lerp(top[0], mid[0], u)
        g = lerp(top[1], mid[1], u)
        b = lerp(top[2], mid[2], u)
      }
      else {
        const u0 = t - 1
        const u = u0 * u0 * (3 - 2 * u0)
        r = lerp(mid[0], bottom[0], u)
        g = lerp(mid[1], bottom[1], u)
        b = lerp(mid[2], bottom[2], u)
      }
      px[i * 3] = r
      px[i * 3 + 1] = g
      px[i * 3 + 2] = b
    }
  }
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'images')
mkdirSync(outDir, { recursive: true })

const bg = renderBg()
writeFileSync(join(outDir, 'bg.png'), bg)
console.log(`bg.png: ${(bg.length / 1024).toFixed(0)} KB`)
console.log(`done → ${outDir}`)
