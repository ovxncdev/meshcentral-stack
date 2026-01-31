#!/usr/bin/env bash
# ==============================================================================
# Security Hardening Script
# ==============================================================================
# Run this after creating your admin account to disable public registration.
#
# Usage:
#   ./scripts/secure.sh
#
# ==============================================================================

set -o errexit
set -o nounset
set -o pipefail

# Colors
C_RED='\033[0;31m'
C_GREEN='\033[0;32m'
C_YELLOW='\033[1;33m'
C_BLUE='\033[0;34m'
C_BOLD='\033[1m'
C_RESET='\033[0m'

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ==============================================================================
# Helper Functions
# ==============================================================================

log_info() {
    echo -e "${C_BLUE}ℹ${C_RESET} $*"
}

log_success() {
    echo -e "${C_GREEN}✓${C_RESET} $*"
}

log_warn() {
    echo -e "${C_YELLOW}⚠${C_RESET} $*"
}

log_error() {
    echo -e "${C_RED}✗${C_RESET} $*" >&2
}

# Docker command with sudo fallback
docker_cmd() {
    if docker info &>/dev/null; then
        docker "$@"
    elif sudo docker info &>/dev/null; then
        sudo docker "$@"
    else
        log_error "Cannot connect to Docker daemon"
        return 1
    fi
}

# Confirm prompt
confirm() {
    local prompt="${1:-Continue?}"
    local default="${2:-n}"
    
    local yn
    if [[ "$default" == "y" ]]; then
        read -r -p "$prompt [Y/n] " yn
        yn="${yn:-y}"
    else
        read -r -p "$prompt [y/N] " yn
        yn="${yn:-n}"
    fi
    
    [[ "$yn" =~ ^[Yy] ]]
}

# ==============================================================================
# Main
# ==============================================================================

main() {
    echo ""
    echo -e "${C_BOLD}${C_BLUE}Security Hardening${C_RESET}"
    echo "$(printf '%.0s─' {1..50})"
    echo ""
    
    # Find container name
    local container
    container=$(docker_cmd ps --format '{{.Names}}' | grep -E 'meshcentral' | head -1)
    
    if [[ -z "$container" ]]; then
        log_error "MeshCentral container is not running"
        echo "Start it with: docker compose up -d"
        exit 1
    fi
    
    log_info "Found container: $container"
    
    # Check current status
    local current_status
    current_status=$(docker_cmd exec "$container" cat /opt/meshcentral/meshcentral-data/config.json 2>/dev/null | grep -o '"newAccounts": [a-z]*' | head -1)
    
    echo "Current setting: $current_status"
    echo ""
    
    if [[ "$current_status" == *"false"* ]]; then
        echo -e "${C_GREEN}✓${C_RESET} New account registration is already DISABLED"
        echo ""
        exit 0
    fi
    
    # Confirm
    echo -e "${C_YELLOW}This will:${C_RESET}"
    echo "  • Disable new account registration"
    echo "  • Only existing users can log in"
    echo "  • Admins can still create users manually"
    echo ""
    
    if ! confirm "Disable new account registration?" "y"; then
        echo "Cancelled."
        exit 0
    fi
    
    # Disable new accounts
    echo ""
    log_info "Disabling new account registration..."
    
    docker_cmd exec "$container" sed -i 's/"newAccounts": true/"newAccounts": false/' /opt/meshcentral/meshcentral-data/config.json
    
    # Restart MeshCentral
    log_info "Restarting MeshCentral..."
    docker_cmd restart "$container" > /dev/null
    
    echo "Waiting for restart..."
    sleep 10
    
    # Verify
    local new_status
    new_status=$(docker_cmd exec "$container" cat /opt/meshcentral/meshcentral-data/config.json 2>/dev/null | grep -o '"newAccounts": [a-z]*' | head -1)
    
    if [[ "$new_status" == *"false"* ]]; then
        echo ""
        echo -e "${C_GREEN}${C_BOLD}✓ Security hardening complete!${C_RESET}"
        echo ""
        echo "  New account registration is now DISABLED."
        echo "  Only admins can create new users from the dashboard."
        echo ""
    else
        log_error "Failed to disable new accounts"
        exit 1
    fi
}

main "$@"
