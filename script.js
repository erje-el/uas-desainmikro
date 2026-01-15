/**
 * =====================================================
 * SMART AGRICULTURE DASHBOARD - FINAL PREMIUM VERSION
 * =====================================================
 * Deskripsi: Mengelola koneksi MQTT, visualisasi Chart.js, 
 * dan manajemen data multi-wilayah.
 */

/* 1. KONFIGURASI GLOBAL */
const MQTT_CONFIG = {
    broker: "broker.hivemq.com",
    port: 8884, // Port 8884 adalah standar Secure WebSocket (WSS)
    clientId: `dash_${Math.random().toString(16).slice(2, 8)}`,
    rootTopic: "pertanian"
};

// State Aplikasi
let currentWilayah = "wilayah_1";
let settings = { tempMax: 35, humMin: 30 };

const wilayahNames = {
    wilayah_1: "Lahan Rigel - Tegalgondo",
    wilayah_2: "Lahan Firman - Gondang",
    wilayah_3: "Lahan Fikri - Tirtoutomo",
    wilayah_4: "Lahan Dzaky - Sukun"
};

// Memory untuk menyimpan data terakhir agar tidak hilang saat pindah antar wilayah
const sensorState = {
    wilayah_1: { temp: 0, hum: 0 },
    wilayah_2: { temp: 0, hum: 0 },
    wilayah_3: { temp: 0, hum: 0 },
    wilayah_4: { temp: 0, hum: 0 }
};

/* 2. MQTT CORE LOGIC */
const client = new Paho.MQTT.Client(MQTT_CONFIG.broker, MQTT_CONFIG.port, MQTT_CONFIG.clientId);

/**
 * Fungsi untuk menghubungkan ke Broker MQTT
 */
function connectMQTT() {
    const statusEl = document.getElementById("status");
    
    const options = {
        useSSL: true, // Wajib TRUE jika dashboard diakses via HTTPS
        timeout: 3,
        keepAliveInterval: 60,
        cleanSession: true,
        onSuccess: () => {
            console.log("✅ Terhubung ke Broker MQTT");
            if (statusEl) {
                statusEl.innerHTML = `<span class="dot" style="background:#2ecc71"></span> Status: <span style="color:#2ecc71">Online</span>`;
            }
            // Subscribe ke semua topik di bawah root (pertanian/+)
            client.subscribe(`${MQTT_CONFIG.rootTopic}/#`);
        },
        onFailure: (error) => {
            console.log("❌ Gagal Terhubung:", error.errorMessage);
            if (statusEl) {
                statusEl.innerHTML = `<span class="dot" style="background:#ff4757"></span> Status: <span style="color:#ff4757">Reconnect...</span>`;
            }
            // Mencoba menghubungkan kembali secara otomatis setelah 5 detik
            setTimeout(connectMQTT, 5000);
        }
    };

    client.connect(options);
}

// Handler jika koneksi tiba-tiba terputus
client.onConnectionLost = (responseObject) => {
    if (responseObject.errorCode !== 0) {
        console.log("⚠️ Koneksi Hilang:", responseObject.errorMessage);
        connectMQTT();
    }
};

// Handler saat data sensor masuk
client.onMessageArrived = (message) => {
    const topicParts = message.destinationName.split("/");
    const payload = message.payloadString.trim(); 
    const value = parseFloat(payload);

    // Proteksi: Pastikan data valid (Format: pertanian/wilayah_x/sensor)
    if (topicParts.length < 3 || isNaN(value)) return;

    const wilayah = topicParts[1]; 
    const type = topicParts[2].toLowerCase(); 
    const time = new Date().toLocaleTimeString("id-ID");

    // 1. Simpan ke Global State (Agar data tetap ada saat menu dipindah)
    if (sensorState[wilayah]) {
        if (type.includes("suhu")) sensorState[wilayah].temp = value;
        if (type.includes("kelembapan")) sensorState[wilayah].hum = value;
    }

    // 2. Update Tampilan (Hanya jika wilayah sesuai dengan dropdown yang dipilih)
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
        // Update Kotak Rekomendasi
        updateRecommendation(sensorState[currentWilayah].temp, sensorState[currentWilayah].hum);
    }
    
    // 3. Catat ke Tabel Riwayat (Log)
    addToLog(wilayah, type, value, time);
};

/* 3. INTERFACE & NAVIGATION */

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

    // Refresh UI jika kembali ke Dashboard Utama
    if (pageId === "main") refreshDashboardUI();
}

function changeLocation() {
    const selector = document.getElementById("select-location");
    if (!selector) return;

    currentWilayah = selector.value;
    const fullName = wilayahNames[currentWilayah] || "Lahan";
    
    // Ambil bagian belakang nama untuk header (Contoh: "Tegalgondo")
    const locationPart = fullName.includes(" - ") ? fullName.split(" - ")[1] : fullName;

    document.querySelectorAll(".current-loc-text").forEach(el => el.innerText = locationPart);

    // Reset visual tabel riwayat agar tidak membingungkan
    const body = document.getElementById("log-body");
    if (body) {
        body.innerHTML = `<tr id="empty-row"><td colspan="5" style="text-align: center;">Menunggu data dari ${locationPart}...</td></tr>`;
    }

    resetChart(); 
    refreshDashboardUI();
}

function refreshDashboardUI() {
    const data = sensorState[currentWilayah];
    const tempEl = document.getElementById("temp-val");
    const humEl = document.getElementById("hum-val");

    // Jika data masih 0 (belum ada pesan MQTT masuk), tampilkan tanda --
    if (tempEl) tempEl.innerHTML = data.temp > 0 ? `${data.temp.toFixed(1)}<span class="unit">°C</span>` : `--<span class="unit">°C</span>`;
    if (humEl) humEl.innerHTML = data.hum > 0 ? `${Math.round(data.hum)}<span class="unit">%</span>` : `--<span class="unit">%</span>`;
    
    updateRecommendation(data.temp, data.hum);
}

/* 4. VISUALISASI GRAFIK (CHART.JS) */
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
                { 
                    label: "Suhu (°C)", 
                    data: [], 
                    borderColor: "#fb7185", 
                    backgroundColor: 'rgba(251, 113, 133, 0.1)',
                    tension: 0.4, 
                    fill: true 
                },
                { 
                    label: "Kelembapan (%)", 
                    data: [], 
                    borderColor: "#38bdf8", 
                    backgroundColor: 'rgba(56, 189, 248, 0.1)',
                    tension: 0.4, 
                    fill: true 
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#ffffff' } } },
            scales: { 
                y: { ticks: { color: '#cbd5e1' } },
                x: { ticks: { color: '#cbd5e1' } }
            }
        }
    });
}

function updateChart(index, value, time) {
    if (!iotChart) return;
    if (index === 0) iotChart.data.labels.push(time);
    iotChart.data.datasets[index].data.push(value);
    
    // Batasi grafik hanya menampilkan 15 data terakhir agar tidak berat
    if (iotChart.data.labels.length > 15) {
        iotChart.data.labels.shift();
        iotChart.data.datasets.forEach(ds => ds.data.shift());
    }
    iotChart.update("none"); // Update tanpa animasi transisi agar lebih ringan
}

function resetChart() {
    if (!iotChart) return;
    iotChart.data.labels = [];
    iotChart.data.datasets.forEach(ds => ds.data = []);
    iotChart.update();
}

/* 5. LOGGING & REKOMENDASI */

function addToLog(wilayah, type, value, time) {
    // Filter: Hanya catat riwayat wilayah yang sedang dibuka user
    if (wilayah !== currentWilayah) return; 
    
    const body = document.getElementById("log-body");
    if (!body) return;

    const emptyRow = document.getElementById("empty-row");
    if (emptyRow) emptyRow.remove();

    const name = wilayahNames[wilayah]?.split(" - ")[1] || wilayah;
    let status = "Normal", cls = "success";

    // Logika penentuan status berdasarkan Threshold Settings
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
    
    body.prepend(row); // Tambahkan data terbaru di posisi paling atas
    if (body.children.length > 25) body.lastChild.remove(); // Hapus log lama jika > 25 baris
}

function updateRecommendation(temp, hum) {
    const el = document.getElementById("recommendation-text");
    if (!el) return;

    if (temp === 0 && hum === 0) { 
        el.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Menunggu transmisi data sensor...`; 
    } else if (temp > settings.tempMax) { 
        el.innerHTML = `<div style="color: #fb7185;"><i class="fas fa-exclamation-triangle"></i> <b>Suhu Terlalu Panas!</b> Aktifkan penyiraman otomatis (Sprinkler).</div>`; 
    } else if (hum < settings.humMin) { 
        el.innerHTML = `<div style="color: #fbbf24;"><i class="fas fa-tint-slash"></i> <b>Tanah Terlalu Kering!</b> Segera lakukan pemompaan air.</div>`; 
    } else { 
        el.innerHTML = `<div style="color: #2ecc71;"><i class="fas fa-check-circle"></i> <b>Kondisi Lahan Optimal.</b> Tanaman dalam keadaan sehat.</div>`; 
    }
}

/* 6. PENGATURAN (SETTINGS) */
function applySettings() {
    const tMax = document.getElementById("set-temp-max");
    const hMin = document.getElementById("set-hum-min");
    
    if (tMax && hMin) {
        settings.tempMax = parseFloat(tMax.value);
        settings.humMin = parseFloat(hMin.value);
        alert(`Pengaturan berhasil disimpan ke sistem!`);
        showPage("main");
    }
}

/* 7. INITIALIZATION */
window.addEventListener("load", () => {
    initChart();
    connectMQTT(); // Menjalankan proses koneksi ke broker
    changeLocation(); // Menyetel tampilan awal berdasarkan dropdown default
    showPage("main");
    
    // Listener untuk tombol bersihkan log
    const clearBtn = document.getElementById("clear-history");
    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            const body = document.getElementById("log-body");
            if (body && confirm("Apakah Anda yakin ingin menghapus seluruh riwayat tampilan ini?")) {
                body.innerHTML = `<tr id="empty-row"><td colspan="5" style="text-align: center;">Riwayat telah dibersihkan.</td></tr>`;
            }
        });
    }
});