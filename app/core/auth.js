/**
 * Authentication Manager
 * SDM01 Perpustakaan - Login System
 * 
 * Sistem login sederhana dengan role-based access
 */

const ROLES = {
    SUPERADMIN: 'superadmin',  // Full access, setup Drive
    ADMIN: 'admin',            // Full access, manage pustakawan
    PUSTAKAWAN: 'pustakawan',  // Input buku, sirkulasi
    GURU: 'guru',              // Pinjam buku, lihat katalog
    SISWA: 'siswa'             // Lihat katalog, status pinjaman
};

const ROLE_PERMISSIONS = {
    [ROLES.SUPERADMIN]: ['*'], // Semua permission
    [ROLES.ADMIN]: ['*'],
    [ROLES.PUSTAKAWAN]: [
        'books.read', 'books.create', 'books.update',
        'members.read', 'members.create', 'members.update',
        'circulation.*',
        'reports.read',
        'settings.read'
    ],
    [ROLES.GURU]: [
        'books.read',
        'members.read.self',
        'circulation.read.self', 'circulation.create.self'
    ],
    [ROLES.SISWA]: [
        'books.read',
        'members.read.self',
        'circulation.read.self'
    ]
};

// Session management
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.sessionKey = 'perpustakaan_session';
    }

    // Inisialisasi - cek session yang ada
    async init() {
        const session = localStorage.getItem(this.sessionKey);
        if (session) {
            try {
                const user = JSON.parse(session);
                // Verify user masih valid di database
                const validUser = await dbManager.db.users.get(user.id);
                if (validUser && validUser.is_active) {
                    this.currentUser = validUser;
                    console.log('✅ Session restored:', validUser.nama);
                    return true;
                }
            } catch (error) {
                console.error('Session invalid');
            }
            localStorage.removeItem(this.sessionKey);
        }
        return false;
    }

    // Login dengan PIN (untuk semua user)
    async loginWithPin(nisOrEmail, pin) {
        try {
            // Cari di tabel users (untuk admin/pustakawan)
            let user = await dbManager.db.users
                .where('email')
                .equals(nisOrEmail)
                .first();

            // Jika tidak ketemu, coba cari di members untuk siswa
            if (!user) {
                const member = await dbManager.db.members
                    .where('nis')
                    .equals(nisOrEmail)
                    .first();
            
                if (member) {
                    // Buat user record untuk siswa jika belum ada
                        user = await dbManager.db.users
                            .where('email')
                            .equals(member.email_ortu || member.nis + '@student.sdm01')
                            .first();
                
                if (!user) {
                    // Auto-create user untuk siswa
                    const userId = await dbManager.db.users.add({
                        email: member.email_ortu || member.nis + '@student.sdm01',
                        nama: member.nama_lengkap,
                        role: 'siswa',
                        pin: member.nis.slice(-6), // Default PIN: 6 digit terakhir NIS
                        is_active: true,
                        createdAt: new Date().toISOString(),
                        last_login: null,
                        member_id: member.id
                    });
                    user = await dbManager.db.users.get(userId);
                }
            }
        }

        if (!user) {
            return { success: false, error: 'Email/NIS tidak ditemukan' };
        }

        if (!user.is_active) {
            return { success: false, error: 'Akun tidak aktif' };
        }

        // Verifikasi PIN
        if (user.pin !== pin) {
            return { success: false, error: 'PIN salah' };
        }

        // Update last login
        await dbManager.db.users.update(user.id, {
            last_login: new Date().toISOString()
        });

        // Set session
        this.currentUser = user;
        localStorage.setItem(this.sessionKey, JSON.stringify(user));

        return { 
            success: true, 
            user: user,
            role: user.role,
            redirect: this.getDefaultRoute(user.role)
        };
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, error: error.message };
    }
}

    // Login dengan Google (untuk superadmin/admin)
    async loginWithGoogle() {
        try {
            // Connect ke Drive (ini akan trigger Google login)
            const connected = await driveManager.connect();
            
            if (!connected) {
                return { success: false, error: 'Gagal koneksi Google' };
            }

            // Ambil info user dari Google
            const googleUser = await this.getGoogleUserInfo();
            
            // Cek apakah email terdaftar
            let user = await dbManager.db.users
                .where('email')
                .equals(googleUser.email)
                .first();

            if (!user) {
                // Auto-register untuk superadmin pertama kali
                if (googleUser.email === 'arif.azwar79@gmail.com') {
                    const id = await dbManager.db.users.add({
                        email: googleUser.email,
                        nama: googleUser.name || 'Superadmin',
                        role: ROLES.SUPERADMIN,
                        pin: null,
                        is_active: true,
                        createdAt: new Date().toISOString(),
                        last_login: new Date().toISOString()
                    });
                    user = await dbManager.db.users.get(id);
                } else {
                    return { success: false, error: 'Email tidak terdaftar' };
                }
            }

            if (!user.is_active) {
                return { success: false, error: 'Akun tidak aktif' };
            }

            // Update last login
            await dbManager.db.users.update(user.id, {
                last_login: new Date().toISOString()
            });

            this.currentUser = user;
            localStorage.setItem(this.sessionKey, JSON.stringify(user));

            return {
                success: true,
                user: user,
                role: user.role,
                redirect: this.getDefaultRoute(user.role)
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Ambil info user dari Google (menggunakan endpoint v3 via fetch)
    async getGoogleUserInfo() {
        try {
            const token = gapi.client.getToken();
            if (!token || !token.access_token) {
                throw new Error('Tidak ada access token');
            }
            const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { 'Authorization': 'Bearer ' + token.access_token }
            });
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }
            const data = await response.json();
            // v3 mengembalikan 'name' dan 'email' — samakan dengan yang dipakai kode lama
            return { email: data.email, name: data.name };
        } catch (error) {
            console.error('Gagal ambil info Google:', error);
            return { email: 'unknown', name: 'Unknown' };
        }
    }

    // Logout
    logout() {
        this.currentUser = null;
        localStorage.removeItem(this.sessionKey);
        
        // Disconnect dari Google juga
        if (driveManager) {
            driveManager.disconnect();
        }
        
        return { success: true };
    }

    // Cek apakah sudah login
    isLoggedIn() {
        return !!this.currentUser;
    }

    // Ambil user saat ini
    getCurrentUser() {
        return this.currentUser;
    }

    // Cek permission
    hasPermission(permission) {
        if (!this.currentUser) return false;
        
        const permissions = ROLE_PERMISSIONS[this.currentUser.role] || [];
        
        // Superadmin/Admin punya semua permission
        if (permissions.includes('*')) return true;
        
        // Cek exact match
        if (permissions.includes(permission)) return true;
        
        // Cek wildcard (e.g., 'circulation.*' match 'circulation.read')
        const parts = permission.split('.');
        for (let i = 0; i < parts.length; i++) {
            const wildcard = parts.slice(0, i).join('.') + '.*';
            if (permissions.includes(wildcard)) return true;
        }
        
        return false;
    }

    // Get default route berdasarkan role
    getDefaultRoute(role) {
        const routes = {
            [ROLES.SUPERADMIN]: '/app/dashboard/admin.html',
            [ROLES.ADMIN]: '/app/dashboard/admin.html',
            [ROLES.PUSTAKAWAN]: '/app/dashboard/pustakawan.html',
            [ROLES.GURU]: '/app/dashboard/guru.html',
            [ROLES.SISWA]: '/app/dashboard/siswa.html'
        };
        return routes[role] || '/app/dashboard/public.html';
    }

    // Setup PIN pertama kali (untuk superadmin)
    async setupPin(userId, pin) {
        try {
            // Validasi PIN (6 digit)
            if (!/^\d{6}$/.test(pin)) {
                return { success: false, error: 'PIN harus 6 digit angka' };
            }

            await dbManager.db.users.update(userId, { pin: pin });
            return { success: true, message: 'PIN berhasil di-setup' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Ganti PIN
    async changePin(oldPin, newPin) {
        if (!this.currentUser) {
            return { success: false, error: 'Belum login' };
        }

        if (this.currentUser.pin !== oldPin) {
            return { success: false, error: 'PIN lama salah' };
        }

        if (!/^\d{6}$/.test(newPin)) {
            return { success: false, error: 'PIN baru harus 6 digit' };
        }

        try {
            await dbManager.db.users.update(this.currentUser.id, { pin: newPin });
            this.currentUser.pin = newPin;
            localStorage.setItem(this.sessionKey, JSON.stringify(this.currentUser));
            return { success: true, message: 'PIN berhasil diubah' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Tambah user baru (khusus admin/superadmin)
    async addUser(userData, createdBy) {
        if (!this.hasPermission('users.create')) {
            return { success: false, error: 'Tidak punya izin' };
        }

        try {
            // Cek email sudah ada
            const existing = await dbManager.db.users
                .where('email')
                .equals(userData.email)
                .first();
            
            if (existing) {
                return { success: false, error: 'Email sudah terdaftar' };
            }

            const newUser = {
                ...userData,
                pin: null, // PIN di-setup saat pertama login
                is_active: true,
                createdAt: new Date().toISOString(),
                createdBy: createdBy,
                last_login: null
            };

            const id = await dbManager.db.users.add(newUser);
            
            // Sync ke Drive
            await dbManager.addToSyncQueue('users', 'create', { ...newUser, id });

            return { success: true, id, user: newUser };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // List users (khusus admin)
    async listUsers(options = {}) {
        if (!this.hasPermission('users.read')) {
            return { success: false, error: 'Tidak punya izin' };
        }

        try {
            let query = dbManager.db.users.orderBy('nama');
            
            if (options.role) {
                query = query.filter(u => u.role === options.role);
            }
            
            if (options.active !== undefined) {
                query = query.filter(u => u.is_active === options.active);
            }

            const users = await query.toArray();
            
            // Hide PIN dari output
            const safeUsers = users.map(u => ({
                ...u,
                pin: u.pin ? '****' : null
            }));

            return { success: true, data: safeUsers };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

// Instance global
const authManager = new AuthManager();

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AuthManager, authManager, ROLES, ROLE_PERMISSIONS };
}
