# 开发者快速参考

> 本文件保留作为速查；完整的环境准备 / 调试 / 测试请阅读 [local-development.md](local-development.md)。

---

## 速查命令

| 目的 | 命令 |
|---|---|
| 启动 dev server | `npm run dev` |
| 类型检查 | `npm run lint` |
| 单元 / 集成测试 | `npm test` / `npm run test:watch` |
| 生产构建 | `npm run build` |
| 部署 Edge Function | `supabase functions deploy parse-receipt` |
| 设置 Edge Function 密钥 | `supabase secrets set KEY=value` |

---

## 项目地图

```text
src/
├── App.tsx                         # 主壳 + I18N 字典（中 / 英 / 马，2700+ 行）
├── main.tsx                        # 入口
├── index.css                       # Tailwind 4 入口
├── components/                     # AppShell / UploadDropzone / ReceiptTable /
│                                   # ReceiptReviewDrawer / ProcessingPanel /
│                                   # WarningPanel / DeletedReceiptList / ...
├── lib/                            # receiptApi / receiptMath / warningRules /
│                                   # exportExcel / duplicateDetection /
│                                   # imagePreprocess / pdfPreprocess / qrPayload /
│                                   # subsidyDetails / appNotifications / ...
├── types/                          # receipt / warning / fieldConfig / documentType
└── test/                           # Vitest 测试套件（27 个文件）

supabase/
└── functions/parse-receipt/
    ├── index.ts                    # 多管线 OCR / AI 调度 + 标准化
    ├── prompt.ts                   # 系统 / 用户 / 修复 / 视觉润色 提示词
    └── cors.ts                     # CORS 头（生产应限制 origin）

docs/
├── architecture.md                 # 架构 + 状态机
├── api.md                          # Edge Function + Supabase SDK API
├── deployment.md                   # 部署与密钥管理
├── local-development.md            # 本地开发详细指南
├── invoice-requirements.md         # 马来西亚发票业务规则
├── SUPABASE_SCHEMA.sql             # 数据库 DDL + RLS + RPC
├── ADD_IMAGE_PREPROCESSING.sql     # 增量：裁剪 / pHash 字段
├── ADD_RESITAI_V0_3_FIELDS.sql     # 增量：v0.3 字段 / 表
├── ADD_TENCENT_OCR_QUOTA.sql       # 增量：consume_ocr_quota RPC
├── RECEIPT_FIELD_DISPLAY_STRATEGY.md
└── RESITAI_V0_3_DEVELOPMENT_PLAN.md
```

---

## 添加新发票识别规则

发票识别管线在 `supabase/functions/parse-receipt/index.ts` 与 `prompt.ts`。新增规则的典型步骤：

1. **更新 Prompt**（`prompt.ts`）：在 `SYSTEM_PROMPT` 或 `buildImageUserPrompt` / `buildTextRepairPrompt` 内追加规则。
2. **新增推断函数**（`index.ts`）：参考 `inferMerchantName / inferInvoiceNo / inferGrandTotal` 的写法，从 OCR `lines` 中提取字段。
3. **更新规范化**：在 `normalizeReceipt` / `normalizeExtraFields` 中加入新字段；如需放入数据库列，同步扩展 `SUPABASE_SCHEMA.sql` + `ADD_*.sql`。
4. **更新前端类型**：`src/types/receipt.ts`、相关组件 props、I18N 字典。
5. **更新导出**：`src/lib/exportExcel.ts` 在 `buildReceiptColumns` 中添加列。
6. **写测试**：`src/test/*` 增加单元测试；推荐先写测试再实现。

---

## 添加新 AI / OCR 供应商

1. 在 `prompt.ts` 确认 prompt 兼容；如需图片 / 文本差异化处理，新建 `buildXxxPrompt`。
2. 在 `index.ts` 新建 `runXxxOCR` / `runXxxVision`；调用前必须先 `consume_ocr_quota`。
3. 在 `serve()` 主路由中根据 `parseMode` / `OCR_PROVIDER` / `VISION_PROVIDER` 分发。
4. 在 `.env.example` 注释段落中加入对应密钥（不要写真值）。
5. 在 `docs/deployment.md` 与 `docs/api.md` 中追加。

---

## 代码风格

详见 [`CONTRIBUTING.md`](../CONTRIBUTING.md) 第 4 节。要点：

- TypeScript 显式类型；避免 `any`。
- 不可变更新；金额计算走 `receiptMath`。
- 所有面向用户的字符串走 `I18N` 字典。
- 单文件 ≤ 800 行；函数 ≤ 50 行。
- Conventional Commits。

---

## 真实数据回归

在 `发票示例/` 与 `public/` 目录内有多张真实马来西亚收据用于本地回归。详见 [`local-development.md`](local-development.md) 第 8 节。
