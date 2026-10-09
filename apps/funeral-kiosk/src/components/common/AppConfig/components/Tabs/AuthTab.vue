<script setup lang="ts">
import type { FormConfig } from '../DynamicForm.vue'
import DynamicForm from '../DynamicForm.vue'

const props = defineProps<{
  close: () => void
}>()

const globalMessageStore = useGlobalMessageStore()
const loading = ref(false)

const formConfig = reactive<FormConfig>({
  fields: [
    {
      field: 'password',
      type: 'password',
      label: '原密码',
    },
    {
      field: 'newPassword',
      type: 'password',
      label: '新密码',
    },
  ],
})

const formData = ref({
  password: '',
  newPassword: '',
})

async function handleUpdateAuthPassword() {
  if (loading.value) {
    return
  }
  loading.value = true
  const { password, newPassword } = formData.value
  if (!password || !newPassword) {
    globalMessageStore.error({
      title: '请输入原密码和新密码',
    })
    loading.value = false
    return
  }
  try {
    await window.eApi.auth.updateAuthPassword(password, newPassword)
    globalMessageStore.success({
      title: '配置更新成功',
    })
    props.close()
  }
  catch (err) {
    console.log(err)
    globalMessageStore.error({
      title: '密码验证失败',
    })
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <DynamicForm
      v-model="formData"
      :form-config="formConfig"
    />

    <div class="auth-buttons">
      <button class="btn-auth" @click="handleUpdateAuthPassword">
        确认修改
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.auth-buttons {
  display: flex;
  gap: 20px;
  justify-content: center;
  margin-top: 24px;
  position: relative;
  z-index: 1;
}

.auth-buttons button {
  padding: 16px 32px;
  border: none;
  border-radius: 12px;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s ease;
  min-width: 140px;
  position: relative;
  overflow: hidden;
}

/* 按钮发光效果 */
.auth-buttons button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  transition: left 0.5s ease;
}

.auth-buttons button:hover::before {
  left: 100%;
}
.btn-auth {
  background: linear-gradient(135deg, #003594 0%, #002a7a 100%);
  color: white;
  box-shadow: 0 4px 8px rgba(0, 53, 148, 0.2);
}

.btn-auth:hover {
  background: linear-gradient(135deg, #002a7a 0%, #003594 100%);
  box-shadow: 0 6px 12px rgba(0, 53, 148, 0.3);
  transform: translateY(-2px);
}
</style>
