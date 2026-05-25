import type { KeyboardEventHandler, ReactNode } from 'react'

interface ReceiptDetailPanelProps {
  colorMode: string
  children: ReactNode
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
}

export function ReceiptDetailPanel({ colorMode, children, onKeyDown }: ReceiptDetailPanelProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`w-full max-w-[98vw] h-[96vh] rounded-[32px] shadow-2xl overflow-hidden flex flex-col transition-colors ${colorMode === 'Dark' ? 'bg-slate-900 border border-slate-800' : 'bg-white'}`}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>
  )
}
