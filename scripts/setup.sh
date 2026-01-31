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

setup_ssl() {
    print_step "Setting Up SSL Certificates"
    
    local domain="${SERVER_DOMAIN:-localhost}"
    local ssl_type="${SSL_TYPE:-self-signed}"
    local ssl_path="$(get_path data)/ssl"
    
    ensure_dir "$ssl_path" 0700
    
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

generate_self_signed_cert() {
    local domain="$1"
    local ssl_path="$2"
    
    print_info "Generating self-signed certificate for: $domain"
    
    local cert_file="${ssl_path}/cert.pem"
    local key_file="${ssl_path}/key.pem"
    
    if [[ -f "$cert_file" ]] && [[ -f "$key_file" ]] && [[ "$FORCE_REINSTALL" != "true" ]]; then
        print_info "SSL certificate already exists"
        return 0
    fi
    
    # Generate cert with IP in SAN for direct IP access
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$key_file" \
        -out "$cert_file" \
        -subj "/CN=${domain}/O=Remote Support/C=US" \
        -addext "subjectAltName=DNS:${domain},DNS:localhost,IP:127.0.0.1,IP:${domain}" \
        2>/dev/null || \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$key_file" \
        -out "$cert_file" \
        -subj "/CN=${domain}/O=Remote Support/C=US" \
        2>/dev/null
    
    chmod 600 "$key_file"
    chmod 644 "$cert_file"
    
    # NOTE: docker-compose.yml mounts this cert to both nginx and meshcentral
    # This ensures agent certificate hash matches between nginx and meshcentral
    
    # Update nginx config to use self-signed cert
    local site_config="$(get_path config)/nginx/sites/meshcentral.conf"
    sed -i "s|/etc/letsencrypt/live/${domain}/fullchain.pem|/etc/nginx/ssl/cert.pem|g" "$site_config"
    sed -i "s|/etc/letsencrypt/live/${domain}/privkey.pem|/etc/nginx/ssl/key.pem|g" "$site_config"
    
    print_success "Self-signed certificate generated"
    print_warning "Browser will show security warning (expected for self-signed)"
}

setup_letsencrypt() {
    local domain="$1"
    local email="${SSL_EMAIL:-}"
    
    print_info "Setting up Let's Encrypt for: $domain"
    
    if [[ -z "$email" ]]; then
        log_error "SSL_EMAIL is required for Let's Encrypt"
        return 1
    fi
    
    # Ensure web root exists
    local webroot="$(get_path web)/.well-known/acme-challenge"
    ensure_dir "$webroot"
    
    # Start nginx temporarily for ACME challenge
    print_info "Starting Nginx for certificate challenge..."
    compose up -d nginx
    
    sleep 5
    
    # Request certificate
    print_info "Requesting certificate..."
    compose run --rm certbot certonly \
        --webroot \
        --webroot-path=/var/www/html \
        --email "$email" \
        --agree-tos \
        --no-eff-email \
        --non-interactive \
        -d "$domain"
    
    if [[ $? -eq 0 ]]; then
        print_success "SSL certificate obtained"
        
        # Setup auto-renewal cron
        setup_ssl_renewal
    else
        print_warning "Failed to obtain Let's Encrypt certificate"
        print_info "Falling back to self-signed certificate..."
        generate_self_signed_cert "$domain" "$(get_path data)/ssl"
    fi
}

setup_ssl_renewal() {
    print_info "Setting up automatic certificate renewal..."
    
    local cron_cmd="0 0 * * * cd $(get_path base) && docker compose run --rm certbot renew --quiet && docker compose exec nginx nginx -s reload"
    
    # Add to crontab if not already present
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
    for container_name in "${project_name}-meshcentral" "${project_name}-nginx" "${project_name}-certbot" "${project_name}-uptime-kuma" "${project_name}-dozzle" "${project_name}-fail2ban" "meshcentral-stack-meshcentral-1" "meshcentral-stack-nginx-1"; do
        if sudo docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${container_name}"; then
            print_info "Removing container: $container_name"
            sudo docker rm -f "$container_name" 2>/dev/null || true
        fi
    done
    
    # Clean up orphaned networks
    sudo docker network prune -f 2>/dev/null || true
    
    # Pull images
    print_info "Pulling Docker images..."
    compose pull
    
    # Start services
    print_info "Starting containers..."
    compose up -d
    
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
