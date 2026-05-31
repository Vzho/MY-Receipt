export function dragEventHasFiles(event: Pick<DragEvent, 'dataTransfer'> | { dataTransfer?: Pick<DataTransfer, 'types'> | null }): boolean {
  const types = event.dataTransfer?.types
  if (!types) return false
  return Array.from(types).includes('Files')
}

export function extractDroppedFiles(dataTransfer: Pick<DataTransfer, 'files'> | null | undefined, limit = 20): File[] {
  return Array.from(dataTransfer?.files ?? []).slice(0, limit)
}
