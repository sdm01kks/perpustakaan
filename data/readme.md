# Data dan Template

Folder ini berisi template untuk import data.

## File yang Tersedia

- `template-buku.xlsx` - Template import data buku
- `template-anggota.xlsx` - Template import data anggota
- `schema.json` - Struktur database
- `sample-data.json` - Data contoh untuk testing

## Format Import Buku

| Kolom | Keterangan | Wajib |
|-------|-----------|-------|
| kode_aksesi | Nomor unik buku | Ya |
| judul | Judul buku | Ya |
| pengarang | Nama pengarang | Ya |
| penerbit | Nama penerbit | Ya |
| tahun_terbit | Tahun (4 digit) | Ya |
| kategori_ddc | Kode DDC (000-999/F/R/B) | Ya |
| lokasi_rak | Posisi di rak | Ya |
| status | tersedia/dipinjam/rusak/hilang | Ya |

## Format Import Anggota

| Kolom | Keterangan | Wajib |
|-------|-----------|-------|
| nis | Nomor induk siswa | Ya |
| nama_lengkap | Nama lengkap | Ya |
| tipe_anggota | siswa/guru/umum | Ya |
| kelas | Kelas (contoh: 4A) | Ya (siswa) |
| no_hp | Nomor telepon | Tidak |
