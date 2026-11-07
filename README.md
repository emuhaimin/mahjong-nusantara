# Mahjong Nusantara

Belajar & main mahjong gaya Hong Kong (144 kartu): pelajaran interaktif, main vs bot, simulasi 4 bot, dan **multipemain online**.

## Menjalankan

Butuh Node.js 18+ (tanpa dependensi tambahan).

```bash
npm start
```

Buka `http://localhost:3000`. Teman di Wi-Fi yang sama bisa membuka alamat `http://<IP-komputer>:3000` yang muncul di terminal.

Mode offline (Belajar, Main vs Mesin, Simulasi Bot) juga jalan dengan membuka `index.html` langsung — hanya mode Online yang butuh server.

## Main tanpa internet (mode pesawat)

Buka situs sekali saat ada internet (atau pasang sebagai aplikasi). Service worker (`sw.js`) menyimpan semua halaman, kode, gambar kartu, dan font. Setelah itu **Belajar**, **Main vs Mesin**, **Simulasi Bot**, dan **Aturan & Poin** jalan sepenuhnya offline. Beranda menampilkan “✅ Siap dimainkan tanpa internet” kalau semuanya sudah tersimpan.

- Saat offline muncul banner ✈️, dan kartu *Main Online* ditandai “butuh internet”.
- Pemain yang login tetap dikenali saat offline. Hasil sesi Main vs Mesin diantre di perangkat lalu dikirim otomatis begitu internet kembali.
- Room Online tersambung ulang otomatis begitu koneksi kembali.

## Deploy ke mahjong.rupaone.io (VPS Hostinger)

Hasil akhirnya: `https://mahjong.rupaone.io`. Node berjalan sebagai layanan systemd `mahjong` di `127.0.0.1:3100`, dan nginx meneruskan ke sana (termasuk WebSocket), dengan HTTPS dari Let's Encrypt. Situs utama rupaone.io tidak disentuh.

**1. Tambah DNS (sekali saja)** — hPanel → Domain → rupaone.io → DNS / Nameserver → tambah record:

| Tipe | Nama | Isi | TTL |
|---|---|---|---|
| A | `mahjong` | `187.77.115.96` | 3600 |

**2. Unggah & pasang** — dari folder proyek di Mac:

```bash
EMAIL=emailkamu@contoh.com ./deploy/upload.sh root@187.77.115.96
```

Skrip ini (`deploy/install.sh`, dijalankan di VPS):
- memasang Node.js 20 jika belum ada,
- menyalin aplikasi ke `/opt/mahjong-nusantara` dan menyalakan layanan `mahjong`,
- menambah situs nginx baru `mahjong.rupaone.io` (dicek `nginx -t` dulu; kalau gagal dibatalkan otomatis),
- meminta sertifikat HTTPS dengan certbot jika DNS sudah mengarah ke VPS. Kalau DNS belum aktif, cukup jalankan ulang perintah yang sama nanti.

**Alternatif tanpa SSH/GitHub (Browser Terminal hPanel):** jalankan `./deploy/make-paste.sh` di Mac → muncul folder `deploy-paste/` berisi potongan `1.txt`…`7.txt`. Salin satu per satu (`pbcopy < deploy-paste/1.txt`), tempel ke Browser Terminal VPS, tekan Enter. Potongan terakhir memeriksa checksum lalu menjalankan instalasi.

**Lewat GitHub (disarankan):**

```bash
# sekali saja, di Browser Terminal VPS (root)
git clone https://github.com/USERNAME/mahjong-nusantara.git /root/mahjong-nusantara
cd /root/mahjong-nusantara && bash deploy/install.sh

# setiap update: push dari Mac, lalu di VPS
cd /root/mahjong-nusantara && git pull && bash deploy/install.sh
```

**Jika VPS memakai HestiaCP (rupaone.io):** `install.sh` otomatis mendeteksi Hestia. Ia tidak menyentuh nginx/certbot secara langsung, melainkan memasang template proxy `mahjong-node`, menambah web domain di Hestia, lalu meminta SSL lewat Let's Encrypt bawaan Hestia. Cara upload tanpa SSH:
1. Di Mac: `./deploy/make-package.sh` → `mahjong-nusantara.tar.gz`.
2. Upload file itu lewat File Manager Hestia ke folder home user.
3. Di Browser Terminal VPS (root):
   `mkdir -p /root/mahjong-nusantara && tar xzf "$(find /home -maxdepth 5 -name mahjong-nusantara.tar.gz | head -1)" -C /root/mahjong-nusantara && cd /root/mahjong-nusantara && bash deploy/install.sh`
   (tambahkan `HESTIA_USER=nama` di depan `bash` jika domain dimiliki user Hestia tertentu).

**Update versi baru:** jalankan perintah yang sama lagi. Konfigurasi nginx/HTTPS yang sudah ada dibiarkan.

**Perintah berguna di VPS**

```bash
systemctl status mahjong
journalctl -u mahjong -f
systemctl restart mahjong
```

Pilihan lain: `PORT=3200` jika port 3100 sudah dipakai, `DOMAIN=...` untuk subdomain lain. Untuk sub-path (mis. `rupaone.io/mahjong/`) jalankan server dengan `BASE_PATH=/mahjong`.

Catatan: room disimpan di memori, jadi restart layanan menghentikan permainan yang sedang berjalan.

## Akun & riwayat (login Google)

- Login memakai **Sign in with Google**: server memverifikasi ID token (tanda tangan Google, audience = Client ID). Tidak ada password yang disimpan.
- Sesi login: cookie `mjn_sess` (HttpOnly, SameSite=Lax, Secure di HTTPS), 30 hari. Token disimpan di server dalam bentuk hash.
- Data disimpan di `DATA_DIR` (default `./data`; di VPS otomatis `/var/lib/mahjong-nusantara`): `users.json`, `sessions.json`, `games/<id>.jsonl`.
- Yang direkam per sesi (Main vs Mesin & Online, hanya jika login): hasil tiap hand, fan, skor, peringkat, dan evaluasi keputusan (buangan vs saran mesin, klaim, Hu terlewat, kena tembak).
- Halaman **Profil**: statistik, tren, saran perbaikan, riwayat sesi, dan tombol hapus akun.

**Mengaktifkan login Google**
1. Google Cloud Console → buat proyek → *APIs & Services* → *OAuth consent screen* (External, isi nama aplikasi, email dukungan, domain `rupaone.io`, privacy policy `https://mahjong.rupaone.io/privacy.html`) → Publish.
2. *Credentials* → *Create credentials* → *OAuth client ID* → *Web application* → *Authorized JavaScript origins*: `https://mahjong.rupaone.io` (tambahkan `http://localhost:3000` untuk uji lokal).
3. Salin Client ID (`…apps.googleusercontent.com`), lalu di VPS:
   `cd /root/mahjong-nusantara && git pull && GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com bash deploy/install.sh`
   (Client ID disimpan di `/etc/mahjong-nusantara.env`; update berikutnya cukup `bash deploy/install.sh`.)

Uji lokal: `GOOGLE_CLIENT_ID=... npm start`.

## Struktur

- `js/tiles.js`, `js/rules.js` — kartu, deteksi menang, fan & poin, shanten (dipakai klien **dan** server)
- `js/game.js` — mesin offline + bot
- `js/online.js` — klien online (lobby, room, meja, chat)
- `js/learn.js` — modul belajar 17 langkah
- `server/server.js` — server statis + WebSocket
- `server/engine.js` — mesin permainan otoritatif per room
- `server/auth.js`, `server/store.js`, `server/stats.js` — login Google, penyimpanan data, statistik & saran
- `js/record.js` — perekam sesi (dipakai browser & server) · `js/account.js` — login & halaman Profil
- `assets/tiles/` — gambar kartu (SVG)
- `tools/minify_svg.py` — pengecil SVG
- `deploy/` — skrip upload, instalasi VPS, systemd, nginx, dan template HestiaCP

## Aturan online

- Host membuat room (kode 4 huruf) dan memulai; kursi kosong diisi bot.
- Teman yang datang setelah mulai menggantikan bot.
- Batas waktu: 30 dtk per giliran, 12 dtk untuk klaim. Kalau habis, langkah dipilih otomatis.
- Pemain yang terputus sementara dimainkan bot dan kembali ke kursinya saat tersambung lagi.
- Room yang kosong dihapus setelah 15 menit.

## Kredit

Gambar kartu dari [FluffyStuff/riichi-mahjong-tiles](https://github.com/FluffyStuff/riichi-mahjong-tiles) (public domain, CC0), dikecilkan dengan `tools/minify_svg.py`. Naga Putih berbingkai biru serta kartu Bunga & Musim dibuat khusus untuk situs ini.
