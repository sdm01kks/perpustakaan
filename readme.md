# 📚 Perpustakaan Digital SD Muhammadiyah 01 Kukusan

Sistem manajemen perpustakaan serverless berbasis PWA (Progressive Web App) 
yang menggunakan Google Drive sebagai cloud storage.

## ✨ Fitur Utama

- 🔄 **Offline First** - Bekerja tanpa internet, sync saat online
- 📱 **Responsive** - Desktop, tablet, dan mobile friendly
- 🔐 **Multi-user** - Role: Superadmin, Admin, Pustakawan, Siswa, Guru
- 📷 **QR Code** - Scan kartu anggota dan label buku
- ☁️ **Cloud Backup** - Otomatis sync ke Google Drive
- 📊 **Laporan** - Export Excel dan PDF

## 🚀 Quick Start

### Untuk Pustakawan

1. Buka: https://sdm01kks.github.io/perpustakaan/
2. Login dengan akun yang diberikan admin
3. Mulai kelola buku dan proses peminjaman

### Untuk Siswa

1. Scan QR code di kartu perpustakaan
2. Cari buku di katalog digital
3. Lihat status peminjaman Anda

## 📖 Dokumentasi

- [Panduan Setup](docs/SETUP.md)
- [Panduan Pengguna](docs/USER-GUIDE.md)
- [Solusi Masalah](docs/TROUBLESHOOTING.md)

## 🛠️ Teknologi

- **Frontend**: HTML5, Tailwind CSS, Vanilla JavaScript
- **Storage**: IndexedDB (local), Google Drive (cloud)
- **PWA**: Service Worker, Web App Manifest
- **Utilities**: Dexie.js, QRCode.js, SheetJS, jsPDF

## 📂 Struktur Repository
