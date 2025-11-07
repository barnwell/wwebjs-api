#!/bin/bash
# Script to rebuild wwebjs-api Docker image
# Run this from the root directory

set -e

IMAGE_NAME="${IMAGE_NAME:-wwebjs-api:latest}"
VERSION="${VERSION:-}"
DRY_RUN="${DRY_RUN:-false}"
SKIP_BUILD="${SKIP_BUILD:-false}"
NO_CACHE="${NO_CACHE:-false}"

echo "=== wwebjs-api Image Builder ==="
echo "This script will rebuild the wwebjs-api Docker image with current changes"
echo ""
echo "Usage Examples:"
echo "  ./update-wwebjs-containers.sh                         # Build wwebjs-api:latest"
echo "  VERSION='v2.0' ./update-wwebjs-containers.sh          # Build with specific version"
echo "  IMAGE_NAME='wwebjs-api:dev' ./update-wwebjs-containers.sh # Build with custom name"
echo "  DRY_RUN=true ./update-wwebjs-containers.sh            # See what would be built"
echo "  NO_CACHE=true ./update-wwebjs-containers.sh           # Build without cache"

# Function to get version
get_version() {
    if [ -z "$VERSION" ]; then
        # Try to get version from git tag
        if command -v git >/dev/null 2>&1; then
            local git_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
            if [ -n "$git_tag" ]; then
                echo "$git_tag"
                return
            fi
        fi
        
        # Default version with timestamp
        local timestamp=$(date +"%Y%m%d-%H%M")
        echo "dev-$timestamp"
    else
        echo "$VERSION"
    fi
}

# Step 1: Build updated image
if [ "$SKIP_BUILD" != "true" ]; then
    echo
    echo "=== Building Docker Image ==="
    
    if [ -f "wwebjs-api/Dockerfile" ]; then
        # Get build information
        BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        VERSION_TAG=$(get_version)
        
        # Try to get git commit hash
        if command -v git >/dev/null 2>&1; then
            VCS_REF=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
        else
            VCS_REF="unknown"
        fi
        
        echo "Building image: $IMAGE_NAME"
        echo "Build information:"
        echo "  Version: $VERSION_TAG"
        echo "  Git Commit: $VCS_REF"
        echo "  Build Date: $BUILD_DATE"
        
        if [ "$DRY_RUN" = "true" ]; then
            echo "[DRY RUN] Would execute docker build with above parameters"
        else
            BUILD_ARGS="--build-arg BUILD_DATE=$BUILD_DATE --build-arg VERSION=$VERSION_TAG --build-arg VCS_REF=$VCS_REF"
            
            if [ "$NO_CACHE" = "true" ]; then
                BUILD_ARGS="$BUILD_ARGS --no-cache"
            fi
            
            echo "Executing: docker build $BUILD_ARGS -t $IMAGE_NAME wwebjs-api/"
            docker build $BUILD_ARGS -t "$IMAGE_NAME" wwebjs-api/
            
            # Tag with version for rollback if not already versioned
            if [ "$IMAGE_NAME" = "wwebjs-api:latest" ]; then
                VERSION_IMAGE="wwebjs-api:$VERSION_TAG"
                docker tag "$IMAGE_NAME" "$VERSION_IMAGE"
                echo "✅ Image built and tagged as: $IMAGE_NAME, $VERSION_IMAGE"
            else
                echo "✅ Image built successfully: $IMAGE_NAME"
            fi
        fi
    else
        echo "Error: wwebjs-api/Dockerfile not found!"
        exit 1
    fi
else
    echo "Skipping image build (SKIP_BUILD=true)"
fi

# Step 2: Show next steps
echo
echo "=== Next Steps ==="
echo "The Docker image has been built. To update running containers:"
echo
echo "Option 1 - Via Orchestrator Web Interface:"
echo "  1. Open http://localhost:13001"
echo "  2. Go to Instances page"
echo "  3. For each instance, click 'Stop' then 'Start'"
echo "  4. Verify the new image information in instance details"
echo
echo "Option 2 - Via Docker Commands:"
echo "  1. Stop containers: docker stop \$(docker ps -q --filter 'name=wwebjs-')"
echo "  2. Remove containers: docker rm \$(docker ps -aq --filter 'name=wwebjs-')"
echo "  3. Restart via orchestrator web interface"
echo
echo "Option 3 - Rolling Update:"
echo "  Update instances one by one to minimize downtime"

# Step 3: Verification
echo
echo "=== Verification ==="

if [ "$DRY_RUN" = "true" ]; then
    echo "[DRY RUN] Would show current containers and session info"
else
    echo "Current wwebjs containers:"
    docker ps --filter "name=wwebjs-" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" 2>/dev/null || echo "No wwebjs containers currently running"
    
    echo
    echo "Available images:"
    docker images --filter "reference=wwebjs-api" --format "table {{.Repository}}\t{{.Tag}}\t{{.CreatedAt}}\t{{.Size}}"
    
    echo
    echo "Session directories:"
    if [ -d "instances" ]; then
        session_count=0
        for instance_dir in instances/*/; do
            if [ -d "$instance_dir" ]; then
                instance_name=$(basename "$instance_dir")
                sessions=$(find "$instance_dir" -maxdepth 1 -name "session-*" -type d 2>/dev/null | wc -l)
                if [ "$sessions" -gt 0 ]; then
                    echo "  $instance_name: $sessions session(s)"
                    session_count=$((session_count + sessions))
                else
                    echo "  $instance_name: No sessions"
                fi
            fi
        done
        echo "  Total sessions: $session_count"
    else
        echo "  No instances directory found"
    fi
fi

echo
echo "=== Build Complete ==="

if [ "$SKIP_BUILD" != "true" ] && [ "$DRY_RUN" != "true" ]; then
    echo "✅ Docker image rebuilt successfully"
    echo "✅ Image tagged for rollback capability"
    echo
    echo "Remember to:"
    echo "• Update running containers via orchestrator web interface"
    echo "• Verify new image information in instance details"
    echo "• Monitor container logs after updates"
    echo "• Test any new features or changes"
fi

if [ "$DRY_RUN" = "true" ]; then
    echo
    echo "[DRY RUN COMPLETE] No actual changes were made"
fi