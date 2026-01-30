#!/bin/bash
#
# SecureAgent Local Setup Script
# Interactive guided setup for self-hosted deployment
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

print_header() {
    clear
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                                                               ║"
    echo "║   ${BOLD}SecureAgent Local Setup${NC}${CYAN}                                    ║"
    echo "║                                                               ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

prompt() {
    local message="$1"
    local default="$2"
    local result

    if [ -n "$default" ]; then
        read -p "$(echo -e "${BLUE}$message${NC} [${default}]: ")" result
        echo "${result:-$default}"
    else
        read -p "$(echo -e "${BLUE}$message${NC}: ")" result
        echo "$result"
    fi
}

prompt_secret() {
    local message="$1"
    local result

    read -sp "$(echo -e "${BLUE}$message${NC}: ")" result
    echo ""
    echo "$result"
}

prompt_yes_no() {
    local message="$1"
    local default="${2:-n}"
    local result

    if [ "$default" = "y" ]; then
        read -p "$(echo -e "${BLUE}$message${NC} [Y/n]: ")" result
        result="${result:-y}"
    else
        read -p "$(echo -e "${BLUE}$message${NC} [y/N]: ")" result
        result="${result:-n}"
    fi

    [[ "$result" =~ ^[Yy] ]]
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

# -----------------------------------------------------------------------------
# Check Prerequisites
# -----------------------------------------------------------------------------

check_prerequisites() {
    echo ""
    echo -e "${BOLD}Checking prerequisites...${NC}"
    echo ""

    local missing=0

    # Check Node.js
    if command -v node >/dev/null 2>&1; then
        local node_version=$(node -v | sed 's/v//' | cut -d. -f1)
        if [ "$node_version" -ge 20 ]; then
            success "Node.js $(node -v)"
        else
            warn "Node.js $(node -v) - version 20+ recommended"
        fi
    else
        error "Node.js not found"
        missing=1
    fi

    # Check npm
    if command -v npm >/dev/null 2>&1; then
        success "npm $(npm -v)"
    else
        error "npm not found"
        missing=1
    fi

    # Check git
    if command -v git >/dev/null 2>&1; then
        success "Git $(git --version | cut -d' ' -f3)"
    else
        warn "Git not found (optional)"
    fi

    # Check Docker (optional)
    if command -v docker >/dev/null 2>&1; then
        success "Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"
    else
        info "Docker not found (optional - for containerized deployment)"
    fi

    echo ""

    if [ $missing -eq 1 ]; then
        error "Missing required prerequisites. Please install them first."
        echo ""
        echo "Install Node.js: https://nodejs.org/"
        exit 1
    fi
}

# -----------------------------------------------------------------------------
# Install Dependencies
# -----------------------------------------------------------------------------

install_deps() {
    echo ""
    echo -e "${BOLD}Installing dependencies...${NC}"
    echo ""

    cd "$PROJECT_DIR"

    if [ -f "package-lock.json" ]; then
        npm ci --legacy-peer-deps
    else
        npm install --legacy-peer-deps
    fi

    success "Dependencies installed"
}

# -----------------------------------------------------------------------------
# Configure Environment
# -----------------------------------------------------------------------------

configure_env() {
    local env_file="$PROJECT_DIR/.env"

    echo ""
    echo -e "${BOLD}Configuration${NC}"
    echo ""
    echo "Let's set up your SecureAgent configuration."
    echo ""

    # Anthropic API Key
    echo -e "${YELLOW}1. Anthropic API Key${NC}"
    echo "   Get your API key at: https://console.anthropic.com/"
    echo ""

    local api_key
    if [ -f "$env_file" ] && grep -q "ANTHROPIC_API_KEY=sk-" "$env_file"; then
        if prompt_yes_no "   API key already configured. Update it?"; then
            api_key=$(prompt_secret "   Enter your Anthropic API key")
        fi
    else
        api_key=$(prompt_secret "   Enter your Anthropic API key")
    fi

    # Telegram Bot Token (optional)
    echo ""
    echo -e "${YELLOW}2. Telegram Bot (Optional)${NC}"
    echo "   Create a bot with @BotFather on Telegram"
    echo ""

    local telegram_token=""
    if prompt_yes_no "   Set up Telegram bot?"; then
        telegram_token=$(prompt_secret "   Enter your Telegram bot token")
    fi

    # Port
    echo ""
    echo -e "${YELLOW}3. Server Port${NC}"
    local port=$(prompt "   Port to run on" "3000")

    # Create .env file
    echo ""
    info "Creating configuration file..."

    cat > "$env_file" << EOF
# SecureAgent Configuration
# Generated by setup-local.sh on $(date)

# Required: Anthropic API Key
ANTHROPIC_API_KEY=${api_key}

# Optional: Telegram Bot
TELEGRAM_BOT_TOKEN=${telegram_token}

# Server Configuration
PORT=${port}
HOST=0.0.0.0
NODE_ENV=development

# Database
DATABASE_URL=sqlite:./data/secureagent.db

# Logging
LOG_LEVEL=info

# Security (auto-generated)
JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -d '\n')
ENCRYPTION_KEY=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -d '\n')
EOF

    success "Configuration saved to .env"
}

# -----------------------------------------------------------------------------
# Setup Data Directory
# -----------------------------------------------------------------------------

setup_data_dir() {
    echo ""
    info "Setting up data directory..."

    mkdir -p "$PROJECT_DIR/data"
    mkdir -p "$PROJECT_DIR/logs"

    success "Data directories created"
}

# -----------------------------------------------------------------------------
# Setup Telegram Webhook (if configured)
# -----------------------------------------------------------------------------

setup_telegram() {
    if [ -f "$PROJECT_DIR/.env" ]; then
        source "$PROJECT_DIR/.env" 2>/dev/null || true
    fi

    if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
        echo ""
        echo -e "${BOLD}Telegram Bot Setup${NC}"
        echo ""

        info "To complete Telegram setup, you'll need to register the webhook"
        info "after starting the server. Run this command:"
        echo ""
        echo -e "${CYAN}curl -X POST \"https://api.telegram.org/bot\$TELEGRAM_BOT_TOKEN/setWebhook?url=YOUR_PUBLIC_URL/api/telegram\"${NC}"
        echo ""
        info "Replace YOUR_PUBLIC_URL with your server's public URL"
        info "(e.g., https://your-domain.com or an ngrok URL for local testing)"
    fi
}

# -----------------------------------------------------------------------------
# Create Systemd Service (Linux only)
# -----------------------------------------------------------------------------

create_systemd_service() {
    if [ "$(uname)" != "Linux" ]; then
        return
    fi

    echo ""
    if prompt_yes_no "Create systemd service for auto-start?"; then
        local service_file="/etc/systemd/system/secureagent.service"

        sudo tee "$service_file" > /dev/null << EOF
[Unit]
Description=SecureAgent AI Assistant
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartSec=10
StandardOutput=append:$PROJECT_DIR/logs/secureagent.log
StandardError=append:$PROJECT_DIR/logs/secureagent-error.log
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

        sudo systemctl daemon-reload
        sudo systemctl enable secureagent

        success "Systemd service created"
        info "Start with: sudo systemctl start secureagent"
        info "View logs: sudo journalctl -u secureagent -f"
    fi
}

# -----------------------------------------------------------------------------
# Print Summary
# -----------------------------------------------------------------------------

print_summary() {
    local port="${PORT:-3000}"

    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                               ║${NC}"
    echo -e "${GREEN}║   ${BOLD}Setup Complete!${NC}${GREEN}                                           ║${NC}"
    echo -e "${GREEN}║                                                               ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BOLD}Start SecureAgent:${NC}"
    echo ""
    echo -e "  ${CYAN}cd $PROJECT_DIR${NC}"
    echo -e "  ${CYAN}npm run dev${NC}"
    echo ""
    echo -e "${BOLD}Or use Docker:${NC}"
    echo ""
    echo -e "  ${CYAN}docker-compose up -d${NC}"
    echo ""
    echo -e "${BOLD}Access:${NC}"
    echo ""
    echo -e "  API:    ${CYAN}http://localhost:${port}/api${NC}"
    echo -e "  Health: ${CYAN}http://localhost:${port}/api/health${NC}"
    echo ""
    echo -e "${BOLD}Useful Commands:${NC}"
    echo ""
    echo -e "  ${CYAN}npm run dev${NC}      - Start development server"
    echo -e "  ${CYAN}npm run build${NC}    - Build for production"
    echo -e "  ${CYAN}npm run start${NC}    - Start production server"
    echo -e "  ${CYAN}npm run test${NC}     - Run tests"
    echo ""
    echo -e "${BOLD}Documentation:${NC} https://github.com/Francosimon53/secureagent"
    echo ""
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

main() {
    print_header

    echo "This script will guide you through setting up SecureAgent locally."
    echo ""

    if ! prompt_yes_no "Continue with setup?" "y"; then
        echo "Setup cancelled."
        exit 0
    fi

    check_prerequisites
    install_deps
    configure_env
    setup_data_dir
    setup_telegram
    create_systemd_service
    print_summary
}

# Run
main "$@"
