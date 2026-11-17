<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

/**
 * 工作台首绘延挂：双 rAF 让启动层/背景先绘两帧再挂页面，保持「首帧不闪」的原启动时序；
 * 浮层窗与恢复页无启动动画语义，立即渲染并撤掉启动层。
 */
const showShell = ref(route.path === '/')

onMounted(() => {
  if (route.path !== '/') {
    // setup 时刻初始导航可能已就绪（showShell 误为 false），挂载后按真实路径纠正
    showShell.value = true
    document.getElementById('splash')?.remove()
    document.body.classList.add('ready')
    return
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      showShell.value = true
    })
  })
})
</script>

<template>
  <RouterView v-if="showShell" />
</template>
