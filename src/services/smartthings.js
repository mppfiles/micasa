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

      // Debug logging to understand the actual API response structure
      if (process.env.NODE_ENV !== 'production') {
        console.log(`\n=== DEBUG: ${deviceName} Device Status ===`);
        console.log('Full response components:', JSON.stringify(components, null, 2));
        if (components && components.main) {
          console.log('Available main component capabilities:', Object.keys(components.main));
        }
      }

      // Common Samsung washer/dryer status mapping
      if (components && components.main) {
        const main = components.main;

// Check washer/dryer machine state
        if (main.washerOperatingState) {
          if (process.env.NODE_ENV !== 'production') {
            console.log('Found washerOperatingState:', JSON.stringify(main.washerOperatingState, null, 2));
          }
          const operatingState = main.washerOperatingState.machineState?.value;
          if (process.env.NODE_ENV !== 'production') {
            console.log('Operating state value:', operatingState);
          }
          status = this.mapOperatingState(operatingState);

          // Get completion time if available
          if (main.washerOperatingState.completionTime) {
            remainingTime = this.parseCompletionTime(main.washerOperatingState.completionTime.value);
            if (process.env.NODE_ENV !== 'production') {
              console.log('Completion time found:', main.washerOperatingState.completionTime.value, '-> parsed as:', remainingTime);
            }
          }
        } else if (main.dryerOperatingState) {
          if (process.env.NODE_ENV !== 'production') {
            console.log('Found dryerOperatingState:', JSON.stringify(main.dryerOperatingState, null, 2));
          }
          const operatingState = main.dryerOperatingState.machineState?.value;
          if (process.env.NODE_ENV !== 'production') {
            console.log('Operating state value:', operatingState);
          }
          status = this.mapOperatingState(operatingState);

          // Get completion time if available
          if (main.dryerOperatingState.completionTime) {
            remainingTime = this.parseCompletionTime(main.dryerOperatingState.completionTime.value);
            if (process.env.NODE_ENV !== 'production') {
              console.log('Completion time found:', main.dryerOperatingState.completionTime.value, '-> parsed as:', remainingTime);
            }
          }
        }
        // Try alternative field names for washer/dryer status
        else if (main.operation || main.operationState || main.machineState) {
          const operationField = main.operation || main.operationState || main.machineState;
          if (process.env.NODE_ENV !== 'production') {
            console.log('Found alternative operation field:', JSON.stringify(operationField, null, 2));
          }
          const operatingState = operationField.value || operationField.operation?.value || operationField.state?.value;
          if (process.env.NODE_ENV !== 'production') {
            console.log('Alternative operating state value:', operatingState);
          }
          status = this.mapOperatingState(operatingState);
        }
        // Check for Samsung specific washer job states
        else if (main.washerJobState) {
          if (process.env.NODE_ENV !== 'production') {
            console.log('Found washerJobState:', JSON.stringify(main.washerJobState, null, 2));
          }
          const jobState = main.washerJobState.value;
          if (process.env.NODE_ENV !== 'production') {
            console.log('Job state value:', jobState);
          }
          status = this.mapOperatingState(jobState);
        }

        // Alternative: Check switch status (some devices use this)
        else if (main.switch) {
          if (process.env.NODE_ENV !== 'production') {
            console.log('Found switch capability:', JSON.stringify(main.switch, null, 2));
          }
          status = main.switch.switch?.value === 'on' ? 'running' : 'idle';
          if (process.env.NODE_ENV !== 'production') {
            console.log('Switch-based status:', status);
          }
        }

        // Smart fallback: If we have remaining time but no explicit status, infer it
        // BUT only if the device doesn't explicitly report a stopped state
        if (status === 'idle' && remainingTime > 0) {
          // Check if device explicitly reports stopped state
          const hasExplicitStopState = (main.washerOperatingState?.machineState?.value === 'stop') ||
                                       (main.dryerOperatingState?.machineState?.value === 'stop') ||
                                       (main.washerOperatingState?.washerJobState?.value === 'none');

          if (!hasExplicitStopState) {
            if (process.env.NODE_ENV !== 'production') {
              console.log('Smart fallback: Device has remaining time but status is idle, changing to running');
            }
            status = 'running';
          } else {
            if (process.env.NODE_ENV !== 'production') {
              console.log('Smart fallback skipped: Device explicitly reports stopped state despite remaining time');
            }
            // Clear remaining time since device is explicitly stopped
            remainingTime = 0;
          }
        }

        // Check for progress indication
        if (main.washerOperatingState?.progress) {
          progress = main.washerOperatingState.progress.value || 0;
        } else if (main.dryerOperatingState?.progress) {
          progress = main.dryerOperatingState.progress.value || 0;
        }

        // Final debug summary
        if (process.env.NODE_ENV !== 'production') {
          console.log('Final status determined:', status);
          console.log('Final remaining time:', remainingTime);
          console.log('=== END DEBUG ===\n');
        }
      }

      return {
        deviceId: deviceId,
        name: deviceName,
        status: status,
        remainingTime: remainingTime,
        progress: progress,
        lastUpdated: new Date().toISOString(),
        // Add detailed status information
        detailedStatus: this.extractDetailedStatus(components?.main, remainingTime),
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
          const diffMinutes = Math.floor(diffMs / (1000 * 60));

          // Sanity check: if completion time is more than 24 hours in the future
          // or more than 1 hour in the past, treat as stale data
          if (diffMinutes > (24 * 60) || diffMinutes < -60) {
            if (process.env.NODE_ENV !== 'production') {
              console.log(`Ignoring stale completion time: ${completionTimeValue} (diff: ${diffMinutes} minutes)`);
            }
            return 0;
          }

          return Math.max(0, diffMinutes);
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

  extractDetailedStatus(main, remainingTime = 0) {
    if (!main) return null;

    const details = {};

    // Extract current job phase - check both washer and dryer structures
    if (main['samsungce.washerOperatingState']?.washerJobPhase?.value) {
      details.currentPhase = main['samsungce.washerOperatingState'].washerJobPhase.value;
    } else if (main.washerOperatingState?.washerJobPhase?.value) {
      details.currentPhase = main.washerOperatingState.washerJobPhase.value;
    } else if (main['samsungce.dryerOperatingState']?.dryerJobPhase?.value) {
      details.currentPhase = main['samsungce.dryerOperatingState'].dryerJobPhase.value;
    } else if (main.dryerOperatingState?.dryerJobPhase?.value) {
      details.currentPhase = main.dryerOperatingState.dryerJobPhase.value;
    }

    // Extract scheduled jobs for showing next steps - check both washer and dryer
    if (main['samsungce.washerOperatingState']?.scheduledJobs?.value) {
      details.scheduledJobs = main['samsungce.washerOperatingState'].scheduledJobs.value;
    } else if (main.washerOperatingState?.scheduledJobs?.value) {
      details.scheduledJobs = main.washerOperatingState.scheduledJobs.value;
    } else if (main['samsungce.dryerOperatingState']?.scheduledJobs?.value) {
      details.scheduledJobs = main['samsungce.dryerOperatingState'].scheduledJobs.value;
    } else if (main.dryerOperatingState?.scheduledJobs?.value) {
      details.scheduledJobs = main.dryerOperatingState.scheduledJobs.value;
    }

    // Extract machine state for better context - check both washer and dryer
    if (main['samsungce.washerOperatingState']?.operatingState?.value) {
      details.machineState = main['samsungce.washerOperatingState'].operatingState.value;
    } else if (main.washerOperatingState?.operatingState?.value) {
      details.machineState = main.washerOperatingState.operatingState.value;
    } else if (main['samsungce.dryerOperatingState']?.operatingState?.value) {
      details.machineState = main['samsungce.dryerOperatingState'].operatingState.value;
    } else if (main.dryerOperatingState?.operatingState?.value) {
      details.machineState = main.dryerOperatingState.operatingState.value;
    }

    // Also try to get washer/dryer job state as a fallback
    if (main['samsungce.washerOperatingState']?.washerJobState?.value && !details.currentPhase) {
      details.currentPhase = main['samsungce.washerOperatingState'].washerJobState.value;
    } else if (main.washerOperatingState?.washerJobState?.value && !details.currentPhase) {
      details.currentPhase = main.washerOperatingState.washerJobState.value;
    } else if (main['samsungce.dryerOperatingState']?.dryerJobState?.value && !details.currentPhase) {
      details.currentPhase = main['samsungce.dryerOperatingState'].dryerJobState.value;
    } else if (main.dryerOperatingState?.dryerJobState?.value && !details.currentPhase) {
      details.currentPhase = main.dryerOperatingState.dryerJobState.value;
    }

    // Add total remaining time for calculating job progress
    details.totalRemainingTime = remainingTime;

    // Debug logging to see what we're actually getting
    if (process.env.NODE_ENV !== 'production') {
      console.log('extractDetailedStatus - details found:', details);
      console.log('extractDetailedStatus - main keys:', Object.keys(main));
    }

    return Object.keys(details).length > 0 ? details : null;
  }
}

module.exports = new SmartThingsService();
