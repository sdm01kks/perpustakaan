/**
 * Google Drive Configuration
 * SDM01 Perpustakaan - Cloud Sync
 * 
 * ⚠️ PENTING: File ini TIDAK mengandung Client Secret!
 * Client Secret hanya untuk server-side, tidak untuk browser.
 */

const DRIVE_CONFIG = {
    // API Key untuk akses publik (bisa di-commit ke GitHub)
    API_KEY: 'AIzaSyDtp1wSGBVqEuhyxXTYOLzJeYKk6zZZE7Y',
    
    // Client ID untuk OAuth (bisa di-commit ke GitHub)
    CLIENT_ID: '651081925275-ca4lhpcrh71nvpe0jltgqbr9tisaal1j.apps.googleusercontent.com',
    
    // Scopes yang diperlukan
    SCOPES: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
    
    // Nama folder di Google Drive
    FOLDER_NAME: 'SDM01-Perpustakaan',
    
    // ID folder (akan diisi otomatis setelah setup)
    FOLDER_ID: null,
    
    // File database di Drive
    DB_FILE_NAME: 'library-data.json',
    DB_FILE_ID: null,
    
    // Versi aplikasi
    APP_VERSION: '1.0.0'
};

// Status koneksi
let driveConnection = {
    isConnected: false,
    isInitialized: false,
    accessToken: null,
    user: null
};

// Class untuk mengelola Google Drive
class DriveManager {
    constructor() {
        this.config = DRIVE_CONFIG;
        this.gapi = null;
        this.tokenClient = null;
    }

    // Inisialisasi Google API
    async init() {
        try {
            // Load Google API Client
            await this.loadGapi();
            
            // Initialize client
            await new Promise((resolve, reject) => {
                gapi.load('client', async () => {
                    try {
                        await gapi.client.init({
                            apiKey: this.config.API_KEY,
                            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
                        });
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            driveConnection.isInitialized = true;
            console.log('✅ Google Drive API initialized');
            return true;
        } catch (error) {
            console.error('❌ Gagal init Google Drive:', error);
            return false;
        }
    }

    // Load script Google API
    loadGapi() {
        return new Promise((resolve, reject) => {
            if (window.gapi) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // Load OAuth script
    loadGis() {
        return new Promise((resolve, reject) => {
            if (window.google && window.google.accounts) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // Setup OAuth client
    async setupOAuth() {
        await this.loadGis();
        
        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: this.config.CLIENT_ID,
            scope: this.config.SCOPES,
            callback: (tokenResponse) => {
                if (tokenResponse && tokenResponse.access_token) {
                    driveConnection.accessToken = tokenResponse.access_token;
                    driveConnection.isConnected = true;
                    gapi.client.setToken({ access_token: tokenResponse.access_token });
                    console.log('✅ Berhasil login Google Drive');
                    
                    // Trigger event
                    window.dispatchEvent(new CustomEvent('drive-connected', {
                        detail: { user: driveConnection.user }
                    }));
                }
            }
        });
    }

    // Login / Request Access
    async connect() {
        if (!driveConnection.isInitialized) {
            await this.init();
        }
        
        if (!this.tokenClient) {
            await this.setupOAuth();
        }

        return new Promise((resolve, reject) => {
            try {
                this.tokenClient.callback = (tokenResponse) => {
                    if (tokenResponse.error) {
                        reject(tokenResponse.error);
                    } else {
                        driveConnection.accessToken = tokenResponse.access_token;
                        driveConnection.isConnected = true;
                        gapi.client.setToken({ access_token: tokenResponse.access_token });
                        resolve(tokenResponse);
                    }
                };
                
                this.tokenClient.requestAccessToken();
            } catch (error) {
                reject(error);
            }
        });
    }

    // Disconnect
    disconnect() {
        if (driveConnection.accessToken) {
            google.accounts.oauth2.revoke(driveConnection.access_token, () => {
                console.log('✅ Disconnected from Google Drive');
            });
        }
        driveConnection.isConnected = false;
        driveConnection.accessToken = null;
        gapi.client.setToken(null);
    }

    // Cek atau buat folder di Drive
    async ensureFolder() {
        if (!driveConnection.isConnected) {
            throw new Error('Belum terkoneksi ke Google Drive');
        }

        try {
            // Cek apakah folder sudah ada
            const response = await gapi.client.drive.files.list({
                q: `name='${this.config.FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                spaces: 'drive'
            });

            if (response.result.files && response.result.files.length > 0) {
                this.config.FOLDER_ID = response.result.files[0].id;
                console.log('✅ Folder ditemukan:', this.config.FOLDER_ID);
            } else {
                // Buat folder baru
                const folder = await gapi.client.drive.files.create({
                    resource: {
                        name: this.config.FOLDER_NAME,
                        mimeType: 'application/vnd.google-apps.folder'
                    },
                    fields: 'id'
                });
                this.config.FOLDER_ID = folder.result.id;
                console.log('✅ Folder baru dibuat:', this.config.FOLDER_ID);
            }

            return this.config.FOLDER_ID;
        } catch (error) {
            console.error('❌ Gagal setup folder:', error);
            throw error;
        }
    }

    // Simpan data ke Drive
    async saveToDrive(data) {
        await this.ensureFolder();

        const fileContent = JSON.stringify(data, null, 2);
        const blob = new Blob([fileContent], { type: 'application/json' });

        // Cek apakah file sudah ada
        const existingFile = await this.findFile(this.config.DB_FILE_NAME);
        
        if (existingFile) {
            // Update file existing
            await gapi.client.drive.files.update({
                fileId: existingFile.id,
                media: {
                    mimeType: 'application/json',
                    body: fileContent
                }
            });
            console.log('✅ Data di-update di Drive');
        } else {
            // Buat file baru
            const metadata = {
                name: this.config.DB_FILE_NAME,
                parents: [this.config.FOLDER_ID],
                mimeType: 'application/json'
            };

            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', blob);

            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${driveConnection.access_token}`
                },
                body: form
            });

            if (!response.ok) throw new Error('Upload failed');
            console.log('✅ Data baru di-upload ke Drive');
        }

        // Update timestamp terakhir sync
        localStorage.setItem('lastDriveSync', new Date().toISOString());
    }

    // Ambil data dari Drive
    async loadFromDrive() {
        await this.ensureFolder();

        const file = await this.findFile(this.config.DB_FILE_NAME);
        if (!file) {
            console.log('ℹ️ Belum ada data di Drive');
            return null;
        }

        const response = await gapi.client.drive.files.get({
            fileId: file.id,
            alt: 'media'
        });

        return response.result;
    }

    // Cari file di folder
    async findFile(fileName) {
        const response = await gapi.client.drive.files.list({
            q: `name='${fileName}' and '${this.config.FOLDER_ID}' in parents and trashed=false`,
            spaces: 'drive',
            fields: 'files(id, name, modifiedTime)'
        });

        return response.result.files && response.result.files[0];
    }

    // Export data ke Excel di Drive
    async exportToExcel(data, fileName) {
        await this.ensureFolder();

        // Konversi ke CSV sederhana (nanti bisa diganti dengan library Excel)
        let csv = '';
        if (data.length > 0) {
            const headers = Object.keys(data[0]);
            csv = headers.join(',') + '\n';
            data.forEach(row => {
                csv += headers.map(h => {
                    const val = row[h] || '';
                    return `"${String(val).replace(/"/g, '""')}"`;
                }).join(',') + '\n';
            });
        }

        const blob = new Blob([csv], { type: 'text/csv' });
        const metadata = {
            name: fileName,
            parents: [this.config.FOLDER_ID],
            mimeType: 'text/csv'
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);

        await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${driveConnection.access_token}`
            },
            body: form
        });

        console.log('✅ Excel di-export ke Drive:', fileName);
    }

    // Get status koneksi
    getStatus() {
        return {
            ...driveConnection,
            folderId: this.config.FOLDER_ID,
            lastSync: localStorage.getItem('lastDriveSync')
        };
    }
}

// Instance global
const driveManager = new DriveManager();

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DRIVE_CONFIG, DriveManager, driveManager, driveConnection };
}
