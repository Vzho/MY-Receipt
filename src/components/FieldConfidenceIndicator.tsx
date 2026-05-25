import { formatFieldConfidence, getFieldConfidenceTone } from '../lib/fieldConfidence'

interface FieldConfidenceIndicatorProps {
  confidence: number | null
  labels?: Record<string, any>
}

export function FieldConfidenceIndicator({ confidence, labels }: FieldConfidenceIndicatorProps) {
  const tone = getFieldConfidenceTone(confidence)
  if (!tone || confidence === null) return null

  const toneClass = tone === 'high'
    ? 'bg-emerald-500'
    : tone === 'medium'
      ? 'bg-amber-400'
      : 'bg-rose-500'
  const label = labels?.fieldConfidenceLabel || 'Field confidence'
  const hint = labels?.fieldConfidenceHint || 'AI confidence for this field. Low confidence fields should be checked against the receipt image.'

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] font-black text-slate-500"
      title={`${label}: ${formatFieldConfidence(confidence)}. ${hint}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${toneClass}`} />
      {formatFieldConfidence(confidence)}
    </span>
  )
}
