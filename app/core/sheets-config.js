/**
 * Google Sheets Config - SDM01 Perpustakaan
 *
 * Sheet "Users" adalah sumber kebenaran tunggal untuk data login.
 * Dibaca dengan API Key (tanpa OAuth) → semua perangkat langsung bisa akses.
 * Ditulis dengan OAuth (hanya superadmin saat tambah/edit user).
 *
 * Format sheet (baris 1 = header):
 * id | email | nama | role | pin | is_active
 */

const SHEETS_CONFIG = {
    API_KEY:        'AIzaSyDtp1wSGBVqEuhyxXTYOLzJeYKk6zZZE7Y',
    CLIENT_ID:      '651081925275-ca4lhpcrh71nvpe0jltgqbr9tisaal1j.apps.googleusercontent.com',
    SPREADSHEET_ID: '1Tg_l-ngZ8xhXydxed3xaa4sJhAnAd0QUy6DI9uZaO4o',
    SHEET_NAME:     'Users',
    // Scope tambahan untuk baca/tulis Sheets
    SCOPES: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
    ].join(' ')
};

let sheetsConnection = {
    isConnected:  false,
    accessToken:  null,
    tokenClient:  null
};

class SheetsManager {
    constructor() {
        this.config = SHEETS_CONFIG;
    }

    // ── Baca semua user dari Sheets (hanya API Key, tanpa login) ──────────
    async fetchUsers() {
        const range = encodeURIComponent(`${this.config.SHEET_NAME}!A:F`);
        const url   = `https://sheets.googleapis.com/v4/spreadsheets/${this.config.SPREADSHEET_ID}/values/${range}?key=${this.config.API_KEY}`;

        const res = await fetch(url);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error((err.error && err.error.message) || 'HTTP ' + res.status);
        }

        const json = await res.json();
        const rows = json.values || [];
        if (rows.length < 2) return []; // hanya header atau kosong

        const headers = rows[0].map(h => h.trim().toLowerCase());
        return rows.slice(1).map((row, i) => {
            const obj = {};
            headers.forEach((h, j) => { obj[h] = row[j] !== undefined ? row[j] : ''; });
            return {
                id:        parseInt(obj.id) || (i + 1),
                email:     obj.email     || '',
                nama:      obj.nama      || '',
                role:      obj.role      || 'siswa',
                pin:       obj.pin       || '',
                is_active: obj.is_active === 'TRUE' || obj.is_active === 'true' || obj.is_active === '1' || obj.is_active === true
            };
        }).filter(u => u.email); // skip baris kosong
    }

    // ── Setup OAuth (dibutuhkan untuk menulis ke sheet) ───────────────────
    async _loadGis() {
        if (window.google && window.google.accounts) return;
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://accounts.google.com/gsi/client';
            s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    async connect() {
        await this._loadGis();
        if (!sheetsConnection.tokenClient) {
            sheetsConnection.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: this.config.CLIENT_ID,
                scope:     this.config.SCOPES,
                callback:  () => {}
            });
        }
        return new Promise((resolve, reject) => {
            sheetsConnection.tokenClient.callback = (resp) => {
                if (resp.error) { reject(new Error(resp.error)); return; }
                sheetsConnection.accessToken = resp.access_token;
                sheetsConnection.isConnected = true;
                resolve(resp);
            };
            sheetsConnection.tokenClient.requestAccessToken({ prompt: 'consent' });
        });
    }

    // ── Tulis semua user ke sheet (replace dari baris 2) ─────────────────
    async writeUsers(users) {
        if (!sheetsConnection.isConnected) throw new Error('Belum login Google');

        // Header + data rows
        const values = [
            ['id', 'email', 'nama', 'role', 'pin', 'is_active'],
            ...users.map(u => [u.id, u.email, u.nama, u.role, u.pin || '', u.is_active ? 'TRUE' : 'FALSE'])
        ];

        // Clear dulu, lalu tulis ulang
        const range = `${this.config.SHEET_NAME}!A1:F${values.length + 10}`;
        const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.config.SPREADSHEET_ID}/values/${encodeURIComponent(range)}:clear`;
        await fetch(clearUrl, {
            method:  'POST',
            headers: { 'Authorization': 'Bearer ' + sheetsConnection.accessToken }
        });

        // Tulis data baru
        const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.config.SPREADSHEET_ID}/values/${encodeURIComponent(`${this.config.SHEET_NAME}!A1`)}?valueInputOption=RAW`;
        const res = await fetch(writeUrl, {
            method:  'PUT',
            headers: {
                'Authorization': 'Bearer ' + sheetsConnection.accessToken,
                'Content-Type':  'application/json'
            },
            body: JSON.stringify({ values })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error((err.error && err.error.message) || 'Write gagal: HTTP ' + res.status);
        }

        console.log('✅ Users tersimpan ke Google Sheets:', users.length, 'baris');
        return true;
    }

    // ── Tambah satu user baru ke baris berikutnya ─────────────────────────
    async appendUser(user) {
        if (!sheetsConnection.isConnected) throw new Error('Belum login Google');

        const values = [[user.id, user.email, user.nama, user.role, user.pin || '', user.is_active ? 'TRUE' : 'FALSE']];
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.config.SPREADSHEET_ID}/values/${encodeURIComponent(`${this.config.SHEET_NAME}!A:F`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

        const res = await fetch(url, {
            method:  'POST',
            headers: {
                'Authorization': 'Bearer ' + sheetsConnection.accessToken,
                'Content-Type':  'application/json'
            },
            body: JSON.stringify({ values })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error((err.error && err.error.message) || 'Append gagal: HTTP ' + res.status);
        }

        console.log('✅ User ditambahkan ke Sheets:', user.email);
        return true;
    }

    // ── Update satu baris user (cari berdasarkan email) ───────────────────
    async updateUser(updatedUser) {
        // Fetch semua dulu, update baris yang cocok, tulis ulang
        const users = await this.fetchUsers();
        const idx = users.findIndex(u => u.email === updatedUser.email);
        if (idx === -1) throw new Error('User tidak ditemukan di Sheets');
        users[idx] = { ...users[idx], ...updatedUser };
        await this.writeUsers(users);
        return true;
    }

    isConnected() { return sheetsConnection.isConnected; }
}

const sheetsManager = new SheetsManager();

if (typeof module !== 'undefined' && module.exports)
    module.exports = { SHEETS_CONFIG, SheetsManager, sheetsManager, sheetsConnection };
