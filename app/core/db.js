/**
 * Database Manager - IndexedDB Wrapper
 * SDM01 Perpustakaan - Local Storage
 * 
 * Menggunakan Dexie.js untuk memudahkan penggunaan IndexedDB
 */

// Konfigurasi Database
const DB_CONFIG = {
    name: 'PerpustakaanSDM01',
    version: 1
};

// Schema Tabel
const DB_SCHEMA = {
    // Tabel Buku
    books: '++id, kode_aksesi, judul, pengarang, penerbit, tahun_terbit, kategori_ddc, lokasi_rak, status, createdAt, updatedAt',
    
    // Tabel Anggota
    members: '++id, nis, nama_lengkap, tipe_anggota, kelas, no_hp, email_ortu, status, createdAt, updatedAt',
    
    // Tabel Sirkulasi (Peminjaman/Pengembalian)
    circulation: '++id, book_id, member_id, borrow_date, due_date, return_date, status, denda, createdAt, updatedAt',
    
    // Tabel Users (Login)
    users: '++id, email, nama, role, pin, is_active, createdAt, last_login',
    
    // Tabel Settings
    settings: 'key, value',
    
    // Tabel Queue untuk Sync ke Drive
    syncQueue: '++id, table_name, action, data, timestamp, status'
};

// Inisialisasi Database (akan di-load oleh Dexie dari CDN)
class DatabaseManager {
    constructor() {
        this.db = null;
        this.isReady = false;
    }

    // Inisialisasi database
    async init() {
        try {
            // Cek apakah Dexie tersedia (akan di-load dari CDN)
            if (typeof Dexie === 'undefined') {
                console.warn('Dexie.js belum di-load, menunggu...');
                await this.waitForDexie();
            }

            this.db = new Dexie(DB_CONFIG.name);
            this.db.version(DB_CONFIG.version).stores(DB_SCHEMA);
            
            // Open database
            await this.db.open();
            this.isReady = true;
            
            console.log('✅ Database berhasil diinisialisasi');
            
            // Setup default data jika kosong
            await this.setupDefaults();
            
            return true;
        } catch (error) {
            console.error('❌ Gagal inisialisasi database:', error);
            this.isReady = false;
            return false;
        }
    }

    // Tunggu Dexie.js load dari CDN
    waitForDexie(maxWait = 10000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const check = () => {
                if (typeof Dexie !== 'undefined') {
                    resolve();
                } else if (Date.now() - start > maxWait) {
                    reject(new Error('Timeout menunggu Dexie.js'));
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }

    // Setup data default
    async setupDefaults() {
        // Cek apakah sudah ada settings
        const hasSettings = await this.db.settings.get('initialized');
        if (!hasSettings) {
            // Setup default settings
            await this.db.settings.bulkPut([
                { key: 'initialized', value: true },
                { key: 'school_name', value: 'SD Muhammadiyah 01 Kukusan' },
                { key: 'max_books_student', value: 2 },
                { key: 'max_books_teacher', value: 5 },
                { key: 'loan_days_student', value: 7 },
                { key: 'loan_days_teacher', value: 14 },
                { key: 'denda_per_day', value: 1000 },
                { key: 'app_version', value: '1.2.0' }
            ]);
            console.log('✅ Settings default dibuat');
        }
        // CATATAN: Superadmin dibuat melalui setup.html, bukan di sini.
        // Ini mencegah konflik dengan data yang sudah di-sync dari Google Sheets.
    }

    // ==================== CRUD BUKU ====================

    // Tambah buku baru
    async addBook(bookData) {
        try {
            const book = {
                ...bookData,
                kode_aksesi: bookData.kode_aksesi || this.generateBookCode(bookData.kategori_ddc),
                status: bookData.status || 'tersedia',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const id = await this.db.books.add(book);
            
            // Tambah ke queue untuk sync ke Drive
            await this.addToSyncQueue('books', 'create', { ...book, id });
            
            console.log('✅ Buku ditambahkan:', book.judul);
            return { success: true, id, data: book };
        } catch (error) {
            console.error('❌ Gagal tambah buku:', error);
            return { success: false, error: error.message };
        }
    }

    // Ambil semua buku
    async getAllBooks(options = {}) {
        try {
            let query = this.db.books.orderBy('createdAt').reverse();
            
            // Filter berdasarkan status
            if (options.status) {
                query = query.filter(book => book.status === options.status);
            }
            
            // Filter berdasarkan kategori
            if (options.kategori) {
                query = query.filter(book => book.kategori_ddc === options.kategori);
            }
            
            // Pencarian
            if (options.search) {
                const searchLower = options.search.toLowerCase();
                query = query.filter(book => 
                    book.judul.toLowerCase().includes(searchLower) ||
                    book.pengarang.toLowerCase().includes(searchLower) ||
                    book.kode_aksesi.toLowerCase().includes(searchLower)
                );
            }

            const books = await query.toArray();
            return { success: true, data: books, count: books.length };
        } catch (error) {
            console.error('❌ Gagal ambil data buku:', error);
            return { success: false, error: error.message };
        }
    }

    // Ambil buku by ID
    async getBookById(id) {
        try {
            const book = await this.db.books.get(id);
            return { success: !!book, data: book };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Update buku
    async updateBook(id, updates) {
        try {
            const updated = {
                ...updates,
                updatedAt: new Date().toISOString()
            };
            
            await this.db.books.update(id, updated);
            
            // Tambah ke sync queue
            const book = await this.db.books.get(id);
            await this.addToSyncQueue('books', 'update', book);
            
            return { success: true, data: book };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Hapus buku
    async deleteBook(id) {
        try {
            const book = await this.db.books.get(id);
            await this.db.books.delete(id);
            
            // Tambah ke sync queue
            await this.addToSyncQueue('books', 'delete', { id, kode_aksesi: book?.kode_aksesi });
            
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ==================== CRUD ANGGOTA ====================

    // Tambah anggota
    async addMember(memberData) {
        try {
            const member = {
                ...memberData,
                status: memberData.status || 'aktif',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const id = await this.db.members.add(member);
            await this.addToSyncQueue('members', 'create', { ...member, id });
            
            return { success: true, id, data: member };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Ambil semua anggota
    async getAllMembers(options = {}) {
        try {
            let query = this.db.members.orderBy('nama_lengkap');
            
            if (options.tipe) {
                query = query.filter(m => m.tipe_anggota === options.tipe);
            }
            
            if (options.kelas) {
                query = query.filter(m => m.kelas === options.kelas);
            }

            if (options.search) {
                const searchLower = options.search.toLowerCase();
                query = query.filter(m => 
                    m.nama_lengkap.toLowerCase().includes(searchLower) ||
                    m.nis.toLowerCase().includes(searchLower)
                );
            }

            const members = await query.toArray();
            return { success: true, data: members };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ==================== SIRKULASI ====================

    // Pinjam buku
    async borrowBook(bookId, memberId, loanDays = 7) {
        try {
            const book = await this.db.books.get(bookId);
            if (!book || book.status !== 'tersedia') {
                return { success: false, error: 'Buku tidak tersedia' };
            }

            const today = new Date();
            const dueDate = new Date();
            dueDate.setDate(today.getDate() + loanDays);

            const circulation = {
                book_id: bookId,
                member_id: memberId,
                borrow_date: today.toISOString(),
                due_date: dueDate.toISOString(),
                return_date: null,
                status: 'dipinjam',
                denda: 0,
                createdAt: today.toISOString(),
                updatedAt: today.toISOString()
            };

            const id = await this.db.circulation.add(circulation);
            
            // Update status buku
            await this.db.books.update(bookId, { 
                status: 'dipinjam',
                updatedAt: new Date().toISOString()
            });

            await this.addToSyncQueue('circulation', 'create', { ...circulation, id });

            return { 
                success: true, 
                id, 
                data: circulation,
                message: `Buku berhasil dipinjam. Jatuh tempo: ${dueDate.toLocaleDateString('id-ID')}`
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Kembalikan buku
    async returnBook(circulationId, condition = 'baik') {
        try {
            const circ = await this.db.circulation.get(circulationId);
            if (!circ || circ.status !== 'dipinjam') {
                return { success: false, error: 'Data peminjaman tidak valid' };
            }

            const today = new Date();
            const dueDate = new Date(circ.due_date);
            
            // Hitung denda (Rp 1000/hari setelah grace period 1 hari)
            let denda = 0;
            const diffTime = today - dueDate;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays > 1) { // Grace period 1 hari
                denda = (diffDays - 1) * 1000;
                denda = Math.min(denda, 10000); // Maksimal Rp 10.000
            }

            // Update sirkulasi
            await this.db.circulation.update(circulationId, {
                return_date: today.toISOString(),
                status: 'dikembalikan',
                denda: denda,
                condition: condition,
                updatedAt: today.toISOString()
            });

            // Update status buku
            const newStatus = condition === 'rusak' ? 'rusak' : 
                             condition === 'hilang' ? 'hilang' : 'tersedia';
            
            await this.db.books.update(circ.book_id, {
                status: newStatus,
                updatedAt: today.toISOString()
            });

            await this.addToSyncQueue('circulation', 'update', 
                await this.db.circulation.get(circulationId)
            );

            return {
                success: true,
                denda: denda,
                message: denda > 0 
                    ? `Buku dikembalikan. Denda: Rp ${denda.toLocaleString('id-ID')}`
                    : 'Buku dikembalikan tepat waktu. Tidak ada denda.'
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ==================== SYNC QUEUE ====================

    // Tambah ke antrian sync
    async addToSyncQueue(table, action, data) {
        try {
            await this.db.syncQueue.add({
                table_name: table,
                action: action, // create, update, delete
                data: JSON.stringify(data),
                timestamp: new Date().toISOString(),
                status: 'pending'
            });
        } catch (error) {
            console.error('Gagal tambah ke sync queue:', error);
        }
    }

    // Ambil data yang perlu di-sync
    async getPendingSync() {
        return await this.db.syncQueue
            .where('status')
            .equals('pending')
            .toArray();
    }

    // Tandai sudah di-sync
    async markSynced(id) {
        await this.db.syncQueue.update(id, { status: 'synced' });
    }

    // ==================== UTILITAS ====================

    // Generate kode aksesi otomatis
    generateBookCode(kategori) {
        const prefix = kategori || '000';
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const year = new Date().getFullYear();
        return `${prefix}-${random}-${year}`;
    }

    // Statistik dashboard
    async getStatistics() {
        try {
            const totalBooks = await this.db.books.count();
            const availableBooks = await this.db.books.where('status').equals('tersedia').count();
            const totalMembers = await this.db.members.count();
            const activeLoans = await this.db.circulation.where('status').equals('dipinjam').count();
            
            // Yang jatuh tempo hari ini atau besok
            const today = new Date().toISOString().split('T')[0];
            const dueSoon = await this.db.circulation
                .where('status')
                .equals('dipinjam')
                .filter(c => c.due_date <= today)
                .count();

            return {
                success: true,
                data: {
                    total_books: totalBooks,
                    available_books: availableBooks,
                    borrowed_books: totalBooks - availableBooks,
                    total_members: totalMembers,
                    active_loans: activeLoans,
                    due_today: dueSoon
                }
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Export semua data (untuk backup)
    async exportAllData() {
        try {
            const data = {
                books: await this.db.books.toArray(),
                members: await this.db.members.toArray(),
                circulation: await this.db.circulation.toArray(),
                users: await this.db.users.toArray(),
                settings: await this.db.settings.toArray(),
                exported_at: new Date().toISOString()
            };
            return { success: true, data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Import data (untuk restore)
    async importAllData(backupData) {
        try {
            // Clear existing data
            await this.db.books.clear();
            await this.db.members.clear();
            await this.db.circulation.clear();
            await this.db.users.clear();
            await this.db.settings.clear();

            // Import new data
            if (backupData.books && backupData.books.length > 0)
                await this.db.books.bulkAdd(backupData.books);
            if (backupData.members && backupData.members.length > 0)
                await this.db.members.bulkAdd(backupData.members);
            if (backupData.circulation && backupData.circulation.length > 0)
                await this.db.circulation.bulkAdd(backupData.circulation);
            if (backupData.users && backupData.users.length > 0)
                await this.db.users.bulkAdd(backupData.users);
            if (backupData.settings && backupData.settings.length > 0)
                await this.db.settings.bulkPut(backupData.settings);

            return { success: true, message: 'Data berhasil di-import' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

// Buat instance global
const dbManager = new DatabaseManager();

// Export untuk digunakan di file lain
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DatabaseManager, dbManager };
}
