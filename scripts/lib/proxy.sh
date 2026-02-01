#!/usr/bin/env bash
# ==============================================================================
# Proxy Detection and Integration Library
# ==============================================================================
# Detects existing reverse proxies and integrates with them, or falls back
# to running our own nginx.
#
# Supported scenarios:
#   1. Docker nginx-proxy (jwilder/nginx-proxy)
#   2. Docker Traefik
#   3. Docker Caddy
#   4. Host nginx (systemd)
#   5. Host Apache (systemd)
#   6. Host Caddy (systemd)
#   7. No proxy - use our own nginx
#
# Usage:
#   source scripts/lib/proxy.sh
#   detect_proxy_environment
#   configure_proxy_integration
#
# ==============================================================================

# Proxy detection result
PROXY_TYPE=""           # docker-nginx-proxy, docker-traefik, docker-caddy, host-nginx, host-apache, host-caddy, none
PROXY_CONTAINER=""      # Container name if Docker-based
PROXY_NETWORK=""        # Docker network to join
PROXY_CONFIG_PATH=""    # Path to proxy config (for host proxies)
USE_BUNDLED_NGINX=true  # Whether to use our bundled nginx

# ==============================================================================
# Detection Functions
# ==============================================================================

# Main detection function - call this first
detect_proxy_environment() {
    print_info "Detecting proxy environment..."
    
    PROXY_TYPE=""
    PROXY_CONTAINER=""
    PROXY_NETWORK=""
    USE_BUNDLED_NGINX=true
    
    # Check Docker-based proxies first
    if detect_docker_nginx_proxy; then
        return 0
    fi
    
    if detect_docker_traefik; then
        return 0
    fi
    
    if detect_docker_caddy; then
        return 0
    fi
    
    # Check host-based proxies
    if detect_host_nginx; then
        return 0
    fi
    
    if detect_host_apache; then
        return 0
    fi
    
    if detect_host_caddy; then
        return 0
    fi
    
    # No proxy found
    PROXY_TYPE="none"
    USE_BUNDLED_NGINX=true
    print_info "No existing proxy detected - will use bundled nginx"
    return 0
}

# Detect jwilder/nginx-proxy or nginx-proxy/nginx-proxy
detect_docker_nginx_proxy() {
    local containers
    containers=$(sudo docker ps --format '{{.Names}}:{{.Image}}' 2>/dev/null | grep -iE "nginx-proxy|nginxproxy" | head -1)
    
    if [[ -n "$containers" ]]; then
        PROXY_CONTAINER="${containers%%:*}"
        PROXY_TYPE="docker-nginx-proxy"
        USE_BUNDLED_NGINX=false
        
        # Find the network
        PROXY_NETWORK=$(sudo docker inspect "$PROXY_CONTAINER" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null | head -1)
        
        print_success "Found Docker nginx-proxy: $PROXY_CONTAINER"
        print_info "  Network: ${PROXY_NETWORK:-default}"
        return 0
    fi
    return 1
}

# Detect Traefik
detect_docker_traefik() {
    local containers
    containers=$(sudo docker ps --format '{{.Names}}:{{.Image}}' 2>/dev/null | grep -i "traefik" | head -1)
    
    if [[ -n "$containers" ]]; then
        PROXY_CONTAINER="${containers%%:*}"
        PROXY_TYPE="docker-traefik"
        USE_BUNDLED_NGINX=false
        
        # Find the network
        PROXY_NETWORK=$(sudo docker inspect "$PROXY_CONTAINER" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null | head -1)
        
        print_success "Found Docker Traefik: $PROXY_CONTAINER"
        print_info "  Network: ${PROXY_NETWORK:-default}"
        return 0
    fi
    return 1
}

# Detect Caddy in Docker
detect_docker_caddy() {
    local containers
    containers=$(sudo docker ps --format '{{.Names}}:{{.Image}}' 2>/dev/null | grep -i "caddy" | grep -v "meshcentral\|remote-support" | head -1)
    
    if [[ -n "$containers" ]]; then
        PROXY_CONTAINER="${containers%%:*}"
        PROXY_TYPE="docker-caddy"
        USE_BUNDLED_NGINX=false
        
        PROXY_NETWORK=$(sudo docker inspect "$PROXY_CONTAINER" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null | head -1)
        
        print_success "Found Docker Caddy: $PROXY_CONTAINER"
        print_info "  Network: ${PROXY_NETWORK:-default}"
        return 0
    fi
    return 1
}

# Detect host nginx
detect_host_nginx() {
    # Check if nginx is running as a system service (not in Docker)
    if systemctl is-active --quiet nginx 2>/dev/null; then
        # Make sure it's not a Docker process
        local nginx_pid
        nginx_pid=$(pgrep -x nginx | head -1)
        if [[ -n "$nginx_pid" ]]; then
            # Check if it's in a container
            if ! grep -q docker /proc/"$nginx_pid"/cgroup 2>/dev/null; then
                PROXY_TYPE="host-nginx"
                USE_BUNDLED_NGINX=false
                PROXY_CONFIG_PATH="/etc/nginx"
                
                print_success "Found host nginx (systemd)"
                print_info "  Config: $PROXY_CONFIG_PATH"
                return 0
            fi
        fi
    fi
    
    # Also check if nginx is listening on port 80 (even if not systemd managed)
    if command -v nginx &>/dev/null; then
        if pgrep -x nginx &>/dev/null; then
            local nginx_pid
            nginx_pid=$(pgrep -x nginx | head -1)
            if ! grep -q docker /proc/"$nginx_pid"/cgroup 2>/dev/null; then
                PROXY_TYPE="host-nginx"
                USE_BUNDLED_NGINX=false
                PROXY_CONFIG_PATH="/etc/nginx"
                
                print_success "Found host nginx (standalone)"
                return 0
            fi
        fi
    fi
    
    return 1
}

# Detect host Apache
detect_host_apache() {
    if systemctl is-active --quiet apache2 2>/dev/null || systemctl is-active --quiet httpd 2>/dev/null; then
        PROXY_TYPE="host-apache"
        USE_BUNDLED_NGINX=false
        
        if [[ -d "/etc/apache2" ]]; then
            PROXY_CONFIG_PATH="/etc/apache2"
        else
            PROXY_CONFIG_PATH="/etc/httpd"
        fi
        
        print_success "Found host Apache"
        print_info "  Config: $PROXY_CONFIG_PATH"
        return 0
    fi
    return 1
}

# Detect host Caddy
detect_host_caddy() {
    if systemctl is-active --quiet caddy 2>/dev/null; then
        PROXY_TYPE="host-caddy"
        USE_BUNDLED_NGINX=false
        PROXY_CONFIG_PATH="/etc/caddy"
        
        print_success "Found host Caddy"
        print_info "  Config: $PROXY_CONFIG_PATH"
        return 0
    fi
    return 1
}

# ==============================================================================
# Integration Functions
# ==============================================================================

# Main integration function - configures the detected proxy
configure_proxy_integration() {
    local domain="${SERVER_DOMAIN:-localhost}"
    local meshcentral_port="${MESHCENTRAL_INTERNAL_PORT:-80}"
    
    print_info "Configuring proxy integration..."
    
    case "$PROXY_TYPE" in
        docker-nginx-proxy)
            configure_nginx_proxy_integration "$domain"
            ;;
        docker-traefik)
            configure_traefik_integration "$domain"
            ;;
        docker-caddy)
            configure_docker_caddy_integration "$domain"
            ;;
        host-nginx)
            configure_host_nginx_integration "$domain"
            ;;
        host-apache)
            configure_host_apache_integration "$domain"
            ;;
        host-caddy)
            configure_host_caddy_integration "$domain"
            ;;
        none|*)
            configure_bundled_nginx "$domain"
            ;;
    esac
}

# Configure for jwilder/nginx-proxy
configure_nginx_proxy_integration() {
    local domain="$1"
    
    print_info "Configuring for nginx-proxy..."
    
    # nginx-proxy uses environment variables on the target container
    # We need to add VIRTUAL_HOST and LETSENCRYPT_HOST to meshcentral service
    
    local env_additions="
# nginx-proxy integration
VIRTUAL_HOST=${domain}
VIRTUAL_PORT=80
LETSENCRYPT_HOST=${domain}
LETSENCRYPT_EMAIL=${SSL_EMAIL:-admin@${domain}}
"
    
    # Update .env file
    local env_file="$(get_path base)/.env"
    echo "" >> "$env_file"
    echo "# Proxy Integration (nginx-proxy)" >> "$env_file"
    echo "PROXY_TYPE=docker-nginx-proxy" >> "$env_file"
    echo "PROXY_NETWORK=${PROXY_NETWORK}" >> "$env_file"
    echo "USE_BUNDLED_NGINX=false" >> "$env_file"
    echo "VIRTUAL_HOST=${domain}" >> "$env_file"
    echo "LETSENCRYPT_HOST=${domain}" >> "$env_file"
    
    print_success "nginx-proxy integration configured"
    print_info "MeshCentral will be accessible at https://${domain}"
}

# Configure for Traefik
configure_traefik_integration() {
    local domain="$1"
    
    print_info "Configuring for Traefik..."
    
    # Traefik uses labels on containers
    local env_file="$(get_path base)/.env"
    echo "" >> "$env_file"
    echo "# Proxy Integration (Traefik)" >> "$env_file"
    echo "PROXY_TYPE=docker-traefik" >> "$env_file"
    echo "PROXY_NETWORK=${PROXY_NETWORK}" >> "$env_file"
    echo "USE_BUNDLED_NGINX=false" >> "$env_file"
    echo "TRAEFIK_HOST=${domain}" >> "$env_file"
    
    print_success "Traefik integration configured"
    print_info "MeshCentral will be accessible at https://${domain}"
}

# Configure for Docker Caddy
configure_docker_caddy_integration() {
    local domain="$1"
    
    print_info "Configuring for Docker Caddy..."
    
    local env_file="$(get_path base)/.env"
    echo "" >> "$env_file"
    echo "# Proxy Integration (Docker Caddy)" >> "$env_file"
    echo "PROXY_TYPE=docker-caddy" >> "$env_file"
    echo "PROXY_NETWORK=${PROXY_NETWORK}" >> "$env_file"
    echo "USE_BUNDLED_NGINX=false" >> "$env_file"
    
    print_success "Docker Caddy integration configured"
    print_warning "You may need to manually add MeshCentral to your Caddyfile"
    show_caddy_config_example "$domain"
}

# Configure for host nginx
configure_host_nginx_integration() {
    local domain="$1"
    
    print_info "Configuring for host nginx..."
    
    # Create nginx config file for MeshCentral
    local nginx_config="/etc/nginx/sites-available/meshcentral"
    local nginx_enabled="/etc/nginx/sites-enabled/meshcentral"
    
    # Generate the config
    local config_content
    config_content=$(generate_nginx_upstream_config "$domain")
    
    # Try to write the config
    if echo "$config_content" | sudo tee "$nginx_config" > /dev/null 2>&1; then
        # Enable the site
        sudo ln -sf "$nginx_config" "$nginx_enabled" 2>/dev/null || true
        
        # Test nginx config
        if sudo nginx -t 2>/dev/null; then
            sudo systemctl reload nginx 2>/dev/null || sudo nginx -s reload 2>/dev/null
            print_success "Host nginx configured"
            print_info "Config written to: $nginx_config"
        else
            print_warning "Nginx config test failed"
            print_info "Please check: $nginx_config"
        fi
    else
        print_warning "Could not write nginx config automatically"
        show_nginx_config_example "$domain"
    fi
    
    # Update .env
    local env_file="$(get_path base)/.env"
    echo "" >> "$env_file"
    echo "# Proxy Integration (Host nginx)" >> "$env_file"
    echo "PROXY_TYPE=host-nginx" >> "$env_file"
    echo "USE_BUNDLED_NGINX=false" >> "$env_file"
}

# Configure for host Apache
configure_host_apache_integration() {
    local domain="$1"
    
    print_info "Configuring for host Apache..."
    
    print_warning "Automatic Apache configuration not implemented"
    show_apache_config_example "$domain"
    
    # Update .env
    local env_file="$(get_path base)/.env"
    echo "" >> "$env_file"
    echo "# Proxy Integration (Host Apache)" >> "$env_file"
    echo "PROXY_TYPE=host-apache" >> "$env_file"
    echo "USE_BUNDLED_NGINX=false" >> "$env_file"
}

# Configure for host Caddy
configure_host_caddy_integration() {
    local domain="$1"
    
    print_info "Configuring for host Caddy..."
    
    print_warning "Automatic Caddy configuration not implemented"
    show_caddy_config_example "$domain"
    
    # Update .env
    local env_file="$(get_path base)/.env"
    echo "" >> "$env_file"
    echo "# Proxy Integration (Host Caddy)" >> "$env_file"
    echo "PROXY_TYPE=host-caddy" >> "$env_file"
    echo "USE_BUNDLED_NGINX=false" >> "$env_file"
}

# Configure bundled nginx (default)
configure_bundled_nginx() {
    local domain="$1"
    
    print_info "Using bundled nginx..."
    
    # Update .env
    local env_file="$(get_path base)/.env"
    if ! grep -q "^USE_BUNDLED_NGINX=" "$env_file" 2>/dev/null; then
        echo "" >> "$env_file"
        echo "# Proxy Configuration" >> "$env_file"
        echo "PROXY_TYPE=bundled" >> "$env_file"
        echo "USE_BUNDLED_NGINX=true" >> "$env_file"
    fi
    
    USE_BUNDLED_NGINX=true
    print_success "Bundled nginx will be used"
}

# ==============================================================================
# Config Generation Helpers
# ==============================================================================

# Generate nginx upstream config for host nginx
generate_nginx_upstream_config() {
    local domain="$1"
    local meshcentral_host="127.0.0.1"
    local meshcentral_port="8080"  # We'll expose MeshCentral on this port
    
    cat << EOF
# MeshCentral Reverse Proxy Configuration
# Generated by meshcentral-stack setup

upstream meshcentral_backend {
    server ${meshcentral_host}:${meshcentral_port};
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${domain};
    
    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${domain};
    
    # SSL Configuration - update paths as needed
    ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
    
    # SSL Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    
    # Proxy settings for MeshCentral
    location / {
        proxy_pass http://meshcentral_backend;
        proxy_http_version 1.1;
        
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # WebSocket support
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Admin Dashboard
    location /admin-settings/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Prefix /admin-settings;
    }
    
    location /admin-settings/api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
}

# Show example configs when auto-config fails
show_nginx_config_example() {
    local domain="$1"
    echo ""
    echo "  ┌─────────────────────────────────────────────────────────────────┐"
    echo "  │  Manual nginx Configuration Required                            │"
    echo "  ├─────────────────────────────────────────────────────────────────┤"
    echo "  │                                                                 │"
    echo "  │  Add this to /etc/nginx/sites-available/meshcentral:            │"
    echo "  │                                                                 │"
    echo "  │  server {                                                       │"
    echo "  │      listen 443 ssl;                                            │"
    echo "  │      server_name ${domain};                                     │"
    echo "  │                                                                 │"
    echo "  │      location / {                                               │"
    echo "  │          proxy_pass http://127.0.0.1:8080;                      │"
    echo "  │          proxy_http_version 1.1;                                │"
    echo "  │          proxy_set_header Upgrade \$http_upgrade;               │"
    echo "  │          proxy_set_header Connection \"upgrade\";               │"
    echo "  │          proxy_set_header Host \$host;                          │"
    echo "  │      }                                                          │"
    echo "  │  }                                                              │"
    echo "  │                                                                 │"
    echo "  │  Then: sudo ln -s /etc/nginx/sites-available/meshcentral \\     │"
    echo "  │             /etc/nginx/sites-enabled/                           │"
    echo "  │        sudo nginx -t && sudo systemctl reload nginx             │"
    echo "  │                                                                 │"
    echo "  └─────────────────────────────────────────────────────────────────┘"
    echo ""
}

show_apache_config_example() {
    local domain="$1"
    echo ""
    echo "  ┌─────────────────────────────────────────────────────────────────┐"
    echo "  │  Manual Apache Configuration Required                           │"
    echo "  ├─────────────────────────────────────────────────────────────────┤"
    echo "  │                                                                 │"
    echo "  │  Enable modules:                                                │"
    echo "  │    sudo a2enmod proxy proxy_http proxy_wstunnel ssl             │"
    echo "  │                                                                 │"
    echo "  │  Add VirtualHost:                                               │"
    echo "  │    <VirtualHost *:443>                                          │"
    echo "  │        ServerName ${domain}                                     │"
    echo "  │        SSLEngine on                                             │"
    echo "  │        ProxyPass / http://127.0.0.1:8080/                       │"
    echo "  │        ProxyPassReverse / http://127.0.0.1:8080/                │"
    echo "  │        RewriteEngine On                                         │"
    echo "  │        RewriteCond %{HTTP:Upgrade} websocket [NC]               │"
    echo "  │        RewriteRule /(.*) ws://127.0.0.1:8080/\$1 [P,L]          │"
    echo "  │    </VirtualHost>                                               │"
    echo "  │                                                                 │"
    echo "  └─────────────────────────────────────────────────────────────────┘"
    echo ""
}

show_caddy_config_example() {
    local domain="$1"
    echo ""
    echo "  ┌─────────────────────────────────────────────────────────────────┐"
    echo "  │  Manual Caddy Configuration Required                            │"
    echo "  ├─────────────────────────────────────────────────────────────────┤"
    echo "  │                                                                 │"
    echo "  │  Add to your Caddyfile:                                         │"
    echo "  │                                                                 │"
    echo "  │  ${domain} {                                                    │"
    echo "  │      reverse_proxy meshcentral:80                               │"
    echo "  │  }                                                              │"
    echo "  │                                                                 │"
    echo "  │  Or for host Caddy:                                             │"
    echo "  │                                                                 │"
    echo "  │  ${domain} {                                                    │"
    echo "  │      reverse_proxy 127.0.0.1:8080                               │"
    echo "  │  }                                                              │"
    echo "  │                                                                 │"
    echo "  └─────────────────────────────────────────────────────────────────┘"
    echo ""
}

# ==============================================================================
# Docker Compose Helpers
# ==============================================================================

# Get the compose command with correct profile
get_compose_profiles() {
    local profiles=""
    
    if [[ "$USE_BUNDLED_NGINX" == "true" ]]; then
        profiles="--profile with-nginx"
    else
        profiles="--profile no-nginx"
    fi
    
    echo "$profiles"
}

# Check if we should skip bundled nginx
should_skip_bundled_nginx() {
    [[ "$USE_BUNDLED_NGINX" != "true" ]]
}

# Get the external network to join (for Docker proxy integration)
get_proxy_network() {
    echo "${PROXY_NETWORK:-}"
}

# ==============================================================================
# Port Exposure Helpers
# ==============================================================================

# When using external proxy, we need to expose MeshCentral on a host port
configure_meshcentral_host_port() {
    local port="${1:-8080}"
    
    if should_skip_bundled_nginx; then
        # Update .env to expose MeshCentral directly
        local env_file="$(get_path base)/.env"
        
        if ! grep -q "^MESHCENTRAL_HOST_PORT=" "$env_file" 2>/dev/null; then
            echo "MESHCENTRAL_HOST_PORT=${port}" >> "$env_file"
        fi
        
        print_info "MeshCentral will be exposed on port ${port} for reverse proxy"
    fi
}
