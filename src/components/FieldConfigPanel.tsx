import { FIELD_REGISTRY, mergeFieldPreferences } from '../lib/fieldConfig'
import type { FieldPreference } from '../types/fieldConfig'

interface FieldConfigPanelProps {
  preferences: Partial<FieldPreference>[]
  onChange: (preferences: FieldPreference[]) => void
  labels?: any
}

export function FieldConfigPanel({ preferences, onChange, labels }: FieldConfigPanelProps) {
  const merged = mergeFieldPreferences(preferences)

  const update = (fieldKey: string, patch: Partial<FieldPreference>) => {
    onChange(merged.map((preference) => preference.field_key === fieldKey ? { ...preference, ...patch } : preference))
  }

  return (
    <div className="space-y-3">
      {FIELD_REGISTRY.map((field) => {
        const preference = merged.find((item) => item.field_key === field.key)
        const fieldLabel = labels?.fieldLabels?.[field.key] || field.label
        return (
          <div key={field.key} className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
            <div>
              <p className="text-xs font-black text-slate-800">{fieldLabel}</p>
              <p className="text-[9px] font-bold uppercase text-slate-400">{labels?.fieldGroupLabels?.[field.group] || field.group}{field.requiredForValidation ? ` / ${labels?.requiredFieldLabel || 'required'}` : ''}</p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-black uppercase text-slate-500">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={preference?.enabled ?? field.defaultEnabled} onChange={(event) => update(field.key, { enabled: event.target.checked })} />
                {labels?.showFieldLabel || 'Show'}
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={preference?.export_enabled ?? field.defaultExportEnabled} onChange={(event) => update(field.key, { export_enabled: event.target.checked })} />
                {labels?.exportFieldLabel || 'Export'}
              </label>
            </div>
          </div>
        )
      })}
    </div>
  )
}
