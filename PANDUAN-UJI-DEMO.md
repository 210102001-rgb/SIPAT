# Panduan Uji Demo SEISMORA (Stage 1) — buat user, bukan buat juri

> Terverifikasi terhadap build final 7 Nov 2026 ~16:15 WIB (30/30 cek live
> lolos — login, SSE, skenario seismik → bahaya, event + snapshot, CSV).
> Akun demo: admin/admin123 (Super Admin), demo/demo123 (User).

## 1. Login (akun seed — dari CONTRACT.md)

| Akun | Username | Password | Role |
|---|---|---|---|
| Super Admin | `admin` | `admin123` | semua lokasi, semua menu |
| Demo User | `demo` | `demo123` | hanya lokasi miliknya |

Data demo yang sudah di-seed: Lokasi **Kampus Demo** (Surakarta) → Gedung A →
Lantai 1 → perangkat **ESP32-001** (Sensor Gedung A, MPU6050, online).

Data dummy (ditambah 7 Nov 2026 ~17:07 WIB, semua milik akun demo):
**Kampus UNS**, **RSUD Dr. Moewardi**, **Solo Paragon Mall** — total 4 lokasi,
6 bangunan, 8 area, 4 perangkat (ESP32-002/003/004 offline — simulator hanya
mengalirkan data untuk ESP32-001), plus 6 event di Riwayat (5 historis 3 hari
terakhir). Jadi jangan kaget kalau Peta/Riwayat sudah ramai sebelum demo dimulai.

## 2. Skrip demo 5 menit (urut — ini yang dilihat juri)

1. **Login sebagai `admin`** → Dashboard. Grafik X/Y/Z harus bergerak dan angka
   PGA/RMS berubah terus (target: < 2 detik dari data masuk).
2. **Buka halaman Skenario** (Scenario Control). Jalankan berurutan, tunggu
   tiap skenario ~10–20 detik:
   - **Normal** → grafik diam, label Normal, tidak ada overlay.
   - **Getaran Kecil** → label Minor Vibration, warning tetap Normal.
   - **Anomali** → label Anomaly + **layar penuh Waspada (kuning)** muncul.
     Klik **Acknowledge** untuk menutup.
   - **Gempa (Seismik)** → label Potential Seismic Event + **layar penuh
     Siaga (oranye)** lalu **Bahaya (merah)** saat PGA bertahan tinggi.
     Alarm suara berbunyi untuk Siaga/Bahaya.
   - **Kembali ke Normal** (tombol berhenti di halaman Skenario) → overlay
     hilang, sistem kembali baseline.
3. **Buka Riwayat (History)** → event Anomali + Gempa tadi tercatat, lengkap
   dengan peak PGA, durasi, dan status acknowledged. Klik satu event untuk
   lihat detail grafik + angka saat itu.
4. **Buka Peta** → 4 pin tampil (Kampus Demo + 3 lokasi dummy), perangkat
   ESP32-001 status online, ESP32-002/003/004 offline.
5. **Logout, login sebagai `demo`** → keempat lokasi terlihat (semua milik demo);
   bukti 2 role jalan: admin melihat semua lokasi, demo hanya lokasi miliknya.

## 3. Ambang yang dipakai klasifikasi (rule-based Stage 1 — jujur di UI)

Dari `src/lib/signal.ts` (`classify`):

| PGA | Label | Peringatan |
|---|---|---|
| < 2,9 gal | Normal | Normal (hijau) |
| 2,9 – <30 gal | Minor Vibration | Normal |
| 30 – <89 gal | Anomaly | **Waspada** (kuning) |
| 89 – <168 gal, tahan ≥ 2 detik | Potential Seismic Event | **Siaga** (oranye) |
| ≥ 168 gal, tahan ≥ 2 detik | Potential Seismic Event | **Bahaya** (merah) |

Level SIG-BMKG: <2,9→1, 2,9–88→2, 89–167→3, 168–564→4, >564→5.
Confidence yang tampil adalah rentang rule-based, bukan probabilitas gempa —
jangan klaim ke juri sebagai probabilitas.

## 4. Yang wajib dicek di tiap peringatan full layar

- Level + warna besar dan benar (kuning/oranye/merah).
- Nama lokasi + perangkat + waktu kejadian + nilai PGA tampil.
- Instruksi keselamatan tampil.
- Tombol Acknowledge menutup layar dan tercatat di histori.
- **Suara:** alarm Siaga/Bahaya hanya bunyi setelah ada interaksi klik dulu
  (aturan autoplay browser — AudioContext butuh gestur). Jadi sebelum demo:
  klik sekali di halaman mana pun, baru trigger skenario Gempa. Kalau demo
  dibuka langsung dari link tanpa klik, overlay tetap tampil tapi suara
  mungkin diam — itu batasan browser, bukan bug.

## 5. Tes di HP (sebelum tunjuk ke juri)

- Buka link di HP, tutup tab, buka lagi (pastikan bukan cache lama).
- Trigger Anomali → overlay kuning harus menutup seluruh layar HP.
- Cek menu bawah/navigasi tidak ketutupan overlay setelah acknowledge.

## 6. Yang masih kosong

- **Deadline lomba belum diketahui** — user belum jawab. Tanpa tanggal,
  jadwal latihan/gladi belum bisa dipatok. Begitu ada tanggal, urutan kerja:
  gladi skrip 5 menit di atas → perbaiki yang gagal → bekukan build.
- Nama lomba + format penjurian (live/video/poster) juga belum diisi.
