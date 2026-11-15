# GitHub 发布步骤 · 工作生活台

> 给作者本人使用。当前本地仓库已经初始化并提交；做完下面的步骤后，再把真实链接交给网站维护者。

---

## 0. 先确认本地状态

在项目根目录执行：

```powershell
git status
git log --oneline -5
```

确认：

- 工作区干净，或者只包含你准备提交的发布资料；
- `data/` 没有被 Git 跟踪；
- `app/runtime/` 没有被 Git 跟踪（它只放进 Release ZIP）。

可以用下面的命令复查：

```powershell
git ls-files data
git log --all -- data
```

两条命令都应该没有输出。如果有输出，先不要公开仓库。

---

## 1. 注册 GitHub 账号

1. 打开 https://github.com/
2. 注册账号，完成邮箱验证。
3. 建议开启两步验证（2FA）。

---

## 2. 新建仓库

在 GitHub 右上角 `+` → `New repository`：

- **Repository name**：建议 `work-life-desk`（也可以叫 `workbench`）
- **Description**：`本地优先的个人工作与生活控制台 · Local-first personal workbench`
- **Visibility**：`Public`
- **不要勾选** “Add a README file / Add .gitignore / Choose a license”，因为本地已经有这些文件。

创建后，GitHub 会给你一个仓库地址，形如：

```text
https://github.com/<你的用户名>/work-life-desk.git
```

---

## 3. 连接本地仓库并推送

在项目根目录执行（把 `<你的用户名>` 和仓库名换成实际值）：

```powershell
git remote add origin https://github.com/<你的用户名>/work-life-desk.git
git branch -M main
git push -u origin main
```

第一次推送时，GitHub 可能会要求登录。按浏览器提示完成授权即可。
如果 Windows 凭据管理器弹窗，选择 GitHub 登录，不要把密码写进任何文件。

推送后刷新仓库页面，确认：

- `README.md` 能正常显示；
- `LICENSE` 存在；
- `docs/screenshots/` 里的图片能打开；
- `data/` 和 `app/runtime/` 不在仓库文件列表里。

---

## 4. 构建 Windows Release 包

在项目根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-release.ps1
```

产物：

```text
release\工作生活台-v1.0.0-Windows-x64.zip
release\工作生活台-v1.0.0-Windows-x64.zip.sha256
```

这个 ZIP 会包含：

- `app/`（含 `app/runtime/` Python 3.13 运行时）
- `启动.bat` / `关闭.bat`
- `README.md` / `LICENSE` / `THIRD_PARTY_NOTICES.md`
- `使用说明.txt`
- `docs/screenshots/`

不会包含：

- 作者的真实 `data/`
- `data/backups/`
- 测试文件、PRD、开发计划
- `.git/`

构建脚本会在打包前检查 ZIP 内容，确保没有 `data/data.json`。

---

## 5. 创建 GitHub Release

### 方式 A：网页操作（推荐给第一次发布）

1. 打开仓库页面 → 右侧 `Releases` → `Create a new release`
2. **Choose a tag**：输入 `v1.0.0`，选择 `Create new tag: v1.0.0 on publish`
3. **Release title**：`工作生活台 v1.0.0 · Windows 一键包`
4. **Describe this release**：

```text
第一个公开版本。

- Windows 10/11 x64 一键包，内含 Python 3.13.18 运行时，解压后双击「启动.bat」即可使用
- 9 个模块：首页总览、今日计划、自媒体、开发工作、咨询工作、健身计划、饮食计划、游戏娱乐、数据与设置
- 数据全部保存在本机 data/data.json，不联网、不登录
- 源码采用 MIT License

下载后请先阅读 README.md 或 使用说明.txt。
```

5. 把 `release\工作生活台-v1.0.0-Windows-x64.zip` 拖到 **Attach binaries** 区域
6. 点击 `Publish release`

发布后的下载地址形如：

```text
https://github.com/<你的用户名>/work-life-desk/releases/latest
```

### 方式 B：命令行打标签（可选）

```powershell
git tag v1.0.0
git push origin v1.0.0
```

然后在 GitHub 网页上基于这个 tag 创建 Release 并上传 ZIP。

---

## 6. 把链接交给网站维护者

把下面两项替换成真实地址：

```text
仓库地址：https://github.com/<你的用户名>/work-life-desk
下载地址：https://github.com/<你的用户名>/work-life-desk/releases/latest
```

网站那边只需要一个入口按钮；详细文案和截图清单见：

```text
docs/website-handoff.md
```

---

## 7. 发布前最后检查

- [ ] GitHub 仓库是 Public
- [ ] 仓库里没有 `data/`、`backups/`、`app/runtime/`
- [ ] README 截图能正常显示
- [ ] Release ZIP 能下载，大小正常（约 35–40 MB）
- [ ] 把 ZIP 解压到一个全新目录，双击 `启动.bat`，能打开 `http://127.0.0.1:8848/`
- [ ] 新目录里能生成 `data/data.json`，关闭后数据还在
- [ ] 网站链接已替换为真实地址
- [ ] 网站没有 `localhost` 链接，没有 iframe 嵌入
- [ ] 没有上传任何真实任务、客户、体重、收入或聊天记录

---

## 8. 后续更新版本

每次发布新版本：

1. 修改 `app/data_store.py` 里的 `APP_VERSION`；
2. 运行全部测试；
3. 运行 `scripts/build-release.ps1`；
4. 提交 Git；
5. 创建新的 tag（例如 `v1.1.0`）和 Release；
6. 上传新的 ZIP。

不要把 ZIP 提交进 Git 仓库；Release 资产由 GitHub 单独托管。
