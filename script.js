/**
 * =====================================================
 * SMART AGRICULTURE DASHBOARD - FINAL STABLE VERSION
 * =====================================================
 */

/* 1. KONFIGURASI GLOBAL */
const MQTT_CONFIG = {
    broker: "broker.hivemq.com",
    port: 8884, // Menggunakan port 8884 untuk Secure WebSocket (WSS)
    clientId: `dash_${Math.random().toString(16).slice(2, 8)}`,
    rootTopic: "pertanian"
};

let currentWilayah = "wilayah_1";
let settings = { tempMax: 35, humMin: 30 };

const wilayahNames = {
    wilayah_1: "Lahan Rigel - Tegalgondo",
    wilayah_2: "Lahan Firman - Gondang",
    wilayah_3: "Lahan Fikri - Tirtoutomo",
    wilayah_4: "Lahan Dzaky - Sukun"
};

const sensorState = {
    wilayah_1: { temp: 0, hum: 0 },
    wilayah_2: { temp: 0, hum: 0 },
    wilayah_3: { temp: 0, hum: 0 },
    wilayah_4: { temp: 0, hum: 0 }
};

/* 2. MQTT LOGIC (KONEKSI & HANDLER) */
const client = new Paho.MQTT.Client(MQTT_CONFIG.broker, MQTT_CONFIG.port, MQTT_CONFIG.clientId);

function connectMQTT() {
    const statusEl = document.getElementById("status");
    
    const options = {
        useSSL: true, // WAJIB TRUE agar bisa berjalan di HTTPS (Vercel/GitHub)
        timeout: 3,
        keepAliveInterval: 30,
        onSuccess: () => {
            console.log("MQTT Connected Successfully!");
            if (statusEl) {
                statusEl.innerHTML = `<span class="dot" style="background:#2ecc71"></span> Status: <span style="color:#2ecc71">Online</span>`;
            }
            // Subscribe ke semua wilayah di bawah rootTopic
            client.subscribe(`${MQTT_CONFIG.rootTopic}/#`);
        },
        onFailure: (error) => {
            console.log("MQTT Connection Failed: " + error.errorMessage);
            if (statusEl) {
                statusEl.innerHTML = `<span class="dot" style="background:#ff4757"></span> Status: <span style="color:#ff4757">Offline (Reconnect...)</span>`;
            }
            setTimeout(connectMQTT, 5000); // Coba hubungkan kembali setiap 5 detik
        }
    };

    client.connect(options);
}

// Handler saat koneksi terputus tiba-tiba
client.onConnectionLost = (responseObject) => {
    const statusEl = document.getElementById("status");
    if (responseObject.errorCode !== 0) {
        console.log("Connection Lost: " + responseObject.errorMessage);
        if (statusEl) statusEl.innerHTML = `<span class="dot" style="background:#ff4757"></span> Status: <span style="color:#ff4757">Terputus</span>`;
        connectMQTT();
    }
};

// Handler saat pesan data masuk
client.onMessageArrived = message => {
    const topicParts = message.destinationName.split("/");
    const payload = message.payloadString.trim(); 
    const value = parseFloat(payload);

    // Validasi format: pertanian/wilayah/sensor
    if (topicParts.length < 3 || isNaN(value)) return;

    const wilayah = topicParts[1]; 
    const type = topicParts[2].toLowerCase(); 
    const time = new Date().toLocaleTimeString("id-ID");

    // 1. Simpan ke Memori Global (State)
    if (sensorState[wilayah]) {
        if (type.includes("suhu")) sensorState[wilayah].temp = value;
        if (type.includes("kelembapan")) sensorState[wilayah].hum = value;
    }

    // 2. Update Dashboard UI (Hanya jika wilayah sesuai dengan yang dipilih)
    if (wilayah === currentWilayah) {
        if (type.includes("suhu")) {
            const tempValEl = document.getElementById("temp-val");
            if (tempValEl) tempValEl.innerHTML = `${value.toFixed(1)}<span class="unit">°C</span>`;
            updateChart(0, value, time);
        } 
        else if (type.includes("kelembapan")) {
            const humValEl = document.getElementById("hum-val");
            if (humValEl) humValEl.innerHTML = `${Math.round(value)}<span class="unit">%</span>`;
            updateChart(1, value, time);
        }
        updateRecommendation(sensorState[currentWilayah].temp, sensorState[currentWilayah].hum);
    }
    
    // 3. Tambahkan ke Tabel Riwayat
    addToLog(wilayah, type, value, time);
};

/* 3. NAVIGASI HALAMAN */
function showPage(pageId) {
    document.querySelectorAll(".page").forEach(page => {
        page.style.display = "none";
        page.classList.remove("active");
    });

    const target = document.getElementById(`page-${pageId}`);
    if (target) {
        target.style.display = "block";
        target.classList.add("active");
    }

    document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
    const activeBtn = document.getElementById(`btn-${pageId}`);
    if (activeBtn) activeBtn.classList.add("active");

    if (pageId === "main") refreshDashboardUI();
}

/* 4. LOKASI & RIWAYAT LOGIC */
function changeLocation() {
    const selector = document.getElementById("select-location");
    if (!selector) return;

    currentWilayah = selector.value;
    const fullName = wilayahNames[currentWilayah] || "Lahan";
    const locationName = fullName.includes(" - ") ? fullName.split(" - ")[1] : fullName;

    document.querySelectorAll(".current-loc-text").forEach(el => el.innerText = locationName);

    // Bersihkan tabel saat pindah lokasi
    const body = document.getElementById("log-body");
    if (body) {
        body.innerHTML = `<tr id="empty-row"><td colspan="5" style="text-align: center;">Menunggu data dari ${locationName}...</td></tr>`;
    }

    resetChart(); 
    refreshDashboardUI();
}

function refreshDashboardUI() {
    const data = sensorState[currentWilayah];
    const tempEl = document.getElementById("temp-val");
    const humEl = document.getElementById("hum-val");

    if (tempEl) tempEl.innerHTML = data.temp > 0 ? `${data.temp.toFixed(1)}<span class="unit">°C</span>` : `--<span class="unit">°C</span>`;
    if (humEl) humEl.innerHTML = data.hum > 0 ? `${Math.round(data.hum)}<span class="unit">%</span>` : `--<span class="unit">%</span>`;
    
    updateRecommendation(data.temp, data.hum);
}

/* 5. GRAFIK (CHART.JS) */
let iotChart;
function initChart() {
    const canvas = document.getElementById("iotChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    iotChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: [],
            datasets: [
                { label: "Suhu (°C)", data: [], borderColor: "#fb7185", tension: 0.4, fill: true, backgroundColor: 'rgba(251, 113, 133, 0.1)' },
                { label: "Kelembapan (%)", data: [], borderColor: "#38bdf8", tension: 0.4, fill: true, backgroundColor: 'rgba(56, 189, 248, 0.1)' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: false } }
        }
    });
}

function updateChart(index, value, time) {
    if (!iotChart) return;
    if (index === 0) iotChart.data.labels.push(time);
    iotChart.data.datasets[index].data.push(value);
    if (iotChart.data.labels.length > 15) {
        iotChart.data.labels.shift();
        iotChart.data.datasets.forEach(ds => ds.data.shift());
    }
    iotChart.update("none");
}

function resetChart() {
    if (!iotChart) return;
    iotChart.data.labels = [];
    iotChart.data.datasets.forEach(ds => ds.data = []);
    iotChart.update();
}

/* 6. LOG & REKOMENDASI */
function addToLog(wilayah, type, value, time) {
    if (wilayah !== currentWilayah) return; 
    
    const body = document.getElementById("log-body");
    if (!body) return;

    const emptyRow = document.getElementById("empty-row");
    if (emptyRow) emptyRow.remove();

    const name = wilayahNames[wilayah]?.split(" - ")[1] || wilayah;
    let status = "Normal", cls = "success";

    if (type.includes("suhu") && value > settings.tempMax) { status = "Panas"; cls = "danger"; }
    else if (type.includes("kelembapan") && value < settings.humMin) { status = "Kering"; cls = "warning"; }

    const row = document.createElement("tr");
    row.innerHTML = `
        <td>${time}</td>
        <td>${name}</td>
        <td>${type.includes("suhu") ? "Suhu Udara" : "Kelembapan Tanah"}</td>
        <td>${value.toFixed(1)}</td>
        <td><span class="status-badge ${cls}">${status}</span></td>
    `;
    body.prepend(row);
    if (body.children.length > 25) body.lastChild.remove();
}

function updateRecommendation(temp, hum) {
    const el = document.getElementById("recommendation-text");
    if (!el) return;

    if (temp === 0 && hum === 0) { 
        el.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Menunggu data sensor...`; 
    } else if (temp > settings.tempMax) { 
        el.innerHTML = `<div style="color: #fb7185;"><i class="fas fa-exclamation-triangle"></i> <b>Suhu Panas!</b> Nyalakan Sprinkler.</div>`; 
    } else if (hum < settings.humMin) { 
        el.innerHTML = `<div style="color: #fbbf24;"><i class="fas fa-tint-slash"></i> <b>Tanah Kering!</b> Nyalakan Pompa.</div>`; 
    } else { 
        el.innerHTML = `<div style="color: #2ecc71;"><i class="fas fa-check-circle"></i> <b>Kondisi Aman</b> Tanaman optimal.</div>`; 
    }
}

/* 7. PENGATURAN & INISIALISASI */
function applySettings() {
    const tMax = document.getElementById("set-temp-max");
    const hMin = document.getElementById("set-hum-min");
    if (tMax && hMin) {
        settings.tempMax = parseFloat(tMax.value);
        settings.humMin = parseFloat(hMin.value);
        alert(`Pengaturan disimpan!`);
        showPage("main");
    }
}

window.addEventListener("load", () => {
    initChart();
    connectMQTT(); // Menjalankan koneksi pertama kali
    changeLocation(); 
    showPage("main");
    
    const clearBtn = document.getElementById("clear-history");
    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            const body = document.getElementById("log-body");
            if (body && confirm("Hapus semua riwayat pada tampilan ini?")) {
                body.innerHTML = `<tr id="empty-row"><td colspan="5" style="text-align: center;">Menunggu data...</td></tr>`;
            }
        });
    }
});