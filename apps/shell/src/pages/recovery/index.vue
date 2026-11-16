<script setup lang="ts">
// kiosk 看门狗恢复页：连续崩溃后 WindowSystem 以 #/recovery 进入。
// 刻意不依赖桥面与设计令牌（崩溃现场外观可能不可用），样式内联硬编码深色——
// 只做现场可读的故障态呈现，恢复动作在终端重启，不在本页。
</script>

<template>
  <div
    class="grid h-screen w-screen place-items-center"
    style="background: #0d1117; color: #e6edf3; font-family: system-ui"
  >
    <div class="flex flex-col items-center gap-3">
      <div class="text-ui-display leading-none">
        ⚠
      </div>
      <div class="text-ui-lg font-semibold">
        设备自检中
      </div>
      <div class="text-ui-sm" style="color: #8b949e">
        应用连续异常已进入恢复模式，请联系现场运维
      </div>
      <div class="text-ui-xs" style="color: #6e7681">
        重启终端可恢复 · 错误已上报
      </div>
    </div>
  </div>
</template>
