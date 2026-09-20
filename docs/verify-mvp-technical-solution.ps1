$ErrorActionPreference = 'Stop'

$documentPath = Join-Path $PSScriptRoot 'MVP技术方案.md'
$content = Get-Content -LiteralPath $documentPath -Raw
$requiredHeadings = @(
    '# 意大利手机维修店管理系统 MVP 技术方案',
    '## 2. 总体架构',
    '## 3. 推荐技术栈',
    '## 5. 数据设计原则',
    '## 6. 关键业务规则',
    '## 8. 本地化、隐私与安全基线',
    '## 9. 测试与质量策略'
)

foreach ($heading in $requiredHeadings) {
    if (-not $content.Contains($heading)) {
        throw "技术方案缺少必需章节：$heading"
    }
}

Write-Output '技术方案章节验证通过。'
