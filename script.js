/**
 * 1. KONFIGURASI GLOBAL
 */
const MQTT_CONFIG = {
    broker: "broker.hivemq.com",
    port: 8000,
    clientId: "js_dash_" + Math.random().toString(16).substr(2, 6),
    topics: {
        suhu: "pertanian/suhu",
        tanah: "pertanian/kelembapan_tanah"
    }
};

// Pengaturan ambang batas untuk Analisis Pintar
let settings = {
    tempMax: 35,
    humMin: 30
};

/**
 * 2. INISIALISASI GRAFIK (Chart.js)
 */
const ctx = document.getElementById('iotChart').getContext('2d');
const iotChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [], 
        datasets: [{
            label: 'Suhu (°C)',
            borderColor: '#fb7185',
            backgroundColor: 'rgba(251, 113, 133, 0.1)',
            data: [],
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 3
        }, {
            label: 'Kelembapan (%)',
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            data: [],
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 3
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
            legend: { 
                position: 'top',
                labels: { color: '#f8fafc', font: { family: 'Poppins', size: 12 } } 
            }
        },
        scales: {
            y: { 
                grid: { color: 'rgba(255, 255, 255, 0.05)' }, 
                ticks: { color: '#94a3b8' },
                beginAtZero: true
            },
            x: { 
                grid: { display: false }, 
                ticks: { color: '#94a3b8', maxRotation: 0 } 
            }
        }
    }
});

/**
 * 3. SISTEM NAVIGASI & PENGATURAN
 */
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById('page-' + pageId).classList.add('active');
    document.getElementById('btn-' + pageId).classList.add('active');
}

function applySettings() {
    const newTemp = document.getElementById('set-temp-max').value;
    const newHum = document.getElementById('set-hum-min').value;

    if(newTemp && newHum) {
        settings.tempMax = parseFloat(newTemp);
        settings.humMin = parseFloat(newHum);
        alert("✅ Pengaturan Berhasil Disimpan!");
        showPage('main');
    }
}

/**
 * 4. MQTT CLIENT LOGIC
 */
const client = new Paho.MQTT.Client(MQTT_CONFIG.broker, MQTT_CONFIG.port, MQTT_CONFIG.clientId);

client.onConnectionLost = (responseObject) => {
    updateStatus('Terputus', 'connecting');
    setTimeout(connectMQTT, 5000);
};

client.onMessageArrived = (message) => {
    const payload = message.payloadString;
    const topic = message.destinationName;
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if (topic === MQTT_CONFIG.topics.suhu) {
        handleDataUpdate('temp-val', payload, '°C', 0, "Suhu Udara", timeNow);
    } else if (topic === MQTT_CONFIG.topics.tanah) {
        handleDataUpdate('hum-val', payload, '%', 1, "Kelembapan Tanah", timeNow);
    }
};

/**
 * 5. PENGOLAH DATA & ANALISIS
 */
function handleDataUpdate(elementId, value, unit, dsIndex, sensorName, time) {
    // 1. Update Card Widget dengan Animasi
    const el = document.getElementById(elementId);
    if(el) {
        el.classList.add('updating');
        el.innerHTML = `${value}<span>${unit}</span>`;
        setTimeout(() => el.classList.remove('updating'), 400);
    }

    // 2. Sinkronisasi Data Grafik
    if (dsIndex === 0 || iotChart.data.labels.length === 0) {
        iotChart.data.labels.push(time);
    }
    iotChart.data.datasets[dsIndex].data.push(parseFloat(value));

    // Pastikan panjang dataset seimbang dan tidak melebihi 15 poin
    if (iotChart.data.labels.length > 15) {
        iotChart.data.labels.shift();
        iotChart.data.datasets[0].data.shift();
        iotChart.data.datasets[1].data.shift();
    }
    iotChart.update('none');

    // 3. Log Riwayat & Rekomendasi
    addToLog(sensorName, value, unit, time);
    updateRecommendation();
}

function updateRecommendation() {
    const tempText = document.getElementById('temp-val').innerText;
    const humText = document.getElementById('hum-val').innerText;
    const recText = document.getElementById('recommendation-text');

    const temp = parseFloat(tempText) || 0;
    const hum = parseFloat(humText) || 0;

    if (hum > 0 && hum < settings.humMin) {
        recText.innerHTML = "🚨 <b>Tanah Kering!</b> Segera lakukan penyiraman manual pada lahan Anda.";
    } else if (temp > settings.tempMax) {
        recText.innerHTML = "☀️ <b>Suhu Terlalu Tinggi!</b> Tanaman berisiko layu, pertimbangkan penggunaan peneduh.";
    } else if (hum > 85) {
        recText.innerHTML = "💧 <b>Kapasitas Air Jenuh.</b> Hindari penyiraman untuk mencegah pembusukan akar.";
    } else if (temp > 0 || hum > 0) {
        recText.innerHTML = "✅ <b>Kondisi Ideal.</b> Parameter lingkungan saat ini mendukung pertumbuhan optimal.";
    }
}

function addToLog(name, val, unit, time) {
    const logBody = document.getElementById('log-body');
    const emptyRow = document.getElementById('empty-row');
    if (emptyRow) emptyRow.remove();

    const row = document.createElement('tr');
    const numVal = parseFloat(val);
    let kondisi = '<span style="color: #4ade80;">Normal</span>';

    // Logika pewarnaan status di tabel
    if (name.includes("Suhu")) {
        if (numVal > settings.tempMax) kondisi = '<span style="color: #fb7185;">Panas</span>';
        else if (numVal < 20) kondisi = '<span style="color: #38bdf8;">Dingin</span>';
    } else {
        if (numVal < settings.humMin) kondisi = '<span style="color: #fbbf24;">Kering</span>';
        else if (numVal > 85) kondisi = '<span style="color: #38bdf8;">Basah</span>';
    }

    row.innerHTML = `<td>${time}</td><td>${name}</td><td>${val}${unit}</td><td>${kondisi}</td>`;
    logBody.insertBefore(row, logBody.firstChild);

    // Batasi log maksimal 10 baris
    if (logBody.children.length > 10) {
        logBody.removeChild(logBody.lastChild);
    }
}

function updateStatus(text, className) {
    const statusEl = document.getElementById('status');
    if(statusEl) {
        statusEl.innerHTML = `Status: <span class="${className}">${text}</span>`;
    }
}

function clearHistory() {
    if(confirm("Hapus semua riwayat aktivitas?")) {
        document.getElementById('log-body').innerHTML = `<tr id="empty-row"><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted)">Menunggu data masuk...</td></tr>`;
    }
}

function connectMQTT() {
    updateStatus('Menghubungkan...', 'connecting');
    client.connect({
        onSuccess: () => {
            updateStatus('Terhubung', 'online');
            client.subscribe(MQTT_CONFIG.topics.suhu);
            client.subscribe(MQTT_CONFIG.topics.tanah);
        },
        useSSL: false,
        onFailure: () => {
            updateStatus('Gagal Terhubung', 'connecting');
            setTimeout(connectMQTT, 5000);
        }
    });
}

window.addEventListener('load', connectMQTT);