import type { OverlayMenuConfig } from '@desktop/shared'
import type { WebContents } from 'electron'
import type { Logger } from '../logger/logger'
import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, screen } from 'electron'

/** 菜单窗口几何常量（DIP）：与 OverlayApp.vue 的渲染尺寸一一对应 */
const MENU_WIDTH = 180
const MENU_PADDING = 4
const ITEM_HEIGHT = 28
const SEPARATOR_HEIGHT = 9
const SCREEN_MARGIN = 8
/** 窗口四周的阴影/圆角余量：透明窗会硬裁超出窗口位图的内容，box-shadow 必须留出空间 */
const MENU_SHADOW = 12

/**
 * 浮层窗口：独立透明无边框 BrowserWindow，承载右键菜单/确认弹窗等全局浮层。
 * WebContentsView 是原生合成层，永远盖在 Shell DOM 之上——浮层只能走原生窗口才能压过它。
 * 窗口懒创建、复用（hide 不销毁）；挂 parent 常驻主窗口之上，无需 alwaysOnTop。
 */
export class OverlayWindowService {
  private win: BrowserWindow | null = null
  /** overlay 页面加载完成标记：完成前到达的展示请求挂起，加载后补发 */
  private ready = false
  private pending: OverlayMenuConfig | null = null

  constructor(
    private readonly getParent: () => BrowserWindow | undefined,
    private readonly logger: Logger,
  ) {}

  /** Shell 发起：在视口坐标处弹出菜单（坐标在此换算为屏幕坐标并钳制到工作区） */
  showMenu(config: OverlayMenuConfig): void {
    const parent = this.getParent()
    if (!parent) {
      this.logger.warn('overlay showMenu skipped: main window not found')
      return
    }
    const win = this.ensure(parent)
    // 菜单内容高度 = 上下内边距 + 条目 + 分隔线；窗口在四周各加 MENU_SHADOW 余量承载阴影
    const separators = config.items.filter(item => item.separatorBefore).length
    const menuHeight = MENU_PADDING * 2 + config.items.length * ITEM_HEIGHT + separators * SEPARATOR_HEIGHT
    const [x, y] = this.resolvePosition(parent, config, menuHeight)
    win.setBounds({ x, y, width: MENU_WIDTH + MENU_SHADOW * 2, height: menuHeight + MENU_SHADOW * 2 })
    if (!win.isVisible())
      win.show()
    else win.focus()
    if (this.ready)
      win.webContents.send('overlay:show', config)
    else this.pending = config
  }

  hide(): void {
    this.win?.hide()
  }

  /** Shell（主）窗口：浮层用户动作的转发目标 */
  getShellWindow(): BrowserWindow | undefined {
    return this.getParent()
  }

  /** 来源校验：仅浮层窗口自身可回传动作，防止其他 renderer 伪造 */
  isOverlay(sender: WebContents): boolean {
    return this.win?.webContents === sender
  }

  /** 懒创建 + 复用；加载 overlay 路由（复用 Shell renderer 入口，hash 区分） */
  private ensure(parent: BrowserWindow): BrowserWindow {
    if (this.win)
      return this.win
    const win = new BrowserWindow({
      width: MENU_WIDTH,
      height: 0,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      parent,
      webPreferences: {
        preload: join(__dirname, '../preload/index.cjs'),
        sandbox: true,
        contextIsolation: true,
      },
    })
    win.setMenu(null)
    // 失焦即收起：点击菜单外任意位置（焦点回到主窗口）都算关闭
    win.on('blur', () => win.hide())
    win.on('closed', () => {
      this.win = null
      this.ready = false
      this.pending = null
    })
    win.webContents.on('did-finish-load', () => {
      this.ready = true
      if (this.pending) {
        win.webContents.send('overlay:show', this.pending)
        this.pending = null
      }
    })

    const devUrl = process.env.ELECTRON_RENDERER_URL
    const load
      = is.dev && devUrl
        ? win.loadURL(`${devUrl}#/overlay`)
        : win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/overlay' })
    void load.catch((error) => {
      this.logger.error('failed to load overlay renderer', { error: String(error) })
    })

    this.win = win
    return win
  }

  /** 视口坐标 → 屏幕坐标（页面 (0,0) 即主窗口内容区左上角），并钳制到所在屏幕工作区 */
  private resolvePosition(parent: BrowserWindow, config: OverlayMenuConfig, menuHeight: number): [number, number] {
    const width = MENU_WIDTH + MENU_SHADOW * 2
    const height = menuHeight + MENU_SHADOW * 2
    // 菜单本体从余量处开始绘制：锚点按视口坐标落位，窗口原点向左上各退一个余量
    const content = parent.getContentBounds()
    let x = content.x + config.x - MENU_SHADOW
    let y = content.y + config.y - MENU_SHADOW
    const workArea = screen.getDisplayNearestPoint({ x, y }).workArea
    x = Math.min(Math.max(x, workArea.x + SCREEN_MARGIN), workArea.x + workArea.width - width - SCREEN_MARGIN)
    y = Math.min(Math.max(y, workArea.y + SCREEN_MARGIN), workArea.y + workArea.height - height - SCREEN_MARGIN)
    return [Math.round(x), Math.round(y)]
  }
}
