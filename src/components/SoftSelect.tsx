import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

interface SoftSelectProps {
  value: string
  options: string[]
  colorMode: string
  onChange: (value: string) => void
  className?: string
}

export function SoftSelect({ value, options, colorMode, onChange, className = '' }: SoftSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const listboxId = useId()
  const selectedValue = value || options[0] || ''

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setIsOpen(false)
        }}
        className={`flex w-full items-center justify-between gap-2 rounded-2xl border px-3 py-2.5 text-left text-xs font-black outline-none transition-all ${
          colorMode === 'Dark'
            ? 'border-slate-700 bg-slate-800 text-white shadow-inner shadow-black/10 hover:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20'
            : 'border-slate-100 bg-slate-50 text-slate-800 shadow-sm hover:border-indigo-100 hover:bg-white focus:ring-4 focus:ring-indigo-500/10'
        }`}
      >
        <span className="min-w-0 truncate">{selectedValue}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          className={`themed-scrollbar absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-56 overflow-y-auto rounded-2xl border p-1.5 shadow-2xl ${
            colorMode === 'Dark'
              ? 'border-slate-700 bg-slate-900 text-slate-100 shadow-black/40'
              : 'border-slate-100 bg-white text-slate-800 shadow-slate-200/80'
          }`}
        >
          {options.map((option) => {
            const selected = option === selectedValue

            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option)
                  setIsOpen(false)
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-black transition-colors ${
                  selected
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : colorMode === 'Dark'
                      ? 'text-slate-300 hover:bg-slate-800'
                      : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="min-w-0 truncate">{option}</span>
                {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
