/**
 * Google Drive Configuration
 * SDM01 Perpustakaan - Cloud Sync
 *
 * Arsitektur sinkronisasi:
 * - Superadmin menyimpan data ke Drive → file dijadikan PUBLIK → fileId disimpan
 * - Perangkat lain membaca file publik dengan API Key saja (tanpa OAuth)
 * - URL diberi hash #dbid=FILEID agar bisa dibagikan ke semua staf
 */

const DRIVE_CONFIG = {
    API_KEY:     'AIzaSyDtp1wSGBVqEuhyxXTYOLzJeYKk6zZZE7Y',
    CLIENT_ID:   '651081925275-ca4lhpcrh71nvpe0jltgqbr9tisaal1j.apps.googleusercontent.com',
    SCOPES:      'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
    FOLDER_NAME: 'SDM01-Perpustakaan',
    DB_FILE_NAME:'library-data.json',
    FOLDER_ID:   null,
    APP_VERSION: '1.0.1'
};

// Key localStorage untuk menyimpan file ID
const DRIVE_FILE_ID_KEY = 'sdm01_drive_file_id';

let driveConnection = {
    isConnected:   false,
    isInitialized: false,
    accessToken:   null,
    user:          null
};

class DriveManager {
    constructor() {
        this.config    = DRIVE_CONFIG;
        this.tokenClient = null;
    }

    // ── Inisialisasi Google API ────────────────────────────────────────────
    async init() {
        try {
            await this.loadGapi();
            await new Promise((resolve, reject) => {
                gapi.load('client', async () => {
                    try {
                        await gapi.client.init({
                            apiKey: this.config.API_KEY,
                            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
                        });
                        resolve();
                    } catch (e) { reject(e); }
                });
            });
            driveConnection.isInitialized = true;
            console.log('✅ Google Drive API initialized');
            return true;
        } catch (e) {
            console.error('❌ Gagal init Google Drive:', e);
            return false;
        }
    }

    loadGapi() {
        return new Promise((resolve, reject) => {
            if (window.gapi) { resolve(); return; }
            const s = document.createElement('script');
            s.src = 'https://apis.google.com/js/api.js';
            s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    loadGis() {
        return new Promise((resolve, reject) => {
            if (window.google && window.google.accounts) { resolve(); return; }
            const s = document.createElement('script');
            s.src = 'https://accounts.google.com/gsi/client';
            s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    async setupOAuth() {
        await this.loadGis();
        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: this.config.CLIENT_ID,
            scope:     this.config.SCOPES,
            callback:  () => {}
        });
    }

    async connect() {
        if (!driveConnection.isInitialized) await this.init();
        if (!this.tokenClient)              await this.setupOAuth();

        return new Promise((resolve, reject) => {
            this.tokenClient.callback = (resp) => {
                if (resp.error) { reject(resp.error); return; }
                driveConnection.accessToken = resp.access_token;
                driveConnection.isConnected = true;
                gapi.client.setToken({ access_token: resp.access_token });
                resolve(resp);
            };
            // prompt:'consent' agar scope baru benar-benar diberikan
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        });
    }

    disconnect() {
        if (driveConnection.accessToken)
            google.accounts.oauth2.revoke(driveConnection.accessToken, () => {});
        driveConnection.isConnected  = false;
        driveConnection.accessToken  = null;
        gapi.client.setToken(null);
    }

    // ── Folder ────────────────────────────────────────────────────────────
    async ensureFolder() {
        if (!driveConnection.isConnected)
            throw new Error('Belum terkoneksi ke Google Drive');

        const res = await gapi.client.drive.files.list({
            q: `name='${this.config.FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            spaces: 'drive', fields: 'files(id)'
        });

        if (res.result.files && res.result.files.length > 0) {
            this.config.FOLDER_ID = res.result.files[0].id;
        } else {
            const folder = await gapi.client.drive.files.create({
                resource: { name: this.config.FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
                fields: 'id'
            });
            this.config.FOLDER_ID = folder.result.id;
        }
        return this.config.FOLDER_ID;
    }

    // ── Simpan ke Drive + jadikan publik + simpan fileId ──────────────────
    async saveToDrive(data) {
        await this.ensureFolder();

        const fileContent = JSON.stringify(data, null, 2);
        const accessToken = driveConnection.accessToken;

        // Cek apakah file sudah ada
        const existing = await this.findFile(this.config.DB_FILE_NAME);
        let fileId;

        if (existing) {
            // Update isi file yang sudah ada
            const res = await fetch(
                `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media&fields=id`,
                {
                    method:  'PATCH',
                    headers: {
                        'Authorization': 'Bearer ' + accessToken,
                        'Content-Type':  'application/json'
                    },
                    body: fileContent
                }
            );
            if (!res.ok) throw new Error('Update Drive gagal: ' + res.status);
            const json = await res.json();
            fileId = json.id || existing.id;
            console.log('✅ Data di-update di Drive');
        } else {
            // Buat file baru dengan multipart upload
            const metadata = JSON.stringify({
                name:    this.config.DB_FILE_NAME,
                parents: [this.config.FOLDER_ID],
                mimeType: 'application/json'
            });
            const boundary = 'boundary_sdm01';
            const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${fileContent}\r\n--${boundary}--`;

            const res = await fetch(
                'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
                {
                    method:  'POST',
                    headers: {
                        'Authorization': 'Bearer ' + accessToken,
                        'Content-Type':  `multipart/related; boundary=${boundary}`
                    },
                    body
                }
            );
            if (!res.ok) throw new Error('Upload Drive gagal: ' + res.status);
            const json = await res.json();
            fileId = json.id;
            console.log('✅ File baru dibuat di Drive:', fileId);
        }

        // Jadikan file publik (siapa pun bisa baca tanpa login)
        await this.makeFilePublic(fileId, accessToken);

        // Simpan fileId ke localStorage dan URL hash
        this.storeFileId(fileId);

        localStorage.setItem('lastDriveSync', new Date().toISOString());
        return fileId;
    }

    // Beri permission 'anyone can read' pada file
    async makeFilePublic(fileId, accessToken) {
        try {
            await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
                method:  'POST',
                headers: {
                    'Authorization': 'Bearer ' + accessToken,
                    'Content-Type':  'application/json'
                },
                body: JSON.stringify({ role: 'reader', type: 'anyone' })
            });
            console.log('✅ File dijadikan publik:', fileId);
        } catch (e) {
            console.warn('⚠️ Gagal jadikan publik (tidak fatal):', e.message);
        }
    }

    // Simpan fileId ke localStorage & URL hash agar bisa dibagikan
    storeFileId(fileId) {
        localStorage.setItem(DRIVE_FILE_ID_KEY, fileId);
        // Update URL hash tanpa reload halaman
        if (window.location.hash !== '#dbid=' + fileId) {
            history.replaceState(null, '', window.location.pathname + '#dbid=' + fileId);
        }
        console.log('✅ File ID disimpan:', fileId);
    }

    // ── Ambil data TANPA OAuth (baca file publik pakai API Key) ───────────
    // Ini yang dipakai perangkat baru — tidak perlu popup Google sama sekali
    async fetchPublicData(fileId) {
        const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${this.config.API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Gagal ambil data publik: HTTP ' + res.status);
        return await res.json();
    }

    // Ambil fileId yang tersimpan (dari URL hash atau localStorage)
    getSavedFileId() {
        // Prioritas: URL hash
        const hash = window.location.hash;
        if (hash.startsWith('#dbid=')) {
            const id = hash.slice(6);
            if (id) {
                localStorage.setItem(DRIVE_FILE_ID_KEY, id); // simpan juga ke localStorage
                return id;
            }
        }
        // Fallback: localStorage
        return localStorage.getItem(DRIVE_FILE_ID_KEY);
    }

    // ── Ambil data dari Drive (pakai OAuth — untuk superadmin) ────────────
    async loadFromDrive() {
        await this.ensureFolder();
        const file = await this.findFile(this.config.DB_FILE_NAME);
        if (!file) return null;
        const res = await gapi.client.drive.files.get({ fileId: file.id, alt: 'media' });
        return res.result;
    }

    async findFile(fileName) {
        const res = await gapi.client.drive.files.list({
            q: `name='${fileName}' and '${this.config.FOLDER_ID}' in parents and trashed=false`,
            spaces: 'drive',
            fields: 'files(id, name, modifiedTime)'
        });
        return res.result.files && res.result.files[0];
    }

    getStatus() {
        return {
            ...driveConnection,
            folderId:  this.config.FOLDER_ID,
            fileId:    this.getSavedFileId(),
            lastSync:  localStorage.getItem('lastDriveSync')
        };
    }
}

const driveManager = new DriveManager();

if (typeof module !== 'undefined' && module.exports)
    module.exports = { DRIVE_CONFIG, DriveManager, driveManager, driveConnection };
