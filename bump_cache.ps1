# bump_cache.ps1
# Stamps EVERY  ?v=NNN  cache-buster (in js/**.js and index.html) with one fresh
# build number, so the browser/GitHub Pages can never serve a stale module again.
# All occurrences get the SAME stamp in a single run -> duplicate imports stay matched.
$ErrorActionPreference = 'Stop'

$stamp = Get-Date -Format 'yyyyMMddHHmmss'

$files = @()
$files += Get-ChildItem -Path 'js' -Recurse -Filter '*.js' -ErrorAction SilentlyContinue
if (Test-Path 'index.html') { $files += Get-Item 'index.html' }

$count = 0
foreach ($f in $files) {
    $c = [System.IO.File]::ReadAllText($f.FullName)
    $n = [regex]::Replace($c, '\?v=[0-9]+', "?v=$stamp")
    if ($n -ne $c) {
        # WriteAllText = UTF-8 without BOM (safe for JS modules)
        [System.IO.File]::WriteAllText($f.FullName, $n)
        Write-Host ("  bumped: " + $f.Name)
        $count++
    }
}
Write-Host ("Cache build stamp: $stamp   (files updated: $count)")
