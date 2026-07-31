import { contextBridge } from 'electron'

// Custom APIs for renderer
const api = {}

try {
  contextBridge.exposeInMainWorld('api', api)
}
catch (error) {
  console.error(error)
}
