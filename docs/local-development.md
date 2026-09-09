# 本地开发指南

> 适用对象：要在本地启动 ResitAI 进行调试 / 编码 / 测试的工程师。

---

## 1. 系统要求

| 工具 | 最低版本 | 用途 |
|---|---|---|
| Node.js | 18.x（推荐 LTS 20） | 前端构建、Vite Dev Server |
| npm | 9.x | 包管理 |
| Git | 2.30+ | 版本控制 |
| Supabase CLI | 最新版（可选） | 本地启动 Postgres / Edge Function |
| Deno | 1.45+（可选） | 直接调试 Edge Function |

Windows 用户：本项目仓库根目录路径含中文（`发票示例/`），请确保终端编码为 UTF-8（PowerShell 7+ 默认即可）。

---

## 2. 一次性初始化

```bash
git clone <repo-url> malaixiya
cd malaixiya
npm install
cp .env.example .env.local
```

编辑 `.env.local`，填入 Supabase 项目凭证：

```bash
VITE_SUPABASE_URL="https://<your-project-ref>.supabase.co"
VITE_SUPABASE_ANON_KEY="<anon-key>"
```

> ⚠️ 仅限这两个变量进入前端。OCR / DeepSeek / Qwen / OpenAI 等私钥**只能**存在 Supabase Edge Function Secrets，不能进入 `.env.local`，也不能在 `vite.config.ts` 中 `define`。

---

## 3. 启动开发服务器

```bash
npm run dev
```

默认监听 `http://127.0.0.1:5173`（在 `package.json` 中显式绑定，规避默认 5173 端口冲突）。

如果在 AI Studio / 共享环境中编辑，可设置 `DISABLE_HMR=true` 关闭 HMR 与文件监听：

```bash
DISABLE_HMR=true npm run dev
```

---

## 4. 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动 Vite Dev Server |
| `npm run build` | 生产构建，输出到 `dist/` |
| `npm run preview` | 本地预览构建产物 |
| `npm run lint` | `tsc --noEmit` 全量类型检查 |
| `npm test` | 一次性运行 Vitest |
| `npm run test:watch` | Vitest watch 模式 |
| `npm run clean` | 删除 `dist/` 与 `server.js` |

---

## 5. 数据库初始化

### 5.1 全新 Supabase 项目

在 Supabase Dashboard → SQL Editor 执行：

```sql
-- 全量 schema
\i docs/SUPABASE_SCHEMA.sql
```

或者直接粘贴 `docs/SUPABASE_SCHEMA.sql` 内容。

### 5.2 已有的旧 schema 增量升级

按顺序执行：

1. `docs/ADD_IMAGE_PREPROCESSING.sql` — 新增 `processed_file_path` / `image_processing`。
2. `docs/ADD_RESITAI_V0_3_FIELDS.sql` — 新增 v0.3 字段、审计表、字段偏好表、自定义单据类型表。
3. `docs/ADD_TENCENT_OCR_QUOTA.sql` — 新增 `ocr_usage_monthly` + `consume_ocr_quota` RPC。

### 5.3 Storage Bucket

`docs/SUPABASE_SCHEMA.sql` 末尾会自动 upsert 一个私有 bucket `receipts` 并附 RLS policy。如手动创建，确保：

- `public = false`
- 对象路径必须以 `{user_id}/{receipt_id}/...` 开头，否则 RLS 拒绝读写。

---

## 6. Edge Function 本地调试

### 6.1 启动本地 Supabase 与函数

```bash
supabase start
supabase functions serve parse-receipt \
  --env-file supabase/.env.local \
  --no-verify-jwt   # 调试时可跳过 JWT；生产部署不要带这个标志
```

`supabase/.env.local`（不要 commit）至少应包含：

```env
OCR_PROVIDER=tencent
TENCENT_SECRET_ID=...
TENCENT_SECRET_KEY=...
AI_REPAIR_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
VISION_PROVIDER=qwen
DASHSCOPE_API_KEY=...
DEEPSEEK_MODEL=deepseek-v4-flash
QWEN_VL_MODEL=qwen3.6-plus
```

### 6.2 测试调用

```bash
curl -X POST http://localhost:54321/functions/v1/parse-receipt \
  -H "Authorization: Bearer <local-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"receipt_id": "<uuid>", "mode": "smart"}'
```

或在前端审核页点击 “智能解析”，Supabase JS SDK 会自动带上当前会话的 JWT。

---

## 7. 测试

测试框架是 **Vitest + JSDOM**。`src/test/` 已经覆盖：

- 业务工具：`receiptMath`、`warningRules`、`exportExcel`、`normalizeReceipt`、`duplicateDetection`、`receiptApi`、`fieldConfig`、`receiptState`、`receiptDisplay`、`pdfPreprocess`、`qrPayload`、`appNotifications`、`notificationSound`、`reuploadTemplate`、`syncSelection`、`documentTypes`。
- UI 组件：`ReceiptTable`、`ReceiptCropModal`、`ReceiptReviewDrawerI18n`、`SettingsModal`、`Sidebar`、`SoftSelect`、`UploadQueue`、`NotificationCenter`、`DialogListI18n`、`ProcessingWarningI18n`、`App.initialState`。

新增功能必须同步加测试。运行：

```bash
npm test               # 一次性
npm run test:watch     # 改动文件即重跑
```

调试单个文件：

```bash
npx vitest run src/test/receiptMath.test.ts
npx vitest src/test/ReceiptTable.test.tsx
```

---

## 8. 本地真实数据回归

`发票示例/` 与 `public/` 中保留了多张真实马来西亚收据（Shell BUDI MADANI、99 Speedmart、F&B 收据、E-invoice 截图）。建议在 PR 合并前手动跑一次端到端：

1. 启动 `npm run dev`，登录测试账号。
2. 拖入 `发票示例/` 下一张 JPG → 审核页 → 智能解析 → 校对 → Sync。
3. 拖入一张 PDF → 验证按页拆分 → 每页独立 receipt。
4. 重复上传同一文件 → 验证 DuplicateDialog。
5. 删除一条 → 进入 “已删除收据” → 恢复 → 验证回到列表。
6. 在设置中切换 中 / 英 / 马 三语 + 浅 / 深色 → 验证所有审核 UI 标签已翻译。
7. 选择多条 → 导出 Excel → 验证 `Receipts` 与 `Items` sheet 数据完整。

---

## 9. 常见排障

| 现象 | 原因 / 解决 |
|---|---|
| 启动后白屏 | `.env.local` 没填 / 没重启 Vite。也可能是 Supabase URL 拼错。打开 DevTools Console 查看红色错误。 |
| `Failed to load Supabase receipts` | RLS 未启用或 anon key 无权限。检查 `docs/SUPABASE_SCHEMA.sql` 已执行。 |
| Edge Function 返回 500 + `Missing TENCENT_SECRET_ID` | Supabase Function Secrets 未设置。运行 `supabase secrets list` 排查。 |
| 智能解析无反应 | 检查浏览器 Network 中 `/functions/v1/parse-receipt` 的状态码与响应；同时在 Supabase Dashboard → Edge Functions → Logs 查看。 |
| 数学校验提示 `Calculated total mismatch` | 优先核对小计 / 折扣 / 税 / 服务费 / 舍入；对于燃油补贴，确认 `subsidy_details.government_subsidy` 不为 0 且未被填到 `discount`。 |
| TypeScript 报 `vite/client` 找不到 | 运行 `npm install` 重装依赖；确保 `tsconfig.json` 中 `types: ["vite/client"]`。 |
| PDF 上传无反应 | `pdfjs-dist` worker 加载失败。检查浏览器 Console 中是否存在跨源问题；Dev 模式应正常工作。 |

---

## 10. 推荐 IDE 设置

- VSCode + 扩展：ESLint（如未来引入）、Tailwind CSS IntelliSense、Vitest Explorer、Deno（仅打开 `supabase/functions/` 时启用）。
- 编辑 `supabase/functions/` 下文件时，VSCode 工作区应禁用 Node TypeScript Server 的解析（项目根 `tsconfig.json` 已 `exclude: ["supabase/functions"]`），改用 Deno Language Server。

---

## 11. Git Worktree（可选）

长生命周期分支建议用 `git worktree`：

```bash
git worktree add ../malaixiya-v0.4 -b feature/v0.4
cd ../malaixiya-v0.4
npm install
```

仓库根的 `.worktrees/` 已在 `.gitignore` 中，可放置临时工作树而不污染主仓库。
