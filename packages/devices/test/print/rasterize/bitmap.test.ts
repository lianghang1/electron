import type { Bitmap } from '../../../src/domains/print/rasterize/bitmap.ts'
import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { composeOnCanvas, resizeBitmap, rotateBitmap } from '../../../src/domains/print/rasterize/bitmap.ts'

/** 2×2 单色位图，像素 (x,y) 颜色 = [r, g, b, 255]，r = y*10+x */
function make2x2(): Bitmap {
  const data = new Uint8Array(16)
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      const i = (y * 2 + x) * 4
      data[i] = y * 10 + x
      data[i + 1] = 20
      data[i + 2] = 30
      data[i + 3] = 255
    }
  }
  return { data, width: 2, height: 2 }
}

function pixelAt(b: Bitmap, x: number, y: number): [number, number, number, number] {
  const i = (y * b.width + x) * 4
  return [b.data[i], b.data[i + 1], b.data[i + 2], b.data[i + 3]]
}

describe('rotateBitmap', () => {
  it('0° 原样返回', () => {
    const src = make2x2()
    assert.equal(rotateBitmap(src, 0), src)
  })

  it('90° 顺时针：左上角像素转到右上角', () => {
    // src(0,0) = [0,20,30,255] 应落到 dst(1,0)
    const out = rotateBitmap(make2x2(), 90)
    assert.deepEqual(pixelAt(out, 1, 0), [0, 20, 30, 255])
    assert.deepEqual(pixelAt(out, 0, 0), [10, 20, 30, 255]) // src(0,1)（左下）转到 dst(0,0)
    assert.equal(out.width, 2)
    assert.equal(out.height, 2)
  })

  it('180°：中心对称', () => {
    const out = rotateBitmap(make2x2(), 180)
    assert.deepEqual(pixelAt(out, 1, 1), [0, 20, 30, 255])
    assert.deepEqual(pixelAt(out, 0, 0), [11, 20, 30, 255])
  })

  it('270° 顺时针：左上角像素转到左下角（宽高互换）', () => {
    const src = { data: new Uint8Array([1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255, 4, 0, 0, 255]), width: 2, height: 2 }
    const out = rotateBitmap(src, 270)
    assert.equal(out.width, 2)
    assert.equal(out.height, 2)
    assert.deepEqual(pixelAt(out, 0, 1), [1, 0, 0, 255])
    assert.deepEqual(pixelAt(out, 0, 0), [2, 0, 0, 255])
  })

  it('非方形 90° 宽高互换', () => {
    const src = { data: new Uint8Array(12 * 4), width: 3, height: 1 }
    src.data[0] = 99
    const out = rotateBitmap(src, 90)
    assert.equal(out.width, 1)
    assert.equal(out.height, 3)
    assert.deepEqual(pixelAt(out, 0, 0), [99, 0, 0, 0])
  })
})

describe('resizeBitmap（BICUBIC）', () => {
  it('同尺寸返回等值拷贝', () => {
    const src = make2x2()
    const out = resizeBitmap(src, 2, 2)
    assert.deepEqual(out.data, src.data)
    assert.notEqual(out.data, src.data)
  })

  it('恒色区域缩放后保持恒色（2×2 红 → 4×4 红）', () => {
    const src = { data: new Uint8Array(16).fill(200).map((v, i) => (i % 4 === 3 ? 255 : v)), width: 2, height: 2 }
    const out = resizeBitmap(src, 4, 4)
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const [r, g, b, a] = pixelAt(out, x, y)
        assert.equal(r, 200)
        assert.equal(g, 200)
        assert.equal(b, 200)
        assert.equal(a, 255)
      }
    }
  })

  it('黑白棋盘缩小的插值过渡（非最近邻：中间像素为混合值）', () => {
    // 2×2 黑白棋盘 → 1×1：卷积结果介于黑白之间，且不过冲出 [0,255]
    const src = { data: new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255]), width: 2, height: 2 }
    const out = resizeBitmap(src, 1, 1)
    const [r] = pixelAt(out, 0, 0)
    assert.ok(r > 0 && r < 255, `预期混合灰度，实际 ${r}`)
  })

  it('尺寸放大一倍：恒色白底 alpha 保持 255', () => {
    const src = { data: new Uint8Array(4 * 4).fill(255), width: 1, height: 1 }
    const out = resizeBitmap(src, 2, 2)
    assert.ok(out.data.every(v => v === 255))
  })
})

describe('composeOnCanvas（白底画布 + 贴放）', () => {
  it('白底铺满，内容贴到指定位置', () => {
    const src = { data: new Uint8Array(4 * 4 * 4), width: 4, height: 4 }
    for (let i = 0; i < src.data.length; i += 4) {
      src.data[i] = 10
      src.data[i + 3] = 255
    }
    const out = composeOnCanvas(src, 4, 4, 2, 3, 8, 8)
    assert.equal(out.width, 8)
    assert.equal(out.height, 8)
    assert.deepEqual(pixelAt(out, 0, 0), [255, 255, 255, 255]) // 画布左上白底
    assert.deepEqual(pixelAt(out, 2, 3), [10, 0, 0, 255]) // 贴放区左上
    assert.deepEqual(pixelAt(out, 5, 6), [10, 0, 0, 255]) // 贴放区右下
    assert.deepEqual(pixelAt(out, 6, 3), [255, 255, 255, 255]) // 贴放区外白底
  })

  it('drawRect 尺寸与源图一致时不重采样', () => {
    const src = make2x2()
    const out = composeOnCanvas(src, 2, 2, 0, 0, 4, 4)
    assert.deepEqual(pixelAt(out, 0, 0), [0, 20, 30, 255])
  })

  it('drawRect 尺寸不同时走 BICUBIC 重采样', () => {
    const src = { data: new Uint8Array(2 * 2 * 4).fill(100).map((v, i) => (i % 4 === 3 ? 255 : v)), width: 2, height: 2 }
    const out = composeOnCanvas(src, 4, 4, 1, 1, 6, 6)
    assert.deepEqual(pixelAt(out, 1, 1), [100, 100, 100, 255])
  })
})
