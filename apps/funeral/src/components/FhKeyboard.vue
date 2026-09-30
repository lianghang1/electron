<script setup lang="ts">
import { computed, ref } from 'vue'
import { PINYIN_CANDIDATES, splitSpell } from '../data/pinyin-dict'

/**
 * 中文拼音软键盘（触屏，NumPad 同族风格）：
 * 数字直上屏，字母进拼音引擎（贪心切分 + 候选字），候选针对串头音节。
 * 不持有已录入全文（与 NumPad 同一无状态理念）——上屏 / 退格 / 清空事件
 * 全部交给父级处理，全文由父级持有。
 */
const emit = defineEmits<{
  /** 上屏一个字符（候选字 / 数字） */
  input: [char: string]
  /** 拼音串为空时按退格（父级删全文末字） */
  backspace: []
  /** 清空全文 */
  clear: []
}>()

/** 拼音串上限：触屏逐字选定节奏下 12 字母足够，超出提示先选字 */
const MAX_SPELL = 12

/** 引擎内部状态：当前拼音串 */
const spell = ref('')

const ROWS_NUM = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
const ROWS_LETTER = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']

const split = computed(() => splitSpell(spell.value))
/** 当前待选音节（串头），候选字展示它的字 */
const head = computed(() => split.value.parts[0] ?? '')
const candidates = computed(() => (head.value ? PINYIN_CANDIDATES[head.value] : []))
/** 串头音节之后的剩余串（展示用，空格分组） */
const restSpell = computed(() => spell.value.slice(head.value.length))

function pressLetter(letter: string): void {
  if (spell.value.length < MAX_SPELL)
    spell.value += letter
}

function pressNum(digit: string): void {
  emit('input', digit)
}

function pickCandidate(char: string): void {
  emit('input', char)
  spell.value = spell.value.slice(head.value.length)
}

function pressBackspace(): void {
  if (spell.value) {
    spell.value = spell.value.slice(0, -1)
    return
  }
  emit('backspace')
}

function pressClear(): void {
  spell.value = ''
  emit('clear')
}
</script>

<template>
  <div class="fh-kb">
    <!-- 拼音串 + 候选字条 -->
    <div class="fh-kb__ime">
      <div v-if="spell" class="fh-kb__spell">
        <span class="fh-kb__spell-head">{{ head }}</span>
        <span v-if="restSpell" class="fh-kb__spell-rest">&nbsp;{{ restSpell }}</span>
      </div>
      <div v-if="candidates.length" class="fh-kb__cands">
        <button
          v-for="char in candidates"
          :key="char"
          class="fh-kb__cand"
          @click="pickCandidate(char)"
        >
          {{ char }}
        </button>
      </div>
      <div v-else class="fh-kb__cands fh-kb__cands--hint">
        {{ spell ? '无匹配，请退格修正' : '键入拼音后选择候选字' }}
      </div>
    </div>

    <!-- 数字行 -->
    <div class="fh-kb__row">
      <button v-for="d in ROWS_NUM" :key="d" class="fh-kb__key" @click="pressNum(d)">
        {{ d }}
      </button>
    </div>

    <!-- 字母三行（QWERTY），末行右端补宽退格键 -->
    <div v-for="(row, i) in ROWS_LETTER" :key="i" class="fh-kb__row">
      <button
        v-for="letter in row"
        :key="letter"
        class="fh-kb__key"
        @click="pressLetter(letter)"
      >
        {{ letter }}
      </button>
      <button v-if="i === 2" class="fh-kb__key fh-kb__key--backspace" @click="pressBackspace">
        退格
      </button>
    </div>

    <div class="fh-kb__row fh-kb__row--aux">
      <button class="fh-kb__key fh-kb__key--clear" @click="pressClear">
        清空全文
      </button>
    </div>
  </div>
</template>

<style scoped>
.fh-kb {
  width: 100%;
}

/* ---- 拼音 + 候选 ---- */

.fh-kb__ime {
  margin-bottom: 14px;
  padding: 12px 16px 10px;
  background: var(--fh-surface-2);
  border: 1px solid var(--fh-line-strong);
  border-radius: var(--fh-radius);
  min-height: 96px;
}

.fh-kb__spell {
  min-height: 28px;
  font-size: 19px;
  font-weight: 600;
  color: var(--fh-text-2);
  letter-spacing: 1px;
  font-variant-numeric: tabular-nums;
}

.fh-kb__spell-head {
  color: var(--fh-gold);
  text-decoration: underline;
  text-underline-offset: 5px;
  text-decoration-thickness: 2px;
}

.fh-kb__spell-rest {
  color: var(--fh-text-3);
}

.fh-kb__cands {
  display: flex;
  flex-wrap: nowrap;
  margin-top: 8px;
}

.fh-kb__cand {
  height: 48px;
  min-width: 52px;
  padding: 0 10px;
  border: 1px solid var(--fh-line-strong);
  border-radius: var(--fh-radius-sm);
  background: var(--fh-surface);
  color: var(--fh-text);
  font-family: inherit;
  font-size: 24px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.fh-kb__cand:hover {
  background: #eef1f6;
  border-color: var(--fh-gold);
}

.fh-kb__cand:active {
  background: #e2e8f2;
}

.fh-kb__cands--hint {
  align-items: center;
  min-height: 48px;
  font-size: 14px;
  color: var(--fh-text-3);
}

/* ---- 键位 ---- */

.fh-kb__row {
  display: flex;
  margin-bottom: 10px;
}

.fh-kb__row:last-child {
  margin-bottom: 0;
}

.fh-kb__key {
  flex: 1;
  height: 58px;
  margin-right: 8px;
  border: 1px solid var(--fh-line-strong);
  border-radius: var(--fh-radius-sm);
  background: var(--fh-surface);
  color: var(--fh-text);
  font-family: inherit;
  font-size: 20px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.fh-kb__key:last-child {
  margin-right: 0;
}

.fh-kb__key:hover {
  background: #eef1f6;
}

.fh-kb__key:active {
  background: #e2e8f2;
}

.fh-kb__key--backspace {
  flex: 3;
  background: var(--fh-gold-soft);
  border-color: var(--fh-gold-line);
  color: var(--fh-gold);
}

.fh-kb__key--backspace:hover {
  background: rgb(168 130 60 / 18%);
}

.fh-kb__row--aux .fh-kb__key--clear {
  flex: none;
  width: 200px;
  font-size: 16px;
  color: var(--fh-text-2);
}
</style>
