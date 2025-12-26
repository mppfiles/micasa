# SmartThings Home Monitor

A web application to monitor Samsung SmartThings washer and dryer status on Raspberry Pi 5.

## Features

- Real-time monitoring of washer and dryer status
- Shows device state (running, idle, complete)
- Displays remaining time for active cycles
- Responsive web interface accessible on home network
- Auto-refresh capabilities
- Lightweight and optimized for Raspberry Pi

## Setup

### 1. Samsung SmartThings API Setup

1. Go to [Samsung SmartThings Developer Workspace](https://smartthings.developer.samsung.com/workspace/)
2. Create a new project
3. Generate a Personal Access Token (PAT)
4. Note your device IDs for washer and dryer

### 2. Installation

```bash
# Clone and install dependencies
cd micasa
npm install
```

### 3. Configuration

Create a `.env` file in the root directory:

```env
SMARTTHINGS_TOKEN=your_personal_access_token_here
WASHER_DEVICE_ID=your_washer_device_id
DRYER_DEVICE_ID=your_dryer_device_id
PORT=3000
NODE_ENV=production
```

### 4. Running the Application

```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

The application will be available at `http://your-pi-ip:3000`

### 5. Auto-start on Boot (Optional)

To run automatically on Raspberry Pi boot:

```bash
# Install as system service
sudo npm run install-service

# Enable and start
sudo systemctl enable smartthings-monitor
sudo systemctl start smartthings-monitor
```

## API Endpoints

- `GET /api/status` - Get current status of both devices
- `GET /api/washer` - Get washer status only
- `GET /api/dryer` - Get dryer status only

## Device Status Response

```json
{
  "deviceId": "device-id",
  "name": "Washer",
  "status": "running|idle|complete",
  "remainingTime": 45,
  "lastUpdated": "2025-12-26T10:30:00Z"
}
```

## Troubleshooting

### Finding Device IDs

Run this command to list all your SmartThings devices:

```bash
curl -X GET "https://api.smartthings.com/v1/devices" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Accept: application/json"
```

### Network Access

Make sure port 3000 is accessible on your network. You can change the port in the `.env` file.

## License

MIT License
