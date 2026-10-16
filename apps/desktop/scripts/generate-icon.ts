import { Buffer } from 'node:buffer'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

/**
 * 生成 build/icon.ico（纯 Node，无外部依赖）：
 * 蓝色圆角方块 + 白色四宫格（多应用平台的隐喻），4x 超采样抗锯齿，
 * ICO 内嵌 PNG（Vista+ 标准），尺寸 16/24/32/48/64/128/256。
 * 用法：node scripts/generate-icon.mjs
 */

/** PNG chunk：length + type + data + crc32 */
function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = crc32.table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) { c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1 }
      table[n] = c
    }
  }
  let crc = -1
  for (const byte of buf) { crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8) }
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

/** RGBA → PNG（filter 0 逐行） */
function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/** 圆角矩形覆盖测试（坐标 0..1） */
function inRoundRect(x, y, x0, y0, size, radius) {
  const x1 = x0 + size
  const y1 = y0 + size
  if (x < x0 || x > x1 || y < y0 || y > y1) { return false }
  const cx = Math.max(x0 + radius, Math.min(x, x1 - radius))
  const cy = Math.max(y0 + radius, Math.min(y, y1 - radius))
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
}

const BG_TOP = [46, 107, 230]
const BG_BOTTOM = [25, 79, 200]
const FG = [255, 255, 255]
const CORNER = 0.22 // 外圆角比例
const CELL = 0.3 // 四宫格单格边长比例
const GAP = 0.075 // 四宫格间距比例

/** 渲染 size×size RGBA（4x 超采样） */
function render(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const S = 4
  const cell = CELL
  const gap = GAP
  const span = cell * 2 + gap
  const start = (1 - span) / 2
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let inside = 0
      let glyph = 0
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = (px + (sx + 0.5) / S) / size
          const y = (py + (sy + 0.5) / S) / size
          if (!inRoundRect(x, y, 0, 0, 1, CORNER)) { continue }
          inside++
          const col = Math.floor((x - start) / (cell + gap))
          const row = Math.floor((y - start) / (cell + gap))
          const lx = x - (start + col * (cell + gap))
          const ly = y - (start + row * (cell + gap))
          if (col >= 0 && col < 2 && row >= 0 && row < 2 && inRoundRect(lx, ly, 0, 0, cell, cell * 0.3)) { glyph++ }
        }
      }
      const t = py / size
      const bg = [
        BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t,
        BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t,
        BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t,
      ]
      const alpha = (inside / (S * S)) * 255
      const mix = glyph / Math.max(inside, 1)
      const offset = (py * size + px) * 4
      rgba[offset] = Math.round(bg[0] + (FG[0] - bg[0]) * mix)
      rgba[offset + 1] = Math.round(bg[1] + (FG[1] - bg[1]) * mix)
      rgba[offset + 2] = Math.round(bg[2] + (FG[2] - bg[2]) * mix)
      rgba[offset + 3] = Math.round(alpha)
    }
  }
  return rgba
}

const SIZES = [16, 24, 32, 48, 64, 128, 256]
const pngs = SIZES.map((size) => {
  const png = encodePNG(size, render(size))
  console.log(`icon ${size}x${size}: ${png.length} bytes`)
  return { size, png }
})

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(pngs.length, 4)
const entries = []
let offset = 6 + pngs.length * 16
for (const { size, png } of pngs) {
  const entry = Buffer.alloc(16)
  entry[0] = size % 256
  entry[1] = size % 256
  entry[4] = 1
  entry[6] = 32
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(offset, 12)
  entries.push(entry)
  offset += png.length
}
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon.ico')
writeFileSync(out, Buffer.concat([header, ...entries, ...pngs.map(p => p.png)]))
console.log(`icon.ico written: ${out}`)
