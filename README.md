# ResitAI

> 马来西亚英文收据 / 发票智能识别、会计审核与异常管理系统。

本仓库是 **React 19 + Vite 6 + Tailwind 4 + Supabase（Auth / Storage / Postgres / Edge Functions）+ 腾讯云 OCR + Qwen VL + DeepSeek** 的生产化工程，目标用户是需要把马来西亚商户收据 / E-invoice 批量录入到会计台账的财税岗。

---

## 1. 功能特性

- **批量上传**：JPG / PNG / PDF（PDF 自动按页拆分为独立收据），单文件 ≤ 20MB，最多 20 张并发上传。
- **重复检测**：SHA-256 文件哈希 + 图像感知哈希 + 商户 / 发票号 / 日期 / 金额业务字段相似度评分，上传前阻挡疑似重复。
- **智能解析**：
  - `ocr` 模式：腾讯云 `GeneralBasicOCR` + 规则引擎 + 可选 DeepSeek V4 文本修复。
  - `vision` 模式：用户在审核页手动触发，调用 Qwen VL 直接读图；可选 DeepSeek 校验。
  - `smart` 模式：Qwen VL + DeepSeek 强制双重校验（默认链路）。
  - `repair` 模式：基于已有 `raw_ocr` 文本走 DeepSeek 重抽取。
- **审核工作流**：Processing Panel / Warning Panel / 字段配置 / 自定义单据类型 / Soft Delete（删除库可恢复或永久删除）/ E-invoice 字段块。
- **马来西亚专项规则**：BUDI MADANI RON95 燃油补贴拆分（不把政府补贴当折扣）、E-invoice TIN / SST No / UUID / Validation Link / QR Payload 提取、`dd/MM/yyyy` 日期容错。
- **导出**：`Receipts` + `Items` 两张表的 `.xlsx`（ExcelJS），列跟随用户字段偏好。
- **多语言 / 多主题 / 多币种**：中文 / English / Melayu，浅深色 + 三品牌色，RM / SGD / USD / ¥。
- **配额硬限制**：每用户每月腾讯 OCR ≤ 900 次、DeepSeek ≤ 500 次、Qwen VL ≤ 100 次，全部由 Postgres `consume_ocr_quota` RPC 强制执行。
- **应用内消息中心 + 可选音效**：本地保留最近 100 条，未读标记，点击直达对应收据。

---

## 2. 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19、TypeScript 5.8、Vite 6、Tailwind 4、Motion、Lucide、pdfjs-dist |
| 状态 / 数据 | `@supabase/supabase-js`、Supabase Realtime 订阅 |
| 导出 | ExcelJS |
| 测试 | Vitest + JSDOM（`src/test/*` 共 27 个测试文件，已覆盖 lib 与多个组件） |
| 后端 | Supabase Auth、Postgres、Storage（私有 bucket `receipts`）、Edge Function（Deno） |
| AI / OCR | 腾讯云 OCR、阿里云 DashScope（Qwen VL）、DeepSeek V4、可选 OpenAI Vision |

---

## 3. 快速开始

### 3.1 前置条件

- Node.js ≥ 18
- npm ≥ 9
- 已开通的 Supabase 项目（含 Auth、Postgres、Storage）

### 3.2 安装与运行

```bash
npm install
cp .env.example .env.local   # 填入 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev                  # 监听 http://127.0.0.1:5173
```

> ⚠️ `.env.local` 已在 `.gitignore` 中。**严禁** 把任何 OCR / AI / service role 密钥写入前端环境变量；它们只能放在 Supabase Edge Function Secrets。

### 3.3 数据库初始化

在 Supabase SQL Editor 依次执行：

1. `docs/SUPABASE_SCHEMA.sql` — 全量表结构、索引、RLS、`consume_ocr_quota` RPC、Storage policy。
2. 如果线上库是旧版，执行增量脚本：
   - `docs/ADD_IMAGE_PREPROCESSING.sql`
   - `docs/ADD_RESITAI_V0_3_FIELDS.sql`
   - `docs/ADD_TENCENT_OCR_QUOTA.sql`

### 3.4 部署 Edge Function

```bash
supabase functions deploy parse-receipt
supabase secrets set OCR_PROVIDER=tencent TENCENT_SECRET_ID=... TENCENT_SECRET_KEY=...
supabase secrets set AI_REPAIR_PROVIDER=deepseek DEEPSEEK_API_KEY=...
supabase secrets set VISION_PROVIDER=qwen DASHSCOPE_API_KEY=...
```

完整密钥清单见 [`docs/deployment.md`](docs/deployment.md)。

### 3.5 验证命令

```bash
npm test            # vitest，运行所有单元 / 集成测试
npm run lint        # tsc --noEmit 类型检查
npm run build       # 生产构建，输出到 dist/
npm run preview     # 本地预览 dist/
```

---

## 4. 项目结构

```text
malaixiya/
├── src/
│   ├── App.tsx                     # 主壳组件 + I18N 字典（2700+ 行，待拆分）
│   ├── main.tsx                    # 入口
│   ├── index.css                   # Tailwind 4 入口
│   ├── components/                 # AppShell / UploadDropzone / ReceiptTable /
│   │                               # ReceiptReviewDrawer / ProcessingPanel /
│   │                               # WarningPanel / DeletedReceiptList / ...
│   ├── lib/                        # 业务工具（receiptApi / receiptMath /
│   │                               # warningRules / exportExcel / duplicateDetection /
│   │                               # imagePreprocess / pdfPreprocess / qrPayload / ...）
│   ├── types/                      # Receipt / Warning / FieldConfig / DocumentType
│   └── test/                       # Vitest 测试套件（27 个文件）
├── supabase/
│   └── functions/
│       └── parse-receipt/
│           ├── index.ts            # 多管线 OCR / AI 调度 + 标准化
│           ├── prompt.ts           # 系统 / 用户 / 修复 / 视觉润色 提示词
│           └── cors.ts             # CORS 头（生产应限制 origin）
├── docs/
│   ├── architecture.md             # 系统架构与状态机
│   ├── api.md                      # Edge Function & Supabase SDK API
│   ├── deployment.md               # 部署与密钥管理
│   ├── local-development.md        # 本地开发指南
│   ├── invoice-requirements.md     # 马来西亚发票业务规则
│   ├── SUPABASE_SCHEMA.sql         # 数据库 DDL + RLS + RPC
│   ├── ADD_*.sql                   # 增量迁移
│   ├── RECEIPT_FIELD_DISPLAY_STRATEGY.md
│   └── RESITAI_V0_3_DEVELOPMENT_PLAN.md
├── 发票示例/                       # 测试用真实马来西亚收据图片（git 未跟踪）
├── public/                         # 静态资源
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── README.md
├── CONTRIBUTING.md
├── CHANGELOG.md
├── AUDIT_REPORT.md                 # 历史代码审计报告
├── .env.example
└── .gitignore
```

---

## 5. 发票业务说明（摘要）

| 主题 | 简述 | 详细 |
|---|---|---|
| 税种 | SST（Sales & Service Tax）作为单一 `tax` 字段，E-invoice 同时填 `extra_fields.tax_amount` | [invoice-requirements.md](docs/invoice-requirements.md) |
| 发票编号 | OCR 自动抽取 `invoice_no`，E-invoice 还会保留 `invoice_uuid` 与 LHDN `validation_link` | — |
| 金额精度 | 全部按 2 位小数四舍五入；明细数量保留 3 位（燃油升数） | `src/lib/receiptMath.ts` |
| 舍入规则 | 字段 `rounding` 独立保存，进入 `calculatedTotal` 公式 | — |
| 燃油补贴 | `subsidy_details.government_subsidy` 与 `payable_total` 独立，不作为普通折扣抵扣 | `supabase/functions/parse-receipt/prompt.ts` |
| 日期格式 | 默认 `dd/MM/yyyy`，规范化后存为 ISO `YYYY-MM-DD` | `supabase/functions/parse-receipt/index.ts:inferDate` |
| 多语言 | UI 中 / 英 / 马来文；商品名保留原始可见语言（不翻译） | `src/App.tsx` I18N 字典 |

---

## 6. 安全与密钥

前端**只允许**出现这两个变量，且必须配合启用了 RLS 的 Supabase 项目：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

所有 OCR / AI 密钥、`SUPABASE_SERVICE_ROLE_KEY` 必须放在 **Supabase Edge Function Secrets**。详见 [`docs/deployment.md`](docs/deployment.md) 第 3 节与 [`docs/architecture.md`](docs/architecture.md) 第 2 节。

---

## 7. 贡献

提交代码前请阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md)。提交信息使用 Conventional Commits（`feat:` / `fix:` / `docs:` / `chore:` / `refactor:` / `test:` / `perf:` / `ci:`）。

---

## 8. 版本

当前主线已完成 v0.3 审核效率改造（Processing Panel / Warning Panel / Soft Delete / Duplicate Detection / 字段配置 / 自定义单据类型 / E-invoice / 消息中心 / PDF 多页 / 列表分页）。完整变更见 [`CHANGELOG.md`](CHANGELOG.md)。
