document.addEventListener('DOMContentLoaded', function() {
    const bpmElement = document.getElementById('bpm');
    const temperatureElement = document.getElementById('temperature');
    const spo2Element = document.getElementById('spo2');
    const ecgElement = document.getElementById('ecg');
    const statusElement = document.getElementById('status');
    const confidenceElement = document.getElementById('confidence');
    const lastUpdatedElement = document.getElementById('last-updated');
    const alertNotification = document.getElementById('alert-notification');
    const alertTitle = document.getElementById('alert-title');
    const alertMessage = document.getElementById('alert-message');
    const closeAlert = document.getElementById('close-alert');

    const ecgCanvas = document.getElementById('ecg-graph');
    const ecgCtx = ecgCanvas.getContext('2d');
    const ecgData = [];
    const maxEcgPoints = 50;

    let animationFrameId;
    let lastStatus = 'unknown';

    function resizeCanvas() {
        const containerWidth = ecgCanvas.parentElement.clientWidth;
        ecgCanvas.width = containerWidth;
        ecgCanvas.height = 60;
        renderEcgGraph();
    }

    window.addEventListener('resize', resizeCanvas);

    function initEcgGraph() {
        for (let i = 0; i < maxEcgPoints; i++) {
            ecgData.push(0);
        }
        resizeCanvas();
    }

    function renderEcgGraph() {
        if (!ecgCtx) return;

        const width = ecgCanvas.width;
        const height = ecgCanvas.height;
        const stepX = width / maxEcgPoints;

        ecgCtx.clearRect(0, 0, width, height);

        ecgCtx.beginPath();
        ecgCtx.strokeStyle = 'rgba(67, 97, 238, 0.3)';
        ecgCtx.lineWidth = 1;
        ecgCtx.moveTo(0, height / 2);
        ecgCtx.lineTo(width, height / 2);
        ecgCtx.stroke();

        ecgCtx.beginPath();
        ecgCtx.strokeStyle = '#4361ee';
        ecgCtx.lineWidth = 2;
        ecgCtx.moveTo(0, height / 2);

        for (let i = 0; i < ecgData.length; i++) {
            const x = i * stepX;
            const y = height / 2 - (ecgData[i] * height / 4);
            ecgCtx.lineTo(x, y);
        }

        ecgCtx.stroke();
    }

    function updateEcgData(newValue) {
        ecgData.push(newValue);
        if (ecgData.length > maxEcgPoints) {
            ecgData.shift();
        }
        renderEcgGraph();
    }

    function updateVisualIndicators(temperature, spo2) {
        const tempElement = document.querySelector('.temp-indicator');
        const oxygenElement = document.querySelector('.oxygen-level');

        const tempValue = Math.max(0, Math.min(100, (temperature - 35) / 6 * 100));
        tempElement.style.setProperty('--temperature-value', `${tempValue}%`);

        const oxygenValue = Math.max(0, Math.min(100, (spo2 - 80) / 20 * 100));
        oxygenElement.style.setProperty('--oxygen-value', `${oxygenValue}%`);
    }

    function showAlert(status) {
        if (status.toLowerCase() === 'normal') {
            if (alertNotification.classList.contains('show')) {
                alertNotification.classList.remove('show');
            }
            return;
        }

        alertTitle.textContent = status;

        switch(status.toLowerCase()) {
            case 'warning':
                alertMessage.textContent = 'Patient showing signs of concern. Monitor closely.';
                break;
            case 'risk':
                alertMessage.textContent = 'Patient at risk. Immediate attention recommended.';
                break;
            case 'critical':
                alertMessage.textContent = 'Critical condition detected! Urgent intervention required.';
                break;
            default:
                alertMessage.textContent = 'Patient status requires attention.';
        }

        alertNotification.classList.add('show');

        setTimeout(() => {
            alertNotification.classList.remove('show');
        }, 10000);
    }

    closeAlert.addEventListener('click', function() {
        alertNotification.classList.remove('show');
    });

    function formatDate(date) {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    function updateStatusClass(prediction) {
        statusElement.classList.remove('status-normal', 'status-warning', 'status-risk', 'status-critical', 'status-unknown');
        switch(prediction.toLowerCase()) {
            case 'normal':
                statusElement.classList.add('status-normal');
                break;
            case 'warning':
                statusElement.classList.add('status-warning');
                break;
            case 'risk':
                statusElement.classList.add('status-risk');
                break;
            case 'critical':
                statusElement.classList.add('status-critical');
                break;
            default:
                statusElement.classList.add('status-unknown');
        }

        if (lastStatus !== prediction.toLowerCase()) {
            lastStatus = prediction.toLowerCase();
            showAlert(prediction);
        }
    }

    function animateHeartbeat(bpm) {
        const heartbeatElement = document.querySelector('.heartbeat');
        if (!heartbeatElement) return;

        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }

        const duration = 60000 / bpm;
        heartbeatElement.style.animationDuration = `${duration}ms`;
    }

    function fetchLatestData() {
        fetch('/latest-data')
            .then(response => {
                if (!response.ok) {
                    throw new Error('No data available yet');
                }
                return response.json();
            })
            .then(data => {
                if (data.status === 'success') {
                    bpmElement.textContent = data.data.BPM.toFixed(1);
                    temperatureElement.textContent = data.data.Temperature.toFixed(1);
                    spo2Element.textContent = data.data.SpO2.toFixed(1);
                    ecgElement.textContent = data.data.ECG.toFixed(2);

                    statusElement.textContent = data.prediction;
                    confidenceElement.textContent = (data.confidence * 100).toFixed(1);
                    updateStatusClass(data.prediction);
                    lastUpdatedElement.textContent = formatDate(new Date());

                    updateEcgData(data.data.ECG / 5);
                    updateVisualIndicators(data.data.Temperature, data.data.SpO2);
                    animateHeartbeat(data.data.BPM);
                }
            })
            .catch(error => {
                console.error('Error fetching data:', error);
            });
    }

    initEcgGraph();
    fetchLatestData();
    setInterval(fetchLatestData, 5000);
});