import { createRouter as _createRouter, createWebHashHistory } from 'vue-router'
import ActivityPage from '../pages/activity/index.vue'
import CremationPage from '../pages/cremation/index.vue'
import ElectronicDetail from '../pages/electronic/detail.vue'
import ElectronicIndex from '../pages/electronic/index.vue'
import FaqPage from '../pages/faq.vue'
import HallPage from '../pages/hall/index.vue'
import HomePage from '../pages/index.vue'
import InvoiceIndex from '../pages/invoice/index.vue'
import InvoiceDetail from '../pages/invoice/order-detail.vue'
import PaymentIndex from '../pages/payment/index.vue'
import OrderDetail from '../pages/payment/order-detail.vue'
import PaymentPay from '../pages/payment/pay.vue'
import PolicyPage from '../pages/policy.vue'
import RetailPage from '../pages/retail/index.vue'

/** Kiosk 页面路由：hash 模式；meta.title 用于二级页返回条展示 */
export const router = _createRouter({
  history: createWebHashHistory('/'),
  routes: [
    { path: '/', name: 'home', component: HomePage, meta: { title: '智能自助服务系统' } },
    { path: '/payment', name: 'payment', component: PaymentIndex, meta: { title: '业务缴费' } },
    { path: '/payment/order-detail', name: 'payment-order', component: OrderDetail, meta: { title: '缴费结算' } },
    { path: '/payment/pay', name: 'payment-pay', component: PaymentPay, meta: { title: '扫码支付' } },
    { path: '/invoice', name: 'invoice', component: InvoiceIndex, meta: { title: '扫码开票' } },
    { path: '/invoice/order-detail', name: 'invoice-order', component: InvoiceDetail, meta: { title: '发票服务' } },
    { path: '/electronic', name: 'electronic', component: ElectronicIndex, meta: { title: '电子火化证' } },
    { path: '/electronic/detail', name: 'electronic-detail', component: ElectronicDetail, meta: { title: '电子火化证' } },
    { path: '/retail', name: 'retail', component: RetailPage, meta: { title: '丧葬用品' } },
    { path: '/hall', name: 'hall', component: HallPage, meta: { title: '礼厅预定情况' } },
    { path: '/cremation', name: 'cremation', component: CremationPage, meta: { title: '火化预定情况' } },
    { path: '/activity', name: 'activity', component: ActivityPage, meta: { title: '服务介绍' } },
    { path: '/faq', name: 'faq', component: FaqPage, meta: { title: '常见问题解答' } },
    { path: '/policy', name: 'policy', component: PolicyPage, meta: { title: '惠民政策' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
