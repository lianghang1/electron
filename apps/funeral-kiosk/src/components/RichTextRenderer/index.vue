<script setup lang="ts">
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
// 👇 按需引入语言（请根据你们业务实际用到的语言增删，极大减小打包体积）
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import VueEasyLightbox from 'vue-easy-lightbox'
import 'vue-easy-lightbox/external-css/vue-easy-lightbox.css'

const props = withDefaults(defineProps<{
  html: string
  enableLightbox?: boolean
  isDark?: boolean
}>(), {
  isDark: false,
  enableLightbox: true,
})
// 注册语言别名
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('json', json)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('sql', sql)

const contentRef = ref<HTMLElement>()
const lightbox = ref({ visible: false, imgs: [] as string[], index: 0 })

// ================= 1. 防闪烁与防竞态控制 =================
let currentTaskId = 0
const isLoading = ref(false)

// ================= 2. 全局单次安全洗涤 Hook =================
let hookInstalled = false
function installDompurifyHooks() {
  if (hookInstalled) { return }
  hookInstalled = true

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    // 强制外链安全
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer nofollow')
    }
    // 图片懒加载与无障碍
    if (node.tagName === 'IMG') {
      if (!node.getAttribute('loading')) { node.setAttribute('loading', 'lazy') }
      if (!node.getAttribute('alt')) { node.setAttribute('alt', '图片') }
    }
    // iframe 强制沙箱防劫持
    if (node.tagName === 'IFRAME') {
      node.setAttribute('sandbox', 'allow-scripts allow-same-origin')
      node.setAttribute('loading', 'lazy')
    }
  })
}

onMounted(() => installDompurifyHooks())

const safeHtml = computed(() => {
  if (!props.html) { return '' }
  return DOMPurify.sanitize(props.html, {
    ALLOWED_TAGS: [
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'p',
      'br',
      'hr',
      'pre',
      'code',
      'ul',
      'ol',
      'li',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'blockquote',
      'img',
      'a',
      'strong',
      'em',
      'del',
      'sup',
      'sub',
      'span',
      'div',
      'video',
      'source',
      'iframe',
      'input',
    ],
    ALLOWED_ATTR: [
      'href',
      'src',
      'alt',
      'class',
      'id',
      'style',
      'colspan',
      'rowspan',
      'controls',
      'width',
      'height',
      'frameborder',
      'allowfullscreen',
      'type',
      'checked',
      'disabled',
      'data-*',
    ],
  })
})

// ================= 3. 事件委托（彻底解决内存泄漏） =================
// function copyCode(text: string, btn: HTMLButtonElement) {
//   navigator.clipboard.writeText(text).then(() => {
//     btn.textContent = '已复制!'
//     btn.classList.add('copied')
//     setTimeout(() => {
//       btn.textContent = '复制'
//       btn.classList.remove('copied')
//     }, 2000)
//   }).catch(() => {
//     // 降级兼容方案
//     const ta = document.createElement('textarea')
//     ta.value = text
//     ta.style.position = 'fixed'
//     ta.style.opacity = '0'
//     document.body.appendChild(ta)
//     ta.select()
//     document.execCommand('copy')
//     document.body.removeChild(ta)
//   })
// }

function handleGlobalClick(e: MouseEvent) {
  const target = e.target as HTMLElement

  // 处理代码块复制按钮
  if (target.classList.contains('rt-copy-btn')) {
    e.stopPropagation()
    // const code = target.closest('pre')?.querySelector('code')
    // if (code)
    //   copyCode(code.textContent || '', target)
    return
  }

  // 处理图片灯箱
  if (target.tagName === 'IMG' && !target.closest('a')) {
    const img = target as HTMLImageElement
    // 修复：使用 clientWidth 避免 loading="lazy" 还未加载时 naturalWidth 为 0 的 BUG
    if (img.clientWidth < 50) { return }

    const allImages = Array.from(contentRef.value?.querySelectorAll('img') || [])
      .filter(i => (i as HTMLImageElement).clientWidth >= 50)

    lightbox.value.imgs = allImages.map(i => (i as HTMLImageElement).src)
    lightbox.value.index = allImages.indexOf(img)
    lightbox.value.visible = true
  }
}

// ================= 4. 渲染引擎（高亮+注入UI） =================
function injectUI() {
  if (!contentRef.value) { return }

  const id = ++currentTaskId
  isLoading.value = true // 开启防闪烁

  requestAnimationFrame(() => {
    // 防竞态：如果期间内容又变了，直接抛弃当前过期的渲染任务
    if (id !== currentTaskId) { return }

    const preBlocks = contentRef.value!.querySelectorAll('pre')

    preBlocks.forEach((pre) => {
      const code = pre.querySelector('code')
      if (!code) { return }

      // 跳过已经被其他编辑器原生高亮过的代码块，防止内部 span 被转义成乱码
      if (code.querySelector('span') && code.classList.contains('hljs')) { return }

      // 1. 执行代码高亮
      try {
        if (!code.classList.contains('hljs')) { hljs.highlightElement(code) }
      }
      catch (e) {
        /* 忽略不支持的语法报错 */
        console.debug(e)
      }

      // 2. 注入顶部工具栏（只注入一次）
      if (!pre.querySelector('.rt-code-header')) {
        const header = document.createElement('div')
        header.className = 'rt-code-header'

        const langClass = Array.from(code.classList).find(c => c.startsWith('language-'))
        const langName = langClass ? langClass.replace('language-', '').toUpperCase() : 'CODE'

        // 使用 class 标记按钮，由外层事件委托统一监听，避免内存泄漏
        header.innerHTML = `<span class="rt-lang-name">${langName}</span><button class="rt-copy-btn">复制</button>`
        pre.insertBefore(header, pre.firstChild)
      }
    })

    // 修复：渲染完成后解除隐藏，保证视图必定更新
    isLoading.value = false
  })
}

onMounted(() => nextTick(injectUI))
watch(() => props.html, () => nextTick(injectUI))
</script>

<template>
  <div class="rich-text-wrapper" :class="{ dark: isDark }">
    <!-- 注意这里使用 isLoading 控制防闪烁 -->
    <div
      ref="contentRef"
      class="rich-text-content"
      :class="{ 'rt-loading': isLoading }"
      @click="handleGlobalClick"
      v-html="safeHtml"
    />

    <VueEasyLightbox
      v-if="enableLightbox"
      :visible="lightbox.visible"
      :imgs="lightbox.imgs"
      :index="lightbox.index"
      @hide="lightbox.visible = false"
    />
  </div>
</template>

<style scoped>
/* ==========================================
   主题变量系统（原生支持暗黑模式）
   ========================================== */
.rich-text-wrapper {
  --rt-text: #374151;
  --rt-heading: #111827;
  --rt-border: #e5e7eb;
  --rt-bg-inline: #f3f4f6;
  --rt-text-inline: #e11d48;
  --rt-bg-quote: #f8fafc;
  --rt-text-quote: #64748b;
  --rt-link: #2563eb;
  --rt-code-header-bg: #f1f5f9;
  --rt-code-header-text: #64748b;
  --rt-code-border: #e2e8f0;
}
.rich-text-wrapper.dark {
  --rt-text: #d1d5db;
  --rt-heading: #f9fafb;
  --rt-border: #374151;
  --rt-bg-inline: #374151;
  --rt-text-inline: #f472b6;
  --rt-bg-quote: #111827;
  --rt-text-quote: #9ca3af;
  --rt-link: #60a5fa;
  --rt-code-header-bg: #1e293b;
  --rt-code-header-text: #94a3b8;
  --rt-code-border: #334155;
}

/* ==========================================
   基础排版
   ========================================== */
.rich-text-content {
  line-height: 1.8;
  font-size: 16px;
  color: var(--rt-text);
  word-break: break-word;
  transition: opacity 0.15s ease;
}
/* 防闪烁核心：处理期间透明度为0，处理完无缝显现 */
.rich-text-content.rt-loading {
  opacity: 0;
}

.rich-text-content :deep(h1),
.rich-text-content :deep(h2),
.rich-text-content :deep(h3) {
  color: var(--rt-heading);
  margin-top: 1.5em;
  margin-bottom: 0.8em;
  font-weight: 700;
}
.rich-text-content :deep(h2) {
  font-size: 1.5em;
  border-bottom: 1px solid var(--rt-border);
  padding-bottom: 0.3em;
}
.rich-text-content :deep(h3) { font-size: 1.25em; }

.rich-text-content :deep(a) {
  color: var(--rt-link);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.rich-text-content :deep(blockquote) {
  margin: 1em 0;
  padding: 0.5em 1em;
  border-left: 4px solid var(--rt-link);
  background: var(--rt-bg-quote);
  color: var(--rt-text-quote);
  border-radius: 0 4px 4px 0;
}

/* ==========================================
   行内代码与代码块
   ========================================== */
/* 行内代码选择器：排除 pre 包裹的 code */
.rich-text-content :deep(code:not(pre code)) {
  background: var(--rt-bg-inline);
  color: var(--rt-text-inline);
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-size: 0.9em;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
}

/* 代码块外层（不写死背景色，让 hljs 的 css 主题接管） */
.rich-text-content :deep(pre) {
  position: relative;
  margin: 1.5em 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--rt-code-border);
}

.rich-text-content :deep(pre code) {
  display: block;
  padding: 1.2em 1.5em;
  padding-top: 2.8em; /* 给顶部按钮留空间 */
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.6;
  overflow-x: auto;
}

/* 动态注入的代码块工具栏 */
.rich-text-content :deep(.rt-code-header) {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 36px;
  background-color: var(--rt-code-header-bg);
  color: var(--rt-code-header-text);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 1em;
  font-size: 12px;
  user-select: none;
  border-bottom: 1px solid var(--rt-code-border);
}
.rich-text-content :deep(.rt-copy-btn) {
  background: transparent;
  border: 1px solid var(--rt-code-border);
  color: var(--rt-code-header-text);
  padding: 2px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}
.rich-text-content :deep(.rt-copy-btn:hover) { background: var(--rt-border); }
.rich-text-content :deep(.rt-copy-btn.copied) { border-color: #10b981; color: #10b981; }

/* ==========================================
   媒体与表格
   ========================================== */
.rich-text-content :deep(table) { width: 100%; border-collapse: collapse; margin: 1em 0; }
.rich-text-content :deep(th),
.rich-text-content :deep(td) { border: 1px solid var(--rt-border); padding: 0.75em 1em; text-align: left; }
.rich-text-content :deep(th) { background-color: var(--rt-bg-quote); font-weight: 600; }

.rich-text-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 1.5em 0;
  display: block;
  -webkit-user-drag: none;
  user-drag: none;
}

.rich-text-content :deep(video) { max-width: 100%; border-radius: 8px; }
</style>
