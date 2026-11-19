<#
  start.ps1 – Chạy MiniChain bằng máy chủ web nhỏ trên máy (http://localhost:8000).
  Chỉ dùng PowerShell có sẵn trong Windows, không cần cài Python hay Node.js.

  Cách chạy (trong thư mục dự án):
      .\start.bat
      powershell -ExecutionPolicy Bypass -File .\start.ps1
      powershell -ExecutionPolicy Bypass -File .\start.ps1 -Port 9000
  Dừng máy chủ: nhấn Ctrl + C.
#>
param([int]$Port = 8000)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$root = (Resolve-Path $PSScriptRoot).Path.TrimEnd('\') + '\'
$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.md'   = 'text/markdown; charset=utf-8'
  '.txt'  = 'text/plain; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.ico'  = 'image/x-icon'
}

# Mở cổng; nếu cổng đang bận thì thử cổng kế tiếp
$listener = $null
for ($p = $Port; $p -lt $Port + 20; $p++) {
  try {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("http://localhost:$p/")
    $l.Start()
    $listener = $l
    $Port = $p
    break
  } catch {
    Write-Host "Cổng $p đang bận, thử cổng khác..." -ForegroundColor DarkYellow
  }
}
if (-not $listener) { throw "Không mở được cổng nào từ $Port." }

Write-Host ''
Write-Host '  MiniChain đang chạy tại:' -ForegroundColor Cyan
Write-Host "  http://localhost:$Port/" -ForegroundColor Green
Write-Host "  Thư mục: $root"
Write-Host '  Mở địa chỉ trên bằng trình duyệt. Nhấn Ctrl + C để dừng máy chủ.' -ForegroundColor DarkGray
Write-Host ''

try {
  while ($listener.IsListening) {
    $task = $listener.GetContextAsync()
    # Chờ từng 200 ms để Ctrl + C dừng được ngay
    while (-not $task.AsyncWaitHandle.WaitOne(200)) { }
    $ctx = $task.GetAwaiter().GetResult()
    $req = $ctx.Request
    $res = $ctx.Response
    $status = 200
    try {
      $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
      if ($path.EndsWith('/')) { $path += 'index.html' }
      $file = [System.IO.Path]::GetFullPath((Join-Path $root ($path.TrimStart('/') -replace '/', '\')))
      $inside = $file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)
      if ($req.HttpMethod -ne 'GET' -and $req.HttpMethod -ne 'HEAD') {
        $status = 405
      } elseif (-not $inside -or -not (Test-Path -LiteralPath $file -PathType Leaf)) {
        $status = 404
      }
      if ($status -eq 200) {
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $ext = [System.IO.Path]::GetExtension($file).ToLower()
        $type = $mime[$ext]
        if (-not $type) { $type = 'application/octet-stream' }
        $res.ContentType = $type
        $res.AddHeader('Cache-Control', 'no-cache')
      } else {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes("$status - Không tìm thấy hoặc không cho phép: $path")
        $res.ContentType = 'text/plain; charset=utf-8'
      }
      $res.StatusCode = $status
      $res.ContentLength64 = $bytes.Length
      if ($req.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
    } catch {
      $status = 500
      try { $res.StatusCode = 500 } catch { }
    } finally {
      try { $res.Close() } catch { }
    }
    $color = 'Gray'
    if ($status -ne 200) { $color = 'Yellow' }
    Write-Host ('{0}  {1}  {2} {3}' -f (Get-Date -Format 'HH:mm:ss'), $status, $req.HttpMethod, $req.Url.AbsolutePath) -ForegroundColor $color
  }
} finally {
  $listener.Stop()
  $listener.Close()
  Write-Host 'Đã dừng máy chủ MiniChain.' -ForegroundColor Cyan
}
