# Codex 沙箱启动修复

2026-09-22 排查反复出现的 `helper_unknown_error: setup refresh had errors`。

## 本次根因

Codex 日志持续报告 `deny ACE failed on D:\NGT管理系统\.git: open deny ACL target for update`。项目目录所有者是 SJ，但 `.git` 目录所有者是 `CodexSandboxOffline`。SJ 普通进程可以读写文件，却不能更新该目录的访问控制列表，导致沙箱在设置 Git 保护规则时启动失败。

## 修复

仅将 `.git` 目录本身的所有者恢复为项目所有者 SJ，不递归操作、不重置 ACL、不关闭沙箱。修复前权限信息保存在 `.local/codex-git-acl-before-*.json`，执行结果保存在 `.local/codex-sandbox-repair.log`。脚本会确认访问控制规则在修复前后完全一致。

诊断命令（不修改权限）：

```powershell
./scripts/repair-codex-sandbox.ps1
```

仅当日志和所有者与本次故障一致时，在项目所有者的管理员 PowerShell 中运行：

```powershell
./scripts/repair-codex-sandbox.ps1 -Repair
```

脚本限制为所在项目的真实 `.git` 目录，拒绝符号链接、worktree 元数据文件、意外所有者和其他管理员身份。修复后应使用普通沙箱重新验证命令执行与文件访问；若错误路径或原因不同，不应套用此修复。

官方背景：[Windows 沙箱文档](https://learn.chatgpt.com/docs/windows/windows-sandbox)。本次所有者问题及修复结论来自本机日志、ACL 检查和实际验证。

## 验证记录

修复后多次通过默认沙箱执行独立命令，文件补丁和图片读取工具也恢复正常。日志中的 setup refresh 显示 `errors=[]` 和 `setup binary completed`。增加只读诊断及错误目标拒绝测试；测试调用 Windows PowerShell 时单独设置其原生模块目录，避免继承 PowerShell 7 模块路径。
