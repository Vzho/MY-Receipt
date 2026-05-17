export interface ReceiptMathInput {
  itemTotal?: number | string | null
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
  discountAlreadyIncluded: boolean
  calculatedTotal: number
}

export function calculateReceiptMath(input: ReceiptMathInput): ReceiptMathResult {
  const itemTotal = roundMoney(toNumber(input.itemTotal))
  const subtotal = roundMoney(toNumber(input.subtotal))
  const discount = roundMoney(Math.abs(toNumber(input.discount)))
  const tax = toNumber(input.tax)
  const serviceCharge = toNumber(input.serviceCharge)
  const rounding = toNumber(input.rounding)
  const grandTotal = roundMoney(toNumber(input.grandTotal))
  const baseTotal = itemTotal > 0 ? itemTotal : subtotal
  const charges = tax + serviceCharge + rounding
  const withoutDiscount = roundMoney(baseTotal + charges)
  const withDiscount = roundMoney(baseTotal - discount + charges)
  const discountAlreadyIncluded = discount > 0 && shouldTreatDiscountAsIncluded({
    itemTotal,
    subtotal,
    grandTotal,
    withDiscount,
    withoutDiscount,
  })
  const effectiveDiscount = discountAlreadyIncluded ? 0 : discount

  return {
    baseTotal,
    effectiveDiscount,
    discountAlreadyIncluded,
    calculatedTotal: roundMoney(baseTotal - effectiveDiscount + charges),
  }
}

function shouldTreatDiscountAsIncluded({
  itemTotal,
  subtotal,
  grandTotal,
  withDiscount,
  withoutDiscount,
}: {
  itemTotal: number
  subtotal: number
  grandTotal: number
  withDiscount: number
  withoutDiscount: number
}) {
  if (grandTotal > 0) {
    return Math.abs(withoutDiscount - grandTotal) <= Math.abs(withDiscount - grandTotal)
  }

  return itemTotal > 0 && subtotal > 0 && !differs(itemTotal, subtotal)
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
