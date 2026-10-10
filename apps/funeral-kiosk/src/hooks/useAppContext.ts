import useContext from './useContext'

export const { setupStore: setupAppContext, useStore: useAppContext } = useContext('mix-app-context', () => {
  let resetCountdownFn: any | null = null

  function setResetCountdownFn(fn: any) {
    resetCountdownFn = fn
  }

  function resetCountdown(...args: any[]) {
    resetCountdownFn?.(...args)
  }

  return {
    resetCountdown,
    setResetCountdownFn,
  }
})
