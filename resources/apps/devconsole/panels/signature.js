import { defineComponent, ref } from 'vue'

/**
 * 签名（mock）：平台无 signature 设备域，交互按 @shell/shared devices/signature 契约
 * 形状在应用内模拟——SignStrokePoint 采样（phase/pressure）→ SignSessionResult 汇总。
 * 将来真实域接入时，本页只需把采样源换成 signature.stroke 事件流。
 */
export default defineComponent({
  name: 'SignaturePanel',
  setup() {
    const session = ref(null)
    const result = ref(null)
    const strokes = ref([])

    const CANVAS_W = 480
    const CANVAS_H = 220
    let current = null

    /** mock SignStartResult：板面尺寸即画布尺寸（点坐标系） */
    async function startSession() {
      result.value = null
      strokes.value = []
      current = null
      clearCanvas()
      session.value = { width: CANVAS_W, height: CANVAS_H, meta: { mock: true, transport: 'stub' } }
    }

    function pointerPos(event) {
      const rect = event.currentTarget.getBoundingClientRect()
      return {
        x: Math.round(((event.clientX - rect.left) / rect.width) * CANVAS_W),
        y: Math.round(((event.clientY - rect.top) / rect.height) * CANVAS_H),
        pressure: event.pointerType === 'pen' ? Math.max(0.1, event.pressure || 0.5) : 1,
      }
    }

    function onDown(event) {
      if (!session.value) { return }
      event.currentTarget.setPointerCapture(event.pointerId)
      const point = pointerPos(event)
      current = { points: [{ ...point, phase: 'down' }] }
      draw(point, point)
    }
    function onMove(event) {
      if (!session.value || !current) { return }
      const point = pointerPos(event)
      current.points.push({ ...point, phase: 'move' })
      draw(current.points.at(-2), point)
    }
    function onUp(event) {
      if (!session.value || !current) { return }
      const point = pointerPos(event)
      current.points.push({ ...point, phase: 'up' })
      draw(current.points.at(-2), point)
      strokes.value.push(current)
      current = null
    }

    /** mock SignSessionResult：笔迹点模式（ws 厂商设备侧产位图模式此处不模拟） */
    async function endSession() {
      if (!session.value) { return }
      result.value = {
        strokeCount: strokes.value.length,
        strokes: strokes.value,
        width: CANVAS_W,
        height: CANVAS_H,
      }
      session.value = null
    }

    function clearCanvas() {
      const canvas = /** @type {HTMLCanvasElement | null} */ (document.querySelector('#sign-canvas'))
      const ctx = canvas?.getContext('2d')
      if (ctx) { ctx.clearRect(0, 0, canvas.width, canvas.height) }
    }

    function draw(from, to) {
      const canvas = /** @type {HTMLCanvasElement | null} */ (document.querySelector('#sign-canvas'))
      const ctx = canvas?.getContext('2d')
      if (!ctx || !from) { return }
      ctx.strokeStyle = '#1a2233'
      ctx.lineWidth = Math.max(1, to.pressure * 3)
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()
    }

    return { session, result, strokes, CANVAS_W, CANVAS_H, startSession, endSession, onDown, onMove, onUp }
  },
})
