#!/bin/bash

# SmartThings Home Monitor Setup Script
# This script helps you set up the application on your Raspberry Pi

set -e

echo "🏠 SmartThings Home Monitor Setup"
echo "=================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed."
    echo "Please install Node.js 16 or higher:"
    echo "curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
    echo "sudo apt-get install -y nodejs"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'.' -f1 | sed 's/v//')
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version 16 or higher is required. You have version $(node --version)"
    exit 1
fi

echo "✅ Node.js $(node --version) is installed"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    exit 1
fi

echo "✅ npm $(npm --version) is installed"

# Install dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from example..."
    cat > .env << EOL
# SmartThings Configuration
SMARTTHINGS_TOKEN=your_personal_access_token_here
WASHER_DEVICE_ID=your_washer_device_id
DRYER_DEVICE_ID=your_dryer_device_id

# Server Configuration
PORT=3000
NODE_ENV=production

# Optional: Custom refresh intervals (in milliseconds)
REFRESH_INTERVAL=30000
API_TIMEOUT=10000

# Optional: Custom device names
WASHER_NAME=Washer
DRYER_NAME=Dryer
EOL
    echo "✅ Created .env file"
else
    echo "ℹ️ .env file already exists"
fi

echo ""
echo "🔧 Setup Instructions:"
echo "====================="
echo ""
echo "1. Get your SmartThings Personal Access Token:"
echo "   - Visit: https://account.smartthings.com/tokens"
echo "   - Click 'Generate new token'"
echo "   - Name it 'Home Monitor'"
echo "   - Select all device scopes"
echo "   - Copy the token"
echo ""

echo "2. Update your .env file with the token:"
echo "   nano .env"
echo "   Replace 'your_personal_access_token_here' with your actual token"
echo ""

echo "3. Discover your device IDs:"
echo "   node scripts/discover-devices.js"
echo ""

echo "4. Update .env with your device IDs (from step 3)"
echo ""

echo "5. Test the application:"
echo "   npm start"
echo "   Visit: http://localhost:3000"
echo ""

echo "6. (Optional) Install as system service:"
echo "   sudo npm run install-service"
echo "   sudo systemctl start smartthings-monitor"
echo ""

echo "🌐 Network Access:"
echo "=================="
echo "The app will be available on your home network at:"
echo "http://$(hostname -I | awk '{print $1}'):3000"
echo ""

echo "💡 Tips:"
echo "========"
echo "- Use 'npm run dev' for development mode with auto-restart"
echo "- Check logs with: journalctl -u smartthings-monitor -f"
echo "- The app works best with Samsung washers and dryers"
echo ""

echo "✨ Setup complete! Follow the instructions above to configure your devices."