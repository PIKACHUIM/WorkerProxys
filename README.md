# WorkerProxys

基于 **Cloudflare Workers** 的反向代理服务合集，提供 GitHub、Docker Hub、DNS-over-HTTPS (DoH) 等常用服务的代理加速能力，专为中国大陆用户优化访问体验。

## 📦 项目结构

```
WorkerProxys/
├── github-proxy/       # GitHub 全站反向代理（子域名映射模式）
├── github-agent/       # GitHub 全站反向代理（前缀映射模式）
├── docker-proxy/       # Docker Hub / 多镜像仓库反向代理
├── dnspod-proxy/       # DNS-over-HTTPS (DoH) 代理服务
├── .gitignore
└── LICENSE             # AGPL-3.0
```

## 🚀 子项目说明

### 1. github-proxy

> Worker 名称：`gitpages-page`

基于**子域名映射**的 GitHub 全站反向代理。通过将 GitHub 各子域名映射到自定义域名的子域名上，实现对 GitHub 主站、API、Gist、Raw 内容、头像、Release 等资源的透明代理。

**核心特性：**
- 子域名映射：`raw.yourdomain.com` → `raw.githubusercontent.com`，`api.yourdomain.com` → `api.github.com` 等
- 自动替换 HTML 响应中的域名引用
- 透明代理 Cookie，支持 GitHub 登录
- 处理 301/302 重定向和 PJAX 请求
- 非中国大陆用户自动重定向到 GitHub 原站
- 屏蔽搜索引擎爬虫（`robots.txt`）

**域名映射表：**

| 代理子域名 | 原始域名 |
|---|---|
| `yourdomain.com` | `github.com` |
| `api.yourdomain.com` | `api.github.com` |
| `gist.yourdomain.com` | `gist.github.com` |
| `raw.yourdomain.com` | `raw.githubusercontent.com` |
| `assets.yourdomain.com` | `github.githubassets.com` |
| `avatars.yourdomain.com` | `avatars.githubusercontent.com` |
| `codeload.yourdomain.com` | `codeload.github.com` |
| `releases.yourdomain.com` | `github-releases.githubusercontent.com` |
| ... | ... |

---

### 2. github-agent

> Worker 名称：`ghproxys-work`

基于**前缀映射**的 GitHub 全站反向代理。采用 `{原始域名转换}-gh.yourdomain.com` 的命名规则，将原始域名中的 `.` 替换为 `-` 并添加 `-gh` 后缀作为子域名前缀。

**核心特性：**
- 前缀映射：`github-com-gh.yourdomain.com` → `github.com`
- 自动从域名白名单生成映射关系
- 支持 20+ 个 GitHub 相关域名的代理
- 文本响应中的域名自动替换
- 重定向 URL 自动改写
- 非中国大陆用户自动重定向到原站
- 修复嵌套 URL 问题（`latest-commit`、`tree-commit-info` 等路径）

**支持的域名白名单：**
`github.com`、`api.github.com`、`raw.githubusercontent.com`、`gist.githubusercontent.com`、`avatars.githubusercontent.com`、`github.githubassets.com`、`cdn.jsdelivr.net`、`npmjs.com` 等 20+ 个域名。

---

### 3. docker-proxy

> Worker 名称：`dockerfs-page`

Docker 容器镜像仓库的反向代理服务，支持 Docker Hub 及多个主流容器镜像仓库。

**核心特性：**
- 代理 Docker Hub（`registry-1.docker.io`）镜像拉取
- 支持多镜像仓库路由：Quay.io、GCR、GHCR、K8s Registry、Cloudsmith、NVCR 等
- 自动处理 Docker 认证流程（`auth.docker.io`）
- 支持 `docker pull` 命令直接使用
- 屏蔽恶意爬虫 UA
- CORS 跨域支持

**支持的镜像仓库：**

| 路由关键字 | 上游仓库 |
|---|---|
| `quay` | `quay.io` |
| `gcr` | `gcr.io` |
| `k8s-gcr` | `k8s.gcr.io` |
| `k8s` | `registry.k8s.io` |
| `ghcr` | `ghcr.io` |
| `cloudsmith` | `docker.cloudsmith.io` |
| `nvcr` | `nvcr.io` |
| 默认 | `registry-1.docker.io` |

---

### 4. dnspod-proxy

> Worker 名称：`dnsproxy-work`

高性能 DNS-over-HTTPS (DoH) 代理服务，支持多上游 DNS 提供商的负载均衡、故障转移和缓存。

**核心特性：**
- 支持 DoH 标准协议（RFC 8484）
- 多上游 DNS 提供商负载均衡（加权轮询）
- 内置缓存机制（默认 TTL 5 分钟）
- 自动健康检查与故障转移
- 提供 Web 落地页

**支持的上游 DNS 提供商：**

| 提供商 | 类型 | 权重 |
|---|---|---|
| Cloudflare | 通用 DNS | 20 |
| Google | 通用 DNS | 15 |
| Quad9 | 通用 DNS | 15 |
| OpenDNS | 通用 DNS | 10 |
| AdGuard | 广告过滤 | 10 |
| ControlD | 广告过滤 | 10 |
| Mullvad | 广告过滤 | 10 |
| NextDNS | 广告过滤 | 10 |
| DNSPod | 国内 DNS | 10 |

---

## 🛠️ 技术栈

- **运行时**：[Cloudflare Workers](https://workers.cloudflare.com/)
- **开发工具**：[Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) v4.4+
- **语言**：JavaScript（ES Module）
- **兼容性**：`nodejs_compat` 模式
- **许可证**：AGPL-3.0

## 📋 前置要求

- [Node.js](https://nodejs.org/) 18+
- [Cloudflare 账号](https://dash.cloudflare.com/)
- 已绑定到 Cloudflare 的自定义域名（用于配置 Worker 路由）

## 🔧 部署指南

### 1. 克隆项目

```bash
git clone https://github.com/your-username/WorkerProxys.git
cd WorkerProxys
```

### 2. 安装依赖

进入任意子项目目录，安装依赖：

```bash
cd github-proxy  # 或 github-agent / docker-proxy / dnspod-proxy
npm install
```

### 3. 配置

每个子项目的 `wrangler.jsonc` 文件中可配置：

- `name`：Worker 名称
- `vars`：环境变量（如自定义域名等）

部分子项目需要通过环境变量 `HOME_DOMAIN` 设置你的自定义域名，请在 Cloudflare Dashboard 或 `wrangler.jsonc` 的 `vars` 中配置。

### 4. 本地开发

```bash
npm run dev
```

### 5. 部署到 Cloudflare Workers

```bash
npm run deploy
```

### 6. 配置域名路由

在 Cloudflare Dashboard 中为每个 Worker 配置自定义域名路由，将你的域名/子域名指向对应的 Worker。

## ⚠️ 注意事项

1. **地域限制**：所有代理服务均内置了地域检测，非中国大陆用户会被自动重定向到原始服务地址。
2. **合规使用**：请遵守相关法律法规，仅用于合法的技术学习和研究目的。
3. **免费额度**：Cloudflare Workers 免费计划每天有 10 万次请求限制，请根据实际需求评估。
4. **缓存策略**：部分代理服务设置了缓存头（如 `max-age=14400`），可根据需要调整。

## 📄 许可证

本项目采用 [GNU Affero General Public License v3.0 (AGPL-3.0)](./LICENSE) 许可证。
