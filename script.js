// 1. Initialize Supabase from Vercel runtime config
let _supabase = null;
let supabaseReadyPromise = null;

function showSupabaseConfigError(message) {
    console.error(message);
    alert(message);
}

async function getSupabaseConfig() {
    try {
        const res = await fetch('/api/config', { cache: 'no-store' });
        if (!res.ok) return null;
        return await res.json();
    } catch (_) {
        return null;
    }
}

async function ensureSupabaseClient() {
    if (_supabase) return _supabase;

    if (!supabaseReadyPromise) {
        supabaseReadyPromise = (async () => {
            const runtimeConfig = await getSupabaseConfig();
            const supabaseUrl = runtimeConfig?.supabaseUrl || window.PYXIS_SUPABASE_URL;
            const supabaseKey = runtimeConfig?.supabaseAnonKey || window.PYXIS_SUPABASE_ANON_KEY;

            if (!supabaseUrl || !supabaseKey) {
                throw new Error('Supabase is not configured. Set Vercel environment variables SUPABASE_URL and SUPABASE_ANON_KEY, then redeploy.');
            }

            _supabase = supabase.createClient(supabaseUrl, supabaseKey);
            return _supabase;
        })();
    }

    return supabaseReadyPromise;
}

// 2. Global data variables
let inventory = [];
let categories = [];

const app = {
    async checkSession() {
        try {
            await ensureSupabaseClient();
        } catch (err) {
            showSupabaseConfigError(err.message || 'Supabase initialization failed.');
            return;
        }

        const isLoggedIn = localStorage.getItem('pyxis_logged_in');
        if (isLoggedIn === 'true') {
            this.showAppInterface();
            this.init();
        }
    },

    async init() {
        try {
            await ensureSupabaseClient();

            const { data: invData, error: invErr } = await _supabase.from('inventory').select('*').order('name');
            const { data: catData, error: catErr } = await _supabase.from('categories').select('*').order('name');
            
            if (invErr || catErr) throw new Error("Database connection failed");

            inventory = invData || [];
            categories = catData || [];

            this.updateBadge();
            
            // Start Realtime Listener
            this.subscribeToLogs();

            const titleElement = document.getElementById('view-title');
            let currentTab = titleElement ? titleElement.innerText.toLowerCase().replace(/\s+/g, '-') : 'dashboard';
            
            if (['medical-supplies', 'inventory-list', 'inventory-control'].includes(currentTab)) {
                currentTab = 'inventory';
            }

            ui.render(currentTab || 'dashboard');
            
            console.log("Data Refreshed:", inventory);
        } catch (err) {
            console.error("Fetch error:", err);
        }
    },

    subscribeToLogs() {
        _supabase
            .channel('realtime-logs')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'logs' }, (payload) => {
                const titleElement = document.getElementById('view-title');
                if (titleElement && titleElement.innerText.includes('REPORTS')) {
                    ui.loadAuditLogs();
                }
            })
            .subscribe();
    },

    showAppInterface() {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-interface').classList.remove('hidden');
    },

    async login() {
        // 1. Get values from the input fields
        const userField = document.getElementById('username');
        const passField = document.getElementById('password'); 
        
        const inputUser = userField.value.trim().toLowerCase();
        const inputPass = passField ? passField.value.trim() : "";

        // 2. Define Authorized Credentials
        const AUTH_USER = "admin";
        const AUTH_PASS = "pyxis2026";

        // 3. Strict Verification
        if (inputUser === AUTH_USER && inputPass === AUTH_PASS) {
            localStorage.setItem('pyxis_logged_in', 'true');
            
            // Clear fields for security
            userField.value = "";
            if(passField) passField.value = "";
            
            this.showAppInterface();
            await this.init(); 
        } else {
            alert("ACCESS DENIED: Invalid Username or Password.");
            if(passField) {
                passField.value = "";
                passField.focus();
            }
        }
    },

    logout() {
        localStorage.removeItem('pyxis_logged_in');
        window.location.reload();
    },

    async logTransaction(itemName, action, qty, status) {
        try {
            await _supabase.from('logs').insert([{ 
                item_name: itemName, 
                action: action, 
                qty_change: qty, 
                status: status,
                created_at: new Date().toISOString()
            }]);
        } catch (err) {
            console.error("Logging failed:", err);
        }
    },

    async clearAuditLogs() {
        if(confirm("Are you sure you want to permanently delete ALL transaction history from the cloud?")) {
            const { error } = await _supabase.from('logs').delete().neq('item_name', 'placeholder_force_delete'); 
            
            if(!error) {
                await this.init();
                ui.render('reports');
            } else {
                alert("Clear Logs Failed: " + error.message);
            }
        }
    },

    async saveMed(n, sn, mg, c, q, e, unit_type, target) {
        const { error } = await _supabase
            .from('inventory')
            .insert([{ 
                name: n, 
                subname: sn,
                mg: mg, 
                cat: c, 
                qty: parseInt(q), 
                exp: e,
                unit_type: unit_type,
                target: target 
            }]);
            
        if(!error) {
            await this.logTransaction(n, 'Added to Inventory', q, 'Success');
            await this.init();
            ui.render('inventory');
        } else {
            alert("Save Failed: " + error.message);
        }
    },

    async deleteItem(id) {
        const itemToDelete = inventory.find(m => m.id === id);
        if (!itemToDelete) return;

        if(confirm(`Delete "${itemToDelete.name}" permanently? This will be recorded in the audit logs.`)) {
            const { error } = await _supabase.from('inventory').delete().eq('id', id);
            
            if(!error) {
                await this.logTransaction(itemToDelete.name, 'REMOVED', itemToDelete.qty, 'Data Deleted');
                await this.init();
            } else {
                alert("Delete Failed: " + error.message);
            }
        }
    },

    async updateQty(id, newQty) {
        const { error } = await _supabase
            .from('inventory')
            .update({ qty: parseInt(newQty) })
            .eq('id', id);
            
        if(error) {
            alert("Cloud Update Failed: " + error.message);
            return false;
        }
        
        await this.init(); 
        return true;
    },

    async addCategory() {
        const input = document.getElementById('new-category-name');
        const name = input.value.trim();
        if (!name) return alert("Please enter a category name");

        const { error } = await _supabase.from('categories').insert([{ name: name }]);
        if (!error) {
            input.value = '';
            await this.init();
            ui.render('inventory');
        } else {
            alert("Failed to add category: " + error.message);
        }
    },

    async deleteCategory(id, name) {
        const normalizedName = (name || '').toString().trim().toLowerCase();
        const isUsed = inventory.some(m => ((m.cat || '').toString().trim().toLowerCase()) === normalizedName);
        if (isUsed) return alert(`Cannot delete "${name}". Items are still assigned to it.`);

        if(confirm(`Delete category "${name}"?`)) {
            const { error } = await _supabase.from('categories').delete().eq('id', id);
            if(!error) {
                await this.init();
                ui.render('inventory');
            } else {
                alert("Failed to delete category: " + error.message);
            }
        }
    },

    updateBadge() {
        const badge = document.getElementById('alert-badge');
        if(badge) {
            const today = new Date();
            const criticalItems = inventory.filter(m => {
                const isLow = (parseInt(m.qty) || 0) < 10;
                let isExpiring = false;
                if(m.exp) {
                    const diff = Math.ceil((new Date(m.exp) - today) / (1000 * 60 * 60 * 24));
                    isExpiring = diff <= 30;
                }
                return isLow || isExpiring;
            });
            badge.innerText = criticalItems.length;
            badge.style.background = criticalItems.length > 0 ? "#ef4444" : "var(--accent-blue)";
        }
    }
};

const ui = {
    toggleSidebar: function() {
        const sidebar = document.getElementById('main-sidebar');
        if (sidebar) {
            sidebar.classList.toggle('closed');
        }
    },

    getExpiryStatus(dateStr) {
        if (!dateStr) return { isCritical: false, style: '' };
        const diffDays = Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 30) return { isCritical: true, style: 'color: #ef4444; font-weight: 800;' };
        return { isCritical: false, style: '' };
    },

    filterInventory() {
        const query = document.getElementById('search-bar')?.value.toLowerCase() || "";
        const typeFilter = document.getElementById('filter-unit-type')?.value || "";
        const targetFilter = document.getElementById('filter-target')?.value || "";

        const rows = document.querySelectorAll('#inventory-table-body tr');
        rows.forEach(row => {
            const text = row.innerText.toLowerCase();
            const matchesSearch = text.includes(query);
            const matchesType = typeFilter === "" || row.dataset.unit === typeFilter;
            const matchesTarget = targetFilter === "" || row.dataset.target === targetFilter;
            
            row.style.display = (matchesSearch && matchesType && matchesTarget) ? "" : "none";
        });
    },

    view(tab) {
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        const target = document.getElementById(`tab-${tab}`);
        if(target) target.classList.add('active');
        
        const titleElement = document.getElementById('view-title');
        if(titleElement) {
            titleElement.innerText = tab === 'inventory' ? 'INVENTORY CONTROL' : tab.toUpperCase().replace('-', ' ');
        }
        this.render(tab);
    },

    toggleTypeFields() {
        const type = document.getElementById('item_type').value;
        const medFields = document.getElementById('medicine-only-fields');
        if (medFields) {
            medFields.style.display = (type === 'Medicine') ? 'block' : 'none';
        }
    },

    async render(tab) {
        const root = document.getElementById('render-area');
        if(!root) return;

        if(tab === 'dashboard') {
            const totalStock = inventory.reduce((a,b) => a + (parseInt(b.qty) || 0), 0);
            const lowItems = inventory.filter(m => (parseInt(m.qty) || 0) < 10).length;
            const expiringSoon = inventory.filter(m => {
                if(!m.exp) return false;
                const diff = Math.ceil((new Date(m.exp) - new Date()) / (1000 * 60 * 60 * 24));
                return diff <= 30 && diff >= 0;
            }).length;

            root.innerHTML = `
                <div class="stats-row">
                    <div class="stat-card">
                        <div class="icon-circle bg-blue"><i class="fa-solid fa-pills"></i></div>
                        <div class="stat-data"><h3>${inventory.length}</h3><p>Total Items</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="icon-circle bg-green"><i class="fa-solid fa-boxes-stacked"></i></div>
                        <div class="stat-data"><h3>${totalStock}</h3><p>Total Stocks</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="icon-circle bg-red" style="${(lowItems > 0 || expiringSoon > 0) ? 'animation: pulse 2s infinite;' : ''}">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                        </div>
                        <div class="stat-data"><h3 style="color:var(--danger)">${lowItems + expiringSoon}</h3><p>Critical Alerts</p></div>
                    </div>
                </div>
                <div class="table-card" style="margin-top: 30px; padding: 25px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                         <h3 style="margin: 0; letter-spacing: 1px; font-weight: 800;">USAGE ANALYTICS</h3>
                         <div style="font-size: 0.8rem; font-weight: 700;">
                            <span style="color: #6366f1; margin-right: 15px;">● MEDICINES</span>
                            <span style="color: #0ea5e9;">● SUPPLIES</span>
                         </div>
                    </div>
                    <div style="position: relative; height: 250px; width: 100%;">
                        <canvas id="analyticsChart"></canvas>
                    </div>
                </div>`;
            
            setTimeout(() => this.initDashboardAnalytics(), 100);
        }

        if(tab === 'inventory') {
            root.innerHTML = `
                <div style="display: flex; gap: 30px; align-items: start;">
                    <div style="flex: 1; min-width: 0;">
                        <div class="table-card">
                            <div style="padding: 20px; border-bottom: 1px solid var(--border); display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; align-items: center;">
                                <div class="search-wrapper" style="margin: 0; width: 40%;">
                                    <i class="fa-solid fa-magnifying-glass"></i>
                                    <input type="text" id="search-bar" placeholder="Search item or subname..." onkeyup="ui.filterInventory()">
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    <select id="filter-unit-type" onchange="ui.filterInventory()" style="padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); font-weight: 600;">
                                        <option value="">All Types</option>
                                        <option value="Syrup">Syrup</option>
                                        <option value="Tablet">Tablet</option>
                                        <option value="Capsule">Capsule</option>
                                        <option value="Piece">Piece</option>
                                        <option value="Box">Box</option>
                                        <option value="Pair">Pair</option>
                                    </select>
                                    <select id="filter-target" onchange="ui.filterInventory()" style="padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); font-weight: 600;">
                                        <option value="">All Targets</option>
                                        <option value="Adult">Adult</option>
                                        <option value="Kids">Kids</option>
                                        <option value="General">General</option>
                                    </select>
                                    <button onclick="window.print()" class="no-print" style="background: var(--nav-dark); color: white; border: none; padding: 10px 15px; border-radius: 12px; font-weight: 700; cursor: pointer;">
                                        <i class="fa-solid fa-print"></i>
                                    </button>
                                </div>
                            </div>
                            <table class="modern-table">
                                <thead>
                                    <tr><th>Item Details</th><th>Classification</th><th>Category</th><th>Stocks</th><th>Expiry</th><th style="text-align:right" class="no-print">Actions</th></tr>
                                </thead>
                                <tbody id="inventory-table-body">
                                    ${inventory.map(m => this.createRow(m)).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div style="width: 380px; display: flex; flex-direction: column; gap: 30px; flex-shrink: 0;" class="no-print">
                        <div class="form-card" style="padding: 30px;">
                            <h3 style="margin-bottom: 20px; font-size: 1.1rem; color: var(--text-muted);">CATEGORIES</h3>
                            <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                                <input type="text" id="new-category-name" placeholder="Add new..." 
                                    style="flex: 1; padding: 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-light); outline: none;">
                                <button class="icon-btn" onclick="app.addCategory()" style="background: var(--accent-blue); color: white; width: 45px; height: 45px; border-radius: 10px;">
                                    <i class="fa-solid fa-plus"></i>
                                </button>
                            </div>
                            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                ${categories.map(c => `
                                    <div style="background: #f1f5f9; padding: 6px 12px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                                        ${c.name} <i class="fa-solid fa-xmark" style="cursor: pointer; opacity: 0.5;" onclick='app.deleteCategory(${JSON.stringify(c.id)}, ${JSON.stringify(c.name)})'></i>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <div class="form-card" style="padding: 30px;">
                            <h3 style="margin-bottom: 20px; font-size: 1.1rem; color: var(--text-muted);">REGISTER ITEM</h3>
                            <div style="display: flex; flex-direction: column; gap: 15px;">
                                <div class="input-field">
                                    <label>Classification</label>
                                    <select id="item_type" onchange="ui.toggleTypeFields()" class="custom-select" style="width:100%; padding:10px; border-radius:10px; background:#f1f5f9; border:none; font-weight:700;">
                                        <option value="Medicine">Medicine (Tablets, Syrup, etc)</option>
                                        <option value="Supply">Medical Supply (Gloves, Mask, etc)</option>
                                    </select>
                                </div>
                                <div class="input-field"><label>Item / Brand Name</label><input id="n" type="text" placeholder="e.g. Biogesic"></div>
                                <div id="medicine-only-fields">
                                    <div class="input-field"><label>Subname / Generic</label><input id="sn" type="text" placeholder="e.g. Paracetamol"></div>
                                    <div class="input-field"><label>Strength/Specs</label><input id="mg" type="text" placeholder="e.g. 500mg"></div>
                                </div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                    <div class="input-field">
                                        <label>Unit Type</label>
                                        <select id="unit_type" class="custom-select" style="width:100%; padding:10px; border-radius:10px; background:#f1f5f9; border:none;">
                                            <option value="Tablet">Tablet</option><option value="Syrup">Syrup</option>
                                            <option value="Capsule">Capsule</option><option value="Piece">Piece</option>
                                            <option value="Box">Box</option><option value="Pair">Pair</option>
                                        </select>
                                    </div>
                                    <div class="input-field">
                                        <label>Target</label>
                                        <select id="target_audience" class="custom-select" style="width:100%; padding:10px; border-radius:10px; background:#f1f5f9; border:none;">
                                            <option value="Adult">Adult</option><option value="Kids">Kids</option><option value="General">General</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="input-field">
                                    <label>Category</label>
                                    <select id="c" style="width: 100%; padding: 14px; border-radius: 12px; background: #f1f5f9; border: none; font-weight: 600;">
                                        <option value="">Select Category</option>
                                        ${categories.map(cat => `<option value="${cat.name}">${cat.name}</option>`).join('')}
                                    </select>
                                </div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                    <div class="input-field"><label>Quantity</label><input id="q" type="number" placeholder="0"></div>
                                    <div class="input-field"><label>Expiration</label><input id="e" type="date"></div>
                                </div>
                                <button onclick="ui.handleSave()" style="margin-top: 10px; background: var(--accent-blue); color: white; border: none; padding: 16px; border-radius: 14px; font-weight: 800; cursor: pointer;">Save to Cloud</button>
                            </div>
                        </div>
                    </div>
                </div>`;
        }

        if(tab === 'reports') {
            root.innerHTML = `
                <div class="no-print" style="margin-bottom: 25px; display: flex; align-items: center; justify-content: space-between;">
                    <h2 style="font-weight: 800;">Transaction Audit</h2>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="app.clearAuditLogs()" class="btn-submit" style="background-color: var(--danger); width: auto; padding: 10px 20px; margin-top: 0;">
                            <i class="fa-solid fa-trash-can"></i> Clear History
                        </button>
                        <button onclick="window.print()" class="nav-link active" style="border: none; padding: 10px 20px; margin: 0;">
                            <i class="fa-solid fa-print"></i> Export PDF
                        </button>
                    </div>
                </div>
                <div class="table-card">
                    <table class="modern-table">
                        <thead>
                            <tr><th>Date & Time</th><th>Item Name</th><th>Action</th><th>Qty Change</th><th>Status</th></tr>
                        </thead>
                        <tbody id="audit-table-body">
                            <tr><td colspan="5" style="text-align:center; padding: 40px;">Fetching logs...</td></tr>
                        </tbody>
                    </table>
                </div>`;
            this.loadAuditLogs();
        }
    },

    async initDashboardAnalytics() {
        const { data: logs, error } = await _supabase.from('logs').select('created_at, qty_change, item_name').order('created_at', { ascending: true });
        if (error || !logs || logs.length === 0) return;

        const dailyData = {};
        logs.forEach(log => {
            const date = new Date(log.created_at).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
            if (!dailyData[date]) dailyData[date] = { med: 0, sup: 0 };
            
            const item = inventory.find(i => i.name === log.item_name);
            const isSupply = item && ['Piece', 'Box', 'Pair'].includes(item.unit_type);
            
            if (isSupply) dailyData[date].sup += Math.abs(log.qty_change);
            else dailyData[date].med += Math.abs(log.qty_change);
        });

        const labels = Object.keys(dailyData).slice(-7);
        const ctx = document.getElementById('analyticsChart')?.getContext('2d');
        if(!ctx) return;

        if (window.pyxisChart) window.pyxisChart.destroy();
        window.pyxisChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { 
                        label: 'Medicines', 
                        data: labels.map(d => dailyData[d].med), 
                        borderColor: '#6366f1', 
                        backgroundColor: '#6366f1',
                        borderWidth: 3,
                        tension: 0.4,
                        pointRadius: 4,
                        fill: false 
                    },
                    { 
                        label: 'Supplies', 
                        data: labels.map(d => dailyData[d].sup), 
                        borderColor: '#0ea5e9', 
                        backgroundColor: '#0ea5e9',
                        borderWidth: 3,
                        tension: 0.4,
                        pointRadius: 4,
                        fill: false 
                    }
                ]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { legend: { display: false } },
                scales: { 
                    y: { 
                        beginAtZero: true,
                        grid: { color: '#f0f0f0', drawBorder: false }
                    }, 
                    x: { grid: { display: false } } 
                }
            }
        });
    },

    async loadAuditLogs() {
        const tbody = document.getElementById('audit-table-body');
        const { data, error } = await _supabase.from('logs').select('*').order('created_at', { ascending: false }).limit(50);
        if (error || !data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 40px; color: var(--text-muted);">No transaction history found.</td></tr>`;
            return;
        }
        
        tbody.innerHTML = data.map(log => {
            const dateObj = new Date(log.created_at);
            const actionColor = log.action === 'REMOVED' ? 'var(--danger)' : 'var(--accent-blue)';
            const statusLabel = log.action === 'REMOVED' ? '● Data Deleted' : '● Completed';
            const statusColor = log.action === 'REMOVED' ? '#ef4444' : '#22c55e';

            return `
                <tr>
                    <td><span style="font-weight:700;">${dateObj.toLocaleDateString()}</span><br><small style="color:var(--text-muted)">${dateObj.toLocaleTimeString()}</small></td>
                    <td><strong>${log.item_name}</strong></td>
                    <td><span style="text-transform: uppercase; font-size: 0.75rem; font-weight: 800; color: ${actionColor};">${log.action || 'Dispensed'}</span></td>
                    <td style="color:${log.qty_change < 0 ? 'var(--danger)' : 'var(--success)'}; font-weight:bold;">${log.qty_change > 0 ? '+' : ''}${log.qty_change}</td>
                    <td><span style="color:${statusColor}; font-weight:700;">${log.status || statusLabel}</span></td>
                </tr>`;
        }).join('');
    },

    createRow(m) {
        const expStatus = this.getExpiryStatus(m.exp);
        const isSupply = ['Piece', 'Box', 'Pair'].includes(m.unit_type);
        const badgeColor = isSupply ? '#0ea5e9' : '#6366f1';
        const badgeText = isSupply ? 'SUPPLY' : 'MEDICINE';

        return `
            <tr class="${(m.qty < 10 || expStatus.isCritical) ? 'critical-row' : ''}" data-unit="${m.unit_type}" data-target="${m.target}">
                <td>
                    <span style="display:block; font-weight:700; font-size: 1rem;">${m.name}</span>
                    <small style="color:var(--accent-blue); font-weight:600; text-transform:uppercase;">${m.subname || ''}</small> 
                    <small style="font-size:0.8rem; font-weight: 600; color:var(--text-muted);">${m.mg || ''}</small>
                </td>
                <td>
                    <span style="background:${badgeColor}20; color:${badgeColor}; padding:4px 8px; border-radius:6px; font-size:0.7rem; font-weight:800;">${badgeText}</span><br>
                    <small style="color:#64748b; font-weight:700;">${m.unit_type} (${m.target})</small>
                </td>
                <td><span style="background:var(--bg-light); padding:5px 10px; border-radius:6px; font-size:0.75rem; font-weight:700; color: var(--text-muted);">${m.cat}</span></td>
                <td><span class="stock-indicator ${m.qty < 10 ? 'critical' : 'stable'}" style="padding: 6px 12px; border-radius: 8px; font-weight: 800;">${m.qty}</span></td>
                <td><span style="${expStatus.style}">${m.exp || '--'}</span></td>
                <td style="text-align:right" class="no-print">
                    <button class="icon-btn" onclick="ui.dispense('${m.id}', ${m.qty}, '${m.name.replace(/'/g, "\\'")}')"><i class="fa-solid fa-minus-circle"></i></button>
                    <button class="icon-btn" style="color:var(--danger); margin-left:15px;" onclick="app.deleteItem('${m.id}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`;
    },

    handleSave() {
        const type = document.getElementById('item_type').value;
        const n = document.getElementById('n').value;
        const sn = (type === 'Medicine') ? document.getElementById('sn').value : "";
        const mg = (type === 'Medicine') ? document.getElementById('mg').value : "";
        const c = document.getElementById('c').value;
        const q = document.getElementById('q').value;
        const e = document.getElementById('e').value;
        const ut = document.getElementById('unit_type').value;
        const tg = document.getElementById('target_audience').value;
        
        if(n && q && c) app.saveMed(n, sn, mg, c, q, e, ut, tg);
        else alert("Fill required fields.");
    },

    async dispense(id, currentQty, name) {
        const v = prompt(`Dispense ${name}?\nHow many stocks to remove?`);
        if(v) { 
            const removeQty = parseInt(v);
            if (isNaN(removeQty) || removeQty <= 0) return alert("Please enter a valid number.");
            const newQty = parseInt(currentQty) - removeQty;
            if(newQty < 0) return alert("Insufficient stock!");
            const success = await app.updateQty(id, newQty);
            if(success) {
                await app.logTransaction(name, 'Dispensed', -removeQty, 'Success');
                await app.init();
            }
        }
    }
};

app.checkSession();