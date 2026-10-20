import type { Server } from 'node:net'
import { createServer } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { parseScQcStartType, parseScQueryState, waitForWsPort } from './camsdk-service'

/** sc query CamSDKServer 的真实输出样例（STATE 行判定服务运行态） */
const SC_QUERY_RUNNING = `
SERVICE_NAME: CamSDKServer
        TYPE               : 10  WIN32_OWN_PROCESS
        STATE              : 4  RUNNING
                                (STOPPABLE, NOT_PAUSABLE, ACCEPTS_SHUTDOWN)
        WIN32_EXIT_CODE    : 0  (0x0)
`

const SC_QUERY_STOPPED = `
SERVICE_NAME: CamSDKServer
        STATE              : 1  STOPPED
`

/** 服务未注册时 sc query 的错误输出（1060，无 STATE 行） */
const SC_QUERY_NOT_INSTALLED = `
[SC] EnumQueryServicesStatus: 失败 1060:

指定的服务未安装作为已安装的服务。
`

/** sc qc CamSDKServer 的真实输出样例（START_TYPE 行判定自启配置） */
const SC_QC_AUTO = `
[SC] QueryServiceConfig 成功

SERVICE_NAME: CamSDKServer
        TYPE               : 10  WIN32_OWN_PROCESS
        START_TYPE         : 2   AUTO_START
        ERROR_CONTROL      : 1   NORMAL
        DISPLAY_NAME       : Cam SDK WebSocket Server
`

describe('parseScQueryState（运行态解析）', () => {
  it('运行中/已停止/暂停分别映射 running/stopped/paused', () => {
    expect(parseScQueryState(SC_QUERY_RUNNING)).toBe('running')
    expect(parseScQueryState(SC_QUERY_STOPPED)).toBe('stopped')
    expect(parseScQueryState('STATE              : 6  PAUSED')).toBe('paused')
  })

  it('异常输出（未安装 1060 / 无 STATE 行）返回 null', () => {
    expect(parseScQueryState(SC_QUERY_NOT_INSTALLED)).toBeNull()
    expect(parseScQueryState('随便一段文本')).toBeNull()
  })
})

describe('parseScQcStartType（自启类型解析）', () => {
  it('自动/手动/禁用分别映射 auto/demand/disabled', () => {
    expect(parseScQcStartType(SC_QC_AUTO)).toBe('auto')
    expect(parseScQcStartType('START_TYPE         : 3   DEMAND_START')).toBe('demand')
    expect(parseScQcStartType('START_TYPE         : 4   DISABLED')).toBe('disabled')
  })

  it('异常输出返回 null', () => {
    expect(parseScQcStartType(SC_QUERY_NOT_INSTALLED)).toBeNull()
    expect(parseScQcStartType('')).toBeNull()
  })
})

describe('waitForWsPort（端口就绪轮询）', () => {
  let server: Server

  afterEach(() => {
    server?.close()
  })

  it('端口已监听 → 立即 true', async () => {
    server = createServer()
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (typeof address !== 'object' || address === null) {
      throw new Error('监听地址异常')
    }
    expect(await waitForWsPort(`ws://127.0.0.1:${address.port}`, 2000)).toBe(true)
  })

  it('端口不通 → 超时 false', async () => {
    expect(await waitForWsPort('ws://127.0.0.1:1', 800, 200)).toBe(false)
  })
})
