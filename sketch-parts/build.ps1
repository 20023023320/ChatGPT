$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$dist = Join-Path $PSScriptRoot 'dist'
[IO.Directory]::CreateDirectory($dist) | Out-Null
$zipPath = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString() + '.zip')
try {
    $archive = [IO.Compression.ZipFile]::Open($zipPath, 'Create')
    try {
        $files = Get-ChildItem $PSScriptRoot -File | Where-Object { $_.Extension -in '.js','.html','.css' }
        $assets = Get-ChildItem (Join-Path $PSScriptRoot 'models'),(Join-Path $PSScriptRoot 'vendor') -File -Recurse
        foreach ($file in (@($files) + @($assets))) {
            $relative = $file.FullName.Substring($PSScriptRoot.Length + 1).Replace('\','/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file.FullName,$relative) | Out-Null
        }
    } finally { $archive.Dispose() }
    $output = Join-Path $dist (([char]0x56fe).ToString() + [char]0x7d22 + '.exe')
    & "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:winexe "/out:$output" "/resource:$zipPath,app.zip" /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll /reference:System.Windows.Forms.dll (Join-Path $PSScriptRoot 'Launcher.cs')
    if ($LASTEXITCODE) { throw 'Compilation failed' }
} finally { if (Test-Path $zipPath) { Remove-Item -LiteralPath $zipPath } }
