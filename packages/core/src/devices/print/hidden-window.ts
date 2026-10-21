import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { printError } from './errors'

type HiddenTarget = 'utility' | 'pdf'

/**
 * 隐藏窗口池：所有"渲染后打印"都发生在不可见窗口里。
 * - utility：加载 HTML 模板 → webContents.print / printToPDF / getPrintersAsync
 * - pdfViewer：plugins:true 加载 PDF 文件（无 SumatraPDF 时的兜底打印路径）
 *
 * 每个窗口同一时刻只能执行一个"渲染+打印"任务（runExclusive 串行化），
 * 否则并发 submit 的第二次 loadURL 会打断第一次的渲染。
 */
export class HiddenWindowPool {
  private utility: BrowserWindow | null = null
  private pdfViewer: BrowserWindow | null = null
  private queues: Map<HiddenTarget, Promise<unknown>> = new Map()

  /**
   * getParent：主窗口引用。池窗必须挂 parent——无 parent 的隐藏窗会在主窗口销毁后继续存活，
   * 使 window-all-closed 永不触发（进程常驻，表现为"应用已退出但任务管理器还有进程"）。
   * 挂 parent 后主窗销毁即级联销毁池窗，退出链路自然走完。
   */
  constructor(private readonly getParent?: () => BrowserWindow | undefined) {}

  /** 串行执行占用目标窗口的完整任务（渲染→打印必须在同一个锁内完成） */
  async runExclusive<T>(target: HiddenTarget, fn: (win: BrowserWindow) => Promise<T>): Promise<T> {
    const prev = this.queues.get(target) ?? Promise.resolve()
    let release!: () => void
    const gate = new Promise<void>(resolve => (release = resolve))
    // 前一任务无论成败都不阻塞后续任务
    this.queues.set(target, prev.then(() => gate, () => gate))
    await prev
    try {
      const win = target === 'utility' ? await this.getUtility() : await this.getPdfViewer()
      return await fn(win)
    }
    finally {
      release()
    }
  }

  private async getUtility(): Promise<BrowserWindow> {
    if (this.utility && !this.utility.isDestroyed()) { return this.utility }
    this.utility = new BrowserWindow({
      show: false,
      skipTaskbar: true,
      parent: this.getParent?.(),
      webPreferences: {
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    })
    this.utility.on('closed', () => {
      this.utility = null
    })
    return this.utility
  }

  private async getPdfViewer(): Promise<BrowserWindow> {
    if (this.pdfViewer && !this.pdfViewer.isDestroyed()) { return this.pdfViewer }
    this.pdfViewer = new BrowserWindow({
      show: false,
      skipTaskbar: true,
      parent: this.getParent?.(),
      webPreferences: {
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
        plugins: true, // Chromium 内置 PDF 查看器，兜底打印 PDF 用
      },
    })
    this.pdfViewer.on('closed', () => {
      this.pdfViewer = null
    })
    return this.pdfViewer
  }

  /** 只借用 utility 窗口执行窗口级 API（如 getPrintersAsync），与渲染/打印任务互斥 */
  withUtility<T>(fn: (win: BrowserWindow) => Promise<T>): Promise<T> {
    return this.runExclusive('utility', fn)
  }

  /** 便捷入口：加载 HTML 并等待渲染与字体就绪（仅渲染场景；通道内部请用 runExclusive 包住渲染+打印全程） */
  async loadHtml(html: string): Promise<BrowserWindow> {
    return this.runExclusive('utility', win => loadHtmlInto(win, html))
  }

  destroyAll(): void {
    for (const win of [this.utility, this.pdfViewer]) {
      if (win && !win.isDestroyed()) { win.destroy() }
    }
    this.utility = null
    this.pdfViewer = null
  }
}

/** 在指定窗口加载 HTML 并等待渲染与字体就绪（打印前必须等到，否则截到半渲染页面） */
export async function loadHtmlInto(win: BrowserWindow, html: string): Promise<BrowserWindow> {
  // 图片打印的 HTML 内嵌整图 base64（可达数 MB），超出 data: URL 导航长度上限会报
  // ERR_INVALID_URL(-300)，因此统一落临时文件走 loadFile；模板资源必须内联，加载完即可删除
  const tmpFile = join(tmpdir(), `print-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.html`)
  await writeFile(tmpFile, html, 'utf8')
  try {
    await win.loadFile(tmpFile)
    // 等字体与全部图片就绪：base64 大图无网络加载但解码异步，did-finish-load 与
    // fonts.ready 均不等待解码，低端机大照片未解码完就打印会出白图
    await win.webContents.executeJavaScript(
      // 片段以 + 号拼接后不含换行，语句间必须显式补分号（否则 ASI 失效直接语法错误）
      'new Promise(r => {'
      + ' const imgs = Array.from(document.images)'
      + '   .map(img => img.complete ? Promise.resolve() : new Promise(d => { img.onload = img.onerror = d }));'
      + ' const f = document.fonts ? document.fonts.ready : Promise.resolve();'
      + ' Promise.all([...imgs, f]).then(() => requestAnimationFrame(() => setTimeout(r, 30)));'
      + ' })',
    )
  }
  finally {
    await rm(tmpFile, { force: true }).catch(() => {})
  }
  return win
}

/** webContents.print 的 Promise 化；失败原因映射为统一错误码 */
export function webContentsPrint(wc: Electron.WebContents, options: Electron.WebContentsPrintOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    wc.print(options, (success, failureReason) => {
      if (success) { resolve() }
      else if (failureReason === 'Print job canceled') { reject(printError('JOB_CANCELED', failureReason)) }
      else { reject(printError('JOB_FAILED', failureReason || '打印任务失败')) }
    })
  })
}
