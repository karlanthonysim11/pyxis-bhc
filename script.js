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

    // --- CATEGORY METHODS ---
    async addCategory() {
        const input = document.getElementById('new-category-name');
        const name = input.value.trim();
        
        if (!name) return alert("Please enter a category name");

        const { error } = await _supabase
            .from('categories')
            .insert([{ name: name }]);

        if (!error) {
            input.value = '';
            await this.init();
            ui.render('categories');
        } else {
            alert("Failed to add category: " + error.message);
        }
    },

    async deleteCategory(id, name) {
        if(!id || id === 'undefined') {
            return alert("Error: Could not find category ID. Please refresh.");
        }

        // Safety Check: Is this category currently being used by any medicine?
        const isUsed = inventory.some(m => m.cat === name);
        if (isUsed) {
            return alert(`Cannot delete "${name}". There are medicines currently assigned to this category.`);
        }

        if(confirm(`Delete category "${name}" permanently?`)) {
            const { error } = await _supabase
                .from('categories')
                .delete()
                .eq('id', id);

            if(!error) {
                await this.init();
                ui.render('categories');
            } else {
                alert("Delete Failed: " + error.message);
            }
        }
    },

    updateBadge() {
        const badge = document.getElementById('alert-badge');
        const bellIcon = document.querySelector('.fa-bell'); 

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

            if(criticalItems.length > 0) {
                badge.style.background = "#ef4444"; 
                if(bellIcon) bellIcon.classList.add('alert-active');
            } else {
                badge.style.background = "var(--accent-blue)";
                if(bellIcon) bellIcon.classList.remove('alert-active');
            }
        }
    }
};

const ui = {
    getExpiryStatus(dateStr) {
        if (!dateStr) return { isCritical: false, style: '' };
        const expDate = new Date(dateStr);
        const today = new Date();
        const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
        
        if (diffDays <= 30) {
            return { isCritical: true, style: 'color: #ef4444; font-weight: 800; animation: blink-red 2s infinite;' };
        }
        return { isCritical: false, style: '' };
    },

    filterInventory() {
        const query = document.getElementById('search-bar').value.toLowerCase();
        const rows = document.querySelectorAll('#inventory-table-body tr');

        rows.forEach(row => {
            const name = row.querySelector('.med-primary').innerText.toLowerCase();
            const category = row.cells[1].innerText.toLowerCase();
            
            if (name.includes(query) || category.includes(query)) {
                row.style.display = ""; 
            } else {
                row.style.display = "none";
            }
        });
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
                    <div class="form-header">
                        <i class="fa-solid fa-heart-pulse" style="color:var(--accent-blue)"></i>
                        <h3>System Health</h3>
                    </div>
                    <p style="margin-top:10px;">Connection: <span style="color:green; font-weight:bold;">● Cloud Sync Active</span></p>
                    <p style="color:var(--text-muted); font-size:0.85rem; margin-top:5px;">Secure connection established with Supabase PostgreSQL.</p>
                </div>`;
        }

        if(tab === 'inventory') {
            root.innerHTML = `
                <div class="search-area" style="margin-bottom: 20px;">
                    <div class="form-group" style="max-width: 400px; position: relative;">
                        <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 15px; top: 12px; color: #94a3b8;"></i>
                        <input type="text" id="search-bar" placeholder="Search by name or category..." 
                               onkeyup="ui.filterInventory()" 
                               style="padding: 10px 15px 10px 45px; width: 100%; border-radius: 8px; border: 1px solid #e2e8f0;">
                    </div>
                </div>
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
                        <tbody id="inventory-table-body">${inventory.map((m) => {
                            const expStatus = this.getExpiryStatus(m.exp);
                            const isLow = m.qty < 10;
                            const isCriticalRow = isLow || expStatus.isCritical;
                            
                            return `
                            <tr class="${isCriticalRow ? 'row-critical' : ''}">
                                <td>
                                    <div class="med-info">
                                        <span class="med-primary" style="display:block; font-weight:700;">${m.name}</span>
                                        <span class="med-secondary" style="font-size:0.8rem; color:var(--text-muted);">${m.mg || '--'} mg</span>
                                    </div>
                                </td>
                                <td><span class="stock-indicator" style="background:#f1f5f9; color:#475569;">${m.cat}</span></td>
                                <td>
                                    <span class="stock-indicator ${isLow ? 'critical' : 'stable'}">
                                        ${m.qty} Units
                                    </span>
                                </td>
                                <td><span style="${expStatus.style}">${m.exp || '--'}</span></td>
                                <td style="text-align:right">
                                    <button class="icon-btn" style="margin-right:10px; color:var(--accent-blue);" onclick="ui.dispense('${m.id}', ${m.qty}, '${m.name.replace(/'/g, "\\'")}')">
                                        <i class="fa-solid fa-hand-holding-medical"></i>
                                    </button>
                                    <button class="icon-btn" style="color:var(--danger);" onclick="app.deleteItem('${m.id}')">
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
                    <div class="form-header">
                        <i class="fa-solid fa-circle-plus" style="color:var(--accent-blue)"></i>
                        <h3>Register New Supply</h3>
                    </div>
                    <div class="form-grid" style="margin-top:25px;">
                        <div class="form-group full-width">
                            <label>Medicine Name</label>
                            <input id="n" type="text" placeholder="Enter medicine name" autocomplete="off">
                        </div>
                        <div class="form-group">
                            <label>Dosage (mg)</label>
                            <input id="mg" type="text" placeholder="e.g. 500">
                        </div>
                        <div class="form-group">
                            <label>Category</label>
                            <select id="c">
                                <option value="" disabled selected>Select category</option>
                                ${categories.map(cat => `<option value="${cat.name}">${cat.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Initial Quantity</label>
                            <input id="q" type="number" placeholder="0">
                        </div>
                        <div class="form-group">
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
            root.innerHTML = `
                <div class="form-card" style="max-width: 600px; margin-bottom: 25px;">
                    <div class="form-header"><i class="fa-solid fa-tag" style="color:var(--accent-blue)"></i><h3>Create New Category</h3></div>
                    <div style="display:flex; gap:10px; margin-top:15px;">
                        <input type="text" id="new-category-name" placeholder="Enter category name..." style="flex:1; padding:12px; border-radius:10px; border:1px solid var(--border);">
                        <button class="btn-submit" style="margin:0; width:auto; padding:0 20px;" onclick="app.addCategory()">Add</button>
                    </div>
                </div>
                <div class="form-card" style="max-width: 100%;">
                    <div class="form-header"><i class="fa-solid fa-tags" style="color:var(--accent-blue)"></i><h3>Active Categories</h3></div>
                    <div style="display:flex; flex-wrap:wrap; gap:12px; margin-top:20px;">
                        ${categories.map(c => `
                            <div class="category-pill">
                                <span>${c.name}</span>
                                <i class="fa-solid fa-trash-can delete-cat" onclick="app.deleteCategory('${c.id}', '${c.name}')"></i>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
        }

        if(tab === 'reports') {
            root.innerHTML = `
                <div class="form-card" style="text-align:center; padding:50px; max-width: 100%;">
                    <i class="fa-solid fa-file-invoice" style="font-size:3rem; color:var(--accent-blue); margin-bottom:20px;"></i>
                    <h3>Audit Report Generation</h3>
                    <p style="color:var(--text-muted); margin-bottom:25px;">Generate a summary of current inventory levels and critical alerts.</p>
                    <button class="btn-submit" style="max-width:300px; margin:0 auto;" onclick="window.print()">
                        <i class="fa-solid fa-print"></i> Generate PDF Report
                    </button>
                </div>`;
        }
    },

    handleSave() {
        const n = document.getElementById('n').value;
        const mg = document.getElementById('mg').value;
        const c = document.getElementById('c').value;
        const q = document.getElementById('q').value;
        const e = document.getElementById('e').value;
        if(n && q && c) app.saveMed(n, mg, c, q, e);
        else alert("Please fill in Medicine Name, Category, and Quantity.");
    },

    async dispense(id, currentQty, name) {
        const v = prompt(`Dispense ${name}?\\nCurrent Stock: ${currentQty}\\nHow many units to remove?`);
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