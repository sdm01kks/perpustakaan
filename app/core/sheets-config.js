/**
 * Google Sheets Config - SDM01 Perpustakaan
 *
 * Autentikasi:
 * - Baca data: API Key saja (tanpa login)
 * - Tulis data: OAuth token, disimpan di sessionStorage agar tidak
 *   meminta login ulang setiap navigasi dalam satu sesi browser
 */

const SHEETS_CONFIG = {
    API_KEY:        'AIzaSyDtp1wSGBVqEuhyxXTYOLzJeYKk6zZZE7Y',
    CLIENT_ID:      '651081925275-ca4lhpcrh71nvpe0jltgqbr9tisaal1j.apps.googleusercontent.com',
    SPREADSHEET_ID: '1Tg_l-ngZ8xhXydxed3xaa4sJhAnAd0QUy6DI9uZaO4o',
    SHEET_NAME:     'Users',
    SCOPES: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
    ].join(' ')
};

// Key untuk menyimpan token di sessionStorage
// sessionStorage bertahan selama tab browser terbuka, hilang saat tab ditutup
const TOKEN_KEY     = 'sdm01_sheets_token';
const TOKEN_EXP_KEY = 'sdm01_sheets_token_exp';

let sheetsConnection = {
    isConnected:  false,
    accessToken:  null,
    tokenClient:  null
};

class SheetsManager {
    constructor() {
        this.config = SHEETS_CONFIG;
        // Coba restore token dari sessionStorage saat pertama kali dimuat
        this._restoreToken();
    }

    // ── Restore token dari sessionStorage (tanpa popup) ───────────────────
    _restoreToken() {
        try {
            const token = sessionStorage.getItem(TOKEN_KEY);
            const exp   = parseInt(sessionStorage.getItem(TOKEN_EXP_KEY) || '0');
            if (token && Date.now() < exp) {
                sheetsConnection.accessToken = token;
                sheetsConnection.isConnected  = true;
                console.log('✅ Sheets token dipulihkan dari sesi');
            } else if (token) {
                // Token ada tapi sudah kadaluarsa — hapus
                sessionStorage.removeItem(TOKEN_KEY);
                sessionStorage.removeItem(TOKEN_EXP_KEY);
            }
        } catch (e) { /* sessionStorage tidak tersedia */ }
    }

    // ── Simpan token ke sessionStorage ───────────────────────────────────
    _saveToken(accessToken, expiresInSeconds = 3500) {
        sheetsConnection.accessToken = accessToken;
        sheetsConnection.isConnected  = true;
        try {
            sessionStorage.setItem(TOKEN_KEY,     accessToken);
            // Token Google biasanya berlaku 1 jam (3600 detik)
            // Simpan dengan sedikit margin agar tidak pakai token hampir kadaluarsa
            sessionStorage.setItem(TOKEN_EXP_KEY, String(Date.now() + expiresInSeconds * 1000));
        } catch (e) { /* silent */ }
    }

    // ── Load GIS script ───────────────────────────────────────────────────
    async _loadGis() {
        if (window.google && window.google.accounts) return;
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://accounts.google.com/gsi/client';
            s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    // ── Setup OAuth token client ──────────────────────────────────────────
    async _setupTokenClient() {
        await this._loadGis();
        if (!sheetsConnection.tokenClient) {
            sheetsConnection.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: this.config.CLIENT_ID,
                scope:     this.config.SCOPES,
                callback:  () => {}
            });
        }
    }

    // ── Connect: coba silent dulu, baru popup jika perlu ─────────────────
    async connect() {
        // Jika token masih valid, tidak perlu apa-apa
        if (this.isConnected()) return;

        await this._setupTokenClient();

        return new Promise((resolve, reject) => {
            sheetsConnection.tokenClient.callback = (resp) => {
                if (resp.error) {
                    // 'immediate_failed' artinya perlu popup — jangan dianggap error fatal
                    if (resp.error === 'immediate_failed' || resp.error === 'user_logged_out') {
                        // Coba lagi dengan popup
                        this._connectWithPopup().then(resolve).catch(reject);
                    } else {
                        reject(new Error(resp.error));
                    }
                    return;
                }
                this._saveToken(resp.access_token);
                resolve(resp);
            };
            // Coba tanpa prompt dulu (silent) — hanya berhasil jika user sudah pernah authorize
            sheetsConnection.tokenClient.requestAccessToken({ prompt: '' });
        });
    }

    // Fallback: minta popup eksplisit
    _connectWithPopup() {
        return new Promise((resolve, reject) => {
            sheetsConnection.tokenClient.callback = (resp) => {
                if (resp.error) { reject(new Error(resp.error)); return; }
                this._saveToken(resp.access_token);
                resolve(resp);
            };
            sheetsConnection.tokenClient.requestAccessToken({ prompt: 'select_account' });
        });
    }

    isConnected() {
        // Cek ulang dari sessionStorage jika state di memori false
        if (!sheetsConnection.isConnected) this._restoreToken();
        return sheetsConnection.isConnected;
    }

    // ── Baca semua user (API Key, tanpa login) ────────────────────────────
    async fetchUsers() {
        const range = encodeURIComponent(`${this.config.SHEET_NAME}!A:F`);
        const url   = `https://sheets.googleapis.com/v4/spreadsheets/${this.config.SPREADSHEET_ID}/values/${range}?key=${this.config.API_KEY}`;

        const res  = await fetch(url);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error((err.error && err.error.message) || 'HTTP ' + res.status);
        }

        const json = await res.json();
        const rows = json.values || [];
        if (rows.length < 2) return [];

        const headers = rows[0].map(h => h.trim().toLowerCase());
        return rows.slice(1).map((row, i) => {
            const obj = {};
            headers.forEach((h, j) => { obj[h] = row[j] !== undefined ? String(row[j]) : ''; });
            return {
                id:        parseInt(obj.id) || (i + 1),
                email:     obj.email     || '',
                nama:      obj.nama      || '',
                role:      obj.role      || 'siswa',
                pin:       obj.pin       || '',
                is_active: obj.is_active === 'TRUE' || obj.is_active === 'true' || obj.is_active === '1'
            };
        }).filter(u => u.email);
    }

    // ── Helper: pastikan sudah connect ───────────────────────────────────
    async _ensureConnected() {
        if (!this.isConnected()) await this.connect();
    }

    // ── Tulis ulang semua user ke sheet ──────────────────────────────────
    async writeUsers(users) {
        await this._ensureConnected();

        const values = [
            ['id', 'email', 'nama', 'role', 'pin', 'is_active'],
            ...users.map(u => [
                u.id, u.email, u.nama, u.role,
                u.pin || '',
                u.is_active ? 'TRUE' : 'FALSE'
            ])
        ];

        // Clear range lama
        const range     = `${this.config.SHEET_NAME}!A1:F${values.length + 20}`;
        const clearUrl  = `https://sheets.googleapis.com/v4/spreadsheets/${this.config.SPREADSHEET_ID}/values/${encodeURIComponent(range)}:clear`;
        const clearRes  = await fetch(clearUrl, {
            method:  'POST',
            headers: { 'Authorization': 'Bearer ' + sheetsConnection.accessToken }
        });
        if (!clearRes.ok) await this._handleAuthError(clearRes);

        // Tulis data baru
        const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.config.SPREADSHEET_ID}/values/${encodeURIComponent(this.config.SHEET_NAME + '!A1')}?valueInputOption=RAW`;
        const writeRes = await fetch(writeUrl, {
            method:  'PUT',
            headers: {
                'Authorization': 'Bearer ' + sheetsConnection.accessToken,
                'Content-Type':  'application/json'
            },
            body: JSON.stringify({ values })
        });

        if (!writeRes.ok) {
            await this._handleAuthError(writeRes);
            // Coba sekali lagi setelah re-auth
            const retry = await fetch(writeUrl, {
                method:  'PUT',
                headers: {
                    'Authorization': 'Bearer ' + sheetsConnection.accessToken,
                    'Content-Type':  'application/json'
                },
                body: JSON.stringify({ values })
            });
            if (!retry.ok) throw new Error('Write gagal setelah re-auth: HTTP ' + retry.status);
        }

        console.log('✅ Users tersimpan ke Sheets:', users.length, 'baris');
        return true;
    }

    // ── Tambah satu baris user baru ───────────────────────────────────────
    async appendUser(user) {
        await this._ensureConnected();

        const values = [[
            user.id, user.email, user.nama, user.role,
            user.pin || '',
            user.is_active ? 'TRUE' : 'FALSE'
        ]];

        const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.config.SPREADSHEET_ID}/values/${encodeURIComponent(this.config.SHEET_NAME + '!A:F')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
        const res = await fetch(url, {
            method:  'POST',
            headers: {
                'Authorization': 'Bearer ' + sheetsConnection.accessToken,
                'Content-Type':  'application/json'
            },
            body: JSON.stringify({ values })
        });

        if (!res.ok) {
            await this._handleAuthError(res);
            // Retry
            const retry = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + sheetsConnection.accessToken,
                    'Content-Type':  'application/json'
                },
                body: JSON.stringify({ values })
            });
            if (!retry.ok) throw new Error('Append gagal: HTTP ' + retry.status);
        }

        console.log('✅ User ditambahkan:', user.email);
        return true;
    }

    // ── Update satu user berdasarkan email ────────────────────────────────
    async updateUser(updatedUser) {
        const users = await this.fetchUsers();
        const idx   = users.findIndex(u => u.email === updatedUser.email);
        if (idx === -1) throw new Error('User tidak ditemukan');
        users[idx] = { ...users[idx], ...updatedUser };
        await this.writeUsers(users);
        return true;
    }

    // ── Handle token kadaluarsa: hapus cache, minta ulang ────────────────
    async _handleAuthError(res) {
        if (res.status === 401) {
            console.warn('Token kadaluarsa, meminta ulang...');
            // Hapus token lama
            sheetsConnection.isConnected = false;
            sheetsConnection.accessToken = null;
            try {
                sessionStorage.removeItem(TOKEN_KEY);
                sessionStorage.removeItem(TOKEN_EXP_KEY);
            } catch (e) {}
            // Minta token baru (akan coba silent dulu)
            await this.connect();
        }
    }
}

const sheetsManager = new SheetsManager();

if (typeof module !== 'undefined' && module.exports)
    module.exports = { SHEETS_CONFIG, SheetsManager, sheetsManager, sheetsConnection };
