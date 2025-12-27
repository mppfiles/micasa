#!/bin/bash

# Generate browser-trusted SSL certificates for local development using mkcert
# This creates certificates that don't show browser warnings

set -e

CERTS_DIR="./certs"
DOMAIN="raspberrypi.local"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "🔒 Setting up browser-trusted SSL certificates for local development"
echo ""

# Check if mkcert is installed
if ! command -v mkcert &> /dev/null; then
    print_info "Installing mkcert..."

    # Detect OS and install mkcert
    if [[ "$OSTYPE" == "linux"* ]]; then
        # Check if it's a Debian/Ubuntu system
        if command -v apt &> /dev/null; then
            print_info "Detected Debian/Ubuntu system"

            # Check if mkcert is available in repos (newer versions)
            if apt list mkcert 2>/dev/null | grep -q mkcert; then
                sudo apt update && sudo apt install -y mkcert
            else
                # Install from GitHub releases
                print_info "Installing mkcert from GitHub releases..."
                MKCERT_VERSION=$(curl -s https://api.github.com/repos/FiloSottile/mkcert/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
                wget -O /tmp/mkcert "https://github.com/FiloSottile/mkcert/releases/download/${MKCERT_VERSION}/mkcert-${MKCERT_VERSION}-linux-arm64"
                chmod +x /tmp/mkcert
                sudo mv /tmp/mkcert /usr/local/bin/
            fi
        elif command -v yum &> /dev/null; then
            print_error "Please install mkcert manually on RHEL/CentOS systems"
            echo "Visit: https://github.com/FiloSottile/mkcert#installation"
            exit 1
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &> /dev/null; then
            brew install mkcert
        else
            print_error "Please install Homebrew first, then run: brew install mkcert"
            exit 1
        fi
    else
        print_error "Unsupported OS. Please install mkcert manually."
        echo "Visit: https://github.com/FiloSottile/mkcert#installation"
        exit 1
    fi
fi

# Get user input for domain
echo "Enter your local domain name (or press Enter for raspberrypi.local):"
echo "Examples: raspberrypi.local, homeserver.local, mypi.local"
read -p "Domain: " user_domain

if [ ! -z "$user_domain" ]; then
    DOMAIN="$user_domain"
fi

# Auto-detect local IP
LOCAL_IP=""
if command -v hostname &> /dev/null; then
    LOCAL_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "")
fi

if [ -z "$LOCAL_IP" ]; then
    echo "Enter your device's local IP address (optional):"
    read -p "IP: " user_ip
    if [ ! -z "$user_ip" ]; then
        LOCAL_IP="$user_ip"
    fi
fi

print_info "Domain: $DOMAIN"
if [ ! -z "$LOCAL_IP" ]; then
    print_info "Local IP: $LOCAL_IP"
fi

# Create certs directory
mkdir -p "$CERTS_DIR"

# Install local CA
print_info "Installing local Certificate Authority..."
mkcert -install

# Generate certificates
print_info "Generating certificates..."

# Build domain list
DOMAINS="$DOMAIN localhost"
if [ ! -z "$LOCAL_IP" ]; then
    DOMAINS="$DOMAINS $LOCAL_IP"
fi

# Generate certificate
mkcert -cert-file "$CERTS_DIR/cert.pem" -key-file "$CERTS_DIR/key.pem" $DOMAINS

# Set appropriate permissions
chmod 600 "$CERTS_DIR/key.pem"
chmod 644 "$CERTS_DIR/cert.pem"

print_success "Browser-trusted SSL certificates generated!"
echo ""
echo "📁 Certificates saved to: $CERTS_DIR/"
echo "🔐 Private key: $CERTS_DIR/key.pem"
echo "📜 Certificate: $CERTS_DIR/cert.pem"
echo ""
print_info "Certificate is valid for:"
for domain in $DOMAINS; do
    echo "  • $domain"
done
echo ""

# Update .env file if it exists
ENV_FILE=".env"
if [ -f "$ENV_FILE" ]; then
    print_info "Updating .env file..."

    # Backup
    cp "$ENV_FILE" "$ENV_FILE.backup"

    # Update or add HTTPS settings
    if grep -q "^ENABLE_HTTPS=" "$ENV_FILE"; then
        sed -i "s/^ENABLE_HTTPS=.*/ENABLE_HTTPS=true/" "$ENV_FILE"
    else
        echo "ENABLE_HTTPS=true" >> "$ENV_FILE"
    fi

    if grep -q "^ALLOWED_ORIGINS=" "$ENV_FILE"; then
        sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://$DOMAIN:3443,http://$DOMAIN:3000|" "$ENV_FILE"
    else
        echo "ALLOWED_ORIGINS=https://$DOMAIN:3443,http://$DOMAIN:3000" >> "$ENV_FILE"
    fi

    print_success "Environment file updated"
else
    print_info "Creating .env file..."
    cat > "$ENV_FILE" << EOF
# HTTPS Configuration for Local Network
ENABLE_HTTPS=true
SSL_CERT_PATH=./certs/cert.pem
SSL_KEY_PATH=./certs/key.pem
HTTPS_PORT=3443

# CORS Configuration
ALLOWED_ORIGINS=https://$DOMAIN:3443,http://$DOMAIN:3000

# Add your SmartThings configuration here
# SMARTTHINGS_TOKEN=your_token_here
# WASHER_DEVICE_ID=your_device_id
# DRYER_DEVICE_ID=your_device_id
EOF
    print_success "Environment file created"
fi

echo ""
print_success "Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Restart your application:"
echo "   docker-compose down && docker-compose up -d"
echo ""
echo "2. Access your app (no browser warnings!):"
echo "   🔗 https://$DOMAIN:3443"
if [ ! -z "$LOCAL_IP" ]; then
    echo "   🔗 https://$LOCAL_IP:3443"
fi
echo ""
print_warning "Note: These certificates only work on this device and devices that trust this CA."
print_info "To access from other devices, you may need to:"
echo "  • Copy the CA certificate to other devices, or"
echo "  • Use the self-signed certificate option instead"
