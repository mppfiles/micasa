const fs = require('fs');
const path = require('path');

// Device discovery script to help find your SmartThings device IDs
const smartThingsService = require('../src/services/smartthings');

async function discoverDevices() {
    console.log('🔍 Discovering SmartThings devices...\n');
    
    try {
        const devices = await smartThingsService.listDevices();
        
        if (!devices || devices.length === 0) {
            console.log('❌ No devices found. Please check your SmartThings token and ensure you have devices added to your SmartThings account.');
            return;
        }
        
        console.log(`✅ Found ${devices.length} device(s):\n`);
        
        // Filter for potential washer/dryer devices
        const applianceDevices = devices.filter(device => {
            const name = device.name?.toLowerCase() || '';
            const label = device.label?.toLowerCase() || '';
            const deviceType = device.deviceTypeName?.toLowerCase() || '';
            
            return name.includes('wash') || name.includes('dry') ||
                   label.includes('wash') || label.includes('dry') ||
                   deviceType.includes('wash') || deviceType.includes('dry') ||
                   deviceType.includes('appliance');
        });
        
        console.log('🏠 ALL DEVICES:');
        console.log('================');
        
        devices.forEach((device, index) => {
            const isAppliance = applianceDevices.includes(device);
            const marker = isAppliance ? '⭐' : '  ';
            
            console.log(`${marker} ${index + 1}. ${device.name || device.label || 'Unnamed Device'}`);
            console.log(`   Device ID: ${device.deviceId}`);
            console.log(`   Type: ${device.deviceTypeName || 'Unknown'}`);
            console.log(`   Manufacturer: ${device.deviceManufacturerName || 'Unknown'}`);
            
            if (device.components) {
                const capabilities = [];
                Object.values(device.components).forEach(component => {
                    if (component.capabilities) {
                        capabilities.push(...component.capabilities.map(cap => cap.id));
                    }
                });
                if (capabilities.length > 0) {
                    console.log(`   Capabilities: ${capabilities.slice(0, 5).join(', ')}${capabilities.length > 5 ? '...' : ''}`);
                }
            }
            
            console.log('');
        });
        
        if (applianceDevices.length > 0) {
            console.log('\n🔧 POTENTIAL WASHER/DRYER DEVICES:');
            console.log('=====================================');
            
            for (const device of applianceDevices) {
                console.log(`⭐ ${device.name || device.label || 'Unnamed Device'}`);
                console.log(`   Device ID: ${device.deviceId}`);
                console.log(`   Add to .env as: WASHER_DEVICE_ID=${device.deviceId} or DRYER_DEVICE_ID=${device.deviceId}`);
                
                try {
                    // Try to get current status
                    const status = await smartThingsService.getDeviceStatus(device.deviceId, device.name || device.label);
                    console.log(`   Current Status: ${status.status}`);
                    if (status.remainingTime > 0) {
                        console.log(`   Remaining Time: ${status.remainingTime} minutes`);
                    }
                } catch (error) {
                    console.log(`   Status Check: Failed (${error.message})`);
                }
                
                console.log('');
            }
        }
        
        // Generate .env template
        console.log('\n📝 SUGGESTED .ENV CONFIGURATION:');
        console.log('=================================');
        
        const washerDevice = applianceDevices.find(d => 
            (d.name || d.label || '').toLowerCase().includes('wash')
        );
        
        const dryerDevice = applianceDevices.find(d => 
            (d.name || d.label || '').toLowerCase().includes('dry')
        );
        
        console.log('# Copy this to your .env file:');
        console.log(`SMARTTHINGS_TOKEN=${process.env.SMARTTHINGS_TOKEN || 'your_token_here'}`);
        console.log(`WASHER_DEVICE_ID=${washerDevice?.deviceId || 'your_washer_device_id'}`);
        console.log(`DRYER_DEVICE_ID=${dryerDevice?.deviceId || 'your_dryer_device_id'}`);
        console.log('PORT=3000');
        console.log('NODE_ENV=production');
        
        if (washerDevice) {
            console.log(`WASHER_NAME=${washerDevice.name || washerDevice.label || 'Washer'}`);
        }
        
        if (dryerDevice) {
            console.log(`DRYER_NAME=${dryerDevice.name || dryerDevice.label || 'Dryer'}`);
        }
        
        console.log('\n✨ Discovery complete! Update your .env file with the device IDs above.');
        
    } catch (error) {
        console.error('❌ Error discovering devices:', error.message);
        
        if (error.response) {
            console.error('Response status:', error.response.status);
            if (error.response.status === 401) {
                console.error('\n🔑 Authentication failed. Please check your SMARTTHINGS_TOKEN in the .env file.');
                console.error('Get your token from: https://account.smartthings.com/tokens');
            }
        }
        
        console.error('\n🔧 Troubleshooting steps:');
        console.error('1. Verify your SMARTTHINGS_TOKEN in .env file');
        console.error('2. Check that your devices are connected to SmartThings');
        console.error('3. Ensure your token has the correct permissions');
        process.exit(1);
    }
}

// Run the discovery if this script is executed directly
if (require.main === module) {
    require('dotenv').config();
    discoverDevices().catch(console.error);
}

module.exports = { discoverDevices };