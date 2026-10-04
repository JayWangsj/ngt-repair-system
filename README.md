# NGT · 意大利手机维修店管理系统

面向单店、单人使用的维修管理系统，无需登录。默认意大利语，可切换中文；金额使用欧元，日期与时间使用 Europe/Rome 时区。

## 主要功能

- 客户、设备、维修单、报价、收款、交付、保修、返修和退款管理。
- 报价支持品牌、设备类型、型号、维修项目、折扣和 22% IVA。
- 库存、适配设备、维修用料及零售记录管理。
- 总览、每日业务统计、收款统计和工单筛选。
- 设置中可导入、导出业务数据，并检查和安装新版本。

## 工作室电脑

### 首次安装

1. 从本仓库最新 GitHub Release 下载 `ngt-studio-windows-setup-v*.exe`。
2. 双击安装，完成后从桌面打开 NGT。
3. 如果 SmartScreen 拦截，确认文件来自本仓库后，选择“更多信息 → 仍要运行”。

安装包已包含运行环境，4 GB 内存的电脑无需另行安装 Node.js、pnpm、PostgreSQL 或 Docker。

### 更新

进入“设置 → 系统更新”，点击“检查更新”，发现新版本后选择“现在更新”。首次检查时，需要在浏览器中登录有本私有仓库权限的 GitHub 账号。

更新前会自动备份业务数据；更新失败时会尝试恢复旧版本。

### 卸载

在 Windows“设置 → 应用 → 已安装的应用”中卸载“NGT 工作室管理系统”。桌面快捷方式和后台启动任务会一并移除，业务数据默认保留在 `%LOCALAPPDATA%\NGT\data-store`。

## 发布新版

完成修改、测试和 commit 后，确保 `package.json` 中的版本号已更新，再推送代码及同版本标签：

```powershell
git push origin master
$version = (Get-Content .\package.json -Raw | ConvertFrom-Json).version
git tag "v$version"
git push origin "v$version"
```

GitHub Actions 会自动创建私有 Release 和 Windows 安装包。

## 本地开发

需要 Node.js 24 和 pnpm 11.19。

```powershell
pnpm install --frozen-lockfile
node scripts/windows-db.mjs
```

另开一个终端：

```powershell
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

访问 <http://localhost:3000>。Linux 和 macOS 使用 `node scripts/local-db.mjs`；如已有 PostgreSQL，可将 `.env.example` 复制为 `.env` 并填写数据库连接。

## 验证

根据改动范围运行相关检查：

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

完整集成与浏览器验证使用 `node scripts/verify.mjs`。该脚本只允许操作名称以 `_test` 结尾的隔离测试库，不会清理业务数据库。

## 数据安全

- 在设置中定期导出 JSON 备份，并保存到另一台设备。
- 不要在没有备份的情况下删除 `%LOCALAPPDATA%\NGT\data-store`。
- 测试和开发必须使用独立测试数据库，不得使用工作室业务数据库。
