const { execSync } = require('child_process');

const SERVICE_NAME = 'smartthings-monitor';
const SERVICE_FILE = `/etc/systemd/system/${SERVICE_NAME}.service`;

async function uninstallService() {
    try {
        console.log('🗑️ Uninstalling SmartThings Monitor service...');
        
        // Check if running as root
        if (process.getuid && process.getuid() !== 0) {
            console.error('❌ This script must be run with sudo privileges');
            console.error('Run: sudo npm run uninstall-service');
            process.exit(1);
        }
        
        // Stop service if running
        console.log('⏹️ Stopping service...');
        try {
            execSync(`systemctl stop ${SERVICE_NAME}`, { stdio: 'pipe' });
        } catch (error) {
            console.log('ℹ️ Service was not running');
        }
        
        // Disable service
        console.log('❌ Disabling service...');
        try {
            execSync(`systemctl disable ${SERVICE_NAME}`, { stdio: 'pipe' });
        } catch (error) {
            console.log('ℹ️ Service was not enabled');
        }
        
        // Remove service file
        console.log('🗑️ Removing service file...');
        const fs = require('fs');
        if (fs.existsSync(SERVICE_FILE)) {
            fs.unlinkSync(SERVICE_FILE);
            console.log(`✅ Removed ${SERVICE_FILE}`);
        } else {
            console.log('ℹ️ Service file not found');
        }
        
        // Reload systemd
        console.log('🔄 Reloading systemd daemon...');
        execSync('systemctl daemon-reload', { stdio: 'inherit' });
        
        // Reset failed status
        try {
            execSync(`systemctl reset-failed ${SERVICE_NAME}`, { stdio: 'pipe' });
        } catch (error) {
            // Ignore error if service doesn't exist
        }
        
        console.log('\n🎉 Service uninstalled successfully!');
        console.log('The SmartThings Monitor service has been completely removed from your system.');
        
    } catch (error) {
        console.error('❌ Failed to uninstall service:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    uninstallService();
}

module.exports = { uninstallService };