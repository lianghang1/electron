import { defineComponent, reactive, ref } from 'vue'
import { call } from '../jsapi.js'

/**
 * 通用方法调用表单：按目录条目 fields 渲染参数。
 * model 以完整点路径为平面键（v-model 直接绑定），提交时展开为嵌套入参；
 * showIf = { 路径: [期望值] } 条件显隐；空文本/空数字不入参，checkbox 显式收，nullable 空收 null。
 */
export default defineComponent({
  name: 'InvokeForm',
  props: {
    method: { type: String, required: true },
    def: { type: Object, required: true },
    label: { type: String, default: '执行' },
  },
  emits: ['result'],
  setup(props, { emit }) {
    const model = reactive({})
    for (const field of props.def.fields ?? []) {
      if (field.default !== undefined) { model[field.key] = field.default }
    }
    const busy = ref(false)
    const error = ref(null)

    function visible(field) {
      if (!field.showIf) { return true }
      return Object.entries(field.showIf).every(([key, expected]) => expected.includes(model[key]))
    }

    async function submit() {
      busy.value = true
      error.value = null
      const input = buildInput(props.def.fields ?? [])
      try {
        const result = await call(props.method, input)
        emit('result', { result, input })
      }
      catch (err) {
        error.value = err
      }
      finally {
        busy.value = false
      }
    }

    /** 收集可见字段：跳过空文本与空数字（optional 语义），checkbox 显式收，nullable 空收 null */
    function buildInput(fields) {
      const input = {}
      for (const field of fields) {
        if (!visible(field)) { continue }
        const raw = model[field.key]
        if (field.type === 'checkbox') { setNested(input, field.key, Boolean(raw)); continue }
        if (field.nullable && (raw === '' || raw === undefined || raw === null)) { setNested(input, field.key, null); continue }
        if (raw === '' || raw === undefined || raw === null) { continue }
        setNested(input, field.key, field.type === 'number' ? Number(raw) : raw)
      }
      return input
    }

    return { model, busy, error, visible, submit }
  },
  template: `
    <form class="dc-form" @submit.prevent="submit">
      <div v-for="field in (def.fields || [])" :key="field.key" v-show="visible(field)"
        class="dc-field" :class="{ wide: field.wide }">
        <label>{{ field.label }}<span v-if="field.optional" style="color:var(--dc-text-faint)">（可选）</span></label>
        <textarea v-if="field.type === 'textarea'" v-model="model[field.key]" :placeholder="field.placeholder || ''"></textarea>
        <select v-else-if="field.type === 'select'" v-model="model[field.key]">
          <option v-for="opt in field.options" :key="String(opt)" :value="opt">{{ opt === '' ? '（缺省）' : opt }}</option>
        </select>
        <label v-else-if="field.type === 'checkbox'" style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dc-text)">
          <input type="checkbox" v-model="model[field.key]">启用
        </label>
        <input v-else :type="field.type === 'number' ? 'number' : 'text'" v-model="model[field.key]" :placeholder="field.placeholder || ''">
      </div>
      <div class="dc-field">
        <label>&nbsp;</label>
        <button class="dc-btn primary" type="submit" :disabled="busy">{{ busy ? '调用中…' : label }}</button>
      </div>
      <div v-if="error" class="dc-field wide">
        <span class="dc-err-text">[{{ error.code }}] {{ error.message }}</span>
      </div>
    </form>
  `,
})

/** 点路径写入嵌套对象：数字段建数组 */
function setNested(target, key, value) {
  const segs = key.split('.')
  let node = target
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i]
    if (node[seg] == null) { node[seg] = /^\d+$/.test(segs[i + 1]) ? [] : {} }
    node = node[seg]
  }
  node[segs.at(-1)] = value
}
