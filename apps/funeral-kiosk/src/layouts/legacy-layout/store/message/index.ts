import type { Props } from '@/layouts/legacy-layout/AppGlobalMessage/types'

export const useGlobalMessageStore = defineStore('global-message-store', () => {
  const messageState = {
    visible: ref<Props['isVisible']>(false),
    type: ref<Props['type']>('error'),
    title: ref<Props['title']>('错误提示'),
    message: ref<Props['message']>('操作失败，请稍后重试'),
    autoClose: ref<Props['autoClose']>(3000),
  }

  const showMessage = async (options: Props) => {
    if (messageState.visible.value) {
      messageState.visible.value = false
      await nextTick()
    }
    messageState.type.value = options.type || 'error'
    messageState.title.value = options.title
      || (options.type === 'success'
        ? '操作成功'
        : options.type === 'warning'
          ? '警告提示'
          : options.type === 'info' ? '信息提示' : '错误提示')
    messageState.message.value = options.message
      || (options.type === 'success' ? '操作成功' : '操作失败，请稍后重试')
    messageState.autoClose.value = options.autoClose !== undefined ? options.autoClose : 3000
    messageState.visible.value = true
  }

  const showError = (options: Props) => {
    options.type = 'error'
    showMessage(options)
  }

  const showSuccess = (options: Props) => {
    options.type = 'success'
    showMessage(options)
  }

  const hideMessage = () => {
    messageState.visible.value = false
  }

  return {
    show: showMessage,
    error: showError,
    success: showSuccess,
    messageState,
    hideMessage,
  }
})
