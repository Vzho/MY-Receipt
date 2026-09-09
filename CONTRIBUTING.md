# 贡献指南

感谢参与 ResitAI 的开发。提交代码前请先通读本文。

---

## 1. 开始之前

- 阅读 [`README.md`](README.md)、[`docs/architecture.md`](docs/architecture.md)、[`docs/invoice-requirements.md`](docs/invoice-requirements.md)。
- 本地完成一次完整的端到端验证：上传一张 `发票示例/` 下的 JPG 收据 → 进入审核页点击 "智能解析" → 数学校验通过 → 导出 Excel。
- 安装依赖：`npm install`。

---

## 2. 分支策略

```text
main                         # 稳定分支，所有发布都从这里 cut
├── feature/<topic>          # 新功能
├── fix/<issue>              # Bug 修复
├── refactor/<scope>         # 重构
├── docs/<topic>             # 文档
└── chore/<scope>            # 构建 / CI / 依赖升级
```

- 长生命周期分支允许通过 `git worktree` 维护（`.worktrees/` 已在 `.gitignore` 中）。
- 不允许直接 push `main`，全部走 PR。

---

## 3. 提交信息（Conventional Commits）

```
<type>(<scope>): <description>

<optional body>

<optional footer>
```

| type | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构，不改变外部行为 |
| `perf` | 性能优化 |
| `docs` | 文档 |
| `test` | 测试新增 / 修改 |
| `chore` | 构建脚本、工具、依赖 |
| `ci` | CI / CD 配置 |
| `style` | 纯格式（不要混入逻辑变更） |

示例：

```text
feat(edge-function): add DeepSeek vision polish quota
fix(frontend): keep review drawer open after sync
docs(api): document parse-receipt smart mode
```

> ⚠️ 不允许在提交中包含 AI 工具自动生成的 `Co-Authored-By` 行。

---

## 4. 代码风格

遵循 `~/.claude/rules/typescript/coding-style.md` 与 `common/coding-style.md`，核心要点：

- **类型安全**：导出 API 与 React 组件 props 必须显式类型；避免 `any`，对未知输入使用 `unknown` 并显式收窄。
- **不可变更新**：禁止就地修改对象 / 数组，使用扩展运算符。
- **错误处理**：所有 async 调用必须 `try/catch`，错误向用户层面通过 `showToast` + `addNotification` 暴露；严禁静默吞错。
- **文件规模**：单文件 ≤ 800 行；单函数 ≤ 50 行；嵌套 ≤ 4 层。
- **命名**：组件 PascalCase、hooks `useXxx`、常量 UPPER_SNAKE_CASE、文件 camelCase。
- **i18n**：所有面向用户的字符串必须走 `src/App.tsx` 的 `I18N` 字典（中 / 英 / 马 三语全覆盖），禁止硬编码中文 / 英文。
- **金额计算**：统一走 `src/lib/receiptMath.ts`，不要在组件里手写 `Math.round(x * 100) / 100`。
- **不引入 `console.log`**：调试日志请改用 `console.error` 报告异常或临时本地调试，提交前清理。

---

## 5. 测试要求

- 使用 Vitest（`npm test` / `npm run test:watch`）。
- 新增业务逻辑必须配套单元测试；新增 UI 组件至少补一个渲染 / 行为测试（参考 `src/test/ReceiptTable.test.tsx`）。
- 修复 bug 时必须先写复现测试（红→绿），证明缺陷已被锁定。
- 不要 mock 真实的 Supabase / OCR 接口的成功响应；仅 mock 网络层。

PR 合并前必须满足：

```bash
npm test     # ✅ 全绿
npm run lint # ✅ 无 type 错误
npm run build # ✅ 可构建
```

---

## 6. 安全审查清单

提交前自检：

- [ ] 没有把任何 OCR / AI / service role key / 真实数据库连接串写入前端代码、`.env.example` 或 `vite.config.ts`。
- [ ] `.env.local` / `.dev.vars` 未被加入版本控制。
- [ ] 用户输入未通过 `dangerouslySetInnerHTML` 渲染。
- [ ] 新的 Edge Function 路径必须校验 Authorization JWT 并确认 `receipt_id` 归属当前用户。
- [ ] 新增 Supabase 表已启用 RLS 并写好 policy。
- [ ] Storage 路径仍然遵循 `{user_id}/{receipt_id}/...`。
- [ ] 新增 OCR / AI 调用必须通过 `consume_ocr_quota` 扣减额度。

---

## 7. Pull Request 流程

1. 从 `main` 拉出分支，命名遵循 [§2](#2-分支策略)。
2. 本地完成开发 + 测试 + 文档同步。
3. `git rebase main` 解决冲突。
4. 推送并打开 PR，使用以下模板：

```markdown
## Summary
- 简述这次改动解决了什么问题、为什么这么做
- 关联 issue / 用户反馈

## Implementation
- 列出关键代码变化（按文件）
- 列出新增 / 修改的数据库字段、Edge Function secrets、I18N key

## Test Plan
- [ ] npm test
- [ ] npm run lint
- [ ] npm run build
- [ ] 端到端：上传 JPG → 智能解析 → 审核 → 导出
- [ ] 端到端：上传 PDF（多页）→ 每页独立 receipt → 智能解析
- [ ] 端到端：上传重复文件 → DuplicateDialog 出现
- [ ] i18n：切换 中 / 英 / 马 三种语言，所有新文本都已翻译

## Screenshots
（UI 改动必须附）
```

5. CI 全绿后请求 review。
6. 至少 1 位 reviewer 通过后 squash merge 到 `main`。

---

## 8. 文档同步

当下列内容变化时，必须同步更新对应文档：

| 变化 | 必须更新 |
|---|---|
| 新增 / 修改数据库字段 | `docs/SUPABASE_SCHEMA.sql` + 对应 `ADD_*.sql` 增量脚本 + `docs/architecture.md` |
| 新增 / 修改 Edge Function 行为或 secret | `docs/api.md` + `docs/deployment.md` + `supabase/functions/README.md` |
| 新增 Vite / npm script | `README.md` 第 3 节 + `docs/local-development.md` |
| 新增 / 修改马来西亚业务规则 | `docs/invoice-requirements.md` |
| 发布版本 | `CHANGELOG.md`（保留 Keep-a-Changelog 风格） |

---

## 9. 报告问题

提交 issue 时请附：

- 复现步骤（含上传的样本收据，如不便分享请用 `发票示例/` 中的图片）
- 浏览器 / OS 版本
- `npm run build` 的输出（如构建失败）
- Supabase Edge Function 日志（如 OCR / AI 失败）
- 期望行为与实际行为对比

---

## 10. 行为准则

请保持友善、专业。审查代码时聚焦事实与建议，而非个人。
