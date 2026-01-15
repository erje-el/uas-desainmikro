/**
 * =====================================================
 * SMART AGRICULTURE DASHBOARD - FINAL STABLE VERSION
 * =====================================================
 */

/* 1. KONFIGURASI GLOBAL */
const MQTT_CONFIG = {
    broker: "broker.hivemq.com",
    port: 8884, 
    clientId: `dash_${Math.random().toString(16).slice(2, 8)}`,
    rootTopic: "pertanian"
};

let currentWilayah = "wilayah_1";

const wilayahNames = {
    wilayah_1: "Lahan Rigel - Tegalgondo",
    wilayah_2: "Lahan Firman - Gondang",
    wilayah_3: "Lahan Fikri - Tirtoutomo",
    wilayah_4: "Lahan Dzaky - Sukun"
};

let settings = { tempMax: 35, humMin: 30 };

// Menyimpan data terakhir dari setiap wilayah agar tidak hilang saat pindah halaman
const sensorState = {
    wilayah_1: { temp: 0, hum: 0 },
    wilayah_2: { temp: 0, hum: 0 },
    wilayah_3: { temp: 0, hum: 0 },
    wilayah_4: { temp: 0, hum: 0 }
};

/* 2. NAVIGASI HALAMAN */
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

    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.classList.remove("active");
    });
    const activeBtn = document.getElementById(`btn-${pageId}`);
    if (activeBtn) activeBtn.classList.add("active");

    if (pageId === "main") {
        refreshDashboardUI();
    }
}

/* 3. LOKASI & SINKRONISASI UI */
function changeLocation() {
    const selector = document.getElementById("select-location");
    if (!selector) return;

    currentWilayah = selector.value;
    const fullName = wilayahNames[currentWilayah] || "Lahan";
    const locationName = fullName.includes(" - ") ? fullName.split(" - ")[1] : fullName;

    // Update teks header
    document.querySelectorAll(".current-loc-text").forEach(el => {
        el.innerText = locationName;
    });

    // --- PEMBERSIH RIWAYAT (Agar tidak ada bekas wilayah lain) ---
    const body = document.getElementById("log-body");
    if (body) {
        body.innerHTML = `
            <tr id="empty-row">
                <td colspan="5" style="text-align: center;">Menunggu data dari ${locationName}...</td>
            </tr>
        `;
    }

    resetChart(); 
    refreshDashboardUI();
}

function refreshDashboardUI() {
    const data = sensorState[currentWilayah];
    const tempEl = document.getElementById("temp-val");
    const humEl = document.getElementById("hum-val");

    if (tempEl) {
        tempEl.innerHTML = data.temp > 0 ? `${data.temp.toFixed(1)}<span class="unit">°C</span>` : `--<span class="unit">°C</span>`;
    }
    if (humEl) {
        humEl.innerHTML = data.hum > 0 ? `${Math.round(data.hum)}<span class="unit">%</span>` : `--<span class="unit">%</span>`;
    }
    updateRecommendation(data.temp, data.hum);
}

/* 4. MQTT LOGIC */
const client = new Paho.MQTT.Client(MQTT_CONFIG.broker, MQTT_CONFIG.port, MQTT_CONFIG.clientId);

client.onMessageArrived = message => {
    const topicParts = message.destinationName.split("/");
    const payload = message.payloadString.trim(); 
    const value = parseFloat(payload);

    if (topicParts.length < 3 || isNaN(value)) return;

    const wilayah = topicParts[1];
    const type = topicParts[2].toLowerCase(); 
    const time = new Date().toLocaleTimeString("id-ID");

    // Simpan ke memori global berdasarkan wilayah pengirim
    if (sensorState[wilayah]) {
        if (type === "suhu") sensorState[wilayah].temp = value;
        if (type === "kelembapan") sensorState[wilayah].hum = value;
    }

    // Hanya update UI jika data yang datang sesuai dengan wilayah yang sedang dibuka
    if (wilayah === currentWilayah) {
        if (type === "suhu") {
            const tempValEl = document.getElementById("temp-val");
            if (tempValEl) tempValEl.innerHTML = `${value.toFixed(1)}<span class="unit">°C</span>`;
            updateChart(0, value, time);
        } else if (type === "kelembapan") {
            const humValEl = document.getElementById("hum-val");
            if (humValEl) humValEl.innerHTML = `${Math.round(value)}<span class="unit">%</span>`;
            updateChart(1, value, time);
        }
        updateRecommendation(sensorState[currentWilayah].temp, sensorState[currentWilayah].hum);
    }
    
    // Kirim ke log (fungsi ini sudah ada filter wilayah di dalamnya)
    addToLog(wilayah, type, value, time);
};

function connectMQTT() {
    console.log("Connecting to MQTT...");
    client.connect({
        useSSL: true,
        timeout: 3,
        keepAliveInterval: 60,
        onSuccess: () => {
            console.log("MQTT Connected!");
            const statusEl = document.getElementById("status");
            if (statusEl) statusEl.innerHTML = `<span class="dot"></span> Status: <b style="color:#2ecc71">Online</b>`;
            client.subscribe(`${MQTT_CONFIG.rootTopic}/#`);
        },
        onFailure: (error) => {
            console.log("Failed:", error.errorMessage);
            setTimeout(connectMQTT, 5000);
        }
    });
}

/* 5. SETTINGS */
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

/* 6. CHART LOGIC */
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

/* 7. LOG & REKOMENDASI */
function addToLog(wilayah, type, value, time) {
    if (wilayah !== currentWilayah) return; // KUNCI AGAR TIDAK CAMPUR
    
    const body = document.getElementById("log-body");
    if (!body) return;

    const emptyRow = document.getElementById("empty-row");
    if (emptyRow) emptyRow.remove();

    const name = wilayahNames[wilayah]?.split(" - ")[1] || wilayah;
    let status = "Normal", cls = "success";

    if (type === "suhu" && value > settings.tempMax) { status = "Panas"; cls = "danger"; }
    if (type === "kelembapan" && value < settings.humMin) { status = "Kering"; cls = "warning"; }

    const row = document.createElement("tr");
    row.innerHTML = `
        <td>${time}</td>
        <td>${name}</td>
        <td>${type === "suhu" ? "Suhu Udara" : "Kelembapan Tanah"}</td>
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
    } 
    else if (temp > settings.tempMax) { 
        el.innerHTML = `<div style="color: #fb7185;"><i class="fas fa-exclamation-triangle"></i> <b>Suhu Panas!</b> Nyalakan Sprinkler.</div>`; 
    } 
    else if (hum < settings.humMin) { 
        el.innerHTML = `<div style="color: #fbbf24;"><i class="fas fa-tint-slash"></i> <b>Tanah Kering!</b> Nyalakan Pompa.</div>`; 
    } 
    else { 
        el.innerHTML = `<div style="color: #2ecc71;"><i class="fas fa-check-circle"></i> <b>Kondisi Aman</b> Tanaman optimal.</div>`; 
    }
}

function clearHistory() {
    const body = document.getElementById("log-body");
    if (body && confirm("Hapus semua riwayat pada tampilan ini?")) {
        body.innerHTML = `<tr id="empty-row"><td colspan="5" style="text-align: center;">Menunggu data...</td></tr>`;
    }
}

/* 8. INIT */
window.addEventListener("load", () => {
    initChart();
    connectMQTT();
    changeLocation(); // Menjalankan pembersihan awal
    showPage("main");
    const clearBtn = document.getElementById("clear-history");
    if (clearBtn) clearBtn.addEventListener("click", clearHistory);
});