param(
    [string]$Command,
    [string]$Project,
    [string]$SubCommand
)

# ==========================================
# CONFIG
# ==========================================
$Root = (Get-Location).Path
$Parent = Split-Path $Root -Parent

$TemplateVersionFile = Join-Path $Root "template-version.json"
$SchemaFile          = Join-Path $Root "schema.json"

# Safe template-owned files that can be patched into projects
$PatchFiles = @{
    frontend = @("mint.js")
    backend  = @("deploy.js")
    all      = @("deploy.js", "mint.js")
}

# Files that belong to project state and should NOT be overwritten by patch
$ProtectedProjectFiles = @(
    ".env",
    "master.csv",
    "deploy-state.json",
    "registry.json",
    "project-lock.json"
)

# ==========================================
# OUTPUT HELPERS
# ==========================================
function Info($m) { Write-Host $m -ForegroundColor Cyan }
function Good($m) { Write-Host $m -ForegroundColor Green }
function Warn($m) { Write-Host $m -ForegroundColor Yellow }
function Err($m)  { Write-Host $m -ForegroundColor Red }

# ==========================================
# FILE / JSON HELPERS
# ==========================================
function Read-JsonFile {
    param([string]$Path)
    return Get-Content $Path -Raw | ConvertFrom-Json
}

function Write-JsonFile {
    param(
        [string]$Path,
        $Object
    )
    $Object | ConvertTo-Json -Depth 100 | Set-Content $Path -Encoding UTF8
}

function Get-TemplateVersion {
    if (-not (Test-Path $TemplateVersionFile)) {
        throw "Missing template-version.json at $TemplateVersionFile"
    }
    return (Read-JsonFile $TemplateVersionFile).version
}

function Get-Projects {
    Get-ChildItem $Parent -Directory | Where-Object {
        $_.FullName -ne $Root -and (Test-Path (Join-Path $_.FullName "package.json"))
    }
}

function Get-ProjectPath {
    param([string]$Name)
    return Join-Path $Parent $Name
}

function Get-ProjectLockPath {
    param([string]$ProjectPath)
    return Join-Path $ProjectPath "project-lock.json"
}

function Load-ProjectLock {
    param([string]$ProjectPath)

    $lockPath = Get-ProjectLockPath $ProjectPath
    if (Test-Path $lockPath) {
        return Read-JsonFile $lockPath
    }
    return $null
}

function Save-ProjectLock {
    param(
        [string]$ProjectPath,
        [string]$Version
    )

    $lockPath = Get-ProjectLockPath $ProjectPath
    $lock = [ordered]@{
        templateVersion = $Version
        locked          = $true
    }
    Write-JsonFile $lockPath $lock
}

# ==========================================
# SCHEMA / CONTRACT HELPERS
# ==========================================
function Load-Schema {
    if (-not (Test-Path $SchemaFile)) {
        throw "Missing schema.json at $SchemaFile"
    }
    return Read-JsonFile $SchemaFile
}

function Block-UnicodeSupply {
    param([string]$FilePath)

    if (-not (Test-Path $FilePath)) { return }

    $content = Get-Content $FilePath -Raw
    if ($content -match "∞" -or $content -match "âˆž") {
        throw "BLOCKED: Unicode supply symbol found in $FilePath. Use maxSupply = null for open edition."
    }
}

function Normalize-Registry {
    param($Registry)

    # normalize blank strings
    if ($Registry.maxSupply -is [string]) {
        $trimmed = $Registry.maxSupply.Trim()

        if ($trimmed -eq "") {
            $Registry.maxSupply = $null
        }
        elseif ($trimmed -in @("∞", "âˆž", "infinity", "INF")) {
            $Registry.maxSupply = $null
        }
        elseif ($trimmed -match '^\d+$') {
            $Registry.maxSupply = [int]$trimmed
        }
        else {
            throw "Invalid maxSupply string: '$trimmed'. Use a number or null."
        }
    }

    if (-not $Registry.PSObject.Properties.Name.Contains("minted")) {
        $Registry | Add-Member -NotePropertyName minted -NotePropertyValue 0
    }

    if (-not $Registry.PSObject.Properties.Name.Contains("maxSupply")) {
        $Registry | Add-Member -NotePropertyName maxSupply -NotePropertyValue $null
    }

    if (-not $Registry.PSObject.Properties.Name.Contains("supplyType")) {
        $Registry | Add-Member -NotePropertyName supplyType -NotePropertyValue "open"
    }

    if (-not $Registry.PSObject.Properties.Name.Contains("status")) {
        $Registry | Add-Member -NotePropertyName status -NotePropertyValue "initialized"
    }

    # auto-align supplyType with maxSupply
    if ($null -eq $Registry.maxSupply) {
        $Registry.supplyType = "open"
    }
    else {
        $Registry.supplyType = "limited"
    }

    return $Registry
}

function Validate-Registry {
    param([string]$RegistryPath)

    Block-UnicodeSupply $RegistryPath

    $schema = Load-Schema
    $registry = Read-JsonFile $RegistryPath
    $registry = Normalize-Registry $registry

    foreach ($field in $schema.registry.requiredFields) {
        if (-not $registry.PSObject.Properties.Name.Contains($field)) {
            throw "SCHEMA ERROR: Missing required field '$field' in $RegistryPath"
        }
    }

    # minted checks
    if (-not ($registry.minted -is [int] -or $registry.minted -is [long] -or $registry.minted -is [double])) {
        throw "SCHEMA ERROR: minted must be numeric in $RegistryPath"
    }
    if ($registry.minted -lt 0) {
        throw "SCHEMA ERROR: minted cannot be negative in $RegistryPath"
    }

    # maxSupply checks
    if ($null -ne $registry.maxSupply) {
        if (-not ($registry.maxSupply -is [int] -or $registry.maxSupply -is [long] -or $registry.maxSupply -is [double])) {
            throw "SCHEMA ERROR: maxSupply must be a number or null in $RegistryPath"
        }
        if ($registry.maxSupply -lt 1) {
            throw "SCHEMA ERROR: maxSupply must be >= 1 when limited in $RegistryPath"
        }
        if ($registry.minted -gt $registry.maxSupply) {
            throw "SCHEMA ERROR: minted ($($registry.minted)) exceeds maxSupply ($($registry.maxSupply)) in $RegistryPath"
        }
    }

    # supplyType checks
    $allowedSupplyTypes = @("open", "limited")
    if ($registry.supplyType -notin $allowedSupplyTypes) {
        throw "SCHEMA ERROR: invalid supplyType '$($registry.supplyType)' in $RegistryPath"
    }

    # status checks
    $allowedStatuses = @("initialized", "active", "paused", "complete")
    if ($registry.status -notin $allowedStatuses) {
        throw "SCHEMA ERROR: invalid status '$($registry.status)' in $RegistryPath"
    }

    # enforce supplyType consistency
    if ($null -eq $registry.maxSupply -and $registry.supplyType -ne "open") {
        throw "SCHEMA ERROR: maxSupply=null requires supplyType='open' in $RegistryPath"
    }
    if ($null -ne $registry.maxSupply -and $registry.supplyType -ne "limited") {
        throw "SCHEMA ERROR: finite maxSupply requires supplyType='limited' in $RegistryPath"
    }

    # write back normalized / cleaned registry
    Write-JsonFile $RegistryPath $registry
    Good "SCHEMA VALID → $RegistryPath"
}

# ==========================================
# TEMPLATE / PROJECT CREATION
# ==========================================
function Initialize-ProjectRegistry {
    param(
        [string]$ProjectPath,
        [string]$ProjectName,
        [string]$Version
    )

    $registryPath = Join-Path $ProjectPath "registry.json"

    $registry = [ordered]@{
        collectionSlug = $ProjectName
        collectionName = $ProjectName
        minted         = 0
        maxSupply      = $null
        supplyType     = "open"
        status         = "initialized"
        templateVersion = $Version
    }

    Write-JsonFile $registryPath $registry
}

function Update-PackageName {
    param(
        [string]$PackagePath,
        [string]$ProjectName
    )

    if (-not (Test-Path $PackagePath)) { return }

    $pkg = Read-JsonFile $PackagePath
    $pkg.name = $ProjectName
    Write-JsonFile $PackagePath $pkg
}

function CloneProject {
    $name = if ($Project) { $Project } else { Read-Host "Project name" }

    if (-not $name) {
        throw "Project name is required."
    }

    $targetPath = Get-ProjectPath $name
    if (Test-Path $targetPath) {
        throw "Target project already exists: $targetPath"
    }

    $version = Get-TemplateVersion

    Info "CLONING TEMPLATE → $name"
    Copy-Item -Recurse -Force $Root $targetPath

    # remove template-only files from the clone if you don't want them copied
    # In this system we KEEP tool.ps1, schema.json, template-version.json in each clone
    # so each project can self-validate if needed.

    Update-PackageName -PackagePath (Join-Path $targetPath "package.json") -ProjectName $name
    Initialize-ProjectRegistry -ProjectPath $targetPath -ProjectName $name -Version $version

    $deployStatePath = Join-Path $targetPath "deploy-state.json"
    if (Test-Path $deployStatePath) {
        Remove-Item $deployStatePath -Force -ErrorAction SilentlyContinue
    }

    Save-ProjectLock -ProjectPath $targetPath -Version $version

    Good "PROJECT CREATED → $name (template v$version)"
}

# ==========================================
# PATCHING
# ==========================================
function PatchProject {
    if (-not $Project) {
        throw "Usage: .\tool.ps1 patch <ProjectName> <frontend|backend|all>"
    }

    $mode = if ($SubCommand) { $SubCommand.ToLower() } else { "all" }

    if (-not $PatchFiles.ContainsKey($mode)) {
        throw "Invalid patch mode '$mode'. Use frontend, backend, or all."
    }

    $projectPath = Get-ProjectPath $Project
    if (-not (Test-Path $projectPath)) {
        throw "Project not found: $Project"
    }

    $lock = Load-ProjectLock $projectPath
    $templateVersion = Get-TemplateVersion

    if ($lock -and $lock.templateVersion -ne $templateVersion) {
        Warn "VERSION MISMATCH:"
        Warn "Project '$Project' is locked to template v$($lock.templateVersion)"
        Warn "Current template is v$templateVersion"
        Warn "Run: .\tool.ps1 upgrade $Project"
        return
    }

    Info "PATCHING $Project [$mode]"

    foreach ($file in $PatchFiles[$mode]) {
        $src = Join-Path $Root $file
        $dst = Join-Path $projectPath $file

        if (-not (Test-Path $src)) {
            throw "Template patch file missing: $src"
        }

        Copy-Item $src $dst -Force
        Good "PATCHED → $file"
    }

    # validate target project registry after patch
    $targetRegistry = Join-Path $projectPath "registry.json"
    if (Test-Path $targetRegistry) {
        Validate-Registry $targetRegistry
    }

    Good "PATCH COMPLETE → $Project"
}

# ==========================================
# LIST / UPGRADE / VALIDATE
# ==========================================
function ListProjects {
    Info "PROJECTS:"
    foreach ($p in Get-Projects) {
        $lock = Load-ProjectLock $p.FullName
        $version = if ($lock) { $lock.templateVersion } else { "unlocked" }
        Write-Host " - $($p.Name) [template v$version]"
    }
}

function UpgradeProject {
    if (-not $Project) {
        throw "Usage: .\tool.ps1 upgrade <ProjectName>"
    }

    $projectPath = Get-ProjectPath $Project
    if (-not (Test-Path $projectPath)) {
        throw "Project not found: $Project"
    }

    $templateVersion = Get-TemplateVersion
    Save-ProjectLock -ProjectPath $projectPath -Version $templateVersion

    # Also stamp registry templateVersion if field exists
    $registryPath = Join-Path $projectPath "registry.json"
    if (Test-Path $registryPath) {
        $registry = Read-JsonFile $registryPath
        $registry.templateVersion = $templateVersion
        Write-JsonFile $registryPath $registry
        Validate-Registry $registryPath
    }

    Good "UPGRADE COMPLETE → $Project (now on template v$templateVersion)"
}

function ValidateCurrentProject {
    Info "VALIDATING CURRENT PROJECT / TEMPLATE"

    foreach ($required in @("deploy.js", "mint.js", "master.csv", "registry.json", "schema.json", "template-version.json")) {
        if (-not (Test-Path (Join-Path $Root $required))) {
            throw "Missing required file: $required"
        }
    }

    Validate-Registry (Join-Path $Root "registry.json")
    Good "VALIDATION COMPLETE"
}

# ==========================================
# ROUTER
# ==========================================
try {
    switch ($Command.ToLower()) {
        "clone"    { CloneProject }
        "patch"    { PatchProject }
        "list"     { ListProjects }
        "upgrade"  { UpgradeProject }
        "validate" { ValidateCurrentProject }
        default {
            Write-Host ""
            Info "USAGE:"
            Write-Host "  .\tool.ps1 clone New-Project2"
            Write-Host "  .\tool.ps1 list"
            Write-Host "  .\tool.ps1 validate"
            Write-Host "  .\tool.ps1 patch New-Project2 frontend"
            Write-Host "  .\tool.ps1 patch New-Project2 backend"
            Write-Host "  .\tool.ps1 patch New-Project2 all"
            Write-Host "  .\tool.ps1 upgrade New-Project2"
        }
    }
}
catch {
    Err $_.Exception.Message
    exit 1
}