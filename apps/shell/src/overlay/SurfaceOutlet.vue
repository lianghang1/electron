<script setup lang="ts">
import type { OverlaySurfaceState } from '@shell/shared/ipc'
import type { OverlaySurfaceCtx } from './registry'
import type { MenuView } from './types'
import { computed } from 'vue'
import { surfaceEntry } from './registry'

/**
 * 表面出口：按 registry 清单把在列表面渲染到对应 mode 容器。
 * 容器行为（遮罩/落位/过渡）全部在此配对——业务组件只见 props 与 emits。
 */
const props = defineProps<{
  surfaces: OverlaySurfaceState[]
  hoverCapture: (hovering: boolean) => void
  dismiss: (surface: string, id?: string) => void
  action: (surface: string, id: string, type: string, data?: Record<string, unknown>) => void
}>()

/** 只渲染 presented：phase 翻转 dismissed 即卸载，leave 过渡立即播放 */
const visible = computed(() => props.surfaces.filter(s => s.phase === 'presented'))

function entryOf(s: OverlaySurfaceState) {
  return surfaceEntry(s.surface)
}

function ctxFor(s: OverlaySurfaceState): OverlaySurfaceCtx {
  return {
    id: s.id,
    payload: s.payload,
    dismiss: props.dismiss,
    action: props.action,
    hoverCapture: props.hoverCapture,
  }
}

/** 组件 emit → registry 接线桥（逐事件包装 ctx） */
function wiredHandlers(s: OverlaySurfaceState): Record<string, (...args: unknown[]) => void> {
  const ctx = ctxFor(s)
  const wire = entryOf(s)?.wire ?? {}
  const handlers: Record<string, (...args: unknown[]) => void> = {}
  for (const [event, handler] of Object.entries(wire)) {
    handlers[event] = (...args: unknown[]) => handler(ctx, ...args)
  }
  return handlers
}

/** payload → 组件 props（无 mapProps 时 payload 即 props 对象） */
function propsFor(s: OverlaySurfaceState): Record<string, unknown> {
  const entry = entryOf(s)
  if (!entry) { return {} }
  if (entry.mapProps) { return entry.mapProps(s.payload) }
  return typeof s.payload === 'object' && s.payload !== null
    ? s.payload as Record<string, unknown>
    : {}
}

/** 锚点落位（plane 内 CSS 像素，发起方在 payload.x/y 给出） */
function anchorStyle(s: OverlaySurfaceState): Record<string, string> {
  const m = s.payload as MenuView
  return { left: `${m.x}px`, top: `${m.y}px` }
}

const isStack = (mode: string) => mode === 'toast' || mode === 'notification'
</script>

<template>
  <!-- toast / notification：角标堆叠层（组件自持布局；plane 穿透时悬停拦截由卡片上报） -->
  <template v-for="s in visible" :key="s.id">
    <Transition v-if="entryOf(s) && isStack(entryOf(s)!.mode)" name="plane-fade" appear>
      <div class="pointer-events-none fixed inset-0 z-40">
        <component
          :is="entryOf(s)!.component"
          v-bind="propsFor(s)"
          v-on="wiredHandlers(s)"
        />
      </div>
    </Transition>
  </template>

  <!-- dialog：遮罩 + 居中面板（外点按 maskClose 收场）；anchor 落位无遮罩 -->
  <template v-for="s in visible" :key="s.id">
    <Transition v-if="entryOf(s)?.mode === 'dialog'" name="plane-fade" appear>
      <div
        v-if="entryOf(s)!.container?.placement === 'anchor'"
        class="fixed inset-0 z-50"
        @click="props.dismiss(s.surface, s.id)"
      >
        <div class="absolute" :style="anchorStyle(s)">
          <component
            :is="entryOf(s)!.component"
            v-bind="propsFor(s)"
            v-on="wiredHandlers(s)"
            @click.stop
          />
        </div>
      </div>
      <div
        v-else
        class="fixed inset-0 z-50 grid place-items-center p-6"
        :class="entryOf(s)!.container?.mask === false ? '' : 'bg-black/35'"
        @click.self="entryOf(s)!.container?.maskClose === false ? undefined : props.dismiss(s.surface, s.id)"
      >
        <component
          :is="entryOf(s)!.component"
          v-bind="propsFor(s)"
          v-on="wiredHandlers(s)"
        />
      </div>
    </Transition>
  </template>

  <!-- command：omnibox 锚定层（遮罩与键盘导航组件自持） -->
  <template v-for="s in visible" :key="s.id">
    <Transition v-if="entryOf(s)?.mode === 'command'" name="plane-fade" appear>
      <component
        :is="entryOf(s)!.component"
        v-bind="propsFor(s)"
        v-on="wiredHandlers(s)"
      />
    </Transition>
  </template>
</template>
