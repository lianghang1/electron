<script setup lang="ts">
import type { FhBusinessConfig } from '../types/funeral'
import { onBeforeUnmount, ref, watch } from 'vue'
import { fh } from '../api/fh'
import { playSpeech } from '../composables/use-speech'
import NumPad from './NumPad.vue'

/**
 * 运维设置面板：馆名连点 3 次进入。
 * 授权门（NumPad 密码，30s 无操作自动关）→ 设备信息（编辑保存）/ 外设测试（读卡器/语音）→ 退出应用（确认后 app.quit）。
 * 文字输入（馆名/柜台名）依赖 USB 键盘，与发票抬头输入同一限制。
 */
const props = defineProps<{ visible: boolean }>()

const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const AUTO_CLOSE_SECOND = 30

const phase = ref<'auth' | 'main'>('auth')
const activeTab = ref<'device' | 'peripheral'>('device')

// ---- 授权门 ----
const authPassword = ref('')
const authError = ref('')
const verifying = ref(false)

function pressKey(key: string): void {
  if (key === 'X') {
    authPassword.value = authPassword.value.slice(0, -1)
    return
  }
  if (authPassword.value.length >= 8)
    return
  authPassword.value += key
}

function clearPassword(): void {
  authPassword.value = ''
  authError.value = ''
}

async function handleAuth(): Promise<void> {
  if (verifying.value || !authPassword.value)
    return
  verifying.value = true
  authError.value = ''
  try {
    const ok = await fh.verifyAuth(authPassword.value)
    if (!ok) {
      authError.value = '授权密码错误，请重新输入'
      authPassword.value = ''
      return
    }
    phase.value = 'main'
    void loadConfig()
  }
  catch {
    authError.value = '授权校验失败，请重试'
  }
  finally {
    verifying.value = false
  }
}

// ---- 设备信息 ----
const configForm = ref<FhBusinessConfig>({ machineId: '', hallName: '', counterName: '' })
const saving = ref(false)
const saveTip = ref('')

async function loadConfig(): Promise<void> {
  try {
    configForm.value = await fh.getConfig()
  }
  catch {
    // 配置读取失败保持空值
  }
}

async function handleSave(): Promise<void> {
  if (saving.value)
    return
  saving.value = true
  saveTip.value = ''
  try {
    configForm.value = await fh.updateConfig({
      machineId: configForm.value.machineId.trim(),
      hallName: configForm.value.hallName.trim(),
      counterName: configForm.value.counterName.trim(),
    })
    saveTip.value = '已保存，馆名等展示项即时生效'
  }
  catch {
    saveTip.value = '保存失败，请重试'
  }
  finally {
    saving.value = false
  }
}

// ---- 外设测试 ----
type TestKey = 'idcard' | 'speech'
const testRunning = ref<Set<TestKey>>(new Set())
const testResults = ref<Partial<Record<TestKey, { ok: boolean, text: string }>>>({})

async function runTest(key: TestKey): Promise<void> {
  if (testRunning.value.has(key))
    return
  testRunning.value = new Set([...testRunning.value, key])
  try {
    if (key === 'idcard') {
      const result = await window.desktop.device.readIdCard()
      const card = result.ok && result.data ? result.data : null
      testResults.value = {
        ...testResults.value,
        idcard: card
          ? { ok: true, text: `读卡正常：${card.name} ${card.idNumber}` }
          : { ok: false, text: result.error?.message ?? '未读到卡片，请将身份证放置读卡区后重试' },
      }
    }
    else {
      playSpeech('语音播报测试正常')
      testResults.value = { ...testResults.value, speech: { ok: true, text: '语音播报已播放' } }
    }
  }
  catch {
    testResults.value = { ...testResults.value, [key]: { ok: false, text: '测试失败，请检查设备连接' } }
  }
  finally {
    const next = new Set(testRunning.value)
    next.delete(key)
    testRunning.value = next
  }
}

// ---- 退出应用 ----
const showExitConfirm = ref(false)

async function handleExit(): Promise<void> {
  showExitConfirm.value = false
  try {
    await fh.exitApp()
  }
  catch {
    // 退出失败保持面板打开
  }
}

function close(): void {
  emit('update:visible', false)
}

// ---- 30s 无操作自动关闭 ----
const countdown = ref(AUTO_CLOSE_SECOND)
let timer: ReturnType<typeof setInterval> | null = null

function startCountdown(): void {
  stopCountdown()
  countdown.value = AUTO_CLOSE_SECOND
  timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      close()
    }
  }, 1000)
}

function stopCountdown(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function touch(): void {
  if (props.visible)
    startCountdown()
}

watch(() => props.visible, (val) => {
  if (val) {
    phase.value = 'auth'
    activeTab.value = 'device'
    clearPassword()
    saveTip.value = ''
    testResults.value = {}
    showExitConfirm.value = false
    startCountdown()
  }
  else {
    stopCountdown()
  }
})

onBeforeUnmount(stopCountdown)
</script>

<template>
  <Teleport to="body">
    <Transition name="fs-fade">
      <div v-if="visible" class="fs-mask" @click.capture="touch">
        <!-- 授权门 -->
        <div v-if="phase === 'auth'" class="fs-auth">
          <header class="fs-auth__head">
            <h3 class="fs-auth__title">
              运维设置
            </h3>
            <span class="fs-auth__countdown">{{ countdown }}s 后自动关闭</span>
          </header>
          <p class="fs-auth__desc">
            请输入授权密码以访问设置界面
          </p>
          <div class="fs-auth__display" :class="{ 'is-error': !!authError }">
            <span v-for="n in 8" :key="n" class="fs-auth__dot" :class="{ 'is-on': n <= authPassword.length }" />
          </div>
          <p class="fs-auth__error">
            {{ authError || ' ' }}
          </p>
          <div class="fs-auth__pad">
            <NumPad @key="pressKey" />
            <div class="fs-auth__pad-side">
              <button class="fs-btn fs-btn--ghost" @click="clearPassword">
                清空
              </button>
              <button class="fs-btn fs-btn--primary" :disabled="verifying || !authPassword" @click="handleAuth">
                {{ verifying ? '校验中...' : '授权进入' }}
              </button>
              <button class="fs-btn fs-btn--ghost" @click="close">
                取消
              </button>
            </div>
          </div>
        </div>

        <!-- 设置主体 -->
        <div v-else class="fs-panel">
          <header class="fs-panel__head">
            <h3 class="fs-panel__title">
              终端机设置
            </h3>
            <span class="fs-panel__countdown">{{ countdown }}s 后自动关闭</span>
            <button class="fs-panel__close" @click="close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          <div class="fs-tabs">
            <button class="fs-tab" :class="{ 'is-active': activeTab === 'device' }" @click="activeTab = 'device'">
              设备信息
            </button>
            <button class="fs-tab" :class="{ 'is-active': activeTab === 'peripheral' }" @click="activeTab = 'peripheral'">
              外设测试
            </button>
          </div>

          <!-- 设备信息 -->
          <div v-if="activeTab === 'device'" class="fs-body">
            <div class="fs-field">
              <label class="fs-field__label">机器编号</label>
              <input v-model="configForm.machineId" class="fs-field__input" placeholder="如 FH-0001">
            </div>
            <div class="fs-field">
              <label class="fs-field__label">馆名（页眉展示）</label>
              <input v-model="configForm.hallName" class="fs-field__input" placeholder="如 市殡仪馆">
            </div>
            <div class="fs-field">
              <label class="fs-field__label">结算柜台名称</label>
              <input v-model="configForm.counterName" class="fs-field__input" placeholder="如 自助结算柜台">
            </div>
            <p class="fs-body__hint">
              文字输入需连接 USB 键盘；配置保存至本机 config.json
            </p>
          </div>

          <!-- 外设测试 -->
          <div v-else class="fs-body">
            <div
              v-for="item in ([
                { key: 'idcard', title: '身份证读卡器', desc: '放置身份证后点击测试' },
                { key: 'speech', title: '语音播报', desc: '播放一段测试语音' },
              ] as const)" :key="item.key" class="fs-test"
            >
              <div class="fs-test__info">
                <span class="fs-test__title">{{ item.title }}</span>
                <span class="fs-test__desc">{{ item.desc }}</span>
              </div>
              <div class="fs-test__result" :class="testResults[item.key]?.ok === false ? 'is-fail' : ''">
                {{ testResults[item.key]?.text || ' ' }}
              </div>
              <button
                class="fs-btn fs-btn--primary fs-test__btn"
                :disabled="testRunning.has(item.key)"
                @click="runTest(item.key)"
              >
                {{ testRunning.has(item.key) ? '测试中...' : '测试' }}
              </button>
            </div>
          </div>

          <footer class="fs-panel__foot">
            <button class="fs-btn fs-btn--danger" @click="showExitConfirm = true">
              退出应用
            </button>
            <div class="fs-panel__foot-right">
              <span v-if="saveTip" class="fs-panel__save-tip">{{ saveTip }}</span>
              <button v-if="activeTab === 'device'" class="fs-btn fs-btn--primary" :disabled="saving" @click="handleSave">
                {{ saving ? '保存中...' : '保存配置' }}
              </button>
            </div>
          </footer>
        </div>

        <!-- 退出确认 -->
        <div v-if="showExitConfirm" class="fs-confirm">
          <h4 class="fs-confirm__title">
            退出确认
          </h4>
          <p class="fs-confirm__desc">
            确定要退出自助终端应用吗？
          </p>
          <div class="fs-confirm__actions">
            <button class="fs-btn fs-btn--ghost" @click="showExitConfirm = false">
              取消
            </button>
            <button class="fs-btn fs-btn--danger" @click="handleExit">
              退出应用
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fs-mask {
  position: fixed;
  inset: 0;
  z-index: 150;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(16 26 48 / 66%);
}

/* ---- 通用按钮 ---- */

.fs-btn {
  height: 52px;
  padding: 0 30px;
  border-radius: var(--fh-radius-sm);
  font-family: inherit;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: filter 0.15s ease, background 0.15s ease;
}

.fs-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.fs-btn--primary {
  border: none;
  background: linear-gradient(160deg, var(--fh-cta-from) 0%, var(--fh-cta-to) 100%);
  color: var(--fh-cta-ink);
}

.fs-btn--primary:not(:disabled):hover {
  filter: brightness(1.08);
}

.fs-btn--ghost {
  border: 1px solid var(--fh-line-strong);
  background: var(--fh-surface);
  color: var(--fh-text);
}

.fs-btn--ghost:not(:disabled):hover {
  background: var(--fh-surface-2);
}

.fs-btn--danger {
  border: none;
  background: linear-gradient(160deg, #d84a3a 0%, #b03428 100%);
  color: #fff;
}

.fs-btn--danger:not(:disabled):hover {
  filter: brightness(1.08);
}

/* ---- 授权门 ---- */

.fs-auth {
  width: 820px;
  padding: 40px 48px;
  background: var(--fh-panel);
  border-radius: var(--fh-radius-lg);
  box-shadow: var(--fh-shadow-card);
  border-top: 3px solid var(--fh-gold);
}

.fs-auth__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.fs-auth__title {
  margin: 0;
  font-family: var(--fh-font-serif);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--fh-text);
}

.fs-auth__countdown,
.fs-panel__countdown {
  font-size: 14px;
  color: var(--fh-text-3);
  font-variant-numeric: tabular-nums;
}

.fs-auth__desc {
  margin: 10px 0 0;
  font-size: 15px;
  color: var(--fh-text-2);
}

.fs-auth__display {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 68px;
  margin-top: 22px;
  background: var(--fh-surface);
  border: 2px solid var(--fh-line-strong);
  border-radius: var(--fh-radius);
}

.fs-auth__display.is-error {
  border-color: var(--fh-danger);
}

.fs-auth__dot {
  width: 14px;
  height: 14px;
  margin: 0 7px;
  border-radius: 50%;
  background: var(--fh-line-strong);
}

.fs-auth__dot.is-on {
  background: var(--fh-ink);
}

.fs-auth__error {
  height: 20px;
  margin: 12px 0 0;
  font-size: 14px;
  text-align: center;
  color: var(--fh-danger);
}

.fs-auth__pad {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  margin-top: 14px;
}

.fs-auth__pad-side {
  display: flex;
  flex-direction: column;
  margin-left: 32px;
  padding-top: 2px;
}

.fs-auth__pad-side .fs-btn {
  width: 176px;
  margin-bottom: 14px;
}

.fs-auth__pad-side .fs-btn:last-child {
  margin-bottom: 0;
}

/* ---- 设置主体 ---- */

.fs-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 860px;
  max-height: 82vh;
  background: var(--fh-panel);
  border-radius: var(--fh-radius-lg);
  box-shadow: var(--fh-shadow-card);
  border-top: 3px solid var(--fh-gold);
  overflow: hidden;
}

.fs-panel__head {
  flex: none;
  display: flex;
  align-items: center;
  padding: 22px 32px 0;
}

.fs-panel__title {
  margin: 0 auto 0 0;
  font-family: var(--fh-font-serif);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--fh-text);
}

.fs-panel__close {
  width: 40px;
  height: 40px;
  margin-left: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--fh-line);
  border-radius: 50%;
  background: var(--fh-surface);
  color: var(--fh-text-2);
  cursor: pointer;
  transition: background 0.15s ease;
}

.fs-panel__close:hover {
  background: var(--fh-surface-2);
}

.fs-panel__close svg {
  width: 16px;
  height: 16px;
}

.fs-tabs {
  flex: none;
  display: flex;
  margin: 18px 32px 0;
  border-bottom: 1px solid var(--fh-line);
}

.fs-tab {
  height: 52px;
  padding: 0 30px;
  border: none;
  border-bottom: 3px solid transparent;
  background: none;
  font-family: inherit;
  font-size: 16px;
  font-weight: 600;
  color: var(--fh-text-2);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.fs-tab.is-active {
  color: var(--fh-ink);
  border-bottom-color: var(--fh-ink);
}

.fs-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px 32px;
}

.fs-field {
  margin-bottom: 18px;
}

.fs-field__label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--fh-text-2);
}

.fs-field__input {
  width: 100%;
  height: 60px;
  padding: 0 20px;
  border: 2px solid var(--fh-line-strong);
  border-radius: var(--fh-radius);
  background: var(--fh-surface);
  font-family: inherit;
  font-size: 18px;
  color: var(--fh-text);
  box-sizing: border-box;
}

.fs-field__input:focus {
  outline: none;
  border-color: var(--fh-ink);
}

.fs-body__hint {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--fh-text-3);
}

/* ---- 外设测试 ---- */

.fs-test {
  display: flex;
  align-items: center;
  padding: 18px 4px;
  border-bottom: 1px solid var(--fh-line);
}

.fs-test__info {
  width: 220px;
  flex: none;
  display: flex;
  flex-direction: column;
}

.fs-test__title {
  font-size: 17px;
  font-weight: 600;
  color: var(--fh-text);
}

.fs-test__desc {
  margin-top: 4px;
  font-size: 13px;
  color: var(--fh-text-3);
}

.fs-test__result {
  flex: 1;
  min-width: 0;
  margin: 0 20px;
  font-size: 14px;
  color: var(--fh-success);
}

.fs-test__result.is-fail {
  color: var(--fh-danger);
}

.fs-test__btn {
  flex: none;
  width: 110px;
  padding: 0;
}

/* ---- 底部 ---- */

.fs-panel__foot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 32px;
  border-top: 1px solid var(--fh-line);
  background: var(--fh-surface-2);
}

.fs-panel__foot-right {
  display: flex;
  align-items: center;
}

.fs-panel__save-tip {
  margin-right: 18px;
  font-size: 14px;
  color: var(--fh-success);
}

/* ---- 退出确认 ---- */

.fs-confirm {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 460px;
  padding: 36px 40px;
  background: var(--fh-panel);
  border-radius: var(--fh-radius-lg);
  box-shadow: 0 18px 56px rgb(10 20 45 / 40%);
  border-top: 3px solid var(--fh-danger);
}

.fs-confirm__title {
  margin: 0;
  font-family: var(--fh-font-serif);
  font-size: 21px;
  font-weight: 700;
  color: var(--fh-text);
}

.fs-confirm__desc {
  margin: 14px 0 26px;
  font-size: 16px;
  color: var(--fh-text-2);
}

.fs-confirm__actions {
  display: flex;
  justify-content: flex-end;
}

.fs-confirm__actions .fs-btn + .fs-btn {
  margin-left: 16px;
}

/* ---- 过渡 ---- */

.fs-fade-enter-active,
.fs-fade-leave-active {
  transition: opacity 0.2s ease;
}

.fs-fade-enter-from,
.fs-fade-leave-to {
  opacity: 0;
}
</style>
