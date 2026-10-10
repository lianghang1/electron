<script setup lang="ts">
import AppModules from './components/AppModules.vue'
</script>

<template>
  <div class="home-page">
    <div class="welcome-section">
      <div class="welcome-content">
        <h2>智能自助服务系统</h2>
        <p>为您提供便捷高效的服务体验</p>
      </div>
    </div>

    <div class="home-apps">
      <AppModules />
    </div>
  </div>
</template>

<style scoped lang="scss">
.home-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
}

.welcome-section {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 60px 20px;
  text-align: center;
}

.welcome-content h2 {
  font-size: 36px;
  font-weight: 800;
  color: #e3e8f1;
  margin: 0 0 15px 0;
  background: linear-gradient(135deg, #e3e8f1 0%, #e3e8f1 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.welcome-content p {
  font-size: 18px;
  color: #e3e8f1;
  margin: 0;
}

.home-apps {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}
</style>
