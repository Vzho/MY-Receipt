import type { FieldDefinition, FieldKey, FieldPreference } from '../types/fieldConfig'

export const FIELD_REGISTRY: FieldDefinition[] = [
  { key: 'merchant_name', label: 'Merchant', group: 'identity', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: true },
  { key: 'invoice_no', label: 'Invoice No', group: 'identity', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: true },
  { key: 'date', label: 'Date', group: 'identity', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: true },
  { key: 'time', label: 'Time', group: 'identity', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: false },
  { key: 'currency', label: 'Currency', group: 'financial', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: false },
  { key: 'payment_method', label: 'Payment Method', group: 'identity', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: false },
  { key: 'subtotal', label: 'Subtotal', group: 'financial', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: true },
  { key: 'discount', label: 'Discount', group: 'financial', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: false },
  { key: 'tax', label: 'Tax / SST', group: 'financial', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: false },
  { key: 'service_charge', label: 'Service Charge', group: 'financial', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: false },
  { key: 'rounding', label: 'Rounding', group: 'financial', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: false },
  { key: 'grand_total', label: 'Grand Total', group: 'financial', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: true },
  { key: 'change', label: 'Change', group: 'financial', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: false },
  { key: 'tax_breakdown', label: 'Tax Breakdown', group: 'financial', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: false },
  { key: 'company_reg_no', label: 'Company Reg No', group: 'tax', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: false },
  { key: 'address_structured', label: 'Structured Address', group: 'identity', defaultEnabled: false, defaultExportEnabled: false, requiredForValidation: false },
  { key: 'tin_no', label: 'TIN No', group: 'tax', defaultEnabled: false, defaultExportEnabled: false, requiredForValidation: false },
  { key: 'sst_no', label: 'SST No', group: 'tax', defaultEnabled: false, defaultExportEnabled: false, requiredForValidation: false },
  { key: 'subsidy_details', label: 'Subsidy Details', group: 'financial', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: false },
  { key: 'items', label: 'Line Items', group: 'items', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: false },
  { key: 'supplier_name', label: 'Supplier Name', group: 'einvoice', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: false },
  { key: 'buyer_name', label: 'Buyer Name', group: 'einvoice', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: false },
  { key: 'supplier_tin', label: 'Supplier TIN', group: 'einvoice', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: false },
  { key: 'buyer_tin', label: 'Buyer TIN', group: 'einvoice', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: false },
  { key: 'invoice_uuid', label: 'Invoice UUID', group: 'einvoice', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: false },
  { key: 'validation_link', label: 'Validation Link', group: 'einvoice', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: false },
  { key: 'qr_payload', label: 'QR Payload', group: 'einvoice', defaultEnabled: false, defaultExportEnabled: false, requiredForValidation: false },
  { key: 'invoice_type', label: 'Invoice Type', group: 'einvoice', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: false },
  { key: 'tax_amount', label: 'Tax Amount', group: 'einvoice', defaultEnabled: true, defaultExportEnabled: true, requiredForValidation: false },
]

export function defaultFieldPreferences(): FieldPreference[] {
  return FIELD_REGISTRY.map((field) => ({
    field_key: field.key,
    enabled: field.defaultEnabled,
    export_enabled: field.defaultExportEnabled,
  }))
}

export function mergeFieldPreferences(preferences: Partial<FieldPreference>[] = []): FieldPreference[] {
  const overrides = new Map(preferences.map((preference) => [preference.field_key, preference]))

  return FIELD_REGISTRY.map((field) => {
    const override = overrides.get(field.key)
    return {
      field_key: field.key,
      enabled: typeof override?.enabled === 'boolean' ? override.enabled : field.defaultEnabled,
      export_enabled: typeof override?.export_enabled === 'boolean' ? override.export_enabled : field.defaultExportEnabled,
      id: override?.id,
      user_id: override?.user_id,
      created_at: override?.created_at,
      updated_at: override?.updated_at,
    }
  })
}

export function isFieldEnabled(preferences: Partial<FieldPreference>[] | undefined, key: FieldKey): boolean {
  return getFieldPreference(preferences, key).enabled
}

export function isFieldExportEnabled(preferences: Partial<FieldPreference>[] | undefined, key: FieldKey): boolean {
  const preference = getFieldPreference(preferences, key)
  return preference.enabled && preference.export_enabled
}

export function getExportFieldKeys(preferences?: Partial<FieldPreference>[]): FieldKey[] {
  return mergeFieldPreferences(preferences).filter((preference) => preference.enabled && preference.export_enabled).map((preference) => preference.field_key)
}

export function requiredValidationFieldKeys(): FieldKey[] {
  return FIELD_REGISTRY.filter((field) => field.requiredForValidation).map((field) => field.key)
}

function getFieldPreference(preferences: Partial<FieldPreference>[] | undefined, key: FieldKey): FieldPreference {
  const merged = mergeFieldPreferences(preferences)
  const found = merged.find((preference) => preference.field_key === key)
  if (!found) {
    return { field_key: key, enabled: true, export_enabled: true }
  }
  return found
}
