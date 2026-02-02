#!/usr/bin/env bash
# ==============================================================================
# Setup Script - Remote Support Stack
# ==============================================================================
# Interactive setup wizard for deploying the remote support stack.
#
# Usage:
#   ./scripts/setup.sh [options]
#
# Options:
#   --non-interactive    Run with defaults (for automation)
#   --skip-docker        Skip Docker installation
#   --skip-firewall      Skip firewall configuration
#   --dev                Development mode (self-signed SSL)
#   --help               Show this help
#
# ==============================================================================

set -o errexit
set -o nounset
set -o pipefail

# Get script directory and load libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/core.sh"
source "${SCRIPT_DIR}/lib/docker.sh"
source "${SCRIPT_DIR}/lib/proxy.sh"
source "${SCRIPT_DIR}/lib/ssl.sh"

# ==============================================================================
# Configuration
# ==============================================================================

# Defaults (can be overridden by flags or .env)
INTERACTIVE="${INTERACTIVE:-true}"
SKIP_DOCKER="${SKIP_DOCKER:-false}"
SKIP_FIREWALL="${SKIP_FIREWALL:-false}"
DEV_MODE="${DEV_MODE:-false}"
FORCE_REINSTALL="${FORCE_REINSTALL:-false}"

# Setup state
SETUP_STEP=0
SETUP_TOTAL_STEPS=8

# ==============================================================================
# Cloudflare IP Update (inline fallback)
# ==============================================================================

update_cloudflare_ips_inline() {
    local nginx_conf="$(get_path config)/nginx/sites/meshcentral.conf"
    
    if [[ ! -f "$nginx_conf" ]]; then
        print_warning "Nginx config not found, skipping Cloudflare IP update"
        return 1
    fi
    
    # Fetch IPs from Cloudflare
    local ipv4_ips ipv6_ips
    ipv4_ips=$(curl -s --fail "https://www.cloudflare.com/ips-v4" 2>/dev/null) || return 1
    ipv6_ips=$(curl -s --fail "https://www.cloudflare.com/ips-v6" 2>/dev/null) || return 1
    
    if [[ -z "$ipv4_ips" ]] || [[ -z "$ipv6_ips" ]]; then
        return 1
    fi
    
    # Build new directives
    local new_directives=""
    while IFS= read -r ip; do
        [[ -n "$ip" ]] && new_directives+="set_real_ip_from ${ip};\n"
    done <<< "$ipv4_ips"
    
    new_directives+="# IPv6\n"
    while IFS= read -r ip; do
        [[ -n "$ip" ]] && new_directives+="set_real_ip_from ${ip};\n"
    done <<< "$ipv6_ips"
    
    # Backup and update config
    cp "$nginx_conf" "${nginx_conf}.bak"
    
    # Create temp file with new IPs
    local temp_file=$(mktemp)
    local in_ip_block=false
    local ip_block_done=false
    
    while IFS= read -r line; do
        # Detect first set_real_ip_from line
        if [[ "$line" =~ ^set_real_ip_from ]] && [[ "$ip_block_done" == "false" ]]; then
            in_ip_block=true
            continue
        fi
        
        # Skip lines while in IP block
        if [[ "$in_ip_block" == "true" ]]; then
            if [[ "$line" =~ ^"# IPv6" ]] || [[ "$line" =~ ^set_real_ip_from ]]; then
                continue
            elif [[ "$line" =~ ^real_ip_header ]]; then
                # End of IP block, write new IPs
                echo -e "$new_directives" >> "$temp_file"
                echo "$line" >> "$temp_file"
                in_ip_block=false
                ip_block_done=true
                continue
            fi
        fi
        
        echo "$line" >> "$temp_file"
    done < "$nginx_conf"
    
    mv "$temp_file" "$nginx_conf"
    
    local ipv4_count=$(echo "$ipv4_ips" | wc -l)
    local ipv6_count=$(echo "$ipv6_ips" | wc -l)
    print_success "Updated Cloudflare IPs: $ipv4_count IPv4, $ipv6_count IPv6 ranges"
    
    return 0
}

# ==============================================================================
# Help
# ==============================================================================

show_help() {
    cat << 'EOF'
Remote Support Stack - Setup Script

Usage:
  ./scripts/setup.sh [options]

Options:
  --non-interactive    Run with defaults from .env (for automation)
  --skip-docker        Skip Docker installation (assume already installed)
  --skip-firewall      Skip firewall configuration
  --dev                Development mode (uses self-signed SSL certificate)
  --force              Force reinstall even if already configured
  --clean              Clean up existing installation before setup
  --reinstall          Same as --clean
  --uninstall          Remove all containers and networks (keeps data by default)
  --help, -h           Show this help message

Examples:
  # Interactive setup (recommended for first time)
  ./scripts/setup.sh

  # Clean reinstall (removes old containers first)
  ./scripts/setup.sh --clean

  # Uninstall everything
  ./scripts/setup.sh --uninstall

  # Development/testing setup
  ./scripts/setup.sh --dev

  # Non-interactive with force (removes volumes too)
  ./scripts/setup.sh --clean --force --non-interactive

Environment Variables:
  All configuration can be set in .env file. See .env.example for options.

EOF
}

# ==============================================================================
# Argument Parsing
# ==============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --non-interactive)
                INTERACTIVE=false
                shift
                ;;
            --skip-docker)
                SKIP_DOCKER=true
                shift
                ;;
            --skip-firewall)
                SKIP_FIREWALL=true
                shift
                ;;
            --dev)
                DEV_MODE=true
                shift
                ;;
            --force)
                FORCE_REINSTALL=true
                shift
                ;;
            --clean|--reinstall)
                # Clean up existing installation before setup
                cleanup_existing_installation
                shift
                ;;
            --uninstall)
                # Just uninstall, don't reinstall
                cleanup_existing_installation
                print_success "Uninstallation complete"
                exit 0
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
# Cleanup / Uninstall
# ==============================================================================

cleanup_existing_installation() {
    print_step "Cleaning Up Existing Installation"
    
    local project_name="${PROJECT_NAME:-remote-support}"
    local base_path="${BASE_PATH:-$(pwd)}"
    
    # Check if docker is available
    if ! command -v docker &>/dev/null; then
        print_warning "Docker not found, skipping container cleanup"
        return 0
    fi
    
    # Stop and remove containers using docker compose
    print_info "Stopping containers..."
    if [[ -f "${base_path}/docker-compose.yml" ]]; then
        sudo docker compose -f "${base_path}/docker-compose.yml" down --remove-orphans 2>/dev/null || true
    fi
    
    # Remove any remaining containers with project name
    print_info "Removing project containers..."
    local containers
    containers=$(sudo docker ps -aq --filter "name=${project_name}" 2>/dev/null || true)
    if [[ -n "$containers" ]]; then
        echo "$containers" | xargs -r sudo docker rm -f 2>/dev/null || true
    fi
    
    # Also check for alternate project names
    for alt_name in "meshcentral-stack" "remote-support"; do
        containers=$(sudo docker ps -aq --filter "name=${alt_name}" 2>/dev/null || true)
        if [[ -n "$containers" ]]; then
            echo "$containers" | xargs -r sudo docker rm -f 2>/dev/null || true
        fi
    done
    
    # Remove networks
    print_info "Removing networks..."
    for network in "${project_name}_internal" "${project_name}_external" "meshcentral-stack_internal" "meshcentral-stack_external" "remote-support_internal" "remote-support_external"; do
        sudo docker network rm "$network" 2>/dev/null || true
    done
    sudo docker network prune -f 2>/dev/null || true
    
    # Remove volumes (optional - ask user if interactive)
    local remove_volumes=false
    if [[ "$INTERACTIVE" == "true" ]]; then
        echo ""
        print_warning "Do you want to remove data volumes? This will DELETE ALL DATA!"
        if prompt_yes_no "Remove volumes?" "n"; then
            remove_volumes=true
        fi
    elif [[ "$FORCE_REINSTALL" == "true" ]]; then
        remove_volumes=true
    fi
    
    if [[ "$remove_volumes" == "true" ]]; then
        print_info "Removing volumes..."
        local volumes
        volumes=$(sudo docker volume ls -q | grep -E "${project_name}|meshcentral-stack|remote-support" 2>/dev/null || true)
        if [[ -n "$volumes" ]]; then
            echo "$volumes" | xargs -r sudo docker volume rm 2>/dev/null || true
        fi
    else
        print_info "Keeping data volumes"
    fi
    
    # Clean up dangling resources
    print_info "Cleaning up dangling resources..."
    sudo docker system prune -f 2>/dev/null || true
    
    print_success "Cleanup complete"
}

# ==============================================================================
# UI Helpers
# ==============================================================================

print_banner() {
    echo ""
    echo -e "${C_BOLD}${C_CYAN}"
    cat << 'EOF'
  ____                      _         ____                              _   
 |  _ \ ___ _ __ ___   ___ | |_ ___  / ___| _   _ _ __  _ __   ___  _ __| |_ 
 | |_) / _ \ '_ ` _ \ / _ \| __/ _ \ \___ \| | | | '_ \| '_ \ / _ \| '__| __|
 |  _ <  __/ | | | | | (_) | ||  __/  ___) | |_| | |_) | |_) | (_) | |  | |_ 
 |_| \_\___|_| |_| |_|\___/ \__\___| |____/ \__,_| .__/| .__/ \___/|_|   \__|
                                                 |_|   |_|                   
EOF
    echo -e "${C_RESET}"
    echo -e "${C_GRAY}  Self-hosted remote support powered by MeshCentral${C_RESET}"
    echo ""
}

print_step() {
    SETUP_STEP=$((SETUP_STEP + 1))
    echo ""
    echo -e "${C_BOLD}${C_BLUE}[${SETUP_STEP}/${SETUP_TOTAL_STEPS}] $1${C_RESET}"
    echo -e "${C_GRAY}$(printf '%.0s─' {1..60})${C_RESET}"
}

print_success() {
    echo -e "${C_GREEN}✓${C_RESET} $1"
}

print_warning() {
    echo -e "${C_YELLOW}⚠${C_RESET} $1"
}

print_info() {
    echo -e "${C_CYAN}ℹ${C_RESET} $1"
}

print_error() {
    echo -e "${C_RED}✗${C_RESET} $1" >&2
}

prompt_value() {
    local prompt="$1"
    local default="${2:-}"
    local var_name="$3"
    local secret="${4:-false}"
    
    if [[ "$INTERACTIVE" != "true" ]]; then
        # Non-interactive: use existing value or default
        echo "${!var_name:-$default}"
        return
    fi
    
    local display_default=""
    if [[ -n "$default" ]]; then
        if [[ "$secret" == "true" ]]; then
            display_default=" [****]"
        else
            display_default=" [${default}]"
        fi
    fi
    
    local input
    if [[ "$secret" == "true" ]]; then
        read -rsp "${prompt}${display_default}: " input
        echo ""
    else
        read -rp "${prompt}${display_default}: " input
    fi
    
    echo "${input:-$default}"
}

prompt_yes_no() {
    local prompt="$1"
    local default="${2:-n}"
    
    if [[ "$INTERACTIVE" != "true" ]]; then
        [[ "$default" == "y" ]]
        return
    fi
    
    local choices
    if [[ "$default" == "y" ]]; then
        choices="[Y/n]"
    else
        choices="[y/N]"
    fi
    
    read -rp "${prompt} ${choices}: " response
    response="${response:-$default}"
    
    [[ "$response" =~ ^[Yy] ]]
}

# ==============================================================================
# Pre-flight Checks
# ==============================================================================

check_prerequisites() {
    print_step "Checking Prerequisites"
    
    local errors=()
    
    # Check if running as root or with sudo
    if [[ $EUID -ne 0 ]]; then
        if ! command_exists sudo; then
            errors+=("This script requires root privileges. Please run with sudo.")
        fi
    fi
    
    # Check OS
    local os
    os="$(get_os)"
    if [[ "$os" != "linux" ]]; then
        errors+=("This script is designed for Linux. Detected: $os")
    fi
    
    # Check required commands
    local required_cmds=(curl wget)
    for cmd in "${required_cmds[@]}"; do
        if ! command_exists "$cmd"; then
            errors+=("Required command not found: $cmd")
        fi
    done
    
    # Check available disk space (minimum 5GB)
    local available_space
    available_space=$(df -BG "$(get_path base)" | awk 'NR==2 {print $4}' | tr -d 'G')
    if [[ "${available_space:-0}" -lt 5 ]]; then
        errors+=("Insufficient disk space. Required: 5GB, Available: ${available_space}GB")
    fi
    
    # Check available memory (minimum 1GB)
    local available_mem
    available_mem=$(free -m | awk '/^Mem:/ {print $7}')
    if [[ "${available_mem:-0}" -lt 512 ]]; then
        print_warning "Low available memory: ${available_mem}MB. Recommended: 1024MB+"
    fi
    
    if [[ ${#errors[@]} -gt 0 ]]; then
        log_error "Prerequisites check failed:"
        printf '  - %s\n' "${errors[@]}" >&2
        exit 1
    fi
    
    print_success "All prerequisites met"
    print_info "OS: $(get_distro) | Disk: ${available_space}GB | Memory: ${available_mem}MB"
    
    # Check required ports
    check_required_ports
}

# ==============================================================================
# Port Checking
# ==============================================================================

check_required_ports() {
    print_info "Checking required ports..."
    
    # Default ports used by the stack
    local http_port="${NGINX_HTTP_PORT:-80}"
    local https_port="${NGINX_HTTPS_PORT:-443}"
    
    local ports_to_check=("$http_port:HTTP" "$https_port:HTTPS")
    local blocked_ports=()
    local port_processes=()
    
    for port_info in "${ports_to_check[@]}"; do
        local port="${port_info%%:*}"
        local name="${port_info##*:}"
        
        local process_info
        process_info=$(get_port_process "$port") || true
        
        if [[ -n "$process_info" ]]; then
            blocked_ports+=("$port")
            port_processes+=("$port ($name): $process_info")
        fi
    done
    
    if [[ ${#blocked_ports[@]} -eq 0 ]]; then
        print_success "All required ports are available"
        return 0
    fi
    
    # Ports are blocked - show info and options
    echo ""
    print_warning "The following ports are already in use:"
    echo ""
    for info in "${port_processes[@]}"; do
        echo "  ⚠ $info"
    done
    echo ""
    
    # Offer solutions
    echo "  ┌─────────────────────────────────────────────────────────────────┐"
    echo "  │  Options:                                                       │"
    echo "  │                                                                 │"
    echo "  │  1. Stop the service using the port and retry                   │"
    echo "  │  2. Use different ports for this installation                   │"
    echo "  │  3. Continue anyway (may cause conflicts)                       │"
    echo "  │                                                                 │"
    echo "  └─────────────────────────────────────────────────────────────────┘"
    echo ""
    
    if [[ "$INTERACTIVE" != "true" ]]; then
        print_error "Ports are in use. Run interactively or free the ports first."
        exit 1
    fi
    
    local choice
    echo "  What would you like to do?"
    echo "    1) Stop blocking services and retry"
    echo "    2) Use different ports"
    echo "    3) Continue anyway"
    echo "    4) Exit"
    echo ""
    read -rp "  Select option [1-4]: " choice
    
    case "$choice" in
        1)
            stop_blocking_services "${blocked_ports[@]}"
            # Re-check ports (use || true to prevent errexit)
            check_required_ports || true
            ;;
        2)
            configure_alternate_ports "${blocked_ports[@]}"
            ;;
        3)
            print_warning "Continuing with port conflicts - services may not start correctly"
            ;;
        4|*)
            echo "Setup cancelled."
            exit 0
            ;;
    esac
}

# Get process info using a port
get_port_process() {
    local port="$1"
    local process_info=""
    
    # Method 1: Try ss with sudo
    if command -v ss &>/dev/null; then
        process_info=$(sudo ss -tlnp "sport = :$port" 2>/dev/null | grep -v "State" | grep -oP 'users:\(\("\K[^"]+' | head -1)
    fi
    
    # Method 2: Try netstat with sudo
    if [[ -z "$process_info" ]] && command -v netstat &>/dev/null; then
        process_info=$(sudo netstat -tlnp 2>/dev/null | grep ":$port " | awk '{print $7}' | cut -d'/' -f2 | head -1)
    fi
    
    # Method 3: Try lsof with sudo
    if [[ -z "$process_info" ]] && command -v lsof &>/dev/null; then
        process_info=$(sudo lsof -i ":$port" -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $1}')
    fi
    
    # Method 4: Check common services directly
    if [[ -z "$process_info" ]]; then
        # Check if nginx is running
        if pgrep -x nginx &>/dev/null; then
            # Check if nginx is listening on this port
            if sudo ss -tlnp "sport = :$port" 2>/dev/null | grep -q nginx; then
                process_info="nginx"
            elif sudo netstat -tlnp 2>/dev/null | grep ":$port " | grep -q nginx; then
                process_info="nginx"
            fi
        fi
        
        # Check if apache is running
        if [[ -z "$process_info" ]] && (pgrep -x apache2 &>/dev/null || pgrep -x httpd &>/dev/null); then
            process_info="apache2"
        fi
    fi
    
    # If we found a process, check if it's Docker
    if [[ -n "$process_info" ]]; then
        if [[ "$process_info" == "docker-proxy" ]] || [[ "$process_info" == "docker" ]]; then
            local container_name
            container_name=$(sudo docker ps --format '{{.Names}}' --filter "publish=$port" 2>/dev/null | head -1)
            if [[ -n "$container_name" ]]; then
                echo "Docker container: $container_name"
                return 0
            fi
        fi
        echo "$process_info"
        return 0
    fi
    
    # Last resort: Check if port is actually in use
    if sudo ss -tln | grep -q ":${port} " || sudo netstat -tln 2>/dev/null | grep -q ":${port} "; then
        echo "unknown"
        return 0
    fi
    
    # Port is not in use
    return 1
}

# Check if a port is available
check_port_available() {
    local port="$1"
    
    # Use ss if available (preferred)
    if command -v ss &>/dev/null; then
        if ss -tuln 2>/dev/null | grep -q ":${port} "; then
            return 1  # Port is in use
        fi
        return 0  # Port is available
    fi
    
    # Fallback to netstat
    if command -v netstat &>/dev/null; then
        if netstat -tuln 2>/dev/null | grep -q ":${port} "; then
            return 1  # Port is in use
        fi
        return 0  # Port is available
    fi
    
    # If neither command available, assume port is available
    return 0
}

# Stop services blocking ports
stop_blocking_services() {
    local ports=("$@")
    
    print_info "Attempting to stop blocking services..."
    
    for port in "${ports[@]}"; do
        local process_info
        process_info=$(get_port_process "$port") || true
        
        if [[ -z "$process_info" ]]; then
            print_info "Port $port is now free"
            continue
        fi
        
        # Check if it's a Docker container
        if [[ "$process_info" == Docker* ]]; then
            local container_name="${process_info#Docker container: }"
            print_info "Stopping Docker container: $container_name"
            sudo docker stop "$container_name" 2>/dev/null || true
            continue
        fi
        
        # Check common services
        case "$process_info" in
            nginx)
                print_info "Stopping nginx..."
                sudo systemctl stop nginx 2>/dev/null || sudo service nginx stop 2>/dev/null || sudo pkill nginx 2>/dev/null || true
                sudo systemctl disable nginx 2>/dev/null || true
                ;;
            apache2|httpd)
                print_info "Stopping Apache..."
                sudo systemctl stop apache2 2>/dev/null || sudo systemctl stop httpd 2>/dev/null || sudo service apache2 stop 2>/dev/null || true
                sudo systemctl disable apache2 2>/dev/null || sudo systemctl disable httpd 2>/dev/null || true
                ;;
            caddy)
                print_info "Stopping Caddy..."
                sudo systemctl stop caddy 2>/dev/null || sudo service caddy stop 2>/dev/null || true
                sudo systemctl disable caddy 2>/dev/null || true
                ;;
            unknown|*)
                print_warning "Unknown service on port $port"
                # Try to kill whatever is using the port
                print_info "Attempting to free port $port..."
                sudo fuser -k "${port}/tcp" 2>/dev/null || true
                
                # Also try to stop common services that might be using it
                sudo systemctl stop nginx 2>/dev/null || true
                sudo systemctl stop apache2 2>/dev/null || true
                sudo systemctl stop httpd 2>/dev/null || true
                
                # Disable them so they don't restart
                sudo systemctl disable nginx 2>/dev/null || true
                sudo systemctl disable apache2 2>/dev/null || true
                sudo systemctl disable httpd 2>/dev/null || true
                ;;
        esac
    done
    
    # Give services time to stop
    sleep 3
    print_success "Attempted to stop blocking services"
}

# Configure alternate ports
configure_alternate_ports() {
    local blocked_ports=("$@")
    
    print_info "Configuring alternate ports..."
    echo ""
    
    local env_file="$(get_path base)/.env"
    
    for port in "${blocked_ports[@]}"; do
        local new_port
        local var_name
        
        case "$port" in
            80)
                var_name="NGINX_HTTP_PORT"
                local suggested=$((port + 8000))  # 8080
                ;;
            443)
                var_name="NGINX_HTTPS_PORT"
                local suggested=$((port + 8000))  # 8443
                ;;
            *)
                var_name="PORT_$port"
                local suggested=$((port + 1000))
                ;;
        esac
        
        # Find an available port starting from suggested
        while get_port_process "$suggested" &>/dev/null && [[ -n "$(get_port_process "$suggested")" ]]; do
            ((suggested++))
        done
        
        read -rp "  Enter new port for $port (default: $suggested): " new_port
        new_port="${new_port:-$suggested}"
        
        # Validate port
        if ! [[ "$new_port" =~ ^[0-9]+$ ]] || [[ "$new_port" -lt 1 ]] || [[ "$new_port" -gt 65535 ]]; then
            print_error "Invalid port: $new_port"
            new_port="$suggested"
        fi
        
        # Check if new port is available
        if [[ -n "$(get_port_process "$new_port")" ]]; then
            print_warning "Port $new_port is also in use, using $suggested"
            new_port="$suggested"
        fi
        
        print_info "Using port $new_port instead of $port"
        
        # Update or add to .env file
        if [[ -f "$env_file" ]]; then
            if grep -q "^${var_name}=" "$env_file"; then
                sed -i "s/^${var_name}=.*/${var_name}=${new_port}/" "$env_file"
            else
                echo "${var_name}=${new_port}" >> "$env_file"
            fi
        fi
        
        # Export for current session
        export "$var_name"="$new_port"
    done
    
    echo ""
    print_success "Alternate ports configured"
    
    if [[ " ${blocked_ports[*]} " =~ " 80 " ]] || [[ " ${blocked_ports[*]} " =~ " 443 " ]]; then
        print_warning "Using non-standard ports. Access your site at:"
        [[ -n "${NGINX_HTTP_PORT:-}" ]] && print_info "  HTTP:  http://${SERVER_DOMAIN:-localhost}:${NGINX_HTTP_PORT}"
        [[ -n "${NGINX_HTTPS_PORT:-}" ]] && print_info "  HTTPS: https://${SERVER_DOMAIN:-localhost}:${NGINX_HTTPS_PORT}"
    fi
}

# ==============================================================================
# Docker Installation
# ==============================================================================

install_docker() {
    print_step "Setting Up Docker"
    
    if [[ "$SKIP_DOCKER" == "true" ]]; then
        print_info "Skipping Docker installation (--skip-docker)"
        return 0
    fi
    
    if has_docker && is_docker_running; then
        print_success "Docker is already installed and running"
        print_info "Version: $(get_docker_version)"
        
        if has_compose; then
            print_success "Docker Compose is available"
            print_info "Version: $(get_compose_version)"
        else
            print_warning "Docker Compose not found, installing..."
            install_docker_compose
        fi
        return 0
    fi
    
    if has_docker && ! is_docker_running; then
        print_warning "Docker is installed but not running"
        print_info "Attempting to start Docker..."
        
        sudo systemctl start docker || {
            log_error "Failed to start Docker"
            return 1
        }
        
        sudo systemctl enable docker
        print_success "Docker started and enabled"
        return 0
    fi
    
    # Install Docker
    print_info "Installing Docker..."
    
    local distro
    distro="$(get_distro)"
    
    case "$distro" in
        ubuntu|debian)
            install_docker_debian
            ;;
        centos|rhel|rocky|almalinux|fedora)
            install_docker_rhel
            ;;
        *)
            print_warning "Unknown distro: $distro"
            print_info "Attempting generic Docker installation..."
            install_docker_generic
            ;;
    esac
    
    # Add current user to docker group
    if [[ -n "${SUDO_USER:-}" ]]; then
        sudo usermod -aG docker "$SUDO_USER"
        print_info "Added $SUDO_USER to docker group (re-login required for non-sudo usage)"
    fi
    
    # Start and enable Docker
    sudo systemctl start docker
    sudo systemctl enable docker
    
    print_success "Docker installed successfully"
}

install_docker_debian() {
    # Remove old versions
    sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
    
    # Install prerequisites
    sudo apt-get update
    sudo apt-get install -y \
        ca-certificates \
        curl \
        gnupg \
        lsb-release
    
    # Add Docker GPG key
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/$(get_distro)/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    
    # Add repository
    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$(get_distro) \
        $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
        sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

install_docker_rhel() {
    # Remove old versions
    sudo yum remove -y docker docker-client docker-client-latest docker-common \
        docker-latest docker-latest-logrotate docker-logrotate docker-engine 2>/dev/null || true
    
    # Install prerequisites
    sudo yum install -y yum-utils
    
    # Add repository
    sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    
    # Install Docker
    sudo yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

install_docker_generic() {
    # Use Docker's convenience script
    curl -fsSL https://get.docker.com | sudo sh
}

install_docker_compose() {
    # Docker Compose plugin should be included with modern Docker
    # This is a fallback for older installations
    
    local compose_version="v2.24.0"
    local compose_url="https://github.com/docker/compose/releases/download/${compose_version}/docker-compose-$(uname -s)-$(uname -m)"
    
    sudo curl -L "$compose_url" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
}

# ==============================================================================
# Configuration
# ==============================================================================

configure_environment() {
    print_step "Configuring Environment"
    
    local env_file="$(get_path base)/.env"
    local env_example="$(get_path base)/.env.example"
    
    # Create .env from example if not exists
    if [[ ! -f "$env_file" ]]; then
        if [[ -f "$env_example" ]]; then
            cp "$env_example" "$env_file"
            print_info "Created .env from .env.example"
        else
            log_error ".env.example not found"
            return 1
        fi
    elif [[ "$FORCE_REINSTALL" == "true" ]]; then
        print_warning "Force reinstall: backing up existing .env"
        cp "$env_file" "${env_file}.bak.$(date +%Y%m%d_%H%M%S)"
        cp "$env_example" "$env_file"
    fi
    
    # Load current values
    source "$env_file" 2>/dev/null || true
    
    echo ""
    print_info "Please provide the following configuration values:"
    echo ""
    
    # Domain configuration
    local domain
    domain=$(prompt_value "Domain name (e.g., support.example.com)" "${SERVER_DOMAIN:-}" "SERVER_DOMAIN")
    
    # Validate domain
    if [[ -n "$domain" ]] && ! is_valid_domain "$domain"; then
        if [[ "$domain" != "localhost" ]]; then
            print_warning "Invalid domain format. Using anyway."
        fi
    fi
    
    # Cloudflare proxy detection
    local use_cloudflare="false"
    if [[ "$INTERACTIVE" == "true" ]] && [[ "$domain" != "localhost" ]] && ! is_ip_address "$domain"; then
        echo ""
        echo "  ┌─────────────────────────────────────────────────────────────────┐"
        echo "  │  Are you using Cloudflare as a proxy for this domain?          │"
        echo "  │                                                                 │"
        echo "  │  If yes, make sure to:                                         │"
        echo "  │    • Set SSL mode to 'Full' in Cloudflare dashboard            │"
        echo "  │    • Enable WebSockets in Network settings                     │"
        echo "  │    • Use orange cloud (Proxied) for your DNS A record          │"
        echo "  └─────────────────────────────────────────────────────────────────┘"
        echo ""
        if prompt_yes_no "Are you using Cloudflare proxy?" "n"; then
            use_cloudflare="true"
            print_success "Cloudflare proxy mode enabled"
            print_info "MeshCentral will be configured to trust Cloudflare headers"
            
            # Update Cloudflare IPs in nginx config
            print_info "Fetching latest Cloudflare IP ranges..."
            if [[ -x "${SCRIPT_DIR}/update-cloudflare-ips.sh" ]]; then
                "${SCRIPT_DIR}/update-cloudflare-ips.sh" --non-interactive || {
                    print_warning "Could not update Cloudflare IPs automatically"
                    print_info "You can run ./scripts/update-cloudflare-ips.sh manually later"
                }
            else
                update_cloudflare_ips_inline || {
                    print_warning "Could not update Cloudflare IPs"
                }
            fi
        fi
    fi
    
    # Email for SSL (if not dev mode and not using Cloudflare)
    local email=""
    if [[ "$DEV_MODE" != "true" ]] && [[ "$use_cloudflare" != "true" ]]; then
        email=$(prompt_value "Email for SSL certificate" "${SSL_EMAIL:-}" "SSL_EMAIL")
    fi
    
    # Project name
    local project_name
    project_name=$(prompt_value "Project name (used for containers)" "${PROJECT_NAME:-remote-support}" "PROJECT_NAME")
    project_name=$(sanitize "$project_name" 'a-z0-9-')
    
    # Environment
    local environment="production"
    if [[ "$DEV_MODE" == "true" ]]; then
        environment="development"
    fi
    
    # Generate secrets
    local session_key
    session_key=$(generate_key 64)
    
    # Admin password
    local admin_pass=""
    if prompt_yes_no "Generate random admin password?" "y"; then
        admin_pass=$(generate_password 20)
        print_info "Generated admin password (save this!): ${C_BOLD}${admin_pass}${C_RESET}"
    fi
    
    # Timezone
    local timezone
    timezone=$(prompt_value "Timezone" "${TZ:-UTC}" "TZ")
    
    # Update .env file
    update_env_file "$env_file" "SERVER_DOMAIN" "$domain"
    update_env_file "$env_file" "SSL_EMAIL" "$email"
    update_env_file "$env_file" "PROJECT_NAME" "$project_name"
    update_env_file "$env_file" "ENVIRONMENT" "$environment"
    update_env_file "$env_file" "TZ" "$timezone"
    update_env_file "$env_file" "MESHCENTRAL_SESSION_KEY" "$session_key"
    update_env_file "$env_file" "CLOUDFLARE_PROXY" "$use_cloudflare"
    
    # Set SSL type based on configuration
    if [[ "$DEV_MODE" == "true" ]]; then
        update_env_file "$env_file" "SSL_TYPE" "self-signed"
    elif [[ "$use_cloudflare" == "true" ]]; then
        update_env_file "$env_file" "SSL_TYPE" "self-signed"
        print_info "Using self-signed certificate (Cloudflare will provide trusted SSL to users)"
    else
        update_env_file "$env_file" "SSL_TYPE" "letsencrypt"
    fi
    
    # Export for use in this session
    export CLOUDFLARE_PROXY="$use_cloudflare"
    
    # Reload environment
    load_env "$env_file"
    
    print_success "Environment configured"
    
    # Store admin password for later display
    GENERATED_ADMIN_PASS="$admin_pass"
}

update_env_file() {
    local file="$1"
    local key="$2"
    local value="$3"
    
    if grep -q "^${key}=" "$file"; then
        # Update existing
        sed -i "s|^${key}=.*|${key}=${value}|" "$file"
    else
        # Append
        echo "${key}=${value}" >> "$file"
    fi
}

# ==============================================================================
# Config Files
# ==============================================================================

configure_services() {
    print_step "Configuring Services"
    
    local domain="${SERVER_DOMAIN:-localhost}"
    
    # Configure MeshCentral
    print_info "Configuring MeshCentral..."
    configure_meshcentral "$domain"
    
    # Configure Nginx
    print_info "Configuring Nginx..."
    configure_nginx "$domain"
    
    print_success "Services configured"
}

configure_meshcentral() {
    local domain="$1"
    local config_file="$(get_path config)/meshcentral/config.json"
    
    if [[ ! -f "$config_file" ]]; then
        log_error "MeshCentral config not found: $config_file"
        return 1
    fi
    
    # Update domain in config
    local session_key="${MESHCENTRAL_SESSION_KEY:-$(generate_key 64)}"
    
    # Use sed for JSON modification (jq would be better but may not be installed)
    sed -i "s|YOUR_DOMAIN_OR_IP|${domain}|g" "$config_file"
    sed -i "s|CHANGE_THIS_RANDOM_SESSION_KEY_32_CHARS_MIN|${session_key}|g" "$config_file"
    
    print_success "MeshCentral configured"
}

configure_nginx() {
    local domain="$1"
    local site_config="$(get_path config)/nginx/sites/meshcentral.conf"
    
    if [[ ! -f "$site_config" ]]; then
        log_error "Nginx site config not found: $site_config"
        return 1
    fi
    
    # Update domain in config
    sed -i "s|YOUR_DOMAIN.COM|${domain}|g" "$site_config"
    
    print_success "Nginx configured"
}

# ==============================================================================
# SSL Certificates
# ==============================================================================

# Check if a string is an IP address
is_ip_address() {
    local input="$1"
    # IPv4 pattern
    if [[ "$input" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        return 0
    fi
    # IPv6 pattern (simplified)
    if [[ "$input" =~ ^[0-9a-fA-F:]+$ ]] && [[ "$input" == *:* ]]; then
        return 0
    fi
    return 1
}

setup_ssl() {
    print_step "Setting Up SSL Certificates"
    
    local domain="${SERVER_DOMAIN:-localhost}"
    local ssl_path="$(get_path data)/ssl"
    
    # Use the SSL library for all certificate management
    ssl_setup "$domain" "$ssl_path"
}

# ==============================================================================
# Firewall
# ==============================================================================

configure_firewall() {
    print_step "Configuring Firewall"
    
    if [[ "$SKIP_FIREWALL" == "true" ]]; then
        print_info "Skipping firewall configuration (--skip-firewall)"
        return 0
    fi
    
    # Detect firewall
    if command_exists ufw; then
        configure_ufw
    elif command_exists firewall-cmd; then
        configure_firewalld
    else
        print_warning "No supported firewall found (ufw or firewalld)"
        print_info "Please manually open ports: 80, 443"
        return 0
    fi
}

configure_ufw() {
    print_info "Configuring UFW..."
    
    # Enable UFW if not already
    sudo ufw --force enable
    
    # Allow SSH (important!)
    sudo ufw allow ssh
    
    # Allow HTTP and HTTPS
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    
    # Reload
    sudo ufw reload
    
    print_success "UFW configured"
    sudo ufw status
}

configure_firewalld() {
    print_info "Configuring firewalld..."
    
    # Start firewalld if not running
    sudo systemctl start firewalld
    sudo systemctl enable firewalld
    
    # Allow services
    sudo firewall-cmd --permanent --add-service=http
    sudo firewall-cmd --permanent --add-service=https
    
    # Reload
    sudo firewall-cmd --reload
    
    print_success "Firewalld configured"
    sudo firewall-cmd --list-all
}

# ==============================================================================
# Directory Structure
# ==============================================================================

create_directories() {
    print_step "Creating Directory Structure"
    
    local dirs=(
        "$(get_path data)"
        "$(get_path data)/ssl"
        "$(get_path data)/backups"
        "$(get_path logs)"
        "$(get_path config)"
        "$(get_path web)"
        "$(get_path web)/.well-known/acme-challenge"
    )
    
    for dir in "${dirs[@]}"; do
        ensure_dir "$dir"
        print_success "Created: $dir"
    done
    
    # Set permissions
    chmod 700 "$(get_path data)/ssl"
    chmod 700 "$(get_path data)/backups"
    
    # Create .gitignore for sensitive dirs
    cat > "$(get_path base)/.gitignore" << 'EOF'
# Environment
.env

# Data
data/
logs/

# SSL certificates
*.pem
*.key
*.crt

# Backups
*.tar.gz
*.sql

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
EOF
    
    print_success "Directory structure created"
}

# ==============================================================================
# Start Services
# ==============================================================================

start_services() {
    print_step "Starting Services"
    
    # Validate Docker environment
    if ! validate_docker_env; then
        log_error "Docker environment not ready"
        return 1
    fi
    
    # Check ports are available BEFORE starting anything
    print_info "Verifying ports are available..."
    local http_port="${NGINX_HTTP_PORT:-80}"
    local https_port="${NGINX_HTTPS_PORT:-443}"
    local ports_blocked=false
    
    for port in "$http_port" "$https_port"; do
        if ! check_port_available "$port"; then
            ports_blocked=true
            local process_info
            process_info=$(get_port_process "$port")
            print_warning "Port $port is in use by: ${process_info:-unknown}"
        fi
    done
    
    if [[ "$ports_blocked" == "true" ]]; then
        echo ""
        if [[ "$INTERACTIVE" == "true" ]]; then
            echo "  What would you like to do?"
            echo "    1) Stop blocking services and retry"
            echo "    2) Continue anyway (may fail)"
            echo "    3) Exit"
            echo ""
            local choice
            read -rp "  Select option [1-3]: " choice
            
            case "$choice" in
                1)
                    for port in "$http_port" "$https_port"; do
                        if ! check_port_available "$port"; then
                            stop_blocking_services "$port"
                        fi
                    done
                    sleep 3
                    # Re-check
                    for port in "$http_port" "$https_port"; do
                        if ! check_port_available "$port"; then
                            print_error "Port $port is still in use"
                            return 1
                        fi
                    done
                    print_success "Ports are now available"
                    ;;
                2)
                    print_warning "Continuing with port conflicts..."
                    ;;
                *)
                    echo "Setup cancelled."
                    exit 1
                    ;;
            esac
        else
            print_error "Ports are in use. Please free ports $http_port and $https_port first."
            return 1
        fi
    else
        print_success "All required ports are available"
    fi
    
    # Force cleanup any existing containers that might conflict
    print_info "Cleaning up old containers..."
    local project_name="${PROJECT_NAME:-remote-support}"
    
    # Stop compose project first
    compose down --remove-orphans 2>/dev/null || true
    
    # Force remove ALL containers with project name (handles edge cases)
    local all_project_containers
    all_project_containers=$(sudo docker ps -aq --filter "name=${project_name}" 2>/dev/null)
    if [[ -n "$all_project_containers" ]]; then
        print_info "Force removing all project containers..."
        echo "$all_project_containers" | xargs -r sudo docker rm -f 2>/dev/null || true
    fi
    
    # Also check for common container names that might conflict
    for container_name in "${project_name}-meshcentral" "${project_name}-nginx" "${project_name}-admin" "${project_name}-notifications" "${project_name}-certbot" "${project_name}-uptime-kuma" "${project_name}-dozzle" "${project_name}-fail2ban" "meshcentral-stack-meshcentral-1" "meshcentral-stack-nginx-1" "meshcentral-stack-admin-1" "meshcentral-stack-notifications-1" "remote-support-admin" "remote-support-notifications"; do
        if sudo docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${container_name}$"; then
            print_info "Removing conflicting container: $container_name"
            sudo docker rm -f "$container_name" 2>/dev/null || true
        fi
    done
    
    # Clean up orphaned networks (including from different project names)
    print_info "Cleaning up old networks..."
    for network_name in "remote-support_internal" "remote-support_external" "meshcentral-stack_internal" "meshcentral-stack_external" "${project_name}_internal" "${project_name}_external"; do
        if sudo docker network ls --format '{{.Name}}' 2>/dev/null | grep -q "^${network_name}$"; then
            print_info "Removing old network: $network_name"
            sudo docker network rm "$network_name" 2>/dev/null || true
        fi
    done
    sudo docker network prune -f 2>/dev/null || true
    
    # Clean up orphaned volumes that might cause issues
    print_info "Checking for orphaned volumes..."
    sudo docker volume prune -f 2>/dev/null || true
    
    # Pull images
    print_info "Pulling Docker images..."
    compose pull 2>/dev/null || true
    
    # Build custom images
    print_info "Building custom images..."
    compose build --no-cache 2>/dev/null || true
    
    # Final port check before starting
    for port in "$http_port" "$https_port"; do
        if ! check_port_available "$port"; then
            print_error "Port $port became unavailable during setup"
            local process_info
            process_info=$(get_port_process "$port")
            print_error "Currently used by: ${process_info:-unknown}"
            return 1
        fi
    done
    
    # Start services with force recreate to avoid conflicts
    print_info "Starting containers..."
    
    # Use profile to control nginx
    local compose_args="up -d --force-recreate --remove-orphans"
    if [[ "${NGINX_PROFILE:-default}" == "disabled" ]] || [[ "$USE_BUNDLED_NGINX" == "false" ]]; then
        print_info "Skipping bundled nginx (using external proxy)"
        # Start without nginx by excluding it
        compose up -d --force-recreate --remove-orphans meshcentral admin notifications
    else
        compose $compose_args
    fi
    
    # Wait for services
    print_info "Waiting for services to be ready..."
    sleep 15
    
    # Check health - only check nginx if we're using bundled
    local healthy=true
    local services_to_check=("meshcentral")
    
    if [[ "${NGINX_PROFILE:-default}" != "disabled" ]] && [[ "$USE_BUNDLED_NGINX" != "false" ]]; then
        services_to_check+=("nginx")
    fi
    
    for service in "${services_to_check[@]}"; do
        local container="${PROJECT_NAME:-remote-support}-${service}"
        local status
        status=$(container_status "$container")
        
        if [[ "$status" == "running" ]]; then
            print_success "$service is running"
        else
            print_warning "$service status: $status"
            healthy=false
        fi
    done
    
    # Also check admin and notifications
    for service in admin notifications; do
        local container="${PROJECT_NAME:-remote-support}-${service}"
        local status
        status=$(container_status "$container")
        
        if [[ "$status" == "running" ]]; then
            print_success "$service is running"
        fi
    done
    
    if [[ "$healthy" == "true" ]]; then
        print_success "All services started"
    else
        print_warning "Some services may not be ready yet"
        print_info "Check logs with: sudo docker compose logs -f"
    fi
}

# ==============================================================================
# Completion
# ==============================================================================

print_completion() {
    print_step "Setup Complete!"
    
    local domain="${SERVER_DOMAIN:-localhost}"
    local protocol="https"
    
    echo ""
    echo -e "${C_GREEN}${C_BOLD}════════════════════════════════════════════════════════════${C_RESET}"
    echo -e "${C_GREEN}${C_BOLD}  Installation Complete!${C_RESET}"
    echo -e "${C_GREEN}${C_BOLD}════════════════════════════════════════════════════════════${C_RESET}"
    echo ""
    
    print_kv "Access URL" "${protocol}://${domain}"
    print_kv "Domain" "$domain"
    print_kv "Project" "${PROJECT_NAME:-remote-support}"
    
    if [[ -n "${GENERATED_ADMIN_PASS:-}" ]]; then
        echo ""
        echo -e "${C_YELLOW}${C_BOLD}Generated Admin Password:${C_RESET}"
        echo -e "  ${C_BOLD}${GENERATED_ADMIN_PASS}${C_RESET}"
        echo -e "  ${C_GRAY}(Save this password - it won't be shown again!)${C_RESET}"
    fi
    
    echo ""
    echo -e "${C_CYAN}Service URLs:${C_RESET}"
    echo "  MeshCentral:      ${protocol}://${domain}"
    echo "  Admin Dashboard:  ${protocol}://${domain}/admin-settings"
    echo "  Support Portal:   ${protocol}://${domain}/support"
    
    echo ""
    echo -e "${C_CYAN}Next Steps:${C_RESET}"
    echo "  1. Open ${protocol}://${domain} in your browser"
    echo "  2. Create your admin account"
    echo "  3. Configure settings at ${protocol}://${domain}/admin-settings"
    echo "  4. Customize branding, notifications, etc."
    echo "  5. Download and deploy agents"
    
    echo ""
    echo -e "${C_CYAN}Useful Commands:${C_RESET}"
    echo "  View logs:       sudo docker compose logs -f"
    echo "  Stop services:   sudo docker compose down"
    echo "  Restart:         sudo docker compose restart"
    echo "  Update:          ./scripts/update.sh"
    echo "  Backup:          ./scripts/backup.sh"
    
    if [[ "$DEV_MODE" == "true" ]]; then
        echo ""
        print_warning "Development mode: Using self-signed certificate"
        print_info "Your browser will show a security warning - this is expected"
    fi
    
    if [[ "${CLOUDFLARE_PROXY:-false}" == "true" ]]; then
        echo ""
        echo -e "${C_YELLOW}${C_BOLD}Cloudflare Configuration Checklist:${C_RESET}"
        echo "  □ DNS A record points to your server IP with orange cloud (Proxied)"
        echo "  □ SSL/TLS mode set to 'Full' (not Flexible, not Full Strict)"
        echo "  □ WebSockets enabled in Network settings"
        echo ""
        print_info "If you see 'Unable to connect web socket' after login:"
        print_info "  → Enable WebSockets in Cloudflare Dashboard → Network → WebSockets"
    fi
    
    echo ""
}

# ==============================================================================
# Main
# ==============================================================================

main() {
    # Parse arguments
    parse_args "$@"
    
    # Setup traps
    setup_traps
    
    # Print banner
    print_banner
    
    # Confirm before proceeding
    if [[ "$INTERACTIVE" == "true" ]]; then
        echo "This script will install and configure the Remote Support stack."
        echo ""
        if ! prompt_yes_no "Continue with setup?" "y"; then
            echo "Setup cancelled."
            exit 0
        fi
    fi
    
    # Run setup steps
    check_prerequisites
    install_docker
    create_directories
    detect_and_configure_proxy    # NEW: Detect existing proxy environment
    configure_environment
    configure_services
    setup_ssl
    configure_firewall
    start_services
    print_completion
}

# ==============================================================================
# Proxy Detection and Configuration
# ==============================================================================

detect_and_configure_proxy() {
    print_step "Detecting Proxy Environment"
    
    # Detect existing proxy
    detect_proxy_environment
    
    # If external proxy found, configure integration
    if [[ "$PROXY_TYPE" != "none" ]] && [[ "$PROXY_TYPE" != "bundled" ]]; then
        echo ""
        print_info "Detected existing proxy: $PROXY_TYPE"
        
        if [[ "$INTERACTIVE" == "true" ]]; then
            echo ""
            echo "  Options:"
            echo "    1) Use existing proxy (recommended if you have SSL configured)"
            echo "    2) Stop existing proxy and use bundled nginx"
            echo ""
            
            local choice
            read -rp "  Select option [1-2] (default: 2): " choice
            choice="${choice:-2}"
            
            if [[ "$choice" == "1" ]]; then
                print_info "Will integrate with existing proxy"
                configure_proxy_integration
                
                # Set environment variable to skip bundled nginx
                export NGINX_PROFILE="disabled"
                export USE_BUNDLED_NGINX="false"
            else
                print_info "Will use bundled nginx"
                PROXY_TYPE="none"
                USE_BUNDLED_NGINX=true
                export NGINX_PROFILE="default"
                export USE_BUNDLED_NGINX="true"
                
                # Stop the existing service
                print_info "Stopping existing proxy service..."
                stop_existing_proxy
            fi
        else
            # Non-interactive: use bundled nginx by default (simpler)
            print_info "Non-interactive mode: using bundled nginx"
            PROXY_TYPE="none"
            USE_BUNDLED_NGINX=true
            export NGINX_PROFILE="default"
            export USE_BUNDLED_NGINX="true"
            stop_existing_proxy
        fi
    else
        print_info "No existing proxy detected - will use bundled nginx"
        USE_BUNDLED_NGINX=true
        export NGINX_PROFILE="default"
        export USE_BUNDLED_NGINX="true"
    fi
    
    print_success "Proxy configuration complete"
}

# Stop existing proxy services
stop_existing_proxy() {
    print_info "Stopping existing proxy services..."
    
    # Stop host nginx
    if systemctl is-active --quiet nginx 2>/dev/null; then
        print_info "Stopping and disabling host nginx..."
        sudo systemctl stop nginx 2>/dev/null || true
        sudo systemctl disable nginx 2>/dev/null || true
    fi
    
    # Also try to stop it via service command
    sudo service nginx stop 2>/dev/null || true
    
    # Kill any remaining nginx processes
    sudo pkill -9 nginx 2>/dev/null || true
    
    # Stop host apache
    if systemctl is-active --quiet apache2 2>/dev/null || systemctl is-active --quiet httpd 2>/dev/null; then
        print_info "Stopping and disabling Apache..."
        sudo systemctl stop apache2 2>/dev/null || sudo systemctl stop httpd 2>/dev/null || true
        sudo systemctl disable apache2 2>/dev/null || sudo systemctl disable httpd 2>/dev/null || true
    fi
    
    # Stop host caddy
    if systemctl is-active --quiet caddy 2>/dev/null; then
        print_info "Stopping and disabling Caddy..."
        sudo systemctl stop caddy 2>/dev/null || true
        sudo systemctl disable caddy 2>/dev/null || true
    fi
    
    # Free ports 80 and 443 using fuser
    print_info "Freeing ports 80 and 443..."
    sudo fuser -k 80/tcp 2>/dev/null || true
    sudo fuser -k 443/tcp 2>/dev/null || true
    
    # Give time for processes to stop
    sleep 3
    
    # Verify ports are free
    local port_80_free=true
    local port_443_free=true
    
    if sudo ss -tln | grep -q ":80 "; then
        port_80_free=false
        print_warning "Port 80 is still in use"
    fi
    
    if sudo ss -tln | grep -q ":443 "; then
        port_443_free=false
        print_warning "Port 443 is still in use"
    fi
    
    if [[ "$port_80_free" == "true" ]] && [[ "$port_443_free" == "true" ]]; then
        print_success "Ports 80 and 443 are now available"
    else
        print_warning "Some ports may still be in use - setup will try to proceed"
    fi
}

# Handle port conflicts when user wants to use bundled nginx
handle_port_conflict() {
    local http_port="${NGINX_HTTP_PORT:-80}"
    local https_port="${NGINX_HTTPS_PORT:-443}"
    
    for port in "$http_port" "$https_port"; do
        if ! check_port_available "$port"; then
            local process_info
            process_info=$(get_port_process "$port") || true
            
            print_warning "Port $port is in use by: ${process_info:-unknown}"
            
            if [[ "$INTERACTIVE" == "true" ]]; then
                if prompt_yes_no "Stop the service using port $port?" "y"; then
                    stop_blocking_services "$port"
                    sleep 2
                else
                    print_info "Using alternate port for $port"
                    configure_alternate_ports "$port"
                fi
            else
                print_error "Port $port is in use. Cannot proceed in non-interactive mode."
                exit 1
            fi
        fi
    done
}

# Run main
main "$@"
