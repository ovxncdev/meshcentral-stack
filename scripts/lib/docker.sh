#!/usr/bin/env bash
# ==============================================================================
# Docker Helper Library
# ==============================================================================
# All Docker and Docker Compose related functions.
#
# Usage:
#   source "${SCRIPT_DIR}/lib/core.sh"
#   source "${SCRIPT_DIR}/lib/docker.sh"
#
# Features:
#   - Docker/Compose detection and validation
#   - Container management
#   - Health checks
#   - Log management
#   - Network/Volume helpers
#   - Resource monitoring
# ==============================================================================

# Prevent multiple sourcing
[[ -n "${_DOCKER_LIB_LOADED:-}" ]] && return 0
readonly _DOCKER_LIB_LOADED=1

# Ensure core is loaded
if [[ -z "${_CORE_LOADED:-}" ]]; then
    echo "Error: core.sh must be sourced before docker.sh" >&2
    exit 1
fi

# ==============================================================================
# DOCKER DETECTION
# ==============================================================================

# Check if Docker is installed
has_docker() {
    command_exists docker
}

# Check if Docker daemon is running
is_docker_running() {
    docker info &>/dev/null || sudo docker info &>/dev/null
}

# Check if Docker Compose is available (v2 or v1)
has_compose() {
    docker compose version &>/dev/null || sudo docker compose version &>/dev/null || docker-compose --version &>/dev/null
}

# Get Docker Compose command (v2 preferred, with sudo fallback)
get_compose_cmd() {
    if docker compose version &>/dev/null; then
        echo "docker compose"
    elif sudo -n docker compose version &>/dev/null 2>&1; then
        echo "sudo docker compose"
    elif docker-compose --version &>/dev/null; then
        echo "docker-compose"
    elif sudo -n docker-compose --version &>/dev/null 2>&1; then
        echo "sudo docker-compose"
    else
        log_error "Docker Compose not found"
        return 1
    fi
}

# Get Docker version
get_docker_version() {
    docker version --format '{{.Server.Version}}' 2>/dev/null || \
    sudo docker version --format '{{.Server.Version}}' 2>/dev/null || \
    echo "unknown"
}

# Get Compose version
get_compose_version() {
    if docker compose version &>/dev/null; then
        docker compose version --short 2>/dev/null || echo "unknown"
    elif sudo -n docker compose version &>/dev/null 2>&1; then
        sudo docker compose version --short 2>/dev/null || echo "unknown"
    elif docker-compose --version &>/dev/null; then
        docker-compose --version | grep -oP '\d+\.\d+\.\d+' | head -1 || echo "unknown"
    else
        echo "not installed"
    fi
}

# Validate Docker environment
validate_docker_env() {
    local errors=()
    
    if ! has_docker; then
        errors+=("Docker is not installed")
    elif ! is_docker_running; then
        errors+=("Docker daemon is not running")
    fi
    
    if ! has_compose; then
        errors+=("Docker Compose is not installed")
    fi
    
    if [[ ${#errors[@]} -gt 0 ]]; then
        log_error "Docker environment validation failed:"
        printf '  - %s\n' "${errors[@]}" >&2
        return 1
    fi
    
    log_debug "Docker environment validated"
    log_debug "  Docker: $(get_docker_version)"
    log_debug "  Compose: $(get_compose_version)"
    return 0
}

# ==============================================================================
# COMPOSE FILE HELPERS
# ==============================================================================

# Get compose file path
get_compose_file() {
    local compose_file="${COMPOSE_FILE:-$(get_path base)/docker-compose.yml}"
    
    if [[ ! -f "$compose_file" ]]; then
        log_error "Compose file not found: $compose_file"
        return 1
    fi
    
    echo "$compose_file"
}

# Run docker compose command with proper context
compose() {
    local compose_cmd
    compose_cmd="$(get_compose_cmd)" || return 1
    
    local compose_file
    compose_file="$(get_compose_file)" || return 1
    
    local project_name="${PROJECT_NAME:-remote-support}"
    local env_file="$(get_path base)/.env"
    
    local cmd_args=(
        -f "$compose_file"
        -p "$project_name"
    )
    
    # Add env file if exists
    [[ -f "$env_file" ]] && cmd_args+=(--env-file "$env_file")
    
    log_debug "Running: $compose_cmd ${cmd_args[*]} $*"
    
    # shellcheck disable=SC2086
    $compose_cmd "${cmd_args[@]}" "$@"
}

# ==============================================================================
# CONTAINER MANAGEMENT
# ==============================================================================

# List all project containers
list_containers() {
    local format="${1:-table}"
    
    case "$format" in
        table)
            compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
            ;;
        names)
            compose ps --format "{{.Name}}" -q 2>/dev/null || compose ps -q
            ;;
        json)
            compose ps --format json
            ;;
        *)
            compose ps
            ;;
    esac
}

# Check if container exists
container_exists() {
    local name="$1"
    docker ps -a --format '{{.Names}}' | grep -qx "$name"
}

# Check if container is running
container_is_running() {
    local name="$1"
    docker ps --format '{{.Names}}' | grep -qx "$name"
}

# Get container status
container_status() {
    local name="$1"
    docker inspect --format '{{.State.Status}}' "$name" 2>/dev/null || echo "not found"
}

# Get container health status
container_health() {
    local name="$1"
    docker inspect --format '{{.State.Health.Status}}' "$name" 2>/dev/null || echo "no healthcheck"
}

# Get container ID by name
container_id() {
    local name="$1"
    docker ps -aq --filter "name=^${name}$" 2>/dev/null | head -1
}

# Start containers
start_containers() {
    local services=("$@")
    
    if [[ ${#services[@]} -eq 0 ]]; then
        log_info "Starting all containers..."
        compose up -d
    else
        log_info "Starting containers: ${services[*]}"
        compose up -d "${services[@]}"
    fi
}

# Stop containers
stop_containers() {
    local services=("$@")
    
    if [[ ${#services[@]} -eq 0 ]]; then
        log_info "Stopping all containers..."
        compose stop
    else
        log_info "Stopping containers: ${services[*]}"
        compose stop "${services[@]}"
    fi
}

# Restart containers
restart_containers() {
    local services=("$@")
    
    if [[ ${#services[@]} -eq 0 ]]; then
        log_info "Restarting all containers..."
        compose restart
    else
        log_info "Restarting containers: ${services[*]}"
        compose restart "${services[@]}"
    fi
}

# Remove containers (with optional volumes)
remove_containers() {
    local remove_volumes="${1:-false}"
    shift
    local services=("$@")
    
    local args=(down)
    [[ "$remove_volumes" == "true" ]] && args+=(-v)
    
    if [[ ${#services[@]} -eq 0 ]]; then
        log_info "Removing all containers..."
        compose "${args[@]}"
    else
        log_info "Removing containers: ${services[*]}"
        compose rm -sf "${services[@]}"
    fi
}

# Execute command in container
container_exec() {
    local container="$1"
    shift
    local cmd=("$@")
    
    if ! container_is_running "$container"; then
        log_error "Container not running: $container"
        return 1
    fi
    
    docker exec -it "$container" "${cmd[@]}"
}

# Execute command in container (non-interactive)
container_exec_quiet() {
    local container="$1"
    shift
    local cmd=("$@")
    
    if ! container_is_running "$container"; then
        log_error "Container not running: $container"
        return 1
    fi
    
    docker exec "$container" "${cmd[@]}"
}

# ==============================================================================
# HEALTH CHECKS
# ==============================================================================

# Wait for container to be healthy
wait_for_healthy() {
    local container="$1"
    local timeout="${2:-120}"
    local interval="${3:-5}"
    
    local elapsed=0
    
    log_info "Waiting for $container to be healthy (timeout: ${timeout}s)..."
    
    while [[ $elapsed -lt $timeout ]]; do
        local status
        status="$(container_status "$container")"
        
        if [[ "$status" == "running" ]]; then
            local health
            health="$(container_health "$container")"
            
            if [[ "$health" == "healthy" ]]; then
                log_info "$container is healthy"
                return 0
            elif [[ "$health" == "no healthcheck" ]]; then
                log_debug "$container has no healthcheck, assuming healthy"
                return 0
            fi
            
            log_debug "$container health: $health (${elapsed}s elapsed)"
        elif [[ "$status" == "exited" ]] || [[ "$status" == "dead" ]]; then
            log_error "$container has stopped unexpectedly"
            return 1
        fi
        
        sleep "$interval"
        elapsed=$((elapsed + interval))
    done
    
    log_error "Timeout waiting for $container to be healthy"
    return 1
}

# Wait for all project containers to be healthy
wait_for_all_healthy() {
    local timeout="${1:-180}"
    
    local containers
    mapfile -t containers < <(list_containers names)
    
    if [[ ${#containers[@]} -eq 0 ]]; then
        log_warn "No containers found"
        return 0
    fi
    
    log_info "Waiting for ${#containers[@]} containers to be healthy..."
    
    local failed=()
    for container in "${containers[@]}"; do
        if ! wait_for_healthy "$container" "$timeout" 5; then
            failed+=("$container")
        fi
    done
    
    if [[ ${#failed[@]} -gt 0 ]]; then
        log_error "Containers failed health check: ${failed[*]}"
        return 1
    fi
    
    log_info "All containers are healthy"
    return 0
}

# Check if service is responding on port
service_is_ready() {
    local container="$1"
    local port="$2"
    local protocol="${3:-tcp}"
    
    # Get container IP
    local ip
    ip="$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$container" 2>/dev/null)"
    
    if [[ -z "$ip" ]]; then
        return 1
    fi
    
    if [[ "$protocol" == "http" ]]; then
        curl -sf --max-time 5 "http://${ip}:${port}/" &>/dev/null
    else
        nc -z "$ip" "$port" 2>/dev/null
    fi
}

# ==============================================================================
# LOGS
# ==============================================================================

# Get container logs
container_logs() {
    local container="$1"
    local lines="${2:-100}"
    local follow="${3:-false}"
    
    local args=(logs)
    [[ "$follow" == "true" ]] && args+=(-f)
    [[ -n "$lines" ]] && args+=(--tail "$lines")
    args+=("$container")
    
    compose "${args[@]}"
}

# Get all logs
all_logs() {
    local lines="${1:-100}"
    local follow="${2:-false}"
    
    local args=(logs)
    [[ "$follow" == "true" ]] && args+=(-f)
    [[ -n "$lines" ]] && args+=(--tail "$lines")
    
    compose "${args[@]}"
}

# Search in logs
search_logs() {
    local pattern="$1"
    local container="${2:-}"
    local lines="${3:-1000}"
    
    if [[ -n "$container" ]]; then
        compose logs --tail "$lines" "$container" 2>/dev/null | grep -i "$pattern"
    else
        compose logs --tail "$lines" 2>/dev/null | grep -i "$pattern"
    fi
}

# ==============================================================================
# IMAGES
# ==============================================================================

# Pull latest images
pull_images() {
    local services=("$@")
    
    if [[ ${#services[@]} -eq 0 ]]; then
        log_info "Pulling all images..."
        compose pull
    else
        log_info "Pulling images: ${services[*]}"
        compose pull "${services[@]}"
    fi
}

# Get image for service
get_service_image() {
    local service="$1"
    compose config --format json 2>/dev/null | \
        jq -r ".services.\"$service\".image // empty" 2>/dev/null
}

# List images used by project
list_images() {
    compose config --images 2>/dev/null || \
        compose config | grep -E '^\s+image:' | awk '{print $2}'
}

# Check for image updates
check_image_updates() {
    local images
    mapfile -t images < <(list_images)
    
    local updates_available=false
    
    for image in "${images[@]}"; do
        log_debug "Checking: $image"
        
        # Pull and check if updated
        local before after
        before="$(docker images --format '{{.ID}}' "$image" 2>/dev/null | head -1)"
        docker pull "$image" &>/dev/null
        after="$(docker images --format '{{.ID}}' "$image" 2>/dev/null | head -1)"
        
        if [[ "$before" != "$after" ]]; then
            log_info "Update available: $image"
            updates_available=true
        fi
    done
    
    $updates_available
}

# ==============================================================================
# NETWORKS
# ==============================================================================

# Get project network name
get_network_name() {
    local project_name="${PROJECT_NAME:-remote-support}"
    echo "${project_name}_default"
}

# Check if network exists
network_exists() {
    local network="$1"
    docker network ls --format '{{.Name}}' | grep -qx "$network"
}

# Create network if not exists
ensure_network() {
    local network="$1"
    local driver="${2:-bridge}"
    
    if ! network_exists "$network"; then
        log_info "Creating network: $network"
        docker network create --driver "$driver" "$network"
    fi
}

# Get containers in network
network_containers() {
    local network="$1"
    docker network inspect "$network" --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null
}

# ==============================================================================
# VOLUMES
# ==============================================================================

# Get project volume names
list_volumes() {
    local project_name="${PROJECT_NAME:-remote-support}"
    docker volume ls --format '{{.Name}}' | grep "^${project_name}_"
}

# Check if volume exists
volume_exists() {
    local volume="$1"
    docker volume ls --format '{{.Name}}' | grep -qx "$volume"
}

# Create volume if not exists
ensure_volume() {
    local volume="$1"
    
    if ! volume_exists "$volume"; then
        log_info "Creating volume: $volume"
        docker volume create "$volume"
    fi
}

# Get volume size
volume_size() {
    local volume="$1"
    docker system df -v --format '{{.Name}}\t{{.Size}}' 2>/dev/null | \
        grep "^${volume}" | awk '{print $2}'
}

# Backup volume to tar
backup_volume() {
    local volume="$1"
    local output="$2"
    
    if ! volume_exists "$volume"; then
        log_error "Volume not found: $volume"
        return 1
    fi
    
    ensure_dir "$(dirname "$output")"
    
    log_info "Backing up volume: $volume -> $output"
    
    docker run --rm \
        -v "${volume}:/data:ro" \
        -v "$(dirname "$output"):/backup" \
        alpine tar czf "/backup/$(basename "$output")" -C /data .
}

# Restore volume from tar
restore_volume() {
    local input="$1"
    local volume="$2"
    
    if [[ ! -f "$input" ]]; then
        log_error "Backup file not found: $input"
        return 1
    fi
    
    ensure_volume "$volume"
    
    log_info "Restoring volume: $input -> $volume"
    
    docker run --rm \
        -v "${volume}:/data" \
        -v "$(dirname "$input"):/backup:ro" \
        alpine sh -c "rm -rf /data/* && tar xzf /backup/$(basename "$input") -C /data"
}

# ==============================================================================
# RESOURCE MONITORING
# ==============================================================================

# Get container resource usage
container_stats() {
    local container="$1"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}" "$container" 2>/dev/null
}

# Get all container stats
all_stats() {
    local format="${1:-table}"
    
    case "$format" in
        table)
            docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
            ;;
        json)
            docker stats --no-stream --format '{"name":"{{.Name}}","cpu":"{{.CPUPerc}}","memory":"{{.MemUsage}}","net":"{{.NetIO}}"}'
            ;;
        *)
            docker stats --no-stream
            ;;
    esac
}

# Get container memory usage in MB
container_memory_mb() {
    local container="$1"
    docker stats --no-stream --format '{{.MemUsage}}' "$container" 2>/dev/null | \
        grep -oP '[\d.]+(?=MiB|GiB)' | head -1
}

# Check if container exceeds memory threshold
container_memory_warning() {
    local container="$1"
    local threshold_mb="${2:-500}"
    
    local usage
    usage="$(container_memory_mb "$container")"
    
    if [[ -n "$usage" ]]; then
        local usage_int="${usage%.*}"
        [[ $usage_int -gt $threshold_mb ]]
    else
        return 1
    fi
}

# ==============================================================================
# CLEANUP
# ==============================================================================

# Remove unused images
prune_images() {
    local all="${1:-false}"
    
    log_info "Pruning unused images..."
    
    if [[ "$all" == "true" ]]; then
        docker image prune -af
    else
        docker image prune -f
    fi
}

# Remove unused volumes
prune_volumes() {
    log_warn "Pruning unused volumes..."
    docker volume prune -f
}

# Remove unused networks
prune_networks() {
    log_info "Pruning unused networks..."
    docker network prune -f
}

# Full system prune
prune_all() {
    log_warn "Running full Docker prune..."
    docker system prune -f
}

# ==============================================================================
# UPDATE HELPERS
# ==============================================================================

# Update single service
update_service() {
    local service="$1"
    
    log_info "Updating $service..."
    
    # Pull new image
    compose pull "$service"
    
    # Recreate container
    compose up -d --force-recreate "$service"
    
    # Wait for healthy
    local container="${PROJECT_NAME:-remote-support}-${service}-1"
    wait_for_healthy "$container" 120
}

# Update all services
update_all() {
    log_info "Updating all services..."
    
    # Pull all images
    pull_images
    
    # Recreate all containers
    compose up -d --force-recreate
    
    # Wait for all healthy
    wait_for_all_healthy 180
}

# Rolling update (one at a time)
rolling_update() {
    local services=("$@")
    
    if [[ ${#services[@]} -eq 0 ]]; then
        # Get all services from compose
        mapfile -t services < <(compose config --services)
    fi
    
    log_info "Rolling update for ${#services[@]} services..."
    
    for service in "${services[@]}"; do
        update_service "$service"
        log_info "Waiting 10s before next service..."
        sleep 10
    done
    
    log_info "Rolling update complete"
}

# ==============================================================================
# BUILD HELPERS
# ==============================================================================

# Build images
build_images() {
    local services=("$@")
    local no_cache="${BUILD_NO_CACHE:-false}"
    
    local args=(build)
    [[ "$no_cache" == "true" ]] && args+=(--no-cache)
    
    if [[ ${#services[@]} -eq 0 ]]; then
        log_info "Building all images..."
        compose "${args[@]}"
    else
        log_info "Building: ${services[*]}"
        compose "${args[@]}" "${services[@]}"
    fi
}

# ==============================================================================
# DEBUG HELPERS
# ==============================================================================

# Print Docker info
print_docker_info() {
    print_header "Docker Environment"
    
    print_kv "Docker Version" "$(get_docker_version)"
    print_kv "Compose Version" "$(get_compose_version)"
    print_kv "Compose File" "$(get_compose_file 2>/dev/null || echo 'not found')"
    print_kv "Project Name" "${PROJECT_NAME:-remote-support}"
    
    echo ""
    log_info "Containers:"
    list_containers table
    
    echo ""
    log_info "Volumes:"
    list_volumes
    
    echo ""
    log_info "Resource Usage:"
    all_stats table
}

# Debug container
debug_container() {
    local container="$1"
    
    print_header "Container: $container"
    
    print_kv "Status" "$(container_status "$container")"
    print_kv "Health" "$(container_health "$container")"
    
    echo ""
    log_info "Environment:"
    docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container" 2>/dev/null | head -20
    
    echo ""
    log_info "Recent Logs:"
    docker logs --tail 50 "$container" 2>&1 | tail -30
}

log_debug "Docker helper library loaded"
