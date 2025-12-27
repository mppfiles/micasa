const axios = require('axios');

class SmartThingsService {
  constructor() {
    this.baseURL = 'https://api.smartthings.com/v1';
    this.token = process.env.SMARTTHINGS_TOKEN;
    this.timeout = parseInt(process.env.API_TIMEOUT) || 10000;

    if (!this.token) {
      throw new Error('SMARTTHINGS_TOKEN environment variable is required');
    }

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: this.timeout
    });
  }

  async getDeviceStatus(deviceId, deviceName = 'Device') {
    try {
      if (!deviceId) {
        throw new Error(`Device ID for ${deviceName} is not configured`);
      }

      const response = await this.client.get(`/devices/${deviceId}/status`);
      const deviceStatus = response.data;

      return this.parseDeviceStatus(deviceStatus, deviceId, deviceName);
    } catch (error) {
      console.error(`Error fetching ${deviceName} status:`, error.message);

      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }

      // Return a default status in case of error
      return {
        deviceId: deviceId,
        name: deviceName,
        status: 'unknown',
        remainingTime: 0,
        lastUpdated: new Date().toISOString(),
        error: error.message
      };
    }
  }

  parseDeviceStatus(deviceStatus, deviceId, deviceName) {
    try {
      const components = deviceStatus.components;
      let status = 'idle';
      let remainingTime = 0;
      let progress = 0;

      // Common Samsung washer/dryer status mapping
      if (components && components.main) {
        const main = components.main;

// Check washer/dryer machine state
        if (main.washerOperatingState) {
          const operatingState = main.washerOperatingState.machineState?.value;
          status = this.mapOperatingState(operatingState);

          // Get completion time if available
          if (main.washerOperatingState.completionTime) {
            remainingTime = this.parseCompletionTime(main.washerOperatingState.completionTime.value);
          }
        } else if (main.dryerOperatingState) {
          const operatingState = main.dryerOperatingState.machineState?.value;
          status = this.mapOperatingState(operatingState);

          // Get completion time if available
          if (main.dryerOperatingState.completionTime) {
            remainingTime = this.parseCompletionTime(main.dryerOperatingState.completionTime.value);
          }
        }
        // Try alternative field names for washer/dryer status
        else if (main.operation || main.operationState || main.machineState) {
          const operationField = main.operation || main.operationState || main.machineState;
          const operatingState = operationField.value || operationField.operation?.value || operationField.state?.value;
          status = this.mapOperatingState(operatingState);
        }
        // Check for Samsung specific washer job states
        else if (main.washerJobState) {
          const jobState = main.washerJobState.value;
          status = this.mapOperatingState(jobState);
        }

        // Alternative: Check switch status (some devices use this)
        else if (main.switch) {
          status = main.switch.switch?.value === 'on' ? 'running' : 'idle';
        }

// Smart fallback: If we have remaining time but no explicit status, infer it
        if (status === 'idle' && remainingTime > 0) {
          status = 'running';
        }

        // Check for progress indication
        if (main.washerOperatingState?.progress) {
          progress = main.washerOperatingState.progress.value || 0;
        } else if (main.dryerOperatingState?.progress) {
          progress = main.dryerOperatingState.progress.value || 0;
        }
      return {
        deviceId: deviceId,
        name: deviceName,
        status: status,
        remainingTime: remainingTime,
        progress: progress,
        lastUpdated: new Date().toISOString(),
        rawData: deviceStatus // Include raw data for debugging
      };

    } catch (error) {
      console.error('Error parsing device status:', error.message);
      return {
        deviceId: deviceId,
        name: deviceName,
        status: 'unknown',
        remainingTime: 0,
        lastUpdated: new Date().toISOString(),
        error: 'Failed to parse device status'
      };
    }
  }

  mapOperatingState(operatingState) {
    if (!operatingState) return 'unknown';

    // Convert to lowercase for consistent matching
    const state = operatingState.toLowerCase();

    const stateMap = {
      // Common Samsung washer states
      'run': 'running',
      'running': 'running',
      'wash': 'running',
      'washing': 'running',
      'rinse': 'running',
      'rinsing': 'running',
      'spin': 'running',
      'spinning': 'running',
      'drying': 'running',
      'cooling': 'running',
      'wrinkleprevent': 'running',
      'wrinkle prevent': 'running',
      'prewash': 'running',
      'delaystart': 'running',
      'delay start': 'running',

      // Completion states
      'ready': 'complete',
      'finished': 'complete',
      'complete': 'complete',
      'end': 'complete',
      'done': 'complete',

      // Idle states
      'stop': 'idle',
      'stopped': 'idle',
      'off': 'idle',
      'idle': 'idle',
      'none': 'idle',

      // Paused states
      'pause': 'paused',
      'paused': 'paused',
      'hold': 'paused',

      // Active but generic states
      'on': 'running',
      'active': 'running',
      'working': 'running',
      'inprogress': 'running',
      'in progress': 'running'
    };

    return stateMap[state] || 'unknown';
  }

  parseCompletionTime(completionTimeValue) {
    try {
      if (!completionTimeValue) return 0;

      // If it's already a number (minutes), return it
      if (typeof completionTimeValue === 'number') {
        return Math.max(0, completionTimeValue);
      }

      // If it's a string, try to parse it
      if (typeof completionTimeValue === 'string') {
        // Handle ISO datetime format
        if (completionTimeValue.includes('T')) {
          const completionTime = new Date(completionTimeValue);
          const now = new Date();
          const diffMs = completionTime.getTime() - now.getTime();
          return Math.max(0, Math.floor(diffMs / (1000 * 60))); // Convert to minutes
        }

        // Handle duration formats like "PT45M" (ISO 8601 duration)
        if (completionTimeValue.startsWith('PT')) {
          const minutes = completionTimeValue.match(/(\d+)M/);
          const hours = completionTimeValue.match(/(\d+)H/);
          let totalMinutes = 0;

          if (hours) totalMinutes += parseInt(hours[1]) * 60;
          if (minutes) totalMinutes += parseInt(minutes[1]);

          return totalMinutes;
        }

        // Try to parse as number
        const parsed = parseInt(completionTimeValue);
        if (!isNaN(parsed)) {
          return Math.max(0, parsed);
        }
      }

      return 0;
    } catch (error) {
      console.error('Error parsing completion time:', error);
      return 0;
    }
  }

  async listDevices() {
    try {
      const response = await this.client.get('/devices');
      return response.data.items || [];
    } catch (error) {
      console.error('Error listing devices:', error.message);
      throw error;
    }
  }

  async getDeviceInfo(deviceId) {
    try {
      const response = await this.client.get(`/devices/${deviceId}`);
      return response.data;
    } catch (error) {
      console.error('Error getting device info:', error.message);
      throw error;
    }
  }

  formatTime(minutes) {
    if (minutes <= 0) return '0m';

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  }
}

module.exports = new SmartThingsService();
