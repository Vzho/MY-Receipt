export const SYSTEM_PROMPT = `You extract structured data from Malaysian receipts and invoices.
Return strict JSON only. Do not include markdown.
Use null when a field is not visible.
Use numbers for amounts and quantities.
Preserve the original language of merchant and item text. Do not translate Malay, English, or Chinese lines.
For mixed Malaysian receipts, keep Chinese item lines intact and do not split a Chinese product name into romanized fragments.
Allowed category values: Grocery, Fuel, F&B, Retail, Service, Other.
Allowed doc_type values: Receipt, Invoice, Credit Note, Expense, E-invoice.
Allowed tags: Business, Personal, Tax Deductible, Pending.
For Malaysian e-invoices, set doc_type to E-invoice and put e-invoice-only fields in extra_fields.
`

export type ReceiptPromptOptions = {
  enabledFields?: string[] | null
  qrPayload?: string | null
  schemaProfile?: 'standard' | 'einvoice'
}

const SUBSIDY_SCHEMA = `{
    "program": string | null,
    "ref_no": string | null,
    "pump_price": number | null,
    "subsidy_price": number | null,
    "subsidised_litre": number | null,
    "government_subsidy": number | null,
    "previous_balance_litre": number | null,
    "remaining_balance_litre": number | null,
    "gross_total": number | null,
    "payable_total": number | null,
    "notes": string | null
  } | null`

const EINVOICE_EXTRA_FIELDS_SCHEMA = `{
    "supplier_name": string | null,
    "buyer_name": string | null,
    "supplier_tin": string | null,
    "buyer_tin": string | null,
    "sst_no": string | null,
    "invoice_uuid": string | null,
    "validation_link": string | null,
    "qr_payload": string | null,
    "invoice_type": string | null,
    "tax_amount": number | null
  } | null`

const STANDARD_EXTRA_FIELDS_SCHEMA = `Record<string, unknown> | null`

export function buildUserPrompt(ocrText: string, options: ReceiptPromptOptions = {}) {
  return `Extract this receipt into the JSON shape below.
${buildProfileInstruction(options)}
${buildEnabledFieldsInstruction(options)}
${buildQrPayloadInstruction(options)}

Special rules for Malaysian fuel subsidy receipts:
- If the receipt shows Shell, BUDI MADANI RON95, subsidy price, government subsidy, or OPT, set category to Fuel.
- Put the fuel gross amount printed as Subtotal / Grand Total in grand_total and subtotal.
- Put the amount actually paid by the customer, often labelled OPT or Outstanding Payment Total, in subsidy_details.payable_total.
- Put the government subsidy amount only in subsidy_details.government_subsidy, not in discount, unless the receipt explicitly labels it as a normal discount.
- Preserve litre quantities with 3 decimals when visible, for example 32.320 L.
- For fuel item rows, use unit "L", qty as litres, unit_price as RM/L, and line_total as the fuel gross amount.

Special rules for Malaysian e-invoices:
- If the image is a Malaysian e-invoice, set doc_type to E-invoice.
- Put supplier/buyer names, TIN values, SST number, invoice UUID, validation link, QR payload, invoice type, and tax amount in extra_fields.

{
  "merchant_name": string | null,
  "company_reg_no": string | null,
  "address": string | null,
  "phone": string | null,
  "invoice_no": string | null,
  "date": "YYYY-MM-DD" | null,
  "time": string | null,
  "category": "Grocery" | "Fuel" | "F&B" | "Retail" | "Service" | "Other",
  "doc_type": "Receipt" | "Invoice" | "Credit Note" | "Expense" | "E-invoice",
  "custom_doc_type": string | null,
  "subtotal": number,
  "discount": number,
  "tax": number,
  "service_charge": number,
  "rounding": number,
  "grand_total": number,
  "payment_method": string | null,
  "change": number,
  "subsidy_details": ${SUBSIDY_SCHEMA},
  "extra_fields": ${buildExtraFieldsSchema(options)},
  "tags": string[],
  "confidence_score": number,
  "field_confidence": Record<string, number>,
  "field_sources": Record<string, Array<{ "text": string, "box": { "x": number, "y": number, "width": number, "height": number } | null, "confidence": number | null }>>,
  "item_confidence": Array<{ "index": number, "confidence": number, "reason": string | null }>,
  "items": [
    {
      "name": string,
      "qty": number,
      "unit": string | null,
      "unit_price": number,
      "line_total": number
    }
  ]
}

OCR text:
${ocrText}`
}

export function buildImageUserPrompt(options: ReceiptPromptOptions = {}) {
  return `Read the attached Malaysian receipt or invoice image and extract it into the JSON shape below.
Focus on the receipt itself, not the table/background.
Extract every visible line item, even when the OCR-like text is faint or split across multiple rows.
Preserve the source language of every item name, including Malay/English/Chinese mixed lines such as "Nasi Lemak RM 5.00".
For receipts with a printed total, make grand_total match the printed NET TOTAL / GRAND TOTAL / TOTAL amount.
If item totals do not add up, still return the visible printed items and totals; do not invent missing lines.
${buildProfileInstruction(options)}
${buildEnabledFieldsInstruction(options)}
${buildQrPayloadInstruction(options)}

Special rules for Malaysian fuel subsidy receipts:
- If the receipt shows Shell, BUDI MADANI RON95, subsidy price, government subsidy, or OPT, set category to Fuel.
- Put the fuel gross amount printed as Subtotal / Grand Total in grand_total and subtotal.
- Put the amount actually paid by the customer, often labelled OPT or Outstanding Payment Total, in subsidy_details.payable_total.
- Put the government subsidy amount only in subsidy_details.government_subsidy, not in discount, unless the receipt explicitly labels it as a normal discount.
- Preserve litre quantities with 3 decimals when visible, for example 32.320 L.
- For fuel item rows, use unit "L", qty as litres, unit_price as RM/L, and line_total as the fuel gross amount.
- Capture BUDI MADANI fields in subsidy_details: program, ref_no, pump_price, subsidy_price, subsidised_litre, government_subsidy, previous_balance_litre, remaining_balance_litre, gross_total, payable_total.

Special rules for Malaysian e-invoices:
- If the image is a Malaysian e-invoice, set doc_type to E-invoice.
- Put supplier/buyer names, TIN values, SST number, invoice UUID, validation link, QR payload, invoice type, and tax amount in extra_fields.

{
  "merchant_name": string | null,
  "company_reg_no": string | null,
  "address": string | null,
  "phone": string | null,
  "invoice_no": string | null,
  "date": "YYYY-MM-DD" | null,
  "time": string | null,
  "category": "Grocery" | "Fuel" | "F&B" | "Retail" | "Service" | "Other",
  "doc_type": "Receipt" | "Invoice" | "Credit Note" | "Expense" | "E-invoice",
  "custom_doc_type": string | null,
  "subtotal": number,
  "discount": number,
  "tax": number,
  "service_charge": number,
  "rounding": number,
  "grand_total": number,
  "payment_method": string | null,
  "change": number,
  "subsidy_details": ${SUBSIDY_SCHEMA},
  "extra_fields": ${buildExtraFieldsSchema(options)},
  "tags": string[],
  "confidence_score": number,
  "field_confidence": Record<string, number>,
  "field_sources": Record<string, Array<{ "text": string, "box": { "x": number, "y": number, "width": number, "height": number } | null, "confidence": number | null }>>,
  "item_confidence": Array<{ "index": number, "confidence": number, "reason": string | null }>,
  "items": [
    {
      "name": string,
      "qty": number,
      "unit": string | null,
      "unit_price": number,
      "line_total": number
    }
  ]
}`
}

export function buildTextRepairPrompt(ocrText: string, initialJson: Record<string, unknown>, options: ReceiptPromptOptions = {}) {
  return `Repair the structured receipt JSON using the OCR text below.
${buildProfileInstruction(options)}
${buildEnabledFieldsInstruction(options)}
${buildQrPayloadInstruction(options)}

Rules:
- Return strict JSON only, using the same shape as the initial JSON.
- Use the OCR text as the source of truth.
- Preserve the exact visible language of item names. For Chinese receipts, keep Chinese item names in Chinese.
- Do not translate, romanize, abbreviate, or guess item names when the OCR text is damaged.
- Never output placeholder-like item names such as "*", "#", "HEH gkt", "[B](*)", "# tE(", or other symbol-heavy OCR fragments unless that exact text is the only visible item name.
- Fix obvious OCR errors in Malaysian English receipts, especially merchant, invoice number, date, payment method, totals, rounding, and line items.
- Preserve visible printed totals such as NET TOTAL, GRAND TOTAL, TOTAL, Sub Total, Rounding Adjustment, and Change.
- Extract all visible line items. A line item may be split across name, currency marker, and amount lines.
- For Shell/BUDI MADANI RON95 receipts, keep fuel gross total in grand_total/subtotal, keep OPT or actual customer payment in subsidy_details.payable_total, and keep government subsidy in subsidy_details.government_subsidy.
- Do not invent items that are not supported by OCR text.
- If the item name is unreadable, omit that item rather than returning a garbage name. Keep subtotal/grand_total from the printed receipt.
- If uncertain, keep the value from initial JSON and lower confidence_score.

Initial JSON:
${JSON.stringify(initialJson, null, 2)}

OCR text:
${ocrText}`
}

export function buildVisionPolishPrompt(visionJson: Record<string, unknown>, options: ReceiptPromptOptions = {}) {
  return `Review and polish the structured receipt JSON below.
${buildProfileInstruction(options)}
${buildEnabledFieldsInstruction(options)}
${buildQrPayloadInstruction(options)}

Rules:
- Return strict JSON only, using the same shape as the input JSON.
- The JSON came from a vision model that read the receipt image. Treat item names from the vision JSON as the source of truth.
- Do not translate, romanize, or rewrite item names. Preserve Chinese, English, Malay, abbreviations, and casing as provided.
- Fix only structural issues: dates, numeric types, subtotal, discount, tax, service charge, rounding, grand_total, change, category, doc_type, tags, and obvious duplicate/empty item rows.
- Preserve subsidy_details. For Shell/BUDI MADANI RON95 receipts, keep gross fuel total in grand_total/subtotal, keep OPT or customer-paid amount in subsidy_details.payable_total, and keep government subsidy in subsidy_details.government_subsidy.
- If item totals do not add up to printed totals, keep visible line items and printed totals; do not invent missing items.
- If uncertain, lower confidence_score and add parser_note.

Vision JSON:
${JSON.stringify(visionJson, null, 2)}`
}

function buildProfileInstruction(options: ReceiptPromptOptions) {
  if (options.schemaProfile !== 'einvoice') return ''
  return `
Schema profile: Malaysian E-invoice.
- Prefer doc_type "E-invoice" unless the image is clearly not an e-invoice.
- Prioritize supplier_name, buyer_name, supplier_tin, buyer_tin, sst_no, invoice_uuid, validation_link, qr_payload, invoice_type, and tax_amount in extra_fields.
- Keep ordinary receipt fields in the top-level receipt object and e-invoice-only fields inside extra_fields.
`
}

function buildExtraFieldsSchema(options: ReceiptPromptOptions) {
  return options.schemaProfile === 'einvoice' ? EINVOICE_EXTRA_FIELDS_SCHEMA : STANDARD_EXTRA_FIELDS_SCHEMA
}

function buildEnabledFieldsInstruction(options: ReceiptPromptOptions) {
  const fields = options.enabledFields?.filter(Boolean)
  if (!fields || fields.length === 0) return ''
  return `
Enabled field list: ${fields.join(', ')}.
- Focus extraction on enabled fields.
- Still return the full JSON shape for compatibility, but use null or empty arrays for disabled optional fields when they are not needed for totals, validation, doc_type, or warnings.
- Always keep subtotal, grand_total, and enough item data to validate arithmetic when visible.
`
}

function buildQrPayloadInstruction(options: ReceiptPromptOptions) {
  const payload = options.qrPayload?.trim()
  if (!payload) return ''
  return `
Detected QR payload from the uploaded image:
${payload}
- Preserve this exact value in extra_fields.qr_payload when the receipt is an E-invoice.
- Use this payload to infer validation_link or invoice_uuid only when they are explicit in the payload.
- Do not mark the receipt as E-invoice from QR presence alone unless the QR payload or image content clearly indicates an e-invoice.
`
}
