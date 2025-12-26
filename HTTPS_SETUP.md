# HTTPS Setup Guide

## Quick Setup for Local Development

### Option 1: Generate Self-Signed Certificates (Recommended for Development)

1. **Generate SSL certificates:**

   ```bash
   chmod +x scripts/generate-ssl-certs.sh
   ./scripts/generate-ssl-certs.sh
   ```

2. **Update your .env file:**

   ```bash
   ENABLE_HTTPS=true
   ALLOWED_ORIGINS=https://localhost:3443,http://localhost:3000
   ```

3. **Restart your application:**

   ```bash
   docker-compose down
   docker-compose up --build
   ```

4. **Access your app:**
   - HTTP: <http://localhost:3000>
   - HTTPS: <https://localhost:3443> (accept the browser security warning)

### Option 2: Using Existing Certificates

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

### Option 3: Production with Let's Encrypt

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
