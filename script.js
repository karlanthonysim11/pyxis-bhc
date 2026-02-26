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
            ui.view('dashboard');
            console.log("System initialized with Supabase Cloud Data.");
        } catch (err) {
            console.error("Fetch error:", err);
            alert("Connection Error: Check your Supabase setup.");
        }
    },

    showAppInterface() {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-interface').classList.remove('hidden');
    },

    async login() {
        const user = document.getElementById('username').value.toLowerCase();
        // Simple admin check for your prototype
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
            .insert([{ name: n, mg: mg, cat: c, qty: q, exp: e }]);
            
        if(!error) await this.init();
    },

    async deleteItem(id) {
        if(confirm(`Delete this item permanently?`)) {
            const { error } = await _supabase.from('inventory').delete().eq('id', id);
            if(!error) await this.init();
        }
    },

    async updateQty(id, newQty) {
        const { error } = await _supabase.from('inventory').update({ qty: parseInt(newQty) }).eq('id', id);
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
        // Updated selector to match your sidebar class names
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
            const lowItems = inventory.filter(m => m.qty < 10).length;
            root.innerHTML = `
                <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:20px; margin-bottom:30px;">
                    <div class="stat-box"><h2>${inventory.length}</h2><p>Items</p></div>
                    <div class="stat-box"><h2>${totalStock}</h2><p>Units</p></div>
                    <div class="stat-box"><h2 style="color:#ef4444">${lowItems}</h2><p>Low Stock</p></div>
                </div>
                <div class="white-card">
                    <h3>System Health</h3>
                    <p>Connection: <span style="color:green">● Cloud Sync Active</span></p>
                </div>`;
        }

        if(tab === 'inventory') {
            root.innerHTML = `
                <div class="white-card">
                    <table>
                        <thead><tr><th>Medicine</th><th>Dosage</th><th>Category</th><th>Stock</th><th>Expiry</th><th>Actions</th></tr></thead>
                        <tbody>${inventory.map((m) => `
                            <tr>
                                <td><b>${m.name}</b></td>
                                <td>${m.mg || '--'} mg</td>
                                <td>${m.cat}</td>
                                <td style="color:${m.qty < 10 ? '#ef4444' : 'inherit'}; font-weight:bold">${m.qty}</td>
                                <td style="${this.getExpiryStyle(m.exp)}">${m.exp || '--'}</td>
                                <td>
                                    <button class="btn-text" onclick="ui.dispense('${m.id}', ${m.qty}, '${m.name}')">Dispense</button>
                                    <button class="btn-text delete" onclick="app.deleteItem('${m.id}')">Delete</button>
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>`;
        }

        if(tab === 'add') {
            root.innerHTML = `
                <div class="white-card" style="max-width:500px">
                    <h3>Register New Supply</h3>
                    <input id="n" type="text" placeholder="Medicine Name" class="form-input">
                    <input id="mg" type="text" placeholder="Dosage (mg)" class="form-input">
                    <select id="c" class="form-input">
                        <option value="" disabled selected>Select Category</option>
                        ${categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
                    </select>
                    <input id="q" type="number" placeholder="Initial Quantity" class="form-input">
                    <input id="e" type="date" class="form-input">
                    <button class="btn-main" onclick="ui.handleSave()">Add to Cloud</button>
                </div>`;
        }

        if(tab === 'categories') {
            root.innerHTML = `
                <div class="white-card">
                    <h3>Active Categories</h3>
                    <ul>${categories.map(c => `<li>${c}</li>`).join('')}</ul>
                </div>`;
        }

        if(tab === 'reports') {
            root.innerHTML = `
                <div class="white-card">
                    <h3>Audit Report</h3>
                    <p>Generating summary for BHC Indangan...</p>
                    <button class="btn-main" onclick="window.print()">Print Report</button>
                </div>`;
        }
    },

    handleSave() {
        const n = document.getElementById('n').value;
        const mg = document.getElementById('mg').value;
        const c = document.getElementById('c').value;
        const q = parseInt(document.getElementById('q').value);
        const e = document.getElementById('e').value;
        if(n && q && c) { 
            app.saveMed(n, mg, c, q, e); 
            this.view('inventory'); 
        } else {
            alert("Required: Name, Category, and Quantity.");
        }
    },

    async dispense(id, currentQty, name) {
        const v = prompt(`Dispense ${name}? Quantity:`);
        if(v && !isNaN(v)) { 
            const newQty = currentQty - parseInt(v);
            if(newQty < 0) return alert("Low stock!");
            await app.updateQty(id, newQty);
            this.view('inventory'); 
        }
    }
};

// Initial run
app.checkSession();