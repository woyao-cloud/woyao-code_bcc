$files = Get-ChildItem -Path src -Recurse -Filter *.ts
$totalLines = 0
$totalFiles = $files.Count

foreach ($file in $files) {
    $lines = Get-Content $file.FullName | Measure-Object -Line
    $totalLines += $lines.Lines
}

Write-Host "=== src 目录代码统计 ==="
Write-Host "Total files: $totalFiles"
Write-Host "Total lines: $totalLines"