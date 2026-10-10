<script setup lang="ts">
import type { SettlementRequest, ThirdPartyPayResponse } from '@/api/types/payment'
import { isBooleanFalse, isEmpty } from '@fun-design/utils'
import NP from 'number-precision'
import PaymentApi from '@/api/payment'

const appStore = useAppStore()
const router = useRouter()
const [pageData, setPageData, resetPageData] = useState({
  businessId: '',
  businessType: '',
  paymentMethod: '',
})

async function handleOpen(data: {
  businessId: string
  businessType: string
  paymentMethod: string
}) {
  resetPageData()
  setPageData(data)
  await handlePayOrder()
}

async function handlePayOrder() {
  const orderData = await PaymentApi.settlementInit({
    businessId: pageData.businessId,
    businessType: pageData.businessType,
  })

  const payBillItems = orderData?.billItems

  if (isEmpty(payBillItems)) {
    return
  }

  let shouldPrice: number = 0
  for (const item of payBillItems!) {
    shouldPrice = NP.plus(shouldPrice, item.shouldPrice || 0)
  }

  if (shouldPrice <= 0) {
    return
  }

  const params: SettlementRequest = {
    counterId: appStore.deviceId,
    businessId: pageData.businessId,
    businessType: pageData.businessType,
    payItems: payBillItems!.map((item) => {
      return {
        billItemId: item.billItemId,
        orderId: item.orderId,
        orderType: item.orderType,
        orderItemId: item.orderItemId,
        paymentPrice: item.shouldPrice,
        billVersion: item.billVersion,
      }
    }),
    settlementMethods: [
      {
        methodCode: pageData.paymentMethod,
        paymentPrice: shouldPrice,
      },
    ],
    invoiceType: '2',
    settlementInvoice: orderData!.invoiceInit,
  }

  const data = await PaymentApi.settlement<ThirdPartyPayResponse>(params)
  if (isBooleanFalse(data?.thirdPartyPay)) {
    // TODO 内部支付
    return
  }
  const payData = data!.payResponse

  router.replace({
    path: '/payment/pay',
    query: {
      serialNo: payData.serialNo,
      businessId: pageData.businessId,
      businessType: pageData.businessType,
    },
  })
}

defineExpose({
  open: handleOpen,
})
</script>

<template>
  <div />
</template>

<style lang="scss" scoped>

</style>
