import type { SignAdapter, SignDevice, SignSessionResult, SignStartResult, SignStroke, SignStrokePoint } from '../types'
import { signatureError } from '../errors'

/** 模拟板面尺寸（点坐标系上限，renderer 画布等比缩放基准） */
const WIDTH = 420
const HEIGHT = 280
/** 模拟出点周期（ms）：约 33Hz，接近真实手写板采样节奏 */
const TICK_MS = 30

/** 模拟笔画：y = cy + amp·sin(x/45) 的正弦曲线（首点 down、末点 up） */
function wave(cy: number, amp: number): SignStrokePoint[] {
  const points: SignStrokePoint[] = []
  const xEnd = WIDTH - 60
  for (let x = 60; x <= xEnd; x += 12) {
    const phase = x === 60 ? 'down' : (x + 12 > xEnd ? 'up' : 'move')
    points.push({ x, y: Math.round(cy + amp * Math.sin(x / 45)), pressure: 1, phase })
  }
  return points
}

/** 活动会话状态：待发点队列 + 已成笔画 + 定时器 */
interface StubSession {
  queue: SignStrokePoint[]
  strokes: SignStroke[]
  timer: ReturnType<typeof setInterval> | null
  onStroke: (point: SignStrokePoint) => void
}

/** mock 签名板：无硬件验证 实时笔迹推送 → 回收渲染 全链路（自动书写两条正弦笔画） */
export class StubSignAdapter implements SignAdapter {
  readonly transport = 'stub' as const
  private session: StubSession | null = null

  async listDevices(): Promise<SignDevice[]> {
    return [
      {
        id: `${this.transport}:pad`,
        displayName: '模拟签名板（stub）',
        brand: '内置',
        transport: this.transport,
        status: 'ready',
        meta: { note: '自动书写模拟笔迹（正弦曲线），用于无硬件验证 实时笔迹→回收 渲染链路' },
      },
    ]
  }

  async start(_device: SignDevice, onStroke: (point: SignStrokePoint) => void): Promise<SignStartResult> {
    if (this.session) {
      throw signatureError('SESSION_ACTIVE', '签名会话进行中（先 stopSign/cancelSign）')
    }
    // 两条错开的正弦笔画入队，定时逐点上报模拟真实书写节奏
    const session: StubSession = { queue: [...wave(110, 40), ...wave(190, 55)], strokes: [], timer: null, onStroke }
    session.timer = setInterval(() => this.tick(), TICK_MS)
    this.session = session
    return { width: WIDTH, height: HEIGHT, meta: { transport: 'stub', simulated: true } }
  }

  async stop(): Promise<SignSessionResult> {
    if (!this.session) {
      throw signatureError('SESSION_NOT_ACTIVE', '无进行中的签名会话')
    }
    const { strokes } = this.session
    this.endSession()
    return {
      strokeCount: strokes.length,
      strokes: strokes.map(stroke => ({ points: [...stroke.points] })),
      width: WIDTH,
      height: HEIGHT,
      meta: { transport: 'stub', simulated: true },
    }
  }

  async clear(): Promise<void> {
    if (!this.session) {
      throw signatureError('SESSION_NOT_ACTIVE', '无进行中的签名会话')
    }
    // 清空已成笔画 + 冲掉待发队列（模拟清屏：板面与回收数据同步归零）
    this.session.strokes = []
    this.session.queue = []
  }

  async cancel(): Promise<void> {
    if (!this.session) {
      throw signatureError('SESSION_NOT_ACTIVE', '无进行中的签名会话')
    }
    this.endSession()
  }

  destroy(): void {
    this.endSession()
  }

  /** 逐点出队：down 开新笔画，所有点均计入当前笔画并实时回调 */
  private tick(): void {
    const session = this.session
    if (!session) {
      return
    }
    const point = session.queue.shift()
    if (!point) {
      this.stopTimer()
      return
    }
    if (point.phase === 'down') {
      session.strokes.push({ points: [] })
    }
    session.strokes[session.strokes.length - 1]?.points.push(point)
    session.onStroke(point)
  }

  private stopTimer(): void {
    if (this.session?.timer) {
      clearInterval(this.session.timer)
      this.session.timer = null
    }
  }

  private endSession(): void {
    this.stopTimer()
    this.session = null
  }
}
