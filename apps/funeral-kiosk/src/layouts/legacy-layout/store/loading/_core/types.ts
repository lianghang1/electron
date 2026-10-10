export interface LoadingOptions {
  delay?: number
  debug?: boolean
}

export interface LoadingState {
  times: number
  timer: ReturnType<typeof setTimeout> | null
  options: Required<LoadingOptions>
  isShowed: boolean
  isPending: boolean
}
