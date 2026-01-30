#!/bin/bash
#
# SecureAgent Installer
# One-liner: curl -fsSL https://raw.githubusercontent.com/Francosimon53/secureagent/main/install.sh | bash
#
# This script installs SecureAgent on your local machine.
# Supports: macOS, Linux, Windows (WSL)
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
REPO_URL="https://github.com/Francosimon53/secureagent.git"
INSTALL_DIR="${SECUREAGENT_DIR:-$HOME/secureagent}"
MIN_NODE_VERSION=20

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

print_banner() {
    echo -e "${CYAN}"
    echo "  ____                           _                    _   "
    echo " / ___|  ___  ___ _   _ _ __ ___| |    __ _  __ _  ___| |_ "
    echo " \\___ \\ / _ \\/ __| | | | '__/ _ \\ |   / _\` |/ _\` |/ _ \\ __|"
    echo "  ___) |  __/ (__| |_| | | |  __/ |__| (_| | (_| |  __/ |_ "
    echo " |____/ \\___|\\___|\\__,_|_|  \\___|_____\\__,_|\\__, |\\___|\\__|"
    echo "                                           |___/          "
    echo -e "${NC}"
    echo -e "${BLUE}Security-focused AI Agent Framework${NC}"
    echo ""
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# -----------------------------------------------------------------------------
# OS Detection
# -----------------------------------------------------------------------------

detect_os() {
    OS="unknown"
    ARCH=$(uname -m)

    case "$(uname -s)" in
        Linux*)
            if grep -q Microsoft /proc/version 2>/dev/null; then
                OS="wsl"
            else
                OS="linux"
            fi
            ;;
        Darwin*)
            OS="macos"
            ;;
        CYGWIN*|MINGW*|MSYS*)
            OS="windows"
            ;;
    esac

    log_info "Detected OS: $OS ($ARCH)"
}

# -----------------------------------------------------------------------------
# Node.js Installation
# -----------------------------------------------------------------------------

get_node_version() {
    if command_exists node; then
        node -v 2>/dev/null | sed 's/v//' | cut -d. -f1
    else
        echo "0"
    fi
}

install_node() {
    local current_version=$(get_node_version)

    if [ "$current_version" -ge "$MIN_NODE_VERSION" ]; then
        log_success "Node.js v$(node -v | sed 's/v//') already installed"
        return 0
    fi

    log_info "Installing Node.js v$MIN_NODE_VERSION..."

    case "$OS" in
        macos)
            if command_exists brew; then
                brew install node@20
            else
                log_info "Installing Homebrew first..."
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
                brew install node@20
            fi
            ;;
        linux|wsl)
            # Use NodeSource repository
            if command_exists apt-get; then
                curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
                sudo apt-get install -y nodejs
            elif command_exists yum; then
                curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
                sudo yum install -y nodejs
            elif command_exists pacman; then
                sudo pacman -S nodejs npm
            else
                log_error "Unsupported package manager. Please install Node.js manually."
                exit 1
            fi
            ;;
        *)
            log_error "Please install Node.js v$MIN_NODE_VERSION manually: https://nodejs.org"
            exit 1
            ;;
    esac

    log_success "Node.js installed: $(node -v)"
}

# -----------------------------------------------------------------------------
# Git Installation Check
# -----------------------------------------------------------------------------

check_git() {
    if ! command_exists git; then
        log_info "Installing git..."
        case "$OS" in
            macos)
                xcode-select --install 2>/dev/null || brew install git
                ;;
            linux|wsl)
                if command_exists apt-get; then
                    sudo apt-get install -y git
                elif command_exists yum; then
                    sudo yum install -y git
                fi
                ;;
        esac
    fi
    log_success "Git available: $(git --version)"
}

# -----------------------------------------------------------------------------
# Clone Repository
# -----------------------------------------------------------------------------

clone_repo() {
    if [ -d "$INSTALL_DIR" ]; then
        log_warn "Directory $INSTALL_DIR already exists"
        read -p "Overwrite? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$INSTALL_DIR"
        else
            log_info "Using existing installation"
            return 0
        fi
    fi

    log_info "Cloning SecureAgent to $INSTALL_DIR..."
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
    log_success "Repository cloned"
}

# -----------------------------------------------------------------------------
# Install Dependencies
# -----------------------------------------------------------------------------

install_dependencies() {
    log_info "Installing dependencies..."
    cd "$INSTALL_DIR"
    npm install --legacy-peer-deps
    log_success "Dependencies installed"
}

# -----------------------------------------------------------------------------
# Create Environment File
# -----------------------------------------------------------------------------

create_env_file() {
    local env_file="$INSTALL_DIR/.env"

    if [ -f "$env_file" ]; then
        log_warn ".env file already exists, skipping"
        return 0
    fi

    log_info "Creating .env file..."

    cat > "$env_file" << 'EOF'
# SecureAgent Configuration
# =========================

# Required: Your Anthropic API key
# Get one at: https://console.anthropic.com/
ANTHROPIC_API_KEY=

# Optional: Telegram Bot Token
# Get one from @BotFather on Telegram
TELEGRAM_BOT_TOKEN=

# Optional: Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Optional: Database (defaults to SQLite)
# DATABASE_URL=sqlite:./data/secureagent.db

# Optional: Logging
LOG_LEVEL=info

# Optional: Security
# CRON_SECRET=your-secret-for-cron-jobs
# WEBHOOK_SECRET=your-webhook-secret
EOF

    log_success "Created .env file at $env_file"
    echo ""
    log_warn "IMPORTANT: Add your ANTHROPIC_API_KEY to $env_file"
}

# -----------------------------------------------------------------------------
# Create Start Script
# -----------------------------------------------------------------------------

create_start_script() {
    local start_script="$INSTALL_DIR/start.sh"

    cat > "$start_script" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"

# Load environment
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Check for API key
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "Error: ANTHROPIC_API_KEY not set in .env"
    echo "Get your API key at: https://console.anthropic.com/"
    exit 1
fi

# Start the server
echo "Starting SecureAgent on http://localhost:${PORT:-3000}"
npm run dev
EOF

    chmod +x "$start_script"
    log_success "Created start script"
}

# -----------------------------------------------------------------------------
# Create CLI Wrapper
# -----------------------------------------------------------------------------

create_cli_wrapper() {
    local cli_script="$INSTALL_DIR/secureagent"

    cat > "$cli_script" << 'EOF'
#!/bin/bash
#
# SecureAgent CLI
#

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Load environment
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

case "$1" in
    start)
        ./start.sh
        ;;
    stop)
        pkill -f "secureagent" || echo "SecureAgent not running"
        ;;
    status)
        if pgrep -f "secureagent" > /dev/null; then
            echo "SecureAgent is running"
        else
            echo "SecureAgent is not running"
        fi
        ;;
    logs)
        tail -f logs/secureagent.log 2>/dev/null || echo "No logs found"
        ;;
    config)
        ${EDITOR:-nano} .env
        ;;
    update)
        git pull
        npm install --legacy-peer-deps
        echo "SecureAgent updated"
        ;;
    doctor)
        echo "Checking SecureAgent installation..."
        echo ""
        echo "Node.js: $(node -v 2>/dev/null || echo 'Not found')"
        echo "npm: $(npm -v 2>/dev/null || echo 'Not found')"
        echo "Git: $(git --version 2>/dev/null || echo 'Not found')"
        echo ""
        if [ -f .env ]; then
            echo ".env: Found"
            if grep -q "ANTHROPIC_API_KEY=sk-" .env; then
                echo "API Key: Configured"
            else
                echo "API Key: Not configured"
            fi
        else
            echo ".env: Not found"
        fi
        ;;
    *)
        echo "SecureAgent CLI"
        echo ""
        echo "Usage: secureagent <command>"
        echo ""
        echo "Commands:"
        echo "  start   - Start SecureAgent server"
        echo "  stop    - Stop SecureAgent server"
        echo "  status  - Check if SecureAgent is running"
        echo "  logs    - View logs"
        echo "  config  - Edit configuration"
        echo "  update  - Update to latest version"
        echo "  doctor  - Check installation"
        echo ""
        ;;
esac
EOF

    chmod +x "$cli_script"
    log_success "Created CLI wrapper"
}

# -----------------------------------------------------------------------------
# Add to PATH
# -----------------------------------------------------------------------------

add_to_path() {
    local shell_rc=""

    case "$SHELL" in
        */zsh)
            shell_rc="$HOME/.zshrc"
            ;;
        */bash)
            shell_rc="$HOME/.bashrc"
            ;;
    esac

    if [ -n "$shell_rc" ]; then
        local path_line="export PATH=\"\$PATH:$INSTALL_DIR\""
        if ! grep -q "secureagent" "$shell_rc" 2>/dev/null; then
            echo "" >> "$shell_rc"
            echo "# SecureAgent" >> "$shell_rc"
            echo "$path_line" >> "$shell_rc"
            log_info "Added SecureAgent to PATH in $shell_rc"
        fi
    fi
}

# -----------------------------------------------------------------------------
# Print Success Message
# -----------------------------------------------------------------------------

print_success() {
    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}  SecureAgent installed successfully!${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo -e "Installation directory: ${CYAN}$INSTALL_DIR${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo ""
    echo "  1. Add your API key:"
    echo -e "     ${CYAN}nano $INSTALL_DIR/.env${NC}"
    echo ""
    echo "  2. Start SecureAgent:"
    echo -e "     ${CYAN}cd $INSTALL_DIR && ./start.sh${NC}"
    echo ""
    echo "  Or use the CLI (restart your terminal first):"
    echo -e "     ${CYAN}secureagent start${NC}"
    echo ""
    echo -e "${BLUE}Documentation:${NC} https://github.com/Francosimon53/secureagent"
    echo ""
}

# -----------------------------------------------------------------------------
# Main Installation
# -----------------------------------------------------------------------------

main() {
    print_banner

    log_info "Starting SecureAgent installation..."
    echo ""

    # Detect OS
    detect_os

    # Check/install prerequisites
    check_git
    install_node

    # Clone and setup
    clone_repo
    install_dependencies
    create_env_file
    create_start_script
    create_cli_wrapper
    add_to_path

    # Done!
    print_success
}

# Run main
main "$@"
