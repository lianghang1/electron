export interface ProductItem {
  itemId: string
  itemType: string
  itemName: string
  pic?: string
  albumPics?: string[]
  content?: string
  sortId: string
  spec?: string
  unit?: string
  price: number
  storeId?: string
  storeName?: string
  remark?: string
  realPrice: number
  qty?: number
  sumPrice?: number
}

export interface ProductItemType {
  /**
   * @description 多个逗号隔开
   */
  itemType?: string
  /**
   * @description 多个逗号隔开
   */
  sortId?: string
  productId?: string
}

export interface GetProductListRequest {
  orderBy?: string
  onlineFlag?: boolean
  filterCode?: string
  productItemTypes?: ProductItemType[]
}

export interface RetailItem {
  itemId: string
  itemType: string
  itemName: string
  qty: number
  price: number
  sortId?: string
  itemPic?: string
  itemUnit?: string
  itemSpec?: string
  specialType?: string
  storeId?: string
}

export interface RetailRequest {
  /**
   * @description 1: 殡仪，2: 零售，3：寄存
   */
  businessSource?: '2' | '1' | '3'
  mobileNo?: string
  counterName: string
  items: RetailItem[]
}

export interface RetailResponse {
  id: string
  /**
   * @description 结算业务类型
   */
  payBusinessType: string
}
