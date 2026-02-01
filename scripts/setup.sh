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
  --help, -h           Show this help message

Examples:
  # Interactive setup (recommended for first time)
  ./scripts/setup.sh

  # Automated setup with existing .env
  ./scripts/setup.sh --non-interactive

  # Development/testing setup
  ./scripts/setup.sh --dev

  # Skip Docker if already installed
  ./scripts/setup.sh --skip-docker

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
        process_info=$(get_port_process "$port")
        
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
            # Re-check ports
            check_required_ports
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
    
    if command -v ss &>/dev/null; then
        process_info=$(ss -tlnp "sport = :$port" 2>/dev/null | grep -v "State" | awk '{print $6}' | grep -oP 'users:\("\K[^"]+' | head -1)
    elif command -v netstat &>/dev/null; then
        process_info=$(sudo netstat -tlnp 2>/dev/null | grep ":$port " | awk '{print $7}' | cut -d'/' -f2 | head -1)
    elif command -v lsof &>/dev/null; then
        process_info=$(sudo lsof -i ":$port" -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $1}')
    fi
    
    # If we found a process, try to get more details
    if [[ -n "$process_info" ]]; then
        # Check if it's a docker container
        if [[ "$process_info" == "docker-proxy" ]] || [[ "$process_info" == "docker" ]]; then
            local container_name
            container_name=$(sudo docker ps --format '{{.Names}}' --filter "publish=$port" 2>/dev/null | head -1)
            if [[ -n "$container_name" ]]; then
                echo "Docker container: $container_name"
                return 0
            fi
        fi
        echo "$process_info"
    fi
}

# Stop services blocking ports
stop_blocking_services() {
    local ports=("$@")
    
    print_info "Attempting to stop blocking services..."
    
    for port in "${ports[@]}"; do
        local process_info
        process_info=$(get_port_process "$port")
        
        if [[ -z "$process_info" ]]; then
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
                sudo systemctl stop nginx 2>/dev/null || sudo service nginx stop 2>/dev/null || true
                ;;
            apache2|httpd)
                print_info "Stopping Apache..."
                sudo systemctl stop apache2 2>/dev/null || sudo systemctl stop httpd 2>/dev/null || sudo service apache2 stop 2>/dev/null || true
                ;;
            caddy)
                print_info "Stopping Caddy..."
                sudo systemctl stop caddy 2>/dev/null || sudo service caddy stop 2>/dev/null || true
                ;;
            *)
                print_warning "Unknown service '$process_info' on port $port"
                print_info "Please stop it manually: sudo kill \$(sudo lsof -t -i:$port)"
                
                if prompt_yes_no "Try to kill process on port $port?" "n"; then
                    sudo kill $(sudo lsof -t -i:"$port") 2>/dev/null || true
                    sleep 2
                fi
                ;;
        esac
    done
    
    # Give services time to stop
    sleep 2
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
    
    # Email for SSL (if not dev mode)
    local email=""
    if [[ "$DEV_MODE" != "true" ]]; then
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
    
    if [[ "$DEV_MODE" == "true" ]]; then
        update_env_file "$env_file" "SSL_TYPE" "self-signed"
    else
        update_env_file "$env_file" "SSL_TYPE" "letsencrypt"
    fi
    
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
    local ssl_type="${SSL_TYPE:-auto}"
    local ssl_path="$(get_path data)/ssl"
    
    ensure_dir "$ssl_path" 0700
    
    # ===========================================================================
    # Step 1: Check for existing certificates in our directory
    # ===========================================================================
    
    if [[ -f "${ssl_path}/cert.pem" ]] && [[ -f "${ssl_path}/key.pem" ]]; then
        if [[ "$FORCE_REINSTALL" != "true" ]]; then
            print_info "Found existing certificate in ${ssl_path}"
            if verify_certificate "${ssl_path}/cert.pem" "$domain"; then
                print_success "Existing certificate is valid for ${domain}"
                configure_nginx_ssl "${ssl_path}/cert.pem" "${ssl_path}/key.pem" "$domain"
                return 0
            else
                print_warning "Existing certificate not valid for ${domain}, searching for valid certificate..."
            fi
        fi
    fi
    
    # ===========================================================================
    # Step 2: Scan system for valid certificates
    # ===========================================================================
    
    print_info "Scanning system for existing SSL certificates..."
    
    local found_cert=""
    local found_key=""
    
    scan_for_certificates "$domain" found_cert found_key || true
    
    if [[ -n "$found_cert" ]] && [[ -n "$found_key" ]]; then
        print_success "Found valid certificate!"
        print_info "  Certificate: $found_cert"
        print_info "  Key: $found_key"
        
        # Copy to our ssl directory
        cp "$found_cert" "${ssl_path}/cert.pem"
        cp "$found_key" "${ssl_path}/key.pem"
        chmod 644 "${ssl_path}/cert.pem"
        chmod 600 "${ssl_path}/key.pem"
        
        configure_nginx_ssl "${ssl_path}/cert.pem" "${ssl_path}/key.pem" "$domain"
        print_success "Using existing certificate"
        return 0
    fi
    
    # ===========================================================================
    # Step 3: No existing cert found - determine how to get one
    # ===========================================================================
    
    print_info "No existing valid certificate found for ${domain}"
    
    # Force self-signed if domain is an IP address
    if is_ip_address "$domain"; then
        if [[ "$ssl_type" == "letsencrypt" ]]; then
            print_warning "Let's Encrypt does not support IP addresses"
            print_info "Automatically using self-signed certificate for IP: $domain"
        fi
        ssl_type="self-signed"
    fi
    
    # Force self-signed for localhost
    if [[ "$domain" == "localhost" ]]; then
        ssl_type="self-signed"
    fi
    
    # Auto-detect: try Let's Encrypt first if email provided
    if [[ "$ssl_type" == "auto" ]]; then
        if [[ -n "${SSL_EMAIL:-}" ]]; then
            ssl_type="letsencrypt"
        else
            ssl_type="self-signed"
        fi
    fi
    
    if [[ "$ssl_type" == "self-signed" ]] || [[ "$DEV_MODE" == "true" ]]; then
        generate_self_signed_cert "$domain" "$ssl_path"
    elif [[ "$ssl_type" == "letsencrypt" ]]; then
        setup_letsencrypt "$domain"
    else
        print_warning "Unknown SSL type: $ssl_type"
        print_info "Generating self-signed certificate..."
        generate_self_signed_cert "$domain" "$ssl_path"
    fi
}

# ==============================================================================
# Certificate Scanner - Searches entire system for valid certificates
# ==============================================================================

scan_for_certificates() {
    local domain="$1"
    local -n _found_cert=$2
    local -n _found_key=$3
    
    _found_cert=""
    _found_key=""
    
    # Common certificate directories to scan
    local search_paths=(
        "/etc/letsencrypt/live"
        "/etc/ssl/certs"
        "/etc/ssl/private"
        "/etc/nginx/ssl"
        "/etc/nginx/certs"
        "/etc/apache2/ssl"
        "/etc/pki/tls/certs"
        "/etc/pki/tls/private"
        "/opt/ssl"
        "/opt/certs"
        "/var/lib/letsencrypt"
        "/root/.acme.sh"
        "$HOME/.acme.sh"
        "/etc/caddy/certs"
        "$HOME/.local/share/caddy/certificates"
        "/data/ssl"
        "/data/certs"
    )
    
    # Add Docker volume paths
    local docker_volumes=$(docker volume ls --format '{{.Name}}' 2>/dev/null | grep -iE "cert|ssl|letsencrypt|acme|tls" || true)
    for vol in $docker_volumes; do
        local vol_path=$(docker volume inspect "$vol" --format '{{.Mountpoint}}' 2>/dev/null || true)
        if [[ -n "$vol_path" ]]; then
            search_paths+=("$vol_path")
        fi
    done
    
    print_info "Searching ${#search_paths[@]} locations for certificates..."
    
    local found_certs=()
    local cert_info=""
    
    # Search each path
    for search_path in "${search_paths[@]}"; do
        [[ ! -d "$search_path" ]] && continue
        
        # Find all certificate files
        while IFS= read -r -d '' cert_file; do
            # Skip if not readable
            [[ ! -r "$cert_file" ]] && continue
            
            # Verify it's actually a certificate
            if ! openssl x509 -noout -in "$cert_file" 2>/dev/null; then
                continue
            fi
            
            # Check if valid for our domain
            if verify_certificate "$cert_file" "$domain"; then
                # Find corresponding private key
                local key_file=""
                key_file=$(find_matching_key "$cert_file" "$search_path")
                
                if [[ -n "$key_file" ]]; then
                    # Get certificate details for display
                    local expiry=$(openssl x509 -noout -enddate -in "$cert_file" 2>/dev/null | cut -d= -f2)
                    local issuer=$(openssl x509 -noout -issuer -in "$cert_file" 2>/dev/null | sed 's/.*CN = //' | cut -d',' -f1)
                    
                    found_certs+=("$cert_file|$key_file|$expiry|$issuer")
                fi
            fi
        done < <(find "$search_path" -type f \( -name "*.pem" -o -name "*.crt" -o -name "*.cer" -o -name "fullchain*" -o -name "cert*" \) -print0 2>/dev/null)
    done
    
    # If we found certificates, let user choose or auto-select best one
    if [[ ${#found_certs[@]} -gt 0 ]]; then
        print_success "Found ${#found_certs[@]} valid certificate(s) for ${domain}:"
        echo ""
        
        local best_cert=""
        local best_key=""
        local best_expiry=0
        local idx=1
        
        for cert_entry in "${found_certs[@]}"; do
            IFS='|' read -r cert_file key_file expiry issuer <<< "$cert_entry"
            
            # Calculate days until expiry
            local expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || echo 0)
            local now_epoch=$(date +%s)
            local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
            
            echo "  [$idx] $cert_file"
            echo "      Key: $key_file"
            echo "      Issuer: $issuer"
            echo "      Expires: $expiry ($days_left days)"
            echo ""
            
            # Track the certificate with the longest validity
            if [[ $expiry_epoch -gt $best_expiry ]]; then
                best_expiry=$expiry_epoch
                best_cert="$cert_file"
                best_key="$key_file"
            fi
            
            ((idx++))
        done
        
        # In non-interactive mode, use the best certificate
        if [[ "$INTERACTIVE" != "true" ]] || [[ ${#found_certs[@]} -eq 1 ]]; then
            _found_cert="$best_cert"
            _found_key="$best_key"
            print_info "Auto-selecting certificate with longest validity"
        else
            # Interactive mode - let user choose
            echo ""
            local choice
            read -p "  Select certificate [1-$((idx-1))] or press Enter for best: " choice
            
            if [[ -z "$choice" ]]; then
                _found_cert="$best_cert"
                _found_key="$best_key"
            elif [[ "$choice" =~ ^[0-9]+$ ]] && [[ $choice -ge 1 ]] && [[ $choice -lt $idx ]]; then
                IFS='|' read -r _found_cert _found_key _ _ <<< "${found_certs[$((choice-1))]}"
            else
                _found_cert="$best_cert"
                _found_key="$best_key"
            fi
        fi
        
        return 0
    fi
    
    # No certificates found - show help
    print_info "No valid certificates found for ${domain}"
    return 1
}

# Find the matching private key for a certificate
find_matching_key() {
    local cert_file="$1"
    local search_path="$2"
    
    # Get the certificate's public key modulus
    local cert_modulus=$(openssl x509 -noout -modulus -in "$cert_file" 2>/dev/null | md5sum | cut -d' ' -f1)
    [[ -z "$cert_modulus" ]] && return 1
    
    # Common key file patterns
    local key_patterns=(
        "privkey*.pem"
        "*.key"
        "*key*.pem"
        "private*.pem"
    )
    
    # First, check same directory as cert
    local cert_dir=$(dirname "$cert_file")
    
    for pattern in "${key_patterns[@]}"; do
        for key_file in "$cert_dir"/$pattern; do
            [[ ! -f "$key_file" ]] && continue
            [[ ! -r "$key_file" ]] && continue
            
            local key_modulus=$(openssl rsa -noout -modulus -in "$key_file" 2>/dev/null | md5sum | cut -d' ' -f1)
            if [[ "$cert_modulus" == "$key_modulus" ]]; then
                echo "$key_file"
                return 0
            fi
        done
    done
    
    # Search broader path
    while IFS= read -r -d '' key_file; do
        [[ ! -r "$key_file" ]] && continue
        
        local key_modulus=$(openssl rsa -noout -modulus -in "$key_file" 2>/dev/null | md5sum | cut -d' ' -f1)
        if [[ "$cert_modulus" == "$key_modulus" ]]; then
            echo "$key_file"
            return 0
        fi
    done < <(find "$search_path" -type f \( -name "*.key" -o -name "privkey*" -o -name "*private*" \) -print0 2>/dev/null)
    
    return 1
}

# Verify certificate is valid for domain
verify_certificate() {
    local cert_file="$1"
    local domain="$2"
    
    if [[ ! -f "$cert_file" ]]; then
        return 1
    fi
    
    # Check if certificate is not expired (must be valid for at least 1 day)
    if ! openssl x509 -checkend 86400 -noout -in "$cert_file" 2>/dev/null; then
        return 1
    fi
    
    # Extract domains from certificate
    local cert_cn=$(openssl x509 -noout -subject -in "$cert_file" 2>/dev/null | grep -oP 'CN\s*=\s*\K[^,/]+' || true)
    local cert_sans=$(openssl x509 -noout -text -in "$cert_file" 2>/dev/null | grep -A1 "Subject Alternative Name" | tail -1 | tr ',' '\n' | grep -oE "DNS:[^ ]+" | sed 's/DNS://' || true)
    
    local all_domains="$cert_cn $cert_sans"
    
    # Check exact match
    if echo "$all_domains" | grep -qwF "$domain"; then
        return 0
    fi
    
    # Check wildcard match (*.example.com matches sub.example.com)
    local parent_domain="${domain#*.}"
    if echo "$all_domains" | grep -qE "\*\.${parent_domain}( |$)"; then
        return 0
    fi
    
    # Check if domain is subdomain and wildcard covers it
    # e.g., domain=app.example.com, cert has *.example.com
    local base_domain=$(echo "$domain" | rev | cut -d. -f1-2 | rev)
    if echo "$all_domains" | grep -qE "\*\.${base_domain}( |$)"; then
        return 0
    fi
    
    return 1
}

# Configure nginx to use the SSL certificate
configure_nginx_ssl() {
    local cert_file="$1"
    local key_file="$2"
    local domain="$3"
    
    local site_config="$(get_path config)/nginx/sites/meshcentral.conf"
    
    # Update nginx config to use our cert
    sed -i "s|ssl_certificate .*|ssl_certificate /etc/nginx/ssl/cert.pem;|g" "$site_config" 2>/dev/null || true
    sed -i "s|ssl_certificate_key .*|ssl_certificate_key /etc/nginx/ssl/key.pem;|g" "$site_config" 2>/dev/null || true
    
    # Also update any Let's Encrypt paths
    sed -i "s|/etc/letsencrypt/live/${domain}/fullchain.pem|/etc/nginx/ssl/cert.pem|g" "$site_config" 2>/dev/null || true
    sed -i "s|/etc/letsencrypt/live/${domain}/privkey.pem|/etc/nginx/ssl/key.pem|g" "$site_config" 2>/dev/null || true
    sed -i "s|/etc/letsencrypt/live/[^/]*/fullchain.pem|/etc/nginx/ssl/cert.pem|g" "$site_config" 2>/dev/null || true
    sed -i "s|/etc/letsencrypt/live/[^/]*/privkey.pem|/etc/nginx/ssl/key.pem|g" "$site_config" 2>/dev/null || true
}

generate_self_signed_cert() {
    local domain="$1"
    local ssl_path="$2"
    
    print_info "Generating self-signed certificate for: $domain"
    
    local cert_file="${ssl_path}/cert.pem"
    local key_file="${ssl_path}/key.pem"
    
    if [[ -f "$cert_file" ]] && [[ -f "$key_file" ]] && [[ "$FORCE_REINSTALL" != "true" ]]; then
        print_info "SSL certificate already exists"
        configure_nginx_ssl "$cert_file" "$key_file" "$domain"
        return 0
    fi
    
    # Generate cert with SAN for compatibility
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$key_file" \
        -out "$cert_file" \
        -subj "/CN=${domain}/O=Remote Support/C=US" \
        -addext "subjectAltName=DNS:${domain},DNS:localhost,IP:127.0.0.1" \
        2>/dev/null || \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$key_file" \
        -out "$cert_file" \
        -subj "/CN=${domain}/O=Remote Support/C=US" \
        2>/dev/null
    
    chmod 600 "$key_file"
    chmod 644 "$cert_file"
    
    configure_nginx_ssl "$cert_file" "$key_file" "$domain"
    
    print_success "Self-signed certificate generated"
    print_warning "Browser will show security warning (expected for self-signed)"
}

setup_letsencrypt() {
    local domain="$1"
    local email="${SSL_EMAIL:-}"
    
    print_info "Setting up Let's Encrypt for: $domain"
    
    if [[ -z "$email" ]]; then
        print_error "SSL_EMAIL is required for Let's Encrypt"
        echo ""
        echo "  To use Let's Encrypt, set SSL_EMAIL in your .env file:"
        echo "    SSL_EMAIL=your@email.com"
        echo ""
        echo "  Or run setup with:"
        echo "    SSL_EMAIL=your@email.com ./scripts/setup.sh"
        echo ""
        print_info "Falling back to self-signed certificate..."
        generate_self_signed_cert "$domain" "$(get_path data)/ssl"
        return 0
    fi
    
    # Ensure web root exists for ACME challenge
    local webroot="$(get_path web)/.well-known/acme-challenge"
    ensure_dir "$webroot"
    
    # Check if port 80 is available
    if ! check_port_available 80; then
        print_warning "Port 80 is in use. Let's Encrypt requires port 80 for verification."
        print_info "Falling back to self-signed certificate..."
        generate_self_signed_cert "$domain" "$(get_path data)/ssl"
        return 0
    fi
    
    # Start nginx temporarily for ACME challenge
    print_info "Starting Nginx for certificate challenge..."
    compose up -d nginx
    
    # Wait for nginx to be ready
    local retries=10
    while [[ $retries -gt 0 ]]; do
        if curl -s -o /dev/null -w "%{http_code}" "http://localhost/.well-known/acme-challenge/" 2>/dev/null | grep -q "403\|404\|200"; then
            break
        fi
        sleep 2
        ((retries--))
    done
    
    if [[ $retries -eq 0 ]]; then
        print_warning "Nginx did not start properly for ACME challenge"
        print_info "Falling back to self-signed certificate..."
        generate_self_signed_cert "$domain" "$(get_path data)/ssl"
        return 0
    fi
    
    # Request certificate
    print_info "Requesting certificate from Let's Encrypt..."
    
    local certbot_output
    certbot_output=$(compose run --rm certbot certonly \
        --webroot \
        --webroot-path=/var/www/html \
        --email "$email" \
        --agree-tos \
        --no-eff-email \
        --non-interactive \
        -d "$domain" 2>&1) || true
    
    # Check if successful
    if echo "$certbot_output" | grep -q "Successfully received certificate\|Congratulations"; then
        print_success "SSL certificate obtained from Let's Encrypt!"
        
        # Copy to our ssl directory
        local le_path="/etc/letsencrypt/live/${domain}"
        if [[ -f "${le_path}/fullchain.pem" ]]; then
            cp "${le_path}/fullchain.pem" "$(get_path data)/ssl/cert.pem"
            cp "${le_path}/privkey.pem" "$(get_path data)/ssl/key.pem"
        fi
        
        configure_nginx_ssl "$(get_path data)/ssl/cert.pem" "$(get_path data)/ssl/key.pem" "$domain"
        setup_ssl_renewal
        return 0
    fi
    
    # Certificate request failed
    print_warning "Failed to obtain Let's Encrypt certificate"
    echo ""
    
    if echo "$certbot_output" | grep -qi "unauthorized\|invalid response\|404"; then
        print_error "Domain verification failed"
        echo ""
        echo "  Possible causes:"
        echo "  • DNS not pointing to this server"
        echo "  • Port 80 blocked by firewall"
        echo "  • Another service handling port 80"
        echo ""
    elif echo "$certbot_output" | grep -qi "rate limit"; then
        print_error "Let's Encrypt rate limit reached"
        echo "  Wait an hour and try again."
        echo ""
    fi
    
    show_certificate_help "$domain"
    
    print_info "Falling back to self-signed certificate..."
    generate_self_signed_cert "$domain" "$(get_path data)/ssl"
}

show_certificate_help() {
    local domain="$1"
    echo ""
    echo "  ┌─────────────────────────────────────────────────────────────────┐"
    echo "  │  How to Use an Existing Certificate                             │"
    echo "  ├─────────────────────────────────────────────────────────────────┤"
    echo "  │                                                                 │"
    echo "  │  Copy your certificate files to:                                │"
    echo "  │    $(get_path data)/ssl/cert.pem   (certificate + chain)        │"
    echo "  │    $(get_path data)/ssl/key.pem    (private key)                │"
    echo "  │                                                                 │"
    echo "  │  Then restart:                                                  │"
    echo "  │    sudo docker compose restart nginx                            │"
    echo "  │                                                                 │"
    echo "  └─────────────────────────────────────────────────────────────────┘"
    echo ""
}

check_port_available() {
    local port="$1"
    if command -v ss &>/dev/null; then
        ! ss -tuln | grep -q ":${port} "
    elif command -v netstat &>/dev/null; then
        ! netstat -tuln | grep -q ":${port} "
    else
        return 0
    fi
}

setup_ssl_renewal() {
    print_info "Setting up automatic certificate renewal..."
    
    local cron_cmd="0 0 * * * cd $(get_path base) && docker compose run --rm certbot renew --quiet && docker compose exec nginx nginx -s reload"
    
    (crontab -l 2>/dev/null | grep -v "certbot renew"; echo "$cron_cmd") | crontab -
    
    print_success "Auto-renewal configured (daily check)"
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
    
    # Start services with force recreate to avoid conflicts
    print_info "Starting containers..."
    compose up -d --force-recreate --remove-orphans
    
    # Wait for services
    print_info "Waiting for services to be ready..."
    sleep 15
    
    # Check health
    local healthy=true
    for service in meshcentral nginx; do
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
    configure_environment
    configure_services
    setup_ssl
    configure_firewall
    start_services
    print_completion
}

# Run main
main "$@"
