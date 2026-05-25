import type { ReceiptItem } from '../types/receipt'

export type ParsedLineItem = Pick<ReceiptItem, 'name' | 'qty' | 'unit' | 'unit_price' | 'line_total'>

export function parseLineItemsFromClipboard(text: string): ParsedLineItem[] {
  const rows = text
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean)

  if (rows.length === 0) return []

  return rows
    .map(parseLine)
    .filter((item): item is ParsedLineItem => Boolean(item && item.name))
}

function parseLine(row: string): ParsedLineItem | null {
  const tabParts = row.split('\t').map((part) => part.trim()).filter(Boolean)
  if (tabParts.length >= 3) {
    return buildItem(tabParts[0], tabParts.slice(1))
  }

  const csvParts = row.split(',').map((part) => part.trim()).filter(Boolean)
  if (csvParts.length >= 3) {
    return buildItem(csvParts[0], csvParts.slice(1))
  }

  const match = row.match(/^(.*?)\s+(-?\d+(?:\.\d{1,3})?)\s+(-?\d+(?:\.\d{1,2})?)\s+(-?\d+(?:\.\d{1,2})?)$/)
  if (match) {
    return buildItem(match[1].trim(), [match[2], match[3], match[4]])
  }

  const amountMatch = row.match(/^(.*?)\s+(-?\d+(?:\.\d{1,2})?)$/)
  if (amountMatch) {
    return buildItem(amountMatch[1].trim(), [amountMatch[2]])
  }

  return {
    name: row,
    qty: 1,
    unit: null,
    unit_price: 0,
    line_total: 0,
  }
}

function buildItem(name: string, numericParts: string[]): ParsedLineItem | null {
  const numbers = numericParts
    .map(parseMoney)
    .filter((value) => Number.isFinite(value))

  if (!name.trim()) return null

  if (numbers.length >= 3) {
    const [qty, unitPrice, lineTotal] = numbers
    return {
      name: name.trim(),
      qty,
      unit: null,
      unit_price: unitPrice,
      line_total: lineTotal,
    }
  }

  if (numbers.length >= 2) {
    const [qty, lineTotal] = numbers
    const unitPrice = qty ? lineTotal / qty : 0
    return {
      name: name.trim(),
      qty,
      unit: null,
      unit_price: roundMoney(unitPrice),
      line_total: lineTotal,
    }
  }

  const lineTotal = numbers[0] ?? 0
  return {
    name: name.trim(),
    qty: 1,
    unit: null,
    unit_price: lineTotal,
    line_total: lineTotal,
  }
}

function parseMoney(value: string) {
  return Number(value.replace(/[^\d.-]/g, ''))
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
