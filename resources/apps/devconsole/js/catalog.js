/**
 * 应用方法目录：桥面全量清单（总览页数据源）与各面板参数表单的唯一事实源。
 * 方法名集合必须与主进程域定义严格一致，由 scripts/devconsole/catalog-check.mjs 机器比对。
 * fields 用于通用参数表单渲染：key 为嵌套点路径；showIf = { 路径: [期望值] } 控制显隐。
 */

export const PANELS = [
  { id: 'overview', label: '总览', en: 'OVERVIEW', fn: 'F1', desc: '运行时快照 · 桥面清单 · 安全边界' },
  { id: 'print', label: '打印', en: 'PRINT', fn: 'F2', desc: '设备枚举 · 参数下发 · 任务簿管理' },
  { id: 'capture', label: '拍摄', en: 'CAPTURE', fn: 'F3', desc: '设备枚举 · 实时预览 · 抓拍保存' },
  { id: 'idcard', label: '身份证', en: 'ID CARD', fn: 'F4', desc: '阅读器枚举 · 读卡 · 档案配置' },
  { id: 'iccard', label: 'IC 卡', en: 'IC CARD', fn: 'F5', desc: '扇区读写 · 文本块 · 档案配置' },
  { id: 'scanner', label: '扫码枪', en: 'SCANNER', fn: 'F6', desc: '配置下发 · 扫码事件 · 演示注入' },
  { id: 'signature', label: '签名 mock', en: 'SIGNATURE', fn: 'F7', desc: '契约形状演示 · 笔画采样 · 会话结果' },
  { id: 'events', label: '事件流', en: 'EVENTS', fn: 'F8', desc: '白名单订阅 · 事件流水 · 模拟触发' },
]

export const DEVICE_EVENT_NAMES = ['capture.frame', 'scanner.scanned', 'signature.stroke', 'devices.ready']

export const CATALOG = {
  info: {
    label: '运行信息',
    methods: {
      get: { desc: '调用方视角运行时快照（版本 / 平台 / 声明授权 / 设备状态）', fields: [] },
    },
  },
  print: {
    label: '打印',
    methods: {
      submitPrintJob: {
        desc: '提交打印任务（printContent 判别联合 + printOptions，paper 必填）',
        fields: [
          { key: 'printContent.kind', label: '负载类型', type: 'select', options: ['html', 'url', 'file'], default: 'html' },
          { key: 'printContent.html', label: 'HTML 内容', type: 'textarea', default: '<h1 style="font-family:sans-serif">开发者控制台测试页</h1><p>devconsole submitPrintJob</p>', showIf: { 'printContent.kind': ['html'] }, wide: true },
          { key: 'printContent.url', label: 'URL（pdf/image）', type: 'text', placeholder: 'https://example.com/sample.pdf', showIf: { 'printContent.kind': ['url'] }, wide: true },
          { key: 'printContent.fileType', label: '文件类型', type: 'select', options: ['', 'pdf', 'image'], default: '', showIf: { 'printContent.kind': ['url'] } },
          { key: 'printContent.path', label: '文件路径', type: 'text', placeholder: 'C:/path/to/file.pdf', showIf: { 'printContent.kind': ['file'] }, wide: true },
          { key: 'printOptions.paper', label: '纸张', type: 'text', default: 'A4' },
          { key: 'printOptions.copies', label: '份数', type: 'number', default: 1 },
          { key: 'printOptions.silent', label: '静默打印', type: 'checkbox', default: true },
          { key: 'printOptions.dryRun', label: '演练（不落纸）', type: 'checkbox', default: false },
        ],
      },
      listDevices: { desc: '枚举打印机', fields: [] },
      getJobStatus: { desc: '查询单个任务状态', fields: [{ key: 'printJobId', label: '任务 id', type: 'text' }] },
      listPrintJobs: { desc: '任务簿列表', fields: [{ key: 'maxCount', label: '上限', type: 'number', optional: true }] },
      removePrintJob: { desc: '移除任务', fields: [{ key: 'printJobId', label: '任务 id', type: 'text' }] },
      clearPrintJobs: { desc: '清空任务簿', fields: [] },
      reprintJob: { desc: '重打任务', fields: [{ key: 'printJobId', label: '任务 id', type: 'text' }] },
    },
  },
  capture: {
    label: '拍摄',
    methods: {
      listDevices: { desc: '枚举采集设备', fields: [] },
      listDeviceConfigs: { desc: '设备档案清单', fields: [] },
      getDefaultDevice: { desc: '默认设备', fields: [] },
      findDefaultDevice: { desc: '探测默认设备', fields: [] },
      setDefaultDevice: { desc: '设置默认设备（null 清除）', fields: [{ key: 'deviceId', label: '设备 id', type: 'text', nullable: true }] },
      setConfig: { desc: '写档案覆盖（deviceProfileId + overrides）', fields: [
        { key: 'deviceProfileId', label: '档案 id', type: 'text' },
        { key: 'overrides.displayName', label: '显示名', type: 'text', optional: true },
        { key: 'overrides.ws.url', label: 'ws 地址', type: 'text', optional: true },
      ] },
      captureImage: { desc: '抓拍一帧', fields: [
        { key: 'deviceId', label: '设备 id', type: 'text', optional: true },
        { key: 'imageFormat', label: '格式', type: 'select', options: ['', 'jpg', 'png', 'bmp'], default: '' },
        { key: 'resolutionIndex', label: '分辨率序号', type: 'number', optional: true },
      ] },
      saveCapturedImage: { desc: '保存 dataURL 图片到采集目录', fields: [
        { key: 'imageDataUrl', label: 'dataURL', type: 'textarea', wide: true },
        { key: 'imageExtension', label: '扩展名', type: 'text', optional: true, placeholder: 'png' },
      ] },
      startPreview: { desc: '启动预览（帧经 capture.frame 点对点推送）', fields: [{ key: 'deviceId', label: '设备 id', type: 'text', optional: true }] },
      stopPreview: { desc: '停止预览', fields: [{ key: 'deviceId', label: '设备 id', type: 'text' }] },
      listDeviceCameras: { desc: '设备下相机清单', fields: [{ key: 'deviceId', label: '设备 id', type: 'text', optional: true }] },
    },
  },
  idcard: {
    label: '身份证',
    methods: {
      listDevices: { desc: '枚举阅读器', fields: [] },
      readCard: { desc: '读取身份证（deviceId 缺省 = 首个就绪设备）', fields: [{ key: 'deviceId', label: '设备 id', type: 'text', optional: true }] },
      getConfig: { desc: '读档案配置', fields: [] },
      setConfig: { desc: '写档案覆盖', fields: [
        { key: 'deviceProfileId', label: '档案 id', type: 'text' },
        { key: 'overrides.displayName', label: '显示名', type: 'text', optional: true },
        { key: 'overrides.ws.url', label: 'ws 地址', type: 'text', optional: true },
      ] },
    },
  },
  iccard: {
    label: 'IC 卡',
    methods: {
      listDevices: { desc: '枚举读写器', fields: [] },
      readSector: { desc: '读扇区（0-15）', fields: [
        { key: 'deviceId', label: '设备 id', type: 'text', optional: true },
        { key: 'sectorNumber', label: '扇区号', type: 'number', default: 1 },
        { key: 'sectorKey', label: '密钥（12 位 hex）', type: 'text', optional: true, placeholder: 'FFFFFFFFFFFF' },
        { key: 'keyType', label: '密钥类型', type: 'select', options: ['', 'A', 'B'], default: '' },
      ] },
      writeSector: { desc: '写块（0-63，32 位 hex = 16 字节）', fields: [
        { key: 'deviceId', label: '设备 id', type: 'text', optional: true },
        { key: 'blockNumber', label: '块号', type: 'number', default: 4 },
        { key: 'blockData', label: '数据（32 hex）', type: 'text', wide: true },
        { key: 'sectorKey', label: '密钥（12 位 hex）', type: 'text', optional: true },
        { key: 'keyType', label: '密钥类型', type: 'select', options: ['', 'A', 'B'], default: '' },
      ] },
      writeTextBlocks: { desc: '写文本块（扇区 0-15，1-3 条）', fields: [
        { key: 'deviceId', label: '设备 id', type: 'text', optional: true },
        { key: 'sectorNumber', label: '扇区号', type: 'number', default: 1 },
        { key: 'textBlocks.0', label: '文本 1', type: 'text', wide: true },
        { key: 'textBlocks.1', label: '文本 2', type: 'text', optional: true },
        { key: 'textBlocks.2', label: '文本 3', type: 'text', optional: true },
        { key: 'sectorKey', label: '密钥（12 位 hex）', type: 'text', optional: true },
        { key: 'keyType', label: '密钥类型', type: 'select', options: ['', 'A', 'B'], default: '' },
      ] },
      getConfig: { desc: '读档案配置', fields: [] },
      setConfig: { desc: '写档案覆盖', fields: [
        { key: 'deviceProfileId', label: '档案 id', type: 'text' },
        { key: 'overrides.displayName', label: '显示名', type: 'text', optional: true },
        { key: 'overrides.ws.url', label: 'ws 地址', type: 'text', optional: true },
      ] },
    },
  },
  scanner: {
    label: '扫码枪',
    methods: {
      getConfig: { desc: '读扫码枪配置', fields: [] },
      setConfig: { desc: '写配置（enabled + 档案 + 覆盖白名单）', fields: [
        { key: 'enabled', label: '启用', type: 'checkbox', default: true },
        { key: 'activeProfileId', label: '激活档案 id', type: 'text', default: 'scanner-default' },
        { key: 'deviceId', label: '设备 id', type: 'text', default: 'scanner-default' },
        { key: 'overrides.displayName', label: '显示名', type: 'text', optional: true },
        { key: 'overrides.timeout', label: '超时 ms', type: 'number', optional: true },
        { key: 'overrides.minLength', label: '最短码长', type: 'number', optional: true },
        { key: 'overrides.endKey', label: '结束键', type: 'text', optional: true, placeholder: 'Enter' },
        { key: 'overrides.requirePrefix', label: '要求前缀', type: 'checkbox', default: false },
      ] },
      simulateScan: { desc: '演示注入（需平台演示模式开启，走真枪同链路）', fields: [{ key: 'scannedCode', label: '码值', type: 'text', default: 'DEVCONSOLE-6901234567892' }] },
    },
  },
}
