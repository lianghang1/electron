// 定义表单字段配置类型
export interface FieldConfig {
  field: string
  type: 'text' | 'number' | 'password' | 'select' | 'range' | 'checkbox' | 'switch' | 'static' | 'button'
  label?: string
  placeholder?: string
  disabled?: boolean
  class?: string
  condition?: {
    field: string
    operator: '==' | '===' | '!=' | '!==' | '>' | '<' | '>=' | '<='
    value: any
  }
  // 不同类型特有属性
  options?: Array<{ label: string, value: string | number, disabled?: boolean }>
  min?: number
  max?: number
  step?: number
  suffix?: string
  value?: string | number
  action?: () => void
}

// 表单配置类型
export interface FormConfig {
  fields: FieldConfig[]
}
