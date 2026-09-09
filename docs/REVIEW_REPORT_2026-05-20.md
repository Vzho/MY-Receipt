# ResitAI（马来西亚发票项目）全面审查报告

> 审查日期：2026-05-20  
> 审查范围：根目录 + `src/` + `supabase/functions/` + `docs/` + 配置文件  
> 主分支：`main`  
> 当前分支：`codex-receipt-smart-parse-flow`  
> 审查方式：本地文件系统静态审查（未触发任何外部部署 / 远程仓库写操作）

---

## 目录

- [a) 项目概述](#a-项目概述)
- [b) 代码审查（按严重程度分级）](#b-代码审查按严重程度分级)
  - [CRITICAL](#-critical)
  - [HIGH](#-high)
  - [MEDIUM](#-medium)
  - [LOW](#-low)
  - [业务规则](#业务规则方面)
- [c) 文档更新与新建清单](#c-文档更新与新建清单)
- [d) 建议删除的文件列表](#d-建议删除的文件列表)
- [e) 整体风险与改进建议](#e-整体风险与改进建议)
- [交付物总览](#交付物总览)

---

## a) 项目概述

**ResitAI** 是面向马来西亚财税岗的收据 / 发票 / E-invoice 智能识别与会计审核 SaaS。当前实现已是 v0.3：

- **架构**：纯静态 React/Vite 前端 + Supabase（Auth / Storage / Postgres / Edge Functions）+ 多源 OCR/AI（腾讯云 OCR + Qwen VL + DeepSeek V4，可选 OpenAI Vision）。
- **核心数据**：`receipts` / `receipt_items` / `custom_document_types` / `user_field_preferences` / `ocr_usage_monthly`，全部启用 RLS；`consume_ocr_quota` RPC 做月度配额硬限制。
- **业务亮点**：
  - BUDI MADANI 燃油补贴拆分（不把政府补贴当折扣）
  - E-invoice `extra_fields`（supplier / buyer TIN、UUID、validation_link、QR payload）
  - 文件 hash + 感知 hash + 业务字段评分的多信号去重
  - Soft Delete + 删除库（恢复 / 永久删除）
  - 字段可见性 / 导出配置
  - PDF 按页拆分（每页独立 receipt）
  - 应用内消息中心（含可选音效）
- **测试**：Vitest + JSDOM，覆盖 27 个测试文件（lib 业务工具 + 多个 UI 组件 + i18n）。
- **启动方式**：
  ```bash
  npm install
  npm run dev           # http://127.0.0.1:5173
  npm run build         # 输出 dist/
  supabase functions deploy parse-receipt
  ```

---

## b) 代码审查（按严重程度分级）

### 🔴 CRITICAL

| ID | 位置 | 问题 | 建议 |
|---|---|---|---|
| **C-01** | `.env.local`（仓库根，被 .gitignore 忽略但文件存在） | 含**真实** Supabase URL `ashivkbfutnodyglaqgj` 与 anon publishable key `sb_publishable_osKlszOhHGpph_Fx_0VPGQ_Fd39qP92` | 立即在 Supabase Dashboard 轮换 anon key；同时检查 `git log --all --full-history -- .env.local` 确认从未提交。本地保留可用，仅用于开发。 |
| **C-02** | `C:UsersVZAppDataLocalTempopencodefull_diff.txt`（仓库根） | 一份 83KB 临时 diff，被工具误存到工作目录。Windows 上文件名是字面量，包含完整本机路径 | **手动删除该文件**（不要 commit） |
| **C-03** | `supabase/functions/parse-receipt/cors.ts` | `Access-Control-Allow-Origin: '*'` 生产暴露 | 改为 `Deno.env.get('CORS_ORIGIN') ?? 'https://<your-prod-host>'`，并在 `.env.example` 标注 `CORS_ORIGIN`（已更新） |

### 🟠 HIGH

| ID | 位置 | 问题 | 建议 |
|---|---|---|---|
| **H-01** | `src/App.tsx`（2788 行） | 超级组件，含 1800+ 行内联 I18N 字典 + 主交互逻辑。导致切换主题 / 模板时约 0.5s re-render 卡顿（已在 `code-review-incremental-20260518.md` P1#9 记录） | 拆分：`src/i18n/{zh,en,ms}.ts`、`src/hooks/useReceiptUploadFlow.ts`、`src/hooks/useNotifications.ts`、`src/pages/Audit.tsx`、`src/pages/Deleted.tsx`；用 `React.memo` 包裹 `ReceiptTable` / `Sidebar` / `UploadQueue` / `ReceiptReviewDrawer` |
| **H-02** | `src/App.tsx` 全文 | 大量 `any`（`useState<any[]>`、`useRef<Set<any>>`、`(payload as any)` 等）；TypeScript 类型安全失效 | 引入 `Receipt` / `ReceiptDraft` / `UploadItem` / `Config` 类型替换 |
| **H-03** | `supabase/functions/parse-receipt/index.ts` 全文 | 大量 `client: any`、`receipt: any`；Deno 侧无类型 | 引入 `interface ReceiptRow`、`type SupabaseServiceClient = SupabaseClient<Database>`；用 `supabase gen types typescript` 生成 Database 类型 |
| **H-04** | `src/components/ReceiptReviewDrawer.tsx` 第 373 / 377 / 557 行（增量 review 报告 P0#1~#3） | `TIN No` / `SST ID` / `E-invoice` 硬编码英文 | 全部改走 `labels`，并在 I18N 字典三种语言中补 `tinLabel` / `sstIdLabel` / `einvoiceSectionLabel` |
| **H-05** | `src/lib/receiptApi.ts:isMissingSchemaError` | 用错误码 + message regex 兜底，导致很多写路径都有 fallback 分支。降级时把 `E-invoice` 强制改成 `Invoice`，存在 silent data loss 风险 | 文档化迁移先决条件；当 v0.3 schema 已 100% 上线后移除 fallback；保留时应在 fallback 命中时上报 Sentry / 日志 |

### 🟡 MEDIUM

| ID | 位置 | 问题 | 建议 |
|---|---|---|---|
| **M-01** | `index.html` | `<html lang="en">` 但应用默认中文 | 改为 `lang="zh-CN"`，或在前端切换语言后动态写入 `document.documentElement.lang` |
| **M-02** | `vite.config.ts:5` | 注释 `Do not modifyâfile watching is disabled` 含乱码 | 修复为 `Do not modify — file watching is disabled` |
| **M-03** | `supabase/functions/parse-receipt/index.ts:1414-1432` | `levenshteinDistance` 用 `splice` 替换 `previous` 数组；大文本时 O(n*m) 退化 | 改用 `previous = current.slice()`，或对长 OCR 文本截断到 1KB 再比较 |
| **M-04** | `supabase/functions/parse-receipt/index.ts:1472-1479` | `blobToBase64` 字符串拼接，10MB 图片时性能不佳 | 改用 `encodeBase64(uint8)` 来自 `https://deno.land/std/encoding/base64.ts` |
| **M-05** | `src/lib/exportExcel.ts:97` | `(receipt as Receipt & { tin_no?: unknown }).tin_no`：`Receipt` 类型上没有 `tin_no`，靠类型断言绕过 | 把 `tin_no` 加入 `EInvoiceExtraFields`，统一从 `extra_fields.tin_no` 取 |
| **M-06** | `supabase/functions/parse-receipt/index.ts:inferCompanyRegNo` 等 | SSM 注册号、SST No 无格式校验；马来西亚已知格式见 `docs/invoice-requirements.md` §3、§15 | 增加正则白名单；解析失败时打 warning 而非空值 |
| **M-07** | `src/lib/receiptApi.ts:206-208` | `void invokeReceiptParser(...).catch(...)` 处理后台解析失败时只 `console.error`，不会出现在消息中心 | 改成 `addNotification({...error})` 通道，或抛给主 effect |
| **M-08** | `docs/api.md` 第 240 行（旧错误码段） | `OCR free monthly quota reached` 不再是 thrown error，现已变成 `parseManualDraftWithNote` 静默回退 | 同步更新错误码表 |
| **M-09** | `src/App.tsx:60-71` | 全局常量 `INDUSTRIES`、`DOC_TYPES`、`TAGS_OPTIONS` 与 Edge Function 的 `validCategories` / `validDocTypes` / `validTags` 分别独立定义，存在漂移风险 | 抽到 `src/types/receipt.ts` 单一来源，Edge Function 通过手工同步注释引用 |

### 🟢 LOW

| ID | 位置 | 问题 | 建议 |
|---|---|---|---|
| **L-01** | `package.json:10` | `clean` 用 `rm -rf`，Windows 上需要 Git Bash | 改用 `rimraf` 或 `node -e "fs.rmSync('dist', {recursive: true, force: true})"` |
| **L-02** | 多处 `console.error(...)` | 生产应接 Sentry / logflare 等监控 | 引入 `@sentry/react` |
| **L-03** | `index.html` 没有 favicon、`<meta description>`、Open Graph | 加上以便分享 / SEO |
| **L-04** | `src/components/ProcessingPanel.tsx` 60-64（review 报告 P3#15） | Stage icon 使用 emoji，部分桌面 / 老 Android 渲染不一 | 改用 lucide 图标 |
| **L-05** | 多张 `src/test/*.tsx` | 直接 `screen.getByText('...')` 断言英 / 中文文案，紧耦合 i18n | 改用 `data-testid` |

### 业务规则方面

| 项 | 状态 | 备注 |
|---|---|---|
| 金额精度（2 位小数 / `numeric(10,2)`） | ✅ | 统一 `Math.round(value * 100) / 100` |
| 舍入 `rounding` 独立字段 | ✅ | 参与 `calculateReceiptMath` 公式 |
| 燃油补贴 `subsidy_details.government_subsidy` / `payable_total` 独立 | ✅ | 不污染 `discount` |
| 多语言（中 / 英 / 马） | ✅ | 商品名在 prompt 中明令 "不翻译" |
| E-invoice `extra_fields`（supplier/buyer TIN、UUID、validation_link、QR） | ✅ | 已落库 |
| 日期 `dd/MM/yyyy` → ISO 标准化 | ✅ | `inferDate` |
| SST 多税率（6 / 8 / 10）拆分 | ⚠️ | 当前仅单一 `tax` 字段 |
| SSM 公司注册号 / SST No 格式严校验 | ⚠️ | H-04 / M-06 |
| LHDN MyInvois Open API 真实验证 | ⚠️ | 仅保存 `validation_link`，未发起验证请求 |

---

## c) 文档更新与新建清单

| 文件 | 操作 | 关键变更 |
|---|---|---|
| `README.md` | **更新（重写）** | 新增 v0.3 功能特性、技术栈表、快速开始（dev 端口 5173、数据库初始化顺序）、项目结构对照、马来西亚发票业务摘要、安全与密钥说明、链接到 CONTRIBUTING |
| `CONTRIBUTING.md` | **新建** | 分支策略、Conventional Commits、TypeScript / i18n / 金额计算风格、测试要求、安全检查清单、PR 模板、文档同步清单 |
| `CHANGELOG.md` | **更新** | 新增完整 v0.3.x 段（按 Keep a Changelog 风格），补全：Processing/Warning/SoftDelete/Duplicate/字段配置/自定义单据类型/E-invoice/消息中心/PDF 多页/列表分页/Realtime 等 |
| `docs/architecture.md` | **更新（重写）** | 含 ASCII 部署拓扑、详细流程编号、完整模块层（含 v0.3 组件 / lib / types）、状态机两表、字段约定、关键设计决策、CORS 收紧提示 |
| `docs/api.md` | 保留 | 已较完整；可后续补全错误码（M-08） |
| `docs/deployment.md` | 保留 | 已完整；建议加入 `CORS_ORIGIN` 段（C-03） |
| `docs/development.md` | **更新（精简）** | 大幅精简为速查；纠正了原文里 "尚未建立测试体系"、"`src/services/receiptApi.ts`"（实际在 `src/lib/`）等过时描述 |
| `docs/local-development.md` | **新建** | 系统要求、Windows 中文路径注意事项、`.env.local` 模板、`npm run dev` 端口、Edge Function 本地调试、Vitest 文件总览、真实数据回归 7 步流程、常见排障表、Git Worktree 用法 |
| `docs/invoice-requirements.md` | **新建** | 马来西亚发票业务规则与代码映射：单据类型枚举、税种、商户身份字段（含 SSM / TIN）、发票编号 / E-invoice UUID / Validation Link / QR Payload、金额公式、舍入、燃油补贴 JSON 结构、日期格式、分类策略、E-invoice 字段对照 LHDN MyInvois、配额、归档与软删除、对应法规、字段-代码映射速查、后续待办 |
| `docs/SUPABASE_SCHEMA.sql` | 保留 | 已和当前代码一致 |
| `docs/ADD_*.sql` | 保留 | 增量脚本完整 |
| `.env.example` | **更新** | 增加大段注释：明确列出 OCR/AI/SERVICE_ROLE 密钥**不能**进入前端；列出 Edge Function 全部应配置的 secret 名称（注释形式，不放真值），含 `CORS_ORIGIN` |
| `metadata.json` | **更新** | 名称改为 `ResitAI`，描述去掉 "Gemini AI" 字样，反映真实技术栈 |

---

## d) 建议删除的文件列表

| 路径 | 类型 | 删除理由 |
|---|---|---|
| `C:UsersVZAppDataLocalTempopencodefull_diff.txt` | 临时文件 | 文件名包含 Windows 路径字面量（83KB diff dump），明显是工具误存到工作目录；非项目资产 — **建议立即手动删除** |
| `AUDIT_REPORT.md` | 过时审计报告 | 审计日期 2026-05-16，描述的问题大多已修（前端 Gemini key 已移除、Excel 已用 ExcelJS、tax 字段已统一、v0.3 已落地、测试体系已建立）。建议归档到 `docs/audits/2026-05-16-audit.md`，或直接删除 |
| `code-review-incremental-20260518.md` | 过时增量 review | P0 中的 4 项已部分修复（`d81fbc9 fix: localize audit UI labels`），剩余项应作为 issue 跟踪；建议归档到 `docs/audits/` |
| `dist/` | 构建产物 | 已在 `.gitignore`；本地存在无害，但 PR 时确认未误提交 |
| `.obsidian/` | IDE 残留 | 已在 `.gitignore`；本地存在不影响他人 |
| `.worktrees/` | git worktree 实例 | 已在 `.gitignore` |
| `supabase/.temp/` | Supabase CLI 缓存 | 已在 `.gitignore`，本地保留即可 |
| `马来西亚英文收据智能识别系统.pdf` / `.md` | 早期需求文档 | 历史价值高（项目起源），但应迁到 `docs/legacy/` 子目录以区分 |
| `发票示例/*.jpg / *.jpeg` | 测试样本 | **不要删** — 但因为是马来西亚真实收据（含商户名 / 金额 / 注册号），考虑是否需要打码后再公开；当前未跟踪到 git 是好事 |

> **不自动执行删除**，仅给出清单；请人工确认后处理。

---

## e) 整体风险与改进建议

### 高优先级（建议本周完成）

1. **轮换 Supabase anon key**（C-01）— 仓库本机存在过明文，按零信任原则视为已泄露。
2. **删除根目录的临时 diff 文件**（C-02）— 立即手动删除。
3. **收紧 CORS**（C-03）— 上线前必须改为白名单域名，并在 Edge Function secrets 中配置 `CORS_ORIGIN`。
4. **修 i18n 硬编码**（H-04 / 增量 review P0）— 影响中文 / 马来文用户的可见质量。
5. **审查 `isMissingSchemaError` 路径**（H-05）— 确认线上库已完成 v0.3 迁移后移除 fallback；保留期间应上报命中事件。

### 中优先级（下个迭代）

6. **拆分 App.tsx**（H-01）— 把 I18N 字典抽到 `src/i18n/`、把上传 / 通知 / 解析流程抽到自定义 hooks；用 `React.memo` 包裹高频组件解决主题切换卡顿。
7. **逐步移除 `any`**（H-02 / H-03）— 优先 `src/App.tsx` 与 Edge Function，使用 `supabase gen types typescript` 生成 Database 类型。
8. **业务规则严校验**（M-06）— SSM、SST No、马来西亚电话格式；解析失败给 warning 而非空值。
9. **后台解析失败可视化**（M-07）— 进入消息中心而非只打 `console.error`。
10. **同步常量到单一来源**（M-09）— 避免前后端枚举漂移。

### 低优先级（长期改进）

11. **真正接入 LHDN MyInvois Open API** 验证 `validation_link`（业务价值高，但需要 LHDN 开发者账号）。
12. **支持 SST 多税率拆分**（6 / 8 / 10），按服务类目区分。
13. **引入 ESLint / Prettier / husky pre-commit**（当前只有 `tsc --noEmit`）。
14. **接入 Sentry 等错误监控**（L-02）。
15. **CI/CD**：GitHub Actions 跑 `npm test` + `npm run lint` + `npm run build` + 部署 Edge Function。
16. **E2E 测试**：用 Playwright 跑上传 → 智能解析 → 导出全链路。
17. **样本图片合规化**：`发票示例/` 中真实收据若要公开需对商户信息打码。
18. **将历史审计 / 计划文档归档**到 `docs/audits/` 与 `docs/legacy/`，让根目录与 `docs/` 更清爽。

---

## 交付物总览

### 本轮已修改 / 新建的文件

```text
README.md                          (重写)
CONTRIBUTING.md                    (新建)
CHANGELOG.md                       (补 v0.3.x)
docs/architecture.md               (重写)
docs/development.md                (重写 — 精简为速查)
docs/local-development.md          (新建)
docs/invoice-requirements.md       (新建)
.env.example                       (新增 Edge Function 密钥注释段)
metadata.json                      (去除 Gemini 描述)
docs/REVIEW_REPORT_2026-05-20.md   (本文件)
```

### 完成的任务清单

```text
[✓] 扫描并理解项目结构
[✓] 代码审查与业务规则审查
[✓] 更新与新增文档
[✓] 编写最终审查报告
```

### 未自动执行的动作

- 未删除任何文件
- 未执行任何 git commit / push
- 未对 Supabase / 外部服务发起请求
- 未修改 `.env.local`（含真实 anon key）— 请按 e) §1 自行轮换
