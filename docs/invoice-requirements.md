# 马来西亚发票业务规则

> 本文件定义 ResitAI 在处理马来西亚收据 / 发票 / E-invoice 时遵循的业务规则，并把每条规则映射到代码实现位置。新增字段或业务规则时必须同步本文档与 [docs/SUPABASE_SCHEMA.sql](SUPABASE_SCHEMA.sql)、[supabase/functions/parse-receipt/prompt.ts](../supabase/functions/parse-receipt/prompt.ts)。

---

## 1. 单据类型

`receipts.doc_type` 是受约束枚举，值必须落在：

| 值 | 中文 | 适用场景 |
|---|---|---|
| `Receipt` | 收据 | 一般 cash bill / official receipt |
| `Invoice` | 发票 | 商业发票（非 LHDN E-invoice） |
| `Credit Note` | 贷项通知单 | 退款 / 调整 |
| `Expense` | 费用单 | 内部报销凭证 |
| `E-invoice` | 马来西亚电子发票 | LHDN MyInvois 生成的发票（含 UUID + 验证链接） |

用户自定义类型保存在 `custom_doc_type`（字符串），不污染枚举。

**代码：**
- 枚举常量：`src/types/receipt.ts` 第 3 行
- 数据库约束：`docs/SUPABASE_SCHEMA.sql` 第 29 行
- Edge Function 校验：`supabase/functions/parse-receipt/index.ts` 第 8 行 `validDocTypes`

---

## 2. 税种

ResitAI 当前只跟踪 **SST（Sales & Service Tax）**，作为单一字段 `tax: numeric(10,2)`。

- 标准收据：`tax` 字段保存 SST 金额。
- E-invoice：`tax` 字段同时写入；`extra_fields.tax_amount` 保留 E-invoice 元数据原文（用于核对）。
- 暂未单独跟踪 GST、消费税或服务费税基（`service_charge` 仅记录 service charge 金额，不再单独拆 service tax）。

> ⚠️ 马来西亚 2024 年后 SST 税率以服务类目区分（6% / 8% / 10%），ResitAI 不在前端做税率校验，由人工审核确认。

**代码：**
- `tax`：`src/types/receipt.ts` `Receipt.tax`、`docs/SUPABASE_SCHEMA.sql` 第 33 行。
- E-invoice 税额：`src/types/receipt.ts` `EInvoiceExtraFields.tax_amount`。

---

## 3. 商户身份字段

| 字段 | 说明 | 提取来源 |
|---|---|---|
| `merchant_name` | 商户名称（票头） | OCR 第一段文本，过滤掉 `Receipt/Invoice/Welcome/Tel/Phone` 等噪声 |
| `company_reg_no` | SSM 公司注册号；新版格式为 `12 位数字` 或 `XXXXXXXX-X` | 正则匹配 `Reg No / Company No / Co. No / SSM` 标签 |
| `address` | 地址 | 商户名下方 4 行内，包含 `Jalan / Lorong / Taman / Mall / Plaza / 5 位邮编` 关键词 |
| `phone` | 电话 | 匹配 `+60XX-XXXXXXX` / `0XX-XXXXXXX` |
| `tin_no`（E-invoice） | LHDN 税号 | OCR / 视觉模型直接提取，存入 `extra_fields.supplier_tin` / `extra_fields.buyer_tin` |

**代码：**
- 商户名：`supabase/functions/parse-receipt/index.ts:inferMerchantName`
- 注册号：`supabase/functions/parse-receipt/index.ts:inferCompanyRegNo`
- 地址：`supabase/functions/parse-receipt/index.ts:inferAddress`
- 电话：`supabase/functions/parse-receipt/index.ts:inferPhone`

> 已知缺口：当前正则未严格校验 SSM 新格式 `YYYYxxxxxxxx`（13 位数字），后续可在 `inferCompanyRegNo` 内增加。SST No 同理无格式校验。

---

## 4. 发票编号规则

| 字段 | 说明 |
|---|---|
| `invoice_no` | 票面任意 invoice/receipt/bill/ref 编号；正则 `\b(invoice\|inv\|receipt\|rcpt\|bill\|transaction\|trans\|ref)\s*(no\|number\|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]{3,})\b` |
| `invoice_uuid`（E-invoice） | LHDN MyInvois 系统生成的 UUID（36 位带连字符） |
| `validation_link`（E-invoice） | LHDN 官方校验 URL，形如 `https://myinvois.hasil.gov.my/<uuid>` |
| `qr_payload`（E-invoice） | 上传时本地 `decodeQrPayloadFromImageFile` 解码出的 QR 内容 |

判定为 E-invoice 的条件（写入 `doc_type = 'E-invoice'`）：

1. 用户在前端手动选择，或
2. QR payload 命中关键词 `myinvois / e-invoice / invoice / lhdn / hasil / tax / uuid / validation`

**代码：**
- 普通 invoice：`supabase/functions/parse-receipt/index.ts:inferInvoiceNo`
- E-invoice 判定：`supabase/functions/parse-receipt/index.ts:looksLikeEInvoiceQrPayload`
- QR 解码：`src/lib/qrPayload.ts`

---

## 5. 金额与舍入

### 5.1 字段拆解

| 字段 | 含义 |
|---|---|
| `subtotal` | 明细汇总（票面 `Sub Total`） |
| `discount` | 折扣（绝对值，按需取负） |
| `tax` | SST |
| `service_charge` | 服务费 |
| `rounding` | 舍入差（马来西亚 1 sen 取消后产生的 +/- 调整） |
| `grand_total` | 票面最终总额 |
| `change` | 找零 |

### 5.2 计算公式

`src/lib/receiptMath.ts` 与 Edge Function `calculateReceiptMath` 共用同一公式：

```
baseTotal           = itemTotal > 0 ? itemTotal : subtotal
withoutDiscount     = baseTotal + tax + serviceCharge + rounding
withDiscount        = baseTotal - |discount| + tax + serviceCharge + rounding
discountAlreadyInc  = grandTotal 与 withoutDiscount 更接近，或 itemTotal == subtotal
effectiveDiscount   = discountAlreadyInc ? 0 : |discount|
calculatedTotal     = baseTotal - effectiveDiscount + tax + serviceCharge + rounding
```

> 设计意图：很多商户的 OCR `discount` 列其实已经被 `subtotal` 吸收，避免再扣一次。

### 5.3 精度

| 项 | 精度 |
|---|---|
| 金额 | 2 位小数（`Math.round(value * 100) / 100`） |
| 数量 | 3 位小数（用于燃油升数：`32.320 L`） |
| Confidence | 3 位小数（`numeric(4,3)`） |

### 5.4 校验阈值

- 明细 vs 小计差异 > 0.05 → `warning.total_mismatch`
- 计算总额 vs 票面总额差异 > 0.05 → `warning.amount_mismatch`
- 置信度 ∈ (0, 0.65) → `warning.low_confidence_field`

**代码：** `src/lib/warningRules.ts`、Edge Function `buildWarnings`。

---

## 6. 燃油补贴（BUDI MADANI RON95）

马来西亚 RON95 政府补贴价 RM 2.05/L，市价 ≈ RM 2.60/L。Shell 等加油站票据会同时打印 `gross_total`（按市价）和 `payable_total`（OPT，客户实付）。

ResitAI 规则：

1. `grand_total` 与 `subtotal` 保留**票面 gross 总额**，不要替换成 OPT。
2. 政府补贴金额放在 `subsidy_details.government_subsidy`，**不**写入 `discount`。
3. 客户实付（OPT / Outstanding Payment Total）放在 `subsidy_details.payable_total`。
4. 燃油明细单位强制 `unit = "L"`，`qty` 保留 3 位小数，`unit_price` 是 RM / L，`line_total` 是该明细的 gross 金额。

`subsidy_details` 标准结构（JSON）：

```json
{
  "program": "BUDI MADANI",
  "ref_no": "<票面参考号>",
  "pump_price": 2.60,
  "subsidy_price": 2.05,
  "subsidised_litre": 32.320,
  "government_subsidy": 34.20,
  "previous_balance_litre": null,
  "remaining_balance_litre": 167.68,
  "gross_total": 138.01,
  "payable_total": 103.81,
  "notes": null
}
```

**代码：**
- Prompt 规则：`supabase/functions/parse-receipt/prompt.ts:buildImageUserPrompt`
- 字段映射：`src/lib/subsidyDetails.ts`、`src/lib/exportExcel.ts:getSubsidyNumber/getSubsidyText`

---

## 7. 日期与时间

- 默认假定 `dd/MM/yyyy`（马来西亚通行格式）。
- 推断规则：若第一个 token > 12 即是日，第二个是月；若第二个 > 12 反向；否则按 dd/MM。
- 输出统一规范化为 ISO `YYYY-MM-DD` 存入 `date date`。
- 时间字段 `time text` 保留原文（`HH:mm` 或 `HH:mm AM/PM`）。

**代码：** `supabase/functions/parse-receipt/index.ts:inferDate` / `inferTime`。

---

## 8. 标签与分类

| 字段 | 枚举 |
|---|---|
| `category` | `Grocery` / `Fuel` / `F&B` / `Retail` / `Service` / `Other` |
| `tags[]` | `Business` / `Personal` / `Tax Deductible` / `Pending` |

`category` 由 Edge Function `inferCategory` 根据商户名 + OCR 文本关键字打标：

- 燃油：`shell / petronas / petron / bhp / caltex / fuel / ron95 / diesel`
- F&B：`restaurant / cafe / kopitiam / kitchen / food / burger / pizza / 海底捞`
- 杂货：`speedmart / grocery / mart / supermarket / tesco / lotus / aeon / giant / mydin / gardenia / chipsmore`
- 服务：`clinic / pharmacy / service / repair / laundry`
- 零售：`store / retail / shop / fashion / hardware`
- 兜底：`Other`

---

## 9. E-invoice 必填字段（LHDN MyInvois 对照）

| ResitAI 字段 | LHDN 字段 | 来源 |
|---|---|---|
| `extra_fields.supplier_name` | Supplier’s Name | 必填 |
| `extra_fields.supplier_tin` | Supplier’s TIN | 必填 |
| `extra_fields.buyer_name` | Buyer’s Name | 必填（B2B / B2G） |
| `extra_fields.buyer_tin` | Buyer’s TIN | 必填（B2B / B2G） |
| `extra_fields.sst_no` | SST Registration Number | 视商户而定 |
| `extra_fields.invoice_uuid` | UUID | 必填 |
| `extra_fields.invoice_type` | e-Invoice Type Code | 必填 |
| `extra_fields.tax_amount` | Total Tax Amount | 必填 |
| `extra_fields.validation_link` | LHDN Validation URL | 必填（含 QR） |
| `extra_fields.qr_payload` | QR raw payload | 上传时本地解码 |

**代码：**
- 类型：`src/types/receipt.ts:EInvoiceExtraFields`
- Edge Function schema：`supabase/functions/parse-receipt/prompt.ts:EINVOICE_EXTRA_FIELDS_SCHEMA`
- 持久化：`supabase/functions/parse-receipt/index.ts:normalizeExtraFields`

---

## 10. 多语言

- UI：中 / 英 / 马（`src/App.tsx` 内的 `I18N` 字典）。
- 商品名：**不翻译、不音译**，保留 OCR / 视觉模型读到的原始可见语言（含中文 / 英文 / 马来文混排）。
- 提示词内置约束：`prompt.ts:buildTextRepairPrompt` 第 168 行 `Preserve the exact visible language of item names`。

---

## 11. 配额（防止 API 盗刷）

每用户、每月、每 provider 硬上限：

| Provider | 默认上限 | 来源 |
|---|---|---|
| `tencent` | 900 次 | `OCR_FREE_MONTHLY_LIMIT` |
| `deepseek_v4` | 500 次 | `DEEPSEEK_MONTHLY_LIMIT`（含 text repair 与 vision polish） |
| `qwen_vl` | 100 次 | `VISION_MONTHLY_LIMIT` |
| `openai_vision` | 300 次 | `OPENAI_VISION_MONTHLY_LIMIT` |

由 Postgres RPC `consume_ocr_quota(user_id, period, provider, units, limit)` 在事务内原子扣减。Edge Function 在调用任何外部 OCR / AI 前必须先调用本 RPC。

**代码：** `supabase/functions/parse-receipt/index.ts:parseWithTencentOCR / parseWithVisionModel / parseWithOpenAIVision / maybePolishVisionWithDeepSeek` 全部调用了 `client.rpc('consume_ocr_quota', ...)`。

---

## 12. 数据归档与删除

- **软删除**：列表的 “删除” 写入 `deleted_at` / `deleted_reason` / `deleted_note`，记录进入 “已删除收据” tab。允许的原因值：
  - `blurry_image` / `duplicate` / `amount_not_clear` / `not_receipt` / `missing_required_info` / `other`
- **恢复**：清空 `deleted_*` 字段。
- **永久删除**：先清理 Storage 中 `file_path` + `processed_file_path`，再删除数据库行；不可恢复。

---

## 13. 与法规的对应（备查）

| 法规 / 规范 | ResitAI 对应实现 |
|---|---|
| LHDN MyInvois e-Invoice schema | `EInvoiceExtraFields` + E-invoice prompt profile |
| SST Act 2018（凭证留存 7 年） | 软删除 + Storage 不自动清理，永久删除需用户显式操作 |
| Personal Data Protection Act 2010 | 私有 Storage bucket + RLS，仅 owner 可访问；service role key 仅在 Edge Function 内使用 |
| Bank Negara 金额舍入（去除 1 sen） | `rounding` 字段独立保存，参与计算公式 |

---

## 14. 字段-代码映射速查

| 字段 | 类型 / 数据库 | 关键代码位置 |
|---|---|---|
| `merchant_name` | text | `App.tsx` 审核 UI、Edge Function `inferMerchantName`、Excel 导出 |
| `invoice_no` | text | `inferInvoiceNo`、列表搜索、Excel 列 |
| `date` | date (ISO) | `inferDate`、`receiptDisplay.ts` 渲染 |
| `subtotal/discount/tax/...` | numeric(10,2) | `receiptMath.ts`、`warningRules.ts`、Excel 列 |
| `subsidy_details` | jsonb | `subsidyDetails.ts`、`exportExcel.ts` |
| `extra_fields` | jsonb | `normalizeExtraFields`、`ReceiptReviewDrawer` E-invoice 块 |
| `processing_stage` | text | `ProcessingPanel.tsx` |
| `warnings` | jsonb | `warningRules.ts`、`WarningPanel.tsx` |
| `duplicate_of/duplicate_score` | uuid/numeric | `duplicateDetection.ts`、`DuplicateDialog.tsx` |
| `image_processing` | jsonb | `imagePreprocess.ts`、`pdfPreprocess.ts` |

---

## 15. 后续待办

1. SSM 公司注册号新版格式（13 位数字）的正则严格校验。
2. SST No 格式校验：`/^[A-Z]\d{2}-\d{4}-\d{8}$/`。
3. 多税率拆分（SST 6 / 8 / 10）：当前只有单一 `tax` 字段。
4. LHDN MyInvois Open API 验证：当前 `validation_link` 仅保存 URL，未真正发起验证请求。
5. 完整 LHDN e-Invoice Type Code 枚举（01 Invoice、02 Credit Note、03 Debit Note、04 Refund 等）落库。
