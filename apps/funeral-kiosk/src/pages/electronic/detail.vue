<script setup lang="ts">
import type { DocumentManagerPlugin, PluginRegistry } from '@embedpdf/vue-pdf-viewer'
import { PDFViewer } from '@embedpdf/vue-pdf-viewer'
import BusienssApi from '@/api/business'
import AppModal from '@/components/common/AppModal/index.vue'
import { useGlobalMessageStore } from '@/layouts/legacy-layout/store'

definePage({
  meta: {
    title: '电子证照',
  },
})

const route = useRoute()
const { downloadReport, printReportPdf } = useReport()
const { playText } = useSpeech()
const globalMessageStore = useGlobalMessageStore()

const [printInfo, setPrintInfo] = useState({
  businessId: '',
  reportCode: '',
})

const rawFile = shallowRef()
const pdfUrl = useObjectUrl(rawFile)

const errorFlag = ref(false)
const loading = ref(true)
const printing = ref(false)

const modalVisible = ref(false)
const modalType = ref<'info' | 'success' | 'error' | 'warning'>('success')
const modalMessage = ref('')

function showModal(type: typeof modalType.value, message: string) {
  modalType.value = type
  modalMessage.value = message
  modalVisible.value = true
}

async function handleGetOrder() {
  errorFlag.value = false
  loading.value = true
  try {
    const query = route.query
    const data = await BusienssApi.getCertificateInfo({
      bizId: query.businessId as string,
      type: query.businessType === '5' ? '02' : '03',
    })

    if (data?.status !== '3') {
      showModal('warning', '未查询到该证照信息')
      errorFlag.value = true
      return
    }

    setPrintInfo({
      businessId: query.businessId as string,
      reportCode: query.businessType === '5' ? 'commonCremationCertificate' : 'commonAshesStorageCertificate',
    })

    const response = await downloadReport({
      code: printInfo.reportCode,
      extParams: {
        businessId: printInfo.businessId,
      },
    })
    rawFile.value = response.data
  }
  finally {
    loading.value = false
  }
}

function handleReady(registry: PluginRegistry) {
  // const commands = registry.getPlugin<CommandsPlugin>('commands')?.provides()
  // const ui = registry.getPlugin<UIPlugin>('ui')?.provides()
  const docManager = registry.getPlugin<DocumentManagerPlugin>('document-manager')?.provides()

  // if (!commands || !ui) {
  //   return
  // }

  docManager?.onDocumentError(() => {
    errorFlag.value = true
  })

  // const currentSchema = ui.getSchema()
  // const mainToolbar = currentSchema.toolbars['main-toolbar']

  // ui.mergeSchema({
  //   toolbars: {
  //     'main-toolbar': {
  //       ...mainToolbar,
  //       items: [],
  //     },
  //   },
  // })
}

async function handlePrint() {
  if (printing.value) {
    return
  }

  printing.value = true

  try {
    playText('正在打印证照，请稍候')

    await printReportPdf({
      code: printInfo.reportCode,
      extParams: {
        businessId: printInfo.businessId,
      },
    })

    playText('您的证照已打印完成，请从机器下方出口处取走')
    globalMessageStore.success({ message: '打印成功' })
    showModal('success', '打印任务已发送，请在打印机出口取走您的证照')
    // canPrintCount
  }
  catch (error) {
    console.error(error)
    playText('抱歉，证照打印未能成功。请您稍后重试，若仍未解决，请及时联系工作人员为您处理。')
    globalMessageStore.error({ message: '打印失败' })
    showModal('error', '打印失败，请稍后重试')
  }
  finally {
    printing.value = false
  }
}

onMounted(() => {
  handleGetOrder()
})
</script>

<template>
  <div class="certificate-page">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-content">
        <div class="title-section">
          <div class="icon-wrapper">
            <span class="i-mingcute-certificate-line" />
          </div>
          <div class="title-info">
            <h1 class="main-title">
              电子证照
            </h1>
            <p class="sub-title">
              在线查看和打印您的证照文件
            </p>
          </div>
        </div>
        <button
          v-if="pdfUrl && !errorFlag"
          class="print-btn"
          :disabled="printing"
          @click="handlePrint"
        >
          <span v-if="printing" class="i-svg-spinners-90-l-ring-half mr-3" />
          <span v-else class="i-mingcute-print-line mr-3" />
          {{ printing ? '正在打印...' : '打印证照' }}
        </button>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 加载状态 -->
      <div v-if="loading" class="content-wrapper loading-state">
        <div class="loading-spinner" />
        <p class="loading-text">
          正在加载证照...
        </p>
      </div>

      <!-- 错误状态 -->
      <div v-else-if="errorFlag" class="content-wrapper error-state">
        <div class="error-icon">
          <span class="i-mingcute-warning-line" />
        </div>
        <h3 class="error-title">
          证照加载失败
        </h3>
        <p class="error-desc">
          无法加载证照文件，请稍后重试
        </p>
        <button class="retry-btn" @click="handleGetOrder">
          重新加载
        </button>
      </div>

      <!-- PDF 预览 -->
      <div v-else-if="pdfUrl" class="content-wrapper pdf-container">
        <div class="pdf-wrapper">
          <PDFViewer
            v-if="!errorFlag"
            :config="{
              src: pdfUrl,
              theme: { preference: 'light' },
              render: {
                withForms: true,
              },
              i18n: {
                defaultLocale: 'zh-CN',
                fallbackLocale: 'zh-CN',
              },
              permissions: {
                enforceDocumentPermissions: true,
                overrides: {
                  modifyContents: false,
                  copyContents: false,
                  print: false,
                  modifyAnnotations: false,
                  assembleDocument: false,
                  fillForms: false,
                  extractForAccessibility: false,
                },
              },
              tabBar: 'never',

              disabledCategories: [
                'zoom',
                'annotation',
                'form',
                'annotation-shape',
                'redaction',
                'document',
                'page',
                'panel',
                'tools',
                'selection',
                'history',
                'insert',
              ],
            }"
            :style="{ width: '297mm', height: '240mm' }"
            @ready="handleReady"
          />
        </div>
      </div>
    </div>

    <!-- 弹窗提示 -->
    <AppModal
      v-model:visible="modalVisible"
      :type="modalType"
      :message="modalMessage"
      confirm-text="知道了"
      :duration="3000"
    />
  </div>
</template>

<style scoped>
.certificate-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  overflow: hidden;
}

/* 页面头部 */
.page-header {
  flex-shrink: 0;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
}

.header-content {
  padding: 32px 48px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-section {
  display: flex;
  align-items: center;
  gap: 24px;
}

.icon-wrapper {
  width: 64px;
  height: 64px;
  background: #f1f5f9;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #475569;
  font-size: 32px;
}

.main-title {
  font-size: 32px;
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 8px 0;
}

.sub-title {
  font-size: 18px;
  color: #64748b;
  margin: 0;
}

/* 打印按钮 */
.print-btn {
  display: inline-flex;
  align-items: center;
  padding: 16px 32px;
  background: #059669;
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 20px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.print-btn:hover:not(:disabled) {
  background: #047857;
}

.print-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.print-btn:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

/* 主内容区 */
.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 48px;
  display: flex;
  justify-content: center;
}

/* 内容容器 - 固定尺寸 */
.content-wrapper {
  width: 1120px;
  min-width: 1120px;
}

/* 加载状态 */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.loading-spinner {
  width: 64px;
  height: 64px;
  border: 4px solid #e2e8f0;
  border-top-color: #059669;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  margin-top: 24px;
  color: #64748b;
  font-size: 20px;
}

/* 错误状态 */
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  padding: 64px;
}

.error-icon {
  width: 96px;
  height: 96px;
  background: #fef2f2;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ef4444;
  font-size: 48px;
  margin-bottom: 32px;
}

.error-title {
  font-size: 28px;
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 12px 0;
}

.error-desc {
  font-size: 18px;
  color: #64748b;
  margin: 0 0 32px 0;
}

.retry-btn {
  padding: 16px 40px;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.retry-btn:hover {
  background: #e2e8f0;
}

/* PDF 容器 */
.pdf-container {
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.pdf-wrapper {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  padding: 32px;
}

/* 打印样式 */
@media print {
  .page-header {
    display: none;
  }

  .main-content {
    padding: 0;
  }

  .pdf-container {
    padding: 0;
  }

  .pdf-wrapper {
    box-shadow: none;
    padding: 0;
  }
}
</style>
