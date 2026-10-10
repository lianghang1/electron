import type { Ref } from 'vue'

export type FileSourceType = 'key' | 'url' | 'base64' | 'static' | 'unknown'

export interface FileInfo<T = any> {
  key: string
  url: string
  source: FileSourceType
  raw?: T
}

export interface ResolveFileCoreResult {
  files: FileInfo[]
  urls: string[]
  firstFile?: FileInfo
  firstUrl?: string
}

export interface UseFileResolverResult {
  loading: Ref<boolean>
  files: Ref<FileInfo[]>
  urls: Ref<string[]>
  firstFile: Ref<FileInfo | undefined>
  firstUrl: Ref<string | undefined>

  resolveFile: (url: string | string[]) => Promise<ResolveFileCoreResult>
}
