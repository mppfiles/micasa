# HTTPS Setup Guide

## Quick Setup for Local Development

### Option 1: Generate Self-Signed Certificates (Supports Local Domains)

1. **Generate SSL certificates for your local network:**

   ```bash
   chmod +x scripts/generate-ssl-certs.sh
   ./scripts/generate-ssl-certs.sh
   ```

   The script will ask for your local domain (e.g., `raspberrypi.local`) and automatically include common local domains.

### Option 2: Browser-Trusted Local Certificates (Recommended for Local Network)

For certificates that don't show browser warnings on your local network:

1. **Generate trusted local certificates:**

   ```bash
   chmod +x scripts/setup-local-ssl.sh
   ./scripts/setup-local-ssl.sh
   ```

2. **Access your app without warnings:**
   - 🔗 `https://raspberrypi.local:3443`
   - 🔗 `https://your-pi-ip:3443`

### Option 3: Using Existing Certificates

1. **Place your certificates in the certs/ directory:**

   ```bash
   mkdir -p certs
   cp /path/to/your/private-key.pem certs/key.pem
   cp /path/to/your/certificate.pem certs/cert.pem
   ```

2. **Update your .env file:**

   ```bash
   ENABLE_HTTPS=true
   SSL_KEY_PATH=./certs/key.pem
   SSL_CERT_PATH=./certs/cert.pem
   ALLOWED_ORIGINS=https://your-domain.com,https://localhost:3443
   ```

### Option 3: Let's Encrypt on Raspberry Pi (Recommended for Production)

For production use with real SSL certificates on your Raspberry Pi:

#### Quick Setup:
```bash
sudo chmod +x scripts/simple-letsencrypt.sh
sudo ./scripts/simple-letsencrypt.sh
```

#### Manual Setup:

1. **Install certbot:**
   ```bash
   sudo apt update
   sudo apt install certbot
   ```

2. **Get your certificate (choose one method):**

   **Method A: Standalone (easiest)**
   ```bash
   sudo certbot certonly --standalone \
     --email your-email@example.com \
     --agree-tos \
     -d your-domain.com
   ```

   **Method B: DNS validation (if port 80 is blocked)**
   ```bash
   sudo certbot certonly --manual \
     --preferred-challenges dns \
     --email your-email@example.com \
     --agree-tos \
     -d your-domain.com
   ```

3. **Copy certificates to your app:**
   ```bash
   sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./certs/cert.pem
   sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./certs/key.pem
   sudo chmod 644 ./certs/cert.pem
   sudo chmod 600 ./certs/key.pem
   ```

4. **Update your .env file:**
   ```bash
   ENABLE_HTTPS=true
   SSL_CERT_PATH=./certs/cert.pem
   SSL_KEY_PATH=./certs/key.pem
   ALLOWED_ORIGINS=https://your-domain.com
   HTTPS_PORT=443
   ```

5. **Set up auto-renewal:**
   ```bash
   # Create renewal script
   sudo tee /usr/local/bin/renew-micasa-certs.sh << 'EOF'
   #!/bin/bash
   certbot renew --quiet
   if [ $? -eq 0 ]; then
       cp /etc/letsencrypt/live/your-domain.com/fullchain.pem /path/to/your/app/certs/cert.pem
       cp /etc/letsencrypt/live/your-domain.com/privkey.pem /path/to/your/app/certs/key.pem
       chmod 644 /path/to/your/app/certs/cert.pem
       chmod 600 /path/to/your/app/certs/key.pem
       # Restart your app
       systemctl restart your-app || docker-compose -f /path/to/your/app/docker-compose.yml restart
   fi
   EOF

   sudo chmod +x /usr/local/bin/renew-micasa-certs.sh

   # Add to crontab
   (crontab -l 2>/dev/null; echo "0 3 * * 1 /usr/local/bin/renew-micasa-certs.sh") | crontab -
   ```

6. **Configure your router:**
   - Port forward port 443 to your Raspberry Pi
   - Ensure your domain points to your public IP

### Option 4: Production with Reverse Proxy (Advanced)

For production, use a reverse proxy like nginx with Let's Encrypt certificates:

1. **Create nginx configuration:**

   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       return 301 https://$server_name$request_uri;
   }

   server {
       listen 443 ssl;
       server_name your-domain.com;

       ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

       location / {
           proxy_pass http://localhost:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       location /socket.io/ {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

2. **Update .env for production:**

   ```bash
   NODE_ENV=production
   ENABLE_HTTPS=false  # nginx handles SSL termination
   ALLOWED_ORIGINS=https://your-domain.com
   ```

## Troubleshooting

### "NET::ERR_SSL_PROTOCOL_ERROR"

- Make sure HTTPS is enabled: `ENABLE_HTTPS=true`
- Check that certificates exist in the certs/ directory
- Verify certificate paths in environment variables

### Browser Security Warnings (Self-Signed Certs)

- Click "Advanced" → "Proceed to localhost (unsafe)"
- This is normal for self-signed certificates

### Mixed Content Warnings

- Update ALLOWED_ORIGINS to include both HTTP and HTTPS URLs
- Ensure your frontend uses the same protocol (HTTP/HTTPS) as the server

### Docker Issues

- Make sure the certs directory is mounted: check docker-compose.yml volumes
- Verify certificate permissions (key.pem should be 600, cert.pem should be 644)

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `ENABLE_HTTPS` | Enable HTTPS server | `true` or `false` |
| `HTTPS_PORT` | HTTPS port number | `3443` |
| `SSL_KEY_PATH` | Path to private key | `./certs/key.pem` |
| `SSL_CERT_PATH` | Path to certificate | `./certs/cert.pem` |
| `ALLOWED_ORIGINS` | Allowed CORS origins | `https://localhost:3443,http://localhost:3000` |
