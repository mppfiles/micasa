class HomeMonitor {
    constructor() {
        this.socket = null;
        this.autoRefreshEnabled = true;
        this.lastUpdateTime = null;
        this.connectionRetryCount = 0;
        this.maxRetries = 5;

        this.init();
    }

    init() {
        this.initSocket();
        this.bindEvents();
        this.updateConnectionStatus('connecting');
    }

    initSocket() {
        try {
            this.socket = io();

            this.socket.on('connect', () => {
                console.log('Connected to server');
                this.connectionRetryCount = 0;
                this.updateConnectionStatus('connected');
                this.socket.emit('request-update');
            });

            this.socket.on('disconnect', () => {
                console.log('Disconnected from server');
                this.updateConnectionStatus('disconnected');
            });

            this.socket.on('status-update', (data) => {
                this.updateDeviceStatus(data);
            });

            this.socket.on('error', (error) => {
                console.error('Socket error:', error);
                this.showError(error.message || 'Connection error occurred');
            });

            this.socket.on('connect_error', (error) => {
                console.error('Connection error:', error);
                this.handleConnectionError();
            });

        } catch (error) {
            console.error('Failed to initialize socket:', error);
            this.handleConnectionError();
        }
    }

    bindEvents() {
        const refreshBtn = document.getElementById('refresh-btn');
        const autoRefreshToggle = document.getElementById('auto-refresh-toggle');
        const closeError = document.getElementById('close-error');

        refreshBtn?.addEventListener('click', () => this.refreshStatus());
        autoRefreshToggle?.addEventListener('click', () => this.toggleAutoRefresh());
        closeError?.addEventListener('click', () => this.hideError());

        // Close modal when clicking outside
        document.getElementById('error-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'error-modal') {
                this.hideError();
            }
        });

        // Handle visibility change for auto-refresh
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.autoRefreshEnabled && this.socket) {
                this.socket.emit('request-update');
            }
        });
    }

    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connection-status');
        const connectionInfo = document.getElementById('connection-info');

        if (!statusElement) return;

        statusElement.className = `connection-status ${status}`;

        const statusMessages = {
            connecting: 'Connecting...',
            connected: 'Connected',
            disconnected: 'Disconnected'
        };

        const statusIcons = {
            connecting: 'fas fa-circle-notch fa-spin',
            connected: 'fas fa-circle',
            disconnected: 'fas fa-circle'
        };

        const icon = statusElement.querySelector('i');
        const text = statusElement.querySelector('span');

        if (icon) icon.className = statusIcons[status];
        if (text) text.textContent = statusMessages[status];
        if (connectionInfo) {
            connectionInfo.textContent = status === 'connected' ? 'WebSocket' : 'Offline';
        }
    }

    updateDeviceStatus(data) {
        if (!data) return;

        this.lastUpdateTime = new Date();
        this.updateSystemInfo();

        if (data.washer) {
            this.updateDevice('washer', data.washer);
        }

        if (data.dryer) {
            this.updateDevice('dryer', data.dryer);
        }
    }

    updateDevice(deviceType, deviceData) {
        const card = document.getElementById(`${deviceType}-card`);
        const statusElement = document.getElementById(`${deviceType}-status`);
        const timeElement = document.getElementById(`${deviceType}-time`);
        const progressElement = document.getElementById(`${deviceType}-progress`);
        const updatedElement = document.getElementById(`${deviceType}-updated`);
        const phaseElement = document.getElementById(`${deviceType}-phase`);
        const jobsElement = document.getElementById(`${deviceType}-jobs`);

        if (!card || !statusElement) return;

        // Update card class for styling
        card.className = `device-card ${deviceData.status}`;

        // Update status indicator and text
        const indicator = statusElement.querySelector('.status-indicator');
        const statusText = statusElement.querySelector('.status-text');

        if (indicator) {
            indicator.className = `status-indicator ${deviceData.status}`;
        }

        if (statusText) {
            statusText.textContent = this.formatStatus(deviceData.status, deviceData.detailedStatus);
        }

        // Update current phase if available
        this.updateCurrentPhase(phaseElement, deviceData.detailedStatus);

        // Update scheduled jobs if available
        this.updateScheduledJobs(jobsElement, deviceData.detailedStatus);

        // Update remaining time
        if (timeElement) {
            const timeSpan = timeElement.querySelector('span');
            if (timeSpan) {
                if (deviceData.remainingTime > 0) {
                    timeSpan.textContent = this.formatTime(deviceData.remainingTime);
                } else {
                    timeSpan.textContent = deviceData.status === 'running' ? 'Unknown' : '--';
                }
            }
        }

        // Update progress bar
        if (progressElement) {
            const progress = deviceData.progress || 0;
            progressElement.style.width = `${Math.max(0, Math.min(100, progress))}%`;
        }

        // Update last updated time
        if (updatedElement) {
            updatedElement.textContent = `Last updated: ${this.formatTimestamp(deviceData.lastUpdated)}`;
        }

        // Log any errors
        if (deviceData.error) {
            console.warn(`${deviceData.name} error:`, deviceData.error);
        }
    }

    formatStatus(status, detailedStatus) {
        // If we have detailed status with current phase, use that for more descriptive display
        if (detailedStatus?.currentPhase && status === 'running') {
            return `Running - ${detailedStatus.currentPhase.charAt(0).toUpperCase() + detailedStatus.currentPhase.slice(1)}`;
        }

        const statusMap = {
            running: 'Running',
            idle: 'Idle',
            complete: 'Complete',
            paused: 'Paused',
            unknown: 'Unknown',
            error: 'Error'
        };

        return statusMap[status] || status.charAt(0).toUpperCase() + status.slice(1);
    }

    updateCurrentPhase(phaseElement, detailedStatus) {
        if (!phaseElement) return;

        if (detailedStatus?.currentPhase) {
            const phaseText = phaseElement.querySelector('.phase-text');
            if (phaseText) {
                phaseText.textContent = detailedStatus.currentPhase;
            }
            phaseElement.style.display = 'flex';
        } else {
            phaseElement.style.display = 'none';
        }
    }

    updateScheduledJobs(jobsElement, detailedStatus) {
        if (!jobsElement) return;

        if (detailedStatus?.scheduledJobs && detailedStatus.scheduledJobs.length > 0) {
            const jobsList = document.getElementById(jobsElement.id.replace('-jobs', '-jobs-list'));
            if (jobsList) {
                jobsList.innerHTML = '';

                // Calculate total remaining time for all jobs
                const totalJobTime = detailedStatus.scheduledJobs.reduce((sum, job) => sum + job.timeInMin, 0);
                
                // Find which job should be current based on elapsed time
                let cumulativeTime = 0;
                let currentJobIndex = -1;
                
                for (let i = 0; i < detailedStatus.scheduledJobs.length; i++) {
                    const job = detailedStatus.scheduledJobs[i];
                    cumulativeTime += job.timeInMin;
                    
                    // If this job's cumulative time is greater than elapsed, this is current or future
                    if (cumulativeTime > (totalJobTime - (detailedStatus.totalRemainingTime || 0))) {
                        if (currentJobIndex === -1) {
                            currentJobIndex = i;
                        }
                        break;
                    }
                }

                // If we have a current phase, use that to determine the current job
                if (detailedStatus.currentPhase) {
                    const currentPhaseJob = detailedStatus.scheduledJobs.findIndex(job => 
                        job.jobName.toLowerCase() === detailedStatus.currentPhase.toLowerCase()
                    );
                    if (currentPhaseJob !== -1) {
                        currentJobIndex = currentPhaseJob;
                    }
                }

                // Show only current and future jobs
                const remainingJobs = detailedStatus.scheduledJobs.slice(currentJobIndex >= 0 ? currentJobIndex : 0);

                // If there's only one remaining job (the current one), don't show the section
                if (remainingJobs.length > 1) {
                    remainingJobs.forEach((job, index) => {
                        const jobItem = document.createElement('div');
                        const isCurrent = index === 0;
                        jobItem.className = isCurrent ? 'job-item current-job' : 'job-item';
                        jobItem.innerHTML = `
                            <span class="job-name">${job.jobName}${isCurrent ? ' (current)' : ''}</span>
                            <span class="job-time">${job.timeInMin}min</span>
                        `;
                        jobsList.appendChild(jobItem);
                    });
                    jobsElement.style.display = 'block';
                } else {
                    jobsElement.style.display = 'none';
                }
            }
        } else {
            jobsElement.style.display = 'none';
        }
    }

    formatTime(minutes) {
        if (!minutes || minutes <= 0) return '0m';

        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;

        if (hours > 0) {
            return `${hours}h ${mins}m`;
        }
        return `${mins}m`;
    }

    formatTimestamp(timestamp) {
        if (!timestamp) return 'Never';

        try {
            const date = new Date(timestamp);
            const now = new Date();
            const diffSeconds = Math.floor((now - date) / 1000);

            if (diffSeconds < 60) {
                return 'Just now';
            } else if (diffSeconds < 3600) {
                const minutes = Math.floor(diffSeconds / 60);
                return `${minutes}m ago`;
            } else if (diffSeconds < 86400) {
                const hours = Math.floor(diffSeconds / 3600);
                return `${hours}h ago`;
            } else {
                return date.toLocaleString();
            }
        } catch (error) {
            console.error('Error formatting timestamp:', error);
            return 'Unknown';
        }
    }

    refreshStatus() {
        const refreshBtn = document.getElementById('refresh-btn');

        if (!this.socket || !this.socket.connected) {
            this.showError('Not connected to server. Please wait for connection to be established.');
            return;
        }

        // Add loading state
        if (refreshBtn) {
            refreshBtn.classList.add('loading');
            const icon = refreshBtn.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-sync-alt');
                icon.classList.add('fa-spinner', 'fa-spin');
            }
        }

        this.socket.emit('request-update');

        // Remove loading state after 2 seconds
        setTimeout(() => {
            if (refreshBtn) {
                refreshBtn.classList.remove('loading');
                const icon = refreshBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-spinner', 'fa-spin');
                    icon.classList.add('fa-sync-alt');
                }
            }
        }, 2000);
    }

    toggleAutoRefresh() {
        this.autoRefreshEnabled = !this.autoRefreshEnabled;

        const toggle = document.getElementById('auto-refresh-toggle');
        const statusElement = document.getElementById('auto-refresh-status');

        if (toggle) {
            const icon = toggle.querySelector('i');
            const text = toggle.childNodes[toggle.childNodes.length - 1];

            if (this.autoRefreshEnabled) {
                toggle.classList.remove('disabled');
                if (icon) {
                    icon.classList.remove('fa-pause');
                    icon.classList.add('fa-play');
                }
                if (text) text.textContent = ' Auto Refresh: ON';
            } else {
                toggle.classList.add('disabled');
                if (icon) {
                    icon.classList.remove('fa-play');
                    icon.classList.add('fa-pause');
                }
                if (text) text.textContent = ' Auto Refresh: OFF';
            }
        }

        if (statusElement) {
            statusElement.textContent = this.autoRefreshEnabled ? 'Enabled' : 'Disabled';
        }
    }

    updateSystemInfo() {
        const systemUpdate = document.getElementById('system-last-update');

        if (systemUpdate && this.lastUpdateTime) {
            systemUpdate.textContent = this.formatTimestamp(this.lastUpdateTime.toISOString());
        }
    }

    showError(message) {
        const modal = document.getElementById('error-modal');
        const messageElement = document.getElementById('error-message');

        if (modal && messageElement) {
            messageElement.textContent = message;
            modal.style.display = 'block';
        }
    }

    hideError() {
        const modal = document.getElementById('error-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    handleConnectionError() {
        this.connectionRetryCount++;
        this.updateConnectionStatus('disconnected');

        if (this.connectionRetryCount <= this.maxRetries) {
            const retryDelay = Math.min(1000 * Math.pow(2, this.connectionRetryCount), 30000);
            console.log(`Retrying connection in ${retryDelay/1000} seconds...`);

            setTimeout(() => {
                this.updateConnectionStatus('connecting');
                this.initSocket();
            }, retryDelay);
        } else {
            this.showError('Unable to connect to server after multiple attempts. Please check your network connection and refresh the page.');
        }
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new HomeMonitor();
});

// Handle page visibility for better performance
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('Page hidden - reducing activity');
    } else {
        console.log('Page visible - resuming activity');
    }
});
