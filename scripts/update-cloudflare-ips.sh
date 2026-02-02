#!/usr/bin/env bash
# ==============================================================================
# Update Cloudflare IPs Script
# ==============================================================================
# Fetches the latest Cloudflare IP ranges and updates the nginx config.
# Run this periodically or before deployment to ensure IPs are current.
#
# Usage:
#   ./scripts/update-cloudflare-ips.sh
#
# Cloudflare IP sources:
#   https://www.cloudflare.com/ips-v4
#   https://www.cloudflare.com/ips-v6
# ==============================================================================

set -o errexit
set -o nounset
set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Options
NON_INTERACTIVE="${NON_INTERACTIVE:-false}"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
NGINX_CONF="${BASE_DIR}/config/nginx/sites/meshcentral.conf"

# Cloudflare IP endpoints
CF_IPV4_URL="https://www.cloudflare.com/ips-v4"
CF_IPV6_URL="https://www.cloudflare.com/ips-v6"

# ==============================================================================
# Argument Parsing
# ==============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --non-interactive|-n)
                NON_INTERACTIVE=true
                shift
                ;;
            --help|-h)
                echo "Usage: $0 [options]"
                echo ""
                echo "Options:"
                echo "  --non-interactive, -n  Run without prompts (auto-restart nginx)"
                echo "  --help, -h             Show this help"
                exit 0
                ;;
            *)
                shift
                ;;
        esac
    done
}

# ==============================================================================
# Functions
# ==============================================================================

print_info() {
    echo -e "${CYAN}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1" >&2
}

fetch_cloudflare_ips() {
    print_info "Fetching Cloudflare IP ranges..."
    
    # Fetch IPv4
    local ipv4_ips
    ipv4_ips=$(curl -s --fail "$CF_IPV4_URL") || {
        print_error "Failed to fetch IPv4 ranges from Cloudflare"
        return 1
    }
    
    # Fetch IPv6
    local ipv6_ips
    ipv6_ips=$(curl -s --fail "$CF_IPV6_URL") || {
        print_error "Failed to fetch IPv6 ranges from Cloudflare"
        return 1
    }
    
    # Validate we got something
    if [[ -z "$ipv4_ips" ]] || [[ -z "$ipv6_ips" ]]; then
        print_error "Empty response from Cloudflare"
        return 1
    fi
    
    # Count IPs
    local ipv4_count=$(echo "$ipv4_ips" | wc -l)
    local ipv6_count=$(echo "$ipv6_ips" | wc -l)
    
    print_success "Fetched $ipv4_count IPv4 and $ipv6_count IPv6 ranges"
    
    # Export for use
    CF_IPV4_LIST="$ipv4_ips"
    CF_IPV6_LIST="$ipv6_ips"
}

generate_nginx_directives() {
    local output=""
    
    # IPv4
    while IFS= read -r ip; do
        [[ -n "$ip" ]] && output+="set_real_ip_from ${ip};\n"
    done <<< "$CF_IPV4_LIST"
    
    # IPv6
    output+="# IPv6\n"
    while IFS= read -r ip; do
        [[ -n "$ip" ]] && output+="set_real_ip_from ${ip};\n"
    done <<< "$CF_IPV6_LIST"
    
    echo -e "$output"
}

update_nginx_config() {
    print_info "Updating nginx config: $NGINX_CONF"
    
    if [[ ! -f "$NGINX_CONF" ]]; then
        print_error "Nginx config not found: $NGINX_CONF"
        return 1
    fi
    
    # Backup original
    local backup="${NGINX_CONF}.bak.$(date +%Y%m%d_%H%M%S)"
    cp "$NGINX_CONF" "$backup"
    print_info "Backup created: $backup"
    
    # Generate new directives
    local new_directives
    new_directives=$(generate_nginx_directives)
    
    # Create temp file with updated content
    local temp_file=$(mktemp)
    
    # Use awk to replace the Cloudflare IP block
    awk -v new_ips="$new_directives" '
    BEGIN { in_cf_block = 0; printed = 0 }
    
    # Detect start of Cloudflare IP block
    /^# Cloudflare Real IP Configuration|^# ==* *$/ && /Cloudflare/ {
        in_cf_block = 1
        print
        next
    }
    
    # First set_real_ip_from after header starts the IP list
    /^set_real_ip_from/ && !printed {
        # Skip all set_real_ip_from lines and IPv6 comment
        while ((getline line) > 0) {
            if (line !~ /^set_real_ip_from/ && line !~ /^# IPv6/) {
                # Print new IPs then continue with this line
                printf "%s", new_ips
                print "real_ip_header CF-Connecting-IP;"
                printed = 1
                if (line !~ /^real_ip_header/) {
                    print line
                }
                break
            }
        }
        next
    }
    
    # Skip old real_ip_header if we already printed new one
    /^real_ip_header CF-Connecting-IP/ && printed { next }
    
    # Print all other lines
    { print }
    ' "$NGINX_CONF" > "$temp_file"
    
    # If awk approach didn't work well, use simpler sed approach
    if ! grep -q "set_real_ip_from" "$temp_file"; then
        print_warning "Using fallback update method..."
        
        # Extract everything before the Cloudflare block
        local start_marker="# Cloudflare Real IP Configuration"
        local end_marker="real_ip_header CF-Connecting-IP;"
        
        # Build new config
        {
            # Get content before Cloudflare IPs section
            sed -n "1,/^set_real_ip_from/{ /^set_real_ip_from/!p }" "$NGINX_CONF"
            
            # Add new IPs
            echo -e "$new_directives"
            echo "real_ip_header CF-Connecting-IP;"
            
            # Get content after real_ip_header
            sed -n '/^real_ip_header CF-Connecting-IP;/,${/^real_ip_header CF-Connecting-IP;/!p}' "$NGINX_CONF"
        } > "$temp_file"
    fi
    
    # Validate the new config has content
    if [[ ! -s "$temp_file" ]]; then
        print_error "Generated config is empty, aborting"
        rm -f "$temp_file"
        return 1
    fi
    
    # Replace original
    mv "$temp_file" "$NGINX_CONF"
    
    print_success "Nginx config updated"
}

validate_nginx_config() {
    print_info "Validating nginx config..."
    
    # Check if nginx is available (either system or docker)
    if command -v nginx &>/dev/null; then
        if nginx -t -c "$NGINX_CONF" 2>/dev/null; then
            print_success "Nginx config is valid"
            return 0
        fi
    fi
    
    # Try with docker
    if command -v docker &>/dev/null; then
        if docker run --rm -v "${NGINX_CONF}:/etc/nginx/conf.d/test.conf:ro" nginx:alpine nginx -t 2>/dev/null; then
            print_success "Nginx config is valid (checked via Docker)"
            return 0
        fi
    fi
    
    print_warning "Could not validate nginx config (nginx not available)"
    print_info "Please test manually after restarting services"
    return 0
}

restart_nginx() {
    print_info "Checking if nginx container is running..."
    
    if ! command -v docker &>/dev/null; then
        print_warning "Docker not found, please restart nginx manually"
        return 0
    fi
    
    # Find nginx container
    local container
    container=$(docker ps --format '{{.Names}}' | grep -E "nginx" | head -1)
    
    if [[ -n "$container" ]]; then
        print_info "Restarting container: $container"
        docker restart "$container" >/dev/null
        print_success "Nginx restarted"
    else
        print_warning "Nginx container not running, no restart needed"
    fi
}

show_current_ips() {
    echo ""
    print_info "Current Cloudflare IPs in config:"
    grep "set_real_ip_from" "$NGINX_CONF" 2>/dev/null | head -20
    echo "..."
}

# ==============================================================================
# Main
# ==============================================================================

main() {
    # Parse arguments
    parse_args "$@"
    
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  Cloudflare IP Updater${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # Check for required tools
    if ! command -v curl &>/dev/null; then
        print_error "curl is required but not installed"
        exit 1
    fi
    
    # Fetch latest IPs
    fetch_cloudflare_ips || exit 1
    
    # Update nginx config
    update_nginx_config || exit 1
    
    # Validate
    validate_nginx_config
    
    # Restart nginx (auto if non-interactive)
    if [[ "$NON_INTERACTIVE" == "true" ]]; then
        restart_nginx
    else
        echo ""
        read -rp "Restart nginx container to apply changes? [y/N]: " response
        if [[ "$response" =~ ^[Yy] ]]; then
            restart_nginx
        else
            print_info "Remember to restart nginx manually: docker compose restart nginx"
        fi
    fi
    
    echo ""
    print_success "Cloudflare IPs updated successfully!"
    echo ""
}

# Run main
main "$@"
