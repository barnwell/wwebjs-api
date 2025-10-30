# PowerShell script to rebuild wwebjs-api Docker image
# Run this from the root directory (c:\v75\wwebjs-api)

param(
    [string]$ImageName = "wwebjs-api:latest",
    [string]$Version = "",
    [switch]$DryRun = $false,
    [switch]$SkipBuild = $false,
    [switch]$NoCache = $false
)

Write-Host "=== wwebjs-api Image Builder ===" -ForegroundColor Green
Write-Host "This script will rebuild the wwebjs-api Docker image with current changes" -ForegroundColor Yellow
Write-Host ""
Write-Host "Usage Examples:" -ForegroundColor Cyan
Write-Host "  .\update-wwebjs-containers.ps1                    # Build wwebjs-api:latest" -ForegroundColor Gray
Write-Host "  .\update-wwebjs-containers.ps1 -Version 'v2.0'   # Build with specific version" -ForegroundColor Gray
Write-Host "  .\update-wwebjs-containers.ps1 -ImageName 'wwebjs-api:dev' # Build with custom name" -ForegroundColor Gray
Write-Host "  .\update-wwebjs-containers.ps1 -DryRun           # See what would be built" -ForegroundColor Gray
Write-Host "  .\update-wwebjs-containers.ps1 -NoCache          # Build without cache" -ForegroundColor Gray

# Function to get version from git or user input
function Get-Version {
    if ([string]::IsNullOrEmpty($Version)) {
        # Try to get version from git tag
        try {
            $gitTag = & git describe --tags --abbrev=0 2>$null
            if ($LASTEXITCODE -eq 0 -and $gitTag) {
                return $gitTag
            }
        } catch {}
        
        # Default version with timestamp
        $timestamp = (Get-Date).ToString("yyyyMMdd-HHmm")
        return "dev-$timestamp"
    }
    return $Version
}

# Step 1: Build updated image
if (-not $SkipBuild) {
    Write-Host "`n=== Building Docker Image ===" -ForegroundColor Cyan
    
    if (Test-Path "wwebjs-api\Dockerfile") {
        # Get build information
        $buildDate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
        $version = Get-Version
        
        # Try to get git commit hash
        $gitCommit = "unknown"
        try {
            $gitCommit = & git rev-parse --short HEAD 2>$null
            if ($LASTEXITCODE -ne 0) { $gitCommit = "unknown" }
        } catch {
            $gitCommit = "unknown"
        }
        
        Write-Host "Building image: $ImageName" -ForegroundColor Yellow
        Write-Host "Build information:" -ForegroundColor Gray
        Write-Host "  Version: $version" -ForegroundColor Gray
        Write-Host "  Git Commit: $gitCommit" -ForegroundColor Gray
        Write-Host "  Build Date: $buildDate" -ForegroundColor Gray
        
        if ($DryRun) {
            Write-Host "[DRY RUN] Would execute docker build with above parameters" -ForegroundColor Gray
        } else {
            $buildArgs = @(
                "--build-arg", "BUILD_DATE=$buildDate",
                "--build-arg", "VERSION=$version", 
                "--build-arg", "VCS_REF=$gitCommit"
            )
            
            if ($NoCache) {
                $buildArgs += "--no-cache"
            }
            
            $buildArgs += @("-t", $ImageName, "wwebjs-api\")
            
            Write-Host "Executing: docker build $($buildArgs -join ' ')" -ForegroundColor Gray
            $buildResult = & docker build @buildArgs
            
            if ($LASTEXITCODE -ne 0) {
                Write-Error "Docker build failed!"
                exit 1
            }
            
            # Tag with version for rollback if not already versioned
            if ($ImageName -eq "wwebjs-api:latest") {
                $versionTag = "wwebjs-api:$version"
                & docker tag $ImageName $versionTag
                Write-Host "✅ Image built and tagged as: $ImageName, $versionTag" -ForegroundColor Green
            } else {
                Write-Host "✅ Image built successfully: $ImageName" -ForegroundColor Green
            }
        }
    } else {
        Write-Error "wwebjs-api/Dockerfile not found!"
        exit 1
    }
} else {
    Write-Host "Skipping image build (--SkipBuild specified)" -ForegroundColor Yellow
}

# Step 2: Show next steps
Write-Host "`n=== Next Steps ===" -ForegroundColor Cyan
Write-Host "The Docker image has been built. To update running containers:" -ForegroundColor Yellow
Write-Host ""
Write-Host "Option 1 - Via Orchestrator Web Interface:" -ForegroundColor White
Write-Host "  1. Open http://localhost:13001" -ForegroundColor Gray
Write-Host "  2. Go to Instances page" -ForegroundColor Gray
Write-Host "  3. For each instance, click 'Stop' then 'Start'" -ForegroundColor Gray
Write-Host "  4. Verify the new image information in instance details" -ForegroundColor Gray
Write-Host ""
Write-Host "Option 2 - Via Docker Commands:" -ForegroundColor White
Write-Host "  1. Stop containers: docker stop \$(docker ps -q --filter 'name=wwebjs-')" -ForegroundColor Gray
Write-Host "  2. Remove containers: docker rm \$(docker ps -aq --filter 'name=wwebjs-')" -ForegroundColor Gray
Write-Host "  3. Restart via orchestrator web interface" -ForegroundColor Gray
Write-Host ""
Write-Host "Option 3 - Rolling Update:" -ForegroundColor White
Write-Host "  Update instances one by one to minimize downtime" -ForegroundColor Gray

# Step 3: Verification
Write-Host "`n=== Verification ===" -ForegroundColor Cyan

if ($DryRun) {
    Write-Host "[DRY RUN] Would show current containers and session info" -ForegroundColor Gray
} else {
    Write-Host "Current wwebjs containers:" -ForegroundColor Yellow
    & docker ps --filter "name=wwebjs-" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" 2>$null
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "No wwebjs containers currently running" -ForegroundColor Gray
    }
    
    Write-Host "`nAvailable images:" -ForegroundColor Yellow
    & docker images --filter "reference=wwebjs-api" --format "table {{.Repository}}\t{{.Tag}}\t{{.CreatedAt}}\t{{.Size}}"
    
    Write-Host "`nSession directories:" -ForegroundColor Yellow
    if (Test-Path "instances") {
        $sessionCount = 0
        Get-ChildItem "instances" -Directory | ForEach-Object {
            $instanceName = $_.Name
            $sessionDirs = Get-ChildItem $_.FullName -Directory -Filter "session-*" -ErrorAction SilentlyContinue
            if ($sessionDirs) {
                Write-Host "  $instanceName`: $($sessionDirs.Count) session(s)" -ForegroundColor Gray
                $sessionCount += $sessionDirs.Count
            } else {
                Write-Host "  $instanceName`: No sessions" -ForegroundColor Yellow
            }
        }
        Write-Host "  Total sessions: $sessionCount" -ForegroundColor Green
    } else {
        Write-Host "  No instances directory found" -ForegroundColor Yellow
    }
}

Write-Host "`n=== Build Complete ===" -ForegroundColor Green

if (-not $SkipBuild -and -not $DryRun) {
    Write-Host "✅ Docker image rebuilt successfully" -ForegroundColor Green
    Write-Host "✅ Image tagged for rollback capability" -ForegroundColor Green
    Write-Host ""
    Write-Host "Remember to:" -ForegroundColor Yellow
    Write-Host "• Update running containers via orchestrator web interface" -ForegroundColor White
    Write-Host "• Verify new image information in instance details" -ForegroundColor White
    Write-Host "• Monitor container logs after updates" -ForegroundColor White
    Write-Host "• Test any new features or changes" -ForegroundColor White
}

if ($DryRun) {
    Write-Host "`n[DRY RUN COMPLETE] No actual changes were made" -ForegroundColor Magenta
}