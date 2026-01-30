#!/usr/bin/env bash
# ==============================================================================
# Backup & Restore Script
# ==============================================================================
# Backup and restore MeshCentral data, configurations, and SSL certificates.
#
# Usage:
#   ./scripts/backup.sh [command] [options]
#
# Commands:
#   create      Create a new backup (default)
#   restore     Restore from a backup
#   list        List available backups
#   prune       Remove old backups (keep last N)
#   verify      Verify backup integrity
#
# Options:
#   --output, -o    Output path for backup
#   --input, -i     Input path for restore
#   --keep, -k      Number of backups to keep (default: 7)
#   --no-stop       Don't stop containers during backup
#   --quiet, -q     Minimal output
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

# Defaults
BACKUP_COMMAND="create"
BACKUP_OUTPUT=""
RESTORE_INPUT=""
BACKUP_KEEP="${BACKUP_RETENTION_COUNT:-7}"
STOP_CONTAINERS="true"
QUIET_MODE="false"

# Backup components
BACKUP_COMPONENTS=(
    "meshcentral_data"
    "meshcentral_files"
    "config"
    "ssl"
    "env"
)

# ==============================================================================
# Help
# ==============================================================================

show_help() {
    cat << 'EOF'
Backup & Restore Script

Usage:
  ./scripts/backup.sh [command] [options]

Commands:
  create      Create a new backup (default)
  restore     Restore from a backup file
  list        List available backups
  prune       Remove old backups (keep last N)
  verify      Verify backup integrity

Options:
  --output, -o PATH    Output path for backup file
  --input, -i PATH     Input backup file for restore
  --keep, -k NUM       Number of backups to keep (default: 7)
  --no-stop            Don't stop containers during backup
  --quiet, -q          Minimal output
  --help, -h           Show this help

Examples:
  # Create backup with default settings
  ./scripts/backup.sh create

  # Create backup to specific location
  ./scripts/backup.sh create -o /path/to/backup.tar.gz

  # Restore from backup
  ./scripts/backup.sh restore -i /path/to/backup.tar.gz

  # List available backups
  ./scripts/backup.sh list

  # Keep only last 5 backups
  ./scripts/backup.sh prune -k 5

  # Verify backup integrity
  ./scripts/backup.sh verify -i /path/to/backup.tar.gz

Environment Variables:
  BACKUP_PATH              Base backup directory
  BACKUP_RETENTION_COUNT   Number of backups to keep
  BACKUP_COMPRESSION       Compression level (1-9, default: 6)

EOF
}

# ==============================================================================
# Argument Parsing
# ==============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            create|restore|list|prune|verify)
                BACKUP_COMMAND="$1"
                shift
                ;;
            --output|-o)
                BACKUP_OUTPUT="$2"
                shift 2
                ;;
            --input|-i)
                RESTORE_INPUT="$2"
                shift 2
                ;;
            --keep|-k)
                BACKUP_KEEP="$2"
                shift 2
                ;;
            --no-stop)
                STOP_CONTAINERS="false"
                shift
                ;;
            --quiet|-q)
                QUIET_MODE="true"
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
# Utilities
# ==============================================================================

get_backup_dir() {
    local backup_dir="${BACKUP_PATH:-$(get_path data)/backups}"
    ensure_dir "$backup_dir" 0700
    echo "$backup_dir"
}

get_backup_name() {
    local project="${PROJECT_NAME:-remote-support}"
    local timestamp
    timestamp="$(date +%Y%m%d_%H%M%S)"
    echo "${project}_backup_${timestamp}.tar.gz"
}

format_size() {
    local bytes="$1"
    if [[ $bytes -lt 1024 ]]; then
        echo "${bytes}B"
    elif [[ $bytes -lt 1048576 ]]; then
        echo "$((bytes / 1024))KB"
    elif [[ $bytes -lt 1073741824 ]]; then
        echo "$((bytes / 1048576))MB"
    else
        echo "$((bytes / 1073741824))GB"
    fi
}

print_status() {
    [[ "$QUIET_MODE" == "true" ]] && return
    echo "$@"
}

# ==============================================================================
# Backup Functions
# ==============================================================================

create_backup() {
    local backup_dir
    backup_dir="$(get_backup_dir)"
    
    local backup_name
    backup_name="$(get_backup_name)"
    
    local backup_file="${BACKUP_OUTPUT:-${backup_dir}/${backup_name}}"
    local temp_dir
    temp_dir="$(mktemp -d)"
    
    # Cleanup on exit
    trap "rm -rf '$temp_dir'" EXIT
    
    print_status ""
    print_status "Creating backup: $backup_file"
    print_status "$(printf '%.0s─' {1..50})"
    
    # Stop containers for consistent backup
    local containers_stopped=false
    if [[ "$STOP_CONTAINERS" == "true" ]] && is_docker_running; then
        print_status "Stopping containers for consistent backup..."
        compose stop meshcentral 2>/dev/null || true
        containers_stopped=true
    fi
    
    # Create backup structure
    local backup_staging="${temp_dir}/backup"
    mkdir -p "$backup_staging"
    
    # Backup metadata
    create_backup_metadata "$backup_staging"
    
    # Backup each component
    for component in "${BACKUP_COMPONENTS[@]}"; do
        backup_component "$component" "$backup_staging"
    done
    
    # Create compressed archive
    print_status "Compressing backup..."
    local compression="${BACKUP_COMPRESSION:-6}"
    
    tar -czf "$backup_file" \
        --directory="$temp_dir" \
        --warning=no-file-changed \
        "backup" 2>/dev/null || true
    
    # Restart containers
    if [[ "$containers_stopped" == "true" ]]; then
        print_status "Restarting containers..."
        compose start meshcentral 2>/dev/null || true
    fi
    
    # Verify backup
    if [[ -f "$backup_file" ]]; then
        local size
        size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null)
        
        print_status ""
        print_status "Backup created successfully!"
        print_status "  File: $backup_file"
        print_status "  Size: $(format_size "$size")"
        
        # Generate checksum
        local checksum
        checksum="$(sha256sum "$backup_file" | awk '{print $1}')"
        echo "$checksum" > "${backup_file}.sha256"
        print_status "  SHA256: ${checksum:0:16}..."
        
        # Automatic pruning
        if [[ -n "$BACKUP_KEEP" ]] && [[ "$BACKUP_KEEP" -gt 0 ]]; then
            prune_backups "$BACKUP_KEEP"
        fi
        
        echo "$backup_file"
    else
        log_error "Backup creation failed"
        return 1
    fi
}

create_backup_metadata() {
    local staging="$1"
    
    local metadata_file="${staging}/metadata.json"
    
    cat > "$metadata_file" << EOF
{
    "version": "1.0",
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "project_name": "${PROJECT_NAME:-remote-support}",
    "hostname": "$(hostname)",
    "components": $(printf '%s\n' "${BACKUP_COMPONENTS[@]}" | jq -R . | jq -s .),
    "meshcentral_version": "$(get_meshcentral_version)",
    "backup_script_version": "${CORE_VERSION:-1.0.0}"
}
EOF
    
    print_status "  ✓ Metadata"
}

get_meshcentral_version() {
    local container="${PROJECT_NAME:-remote-support}-meshcentral"
    if container_is_running "$container" 2>/dev/null; then
        docker exec "$container" node -e "console.log(require('/opt/meshcentral/package.json').version)" 2>/dev/null || echo "unknown"
    else
        echo "unknown"
    fi
}

backup_component() {
    local component="$1"
    local staging="$2"
    
    case "$component" in
        meshcentral_data)
            backup_docker_volume "meshcentral_data" "$staging"
            ;;
        meshcentral_files)
            backup_docker_volume "meshcentral_files" "$staging"
            ;;
        config)
            backup_directory "$(get_path config)" "$staging/config"
            ;;
        ssl)
            backup_directory "$(get_path data)/ssl" "$staging/ssl"
            ;;
        env)
            backup_env_file "$staging"
            ;;
        *)
            log_warn "Unknown backup component: $component"
            ;;
    esac
}

backup_docker_volume() {
    local volume_name="$1"
    local staging="$2"
    
    local full_volume_name="${PROJECT_NAME:-remote-support}_${volume_name}"
    
    if ! volume_exists "$full_volume_name"; then
        print_status "  - ${volume_name} (not found, skipping)"
        return 0
    fi
    
    local output_dir="${staging}/volumes"
    mkdir -p "$output_dir"
    
    docker run --rm \
        -v "${full_volume_name}:/data:ro" \
        -v "${output_dir}:/backup" \
        alpine tar czf "/backup/${volume_name}.tar.gz" -C /data . 2>/dev/null
    
    if [[ -f "${output_dir}/${volume_name}.tar.gz" ]]; then
        print_status "  ✓ ${volume_name}"
    else
        log_warn "Failed to backup volume: $volume_name"
    fi
}

backup_directory() {
    local source="$1"
    local dest="$2"
    
    if [[ ! -d "$source" ]]; then
        print_status "  - $(basename "$source") (not found, skipping)"
        return 0
    fi
    
    mkdir -p "$dest"
    cp -r "$source"/* "$dest"/ 2>/dev/null || true
    
    print_status "  ✓ $(basename "$source")"
}

backup_env_file() {
    local staging="$1"
    local env_file="$(get_path base)/.env"
    
    if [[ -f "$env_file" ]]; then
        # Backup with sensitive values masked
        mkdir -p "${staging}/env"
        
        # Full backup (for actual restore)
        cp "$env_file" "${staging}/env/.env"
        
        # Masked version (for reference)
        sed -E 's/(PASSWORD|SECRET|KEY|TOKEN)=.*/\1=***REDACTED***/gi' "$env_file" > "${staging}/env/.env.masked"
        
        print_status "  ✓ Environment"
    else
        print_status "  - Environment (not found)"
    fi
}

# ==============================================================================
# Restore Functions
# ==============================================================================

restore_backup() {
    local backup_file="$RESTORE_INPUT"
    
    if [[ -z "$backup_file" ]]; then
        log_error "No backup file specified. Use -i <file>"
        return 1
    fi
    
    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi
    
    print_status ""
    print_status "Restoring from: $backup_file"
    print_status "$(printf '%.0s─' {1..50})"
    
    # Verify checksum if available
    local checksum_file="${backup_file}.sha256"
    if [[ -f "$checksum_file" ]]; then
        print_status "Verifying backup integrity..."
        local expected
        expected="$(cat "$checksum_file")"
        local actual
        actual="$(sha256sum "$backup_file" | awk '{print $1}')"
        
        if [[ "$expected" != "$actual" ]]; then
            log_error "Backup checksum mismatch!"
            log_error "Expected: $expected"
            log_error "Actual: $actual"
            return 1
        fi
        print_status "  ✓ Checksum verified"
    fi
    
    # Create temp directory
    local temp_dir
    temp_dir="$(mktemp -d)"
    trap "rm -rf '$temp_dir'" EXIT
    
    # Extract backup
    print_status "Extracting backup..."
    tar -xzf "$backup_file" -C "$temp_dir"
    
    local staging="${temp_dir}/backup"
    
    if [[ ! -d "$staging" ]]; then
        log_error "Invalid backup format"
        return 1
    fi
    
    # Read metadata
    if [[ -f "${staging}/metadata.json" ]]; then
        print_status "Backup info:"
        print_status "  Created: $(jq -r '.created_at' "${staging}/metadata.json")"
        print_status "  Project: $(jq -r '.project_name' "${staging}/metadata.json")"
        print_status "  MeshCentral: $(jq -r '.meshcentral_version' "${staging}/metadata.json")"
    fi
    
    # Confirm restore
    echo ""
    echo "WARNING: This will overwrite existing data!"
    if ! confirm "Continue with restore?" "n"; then
        echo "Restore cancelled."
        return 0
    fi
    
    # Stop containers
    print_status "Stopping containers..."
    compose down 2>/dev/null || true
    
    # Restore components
    restore_volumes "$staging"
    restore_config "$staging"
    restore_ssl "$staging"
    restore_env "$staging"
    
    print_status ""
    print_status "Restore complete!"
    print_status "Run './scripts/setup.sh' or 'docker compose up -d' to start services."
}

restore_volumes() {
    local staging="$1"
    local volumes_dir="${staging}/volumes"
    
    if [[ ! -d "$volumes_dir" ]]; then
        print_status "  - No volumes to restore"
        return 0
    fi
    
    for archive in "$volumes_dir"/*.tar.gz; do
        [[ -f "$archive" ]] || continue
        
        local volume_name
        volume_name="$(basename "$archive" .tar.gz)"
        local full_volume_name="${PROJECT_NAME:-remote-support}_${volume_name}"
        
        print_status "  Restoring volume: $volume_name"
        
        # Create volume if not exists
        ensure_volume "$full_volume_name"
        
        # Restore data
        docker run --rm \
            -v "${full_volume_name}:/data" \
            -v "${volumes_dir}:/backup:ro" \
            alpine sh -c "rm -rf /data/* && tar xzf /backup/${volume_name}.tar.gz -C /data"
        
        print_status "    ✓ Restored"
    done
}

restore_config() {
    local staging="$1"
    local config_backup="${staging}/config"
    
    if [[ ! -d "$config_backup" ]]; then
        print_status "  - No config to restore"
        return 0
    fi
    
    print_status "  Restoring configuration..."
    
    local config_dir
    config_dir="$(get_path config)"
    
    # Backup existing config
    if [[ -d "$config_dir" ]]; then
        mv "$config_dir" "${config_dir}.bak.$(date +%Y%m%d_%H%M%S)"
    fi
    
    cp -r "$config_backup" "$config_dir"
    print_status "    ✓ Configuration restored"
}

restore_ssl() {
    local staging="$1"
    local ssl_backup="${staging}/ssl"
    
    if [[ ! -d "$ssl_backup" ]]; then
        print_status "  - No SSL certificates to restore"
        return 0
    fi
    
    print_status "  Restoring SSL certificates..."
    
    local ssl_dir="$(get_path data)/ssl"
    ensure_dir "$ssl_dir" 0700
    
    cp -r "$ssl_backup"/* "$ssl_dir"/ 2>/dev/null || true
    chmod 600 "$ssl_dir"/*.key 2>/dev/null || true
    
    print_status "    ✓ SSL certificates restored"
}

restore_env() {
    local staging="$1"
    local env_backup="${staging}/env/.env"
    
    if [[ ! -f "$env_backup" ]]; then
        print_status "  - No environment file to restore"
        return 0
    fi
    
    print_status "  Restoring environment..."
    
    local env_file="$(get_path base)/.env"
    
    # Backup existing
    if [[ -f "$env_file" ]]; then
        cp "$env_file" "${env_file}.bak.$(date +%Y%m%d_%H%M%S)"
    fi
    
    cp "$env_backup" "$env_file"
    chmod 600 "$env_file"
    
    print_status "    ✓ Environment restored"
}

# ==============================================================================
# List Backups
# ==============================================================================

list_backups() {
    local backup_dir
    backup_dir="$(get_backup_dir)"
    
    print_status ""
    print_status "Available backups in: $backup_dir"
    print_status "$(printf '%.0s─' {1..60})"
    
    local count=0
    
    while IFS= read -r -d '' file; do
        local filename
        filename="$(basename "$file")"
        
        local size
        size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
        
        local mtime
        mtime=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$file" 2>/dev/null || stat -c "%y" "$file" 2>/dev/null | cut -d. -f1)
        
        local verified=""
        if [[ -f "${file}.sha256" ]]; then
            verified=" ✓"
        fi
        
        printf "  %-45s %8s  %s%s\n" "$filename" "$(format_size "$size")" "$mtime" "$verified"
        count=$((count + 1))
    done < <(find "$backup_dir" -maxdepth 1 -name "*.tar.gz" -type f -print0 | sort -z)
    
    if [[ $count -eq 0 ]]; then
        print_status "  No backups found"
    else
        print_status ""
        print_status "Total: $count backup(s)"
    fi
}

# ==============================================================================
# Prune Backups
# ==============================================================================

prune_backups() {
    local keep="${1:-$BACKUP_KEEP}"
    local backup_dir
    backup_dir="$(get_backup_dir)"
    
    if [[ "$keep" -lt 1 ]]; then
        log_error "Keep count must be at least 1"
        return 1
    fi
    
    # Get list of backups sorted by date (oldest first)
    local backups=()
    while IFS= read -r -d '' file; do
        backups+=("$file")
    done < <(find "$backup_dir" -maxdepth 1 -name "*.tar.gz" -type f -print0 | sort -z)
    
    local total="${#backups[@]}"
    local to_delete=$((total - keep))
    
    if [[ $to_delete -le 0 ]]; then
        [[ "$QUIET_MODE" != "true" ]] && print_status "No backups to prune (have $total, keeping $keep)"
        return 0
    fi
    
    print_status "Pruning $to_delete old backup(s)..."
    
    for ((i=0; i<to_delete; i++)); do
        local file="${backups[$i]}"
        local filename
        filename="$(basename "$file")"
        
        rm -f "$file"
        rm -f "${file}.sha256"
        
        print_status "  Deleted: $filename"
    done
    
    print_status "Kept $keep most recent backup(s)"
}

# ==============================================================================
# Verify Backup
# ==============================================================================

verify_backup() {
    local backup_file="$RESTORE_INPUT"
    
    if [[ -z "$backup_file" ]]; then
        log_error "No backup file specified. Use -i <file>"
        return 1
    fi
    
    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi
    
    print_status ""
    print_status "Verifying: $backup_file"
    print_status "$(printf '%.0s─' {1..50})"
    
    local errors=0
    
    # Check file size
    local size
    size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null)
    print_status "  Size: $(format_size "$size")"
    
    if [[ "$size" -lt 1000 ]]; then
        log_warn "  ⚠ Backup file seems too small"
        errors=$((errors + 1))
    fi
    
    # Verify checksum
    local checksum_file="${backup_file}.sha256"
    if [[ -f "$checksum_file" ]]; then
        local expected
        expected="$(cat "$checksum_file")"
        local actual
        actual="$(sha256sum "$backup_file" | awk '{print $1}')"
        
        if [[ "$expected" == "$actual" ]]; then
            print_status "  ✓ Checksum matches"
        else
            log_error "  ✗ Checksum mismatch!"
            errors=$((errors + 1))
        fi
    else
        print_status "  - No checksum file (cannot verify integrity)"
    fi
    
    # Test archive integrity
    print_status "  Testing archive..."
    if tar -tzf "$backup_file" &>/dev/null; then
        print_status "  ✓ Archive is valid"
    else
        log_error "  ✗ Archive is corrupted!"
        errors=$((errors + 1))
    fi
    
    # List contents
    print_status ""
    print_status "Contents:"
    tar -tzf "$backup_file" | head -20 | while read -r item; do
        print_status "  $item"
    done
    
    local total_files
    total_files=$(tar -tzf "$backup_file" | wc -l)
    print_status "  ... ($total_files total files)"
    
    # Check for required components
    print_status ""
    print_status "Components:"
    
    local has_metadata=false
    local has_volumes=false
    
    if tar -tzf "$backup_file" | grep -q "metadata.json"; then
        print_status "  ✓ Metadata"
        has_metadata=true
    else
        print_status "  - Metadata (missing)"
    fi
    
    if tar -tzf "$backup_file" | grep -q "volumes/"; then
        print_status "  ✓ Volumes"
        has_volumes=true
    else
        print_status "  - Volumes (missing)"
    fi
    
    if tar -tzf "$backup_file" | grep -q "config/"; then
        print_status "  ✓ Configuration"
    else
        print_status "  - Configuration (missing)"
    fi
    
    # Summary
    print_status ""
    if [[ $errors -eq 0 ]]; then
        print_status "Verification: ${C_GREEN}PASSED${C_RESET}"
        return 0
    else
        print_status "Verification: ${C_RED}FAILED${C_RESET} ($errors error(s))"
        return 1
    fi
}

# ==============================================================================
# Main
# ==============================================================================

main() {
    parse_args "$@"
    setup_traps
    
    case "$BACKUP_COMMAND" in
        create)
            create_backup
            ;;
        restore)
            restore_backup
            ;;
        list)
            list_backups
            ;;
        prune)
            prune_backups
            ;;
        verify)
            verify_backup
            ;;
        *)
            log_error "Unknown command: $BACKUP_COMMAND"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
