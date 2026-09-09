# ResitAI 客户安装信息表

安装前请准备下面信息。

## 一、账号

| 项目 | 填写 |
| --- | --- |
| GitHub 账号邮箱 |  |
| Supabase 账号邮箱 |  |
| OpenAI Platform 账号邮箱 |  |
| Cloudflare 账号邮箱 |  |

注册链接：

- GitHub：https://github.com/signup
- Supabase：https://supabase.com/dashboard
- OpenAI Platform：https://platform.openai.com/
- Cloudflare：https://dash.cloudflare.com/

本安装包对应源码：

```text
https://github.com/Vzho/MY-Receipt/tree/codex/openai-only-deploy
```

## 二、Supabase 信息

| 项目 | 填写 |
| --- | --- |
| Project ref |  |
| Project URL |  |
| Publishable key / anon public key |  |

查找位置：

- Project URL：Supabase 项目的 `Connect` 对话框，或 `Integrations -> Data API`。
- Publishable key：`Project Settings -> API Keys -> Publishable and secret API keys`。
- 旧版 anon public key：`Project Settings -> API Keys -> Legacy anon, service_role API keys`。

Project URL 正确示例：

```text
https://wkopucjwjwpcrsqzenic.supabase.co
```

不要填：

```text
https://wkopucjwjwpcrsqzenic.supabase.co/rest/v1/
```

## 三、Cloudflare 信息

| 项目 | 填写 |
| --- | --- |
| Pages 项目名 |  |
| Pages 部署地址 |  |
| 自定义域名，如果有 |  |

## 四、OpenAI API Key

不要把 OpenAI API Key 写在这个表里。

安装时现场输入即可。

如果必须记录，请只记录在客户自己的密码管理器中。

## 五、源码获取方式

二选一：

```text
[ ] 使用 GitHub git clone
[ ] 使用 GitHub Download ZIP
```

GitHub 仓库地址：

```text
https://github.com/Vzho/MY-Receipt.git
```

部署分支：

```text
codex/openai-only-deploy
```

如果正式生产使用 `main`，这里改成：

```text
main
```
