# Fork 自主发布手册

本 fork（`Alex-lsky/cc-switch`，产物名 `CC Switch Pro`）通过 GitHub Actions 自动发布版本，
并支持客户端 in-app 自动更新。本文档是从零配置到发布第一个版本的完整步骤。

> 关键事实：`release.yml` 和 `latest.json` 生成全程用 `${{ github.repository }}` 动态拼 URL，
> 所以在 fork 上跑自动指向你自己的 Releases，无需改任何硬编码地址。
> R2/Cloudflare 镜像（`sync-r2.yml`）在非官方仓库上会自动跳过，纯 GitHub Releases 即可。

---

## 一次性配置（首次发布前做一次）

### 1. 生成 Tauri minisign 签名密钥对

**这步必须在你自己的终端跑**（CLI 会读 `/dev/tty` 设密码，CI/非交互 shell 跑不了）：

```bash
# 在仓库根目录
npx tauri signer generate -w ~/.tauri/cc-switch-pro.key
# 会提示输入密码（设一个，记下来）。生成两个文件：
#   ~/.tauri/cc-switch-pro.key       私钥（绝对不能进 git）
#   ~/.tauri/cc-switch-pro.key.pub   公钥（会写进 tauri.conf.json）
```

⚠️ **私钥文件请备份到安全位置**（如 1Password / 加密 U 盘）。私钥丢了，已装客户端就无法更新了。

### 2. 配置 GitHub Secrets

到 `https://github.com/Alex-lsky/cc-switch/settings/secrets/actions` 新建两个 Secret：

| Secret 名 | 值 |
|-----------|---|
| `TAURI_SIGNING_PRIVATE_KEY` | `~/.tauri/cc-switch-pro.key` 的**完整内容**（两行：`untrusted comment:...` + 密钥行），原样粘贴 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 第 1 步设的密码 |

> 私钥可以直接粘两行原文，也可以整体 base64 一下再粘——`release.yml` 的「Prepare Tauri signing key」步骤两种格式都认。

### 3. 把公钥写进 tauri.conf.json

```bash
# 把 .pub 转成单行 base64
cat ~/.tauri/cc-switch-pro.key.pub | base64 | tr -d '\n'
```

把输出的单行 base64 字符串替换 `src-tauri/tauri.conf.json` 里 `plugins.updater.pubkey` 的当前值
（当前是上游官方的占位公钥 `...C8028C9A573928E3`，必须换成你自己的）。

```jsonc
"updater": {
  "pubkey": "<这里贴你 .pub 的 base64 单行>",
  "endpoints": [
    "https://github.com/Alex-lsky/cc-switch/releases/latest/download/latest.json"
  ]
}
```

提交这个改动。**公钥和私钥必须配对**，否则客户端验签会失败。

---

## 发布新版本

### 4. 推代码 + 打 tag

```bash
# 确保改动都推上去了
git push origin feat/model-level-routing-meizai   # 或你合并到的分支

# 打 tag（版本号要和 package.json / Cargo.toml / tauri.conf.json 三处一致）
# ⚠️ 版本号必须纯数字（如 3.19.2），Windows MSI 不接受 -meizai.N 这类带字母后缀的版本
git tag v3.19.2
git push origin v3.19.2
```

推送 `v*` tag 会自动触发 `release.yml`。

### 5. 等 workflow 跑完（约 20-40 分钟）

到 `https://github.com/Alex-lsky/cc-switch/actions` 看 **Release** workflow。

预期结果（fork 默认配置，无 Apple 证书）：
- ✅ `release (macos-14)`：构建**未签名**的 `.app` + `.dmg`（首次打开要右键→打开）
- ✅ `release (windows-2022)` / `release (windows-11-arm)`：构建 `.msi`（无 EV 签名，Windows SmartScreen 会提示一次）
- ✅ `release (ubuntu-22.04)` / `release (ubuntu-22.04-arm)`：构建 `.AppImage` / `.deb` / `.rpm`
- ✅ `publish-release`：上传所有产物到 GitHub Release（默认 prerelease 状态）
- ✅ `assemble-latest-json`：生成 `latest.json` 并上传到同一个 Release

所有平台产物都带 `.sig`（用你的 minisign 私钥签的）。

### 6. 验证产物

```bash
# 看 latest.json 是否生成正确（URL 应指向 Alex-lsky/cc-switch）
curl -s https://github.com/Alex-lsky/cc-switch/releases/latest/download/latest.json | python3 -m json.tool
```

`latest.json` 里每个平台的 `signature` 字段应该是非空的（来自 `.sig` 文件）。

### 7. 发布为正式版（可选）

Release 默认是 **prerelease**（不会触发 GitHub 的 `/releases/latest` 指向）。
**自动更新依赖 `/releases/latest/download/latest.json`**，所以要让客户端收到更新，
必须把这个 Release 从 prerelease 改成正式发布：

到 Release 页面 → 点「Edit」→ 取消勾选「Set as a pre-release」→ 「Update release」。

或者发布时直接用正式版（改 `release.yml` 里 `prerelease: false`，但建议保留 prerelease 以便先自测）。

---

## 客户端验证自动更新

装好的 CC Switch Pro 在启动时会：
1. 请求 `endpoints` 里的 URL（你的 `latest.json`）
2. 用 `pubkey`（你写进 tauri.conf.json 的公钥）校验签名
3. 版本号比当前高 → 提示/自动下载更新

手动检查：app 设置页 → 检查更新，或看日志 `~/.cc-switch/logs/cc-switch.log` 里 updater 相关行。

**首次发布的坑**：版本号相等 → 不会触发更新。每次发版版本号必须比客户端当前版本**严格更高**（如已装 `3.19.2`，下次发 `3.19.3`），且必须纯数字（Windows MSI 限制）。

---

## 可选：启用 Apple 代码签名

如果你有 Apple Developer 证书，想让 macOS 版免 Gatekeeper 提示：

1. 配置这些 GitHub Secrets：
   - `APPLE_CERTIFICATE`（`.p12` 的 base64）
   - `APPLE_CERTIFICATE_PASSWORD`
   - `KEYCHAIN_PASSWORD`（任意随机串）
   - `APPLE_ID` / `APPLE_PASSWORD`（app-specific password）/ `APPLE_TEAM_ID`
2. 在 `https://github.com/Alex-lsky/cc-switch/settings/variables/actions` 新建 repository variable：
   - 名：`ENABLE_APPLE_SIGNING`，值：`true`

`release.yml` 的所有 Apple 签名/公证步骤都带 `if: vars.ENABLE_APPLE_SIGNING == 'true'` 守卫，
没配就是未签名构建，配了就自动走完整 Apple 签名 + 公证。

---

## 文件清单（本方案改动）

- `.github/workflows/release.yml` — macOS Apple 签名步骤加 `ENABLE_APPLE_SIGNING` 守卫；Release 正文去 `ccswitch.io` 官网声明，改 fork 说明
- `src-tauri/tauri.conf.json` — updater `endpoints` 指向 fork 的 `latest.json`（pubkey 待你替换）
- `docs/release-fork.md` — 本文档

不改的（已经仓库无关/优雅跳过）：
- `release.yml` 的 `assemble-latest-json`（用 `${{ github.repository }}` 动态生成 URL）
- `sync-r2.yml`（非官方仓库无 R2 密钥时自动跳过）

---

## 故障排查

**workflow 里 `release (macos-14)` 失败，提示 `APPLE_CERTIFICATE` 为空**
→ 你配了 `ENABLE_APPLE_SIGNING=true` 但没配 Apple secrets。要么配齐，要么把 variable 删掉/改 `false`。

**`TAURI_SIGNING_PRIVATE_KEY Secret 为空或不存在`**
→ 你没配第 2 步的 Secret。自动更新必须有签名密钥。

**客户端更新报「signature verification failed」**
→ `tauri.conf.json` 的 `pubkey` 和 GitHub Secret 里的私钥不配对。重新生成或核对。

**`latest.json` 404**
→ Release 还停在 prerelease，`/releases/latest` 不指向它。把 Release 改成正式发布（第 7 步）。
