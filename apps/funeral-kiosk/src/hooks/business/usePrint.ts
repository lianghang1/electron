import type { PrintOptions } from '@desktop/shared'

export default function () {
  async function printPdf(fileUrl: string, options: PrintOptions) {
    try {
      const result = await window.desktop.print.submit({
        payload: {
          kind: 'url',
          url: fileUrl,
          fileType: 'pdf',
        },
        options,
      })
      return result
    }
    catch (error: any) {
      console.log(error.message)
      return false
    }
  }

  return {
    printPdf,
  }
}
