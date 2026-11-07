# Mahjong Nusantara

Belajar & main mahjong gaya Hong Kong (144 kartu): pelajaran interaktif, main vs bot, simulasi 4 bot, dan **multipemain online**.

## Menjalankan

Butuh Node.js 18+ (tanpa dependensi tambahan).

```bash
npm start
```

Buka `http://localhost:3000`. Teman di Wi-Fi yang sama bisa membuka alamat `http://<IP-komputer>:3000` yang muncul di terminal.

Mode offline (Belajar, Main vs Mesin, Simulasi Bot) juga jalan dengan membuka `index.html` langsung — hanya mode Online yang butuh server.

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

## Struktur

- `js/tiles.js`, `js/rules.js` — kartu, deteksi menang, fan & poin, shanten (dipakai klien **dan** server)
- `js/game.js` — mesin offline + bot
- `js/online.js` — klien online (lobby, room, meja, chat)
- `js/learn.js` — modul belajar 17 langkah
- `server/server.js` — server statis + WebSocket
- `server/engine.js` — mesin permainan otoritatif per room
- `deploy/` — skrip upload, instalasi VPS, systemd, nginx, dan template HestiaCP

## Aturan online

- Host membuat room (kode 4 huruf) dan memulai; kursi kosong diisi bot.
- Teman yang datang setelah mulai menggantikan bot.
- Batas waktu: 30 dtk per giliran, 12 dtk untuk klaim. Kalau habis, langkah dipilih otomatis.
- Pemain yang terputus sementara dimainkan bot dan kembali ke kursinya saat tersambung lagi.
- Room yang kosong dihapus setelah 15 menit.
