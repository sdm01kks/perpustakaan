/**
 * Google Drive Configuration - SDM01 Perpustakaan
 *
 * CARA KERJA SINKRONISASI:
 * 1. Superadmin login Google sekali → data disimpan ke Drive → file dijadikan PUBLIK
 * 2. File ID ditampilkan di dashboard → superadmin update DB_FILE_ID di bawah → commit ke GitHub
 * 3. Semua perangkat langsung bisa ambil data tanpa login Google, cukup PIN
 *
 * SETELAH SETUP PERTAMA: isi DB_FILE_ID dengan ID file dari Google Drive
 */

const DRIVE_CONFIG = {
    API_KEY:     'AIzaSyDtp1wSGBVqEuhyxXTYOLzJeYKk6zZZE7Y',
    CLIENT_ID:   '651081925275-ca4lhpcrh71nvpe0jltgqbr9tisaal1j.apps.googleusercontent.com',
    SCOPES:      'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
    FOLDER_NAME: 'SDM01-Perpustakaan',
    DB_FILE_NAME:'library-data.json',

    // ═══════════════════════════════════════════════════════════════════════
    // PENTING: Isi nilai ini dengan File ID dari Google Drive setelah setup!
    // File ID tampil di dashboard Pustakawan setelah login Google pertama kali.
    // Contoh: DB_FILE_ID: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms'
    // ═══════════════════════════════════════════════════════════════════════
    DB_FILE_ID: null,

    APP_VERSION: '1.0.3'
};

const DRIVE_FILE_ID_KEY = 'sdm01_drive_file_id';

let driveConnection = {
    isConnected:   false,
    isInitialized: false,
    accessToken:   null
};

class DriveManager {
    constructor() {
        this.config      = DRIVE_CONFIG;
        this.tokenClient = null;
    }

    // ── Inisialisasi Google API (hanya dibutuhkan saat superadmin sync) ──
    async init() {
        try {
            await this._loadScript('https://apis.google.com/js/api.js', () => window.gapi);
            await new Promise((resolve, reject) => {
                gapi.load('client', async () => {
                    try {
                        await gapi.client.init({
                            apiKey:         this.config.API_KEY,
                            discoveryDocs:  ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
                        });
                        resolve();
                    } catch (e) { reject(e); }
                });
            });
            driveConnection.isInitialized = true;
            console.log('✅ Google Drive API initialized');
            return true;
        } catch (e) {
            console.error('❌ Gagal init Drive:', e);
            return false;
        }
    }

    _loadScript(src, checkFn) {
        return new Promise((resolve, reject) => {
            if (checkFn && checkFn()) { resolve(); return; }
            const s = document.createElement('script');
            s.src = src; s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    async setupOAuth() {
        await this._loadScript('https://accounts.google.com/gsi/client',
            () => window.google && window.google.accounts);
        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: this.config.CLIENT_ID,
            scope:     this.config.SCOPES,
            callback:  () => {}
        });
    }

    async connect() {
        if (!driveConnection.isInitialized) await this.init();
        if (!this.tokenClient) await this.setupOAuth();
        return new Promise((resolve, reject) => {
            this.tokenClient.callback = (resp) => {
                if (resp.error) { reject(new Error(resp.error)); return; }
                driveConnection.accessToken = resp.access_token;
                driveConnection.isConnected = true;
                gapi.client.setToken({ access_token: resp.access_token });
                resolve(resp);
            };
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        });
    }

    disconnect() {
        if (driveConnection.accessToken)
            google.accounts.oauth2.revoke(driveConnection.accessToken, () => {});
        driveConnection.isConnected = false;
        driveConnection.accessToken = null;
        if (window.gapi) gapi.client.setToken(null);
    }

    // ── Ambil file ID yang disimpan (hardcode > localStorage > URL hash) ─
    getFileId() {
        if (this.config.DB_FILE_ID) return this.config.DB_FILE_ID;
        const hash = window.location.hash;
        if (hash.startsWith('#dbid=')) {
            const id = hash.slice(6);
            if (id) { localStorage.setItem(DRIVE_FILE_ID_KEY, id); return id; }
        }
        return localStorage.getItem(DRIVE_FILE_ID_KEY);
    }

    // ── KUNCI: Ambil data publik TANPA login Google ───────────────────────
    // Semua perangkat pakai ini — tidak perlu OAuth sama sekali
    async fetchPublicData(fileId) {
        const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${this.config.API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
    }

    // ── Simpan ke Drive (hanya superadmin, butuh OAuth) ──────────────────
    async saveToDrive(data) {
        if (!driveConnection.isConnected) throw new Error('Belum terhubung ke Google');

        await this._ensureFolder();
        const content  = JSON.stringify(data, null, 2);
        const token    = driveConnection.accessToken;
        const existing = await this._findFile(this.config.DB_FILE_NAME);
        let fileId;

        if (existing) {
            const res = await fetch(
                `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media&fields=id`,
                { method: 'PATCH', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: content }
            );
            if (!res.ok) throw new Error('Update gagal: ' + res.status);
            fileId = (await res.json()).id || existing.id;
        } else {
            const boundary = 'sdm01boundary';
            const meta = JSON.stringify({ name: this.config.DB_FILE_NAME, parents: [this.config.FOLDER_ID], mimeType: 'application/json' });
            const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
            const res = await fetch(
                'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
                { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': `multipart/related; boundary=${boundary}` }, body }
            );
            if (!res.ok) throw new Error('Upload gagal: ' + res.status);
            fileId = (await res.json()).id;
        }

        // Jadikan publik agar semua perangkat bisa baca tanpa login
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'reader', type: 'anyone' })
        });

        // Simpan fileId
        localStorage.setItem(DRIVE_FILE_ID_KEY, fileId);
        localStorage.setItem('lastDriveSync', new Date().toISOString());
        console.log('✅ Data tersimpan ke Drive. File ID:', fileId);
        return fileId;
    }

    async _ensureFolder() {
        const res = await gapi.client.drive.files.list({
            q: `name='${this.config.FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            spaces: 'drive', fields: 'files(id)'
        });
        if (res.result.files && res.result.files.length > 0) {
            this.config.FOLDER_ID = res.result.files[0].id;
        } else {
            const f = await gapi.client.drive.files.create({
                resource: { name: this.config.FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
                fields: 'id'
            });
            this.config.FOLDER_ID = f.result.id;
        }
    }

    async _findFile(name) {
        const res = await gapi.client.drive.files.list({
            q: `name='${name}' and '${this.config.FOLDER_ID}' in parents and trashed=false`,
            spaces: 'drive', fields: 'files(id)'
        });
        return res.result.files && res.result.files[0];
    }

    getStatus() {
        return { ...driveConnection, fileId: this.getFileId(), lastSync: localStorage.getItem('lastDriveSync') };
    }
}

const driveManager = new DriveManager();

if (typeof module !== 'undefined' && module.exports)
    module.exports = { DRIVE_CONFIG, DriveManager, driveManager, driveConnection };
