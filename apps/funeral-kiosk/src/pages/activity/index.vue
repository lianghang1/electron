<script setup>
import dayjs from 'dayjs'
import FuneralApi from '@/api/funeral'
import { isEmpty } from '@/utils'

definePage({
  meta: {
    title: '单位介绍',
  },
})

dayjs.locale('zh-cn')

const loading = ref(false)

const infoData = ref({})
const imageList = ref([])

async function loadData(type) {
  const data = await FuneralApi.getCommonActivity(type)

  if (data.length > 0) {
    infoData.value = data[0]
    imageList.value = data[0].items
  }
}

onMounted(() => {
  loadData('SCREEN_UNIT_INTRODDUCTION')
})
</script>

<template>
  <div class="w-full">
    <div class="arco-modal-body-content mt-10">
      <a-space direction="vertical" size="large" fill>
        <div v-if="loading" class="f-c-c">
          <a-spin :size="30" dot />
        </div>

        <div v-if="!isEmpty(imageList)">
          <a-carousel
            :auto-play="true"
            :animation-name="imageList.length > 2 ? 'card' : 'slide'"
            :default-current="currentIndex"
            show-arrow="never"
            indicator-position="outer"
            :style="{
              width: '100%',
              height: '500px',
            }"
          >
            <a-carousel-item v-for="im in imageList" :key="im.id" :style="{ width: imageList.length > 2 ? '60%' : '100%' }">
              <a-image
                width="100%"
                height="500"
                :src="im.pic"
                fit="scale-down"
              />
            </a-carousel-item>
          </a-carousel>
        </div>

        <div v-html="infoData.richText" />
      </a-space>
    </div>
  </div>
</template>

<style lang="scss" scoped>

</style>
