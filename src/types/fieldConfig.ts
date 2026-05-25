export type FieldGroup = 'identity' | 'financial' | 'tax' | 'items' | 'einvoice'

export type FieldKey =
  | 'merchant_name'
  | 'invoice_no'
  | 'date'
  | 'time'
  | 'currency'
  | 'payment_method'
  | 'subtotal'
  | 'discount'
  | 'tax'
  | 'service_charge'
  | 'rounding'
  | 'grand_total'
  | 'change'
  | 'tax_breakdown'
  | 'company_reg_no'
  | 'address_structured'
  | 'tin_no'
  | 'sst_no'
  | 'subsidy_details'
  | 'items'
  | 'supplier_name'
  | 'buyer_name'
  | 'supplier_tin'
  | 'buyer_tin'
  | 'invoice_uuid'
  | 'validation_link'
  | 'qr_payload'
  | 'invoice_type'
  | 'tax_amount'

export interface FieldDefinition {
  key: FieldKey
  label: string
  group: FieldGroup
  defaultEnabled: boolean
  defaultExportEnabled: boolean
  requiredForValidation: boolean
}

export interface FieldPreference {
  id?: string
  user_id?: string
  field_key: FieldKey
  enabled: boolean
  export_enabled: boolean
  created_at?: string
  updated_at?: string
}
