const fs = require('fs');
const path = require('path');

const SERVICE_NAME = 'smartthings-monitor';
const SERVICE_FILE = `/etc/systemd/system/${SERVICE_NAME}.service`;
const PROJECT_PATH = process.cwd();
const NODE_PATH = process.execPath;

const serviceContent = `[Unit]
Description=SmartThings Home Monitor
Documentation=https://github.com/user/smartthings-monitor
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=${PROJECT_PATH}
Environment=NODE_ENV=production
ExecStart=${NODE_PATH} ${PROJECT_PATH}/server.js
Restart=on-failure
RestartSec=10
KillMode=mixed
KillSignal=SIGINT
TimeoutStopSec=5

# Security settings
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=${PROJECT_PATH}

# Resource limits
MemoryLimit=256M
CPUQuota=50%

[Install]
WantedBy=multi-user.target
`;

async function installService() {
    try {
        console.log('🔧 Installing SmartThings Monitor as system service...');
        
        // Check if running as root
        if (process.getuid && process.getuid() !== 0) {
            console.error('❌ This script must be run with sudo privileges');
            console.error('Run: sudo npm run install-service');
            process.exit(1);
        }
        
        // Check if .env file exists
        const envPath = path.join(PROJECT_PATH, '.env');
        if (!fs.existsSync(envPath)) {
            console.error('❌ .env file not found. Please create one with your SmartThings configuration.');
            console.error('Copy .env.example to .env and update with your settings.');
            process.exit(1);
        }
        
        // Write service file
        console.log(`📝 Creating service file: ${SERVICE_FILE}`);
        fs.writeFileSync(SERVICE_FILE, serviceContent, 'utf8');
        
        // Set proper permissions
        console.log('🔒 Setting service file permissions...');
        fs.chmodSync(SERVICE_FILE, 0o644);
        
        // Reload systemd
        console.log('🔄 Reloading systemd daemon...');
        const { execSync } = require('child_process');
        execSync('systemctl daemon-reload', { stdio: 'inherit' });
        
        // Enable service
        console.log('✅ Enabling service to start on boot...');
        execSync(`systemctl enable ${SERVICE_NAME}`, { stdio: 'inherit' });
        
        console.log('\n🎉 Service installed successfully!');
        console.log('\nNext steps:');
        console.log(`1. Start the service: sudo systemctl start ${SERVICE_NAME}`);
        console.log(`2. Check status: sudo systemctl status ${SERVICE_NAME}`);
        console.log(`3. View logs: sudo journalctl -u ${SERVICE_NAME} -f`);
        console.log(`4. Stop service: sudo systemctl stop ${SERVICE_NAME}`);
        console.log(`5. Disable service: sudo systemctl disable ${SERVICE_NAME}`);
        
        console.log('\n📍 Service will automatically start on system boot.');
        
    } catch (error) {
        console.error('❌ Failed to install service:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    installService();
}

module.exports = { installService };