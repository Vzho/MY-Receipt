const SUPPORTED_CLIPBOARD_IMAGE_TYPES = new Set(['image/png', 'image/jpeg'])

export interface ClipboardReceiptImageExtraction {
  files: File[]
  unsupportedImageTypes: string[]
}

export function extractReceiptImageFilesFromClipboard(
  clipboardData: Pick<DataTransfer, 'items'> | null | undefined,
  now = new Date(),
): ClipboardReceiptImageExtraction {
  const items = Array.from(clipboardData?.items ?? [])
  const imageItems = items.filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
  const unsupportedImageTypes = unique(imageItems
    .map((item) => item.type)
    .filter((type) => !SUPPORTED_CLIPBOARD_IMAGE_TYPES.has(type)))
  const timestamp = formatPasteTimestamp(now)
  const files = imageItems
    .filter((item) => SUPPORTED_CLIPBOARD_IMAGE_TYPES.has(item.type))
    .map((item, index) => {
      const source = item.getAsFile()
      if (!source) return null
      const extension = item.type === 'image/jpeg' ? 'jpg' : 'png'
      const suffix = index === 0 ? '' : `-${index + 1}`
      return new File([source], `pasted-receipt-${timestamp}${suffix}.${extension}`, {
        type: item.type,
        lastModified: now.getTime(),
      })
    })
    .filter((file): file is File => Boolean(file))

  return { files, unsupportedImageTypes }
}

export function isEditablePasteTarget(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false
  const editableTarget = target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
  if (!editableTarget) return false
  if (editableTarget instanceof HTMLInputElement) {
    return editableTarget.type !== 'file'
  }
  return true
}

function formatPasteTimestamp(date: Date) {
  const yyyy = String(date.getFullYear())
  const mm = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  const hh = pad(date.getHours())
  const min = pad(date.getMinutes())
  const ss = pad(date.getSeconds())
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function unique(values: string[]) {
  return Array.from(new Set(values))
}
