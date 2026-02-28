// 1. Initialize Supabase
const supabaseUrl = 'https://ahofyrpymxbqlnvhrbtq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFob2Z5cnB5bXhicWxudmhyYnRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NTIwNjAsImV4cCI6MjA4NzUyODA2MH0.9Q07cxQoRMHMQfczSk5DTzcdntJDFihPYxsur1bGDnc';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

// 2. Global data variables
let inventory = [];
let categories = [];

const app = {
    checkSession() {
        const isLoggedIn = localStorage.getItem('pyxis_logged_in');
        if (isLoggedIn === 'true') {
            this.showAppInterface();
            this.init();
        }
    },

    async init() {
        try {
            const { data: invData, error: invErr } = await _supabase.from('inventory').select('*').order('name');
            const { data: catData, error: catErr } = await _supabase.from('categories').select('*').order('name');
            
            if (invErr || catErr) throw new Error("Database connection failed");

            inventory = invData || [];
            categories = catData ? catData.map(c => c.name) : [];

            this.updateBadge();
            
            // Auto-refresh the current view
            const titleElement = document.getElementById('view-title');
            const title = titleElement ? titleElement.innerText.toLowerCase().replace(' ', '-') : 'dashboard';
            ui.render(title || 'dashboard');
            
            console.log("Data Refreshed:", inventory);
        } catch (err) {
            console.error("Fetch error:", err);
        }
    },

    showAppInterface() {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-interface').classList.remove('hidden');
    },

    async login() {
        const user = document.getElementById('username').value.toLowerCase();
        if(user === 'admin') {
            localStorage.setItem('pyxis_logged_in', 'true');
            this.showAppInterface();
            await this.init(); 
        } else {
            alert("Access Denied");
        }
    },

    logout() {
        localStorage.removeItem('pyxis_logged_in');
        window.location.reload();
    },

    async saveMed(n, mg, c, q, e) {
        const { error } = await _supabase
            .from('inventory')
            .insert([{ name: n, mg: mg, cat: c, qty: parseInt(q), exp: e }]);
            
        if(!error) {
            await this.init();
            ui.view('inventory');
        } else {
            alert("Save Failed: " + error.message);
        }
    },

    async deleteItem(id) {
        if(confirm(`Delete this item permanently?`)) {
            const { error } = await _supabase.from('inventory').delete().eq('id', id);
            if(!error) await this.init();
            else alert("Delete Failed: " + error.message);
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

    // UPDATED: Check for both Low Stock and Near Expiry
    updateBadge() {
        const badge = document.getElementById('alert-badge');
        const bellIcon = document.querySelector('.fa-bell'); // Targeting the bell icon

        if(badge) {
            const today = new Date();
            
            // Count items that are EITHER low stock OR expiring in <= 30 days
            const alerts = inventory.filter(m => {
                const isLowStock = (parseInt(m.qty) || 0) < 10;
                
                let isNearExpiry = false;
                if(m.exp) {
                    const expDate = new Date(m.exp);
                    const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
                    isNearExpiry = diffDays <= 30;
                }
                
                return isLowStock || isNearExpiry;
            });

            badge.innerText = alerts.length;

            // CLIENT REQUIREMENT: Turn icon red if there are any alerts
            if(alerts.length > 0) {
                badge.style.background = "#ef4444"; // Bright Red Badge
                if(bellIcon) bellIcon.style.color = "#ef4444"; // Red Icon
            } else {
                badge.style.background = "var(--accent-blue)";
                if(bellIcon) bellIcon.style.color = "inherit";
            }
        }
    }
};

const ui = {
    // UPDATED: Helper to determine if a date is critical
    getExpiryStatus(dateStr) {
        if (!dateStr) return { isCritical: false, style: '' };
        const expDate = new Date(dateStr);
        const today = new Date();
        const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
        
        // CLIENT REQUIREMENT: Red color notice for expiring soon (30 days)
        if (diffDays <= 30) {
            return { isCritical: true, style: 'color: #ef4444; font-weight: bold; animation: pulse 2s infinite;' };
        }
        return { isCritical: false, style: '' };
    },

    view(tab) {
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        const target = document.getElementById(`tab-${tab}`);
        if(target) target.classList.add('active');
        
        const titleElement = document.getElementById('view-title');
        if(titleElement) titleElement.innerText = tab.toUpperCase().replace('-', ' ');
        this.render(tab);
    },

    render(tab) {
        const root = document.getElementById('render-area');
        if(!root) return;

        if(tab === 'dashboard') {
            const today = new Date();
            const totalStock = inventory.reduce((a,b) => a + (parseInt(b.qty) || 0), 0);
            
            // Logic for Dashboard cards
            const lowItems = inventory.filter(m => (parseInt(m.qty) || 0) < 10).length;
            const expiringSoon = inventory.filter(m => {
                if(!m.exp) return false;
                const diffDays = Math.ceil((new Date(m.exp) - today) / (1000 * 60 * 60 * 24));
                return diffDays <= 30;
            }).length;

            root.innerHTML = `
                <div class="stats-row">
                    <div class="stat-card">
                        <div class="icon-circle bg-blue"><i class="fa-solid fa-pills"></i></div>
                        <div class="stat-data"><h3>${inventory.length}</h3><p>Medicines</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="icon-circle bg-green"><i class="fa-solid fa-boxes-stacked"></i></div>
                        <div class="stat-data"><h3>${totalStock}</h3><p>Total Units</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="icon-circle bg-red"><i class="fa-solid fa-triangle-exclamation"></i></div>
                        <div class="stat-data"><h3 style="color:#ef4444">${lowItems}</h3><p>Low Stock</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="icon-circle" style="background:#fef2f2; color:#ef4444;"><i class="fa-solid fa-calendar-xmark"></i></div>
                        <div class="stat-data"><h3 style="color:#ef4444">${expiringSoon}</h3><p>Near Expiry</p></div>
                    </div>
                </div>
                <div class="form-card" style="max-width: 100%; margin: 0;">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:15px;">
                        <i class="fa-solid fa-heart-pulse" style="color:var(--accent-blue)"></i>
                        <h3>System Health</h3>
                    </div>
                    <p style="margin-bottom:10px;">Connection: <span style="color:green; font-weight:bold;">● Cloud Sync Active</span></p>
                    <p style="color:var(--text-muted); font-size:0.85rem;">Secure connection established with Supabase PostgreSQL.</p>
                </div>`;
        }

        if(tab === 'inventory') {
            root.innerHTML = `
                <div class="table-card">
                    <table class="modern-table">
                        <thead>
                            <tr>
                                <th>Medicine Details</th>
                                <th>Category</th>
                                <th>Stock Level</th>
                                <th>Expiry</th>
                                <th style="text-align:right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>${inventory.map((m) => {
                            const expStatus = this.getExpiryStatus(m.exp);
                            return `
                            <tr>
                                <td>
                                    <div class="med-info">
                                        <span class="med-primary">${m.name}</span>
                                        <span class="med-secondary">${m.mg || '--'} mg</span>
                                    </div>
                                </td>
                                <td><span class="stock-indicator" style="background:#f1f5f9; color:#475569;">${m.cat}</span></td>
                                <td>
                                    <span class="stock-indicator ${m.qty < 10 ? 'critical' : 'stable'}">
                                        ${m.qty} Units
                                    </span>
                                </td>
                                <td><span style="${expStatus.style}">${m.exp || '--'}</span></td>
                                <td style="text-align:right">
                                    <button class="btn-icon dispense" onclick="ui.dispense('${m.id}', ${m.qty}, '${m.name.replace(/'/g, "\\'")}')">
                                        <i class="fa-solid fa-hand-holding-medical"></i>
                                    </button>
                                    <button class="btn-icon delete" onclick="app.deleteItem('${m.id}')">
                                        <i class="fa-solid fa-trash"></i>
                                    </button>
                                </td>
                            </tr>`}).join('')}
                        </tbody>
                    </table>
                </div>`;
        }

        if(tab === 'add') {
            root.innerHTML = `
                <div class="form-card">
                    <div class="form-header"><i class="fa-solid fa-circle-plus"></i><h3>Register New Supply</h3></div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                        <div class="input-field" style="grid-column: span 2;">
                            <label>Medicine Name</label>
                            <input id="n" type="text" placeholder="Enter name">
                        </div>
                        <div class="input-field">
                            <label>Dosage (mg)</label>
                            <input id="mg" type="text" placeholder="500">
                        </div>
                        <div class="input-field">
                            <label>Category</label>
                            <select id="c">
                                <option value="" disabled selected>Select category</option>
                                ${categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
                            </select>
                        </div>
                        <div class="input-field">
                            <label>Initial Quantity</label>
                            <input id="q" type="number" placeholder="0">
                        </div>
                        <div class="input-field">
                            <label>Expiration Date</label>
                            <input id="e" type="date">
                        </div>
                    </div>
                    <button class="btn-submit" onclick="ui.handleSave()">
                        <i class="fa-solid fa-cloud-arrow-up"></i> Save to Cloud
                    </button>
                </div>`;
        }
        
        if(tab === 'categories') {
            root.innerHTML = `<div class="form-card" style="max-width: 100%;"><div class="form-header"><i class="fa-solid fa-tags"></i><h3>Active Categories</h3></div><div style="display:flex; flex-wrap:wrap; gap:10px;">${categories.map(c => `<span class="stock-indicator stable">${c}</span>`).join('')}</div></div>`;
        }
        if(tab === 'reports') {
            root.innerHTML = `<div class="form-card" style="text-align:center; padding:50px; max-width: 100%;"><i class="fa-solid fa-file-invoice" style="font-size:3rem; color:var(--accent-blue); margin-bottom:20px;"></i><h3>Audit Report Generation</h3><button class="btn-submit" style="max-width:300px; margin:0 auto;" onclick="window.print()"><i class="fa-solid fa-print"></i> Generate PDF Report</button></div>`;
        }
    },

    handleSave() {
        const n = document.getElementById('n').value;
        const mg = document.getElementById('mg').value;
        const c = document.getElementById('c').value;
        const q = document.getElementById('q').value;
        const e = document.getElementById('e').value;
        if(n && q && c) app.saveMed(n, mg, c, q, e);
        else alert("Fill in required fields.");
    },

    async dispense(id, currentQty, name) {
        const v = prompt(`Dispense ${name}?\nCurrent Stock: ${currentQty}\nHow many units to remove?`);
        if(v !== null && v !== "" && !isNaN(v)) { 
            const amountToRemove = parseInt(v);
            const newQty = parseInt(currentQty) - amountToRemove;
            if(newQty < 0) return alert("Insufficient stock!");
            const success = await app.updateQty(id, newQty);
            if(success) this.view('inventory');
        }
    }
};

app.checkSession();