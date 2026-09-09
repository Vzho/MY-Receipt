$ErrorActionPreference = "Stop"

function Test-Tool {
  param(
    [string]$Name,
    [string]$InstallCommand,
    [string]$DownloadUrl,
    [switch]$Optional
  )

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    try {
      $version = & $Name --version 2>$null
      if ($LASTEXITCODE -ne 0 -or -not $version) {
        $version = "installed"
      }
    } catch {
      $version = "installed"
    }
    Write-Host "[OK] $Name - $version" -ForegroundColor Green
    return $true
  }

  if ($Optional) {
    Write-Host "[OPTIONAL] $Name is not installed." -ForegroundColor Yellow
  } else {
    Write-Host "[MISSING] $Name is not installed." -ForegroundColor Red
  }
  Write-Host "  Install command: $InstallCommand"
  Write-Host "  Download/Login URL: $DownloadUrl"
  return $false
}

Write-Host "ResitAI OpenAI-only installation pre-check" -ForegroundColor Cyan
Write-Host ""

$allRequiredOk = $true

Test-Tool "git" "winget install Git.Git" "https://git-scm.com/install/windows" -Optional | Out-Null
$allRequiredOk = (Test-Tool "node" "winget install OpenJS.NodeJS.LTS" "https://nodejs.org/en/download") -and $allRequiredOk
$allRequiredOk = (Test-Tool "npm" "Install Node.js LTS; npm is included with Node.js." "https://nodejs.org/en/download") -and $allRequiredOk
$allRequiredOk = (Test-Tool "supabase" "winget install Supabase.CLI" "https://supabase.com/docs/reference/cli/introduction") -and $allRequiredOk

Write-Host ""
Write-Host "Required website accounts:" -ForegroundColor Cyan
Write-Host "- GitHub: https://github.com/signup"
Write-Host "- Supabase: https://supabase.com/dashboard"
Write-Host "- OpenAI Platform: https://platform.openai.com/"
Write-Host "- Cloudflare Dashboard: https://dash.cloudflare.com/"

Write-Host ""
if ($allRequiredOk) {
  Write-Host "All required local tools are available. You can run:" -ForegroundColor Green
  Write-Host "  npm run install:openai-only"
} else {
  Write-Host "Install the missing required tools above, close PowerShell, reopen it, then run this check again." -ForegroundColor Yellow
}
