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
            categories = catData || [];

            this.updateBadge();
            
            const titleElement = document.getElementById('view-title');
            let currentTab = titleElement ? titleElement.innerText.toLowerCase().replace(/\s+/g, '-') : 'dashboard';
            
            if (currentTab === 'medical-supplies') currentTab = 'supplies';
            if (currentTab === 'inventory-list') currentTab = 'inventory';

            ui.render(currentTab || 'dashboard');
            
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

    // New Function: Log Transaction
    async logTransaction(itemName, type, qty, status) {
        try {
            await _supabase.from('logs').insert([{ 
                item_name: itemName, 
                type: type, 
                quantity: qty, 
                status: status,
                created_at: new Date().toISOString()
            }]);
        } catch (err) {
            console.error("Logging failed:", err);
        }
    },

    async saveMed(n, mg, c, q, e) {
        const { error } = await _supabase
            .from('inventory')
            .insert([{ name: n, mg: mg, cat: c, qty: parseInt(q), exp: e }]);
            
        if(!error) {
            await this.init();
            if (mg && mg.trim() !== "") ui.view('inventory');
            else ui.view('supplies');
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

    async addCategory() {
        const input = document.getElementById('new-category-name');
        const name = input.value.trim();
        if (!name) return alert("Please enter a category name");

        const { error } = await _supabase.from('categories').insert([{ name: name }]);
        if (!error) {
            input.value = '';
            await this.init();
            ui.render('categories');
        } else {
            alert("Failed to add category: " + error.message);
        }
    },

    async deleteCategory(id, name) {
        const isUsed = inventory.some(m => m.cat === name);
        if (isUsed) return alert(`Cannot delete "${name}". Items are still assigned to it.`);

        if(confirm(`Delete category "${name}"?`)) {
            const { error } = await _supabase.from('categories').delete().eq('id', id);
            if(!error) {
                await this.init();
                ui.render('categories');
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
    getExpiryStatus(dateStr) {
        if (!dateStr) return { isCritical: false, style: '' };
        const diffDays = Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 30) return { isCritical: true, style: 'color: #ef4444; font-weight: 800;' };
        return { isCritical: false, style: '' };
    },

    filterInventory() {
        const query = document.getElementById('search-bar').value.toLowerCase();
        const rows = document.querySelectorAll('#inventory-table-body tr');
        rows.forEach(row => {
            const text = row.innerText.toLowerCase();
            row.style.display = text.includes(query) ? "" : "none";
        });
    },

    filterSupplies() {
        const query = document.getElementById('search-bar-supplies').value.toLowerCase();
        const rows = document.querySelectorAll('#supplies-table-body tr');
        rows.forEach(row => {
            const text = row.innerText.toLowerCase();
            row.style.display = text.includes(query) ? "" : "none";
        });
    },

    view(tab) {
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        const target = document.getElementById(`tab-${tab}`);
        if(target) target.classList.add('active');
        
        const titleElement = document.getElementById('view-title');
        if(titleElement) {
            titleElement.innerText = tab === 'supplies' ? 'MEDICAL SUPPLIES' : tab.toUpperCase().replace('-', ' ');
        }
        this.render(tab);
    },

    async render(tab) {
        const root = document.getElementById('render-area');
        if(!root) return;

        const medicines = inventory.filter(m => m.mg && m.mg.trim() !== "");
        const supplies = inventory.filter(m => !m.mg || m.mg.trim() === "");

        if(tab === 'dashboard') {
            const totalStock = inventory.reduce((a,b) => a + (parseInt(b.qty) || 0), 0);
            const lowItems = inventory.filter(m => (parseInt(m.qty) || 0) < 10).length;
            const expiringSoon = inventory.filter(m => {
                if(!m.exp) return false;
                const diff = Math.ceil((new Date(m.exp) - new Date()) / (1000 * 60 * 60 * 24));
                return diff <= 30 && diff >= 0;
            }).length;

            root.innerHTML = `
                <div class="stats-row" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 15px;">
                    <div class="stat-card">
                        <div class="icon-circle bg-blue"><i class="fa-solid fa-pills"></i></div>
                        <div class="stat-data"><h3>${medicines.length}</h3><p>Medicines</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="icon-circle" style="background:#e0f2fe; color:#0ea5e9;"><i class="fa-solid fa-briefcase-medical"></i></div>
                        <div class="stat-data"><h3>${supplies.length}</h3><p>Supplies</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="icon-circle bg-green"><i class="fa-solid fa-boxes-stacked"></i></div>
                        <div class="stat-data"><h3>${totalStock}</h3><p>Total Units</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="icon-circle bg-red" style="${lowItems > 0 ? 'animation: pulse 2s infinite;' : ''}"><i class="fa-solid fa-triangle-exclamation"></i></div>
                        <div class="stat-data"><h3 style="color:#ef4444">${lowItems}</h3><p>Low Stock</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="icon-circle bg-red" style="${expiringSoon > 0 ? 'animation: pulse 2s infinite;' : ''}"><i class="fa-solid fa-calendar-xmark"></i></div>
                        <div class="stat-data"><h3 style="color:#ef4444">${expiringSoon}</h3><p>Near Expiry</p></div>
                    </div>
                </div>`;
        }

        if(tab === 'inventory') {
            root.innerHTML = `
                <div class="search-area" style="margin-bottom: 20px;">
                    <input type="text" id="search-bar" placeholder="Search medicines..." onkeyup="ui.filterInventory()" style="padding: 10px; width: 300px; border-radius: 8px; border: 1px solid #ddd;">
                </div>
                <div class="table-card">
                    <table class="modern-table">
                        <thead><tr><th>Medicine Details</th><th>Category</th><th>Stock</th><th>Expiry</th><th style="text-align:right">Actions</th></tr></thead>
                        <tbody id="inventory-table-body">${medicines.map(m => this.createRow(m, true)).join('')}</tbody>
                    </table>
                </div>`;
        }

        if(tab === 'supplies') {
            root.innerHTML = `
                <div class="search-area" style="margin-bottom: 20px;">
                    <input type="text" id="search-bar-supplies" placeholder="Search supplies..." onkeyup="ui.filterSupplies()" style="padding: 10px; width: 300px; border-radius: 8px; border: 1px solid #ddd;">
                </div>
                <div class="table-card">
                    <table class="modern-table">
                        <thead><tr><th>Supply Item</th><th>Category</th><th>Stock</th><th>Expiry</th><th style="text-align:right">Actions</th></tr></thead>
                        <tbody id="supplies-table-body">${supplies.map(m => this.createRow(m, false)).join('')}</tbody>
                    </table>
                </div>`;
        }

        if(tab === 'add') {
            root.innerHTML = `
                <div class="form-card">
                    <div class="form-header"><h3>Register New Item</h3></div>
                    <div class="form-grid" style="margin-top:20px;">
                        <div class="form-group full-width"><label>Name</label><input id="n" type="text" placeholder="Item name"></div>
                        <div class="form-group"><label>Dosage (mg) <small>(Leave blank for supplies)</small></label><input id="mg" type="text" placeholder="e.g. 500"></div>
                        <div class="form-group"><label>Category</label><select id="c"><option value="">Select</option>${categories.map(cat => `<option value="${cat.name}">${cat.name}</option>`).join('')}</select></div>
                        <div class="form-group"><label>Quantity</label><input id="q" type="number" placeholder="0"></div>
                        <div class="form-group"><label>Expiration</label><input id="e" type="date"></div>
                    </div>
                    <button class="btn-submit" onclick="ui.handleSave()">Save to Cloud</button>
                </div>`;
        }

        if(tab === 'categories') {
            root.innerHTML = `
                <div class="form-card" style="max-width: 600px;">
                    <h3>Categories</h3>
                    <div style="display:flex; gap:10px; margin-top:15px;">
                        <input type="text" id="new-category-name" placeholder="Name..." style="flex:1; padding:10px;">
                        <button class="btn-submit" style="margin:0; width:auto;" onclick="app.addCategory()">Add</button>
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:20px;">
                        ${categories.map(c => `<div class="category-pill"><span>${c.name}</span> <i class="fa-solid fa-trash" onclick="app.deleteCategory('${c.id}', '${c.name}')"></i></div>`).join('')}
                    </div>
                </div>`;
        }

        if(tab === 'reports') {
            root.innerHTML = `
                <div class="form-card" style="margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between;">
                    <h3>Audit Reports</h3>
                    <button class="btn-submit" onclick="window.print()" style="width:auto; padding: 0 20px;">Print PDF</button>
                </div>
                <div class="table-card">
                    <table class="modern-table">
                        <thead><tr><th>Time</th><th>Item</th><th>Action</th><th>Qty</th><th>Status</th></tr></thead>
                        <tbody id="audit-table-body"><tr><td colspan="5" style="text-align:center;">Loading logs...</td></tr></tbody>
                    </table>
                </div>`;
            this.loadAuditLogs();
        }
    },

    async loadAuditLogs() {
        const tbody = document.getElementById('audit-table-body');
        const { data, error } = await _supabase.from('logs').select('*').order('created_at', { ascending: false }).limit(20);
        if (error || !data) return;
        tbody.innerHTML = data.map(log => `
            <tr>
                <td>${new Date(log.created_at).toLocaleTimeString()}</td>
                <td><strong>${log.item_name}</strong></td>
                <td>Dispensed</td>
                <td>-${log.quantity}</td>
                <td><span style="color:green">● Success</span></td>
            </tr>
        `).join('');
    },

    createRow(m, isMed) {
        const expStatus = this.getExpiryStatus(m.exp);
        const isLow = m.qty < 10;
        return `
            <tr class="${(isLow || expStatus.isCritical) ? 'row-critical' : ''}">
                <td>
                    <span style="display:block; font-weight:700;">${m.name}</span>
                    ${isMed ? `<span style="font-size:0.8rem; color:#64748b;">${m.mg} mg</span>` : ''}
                </td>
                <td><span class="stock-indicator" style="background:#f1f5f9; color:#475569;">${m.cat}</span></td>
                <td><span class="stock-indicator ${isLow ? 'critical' : 'stable'}">${m.qty} Units</span></td>
                <td><span style="${expStatus.style}">${m.exp || '--'}</span></td>
                <td style="text-align:right">
                    <button class="icon-btn" onclick="ui.dispense('${m.id}', ${m.qty}, '${m.name.replace(/'/g, "\\'")}', '${isMed ? 'inventory' : 'supplies'}')">
                        <i class="fa-solid fa-minus-circle"></i>
                    </button>
                    <button class="icon-btn" style="color:red; margin-left:10px;" onclick="app.deleteItem('${m.id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>`;
    },

    handleSave() {
        const n = document.getElementById('n').value;
        const mg = document.getElementById('mg').value;
        const c = document.getElementById('c').value;
        const q = document.getElementById('q').value;
        const e = document.getElementById('e').value;
        if(n && q && c) app.saveMed(n, mg, c, q, e);
        else alert("Fill in Name, Category, and Quantity.");
    },

    async dispense(id, currentQty, name, redirectTab) {
        const v = prompt(`Dispense ${name}?\nHow many units to remove?`);
        if(v) { 
            const removeQty = parseInt(v);
            const newQty = parseInt(currentQty) - removeQty;
            if(newQty < 0) return alert("Insufficient stock!");
            const success = await app.updateQty(id, newQty);
            if(success) {
                await app.logTransaction(name, 'Dispensed', removeQty, 'Success');
                this.view(redirectTab);
            }
        }
    }
};

app.checkSession();