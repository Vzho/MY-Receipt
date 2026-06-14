param(
  [string]$SupabaseProjectRef,
  [string]$SupabaseUrl,
  [string]$SupabasePublishableKey,
  [string]$OpenAIApiKey,
  [string]$OpenAIModel = "gpt-4o-mini",
  [int]$OpenAIVisionMonthlyLimit = 300,
  [string]$CorsOrigin = "*",
  [switch]$SkipValidation,
  [switch]$DeployCloudflare,
  [string]$CloudflareProjectName = "resitai"
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
  param([string]$Message)
  Write-Host "OK  $Message" -ForegroundColor Green
}

function Read-Required {
  param(
    [string]$CurrentValue,
    [string]$Prompt,
    [switch]$Secret
  )

  if ($CurrentValue -and $CurrentValue.Trim()) {
    return $CurrentValue.Trim()
  }

  if ($Secret) {
    $secure = Read-Host $Prompt -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    if (-not $plain -or -not $plain.Trim()) {
      throw "$Prompt is required."
    }
    return $plain.Trim()
  }

  $value = Read-Host $Prompt
  if (-not $value -or -not $value.Trim()) {
    throw "$Prompt is required."
  }
  return $value.Trim()
}

function Assert-Command {
  param(
    [string]$Name,
    [string]$InstallHint
  )
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is not installed or not in PATH. $InstallHint"
  }
}

function Invoke-Checked {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [switch]$AllowFailure
  )

  & $FilePath @Arguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0 -and -not $AllowFailure) {
    throw "Command failed with exit code ${exitCode}: $FilePath $($Arguments -join ' ')"
  }
  return $exitCode
}

function Normalize-SupabaseUrl {
  param([string]$Url)
  $clean = $Url.Trim().TrimEnd("/")
  $clean = $clean -replace "/rest/v1$", ""
  if ($clean -notmatch "^https://[a-zA-Z0-9-]+\.supabase\.co$") {
    throw "SupabaseUrl must look like https://your-project-ref.supabase.co, not a REST endpoint."
  }
  return $clean
}

function Write-Utf8NoBom {
  param(
    [string]$Path,
    [string]$Value
  )
  [System.IO.File]::WriteAllText($Path, $Value, [System.Text.UTF8Encoding]::new($false))
}

Write-Step "Checking required tools"
if (Get-Command "git" -ErrorAction SilentlyContinue) {
  Write-Ok "git is available"
} else {
  Write-Host "WARN Git is not installed. This is OK if you downloaded the ResitAI source code as a ZIP file." -ForegroundColor Yellow
  Write-Host "     Install Git only if you need to clone or pull from GitHub: https://git-scm.com/install/windows" -ForegroundColor Yellow
}
Assert-Command "node" "Install Node.js 22 LTS or newer: https://nodejs.org/"
Assert-Command "npm" "Node.js normally installs npm together."
Assert-Command "supabase" "Install Supabase CLI: winget install Supabase.CLI"
Write-Ok "node, npm, and supabase are available"

$SupabaseProjectRef = Read-Required $SupabaseProjectRef "Supabase project ref"
$SupabaseUrl = Normalize-SupabaseUrl (Read-Required $SupabaseUrl "Supabase Project URL, e.g. https://xxxx.supabase.co")
$SupabasePublishableKey = Read-Required $SupabasePublishableKey "Supabase publishable/anon public key" -Secret
$OpenAIApiKey = Read-Required $OpenAIApiKey "OpenAI API key" -Secret

if ($OpenAIVisionMonthlyLimit -le 0) {
  throw "OpenAIVisionMonthlyLimit must be greater than 0."
}

Write-Step "Installing npm dependencies"
Invoke-Checked "npm" @("ci")
Write-Ok "Dependencies installed"

Write-Step "Writing frontend environment file"
$envLocal = @"
VITE_SUPABASE_URL="$SupabaseUrl"
VITE_SUPABASE_ANON_KEY="$SupabasePublishableKey"
"@
Write-Utf8NoBom (Join-Path (Get-Location) ".env.local") $envLocal
Write-Ok ".env.local written"

Write-Step "Linking Supabase project"
Invoke-Checked "supabase" @("link", "--project-ref", $SupabaseProjectRef)
Write-Ok "Supabase project linked"

Write-Step "Initializing Supabase database schema and Storage policy"
Invoke-Checked "supabase" @("db", "query", "--linked", "--file", "docs/SUPABASE_SCHEMA.sql")
Write-Ok "Database schema applied"

Write-Step "Uploading OpenAI-only Edge Function secrets"
$secretFile = Join-Path $env:TEMP ("resitai-openai-secrets-" + [Guid]::NewGuid().ToString("N") + ".env")
$secretBody = @"
OCR_PROVIDER=openai
USE_OPENAI_VISION=true
VISION_PROVIDER=openai
OPENAI_API_KEY=$OpenAIApiKey
OPENAI_MODEL=$OpenAIModel
OPENAI_VISION_MONTHLY_LIMIT=$OpenAIVisionMonthlyLimit
VISION_FETCH_TIMEOUT_MS=90000
VISION_FETCH_RETRIES=0
OCR_AI_FETCH_RETRIES=2
CORS_ORIGIN=$CorsOrigin
"@
try {
  Write-Utf8NoBom $secretFile $secretBody
  Invoke-Checked "supabase" @("secrets", "set", "--env-file", $secretFile)
} finally {
  if (Test-Path -LiteralPath $secretFile) {
    Remove-Item -LiteralPath $secretFile -Force
  }
}
Write-Ok "Supabase secrets uploaded without printing secret values"

Write-Step "Deploying Supabase Edge Function parse-receipt"
Invoke-Checked "supabase" @("functions", "deploy", "parse-receipt")
Write-Ok "parse-receipt deployed"

if (-not $SkipValidation) {
  Write-Step "Running local validation"
  Invoke-Checked "npm" @("run", "lint")
  Invoke-Checked "npm" @("test", "--", "--run")
  Invoke-Checked "npm" @("run", "build")
  Write-Ok "lint, tests, and build passed"
} else {
  Write-Step "Building frontend"
  Invoke-Checked "npm" @("run", "build")
  Write-Ok "Frontend built"
}

if ($DeployCloudflare) {
  Write-Step "Deploying frontend to Cloudflare Pages"
  if (-not $CloudflareProjectName -or -not $CloudflareProjectName.Trim()) {
    throw "CloudflareProjectName is required when -DeployCloudflare is used."
  }
  Invoke-Checked "npm" @("exec", "--", "wrangler", "pages", "project", "create", $CloudflareProjectName, "--production-branch", "main") -AllowFailure | Out-Null
  Invoke-Checked "npm" @("exec", "--", "wrangler", "pages", "deploy", "dist", "--project-name", $CloudflareProjectName, "--branch", "main")
  Write-Ok "Cloudflare Pages deploy command completed"
} else {
  Write-Step "Cloudflare deployment skipped"
  Write-Host "Run with -DeployCloudflare to upload ./dist by Wrangler, or connect the GitHub repository in Cloudflare Pages."
}

Write-Step "Done"
Write-Host "Frontend env: .env.local"
Write-Host "Supabase function: https://$SupabaseProjectRef.supabase.co/functions/v1/parse-receipt"
Write-Host "OpenAI provider: OCR_PROVIDER=openai, VISION_PROVIDER=openai"
