import { Upload } from 'lucide-react'
import { ACCEPTED_RECEIPT_MIME_TYPES, MAX_RECEIPT_FILE_SIZE_BYTES, validateReceiptFile } from '../lib/receiptApi'

interface UploadDropzoneProps {
  disabled?: boolean
  onFilesAccepted: (files: File[]) => void
  onError: (message: string) => void
}

export function UploadDropzone({ disabled = false, onFilesAccepted, onError }: UploadDropzoneProps) {
  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || disabled) return

    const files = Array.from(fileList).slice(0, 20)
    const invalid = files.map(validateReceiptFile).find(Boolean)
    if (invalid) {
      onError(invalid)
      return
    }

    onFilesAccepted(files)
  }

  return (
    <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white px-6 py-8 text-center transition hover:border-indigo-300 hover:bg-indigo-50/40">
      <Upload className="mb-3 h-8 w-8 text-indigo-600" />
      <span className="text-sm font-black text-slate-900">上传收据文件</span>
      <span className="mt-1 text-xs font-bold text-slate-500">JPEG, PNG, PDF / 最大 {MAX_RECEIPT_FILE_SIZE_BYTES / 1024 / 1024}MB</span>
      <input
        type="file"
        className="hidden"
        multiple
        disabled={disabled}
        accept={ACCEPTED_RECEIPT_MIME_TYPES.join(',')}
        onChange={(event) => handleFiles(event.currentTarget.files)}
      />
    </label>
  )
}
