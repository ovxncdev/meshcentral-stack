# Remote Support Stack

<div align="center">

![MeshCentral](https://img.shields.io/badge/MeshCentral-Powered-blue?style=for-the-badge&logo=webrtc&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

**Self-hosted remote support solution with enterprise features at zero cost.**

[Features](#features) | [Quick Start](#quick-start) | [Documentation](#configuration) | [Scripts](#scripts)

---

</div>

## Overview

A production-ready, self-hosted remote support stack built on [MeshCentral](https://github.com/Ylianst/MeshCentral). Deploy in minutes with Docker and manage hundreds of devices securely from your own infrastructure.

<table>
<tr>
<td width="50%">

### Why Self-Host?

- **Zero recurring costs** - No per-device fees
- **Full data ownership** - Your data never leaves your server
- **No vendor lock-in** - Open source, portable
- **Unlimited technicians** - No seat licenses
- **Custom branding** - White-label ready

</td>
<td width="50%">

### What's Included

- **MeshCentral** - Remote support server
- **Nginx** - Reverse proxy with SSL
- **Fail2Ban** - Brute force protection
- **Uptime Kuma** - Monitoring dashboard
- **Dozzle** - Real-time log viewer
- **Automated backups** - Peace of mind

</td>
</tr>
</table>

---

## Features

<table>
<tr>
<td width="33%" align="center">
<br>
<img src="https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/monitor.svg" width="40" height="40" alt="Remote Desktop">
<br><br>
<strong>Remote Desktop</strong>
<br>
<sub>Full control with multi-monitor support, clipboard sync, and screen blanking</sub>
<br><br>
</td>
<td width="33%" align="center">
<br>
<img src="https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/folder-sync.svg" width="40" height="40" alt="File Transfer">
<br><br>
<strong>File Transfer</strong>
<br>
<sub>Drag-and-drop file management with full directory browsing</sub>
<br><br>
</td>
<td width="33%" align="center">
<br>
<img src="https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/terminal.svg" width="40" height="40" alt="Terminal">
<br><br>
<strong>Terminal Access</strong>
<br>
<sub>SSH, PowerShell, and command prompt remote terminals</sub>
<br><br>
</td>
</tr>
<tr>
<td width="33%" align="center">
<br>
<img src="https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/power.svg" width="40" height="40" alt="Unattended">
<br><br>
<strong>Unattended Access</strong>
<br>
<sub>Persistent agents with Wake-on-LAN and auto-reconnect</sub>
<br><br>
</td>
<td width="33%" align="center">
<br>
<img src="https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/video.svg" width="40" height="40" alt="Recording">
<br><br>
<strong>Session Recording</strong>
<br>
<sub>Record sessions for training, compliance, and auditing</sub>
<br><br>
</td>
<td width="33%" align="center">
<br>
<img src="https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/shield-check.svg" width="40" height="40" alt="Security">
<br><br>
<strong>Enterprise Security</strong>
<br>
<sub>E2E encryption, 2FA, LDAP/AD integration, audit logs</sub>
<br><br>
</td>
</tr>
</table>

---

## Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **OS** | Ubuntu 20.04, Debian 11+ | Ubuntu 22.04 LTS |
| **RAM** | 1 GB | 2 GB (50+ devices) |
| **Storage** | 10 GB | 20 GB |
| **Docker** | 20.10+ | Latest |
| **Ports** | 80, 443 | 80, 443 |

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/meshcentral-stack.git
cd meshcentral-stack

# Run interactive setup
./scripts/setup.sh
```

The setup wizard handles everything:

```
[1/8] Checking Prerequisites
[2/8] Setting Up Docker
[3/8] Creating Directory Structure
[4/8] Configuring Environment
[5/8] Configuring Services
[6/8] Setting Up SSL Certificates
[7/8] Configuring Firewall
[8/8] Starting Services
```

<details>
<summary><strong>Manual Setup</strong></summary>

```bash
# Copy and edit environment file
cp .env.example .env
nano .env

# Start core services
docker compose up -d

# Or start with monitoring
docker compose --profile monitoring up -d

# Or start everything
docker compose --profile full up -d
```

</details>

---

## Configuration

All settings are managed through a single `.env` file.

<details open>
<summary><strong>Essential Settings</strong></summary>

```bash
# Domain & SSL
SERVER_DOMAIN=support.example.com
SSL_EMAIL=admin@example.com
SSL_TYPE=letsencrypt

# Project
PROJECT_NAME=remote-support
ENVIRONMENT=production
TZ=UTC
```

</details>

<details>
<summary><strong>Cloudflare Setup (Recommended for production)</strong></summary>

If you're using Cloudflare as a proxy for SSL/TLS, follow these steps:

**1. DNS Configuration**
- Add an A record pointing to your server IP
- Enable the orange cloud (Proxied) status

**2. Cloudflare Dashboard Settings**
```
SSL/TLS → Overview → Set to "Full" (not Flexible, not Full Strict)
Network → WebSockets → Enable
```

**3. Environment Configuration**
```bash
# In your .env file
CLOUDFLARE_PROXY=true
SSL_TYPE=self-signed  # Cloudflare handles the trusted SSL
```

**Why "Full" SSL Mode?**
- `Flexible`: Cloudflare → Your server over HTTP (causes "invalid origin" errors)
- `Full`: Cloudflare → Your server over HTTPS with self-signed cert ✓
- `Full (Strict)`: Requires a CA-signed certificate on your server

**Troubleshooting**
| Issue | Solution |
|-------|----------|
| "Unable to connect web socket" | Enable WebSockets in Cloudflare Network settings |
| "Invalid HTTP in origin" | Change SSL mode to "Full" |
| 502 Bad Gateway | Wait 30-60 seconds for services to start, check logs |

</details>

<details>
<summary><strong>MeshCentral Settings</strong></summary>

```bash
# Security
MESHCENTRAL_NEW_ACCOUNTS=false
MESHCENTRAL_WEBRTC=false
MESHCENTRAL_PLUGINS=false

# Features
MESHCENTRAL_SESSION_RECORDING=true
MESHCENTRAL_MINIFY=true

# Resources
MESHCENTRAL_MEMORY_LIMIT=512M
```

</details>

<details>
<summary><strong>Backup Settings</strong></summary>

```bash
BACKUP_ENABLED=true
BACKUP_RETENTION_COUNT=7
BACKUP_COMPRESSION=6
```

</details>

See [`.env.example`](.env.example) for all available options.

---

## Architecture

```
                                    Internet
                                        |
                                        v
                              +-------------------+
                              |      Nginx        |
                              |   (SSL + Proxy)   |
                              +-------------------+
                                        |
                 +----------------------+----------------------+
                 |                      |                      |
                 v                      v                      v
        +----------------+     +----------------+     +----------------+
        |  MeshCentral   |     |  Uptime Kuma   |     |    Dozzle      |
        | (Remote Supp.) |     |  (Monitoring)  |     | (Log Viewer)   |
        +----------------+     +----------------+     +----------------+
                 |
                 v
        +----------------+
        |   Fail2Ban     |
        |  (Security)    |
        +----------------+
```

---

## Directory Structure

```
meshcentral-stack/
|
+-- config/
|   +-- meshcentral/         # MeshCentral configuration
|   |   +-- config.json
|   +-- nginx/               # Reverse proxy configuration
|   |   +-- nginx.conf
|   |   +-- sites/
|   +-- fail2ban/            # Brute force protection
|       +-- jail.local
|       +-- filter.d/
|
+-- scripts/
|   +-- lib/                 # Shared shell libraries
|   |   +-- core.sh
|   |   +-- docker.sh
|   +-- setup.sh             # Installation wizard
|   +-- backup.sh            # Backup & restore
|   +-- update.sh            # Update manager
|
+-- web/
|   +-- portal/              # Custom landing page
|       +-- index.html
|
+-- data/                    # Persistent data (git ignored)
+-- logs/                    # Application logs (git ignored)
|
+-- docker-compose.yml       # Service orchestration
+-- .env.example             # Configuration template
+-- README.md
```

---

## Scripts

### Setup Script

```bash
./scripts/setup.sh [options]
```

| Option | Description |
|--------|-------------|
| `--dev` | Development mode with self-signed SSL |
| `--non-interactive` | Automated setup using `.env` values |
| `--skip-docker` | Skip Docker installation |
| `--skip-firewall` | Skip firewall configuration |
| `--force` | Force reinstall |

---

### Backup Script

```bash
./scripts/backup.sh [command] [options]
```

| Command | Description |
|---------|-------------|
| `create` | Create a new backup |
| `restore -i <file>` | Restore from backup |
| `list` | List available backups |
| `prune -k <n>` | Keep only last N backups |
| `verify -i <file>` | Verify backup integrity |

**Automated Backups (Cron)**

```bash
# Daily at 2 AM, keep last 7
0 2 * * * /opt/meshcentral-stack/scripts/backup.sh create -q
```

---

### Update Script

```bash
./scripts/update.sh [command] [options]
```

| Command | Description |
|---------|-------------|
| `check` | Check for available updates |
| `apply` | Pull and apply updates |
| `rollback` | Revert to previous version |

| Option | Description |
|--------|-------------|
| `-s <service>` | Update specific service only |
| `--backup` | Create backup before updating |
| `--force` | Skip confirmation prompts |

---

## Service Profiles

Control which services run using Docker Compose profiles:

```bash
# Core only (MeshCentral + Nginx)
docker compose up -d

# Add monitoring (Uptime Kuma + Dozzle)
docker compose --profile monitoring up -d

# Add security (Fail2Ban)
docker compose --profile security up -d

# Everything
docker compose --profile full up -d
```

---

## SSL Certificates

### Let's Encrypt (Production)

Handled automatically by setup script, or manually:

```bash
docker compose --profile ssl run --rm certbot certonly \
  --webroot --webroot-path=/var/www/html \
  --email admin@example.com --agree-tos \
  -d support.example.com
```

Auto-renewal is configured via cron.

### Self-Signed (Development)

```bash
./scripts/setup.sh --dev
```

---

## Agent Deployment

### Method 1: User Download

1. User visits `https://support.example.com`
2. Clicks **Download Agent**
3. Runs installer
4. Agent auto-connects

### Method 2: Silent Install (PowerShell)

```powershell
$MeshURL = "https://support.example.com/mesh/meshagents?id=3&meshid=XXXXX"
$Installer = "$env:TEMP\meshagent.exe"

Invoke-WebRequest -Uri $MeshURL -OutFile $Installer
Start-Process -FilePath $Installer -ArgumentList "-fullinstall" -Wait -NoNewWindow
Remove-Item $Installer -Force
```

### Method 3: GPO/SCCM

Download MSI from: **MeshCentral Admin** > **My Server** > **Agent Installers**

---

## Firewall Rules

```bash
# UFW (Ubuntu/Debian)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload

# firewalld (RHEL/CentOS)
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

---

## Troubleshooting

<details>
<summary><strong>Services won't start</strong></summary>

```bash
# Check status
docker compose ps

# View logs
docker compose logs -f meshcentral

# Restart services
docker compose restart
```

</details>

<details>
<summary><strong>Cannot access web interface</strong></summary>

1. Verify DNS resolves to server IP
2. Check firewall: `sudo ufw status`
3. Test Nginx config: `docker compose exec nginx nginx -t`
4. Check SSL: `openssl s_client -connect yourdomain.com:443`

</details>

<details>
<summary><strong>Agents won't connect</strong></summary>

1. Domain in config must match SSL certificate
2. Port 443 must be accessible from client
3. Check MeshCentral logs for connection attempts

</details>

<details>
<summary><strong>Reset admin password</strong></summary>

```bash
docker compose exec meshcentral node node_modules/meshcentral \
  --resetaccount admin --pass NewSecurePassword123!
```

</details>

---

## Security Checklist

| Item | Status |
|------|--------|
| Use Let's Encrypt (not self-signed) | Required |
| Disable new account registration | Recommended |
| Enable Two-Factor Authentication | Recommended |
| Enable Fail2Ban profile | Recommended |
| Regular backups configured | Recommended |
| Regular updates scheduled | Recommended |
| Review audit logs periodically | Recommended |

---

## Customization

### Branding

Edit `config/meshcentral/config.json`:

```json
{
  "domains": {
    "": {
      "title": "ACME Corp Support",
      "title2": "IT Help Desk Portal",
      "welcomeText": "Welcome to ACME Support"
    }
  }
}
```

### Landing Page

Edit `web/portal/index.html` with your company branding, colors, and messaging.

---

## Resources

| Resource | Link |
|----------|------|
| MeshCentral Docs | [meshcentral.com/docs](https://meshcentral.com/docs/) |
| MeshCentral GitHub | [github.com/Ylianst/MeshCentral](https://github.com/Ylianst/MeshCentral) |
| User Guide (PDF) | [MeshCentral2UserGuide.pdf](https://meshcentral.com/docs/MeshCentral2UserGuide.pdf) |
| Docker Hub | [hub.docker.com/r/ylianst/meshcentral](https://hub.docker.com/r/ylianst/meshcentral) |

---

<div align="center">

## License

This project is licensed under the **MIT License**.

MeshCentral is licensed under **Apache 2.0**.

---

<sub>Built with MeshCentral, Docker, and Nginx</sub>

</div>
