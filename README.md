# NGT · 意大利手机维修店管理系统

按 `docs/MVP产品设计文档.md` 与 `docs/MVP技术方案.md` 实现的单店、多员工 Web MVP。默认意大利语，欧元金额，Europe/Rome 时区。

## 已实现

- Auth.js 密码登录、bcrypt 哈希、8 小时会话、失败登录锁定，店主/员工服务端权限；停用账号立即撤销业务访问。
- 首页状态看板、待取机、逾期、待确认和未结款；工单搜索和筛选。
- 电话检索/创建客户，客户多设备、隐私同意时间与版本、客户历史工单。
- 多项目报价：精确型号 → 品牌系列 → 通用项目；建议价和最终价快照、调价原因、手工报价及店主另存规则。
- 工单编辑、客户报价确认、状态时间线与操作人；报价修改保留旧报价审计并清除原确认。
- 订金/尾款追加流水、支付方式、余额；重复付款防重、并发收款防超收。
- 交付人和取机时间；欠款交付仅允许店主明确确认，交付后仍可补收余额。
- 店主报价维护、员工创建/启停、按罗马日期的每日收款及工单统计。
- PostgreSQL 迁移、Vitest、Playwright、Docker Compose、CI、备份及隔离恢复演练脚本。

后续功能依照文档不纳入此次实现：照片/签名、收据发送、退款流程、库存、多门店、自动通知、税务与电子发票。已收款工单不能直接取消，以免隐藏尚未处理的退款。

## 本机启动（Node.js 24，pnpm 11.19）

```powershell
pnpm install --frozen-lockfile
# 终端 1：没有 Docker 时启动本地 PostgreSQL
node scripts/windows-db.mjs  # Windows；Linux/macOS 使用 node scripts/local-db.mjs
```

数据库仅监听 `127.0.0.1:55432`。脚本自动生成随机数据库密码、`.env` 与独立测试配置 `.local/test.env`，不会覆盖已有 `.env`。Windows 运行文件及开发数据位于临时目录下的专属缓存，以规避 PostgreSQL 的中文路径限制；具体路径记录在 `.local/database-location.txt`。这是开发环境，不应作为生产持久存储。

```powershell
# 终端 2
pnpm db:generate
pnpm db:migrate
$env:SEED_OWNER_EMAIL = 'owner@example.it'
$env:SEED_OWNER_PASSWORD = '填写至少12位的独立强密码'
pnpm db:seed
pnpm dev
```

访问 <http://localhost:3000>。重复初始化不会更改已有账号密码。需要三条示例报价时，初始化前设置 `SEED_DEMO=true`；不会自动插入虚构客户。

也可以自行配置 PostgreSQL：复制 `.env.example` 为 `.env`，填入连接串与随机 `AUTH_SECRET`，跳过本机数据库脚本。

## Docker Compose

在 `.env` 填写 `POSTGRES_PASSWORD`（建议随机十六进制字符串）、`AUTH_SECRET`、`AUTH_URL`、`SEED_OWNER_EMAIL`、`SEED_OWNER_PASSWORD`。

```sh
docker compose up --build -d
docker compose --profile tools run --rm seed
```

Compose 在应用启动前自动执行迁移。应用端口仅映射到本机 `127.0.0.1:3000`；上线使用 HTTPS 反向代理并设置正式 `AUTH_URL`。数据库使用 Docker 持久卷，未公开数据库端口。`/api/health` 检查数据库连接。容器日志轮换限制为每份 10 MB、保留 3 份。

## 验证

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
node scripts/verify.mjs
```

最后一条命令先向独立测试库应用迁移、运行集成测试，再初始化测试账号并运行生产构建上的浏览器测试。必须先构建，3000 端口须空闲。默认读取 `.local/test.env`；CI 可通过环境变量提供 `DATABASE_URL`。测试脚本强制数据库名称以 `_test` 结尾，拒绝在业务库执行清理。仅集成测试：`node scripts/verify.mjs --integration-only`。

浏览器测试覆盖：自动报价到收款交付、手工报价、超额收款、欠款交付、角色隔离、报价管理、移动端布局。失败诊断保存在 `test-results/` 和 `playwright-report/`。

## 业务约定

- 所有本店已启用员工可操作日常工单；报价表、员工、经营报表仅店主可管理。
- 无国家码的电话号码按意大利 `+39` 处理，保留意大利固定电话的前导 0。
- 预计交付是店铺当地的日历日期；创建、付款、状态和交付事件使用数据库带时区时间戳。
- 只有已确认报价才能进入维修中、待取机或完成状态；终态不自动重开。
- 数据库金额为 `numeric(12,2)`；业务层先转换整数分，再累计和判断，避免浮点差异。
- 付款及审计与状态更新在 Serializable 事务内完成，并发冲突自动重试。客户端金额和权限不作为可信依据。
- 客户隐私同意为可选记录；税号和 IVA 字段已预留。正式隐私告知、保存期限、删除/导出申请流程应按实际门店完善，MVP 不宣称实现完整 GDPR 管理。
- 意大利语界面文案入口为 `src/messages/it.ts`；技术错误和部分占位文案仍位于对应模块，扩展语言时应一并翻译。

## 备份与恢复

部署后的 PostgreSQL 每日备份建议执行 `scripts/backup.ps1`，将备份加密并存入另一台机器或对象存储，配置实际门店需要的保留期限。

```powershell
./scripts/backup.ps1
./scripts/restore-drill.ps1 -BackupFile ./backups/ngt-YYYYMMDD-HHMMSS.dump
```

恢复演练总是创建新的 `ngt_restore_test_*` 数据库，不覆盖业务库；演练后人工核对工单和付款数量，并清理演练库。以上两个脚本需要 Docker。正式上线还应完成真实环境的恢复演练、HTTPS、独立生产密钥、错误监控和隐私告知配置。

## 主要目录

| 路径                       | 内容                                   |
| -------------------------- | -------------------------------------- |
| `src/app/(workspace)`      | 看板、工单、客户、报价、报表、员工页面 |
| `src/lib/domain.ts`        | 金额、报价优先级、状态及日期规则       |
| `src/lib/service.ts`       | 服务端权限、事务与审计                 |
| `src/lib/validation.ts`    | 客户端/服务端输入校验                  |
| `prisma`                   | 数据结构、迁移与账号初始化             |
| `tests`                    | 单元、真实数据库集成、浏览器测试       |
| `.github/workflows/ci.yml` | 自动质量检查和容器构建                 |

实现核对的框架文档：[Next.js 安装](https://nextjs.org/docs/app/getting-started/installation)、[Auth.js](https://authjs.dev/)、[Prisma Client](https://docs.prisma.io/docs/orm/prisma-client/setup-and-configuration/introduction)。
