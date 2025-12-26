const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const smartThingsService = require('./src/services/smartthings');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const REFRESH_INTERVAL = parseInt(process.env.REFRESH_INTERVAL) || 30000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
      connectSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store latest device status
let lastStatus = {
  washer: null,
  dryer: null,
  lastUpdated: null
};

// API Routes
app.get('/api/status', async (req, res) => {
  try {
    const [washerStatus, dryerStatus] = await Promise.all([
      smartThingsService.getDeviceStatus(process.env.WASHER_DEVICE_ID, process.env.WASHER_NAME || 'Washer'),
      smartThingsService.getDeviceStatus(process.env.DRYER_DEVICE_ID, process.env.DRYER_NAME || 'Dryer')
    ]);

    const status = {
      washer: washerStatus,
      dryer: dryerStatus,
      lastUpdated: new Date().toISOString()
    };

    lastStatus = status;
    res.json(status);
  } catch (error) {
    console.error('Error fetching device status:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch device status',
      message: error.message 
    });
  }
});

app.get('/api/washer', async (req, res) => {
  try {
    const status = await smartThingsService.getDeviceStatus(
      process.env.WASHER_DEVICE_ID, 
      process.env.WASHER_NAME || 'Washer'
    );
    res.json(status);
  } catch (error) {
    console.error('Error fetching washer status:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch washer status',
      message: error.message 
    });
  }
});

app.get('/api/dryer', async (req, res) => {
  try {
    const status = await smartThingsService.getDeviceStatus(
      process.env.DRYER_DEVICE_ID, 
      process.env.DRYER_NAME || 'Dryer'
    );
    res.json(status);
  } catch (error) {
    console.error('Error fetching dryer status:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch dryer status',
      message: error.message 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send current status to new client
  if (lastStatus.washer && lastStatus.dryer) {
    socket.emit('status-update', lastStatus);
  }

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });

  socket.on('request-update', async () => {
    try {
      const [washerStatus, dryerStatus] = await Promise.all([
        smartThingsService.getDeviceStatus(process.env.WASHER_DEVICE_ID, process.env.WASHER_NAME || 'Washer'),
        smartThingsService.getDeviceStatus(process.env.DRYER_DEVICE_ID, process.env.DRYER_NAME || 'Dryer')
      ]);

      const status = {
        washer: washerStatus,
        dryer: dryerStatus,
        lastUpdated: new Date().toISOString()
      };

      lastStatus = status;
      socket.emit('status-update', status);
    } catch (error) {
      console.error('Error in socket status update:', error.message);
      socket.emit('error', { message: 'Failed to fetch device status' });
    }
  });
});

// Periodic status updates via WebSocket
const startPeriodicUpdates = () => {
  setInterval(async () => {
    try {
      const [washerStatus, dryerStatus] = await Promise.all([
        smartThingsService.getDeviceStatus(process.env.WASHER_DEVICE_ID, process.env.WASHER_NAME || 'Washer'),
        smartThingsService.getDeviceStatus(process.env.DRYER_DEVICE_ID, process.env.DRYER_NAME || 'Dryer')
      ]);

      const status = {
        washer: washerStatus,
        dryer: dryerStatus,
        lastUpdated: new Date().toISOString()
      };

      // Only emit if status changed or significant time passed
      const statusChanged = JSON.stringify(lastStatus) !== JSON.stringify(status);
      if (statusChanged) {
        lastStatus = status;
        io.emit('status-update', status);
        console.log('Status updated and broadcasted');
      }
    } catch (error) {
      console.error('Error in periodic update:', error.message);
      io.emit('error', { message: 'Failed to fetch device status' });
    }
  }, REFRESH_INTERVAL);
};

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`SmartThings Home Monitor server running on port ${PORT}`);
  console.log(`Access at: http://localhost:${PORT}`);
  
  // Validate environment variables
  if (!process.env.SMARTTHINGS_TOKEN) {
    console.warn('WARNING: SMARTTHINGS_TOKEN not set in environment');
  }
  if (!process.env.WASHER_DEVICE_ID || !process.env.DRYER_DEVICE_ID) {
    console.warn('WARNING: Device IDs not set in environment');
  }
  
  // Start periodic updates
  startPeriodicUpdates();
});

module.exports = app;