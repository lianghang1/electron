/** jsapi 受控桥运行时注入（jsapi preload），应用页 JS 的类型依据。 */
declare interface Window {
  jsapi?: {
    invokeDevice(method: string, input: unknown): Promise<unknown>
    onDeviceEvent(name: string, callback: (payload: unknown) => void): () => void
  }
}
