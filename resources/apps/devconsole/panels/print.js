import { defineAsyncComponent, defineComponent, ref } from 'vue'
import { CATALOG } from '../js/catalog.js'
import { call } from '../js/jsapi.js'

/** 打印：枚举 / 提交 / 任务簿管理全量方法。 */
export default defineComponent({
  name: 'PrintPanel',
  components: { InvokeForm: defineAsyncComponent(() => import('../js/components/invoke-form.js').then(m => m.default)), DeviceList: defineAsyncComponent(() => import('../js/components/device-list.js').then(m => m.default)) },
  setup() {
    const devices = ref(null)
    const jobs = ref(null)
    const lastSubmit = ref(null)

    async function loadDevices() {
      devices.value = await call('print.listDevices')
    }
    async function loadJobs() {
      jobs.value = await call('print.listPrintJobs', { maxCount: 50 })
    }
    async function onSubmitted({ result }) {
      lastSubmit.value = result
      await loadJobs()
    }
    async function reprint(job) {
      await call('print.reprintJob', { printJobId: job.printJobId })
    }
    async function removeJob(job) {
      await call('print.removePrintJob', { printJobId: job.printJobId })
      await loadJobs()
    }
    async function clearJobs() {
      await call('print.clearPrintJobs')
      await loadJobs()
    }

    return {
      submitDef: CATALOG.print.methods.submitPrintJob,
      devices, jobs, lastSubmit, loadDevices, loadJobs, onSubmitted, reprint, removeJob, clearJobs,
    }
  },
})
