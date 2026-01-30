#!/usr/bin/env bash
# ==============================================================================
# Update Script
# ==============================================================================
# Update MeshCentral and supporting services with safety checks.
#
# Usage:
#   ./scripts/update.sh [command] [options]
#
# Commands:
#   check       Check for available updates (default)
#   apply       Apply updates (pull + recreate)
#   rollback    Rollback to previous version
#
# Options:
#   --service, -s   Update specific service only
#   --force, -f     Force update without confirmation
#   --backup        Create backup before updating
#   --no-healthcheck Skip health check after update
#
# ==============================================================================

set -o errexit
set -o nounset
set -o pipefail

# Get script directory and load libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/core.sh"
source "${SCRIPT_DIR}/lib/docker.sh"

# ==============================================================================
# Configuration
# ==============================================================================

UPDATE_COMMAND="check"
UPDATE_SERVICE=""
FORCE_UPDATE="false"
CREATE_BACKUP="false"
SKIP_HEALTHCHECK="false"

# Track image states for rollback
declare -A PREVIOUS_IMAGES

# ==============================================================================
# Help
# ==============================================================================

show_help() {
    cat << 'EOF'
Update Script - Remote Support Stack

Usage:
  ./scripts/update.sh [command] [options]

Commands:
  check       Check for available updates (default)
  apply       Apply updates (pull new images + recreate containers)
  rollback    Rollback to previous image versions

Options:
  --service, -s NAME   Update specific service only (meshcentral, nginx, etc.)
  --force, -f          Force update without confirmation prompt
  --backup             Create backup before applying updates
  --no-healthcheck     Skip health verification after update
  --help, -h           Show this help

Examples:
  # Check for updates
  ./scripts/update.sh check

  # Apply all updates with backup
  ./scripts/update.sh apply --backup

  # Update MeshCentral only
  ./scripts/update.sh apply -s meshcentral

  # Force update without prompts
  ./scripts/update.sh apply --force

  # Rollback after failed update
  ./scripts/update.sh rollback

Services:
  meshcentral    MeshCentral remote support server
  nginx          Nginx reverse proxy
  uptime-kuma    Uptime monitoring (if enabled)
  dozzle         Log viewer (if enabled)
  fail2ban       Security service (if enabled)

EOF
}

# ==============================================================================
# Argument Parsing
# ==============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            check|apply|rollback)
                UPDATE_COMMAND="$1"
                shift
                ;;
            --service|-s)
                UPDATE_SERVICE="$2"
                shift 2
                ;;
            --force|-f)
                FORCE_UPDATE="true"
                shift
                ;;
            --backup)
                CREATE_BACKUP="true"
                shift
                ;;
            --no-healthcheck)
                SKIP_HEALTHCHECK="true"
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# ==============================================================================
# UI Helpers
# ==============================================================================

print_header() {
    echo ""
    echo -e "${C_BOLD}${C_BLUE}$1${C_RESET}"
    echo -e "${C_GRAY}$(printf '%.0s─' {1..50})${C_RESET}"
}

print_update_row() {
    local service="$1"
    local current="$2"
    local latest="$3"
    local status="$4"
    
    local status_icon
    case "$status" in
        "up-to-date")
            status_icon="${C_GREEN}✓${C_RESET}"
            ;;
        "update-available")
            status_icon="${C_YELLOW}↑${C_RESET}"
            ;;
        "unknown")
            status_icon="${C_GRAY}?${C_RESET}"
            ;;
        *)
            status_icon=" "
            ;;
    esac
    
    printf "  %s %-15s %-20s %-20s\n" "$status_icon" "$service" "${current:0:18}" "${latest:0:18}"
}

# ==============================================================================
# Image Helpers
# ==============================================================================

get_image_id() {
    local image="$1"
    docker images --format '{{.ID}}' "$image" 2>/dev/null | head -1
}

get_image_digest() {
    local image="$1"
    docker images --format '{{.Digest}}' "$image" 2>/dev/null | head -1
}

get_current_image() {
    local container="$1"
    docker inspect --format '{{.Config.Image}}' "$container" 2>/dev/null
}

get_current_image_id() {
    local container="$1"
    docker inspect --format '{{.Image}}' "$container" 2>/dev/null | cut -c8-19
}

pull_image() {
    local image="$1"
    
    log_debug "Pulling: $image"
    docker pull "$image" 2>&1 | while read -r line; do
        # Show progress on same line
        if [[ "$line" =~ "Pulling" ]] || [[ "$line" =~ "Downloading" ]] || [[ "$line" =~ "Extracting" ]]; then
            echo -ne "\r  ${C_GRAY}${line:0:60}${C_RESET}"
        fi
    done
    echo -ne "\r$(printf ' %.0s' {1..65})\r"
}

save_image_state() {
    local service="$1"
    local container="${PROJECT_NAME:-remote-support}-${service}"
    
    if container_exists "$container"; then
        local image_id
        image_id="$(get_current_image_id "$container")"
        PREVIOUS_IMAGES["$service"]="$image_id"
        log_debug "Saved state for $service: $image_id"
    fi
}

# ==============================================================================
# Check Updates
# ==============================================================================

check_updates() {
    print_header "Checking for Updates"
    
    if ! validate_docker_env; then
        log_error "Docker not available"
        return 1
    fi
    
    echo ""
    printf "  %-17s %-20s %-20s\n" "SERVICE" "CURRENT" "LATEST"
    echo "  $(printf '%.0s─' {1..55})"
    
    local services
    if [[ -n "$UPDATE_SERVICE" ]]; then
        services=("$UPDATE_SERVICE")
    else
        mapfile -t services < <(compose config --services 2>/dev/null)
    fi
    
    local updates_available=0
    
    for service in "${services[@]}"; do
        local result
        result=$(check_service_update "$service")
        
        local current latest status
        current=$(echo "$result" | cut -d'|' -f1)
        latest=$(echo "$result" | cut -d'|' -f2)
        status=$(echo "$result" | cut -d'|' -f3)
        
        print_update_row "$service" "$current" "$latest" "$status"
        
        if [[ "$status" == "update-available" ]]; then
            updates_available=$((updates_available + 1))
        fi
    done
    
    echo ""
    
    if [[ $updates_available -gt 0 ]]; then
        echo -e "${C_YELLOW}$updates_available update(s) available${C_RESET}"
        echo ""
        echo "Run './scripts/update.sh apply' to update"
        return 0
    else
        echo -e "${C_GREEN}All services are up to date${C_RESET}"
        return 0
    fi
}

check_service_update() {
    local service="$1"
    local container="${PROJECT_NAME:-remote-support}-${service}"
    
    # Get image name from compose config
    local image
    image=$(get_service_image "$service")
    
    if [[ -z "$image" ]]; then
        echo "unknown|unknown|unknown"
        return
    fi
    
    # Get current image ID
    local current_id=""
    if container_exists "$container"; then
        current_id=$(get_current_image_id "$container")
    fi
    
    # Pull latest (quietly) and get new ID
    docker pull "$image" &>/dev/null || true
    local latest_id
    latest_id=$(get_image_id "$image")
    
    # Compare
    if [[ -z "$current_id" ]]; then
        echo "not running|${latest_id:0:12}|unknown"
    elif [[ "$current_id" == "${latest_id:0:12}" ]]; then
        echo "${current_id}|${latest_id:0:12}|up-to-date"
    else
        echo "${current_id}|${latest_id:0:12}|update-available"
    fi
}

# ==============================================================================
# Apply Updates
# ==============================================================================

apply_updates() {
    print_header "Applying Updates"
    
    if ! validate_docker_env; then
        log_error "Docker not available"
        return 1
    fi
    
    # Confirmation
    if [[ "$FORCE_UPDATE" != "true" ]]; then
        echo ""
        echo "This will:"
        echo "  • Pull latest Docker images"
        echo "  • Recreate containers"
        echo "  • Brief service interruption"
        echo ""
        
        if ! confirm "Continue with update?" "n"; then
            echo "Update cancelled."
            return 0
        fi
    fi
    
    # Optional backup
    if [[ "$CREATE_BACKUP" == "true" ]]; then
        echo ""
        log_info "Creating backup before update..."
        "${SCRIPT_DIR}/backup.sh" create -q || {
            log_error "Backup failed"
            if ! confirm "Continue without backup?" "n"; then
                return 1
            fi
        }
    fi
    
    # Get services to update
    local services
    if [[ -n "$UPDATE_SERVICE" ]]; then
        services=("$UPDATE_SERVICE")
    else
        mapfile -t services < <(compose config --services 2>/dev/null)
    fi
    
    # Save current state for rollback
    echo ""
    log_info "Saving current state..."
    for service in "${services[@]}"; do
        save_image_state "$service"
    done
    
    # Write rollback info
    save_rollback_info
    
    # Pull new images
    echo ""
    log_info "Pulling latest images..."
    for service in "${services[@]}"; do
        local image
        image=$(get_service_image "$service")
        
        if [[ -n "$image" ]]; then
            echo "  Pulling: $service ($image)"
            pull_image "$image"
        fi
    done
    
    # Recreate containers
    echo ""
    log_info "Recreating containers..."
    
    if [[ -n "$UPDATE_SERVICE" ]]; then
        compose up -d --force-recreate "$UPDATE_SERVICE"
    else
        compose up -d --force-recreate
    fi
    
    # Health check
    if [[ "$SKIP_HEALTHCHECK" != "true" ]]; then
        echo ""
        log_info "Verifying services..."
        sleep 5
        
        local all_healthy=true
        for service in "${services[@]}"; do
            local container="${PROJECT_NAME:-remote-support}-${service}"
            
            if container_is_running "$container"; then
                echo -e "  ${C_GREEN}✓${C_RESET} $service is running"
            else
                echo -e "  ${C_RED}✗${C_RESET} $service is not running"
                all_healthy=false
            fi
        done
        
        if [[ "$all_healthy" != "true" ]]; then
            echo ""
            log_warn "Some services failed to start"
            echo "Run './scripts/update.sh rollback' to revert"
            return 1
        fi
    fi
    
    # Cleanup old images
    echo ""
    log_info "Cleaning up old images..."
    docker image prune -f &>/dev/null || true
    
    echo ""
    echo -e "${C_GREEN}${C_BOLD}Update complete!${C_RESET}"
    
    # Show version info
    echo ""
    show_versions
}

show_versions() {
    echo "Current versions:"
    
    local mc_container="${PROJECT_NAME:-remote-support}-meshcentral"
    if container_is_running "$mc_container"; then
        local mc_version
        mc_version=$(docker exec "$mc_container" node -e "console.log(require('/opt/meshcentral/package.json').version)" 2>/dev/null || echo "unknown")
        echo "  MeshCentral: $mc_version"
    fi
    
    local nginx_container="${PROJECT_NAME:-remote-support}-nginx"
    if container_is_running "$nginx_container"; then
        local nginx_version
        nginx_version=$(docker exec "$nginx_container" nginx -v 2>&1 | grep -oP 'nginx/\K[\d.]+' || echo "unknown")
        echo "  Nginx: $nginx_version"
    fi
}

# ==============================================================================
# Rollback
# ==============================================================================

save_rollback_info() {
    local rollback_file="$(get_path data)/.rollback_info"
    
    {
        echo "# Rollback info - $(date -u +%Y-%m-%dT%H:%M:%SZ)"
        echo "# Delete this file after successful update verification"
        
        for service in "${!PREVIOUS_IMAGES[@]}"; do
            echo "${service}=${PREVIOUS_IMAGES[$service]}"
        done
    } > "$rollback_file"
    
    log_debug "Rollback info saved to: $rollback_file"
}

load_rollback_info() {
    local rollback_file="$(get_path data)/.rollback_info"
    
    if [[ ! -f "$rollback_file" ]]; then
        log_error "No rollback information found"
        log_error "Rollback is only available immediately after an update"
        return 1
    fi
    
    while IFS='=' read -r service image_id; do
        # Skip comments and empty lines
        [[ "$service" =~ ^#.*$ ]] && continue
        [[ -z "$service" ]] && continue
        
        PREVIOUS_IMAGES["$service"]="$image_id"
    done < "$rollback_file"
    
    if [[ ${#PREVIOUS_IMAGES[@]} -eq 0 ]]; then
        log_error "No rollback data found in file"
        return 1
    fi
    
    return 0
}

rollback_updates() {
    print_header "Rolling Back Updates"
    
    # Load rollback info
    if ! load_rollback_info; then
        return 1
    fi
    
    echo ""
    echo "This will restore the following:"
    for service in "${!PREVIOUS_IMAGES[@]}"; do
        echo "  • $service -> ${PREVIOUS_IMAGES[$service]}"
    done
    echo ""
    
    if [[ "$FORCE_UPDATE" != "true" ]]; then
        if ! confirm "Continue with rollback?" "n"; then
            echo "Rollback cancelled."
            return 0
        fi
    fi
    
    echo ""
    log_info "Rolling back services..."
    
    for service in "${!PREVIOUS_IMAGES[@]}"; do
        local image_id="${PREVIOUS_IMAGES[$service]}"
        local container="${PROJECT_NAME:-remote-support}-${service}"
        
        echo "  Rolling back: $service"
        
        # Get the image name
        local image
        image=$(get_service_image "$service")
        
        if [[ -z "$image" ]]; then
            log_warn "  Could not determine image for $service"
            continue
        fi
        
        # Check if we have the old image
        if docker images -q | grep -q "^${image_id}"; then
            # Tag the old image
            docker tag "$image_id" "$image"
            
            # Recreate container
            compose up -d --force-recreate "$service"
            
            echo -e "    ${C_GREEN}✓${C_RESET} Rolled back"
        else
            log_warn "  Previous image not found locally: $image_id"
            log_warn "  You may need to restore from backup"
        fi
    done
    
    # Clean up rollback file
    rm -f "$(get_path data)/.rollback_info"
    
    echo ""
    log_info "Verifying services..."
    sleep 5
    
    for service in "${!PREVIOUS_IMAGES[@]}"; do
        local container="${PROJECT_NAME:-remote-support}-${service}"
        
        if container_is_running "$container"; then
            echo -e "  ${C_GREEN}✓${C_RESET} $service is running"
        else
            echo -e "  ${C_RED}✗${C_RESET} $service is not running"
        fi
    done
    
    echo ""
    echo -e "${C_GREEN}${C_BOLD}Rollback complete!${C_RESET}"
}

# ==============================================================================
# Main
# ==============================================================================

main() {
    parse_args "$@"
    setup_traps
    
    case "$UPDATE_COMMAND" in
        check)
            check_updates
            ;;
        apply)
            apply_updates
            ;;
        rollback)
            rollback_updates
            ;;
        *)
            log_error "Unknown command: $UPDATE_COMMAND"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
