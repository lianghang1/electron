/** 验机场景订阅到的一条流式事件（预览帧 / 笔迹 / 扫码）。 */
export interface ScenarioStreamEntry {
  id: number
  event: string
  at: string
  payload: unknown
}
