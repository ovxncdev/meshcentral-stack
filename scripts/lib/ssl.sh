#!/usr/bin/env bash
# ==============================================================================
# SSL Certificate Management Library
# ==============================================================================
# Provides robust SSL certificate management with multiple providers:
#   - Let's Encrypt (HTTP challenge)
#   - Let's Encrypt (Cloudflare DNS challenge)
#   - Cloudflare Origin Certificate
#   - Self-signed certificates
#
# Features:
#   - Automatic certificate detection and validation
#   - Docker and non-Docker environment support
#   - Graceful fallbacks on failure
#   - Automatic renewal setup
#   - Certificate health monitoring
#
# Usage:
#   source scripts/lib/ssl.sh
#   ssl_setup "$domain" "$ssl_path"
#
# ==============================================================================

# SSL configuration
SSL_MIN_DAYS_VALID=7          # Minimum days before expiry to consider valid
SSL_RENEWAL_DAYS=30           # Days before expiry to trigger renewal
SSL_KEY_SIZE=4096             # RSA key size for self-signed certs
SSL_CERT_DAYS=365             # Validity for self-signed certs

# Certbot Docker image
CERTBOT_IMAGE="certbot/certbot:latest"
CERTBOT_CLOUDFLARE_IMAGE="certbot/dns-cloudflare:latest"

# ==============================================================================
# Main SSL Setup Function
# ==============================================================================

ssl_setup() {
    local domain="$1"
    local ssl_path="$2"
    
    # Validate inputs
    if [[ -z "$domain" ]]; then
        log_error "Domain is required for SSL setup"
        return 1
    fi
    
    ssl_path="${ssl_path:-$(get_path data)/ssl}"
    
    # Ensure SSL directory exists
    ssl_ensure_directory "$ssl_path"
    
    # Step 1: Check for existing valid certificate
    if ssl_check_existing "$domain" "$ssl_path"; then
        return 0
    fi
    
    # Step 2: Scan system for valid certificates
    if ssl_scan_system "$domain" "$ssl_path"; then
        return 0
    fi
    
    # Step 3: Interactive or automatic certificate selection
    if [[ "$INTERACTIVE" == "true" ]]; then
        ssl_interactive_setup "$domain" "$ssl_path"
    else
        ssl_automatic_setup "$domain" "$ssl_path"
    fi
}

# ==============================================================================
# SSL Directory Management
# ==============================================================================

ssl_ensure_directory() {
    local ssl_path="$1"
    
    if [[ ! -d "$ssl_path" ]]; then
        run_with_sudo mkdir -p "$ssl_path"
    fi
    
    run_with_sudo chmod 755 "$ssl_path"
}

# ==============================================================================
# Certificate Validation
# ==============================================================================

ssl_check_existing() {
    local domain="$1"
    local ssl_path="$2"
    
    local cert_file="${ssl_path}/cert.pem"
    local key_file="${ssl_path}/key.pem"
    
    # Check if files exist
    if [[ ! -f "$cert_file" ]] || [[ ! -f "$key_file" ]]; then
        return 1
    fi
    
    # Check if force reinstall
    if [[ "$FORCE_REINSTALL" == "true" ]]; then
        print_info "Force reinstall - ignoring existing certificate"
        return 1
    fi
    
    # Validate certificate
    if ssl_validate_cert "$cert_file" "$domain"; then
        print_success "Existing certificate is valid for ${domain}"
        ssl_configure_nginx "$cert_file" "$key_file" "$domain"
        return 0
    fi
    
    print_warning "Existing certificate not valid for ${domain}"
    return 1
}

ssl_validate_cert() {
    local cert_file="$1"
    local domain="$2"
    
    # Check if file is readable
    if ! run_with_sudo test -r "$cert_file"; then
        return 1
    fi
    
    # Check if it's a valid certificate
    if ! run_with_sudo openssl x509 -noout -in "$cert_file" 2>/dev/null; then
        return 1
    fi
    
    # Check expiry
    local expiry_date
    expiry_date=$(run_with_sudo openssl x509 -noout -enddate -in "$cert_file" 2>/dev/null | cut -d= -f2)
    
    if [[ -z "$expiry_date" ]]; then
        return 1
    fi
    
    local expiry_epoch
    expiry_epoch=$(date -d "$expiry_date" +%s 2>/dev/null)
    local now_epoch
    now_epoch=$(date +%s)
    local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
    
    if [[ $days_left -lt $SSL_MIN_DAYS_VALID ]]; then
        print_warning "Certificate expires in ${days_left} days"
        return 1
    fi
    
    # Check domain match
    if ! ssl_cert_matches_domain "$cert_file" "$domain"; then
        return 1
    fi
    
    return 0
}

ssl_cert_matches_domain() {
    local cert_file="$1"
    local domain="$2"
    
    # Get CN and SANs
    local cert_cn
    cert_cn=$(run_with_sudo openssl x509 -noout -subject -in "$cert_file" 2>/dev/null | grep -oP 'CN\s*=\s*\K[^,/]+' | tr -d ' ')
    
    local cert_sans
    cert_sans=$(run_with_sudo openssl x509 -noout -text -in "$cert_file" 2>/dev/null | grep -A1 "Subject Alternative Name" | tail -1 | tr ',' '\n' | grep -oP 'DNS:\K[^,\s]+')
    
    local all_domains="${cert_cn}"$'\n'"${cert_sans}"
    
    # Check exact match
    if echo "$all_domains" | grep -qxF "$domain"; then
        return 0
    fi
    
    # Check wildcard match
    local parent_domain="${domain#*.}"
    if echo "$all_domains" | grep -qxF "*.${parent_domain}"; then
        return 0
    fi
    
    # Check if cert has wildcard for this domain
    if echo "$all_domains" | grep -qxF "*.${domain}"; then
        return 0
    fi
    
    return 1
}

# ==============================================================================
# System Certificate Scanner
# ==============================================================================

ssl_scan_system() {
    local domain="$1"
    local ssl_path="$2"
    
    print_info "Scanning system for existing SSL certificates..."
    
    local search_paths=(
        "/etc/letsencrypt/live"
        "/etc/ssl/certs"
        "/etc/ssl/private"
        "/etc/nginx/ssl"
        "/etc/apache2/ssl"
        "/opt/ssl"
        "/opt/certs"
    )
    
    # Add Docker volume paths if Docker is available
    if command_exists docker; then
        local docker_volumes
        docker_volumes=$(run_with_sudo docker volume ls --format '{{.Name}}' 2>/dev/null | grep -iE "cert|ssl|letsencrypt|acme" || true)
        
        for vol in $docker_volumes; do
            local vol_path
            vol_path=$(run_with_sudo docker volume inspect "$vol" --format '{{.Mountpoint}}' 2>/dev/null || true)
            if [[ -n "$vol_path" ]]; then
                search_paths+=("$vol_path")
            fi
        done
    fi
    
    # Search for certificates
    for search_path in "${search_paths[@]}"; do
        if [[ ! -d "$search_path" ]]; then
            continue
        fi
        
        # Find certificate files
        while IFS= read -r -d '' cert_file; do
            if ssl_validate_cert "$cert_file" "$domain"; then
                local key_file
                key_file=$(ssl_find_matching_key "$cert_file")
                
                if [[ -n "$key_file" ]]; then
                    print_success "Found valid certificate: $cert_file"
                    ssl_copy_certificate "$cert_file" "$key_file" "$ssl_path"
                    ssl_configure_nginx "${ssl_path}/cert.pem" "${ssl_path}/key.pem" "$domain"
                    return 0
                fi
            fi
        done < <(run_with_sudo find "$search_path" -type f \( -name "*.pem" -o -name "*.crt" -o -name "fullchain*" \) -print0 2>/dev/null)
    done
    
    print_info "No valid certificates found for ${domain}"
    return 1
}

ssl_find_matching_key() {
    local cert_file="$1"
    local cert_dir
    cert_dir=$(dirname "$cert_file")
    
    # Get certificate modulus
    local cert_modulus
    cert_modulus=$(run_with_sudo openssl x509 -noout -modulus -in "$cert_file" 2>/dev/null | md5sum | cut -d' ' -f1)
    
    if [[ -z "$cert_modulus" ]]; then
        return 1
    fi
    
    # Search for matching key
    local key_patterns=("privkey*.pem" "*.key" "*key*.pem" "private*.pem")
    
    for pattern in "${key_patterns[@]}"; do
        for key_file in "$cert_dir"/$pattern; do
            if [[ ! -f "$key_file" ]]; then
                continue
            fi
            
            local key_modulus
            key_modulus=$(run_with_sudo openssl rsa -noout -modulus -in "$key_file" 2>/dev/null | md5sum | cut -d' ' -f1)
            
            if [[ "$cert_modulus" == "$key_modulus" ]]; then
                echo "$key_file"
                return 0
            fi
        done
    done
    
    return 1
}

ssl_copy_certificate() {
    local cert_file="$1"
    local key_file="$2"
    local ssl_path="$3"
    
    # Copy files (following symlinks)
    run_with_sudo cp -L "$cert_file" "${ssl_path}/cert.pem"
    run_with_sudo cp -L "$key_file" "${ssl_path}/key.pem"
    
    # Set permissions
    run_with_sudo chmod 644 "${ssl_path}/cert.pem"
    run_with_sudo chmod 600 "${ssl_path}/key.pem"
}

# ==============================================================================
# Interactive SSL Setup
# ==============================================================================

ssl_interactive_setup() {
    local domain="$1"
    local ssl_path="$2"
    
    # Check for special cases
    if ssl_is_local_domain "$domain"; then
        print_warning "Domain is localhost or IP - using self-signed certificate"
        ssl_generate_self_signed "$domain" "$ssl_path"
        return $?
    fi
    
    echo ""
    echo "  ┌─────────────────────────────────────────────────────────────────┐"
    echo "  │           SSL Certificate Options                               │"
    echo "  ├─────────────────────────────────────────────────────────────────┤"
    echo "  │                                                                 │"
    echo "  │  1) Let's Encrypt (Recommended)                                 │"
    echo "  │     • Free, trusted certificate                                 │"
    echo "  │     • Auto-renews every 90 days                                 │"
    echo "  │     • Requires port 80 accessible                               │"
    echo "  │                                                                 │"
    echo "  │  2) Let's Encrypt + Cloudflare DNS                              │"
    echo "  │     • Works even if port 80 is blocked                          │"
    echo "  │     • Supports wildcard certificates (*.domain.com)             │"
    echo "  │     • Requires Cloudflare API token                             │"
    echo "  │                                                                 │"
    echo "  │  3) Cloudflare Origin Certificate                               │"
    echo "  │     • 15-year validity                                          │"
    echo "  │     • Only works with Cloudflare proxy enabled                  │"
    echo "  │     • Paste certificate from Cloudflare dashboard               │"
    echo "  │                                                                 │"
    echo "  │  4) Self-Signed Certificate                                     │"
    echo "  │     • Works immediately, no external dependencies               │"
    echo "  │     • Browser will show security warning                        │"
    echo "  │     • Good for testing or internal use                          │"
    echo "  │                                                                 │"
    echo "  └─────────────────────────────────────────────────────────────────┘"
    echo ""
    
    local choice
    read -rp "  Select certificate type [1-4] (default: 1): " choice
    choice="${choice:-1}"
    
    case "$choice" in
        1) ssl_letsencrypt_http "$domain" "$ssl_path" ;;
        2) ssl_letsencrypt_cloudflare "$domain" "$ssl_path" ;;
        3) ssl_cloudflare_origin "$domain" "$ssl_path" ;;
        4) ssl_generate_self_signed "$domain" "$ssl_path" ;;
        *)
            print_warning "Invalid choice, using self-signed certificate"
            ssl_generate_self_signed "$domain" "$ssl_path"
            ;;
    esac
}

ssl_automatic_setup() {
    local domain="$1"
    local ssl_path="$2"
    
    # Check for special cases
    if ssl_is_local_domain "$domain"; then
        ssl_generate_self_signed "$domain" "$ssl_path"
        return $?
    fi
    
    # Try Let's Encrypt if email is provided
    if [[ -n "${SSL_EMAIL:-}" ]]; then
        if [[ -n "${CF_API_TOKEN:-}" ]] || [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]]; then
            ssl_letsencrypt_cloudflare "$domain" "$ssl_path"
        else
            ssl_letsencrypt_http "$domain" "$ssl_path"
        fi
    else
        print_info "No SSL_EMAIL provided, using self-signed certificate"
        ssl_generate_self_signed "$domain" "$ssl_path"
    fi
}

ssl_is_local_domain() {
    local domain="$1"
    
    # Check for localhost
    if [[ "$domain" == "localhost" ]]; then
        return 0
    fi
    
    # Check for IP address
    if [[ "$domain" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        return 0
    fi
    
    # Check for IPv6
    if [[ "$domain" =~ ^[0-9a-fA-F:]+$ ]] && [[ "$domain" == *:* ]]; then
        return 0
    fi
    
    return 1
}

# ==============================================================================
# Let's Encrypt HTTP Challenge
# ==============================================================================

ssl_letsencrypt_http() {
    local domain="$1"
    local ssl_path="$2"
    
    print_info "Setting up Let's Encrypt with HTTP challenge..."
    
    # Get email
    local email
    email=$(ssl_get_email)
    
    if [[ -z "$email" ]]; then
        print_warning "Email required for Let's Encrypt"
        ssl_generate_self_signed "$domain" "$ssl_path"
        return $?
    fi
    
    # Check port 80 availability
    if ! ssl_check_port_available 80; then
        print_warning "Port 80 is in use. Let's Encrypt HTTP challenge requires port 80."
        
        if [[ "$INTERACTIVE" == "true" ]]; then
            if prompt_yes_no "Try Cloudflare DNS challenge instead?" "y"; then
                ssl_letsencrypt_cloudflare "$domain" "$ssl_path"
                return $?
            fi
        fi
        
        ssl_generate_self_signed "$domain" "$ssl_path"
        return $?
    fi
    
    # Run certbot
    if ssl_run_certbot_http "$domain" "$email" "$ssl_path"; then
        ssl_setup_renewal "$domain" "$email" "http"
        return 0
    fi
    
    print_warning "Let's Encrypt HTTP challenge failed"
    ssl_generate_self_signed "$domain" "$ssl_path"
}

ssl_run_certbot_http() {
    local domain="$1"
    local email="$2"
    local ssl_path="$3"
    
    local webroot="${WEB_PATH:-./web}/.well-known/acme-challenge"
    run_with_sudo mkdir -p "$webroot"
    
    local certbot_cmd
    local certbot_output
    
    if command_exists docker && [[ "${USE_DOCKER_CERTBOT:-true}" == "true" ]]; then
        # Use Docker certbot
        print_info "Using Docker certbot..."
        
        # Start nginx temporarily if needed
        local nginx_started=false
        if ! curl -s -o /dev/null "http://localhost/.well-known/acme-challenge/" 2>/dev/null; then
            compose up -d nginx 2>/dev/null || true
            nginx_started=true
            sleep 5
        fi
        
        certbot_output=$(run_with_sudo docker run --rm \
            -v "${ssl_path}:/etc/letsencrypt" \
            -v "$(realpath "${WEB_PATH:-./web}"):/var/www/html" \
            "$CERTBOT_IMAGE" certonly \
            --webroot \
            --webroot-path=/var/www/html \
            --email "$email" \
            --agree-tos \
            --non-interactive \
            --force-renewal \
            -d "$domain" 2>&1) || true
        
        if [[ "$nginx_started" == "true" ]]; then
            compose down 2>/dev/null || true
        fi
    elif command_exists certbot; then
        # Use system certbot
        print_info "Using system certbot..."
        
        certbot_output=$(run_with_sudo certbot certonly \
            --webroot \
            --webroot-path="$(realpath "${WEB_PATH:-./web}")" \
            --email "$email" \
            --agree-tos \
            --non-interactive \
            --force-renewal \
            -d "$domain" 2>&1) || true
    else
        print_error "Neither Docker nor certbot is available"
        return 1
    fi
    
    echo "$certbot_output"
    
    # Check for success
    if echo "$certbot_output" | grep -qi "successfully\|congratulations"; then
        print_success "Certificate obtained from Let's Encrypt!"
        ssl_extract_letsencrypt_cert "$domain" "$ssl_path"
        ssl_configure_nginx "${ssl_path}/cert.pem" "${ssl_path}/key.pem" "$domain"
        return 0
    fi
    
    return 1
}

# ==============================================================================
# Let's Encrypt Cloudflare DNS Challenge
# ==============================================================================

ssl_letsencrypt_cloudflare() {
    local domain="$1"
    local ssl_path="$2"
    
    print_info "Setting up Let's Encrypt with Cloudflare DNS challenge..."
    
    # Get Cloudflare API token
    local cf_token
    cf_token=$(ssl_get_cloudflare_token)
    
    if [[ -z "$cf_token" ]]; then
        print_warning "Cloudflare API token required"
        ssl_generate_self_signed "$domain" "$ssl_path"
        return $?
    fi
    
    # Get email
    local email
    email=$(ssl_get_email)
    
    if [[ -z "$email" ]]; then
        email="admin@${domain}"
        print_info "Using default email: $email"
    fi
    
    # Ask about wildcard
    local cert_domains="-d ${domain}"
    if [[ "$INTERACTIVE" == "true" ]]; then
        if prompt_yes_no "Include wildcard certificate (*.${domain})?" "y"; then
            cert_domains="-d *.${domain} -d ${domain}"
        fi
    elif [[ "${SSL_WILDCARD:-false}" == "true" ]]; then
        cert_domains="-d *.${domain} -d ${domain}"
    fi
    
    # Setup Cloudflare credentials
    ssl_setup_cloudflare_credentials "$cf_token"
    
    # Run certbot
    if ssl_run_certbot_cloudflare "$domain" "$email" "$ssl_path" "$cert_domains"; then
        ssl_setup_renewal "$domain" "$email" "cloudflare"
        return 0
    fi
    
    print_warning "Let's Encrypt Cloudflare challenge failed"
    ssl_generate_self_signed "$domain" "$ssl_path"
}

ssl_setup_cloudflare_credentials() {
    local cf_token="$1"
    local creds_file="/etc/letsencrypt/cloudflare.ini"
    
    run_with_sudo mkdir -p /etc/letsencrypt
    echo "dns_cloudflare_api_token = ${cf_token}" | run_with_sudo tee "$creds_file" > /dev/null
    run_with_sudo chmod 600 "$creds_file"
}

ssl_run_certbot_cloudflare() {
    local domain="$1"
    local email="$2"
    local ssl_path="$3"
    local cert_domains="$4"
    
    local certbot_output
    
    print_info "Requesting certificate from Let's Encrypt..."
    
    if command_exists docker && [[ "${USE_DOCKER_CERTBOT:-true}" == "true" ]]; then
        # Clean up any existing certbot directories that might conflict
        run_with_sudo rm -rf "${ssl_path}/live" "${ssl_path}/archive" "${ssl_path}/renewal" "${ssl_path}/accounts" "${ssl_path}/renewal-hooks" 2>/dev/null || true
        # Also remove any broken symlinks
        run_with_sudo find "${ssl_path}" -maxdepth 1 -type l -delete 2>/dev/null || true
        
        # Copy cloudflare credentials into the ssl_path so it's available inside container
        run_with_sudo cp /etc/letsencrypt/cloudflare.ini "${ssl_path}/cloudflare.ini" 2>/dev/null || true
        run_with_sudo chmod 600 "${ssl_path}/cloudflare.ini"
        
        certbot_output=$(run_with_sudo docker run --rm \
            -v "${ssl_path}:/etc/letsencrypt" \
            "$CERTBOT_CLOUDFLARE_IMAGE" certonly \
            --dns-cloudflare \
            --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
            --dns-cloudflare-propagation-seconds 30 \
            $cert_domains \
            --email "$email" \
            --agree-tos \
            --non-interactive \
            --force-renewal 2>&1) || true
    elif command_exists certbot; then
        certbot_output=$(run_with_sudo certbot certonly \
            --dns-cloudflare \
            --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
            --dns-cloudflare-propagation-seconds 30 \
            $cert_domains \
            --email "$email" \
            --agree-tos \
            --non-interactive \
            --force-renewal 2>&1) || true
    else
        print_error "Neither Docker nor certbot is available"
        return 1
    fi
    
    echo "$certbot_output"
    
    # Check for success
    if echo "$certbot_output" | grep -qi "successfully\|congratulations"; then
        print_success "Certificate obtained from Let's Encrypt!"
        if ssl_extract_letsencrypt_cert "$domain" "$ssl_path"; then
            ssl_configure_nginx "${ssl_path}/cert.pem" "${ssl_path}/key.pem" "$domain"
            return 0
        else
            print_error "Failed to extract certificate files"
            return 1
        fi
    fi
    
    # Check for specific errors
    if echo "$certbot_output" | grep -qi "invalid email"; then
        print_error "Invalid email address"
    elif echo "$certbot_output" | grep -qi "unauthorized\|invalid.*token"; then
        print_error "Cloudflare API token is invalid or missing permissions"
    elif echo "$certbot_output" | grep -qi "rate limit"; then
        print_error "Let's Encrypt rate limit reached. Try again later."
    fi
    
    return 1
}

ssl_extract_letsencrypt_cert() {
    local domain="$1"
    local ssl_path="$2"
    
    print_info "Extracting certificate files..."
    
    # Find the certificate files (they may be in subdirectories)
    local cert_file=""
    local key_file=""
    
    # Check common locations in order of preference
    local search_paths=(
        "${ssl_path}/live/${domain}"
        "${ssl_path}/archive/${domain}"
        "${ssl_path}/live"
        "${ssl_path}"
    )
    
    for search_path in "${search_paths[@]}"; do
        [[ ! -d "$search_path" ]] && continue
        
        # Look for fullchain (symlink or file)
        if [[ -e "${search_path}/fullchain.pem" ]]; then
            cert_file="${search_path}/fullchain.pem"
            key_file="${search_path}/privkey.pem"
            break
        fi
        
        # Look for numbered files (in archive)
        if [[ -f "${search_path}/fullchain1.pem" ]]; then
            cert_file="${search_path}/fullchain1.pem"
            key_file="${search_path}/privkey1.pem"
            break
        fi
    done
    
    # If still not found, do a broader search
    if [[ -z "$cert_file" ]]; then
        cert_file=$(run_with_sudo find "${ssl_path}" -name "fullchain*.pem" -type f 2>/dev/null | head -1)
        if [[ -n "$cert_file" ]]; then
            local cert_dir=$(dirname "$cert_file")
            key_file=$(run_with_sudo find "$cert_dir" -name "privkey*.pem" -type f 2>/dev/null | head -1)
        fi
    fi
    
    if [[ -z "$cert_file" ]] || [[ -z "$key_file" ]]; then
        print_error "Could not find Let's Encrypt certificate files"
        print_info "Searching in: ${ssl_path}"
        run_with_sudo find "${ssl_path}" -name "*.pem" -type f 2>/dev/null | head -10
        return 1
    fi
    
    print_info "Found cert: $cert_file"
    print_info "Found key: $key_file"
    
    # Remove any existing broken symlinks
    run_with_sudo rm -f "${ssl_path}/cert.pem" "${ssl_path}/key.pem" 2>/dev/null || true
    
    # Copy to standard location (following symlinks with -L)
    if ! run_with_sudo cp -L "$cert_file" "${ssl_path}/cert.pem" 2>/dev/null; then
        # If -L fails (broken symlink), try to find the actual file
        local real_cert=$(run_with_sudo readlink -f "$cert_file" 2>/dev/null || echo "$cert_file")
        if [[ -f "$real_cert" ]]; then
            run_with_sudo cp "$real_cert" "${ssl_path}/cert.pem"
        else
            print_error "Cannot copy certificate file: $cert_file"
            return 1
        fi
    fi
    
    if ! run_with_sudo cp -L "$key_file" "${ssl_path}/key.pem" 2>/dev/null; then
        local real_key=$(run_with_sudo readlink -f "$key_file" 2>/dev/null || echo "$key_file")
        if [[ -f "$real_key" ]]; then
            run_with_sudo cp "$real_key" "${ssl_path}/key.pem"
        else
            print_error "Cannot copy key file: $key_file"
            return 1
        fi
    fi
    
    # Set permissions
    run_with_sudo chmod 644 "${ssl_path}/cert.pem"
    run_with_sudo chmod 600 "${ssl_path}/key.pem"
    
    # Verify the files are valid
    if ! run_with_sudo openssl x509 -noout -in "${ssl_path}/cert.pem" 2>/dev/null; then
        print_error "Extracted certificate is invalid"
        return 1
    fi
    
    print_success "Certificate files extracted successfully"
    return 0
}

# ==============================================================================
# Cloudflare Origin Certificate
# ==============================================================================

ssl_cloudflare_origin() {
    local domain="$1"
    local ssl_path="$2"
    
    print_info "Setting up Cloudflare Origin Certificate..."
    
    echo ""
    echo "  ┌─────────────────────────────────────────────────────────────────┐"
    echo "  │           Cloudflare Origin Certificate Options                 │"
    echo "  ├─────────────────────────────────────────────────────────────────┤"
    echo "  │                                                                 │"
    echo "  │  1) Generate CSR here (Recommended - key stays on server)       │"
    echo "  │     • We generate private key & CSR                             │"
    echo "  │     • You paste CSR into Cloudflare                             │"
    echo "  │     • Cloudflare signs it and you paste cert back               │"
    echo "  │                                                                 │"
    echo "  │  2) Let Cloudflare generate both (easier but less secure)       │"
    echo "  │     • Cloudflare generates key & cert                           │"
    echo "  │     • You paste both here                                       │"
    echo "  │                                                                 │"
    echo "  │  3) I already have certificate files                            │"
    echo "  │     • Paste existing cert and key                               │"
    echo "  │                                                                 │"
    echo "  └─────────────────────────────────────────────────────────────────┘"
    echo ""
    
    local choice
    read -rp "  Select option [1-3] (default: 1): " choice
    choice="${choice:-1}"
    
    case "$choice" in
        1)
            ssl_cloudflare_with_csr "$domain" "$ssl_path"
            ;;
        2|3)
            ssl_cloudflare_paste_both "$domain" "$ssl_path"
            ;;
        *)
            print_warning "Invalid choice"
            ssl_generate_self_signed "$domain" "$ssl_path"
            ;;
    esac
}

# ==============================================================================
# Cloudflare Origin with CSR (private key stays on server)
# ==============================================================================

ssl_cloudflare_with_csr() {
    local domain="$1"
    local ssl_path="$2"
    
    print_info "Generating private key and CSR..."
    
    local key_file="${ssl_path}/key.pem"
    local csr_file="${ssl_path}/csr.pem"
    
    # Generate private key
    run_with_sudo openssl genrsa -out "$key_file" 2048 2>/dev/null
    run_with_sudo chmod 600 "$key_file"
    
    # Generate CSR with SAN for wildcard
    local csr_config=$(mktemp)
    cat > "$csr_config" << CSRCONF
[req]
default_bits = 2048
prompt = no
default_md = sha256
req_extensions = req_ext
distinguished_name = dn

[dn]
CN = ${domain}
O = Organization
C = US

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${domain}
DNS.2 = *.${domain}
CSRCONF
    
    run_with_sudo openssl req -new -key "$key_file" -out "$csr_file" -config "$csr_config" 2>/dev/null
    rm -f "$csr_config"
    
    if [[ ! -f "$csr_file" ]]; then
        print_error "Failed to generate CSR"
        ssl_generate_self_signed "$domain" "$ssl_path"
        return $?
    fi
    
    # Display CSR for user to copy
    echo ""
    echo "  ┌─────────────────────────────────────────────────────────────────┐"
    echo "  │  CSR Generated! Follow these steps:                             │"
    echo "  ├─────────────────────────────────────────────────────────────────┤"
    echo "  │                                                                 │"
    echo "  │  1. Go to: Cloudflare Dashboard → ${domain}"
    echo "  │  2. Navigate to: SSL/TLS → Origin Server                        │"
    echo "  │  3. Click 'Create Certificate'                                  │"
    echo "  │  4. Select: 'Use my private key and CSR'                        │"
    echo "  │  5. Paste the CSR shown below                                   │"
    echo "  │  6. Set validity to 15 years                                    │"
    echo "  │  7. Click 'Create'                                              │"
    echo "  │  8. Copy the certificate Cloudflare gives you                   │"
    echo "  │                                                                 │"
    echo "  └─────────────────────────────────────────────────────────────────┘"
    echo ""
    echo "  ══════════════════ COPY THIS CSR ══════════════════"
    echo ""
    run_with_sudo cat "$csr_file"
    echo ""
    echo "  ════════════════════════════════════════════════════"
    echo ""
    
    # Wait for user to paste certificate
    if ! prompt_yes_no "Have you created the certificate in Cloudflare?" "n"; then
        print_info "You can complete this later by running: ./scripts/setup.sh --ssl"
        print_info "Falling back to self-signed certificate for now..."
        ssl_generate_self_signed "$domain" "$ssl_path"
        return $?
    fi
    
    echo ""
    echo "  Paste the CERTIFICATE from Cloudflare:"
    echo "  (Paste everything including -----BEGIN CERTIFICATE-----)"
    echo "  (Press Ctrl+D on an empty line when done)"
    echo ""
    
    local cert_content=""
    while IFS= read -r line; do
        cert_content+="$line"$'\n'
    done
    
    if [[ -z "$cert_content" ]] || [[ ! "$cert_content" =~ "BEGIN CERTIFICATE" ]]; then
        print_error "Invalid certificate format"
        print_info "Falling back to self-signed certificate..."
        ssl_generate_self_signed "$domain" "$ssl_path"
        return $?
    fi
    
    # Save certificate
    echo "$cert_content" | run_with_sudo tee "${ssl_path}/cert.pem" > /dev/null
    run_with_sudo chmod 644 "${ssl_path}/cert.pem"
    
    # Verify certificate matches key
    local cert_modulus key_modulus
    cert_modulus=$(run_with_sudo openssl x509 -noout -modulus -in "${ssl_path}/cert.pem" 2>/dev/null | md5sum)
    key_modulus=$(run_with_sudo openssl rsa -noout -modulus -in "${ssl_path}/key.pem" 2>/dev/null | md5sum)
    
    if [[ "$cert_modulus" != "$key_modulus" ]]; then
        print_error "Certificate does not match the private key!"
        print_info "Make sure you used the CSR shown above in Cloudflare"
        ssl_generate_self_signed "$domain" "$ssl_path"
        return $?
    fi
    
    print_success "Cloudflare Origin Certificate installed!"
    ssl_configure_nginx "${ssl_path}/cert.pem" "${ssl_path}/key.pem" "$domain"
    
    # Clean up CSR
    run_with_sudo rm -f "$csr_file"
    
    echo ""
    print_warning "IMPORTANT: Set Cloudflare SSL mode to 'Full (strict)'"
    print_info "  Cloudflare Dashboard → SSL/TLS → Overview → Full (strict)"
    echo ""
    
    return 0
}

# ==============================================================================
# Cloudflare Origin - Paste both cert and key
# ==============================================================================

ssl_cloudflare_paste_both() {
    local domain="$1"
    local ssl_path="$2"
    
    echo ""
    echo "  ┌─────────────────────────────────────────────────────────────────┐"
    echo "  │  Get certificate from Cloudflare:                               │"
    echo "  ├─────────────────────────────────────────────────────────────────┤"
    echo "  │                                                                 │"
    echo "  │  1. Go to: Cloudflare Dashboard → ${domain}"
    echo "  │  2. Navigate to: SSL/TLS → Origin Server                        │"
    echo "  │  3. Click 'Create Certificate'                                  │"
    echo "  │  4. Select: 'Generate private key and CSR with Cloudflare'      │"
    echo "  │  5. Hostnames: *.${domain}, ${domain}"
    echo "  │  6. Validity: 15 years                                          │"
    echo "  │  7. Click 'Create'                                              │"
    echo "  │  8. Copy BOTH the Certificate AND Private Key                   │"
    echo "  │                                                                 │"
    echo "  └─────────────────────────────────────────────────────────────────┘"
    echo ""
    
    if ! prompt_yes_no "Do you have the certificate and key ready?" "n"; then
        print_info "Falling back to self-signed certificate..."
        ssl_generate_self_signed "$domain" "$ssl_path"
        return $?
    fi
    
    # Get certificate
    echo ""
    echo "  Paste the CERTIFICATE (starts with -----BEGIN CERTIFICATE-----):"
    echo "  (Press Ctrl+D on empty line when done)"
    echo ""
    
    local cert_content=""
    while IFS= read -r line; do
        cert_content+="$line"$'\n'
    done
    
    if [[ -z "$cert_content" ]] || [[ ! "$cert_content" =~ "BEGIN CERTIFICATE" ]]; then
        print_error "Invalid certificate format"
        ssl_generate_self_signed "$domain" "$ssl_path"
        return $?
    fi
    
    # Get private key
    echo ""
    echo "  Paste the PRIVATE KEY (starts with -----BEGIN PRIVATE KEY-----):"
    echo "  (Press Ctrl+D on empty line when done)"
    echo ""
    
    local key_content=""
    while IFS= read -r line; do
        key_content+="$line"$'\n'
    done
    
    if [[ -z "$key_content" ]] || [[ ! "$key_content" =~ "BEGIN" ]]; then
        print_error "Invalid private key format"
        ssl_generate_self_signed "$domain" "$ssl_path"
        return $?
    fi
    
    # Save certificate and key
    echo "$cert_content" | run_with_sudo tee "${ssl_path}/cert.pem" > /dev/null
    echo "$key_content" | run_with_sudo tee "${ssl_path}/key.pem" > /dev/null
    
    run_with_sudo chmod 644 "${ssl_path}/cert.pem"
    run_with_sudo chmod 600 "${ssl_path}/key.pem"
    
    # Verify
    if run_with_sudo openssl x509 -noout -in "${ssl_path}/cert.pem" 2>/dev/null; then
        print_success "Cloudflare Origin Certificate installed!"
        ssl_configure_nginx "${ssl_path}/cert.pem" "${ssl_path}/key.pem" "$domain"
        
        echo ""
        print_warning "IMPORTANT: Set Cloudflare SSL mode to 'Full (strict)'"
        print_info "  Cloudflare Dashboard → SSL/TLS → Overview → Full (strict)"
        echo ""
        return 0
    fi
    
    print_error "Certificate verification failed"
    ssl_generate_self_signed "$domain" "$ssl_path"
}

# ==============================================================================
# Self-Signed Certificate
# ==============================================================================

ssl_generate_self_signed() {
    local domain="$1"
    local ssl_path="$2"
    
    print_info "Generating self-signed certificate for: $domain"
    
    local cert_file="${ssl_path}/cert.pem"
    local key_file="${ssl_path}/key.pem"
    
    # Remove any existing broken symlinks or files
    run_with_sudo rm -f "$cert_file" "$key_file" 2>/dev/null || true
    
    # Generate certificate
    local openssl_output
    openssl_output=$(run_with_sudo openssl req -x509 -nodes \
        -days "$SSL_CERT_DAYS" \
        -newkey "rsa:${SSL_KEY_SIZE}" \
        -keyout "$key_file" \
        -out "$cert_file" \
        -subj "/CN=${domain}/O=Remote Support/C=US" \
        -addext "subjectAltName=DNS:${domain},DNS:*.${domain},DNS:localhost,IP:127.0.0.1" \
        2>&1) || {
        # Fallback without -addext for older OpenSSL
        openssl_output=$(run_with_sudo openssl req -x509 -nodes \
            -days "$SSL_CERT_DAYS" \
            -newkey "rsa:${SSL_KEY_SIZE}" \
            -keyout "$key_file" \
            -out "$cert_file" \
            -subj "/CN=${domain}/O=Remote Support/C=US" \
            2>&1) || {
            print_error "Failed to generate SSL certificate"
            echo "$openssl_output"
            return 1
        }
    }
    
    # Set permissions
    run_with_sudo chmod 644 "$cert_file"
    run_with_sudo chmod 600 "$key_file"
    
    # Verify certificate was created
    if ! run_with_sudo test -f "$cert_file" || ! run_with_sudo test -f "$key_file"; then
        print_error "Certificate files were not created"
        return 1
    fi
    
    ssl_configure_nginx "$cert_file" "$key_file" "$domain"
    
    print_success "Self-signed certificate generated"
    print_warning "Browser will show security warning (expected for self-signed)"
    
    return 0
}

# ==============================================================================
# Nginx Configuration
# ==============================================================================

ssl_configure_nginx() {
    local cert_file="$1"
    local key_file="$2"
    local domain="$3"
    
    local site_config="${CONFIG_PATH:-./config}/nginx/sites/meshcentral.conf"
    
    if [[ ! -f "$site_config" ]]; then
        print_warning "Nginx config not found: $site_config"
        return 0
    fi
    
    # Update SSL certificate paths
    run_with_sudo sed -i "s|ssl_certificate .*|ssl_certificate /etc/nginx/ssl/cert.pem;|g" "$site_config" 2>/dev/null || true
    run_with_sudo sed -i "s|ssl_certificate_key .*|ssl_certificate_key /etc/nginx/ssl/key.pem;|g" "$site_config" 2>/dev/null || true
    
    # Replace any Let's Encrypt paths
    run_with_sudo sed -i "s|/etc/letsencrypt/live/[^/]*/fullchain.pem|/etc/nginx/ssl/cert.pem|g" "$site_config" 2>/dev/null || true
    run_with_sudo sed -i "s|/etc/letsencrypt/live/[^/]*/privkey.pem|/etc/nginx/ssl/key.pem|g" "$site_config" 2>/dev/null || true
    
    print_info "Nginx SSL configuration updated"
}

# ==============================================================================
# Certificate Renewal
# ==============================================================================

ssl_setup_renewal() {
    local domain="$1"
    local email="$2"
    local method="$3"
    
    print_info "Setting up automatic certificate renewal..."
    
    local base_path
    base_path=$(get_path base)
    local ssl_path
    ssl_path=$(get_path data)/ssl
    local renewal_script="${base_path}/scripts/renew-cert.sh"
    
    # Create renewal script
    cat > "$renewal_script" << EOF
#!/bin/bash
# SSL Certificate Renewal Script
# Auto-generated - Method: ${method}
# Domain: ${domain}

set -e

DOMAIN="${domain}"
EMAIL="${email}"
SSL_PATH="${ssl_path}"
BASE_PATH="${base_path}"

cd "\$BASE_PATH"

echo "[\$(date)] Starting certificate renewal for \$DOMAIN"

EOF
    
    if [[ "$method" == "cloudflare" ]]; then
        cat >> "$renewal_script" << 'CLOUDFLARE_RENEWAL'
# Cloudflare DNS renewal
docker run --rm \
    -v "${SSL_PATH}:/etc/letsencrypt" \
    certbot/dns-cloudflare renew \
    --dns-cloudflare \
    --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini

# Extract updated certificates from archive (they're the actual files)
ARCHIVE_DIR="${SSL_PATH}/archive/${DOMAIN}"
if [[ -d "$ARCHIVE_DIR" ]]; then
    # Find the latest cert (highest number)
    LATEST_CERT=$(ls -v "${ARCHIVE_DIR}"/fullchain*.pem 2>/dev/null | tail -1)
    LATEST_KEY=$(ls -v "${ARCHIVE_DIR}"/privkey*.pem 2>/dev/null | tail -1)
    
    if [[ -f "$LATEST_CERT" ]] && [[ -f "$LATEST_KEY" ]]; then
        cp "$LATEST_CERT" "${SSL_PATH}/cert.pem"
        cp "$LATEST_KEY" "${SSL_PATH}/key.pem"
        chmod 644 "${SSL_PATH}/cert.pem"
        chmod 600 "${SSL_PATH}/key.pem"
        echo "Certificate files updated"
    fi
fi

# Restart nginx to pick up new cert
docker compose restart nginx

echo "[$(date)] Renewal complete"
CLOUDFLARE_RENEWAL
    else
        cat >> "$renewal_script" << 'HTTP_RENEWAL'
# HTTP challenge renewal
docker run --rm \
    -v "${SSL_PATH}:/etc/letsencrypt" \
    -v "${BASE_PATH}/web:/var/www/html" \
    certbot/certbot renew --webroot --webroot-path=/var/www/html

# Extract updated certificates from archive (they're the actual files)
ARCHIVE_DIR="${SSL_PATH}/archive/${DOMAIN}"
if [[ -d "$ARCHIVE_DIR" ]]; then
    # Find the latest cert (highest number)
    LATEST_CERT=$(ls -v "${ARCHIVE_DIR}"/fullchain*.pem 2>/dev/null | tail -1)
    LATEST_KEY=$(ls -v "${ARCHIVE_DIR}"/privkey*.pem 2>/dev/null | tail -1)
    
    if [[ -f "$LATEST_CERT" ]] && [[ -f "$LATEST_KEY" ]]; then
        cp "$LATEST_CERT" "${SSL_PATH}/cert.pem"
        cp "$LATEST_KEY" "${SSL_PATH}/key.pem"
        chmod 644 "${SSL_PATH}/cert.pem"
        chmod 600 "${SSL_PATH}/key.pem"
        echo "Certificate files updated"
    fi
fi

# Restart nginx to pick up new cert
docker compose restart nginx

echo "[$(date)] Renewal complete"
HTTP_RENEWAL
    fi
    
    chmod +x "$renewal_script"
    
    # Add cron job (runs weekly on Sunday at 3am)
    local cron_entry="0 3 * * 0 ${renewal_script} >> /var/log/ssl-renewal.log 2>&1"
    
    if ! crontab -l 2>/dev/null | grep -qF "renew-cert.sh"; then
        (crontab -l 2>/dev/null; echo "$cron_entry") | crontab - 2>/dev/null || true
        print_success "Automatic renewal scheduled (weekly on Sundays at 3am)"
    fi
}

# ==============================================================================
# Helper Functions
# ==============================================================================

ssl_get_email() {
    local email="${SSL_EMAIL:-}"
    
    if [[ -z "$email" ]] && [[ "$INTERACTIVE" == "true" ]]; then
        read -rp "  Enter email for SSL certificate notifications: " email
    fi
    
    echo "$email"
}

ssl_get_cloudflare_token() {
    local token="${CF_API_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"
    
    if [[ -z "$token" ]] && [[ "$INTERACTIVE" == "true" ]]; then
        echo ""
        echo "  To create a Cloudflare API token:"
        echo "    1. Go to: https://dash.cloudflare.com/profile/api-tokens"
        echo "    2. Click 'Create Token'"
        echo "    3. Use 'Edit zone DNS' template"
        echo "    4. Select your zone and create"
        echo ""
        read -rp "  Enter Cloudflare API token: " token
    fi
    
    echo "$token"
}

ssl_check_port_available() {
    local port="$1"
    
    if command -v ss &>/dev/null; then
        ! ss -tuln | grep -q ":${port} "
    elif command -v netstat &>/dev/null; then
        ! netstat -tuln | grep -q ":${port} "
    else
        return 0
    fi
}

run_with_sudo() {
    if [[ $EUID -eq 0 ]]; then
        "$@"
    else
        sudo "$@"
    fi
}

# ==============================================================================
# Certificate Health Check
# ==============================================================================

ssl_health_check() {
    local ssl_path="${1:-$(get_path data)/ssl}"
    local cert_file="${ssl_path}/cert.pem"
    
    if [[ ! -f "$cert_file" ]]; then
        echo "NO_CERT"
        return 1
    fi
    
    local expiry_date
    expiry_date=$(run_with_sudo openssl x509 -noout -enddate -in "$cert_file" 2>/dev/null | cut -d= -f2)
    
    if [[ -z "$expiry_date" ]]; then
        echo "INVALID"
        return 1
    fi
    
    local expiry_epoch
    expiry_epoch=$(date -d "$expiry_date" +%s 2>/dev/null)
    local now_epoch
    now_epoch=$(date +%s)
    local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
    
    if [[ $days_left -lt 0 ]]; then
        echo "EXPIRED"
        return 1
    elif [[ $days_left -lt $SSL_RENEWAL_DAYS ]]; then
        echo "EXPIRING:${days_left}"
        return 0
    else
        echo "OK:${days_left}"
        return 0
    fi
}
