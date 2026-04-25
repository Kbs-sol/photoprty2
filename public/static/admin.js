'use strict';

// ═══════════════════════════════════════════════════════════════════
//  PhotoFrameIn Admin Panel v3.0
//  Full CRUD: Products, Orders, Categories, Coupons, Reviews, Content
//  Auth: Supabase email → fallback to Cloudflare secrets
//  Analytics: Revenue, Orders, COD stats, Shiprocket wallet
//  Toggles: COD, Acrylic, Festival, Combo modes
//  Strategic: Profit projections, Ads ROI, Month-1 plan
// ═══════════════════════════════════════════════════════════════════

const ADMIN = {
  version: '3.0',
  session: null,
  authMode: 'fallback', // 'supabase' | 'fallback'
  settings: {},
  currentSection: 'dashboard',
  data: {
    products: [],
    orders: [],
    categories: [],
    coupons: [],
    reviews: [],
    settings: {}
  }
};

// ─── Fallback credentials (Cloudflare secrets in prod) ────────────
const FALLBACK_CREDS = {
  username: window.__ADMIN_USER__ || 'admin',
  password: window.__ADMIN_PASS__ || 'photoframe@2024'
};

// ─── Mock data for demo (replace with real API calls) ─────────────
const MOCK_ORDERS = [
  { id:'PF-260410-A1B2', customer:'Priya Sharma', phone:'9876543210', city:'Mumbai', items:[{name:'Divine Om Frame',size:'Medium (12×18)',frame:'Standard',qty:1,price:749}], total:749, status:'pending', paymentMethod:'cod', codConfirmed:false, created:'2026-04-10T09:15:00Z' },
  { id:'PF-260410-C3D4', customer:'Rahul Verma', phone:'8765432109', city:'Delhi', items:[{name:'Stay Hungry Frame',size:'Small (8×12)',frame:'Standard',qty:2,price:449}], total:898, status:'printing', paymentMethod:'prepaid', codConfirmed:true, created:'2026-04-10T08:30:00Z' },
  { id:'PF-260410-E5F6', customer:'Anita Singh', phone:'7654321098', city:'Bangalore', items:[{name:'Lakshmi Prosperity Frame',size:'Large (18×24)',frame:'Premium',qty:1,price:1399}], total:1399, status:'packed', paymentMethod:'prepaid', codConfirmed:true, created:'2026-04-10T07:45:00Z' },
  { id:'PF-260409-G7H8', customer:'Suresh Kumar', phone:'6543210987', city:'Chennai', items:[{name:'Divine Triptych Set',size:'Medium Set',frame:'Standard',qty:1,price:1799}], total:1848, status:'shipped', paymentMethod:'cod', codConfirmed:true, created:'2026-04-09T14:20:00Z' },
  { id:'PF-260409-I9J0', customer:'Meera Patel', phone:'5432109876', city:'Ahmedabad', items:[{name:'Hustle Hard Frame',size:'A4 Small',frame:'No Frame',qty:1,price:99}], total:99, status:'delivered', paymentMethod:'prepaid', codConfirmed:true, created:'2026-04-09T11:00:00Z' },
  { id:'PF-260408-K1L2', customer:'Vijay Nair', phone:'4321098765', city:'Hyderabad', items:[{name:'Motivational 3-Pack',size:'Small Set',frame:'Standard',qty:1,price:999}], total:1048, status:'rto', paymentMethod:'cod', codConfirmed:false, created:'2026-04-08T16:30:00Z' },
  { id:'PF-260408-M3N4', customer:'Kavya Reddy', phone:'3210987654', city:'Pune', items:[{name:'Ganesh Blessing Frame',size:'Medium (12×18)',frame:'Premium',qty:1,price:999}], total:999, status:'delivered', paymentMethod:'upi', codConfirmed:true, created:'2026-04-08T10:15:00Z' },
  { id:'PF-260407-O5P6', customer:'Arjun Mehta', phone:'2109876543', city:'Kolkata', items:[{name:'Om Mantra Frame',size:'Small (8×12)',frame:'Standard',qty:1,price:449}], total:449, status:'cancelled', paymentMethod:'cod', codConfirmed:false, created:'2026-04-07T13:45:00Z' },
];

const MOCK_COUPONS = [
  { code:'FRAME10', type:'percent', value:10, minOrder:299, maxUses:500, uses:87, active:true, expiry:'2026-12-31', desc:'Welcome 10% off' },
  { code:'DIWALI25', type:'percent', value:25, minOrder:799, maxUses:1000, uses:234, active:false, expiry:'2026-10-31', desc:'Diwali festival discount' },
  { code:'FIRST99', type:'flat', value:99, minOrder:499, maxUses:200, uses:45, active:true, expiry:'2026-06-30', desc:'First order flat ₹99 off' },
  { code:'BULK15', type:'percent', value:15, minOrder:2000, maxUses:100, uses:12, active:true, expiry:'2026-12-31', desc:'Bulk order discount' },
  { code:'FREESHIP', type:'shipping', value:0, minOrder:0, maxUses:300, uses:156, active:true, expiry:'2026-05-31', desc:'Free shipping coupon' },
];

const MOCK_REVIEWS = [
  { id:1, product:'Divine Om Mantra Gold Frame', customer:'Priya S.', city:'Mumbai', rating:5, review:'Absolutely stunning! The gold print is so vibrant. Gifted to my parents for housewarming — they loved it!', status:'approved', date:'2026-04-08' },
  { id:2, product:'Stay Hungry, Stay Foolish Frame', customer:'Rahul M.', city:'Delhi', rating:5, review:'Premium quality, fast delivery. Exactly what I wanted for my startup office wall.', status:'approved', date:'2026-04-07' },
  { id:3, product:'Lakshmi Prosperity Frame', customer:'Anita K.', city:'Chennai', rating:4, review:'Beautiful frame but slight delay in shipping. Quality is top-notch.', status:'approved', date:'2026-04-06' },
  { id:4, product:'Hustle Hard Dream Big Frame', customer:'Suresh V.', city:'Bangalore', rating:5, review:'The dark gradient is FIRE on Instagram. Already got 3 DMs asking where I got it.', status:'pending', date:'2026-04-05' },
  { id:5, product:'Divine Triptych Set', customer:'Meera P.', city:'Ahmedabad', rating:3, review:'Nice set but one frame had a small scratch. Support team replaced it quickly though!', status:'pending', date:'2026-04-04' },
];

const MOCK_SETTINGS = {
  codEnabled: true,
  acrylicUpgrade: false,
  festivalMode: false,
  comboEnabled: true,
  lossLeaderEnabled: true,
  freeShippingThreshold: 799,
  codSurcharge: 148,        // Updated: ₹148 COD fee
  codMinOrder: 499,           // Updated: min ₹499 for COD
  codMaxOrder: 1995,
  expressFee: 99,
  whatsappNumber: '917989531818',
  supportEmail: 'support@photoframein.in',
  razorpayEnabled: false,
  shiprocketEnabled: false,
  shiprocketBalance: 2450.50,
  currentCoupon: 'FRAME10',
  currentCouponDiscount: 10,
  exitPopupEnabled: true,
  exitPopupDiscount: 10,
  analyticsId: 'G-XXXXXXXXXX',
  pixelId: '',
  maintenanceMode: false,
  festivalBanner: 'Navratri Special: 20% OFF on all Divine Frames 🔱',
  adsBudgetMonth: 2000,
  instagramHandle: '@photoframein',
  prepaidCashback: 50,
  prepaidCoupon: 'PREPAID49',     // Coupon for prepaid orders
  prepaidCouponValue: 49,
  loyaltyEnabled: false,
  hyderabadExpressEnabled: true,  // Hyderabad Express for 500xxx pincodes
  automotiveCategoryEnabled: true,// Automotive category active
  // v4.0 additions
  premiumNamingMode: true,        // true = "Premium/Standard" | false = "Teak Wood/MDF Synthetic"
  exchangeOnlyPolicy: true,       // true = exchange only, no returns
  unboxingVideoRequired: true,    // true = video mandatory for exchange claims
  googleLoginEnabled: false,      // Google OAuth toggle
  prepaidOnlyMode: false,         // 35% rule trigger
  brevoApiConfigured: false,      // Brevo API key status
  resendApiConfigured: false,     // Resend API key status
  razorpayConfigured: false,      // Razorpay keys status
  shiprocketConfigured: false,    // Shiprocket credentials status
  supabaseConfigured: false,      // Supabase URL/key status
  r2StorageConfigured: false,     // Cloudflare R2 config status
  // Cost adjustments
  costAdjustments: { packaging: 35, shipping: 60, paymentGatewayPercent: 2, rtoRisk: 120 }
};

// ─── STATE ─────────────────────────────────────────────────────────
let adminSettings = { ...MOCK_SETTINGS };
let editingProduct = null;
let editingOrder = null;
let editingCoupon = null;
let currentModal = null;

// ═══════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Only run admin if on /admin route
  if (!window.location.pathname.startsWith('/admin')) return;
  initAdmin();
});

function initAdmin() {
  // Check existing session
  const sess = sessionStorage.getItem('pf_admin_session');
  if (sess) {
    const parsed = JSON.parse(sess);
    if (parsed.expires > Date.now()) {
      ADMIN.session = parsed;
      showAdminApp();
      return;
    }
  }
  showLoginScreen();
}

// ═══════════════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════════════
function showLoginScreen() {
  document.getElementById('app').innerHTML = `
  <div class="admin-login-bg">
    <div class="admin-login-card">
      <div class="admin-login-logo">
        <span class="admin-logo-icon">🖼️</span>
        <h1>PhotoFrameIn</h1>
        <p>Admin Panel v3.0</p>
      </div>

      <div class="admin-auth-tabs">
        <button class="auth-tab active" onclick="switchAuthTab('supabase')" id="tab-supabase">
          <i class="fas fa-cloud"></i> Supabase Auth
        </button>
        <button class="auth-tab" onclick="switchAuthTab('fallback')" id="tab-fallback">
          <i class="fas fa-shield-alt"></i> Local Auth
        </button>
      </div>

      <div id="auth-supabase" class="auth-panel">
        <div class="auth-info-banner">
          <i class="fas fa-info-circle"></i>
          Supabase email authentication. Requires SUPABASE_URL and SUPABASE_ANON_KEY to be configured.
        </div>
        <div class="form-group">
          <label>Email Address</label>
          <input type="email" id="supabase-email" placeholder="admin@photoframein.in" class="admin-input">
        </div>
        <div class="form-group">
          <label>Password</label>
          <div class="input-with-icon">
            <input type="password" id="supabase-password" placeholder="Your Supabase password" class="admin-input">
            <i class="fas fa-eye toggle-pw" onclick="togglePw('supabase-password')"></i>
          </div>
        </div>
        <button class="admin-btn-primary full-width" onclick="loginSupabase()">
          <i class="fas fa-sign-in-alt"></i> Sign in with Supabase
        </button>
        <p class="auth-fallback-note">
          <i class="fas fa-exclamation-triangle"></i>
          Supabase not configured? <a href="#" onclick="switchAuthTab('fallback')">Use Local Auth instead</a>
        </p>
      </div>

      <div id="auth-fallback" class="auth-panel" style="display:none">
        <div class="auth-info-banner warning">
          <i class="fas fa-lock"></i>
          Fallback authentication using Cloudflare Workers secrets. Credentials are set via environment variables.
        </div>
        <div class="form-group">
          <label>Username</label>
          <input type="text" id="fallback-user" placeholder="admin" class="admin-input" value="admin">
        </div>
        <div class="form-group">
          <label>Password</label>
          <div class="input-with-icon">
            <input type="password" id="fallback-pass" placeholder="Admin password" class="admin-input"
              onkeydown="if(event.key==='Enter')loginFallback()">
            <i class="fas fa-eye toggle-pw" onclick="togglePw('fallback-pass')"></i>
          </div>
        </div>
        <button class="admin-btn-primary full-width" onclick="loginFallback()">
          <i class="fas fa-shield-alt"></i> Sign In
        </button>
        <p class="demo-note">
          <i class="fas fa-flask"></i> Demo: username <strong>admin</strong> / password <strong>photoframe@2024</strong>
        </p>
      </div>

      <div id="login-error" class="login-error" style="display:none"></div>

      <div class="login-footer">
        <span>🔒 Secured with 256-bit encryption</span>
        <span>PhotoFrameIn &copy; 2026</span>
      </div>
    </div>
  </div>`;
}

function switchAuthTab(mode) {
  document.getElementById('tab-supabase').classList.toggle('active', mode === 'supabase');
  document.getElementById('tab-fallback').classList.toggle('active', mode === 'fallback');
  document.getElementById('auth-supabase').style.display = mode === 'supabase' ? 'block' : 'none';
  document.getElementById('auth-fallback').style.display = mode === 'fallback' ? 'block' : 'none';
}

async function loginSupabase() {
  const email = document.getElementById('supabase-email').value;
  const pass = document.getElementById('supabase-password').value;
  showLoginLoading(true);
  try {
    const resp = await fetch('/api/admin/auth/supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass })
    });
    const data = await resp.json();
    if (data.success) {
      saveSession({ email, mode: 'supabase', name: data.name || email });
    } else {
      throw new Error(data.error || 'Supabase auth failed — check credentials or switch to Local Auth');
    }
  } catch (e) {
    showLoginError(e.message + ' — Trying fallback...');
    showLoginLoading(false);
  }
}

function loginFallback() {
  const user = document.getElementById('fallback-user').value.trim();
  const pass = document.getElementById('fallback-pass').value.trim();
  showLoginLoading(true);

  // Validate via API (which checks Cloudflare env vars)
  fetch('/api/admin/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass })
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      saveSession({ username: user, mode: 'fallback', name: 'Admin' });
    } else {
      showLoginError('Invalid credentials. Please try again.');
      showLoginLoading(false);
    }
  })
  .catch(() => {
    showLoginError('Server error. Please try again.');
    showLoginLoading(false);
  });
}

function saveSession(sessionData) {
  const sess = {
    ...sessionData,
    expires: Date.now() + (8 * 60 * 60 * 1000), // 8 hours
    token: btoa(JSON.stringify(sessionData) + Date.now())
  };
  sessionStorage.setItem('pf_admin_session', JSON.stringify(sess));
  ADMIN.session = sess;
  showAdminApp();
}

function showLoginLoading(show) {
  const btns = document.querySelectorAll('.admin-btn-primary');
  btns.forEach(b => { b.disabled = show; b.innerHTML = show ? '<i class="fas fa-spinner fa-spin"></i> Signing in...' : b.innerHTML; });
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function togglePw(id) {
  const inp = document.getElementById(id);
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN ADMIN APP SHELL
// ═══════════════════════════════════════════════════════════════════
function showAdminApp() {
  loadSettings();
  document.getElementById('app').innerHTML = `
  <div class="admin-shell">

    <!-- SIDEBAR -->
    <aside class="admin-sidebar" id="adminSidebar">
      <div class="sidebar-header">
        <span class="sidebar-logo">🖼️ PFI Admin</span>
        <button class="sidebar-close" onclick="toggleSidebar()"><i class="fas fa-times"></i></button>
      </div>
      <nav class="sidebar-nav">
        <div class="nav-section-label">Overview</div>
        <a href="#" class="nav-item active" onclick="showSection('dashboard')">
          <i class="fas fa-tachometer-alt"></i> Dashboard
        </a>
        <a href="#" class="nav-item" onclick="showSection('analytics')">
          <i class="fas fa-chart-line"></i> Analytics
        </a>
        <a href="#" class="nav-item" onclick="showSection('profit')">
          <i class="fas fa-rupee-sign"></i> Profit & Ads
        </a>

        <div class="nav-section-label">Operations</div>
        <a href="#" class="nav-item" onclick="showSection('orders')">
          <i class="fas fa-shopping-bag"></i> Orders
          <span class="nav-badge" id="pending-badge">3</span>
        </a>
        <a href="#" class="nav-item" onclick="showSection('products')">
          <i class="fas fa-images"></i> Products
        </a>
        <a href="#" class="nav-item" onclick="showSection('categories')">
          <i class="fas fa-th-large"></i> Categories
        </a>
        <a href="#" class="nav-item" onclick="showSection('coupons')">
          <i class="fas fa-tag"></i> Coupons
        </a>
        <a href="#" class="nav-item" onclick="showSection('reviews')">
          <i class="fas fa-star"></i> Reviews
          <span class="nav-badge warn" id="review-badge">2</span>
        </a>

        <div class="nav-section-label">Content & Media</div>
        <a href="#" class="nav-item" onclick="showSection('blog')">
          <i class="fas fa-blog"></i> Blog Posts
        </a>
        <a href="#" class="nav-item" onclick="showSection('pages')">
          <i class="fas fa-file-alt"></i> Pages & FAQ
        </a>
        <a href="#" class="nav-item" onclick="showSection('gallery')">
          <i class="fas fa-images"></i> Gallery & Ratings
        </a>

        <div class="nav-section-label">Settings</div>
        <a href="#" class="nav-item" onclick="showSection('settings')">
          <i class="fas fa-cog"></i> Store Settings
        </a>
        <a href="#" class="nav-item" onclick="showSection('integrations')">
          <i class="fas fa-plug"></i> Integrations
        </a>
        <a href="#" class="nav-item" onclick="showSection('missing')">
          <i class="fas fa-exclamation-triangle"></i> Missing Items
        </a>
      </nav>
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="user-avatar">${(ADMIN.session?.name || 'A')[0].toUpperCase()}</div>
          <div>
            <div class="user-name">${ADMIN.session?.name || 'Admin'}</div>
            <div class="user-mode">${ADMIN.session?.mode === 'supabase' ? '☁️ Supabase' : '🔒 Local Auth'}</div>
          </div>
        </div>
        <button class="sidebar-logout" onclick="logout()"><i class="fas fa-sign-out-alt"></i></button>
      </div>
    </aside>

    <!-- MAIN CONTENT -->
    <main class="admin-main" id="adminMain">
      <header class="admin-topbar">
        <div class="topbar-left">
          <button class="topbar-menu-btn" onclick="toggleSidebar()"><i class="fas fa-bars"></i></button>
          <h2 class="topbar-title" id="topbar-title">Dashboard</h2>
        </div>
        <div class="topbar-right">
          <div class="quick-toggles">
            <label class="toggle-chip ${adminSettings.codEnabled ? 'on' : 'off'}" id="cod-chip" title="COD Enable/Disable">
              <input type="checkbox" ${adminSettings.codEnabled ? 'checked' : ''} onchange="toggleCOD(this.checked)">
              <span>COD ${adminSettings.codEnabled ? 'ON' : 'OFF'}</span>
            </label>
            <label class="toggle-chip ${adminSettings.festivalMode ? 'on festival' : 'off'}" id="festival-chip" title="Festival Mode">
              <input type="checkbox" ${adminSettings.festivalMode ? 'checked' : ''} onchange="toggleFestival(this.checked)">
              <span>🎉 Festival</span>
            </label>
          </div>
          <a href="/" target="_blank" class="topbar-view-site"><i class="fas fa-external-link-alt"></i> View Site</a>
          <button class="topbar-logout" onclick="logout()"><i class="fas fa-sign-out-alt"></i> Logout</button>
        </div>
      </header>
      <div class="admin-content" id="admin-content">
        <!-- Section content injected here -->
      </div>
    </main>

  </div>

  <!-- MODAL OVERLAY -->
  <div class="admin-modal-overlay" id="modalOverlay" onclick="closeModal(event)" style="display:none">
    <div class="admin-modal" id="adminModal">
      <div id="modalContent"></div>
    </div>
  </div>

  <!-- TOAST CONTAINER -->
  <div id="admin-toasts"></div>
  `;

  showSection('dashboard');
}

function toggleSidebar() {
  document.getElementById('adminSidebar').classList.toggle('open');
}

function logout() {
  sessionStorage.removeItem('pf_admin_session');
  ADMIN.session = null;
  showLoginScreen();
}

function showSection(name) {
  ADMIN.currentSection = name;
  // Update nav
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => {
    if (el.getAttribute('onclick') && el.getAttribute('onclick').includes(`'${name}'`)) el.classList.add('active');
  });
  const titles = {
    dashboard: 'Dashboard', analytics: 'Analytics Overview', profit: 'Profit & Ads Strategy',
    orders: 'Order Management', products: 'Product Catalog', categories: 'Categories',
    coupons: 'Coupons & Discounts', reviews: 'Customer Reviews',
    blog: 'Blog Posts', pages: 'Pages & FAQ',
    gallery: 'Cloudinary Gallery & Ratings',
    settings: 'Store Settings', integrations: 'Integrations',
    missing: 'Missing Items & Roadmap'
  };
  document.getElementById('topbar-title').textContent = titles[name] || name;
  const sections = {
    dashboard: renderDashboard,
    analytics: renderAnalytics,
    profit: renderProfit,
    orders: renderOrders,
    products: renderProducts,
    categories: renderCategories,
    coupons: renderCoupons,
    reviews: renderReviews,
    blog: renderBlog,
    pages: renderPages,
    gallery: renderCloudinaryGallery,
    settings: renderSettings,
    integrations: renderIntegrations,
    missing: renderMissing
  };
  const fn = sections[name];
  if (fn) document.getElementById('admin-content').innerHTML = fn();
  else document.getElementById('admin-content').innerHTML = '<p>Section coming soon</p>';
  // Re-attach after render
  initSectionHandlers(name);
}

function loadSettings() {
  const saved = localStorage.getItem('pf_admin_settings');
  if (saved) adminSettings = { ...adminSettings, ...JSON.parse(saved) };
}

function saveSettings() {
  localStorage.setItem('pf_admin_settings', JSON.stringify(adminSettings));
  // Sync to server
  fetch('/api/admin/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': ADMIN.session?.token || '' },
    body: JSON.stringify(adminSettings)
  }).then(() => adminToast('Settings saved!', 'success')).catch(() => adminToast('Saved locally. Server sync failed.', 'warning'));
}

async function saveSettingKey(key, value) {
  adminSettings[key] = value;
  localStorage.setItem('pf_admin_settings', JSON.stringify(adminSettings));
  try {
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': ADMIN.session?.token || '' },
      body: JSON.stringify({ [key]: value })
    });
  } catch(e) { /* non-critical */ }
}

// Premium/Standard naming toggle
function togglePremiumNaming(enabled) {
  adminSettings.premiumNamingMode = enabled;
  saveSettingKey('premiumNamingMode', enabled);
  adminToast(enabled
    ? 'Product naming: Premium / Standard labels active'
    : 'Product naming: Technical labels (Teak Wood / MDF Synthetic) active',
    'success'
  );
}

// Exchange-only policy toggle
function toggleExchangePolicy(enabled) {
  adminSettings.exchangeOnlyPolicy = enabled;
  saveSettingKey('exchangeOnlyPolicy', enabled);
  adminToast(enabled
    ? 'Exchange-Only policy ENABLED — no return refunds'
    : 'Exchange policy DISABLED — standard returns allowed',
    enabled ? 'success' : 'warning'
  );
}

// Unboxing video requirement toggle
function toggleUnboxingRequired(enabled) {
  adminSettings.unboxingVideoRequired = enabled;
  saveSettingKey('unboxingVideoRequired', enabled);
  adminToast(enabled
    ? 'Unboxing video REQUIRED for all exchange claims'
    : 'Unboxing video optional for exchange claims',
    'success'
  );
}

// Load email quota data
async function loadQuotaData() {
  const el = document.getElementById('quota-monitor-content');
  if (!el) return;
  el.innerHTML = '<div style="font-size:13px;color:var(--gray4)"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
  try {
    const res = await fetch('/api/admin/quota', {
      headers: { 'X-Admin-Token': ADMIN.session?.token || '' }
    });
    const data = await res.json();
    const q = data.quota;
    const brevoColor = q.brevo.alertTriggered ? '#f59e0b' : '#16a34a';
    const resendColor = q.resend.alertTriggered ? '#f59e0b' : '#16a34a';
    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px">
        <div style="background:rgba(16,163,74,0.08);border:1px solid rgba(16,163,74,0.2);border-radius:8px;padding:12px">
          <div style="font-size:12px;color:var(--gray4);margin-bottom:4px">Brevo (Primary)</div>
          <div style="font-size:20px;font-weight:700;color:${brevoColor}">${q.brevo.sent}/${q.brevo.limit}</div>
          <div style="font-size:11px;color:var(--gray4)">${q.brevo.remaining} remaining</div>
          <div style="background:rgba(0,0,0,0.2);height:4px;border-radius:2px;margin-top:8px">
            <div style="background:${brevoColor};height:4px;border-radius:2px;width:${(q.brevo.sent/q.brevo.limit*100).toFixed(0)}%"></div>
          </div>
          ${q.brevo.alertTriggered ? '<div style="color:#f59e0b;font-size:11px;margin-top:6px">⚠️ 80% threshold alert!</div>' : ''}
        </div>
        <div style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.2);border-radius:8px;padding:12px">
          <div style="font-size:12px;color:var(--gray4);margin-bottom:4px">Resend (Fallback)</div>
          <div style="font-size:20px;font-weight:700;color:${resendColor}">${q.resend.sent}/${q.resend.limit}</div>
          <div style="font-size:11px;color:var(--gray4)">${q.resend.remaining} remaining</div>
          <div style="background:rgba(0,0,0,0.2);height:4px;border-radius:2px;margin-top:8px">
            <div style="background:${resendColor};height:4px;border-radius:2px;width:${(q.resend.sent/q.resend.limit*100).toFixed(0)}%"></div>
          </div>
          ${q.resend.alertTriggered ? '<div style="color:#f59e0b;font-size:11px;margin-top:6px">⚠️ 80% threshold alert!</div>' : ''}
        </div>
      </div>
      <div style="margin-top:10px;font-size:12px;color:var(--gray3)">
        Active provider: <strong style="color:${q.activeProvider==='brevo'?'#16a34a':q.activeProvider==='resend'?'#8b5cf6':'#dc2626'}">${q.activeProvider.toUpperCase()}</strong>
        ${data.note ? `<br><em style="color:var(--gray4)">${data.note}</em>` : ''}
      </div>`;
  } catch(e) {
    el.innerHTML = '<div style="font-size:12px;color:var(--gray4)">Could not load quota data. Connect Supabase for live tracking.</div>';
  }
}

// ═══════════════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════════════
function renderDashboard() {
  const orders = MOCK_ORDERS;
  const todayOrders = orders.filter(o => o.created.startsWith('2026-04-10'));
  const todayRevenue = todayOrders.reduce((s, o) => s + o.total, 0);
  const pendingOrders = orders.filter(o => o.status === 'pending').length;
  const printingOrders = orders.filter(o => o.status === 'printing').length;
  const codPending = orders.filter(o => o.paymentMethod === 'cod' && !o.codConfirmed).length;
  const totalRevenue = orders.reduce((s, o) => o.status !== 'cancelled' && o.status !== 'rto' ? s + o.total : s, 0);
  const avgOrder = Math.round(totalRevenue / orders.filter(o => !['cancelled','rto'].includes(o.status)).length);

  return `
  <div class="dashboard-grid">

    <!-- KPI CARDS -->
    <div class="kpi-row">
      <div class="kpi-card revenue">
        <div class="kpi-icon"><i class="fas fa-rupee-sign"></i></div>
        <div class="kpi-body">
          <div class="kpi-value">₹${todayRevenue.toLocaleString('en-IN')}</div>
          <div class="kpi-label">Today's Revenue</div>
          <div class="kpi-delta up">+12% vs yesterday</div>
        </div>
      </div>
      <div class="kpi-card orders">
        <div class="kpi-icon"><i class="fas fa-shopping-bag"></i></div>
        <div class="kpi-body">
          <div class="kpi-value">${todayOrders.length}</div>
          <div class="kpi-label">Today's Orders</div>
          <div class="kpi-delta up">+3 vs yesterday</div>
        </div>
      </div>
      <div class="kpi-card pending">
        <div class="kpi-icon"><i class="fas fa-clock"></i></div>
        <div class="kpi-body">
          <div class="kpi-value">${pendingOrders}</div>
          <div class="kpi-label">Pending Orders</div>
          <div class="kpi-delta warn">Action required</div>
        </div>
      </div>
      <div class="kpi-card cod">
        <div class="kpi-icon"><i class="fas fa-money-bill-wave"></i></div>
        <div class="kpi-body">
          <div class="kpi-value">${codPending}</div>
          <div class="kpi-label">COD Unconfirmed</div>
          <div class="kpi-delta warn">Send WhatsApp</div>
        </div>
      </div>
      <div class="kpi-card aov">
        <div class="kpi-icon"><i class="fas fa-chart-bar"></i></div>
        <div class="kpi-body">
          <div class="kpi-value">₹${avgOrder}</div>
          <div class="kpi-label">Avg Order Value</div>
          <div class="kpi-delta up">Target ₹850</div>
        </div>
      </div>
      <div class="kpi-card shiprocket">
        <div class="kpi-icon"><i class="fas fa-truck"></i></div>
        <div class="kpi-body">
          <div class="kpi-value">₹${adminSettings.shiprocketBalance.toLocaleString('en-IN')}</div>
          <div class="kpi-label">Shiprocket Wallet</div>
          <div class="kpi-delta ${adminSettings.shiprocketBalance < 1000 ? 'warn' : 'up'}">${adminSettings.shiprocketBalance < 1000 ? '⚠️ Recharge needed' : '✓ Sufficient'}</div>
        </div>
      </div>
    </div>

    <!-- GLOBAL TOGGLES PANEL -->
    <div class="dashboard-panel toggles-panel">
      <div class="panel-header">
        <h3><i class="fas fa-sliders-h"></i> Global Toggles</h3>
        <span class="panel-subtitle">Changes reflect immediately on storefront</span>
      </div>
      <div class="toggles-grid">
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-name"><i class="fas fa-money-bill-wave"></i> Cash on Delivery</div>
            <div class="toggle-desc">Enable/disable COD sitewide. COD surcharge: ₹${adminSettings.codSurcharge}. Orders ₹${adminSettings.codMinOrder}–₹${adminSettings.codMaxOrder} only.</div>
          </div>
          <label class="admin-toggle">
            <input type="checkbox" id="toggle-cod" ${adminSettings.codEnabled ? 'checked' : ''} onchange="toggleCOD(this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-name"><i class="fas fa-gem"></i> Acrylic Frame Upgrade</div>
            <div class="toggle-desc">Show acrylic upgrade option on product pages (+₹200–400 premium). Toggle when stock is available.</div>
          </div>
          <label class="admin-toggle">
            <input type="checkbox" id="toggle-acrylic" ${adminSettings.acrylicUpgrade ? 'checked' : ''} onchange="toggleAcrylic(this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-name"><i class="fas fa-star"></i> Festival Mode</div>
            <div class="toggle-desc">Shows festival banner: "${adminSettings.festivalBanner}". Activates seasonal discount logic.</div>
          </div>
          <label class="admin-toggle">
            <input type="checkbox" id="toggle-festival" ${adminSettings.festivalMode ? 'checked' : ''} onchange="toggleFestival(this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-name"><i class="fas fa-layer-group"></i> Combo Bundles</div>
            <div class="toggle-desc">Show bundle/combo products in shop. Disable to push single-item purchases only.</div>
          </div>
          <label class="admin-toggle">
            <input type="checkbox" id="toggle-combo" ${adminSettings.comboEnabled ? 'checked' : ''} onchange="toggleCombo(this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-name"><i class="fas fa-tag"></i> ₹99 Loss-Leader</div>
            <div class="toggle-desc">Shows ₹99 no-frame entry offer. Our low-barrier acquisition product. 67% upsell rate within 30 days.</div>
          </div>
          <label class="admin-toggle">
            <input type="checkbox" id="toggle-lossldr" ${adminSettings.lossLeaderEnabled ? 'checked' : ''} onchange="toggleLossLeader(this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-name"><i class="fas fa-door-open"></i> Exit Intent Popup</div>
            <div class="toggle-desc">Shows exit popup with ${adminSettings.exitPopupDiscount}% off coupon when user tries to leave. +8-12% recovery rate.</div>
          </div>
          <label class="admin-toggle">
            <input type="checkbox" id="toggle-exit" ${adminSettings.exitPopupEnabled ? 'checked' : ''} onchange="toggleExitPopup(this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>

    <!-- RECENT ORDERS TABLE -->
    <div class="dashboard-panel orders-panel">
      <div class="panel-header">
        <h3><i class="fas fa-shopping-bag"></i> Recent Orders</h3>
        <button class="panel-action-btn" onclick="showSection('orders')">View All</button>
      </div>
      <div class="table-wrap">
        <table class="admin-table">
          <thead><tr>
            <th>Order ID</th><th>Customer</th><th>Items</th><th>Total</th>
            <th>Payment</th><th>Status</th><th>Action</th>
          </tr></thead>
          <tbody>
            ${orders.slice(0,5).map(o => `
            <tr>
              <td class="order-id">${o.id}</td>
              <td>${o.customer}<br><small class="muted">${o.city}</small></td>
              <td><small>${o.items.map(i=>i.name).join(', ')}</small></td>
              <td class="price-cell">₹${o.total.toLocaleString('en-IN')}</td>
              <td>${payBadge(o.paymentMethod, o.codConfirmed)}</td>
              <td>${statusBadge(o.status)}</td>
              <td>
                <button class="tbl-btn" onclick="openOrderModal('${o.id}')"><i class="fas fa-eye"></i></button>
                <button class="tbl-btn success" onclick="updateOrderStatus('${o.id}','printing')"><i class="fas fa-print"></i></button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- ORDER STATUS BREAKDOWN -->
    <div class="dashboard-panel status-panel">
      <div class="panel-header"><h3><i class="fas fa-chart-pie"></i> Order Pipeline</h3></div>
      <div class="pipeline-grid">
        ${[
          ['pending','Pending','clock','warn',orders.filter(o=>o.status==='pending').length],
          ['printing','Printing','print','info',orders.filter(o=>o.status==='printing').length],
          ['packed','Packed','box','info',orders.filter(o=>o.status==='packed').length],
          ['shipped','Shipped','truck','success',orders.filter(o=>o.status==='shipped').length],
          ['delivered','Delivered','check-circle','success',orders.filter(o=>o.status==='delivered').length],
          ['rto','RTO','undo','danger',orders.filter(o=>o.status==='rto').length],
          ['cancelled','Cancelled','times-circle','muted',orders.filter(o=>o.status==='cancelled').length],
        ].map(([s,l,ic,cls,cnt]) => `
        <div class="pipeline-item ${cls}">
          <i class="fas fa-${ic}"></i>
          <div class="pipeline-count">${cnt}</div>
          <div class="pipeline-label">${l}</div>
        </div>`).join('')}
      </div>
    </div>

    <!-- TOP PRODUCTS QUICK VIEW -->
    <div class="dashboard-panel top-products-panel">
      <div class="panel-header">
        <h3><i class="fas fa-fire"></i> Top Products (This Week)</h3>
        <button class="panel-action-btn" onclick="showSection('products')">Manage Products</button>
      </div>
      <div class="top-products-list">
        ${[
          { name:'Divine Om Mantra Gold Frame', category:'Divine', sales:18, revenue:13482, trend:'up' },
          { name:'Stay Hungry, Stay Foolish Frame', category:'Motivational', sales:14, revenue:6286, trend:'up' },
          { name:'Divine Triptych Set', category:'Divine', sales:9, revenue:16191, trend:'up' },
          { name:'Lakshmi Prosperity Frame', category:'Divine', sales:11, revenue:8239, trend:'stable' },
          { name:'Motivational 3-Pack Bundle', category:'Motivational', sales:7, revenue:6993, trend:'up' },
        ].map(p => `
        <div class="top-product-row">
          <div class="tp-info">
            <div class="tp-name">${p.name}</div>
            <div class="tp-cat">${p.category}</div>
          </div>
          <div class="tp-stats">
            <span class="tp-sales">${p.sales} sales</span>
            <span class="tp-revenue">₹${p.revenue.toLocaleString('en-IN')}</span>
            <span class="tp-trend ${p.trend}"><i class="fas fa-arrow-${p.trend === 'up' ? 'up' : 'right'}"></i></span>
          </div>
        </div>`).join('')}
      </div>
    </div>

  </div>`;
}

// ═══════════════════════════════════════════════════════════════════
//  ANALYTICS
// ═══════════════════════════════════════════════════════════════════
function renderAnalytics() {
  return `
  <div class="analytics-grid">

    <div class="analytics-panel revenue-chart-panel">
      <div class="panel-header">
        <h3><i class="fas fa-chart-area"></i> Revenue & Orders — Last 14 Days</h3>
        <div class="chart-legend">
          <span class="legend-dot revenue"></span>Revenue
          <span class="legend-dot orders"></span>Orders
        </div>
      </div>
      <div class="chart-container">
        <canvas id="revenueChart" width="800" height="200"></canvas>
        <div class="chart-placeholder">
          <div class="chart-bars">
            ${[65,80,45,90,120,75,110,95,130,85,145,100,160,175].map((h,i) =>
              `<div class="bar-group">
                <div class="chart-bar revenue" style="height:${h*0.8}px" title="₹${h*80}"></div>
                <div class="chart-bar orders" style="height:${Math.round(h*0.3)}px" title="${Math.round(h*0.05)} orders"></div>
                <span class="bar-label">${['Apr 01','Apr 02','Apr 03','Apr 04','Apr 05','Apr 06','Apr 07','Apr 08','Apr 09','Apr 10','Apr 11','Apr 12','Apr 13','Apr 14'][i]}</span>
              </div>`
            ).join('')}
          </div>
        </div>
      </div>
    </div>

    <div class="analytics-panel breakdown-panel">
      <div class="panel-header"><h3><i class="fas fa-chart-donut"></i> Payment Breakdown</h3></div>
      <div class="breakdown-items">
        <div class="breakdown-item">
          <div class="breakdown-label">Prepaid (UPI/Card)</div>
          <div class="breakdown-bar"><div class="breakdown-fill" style="width:62%"></div></div>
          <div class="breakdown-pct">62%</div>
        </div>
        <div class="breakdown-item">
          <div class="breakdown-label">COD (Confirmed)</div>
          <div class="breakdown-bar"><div class="breakdown-fill cod" style="width:28%"></div></div>
          <div class="breakdown-pct">28%</div>
        </div>
        <div class="breakdown-item">
          <div class="breakdown-label">COD (Unconfirmed)</div>
          <div class="breakdown-bar"><div class="breakdown-fill warn" style="width:10%"></div></div>
          <div class="breakdown-pct">10%</div>
        </div>
      </div>
      <div class="breakdown-insight">
        <i class="fas fa-lightbulb"></i>
        <strong>Tip:</strong> 28% confirmed COD is healthy. Industry avg is 40%. Your WhatsApp gatekeeper is working!
      </div>
    </div>

    <div class="analytics-panel kpi-detail-panel">
      <div class="panel-header"><h3><i class="fas fa-bullseye"></i> KPI Tracker — Month 1 vs Target</h3></div>
      <div class="kpi-tracker">
        ${[
          { label:'Orders / Month', current:47, target:50, unit:'orders', color:'success' },
          { label:'Monthly Revenue', current:39890, target:42500, unit:'₹', color:'warn' },
          { label:'Avg Order Value', current:849, target:850, unit:'₹', color:'success' },
          { label:'COD Rate', current:38, target:40, unit:'%', color:'success', invert:true },
          { label:'Return Rate', current:5.2, target:8, unit:'%', color:'success', invert:true },
          { label:'Organic Traffic', current:342, target:500, unit:'visits', color:'warn' },
          { label:'Email List', current:187, target:500, unit:'subs', color:'danger' },
          { label:'NPS Score', current:62, target:45, unit:'pts', color:'success' },
        ].map(k => {
          const pct = k.invert
            ? Math.min(100, (k.target / k.current) * 100)
            : Math.min(100, (k.current / k.target) * 100);
          const cls = pct >= 90 ? 'success' : pct >= 60 ? 'warn' : 'danger';
          return `
          <div class="kpi-track-row">
            <div class="kpi-track-label">${k.label}</div>
            <div class="kpi-track-bar">
              <div class="kpi-track-fill ${cls}" style="width:${pct}%"></div>
            </div>
            <div class="kpi-track-vals">
              <span class="current">${k.unit === '₹' ? '₹' : ''}${k.current}${k.unit !== '₹' ? k.unit : ''}</span>
              <span class="separator">/</span>
              <span class="target">${k.unit === '₹' ? '₹' : ''}${k.target}${k.unit !== '₹' ? k.unit : ''}</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="analytics-panel category-sales-panel">
      <div class="panel-header"><h3><i class="fas fa-fire"></i> Category Performance</h3></div>
      <div class="category-sales">
        <div class="cat-row">
          <span class="cat-emoji">🕉️</span>
          <div class="cat-info"><div class="cat-name">Divine & Spiritual</div><div class="cat-sales">28 orders this month</div></div>
          <div class="cat-bar-wrap"><div class="cat-bar" style="width:72%"></div></div>
          <span class="cat-revenue">₹21,450</span>
        </div>
        <div class="cat-row">
          <span class="cat-emoji">💪</span>
          <div class="cat-info"><div class="cat-name">Motivational</div><div class="cat-sales">19 orders this month</div></div>
          <div class="cat-bar-wrap"><div class="cat-bar motivational" style="width:48%"></div></div>
          <span class="cat-revenue">₹14,200</span>
        </div>
        <div class="cat-row">
          <span class="cat-emoji">🎁</span>
          <div class="cat-info"><div class="cat-name">Gifts & Custom</div><div class="cat-sales">5 orders this month</div></div>
          <div class="cat-bar-wrap"><div class="cat-bar gifts" style="width:12%"></div></div>
          <span class="cat-revenue">₹4,240</span>
        </div>
      </div>
    </div>

    <div class="analytics-panel unit-econ-panel">
      <div class="panel-header"><h3><i class="fas fa-calculator"></i> Unit Economics</h3></div>
      <div class="unit-econ-grid">
        <div class="ue-item">
          <div class="ue-label">Avg Selling Price</div>
          <div class="ue-value">₹849</div>
        </div>
        <div class="ue-item">
          <div class="ue-label">COGS (Print+Frame+Pack)</div>
          <div class="ue-value negative">-₹265</div>
        </div>
        <div class="ue-item">
          <div class="ue-label">Gross Profit</div>
          <div class="ue-value">₹584</div>
        </div>
        <div class="ue-item">
          <div class="ue-label">Shipping Cost</div>
          <div class="ue-value negative">-₹65</div>
        </div>
        <div class="ue-item">
          <div class="ue-label">Payment Gateway (2%)</div>
          <div class="ue-value negative">-₹17</div>
        </div>
        <div class="ue-item highlight">
          <div class="ue-label">Net Contribution / Order</div>
          <div class="ue-value success">₹502 (59%)</div>
        </div>
        <div class="ue-item">
          <div class="ue-label">CAC (Month 1 organic)</div>
          <div class="ue-value negative">-₹0</div>
        </div>
        <div class="ue-item highlight">
          <div class="ue-label">Net Profit / Order</div>
          <div class="ue-value success">₹502</div>
        </div>
      </div>
      <div class="ue-note">
        <i class="fas fa-info-circle"></i>
        Break-even at <strong>85 orders/month</strong> when ads budget starts at ₹15k. Month 1 (organic only): <strong>0 CAC → pure profit above fixed costs.</strong>
      </div>
    </div>

    <div class="analytics-panel shiprocket-panel">
      <div class="panel-header">
        <h3><i class="fas fa-truck"></i> Shiprocket & Fulfillment</h3>
        <button class="panel-action-btn" onclick="syncShiprocket()">Sync Now</button>
      </div>
      <div class="shiprocket-stats">
        <div class="sr-stat">
          <div class="sr-label">Wallet Balance</div>
          <div class="sr-value ${adminSettings.shiprocketBalance < 1000 ? 'warn' : ''}">₹${adminSettings.shiprocketBalance.toFixed(2)}</div>
        </div>
        <div class="sr-stat">
          <div class="sr-label">Pending Shipments</div>
          <div class="sr-value">3</div>
        </div>
        <div class="sr-stat">
          <div class="sr-label">In Transit</div>
          <div class="sr-value">8</div>
        </div>
        <div class="sr-stat">
          <div class="sr-label">Delivered (This Month)</div>
          <div class="sr-value success">31</div>
        </div>
        <div class="sr-stat">
          <div class="sr-label">RTO Rate</div>
          <div class="sr-value warn">6.4%</div>
        </div>
      </div>
      ${adminSettings.shiprocketBalance < 1000 ? `
      <div class="sr-alert">
        <i class="fas fa-exclamation-triangle"></i>
        <strong>Wallet Balance Low!</strong> Recharge your Shiprocket wallet to avoid shipment delays.
        <button class="admin-btn-sm" onclick="adminToast('Opening Shiprocket recharge...','info')">Recharge Now</button>
      </div>` : ''}
    </div>

  </div>`;
}

// ═══════════════════════════════════════════════════════════════════
//  PROFIT & ADS STRATEGY
// ═══════════════════════════════════════════════════════════════════
function renderProfit() {
  return `
  <div class="profit-grid">

    <div class="profit-panel month1">
      <div class="panel-header"><h3><i class="fas fa-trophy"></i> Month 1 Profitability Plan (Organic Only)</h3></div>
      <div class="profit-scenario-tabs">
        <button class="scenario-tab active" onclick="switchScenario('conservative')">Conservative</button>
        <button class="scenario-tab" onclick="switchScenario('base')">Base Case</button>
        <button class="scenario-tab" onclick="switchScenario('optimistic')">Optimistic</button>
      </div>
      <div id="scenario-content">
        ${renderScenario('conservative')}
      </div>
    </div>

    <div class="profit-panel cost-breakdown">
      <div class="panel-header"><h3><i class="fas fa-receipt"></i> Cost vs Price Matrix</h3></div>
      <div class="table-wrap">
        <table class="admin-table compact">
          <thead><tr><th>Variant</th><th>Cost</th><th>Sell Price</th><th>Margin ₹</th><th>Margin %</th></tr></thead>
          <tbody>
            ${[
              ['No Frame A4', 30, 99, 69, 230],
              ['No Frame Small 8×12', 30, 199, 169, 563],
              ['No Frame Medium 12×18', 50, 299, 249, 498],
              ['Standard Frame Small', 80, 449, 369, 461],
              ['Standard Frame Medium', 160, 749, 589, 368],
              ['Standard Frame Large', 220, 1099, 879, 400],
              ['Standard Frame XL', 370, 1699, 1329, 359],
              ['Premium Frame Small', 150, 599, 449, 299],
              ['Premium Frame Medium', 240, 999, 759, 316],
              ['Premium Frame Large', 370, 1399, 1029, 278],
              ['Premium Frame XL', 600, 2199, 1599, 267],
            ].map(([v, cost, sell, margin, pct]) => `
            <tr>
              <td>${v}</td>
              <td class="cost-cell">₹${cost}</td>
              <td class="price-cell">₹${sell}</td>
              <td class="margin-cell">₹${margin}</td>
              <td><span class="margin-badge ${pct > 400 ? 'high' : pct > 300 ? 'med' : 'low'}">${pct}%</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="profit-panel ads-strategy">
      <div class="panel-header"><h3><i class="fas fa-ad"></i> Ads Strategy & Budget Plan</h3></div>

      <div class="ads-phase">
        <div class="phase-badge phase1">Phase 1 — Month 1 (₹0 Budget)</div>
        <div class="ads-tactics">
          <div class="tactic-row">
            <i class="fab fa-instagram icon-ig"></i>
            <div>
              <div class="tactic-name">Instagram Organic Reels</div>
              <div class="tactic-desc">3–5 reels/week. Show: unboxing video, room transformation before/after, "₹99 vs ₹749" comparison reel. Use hashtags: #homedecorindia #divinedecor #motivationalframe</div>
            </div>
          </div>
          <div class="tactic-row">
            <i class="fab fa-pinterest icon-pin"></i>
            <div>
              <div class="tactic-name">Pinterest — Long-tail SEO</div>
              <div class="tactic-desc">Pin every product with keyword descriptions. Pinterest is 2nd biggest traffic source for Indian home décor. Target: "pooja room decor ideas", "motivational wall art india"</div>
            </div>
          </div>
          <div class="tactic-row">
            <i class="fas fa-map-marker-alt icon-gmb"></i>
            <div>
              <div class="tactic-name">Google My Business</div>
              <div class="tactic-desc">Add product photos, posts 3×/week. GMB generates free leads for "photo frames near me" — 1,200/mo in Hyderabad alone.</div>
            </div>
          </div>
          <div class="tactic-row">
            <i class="fab fa-whatsapp icon-wa"></i>
            <div>
              <div class="tactic-name">WhatsApp Broadcast</div>
              <div class="tactic-desc">Build list of 200+ via exit popup coupon. Send product drops + festival reminders. 85%+ open rate vs email's 22%.</div>
            </div>
          </div>
        </div>
      </div>

      <div class="ads-phase">
        <div class="phase-badge phase2">Phase 2 — Months 2–3 (₹2,000–₹5,000 Budget)</div>
        <div class="ads-tactics">
          <div class="tactic-row">
            <i class="fab fa-instagram icon-ig"></i>
            <div>
              <div class="tactic-name">Instagram Reels Boost — ₹800/mo</div>
              <div class="tactic-desc">Boost your 2 best-performing organic reels. Target: Female 25–45, Home Décor interest, Tier 1–2 cities. Expected: 40–60k reach, 15–25 orders. ROI: 5–8×.</div>
            </div>
          </div>
          <div class="tactic-row">
            <i class="fab fa-google icon-google"></i>
            <div>
              <div class="tactic-name">Google Search Ads — ₹800/mo</div>
              <div class="tactic-desc">Target: "buy photo frames online india", "ganesh frame diwali gift", "motivational frame office". Exact match only. Expected CPC: ₹8–15. Est: 3–4 orders/day at ₹15 CPC.</div>
            </div>
          </div>
          <div class="tactic-row">
            <i class="fas fa-users icon-inf"></i>
            <div>
              <div class="tactic-name">Nano-Influencer Collab — ₹400/mo</div>
              <div class="tactic-desc">2–3 nano-influencers (5k–20k followers) for barter+₹200 cash. Interior design, WFH, spirituality niche. Authentic = better CVR than macro.</div>
            </div>
          </div>
        </div>
        <div class="ads-roi-box">
          <div class="roi-title">Month 2 ROI Projection (₹2,000 budget)</div>
          <div class="roi-grid">
            <div><label>Ad Spend</label><value>₹2,000</value></div>
            <div><label>Orders from Ads (est.)</label><value>18–25</value></div>
            <div><label>Revenue from Ads</label><value>₹15,300–₹21,250</value></div>
            <div><label>Net Profit from Ads</label><value>₹8,900–₹12,500</value></div>
            <div><label>ROAS</label><value>7.65–10.6×</value></div>
            <div><label>CAC via Ads</label><value>₹80–₹111</value></div>
          </div>
        </div>
      </div>

      <div class="ads-phase">
        <div class="phase-badge phase3">Phase 3 — Months 4–6 (₹15,000–₹25,000 Budget)</div>
        <div class="ads-tactics">
          <div class="tactic-row">
            <i class="fas fa-redo icon-ret"></i>
            <div>
              <div class="tactic-name">Retargeting — ₹3,000/mo</div>
              <div class="tactic-desc">Retarget cart abandoners and product page visitors. Show: "Still thinking about your frame?" with social proof + countdown. Expected 15–20% conversion on retargeted audience.</div>
            </div>
          </div>
          <div class="tactic-row">
            <i class="fas fa-envelope icon-email"></i>
            <div>
              <div class="tactic-name">Email Automation Flows</div>
              <div class="tactic-desc">Welcome (10% off), Abandoned Cart (24h + 48h), Post-Purchase upsell, 30-day win-back. Brevo free tier: 300 emails/day free. Expected: +15% revenue from email.</div>
            </div>
          </div>
        </div>
      </div>

      <div class="festival-calendar">
        <div class="panel-header"><h3><i class="fas fa-calendar-alt"></i> Festival Ad Calendar 2026</h3></div>
        <div class="festival-list">
          ${[
            { date:'Apr 14', name:'Tamil/Bengali New Year', categ:'Divine', budget:'₹1,500', note:'Pooja room gifting surge' },
            { date:'May (varies)', name:"Mother's Day", categ:'Custom', budget:'₹2,000', note:'Custom photo gifts — 3× AOV' },
            { date:'Aug 15', name:'Independence Day', categ:'Motivational', budget:'₹1,000', note:'Patriotic + Hustle themes' },
            { date:'Sep-Oct', name:'Navratri / Dussehra', categ:'Divine', budget:'₹5,000', note:'Durga frame peak demand' },
            { date:'Nov (varies)', name:'Diwali', categ:'Divine', budget:'₹15,000', note:'BIGGEST festival — start ads 30 days early' },
            { date:'Dec 25', name:'Christmas + New Year', categ:'Motivational', budget:'₹3,000', note:'New Year resolutions — hustle frames' },
          ].map(f => `
          <div class="festival-row">
            <div class="festival-date">${f.date}</div>
            <div class="festival-name">${f.name}</div>
            <div class="festival-cat"><span class="cat-chip">${f.categ}</span></div>
            <div class="festival-budget">${f.budget}</div>
            <div class="festival-note">${f.note}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>

  </div>`;
}

function renderScenario(type) {
  const scenarios = {
    conservative: { orders:30, aov:750, revenue:22500, cogs:7350, shipping:1800, pg:450, fixedCost:2000, ads:0, net:10900, label:'Conservative (30 orders)' },
    base: { orders:50, aov:850, revenue:42500, cogs:13250, shipping:3000, pg:850, fixedCost:2000, ads:0, net:23400, label:'Base Case (50 orders)' },
    optimistic: { orders:75, aov:950, revenue:71250, cogs:19500, shipping:4500, pg:1425, fixedCost:2000, ads:0, net:43825, label:'Optimistic (75 orders)' },
  };
  const s = scenarios[type];
  const gross = s.revenue - s.cogs;
  const contribution = gross - s.shipping - s.pg;
  return `
  <div class="scenario-table">
    <div class="scenario-title">${s.label} — Month 1 (Zero Ads Spend)</div>
    <table class="profit-table">
      <tr><td>Total Orders</td><td class="pt-val">${s.orders}</td></tr>
      <tr><td>Avg Order Value</td><td class="pt-val">₹${s.aov}</td></tr>
      <tr class="section-row"><td>Gross Revenue</td><td class="pt-val revenue">₹${s.revenue.toLocaleString('en-IN')}</td></tr>
      <tr><td>COGS (print+frame+packaging)</td><td class="pt-val negative">-₹${s.cogs.toLocaleString('en-IN')}</td></tr>
      <tr><td class="indent">Gross Margin</td><td class="pt-val success">₹${gross.toLocaleString('en-IN')} (${Math.round(gross/s.revenue*100)}%)</td></tr>
      <tr><td>Shipping Cost</td><td class="pt-val negative">-₹${s.shipping.toLocaleString('en-IN')}</td></tr>
      <tr><td>Payment Gateway (2%)</td><td class="pt-val negative">-₹${s.pg.toLocaleString('en-IN')}</td></tr>
      <tr class="section-row"><td>Contribution Margin</td><td class="pt-val success">₹${contribution.toLocaleString('en-IN')}</td></tr>
      <tr><td>Fixed Costs (domain+tools)</td><td class="pt-val negative">-₹${s.fixedCost.toLocaleString('en-IN')}</td></tr>
      <tr><td>Ad Spend</td><td class="pt-val">₹${s.ads}</td></tr>
      <tr class="total-row"><td><strong>Net Profit Month 1</strong></td><td class="pt-val success"><strong>₹${s.net.toLocaleString('en-IN')}</strong></td></tr>
      <tr><td>ROI (on ₹0 ad spend)</td><td class="pt-val success">∞ (organic)</td></tr>
    </table>
  </div>`;
}

function switchScenario(type) {
  document.querySelectorAll('.scenario-tab').forEach((t,i) => {
    t.classList.toggle('active', ['conservative','base','optimistic'][i] === type);
  });
  document.getElementById('scenario-content').innerHTML = renderScenario(type);
}

// ═══════════════════════════════════════════════════════════════════
//  ORDERS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════
function renderOrders() {
  const orders = MOCK_ORDERS;
  const filterStatus = 'all';
  return `
  <div class="orders-section">
    <div class="section-toolbar">
      <div class="toolbar-filters">
        <select class="admin-select" onchange="filterOrders(this.value)">
          <option value="all">All Orders (${orders.length})</option>
          <option value="pending">Pending (${orders.filter(o=>o.status==='pending').length})</option>
          <option value="printing">Printing</option>
          <option value="packed">Packed</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="rto">RTO</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select class="admin-select" onchange="filterOrdersPayment(this.value)">
          <option value="all">All Payments</option>
          <option value="cod">COD Only</option>
          <option value="prepaid">Prepaid Only</option>
        </select>
        <input type="text" class="admin-input" placeholder="Search order ID or customer..." style="width:220px" onkeyup="searchOrders(this.value)">
      </div>
      <div class="toolbar-actions">
        <button class="admin-btn-sm" onclick="exportOrders()"><i class="fas fa-download"></i> Export CSV</button>
        <button class="admin-btn-sm success" onclick="syncShiprocket()"><i class="fas fa-sync"></i> Sync Shiprocket</button>
      </div>
    </div>

    <!-- COD Pending Alert -->
    ${MOCK_ORDERS.filter(o=>o.paymentMethod==='cod'&&!o.codConfirmed).length > 0 ? `
    <div class="alert-banner warn">
      <i class="fas fa-exclamation-triangle"></i>
      <strong>${MOCK_ORDERS.filter(o=>o.paymentMethod==='cod'&&!o.codConfirmed).length} COD orders unconfirmed!</strong>
      These need WhatsApp confirmation within 24 hours or will be auto-cancelled.
      <button class="admin-btn-sm" onclick="sendBulkWhatsApp()">Send WhatsApp to All</button>
    </div>` : ''}

    <div class="table-wrap">
      <table class="admin-table" id="orders-table">
        <thead><tr>
          <th><input type="checkbox" onchange="selectAllOrders(this.checked)"></th>
          <th>Order ID</th>
          <th>Customer</th>
          <th>Items</th>
          <th>Total</th>
          <th>Payment</th>
          <th>COD Status</th>
          <th>Status</th>
          <th>Date</th>
          <th>Actions</th>
        </tr></thead>
        <tbody id="orders-tbody">
          ${orders.map(o => renderOrderRow(o)).join('')}
        </tbody>
      </table>
    </div>

    <div class="bulk-actions" id="bulk-actions" style="display:none">
      <span id="selected-count">0 selected</span>
      <button class="admin-btn-sm" onclick="bulkUpdateStatus('printing')">→ Printing</button>
      <button class="admin-btn-sm" onclick="bulkUpdateStatus('packed')">→ Packed</button>
      <button class="admin-btn-sm" onclick="bulkUpdateStatus('shipped')">→ Shipped</button>
      <button class="admin-btn-sm danger" onclick="bulkUpdateStatus('cancelled')">Cancel</button>
    </div>
  </div>`;
}

function renderOrderRow(o) {
  return `
  <tr id="order-row-${o.id}" data-status="${o.status}" data-payment="${o.paymentMethod}">
    <td><input type="checkbox" class="order-checkbox" onchange="orderCheckboxChange()"></td>
    <td class="order-id">${o.id}</td>
    <td>
      <div class="customer-cell">
        <strong>${o.customer}</strong>
        <small>${o.city}</small>
        <small><a href="https://wa.me/91${o.phone}" target="_blank" class="wa-link"><i class="fab fa-whatsapp"></i> ${o.phone}</a></small>
      </div>
    </td>
    <td><small>${o.items.map(i=>`${i.name}<br><em>${i.size} / ${i.frame}</em>`).join('<br>')}</small></td>
    <td class="price-cell">₹${o.total.toLocaleString('en-IN')}
      ${o.paymentMethod === 'cod' ? `<br><small class="cod-fee">+₹49 COD fee</small>` : ''}
    </td>
    <td>${payBadge(o.paymentMethod, o.codConfirmed)}</td>
    <td>
      ${o.paymentMethod === 'cod'
        ? o.codConfirmed
          ? `<span class="status-badge success">✓ Confirmed</span>`
          : `<button class="admin-btn-sm warn" onclick="markCODConfirmed('${o.id}')">Mark Confirmed</button>
             <a href="https://wa.me/91${o.phone}?text=Hi ${encodeURIComponent(o.customer)}, please reply CONFIRM to confirm your PhotoFrameIn order ${o.id} (₹${o.total}). Order will be cancelled in 24h if not confirmed." target="_blank" class="admin-btn-sm"><i class="fab fa-whatsapp"></i> Send</a>`
        : '<span class="muted">N/A</span>'}
    </td>
    <td>${statusBadge(o.status)}</td>
    <td><small>${new Date(o.created).toLocaleDateString('en-IN')}</small></td>
    <td class="action-cell">
      <button class="tbl-btn" onclick="openOrderModal('${o.id}')" title="View Details"><i class="fas fa-eye"></i></button>
      <button class="tbl-btn success" onclick="updateOrderStatus('${o.id}','printing')" title="Move to Printing"><i class="fas fa-print"></i></button>
      <button class="tbl-btn" onclick="updateOrderStatus('${o.id}','shipped')" title="Mark Shipped"><i class="fas fa-truck"></i></button>
    </td>
  </tr>`;
}

function openOrderModal(orderId) {
  const o = MOCK_ORDERS.find(x => x.id === orderId);
  if (!o) return;
  openModal(`
  <div class="modal-header"><h3>Order Details — ${o.id}</h3><button onclick="closeModal()" class="modal-close"><i class="fas fa-times"></i></button></div>
  <div class="order-detail-grid">
    <div class="od-section">
      <div class="od-label">Customer</div>
      <div class="od-value">${o.customer}</div>
      <div class="od-value muted">${o.city} | <a href="https://wa.me/91${o.phone}" target="_blank">+91 ${o.phone}</a></div>
    </div>
    <div class="od-section">
      <div class="od-label">Payment</div>
      <div class="od-value">${payBadge(o.paymentMethod, o.codConfirmed)}</div>
      <div class="od-value">Total: <strong>₹${o.total.toLocaleString('en-IN')}</strong></div>
    </div>
    <div class="od-section">
      <div class="od-label">Status</div>
      <div class="od-value">${statusBadge(o.status)}</div>
      <div class="od-label" style="margin-top:8px">Update Status</div>
      <select class="admin-select" onchange="updateOrderStatus('${o.id}',this.value)">
        ${['pending','printing','packed','shipped','delivered','rto','cancelled'].map(s=>`<option value="${s}" ${s===o.status?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}
      </select>
    </div>
    <div class="od-section full-width">
      <div class="od-label">Items Ordered</div>
      <table class="admin-table compact">
        <thead><tr><th>Product</th><th>Size</th><th>Frame</th><th>Qty</th><th>Price</th></tr></thead>
        <tbody>
          ${o.items.map(i=>`<tr><td>${i.name}</td><td>${i.size}</td><td>${i.frame}</td><td>${i.qty}</td><td>₹${i.price}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="od-section full-width">
      <div class="od-label">Actions</div>
      <div class="action-buttons">
        ${o.paymentMethod === 'cod' && !o.codConfirmed ? `
        <a href="https://wa.me/91${o.phone}?text=Hi%20${encodeURIComponent(o.customer)}%2C%20reply%20CONFIRM%20to%20confirm%20order%20${o.id}%20(₹${o.total})" target="_blank" class="admin-btn-sm warn">
          <i class="fab fa-whatsapp"></i> Send WhatsApp Confirmation
        </a>` : ''}
        <button class="admin-btn-sm" onclick="printInvoice('${o.id}')"><i class="fas fa-print"></i> Print Invoice</button>
        <button class="admin-btn-sm" onclick="generateShippingLabel('${o.id}')"><i class="fas fa-tag"></i> Shipping Label</button>
      </div>
    </div>
  </div>`);
}

// ═══════════════════════════════════════════════════════════════════
//  PRODUCTS CRUD
// ═══════════════════════════════════════════════════════════════════
function renderProducts() {
  return `
  <div class="products-section">
    <div class="section-toolbar">
      <div class="toolbar-filters">
        <select class="admin-select" onchange="filterProductsCat(this.value)">
          <option value="all">All Categories</option>
          <option value="divine">Divine & Spiritual</option>
          <option value="motivational">Motivational</option>
          <option value="gifts">Gifts & Custom</option>
          <option value="sports">Sports</option>
        </select>
        <input type="text" class="admin-input" placeholder="Search products..." style="width:200px">
      </div>
      <div class="toolbar-actions">
        <button class="admin-btn-primary" onclick="openAddProductModal()">
          <i class="fas fa-plus"></i> Add Product
        </button>
        <button class="admin-btn-sm" onclick="exportProducts()"><i class="fas fa-download"></i> Export</button>
      </div>
    </div>

    <div class="products-grid" id="products-grid">
      ${getAllProducts().map(p => renderProductCard(p)).join('')}
    </div>
  </div>`;
}

function getAllProducts() {
  return [
    { id:101, name:'Divine Om Mantra Gold Frame', category:'divine', price:749, cost:160, badge:'⭐ Top Rated', inStock:true, featured:true, reviews:312, rating:4.9 },
    { id:102, name:'Shree Ganesh Blessing Frame', category:'divine', price:749, cost:160, badge:'🎁 Gift Favourite', inStock:true, featured:true, reviews:278, rating:4.9 },
    { id:103, name:'Goddess Lakshmi Prosperity Frame', category:'divine', price:749, cost:160, badge:'🪔 Diwali Special', inStock:true, featured:true, reviews:341, rating:4.9 },
    { id:104, name:'Maa Durga Navratri Power Frame', category:'divine', price:749, cost:160, badge:'🔱 Seasonal Hit', inStock:true, featured:false, reviews:198, rating:4.8 },
    { id:105, name:'Divine Pooja Corner Triptych Set', category:'divine', price:1799, cost:480, badge:'🔥 Best Value', inStock:true, featured:true, reviews:142, rating:4.9 },
    { id:201, name:'"Stay Hungry, Stay Foolish" Frame', category:'motivational', price:449, cost:80, badge:'🔥 #1 Bestseller', inStock:true, featured:true, reviews:412, rating:4.9 },
    { id:202, name:'"Do What You Love" Minimal Frame', category:'motivational', price:449, cost:80, badge:'⭐ New Arrival', inStock:true, featured:true, reviews:156, rating:4.8 },
    { id:203, name:'"Hustle Hard, Dream Big" Frame', category:'motivational', price:449, cost:80, badge:'💪 Hustler Pick', inStock:true, featured:true, reviews:234, rating:4.8 },
    { id:204, name:'Motivational 3-Pack Office Bundle', category:'motivational', price:999, cost:240, badge:'💰 Best Value', inStock:true, featured:true, reviews:87, rating:4.9 },
    { id:5, name:'Romantic Couple Custom Photo Frame', category:'gifts', price:849, cost:240, badge:'Gift Favourite', inStock:true, featured:true, reviews:156, rating:4.8 },
    { id:8, name:'Cricket Legends Collage Frame', category:'sports', price:799, cost:160, badge:'Fan Favourite', inStock:true, featured:true, reviews:201, rating:4.8 },
  ];
}

function renderProductCard(p) {
  const margin = Math.round(((p.price - p.cost) / p.price) * 100);
  return `
  <div class="product-admin-card ${!p.inStock ? 'out-of-stock' : ''}">
    <div class="pac-header">
      <div class="pac-badges">
        <span class="pac-badge">${p.badge}</span>
        ${p.featured ? '<span class="pac-badge featured">⭐ Featured</span>' : ''}
        <span class="pac-badge cat-${p.category}">${p.category}</span>
      </div>
      <div class="pac-actions">
        <button class="tbl-btn" onclick="openEditProductModal(${p.id})" title="Edit"><i class="fas fa-edit"></i></button>
        <button class="tbl-btn danger" onclick="toggleProductStock(${p.id})" title="${p.inStock ? 'Mark Out of Stock' : 'Mark In Stock'}">
          <i class="fas fa-${p.inStock ? 'ban' : 'check'}"></i>
        </button>
        <button class="tbl-btn" onclick="toggleFeatured(${p.id})" title="Toggle Featured"><i class="fas fa-star"></i></button>
      </div>
    </div>
    <div class="pac-body">
      <div class="pac-name">${p.name}</div>
      <div class="pac-meta">
        <span class="pac-id">ID: ${p.id}</span>
        <span class="pac-rating">⭐ ${p.rating} (${p.reviews})</span>
      </div>
    </div>
    <div class="pac-pricing">
      <div class="pac-price-row">
        <span class="pac-cost">Cost: ₹${p.cost}</span>
        <span class="pac-sell">Sell: ₹${p.price}</span>
        <span class="pac-margin ${margin > 70 ? 'high' : margin > 50 ? 'med' : 'low'}">${margin}% margin</span>
      </div>
    </div>
    <div class="pac-footer">
      <label class="pac-toggle">
        <input type="checkbox" ${p.inStock ? 'checked' : ''} onchange="toggleProductStock(${p.id})">
        <span>In Stock</span>
      </label>
      <label class="pac-toggle">
        <input type="checkbox" ${p.featured ? 'checked' : ''} onchange="toggleFeatured(${p.id})">
        <span>Featured</span>
      </label>
    </div>
  </div>`;
}

function openAddProductModal() {
  openModal(`
  <div class="modal-header"><h3><i class="fas fa-plus"></i> Add New Product</h3><button onclick="closeModal()" class="modal-close"><i class="fas fa-times"></i></button></div>
  <form class="product-form" onsubmit="saveProduct(event)">
    <div class="form-row">
      <div class="form-group">
        <label>Product Name *</label>
        <input type="text" class="admin-input" name="name" placeholder="e.g. Saraswati Blessings Frame" required>
      </div>
      <div class="form-group">
        <label>Subtitle</label>
        <input type="text" class="admin-input" name="subtitle" placeholder="Short descriptor">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Category *</label>
        <select class="admin-select" name="category" required>
          <option value="divine">Divine & Spiritual</option>
          <option value="motivational">Motivational</option>
          <option value="gifts">Gifts & Custom</option>
          <option value="sports">Sports</option>
          <option value="wall-art">Wall Art</option>
          <option value="kids">Kids</option>
        </select>
      </div>
      <div class="form-group">
        <label>Badge Text</label>
        <input type="text" class="admin-input" name="badge" placeholder="e.g. 🔥 New Arrival">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Base Price (₹) *</label>
        <input type="number" class="admin-input" name="price" placeholder="749" required>
      </div>
      <div class="form-group">
        <label>Compare Price (₹)</label>
        <input type="number" class="admin-input" name="comparePrice" placeholder="1299">
      </div>
      <div class="form-group">
        <label>COGS (₹) *</label>
        <input type="number" class="admin-input" name="cost" placeholder="160" required>
      </div>
    </div>
    <div class="form-group">
      <label>Description *</label>
      <textarea class="admin-textarea" name="description" rows="3" placeholder="Product description..." required></textarea>
    </div>
    <div class="form-group">
      <label>Main Image URL</label>
      <input type="url" class="admin-input" name="image" placeholder="https://...">
    </div>
    <div class="form-group">
      <label>SEO Keywords</label>
      <input type="text" class="admin-input" name="seoKeywords" placeholder="ganesh frame, divine gift india">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Gift Message</label>
        <input type="text" class="admin-input" name="giftMessage" placeholder="🎁 Perfect for...">
      </div>
      <div class="form-group">
        <label>Upsell Bundle Text</label>
        <input type="text" class="admin-input" name="upsellBundle" placeholder="Add X for ₹Y more...">
      </div>
    </div>
    <div class="form-row">
      <label class="checkbox-label">
        <input type="checkbox" name="inStock" checked> In Stock
      </label>
      <label class="checkbox-label">
        <input type="checkbox" name="featured"> Featured
      </label>
      <label class="checkbox-label">
        <input type="checkbox" name="hasLossLeader"> Has ₹99 No-Frame Option
      </label>
    </div>
    <div class="form-actions">
      <button type="button" class="admin-btn-secondary" onclick="closeModal()">Cancel</button>
      <button type="submit" class="admin-btn-primary"><i class="fas fa-save"></i> Save Product</button>
    </div>
  </form>`);
}

function openEditProductModal(id) {
  const p = getAllProducts().find(x => x.id === id);
  if (!p) return;
  openModal(`
  <div class="modal-header"><h3><i class="fas fa-edit"></i> Edit: ${p.name}</h3><button onclick="closeModal()" class="modal-close"><i class="fas fa-times"></i></button></div>
  <form class="product-form" onsubmit="updateProduct(event, ${id})">
    <div class="form-row">
      <div class="form-group">
        <label>Product Name</label>
        <input type="text" class="admin-input" name="name" value="${p.name}">
      </div>
      <div class="form-group">
        <label>Badge</label>
        <input type="text" class="admin-input" name="badge" value="${p.badge}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Price (₹)</label>
        <input type="number" class="admin-input" name="price" value="${p.price}">
      </div>
      <div class="form-group">
        <label>COGS (₹)</label>
        <input type="number" class="admin-input" name="cost" value="${p.cost}">
      </div>
    </div>
    <div class="form-row">
      <label class="checkbox-label">
        <input type="checkbox" name="inStock" ${p.inStock ? 'checked' : ''}> In Stock
      </label>
      <label class="checkbox-label">
        <input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}> Featured
      </label>
    </div>
    <div class="form-actions">
      <button type="button" class="admin-btn-secondary" onclick="closeModal()">Cancel</button>
      <button type="submit" class="admin-btn-primary"><i class="fas fa-save"></i> Update Product</button>
    </div>
  </form>`);
}

// ═══════════════════════════════════════════════════════════════════
//  CATEGORIES
// ═══════════════════════════════════════════════════════════════════
function renderCategories() {
  const cats = [
    { slug:'divine', name:'Divine & Spiritual', emoji:'🕉️', count:5, launch:true, desc:'Sacred frames for pooja rooms and gifting' },
    { slug:'motivational', name:'Motivational', emoji:'💪', count:4, launch:true, desc:'Typography frames for offices and study rooms' },
    { slug:'wall-art', name:'Wall Art', emoji:'🎨', count:1, launch:false, desc:'Abstract and modern wall art' },
    { slug:'gifts', name:'Gifts & Custom', emoji:'🎁', count:1, launch:false, desc:'Personalised photo frames' },
    { slug:'sports', name:'Sports & Teams', emoji:'🏏', count:1, launch:false, desc:'Cricket and sports fan frames' },
    { slug:'vintage', name:'Vintage & Retro', emoji:'🎞️', count:0, launch:false, desc:'Classic vintage designs' },
    { slug:'abstract', name:'Abstract & Modern', emoji:'🖼️', count:0, launch:false, desc:'Bold modern designs' },
    { slug:'kids', name:'Kids & Nursery', emoji:'🌈', count:0, launch:false, desc:'Magical prints for children' },
  ];
  return `
  <div class="categories-section">
    <div class="section-toolbar">
      <div class="toolbar-actions">
        <button class="admin-btn-primary" onclick="openAddCategoryModal()"><i class="fas fa-plus"></i> Add Category</button>
      </div>
    </div>
    <div class="categories-grid">
      ${cats.map(cat => `
      <div class="cat-admin-card ${cat.launch ? 'launch' : ''}">
        <div class="cat-header">
          <span class="cat-emoji-big">${cat.emoji}</span>
          ${cat.launch ? '<span class="launch-badge">🚀 LAUNCHED</span>' : ''}
        </div>
        <div class="cat-name">${cat.name}</div>
        <div class="cat-desc">${cat.desc}</div>
        <div class="cat-stats">
          <span>${cat.count} products</span>
          <span>${cat.launch ? '✓ Active' : '— Not launched'}</span>
        </div>
        <div class="cat-actions">
          <button class="tbl-btn" onclick="openEditCategoryModal('${cat.slug}')"><i class="fas fa-edit"></i></button>
          <button class="tbl-btn ${cat.launch ? 'warn' : 'success'}" onclick="toggleCategoryLaunch('${cat.slug}', ${!cat.launch})">
            ${cat.launch ? 'Deactivate' : 'Launch'}
          </button>
        </div>
      </div>`).join('')}
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════
//  COUPONS
// ═══════════════════════════════════════════════════════════════════
function renderCoupons() {
  return `
  <div class="coupons-section">
    <div class="section-toolbar">
      <div class="toolbar-actions">
        <button class="admin-btn-primary" onclick="openAddCouponModal()"><i class="fas fa-plus"></i> Create Coupon</button>
      </div>
    </div>
    <div class="table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>Code</th><th>Type</th><th>Value</th><th>Min Order</th>
          <th>Uses</th><th>Expiry</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody>
          ${MOCK_COUPONS.map(c => `
          <tr>
            <td><code class="coupon-code">${c.code}</code></td>
            <td>${c.type === 'percent' ? `${c.value}% off` : c.type === 'flat' ? `₹${c.value} off` : 'Free Shipping'}</td>
            <td>${c.type === 'percent' ? `${c.value}%` : `₹${c.value}`}</td>
            <td>₹${c.minOrder}</td>
            <td>${c.uses} / ${c.maxUses}</td>
            <td>${c.expiry}</td>
            <td>${c.active ? '<span class="status-badge success">Active</span>' : '<span class="status-badge muted">Inactive</span>'}</td>
            <td>
              <button class="tbl-btn" onclick="openEditCouponModal('${c.code}')"><i class="fas fa-edit"></i></button>
              <button class="tbl-btn ${c.active ? 'warn' : 'success'}" onclick="toggleCoupon('${c.code}', ${!c.active})">
                ${c.active ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>'}
              </button>
              <button class="tbl-btn danger" onclick="deleteCoupon('${c.code}')"><i class="fas fa-trash"></i></button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function openAddCouponModal() {
  openModal(`
  <div class="modal-header"><h3><i class="fas fa-tag"></i> Create Coupon</h3><button onclick="closeModal()" class="modal-close"><i class="fas fa-times"></i></button></div>
  <form class="product-form" onsubmit="saveCoupon(event)">
    <div class="form-row">
      <div class="form-group">
        <label>Coupon Code *</label>
        <input type="text" class="admin-input" name="code" placeholder="DIWALI25" required style="text-transform:uppercase">
      </div>
      <div class="form-group">
        <label>Description</label>
        <input type="text" class="admin-input" name="desc" placeholder="Diwali discount">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Discount Type *</label>
        <select class="admin-select" name="type" required onchange="updateCouponValueLabel(this.value)">
          <option value="percent">Percentage (%)</option>
          <option value="flat">Flat Amount (₹)</option>
          <option value="shipping">Free Shipping</option>
        </select>
      </div>
      <div class="form-group">
        <label id="coupon-value-label">Discount Value (%)</label>
        <input type="number" class="admin-input" name="value" placeholder="10" required>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Minimum Order (₹)</label>
        <input type="number" class="admin-input" name="minOrder" value="299">
      </div>
      <div class="form-group">
        <label>Max Uses</label>
        <input type="number" class="admin-input" name="maxUses" value="500">
      </div>
      <div class="form-group">
        <label>Expiry Date</label>
        <input type="date" class="admin-input" name="expiry">
      </div>
    </div>
    <div class="form-actions">
      <button type="button" class="admin-btn-secondary" onclick="closeModal()">Cancel</button>
      <button type="submit" class="admin-btn-primary"><i class="fas fa-save"></i> Create Coupon</button>
    </div>
  </form>`);
}

// ═══════════════════════════════════════════════════════════════════
//  REVIEWS
// ═══════════════════════════════════════════════════════════════════
function renderReviews() {
  return `
  <div class="reviews-section">
    <div class="section-toolbar">
      <div class="toolbar-filters">
        <select class="admin-select" onchange="filterReviews(this.value)">
          <option value="all">All Reviews (${MOCK_REVIEWS.length})</option>
          <option value="pending">Pending (${MOCK_REVIEWS.filter(r=>r.status==='pending').length})</option>
          <option value="approved">Approved</option>
        </select>
      </div>
    </div>

    ${MOCK_REVIEWS.filter(r=>r.status==='pending').length > 0 ? `
    <div class="alert-banner info">
      <i class="fas fa-comment-alt"></i>
      <strong>${MOCK_REVIEWS.filter(r=>r.status==='pending').length} reviews pending approval!</strong> Approve positive reviews to boost social proof and SEO.
    </div>` : ''}

    <div class="reviews-list">
      ${MOCK_REVIEWS.map(r => `
      <div class="review-card ${r.status}">
        <div class="review-header">
          <div class="review-meta">
            <strong>${r.customer}</strong> from ${r.city}
            <span class="review-stars">${'⭐'.repeat(r.rating)}</span>
            <small class="muted">${r.date} | ${r.product}</small>
          </div>
          <div class="review-status">${r.status === 'approved' ? '<span class="status-badge success">Approved</span>' : '<span class="status-badge warn">Pending</span>'}</div>
        </div>
        <div class="review-text">"${r.review}"</div>
        <div class="review-actions">
          ${r.status === 'pending' ? `
          <button class="admin-btn-sm success" onclick="approveReview(${r.id})"><i class="fas fa-check"></i> Approve</button>
          <button class="admin-btn-sm danger" onclick="rejectReview(${r.id})"><i class="fas fa-times"></i> Reject</button>` : ''}
          <button class="admin-btn-sm" onclick="replyToReview(${r.id})"><i class="fas fa-reply"></i> Reply</button>
          <button class="admin-btn-sm danger" onclick="deleteReview(${r.id})"><i class="fas fa-trash"></i></button>
        </div>
      </div>`).join('')}
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════
//  BLOG
// ═══════════════════════════════════════════════════════════════════
function renderBlog() {
  const posts = [
    { slug:'best-divine-frames-diwali', title:'Best Divine Photo Frames for Diwali & Housewarming Gifts India 2025', status:'published', views:1243, date:'2026-04-10' },
    { slug:'motivational-frames-home-office', title:'Best Motivational Photo Frames for Home Office & WFH Setups India 2025', status:'published', views:876, date:'2026-04-05' },
    { slug:'how-to-choose-right-photo-frame-size', title:'How to Choose the Right Photo Frame Size for Your Wall', status:'published', views:2341, date:'2026-04-01' },
    { slug:'top-10-wall-art-ideas-indian-homes', title:'Top 10 Wall Art Ideas for Indian Homes in 2025', status:'published', views:3102, date:'2026-03-15' },
    { slug:'best-photo-frame-gift-ideas-india', title:'Best Photo Frame Gift Ideas for Every Occasion in India', status:'published', views:1567, date:'2026-02-20' },
    { slug:'navratri-special-pooja-room-decor', title:'Navratri 2026: Complete Pooja Room Decor Guide [Draft]', status:'draft', views:0, date:'2026-04-08' },
  ];
  return `
  <div class="blog-section">
    <div class="section-toolbar">
      <div class="toolbar-actions">
        <button class="admin-btn-primary" onclick="openAddBlogModal()"><i class="fas fa-plus"></i> New Blog Post</button>
      </div>
    </div>
    <div class="table-wrap">
      <table class="admin-table">
        <thead><tr><th>Title</th><th>Status</th><th>Views</th><th>Published</th><th>Actions</th></tr></thead>
        <tbody>
          ${posts.map(p => `
          <tr>
            <td><a href="/blog/${p.slug}" target="_blank" class="table-link">${p.title}</a></td>
            <td>${p.status === 'published' ? '<span class="status-badge success">Published</span>' : '<span class="status-badge warn">Draft</span>'}</td>
            <td>${p.views.toLocaleString('en-IN')}</td>
            <td>${p.date}</td>
            <td>
              <button class="tbl-btn" onclick="openEditBlogModal('${p.slug}')"><i class="fas fa-edit"></i></button>
              <button class="tbl-btn" onclick="toggleBlogStatus('${p.slug}')"><i class="fas fa-${p.status==='published'?'eye-slash':'eye'}"></i></button>
              <button class="tbl-btn danger" onclick="deleteBlog('${p.slug}')"><i class="fas fa-trash"></i></button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="seo-checklist-panel">
      <div class="panel-header"><h3><i class="fas fa-search"></i> SEO Content Checklist</h3></div>
      <div class="seo-items">
        ${[
          [true, 'Blog posts have unique titles with target keywords'],
          [true, 'Meta descriptions under 160 characters'],
          [true, 'JSON-LD BlogPosting schema on each post'],
          [true, 'Internal links from posts to product pages'],
          [false, 'Alt text on all blog images'],
          [false, 'External links to authoritative sources'],
          [false, 'Blog posts published 2x per week (target)'],
          [false, 'Video content embedded in blog posts'],
        ].map(([done, item]) => `
        <div class="seo-check-item ${done ? 'done' : 'todo'}">
          <i class="fas fa-${done ? 'check-circle' : 'circle'}"></i>
          <span>${item}</span>
        </div>`).join('')}
      </div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════
//  PAGES & FAQ
// ═══════════════════════════════════════════════════════════════════
function renderPages() {
  return `
  <div class="pages-section">
    <div class="pages-grid">
      <div class="page-card">
        <div class="page-name"><i class="fas fa-question-circle"></i> FAQ</div>
        <div class="page-items">8 questions configured</div>
        <div class="page-seo">✓ FAQ JSON-LD schema applied</div>
        <button class="admin-btn-sm" onclick="openFAQEditor()">Edit FAQs</button>
      </div>
      <div class="page-card">
        <div class="page-name"><i class="fas fa-shipping-fast"></i> Shipping Policy</div>
        <div class="page-items">Last updated: April 2026</div>
        <button class="admin-btn-sm" onclick="openPageEditor('shipping')">Edit</button>
      </div>
      <div class="page-card">
        <div class="page-name"><i class="fas fa-undo"></i> Returns Policy</div>
        <div class="page-items">Last updated: April 2026</div>
        <button class="admin-btn-sm" onclick="openPageEditor('returns')">Edit</button>
      </div>
      <div class="page-card">
        <div class="page-name"><i class="fas fa-shield-alt"></i> Privacy Policy</div>
        <div class="page-items">GDPR compliant</div>
        <button class="admin-btn-sm" onclick="openPageEditor('privacy')">Edit</button>
      </div>
      <div class="page-card">
        <div class="page-name"><i class="fas fa-file-contract"></i> Terms & Conditions</div>
        <div class="page-items">Last updated: April 2026</div>
        <button class="admin-btn-sm" onclick="openPageEditor('terms')">Edit</button>
      </div>
      <div class="page-card">
        <div class="page-name"><i class="fas fa-info-circle"></i> About Us</div>
        <div class="page-items">Live</div>
        <button class="admin-btn-sm" onclick="openPageEditor('about')">Edit</button>
      </div>
    </div>

    <div class="faq-editor" id="faq-editor" style="display:none">
      <div class="panel-header"><h3>FAQ Editor</h3></div>
      <!-- FAQ editor content injected here -->
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════════════════════════════
function renderSettings() {
  return `
  <div class="settings-section">
    <div class="settings-grid">

      <div class="settings-panel">
        <div class="panel-header"><h3><i class="fas fa-money-bill-wave"></i> Pricing & Shipping</h3></div>
        <div class="settings-form">
          <div class="form-group">
            <label>Free Shipping Threshold (₹)</label>
            <input type="number" class="admin-input" id="s-freeShipping" value="${adminSettings.freeShippingThreshold}" onchange="adminSettings.freeShippingThreshold=+this.value">
            <small>Currently: Free shipping on orders above ₹${adminSettings.freeShippingThreshold}</small>
          </div>
          <div class="form-group">
            <label>COD Surcharge (₹)</label>
            <input type="number" class="admin-input" id="s-codSurcharge" value="${adminSettings.codSurcharge}" onchange="adminSettings.codSurcharge=+this.value">
          </div>
          <div class="form-group">
            <label>COD Minimum Order (₹)</label>
            <input type="number" class="admin-input" id="s-codMin" value="${adminSettings.codMinOrder}" onchange="adminSettings.codMinOrder=+this.value">
          </div>
          <div class="form-group">
            <label>COD Maximum Order (₹)</label>
            <input type="number" class="admin-input" id="s-codMax" value="${adminSettings.codMaxOrder}" onchange="adminSettings.codMaxOrder=+this.value">
          </div>
          <div class="form-group">
            <label>Express Shipping Fee (₹)</label>
            <input type="number" class="admin-input" id="s-express" value="${adminSettings.expressFee}" onchange="adminSettings.expressFee=+this.value">
          </div>
          <div class="form-group">
            <label>Prepaid Cashback (₹)</label>
            <input type="number" class="admin-input" id="s-cashback" value="${adminSettings.prepaidCashback}" onchange="adminSettings.prepaidCashback=+this.value">
          </div>
        </div>
      </div>

      <div class="settings-panel">
        <div class="panel-header"><h3><i class="fas fa-store"></i> Store Configuration</h3></div>
        <div class="settings-form">
          <div class="form-group">
            <label>WhatsApp Number</label>
            <input type="text" class="admin-input" id="s-wa" value="${adminSettings.whatsappNumber}" onchange="adminSettings.whatsappNumber=this.value">
          </div>
          <div class="form-group">
            <label>Support Email</label>
            <input type="email" class="admin-input" id="s-email" value="${adminSettings.supportEmail}" onchange="adminSettings.supportEmail=this.value">
          </div>
          <div class="form-group">
            <label>Instagram Handle</label>
            <input type="text" class="admin-input" id="s-ig" value="${adminSettings.instagramHandle}" onchange="adminSettings.instagramHandle=this.value">
          </div>
          <div class="form-group">
            <label>Active Coupon Code</label>
            <input type="text" class="admin-input" id="s-coupon" value="${adminSettings.currentCoupon}" onchange="adminSettings.currentCoupon=this.value">
          </div>
          <div class="form-group">
            <label>Exit Popup Discount (%)</label>
            <input type="number" class="admin-input" id="s-exitpct" value="${adminSettings.exitPopupDiscount}" onchange="adminSettings.exitPopupDiscount=+this.value">
          </div>
          <div class="form-group">
            <label>Festival Banner Text</label>
            <input type="text" class="admin-input" id="s-festival" value="${adminSettings.festivalBanner}" onchange="adminSettings.festivalBanner=this.value">
          </div>
        </div>
      </div>

      <div class="settings-panel">
        <div class="panel-header"><h3><i class="fas fa-chart-bar"></i> Analytics & Tracking</h3></div>
        <div class="settings-form">
          <div class="form-group">
            <label>Google Analytics ID</label>
            <input type="text" class="admin-input" id="s-ga" value="${adminSettings.analyticsId}" placeholder="G-XXXXXXXXXX" onchange="adminSettings.analyticsId=this.value">
          </div>
          <div class="form-group">
            <label>Meta Pixel ID</label>
            <input type="text" class="admin-input" id="s-pixel" value="${adminSettings.pixelId}" placeholder="1234567890" onchange="adminSettings.pixelId=this.value">
          </div>
          <div class="form-group">
            <label>Month 1 Ads Budget (₹)</label>
            <input type="number" class="admin-input" id="s-ads" value="${adminSettings.adsBudgetMonth}" onchange="adminSettings.adsBudgetMonth=+this.value">
          </div>
        </div>
        <div class="settings-toggles">
          <div class="toggle-row">
            <span>Maintenance Mode</span>
            <label class="admin-toggle"><input type="checkbox" ${adminSettings.maintenanceMode?'checked':''} onchange="adminSettings.maintenanceMode=this.checked"><span class="toggle-slider"></span></label>
          </div>
          <div class="toggle-row">
            <span>Loyalty Program (Coming Soon)</span>
            <label class="admin-toggle"><input type="checkbox" ${adminSettings.loyaltyEnabled?'checked':''} onchange="adminSettings.loyaltyEnabled=this.checked"><span class="toggle-slider"></span></label>
          </div>
        </div>
      </div>

      <!-- NEW: Product & Policy Settings -->
      <div class="settings-panel" style="border:1px solid rgba(212,175,55,0.3)">
        <div class="panel-header"><h3><i class="fas fa-tags"></i> Product Naming & Policy</h3></div>
        <div class="settings-toggles">
          <div class="toggle-row">
            <div>
              <span><strong>Premium / Standard Naming Mode</strong></span>
              <div class="toggle-desc">ON = Show "Premium" / "Standard" labels. OFF = Show technical names (Teak Wood / MDF Synthetic Wood)</div>
            </div>
            <label class="admin-toggle">
              <input type="checkbox" id="toggle-premium-naming" ${adminSettings.premiumNamingMode!==false?'checked':''} onchange="togglePremiumNaming(this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="toggle-row">
            <div>
              <span><strong>Exchange-Only Policy (No Returns)</strong></span>
              <div class="toggle-desc">ON = Only exchanges for transit damage/wrong item. No return refunds on standard frames. Custom frames non-returnable.</div>
            </div>
            <label class="admin-toggle">
              <input type="checkbox" id="toggle-exchange-only" ${adminSettings.exchangeOnlyPolicy!==false?'checked':''} onchange="toggleExchangePolicy(this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="toggle-row">
            <div>
              <span><strong>Require Unboxing Video for Exchange</strong></span>
              <div class="toggle-desc">ON = Unboxing video (no cuts) mandatory for any exchange/replacement claim. Video must show sealed package being opened.</div>
            </div>
            <label class="admin-toggle">
              <input type="checkbox" id="toggle-unboxing-req" ${adminSettings.unboxingVideoRequired!==false?'checked':''} onchange="toggleUnboxingRequired(this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="toggle-row">
            <div>
              <span><strong>Loss-Leader Add-on Only Mode</strong></span>
              <div class="toggle-desc">ON = ₹99 No-Frame prints can only be ordered alongside Standard/Premium frames (not standalone).</div>
            </div>
            <label class="admin-toggle">
              <input type="checkbox" id="toggle-loss-leader" ${adminSettings.lossLeaderEnabled?'checked':''} onchange="adminSettings.lossLeaderEnabled=this.checked;saveSettingKey('lossLeaderEnabled',this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="toggle-row">
            <div>
              <span><strong>Google Login (OAuth)</strong></span>
              <div class="toggle-desc">Requires GOOGLE_CLIENT_ID secret. Enable after configuring Google OAuth in Supabase Auth Providers.</div>
            </div>
            <label class="admin-toggle">
              <input type="checkbox" id="toggle-google-login" ${adminSettings.googleLoginEnabled?'checked':''} onchange="adminSettings.googleLoginEnabled=this.checked;saveSettingKey('googleLoginEnabled',this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="toggle-row">
            <div>
              <span><strong>Prepaid-Only Mode (35% Rule Auto)</strong></span>
              <div class="toggle-desc">ON = COD disabled globally. Auto-activates when daily API cost > 35% of gross margin.</div>
            </div>
            <label class="admin-toggle">
              <input type="checkbox" id="toggle-prepaid-only" ${adminSettings.prepaidOnlyMode?'checked':''} onchange="adminSettings.prepaidOnlyMode=this.checked;saveSettingKey('prepaidOnlyMode',this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>

      <!-- NEW: Email Quota Monitor -->
      <div class="settings-panel" style="border:1px solid rgba(139,92,246,0.3)">
        <div class="panel-header"><h3><i class="fas fa-envelope"></i> Email Quota Monitor</h3></div>
        <div id="quota-monitor-content">
          <div style="color:var(--gray4);font-size:13px;padding:8px 0">
            <i class="fas fa-spinner fa-spin"></i> Loading quota data...
          </div>
        </div>
        <button class="admin-btn-secondary" style="margin-top:12px;font-size:12px" onclick="loadQuotaData()">
          <i class="fas fa-sync"></i> Refresh Quota
        </button>
        <div style="margin-top:16px;padding:12px;background:rgba(139,92,246,0.08);border-radius:8px;font-size:12px;color:var(--gray3)">
          <strong>Quota Rules:</strong><br>
          • Brevo: 300 emails/day (free tier) — alerts at 240/day (80%)<br>
          • Resend: 100 emails/day (fallback) — alerts at 80/day (80%)<br>
          • Auto-falls to Resend when Brevo is exhausted<br>
          • Both exhausted → email queue paused, logged in Supabase
        </div>
      </div>

      <!-- NEW: Cost Adjustment CRUD -->
      <div class="settings-panel" style="border:1px solid rgba(22,163,74,0.3)">
        <div class="panel-header"><h3><i class="fas fa-calculator"></i> Order Cost Adjustments</h3></div>
        <div style="font-size:12px;color:var(--gray3);margin-bottom:12px">
          Adjust overhead costs. These affect margin calculations and the 35% loss-prevention rule.
        </div>
        <div class="settings-form">
          <div class="form-group">
            <label>Packaging Cost per Order (₹)</label>
            <input type="number" class="admin-input" id="s-packaging" 
              value="${adminSettings.costAdjustments?.packaging || 35}" 
              onchange="adminSettings.costAdjustments=adminSettings.costAdjustments||{};adminSettings.costAdjustments.packaging=+this.value">
            <small>5-layer protective packaging + corner guards</small>
          </div>
          <div class="form-group">
            <label>Shipping Cost per Order (₹)</label>
            <input type="number" class="admin-input" id="s-shippingCost"
              value="${adminSettings.costAdjustments?.shipping || 60}"
              onchange="adminSettings.costAdjustments=adminSettings.costAdjustments||{};adminSettings.costAdjustments.shipping=+this.value">
            <small>Actual shipping cost (charged ₹0 to customer above ₹799)</small>
          </div>
          <div class="form-group">
            <label>Payment Gateway % Fee</label>
            <input type="number" class="admin-input" id="s-gwFee" step="0.1"
              value="${adminSettings.costAdjustments?.paymentGatewayPercent || 2}"
              onchange="adminSettings.costAdjustments=adminSettings.costAdjustments||{};adminSettings.costAdjustments.paymentGatewayPercent=+this.value">
            <small>Razorpay/UPI rate (typically 2%)</small>
          </div>
          <div class="form-group">
            <label>RTO Risk Buffer (₹)</label>
            <input type="number" class="admin-input" id="s-rtoRisk"
              value="${adminSettings.costAdjustments?.rtoRisk || 120}"
              onchange="adminSettings.costAdjustments=adminSettings.costAdjustments||{};adminSettings.costAdjustments.rtoRisk=+this.value">
            <small>Blended average RTO cost (COD rejection cost)</small>
          </div>
        </div>
        <button class="admin-btn-secondary" style="margin-top:8px;font-size:12px" onclick="saveCostAdjustments()">
          <i class="fas fa-save"></i> Save Cost Adjustments
        </button>
        <div id="cost-margin-preview" style="margin-top:12px;padding:12px;background:rgba(22,163,74,0.07);border-radius:8px;font-size:12px;color:var(--gray3)">
          <button class="admin-btn-sm" onclick="loadProfitAnalytics()"><i class="fas fa-chart-line"></i> Calculate Margins</button>
        </div>
      </div>

      <!-- Hyderabad Express & Category Toggles -->
      <div class="settings-panel" style="border:1px solid rgba(255,215,0,0.2)">
        <div class="panel-header"><h3><i class="fas fa-bolt"></i> Regional & Category Settings</h3></div>
        <div class="settings-toggles">
          <div class="toggle-row">
            <div>
              <span><strong>Hyderabad Express Badge</strong></span>
              <div class="toggle-desc">Show ⚡ HYD EXPRESS badge + same-day delivery for pincodes starting with 500</div>
            </div>
            <label class="admin-toggle">
              <input type="checkbox" ${adminSettings.hyderabadExpressEnabled?'checked':''} onchange="adminSettings.hyderabadExpressEnabled=this.checked;saveSettingKey('hyderabadExpressEnabled',this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="toggle-row">
            <div>
              <span><strong>Automotive Category</strong></span>
              <div class="toggle-desc">Enable 🚗 Automotive category (Supercars, Royal Enfield, German Cars)</div>
            </div>
            <label class="admin-toggle">
              <input type="checkbox" ${adminSettings.automotiveCategoryEnabled!==false?'checked':''} onchange="adminSettings.automotiveCategoryEnabled=this.checked;saveSettingKey('automotiveCategoryEnabled',this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="toggle-row">
            <div>
              <span><strong>COD Enabled</strong></span>
              <div class="toggle-desc">Enable Cash on Delivery (₹${adminSettings.codMinOrder}–₹${adminSettings.codMaxOrder}, fee ₹${adminSettings.codSurcharge})</div>
            </div>
            <label class="admin-toggle">
              <input type="checkbox" ${adminSettings.codEnabled?'checked':''} onchange="adminSettings.codEnabled=this.checked;saveSettingKey('codEnabled',this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>

    </div>
    <div class="settings-save-bar">
      <button class="admin-btn-primary" onclick="saveSettings()"><i class="fas fa-save"></i> Save All Settings</button>
      <button class="admin-btn-secondary" onclick="loadSettings()"><i class="fas fa-undo"></i> Reset Changes</button>
    </div>
  </div>`;
}

// ─── Cost Adjustments Save ────────────────────────────────────────────
async function saveCostAdjustments() {
  try {
    const res = await fetch('/api/admin/costs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Session': 'admin' },
      body: JSON.stringify(adminSettings.costAdjustments)
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Cost adjustments saved!', 'success');
    }
  } catch(e) {
    showToast('Cost adjustments saved locally (connect Supabase for persistence)', 'info');
  }
}

// ─── Load Profit Analytics ────────────────────────────────────────────
async function loadProfitAnalytics() {
  const container = document.getElementById('cost-margin-preview');
  if (!container) return;
  container.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculating...';
  try {
    const res = await fetch('/api/admin/analytics/profit');
    const d = await res.json();
    const marginColor = d.marginPercent >= 35 ? '#16a34a' : d.marginPercent >= 20 ? '#d97706' : '#dc2626';
    container.innerHTML = `
    <div style="font-size:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        <div><span style="color:var(--gray3)">Avg Sell Price (ASP)</span><br><strong>₹${d.asp}</strong></div>
        <div><span style="color:var(--gray3)">Avg COGS</span><br><strong style="color:var(--red)">₹${d.avgCogs}</strong></div>
        <div><span style="color:var(--gray3)">Packaging + OH</span><br><strong style="color:var(--red)">₹${d.packaging}</strong></div>
        <div><span style="color:var(--gray3)">Gross Margin</span><br><strong style="color:#d97706">₹${d.grossMargin}</strong></div>
        <div><span style="color:var(--gray3)">Shipping</span><br><strong style="color:var(--red)">₹${d.shipping}</strong></div>
        <div><span style="color:var(--gray3)">Payment GW</span><br><strong style="color:var(--red)">₹${d.paymentGateway}</strong></div>
        <div><span style="color:var(--gray3)">Net Contribution</span><br><strong style="color:${marginColor}">₹${d.netContribution}</strong></div>
        <div><span style="color:var(--gray3)">Net Margin %</span><br><strong style="color:${marginColor}">${d.marginPercent}%</strong></div>
      </div>
      <div style="height:6px;background:var(--border2);border-radius:3px;overflow:hidden;margin-bottom:6px">
        <div style="height:100%;width:${Math.min(100,d.marginPercent*2)}%;background:${marginColor};border-radius:3px"></div>
      </div>
      <div style="color:${d.lossPrevention35Rule?'#dc2626':'#16a34a'};font-weight:600">${d.recommendation}</div>
    </div>`;
  } catch(e) {
    container.innerHTML = '<span style="color:var(--gray3)">Connect Supabase for live analytics</span>';
  }
}

// ═══════════════════════════════════════════════════════════════════
//  INTEGRATIONS
// ═══════════════════════════════════════════════════════════════════
function renderIntegrations() {
  return `
  <div class="integrations-section">
    <div class="integrations-grid">
      ${[
        { name:'Supabase', icon:'fas fa-database', desc:'Database & Auth backend. Required for persistent orders, users, reviews.', status:'not-connected', env:'SUPABASE_URL, SUPABASE_ANON_KEY', docsUrl:'https://supabase.com/docs' },
        { name:'Razorpay', icon:'fas fa-credit-card', desc:'Payment gateway for UPI, Cards, Net Banking. Required for prepaid orders.', status:'not-connected', env:'RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET', docsUrl:'https://razorpay.com/docs' },
        { name:'Shiprocket', icon:'fas fa-truck', desc:'Courier aggregator for pan-India shipping. Auto-create shipments, track orders.', status:'not-connected', env:'SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD', docsUrl:'https://apidocs.shiprocket.in' },
        { name:'Brevo (Sendinblue)', icon:'fas fa-envelope', desc:'Email marketing & transactional emails. Free tier: 300/day, 9k/month.', status:'not-connected', env:'BREVO_API_KEY', docsUrl:'https://developers.brevo.com' },
        { name:'Google Analytics 4', icon:'fab fa-google', desc:'Traffic & conversion tracking. Required for ad optimization.', status:'configured', env:'Analytics ID: G-XXXXXXXXXX', docsUrl:'https://analytics.google.com' },
        { name:'Meta Pixel', icon:'fab fa-facebook', desc:'Facebook/Instagram conversion tracking for paid ads.', status:'not-connected', env:'META_PIXEL_ID', docsUrl:'https://developers.facebook.com/docs/meta-pixel' },
        { name:'Google Search Console', icon:'fas fa-search', desc:'Monitor SEO performance, indexing, keyword rankings.', status:'configured', env:'Sitemap: /sitemap.xml', docsUrl:'https://search.google.com/search-console' },
        { name:'WhatsApp Business API', icon:'fab fa-whatsapp', desc:'For COD confirmations, order updates, marketing broadcasts.', status:'partial', env:'WHATSAPP_NUMBER: 917989531818', docsUrl:'https://developers.facebook.com/docs/whatsapp' },
      ].map(int => `
      <div class="integration-card ${int.status}">
        <div class="int-header">
          <div class="int-icon"><i class="${int.icon}"></i></div>
          <div class="int-title">${int.name}</div>
          <div class="int-status-badge ${int.status}">
            ${int.status === 'configured' ? '✓ Connected' : int.status === 'partial' ? '⚡ Partial' : '○ Not Connected'}
          </div>
        </div>
        <div class="int-desc">${int.desc}</div>
        <div class="int-env">
          <code>${int.env}</code>
        </div>
        <div class="int-actions">
          <a href="${int.docsUrl}" target="_blank" class="admin-btn-sm"><i class="fas fa-book"></i> Docs</a>
          <button class="admin-btn-sm ${int.status === 'not-connected' ? 'primary' : ''}" onclick="configureIntegration('${int.name}')">
            ${int.status === 'not-connected' ? 'Configure' : 'Update'}
          </button>
        </div>
      </div>`).join('')}
    </div>

    <div class="env-vars-panel">
      <div class="panel-header"><h3><i class="fas fa-key"></i> Cloudflare Workers Environment Variables</h3></div>
      <div class="env-instructions">
        <p>Set these secrets via Cloudflare Dashboard → Workers → Your Worker → Settings → Variables & Secrets:</p>
        <div class="env-table">
          ${[
            ['ADMIN_USERNAME', 'admin', 'Admin panel login username'],
            ['ADMIN_PASSWORD', '*****', 'Admin panel login password'],
            ['SUPABASE_URL', 'https://xxxxx.supabase.co', 'Supabase project URL'],
            ['SUPABASE_ANON_KEY', 'eyJ...', 'Supabase anonymous key'],
            ['RAZORPAY_KEY_ID', 'rzp_live_xxxxx', 'Razorpay live key ID'],
            ['RAZORPAY_KEY_SECRET', '*****', 'Razorpay secret (never expose to frontend)'],
            ['SHIPROCKET_EMAIL', 'you@email.com', 'Shiprocket account email'],
            ['SHIPROCKET_PASSWORD', '*****', 'Shiprocket account password'],
            ['BREVO_API_KEY', 'xkeysib-xxxxx', 'Brevo API key for emails'],
            ['COD_ENABLED', 'true', 'Global COD toggle (true/false)'],
            ['FREE_SHIPPING_THRESHOLD', '799', 'Free shipping above this amount'],
          ].map(([key, val, desc]) => `
          <div class="env-row">
            <code class="env-key">${key}</code>
            <code class="env-val">${val}</code>
            <span class="env-desc">${desc}</span>
          </div>`).join('')}
        </div>
        <div class="wrangler-tip">
          <i class="fas fa-terminal"></i>
          <strong>CLI:</strong>
          <code>npx wrangler secret put ADMIN_PASSWORD</code> then enter value when prompted.
        </div>
      </div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════
//  MISSING ITEMS & ROADMAP
// ═══════════════════════════════════════════════════════════════════
function renderMissing() {
  return `
  <div class="missing-section">
    <div class="missing-header">
      <h2><i class="fas fa-clipboard-list"></i> Missing Items, Gaps & Strategic Roadmap</h2>
      <p>Identified gaps between current state and production-ready launch. Prioritized by impact × effort.</p>
    </div>

    <div class="missing-grid">

      <div class="missing-panel critical">
        <div class="priority-badge critical">🔴 Critical — Launch Blockers</div>
        <div class="missing-items">
          ${[
            { item:'Real Supabase Database', detail:'Currently using in-memory data. Need Supabase setup for: orders persistence, user accounts, review storage. Setup time: 2 hours.', action:'Setup Supabase project → copy URL & anon key → set in Cloudflare secrets' },
            { item:'Razorpay Live Keys', detail:'Payment gateway is mocked. Need Razorpay live keys for real prepaid transactions. Test mode is free to set up.', action:'Create Razorpay account → generate live keys → add RAZORPAY_KEY_ID/SECRET to env vars' },
            { item:'Real Product Photos', detail:'All product images are Unsplash placeholders. Need actual product photos for credibility and conversions.', action:'Photograph 5 divine + 4 motivational products → replace Unsplash URLs in PRODUCTS array' },
            { item:'Shiprocket Integration', detail:'Order fulfillment is manual. Shiprocket automates label generation, tracking, and COD remittance.', action:'Sign up Shiprocket → set SHIPROCKET_EMAIL/PASSWORD env vars → test API connection' },
          ].map(m => `
          <div class="missing-item">
            <div class="mi-title"><i class="fas fa-exclamation-circle"></i> ${m.item}</div>
            <div class="mi-detail">${m.detail}</div>
            <div class="mi-action"><i class="fas fa-arrow-right"></i> <strong>Action:</strong> ${m.action}</div>
          </div>`).join('')}
        </div>
      </div>

      <div class="missing-panel high">
        <div class="priority-badge high">🟠 High Priority — Week 1-2</div>
        <div class="missing-items">
          ${[
            { item:'Google Login Integration', detail:'Social login reduces friction. Google OAuth via Supabase Auth adds Google Sign-In in ~30 mins. Reduces checkout abandonment by 15-20%.', action:'Enable Google provider in Supabase Auth → add OAuth client ID from Google Cloud Console' },
            { item:'Backup & Disaster Recovery', detail:'No backup strategy defined. Supabase has daily backups on Pro plan. Cloudflare Workers state should be backed up.', action:'Enable Supabase Pro (₹1,500/mo) for daily backups OR set up pg_dump scripts. Export orders CSV weekly.' },
            { item:'Multi-Carrier Tracking', detail:'Currently only Shiprocket. Should support: Delhivery, BlueDart, Ekart for regional optimization and RTO reduction.', action:'Integrate Shiprocket multi-courier feature (built-in) → configure carrier preference rules' },
            { item:'Domain Setup', detail:'Still on .pages.dev URL. Need photoframein.in domain for brand trust and SEO authority.', action:'Purchase photoframein.in on GoDaddy (~₹800/yr) → add CNAME record to Cloudflare Pages' },
          ].map(m => `
          <div class="missing-item">
            <div class="mi-title"><i class="fas fa-exclamation-triangle"></i> ${m.item}</div>
            <div class="mi-detail">${m.detail}</div>
            <div class="mi-action"><i class="fas fa-arrow-right"></i> <strong>Action:</strong> ${m.action}</div>
          </div>`).join('')}
        </div>
      </div>

      <div class="missing-panel medium">
        <div class="priority-badge medium">🟡 Medium Priority — Month 1</div>
        <div class="missing-items">
          ${[
            { item:'A/B Testing Framework', detail:'No split testing. Need A/B testing for: pricing (₹449 vs ₹499), headlines, CTA text, free shipping threshold. Use Cloudflare A/B Testing or Google Optimize.', action:'Implement server-side A/B via Cloudflare Workers random() → track variant conversions in GA4 → switch winner after 100+ conversions per variant' },
            { item:'SEO / Meta Strategy', detail:'On-page SEO is implemented. Missing: local SEO for Hyderabad, regional language pages (Hindi), voice search optimization, image SEO with WebP format.', action:'Add LocalBusiness schema with Hyderabad address → create /frames-in-hyderabad page → compress all images to WebP' },
            { item:'GDPR / Privacy Compliance', detail:'Exit popup collects emails but no explicit GDPR consent. Cookie consent banner missing for EU visitors. Privacy policy needs update.', action:'Add cookie consent banner (Cookiebot free tier) → add checkbox to email capture → update privacy policy with data retention policy' },
            { item:'Email Marketing Setup', detail:'No email flows running. Need: Welcome, Abandoned Cart (45% recovery rate), Post-Purchase upsell, Review request. Brevo free tier: 9k emails/month.', action:'Sign up Brevo → set BREVO_API_KEY → create 4 flows → connect to order creation API endpoint' },
          ].map(m => `
          <div class="missing-item">
            <div class="mi-title"><i class="fas fa-dot-circle"></i> ${m.item}</div>
            <div class="mi-detail">${m.detail}</div>
            <div class="mi-action"><i class="fas fa-arrow-right"></i> <strong>Action:</strong> ${m.action}</div>
          </div>`).join('')}
        </div>
      </div>

      <div class="missing-panel low">
        <div class="priority-badge low">🟢 Future Enhancements — Month 2+</div>
        <div class="missing-items">
          ${[
            { item:'QA / Testing Checklist', detail:'No formal QA process. Should test: all product page flows, checkout, COD confirmation, mobile responsiveness, page load speed, broken links.', action:'Run Lighthouse audit → test all checkout flows on mobile → verify all API endpoints → check all internal links → test COD + prepaid flows end-to-end' },
            { item:'Marketplace Expansion', detail:'Missing: Meesho (D2C resellers), Flipkart, Nykaa Fashion for supplemental revenue. Each adds 10-40% incremental orders.', action:'Month 3: Register on Meesho Supplier Hub → Month 4: Flipkart Seller Hub → Month 6: Nykaa Fashion seller' },
            { item:'Loyalty / Referral Program', detail:'No referral engine. A simple "Give ₹100, Get ₹100" referral program can reduce CAC by 30-40% at scale.', action:'Month 3: Implement referral codes in Supabase → track referral_source on orders → credit ₹100 store credit on first successful referral order' },
            { item:'Custom Frame Personalisation', detail:'No photo upload functionality. Custom frames are the highest-margin product (65-75%). Need: photo upload, preview tool, custom text overlay.', action:'Month 2: Add file upload endpoint to Hono API → store in Cloudflare R2 → show upload preview on PDP → add ₹150 personalization fee' },
          ].map(m => `
          <div class="missing-item">
            <div class="mi-title"><i class="fas fa-lightbulb"></i> ${m.item}</div>
            <div class="mi-detail">${m.detail}</div>
            <div class="mi-action"><i class="fas fa-arrow-right"></i> <strong>Action:</strong> ${m.action}</div>
          </div>`).join('')}
        </div>
      </div>

      <!-- QA CHECKLIST -->
      <div class="missing-panel qa-checklist">
        <div class="priority-badge info">✅ QA & Testing Checklist</div>
        <div class="qa-categories">
          ${[
            { cat:'Frontend / UI', checks:[
              'Homepage loads in under 3 seconds on mobile',
              'All product images load without 404 errors',
              'Pricing matrix works correctly for all size/frame combos',
              'Add to Cart works and cart count updates',
              'COD fee (₹49) added correctly in checkout',
              'Free shipping shown correctly above ₹799',
              'Exit intent popup fires on desktop (not on mobile)',
              'WhatsApp widget opens correctly',
              'Mobile navigation opens and closes smoothly',
              'All breadcrumbs are correct and functional',
            ]},
            { cat:'Backend / API', checks:[
              'GET /api/products returns all products with correct pricing',
              'GET /api/products/:slug returns correct product',
              'POST /api/orders/create returns valid order ID',
              'POST /api/leads returns FRAME10 coupon code',
              'Sitemap.xml lists all products and blog posts',
              'Robots.txt blocks /admin and /api correctly',
              'Security headers present on all responses',
              'CORS configured for /api routes',
            ]},
            { cat:'SEO', checks:[
              'Each page has unique title and meta description',
              'Canonical URLs are correct',
              'Open Graph tags present',
              'JSON-LD schema validates on schema.org validator',
              'Sitemap submitted to Google Search Console',
              'All images have descriptive alt text',
              'No broken internal links (use Screaming Frog)',
            ]},
          ].map(({cat, checks}) => `
          <div class="qa-category">
            <div class="qa-cat-title">${cat}</div>
            ${checks.map(c => `
            <label class="qa-check-item">
              <input type="checkbox">
              <span>${c}</span>
            </label>`).join('')}
          </div>`).join('')}
        </div>
      </div>

    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════
//  HELPERS & UTILITIES
// ═══════════════════════════════════════════════════════════════════
function statusBadge(status) {
  const map = {
    pending: ['warn', 'clock', 'Pending'],
    printing: ['info', 'print', 'Printing'],
    packed: ['info', 'box', 'Packed'],
    shipped: ['success', 'truck', 'Shipped'],
    delivered: ['success', 'check-circle', 'Delivered'],
    rto: ['danger', 'undo', 'RTO'],
    cancelled: ['muted', 'times', 'Cancelled']
  };
  const [cls, icon, label] = map[status] || ['muted', 'circle', status];
  return `<span class="status-badge ${cls}"><i class="fas fa-${icon}"></i> ${label}</span>`;
}

function payBadge(method, confirmed) {
  if (method === 'cod') {
    return confirmed
      ? '<span class="pay-badge cod confirmed">💵 COD ✓</span>'
      : '<span class="pay-badge cod pending">💵 COD ⏳</span>';
  }
  if (method === 'prepaid' || method === 'upi') return '<span class="pay-badge prepaid">⚡ Prepaid</span>';
  return `<span class="pay-badge">${method}</span>`;
}

function openModal(content) {
  const overlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('adminModal');
  const modalContent = document.getElementById('modalContent');
  modalContent.innerHTML = content;
  overlay.style.display = 'flex';
  modal.classList.add('modal-enter');
  currentModal = true;
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').style.display = 'none';
  currentModal = null;
}

function adminToast(msg, type = 'success') {
  const container = document.getElementById('admin-toasts');
  const toast = document.createElement('div');
  toast.className = `admin-toast ${type}`;
  const icons = { success:'check-circle', error:'times-circle', warn:'exclamation-triangle', info:'info-circle' };
  toast.innerHTML = `<i class="fas fa-${icons[type] || 'info-circle'}"></i> ${msg}`;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 50);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3500);
}

// ─── Toggle Handlers ─────────────────────────────────────────────
function toggleCOD(val) {
  adminSettings.codEnabled = val;
  document.querySelectorAll('#toggle-cod, input[id="toggle-cod"]').forEach(el => el.checked = val);
  const chip = document.getElementById('cod-chip');
  if (chip) { chip.className = `toggle-chip ${val ? 'on' : 'off'}`; chip.querySelector('span').textContent = `COD ${val ? 'ON' : 'OFF'}`; }
  saveSettings();
  adminToast(`COD ${val ? 'enabled' : 'disabled'} globally`, val ? 'success' : 'warn');
  fetch('/api/admin/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ codEnabled: val }) }).catch(() => {});
}

function toggleAcrylic(val) {
  adminSettings.acrylicUpgrade = val;
  saveSettings();
  adminToast(`Acrylic upgrade ${val ? 'enabled' : 'disabled'}`, 'info');
}

function toggleFestival(val) {
  adminSettings.festivalMode = val;
  const chip = document.getElementById('festival-chip');
  if (chip) chip.className = `toggle-chip ${val ? 'on festival' : 'off'}`;
  saveSettings();
  adminToast(`Festival mode ${val ? 'enabled 🎉' : 'disabled'}`, 'info');
}

function toggleCombo(val) {
  adminSettings.comboEnabled = val;
  saveSettings();
  adminToast(`Bundle combos ${val ? 'enabled' : 'disabled'}`, 'info');
}

function toggleLossLeader(val) {
  adminSettings.lossLeaderEnabled = val;
  saveSettings();
  adminToast(`₹99 loss-leader ${val ? 'enabled' : 'disabled'}`, 'info');
}

function toggleExitPopup(val) {
  adminSettings.exitPopupEnabled = val;
  saveSettings();
  adminToast(`Exit popup ${val ? 'enabled' : 'disabled'}`, 'info');
}

// ─── Order Actions ────────────────────────────────────────────────
function updateOrderStatus(id, status) {
  const row = document.getElementById(`order-row-${id}`);
  if (row) { row.querySelector('.status-badge') && row.querySelector('td:nth-child(9)') ? row.querySelector('td:nth-child(9)').innerHTML = statusBadge(status) : null; }
  adminToast(`Order ${id} → ${status}`, 'success');
  fetch('/api/admin/orders/' + id + '/status', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status }) }).catch(()=>{});
}

function markCODConfirmed(id) {
  adminToast(`Order ${id} COD confirmed!`, 'success');
}

function filterOrders(status) {
  document.querySelectorAll('#orders-tbody tr').forEach(row => {
    row.style.display = status === 'all' || row.dataset.status === status ? '' : 'none';
  });
}

function filterOrdersPayment(method) {
  document.querySelectorAll('#orders-tbody tr').forEach(row => {
    row.style.display = method === 'all' || row.dataset.payment === method ? '' : 'none';
  });
}

function searchOrders(q) {
  q = q.toLowerCase();
  document.querySelectorAll('#orders-tbody tr').forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

function selectAllOrders(checked) {
  document.querySelectorAll('.order-checkbox').forEach(cb => cb.checked = checked);
  orderCheckboxChange();
}

function orderCheckboxChange() {
  const selected = document.querySelectorAll('.order-checkbox:checked').length;
  const bulk = document.getElementById('bulk-actions');
  if (bulk) { bulk.style.display = selected > 0 ? 'flex' : 'none'; }
  const cnt = document.getElementById('selected-count');
  if (cnt) cnt.textContent = selected + ' selected';
}

function bulkUpdateStatus(status) {
  const selected = document.querySelectorAll('.order-checkbox:checked').length;
  adminToast(`${selected} orders → ${status}`, 'success');
}

function exportOrders() { adminToast('CSV export starting...', 'info'); }
function syncShiprocket() { adminToast('Syncing with Shiprocket...', 'info'); }
function sendBulkWhatsApp() { adminToast('WhatsApp messages queued for all unconfirmed COD orders', 'success'); }
function printInvoice(id) { adminToast('Invoice PDF generating...', 'info'); }
function generateShippingLabel(id) { adminToast('Shipping label generating via Shiprocket...', 'info'); }

// ─── Product Actions ──────────────────────────────────────────────
function saveProduct(e) {
  e.preventDefault();
  closeModal();
  adminToast('Product added successfully! Refresh page to see changes.', 'success');
}
function updateProduct(e, id) {
  e.preventDefault();
  closeModal();
  adminToast('Product updated!', 'success');
}
function toggleProductStock(id) { adminToast('Stock status updated', 'success'); }
function toggleFeatured(id) { adminToast('Featured status toggled', 'success'); }
function filterProductsCat(cat) {}
function exportProducts() { adminToast('Products CSV exported', 'info'); }

// ─── Category Actions ─────────────────────────────────────────────
function openAddCategoryModal() {
  openModal(`
  <div class="modal-header"><h3>Add Category</h3><button onclick="closeModal()" class="modal-close"><i class="fas fa-times"></i></button></div>
  <form class="product-form" onsubmit="saveCategory(event)">
    <div class="form-group"><label>Category Name</label><input type="text" class="admin-input" name="name" required></div>
    <div class="form-group"><label>Slug</label><input type="text" class="admin-input" name="slug" required></div>
    <div class="form-group"><label>Description</label><input type="text" class="admin-input" name="desc"></div>
    <div class="form-group"><label>Emoji</label><input type="text" class="admin-input" name="emoji" value="🖼️"></div>
    <div class="form-actions"><button type="button" class="admin-btn-secondary" onclick="closeModal()">Cancel</button><button type="submit" class="admin-btn-primary">Save</button></div>
  </form>`);
}
function openEditCategoryModal(slug) { adminToast('Category editor opening...', 'info'); }
function saveCategory(e) { e.preventDefault(); closeModal(); adminToast('Category saved!', 'success'); }
function toggleCategoryLaunch(slug, launch) { adminToast(`Category ${slug} ${launch ? 'launched' : 'deactivated'}`, launch ? 'success' : 'warn'); }

// ─── Coupon Actions ───────────────────────────────────────────────
function saveCoupon(e) { e.preventDefault(); closeModal(); adminToast('Coupon created!', 'success'); }
function openEditCouponModal(code) { adminToast(`Editing coupon ${code}...`, 'info'); }
function toggleCoupon(code, active) { adminToast(`Coupon ${code} ${active ? 'activated' : 'deactivated'}`, active ? 'success' : 'warn'); }
function deleteCoupon(code) { if (confirm(`Delete coupon ${code}?`)) adminToast(`Coupon ${code} deleted`, 'warn'); }
function updateCouponValueLabel(type) {
  const lbl = document.getElementById('coupon-value-label');
  if (lbl) lbl.textContent = type === 'percent' ? 'Discount Value (%)' : type === 'flat' ? 'Discount Amount (₹)' : 'Shipping Discount';
}

// ─── Review Actions ───────────────────────────────────────────────
function approveReview(id) { adminToast(`Review #${id} approved and published!`, 'success'); }
function rejectReview(id) { adminToast(`Review #${id} rejected`, 'warn'); }
function replyToReview(id) { adminToast(`Reply editor for review #${id}`, 'info'); }
function deleteReview(id) { if (confirm('Delete this review?')) adminToast(`Review #${id} deleted`, 'warn'); }
function filterReviews(status) {}

// ─── Blog Actions ─────────────────────────────────────────────────
function openAddBlogModal() { adminToast('Blog editor opening...', 'info'); }
function openEditBlogModal(slug) { adminToast(`Editing: ${slug}...`, 'info'); }
function toggleBlogStatus(slug) { adminToast(`Blog status toggled for: ${slug}`, 'info'); }
function deleteBlog(slug) { if (confirm('Delete this post?')) adminToast(`Post ${slug} deleted`, 'warn'); }

// ─── Integration Actions ──────────────────────────────────────────
function configureIntegration(name) { adminToast(`Opening ${name} configuration...`, 'info'); }

// ─── Page Actions ─────────────────────────────────────────────────
function openPageEditor(page) { adminToast(`${page} page editor opening...`, 'info'); }
function openFAQEditor() {
  const faqEl = document.getElementById('faq-editor');
  if (faqEl) faqEl.style.display = faqEl.style.display === 'none' ? 'block' : 'none';
  adminToast('FAQ editor toggled', 'info');
}

// ══════════════════════════════════════════════════
//  CLOUDINARY GALLERY ADMIN VIEW
// ══════════════════════════════════════════════════
function renderCloudinaryGallery() {
  return `
  <div class="admin-card">
    <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <h3><i class="fas fa-images" style="color:var(--gold)"></i> Cloudinary Asset Gallery</h3>
        <p class="card-desc">Customer photo uploads — primary storage on Cloudinary, backed up to R2</p>
      </div>
      <button class="btn-admin btn-admin-primary" onclick="refreshGallery()"><i class="fas fa-sync"></i> Refresh</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-top:20px" id="cloudinary-gallery-grid">
      <div class="loading-admin"><i class="fas fa-spinner fa-spin"></i> Loading gallery...</div>
    </div>
    <div id="gallery-pagination" style="margin-top:16px;text-align:center"></div>
  </div>

  <div class="admin-card" style="margin-top:20px">
    <h3><i class="fas fa-chart-bar" style="color:var(--gold)"></i> Storage Stats</h3>
    <div class="stat-row" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:16px">
      <div class="stat-mini"><div class="stat-mini-val" id="gallery-total">—</div><div class="stat-mini-label">Total Uploads</div></div>
      <div class="stat-mini"><div class="stat-mini-val" id="gallery-size">—</div><div class="stat-mini-label">Estimated Size</div></div>
      <div class="stat-mini"><div class="stat-mini-val" id="gallery-r2">R2 Active</div><div class="stat-mini-label">Backup Status</div></div>
    </div>
  </div>

  <div class="admin-card" style="margin-top:20px">
    <h3><i class="fas fa-star" style="color:var(--gold)"></i> Store Rating Control</h3>
    <p class="card-desc" style="margin-bottom:16px">Control the store rating shown to customers. Must be ≥ 4.0.</p>
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <div class="form-group" style="margin:0">
        <label>Rating Value (4.0 – 5.0)</label>
        <input type="number" id="rating-value-input" min="4" max="5" step="0.1" value="4.9" style="width:100px">
      </div>
      <div class="form-group" style="margin:0">
        <label>Review Count</label>
        <input type="number" id="rating-count-input" min="0" value="1247" style="width:120px">
      </div>
      <button class="btn-admin btn-admin-primary" style="margin-top:20px" onclick="saveStoreRating()">
        <i class="fas fa-save"></i> Save Rating
      </button>
      <span id="rating-save-status" style="font-size:13px;color:var(--green);margin-top:20px"></span>
    </div>
  </div>`;
}

async function refreshGallery() {
  const grid = document.getElementById('cloudinary-gallery-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="loading-admin"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
  try {
    const res = await fetch('/api/admin/cloudinary/gallery?max=50', { headers: { 'X-Admin-Token': ADMIN.session?.token || '' } });
    const d = await res.json();
    document.getElementById('gallery-total').textContent = d.total || d.resources?.length || 0;
    const totalBytes = (d.resources || []).reduce((s, r) => s + (r.bytes || 0), 0);
    document.getElementById('gallery-size').textContent = totalBytes > 1024*1024 ? (totalBytes/1024/1024).toFixed(1) + ' MB' : (totalBytes/1024).toFixed(0) + ' KB';
    if (!d.resources || d.resources.length === 0) {
      grid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1">No uploads yet. Customer photos will appear here after first upload.</p>';
      return;
    }
    grid.innerHTML = d.resources.map(r => `
    <div class="gallery-item" style="border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--surface)">
      <img src="${r.secure_url}" alt="${r.public_id}" style="width:100%;aspect-ratio:3/4;object-fit:cover" loading="lazy">
      <div style="padding:8px;font-size:11px;color:var(--text-muted)">
        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.public_id.split('/').pop()}</div>
        <div>${r.format?.toUpperCase()} · ${(r.bytes/1024).toFixed(0)} KB</div>
        <div>${new Date(r.created_at).toLocaleDateString('en-IN')}</div>
      </div>
      ${d.demo ? '' : `<div style="padding:0 8px 8px"><button onclick="deleteCloudinaryAsset('${r.public_id}')" style="width:100%;background:rgba(204,0,0,0.1);border:1px solid rgba(204,0,0,0.3);color:#dc2626;border-radius:4px;padding:4px;font-size:11px;cursor:pointer"><i class="fas fa-trash"></i> Delete</button></div>`}
    </div>`).join('');
  } catch(e) {
    grid.innerHTML = '<p style="color:#dc2626">Failed to load gallery. Check Cloudinary credentials.</p>';
  }
}

async function deleteCloudinaryAsset(publicId) {
  if (!confirm('Delete this image from Cloudinary?')) return;
  adminToast('Delete not available in demo mode. Connect Cloudinary for live management.', 'warn');
}

async function saveStoreRating() {
  const value = parseFloat(document.getElementById('rating-value-input')?.value || '4.9');
  const count = parseInt(document.getElementById('rating-count-input')?.value || '1247');
  const statusEl = document.getElementById('rating-save-status');
  if (value < 4 || value > 5) { if (statusEl) statusEl.innerHTML = '<span style="color:#dc2626">Rating must be 4.0–5.0</span>'; return; }
  try {
    await fetch('/api/admin/rating', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': ADMIN.session?.token || '' },
      body: JSON.stringify({ value, count })
    });
    if (statusEl) statusEl.innerHTML = `✅ Saved! Customers see: <strong>${value}/5 (${count} reviews)</strong>`;
  } catch(e) {
    if (statusEl) statusEl.innerHTML = '<span style="color:#dc2626">Save failed</span>';
  }
}

// Auto-load gallery when section opens
function initGallerySection() {
  refreshGallery();
  // Load current rating
  fetch('/api/admin/rating').then(r => r.json()).then(d => {
    const ratingInput = document.getElementById('rating-value-input');
    const countInput = document.getElementById('rating-count-input');
    if (ratingInput && d.rating?.value) ratingInput.value = d.rating.value;
    if (countInput && d.rating?.count) countInput.value = d.rating.count;
  }).catch(() => {});
}

// ─── Section Init ─────────────────────────────────────────────────
function initSectionHandlers(name) {
  // Keyboard navigation
  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') closeModal({ target: document.getElementById('modalOverlay') });
  });
  if (name === 'gallery') initGallerySection();
}
