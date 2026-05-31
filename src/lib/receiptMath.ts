export interface ReceiptMathInput {
  itemTotal?: number | string | null
  hasLineItems?: boolean
  subtotal?: number | string | null
  discount?: number | string | null
  tax?: number | string | null
  serviceCharge?: number | string | null
  rounding?: number | string | null
  grandTotal?: number | string | null
}

export interface ReceiptMathResult {
  baseTotal: number
  effectiveDiscount: number
  effectiveRounding: number
  discountAlreadyIncluded: boolean
  calculatedTotal: number
}

export function calculateReceiptMath(input: ReceiptMathInput): ReceiptMathResult {
  const itemTotal = roundMoney(toNumber(input.itemTotal))
  const subtotal = roundMoney(toNumber(input.subtotal))
  const discount = roundMoney(Math.abs(toNumber(input.discount)))
  const tax = toNumber(input.tax)
  const serviceCharge = toNumber(input.serviceCharge)
  const rounding = roundMoney(toNumber(input.rounding))
  const grandTotal = roundMoney(toNumber(input.grandTotal))
  const baseTotal = input.hasLineItems ? itemTotal : itemTotal > 0 ? itemTotal : subtotal
  const mathCandidate = chooseMathCandidate({
    baseTotal,
    discount,
    tax,
    serviceCharge,
    rounding,
    grandTotal,
  })
  const discountAlreadyIncluded = discount > 0 && mathCandidate.effectiveDiscount === 0

  return {
    baseTotal,
    effectiveDiscount: mathCandidate.effectiveDiscount,
    effectiveRounding: mathCandidate.effectiveRounding,
    discountAlreadyIncluded,
    calculatedTotal: mathCandidate.calculatedTotal,
  }
}

function chooseMathCandidate({
  baseTotal,
  discount,
  tax,
  serviceCharge,
  rounding,
  grandTotal,
}: {
  baseTotal: number
  discount: number
  tax: number
  serviceCharge: number
  rounding: number
  grandTotal: number
}) {
  const discountCandidates = discount > 0 ? [0, discount] : [0]
  const roundingCandidates = rounding === 0
    ? [0]
    : Array.from(new Set([rounding, -Math.abs(rounding)]))
  const candidates = discountCandidates.flatMap((effectiveDiscount) => (
    roundingCandidates.map((effectiveRounding) => ({
      effectiveDiscount,
      effectiveRounding,
      calculatedTotal: roundMoney(baseTotal - effectiveDiscount + tax + serviceCharge + effectiveRounding),
    }))
  ))

  if (grandTotal <= 0) {
    const fallbackDiscount = discount > 0 && baseTotal > 0 ? 0 : discount
    return {
      effectiveDiscount: fallbackDiscount,
      effectiveRounding: rounding,
      calculatedTotal: roundMoney(baseTotal - fallbackDiscount + tax + serviceCharge + rounding),
    }
  }

  return candidates.sort((left, right) => (
    Math.abs(left.calculatedTotal - grandTotal) - Math.abs(right.calculatedTotal - grandTotal)
  ))[0]
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

export function differs(left: number, right: number) {
  return Math.abs(left - right) > 0.05
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
