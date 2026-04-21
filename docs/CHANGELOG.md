# 📋 Changelog – Perpustakaan SDM01 v1.2.0

## Bug Fixes (dari v1.1.0)

---

### 🔴 Bug Kritis (semua sudah diperbaiki)

#### 1. `app/dashboard/pustakawan.html` — Double `<script>` tag
**Sebelum:**
```html
<script src="../core/auth.js"></script>
<script>
<script>       ← ❌ tag duplikat — seluruh JS dashboard tidak berjalan
```
**Sesudah:**
```html
<script src="../core/auth.js"></script>
<script>       ← ✅ hanya satu tag
```

---

#### 2. `app/core/auth.js` — Fungsi `loginWithPin` rusak (kurung kurawal salah)
**Masalah:** Blok `if (!user)`, `if (!user.is_active)`, dan verifikasi PIN berada di
luar blok `try { }` karena nesting kurung kurawal yang salah. Akibatnya kode
melempar SyntaxError atau berjalan di luar konteks yang benar.

**Fix:** Fungsi ditulis ulang dengan struktur bersih, indentasi konsisten, dan
semua logik di dalam blok `try` yang tepat.

---

#### 3. `app/core/auth.js` — Tidak ada cek `null` pada PIN
**Sebelum:**
```js
if (user.pin !== pin) { return error('PIN salah'); }
```
**Masalah:** Superadmin default dibuat dengan `pin: null`. Perbandingan `null !== "123456"`
selalu `true`, sehingga login superadmin selalu gagal dengan pesan "PIN salah"
meski PIN yang diketik sudah benar.

**Sesudah:**
```js
if (user.pin === null || user.pin === undefined || user.pin === '') {
    return error('Akun belum memiliki PIN. Hubungi superadmin untuk setup.');
}
if (String(user.pin) !== String(pin)) {
    return error('PIN salah. Silakan coba lagi.');
}
```

---

#### 4. `app/core/auth.js` — Type mismatch saat bandingkan PIN
**Masalah:** PIN bisa tersimpan sebagai `Number` (misal `123456`) di IndexedDB,
sementara input dari form selalu `String`. `123456 !== "123456"` → `true` → login
selalu gagal meski PIN benar.

**Fix:** Kedua sisi dikonversi ke `String()` sebelum dibandingkan.

---

#### 5. `app/core/auth.js` — `getDefaultRoute()` mengarah ke file yang tidak ada
**Sebelum:**
```js
[ROLES.SUPERADMIN]: '/app/dashboard/admin.html',   // ❌ file tidak ada
[ROLES.ADMIN]:      '/app/dashboard/admin.html',   // ❌ file tidak ada
```
**Sesudah:**
```js
[ROLES.SUPERADMIN]: 'app/dashboard/pustakawan.html',  // ✅
[ROLES.ADMIN]:      'app/dashboard/pustakawan.html',  // ✅
```
Juga semua path diubah dari absolute (`/app/...`) ke relative (`app/...`) supaya
berjalan di GitHub Pages maupun file lokal.

---

#### 6. `index.html` — Login PIN tidak menggunakan `authManager`
**Masalah:** Fungsi `loginWithPin()` di `index.html` menulis ulang logiknya sendiri
secara terpisah (duplikasi), tanpa fitur auto-create akun siswa. Akibatnya siswa
yang login pertama kali selalu mendapat "Email/NIS tidak ditemukan" meski NIS-nya ada.

**Fix:** `loginWithPin()` sekarang memanggil `authManager.loginWithPin()` langsung,
sehingga semua logik (lookup email, lookup NIS, auto-create akun siswa) berjalan konsisten.

---

#### 7. `index.html` — Tidak ada deteksi setup awal
**Masalah:** Saat pertama kali diakses, superadmin belum punya PIN. Pengguna
hanya melihat "PIN salah" tanpa tahu harus ke `setup.html`.

**Fix:** Fungsi `checkNeedsSetup()` ditambahkan. Jika superadmin tidak punya PIN,
muncul banner kuning dengan tombol langsung ke halaman setup.

---

#### 8. `app/setup.html` — Email superadmin tidak konsisten
**Sebelum:**
```js
email: 'arif.fairel@gmail.com',   // ❌ berbeda dari db.js dan auth.js
```
**Sesudah:**
```js
email: 'arif.azwar79@gmail.com',  // ✅ konsisten di semua file
```

---

#### 9. `app/dashboard/guru.html` — Path script salah
**Sebelum:**
```html
<script src="../../app/core/db.js"></script>   <!-- ❌ path tidak valid -->
```
**Sesudah:**
```html
<script src="../core/db.js"></script>          <!-- ✅ relatif dari app/dashboard/ -->
```

---

#### 10. `app/dashboard/siswa.html` — `sheetsManager` dipakai tanpa import
**Masalah:** `sheetsManager.fetchUsers()` dipanggil di baris 119, tapi
`sheets-config.js` tidak di-import → ReferenceError saat runtime.

**Fix:** Import `sheets-config.js` ditambahkan:
```html
<script src="../core/sheets-config.js"></script>
```

---

#### 11. `app/core/db.js` — `setupDefaults()` membuat superadmin dengan `pin: null`
**Masalah:** Setiap kali database diinisialisasi tanpa superadmin, satu superadmin
baru dibuat dengan `pin: null`. Ini konflik dengan data dari Google Sheets
(setelah `users.clear()` + `bulkAdd()`), dan selalu menyebabkan login gagal.

**Fix:** Pembuatan superadmin dihapus dari `setupDefaults()`. Superadmin
sepenuhnya dikelola lewat `setup.html` (pertama kali) dan Google Sheets (ongoing).

---

## Cara Deploy

1. Upload isi folder `perpustakaan-fixed/` ke repository GitHub Pages.
2. Buka `https://[username].github.io/[repo]/app/setup.html` untuk setup pertama.
3. Buat PIN superadmin di halaman setup.
4. Login dari `index.html` menggunakan email dan PIN yang sudah dibuat.

## Catatan untuk Login Pertama Kali

| Role | Username | PIN Default |
|------|----------|-------------|
| Superadmin | arif.azwar79@gmail.com | Dibuat di setup.html |
| Pustakawan/Admin | email yang didaftarkan | Dibuat saat tambah user |
| Siswa | NIS siswa | 6 digit terakhir NIS |
| Guru | email yang didaftarkan | Dibuat saat tambah user |

