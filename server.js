const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const http = require('http');
const https = require('https');
const fs = require('fs');
const socketIo = require('socket.io');
require('dotenv').config();

const smartThingsService = require('./src/services/smartthings');

const app = express();

// Server configuration
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const ENABLE_HTTPS = process.env.ENABLE_HTTPS === 'true';
const FORCE_HTTPS_REDIRECT = process.env.FORCE_HTTPS_REDIRECT === 'true';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || './certs/key.pem';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || './certs/cert.pem';

// Create HTTP server
const httpServer = http.createServer(app);

// Create HTTPS server if enabled and certificates exist
let httpsServer = null;
let primaryServer = httpServer;

if (ENABLE_HTTPS) {
  try {
    if (fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH)) {
      const privateKey = fs.readFileSync(SSL_KEY_PATH, 'utf8');
      const certificate = fs.readFileSync(SSL_CERT_PATH, 'utf8');
      const credentials = { key: privateKey, cert: certificate };

      httpsServer = https.createServer(credentials, app);
      primaryServer = httpsServer;
      console.log('HTTPS enabled with provided certificates');
    } else {
      console.warn('HTTPS enabled but certificates not found. Using HTTP only.');
      console.warn(`Expected certificates at: ${SSL_KEY_PATH}, ${SSL_CERT_PATH}`);
    }
  } catch (error) {
    console.warn('Failed to load SSL certificates:', error.message);
    console.warn('Falling back to HTTP only');
  }
}

// Use primary server for Socket.IO
const server = primaryServer;
const REFRESH_INTERVAL = parseInt(process.env.REFRESH_INTERVAL) || 30000;

// CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:3000', 'https://localhost:3000'];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // In development, allow any origin
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }

    // Check if origin is in allowed list or matches pattern
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin === '*') return true;
      if (allowedOrigin.includes('*')) {
        const pattern = allowedOrigin.replace(/\*/g, '.*');
        return new RegExp(pattern).test(origin);
      }
      return origin === allowedOrigin;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Initialize Socket.IO with CORS configuration
const io = socketIo(server, {
  cors: {
    origin: corsOptions.origin,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Helper function to create valid CSP connect-src values
const createCSPConnectSrc = () => {
  const baseConnectSrc = ["'self'"];

  // In development, be more permissive
  if (process.env.NODE_ENV === 'development') {
    baseConnectSrc.push('http://localhost:*', 'https://localhost:*', 'ws://localhost:*', 'wss://localhost:*');
    return baseConnectSrc;
  }

  // In production, only add valid (non-wildcard) origins
  if (process.env.ALLOWED_ORIGINS) {
    const validOrigins = process.env.ALLOWED_ORIGINS
      .split(',')
      .map(origin => origin.trim())
      .filter(origin => {
        // Filter out wildcard patterns that are invalid for CSP
        return origin !== '*' && !origin.includes('*');
      })
      .flatMap(origin => {
        // Add both the origin and WebSocket variants
        const results = [origin];
        if (origin.startsWith('http://')) {
          results.push(origin.replace('http://', 'ws://'));
        } else if (origin.startsWith('https://')) {
          results.push(origin.replace('https://', 'wss://'));
        }
        return results;
      });

    baseConnectSrc.push(...validOrigins);
  }

  return baseConnectSrc;
};

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
      connectSrc: createCSPConnectSrc(),
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));
app.use(compression());
app.use(cors(corsOptions));

// HTTP to HTTPS redirect middleware
app.use((req, res, next) => {
  // Only redirect if both HTTPS is enabled and redirect is forced
  if (ENABLE_HTTPS && FORCE_HTTPS_REDIRECT && !req.secure && req.get('x-forwarded-proto') !== 'https') {
    const httpsPort = HTTPS_PORT === 443 ? '' : `:${HTTPS_PORT}`;
    const redirectUrl = `https://${req.get('host').split(':')[0]}${httpsPort}${req.originalUrl}`;

    console.log(`Redirecting HTTP to HTTPS: ${req.url} → ${redirectUrl}`);
    return res.redirect(301, redirectUrl);
  }
  next();
});

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

  const shutdownPromises = [];

  if (httpsServer) {
    shutdownPromises.push(new Promise(resolve => httpsServer.close(resolve)));
  }
  if (httpServer) {
    shutdownPromises.push(new Promise(resolve => httpServer.close(resolve)));
  }

  Promise.all(shutdownPromises).then(() => {
    console.log('All servers closed.');
    process.exit(0);
  });
});

// Start servers
const startServers = () => {
  // Start HTTP server
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`SmartThings Home Monitor HTTP server running on port ${PORT}`);
    console.log(`Access at: http://localhost:${PORT}`);
  });

  // Start HTTPS server if enabled
  if (httpsServer) {
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
      console.log(`SmartThings Home Monitor HTTPS server running on port ${HTTPS_PORT}`);
      console.log(`Access at: https://localhost:${HTTPS_PORT}`);
    });
  }

  // Validate environment variables
  if (!process.env.SMARTTHINGS_TOKEN) {
    console.warn('WARNING: SMARTTHINGS_TOKEN not set in environment');
  }
  if (!process.env.WASHER_DEVICE_ID || !process.env.DRYER_DEVICE_ID) {
    console.warn('WARNING: Device IDs not set in environment');
  }

  // Start periodic updates
  startPeriodicUpdates();
};

startServers();

module.exports = app;
