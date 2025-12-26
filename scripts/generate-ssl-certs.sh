#!/bin/bash

# Generate SSL certificates for development
# This creates self-signed certificates for local HTTPS testing

set -e

CERTS_DIR="./certs"
DAYS_VALID=365

echo "Generating SSL certificates for development..."

# Create certs directory if it doesn't exist
mkdir -p "$CERTS_DIR"

# Generate private key
openssl genrsa -out "$CERTS_DIR/key.pem" 2048

# Generate certificate signing request
openssl req -new -key "$CERTS_DIR/key.pem" -out "$CERTS_DIR/csr.pem" -subj "/C=US/ST=State/L=City/O=Organization/OU=OrgUnit/CN=localhost"

# Generate self-signed certificate
openssl x509 -req -in "$CERTS_DIR/csr.pem" -signkey "$CERTS_DIR/key.pem" -out "$CERTS_DIR/cert.pem" -days $DAYS_VALID -extensions v3_req -extfile <(
cat << EOF
[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.localhost
IP.1 = 127.0.0.1
IP.2 = ::1
EOF
)

# Clean up CSR
rm "$CERTS_DIR/csr.pem"

# Set appropriate permissions
chmod 600 "$CERTS_DIR/key.pem"
chmod 644 "$CERTS_DIR/cert.pem"

echo "✅ SSL certificates generated successfully!"
echo "📁 Certificates saved to: $CERTS_DIR/"
echo "🔐 Private key: $CERTS_DIR/key.pem"
echo "📜 Certificate: $CERTS_DIR/cert.pem"
echo ""
echo "To use HTTPS:"
echo "1. Set ENABLE_HTTPS=true in your .env file"
echo "2. Update ALLOWED_ORIGINS to include https:// URLs"
echo "3. Restart your application"
echo ""
echo "⚠️  Note: These are self-signed certificates for development only."
echo "   Browsers will show a security warning that you'll need to accept."