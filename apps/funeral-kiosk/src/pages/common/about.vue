<script setup>
definePage({
  meta: {
    title: '单位介绍',
  },
})

const info = ref({
  name: '八宝山公墓',
  established: '1950年',
  area: '1000余亩',
  features: [
    '国家级爱国主义教育基地',
    '北京市重点文物保护单位',
    '园林式公墓示范单位',
    '生态环保模范单位',
  ],
  services: [
    '墓穴销售与管理',
    '殡仪服务',
    '遗体火化',
    '骨灰安放',
    '礼厅租赁',
    '网上祭扫',
  ],
})

async function loadData(type) {

}

onMounted(() => {
  loadData('SCREEN_UNIT_INTRODDUCTION')
})
</script>

<template>
  <div class="w-full">
    <div className="page-content faq-content">
      <div className="page-content about-content">
        <div className="about-header">
          <div className="about-icon">
            🏛️
          </div>
          <h2>{{ info.name }}</h2>
          <p className="established">
            成立于 {{ info.established }} 年
          </p>
        </div>

        <div className="about-section">
          <h3>基本概况</h3>
          <p>
            {{ info.name }}位于北京市石景山区，占地面积 {{ info.area }}，是北京市规模最大、
            设施最完善的公墓之一。单位秉承"服务至上、文明管理"的理念，
            为市民提供全方位的殡葬服务。
          </p>
        </div>

        <div className="about-section">
          <h3>荣誉资质</h3>
          <ul className="feature-list">
            <li key="{index}" className="feature-item">
              <span className="feature-icon">⭐</span>
              {feature}
            </li>
          </ul>
        </div>

        <div className="about-section">
          <h3>服务项目</h3>
          <div className="service-grid">
            <div key="{index}" className="service-card" />
          </div>
        </div>

        <div className="about-section">
          <h3>联系方式</h3>
          <div className="contact-info">
            <p>📍 地址：北京市石景山区八宝山革命公墓</p>
            <p>📞 服务热线：400-XXX-XXXX</p>
            <p>🕐 服务时间：8:00-17:00（全年无休）</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.page-content {
  flex: 1;
  padding: 40px;
  overflow-y: auto;
}

/* 单位介绍样式 */
.about-content {
  margin: 0 auto;
  background: white;
  border-radius: 20px;
  padding: 60px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.about-header {
  text-align: center;
  margin-bottom: 50px;
}

.about-icon {
  font-size: 120px;
  margin-bottom: 20px;
}

.about-header h2 {
  font-size: 42px;
  color: #1a237e;
  margin-bottom: 10px;
}

.established {
  font-size: 20px;
  color: #FF9800;
  font-weight: 500;
}

.about-section {
  margin-bottom: 50px;
}

.about-section h3 {
  font-size: 28px;
  color: #667eea;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 2px solid #667eea;
}

.about-section > p {
  font-size: 18px;
  line-height: 1.8;
  color: #555;
}

.feature-list {
  list-style: none;
  padding: 0;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 20px 24px;
  background: #f5f5f5;
  border-radius: 10px;
  margin-bottom: 15px;
  font-size: 18px;
  color: #333;
}

.feature-icon {
  font-size: 24px;
}

.service-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.service-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 24px;
  border-radius: 12px;
  text-align: center;
  font-size: 18px;
  font-weight: 500;
  transition: all 0.3s ease;
}

.service-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
}

.contact-info {
  background: #f5f5f5;
  padding: 30px;
  border-radius: 12px;
}

.contact-info p {
  font-size: 18px;
  color: #333;
  margin: 15px 0;
  padding-left: 40px;
  position: relative;
}

.contact-info p::before {
  content: attr(emoji);
  position: absolute;
  left: 0;
  font-size: 24px;
}
</style>
