# Mahjong Nusantara

Belajar & main mahjong gaya Hong Kong (144 kartu): pelajaran interaktif, main vs bot, simulasi 4 bot, dan **multipemain online**.

## Menjalankan

Butuh Node.js 18+ (tanpa dependensi tambahan).

```bash
npm start
```

Buka `http://localhost:3000`. Teman di Wi-Fi yang sama bisa membuka alamat `http://<IP-komputer>:3000` yang muncul di terminal.

Mode offline (Belajar, Main vs Mesin, Simulasi Bot) juga jalan dengan membuka `index.html` langsung — hanya mode Online yang butuh server.

## Tingkat pemain & badge (Profil, perlu login)

Jenjang terinspirasi sistem peringkat platform mahjong daring (Mahjong Soul: Novice → Celestial, Tenhou: kyu/dan):

| Tier | | RP minimal | Sub-tingkat |
|---|---|---|---|
| 新手 | Pemula | 0 | I · II · III (0 / 20 / 50) |
| 雀士 | Pemain | 100 | I · II · III (100 / 160 / 230) |
| 雀傑 | Jagoan | 320 | I · II · III (320 / 430 / 560) |
| 雀豪 | Pendekar | 720 | I · II · III (720 / 900 / 1100) |
| 雀聖 | Suhu | 1350 | I · II · III (1350 / 1650 / 2000) |
| 雀神 | Dewa Mahjong | 2500 | tanpa batas |

RP didapat dari posisi akhir sesi lengkap (juara 1 +40, ke-2 +15, ke-3 0, ke-4 −15 mulai tier Jagoan) dan tiap hand menang (+2, ditambah setengah fan). Semua dikali tingkat lawan (Easy ×0,4 · Medium ×0,8 · Hard ×1 · Expert ×1,3 · Online ×1,2), dan poin posisi dikali panjang permainan (1 hand ×0,25 · 1 ronde ×1 · 4 ronde ×2). Tier yang sudah dicapai tidak bisa turun. Profil juga menampilkan peringkat global di antara semua pemain.

Ada 26 badge (perunggu/perak/emas/giok): perjalanan (sesi pertama, 10 & 50 sesi), kemenangan (Hu & Zimo pertama, 10 & 100 menang, juara meja, Penakluk Expert, Juara Online), pola (Semua Chow/Pong, Satu Warna, Tujuh Pasang, Tiga Naga, Empat Angin, Tiga Belas Yatim, 13 fan, bunga, kartu terakhir, menang dari Kong), dan keterampilan (Ting Kilat, Tembok Baja, Maraton). Semuanya dihitung ulang dari seluruh riwayat sesi, jadi permainan lama ikut terhitung. Logika ada di `js/progress.js` (dipakai server & browser).

## Bunga & Musim

Delapan kartu bonus (梅蘭菊竹 bunga, 春夏秋冬 musim) ikut dikocok. Seperti di meja nyata, bunga yang didapat langsung **dibuka di depan pemain** (di samping Pong/Chow terbuka), lalu pemain mengambil kartu pengganti dari ujung belakang tembok. Saat pembagian awal, bunga diganti mulai dari dealer dan diringkas di tengah meja. Bunga yang terambil di tengah permainan diumumkan dengan notifikasi **BUNGA!**. Bunga bernomor sama dengan kursi (Timur=1 … Utara=4) diberi lingkar emas karena bernilai +1 fan (Bunga Kursi Sendiri). Set lengkap = +2 fan, tanpa bunga sama sekali = +1 fan.

## Jenis mahjong (Main vs Mesin & Simulasi)

Di layar pengaturan pemain memilih varian (diingat di perangkat). Aturan tiap varian ada di `js/variants.js`:

| Varian | Kartu | Tangan | Skor | Ciri khas |
|---|---|---|---|---|
| **Hong Kong** 廣東 | 144 (dengan bunga) | 13 | fan (tabel poin) | Minimal fan bisa dipilih 0/1/3 |
| **Taiwan** 台灣16張 | 144 (dengan bunga) | **16** (menang 5 set + 1 pasang) | tai — bayar 30 + tai × 10 | Dealer +1 tai (+2 tiap lanjut), tanpa minimal, tanpa Tujuh Pasang |
| **Jepang · Riichi** 立直 | 136, tanpa bunga, 3 lima merah | 13 | han/fu (Mangan, Haneman, … Yakuman), skor awal 25.000 | Wajib yaku · deklarasi riichi (tongkat 1000, ura-dora) · dora/kan-dora dari dead wall · furiten · honba · bayar Ting saat seri · hanchan = Timur + Selatan |

Bot memahami tiap varian (Taiwan: jarak Ting untuk 16 kartu; Riichi: hanya membuka tangan bila masih ada jalan ke yaku, deklarasi riichi saat Ting tertutup, kartu buangan lawan riichi = aman). Mode **Online** & pelajaran masih gaya Hong Kong.

## Tingkat lawan AI (Main vs Mesin & Simulasi)

Bot memakai AI berbasis aturan (bukan *machine learning*): menghitung jarak tangan ke Ting (shanten), peluang kartu yang tersisa, fan, dan bahaya buangan. Pilih tingkatnya di layar pengaturan (diingat di perangkat):

| Tingkat | Perilaku |
|---|---|
| 🟢 Easy | Sering membuang asal, asal klaim Pong/Chow, tidak menghitung peluang kartu |
| 🟡 Medium | Mengejar Ting dengan benar, tapi ±30% buangan acak dan tidak mengejar Flush |
| 🟠 Hard | Hitung peluang kartu tersisa, jaga kartu bernilai, kejar Flush; sesekali (10%) kurang teliti |
| 🔴 Expert | Tidak pernah ceroboh, selalu kejar fan besar, membaca lawan (meld terbuka, lamanya bermain, kartu yang baru lolos) dan membuang kartu aman saat lawan hampir Hu |
| 🎲 Campuran | Tiap bot beda tingkat (main: Medium/Hard/Expert · simulasi: Easy/Medium/Hard/Expert) |

Di mode **Online**, host memilih tingkat bot saat membuat room (bisa diubah di ruang tunggu). Kursi pemain yang terputus atau kehabisan waktu dimainkan otomatis setara Hard. Saran langkah untuk pemain selalu memakai penilaian Hard.

Otak bot ada di satu file, `js/ai.js`, yang dipakai bersama oleh `js/game.js` (browser) dan `server/engine.js` (Online).

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

**Deploy otomatis (GitHub Actions):** `.github/workflows/deploy.yml` menjalankan langkah di atas lewat SSH setiap ada push atau merge ke `main`, lalu memeriksa `https://mahjong.rupaone.io/health`. Bisa juga dijalankan manual dari tab *Actions* → *Deploy ke VPS* → *Run workflow*. Persiapan sekali saja:

1. Di VPS: `ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N "" && cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys`
2. Di GitHub → *Settings* → *Secrets and variables* → *Actions*, tambahkan `VPS_HOST` (IP VPS) dan `VPS_SSH_KEY` (isi `~/.ssh/github_deploy`).

Catatan: setiap deploy menyalakan ulang layanan `mahjong`, jadi room Online yang sedang berjalan ikut terputus.

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

- **Akses:** *Main vs Mesin* dan *Online* khusus pemain yang login Google. *Belajar*, *Simulasi Bot*, dan *Aturan & Poin* bebas tanpa login. Server juga menolak membuat/gabung room Online tanpa login (`error: login`). Pengecualian untuk pengembangan: halaman yang dibuka langsung dari file, atau server tanpa `GOOGLE_CLIENT_ID`. Setelah login, pemain dikembalikan ke halaman tujuan (termasuk undangan `#online/KODE`).

- Login memakai **Sign in with Google**: server memverifikasi ID token (tanda tangan Google, audience = Client ID). Tidak ada password yang disimpan.
- Sesi login: cookie `mjn_sess` (HttpOnly, SameSite=Lax, Secure di HTTPS), 30 hari. Token disimpan di server dalam bentuk hash.
- Data disimpan di `DATA_DIR` (default `./data`; di VPS otomatis `/var/lib/mahjong-nusantara`). Lihat **Database & backup** di bawah.
- Yang direkam per sesi (Main vs Mesin & Online, hanya jika login): hasil tiap hand, fan, skor, peringkat, dan evaluasi keputusan (buangan vs saran mesin, klaim, Hu terlewat, kena tembak).
- Halaman **Profil**: statistik, tren, saran perbaikan, riwayat sesi, dan tombol hapus akun.

### Database & backup

- **SQLite** (`DATA_DIR/mahjong.db`, mode WAL) memakai modul bawaan Node `node:sqlite` — tanpa paket npm. Butuh **Node 22.13+**; `deploy/install.sh` otomatis menaikkan Node di VPS ke 24 LTS.
  Tabel: `users` (profil Google + alias), `sessions` (hash token login, 30 hari), `games` (satu baris per sesi permainan; kolom mode/level/length/complete/rank + data lengkap JSON).
- **Pindahan otomatis:** saat `mahjong.db` belum ada dan masih ada data lama berbasis file (`users.json`, `sessions.json`, `games/*.jsonl`), semuanya dipindahkan ke SQLite saat server menyala. File lama tidak dihapus, hanya digeser ke `DATA_DIR/legacy-json/`. Sesi login ikut pindah, jadi pemain tidak perlu login ulang.
- **Cadangan:** bila Node terlalu lama (`node:sqlite` tidak ada) atau `STORE=file`, server tetap jalan dengan penyimpanan file lama (`server/store.js`).
- **Backup harian otomatis** (`server/backup.js`): dicek tiap jam dan saat server menyala; bila backup terakhir sudah lebih dari 20 jam, dibuat salinan konsisten (`VACUUM INTO`) yang dikompres → `DATA_DIR/backups/mahjong-YYYY-MM-DD_HHMM.db.gz`. Hanya **14 backup terakhir** disimpan. Ubah dengan `BACKUP_DIR=…` / `BACKUP_KEEP=…` di `/etc/mahjong-nusantara.env`.
  Backup ada di disk VPS yang sama — untuk keamanan ekstra, sesekali unduh salinannya ke komputer lain (`scp root@VPS:/var/lib/mahjong-nusantara/backups/*.db.gz .`).

**Memulihkan dari backup** (di VPS, sebagai root):
```bash
systemctl stop mahjong
cd /var/lib/mahjong-nusantara
mv mahjong.db mahjong.db.rusak-$(date +%F); rm -f mahjong.db-wal mahjong.db-shm
gunzip -c backups/mahjong-2026-11-08_0300.db.gz > mahjong.db   # pilih file backup yang diinginkan
chown mahjong:mahjong mahjong.db && chmod 600 mahjong.db
systemctl start mahjong
```

**Mengaktifkan login Google**
1. Google Cloud Console → buat proyek → *APIs & Services* → *OAuth consent screen* (External, isi nama aplikasi, email dukungan, domain `rupaone.io`, privacy policy `https://mahjong.rupaone.io/privacy.html`) → Publish.
2. *Credentials* → *Create credentials* → *OAuth client ID* → *Web application* → *Authorized JavaScript origins*: `https://mahjong.rupaone.io` (tambahkan `http://localhost:3000` untuk uji lokal).
3. Salin Client ID (`…apps.googleusercontent.com`), lalu di VPS:
   `cd /root/mahjong-nusantara && git pull && GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com bash deploy/install.sh`
   (Client ID disimpan di `/etc/mahjong-nusantara.env`; update berikutnya cukup `bash deploy/install.sh`.)

Uji lokal: `GOOGLE_CLIENT_ID=... npm start`.

## Struktur

- `js/tiles.js`, `js/rules.js` — kartu, deteksi menang, fan & poin, shanten (dipakai klien **dan** server)
- `js/ai.js` — bot AI (4 tingkat), dipakai browser & server
- `js/game.js` — mesin offline
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
