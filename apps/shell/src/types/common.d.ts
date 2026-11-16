declare namespace CommonType {
  interface LabelValueOption<V = string | number | boolean> {
    label: string
    value: V
    [key: string]: any
  }
}
