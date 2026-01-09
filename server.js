const mongoose = require('mongoose');
const mqtt = require('mqtt');

// GANTI LINK DI BAWAH dengan hasil copy dari MongoDB Atlas
// Pastikan bagian <password> diganti dengan password user 'julianfrigel96_db_user'
const mongoURI = "mongodb+srv://julianfrigel96_db_user:2wmazDwKVVRLPgaC@cluster0.gyfnunc.mongodb.net/database_uas?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(mongoURI)
    .then(() => console.log("MongoDB Connec"))
    .catch(err => console.log("MongoDB Connection Failed:", err));

// Membuat struktur penyimpanan (Schema)
const SensorSchema = new mongoose.Schema({
    nilai: Number,
    waktu: { type: Date, default: Date.now }
});
const Sensor = mongoose.model('DataSensor', SensorSchema);

// Koneksi ke HiveMQ untuk mengambil data
const client = mqtt.connect('wss://broker.hivemq.com:8884/mqtt');

client.on('connect', () => {
    console.log("📡 Terhubung ke HiveMQ!");
    client.subscribe('pertanian/kelembapan_tanah');
});

client.on('message', (topic, message) => {
    console.log(`📩 Data Masuk dari Topik [${topic}]: ${message.toString()}`);

    const dataBaru = new Sensor({ nilai: parseFloat(message.toString()) });
    dataBaru.save()
        .then(() => console.log("💾 Data tersimpan ke Database: " + message.toString()))
        .catch(err => console.log("❌ Gagal simpan:", err));
});