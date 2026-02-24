// 1. Initialize Supabase - REPLACE WITH YOUR ACTUAL KEYS FROM SUPABASE SETTINGS
const supabaseUrl = 'https://ahofyrpymxbqlnvhrbtq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFob2Z5cnB5bXhicWxudmhyYnRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NTIwNjAsImV4cCI6MjA4NzUyODA2MH0.9Q07cxQoRMHMQfczSk5DTzcdntJDFihPYxsur1bGDnc';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

// 2. Global data variables
let inventory = [];
let categories = [];

const app = {
    // FETCH: Gets data from Supabase tables
    async init() {
        try {
            const { data: invData, error: invErr } = await _supabase.from('inventory').select('*').order('name');
            const { data: catData, error: catErr } = await _supabase.from('categories').select('*').order('name');
            
            if (invErr || catErr) throw new Error("Database connection failed");

            inventory = invData || [];
            categories = catData ? catData.map(c => c.name) : [];

            this.updateBadge();
            ui.view('dashboard');
            console.log("System initialized with Supabase Cloud Data.");
        } catch (err) {
            console.error("Fetch error:", err);
            alert("Connection Error: Check your Supabase API keys and SQL table setup.");
        }
    },

    async login() {
        const user = document.getElementById('username').value.toLowerCase();
        // For a health center app, 'admin' triggers the cloud sync
        if(user === 'admin') {
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-interface').classList.remove('hidden');
            await this.init(); 
        } else {
            alert("Access Denied");
        }
    },

    // CLOUD SAVE: Inserts new row into 'inventory' table
    async saveMed(n, mg, c, q, e) {
        const { error } = await _supabase
            .from('inventory')
            .insert([{ name: n, mg: mg, cat: c, qty: q, exp: e }]);
            
        if(!error) {
            await this.init();
        } else {
            console.error("Save error:", error);
        }
    },

    // CLOUD DELETE: Removes item by ID
    async deleteItem(id) {
        if(confirm(`Delete this item permanently from the cloud?`)) {
            const { error } = await _supabase.from('inventory').delete().eq('id', id);
            if(!error) await this.init();
        }
    },

    // CLOUD UPDATE: Used for dispensing
    async updateQty(id, newQty) {
        const { error } = await _supabase.from('inventory').update({ qty: newQty }).eq('id', id);
        if(!error) await this.init();
    },

    updateBadge() {
        const badge = document.getElementById('alert-badge');
        if(badge) {
            const lowStockCount = inventory.filter(m => (parseInt(m.qty) || 0) < 10).length;
            badge.innerText = lowStockCount;
        }
    }
};

const ui = {
    getExpiryStyle(dateStr) {
        if (!dateStr) return '';
        const expDate = new Date(dateStr);
        const today = new Date();
        const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
        return diffDays <= 30 ? 'color: #ef4444; font-weight: bold;' : '';
    },

    view(tab) {
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        const target = document.getElementById(`tab-${tab}`);
        if(target) target.classList.add('active');
        document.getElementById('view-title').innerText = tab.toUpperCase().replace('-', ' ');
        this.render(tab);
    },

    render(tab) {
        const root = document.getElementById('render-area');

        if(tab === 'dashboard') {
            const totalStock = inventory.reduce((a,b) => a + (parseInt(b.qty) || 0), 0);
            root.innerHTML = `
                <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:25px; margin-bottom:30px;">
                    <div class="stat-box"><h2>${inventory.length}</h2><p>Medicines Tracked</p></div>
                    <div class="stat-box"><h2>${totalStock}</h2><p>Total Units</p></div>
                    <div class="stat-box"><h2 style="color:#ef4444">${inventory.filter(m => m.qty < 10).length}</h2><p>Low Stock</p></div>
                </div>
                <div class="white-card">
                    <h3>System Status: Cloud Sync Active</h3>
                    <p style="color:#64748b; margin-top:10px;">Connected to Supabase. Data is shared across all devices.</p>
                </div>`;
        }

        if(tab === 'inventory') {
            root.innerHTML = `
                <div class="white-card">
                    <table>
                        <thead><tr><th>Medicine Name</th><th>Dosage</th><th>Category</th><th>Stock</th><th>Expiry</th><th>Actions</th></tr></thead>
                        <tbody>${inventory.map((m) => `
                            <tr>
                                <td><b>${m.name}</b></td>
                                <td><span style="color:var(--accent-blue)">${m.mg || '---'} mg</span></td>
                                <td>${m.cat}</td>
                                <td><span style="color:${m.qty < 10 ? '#ef4444' : 'green'};font-weight:bold">${m.qty} Units</span></td>
                                <td style="${this.getExpiryStyle(m.exp)}">${m.exp || '---'}</td>
                                <td>
                                    <span style="color:var(--accent-blue);cursor:pointer;font-weight:600;margin-right:15px;" 
                                          onclick="ui.dispense('${m.id}', ${m.qty}, '${m.name}')">Dispense</span>
                                    <span style="color:#ef4444;cursor:pointer;font-weight:600" 
                                          onclick="app.deleteItem('${m.id}')">Delete</span>
                                </td>
                            </tr>`).join('')}</tbody>
                    </table>
                </div>`;
        }

        if(tab === 'add') {
            root.innerHTML = `
                <div class="white-card" style="max-width:500px">
                    <h3>Register New Supply</h3>
                    <div style="display:flex; gap:10px; margin: 15px 0 10px;">
                        <input id="n" style="flex:2; padding:12px; border:1px solid #ddd; border-radius:8px" placeholder="Medicine Name">
                        <input id="mg" style="flex:1; padding:12px; border:1px solid #ddd; border-radius:8px" placeholder="mg">
                    </div>
                    <select id="c" style="width:100%;padding:12px;margin-bottom:10px;border:1px solid #ddd;border-radius:8px">
                        ${categories.map(cat => `<option>${cat}</option>`).join('')}
                    </select>
                    <input id="q" type="number" style="width:100%;padding:12px;margin-bottom:10px;border:1px solid #ddd;border-radius:8px" placeholder="Quantity">
                    <input id="e" type="date" style="width:100%;padding:12px;margin-bottom:20px;border:1px solid #ddd;border-radius:8px">
                    <button class="btn-main" onclick="ui.handleSave()">Add to Inventory</button>
                </div>`;
        }

        if(tab === 'categories') {
            root.innerHTML = `<div class="white-card"><h3>Categories are managed in Supabase dashboard for this version.</h3></div>`;
        }

        if(tab === 'reports') {
            root.innerHTML = `
                <div class="white-card">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
                        <div>
                            <h2 style="margin:0">Inventory Audit Report</h2>
                            <p style="color:#64748b;font-size:0.9rem">Barangay Indangan - Cloud Records</p>
                        </div>
                        <button class="btn-main" style="width:auto;padding:10px 25px" onclick="window.print()">Export PDF</button>
                    </div>
                    <table>
                        <thead><tr><th>Name</th><th>Dosage</th><th>Category</th><th>Count</th><th>Expiry</th><th>Status</th></tr></thead>
                        <tbody>${inventory.map(m => `
                            <tr>
                                <td>${m.name}</td>
                                <td>${m.mg}mg</td>
                                <td>${m.cat}</td>
                                <td>${m.qty}</td>
                                <td style="${this.getExpiryStyle(m.exp)}">${m.exp}</td>
                                <td>${m.qty < 10 ? 'LOW STOCK' : 'OK'}</td>
                            </tr>`).join('')}</tbody>
                    </table>
                </div>`;
        }
    },

    handleSave() {
        const n = document.getElementById('n').value;
        const mg = document.getElementById('mg').value;
        const c = document.getElementById('c').value;
        const q = parseInt(document.getElementById('q').value);
        const e = document.getElementById('e').value;
        if(n && q) { 
            app.saveMed(n, mg, c, q, e); 
            this.view('inventory'); 
        }
    },

    dispense(id, currentQty, name) {
        const v = prompt(`Dispense ${name}? Quantity:`);
        if(v && !isNaN(v)) { 
            const newQty = currentQty - parseInt(v);
            if(newQty < 0) return alert("Insufficient stock!");
            app.updateQty(id, newQty);
            this.view('inventory'); 
        }
    }
};