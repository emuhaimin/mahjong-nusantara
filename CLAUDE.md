# Mahjong Nusantara — aturan kerja untuk Claude

Situs belajar & main mahjong gaya Hong Kong (144 kartu). Live di https://mahjong.rupaone.io.
Jawab pengguna dalam **bahasa Indonesia**.

## Alur setiap permintaan perubahan

Pemilik repo meminta alur ini dijalankan **otomatis, tanpa menunggu diminta lagi**:

1. Kerjakan di branch kerja sesi ini (mulai dari `main` terbaru).
2. Uji perubahannya (lihat "Pengujian" di bawah).
3. Commit dengan pesan yang jelas, lalu push.
4. **Langsung buat PR ke `main`.**
5. **Langsung merge PR itu** (merge commit).
6. Pastikan workflow **Deploy ke VPS** (`.github/workflows/deploy.yml`) berhasil, lalu laporkan hasilnya.

Catatan:
- Setiap merge ke `main` otomatis men-deploy ke VPS dan menyalakan ulang server, jadi room Online yang sedang berjalan ikut terputus. Sebutkan ini di laporan bila perubahannya menyentuh server.
- Jika deploy gagal, ambil log job-nya, perbaiki, lalu ulangi alur di atas.
- Jangan pernah melewati pengujian demi cepat merge. Kalau ada yang gagal dan belum bisa diperbaiki, jangan merge; laporkan dulu.

## Struktur singkat

- `index.html`, `css/style.css`: tampilan (desktop: meja; HP: tab bar bawah).
- `js/tiles.js`, `js/rules.js`: kartu, shanten, hitung fan (dipakai juga oleh server).
- `js/ai.js`: bot AI 4 tingkat (easy/medium/hard/expert), dipakai `js/game.js` (offline) **dan** `server/engine.js` (Online).
- `js/game.js`: Main vs Mesin & Simulasi. `js/online.js`: klien Online. `js/learn.js`: pelajaran.
- `js/progress.js`: tingkat pemain (Pemula → Dewa Mahjong, RP) & 26 badge, dihitung server (`/api/stats` → `progress`) dan ditampilkan di Profil.
- `js/account.js` + `server/auth.js`, `server/stats.js`, `server/store.js`: login Google, rekaman sesi, statistik.
- `sw.js`: service worker / mode offline. Setiap menambah file JS/CSS/aset baru, **masukkan ke daftar `CORE`**. `deploy/install.sh` menaikkan `VERSION` otomatis saat deploy.
- `server/server.js`: HTTP + WebSocket, tanpa dependensi npm (Node 18+).

## Pengujian

- `node --check` untuk setiap file JS yang diubah.
- Jalankan `npm start` (port 3000) lalu cek di browser dengan Playwright (Chromium sudah terpasang), baik ukuran desktop maupun HP (mis. `devices['iPhone 13']`). Pastikan tidak ada error JavaScript.
- Perubahan AI/aturan: jalankan simulasi tanpa browser (muat `js/tiles.js`, `rules.js`, `record.js`, `ai.js`, `game.js` di `vm` dengan DOM tiruan & timer instan) dan uji `server/engine.js` dengan 4 kursi bot. Pastikan tidak ada error dan tingkat AI tetap berjenjang (Easy < Medium < Hard ≤ Expert).
