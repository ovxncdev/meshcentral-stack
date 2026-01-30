#!/usr/bin/env bash
# ==============================================================================
# Core Helper Library
# ==============================================================================
# Single source of truth for all shared functions.
#
# Usage in other scripts:
#   #!/usr/bin/env bash
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   source "${SCRIPT_DIR}/lib/core.sh" || exit 1
#
# Features:
#   - Automatic path detection
#   - Environment loading
#   - Logging with levels
#   - Error handling
#   - Docker/standalone detection
#   - Security helpers
#   - Network utilities
#   - Template processing
# ==============================================================================

# Strict mode
set -o errexit
set -o nounset
set -o pipefail

# Prevent multiple sourcing
[[ -n "${_CORE_LOADED:-}" ]] && return 0
readonly _CORE_LOADED=1

# ==============================================================================
# CONSTANTS
# ==============================================================================
readonly CORE_VERSION="1.0.0"
readonly CORE_MIN_BASH_VERSION="4.0"

# Colors (disabled if not terminal)
if [[ -t 2 ]]; then
    readonly C_RESET='\033[0m'
    readonly C_RED='\033[0;31m'
    readonly C_GREEN='\033[0;32m'
    readonly C_YELLOW='\033[0;33m'
    readonly C_BLUE='\033[0;34m'
    readonly C_MAGENTA='\033[0;35m'
    readonly C_CYAN='\033[0;36m'
    readonly C_GRAY='\033[0;90m'
    readonly C_BOLD='\033[1m'
else
    readonly C_RESET=''
    readonly C_RED=''
    readonly C_GREEN=''
    readonly C_YELLOW=''
    readonly C_BLUE=''
    readonly C_MAGENTA=''
    readonly C_CYAN=''
    readonly C_GRAY=''
    readonly C_BOLD=''
fi

# ==============================================================================
# PATH DETECTION (Single Source of Truth)
# ==============================================================================

# Find project root by looking for marker files
_find_project_root() {
    local dir="${1:-$(pwd)}"
    local markers=(".env.example" "docker-compose.yml" ".project-root")
    
    while [[ "$dir" != "/" ]]; do
        for marker in "${markers[@]}"; do
            [[ -f "${dir}/${marker}" ]] && echo "$dir" && return 0
        done
        dir="$(dirname "$dir")"
    done
    
    return 1
}

# Initialize all paths from single source
_init_paths() {
    # Detect base path if not set
    if [[ -z "${BASE_PATH:-}" ]]; then
        local script_dir
        script_dir="$(cd "$(dirname "${BASH_SOURCE[1]:-${BASH_SOURCE[0]}}")" && pwd)"
        
        BASE_PATH="$(_find_project_root "$script_dir" 2>/dev/null)" || {
            # Fallback: assume script is in scripts/lib/
            BASE_PATH="$(cd "$script_dir/../.." 2>/dev/null && pwd)" || BASE_PATH="$(pwd)"
        }
    fi
    
    export BASE_PATH
    
    # All paths derived from BASE_PATH
    export DATA_PATH="${DATA_PATH:-${BASE_PATH}/data}"
    export LOGS_PATH="${LOGS_PATH:-${BASE_PATH}/logs}"
    export CONFIG_PATH="${CONFIG_PATH:-${BASE_PATH}/config}"
    export BACKUP_PATH="${BACKUP_PATH:-${BASE_PATH}/data/backups}"
    export SCRIPTS_PATH="${SCRIPTS_PATH:-${BASE_PATH}/scripts}"
    export WEB_PATH="${WEB_PATH:-${BASE_PATH}/web}"
    export TEMPLATES_PATH="${TEMPLATES_PATH:-${BASE_PATH}/templates}"
    export LIB_PATH="${LIB_PATH:-${BASE_PATH}/scripts/lib}"
}

# Get path relative to base
get_path() {
    local path_type="$1"
    local subpath="${2:-}"
    local base_var
    
    case "$path_type" in
        base)      base_var="$BASE_PATH" ;;
        data)      base_var="$DATA_PATH" ;;
        logs)      base_var="$LOGS_PATH" ;;
        config)    base_var="$CONFIG_PATH" ;;
        backup)    base_var="$BACKUP_PATH" ;;
        scripts)   base_var="$SCRIPTS_PATH" ;;
        web)       base_var="$WEB_PATH" ;;
        templates) base_var="$TEMPLATES_PATH" ;;
        lib)       base_var="$LIB_PATH" ;;
        *)
            log_error "Unknown path type: $path_type"
            return 1
            ;;
    esac
    
    if [[ -n "$subpath" ]]; then
        echo "${base_var}/${subpath}"
    else
        echo "$base_var"
    fi
}

# ==============================================================================
# LOGGING
# ==============================================================================

# Log levels: 0=debug, 1=info, 2=warn, 3=error, 4=fatal
declare -gA _LOG_LEVELS=([debug]=0 [info]=1 [warn]=2 [error]=3 [fatal]=4)
_LOG_LEVEL="${LOG_LEVEL:-info}"
_LOG_FILE="${LOG_FILE:-}"

# Internal log function
_log() {
    local level="$1"
    shift
    local message="$*"
    
    # Check if should log
    local level_num="${_LOG_LEVELS[$level]:-1}"
    local current_num="${_LOG_LEVELS[$_LOG_LEVEL]:-1}"
    [[ $level_num -lt $current_num ]] && return 0
    
    # Format timestamp
    local timestamp
    timestamp="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    
    # Format level with color
    local level_colored
    case "$level" in
        debug) level_colored="${C_GRAY}DEBUG${C_RESET}" ;;
        info)  level_colored="${C_GREEN}INFO${C_RESET}" ;;
        warn)  level_colored="${C_YELLOW}WARN${C_RESET}" ;;
        error) level_colored="${C_RED}ERROR${C_RESET}" ;;
        fatal) level_colored="${C_MAGENTA}FATAL${C_RESET}" ;;
    esac
    
    # Get caller info for debug
    local caller_info=""
    if [[ "$level" == "debug" ]] || [[ "${DEBUG:-false}" == "true" ]]; then
        local caller_func="${FUNCNAME[2]:-main}"
        local caller_line="${BASH_LINENO[1]:-0}"
        caller_info=" [${caller_func}:${caller_line}]"
    fi
    
    # Format based on LOG_FORMAT
    local output
    if [[ "${LOG_FORMAT:-text}" == "json" ]]; then
        # JSON format (no colors)
        output="{\"timestamp\":\"$timestamp\",\"level\":\"$level\",\"message\":\"${message//\"/\\\"}\"}"
        echo "$output" >&2
    else
        # Text format with colors
        echo -e "${C_GRAY}[${timestamp}]${C_RESET} ${level_colored}${caller_info} ${message}" >&2
    fi
    
    # Write to log file if configured
    if [[ -n "$_LOG_FILE" ]] && [[ -d "$(dirname "$_LOG_FILE")" ]]; then
        local plain_output="[${timestamp}] [${level^^}]${caller_info} ${message}"
        echo "$plain_output" >> "$_LOG_FILE"
    fi
}

# Public logging functions
log_debug() { _log debug "$@"; }
log_info()  { _log info "$@"; }
log_warn()  { _log warn "$@"; }
log_error() { _log error "$@"; }

log_fatal() {
    _log fatal "$@"
    exit 1
}

# Set log level dynamically
set_log_level() {
    local level="$1"
    if [[ -n "${_LOG_LEVELS[$level]:-}" ]]; then
        _LOG_LEVEL="$level"
        log_debug "Log level set to: $level"
    else
        log_error "Invalid log level: $level (valid: debug, info, warn, error, fatal)"
        return 1
    fi
}

# Set log file dynamically
set_log_file() {
    local file="$1"
    local dir
    dir="$(dirname "$file")"
    
    if [[ ! -d "$dir" ]]; then
        mkdir -p "$dir" || {
            log_error "Cannot create log directory: $dir"
            return 1
        }
    fi
    
    _LOG_FILE="$file"
    log_debug "Log file set to: $file"
}

# ==============================================================================
# ERROR HANDLING
# ==============================================================================

# Error handler
_error_handler() {
    local exit_code=$?
    local line_no="${1:-unknown}"
    local command="${2:-unknown}"
    
    if [[ $exit_code -ne 0 ]]; then
        log_error "Command failed with exit code $exit_code"
        log_error "  Line: $line_no"
        log_error "  Command: $command"
        
        # Print stack trace
        if [[ "${DEBUG:-false}" == "true" ]]; then
            log_debug "Stack trace:"
            local i
            for ((i=1; i<${#FUNCNAME[@]}; i++)); do
                log_debug "  ${FUNCNAME[$i]}() at ${BASH_SOURCE[$i]}:${BASH_LINENO[$((i-1))]}"
            done
        fi
    fi
    
    return $exit_code
}

# Setup error trapping
setup_error_handling() {
    trap '_error_handler ${LINENO} "${BASH_COMMAND}"' ERR
}

# Cleanup registry
declare -ga _CLEANUP_FUNCTIONS=()

# Register cleanup function
register_cleanup() {
    local func="$1"
    _CLEANUP_FUNCTIONS+=("$func")
    log_debug "Registered cleanup: $func"
}

# Run all cleanup functions
_run_cleanup() {
    local exit_code=$?
    
    log_debug "Running ${#_CLEANUP_FUNCTIONS[@]} cleanup functions..."
    
    for func in "${_CLEANUP_FUNCTIONS[@]}"; do
        log_debug "Cleanup: $func"
        "$func" 2>/dev/null || true
    done
    
    exit $exit_code
}

# Setup all traps
setup_traps() {
    trap _run_cleanup EXIT
    trap 'log_warn "Interrupted"; exit 130' INT
    trap 'log_warn "Terminated"; exit 143' TERM
    setup_error_handling
}

# ==============================================================================
# ENVIRONMENT
# ==============================================================================

# Load environment from file
load_env() {
    local env_file="${1:-$(get_path base)/.env}"
    local example_file="$(get_path base)/.env.example"
    
    # Create from example if not exists
    if [[ ! -f "$env_file" ]]; then
        if [[ -f "$example_file" ]]; then
            log_info "Creating .env from .env.example"
            cp "$example_file" "$env_file"
        else
            log_warn "No .env file found at: $env_file"
            return 1
        fi
    fi
    
    # Validate file permissions (should not be world-readable)
    local perms
    perms="$(stat -c '%a' "$env_file" 2>/dev/null || stat -f '%A' "$env_file" 2>/dev/null)"
    if [[ "${perms: -1}" != "0" ]] && [[ "${perms: -1}" != "4" ]]; then
        log_warn ".env file may be too permissive (${perms}). Consider: chmod 600 $env_file"
    fi
    
    # Export variables (handle quotes and comments)
    set -a
    while IFS='=' read -r key value; do
        # Skip empty lines and comments
        [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
        
        # Remove inline comments and surrounding whitespace/quotes
        key="$(echo "$key" | xargs)"
        value="$(echo "$value" | sed 's/#.*$//' | xargs)"
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"
        
        # Expand variables in value
        value="$(eval echo "$value" 2>/dev/null || echo "$value")"
        
        # Export if valid variable name
        if [[ "$key" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
            export "$key=$value"
        fi
    done < "$env_file"
    set +a
    
    # Reinitialize paths with loaded values
    _init_paths
    
    # Update log settings
    _LOG_LEVEL="${LOG_LEVEL:-info}"
    [[ -n "${LOGS_PATH:-}" ]] && _LOG_FILE="${LOGS_PATH}/app.log"
    
    log_debug "Environment loaded from: $env_file"
}

# Get env var with default
env_get() {
    local var="$1"
    local default="${2:-}"
    echo "${!var:-$default}"
}

# Check if env var is true
env_is_true() {
    local var="$1"
    local value="${!var:-false}"
    [[ "$value" == "true" || "$value" == "1" || "$value" == "yes" ]]
}

# Check if env var is false
env_is_false() {
    local var="$1"
    local value="${!var:-true}"
    [[ "$value" == "false" || "$value" == "0" || "$value" == "no" || -z "$value" ]]
}

# Validate required environment variables
require_vars() {
    local missing=()
    
    for var in "$@"; do
        if [[ -z "${!var:-}" ]]; then
            missing+=("$var")
        fi
    done
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing required environment variables:"
        printf '  - %s\n' "${missing[@]}" >&2
        return 1
    fi
}

# ==============================================================================
# DETECTION HELPERS
# ==============================================================================

# Check if running inside Docker
is_docker() {
    [[ -f /.dockerenv ]] || grep -qsE '(docker|containerd)' /proc/1/cgroup 2>/dev/null
}

# Check if running as root
is_root() {
    [[ $EUID -eq 0 ]]
}

# Get OS type
get_os() {
    case "$(uname -s)" in
        Linux*)  echo "linux" ;;
        Darwin*) echo "macos" ;;
        MINGW*|CYGWIN*|MSYS*) echo "windows" ;;
        *) echo "unknown" ;;
    esac
}

# Get Linux distribution
get_distro() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        echo "${ID:-unknown}"
    elif [[ -f /etc/redhat-release ]]; then
        echo "rhel"
    elif [[ -f /etc/debian_version ]]; then
        echo "debian"
    else
        echo "unknown"
    fi
}

# Get deployment mode
get_deploy_mode() {
    local mode="${DEPLOY_MODE:-}"
    
    if [[ -n "$mode" ]]; then
        echo "$mode"
    elif is_docker; then
        echo "docker"
    elif command_exists docker && [[ -f "$(get_path base)/docker-compose.yml" ]]; then
        echo "docker"
    else
        echo "standalone"
    fi
}

# Check if command exists
command_exists() {
    command -v "$1" &>/dev/null
}

# ==============================================================================
# FILE SYSTEM HELPERS
# ==============================================================================

# Ensure directory exists with proper permissions
ensure_dir() {
    local dir="$1"
    local mode="${2:-0755}"
    local owner="${3:-}"
    
    if [[ ! -d "$dir" ]]; then
        mkdir -p "$dir"
        chmod "$mode" "$dir"
        log_debug "Created directory: $dir (mode: $mode)"
    fi
    
    if [[ -n "$owner" ]] && is_root; then
        chown "$owner" "$dir"
    fi
}

# Ensure file exists
ensure_file() {
    local file="$1"
    local mode="${2:-0644}"
    
    local dir
    dir="$(dirname "$file")"
    ensure_dir "$dir"
    
    if [[ ! -f "$file" ]]; then
        touch "$file"
        chmod "$mode" "$file"
        log_debug "Created file: $file"
    fi
}

# Safe file copy with backup
safe_copy() {
    local src="$1"
    local dest="$2"
    local backup="${3:-true}"
    
    if [[ ! -f "$src" ]]; then
        log_error "Source file not found: $src"
        return 1
    fi
    
    # Create backup
    if [[ "$backup" == "true" ]] && [[ -f "$dest" ]]; then
        local backup_file="${dest}.bak.$(date +%Y%m%d_%H%M%S)"
        cp "$dest" "$backup_file"
        log_debug "Backup created: $backup_file"
    fi
    
    ensure_dir "$(dirname "$dest")"
    cp "$src" "$dest"
    log_debug "Copied: $src -> $dest"
}

# Read file content safely
read_file() {
    local file="$1"
    
    if [[ ! -f "$file" ]]; then
        log_error "File not found: $file"
        return 1
    fi
    
    cat "$file"
}

# Write content to file safely
write_file() {
    local file="$1"
    local content="$2"
    local mode="${3:-0644}"
    
    ensure_dir "$(dirname "$file")"
    echo "$content" > "$file"
    chmod "$mode" "$file"
    log_debug "Written: $file"
}

# Append content to file
append_file() {
    local file="$1"
    local content="$2"
    
    ensure_file "$file"
    echo "$content" >> "$file"
}

# ==============================================================================
# TEMPLATE PROCESSING
# ==============================================================================

# Process template file with variable substitution
process_template() {
    local template="$1"
    local output="$2"
    local mode="${3:-0644}"
    
    if [[ ! -f "$template" ]]; then
        log_error "Template not found: $template"
        return 1
    fi
    
    ensure_dir "$(dirname "$output")"
    
    # Use envsubst if available, otherwise fallback
    if command_exists envsubst; then
        envsubst < "$template" > "$output"
    else
        # Manual variable substitution
        local content
        content="$(cat "$template")"
        
        # Replace ${VAR} patterns
        while [[ "$content" =~ \$\{([a-zA-Z_][a-zA-Z0-9_]*)\} ]]; do
            local var="${BASH_REMATCH[1]}"
            local val="${!var:-}"
            content="${content//\$\{$var\}/$val}"
        done
        
        # Replace $VAR patterns (word boundary)
        while [[ "$content" =~ \$([a-zA-Z_][a-zA-Z0-9_]*) ]]; do
            local var="${BASH_REMATCH[1]}"
            local val="${!var:-}"
            content="${content//\$$var/$val}"
        done
        
        echo "$content" > "$output"
    fi
    
    chmod "$mode" "$output"
    log_debug "Processed template: $template -> $output"
}

# ==============================================================================
# SECURITY HELPERS
# ==============================================================================

# Generate secure random password
generate_password() {
    local length="${1:-32}"
    local charset="${2:-a-zA-Z0-9}"
    
    if command_exists openssl; then
        openssl rand -base64 $((length * 2)) | tr -dc "$charset" | head -c "$length"
    elif [[ -f /dev/urandom ]]; then
        tr -dc "$charset" < /dev/urandom | head -c "$length"
    else
        log_error "Cannot generate secure random data"
        return 1
    fi
}

# Generate secure random hex key
generate_key() {
    local length="${1:-64}"
    
    if command_exists openssl; then
        openssl rand -hex $((length / 2))
    else
        generate_password "$length" 'a-f0-9'
    fi
}

# Hash a string (SHA256)
hash_string() {
    local input="$1"
    
    if command_exists openssl; then
        echo -n "$input" | openssl dgst -sha256 | awk '{print $NF}'
    elif command_exists sha256sum; then
        echo -n "$input" | sha256sum | awk '{print $1}'
    else
        log_error "No hashing tool available"
        return 1
    fi
}

# Sanitize string for safe use
sanitize() {
    local input="$1"
    local allowed="${2:-a-zA-Z0-9_-}"
    echo "$input" | tr -cd "$allowed"
}

# ==============================================================================
# NETWORK HELPERS
# ==============================================================================

# Get public IP address
get_public_ip() {
    local services=(
        "https://ifconfig.me"
        "https://api.ipify.org"
        "https://icanhazip.com"
        "https://ipecho.net/plain"
    )
    
    for service in "${services[@]}"; do
        local ip
        ip="$(curl -s --connect-timeout 5 --max-time 10 "$service" 2>/dev/null)" || continue
        
        # Validate IP format
        if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "$ip"
            return 0
        fi
    done
    
    log_warn "Could not detect public IP"
    return 1
}

# Get local IP address
get_local_ip() {
    local ip=""
    
    # Try hostname command
    if command_exists hostname; then
        ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
    fi
    
    # Try ip command
    if [[ -z "$ip" ]] && command_exists ip; then
        ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7}' | head -1)"
    fi
    
    # Try ifconfig
    if [[ -z "$ip" ]] && command_exists ifconfig; then
        ip="$(ifconfig 2>/dev/null | grep -oP 'inet \K[\d.]+' | grep -v '127.0.0.1' | head -1)"
    fi
    
    echo "$ip"
}

# Check if port is available
is_port_available() {
    local port="$1"
    local host="${2:-0.0.0.0}"
    
    if command_exists ss; then
        ! ss -tuln | grep -q ":${port} "
    elif command_exists netstat; then
        ! netstat -tuln 2>/dev/null | grep -q ":${port} "
    elif command_exists nc; then
        ! nc -z "$host" "$port" 2>/dev/null
    else
        # Assume available if we can't check
        return 0
    fi
}

# Wait for port to be available
wait_for_port() {
    local host="$1"
    local port="$2"
    local timeout="${3:-60}"
    local interval="${4:-2}"
    
    local elapsed=0
    
    log_debug "Waiting for ${host}:${port} (timeout: ${timeout}s)..."
    
    while [[ $elapsed -lt $timeout ]]; do
        if nc -z "$host" "$port" 2>/dev/null; then
            log_debug "Port ${host}:${port} is available"
            return 0
        fi
        
        sleep "$interval"
        elapsed=$((elapsed + interval))
    done
    
    log_error "Timeout waiting for ${host}:${port}"
    return 1
}

# Check URL is accessible
check_url() {
    local url="$1"
    local timeout="${2:-10}"
    
    local http_code
    http_code="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout "$timeout" "$url" 2>/dev/null)"
    
    [[ "$http_code" =~ ^[23] ]]
}

# ==============================================================================
# VALIDATION HELPERS
# ==============================================================================

# Validate IP address
is_valid_ip() {
    local ip="$1"
    [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
    
    local IFS='.'
    read -ra octets <<< "$ip"
    for octet in "${octets[@]}"; do
        [[ $octet -le 255 ]] || return 1
    done
}

# Validate domain name
is_valid_domain() {
    local domain="$1"
    [[ "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$ ]]
}

# Validate email
is_valid_email() {
    local email="$1"
    [[ "$email" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]
}

# Validate port number
is_valid_port() {
    local port="$1"
    [[ "$port" =~ ^[0-9]+$ ]] && [[ $port -ge 1 ]] && [[ $port -le 65535 ]]
}

# ==============================================================================
# RETRY MECHANISM
# ==============================================================================

# Retry a command with exponential backoff
retry() {
    local max_attempts="${1:-3}"
    local delay="${2:-5}"
    local max_delay="${3:-60}"
    shift 3
    local cmd=("$@")
    
    local attempt=1
    local current_delay=$delay
    
    while [[ $attempt -le $max_attempts ]]; do
        log_debug "Attempt $attempt/$max_attempts: ${cmd[*]}"
        
        if "${cmd[@]}"; then
            return 0
        fi
        
        if [[ $attempt -lt $max_attempts ]]; then
            log_warn "Attempt $attempt failed, retrying in ${current_delay}s..."
            sleep "$current_delay"
            
            # Exponential backoff with max
            current_delay=$((current_delay * 2))
            [[ $current_delay -gt $max_delay ]] && current_delay=$max_delay
        fi
        
        attempt=$((attempt + 1))
    done
    
    log_error "All $max_attempts attempts failed: ${cmd[*]}"
    return 1
}

# ==============================================================================
# UTILITY FUNCTIONS
# ==============================================================================

# Print key-value pair
print_kv() {
    local key="$1"
    local value="$2"
    printf "${C_CYAN}%-20s${C_RESET} %s\n" "$key:" "$value"
}

# Print section header
print_header() {
    local title="$1"
    echo ""
    echo -e "${C_BOLD}${C_BLUE}=== $title ===${C_RESET}"
    echo ""
}

# Confirm action
confirm() {
    local prompt="${1:-Continue?}"
    local default="${2:-n}"
    
    local choices
    if [[ "$default" == "y" ]]; then
        choices="[Y/n]"
    else
        choices="[y/N]"
    fi
    
    read -rp "$prompt $choices: " response
    response="${response:-$default}"
    
    [[ "$response" =~ ^[Yy] ]]
}

# Check bash version
check_bash_version() {
    local required="${1:-$CORE_MIN_BASH_VERSION}"
    local current="${BASH_VERSION%%(*}"
    
    if [[ "$(printf '%s\n' "$required" "$current" | sort -V | head -n1)" != "$required" ]]; then
        log_fatal "Bash $required or higher required (current: $current)"
    fi
}

# ==============================================================================
# INITIALIZATION
# ==============================================================================

# Initialize core library
_init_core() {
    # Check bash version
    check_bash_version
    
    # Initialize paths
    _init_paths
    
    # Load environment if exists
    local env_file="$(get_path base)/.env"
    if [[ -f "$env_file" ]]; then
        load_env "$env_file"
    fi
    
    # Setup default log file
    if [[ -z "$_LOG_FILE" ]] && [[ -d "$(get_path logs)" ]]; then
        _LOG_FILE="$(get_path logs)/app.log"
    fi
    
    log_debug "Core library v${CORE_VERSION} initialized"
    log_debug "Base path: $BASE_PATH"
    log_debug "Deploy mode: $(get_deploy_mode)"
}

# Auto-initialize when sourced
_init_core
