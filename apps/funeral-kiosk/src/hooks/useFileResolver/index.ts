import type { FileInfo, UseFileResolverResult } from './shared/types'

import { isEmpty } from '@/utils'
import { resolveFileCore } from './shared/core'

export function useFileResolver(url?: string | string[]): UseFileResolverResult {
  const loading = ref(false)
  const files = ref<FileInfo[]>([])
  const urls = ref<string[]>([])
  const firstFile = ref<FileInfo | undefined>()
  const firstUrl = ref<string | undefined>()

  const loadFile = async (url: string | string[]) => {
    try {
      loading.value = true

      const result = await resolveFileCore(url)
      files.value = result.files || []
      urls.value = result.urls || []
      firstFile.value = result.firstFile
      firstUrl.value = result.firstUrl
    }
    catch (_) {
    }
    finally {
      loading.value = false
    }
  }

  if (!isEmpty(url)) {
    loadFile(url!)
  }

  return {
    loading,
    files,
    urls,
    firstFile,
    firstUrl,

    resolveFile: resolveFileCore,
  }
}
