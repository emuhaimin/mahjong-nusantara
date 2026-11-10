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
- `js/variants.js`: aturan varian Hong Kong / Taiwan (16 kartu, tai) / Riichi (yaku, han/fu, dora, furiten) — skor, pembayaran, dealer. `js/rules.js` (`analyzeWin`, `shantenAll`, `waitingTiles`) menerima parameter `sets` (4 atau 5).
- `js/game.js`: Main vs Mesin & Simulasi (semua varian). Online (`server/engine.js`) masih Hong Kong saja. `js/online.js`: klien Online. `js/learn.js`: pelajaran.
- `js/share.js`: bagikan aplikasi (teks promosi + gambar) & hasil permainan sebagai gambar canvas (WhatsApp/Instagram/X/Facebook, unduh, salin). Pratinjau memakai `data:` URL karena CSP `img-src` tidak mengizinkan `blob:`.
- `js/tools.js` (Alat Meja `#tools`): dadu, pencatat skor 4 pemain (memakai `pay`/`draw` dari `js/variants.js`, localStorage `mjn-score`), kalkulator nilai dari kartu. `server/scan.js` + `POST /api/scan`: kenali kartu dari foto via Claude API (raw `fetch`, tanpa npm; aktif bila `ANTHROPIC_API_KEY` ada; wajib login, 30/jam). Uji dengan server Anthropic tiruan lewat `ANTHROPIC_BASE_URL`.
- `js/sound.js`: musik latar generatif (gamelan/guzheng/hujan/ombak/hutan) & efek suara via Web Audio, tanpa file audio. Pengaturan di localStorage `mjn-sound`. Hook: `Sound.callout(text)` dari `FX.callout`, `Sound.tile()` saat buang kartu (game.js & online.js), `Sound.dice()`. Musik hanya bunyi bila `body.in-game`. Opsi "Musik sendiri (MP3)" menyimpan file pemain di IndexedDB `mjn-music` (tidak ke server) dan memutarnya lewat `<audio>` blob: — CSP butuh `media-src 'self' blob:` (server/server.js). Tombol cepat di meja `.snd-dock` (⏭ ganti lagu, 🔊/🔇 bisukan → `S.muted`) dibuat oleh sound.js, tampil hanya saat `body.in-game`. Panggil lewat `window.Sound` / `window.FX` (keduanya `const` global, jadi diekspor eksplisit ke `window`).
- Penanda kursi `mjnRelTag()` (di `js/fx.js`, dipakai game.js & online.js): label Kanan/Depan/Kiri (hanya di HP, relatif ke kursimu; tidak di Simulasi) & "▶ berikutnya" pada pemain yang jalan setelah giliran sekarang. Urutan giliran mahjong: Timur → Selatan → Barat → Utara, berlawanan arah jarum jam (kursi 0 bawah → 1 kanan → 2 depan → 3 kiri).
- `js/progress.js`: tingkat pemain (Pemula → Dewa Mahjong, RP) & 26 badge, dihitung server (`/api/stats` → `progress`) dan ditampilkan di Profil.
- `js/account.js` + `server/auth.js`, `server/stats.js`: login Google, rekaman sesi, statistik. **Main vs Mesin & Online wajib login** (`Account.canPlay()` / `requireLogin()`, event `mjn-auth`; server menolak create/join tanpa akun bila `GOOGLE_CLIENT_ID` aktif). Belajar, Simulasi & Aturan bebas.
- Data pemain: `server/store-sqlite.js` (SQLite `DATA_DIR/mahjong.db`, utama; butuh Node 22.13+) dengan cadangan `server/store.js` (file JSON). Keduanya punya antarmuka yang sama — ubah keduanya bila menambah method. `server/backup.js`: backup harian otomatis ke `DATA_DIR/backups` (14 terakhir).
- Data di VPS: `/var/lib/mahjong-nusantara`. **Jangan pernah** menghapus/menimpa folder ini atau isinya saat deploy.
- `sw.js`: service worker / mode offline. Setiap menambah file JS/CSS/aset baru, **masukkan ke daftar `CORE`**. `deploy/install.sh` menaikkan `VERSION` otomatis saat deploy.
- `server/server.js`: HTTP + WebSocket, tanpa dependensi npm (Node 18+).

## Pengujian

- `node --check` untuk setiap file JS yang diubah.
- Jalankan `npm start` (port 3000) lalu cek di browser dengan Playwright (Chromium sudah terpasang), baik ukuran desktop maupun HP (mis. `devices['iPhone 13']`). Pastikan tidak ada error JavaScript.
- Perubahan AI/aturan: jalankan simulasi tanpa browser (muat `js/tiles.js`, `rules.js`, `record.js`, `ai.js`, `game.js` di `vm` dengan DOM tiruan & timer instan) dan uji `server/engine.js` dengan 4 kursi bot. Pastikan tidak ada error dan tingkat AI tetap berjenjang (Easy < Medium < Hard ≤ Expert).
