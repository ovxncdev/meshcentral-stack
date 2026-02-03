#!/usr/bin/env bash
# ==============================================================================
# Quick Deploy Script - For Testing GitHub Changes
# ==============================================================================
# Pulls latest code from GitHub and applies configuration without full setup.
# Use this to test changes quickly without running the full setup wizard.
#
# Usage:
#   ./scripts/quick-deploy.sh [domain] [agent_subdomain]
#
# Example:
#   ./scripts/quick-deploy.sh fileupclouds.live agent.fileupclouds.live
#
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

# Configuration - modify these or pass as arguments
DOMAIN="${1:-fileupclouds.live}"
AGENT_SUBDOMAIN="${2:-agent.fileupclouds.live}"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Quick Deploy Script${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "Domain:          ${GREEN}${DOMAIN}${NC}"
echo -e "Agent Subdomain: ${GREEN}${AGENT_SUBDOMAIN}${NC}"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"

cd "$BASE_DIR"

# ==============================================================================
# Step 1: Pull latest from GitHub
# ==============================================================================
echo -e "${YELLOW}[1/7]${NC} Pulling latest code from GitHub..."

if [[ -d ".git" ]]; then
    git fetch origin
    git reset --hard origin/main
    echo -e "${GREEN}✓${NC} Code updated from GitHub"
else
    echo -e "${YELLOW}⚠${NC} Not a git repo - skipping pull"
fi

# ==============================================================================
# Step 2: Update MeshCentral config
# ==============================================================================
echo -e "${YELLOW}[2/7]${NC} Configuring MeshCentral..."

CONFIG_FILE="config/meshcentral/config.json"

# Replace placeholders and domain values
sed -i "s|YOUR_DOMAIN_OR_IP|${DOMAIN}|g" "$CONFIG_FILE"
sed -i "s|\"agentAliasDNS\": \"[^\"]*\"|\"agentAliasDNS\": \"${AGENT_SUBDOMAIN}\"|g" "$CONFIG_FILE"

# Generate session key if placeholder exists
if grep -q "CHANGE_THIS_RANDOM_SESSION_KEY" "$CONFIG_FILE"; then
    SESSION_KEY=$(openssl rand -hex 32)
    sed -i "s|CHANGE_THIS_RANDOM_SESSION_KEY_32_CHARS_MIN|${SESSION_KEY}|g" "$CONFIG_FILE"
fi

echo -e "${GREEN}✓${NC} MeshCentral configured"

# ==============================================================================
# Step 3: Update Nginx configs
# ==============================================================================
echo -e "${YELLOW}[3/7]${NC} Configuring Nginx..."

# Main site config
sed -i "s|YOUR_DOMAIN.COM|${DOMAIN}|g" "config/nginx/sites/meshcentral.conf"

# Agent config
sed -i "s|agent.YOUR_DOMAIN.COM|${AGENT_SUBDOMAIN}|g" "config/nginx/sites/agent.conf"

echo -e "${GREEN}✓${NC} Nginx configured"

# ==============================================================================
# Step 4: Generate SSL certificate with agent subdomain
# ==============================================================================
echo -e "${YELLOW}[4/7]${NC} Generating SSL certificate..."

SSL_DIR="data/ssl"
mkdir -p "$SSL_DIR"

# Generate cert with both domains
sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "${SSL_DIR}/key.pem" \
    -out "${SSL_DIR}/cert.pem" \
    -subj "/CN=${DOMAIN}/O=Remote Support/C=US" \
    -addext "subjectAltName=DNS:${DOMAIN},DNS:*.${DOMAIN},DNS:${AGENT_SUBDOMAIN},DNS:localhost,IP:127.0.0.1" \
    2>/dev/null

# Copy for MeshCentral
sudo cp "${SSL_DIR}/cert.pem" "${SSL_DIR}/webserver-cert-public.crt"
sudo cp "${SSL_DIR}/key.pem" "${SSL_DIR}/webserver-cert-private.key"

# Set permissions
sudo chmod 644 "${SSL_DIR}/cert.pem" "${SSL_DIR}/webserver-cert-public.crt"
sudo chmod 600 "${SSL_DIR}/key.pem" "${SSL_DIR}/webserver-cert-private.key"

echo -e "${GREEN}✓${NC} SSL certificate generated with SAN: ${DOMAIN}, ${AGENT_SUBDOMAIN}"

# ==============================================================================
# Step 5: Stop existing containers
# ==============================================================================
echo -e "${YELLOW}[5/7]${NC} Stopping existing containers..."

sudo docker compose down --remove-orphans 2>/dev/null || true

echo -e "${GREEN}✓${NC} Containers stopped"

# ==============================================================================
# Step 6: Rebuild and start containers
# ==============================================================================
echo -e "${YELLOW}[6/7]${NC} Building and starting containers..."

sudo docker compose build --no-cache admin
sudo docker compose up -d

echo -e "${GREEN}✓${NC} Containers started"

# ==============================================================================
# Step 7: Verify
# ==============================================================================
echo -e "${YELLOW}[7/7]${NC} Verifying deployment..."

sleep 15

# Check containers
echo ""
echo "Container Status:"
sudo docker compose ps --format "table {{.Name}}\t{{.Status}}"

# Check cert
echo ""
echo "Certificate Info:"
openssl x509 -in "${SSL_DIR}/cert.pem" -noout -subject -ext subjectAltName 2>/dev/null | head -5

# Check configs
echo ""
echo "Config Verification:"
echo -n "  MeshCentral cert: "
grep '"cert"' "$CONFIG_FILE" | awk -F'"' '{print $4}'
echo -n "  Agent DNS alias:  "
grep 'agentAliasDNS' "$CONFIG_FILE" | awk -F'"' '{print $4}'
echo -n "  Nginx server:     "
grep "server_name" config/nginx/sites/meshcentral.conf | head -1 | awk '{print $2}' | tr -d ';'
echo -n "  Agent server:     "
grep "server_name" config/nginx/sites/agent.conf | awk '{print $2}' | tr -d ';'

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Web UI:  ${CYAN}https://${DOMAIN}${NC}"
echo -e "Agents:  ${CYAN}https://${AGENT_SUBDOMAIN}${NC}"
echo ""
echo -e "${YELLOW}Note:${NC} If agents don't connect, reinstall them from the web UI"
echo ""
