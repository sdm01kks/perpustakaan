/**
 * QR Code Generator & Printer
 * SDM01 Perpustakaan
 */

const QRGenerator = {
    // Generate QR Code untuk Buku
    generateBookQR(bookData) {
        const qrData = JSON.stringify({
            type: 'BOOK',
            id: bookData.id,
            kode: bookData.kode_aksesi,
            judul: bookData.judul
        });
        
        return this.createQRCode(qrData, `QR-${bookData.kode_aksesi}`);
    },

    // Generate QR Code untuk Anggota
    generateMemberQR(memberData) {
        const qrData = JSON.stringify({
            type: 'MEMBER',
            id: memberData.id,
            nis: memberData.nis,
            nama: memberData.nama_lengkap,
            kelas: memberData.kelas
        });
        
        return this.createQRCode(qrData, `QR-${memberData.nis}`);
    },

    // Create QR menggunakan QRCode.js library
    createQRCode(data, filename) {
        const container = document.createElement('div');
        container.style.display = 'none';
        document.body.appendChild(container);

        const qr = new QRCode(container, {
            text: data,
            width: 128,
            height: 128,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });

        // Return canvas untuk printing/download
        setTimeout(() => {
            const canvas = container.querySelector('canvas');
            return {
                canvas: canvas,
                dataUrl: canvas.toDataURL('image/png'),
                filename: filename
            };
        }, 100);
    },

    // Print Label Buku (A4, 24 label per halaman)
    printBookLabels(books) {
        const printWindow = window.open('', '_blank');
        
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Cetak Label Buku</title>
                <style>
                    @page { size: A4; margin: 1cm; }
                    body { 
                        font-family: Arial, sans-serif; 
                        margin: 0; 
                        padding: 0.5cm;
                    }
                    .label-sheet {
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        gap: 0.5cm;
                    }
                    .book-label {
                        border: 1px dashed #999;
                        padding: 0.4cm;
                        text-align: center;
                        page-break-inside: avoid;
                        height: 3.5cm;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                    }
                    .book-label .qr {
                        width: 1.8cm;
                        height: 1.8cm;
                        margin-bottom: 0.2cm;
                    }
                    .book-label .kode {
                        font-size: 8pt;
                        font-weight: bold;
                        margin-bottom: 0.1cm;
                    }
                    .book-label .judul {
                        font-size: 6pt;
                        color: #666;
                        max-width: 100%;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }
                    @media print {
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="no-print" style="margin-bottom: 20px; padding: 10px; background: #f0f0f0; text-align: center;">
                    <button onclick="window.print()" style="padding: 10px 20px; font-size: 14px; cursor: pointer;">
                        🖨️ Cetak Label
                    </button>
                    <p style="margin: 5px 0; font-size: 12px;">Atau tekan Ctrl+P</p>
                </div>
                
                <div class="label-sheet">
                    ${books.map(book => this.createLabelHTML(book)).join('')}
                </div>
            </body>
            </html>
        `;
        
        printWindow.document.write(html);
        printWindow.document.close();
    },

    createLabelHTML(book) {
        // Generate QR data URL (simplified - in real use, generate actual QR)
        const qrPlaceholder = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(book.kode_aksesi)}`;
        
        return `
            <div class="book-label">
                <img src="${qrPlaceholder}" class="qr" alt="QR">
                <div class="kode">${book.kode_aksesi}</div>
                <div class="judul" title="${book.judul}">${book.judul.substring(0, 20)}${book.judul.length > 20 ? '...' : ''}</div>
            </div>
        `;
    },

    // Print Kartu Anggota
    printMemberCard(member) {
        const printWindow = window.open('', '_blank');
        
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Kartu Anggota - ${member.nama_lengkap}</title>
                <style>
                    @page { size: 85.6mm 54mm; margin: 0; }
                    body { 
                        font-family: Arial, sans-serif; 
                        margin: 0;
                        padding: 0;
                    }
                    .card {
                        width: 85.6mm;
                        height: 54mm;
                        background: linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%);
                        color: white;
                        padding: 8mm;
                        box-sizing: border-box;
                        display: flex;
                        flex-direction: column;
                        justify-content: space-between;
                    }
                    .card-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .school-name {
                        font-size: 10pt;
                        font-weight: bold;
                    }
                    .card-type {
                        font-size: 8pt;
                        background: rgba(255,255,255,0.2);
                        padding: 2px 8px;
                        border-radius: 10px;
                    }
                    .card-body {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .member-info {
                        flex: 1;
                    }
                    .member-name {
                        font-size: 12pt;
                        font-weight: bold;
                        margin-bottom: 2mm;
                    }
                    .member-detail {
                        font-size: 9pt;
                        opacity: 0.9;
                    }
                    .qr-section {
                        text-align: center;
                    }
                    .qr-section img {
                        width: 20mm;
                        height: 20mm;
                        background: white;
                        padding: 2mm;
                        border-radius: 3mm;
                    }
                    .qr-text {
                        font-size: 7pt;
                        margin-top: 2mm;
                    }
                    .card-footer {
                        font-size: 7pt;
                        text-align: center;
                        opacity: 0.8;
                    }
                    @media print {
                        .no-print { display: none; }
                        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    }
                </style>
            </head>
            <body>
                <div class="no-print" style="margin: 20px; text-align: center;">
                    <button onclick="window.print()" style="padding: 10px 20px; font-size: 14px;">
                        🖨️ Cetak Kartu
                    </button>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <div class="school-name">SD MUHAMMADIYAH 01 KUKUSAN</div>
                        <div class="card-type">KARTU ANGGOTA</div>
                    </div>
                    
                    <div class="card-body">
                        <div class="member-info">
                            <div class="member-name">${member.nama_lengkap}</div>
                            <div class="member-detail">NIS: ${member.nis}</div>
                            <div class="member-detail">Kelas: ${member.kelas}</div>
                        </div>
                        <div class="qr-section">
                            <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(member.nis)}" alt="QR">
                            <div class="qr-text">Scan untuk pinjam</div>
                        </div>
                    </div>
                    
                    <div class="card-footer">
                        Berlaku selama menjadi siswa aktif • Kehilangan kartu harus lapor pustakawan
                    </div>
                </div>
            </body>
            </html>
        `;
        
        printWindow.document.write(html);
        printWindow.document.close();
    },

    // Scan QR (menggunakan camera)
    async scanQR() {
        return new Promise((resolve, reject) => {
            // Buat modal untuk scan
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.8); z-index: 9999; display: flex;
                flex-direction: column; align-items: center; justify-content: center;
            `;
            
            modal.innerHTML = `
                <div style="background: white; padding: 20px; border-radius: 10px; text-align: center; max-width: 400px;">
                    <h3 style="margin-bottom: 20px;">📷 Scan QR Code</h3>
                    <video id="qr-video" style="width: 300px; height: 300px; background: #333; border-radius: 10px;"></video>
                    <p style="margin-top: 10px; color: #666; font-size: 14px;">Arahkan kamera ke QR Code</p>
                    <button onclick="this.closest('.scan-modal').remove()" style="margin-top: 20px; padding: 10px 20px; background: #ef4444; color: white; border: none; border-radius: 5px; cursor: pointer;">Batal</button>
                </div>
            `;
            modal.className = 'scan-modal';
            document.body.appendChild(modal);
            
            // Simplified - in real implementation, use jsQR library
            // For now, fallback to manual input
            setTimeout(() => {
                modal.remove();
                const manualCode = prompt('Masukkan kode manual (atau install aplikasi QR scanner):');
                if (manualCode) resolve(manualCode);
                else reject('Cancelled');
            }, 500);
        });
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { QRGenerator };
}
