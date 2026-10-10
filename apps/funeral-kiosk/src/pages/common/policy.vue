<script setup lang="ts">
import CommonApi from '@/api/common'
import { isEmpty } from '@/utils'

definePage({
  meta: {
    title: '惠民政策',
  },
})

const richText = ref('')

async function loadData() {
  const data: any = await CommonApi.getActivity('SERVICE_POLICY')
  if (!isEmpty(data)) {
    richText.value = data[0].richText
  }
}

loadData()
</script>

<template>
  <div class="px-40px pb-40px bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
    <RichTextRenderer v-if="richText" :enable-lightbox="false" :html="richText" />
  </div>
</template>
