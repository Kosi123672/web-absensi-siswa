   // --- CONFIG ---
        const ADMIN_PASSWORD = "asandi"; 
        
        // --- STATE ---
        let attendanceData = [];
        let pendingTabId = null;
        let idToDelete = null;
        const STORAGE_KEY = 'absensi_data_v1';
        const SETTINGS_KEY = 'absensi_settings_v1';

        // --- INIT ---
        window.addEventListener('DOMContentLoaded', () => {
            loadData();
            updateClock();
            setInterval(updateClock, 1000);
            renderDashboard();
        });

        function updateClock() {
            const now = new Date();
            const dateOptions = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
            document.getElementById('current-date').textContent = now.toLocaleDateString('id-ID', dateOptions);
            document.getElementById('real-time-clock').textContent = now.toLocaleTimeString('id-ID', { hour12: false });
        }

        // --- AUTH ---
        function attemptAccess(tabId) {
            if (sessionStorage.getItem('asandi_admin_auth') === 'true') {
                switchTab(tabId);
            } else {
                pendingTabId = tabId;
                document.getElementById('login-modal').classList.add('open');
                document.getElementById('admin-pass-input').value = '';
                document.getElementById('admin-pass-input').focus();
            }
        }

        function verifyLogin() {
            const input = document.getElementById('admin-pass-input').value;
            if (input === ADMIN_PASSWORD) {
                sessionStorage.setItem('asandi_admin_auth', 'true');
                showToast('Login Admin Berhasil!', 'success');
                closeLoginModal();
                if (pendingTabId) { switchTab(pendingTabId); pendingTabId = null; }
            } else {
                showToast('Password Salah!', 'error');
            }
        }

        function closeLoginModal() { document.getElementById('login-modal').classList.remove('open'); pendingTabId = null; }
        document.getElementById('admin-pass-input').addEventListener('keypress', e => { if (e.key === 'Enter') verifyLogin(); });

        // --- NAVIGATION ---
        function switchTab(tabId) {
            const links = document.querySelectorAll('.nav-link');
            links.forEach(l => l.classList.remove('active'));
            if(tabId === 'dashboard') links[0].classList.add('active');
            if(tabId === 'absensi') links[1].classList.add('active');
            if(tabId === 'data') links[2].classList.add('active');
            if(tabId === 'settings') links[3].classList.add('active');

            document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');

            const titles = { 'dashboard': 'Dashboard Asandi', 'absensi': 'Isi Absensi', 'data': 'Data Absensi', 'settings': 'Pengaturan DB' };
            document.getElementById('page-title').textContent = titles[tabId];
            if(window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('active');
            if(tabId === 'data') renderTable();
        }

        function toggleSidebar() { document.getElementById('sidebar').classList.toggle('active'); }

        // --- DATA LOGIC ---
        function loadData() {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) attendanceData = JSON.parse(stored);
            const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
            if(settings.url) document.getElementById('gas-url').value = settings.url;
            if(settings.sheet) document.getElementById('sheet-name').value = settings.sheet;
        }

        function saveLocal() {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(attendanceData));
            renderDashboard();
        }

        function toggleReasonField() {
            const status = document.getElementById('input-status').value;
            const reasonGroup = document.getElementById('reason-group');
            if (['Izin', 'Sakit', 'Terlambat'].includes(status)) reasonGroup.style.display = 'block';
            else { reasonGroup.style.display = 'none'; document.getElementById('input-reason').value = ''; }
        }

        async function handleAttendanceSubmit(e) {
            e.preventDefault();
            const name = document.getElementById('input-name').value;
            const kelas = document.getElementById('input-class').value;
            const status = document.getElementById('input-status').value;
            const reason = document.getElementById('input-reason').value;

            const now = new Date();
            const newRecord = {
                id: Date.now(),
                date: now.toISOString().split('T')[0],
                time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
                name, class: kelas, status, reason
            };

            attendanceData.unshift(newRecord);
            saveLocal();
            showToast('Data tersimpan!', 'success');
            e.target.reset();
            toggleReasonField();

            await syncToSheet('create', newRecord);
        }

        // --- DELETE FEATURE ---
        function confirmDelete(id) {
            idToDelete = id;
            document.getElementById('delete-modal').classList.add('open');
        }

        function closeDeleteModal() {
            document.getElementById('delete-modal').classList.remove('open');
            idToDelete = null;
        }

        async function executeDelete() {
            if (!idToDelete) return;

            attendanceData = attendanceData.filter(item => item.id !== idToDelete);
            saveLocal();

            await syncToSheet('delete', { id: idToDelete });

            showToast('Data berhasil dihapus!', 'success');
            closeDeleteModal();
        }

        async function syncToSheet(action, payloadData) {
            const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
            if (!settings.url) return;

            try {
                const finalPayload = {
                    action: action,
                    sheetName: settings.sheet || 'DataAbsensi',
                    data: payloadData
                };

                await fetch(settings.url, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(finalPayload)
                });
                
                if (action === 'delete') showToast('Data dihapus dari Sheet', 'success');
                else showToast('Sinkronisasi Sheet Sukses', 'success');
            } catch (err) { 
                console.error(err);
                showToast('Gagal koneksi ke Sheet', 'error'); 
            }
        }

        // --- RENDERING ---
        function renderDashboard() {
            document.getElementById('count-hadir').innerText = attendanceData.filter(d => d.status === 'Hadir').length;
            document.getElementById('count-terlambat').innerText = attendanceData.filter(d => d.status === 'Terlambat').length;
            document.getElementById('count-tidak-hadir').innerText = attendanceData.filter(d => ['Izin', 'Sakit'].includes(d.status)).length;
            document.getElementById('total-siswa').innerText = attendanceData.length;

            const tbody = document.getElementById('recent-activity-body');
            tbody.innerHTML = '';
            attendanceData.slice(0, 5).forEach(item => {
                tbody.innerHTML += `<tr><td>${item.time} <small style="color:#888">${item.date}</small></td><td><strong>${item.name}</strong></td><td>${item.class}</td><td><span class="badge ${getBadgeClass(item.status)}">${item.status}</span></td></tr>`;
            });
        }

        function renderTable() {
            const tbody = document.getElementById('full-data-body');
            tbody.innerHTML = '';
            attendanceData.forEach(item => {
                tbody.innerHTML += `<tr>
                    <td>${item.date}</td><td>${item.time}</td><td>${item.name}</td><td>${item.class}</td><td><span class="badge ${getBadgeClass(item.status)}">${item.status}</span></td>
                    <td style="text-align: center;">
                        <button class="btn-delete" onclick="confirmDelete(${item.id})" title="Hapus Data">
                            <i class="ph ph-trash"></i>
                        </button>
                    </td>
                </tr>`;
            });
        }

        function getBadgeClass(s) {
            return s === 'Hadir' ? 'badge-hadir' : (s === 'Terlambat' ? 'badge-terlambat' : (s === 'Izin' ? 'badge-izin' : 'badge-sakit'));
        }

        function exportData() {
            let csv = "data:text/csv;charset=utf-8,Tanggal,Waktu,Nama,Kelas,Status,Keterangan\n";
            attendanceData.forEach(r => csv += `${r.date},${r.time},"${r.name}",${r.class},${r.status},"${r.reason}"\n`);
            const link = document.createElement("a");
            link.href = encodeURI(csv);
            link.download = "absensi_asandi.csv";
            link.click();
        }

        function saveSettings() {
            const url = document.getElementById('gas-url').value.trim();
            const sheet = document.getElementById('sheet-name').value.trim();
            localStorage.setItem(SETTINGS_KEY, JSON.stringify({ url, sheet }));
            showToast('Pengaturan disimpan!', 'success');
        }

        function showToast(msg, type = 'info') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            let icon = type === 'success' ? 'check-circle' : (type === 'error' ? 'warning-circle' : 'info');
            toast.innerHTML = `<i class="ph ph-${icon}" style="font-size:1.5rem; color:${type==='success'?'#22c55e':(type==='error'?'#ef4444':'#4361ee')}"></i><span>${msg}</span>`;
            container.appendChild(toast);
            setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
        }