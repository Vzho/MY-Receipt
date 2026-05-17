import { AlertTriangle } from 'lucide-react'
import type { DuplicateCandidate } from '../types/duplicate'

interface DuplicateDialogProps {
  filename: string
  candidates: DuplicateCandidate[]
  labels?: any
  onCancel: () => void
  onContinue: () => void
  onOpenExisting: (id: string) => void
}

export function DuplicateDialog({ filename, candidates, labels, onCancel, onContinue, onOpenExisting }: DuplicateDialogProps) {
  const best = candidates[0]
  if (!best) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-amber-50 p-3 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900">{labels?.duplicateTitle || 'Possible duplicate'}</h3>
            <p className="mt-1 text-sm font-bold leading-6 text-slate-500">{typeof labels?.duplicateDescription === 'function' ? labels.duplicateDescription(filename, best.score) : `${filename} looks similar to an existing receipt. Score: ${(best.score * 100).toFixed(0)}%.`}</p>
          </div>
        </div>
        <div className="mt-5 rounded-2xl bg-slate-50 p-4">
          <p className="text-sm font-black text-slate-900">{best.receipt.merchant_name || best.receipt.filename}</p>
          <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">{best.receipt.invoice_no || labels?.noInvoiceLabel || 'No invoice'} / {best.receipt.date || '-'} / RM {Number(best.receipt.grand_total || 0).toFixed(2)}</p>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-xl bg-slate-100 px-4 py-2 text-[10px] font-black uppercase text-slate-600 hover:bg-slate-200">{labels?.cancelUploadLabel || 'Cancel upload'}</button>
          <button onClick={() => onOpenExisting(best.receipt.id)} className="rounded-xl bg-indigo-50 px-4 py-2 text-[10px] font-black uppercase text-indigo-700 hover:bg-indigo-100">{labels?.openExistingLabel || 'Open existing'}</button>
          <button onClick={onContinue} className="rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black uppercase text-white hover:bg-slate-800">{labels?.continueUploadLabel || 'Continue upload'}</button>
        </div>
      </div>
    </div>
  )
}
