#!/bin/bash

# Generate SSL certificates for local network usage
# This creates self-signed certificates with support for local domains

set -e

CERTS_DIR="./certs"
DAYS_VALID=365

# Default values
DOMAIN="localhost"
LOCAL_IP=""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

echo "🔐 Generating SSL certificates for local network usage..."
echo ""

# Get user input for local domain
echo "Enter your local domain name (or press Enter for localhost):"
echo "Examples: raspberrypi.local, homeserver.local, localhost"
read -p "Domain: " user_domain

if [ ! -z "$user_domain" ]; then
    DOMAIN="$user_domain"
fi

# Auto-detect local IP
if command -v hostname &> /dev/null; then
    LOCAL_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "")
fi

if [ -z "$LOCAL_IP" ]; then
    echo "Enter your Raspberry Pi's local IP address (or press Enter to skip):"
    read -p "IP: " user_ip
    if [ ! -z "$user_ip" ]; then
        LOCAL_IP="$user_ip"
    fi
fi

print_info "Domain: $DOMAIN"
if [ ! -z "$LOCAL_IP" ]; then
    print_info "Local IP: $LOCAL_IP"
fi

# Create certs directory if it doesn't exist
mkdir -p "$CERTS_DIR"

print_info "Generating private key..."
# Generate private key
openssl genrsa -out "$CERTS_DIR/key.pem" 2048

print_info "Generating certificate..."
# Generate certificate signing request
openssl req -new -key "$CERTS_DIR/key.pem" -out "$CERTS_DIR/csr.pem" -subj "/C=US/ST=Local/L=Network/O=Home/OU=SmartThings/CN=$DOMAIN"

# Create extensions file for Subject Alternative Names
cat > "$CERTS_DIR/cert.conf" << EOF
[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = $DOMAIN
DNS.2 = localhost
DNS.3 = *.local
DNS.4 = raspberrypi.local
DNS.5 = homeassistant.local
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

# Add local IP if provided
if [ ! -z "$LOCAL_IP" ]; then
    echo "IP.3 = $LOCAL_IP" >> "$CERTS_DIR/cert.conf"
fi

# Generate self-signed certificate with extended validity for local networks
openssl x509 -req -in "$CERTS_DIR/csr.pem" \
    -signkey "$CERTS_DIR/key.pem" \
    -out "$CERTS_DIR/cert.pem" \
    -days $DAYS_VALID \
    -extensions v3_req \
    -extfile "$CERTS_DIR/cert.conf"

# Clean up temporary files
rm "$CERTS_DIR/csr.pem" "$CERTS_DIR/cert.conf"

# Set appropriate permissions
chmod 600 "$CERTS_DIR/key.pem"
chmod 644 "$CERTS_DIR/cert.pem"

print_success "SSL certificates generated successfully!"
echo ""
echo "📁 Certificates saved to: $CERTS_DIR/"
echo "🔐 Private key: $CERTS_DIR/key.pem"
echo "📜 Certificate: $CERTS_DIR/cert.pem"
echo ""
print_info "Certificate is valid for:"
echo "  • $DOMAIN"
echo "  • localhost"
echo "  • *.local domains"
echo "  • raspberrypi.local"
if [ ! -z "$LOCAL_IP" ]; then
    echo "  • $LOCAL_IP"
fi
echo ""
print_info "To use HTTPS with your local domain:"
echo "1. Update your .env file:"
echo "   ENABLE_HTTPS=true"
echo "   ALLOWED_ORIGINS=https://$DOMAIN:3443,http://$DOMAIN:3000"
echo ""
echo "2. Restart your application:"
echo "   docker-compose down && docker-compose up -d"
echo ""
echo "3. Access your app:"
echo "   https://$DOMAIN:3443"
if [ ! -z "$LOCAL_IP" ]; then
    echo "   https://$LOCAL_IP:3443"
fi
echo ""
print_info "Note: You'll need to accept the browser security warning for self-signed certificates"
echo "1. Set ENABLE_HTTPS=true in your .env file"
echo "2. Update ALLOWED_ORIGINS to include https:// URLs"
echo "3. Restart your application"
echo ""
echo "⚠️  Note: These are self-signed certificates for development only."
echo "   Browsers will show a security warning that you'll need to accept."
