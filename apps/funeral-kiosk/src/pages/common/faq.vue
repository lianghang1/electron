<script setup>
import FuneralApi from '@/api/funeral'

definePage({
  meta: {
    title: '常见问题解答',
  },
})

const infoData = ref({})
const faqs = ref([])
const expandedId = ref('')

function toggleFAQ(id) {
  expandedId.value = expandedId.value === id ? '' : id
}

async function loadData(type) {
  const data = await FuneralApi.getCommonActivity(type)

  if (data.length > 0) {
    infoData.value = data[0]
    faqs.value = data[0].items
  }
}

onMounted(() => {
  loadData('SCREEN_FAQ')
})
</script>

<template>
  <div class="w-full">
    <div className="page-content faq-content">
      <div className="faq-intro">
        <p>以下是我们收集的常见问题及解答，希望能帮助您快速了解相关服务。</p>
      </div>

      <div className="faq-list">
        <div
          v-for="faq in faqs" :key="faq.id" class="faq-item" :class="expandedId === faq.id ? 'expanded' : ''"
        >
          <div className="faq-question" @click="toggleFAQ(faq.id)">
            <span className="faq-icon">
              {{ expandedId === faq.id ? '▼' : '▶' }}
            </span>
            <span className="faq-question-text">{{ faq.title }}</span>
          </div>
          <div class="faq-answer" :class="expandedId === faq.id ? 'show' : ''">
            <div className="answer-content">
              {{ faq.extConfigObj?.answer || '' }}
            </div>
          </div>
        </div>
      </div>

      <!-- <div className="faq-contact">
        <p>如果以上解答未能解决您的问题，请联系我们：</p>
        <p>📞 服务热线：400-XXX-XXXX</p>
        <p>📧 电子邮箱：service@baboshan.com</p>
      </div> -->
    </div>
  </div>
</template>

<style lang="scss" scoped>
.page-content {
  flex: 1;
  padding: 40px;
  overflow-y: auto;
}

/* 常见问题样式 */
.faq-content {
  margin: 0 auto;
  background: white;
  border-radius: 20px;
  padding: 60px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.faq-intro {
  background: linear-gradient(135deg, #00BCD4 0%, #0097A7 100%);
  color: white;
  padding: 40px;
  border-radius: 12px;
  margin-bottom: 40px;
}

.faq-intro p {
  font-size: 18px;
  line-height: 1.6;
  margin: 0;
}

.faq-list {
  margin-bottom: 40px;
}

.faq-item {
  background: #f5f5f5;
  border-radius: 12px;
  margin-bottom: 15px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.faq-item.expanded {
  background: white;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.faq-question {
  padding: 24px 30px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 20px;
  transition: background 0.3s ease;
}

.faq-question:hover {
  background: #e3f2fd;
}

.faq-icon {
  font-size: 20px;
  color: #00BCD4;
  transition: transform 0.3s ease;
}

.faq-item.expanded .faq-icon {
  transform: rotate(90deg);
}

.faq-question-text {
  font-size: 18px;
  font-weight: 500;
  color: #333;
  flex: 1;
}

.faq-answer {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease, padding 0.3s ease;
}

.faq-answer.show {
  max-height: 500px;
  padding: 0 30px 24px 70px;
}

.answer-content {
  white-space: pre-line;
  line-height: 1.8;
  color: #555;
  font-size: 16px;
}

.faq-contact {
  background: #e3f2fd;
  padding: 30px;
  border-radius: 12px;
  text-align: center;
}

.faq-contact p {
  font-size: 18px;
  color: #333;
  margin: 10px 0;
}
</style>
