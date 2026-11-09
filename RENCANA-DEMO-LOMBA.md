# SEISMORA — Rencana Demo Lomba (Stage 1 BUILT, 7 Nov 2026)

> Status: **Stage 1 built, awaiting deploy** (7 Nov 2026, ~16:15 WIB).
> Dibangun di `~/workspace/seismora/` (Next.js 16 + SQLite + simulator).
> `npm run build` lolos; verifikasi live 30/30 cek lolos (login, SSE, skenario
> seismik → bahaya, event + snapshot, CSV, role demo 403).
> Keputusan final: **SIMULASI SAJA** (tanpa hardware ESP32/MPU6050);
> peringatan Waspada/Siaga/Bahaya tampil **FULL LAYAR** + alarm suara;
> deadline lomba masih belum diketahui user.

## Prinsip: demo dulu, spek lengkap jadi peta

Buat lomba, yang dinilai juri adalah **yang terlihat jalan**, bukan 14 tabel +
3 tahap yang selesai di kertas. Jadi urutannya dibalik dari spek:

1. Dashboard real-time yang hidup (grafik getaran bergerak, angka PGA/RMS berubah)
2. Klasifikasi AI yang kebukti jalan (Normal / Minor / Anomaly / Potential Seismic)
3. Early warning 4 level yang ke-trigger beneran saat anomali
4. Sisanya (14 tabel, multi-lokasi penuh, 3 tahap) dikerjakan hanya sejauh
   mendukung 3 hal di atas — sisanya jadi "peta jalan" di slide penutup.

## Scope MVP demo (Tahap 1 — yang wajib jadi sebelum deadline)

| # | Fitur demo | Bukti jalan (acceptance) |
|---|-----------|--------------------------|
| 1 | Sensor → MQTT → backend → dashboard (live) | Grafik akselerasi X/Y/Z bergerak < 2 detik dari data masuk |
| 2 | Preprocessing: kalibrasi, buang gravitasi, filter noise | Nilai diam ~0 g saat sensor diam; spike ketahuan saat digoyang |
| 3 | Hitung PGA (gal), RMS, FFT, frekuensi dominan | Angka berubah konsisten saat simulasi/getaran nyata |
| 4 | Klasifikasi AI | 4 label keluar dengan confidence; minimal 2 skenario ter-trigger live (normal + anomali) |
| 5 | Early warning 4 level (Normal/Waspada/Siaga/Bahaya) | Level berubah + tampil beda warna saat anomali; riwayat event tercatat |
| 6 | Peta lokasi + daftar perangkat (Leaflet/OSM) | 1 lokasi demo + 1 perangkat tampil; status online/offline |
| 7 | 2 role: Super Admin & User | Login beda role, User hanya lihat lokasi/perangkat miliknya |
| 8 | Riwayat event + detail satu event | Klik event → lihat grafik + angka PGA/RMS/FFT saat itu |

**Sengaja TIDAK di MVP:** 14 tabel penuh (cukup ~6 tabel inti, lihat bawah),
multi-bangunan/area bertingkat penuh (1 lokasi → 1 bangunan → 1 area → 1
perangkat cukup buat demo), 1D CNN/LSTM (lihat "AI bertahap").

## Dua mode sumber data — satu pipeline yang sama

Supaya demo tidak tergantung hardware datang atau tidak:

- **Mode A — hardware ada:** ESP32 + MPU6050 kirim via MQTT ke broker
  (topik mis. `seismora/<device_id>/accel`), backend subscribe, masuk
  pipeline yang sama persis.
- **Mode B — simulator (fallback / latihan demo):** generator pola getaran di
  backend: diam (noise kecil), minor (getaran lalu-lalang), anomali (spike
  tiba-tiba), seismik (gelombang berdurasi ~10–20 dtk). Satu switch
  `DATA_SOURCE=mqtt|simulator` di `.env`, tanpa ubah kode dashboard/AI.

Keputusan: bangun **Mode B dulu** (dashboard + AI bisa dites hari ini juga),
Mode A tinggal colok saat hardware nyambung. Juri tetap lihat semua fitur
jalan; saat hardware ada, ganti sumber data, bukan rebuild.

## AI bertahap (jangan langsung CNN)

1. **Hari 1 — rule-based dulu (langsung demo-able):** ambang PGA/RMS +
   durasi → 4 label + 4 level warning. Ini yang ditampilkan ke juri kalau
   model ML belum siap.
2. **Berikutnya — Random Forest / Isolation Forest:** latih dari data
   simulator + rekaman goyangan nyata; gantikan ambang bila akurasinya
   terbukti lebih baik di data uji (bukan perasaan).
3. **Hanya kalau waktu sisa — 1D CNN / LSTM:** butuh dataset getaran
   berlabel yang cukup; kalau tidak ada, jangan dipaksa — rule-based +
   RF yang teruji lebih meyakinkan juri daripada CNN yang tidak terlatih.

## Stack (sesuai spek) + penyesuaian demo

- Frontend: Next.js + Tailwind, WebSocket buat grafik live, Leaflet/OSM peta.
- Backend: Node + Express (API + MQTT subscriber + WebSocket).
- AI: Python service kecil (FastAPI) — dipanggil backend, bukan dicampur.
- DB: MySQL, tapi **demo cukup 6 tabel inti**: users, locations,
  buildings, areas, devices, events (+ event_readings bila perlu). 8 tabel
  lain (AI models, warnings, settings detail, dst.) ditambah setelah demo jalan.
- Deploy: VPS + Docker (docker-compose: web + api + ai + mysql + mqtt
  broker Mosquitto). Satu perintah up, sama pola dengan katalog/NBA.

## Batas kejujuran (tulis di slide, jangan overclaim)

Ini dari speknya sendiri dan wajib dijaga saat presentasi ke juri:

- MPU6050 itu **prototype-grade, bukan instrumen seismik profesional**.
- **PGA ≠ magnitudo.** Tabel SIG-BMKG = referensi, bukan ambang alarm universal.
- **Confidence AI ≠ probabilitas gempa.** 1 sensor ≠ sistem prediksi gempa.
- Klaim yang aman: "monitoring + deteksi anomali getaran real-time".

Juri teknis menghargai batas yang dinyatakan daripada klaim prediksi gempa.

## Timeline relatif (isi tanggal begitu deadline diketahui)

- **H-14 s.d. H-10 (atau minggu pertama):** Mode B simulator + dashboard
  live + rule-based warning. Demo internal pertama.
- **H-9 s.d. H-5:** AI RF/Isolation Forest + riwayat event + 2 role + peta.
- **H-4 s.d. H-2:** Mode A hardware (kalau ada) + gladi demo + slide.
- **H-1:** freeze. Tidak ada fitur baru; hanya perbaikan demo yang rusak.
- Kalau deadline < 2 minggu: potong AI tahap 2–3 dan multi-lokasi; yang
  dipertahankan adalah 8 baris MVP di atas.

## Risiko demo & mitigasi

| Risiko | Mitigasi |
|---|---|
| Hardware belum datang saat hari-H | Mode B simulator sudah jadi; demo tetap jalan |
| Wi-Fi/MQTT venue lomba bermasalah | Simulator lokal + rekaman data (replay file) sebagai cadangan |
| Sensor noise bikin false alarm live | Ambang + durasi minimum sebelum naik level; tombol "mute demo" |
| Juri tanya "ini prediksi gempa?" | Jawaban batas kejujuran di atas, sudah di slide |

## Keputusan yang masih butuh user

1. **Deadline lomba kapan?** (tanggal + jam; apakah ada pengumpulan proposal/video dulu?)
2. **Hardware sudah ada belum?** ESP32 + MPU6050 sudah di tangan atau belum?
3. **Nama lomba + format penjurian?** (demo live di tempat / video / poster; tim berapa orang?)
4. **Gas scope MVP di atas?** Kalau iya, saya mulai dari Mode B simulator +
   dashboard — tidak perlu tunggu hardware.
