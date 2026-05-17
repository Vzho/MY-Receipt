# ResitAI v0.3 开发计划：审核效率与异常管理

> 目的：把用户反馈沉淀成可执行的开发基线。后续编码、数据库迁移、Edge Function 调整、前端拆分和文档更新都以本文为准。

## 0. 实施状态对照

更新时间：2026-05-16。

状态定义：

- `已实现`：当前工作树已有代码、类型、文档或测试覆盖，功能链路基本可用。
- `部分实现`：已有主要代码，但仍缺少完整接入、独立 UI/流程、线上迁移/部署或端到端验证。
- `未实现`：当前工作树没有对应能力，仍需要后续开发。

### 0.1 总览

| 范围 | 当前状态 | 依据 / 备注 |
| --- | --- | --- |
| BRAND-01 品牌统一 | 已实现 | 页面、Auth、README、导出文件名已使用 `ResitAI`。 |
| UX-01/UX-02 列表快速复制 | 已实现 | 列表商户名和 Invoice No. 已接入 clipboard 与 toast。 |
| STATE-01 Processing panel | 已实现 | `processing_stage`、`ProcessingPanel`、上传/OCR/AI/完成/失败阶段已接入；Excel 导出时显示 `Generating Excel...`。 |
| WARN-01 Warning panel | 已实现 | `warningRules.ts`、`WarningPanel`、warning badge、Edge Function warnings 与单元测试已接入。 |
| DEL-01/DEL-02 删除库 | 已实现 | soft delete、Rejected tab、恢复、永久删除、删除原因、已删除记录详情页已接入。 |
| DUP-01 基础去重 | 已实现 | 上传前 SHA-256 文件 hash 检测、`DuplicateDialog`、业务字段重复评分、`duplicate_of`/`duplicate_score` 与 warning 已接入。 |
| DOC-01 自定义单据类型 | 已实现 | `custom_document_types`、类型/API/UI 输入与复用已接入；`doc_type` 保持标准值，`custom_doc_type` 保存自定义值。 |
| CFG-01 字段提取配置 | 已实现 | 字段 registry、配置表、配置面板、持久化、审核页隐藏和 Edge Function enabled field list 已接入。 |
| CFG-02 导出字段跟随配置 | 已实现 | Excel summary sheet 按 `fieldPreferences` 生成列；软删除记录默认不导出。 |
| EI-01 E-invoice | 已实现 | `E-invoice` 标准类型、`extra_fields`、UI 专属块、导出列、E-invoice schema profile、prompt 分支和图片内 QR payload 本地解码已接入。 |
| Excel 格式 | 已实现 | `Receipts` 一张发票一行，`Items` 一条明细一行。 |
| PDF 多页上传 | 已实现 | PDF 会按页渲染为 JPEG OCR 输入，每页创建独立 receipt，并通过 `image_processing.source_page` / `source_page_count` 保留页码来源。 |
| 数据库文档 | 已实现 | `docs/SUPABASE_SCHEMA.sql` 和 `docs/ADD_RESITAI_V0_3_FIELDS.sql` 已包含 v0.3 字段、表、索引和 RLS。 |
| 线上 Supabase 迁移 / Edge Function 部署 | 已实现 | 已对项目 `ashivkbfutnodyglaqgj` 应用 v0.3 migration，并部署新版 `parse-receipt` Edge Function。 |
| P1 批量操作增强 | 已实现 | 批量选择、批量导出、批量删除、批量恢复、批量永久删除、批量标记 synced 已接入。 |
| P2 高级增强 | 已实现 | OCR 文本相似度、图片感知 hash、客户重交模板、快捷键、列表分页、Supabase Realtime 刷新入口已接入。 |

### 0.2 当前已验证

- `npm test`：通过。
- `npm run lint`：通过。
- `npm run build`：通过。
- `npm audit --audit-level=moderate`：通过，0 vulnerabilities。
- Edge Function 部署：`parse-receipt` 已部署到 Supabase 项目 `ashivkbfutnodyglaqgj`。
- Supabase advisors：已修复 `set_updated_at` search_path、RLS policy role 和缺失外键索引；剩余 `auth_leaked_password_protection` 需在 Supabase Auth Dashboard 开启，unused index 为新索引/低流量信息项。
- 浏览器烟测：本地 `http://127.0.0.1:5175/` 可加载，未再复现 `Failed to load Supabase receipts`。

### 0.3 后续未完成清单

1. Supabase Dashboard 手动项：按需开启 Auth leaked password protection。

## 1. 版本目标

ResitAI v0.3 的目标不是继续堆 OCR 能力，而是把当前系统从“能识别收据”推进到“能高效完成会计审核工作流”。

核心工作流：

```text
上传收据
  -> 图片预处理
  -> OCR/AI 解析
  -> 处理状态可见
  -> 异常集中提示
  -> 人工审校
  -> 去重判断
  -> 删除/退回管理
  -> 按需导出
```

本版本优先解决：

- 列表页基础字段快速复制。
- 审核时的 warning panel 和 processing panel。
- soft delete / rejected receipts 工作流。
- duplicate detection，避免重复上传和重复消耗 AI/OCR 额度。
- 字段提取配置和自定义单据类型的基础能力。
- 为 E-invoice 识别预留数据模型、UI 和 prompt 扩展点。

## 2. 用户需求整理

### 2.1 已认可并保留

- UI 风格：简洁、干净、好看。
- 当前布局方向：保留。
- 按钮设计：保留当前风格。
- 三栏审校布局：原图 + SKU 编辑 + 财务引擎，继续作为核心审核体验。
- 数学引擎：保留即时差异提示，用于防止人工误操作。

### 2.2 新增用户需求

| ID | 需求 | 说明 |
| --- | --- | --- |
| UX-01 | 商户名称可复制 | 列表页直接复制，不必进入详情 |
| UX-02 | Invoice No. 可复制 | 列表页直接复制，不必进入详情 |
| DOC-01 | 单据类型可自定义 | 选择 Custom 后可填写并保存新类型 |
| CFG-01 | 字段提取可配置 | 用户勾选需要 OCR/AI 提取和展示的字段 |
| CFG-02 | 导出字段跟随配置 | 未勾选字段不显示、不审核、不导出 |
| DEL-01 | 已删除收据库 | 删除后进入 rejected/deleted 区域 |
| DEL-02 | 删除原因记录 | 方便会计向客户说明为何需要重交照片 |
| DUP-01 | Duplicate detection | 避免重复上传同一张单据 |
| STATE-01 | Processing panel | 清晰显示 OCR/AI/Excel 处理阶段 |
| WARN-01 | Warning panel | 集中展示金额、置信度、模糊、OCR 失败等异常 |
| EI-01 | E-invoice 识别 | 支持马来西亚 E-invoice 专属字段 |
| BRAND-01 | 品牌统一为 ResitAI | 页面、文档、导出文件名、标题统一 |

## 3. 优先级

### P0 - 当前版本必须完成

1. ResitAI 品牌统一。（已实现）
2. 商户名称和 Invoice No. 一键复制。（已实现）
3. Processing panel。（已实现）
4. Warning panel。（已实现）
5. Rejected receipts / 删除库。（已实现）
6. 基础 duplicate detection。（已实现）
7. `App.tsx` 拆分，为后续功能降低风险。（已实现：`AppShell`、`Sidebar`、`ReceiptTable`、`UploadQueue`、`ReceiptDetailPanel`、`ReceiptReviewDrawer`、`SettingsModal` 已独立；补贴展示解析已移入 `subsidyDetails.ts`）

### P1 - 第二阶段完成

1. 自定义单据类型。（已实现）
2. 字段提取配置。（已实现）
3. 导出字段跟随配置。（已实现）
4. 批量操作增强：批量删除、批量恢复、批量导出、批量标记。（已实现）

### P2 - 后续增强

1. E-invoice 专项识别。（已实现：基础字段/UI/导出/prompt/schema profile/QR payload 解码）
2. 高级 duplicate detection：OCR 文本相似度、感知 hash、相似金额/日期/商户。（已实现）
3. 客户重交说明模板。（已实现）
4. 键盘快捷键。（已实现）
5. 分页、虚拟滚动或服务端分页。（已实现：审核队列表格分页）
6. Supabase Realtime 状态同步。（已实现：receipt 变更触发刷新）

## 4. 目标架构调整

### 4.1 前端模块拆分

当前 `App.tsx` 仍然过大。v0.3 开始必须逐步拆出功能边界，避免每次改动都影响全局。

建议结构：

```text
src/
  components/
    AppShell.tsx
    Sidebar.tsx
    UploadQueue.tsx
    ReceiptTable.tsx
    ReceiptDetailPanel.tsx
    ReceiptReviewDrawer.tsx
    SettingsModal.tsx
    ProcessingPanel.tsx
    WarningPanel.tsx
    DeletedReceiptList.tsx
    DuplicateDialog.tsx
    FieldConfigPanel.tsx
    CustomDocTypeInput.tsx
  lib/
    receiptApi.ts
    duplicateDetection.ts
    warningRules.ts
    fieldConfig.ts
    documentTypes.ts
    exportExcel.ts
  types/
    receipt.ts
    warning.ts
    fieldConfig.ts
    documentType.ts
```

拆分原则：

- 保持 UI 视觉不变，先搬结构，不重做设计。
- 先抽无状态展示组件，再抽业务逻辑。
- 每次拆分后必须跑测试、类型检查和构建。
- 不在拆分 PR 中混入大功能变更。

### 4.2 数据模型新增字段

当前 v0.3 schema 已在 `receipts` 表增加：

```sql
deleted_at timestamptz
deleted_reason text
deleted_note text
duplicate_of uuid
duplicate_score numeric
warnings jsonb
processing_stage text
custom_doc_type text
file_hash text
extra_fields jsonb
```

当前 v0.3 schema 已新增表：

```sql
custom_document_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique(user_id, name)
);

user_field_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  field_key text not null,
  enabled boolean not null default true,
  export_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, field_key)
);
```

## 5. 分阶段开发计划

## Phase 1 - 品牌统一与结构拆分

目标：先让主线结构变清晰，为后续功能开发降低风险。

### 任务

- [x] 将产品名称统一为 `ResitAI`。
- [x] 更新页面标题、登录页、README、部署文档和导出文件名前缀。
- [x] 拆出 `AppShell`。
- [x] 拆出 `Sidebar`。
- [x] 拆出 `ReceiptTable`。
- [x] 拆出 `UploadQueue`。
- [x] 拆出 `ReceiptDetailPanel` 的外层容器。
- [x] 拆出 `ReceiptReviewDrawer`，承载详情头部、图片预览、字段表单、SKU 明细、金额校验、E-invoice 和补贴展示。
- [x] 拆出 `SettingsModal`。
- [x] 保留当前三栏审校布局，不调整视觉风格。
- [x] 删除或更新仍指向旧品牌、旧原型、Google Sheets、Gemini 前端调用的文案。

### 验收标准

- [x] UI 和当前主线视觉一致。
- [x] `App.tsx` 深拆已完成，主文件保留应用级状态、数据加载、上传、解析、删除、导出和弹窗编排。
- [x] `npm test` 通过。
- [x] `npm run lint` 通过。
- [x] `npm run build` 通过。
- [x] `npm audit --audit-level=moderate` 为 0 vulnerabilities。

### 文档更新

- [x] `README.md`
- [x] `docs/ARCHITECTURE.md`
- [x] `docs/development.md`

## Phase 2 - 快速复制与状态面板

目标：提升列表页和审核流程效率。

### 任务

- [x] 在列表页商户名旁增加复制按钮。
- [x] 在列表页 Invoice No. 旁增加复制按钮。
- [x] 复制成功后显示 toast。
- [x] 新增 `ProcessingPanel`。
- [x] 标准化处理阶段。
  - [x] `Uploaded`
  - [x] `OCR scanning...`
  - [x] `AI extracting fields...`
  - [x] `Generating preview...`
  - [x] `Ready for review`
  - [x] `OCR failed`
- [x] 将现有 upload list / polling 文案接入 `ProcessingPanel`。
- [x] 导出 Excel 时显示 `Generating Excel...`。

### 验收标准

- [x] 用户无需进入详情页即可复制商户名。
- [x] 用户无需进入详情页即可复制 Invoice No.。
- [x] 上传和解析过程有明确阶段。
- [x] Excel 导出时有明确反馈。

### 文档更新

- [x] `docs/development.md`
- [x] `docs/api.md` 如 processing stage 字段进入数据模型。

## Phase 3 - Warning Panel

目标：让用户快速知道单据是否可信、哪里需要人工处理。

### 任务

- [x] 新增 `types/warning.ts`。
- [x] 新增 `lib/warningRules.ts`。
- [x] 新增 `WarningPanel`。
- [x] 在详情页顶部展示 warning panel。
- [x] 列表页展示 warning badge。
- [x] 支持 warning 类型：
  - [x] `total_mismatch`
  - [x] `amount_mismatch`
  - [x] `low_confidence_field`
  - [x] `blurry_image`
  - [x] `ocr_failed`
  - [x] `missing_required_field`
  - [x] `possible_duplicate`
- [x] 将金额差异、置信度和 OCR 错误接入规则。
- [x] 保存 warnings 到 `receipts.warnings`。

### 验收标准

- [x] 总额不匹配时显示 warning。（当前文案可能不是字面 `Total mismatch detected`，但语义已覆盖）
- [x] 低置信度字段显示 warning。（当前文案可能不是字面 `Low confidence field`，但语义已覆盖）
- [x] OCR 失败显示 `OCR failed`。
- [x] warning 不阻止用户保存，但会明确提示。

### 文档更新

- [x] `docs/SUPABASE_SCHEMA.sql`
- [x] 新增增量 SQL：`docs/ADD_RESITAI_V0_3_FIELDS.sql`
- [x] `docs/api.md`

## Phase 4 - Rejected Receipts / 删除库

目标：删除不等于丢失。会计可以用删除库追踪客户需要重交的单据。

### 任务

- [x] 数据库增加 `deleted_at`、`deleted_reason`、`deleted_note`。
- [x] 删除按钮改为 soft delete。
- [x] 删除前弹窗选择原因。
- [x] 增加 rejected/deleted tab。
- [x] 新增 `DeletedReceiptList`。
- [x] 支持恢复。
- [x] 支持永久删除。
- [x] 删除原因枚举：
  - [x] blurry_image
  - [x] duplicate
  - [x] amount_not_clear
  - [x] not_receipt
  - [x] missing_required_info
  - [x] other

### 验收标准

- [x] 删除后记录不会从数据库消失。
- [x] Rejected tab 能看到已删除记录。
- [x] 可以恢复记录。
- [x] 可以永久删除记录及对应 Storage 文件。
- [x] 删除原因能在列表和详情中看到。

### 文档更新

- [x] `docs/SUPABASE_SCHEMA.sql`
- [x] `docs/api.md`
- [x] `docs/development.md`

## Phase 5 - Duplicate Detection

目标：避免重复上传、重复解析、重复消耗 OCR/AI 额度。

### 任务

- [x] 新增 `lib/duplicateDetection.ts`。
- [x] 上传前计算文件 SHA-256 hash。
- [x] 将 `file_hash` 写入 `receipts`。
- [x] 上传前查询同 user 下相同 `file_hash`。
- [x] 解析后用以下组合做二次检测：
  - [x] merchant_name + invoice_no
  - [x] merchant_name + date + grand_total
  - [x] invoice_no + date
- [x] 新增 `DuplicateDialog`。
- [x] 命中重复时允许用户：
  - [x] 取消上传
  - [x] 继续上传
  - [x] 打开已有单据
- [x] 保存 `duplicate_of` 和 `duplicate_score`。

### 验收标准

- [x] 同一图片再次上传会提示重复。
- [x] 相同 invoice no. 会提示重复。
- [x] 用户可以覆盖提示继续上传。
- [x] 重复信息可以在 warning panel 看到。

### 文档更新

- [x] `docs/SUPABASE_SCHEMA.sql`
- [x] `docs/api.md`
- [x] `docs/development.md`

## Phase 6 - 自定义单据类型

目标：支持用户业务中固定类型之外的单据。

### 任务

- [x] 新增 `types/documentType.ts`。
- [x] 新增 `lib/documentTypes.ts`。
- [x] 新增 `custom_document_types` 表。
- [x] 单据类型选项增加 `Custom`。
- [x] 选择 `Custom` 后显示输入框。
- [x] 自定义类型保存后可复用。
- [x] `doc_type` 保持标准枚举，用户自定义值写入 `custom_doc_type`。

### 验收标准

- [x] 用户可以新增自定义单据类型。
- [x] 自定义类型会出现在后续选择列表。
- [x] Excel 导出包含自定义类型。
- [x] Edge Function 不因自定义类型破坏标准解析。

### 文档更新

- [x] `docs/SUPABASE_SCHEMA.sql`
- [x] `docs/RECEIPT_FIELD_DISPLAY_STRATEGY.md`
- [x] `docs/api.md`

## Phase 7 - 字段提取配置

目标：用户只提取、显示和导出自己需要的字段。

### 任务

- [x] 新增 `types/fieldConfig.ts`。
- [x] 新增 `lib/fieldConfig.ts`。
- [x] 新增 `FieldConfigPanel`。
- [x] 新增 `user_field_preferences` 表。
- [x] 定义字段 registry：
  - [x] merchant_name
  - [x] invoice_no
  - [x] date
  - [x] time
  - [x] payment_method
  - [x] subtotal
  - [x] tax
  - [x] service_charge
  - [x] grand_total
  - [x] company_reg_no
  - [x] tin_no
  - [x] sst_no
  - [x] subsidy_details
  - [x] items
- [x] 审核页根据配置隐藏字段。
- [x] Excel 导出根据配置生成列。
- [x] Edge Function prompt 接收 enabled field list，减少不必要输出。

### 验收标准

- [x] 取消付款方式后，审核页不显示付款方式。
- [x] 取消付款方式后，Excel 不导出付款方式。
- [x] 字段配置刷新后仍保留。
- [x] 未勾选字段不会影响必需的金额校验字段。

### 文档更新

- [x] `docs/RECEIPT_FIELD_DISPLAY_STRATEGY.md`
- [x] `docs/api.md`
- [x] `docs/development.md`

## Phase 8 - E-invoice 识别

目标：支持马来西亚 E-invoice，不污染普通 receipt 审核流程。

### 任务

- [x] 单据类型增加 `E-invoice`。
- [x] 新增 e-invoice 字段类型。
- [x] 新增 e-invoice prompt/schema profile。
- [x] Edge Function 根据 doc type / mode 使用 e-invoice schema profile。
- [x] 上传图片时尝试本地解码 QR payload，并传给 Edge Function。
- [x] UI 针对 e-invoice 显示专属字段：
  - [x] supplier_name
  - [x] buyer_name
  - [x] supplier_tin
  - [x] buyer_tin
  - [x] sst_no
  - [x] invoice_uuid
  - [x] validation_link
  - [x] qr_payload
  - [x] invoice_type
  - [x] tax_amount
- [x] Excel 导出支持 e-invoice 字段。

### 验收标准

- [x] 普通 receipt 不显示 e-invoice 专属字段。
- [x] E-invoice 能进入专属审核布局。（基础专属字段块已接入）
- [x] E-invoice 导出包含专属字段。
- [x] Edge Function 对 E-invoice 有独立 prompt/schema profile。
- [x] 图片内 QR payload 会写入 `extra_fields.qr_payload`。

### 文档更新

- [x] `docs/RECEIPT_FIELD_DISPLAY_STRATEGY.md`
- [x] `docs/api.md`
- [x] `docs/ARCHITECTURE.md`

## 6. 测试计划

当前工作树最终 gate 状态：

- [x] 单元测试：新增 lib 规则必须有测试。
- [x] 类型检查：`npm run lint`。
- [x] 生产构建：`npm run build`。
- [x] 依赖审计：`npm audit --audit-level=moderate`。

建议新增测试文件：

```text
src/test/warningRules.test.ts
src/test/duplicateDetection.test.ts
src/test/fieldConfig.test.ts
src/test/documentTypes.test.ts
src/test/exportExcel.test.ts
src/test/qrPayload.test.ts
```

## 7. 开发顺序建议

推荐顺序：

1. Phase 1：品牌统一与结构拆分。
2. Phase 2：快速复制与状态面板。
3. Phase 3：Warning Panel。
4. Phase 4：Rejected Receipts。
5. Phase 5：Duplicate Detection。
6. Phase 6：自定义单据类型。
7. Phase 7：字段配置。
8. Phase 8：E-invoice。

理由：

- 先拆结构，降低后续改动风险。
- 状态和 warning 是审核效率的基础。
- 删除库和重复检测直接解决会计沟通和成本浪费问题。
- 字段配置和 E-invoice 涉及数据模型与 prompt，放在基础稳定后做。

## 8. 后续编码规则

- 每个 Phase 单独提交，不把大重构和业务功能混在一起。
- 每个数据库变更同时更新主 schema 和增量 SQL。
- 每个新业务规则必须有单元测试。
- 前端不可出现私密 AI/OCR key。
- Edge Function 变更必须同步更新 `docs/api.md`。
- UI 文案变更必须同步检查中文、英文、马来文词典。
- 任何删除行为默认 soft delete，除非用户明确选择永久删除。
