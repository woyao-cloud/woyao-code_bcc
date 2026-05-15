<#
.SYNOPSIS
Git 代码提交统计脚本

.DESCRIPTION
统计 Git 仓库的提交次数、代码行数、文件数等信息

.PARAMETER Author
按作者筛选 (支持部分匹配)

.PARAMETER Since
开始日期 (格式: YYYY-MM-DD)

.PARAMETER Until
结束日期 (格式: YYYY-MM-DD)

.PARAMETER Branch
指定分支名

.PARAMETER Verbose
显示详细信息
#>

param(
    [string]$Author = "",
    [string]$Since = "",
    [string]$Until = "",
    [string]$Branch = "",
    [switch]$Verbose = $false
)

# 检查是否在 Git 仓库中
$gitCheck = git rev-parse --is-inside-work-tree 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "错误: 不在 Git 仓库中" -ForegroundColor Red
    exit 1
}

# 构建 git log 参数
function Build-GitParams {
    $params = @()
    
    if ($Branch) {
        $params += $Branch
    }
    
    if ($Author) {
        $params += "--author=`"$Author`""
    }
    
    if ($Since) {
        $params += "--since=`"$Since`""
    }
    
    if ($Until) {
        $params += "--until=`"$Until`""
    }
    
    return $params -join " "
}

# 主统计函数
function main {
    $gitParams = Build-GitParams
    
    Write-Host "===========================================" -ForegroundColor Cyan
    Write-Host "        Git 代码提交统计报告" -ForegroundColor Cyan
    Write-Host "===========================================" -ForegroundColor Cyan
    Write-Host ""
    
    # 打印筛选条件
    if ($Author -or $Since -or $Until -or $Branch) {
        Write-Host "筛选条件:" -ForegroundColor Yellow
        if ($Branch) { Write-Host "  分支: $Branch" }
        if ($Author) { Write-Host "  作者: $Author" }
        if ($Since) { Write-Host "  开始日期: $Since" }
        if ($Until) { Write-Host "  结束日期: $Until" }
        Write-Host ""
    }
    
    # 统计提交次数
    Write-Host "【提交统计】" -ForegroundColor Yellow
    $totalCommits = git log $gitParams --oneline | Measure-Object -Line
    Write-Host "  总提交次数: " -NoNewline
    Write-Host $totalCommits.Lines -ForegroundColor Green
    
    # 统计代码行数变化
    Write-Host ""
    Write-Host "【代码行数统计】" -ForegroundColor Yellow
    $stats = git log $gitParams --numstat --format='' | ForEach-Object {
        $parts = $_.Split("`t")
        if ($parts[0] -match '^\d+$') { $added = [int]$parts[0] } else { $added = 0 }
        if ($parts[1] -match '^\d+$') { $deleted = [int]$parts[1] } else { $deleted = 0 }
        [PSCustomObject]@{ Added = $added; Deleted = $deleted }
    }
    $totalAdded = ($stats | Measure-Object -Property Added -Sum).Sum
    $totalDeleted = ($stats | Measure-Object -Property Deleted -Sum).Sum
    $netChange = $totalAdded - $totalDeleted
    
    Write-Host "  新增行数: " -NoNewline
    Write-Host $totalAdded -ForegroundColor Green
    Write-Host "  删除行数: " -NoNewline
    Write-Host $totalDeleted -ForegroundColor Red
    Write-Host "  净增行数: " -NoNewline
    Write-Host $netChange -ForegroundColor Cyan
    
    # 统计文件数
    Write-Host ""
    Write-Host "【文件统计】" -ForegroundColor Yellow
    $totalFiles = git log $gitParams --numstat --format='' | ForEach-Object {
        $parts = $_.Split("`t")
        if ($parts.Count -gt 2) { $parts[2] }
    } | Select-Object -Unique | Measure-Object -Line
    $modifiedFiles = git log $gitParams --name-only --format='' | Select-Object -Unique | Measure-Object -Line
    
    Write-Host "  修改的文件数: " -NoNewline
    Write-Host $totalFiles.Lines -ForegroundColor Green
    Write-Host "  涉及的文件总数: " -NoNewline
    Write-Host $modifiedFiles.Lines -ForegroundColor Cyan
    
    # 统计提交者
    Write-Host ""
    Write-Host "【提交者统计】" -ForegroundColor Yellow
    git log $gitParams --format='%aN' | Group-Object | Sort-Object -Property Count -Descending | Select-Object -First 10 | ForEach-Object {
        Write-Host "  " -NoNewline
        Write-Host $_.Count -ForegroundColor Green -NoNewline
        Write-Host " - $($_.Name)"
    }
    
    # 按日期统计
    Write-Host ""
    Write-Host "【时间分布】" -ForegroundColor Yellow
    Write-Host "  按日期统计 (最近10天):"
    git log $gitParams --format='%ad' --date=short | Group-Object | Sort-Object -Property Name -Descending | Select-Object -First 10 | ForEach-Object {
        Write-Host "    $($_.Name): " -NoNewline
        Write-Host $_.Count -ForegroundColor Green -NoNewline
        Write-Host " 次提交"
    }
    
    # 详细模式：显示最近提交
    if ($Verbose) {
        Write-Host ""
        Write-Host "【最近提交】" -ForegroundColor Yellow
        git log $gitParams --oneline -10 | ForEach-Object {
            Write-Host "  $_"
        }
    }
    
    Write-Host ""
    Write-Host "===========================================" -ForegroundColor Cyan
    Write-Host "                 统计完成" -ForegroundColor Cyan
    Write-Host "===========================================" -ForegroundColor Cyan
}

# 入口
main