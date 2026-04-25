/* PhotoFrameIn — Customer SPA v4.0
   Profit Engine | Quota Guard | Razorpay | Pincode API | Image Quality Check
   Loss-Prevention | Add-on Gating | Exchange-Only Policy | Callback Toggle */
(function () {
  'use strict';

  // ══════════════════════════════════════════
  // PRICING MATRIX (mirrors server-side)
  // ══════════════════════════════════════════
  const PRICING_MATRIX = {
    'No Frame': {
      'A4 Small': 99,
      'Small (8×12)': 199,
      'Medium (12×18)': 299
    },
    'Standard': {
      'Small (8×12)': 449,
      'Medium (12×18)': 749,
      'Large (18×24)': 1099,
      'XL (24×36)': 1699
    },
    'Premium': {
      'Small (8×12)': 599,
      'Medium (12×18)': 999,
      'Large (18×24)': 1399,
      'XL (24×36)': 2199
    }
  };

  // Sizes available per frame type
  const FRAME_SIZES = {
    'No Frame': ['A4 Small', 'Small (8×12)', 'Medium (12×18)'],
    'Standard': ['Small (8×12)', 'Medium (12×18)', 'Large (18×24)', 'XL (24×36)'],
    'Premium': ['Small (8×12)', 'Medium (12×18)', 'Large (18×24)', 'XL (24×36)']
  };

  // Cost reference (for UI hints about value)
  const SHIPPING_THRESHOLD = 799;
  const COD_FEE = 148;            // Updated: ₹148 COD fee (covers RTO risk)
  const COD_MAX = 1995;
  const COD_STRICT_MAX = 1995;
  const COD_MIN = 499;            // Updated: min ₹499 for COD
  const FREE_SHIPPING_BELOW = 60; // shipping cost when below threshold
  const PREPAID_COUPON = 'PREPAID49';  // ₹49 off next order for prepaid
  const PREPAID_COUPON_VALUE = 49;

  // ══════════════════════════════════════════
  // STATE
  // ══════════════════════════════════════════
  let cart = JSON.parse(localStorage.getItem('pfi_cart') || '[]');
  let exitShown = false;
  let currentProduct = null;
  let selectedFrame = 'Standard';
  let selectedSize = 'Medium (12×18)';  // Default: Medium/Standard per spec
  let callbackRequested = false;
  let callbackNotes = '';
  let selectedBorderColor = 'Black';    // Frame border color: Wood | Black | Gold | White
  let selectedMountType = 'Direct';     // Direct | Mount (10% white inner-padding)
  let uploadedPhotoUrl = null;          // Cloudinary URL after upload
  let uploadedPhotoFile = null;         // Raw file for preview
  let customizationOpen = false;        // Progressive disclosure toggle
  let storeRating = { value: 4.9, count: 1247, label: '4.9/5' };
  // Fetch dynamic store settings
  axios.get('/api/settings/public').then(r => {
    if (r.data?.storeRating) storeRating = r.data.storeRating;
  }).catch(() => {});

  // ══════════════════════════════════════════
  // UTILS
  // ══════════════════════════════════════════
  const $ = (s, ctx) => (ctx || document).querySelector(s);
  const $$ = (s, ctx) => [...(ctx || document).querySelectorAll(s)];
  const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const fmt = p => '₹' + Number(p).toLocaleString('en-IN');
  const saveCart = () => { localStorage.setItem('pfi_cart', JSON.stringify(cart)); updateBadge(); };
  const updateBadge = () => {
    const n = cart.reduce((s, i) => s + (i.qty || 1), 0);
    $$('.cart-badge').forEach(el => { el.textContent = n; el.style.display = n > 0 ? 'flex' : 'none'; });
  };
  const toast = (msg, type = '') => {
    const el = document.createElement('div');
    el.className = 'toast';
    if (type === 'success') el.style.borderColor = 'rgba(22,163,74,0.5)';
    if (type === 'error') el.style.borderColor = 'rgba(204,0,0,0.5)';
    if (type === 'gold') el.style.borderColor = 'rgba(212,175,55,0.7)';
    el.innerHTML = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  };
  const nav = (path) => { history.pushState({}, '', path); render(); window.scrollTo(0, 0); };
  window.pfiNav = nav;

  // Cart total
  const cartTotal = () => cart.reduce((s, i) => s + (i.price * (i.qty || 1)), 0);

  // Get price for a frame+size combination
  const getPrice = (frame, size, productPricingMatrix) => {
    if (productPricingMatrix && productPricingMatrix[frame] && productPricingMatrix[frame][size]) {
      return productPricingMatrix[frame][size];
    }
    return PRICING_MATRIX[frame]?.[size] || null;
  };

  // ══════════════════════════════════════════
  // ROUTER
  // ══════════════════════════════════════════
  function render() {
    const path = location.pathname;
    const app = $('#app');
    if (!app) return;
    // Inject bottom nav + search overlay into body once
    let bnEl = document.getElementById('bottom-nav-root');
    if (!bnEl) {
      bnEl = document.createElement('div');
      bnEl.id = 'bottom-nav-root';
      document.body.appendChild(bnEl);
    }
    bnEl.innerHTML = bottomNav();

    const isPDP = path.startsWith('/product/');
    document.body.classList.toggle('is-pdp', isPDP);

    if (path === '/' || path === '') renderHome(app);
    else if (path === '/shop') renderShop(app);
    else if (isPDP) renderProduct(app, path.split('/product/')[1]);
    else if (path.startsWith('/category/')) renderCategory(app, path.split('/category/')[1]);
    else if (path === '/cart') renderCart(app);
    else if (path === '/checkout') renderCheckout(app);
    else if (path.startsWith('/blog')) renderBlog(app, path);
    else if (path === '/faq') renderFaq(app);
    else if (path === '/about') renderAbout(app);
    else if (path === '/contact') renderContact(app);
    else if (path === '/track') renderTrack(app);
    else if (path.startsWith('/policy')) renderPolicy(app, path.split('/policy/')[1] || 'returns');
    else renderHome(app);
    updateBadge();
    setupExitIntent();
  }

  window.addEventListener('popstate', render);

  // ══════════════════════════════════════════
  // HEADER
  // ══════════════════════════════════════════
  // Bottom nav for mobile
  function bottomNav() {
    const p = location.pathname;
    const n = cart.reduce((s, i) => s + (i.qty || 1), 0);
    return `
    <nav class="bottom-nav" aria-label="Mobile navigation">
      <div class="bottom-nav-items">
        <a href="/" onclick="pfiNav('/');return false" class="bottom-nav-item ${p==='/'?'active':''}">
          <i class="fas fa-home" aria-hidden="true"></i>
          <span>Home</span>
        </a>
        <a href="/shop" onclick="pfiNav('/shop');return false" class="bottom-nav-item ${p==='/shop'||p.startsWith('/category')?'active':''}">
          <i class="fas fa-th-large" aria-hidden="true"></i>
          <span>Shop</span>
        </a>
        <button class="bottom-nav-item" onclick="openSearchOverlay()" aria-label="Search">
          <i class="fas fa-search" aria-hidden="true"></i>
          <span>Search</span>
        </button>
        <a href="/cart" onclick="pfiNav('/cart');return false" class="bottom-nav-item ${p==='/cart'?'active':''}" aria-label="Cart (${n} items)">
          <i class="fas fa-shopping-bag" aria-hidden="true"></i>
          <span>Cart${n>0?` <span style="background:var(--red);color:#fff;border-radius:50%;font-size:9px;padding:1px 4px">${n}</span>`:''}</span>
        </a>
      </div>
    </nav>
    <div class="search-overlay" id="search-overlay" role="dialog" aria-label="Search">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
        <input class="search-overlay-input" id="search-overlay-input" placeholder="Search frames, styles, themes..." 
          onkeydown="if(event.key==='Enter'){pfiNav('/shop?q='+this.value);closeSearchOverlay()}"
          aria-label="Search frames">
        <button class="search-close" onclick="closeSearchOverlay()" aria-label="Close search">✕</button>
      </div>
      <div style="color:var(--gray3);font-size:13px;padding:0 4px">
        <div style="margin-bottom:12px;font-weight:700;color:var(--gray2)">Popular Searches</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${['Divine Om Frame','Ganesha','Lakshmi Diwali','Stay Hungry','Royal Enfield','Supercar','Cricket Frame','WFH Desk'].map(s=>`<button onclick="pfiNav('/shop?q=${encodeURIComponent(s)}');closeSearchOverlay()" style="background:var(--surface2);border:1px solid var(--border2);color:var(--gray2);padding:8px 14px;border-radius:20px;font-size:13px;cursor:pointer">${s}</button>`).join('')}
        </div>
      </div>
    </div>`;
  }

  window.openSearchOverlay = function() {
    $('#search-overlay')?.classList.add('open');
    setTimeout(() => $('#search-overlay-input')?.focus(), 100);
  };
  window.closeSearchOverlay = function() {
    $('#search-overlay')?.classList.remove('open');
  };

  function header() {
    const p = location.pathname;
    const n = cart.reduce((s, i) => s + (i.qty || 1), 0);
    return `
    <div class="announcement-bar">
      🚀 Hyderabad Express: 1-Day Delivery &nbsp;|&nbsp; Try any frame from ₹99 &nbsp;|&nbsp; Free Delivery ₹799+ &nbsp;|&nbsp;
      <a href="/shop" onclick="pfiNav('/shop');return false">Shop Now →</a>
    </div>
    <header class="site-header">
      <div class="header-inner">
        <a href="/" onclick="pfiNav('/');return false" class="logo">
          <div class="logo-icon">🖼️</div>
          <div class="logo-text">
            <span class="logo-name">PhotoFrameIn</span>
            <span class="logo-tagline">Premium Photo Frames</span>
          </div>
        </a>
        <nav class="header-nav" aria-label="Main navigation">
          <a href="/shop" onclick="pfiNav('/shop');return false" class="nav-link ${p==='/shop'?'active':''}">Shop All</a>
          <a href="/category/divine" onclick="pfiNav('/category/divine');return false" class="nav-link ${p==='/category/divine'?'active':''}">🕉️ Divine</a>
          <a href="/category/motivational" onclick="pfiNav('/category/motivational');return false" class="nav-link ${p==='/category/motivational'?'active':''}">💪 Hustle</a>
          <a href="/category/automotive" onclick="pfiNav('/category/automotive');return false" class="nav-link ${p==='/category/automotive'?'active':''}">🚗 Auto</a>
          <a href="/blog" onclick="pfiNav('/blog');return false" class="nav-link ${p.startsWith('/blog')?'active':''}">Blog</a>
          <a href="/faq" onclick="pfiNav('/faq');return false" class="nav-link ${p==='/faq'?'active':''}">Help</a>
        </nav>
        <div class="header-search">
          <div class="search-icon"><i class="fas fa-search" aria-hidden="true"></i></div>
          <input type="text" placeholder="Search frames..." id="header-search-input" aria-label="Search frames"
            onkeydown="if(event.key==='Enter')pfiNav('/shop?q='+this.value)">
        </div>
        <div class="header-actions">
          <a href="/cart" onclick="pfiNav('/cart');return false" class="cart-btn" aria-label="Shopping cart (${n} items)">
            <i class="fas fa-shopping-bag" aria-hidden="true"></i>
            <span class="cart-badge" style="display:${n>0?'flex':'none'}" aria-live="polite">${n}</span>
          </a>
          <button class="mobile-menu-btn" onclick="openMobileMenu()" aria-label="Open menu"><i class="fas fa-bars"></i></button>
        </div>
      </div>
    </header>
    <div class="mobile-menu" id="mobile-menu" onclick="closeMobileMenu(event)" role="dialog" aria-label="Navigation menu">
      <div class="mobile-menu-panel">
        <button class="mobile-menu-close" onclick="closeMobileMenu()" aria-label="Close menu"><i class="fas fa-times"></i></button>
        <a href="/" onclick="pfiNav('/');closeMobileMenu();return false" class="mobile-nav-link"><i class="fas fa-home fa-fw mr-2"></i> Home</a>
        <a href="/category/divine" onclick="pfiNav('/category/divine');closeMobileMenu();return false" class="mobile-nav-link"><i class="fas fa-om fa-fw mr-2"></i> 🕉️ Divine & Spiritual</a>
        <a href="/category/motivational" onclick="pfiNav('/category/motivational');closeMobileMenu();return false" class="mobile-nav-link"><i class="fas fa-fire fa-fw mr-2"></i> 💪 Motivational</a>
        <a href="/shop" onclick="pfiNav('/shop');closeMobileMenu();return false" class="mobile-nav-link"><i class="fas fa-th-large fa-fw mr-2"></i> Shop All</a>
        <a href="/category/automotive" onclick="pfiNav('/category/automotive');closeMobileMenu();return false" class="mobile-nav-link"><i class="fas fa-car fa-fw mr-2"></i> 🚗 Automotive</a>
        <a href="/category/sports" onclick="pfiNav('/category/sports');closeMobileMenu();return false" class="mobile-nav-link"><i class="fas fa-trophy fa-fw mr-2"></i> 🏏 Sports</a>
        <a href="/category/gifts" onclick="pfiNav('/category/gifts');closeMobileMenu();return false" class="mobile-nav-link"><i class="fas fa-gift fa-fw mr-2"></i> Gifts & Custom</a>
        <a href="/blog" onclick="pfiNav('/blog');closeMobileMenu();return false" class="mobile-nav-link"><i class="fas fa-newspaper fa-fw mr-2"></i> Blog</a>
        <a href="/track" onclick="pfiNav('/track');closeMobileMenu();return false" class="mobile-nav-link"><i class="fas fa-truck fa-fw mr-2"></i> Track Order</a>
        <a href="/faq" onclick="pfiNav('/faq');closeMobileMenu();return false" class="mobile-nav-link"><i class="fas fa-question-circle fa-fw mr-2"></i> FAQ</a>
        <div class="divider"></div>
        <div style="font-size:13px;color:var(--gray3);padding:0 8px">
          <div class="flex items-center gap-2 mb-2"><i class="fab fa-whatsapp" style="color:#25D366"></i> +91 79895 31818</div>
          <div class="flex items-center gap-2"><i class="fas fa-envelope" style="color:var(--gold)"></i> support@photoframein.in</div>
        </div>
      </div>
    </div>`;
  }

  window.openMobileMenu = function() { $('#mobile-menu').classList.add('open'); };
  window.closeMobileMenu = function(e) {
    if (!e || !e.target.closest('.mobile-menu-panel') || e.target.closest('.mobile-menu-close')) {
      $('#mobile-menu')?.classList.remove('open');
    }
  };

  // ══════════════════════════════════════════
  // FOOTER
  // ══════════════════════════════════════════
  function footer() {
    return `
    <a href="https://wa.me/917989531818?text=Hi%2C+I+need+help+with+a+photo+frame+order" target="_blank" rel="noopener" class="whatsapp-widget" title="Chat on WhatsApp" aria-label="Chat on WhatsApp">
      <i class="fab fa-whatsapp" aria-hidden="true"></i>
    </a>
    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div>
            <div class="logo" style="margin-bottom:0;text-decoration:none">
              <div class="logo-icon">🖼️</div>
              <div class="logo-text">
                <span class="logo-name">PhotoFrameIn</span>
                <span class="logo-tagline">Premium Photo Frames Online</span>
              </div>
            </div>
            <p class="footer-brand-desc">India's finest online store for divine spiritual frames and motivational wall art. Handcrafted in Hyderabad, delivered across India.</p>
            <div class="footer-social">
              <a href="https://instagram.com/photoframein" target="_blank" rel="noopener" class="social-btn" title="Instagram"><i class="fab fa-instagram"></i></a>
              <a href="https://facebook.com/photoframein" target="_blank" rel="noopener" class="social-btn" title="Facebook"><i class="fab fa-facebook-f"></i></a>
              <a href="https://pinterest.com/photoframein" target="_blank" rel="noopener" class="social-btn" title="Pinterest"><i class="fab fa-pinterest-p"></i></a>
              <a href="https://wa.me/917989531818" target="_blank" rel="noopener" class="social-btn" title="WhatsApp"><i class="fab fa-whatsapp"></i></a>
            </div>
          </div>
          <div>
            <div class="footer-col-title">Shop</div>
            <ul class="footer-links">
              <li><a href="/category/divine" onclick="pfiNav('/category/divine');return false">🕉️ Divine & Spiritual</a></li>
              <li><a href="/category/motivational" onclick="pfiNav('/category/motivational');return false">💪 Motivational</a></li>
              <li><a href="/category/automotive" onclick="pfiNav('/category/automotive');return false">🚗 Automotive</a></li>
              <li><a href="/shop" onclick="pfiNav('/shop');return false">All Products</a></li>
              <li><a href="/category/gifts" onclick="pfiNav('/category/gifts');return false">Gifts & Custom</a></li>
              <li><a href="/category/sports" onclick="pfiNav('/category/sports');return false">Sports Frames</a></li>
            </ul>
          </div>
          <div>
            <div class="footer-col-title">Help</div>
            <ul class="footer-links">
              <li><a href="/faq" onclick="pfiNav('/faq');return false">FAQ</a></li>
              <li><a href="/track" onclick="pfiNav('/track');return false">Track Order</a></li>
              <li><a href="/policy/shipping" onclick="pfiNav('/policy/shipping');return false">Shipping Policy</a></li>
              <li><a href="/policy/returns" onclick="pfiNav('/policy/returns');return false">Returns Policy</a></li>
              <li><a href="/contact" onclick="pfiNav('/contact');return false">Contact Us</a></li>
            </ul>
          </div>
          <div>
            <div class="footer-col-title">Contact</div>
            <div class="footer-contact-item"><i class="fab fa-whatsapp"></i> <span>+91 79895 31818</span></div>
            <div class="footer-contact-item"><i class="fas fa-envelope"></i> <span>support@photoframein.in</span></div>
            <div class="footer-contact-item"><i class="fas fa-map-marker-alt"></i> <span>Hyderabad, Telangana</span></div>
            <div class="footer-contact-item"><i class="fas fa-clock"></i> <span>Mon–Sun 9AM–9PM</span></div>
            <div style="margin-top:16px">
              <div class="footer-col-title">We Accept</div>
              <div class="flex gap-2 flex-wrap mt-2">
                <span class="footer-payment-icon">UPI</span>
                <span class="footer-payment-icon">Visa</span>
                <span class="footer-payment-icon">Mastercard</span>
                <span class="footer-payment-icon">COD</span>
              </div>
            </div>
          </div>
        </div>
        <div class="footer-bottom">
          <p class="footer-copy">© ${new Date().getFullYear()} PhotoFrameIn. All Rights Reserved. |
            <a href="/policy/privacy" onclick="pfiNav('/policy/privacy');return false" style="color:inherit">Privacy</a> ·
            <a href="/policy/terms" onclick="pfiNav('/policy/terms');return false" style="color:inherit">Terms</a>
          </p>
          <p style="font-size:11px;color:var(--gray4);margin-top:6px">📦 5-Layer Protective Packaging &nbsp;|&nbsp; ✅ Unboxing Video Protection &nbsp;|&nbsp; 🚚 Pan-India Delivery &nbsp;|&nbsp; ⚡ Hyderabad Express</p>
        </div>
      </div>
    </footer>`;
  }

  // ══════════════════════════════════════════
  // PRODUCT CARD
  // ══════════════════════════════════════════
  function productCard(p, showLossLeader = true) {
    const lowestPrice = p.lossFee || p.price;
    const hasLossLeader = showLossLeader && p.lossFee;
    return `
    <article class="product-card" onclick="pfiNav('/product/${p.slug}')" style="cursor:pointer" aria-label="${esc(p.name)}">
      <div class="product-img-wrap">
        <img src="${p.image}" alt="${esc(p.name)}" loading="lazy" class="product-img">
        ${p.badge ? `<div class="product-badge">${p.badge}</div>` : ''}
        ${hasLossLeader ? `<div class="loss-leader-tag">Try from ₹99</div>` : ''}
        <button class="quick-add-btn" onclick="event.stopPropagation();quickAdd(${p.id})" aria-label="Quick add ${esc(p.name)}">
          <i class="fas fa-plus"></i> Quick Add
        </button>
      </div>
      <div class="product-info">
        <div class="product-category-tag">${getCatName(p.category)}</div>
        <h3 class="product-name">${esc(p.name)}</h3>
        ${p.giftMessage ? `<div class="gift-tag">${p.giftMessage}</div>` : ''}
        <div class="product-rating" aria-label="${p.rating} out of 5 stars, ${p.reviews} reviews">
          <div class="stars">${'★'.repeat(Math.floor(p.rating))}${p.rating % 1 >= 0.5 ? '½' : ''}</div>
          <span class="review-count">(${p.reviews})</span>
        </div>
        <div class="product-pricing">
          ${hasLossLeader ? `<span class="try-price">Try from ${fmt(lowestPrice)}</span>` : ''}
          <span class="price">${fmt(p.price)}</span>
          ${p.comparePrice ? `<span class="compare-price">${fmt(p.comparePrice)}</span>` : ''}
          ${p.comparePrice ? `<span class="save-badge">Save ${fmt(p.comparePrice - p.price)}</span>` : ''}
        </div>
      </div>
    </article>`;
  }

  function getCatName(slug) {
    const map = { 'divine':'Divine & Spiritual','motivational':'Motivational','wall-art':'Wall Art','gifts':'Gifts & Custom','sports':'Sports','vintage':'Vintage','abstract':'Abstract','kids':'Kids' };
    return map[slug] || slug;
  }

  // Quick add to cart (default: Standard Small at ₹449)
  window.quickAdd = async function(id) {
    try {
      const res = await axios.get(`/api/products/${id}`);
      const p = res.data.product;
      // Default to Standard + Small (8×12) if available, else first frame+size
      let frame = 'Standard', size = 'Small (8×12)';
      if (p.pricingMatrix) {
        const frames = Object.keys(p.pricingMatrix);
        frame = frames.includes('Standard') ? 'Standard' : frames[0];
        const sizes = Object.keys(p.pricingMatrix[frame]);
        size = sizes.includes('Small (8×12)') ? 'Small (8×12)' : sizes[0];
      }
      const price = p.pricingMatrix?.[frame]?.[size] || p.price;
      const key = `${p.id}_${frame}_${size}`;
      const existing = cart.find(i => i.key === key);
      if (existing) { existing.qty = (existing.qty || 1) + 1; }
      else { cart.push({ key, id: p.id, slug: p.slug, name: p.name, image: p.image, frame, size, price, qty: 1 }); }
      saveCart();
      toast(`<i class='fas fa-check-circle' style='color:#16a34a;margin-right:6px'></i> Added to cart! <a href='/cart' onclick="pfiNav('/cart');return false" style='color:var(--gold);margin-left:8px'>View Cart →</a>`, 'success');
    } catch(e) {
      toast('Could not add item. Try again.', 'error');
    }
  };

  // ══════════════════════════════════════════
  // HOME PAGE
  // ══════════════════════════════════════════
  async function renderHome(app) {
    app.innerHTML = header() + `
    <main id="main-content">
      <!-- HERO -->
      <section class="hero-section" aria-label="Hero">
        <div class="hero-bg"></div>
        <div class="container hero-content">
          <div class="hero-badge-row">
            <span class="hero-badge">🇮🇳 Made in India · Ships Pan-India</span>
            <span class="hero-badge" id="hero-rating-badge">⭐ ${storeRating.value}/5 from ${storeRating.count}+ Reviews</span>
          </div>
          <h1 class="hero-title">Premium Photo Frames<br><span class="gradient-text">From ₹449</span></h1>
          <p class="hero-subtitle">Divine spiritual frames • Motivational wall art • Gift-ready packaging<br>
          <strong style="color:var(--gold)">₹99 No-Frame print available as an add-on with any framed order</strong></p>
          <div class="hero-trust-row">
            <span class="trust-pill">✅ Free Delivery ₹799+</span>
            <span class="trust-pill">📦 12hr Dispatch</span>
            <span class="trust-pill">💳 COD Available</span>
            <span class="trust-pill">🔄 Exchange Shield</span>
          </div>
          <div class="hero-cta-row">
            <a href="/category/divine" onclick="pfiNav('/category/divine');return false" class="btn-primary">
              🕉️ Shop Divine Frames
            </a>
            <a href="/category/motivational" onclick="pfiNav('/category/motivational');return false" class="btn-secondary">
              💪 Shop Motivational
            </a>
          </div>
          <div class="loss-leader-hero">
            <div class="loss-leader-pill">
              <span class="pulse-dot"></span>
              <strong>Add-on Offer:</strong> Get any ₹99 No-Frame print FREE with a Standard/Premium frame order.
              <a href="/shop" onclick="pfiNav('/shop');return false">Shop Frames →</a>
            </div>
          </div>
        </div>
        <div class="hero-social-proof">
          <div class="social-proof-card">
            <div class="spcard-img">🙏</div>
            <div class="spcard-text"><strong>Priya from Mumbai</strong><br>Ordered Lakshmi frame for Diwali — arrived in 2 days, stunning!</div>
          </div>
          <div class="social-proof-card">
            <div class="spcard-img">⭐</div>
            <div class="spcard-text"><strong>Rohit from Bengaluru</strong><br>Bought the 3-pack motivational set — my WFH wall looks amazing.</div>
          </div>
        </div>
      </section>

      <!-- TRUST BAR -->
      <section class="trust-bar" aria-label="Trust signals">
        <div class="container trust-bar-inner">
          <div class="trust-item"><i class="fas fa-shield-alt"></i><span><strong>Dispute Shield</strong> — Record unboxing, we replace free</span></div>
          <div class="trust-item"><i class="fas fa-bolt"></i><span><strong>12hr Dispatch</strong> — All in-stock orders</span></div>
          <div class="trust-item"><i class="fas fa-truck"></i><span><strong>Free Delivery</strong> — Above ₹799</span></div>
          <div class="trust-item"><i class="fas fa-rupee-sign"></i><span><strong>Try from ₹99</strong> — No-frame print, full quality</span></div>
          <div class="trust-item"><i class="fas fa-undo"></i><span><strong>Exchange Shield</strong> — Unboxing video = free replacement</span></div>
        </div>
      </section>

      <!-- LAUNCH CATEGORIES -->
      <section class="section-pad" aria-labelledby="launch-cats-heading">
        <div class="container">
          <h2 id="launch-cats-heading" class="section-title">Our Launch Collections</h2>
          <p class="section-sub">Two categories. Expertly curated. Proven bestsellers.</p>
          <div class="launch-cats-grid">
            <a href="/category/divine" onclick="pfiNav('/category/divine');return false" class="launch-cat-card divine-card">
              <div class="launch-cat-emoji">🕉️</div>
              <h3>Divine & Spiritual</h3>
              <p>Ganesh • Lakshmi • Om • Durga</p>
              <div class="launch-cat-stats">
                <span>⭐ 4.9 avg rating</span>
                <span>🎁 #1 Gifting</span>
                <span>From ₹99</span>
              </div>
              <div class="launch-cat-cta">Explore Divine →</div>
            </a>
            <a href="/category/motivational" onclick="pfiNav('/category/motivational');return false" class="launch-cat-card motivational-card">
              <div class="launch-cat-emoji">💪</div>
              <h3>Motivational</h3>
              <p>Typography • Office • WFH • Hustle</p>
              <div class="launch-cat-stats">
                <span>⭐ 4.8 avg rating</span>
                <span>🎓 Gift for Students</span>
                <span>From ₹99</span>
              </div>
              <div class="launch-cat-cta">Explore Motivational →</div>
            </a>
          </div>
        </div>
      </section>

      <!-- PRICING TRANSPARENCY -->
      <section class="section-pad pricing-section" aria-labelledby="pricing-heading">
        <div class="container">
          <h2 id="pricing-heading" class="section-title">Simple, Transparent Pricing</h2>
          <p class="section-sub">No hidden charges. Start from ₹99. Upgrade anytime.</p>
          <div class="pricing-table-wrap">
            <table class="pricing-table" role="table" aria-label="Product pricing table">
              <thead>
                <tr>
                  <th>Option</th>
                  <th>A4/Small</th>
                  <th>Medium</th>
                  <th>Large</th>
                  <th>XL</th>
                </tr>
              </thead>
              <tbody>
                <tr class="pricing-row loss-leader-row">
                  <td><strong>🎯 No Frame Print</strong><br><small>Trial option — try before you commit</small></td>
                  <td><strong>₹99</strong></td>
                  <td><strong>₹299</strong></td>
                  <td><em>N/A</em></td>
                  <td><em>N/A</em></td>
                </tr>
                <tr class="pricing-row">
                  <td><strong>Standard Frame</strong><br><small>MDF frame + glass — great for daily décor</small></td>
                  <td><strong>₹449</strong></td>
                  <td><strong>₹749</strong></td>
                  <td><strong>₹1,099</strong></td>
                  <td><strong>₹1,699</strong></td>
                </tr>
                <tr class="pricing-row premium-row">
                  <td><strong>⭐ Premium Frame</strong><br><small>Solid wood + museum glass — for gifts & statements</small></td>
                  <td><strong>₹599</strong></td>
                  <td><strong>₹999</strong></td>
                  <td><strong>₹1,399</strong></td>
                  <td><strong>₹2,199</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="pricing-cta-row">
            <div class="pricing-hint">
              <i class="fas fa-info-circle"></i>
              <strong>Shipping:</strong> ₹60 below ₹799 order value. <strong>FREE</strong> above ₹799.
              COD available with ₹49 handling fee (orders ₹299–₹1,999).
              Save ₹50 by paying prepaid on orders above ₹599.
            </div>
            <a href="/shop" onclick="pfiNav('/shop');return false" class="btn-primary">Start Shopping →</a>
          </div>
        </div>
      </section>

      <!-- FEATURED PRODUCTS -->
      <section class="section-pad" aria-labelledby="featured-heading">
        <div class="container">
          <h2 id="featured-heading" class="section-title">Featured Products</h2>
          <p class="section-sub">Our most-loved frames this month</p>
          <div class="products-grid" id="home-featured-grid">
            <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div>
          </div>
          <div style="text-align:center;margin-top:32px">
            <a href="/shop" onclick="pfiNav('/shop');return false" class="btn-outline">View All Products →</a>
          </div>
        </div>
      </section>

      <!-- LOSS LEADER STRIP -->
      <section class="loss-leader-strip" aria-label="Trial offer">
        <div class="container">
          <div class="loss-leader-banner">
            <div class="loss-leader-left">
              <span class="lls-badge">TRIAL OFFER</span>
              <h3>Try Any Frame Design for Just ₹99</h3>
              <p>Our A4 no-frame print is a full archival-quality print. Try it in your space. 67% of customers upgrade to a Standard Frame within 30 days.</p>
            </div>
            <div class="loss-leader-right">
              <a href="/shop" onclick="pfiNav('/shop');return false" class="btn-primary">
                <i class="fas fa-arrow-right"></i> Start with ₹99
              </a>
              <div class="lls-small">Free shipping on orders ₹799+</div>
            </div>
          </div>
        </div>
      </section>

      <!-- UPSELL SECTION -->
      <section class="section-pad" aria-labelledby="bundles-heading">
        <div class="container">
          <h2 id="bundles-heading" class="section-title">Best Value Bundles</h2>
          <p class="section-sub">Buy more, save more — our most popular combos</p>
          <div class="bundles-grid">
            <article class="bundle-card" onclick="pfiNav('/product/divine-pooja-corner-triptych')" style="cursor:pointer">
              <div class="bundle-img-row">
                <img src="https://images.unsplash.com/photo-1569163139394-de4e5f43e5ca?w=200&q=80" alt="Divine Triptych Set">
                <img src="https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=200&q=80" alt="Ganesh Frame">
                <img src="https://images.unsplash.com/photo-1594284222012-7bade13f2c50?w=200&q=80" alt="Lakshmi Frame">
              </div>
              <div class="bundle-info">
                <div class="bundle-tag">🕉️ DIVINE BUNDLE</div>
                <h3>Divine Triptych Set</h3>
                <p>Ganesh + Lakshmi + Om Mantra in matching Standard Frames</p>
                <div class="bundle-pricing">
                  <span class="bundle-price">₹1,799</span>
                  <span class="bundle-was">Was ₹2,997</span>
                  <span class="bundle-save">Save ₹1,198</span>
                </div>
                <button class="btn-primary w-full" onclick="event.stopPropagation();quickAdd(105)">Add Bundle to Cart</button>
              </div>
            </article>
            <article class="bundle-card" onclick="pfiNav('/product/motivational-3-pack-office-bundle')" style="cursor:pointer">
              <div class="bundle-img-row">
                <img src="https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=200&q=80" alt="Stay Hungry Frame">
                <img src="https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=200&q=80" alt="Do What You Love Frame">
                <img src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=200&q=80" alt="Hustle Hard Frame">
              </div>
              <div class="bundle-info">
                <div class="bundle-tag">💪 MOTIVATIONAL BUNDLE</div>
                <h3>Motivational 3-Pack</h3>
                <p>Stay Hungry + Do What You Love + Hustle Hard — desk wall kit</p>
                <div class="bundle-pricing">
                  <span class="bundle-price">₹999</span>
                  <span class="bundle-was">Was ₹1,797</span>
                  <span class="bundle-save">Save ₹798</span>
                </div>
                <button class="btn-primary w-full" onclick="event.stopPropagation();quickAdd(204)">Add Bundle to Cart</button>
              </div>
            </article>
          </div>
        </div>
      </section>

      <!-- BLOG PREVIEW -->
      <section class="section-pad" aria-labelledby="blog-preview-heading">
        <div class="container">
          <h2 id="blog-preview-heading" class="section-title">From Our Blog</h2>
          <div class="blog-grid" id="home-blog-grid">
            <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>
          </div>
          <div style="text-align:center;margin-top:24px">
            <a href="/blog" onclick="pfiNav('/blog');return false" class="btn-outline">Read All Articles →</a>
          </div>
        </div>
      </section>
    </main>
    ${footer()}`;

    // Load featured products
    try {
      const res = await axios.get('/api/products/featured');
      const grid = $('#home-featured-grid');
      if (grid) grid.innerHTML = res.data.products.slice(0,4).map(p => productCard(p)).join('');
    } catch(e) {}

    // Load blog
    try {
      const res = await axios.get('/api/blog');
      const grid = $('#home-blog-grid');
      if (grid) {
        grid.innerHTML = res.data.posts.slice(0,3).map(post => `
        <article class="blog-card" onclick="pfiNav('/blog/${post.slug}')" style="cursor:pointer">
          <img src="${post.image}" alt="${esc(post.title)}" loading="lazy" class="blog-card-img">
          <div class="blog-card-body">
            <span class="blog-cat-tag">${esc(post.category)}</span>
            <h3 class="blog-card-title">${esc(post.title)}</h3>
            <p class="blog-card-excerpt">${esc(post.excerpt)}</p>
            <div class="blog-card-meta">${post.readTime} · ${new Date(post.date).toLocaleDateString('en-IN',{month:'short',day:'numeric',year:'numeric'})}</div>
          </div>
        </article>`).join('');
      }
    } catch(e) {}
  }

  // ══════════════════════════════════════════
  // SHOP PAGE
  // ══════════════════════════════════════════
  async function renderShop(app) {
    const urlParams = new URLSearchParams(location.search);
    const qParam = urlParams.get('q') || '';
    app.innerHTML = header() + `
    <main id="main-content">
      <section class="page-header">
        <div class="container">
          <nav aria-label="Breadcrumb"><ol class="breadcrumb"><li><a href="/" onclick="pfiNav('/');return false">Home</a></li><li>Shop</li></ol></nav>
          <h1>All Photo Frames</h1>
          <p>From ₹99 no-frame prints to ₹2,199 Premium Frames</p>
        </div>
      </section>
      <section class="section-pad">
        <div class="container">
          <div class="shop-toolbar">
            <div class="filter-tabs" role="group" aria-label="Category filter">
              <button class="filter-tab active" onclick="filterProducts('all',this)">All</button>
              <button class="filter-tab" onclick="filterProducts('divine',this)">🕉️ Divine</button>
              <button class="filter-tab" onclick="filterProducts('motivational',this)">💪 Motivational</button>
              <button class="filter-tab" onclick="filterProducts('gifts',this)">🎁 Gifts</button>
              <button class="filter-tab" onclick="filterProducts('sports',this)">🏏 Sports</button>
            </div>
            <select id="sort-select" class="sort-select" aria-label="Sort products" onchange="sortProducts(this.value)">
              <option value="featured">Featured</option>
              <option value="price_low">Price: Low to High</option>
              <option value="price_high">Price: High to Low</option>
              <option value="rating">Top Rated</option>
            </select>
          </div>
          <div class="products-grid" id="shop-grid">
            <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div>
          </div>
        </div>
      </section>
    </main>
    ${footer()}`;

    let allProducts = [];
    try {
      const res = await axios.get('/api/products');
      allProducts = res.data.products;
      window._allProducts = allProducts;
      renderProductGrid(allProducts);
    } catch(e) {}

    window.filterProducts = function(cat, btn) {
      $$('.filter-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      const filtered = cat === 'all' ? allProducts : allProducts.filter(p => p.category === cat);
      renderProductGrid(filtered);
    };
    window.sortProducts = function(sort) {
      const arr = [...(window._allProducts || [])];
      if (sort === 'price_low') arr.sort((a,b) => a.price - b.price);
      else if (sort === 'price_high') arr.sort((a,b) => b.price - a.price);
      else if (sort === 'rating') arr.sort((a,b) => b.rating - a.rating);
      renderProductGrid(arr);
    };
  }

  function renderProductGrid(products) {
    const grid = $('#shop-grid');
    if (!grid) return;
    if (!products.length) { grid.innerHTML = '<p style="color:var(--gray3)">No products found.</p>'; return; }
    grid.innerHTML = products.map(p => productCard(p)).join('');
  }

  // ══════════════════════════════════════════
  // CATEGORY PAGE
  // ══════════════════════════════════════════
  async function renderCategory(app, slug) {
    const catMeta = {
      divine: { name: 'Divine & Spiritual', desc: 'Sacred frames for your home — Ganesh, Lakshmi, Om, Durga. Perfect for Diwali & housewarming gifts.', emoji: '🕉️' },
      motivational: { name: 'Motivational', desc: 'Bold typography frames for WFH desks, offices & study rooms. Perfect birthday & graduation gifts.', emoji: '💪' }
    };
    const cat = catMeta[slug] || { name: slug, desc: '', emoji: '🖼️' };
    app.innerHTML = header() + `
    <main id="main-content">
      <section class="page-header">
        <div class="container">
          <nav aria-label="Breadcrumb"><ol class="breadcrumb"><li><a href="/" onclick="pfiNav('/');return false">Home</a></li><li><a href="/shop" onclick="pfiNav('/shop');return false">Shop</a></li><li>${esc(cat.name)}</li></ol></nav>
          <h1>${cat.emoji} ${esc(cat.name)} Frames</h1>
          <p>${esc(cat.desc)}</p>
        </div>
      </section>
      <section class="section-pad">
        <div class="container">
          <div class="products-grid" id="cat-grid">
            <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div>
          </div>
        </div>
      </section>
    </main>
    ${footer()}`;

    try {
      const res = await axios.get(`/api/products?category=${slug}`);
      const grid = $('#cat-grid');
      if (grid) grid.innerHTML = res.data.products.length ? res.data.products.map(p => productCard(p)).join('') : '<p style="color:var(--gray3)">No products in this category yet.</p>';
    } catch(e) {}
  }

  // ══════════════════════════════════════════
  // PRODUCT DETAIL PAGE
  // ══════════════════════════════════════════
  async function renderProduct(app, slug) {
    app.innerHTML = header() + `<main id="main-content"><div class="container" style="padding:60px 20px;text-align:center"><i class="fas fa-spinner fa-spin" style="font-size:32px;color:var(--gold)"></i></div></main>${footer()}`;

    let product, related;
    try {
      const res = await axios.get(`/api/products/${slug}`);
      product = res.data.product;
      related = res.data.related;
      currentProduct = product;
    } catch(e) {
      app.innerHTML = header() + `<main><div class="container" style="padding:80px 20px;text-align:center"><h2>Product not found</h2><a href="/shop" onclick="pfiNav('/shop');return false" class="btn-primary" style="margin-top:16px">Back to Shop</a></div></main>${footer()}`;
      return;
    }

    // Build variant state — Default: Standard frame + Medium (12×18) per product spec
    const frames = product.frames || ['No Frame', 'Standard', 'Premium'];
    const defaultFrame = frames.includes('Standard') ? 'Standard' : frames[0];
    const defaultSizes = product.pricingMatrix ? Object.keys(product.pricingMatrix[defaultFrame] || {}) : [];
    // Prefer Medium (12×18), then Small (8×12), then first available
    const defaultSize = defaultSizes.includes('Medium (12×18)') ? 'Medium (12×18)'
                       : defaultSizes.includes('Small (8×12)') ? 'Small (8×12)'
                       : (defaultSizes[0] || '');
    const defaultPrice = product.pricingMatrix?.[defaultFrame]?.[defaultSize] || product.price;

    selectedFrame = defaultFrame;
    selectedSize = defaultSize;

    app.innerHTML = header() + `
    <main id="main-content">
      <section class="section-pad">
        <div class="container">
          <nav aria-label="Breadcrumb">
            <ol class="breadcrumb">
              <li><a href="/" onclick="pfiNav('/');return false">Home</a></li>
              <li><a href="/shop" onclick="pfiNav('/shop');return false">Shop</a></li>
              <li><a href="/category/${product.category}" onclick="pfiNav('/category/${product.category}');return false">${getCatName(product.category)}</a></li>
              <li>${esc(product.name)}</li>
            </ol>
          </nav>

          <div class="pdp-grid">
            <!-- Gallery + Live Preview -->
            <div class="pdp-gallery">
              <!-- Live Frame Preview (progressive: shows after upload, or product image) -->
              <div class="pdp-main-img-wrap" id="pdp-preview-wrap">
                <!-- CSS Frame Preview Canvas -->
                <div class="frame-preview-canvas" id="frame-preview-canvas" style="display:none">
                  <div class="frame-preview-outer" id="frame-preview-outer">
                    <div class="frame-mount-layer" id="frame-mount-layer">
                      <img id="frame-preview-photo" src="" alt="Your photo preview" class="frame-preview-photo">
                    </div>
                  </div>
                  <div class="frame-preview-label" id="frame-preview-label">
                    <i class="fas fa-eye"></i> Live Preview — <span id="frame-preview-desc">Standard · Black · Direct</span>
                  </div>
                </div>
                <!-- Default product image -->
                <div id="pdp-img-wrap">
                  <img id="pdp-main-img" src="${product.image}" alt="${esc(product.name)}" class="pdp-main-img" loading="eager">
                  ${product.badge ? `<div class="product-badge" style="top:16px;left:16px">${product.badge}</div>` : ''}
                </div>
              </div>

              ${(product.galleryImages||[]).length > 1 ? `
              <div class="pdp-thumbs" role="list" aria-label="Product images">
                ${product.galleryImages.map((img, i) => `
                <button class="pdp-thumb ${i===0?'active':''}" onclick="setMainImg('${img}',this)" aria-label="View image ${i+1}">
                  <img src="${img}" alt="${esc(product.name)} view ${i+1}" loading="lazy">
                </button>`).join('')}
              </div>` : ''}

              <!-- PRIMARY UPLOAD CTA (always visible — progressive disclosure) -->
              <div class="pdp-upload-hero">
                <label class="btn-upload-primary" for="photo-upload-input-hero">
                  <i class="fas fa-camera"></i>
                  <span class="upload-btn-text">Upload Your Photo</span>
                  <span class="upload-btn-sub">See it in a frame — instantly</span>
                </label>
                <input type="file" id="photo-upload-input-hero" accept="image/*" style="display:none" onchange="handlePhotoUpload(this)">
                <div id="upload-progress-bar" class="upload-progress-bar" style="display:none">
                  <div class="upload-progress-fill" id="upload-progress-fill"></div>
                </div>
                <div id="upload-status-msg" class="upload-status-msg" style="display:none"></div>
              </div>

              <!-- Dispute Shield -->
              <div class="dispute-shield">
                <i class="fas fa-shield-alt"></i>
                <span><strong>Dispute Shield:</strong> Record your unboxing video. Damaged? We replace it free, no questions asked.</span>
              </div>
            </div>

            <!-- Product Info -->
            <div class="pdp-info">
              <div class="pdp-cat-tag">${getCatName(product.category)}</div>
              <h1 class="pdp-title">${esc(product.name)}</h1>
              ${product.subTitle ? `<p class="pdp-subtitle">${esc(product.subTitle)}</p>` : ''}
              <!-- Dynamic Store Rating (admin-controlled, always ≥4.0) -->
              <div class="pdp-rating" aria-label="${product.rating} out of 5 stars, ${product.reviews} reviews">
                <div class="stars large">${'★'.repeat(Math.floor(product.rating))}</div>
                <span id="pdp-rating-val">${product.rating}/5</span>
                <span class="review-count-pdp" id="pdp-review-count">(${product.reviews} verified reviews)</span>
                <span class="store-rating-badge" id="store-rating-badge">
                  <i class="fas fa-store" style="color:var(--gold);font-size:10px"></i> Store: ${storeRating.value}/5
                </span>
              </div>
              ${product.giftMessage ? `<div class="pdp-gift-msg">${product.giftMessage}</div>` : ''}

              <!-- Price Display with Prepaid Discount -->
              <div class="pdp-price-block" id="pdp-price-block">
                <span class="pdp-price" id="pdp-price">${fmt(defaultPrice)}</span>
                ${product.comparePrice ? `<span class="pdp-compare">${fmt(product.comparePrice)}</span>` : ''}
                ${product.comparePrice ? `<span class="pdp-save">Save ${fmt(product.comparePrice - defaultPrice)}</span>` : ''}
                <div class="prepaid-price-tag">
                  <i class="fas fa-bolt" style="color:var(--gold)"></i>
                  Prepaid: <strong id="pdp-prepaid-price">${fmt(defaultPrice - 50)}</strong>
                  <span class="prepaid-save-chip">Save ₹50</span>
                </div>
                ${product.lossFee ? `<div class="pdp-loss-leader-hint">Or try the A4 No-Frame print for just ${fmt(product.lossFee + 50)}</div>` : ''}
              </div>

              <!-- Quick Select (Standard + Medium — Most Popular) -->
              <div class="pdp-quick-select">
                <div class="pdp-quick-label">
                  <i class="fas fa-bolt" style="color:var(--gold)"></i>
                  <strong>Most Popular Choice:</strong> Standard Frame · Medium (12×18) — ₹749
                </div>
                <div class="pdp-frame-summary" id="pdp-frame-summary">
                  ${defaultFrame === 'Standard' ? '🖼️ MDF frame + clear glass — clean, durable, perfect for home & gifting' : '⭐ Solid wood, museum glass — premium gift'}
                </div>
              </div>

              <!-- Frame Type Selector -->
              <div class="pdp-option-group">
                <div class="pdp-option-label">Frame Type: <strong id="selected-frame-label">${defaultFrame}</strong></div>
                <div class="variant-btns" id="frame-btns" role="group" aria-label="Select frame type">
                  ${frames.map(f => {
                    const fDesc = f === 'No Frame' ? 'Print only, shipped flat' : f === 'Standard' ? 'MDF + glass (most popular)' : 'Solid wood + museum glass';
                    return `<button class="variant-btn ${f===defaultFrame?'active':''}" onclick="selectFrame('${f}',this)" data-frame="${f}" title="${fDesc}" aria-pressed="${f===defaultFrame}">${f}</button>`;
                  }).join('')}
                </div>
                <div class="frame-type-desc" id="frame-type-desc">${defaultFrame === 'No Frame' ? '📄 Print only — shipped flat. <em>Add-on item: must order with a Standard/Premium frame.</em>' : defaultFrame === 'Standard' ? '🖼️ MDF frame + clear glass. Clean look, durable. Our most popular option.' : '⭐ Solid kiln-dried wood, 12mm deep profile, museum UV glass. Gift-ready.'}</div>
              </div>

              <!-- Size Selector -->
              <div class="pdp-option-group">
                <div class="pdp-option-label">Size: <strong id="selected-size-label">${defaultSize}</strong></div>
                <div class="variant-btns" id="size-btns" role="group" aria-label="Select size">
                  ${defaultSizes.map(s => {
                    const sPrice = product.pricingMatrix?.[defaultFrame]?.[s] || 0;
                    const isDefault = s === defaultSize;
                    return `<button class="variant-btn size-btn ${isDefault?'active':''}" onclick="selectSize('${s}',this)" data-size="${s}" aria-pressed="${isDefault}">${s}<br><small>${fmt(sPrice)}</small></button>`;
                  }).join('')}
                </div>
              </div>

              <!-- Customization Options (collapsible — progressive disclosure) -->
              <div class="pdp-advanced-toggle">
                <button class="pdp-advanced-btn" onclick="toggleAdvancedOptions(this)" aria-expanded="false">
                  <i class="fas fa-sliders-h"></i> Customization Options
                  <i class="fas fa-chevron-down pdp-adv-arrow"></i>
                </button>
                <div class="pdp-advanced-panel" id="pdp-advanced-panel" style="display:none">

                  <!-- Border Color -->
                  <div class="pdp-option-group">
                    <div class="pdp-option-label">Border Color: <strong id="selected-border-label">${selectedBorderColor}</strong></div>
                    <div class="variant-btns border-color-btns" id="border-color-btns" role="group" aria-label="Select border color">
                      ${['Wood','Black','Gold','White'].map(c => `
                        <button class="variant-btn border-color-btn ${c==='Black'?'active':''} border-swatch-${c.toLowerCase()}"
                          onclick="selectBorderColor('${c}',this)" data-color="${c}" aria-pressed="${c==='Black'}">
                          <span class="color-swatch swatch-${c.toLowerCase()}"></span>${c}
                        </button>`).join('')}
                    </div>
                  </div>

                  <!-- Frame/Mount Type -->
                  <div class="pdp-option-group">
                    <div class="pdp-option-label">Mounting Style: <strong id="selected-mount-label">${selectedMountType}</strong></div>
                    <div class="variant-btns" id="mount-btns" role="group" aria-label="Select mounting style">
                      <button class="variant-btn active" onclick="selectMount('Direct',this)" data-mount="Direct" aria-pressed="true">
                        Direct<br><small>Edge to edge</small>
                      </button>
                      <button class="variant-btn" onclick="selectMount('Mount',this)" data-mount="Mount" aria-pressed="false">
                        Mount<br><small>White inner border</small>
                      </button>
                    </div>
                    <div class="mount-desc" id="mount-desc">📐 <strong>Direct:</strong> Your image fills the frame edge-to-edge for maximum impact.</div>
                  </div>

                  <!-- Live Photo Upload (inside customization) -->
                  <div class="pdp-custom-photo-section">
                    <label class="pdp-custom-label"><i class="fas fa-image"></i> Upload Your Photo (optional)</label>
                    <input type="file" id="custom-photo-input" accept="image/*" onchange="handlePhotoUploadDetailed(this)" class="pdp-photo-input">
                    <div id="img-quality-result" class="img-quality-result" style="display:none"></div>
                    <div class="pdp-photo-hint">
                      <i class="fas fa-info-circle"></i>
                      For Medium (12×18): min 1152×1728px. Quality auto-checked. We'll verify before printing.
                    </div>
                  </div>

                  <!-- Gift Message -->
                  <div class="pdp-gift-section">
                    <label class="pdp-custom-label"><i class="fas fa-envelope-open-text"></i> Gift Message (optional, free)</label>
                    <textarea id="gift-message-input" placeholder="Write a personal message for the recipient..." rows="3" class="pdp-gift-msg-input" maxlength="200"></textarea>
                  </div>

                  <!-- Add-on: No-Frame Print -->
                  ${product.lossFee ? `
                  <div class="pdp-addon-section">
                    <label class="pdp-addon-toggle">
                      <input type="checkbox" id="addon-print-checkbox" onchange="toggleAddonPrint(this)">
                      <span class="pdp-addon-label">
                        <i class="fas fa-plus-circle" style="color:var(--gold)"></i>
                        <strong>Add No-Frame A4 Print as add-on</strong>
                        <span class="addon-badge">ADD-ON ONLY</span>
                      </span>
                    </label>
                    <div class="pdp-addon-note">📄 Trial print — not available as standalone. Works as a bonus alongside your framed order.</div>
                  </div>` : ''}
                </div>
              </div>

              <!-- Prepaid Nudge -->
              <div class="prepaid-nudge" id="prepaid-nudge">
                <i class="fas fa-bolt"></i>
                <span>Pay online = <strong>₹50 instant discount</strong> + save ₹${COD_FEE} COD fee. Save up to ₹${COD_FEE + 50} total!</span>
              </div>

              <!-- Sticky ATC + Buy Now (mobile bottom bar) -->
              <div class="pdp-cta-wrap">
                <button class="btn-atc" id="atc-btn" onclick="addToCartPDP()">
                  <i class="fas fa-shopping-bag"></i>
                  Add to Cart — <span id="atc-price">${fmt(defaultPrice)}</span>
                </button>
                <button class="btn-buy-now" id="buy-now-btn" onclick="addToCartPDP(true)">
                  <i class="fas fa-bolt"></i>
                  Buy Now
                </button>
              </div>

              <!-- Shiprocket Live Rates -->
              <div class="shiprocket-rates" id="shiprocket-rates" style="display:none">
                <i class="fas fa-truck"></i> <span id="shiprocket-rate-text">Checking shipping rates...</span>
              </div>

              <!-- Callback Request Toggle -->
              <div class="pdp-callback-section">
                <label class="pdp-callback-toggle">
                  <input type="checkbox" id="callback-toggle" onchange="toggleCallback(this)">
                  <span><i class="fas fa-phone-alt" style="color:var(--gold)"></i> <strong>Request a Callback</strong> — Our team will help you choose the right frame</span>
                </label>
                <div id="callback-notes-wrap" style="display:none">
                  <textarea id="callback-notes" placeholder="E.g. Need help choosing size for bedroom wall, 8ft wide sofa..." rows="2" class="pdp-callback-notes" maxlength="200"></textarea>
                  <button class="btn-callback-submit" onclick="submitCallback()">
                    <i class="fas fa-paper-plane"></i> Request Callback
                  </button>
                  <div id="callback-status" class="callback-status"></div>
                </div>
              </div>

              <!-- Upsell Bundle -->
              ${product.upsellBundle ? `
              <div class="pdp-upsell">
                <i class="fas fa-gift"></i>
                <span>${esc(product.upsellBundle)}</span>
              </div>` : ''}

              <!-- Shipping Info -->
              <div class="pdp-shipping-info" id="pdp-shipping-info">
                ${defaultPrice >= SHIPPING_THRESHOLD ? 
                  '<i class="fas fa-truck" style="color:#16a34a"></i> <span style="color:#16a34a"><strong>Free Delivery</strong> included with this order!</span>' :
                  `<i class="fas fa-truck"></i> <span>Add <strong>${fmt(SHIPPING_THRESHOLD - defaultPrice)}</strong> more for free shipping. Or pay ₹60 shipping.</span>`
                }
              </div>

              <!-- Exchange Policy Notice -->
              <div class="pdp-exchange-notice">
                <i class="fas fa-exchange-alt" style="color:#d4af37"></i>
                <span><strong>Exchange Only Policy:</strong> We replace damaged items free with unboxing video proof. No returns on custom frames.</span>
              </div>

              <!-- Trust Signals -->
              <div class="pdp-trust-row">
                <span><i class="fas fa-shield-alt"></i> Exchange Shield</span>
                <span><i class="fas fa-bolt"></i> 12hr Dispatch</span>
                <span><i class="fas fa-video"></i> Unboxing Video</span>
                <span><i class="fas fa-star"></i> ${product.rating}/5 Stars</span>
              </div>

              <!-- Description -->
              <div class="pdp-description">
                <h3>About This Frame</h3>
                <p>${esc(product.description)}</p>
              </div>
            </div>
          </div>

          <!-- Related Products -->
          ${related && related.length ? `
          <div style="margin-top:64px">
            <h2 class="section-title">You May Also Like</h2>
            <div class="products-grid">${related.map(p => productCard(p)).join('')}</div>
          </div>` : ''}
        </div>
      </section>
    </main>
    ${footer()}
    <!-- Sticky ATC Bar (mobile bottom) -->
    <div class="pdp-sticky-cta" id="pdp-sticky-cta">
      <div class="pdp-sticky-left">
        <span class="pdp-sticky-price" id="sticky-price">${fmt(defaultPrice)}</span>
        <span class="pdp-sticky-prepaid">Prepaid: <strong>${fmt(defaultPrice - 50)}</strong></span>
      </div>
      <div class="pdp-sticky-right">
        <button class="sticky-cart-btn" onclick="addToCartPDP()"><i class="fas fa-bag-shopping"></i> Add</button>
        <button class="sticky-buy-btn" onclick="addToCartPDP(true)"><i class="fas fa-bolt"></i> Buy Now</button>
      </div>
    </div>`;

    // PDP variant selection
    window.setMainImg = function(src, btn) {
      const img = $('#pdp-main-img');
      if (img) img.src = src;
      $$('.pdp-thumb').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
    };

    window.selectFrame = function(frame, btn) {
      selectedFrame = frame;
      $('#selected-frame-label').textContent = frame;
      $$('#frame-btns .variant-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed','true');

      // Frame description
      const descs = {
        'No Frame': '📄 Print only — shipped flat in rigid envelope. Perfect to try a design.',
        'Standard': '🖼️ MDF frame + clear glass. Clean look, durable. Our most popular option.',
        'Premium': '⭐ Solid kiln-dried wood, 12mm deep profile, museum UV glass. Gift-ready.'
      };
      const descEl = $('#frame-type-desc');
      if (descEl) descEl.textContent = descs[frame] || '';

      // Update size buttons for this frame
      const sizesForFrame = product.pricingMatrix?.[frame] ? Object.keys(product.pricingMatrix[frame]) : [];
      const sizeContainer = $('#size-btns');
      if (sizeContainer) {
        sizeContainer.innerHTML = sizesForFrame.map(s => {
          const sPrice = product.pricingMatrix?.[frame]?.[s] || 0;
          return `<button class="variant-btn size-btn" onclick="selectSize('${s}',this)" data-size="${s}" aria-pressed="false">${s}<br><small>${fmt(sPrice)}</small></button>`;
        }).join('');
        // Auto-select first size
        if (sizesForFrame.length) {
          const firstBtn = sizeContainer.querySelector('.variant-btn');
          if (firstBtn) selectSize(sizesForFrame[0], firstBtn);
        }
      }
    };

    window.selectSize = function(size, btn) {
      selectedSize = size;
      $('#selected-size-label').textContent = size;
      $$('#size-btns .variant-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed','true');
      updatePriceDisplay();
    };

    function updatePriceDisplay() {
      const price = product.pricingMatrix?.[selectedFrame]?.[selectedSize] || product.price;
      const priceEl = $('#pdp-price');
      const atcPriceEl = $('#atc-price');
      const prepaidEl = $('#pdp-prepaid-price');
      if (priceEl) priceEl.textContent = fmt(price);
      if (atcPriceEl) atcPriceEl.textContent = fmt(price);
      if (prepaidEl) prepaidEl.textContent = fmt(price - 50);

      // Shipping indicator
      const shippingEl = $('#pdp-shipping-info');
      if (shippingEl) {
        shippingEl.innerHTML = price >= SHIPPING_THRESHOLD
          ? '<i class="fas fa-truck" style="color:#16a34a"></i> <span style="color:#16a34a"><strong>Free Delivery</strong> included!</span>'
          : `<i class="fas fa-truck"></i> <span>Add <strong>${fmt(SHIPPING_THRESHOLD - price)}</strong> more for free shipping.</span>`;
      }

      // Update sticky bar
      const stickyPrice = $('#sticky-price');
      const stickyPrepaid = document.querySelector('.pdp-sticky-prepaid strong');
      if (stickyPrice) stickyPrice.textContent = fmt(price);
      if (stickyPrepaid) stickyPrepaid.textContent = fmt(price - 50);

      // Update CSS frame preview if open
      updateFramePreview();
    }

    // CSS Frame Preview — update colors, mount mode, and photo
    function updateFramePreview() {
      const outer = $('#frame-preview-outer');
      const mountLayer = $('#frame-mount-layer');
      const descEl = $('#frame-preview-desc');
      if (!outer) return;

      // Apply border color via data attribute (CSS handles visual)
      outer.setAttribute('data-color', selectedBorderColor.toLowerCase());
      outer.setAttribute('data-frame', selectedFrame.toLowerCase());

      // Mount mode: 10% white inner padding
      if (mountLayer) {
        mountLayer.style.padding = selectedMountType === 'Mount' ? '10%' : '0';
        mountLayer.style.background = selectedMountType === 'Mount' ? '#fff' : 'transparent';
      }
      if (descEl) descEl.textContent = `${selectedFrame} · ${selectedBorderColor} · ${selectedMountType}`;
    }

    // Load Shiprocket rates for current pincode (if available)
    async function loadShiprocketRates(pincode) {
      const ratesEl = $('#shiprocket-rates');
      const rateText = $('#shiprocket-rate-text');
      if (!ratesEl || !pincode) return;
      ratesEl.style.display = 'flex';
      if (rateText) rateText.textContent = 'Checking shipping rates...';
      try {
        const res = await axios.get(`/api/shipping/partners?pincode=${pincode}&weight=0.5`);
        const d = res.data;
        const rate = d.cheapestRate || d.rate || 0;
        if (rateText) {
          if (rate <= 99 || rate === 0) {
            rateText.innerHTML = '<strong style="color:#16a34a">Free Shipping</strong> to your area via Shiprocket';
          } else {
            rateText.innerHTML = `Shipping: <strong>₹${rate}</strong> via ${d.courier || 'Shiprocket'}`;
          }
        }
      } catch(e) {
        ratesEl.style.display = 'none';
      }
    }

    // Advanced options toggle
    window.toggleAdvancedOptions = function(btn) {
      const panel = $('#pdp-advanced-panel');
      const arrow = btn ? btn.querySelector('.pdp-adv-arrow') : null;
      if (!panel) return;
      const isOpen = panel.style.display !== 'none';
      panel.style.display = isOpen ? 'none' : 'block';
      if (arrow) arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
      if (btn) btn.setAttribute('aria-expanded', String(!isOpen));
    };

    // Border color selector
    window.selectBorderColor = function(color, btn) {
      selectedBorderColor = color;
      const lbl = $('#selected-border-label');
      if (lbl) lbl.textContent = color;
      $$('#border-color-btns .variant-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
      if (btn) { btn.classList.add('active'); btn.setAttribute('aria-pressed','true'); }
      updateFramePreview();
      toast(`<i class='fas fa-palette' style='color:var(--gold);margin-right:6px'></i> Border: <strong>${color}</strong> — preview updated`, 'gold');
    };

    // Mount type selector
    window.selectMount = function(type, btn) {
      selectedMountType = type;
      const lbl = $('#selected-mount-label');
      const desc = $('#mount-desc');
      if (lbl) lbl.textContent = type;
      $$('#mount-btns .variant-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
      if (btn) { btn.classList.add('active'); btn.setAttribute('aria-pressed','true'); }
      const descs = {
        'Direct': '📐 <strong>Direct:</strong> Your image fills the frame edge-to-edge for maximum impact.',
        'Mount':  '🎨 <strong>Mount:</strong> 10% white inner border gives a classic gallery feel — great for gifting.'
      };
      if (desc) desc.innerHTML = descs[type] || '';
      updateFramePreview();
    };

    // Primary photo upload handler (hero button)
    window.handlePhotoUpload = async function(input) {
      const file = input?.files?.[0];
      if (!file) return;
      uploadedPhotoFile = file;
      const statusEl = $('#upload-status-msg');
      const progressBar = $('#upload-progress-bar');
      const progressFill = $('#upload-progress-fill');
      const previewCanvas = $('#frame-preview-canvas');
      const imgWrap = $('#pdp-img-wrap');

      // Show local preview immediately
      const localUrl = URL.createObjectURL(file);
      const previewImg = $('#frame-preview-photo');
      if (previewImg) previewImg.src = localUrl;
      if (previewCanvas) previewCanvas.style.display = 'block';
      if (imgWrap) imgWrap.style.display = 'none';
      updateFramePreview();

      // Show progress
      if (progressBar) progressBar.style.display = 'block';
      if (progressFill) { progressFill.style.width = '0%'; setTimeout(() => progressFill.style.width = '60%', 100); }
      if (statusEl) { statusEl.style.display = 'block'; statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading to Cloudinary...'; }

      try {
        // Upload to Cloudinary via our API
        const formData = new FormData();
        formData.append('file', file);
        formData.append('productSlug', product.slug);
        formData.append('frame', selectedFrame);
        formData.append('size', selectedSize);

        const res = await axios.post('/api/upload/photo', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            const pct = Math.round((e.loaded / e.total) * 100);
            if (progressFill) progressFill.style.width = pct + '%';
          }
        });

        if (res.data.success) {
          uploadedPhotoUrl = res.data.cloudinaryUrl || res.data.url;
          if (progressFill) progressFill.style.width = '100%';
          if (statusEl) statusEl.innerHTML = `<i class='fas fa-check-circle' style='color:#16a34a'></i> Photo uploaded! <strong>Live preview active.</strong>`;
          // Check image quality
          checkImageQualityFromFile(file);
        } else {
          throw new Error(res.data.error || 'Upload failed');
        }
      } catch(e) {
        // Fallback: use local preview even if upload fails
        uploadedPhotoUrl = localUrl;
        if (progressFill) progressFill.style.width = '100%';
        if (statusEl) statusEl.innerHTML = `<i class='fas fa-check-circle' style='color:var(--gold)'></i> Preview ready! <small style='color:var(--gray3)'>(Will upload at checkout)</small>`;
      }

      // Open customization options
      const panel = $('#pdp-advanced-panel');
      const advBtn = $('.pdp-advanced-btn');
      if (panel && panel.style.display === 'none') {
        toggleAdvancedOptions(advBtn);
      }
    };

    // Detailed upload (inside customization panel)
    window.handlePhotoUploadDetailed = function(input) {
      // Sync to hero upload then trigger quality check
      const file = input?.files?.[0];
      if (!file) return;
      const heroInput = $('#photo-upload-input-hero');
      if (heroInput) {
        const dt = new DataTransfer();
        dt.items.add(file);
        heroInput.files = dt.files;
      }
      handlePhotoUpload(input);
    };

    function checkImageQualityFromFile(file) {
      const resultEl = $('#img-quality-result');
      if (!resultEl || !file) return;
      const img = new Image();
      img.onload = function() {
        const w = img.naturalWidth, h = img.naturalHeight;
        URL.revokeObjectURL(img.src);
        const minRes = {
          'A4 Small': { w: 794, h: 1123 },
          'Small (8\u00d712)': { w: 768, h: 1152 },
          'Medium (12\u00d718)': { w: 1152, h: 1728 },
          'Large (18\u00d724)': { w: 1728, h: 2304 },
          'XL (24\u00d736)': { w: 2304, h: 3456 }
        };
        const req = minRes[selectedSize] || { w: 800, h: 600 };
        const passed = w >= req.w && h >= req.h;
        resultEl.style.display = 'block';
        resultEl.innerHTML = passed
          ? `<i class='fas fa-check-circle' style='color:#16a34a'></i> <strong>Quality: Excellent!</strong> ${w}\u00d7${h}px — Perfect for ${selectedSize}`
          : `<i class='fas fa-exclamation-triangle' style='color:#f59e0b'></i> <strong>Low resolution.</strong> ${w}\u00d7${h}px. Recommended: ${req.w}\u00d7${req.h}px for ${selectedSize}`;
        resultEl.className = 'img-quality-result ' + (passed ? 'quality-pass' : 'quality-warn');
      };
      img.src = URL.createObjectURL(file);
    }

    // Image quality checker
    window.checkImageQuality = function(input) {
      const file = input.files?.[0];
      if (!file) return;
      const resultEl = $('#img-quality-result');
      if (!resultEl) return;
      const sizeKB = file.size / 1024;
      const img = new Image();
      img.onload = function() {
        const w = img.naturalWidth, h = img.naturalHeight;
        URL.revokeObjectURL(img.src);
        const minRes = {
          'A4 Small': { w: 794, h: 1123 },
          'Small (8\u00d712)': { w: 768, h: 1152 },
          'Medium (12\u00d718)': { w: 1152, h: 1728 },
          'Large (18\u00d724)': { w: 1728, h: 2304 },
          'XL (24\u00d736)': { w: 2304, h: 3456 }
        };
        const req = minRes[selectedSize] || { w: 800, h: 600 };
        const passed = w >= req.w && h >= req.h;
        resultEl.style.display = 'block';
        resultEl.innerHTML = passed
          ? `<i class='fas fa-check-circle' style='color:#16a34a'></i> <strong>Quality: Excellent!</strong> ${w}\u00d7${h}px — Perfect for ${selectedSize}`
          : `<i class='fas fa-exclamation-triangle' style='color:#f59e0b'></i> <strong>Low resolution warning.</strong> Uploaded: ${w}\u00d7${h}px. Required for ${selectedSize}: min ${req.w}\u00d7${req.h}px. Please upload a higher-res photo for best print quality.`;
        resultEl.className = 'img-quality-result ' + (passed ? 'quality-pass' : 'quality-warn');
      };
      img.onerror = function() {
        resultEl.style.display = 'block';
        resultEl.innerHTML = '<i class="fas fa-times-circle" style="color:#dc2626"></i> Could not read image. Use JPG, PNG, or WebP.';
        resultEl.className = 'img-quality-result quality-fail';
      };
      img.src = URL.createObjectURL(file);
    };

    // Add-on print toggle
    window.toggleAddonPrint = function(checkbox) {
      if (checkbox.checked) {
        toast(`<i class='fas fa-plus-circle' style='color:var(--gold);margin-right:6px'></i> <strong>\u20b999 No-Frame print added</strong> as add-on with your framed order.`, 'gold');
      }
    };

    // Callback toggle
    window.toggleCallback = function(checkbox) {
      callbackRequested = checkbox.checked;
      const wrap = $('#callback-notes-wrap');
      if (wrap) wrap.style.display = checkbox.checked ? 'block' : 'none';
    };
    window.submitCallback = async function() {
      const notes = $('#callback-notes')?.value || '';
      const statusEl = $('#callback-status');
      callbackNotes = notes;
      try {
        await axios.post('/api/leads', { source: 'callback_request', product: product.slug, notes });
        if (statusEl) { statusEl.innerHTML = `<i class='fas fa-check-circle' style='color:#16a34a'></i> Callback requested! We'll call you within 2 hours (9AM–9PM).`; statusEl.style.display = 'block'; }
      } catch(e) {
        if (statusEl) { statusEl.innerHTML = `<i class='fas fa-phone-alt'></i> WhatsApp us: <a href='https://wa.me/917989531818' target='_blank'>+91 79895 31818</a>`; statusEl.style.display = 'block'; }
      }
    };

    window.addToCartPDP = function(buyNow = false) {
      const price = product.pricingMatrix?.[selectedFrame]?.[selectedSize] || product.price;

      // Loss-prevention: block No-Frame-only standalone
      if (selectedFrame === 'No Frame' && price <= 149) {
        const cartHasFramed = cart.some(i => i.frame !== 'No Frame');
        if (!cartHasFramed) {
          toast(`<i class='fas fa-info-circle' style='color:#f59e0b;margin-right:6px'></i> The No-Frame print is an <strong>add-on item</strong>. Add a Standard or Premium frame first.`, 'error');
          setTimeout(() => toast(`<i class='fas fa-arrow-up' style='color:var(--gold);margin-right:6px'></i> <strong>Most Popular:</strong> Standard Medium frame — \u20b9799!`, 'gold'), 2000);
          return;
        }
      }

      const key = `${product.id}_${selectedFrame}_${selectedSize}_${selectedBorderColor}_${selectedMountType}`;
      const existing = cart.find(i => i.key === key);
      if (existing) { existing.qty = (existing.qty || 1) + 1; }
      else {
        cart.push({
          key, id: product.id, slug: product.slug, name: product.name,
          image: uploadedPhotoUrl || product.image,
          customPhotoUrl: uploadedPhotoUrl,
          frame: selectedFrame, size: selectedSize,
          borderColor: selectedBorderColor, mountType: selectedMountType,
          price, qty: 1
        });
      }
      saveCart();

      if (buyNow) {
        nav('/checkout');
        return;
      }

      toast(`<i class='fas fa-check-circle' style='color:#16a34a;margin-right:6px'></i> Added! <strong>${product.name}</strong> (${selectedFrame}, ${selectedSize}) <a href='/cart' onclick="pfiNav('/cart');return false" style='color:var(--gold);margin-left:8px'>View Cart \u2192</a>`, 'success');

      if (product.upsellBundle) {
        setTimeout(() => toast(`<i class='fas fa-gift' style='color:var(--gold);margin-right:6px'></i> <strong>Bundle deal:</strong> ${product.upsellBundle}`, 'gold'), 1500);
      }
      if (selectedFrame === 'Standard') {
        setTimeout(() => toast(`<i class='fas fa-crown' style='color:var(--gold);margin-right:6px'></i> <strong>Upgrade to Premium Wood?</strong> Add \u20b9250 for solid wood + museum glass — perfect gift!`, 'gold'), 2500);
      }
    };
  }

  // ══════════════════════════════════════════
  // CART PAGE
  // ══════════════════════════════════════════
  function renderCart(app) {
    const total = cartTotal();
    const shipping = total >= SHIPPING_THRESHOLD ? 0 : (total > 0 ? FREE_SHIPPING_BELOW : 0);
    const grandTotal = total + shipping;

    app.innerHTML = header() + `
    <main id="main-content">
      <section class="section-pad">
        <div class="container">
          <nav aria-label="Breadcrumb"><ol class="breadcrumb"><li><a href="/" onclick="pfiNav('/');return false">Home</a></li><li>Cart</li></ol></nav>
          <h1>Your Cart</h1>

          ${cart.length === 0 ? `
          <div class="empty-cart">
            <div style="font-size:64px;margin-bottom:16px">🛒</div>
            <h2>Your cart is empty</h2>
            <p>Discover our divine and motivational frames</p>
            <a href="/shop" onclick="pfiNav('/shop');return false" class="btn-primary">Start Shopping →</a>
          </div>` : `
          <!-- Free Shipping Progress Bar -->
          ${total < SHIPPING_THRESHOLD && total > 0 ? `
          <div class="shipping-progress-bar">
            <div class="spb-track">
              <div class="spb-fill" style="width:${Math.min(100, (total/SHIPPING_THRESHOLD)*100)}%"></div>
            </div>
            <p>Add <strong>${fmt(SHIPPING_THRESHOLD - total)}</strong> more for <strong>FREE shipping</strong>! 🚚</p>
          </div>` : total >= SHIPPING_THRESHOLD ? `
          <div class="shipping-progress-bar free">
            <p>🎉 <strong>You've unlocked FREE shipping!</strong></p>
          </div>` : ''}

          <div class="cart-layout">
            <div class="cart-items" id="cart-items-list">
              ${cart.map(item => `
              <article class="cart-item">
                <img src="${esc(item.image)}" alt="${esc(item.name)}" class="cart-item-img" loading="lazy">
                <div class="cart-item-info">
                  <div class="cart-item-name">${esc(item.name)}</div>
                  <div class="cart-item-variant">${esc(item.frame)} · ${esc(item.size)}</div>
                  <div class="cart-item-price">${fmt(item.price)}</div>
                </div>
                <div class="cart-item-qty">
                  <button class="qty-btn" onclick="updateQty('${esc(item.key)}',-1)" aria-label="Decrease quantity">−</button>
                  <span aria-label="Quantity: ${item.qty||1}">${item.qty||1}</span>
                  <button class="qty-btn" onclick="updateQty('${esc(item.key)}',1)" aria-label="Increase quantity">+</button>
                </div>
                <button class="cart-remove" onclick="removeItem('${esc(item.key)}')" aria-label="Remove ${esc(item.name)}">
                  <i class="fas fa-times"></i>
                </button>
              </article>`).join('')}
            </div>

            <aside class="cart-summary">
              <h3>Order Summary</h3>
              <div class="summary-row"><span>Subtotal (${cart.reduce((s,i)=>s+(i.qty||1),0)} items)</span><span>${fmt(total)}</span></div>
              <div class="summary-row ${shipping===0?'free-shipping':''}">
                <span>Shipping</span>
                <span>${shipping === 0 ? '<strong style="color:#16a34a">FREE</strong>' : fmt(shipping)}</span>
              </div>
              ${/* COD fee shown at checkout */ ''}
              <div class="summary-total"><span>Total</span><span>${fmt(grandTotal)}</span></div>

              <!-- Coupon Input -->
              <div class="coupon-row">
                <input type="text" id="coupon-input" placeholder="Coupon code (e.g. FRAME10)" class="coupon-input" aria-label="Coupon code">
                <button class="coupon-btn" onclick="applyCoupon()">Apply</button>
              </div>
              <div id="coupon-msg" class="coupon-msg"></div>

              <button class="btn-atc w-full" onclick="pfiNav('/checkout')">
                <i class="fas fa-lock"></i> Secure Checkout — ${fmt(grandTotal)}
              </button>
              <div class="cart-trust">
                <span><i class="fas fa-shield-alt"></i> Secure</span>
                <span><i class="fas fa-lock"></i> Encrypted</span>
                <span><i class="fas fa-undo"></i> 7-Day Returns</span>
              </div>
              <div style="text-align:center;margin-top:12px">
                <a href="/shop" onclick="pfiNav('/shop');return false" class="text-link">← Continue Shopping</a>
              </div>
            </aside>
          </div>`}
        </div>
      </section>
    </main>
    ${footer()}`;

    window.updateQty = function(key, delta) {
      const item = cart.find(i => i.key === key);
      if (item) {
        item.qty = Math.max(0, (item.qty || 1) + delta);
        if (item.qty === 0) cart = cart.filter(i => i.key !== key);
      }
      saveCart();
      renderCart($('#app'));
    };
    window.removeItem = function(key) {
      cart = cart.filter(i => i.key !== key);
      saveCart();
      renderCart($('#app'));
      toast('Item removed from cart.');
    };
    window.applyCoupon = function() {
      const code = ($('#coupon-input')?.value || '').trim().toUpperCase();
      const msg = $('#coupon-msg');
      const valid = { 'FRAME10': '10% off', 'DIVINE15': '15% off', 'HUSTLE20': '20% off', 'NEWUSER': '₹100 off' };
      if (valid[code]) {
        if (msg) { msg.textContent = `✅ Coupon "${code}" applied — ${valid[code]}!`; msg.style.color = '#16a34a'; }
      } else {
        if (msg) { msg.textContent = '❌ Invalid coupon code.'; msg.style.color = '#dc2626'; }
      }
    };
  }

  // ══════════════════════════════════════════
  // CHECKOUT PAGE
  // ══════════════════════════════════════════
  function renderCheckout(app) {
    const total = cartTotal();
    const shipping = total >= SHIPPING_THRESHOLD ? 0 : (total > 0 ? FREE_SHIPPING_BELOW : 0);

    if (cart.length === 0) { nav('/cart'); return; }

    // COD eligibility check
    const codEligible = total >= COD_MIN && total <= COD_MAX;

    app.innerHTML = header() + `
    <main id="main-content">
      <section class="section-pad">
        <div class="container">
          <h1>Secure Checkout</h1>
          <div class="checkout-layout">
            <!-- Address Form -->
            <div class="checkout-form-wrap">
              <h3>Delivery Details</h3>
              <form id="checkout-form" onsubmit="placeOrder(event)" novalidate>
                <div class="form-row">
                  <div class="form-group">
                    <label for="full-name">Full Name *</label>
                    <input type="text" id="full-name" name="name" placeholder="Rahul Sharma" required aria-required="true">
                  </div>
                  <div class="form-group">
                    <label for="phone">Phone Number *</label>
                    <input type="tel" id="phone" name="phone" placeholder="9876543210" pattern="[0-9]{10}" required aria-required="true">
                  </div>
                </div>
                <div class="form-group">
                  <label for="address">Full Address *</label>
                  <textarea id="address" name="address" rows="3" placeholder="Flat/House No, Street, Area, Landmark" required aria-required="true"></textarea>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="city">City *</label>
                    <input type="text" id="city" name="city" placeholder="Mumbai" required>
                  </div>
                  <div class="form-group">
                    <label for="state">State *</label>
                    <input type="text" id="state" name="state" placeholder="Maharashtra" required>
                  </div>
                  <div class="form-group">
                    <label for="pincode">Pincode *</label>
                    <input type="text" id="pincode" name="pincode" placeholder="400001" pattern="[0-9]{6}" required
                      oninput="if(this.value.length===6)validatePincodeUI(this.value)">
                    <div id="pincode-result" class="pincode-result" style="display:none"></div>
                  </div>
                </div>

                <!-- Payment Method — COD Gatekeeper -->
                <div class="payment-section">
                  <h3 style="margin-bottom:12px"><i class="fas fa-shield-alt" style="color:var(--gold)"></i> Payment Method</h3>

                  <!-- COD Range Indicator -->
                  ${!codEligible && total < COD_MIN ? `
                  <div class="cod-nudge-box">
                    <strong>⚠️ COD requires minimum ₹${COD_MIN}.</strong> Your cart is ${fmt(total)}.<br>
                    <span class="nudge-save">Add ₹${COD_MIN - total} more</span> to unlock COD — or save ${fmt(COD_FEE)} by choosing Prepaid now!
                    <div class="cod-range-bar"><div class="cod-range-fill" style="width:${Math.min(100, (total/COD_MIN)*100)}%"></div></div>
                    <div class="cod-range-labels"><span>₹0</span><span>₹${COD_MIN} (COD unlock)</span></div>
                  </div>` : ''}
                  ${!codEligible && total > COD_MAX ? `
                  <div class="cod-nudge-box">
                    <strong>⚠️ COD not available above ₹${COD_MAX}.</strong> Your cart is ${fmt(total)}.<br>
                    For high-value orders, Prepaid is <span class="nudge-save">more secure</span> — and you save ${fmt(COD_FEE)} in fees!
                  </div>` : ''}

                  <!-- Prepaid Option -->
                  <label class="payment-option" style="display:block;cursor:pointer;margin-bottom:10px">
                    <input type="radio" name="payment" value="prepaid" checked aria-label="Pay Online" style="display:none">
                    <div class="payment-option-box selected" id="prepaid-box" onclick="this.closest('label').querySelector('input').click()">
                      <div class="payment-option-title">
                        <i class="fas fa-credit-card" style="color:var(--gold)"></i>
                        <span>Pay Online — UPI / Card / Net Banking</span>
                        <span class="payment-badge" style="background:rgba(22,163,74,0.15);color:#16a34a">✅ BEST VALUE</span>
                      </div>
                      <div class="prepaid-coupon-box" style="margin-top:10px">
                        <strong>🎁 Prepaid Perks:</strong><br>
                        • <span style="color:#16a34a;font-weight:700">₹50 instant discount</span> on this order<br>
                        • Save ${fmt(COD_FEE)} COD handling fee<br>
                        • Priority dispatch within <strong>6 hours</strong><br>
                        • Get coupon <span class="coupon-chip">${PREPAID_COUPON}</span> — ₹${PREPAID_COUPON_VALUE} off your next order
                      </div>
                    </div>
                  </label>

                  <!-- COD Option -->
                  <label class="payment-option ${!codEligible ? 'disabled' : ''}" style="display:block;cursor:pointer">
                    <input type="radio" name="payment" value="cod" ${!codEligible ? 'disabled' : ''} aria-label="Cash on Delivery" style="display:none">
                    <div class="payment-option-box" id="cod-box" onclick="${codEligible ? 'this.closest(\'label\').querySelector(\'input\').click()' : ''}">
                      <div class="payment-option-title" style="${!codEligible ? 'opacity:0.5' : ''}">
                        <i class="fas fa-hand-holding-usd" style="color:var(--red)"></i>
                        <span>Cash on Delivery (COD)</span>
                        ${codEligible
                          ? `<span class="payment-badge unavailable">+ ${fmt(COD_FEE)} handling fee</span>`
                          : `<span class="payment-badge unavailable">Not available ${total < COD_MIN ? `(min ${fmt(COD_MIN)})` : `(max ${fmt(COD_MAX)})`}</span>`}
                      </div>
                      ${codEligible ? `
                      <div class="cod-nudge-box" style="margin-top:10px;font-size:12px">
                        ⚠️ COD adds ${fmt(COD_FEE)} fee · WhatsApp confirmation required within 24h<br>
                        Reply <strong>CONFIRM</strong> on WhatsApp to lock your order (auto-cancel if no reply)
                      </div>` : ''}
                    </div>
                  </label>
                </div>

                <!-- Order Summary at Checkout -->
                <div class="checkout-order-summary">
                  <h3 style="margin-bottom:14px">Order Summary</h3>
                  ${cart.map(i => `
                  <div class="checkout-item">
                    <img src="${esc(i.image)}" alt="${esc(i.name)}" class="checkout-item-img" loading="lazy">
                    <div style="flex:1">
                      <div class="checkout-item-name">${esc(i.name)}</div>
                      <div class="checkout-item-variant">${esc(i.frame)} · ${esc(i.size)} · Qty: ${i.qty||1}</div>
                    </div>
                    <div class="checkout-item-price">${fmt(i.price * (i.qty||1))}</div>
                  </div>`).join('')}
                  <div class="checkout-total-rows">
                    <div class="summary-row"><span>Product Total</span><span>${fmt(total)}</span></div>
                    <div class="summary-row"><span>Shipping</span><span>${shipping === 0 ? '<strong style="color:#16a34a">FREE 🎉</strong>' : fmt(shipping)}</span></div>
                    <div class="summary-row" id="prepaid-discount-row" style="color:#16a34a"><span><i class="fas fa-bolt"></i> Prepaid Discount</span><span>−₹50</span></div>
                    <div class="summary-row" id="cod-fee-row" style="display:none;color:var(--red)"><span>COD Handling Fee</span><span id="cod-fee-display">${fmt(COD_FEE)}</span></div>
                    <div class="summary-total" id="checkout-total"><span>Total</span><span id="total-amount">${fmt(total + shipping - 50)}</span></div>
                  </div>
                </div>

                <div id="order-error" class="order-error" style="display:none"></div>
                <button type="submit" class="btn-atc w-full" id="place-order-btn" style="font-size:16px;padding:16px">
                  <i class="fas fa-lock"></i> Place Order — <span id="place-order-total">${fmt(total + shipping - 50)}</span>
                </button>
                <div class="checkout-trust" style="display:flex;gap:16px;justify-content:center;margin-top:12px;font-size:12px;color:var(--gray3);flex-wrap:wrap">
                  <span><i class="fas fa-shield-alt" style="color:var(--gold)"></i> 256-bit SSL</span>
                  <span><i class="fas fa-truck" style="color:var(--gold)"></i> 12hr Dispatch</span>
                  <span><i class="fas fa-exchange-alt" style="color:var(--gold)"></i> Exchange Policy</span>
                  <span><i class="fab fa-whatsapp" style="color:#25D366"></i> WhatsApp Support</span>
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>
    </main>
    ${footer()}`;

    // Payment toggle logic — re-bind with prepaid ₹50 discount + COD fee
    $$('input[name="payment"]').forEach(radio => {
      radio.addEventListener('change', function() {
        const isCOD = this.value === 'cod';
        $$('.payment-option-box').forEach(b => b.classList.remove('selected','cod-selected'));
        const box = this.closest('label').querySelector('.payment-option-box');
        box.classList.add(isCOD ? 'cod-selected' : 'selected');
        const codRow = $('#cod-fee-row');
        const prepaidDiscountRow = $('#prepaid-discount-row');
        const totalAmountEl = $('#total-amount');
        const placeBtn = $('#place-order-total');

        // Prepaid: -₹50 discount; COD: +COD_FEE, no discount
        const prepaidDiscount = isCOD ? 0 : 50;
        const codFeeAmt = isCOD ? COD_FEE : 0;
        const newTotal = total + shipping - prepaidDiscount + codFeeAmt;

        if (codRow) codRow.style.display = isCOD ? 'flex' : 'none';
        if (prepaidDiscountRow) prepaidDiscountRow.style.display = isCOD ? 'none' : 'flex';
        if (totalAmountEl) totalAmountEl.textContent = fmt(newTotal);
        if (placeBtn) placeBtn.textContent = fmt(newTotal);

        const prepaidBox = $('#prepaid-box');
        if (isCOD && prepaidBox) {
          prepaidBox.style.borderColor = 'var(--border2)';
        } else if (!isCOD && prepaidBox) {
          prepaidBox.style.borderColor = 'var(--gold)';
        }
      });
    });

    // Pincode validation UI
    window.validatePincodeUI = async function(pincode) {
      const resultEl = $('#pincode-result');
      const cityInput = $('#city');
      const stateInput = $('#state');
      if (!resultEl) return;
      resultEl.style.display = 'block';
      resultEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking delivery to your area...';
      resultEl.className = 'pincode-result';
      try {
        const res = await axios.get(`/api/pincode/${pincode}`);
        const d = res.data;
        if (d.valid) {
          const hydBadge = d.hydExpress ? `<span class="hyd-express-badge" style="margin-left:8px">⚡ HYD EXPRESS</span>` : '';
          resultEl.innerHTML = `<i class='fas fa-check-circle' style='color:#16a34a'></i> <strong>${d.district}, ${d.state}</strong>${hydBadge} — ${d.deliveryMessage}`;
          resultEl.className = 'pincode-result pincode-valid';
          // Auto-fill city/state
          if (cityInput && !cityInput.value) cityInput.value = d.district || '';
          if (stateInput && !stateInput.value) stateInput.value = d.state || '';
          // Fetch Shiprocket live rates
          loadShiprocketRatesCheckout(pincode);
        } else {
          resultEl.innerHTML = `<i class='fas fa-exclamation-triangle' style='color:#f59e0b'></i> ${d.error || 'Invalid pincode'}`;
          resultEl.className = 'pincode-result pincode-invalid';
        }
      } catch(e) {
        resultEl.innerHTML = `<i class='fas fa-map-marker-alt' style='color:var(--gold)'></i> Pincode accepted. Delivery in 3-5 business days.`;
        resultEl.className = 'pincode-result pincode-valid';
      }
    };

    // Shiprocket rates at checkout
    async function loadShiprocketRatesCheckout(pincode) {
      try {
        const res = await axios.get(`/api/shipping/partners?pincode=${pincode}&weight=0.5`);
        const d = res.data;
        const rate = d.cheapestRate || d.rate || 0;
        const shippingRow = document.querySelector('.summary-row:nth-child(2) span:last-child');
        if (shippingRow) {
          if (rate <= 99 || rate === 0) {
            shippingRow.innerHTML = '<strong style="color:#16a34a">Free (Shiprocket)</strong>';
          }
        }
      } catch(e) { /* non-critical */ }
    }

    window.placeOrder = async function(e) {
      e.preventDefault();
      const form = e.target;
      const btn = $('#place-order-btn');
      const errEl = $('#order-error');

      // Validation
      if (!form.name.value || !form.phone.value || !form.address.value || !form.city.value || !form.pincode.value) {
        if (errEl) { errEl.textContent = 'Please fill all required fields.'; errEl.style.display = 'block'; }
        return;
      }
      if (!/^[0-9]{10}$/.test(form.phone.value)) {
        if (errEl) { errEl.textContent = 'Please enter a valid 10-digit phone number.'; errEl.style.display = 'block'; }
        return;
      }
      if (!/^[0-9]{6}$/.test(form.pincode.value)) {
        if (errEl) { errEl.textContent = 'Please enter a valid 6-digit pincode.'; errEl.style.display = 'block'; }
        return;
      }

      // Client-side loss-prevention
      const allAddon = cart.every(i => i.frame === 'No Frame' && i.price <= 99);
      if (allAddon) {
        if (errEl) { errEl.textContent = 'The ₹99 print is an add-on only. Please add a Standard or Premium frame to complete your order.'; errEl.style.display = 'block'; }
        return;
      }

      const paymentMethod = form.payment.value;
      const extraFee = paymentMethod === 'cod' ? COD_FEE : 0;
      const prepaidDiscount = paymentMethod === 'prepaid' ? 50 : 0;
      const finalTotal = total + shipping + extraFee - prepaidDiscount;

      // COD strict range check (₹499 - ₹1995)
      if (paymentMethod === 'cod' && total < COD_MIN) {
        if (errEl) { errEl.innerHTML = `❌ COD requires minimum <strong>${fmt(COD_MIN)}</strong>. Your cart: ${fmt(total)}. Add more items or switch to <strong>Prepaid</strong> (saves ${fmt(COD_FEE)} COD fee).`; errEl.style.display = 'block'; }
        return;
      }
      if (paymentMethod === 'cod' && total > COD_STRICT_MAX) {
        if (errEl) { errEl.innerHTML = `❌ COD not available above <strong>${fmt(COD_STRICT_MAX)}</strong>. Your cart: ${fmt(total)}. Please use <strong>Prepaid</strong> (UPI/Card) for this order.`; errEl.style.display = 'block'; }
        return;
      }

      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Placing Order...'; }
      if (errEl) errEl.style.display = 'none';

      try {
        const res = await axios.post('/api/orders/create', {
          cart, paymentMethod, total: finalTotal,
          address: { name: form.name.value, phone: form.phone.value, address: form.address.value, city: form.city.value, state: form.state.value, pincode: form.pincode.value }
        });

        if (!res.data.success) {
          if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-lock"></i> Place Order — ${fmt(finalTotal)}`; }
          if (errEl) { errEl.textContent = res.data.error || 'Order failed.'; errEl.style.display = 'block'; }
          return;
        }

        const { orderId, message, isCOD, razorpayOrderId, razorpayKeyId } = res.data;

        // If Razorpay order created, open payment modal
        if (razorpayOrderId && razorpayKeyId && !isCOD) {
          await openRazorpayCheckout({ razorpayOrderId, razorpayKeyId, finalTotal, orderId, address: form });
          return;
        }

        // COD / demo mode: show success directly
        cart = [];
        saveCart();
        renderOrderSuccess($('#app'), orderId, message, isCOD, form.phone.value);
      } catch(err) {
        const errMsg = err.response?.data?.error || 'Order failed. Please try again or contact support.';
        if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-lock"></i> Place Order — ${fmt(finalTotal)}`; }
        if (errEl) { errEl.textContent = errMsg; errEl.style.display = 'block'; }
      }
    };

    // Razorpay checkout modal
    async function openRazorpayCheckout({ razorpayOrderId, razorpayKeyId, finalTotal, orderId, address }) {
      const btn = $('#place-order-btn');
      // Load Razorpay script if not already loaded
      if (!window.Razorpay) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      const options = {
        key: razorpayKeyId,
        amount: finalTotal * 100,
        currency: 'INR',
        name: 'PhotoFrameIn',
        description: `Order ${orderId}`,
        order_id: razorpayOrderId,
        prefill: {
          name: address.name?.value || '',
          contact: address.phone?.value || '',
          email: address.email?.value || ''
        },
        theme: { color: '#d4af37' },
        handler: async function(response) {
          try {
            // Verify payment on server
            await axios.post('/api/orders/verify-payment', {
              orderId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });
            cart = [];
            saveCart();
            renderOrderSuccess($('#app'), orderId, 'Payment successful! Your order is confirmed. Dispatching within 6 hours.', false, address.phone?.value || '');
          } catch(e) {
            toast('<i class="fas fa-exclamation-circle" style="color:#dc2626;margin-right:6px"></i> Payment received but verification failed. Please WhatsApp us with your Order ID.', 'error');
          }
        },
        modal: {
          ondismiss: function() {
            if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-lock"></i> Place Order — ${fmt(finalTotal)}`; }
            toast('<i class="fas fa-info-circle" style="color:#f59e0b;margin-right:6px"></i> Payment cancelled. Your order is saved — try again when ready.', '');
          }
        }
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    }
  }

  // ══════════════════════════════════════════
  // ORDER SUCCESS
  // ══════════════════════════════════════════
  function renderOrderSuccess(app, orderId, message, isCOD, phone) {
    app.innerHTML = header() + `
    <main id="main-content">
      <section class="section-pad">
        <div class="container" style="max-width:600px;margin:0 auto;text-align:center">
          <div class="order-success-icon">✅</div>
          <h1>Order Placed!</h1>
          <div class="order-id-badge">${orderId}</div>
          <p class="order-success-msg">${esc(message)}</p>
          ${isCOD ? `
          <div class="cod-confirm-box" style="background:rgba(204,0,0,0.07);border:1px solid rgba(204,0,0,0.3);border-radius:12px;padding:20px;margin:20px 0;text-align:left">
            <h3 style="color:var(--red);margin-bottom:10px">⚠️ Action Required: Confirm Your COD Order</h3>
            <p style="font-size:13px;color:var(--gray2);margin-bottom:12px">
              You will receive a WhatsApp message from us on <strong style="color:var(--white)">+91 79895 31818</strong> within 30 minutes.<br>
              Reply <strong style="color:var(--gold)">"CONFIRM ${orderId}"</strong> to lock your order.<br>
              <span style="color:var(--red);font-size:12px">⏰ Unconfirmed COD orders are auto-cancelled after 24 hours.</span>
            </p>
            <a href="https://wa.me/917989531818?text=CONFIRM+${encodeURIComponent(orderId)}+%7C+COD+Order+Confirmation" 
               target="_blank" rel="noopener" 
               class="btn-atc" style="display:inline-flex;background:#25D366;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:800;gap:8px;color:white">
              <i class="fab fa-whatsapp"></i> Tap to Confirm on WhatsApp
            </a>
            <div style="margin-top:12px;font-size:12px;color:var(--gray3)">
              COD fee ₹${COD_FEE} is payable to the delivery agent. Keep exact change ready.
            </div>
          </div>` : `
          <div class="prepaid-success-box" style="background:rgba(22,163,74,0.07);border:1px solid rgba(22,163,74,0.3);border-radius:12px;padding:20px;margin:20px 0;text-align:left">
            <h3 style="color:var(--green);margin-bottom:10px">🎉 Payment Confirmed! Priority Dispatch</h3>
            <p style="font-size:13px;color:var(--gray2);margin-bottom:12px">
              Your prepaid order is confirmed. <strong>Priority dispatch within 6 hours.</strong><br>
              Track via SMS & WhatsApp.
            </p>
            <div style="background:rgba(22,163,74,0.1);border:1px dashed rgba(22,163,74,0.3);border-radius:8px;padding:12px;font-size:13px">
              🎁 <strong>Your Prepaid Reward:</strong> Use code 
              <span class="coupon-chip">${PREPAID_COUPON}</span> 
              for ₹${PREPAID_COUPON_VALUE} off your next order!<br>
              <span style="color:var(--gray3);font-size:11px">Valid for 30 days. Minimum order ₹449.</span>
            </div>
            <div style="margin-top:12px">
              <a href="https://wa.me/917989531818?text=Hi!+My+prepaid+order+${encodeURIComponent(orderId)}+is+placed.+Please+share+tracking+update."
                 target="_blank" rel="noopener"
                 style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#25D366;font-weight:600;text-decoration:none">
                <i class="fab fa-whatsapp"></i> Get tracking update on WhatsApp
              </a>
            </div>
          </div>`}
          <!-- Unboxing Video Notice (critical for exchange policy) -->
          <div class="unboxing-notice">
            <div class="unboxing-notice-title">
              <i class="fas fa-video" style="color:#d4af37"></i>
              <strong>📹 Important: Record Your Unboxing Video</strong>
            </div>
            <p>When your order arrives, <strong>record an unboxing video (without cuts or pauses)</strong> as you open the package. This is required for our free exchange/replacement guarantee in case of transit damage.</p>
            <details class="unboxing-details">
              <summary>How to record a valid unboxing video →</summary>
              <ul style="text-align:left;margin-top:12px;font-size:13px">
                <li>Start recording <strong>before</strong> opening the package</li>
                <li>Show all sides of the sealed box first</li>
                <li>Open without pausing/cutting the video</li>
                <li>Record any damage clearly</li>
                <li>Upload via the button below if damaged</li>
              </ul>
            </details>
            <button class="btn-outline" style="margin-top:12px;font-size:13px" onclick="showUnboxingUpload('${esc(orderId)}')">
              <i class="fas fa-upload"></i> Report Damage / Upload Video
            </button>
            <div id="unboxing-upload-section" style="display:none;margin-top:16px">
              <input type="file" id="unboxing-video-input" accept="video/*" class="pdp-photo-input">
              <select id="exchange-reason" class="pdp-gift-msg-input" style="margin-top:8px">
                <option value="transit_damage">Transit Damage</option>
                <option value="wrong_item">Wrong Item Received</option>
              </select>
              <textarea id="exchange-desc" placeholder="Describe the issue..." rows="2" class="pdp-gift-msg-input" style="margin-top:8px"></textarea>
              <button class="btn-atc" style="margin-top:8px;font-size:14px" onclick="submitExchangeRequest('${esc(orderId)}')">
                <i class="fas fa-exchange-alt"></i> Submit Exchange Request
              </button>
              <div id="exchange-status" style="margin-top:8px;font-size:13px"></div>
            </div>
          </div>

          <div class="order-success-actions">
            <a href="/track" onclick="pfiNav('/track');return false" class="btn-outline">Track My Order</a>
            <a href="/shop" onclick="pfiNav('/shop');return false" class="btn-secondary">Continue Shopping</a>
          </div>
        </div>
      </section>
    </main>
    ${footer()}`;

    window.showUnboxingUpload = function(oid) {
      const s = $('#unboxing-upload-section');
      if (s) s.style.display = s.style.display === 'none' ? 'block' : 'none';
    };

    window.submitExchangeRequest = async function(oid) {
      const statusEl = $('#exchange-status');
      const videoInput = $('#unboxing-video-input');
      const reason = $('#exchange-reason')?.value;
      const desc = $('#exchange-desc')?.value;

      if (!videoInput?.files?.length) {
        if (statusEl) statusEl.innerHTML = '<span style="color:#dc2626">Please select your unboxing video first. It is required for exchange requests.</span>';
        return;
      }

      if (statusEl) statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading video...';

      try {
        // Get upload URL
        const urlRes = await axios.post('/api/upload/unboxing-video', { orderId: oid, fileName: videoInput.files[0].name });
        if (!urlRes.data.success) {
          if (statusEl) statusEl.innerHTML = `<span style="color:#dc2626">${urlRes.data.error}</span>`;
          return;
        }

        // Note: In production, PUT the video to urlRes.data.uploadUrl
        // For demo, we'll submit exchange request with the fileKey directly
        const exchangeRes = await axios.post('/api/exchange/request', {
          orderId: oid,
          reason,
          description: desc,
          unboxingVideoKey: urlRes.data.fileKey || 'demo-video-key'
        });

        if (statusEl) statusEl.innerHTML = `<span style="color:#16a34a"><i class="fas fa-check-circle"></i> ${exchangeRes.data.message}</span>`;
      } catch(e) {
        const msg = e.response?.data?.error || 'Failed. Please WhatsApp us: +91 79895 31818';
        if (statusEl) statusEl.innerHTML = `<span style="color:#dc2626">${msg}</span>`;
      }
    };
  }

  // ══════════════════════════════════════════
  // BLOG
  // ══════════════════════════════════════════
  async function renderBlog(app, path) {
    if (path === '/blog') {
      app.innerHTML = header() + `
      <main id="main-content">
        <section class="page-header">
          <div class="container">
            <h1>Photo Frame Ideas & Decor Tips</h1>
            <p>Expert guides for Indian homes — divine décor, motivational walls & gifting</p>
          </div>
        </section>
        <section class="section-pad">
          <div class="container">
            <div class="blog-grid" id="blog-list">
              <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>
            </div>
          </div>
        </section>
      </main>
      ${footer()}`;
      try {
        const res = await axios.get('/api/blog');
        const grid = $('#blog-list');
        if (grid) grid.innerHTML = res.data.posts.map(post => `
        <article class="blog-card" onclick="pfiNav('/blog/${post.slug}')" style="cursor:pointer">
          <img src="${post.image}" alt="${esc(post.title)}" loading="lazy" class="blog-card-img">
          <div class="blog-card-body">
            <span class="blog-cat-tag">${esc(post.category)}</span>
            <h2 class="blog-card-title">${esc(post.title)}</h2>
            <p class="blog-card-excerpt">${esc(post.excerpt)}</p>
            <div class="blog-card-meta">${post.readTime} · ${new Date(post.date).toLocaleDateString('en-IN',{month:'short',day:'numeric',year:'numeric'})}</div>
          </div>
        </article>`).join('');
      } catch(e) {}
    } else {
      const slug = path.replace('/blog/', '');
      app.innerHTML = header() + `<main id="main-content"><div class="container" style="padding:60px 20px;text-align:center"><i class="fas fa-spinner fa-spin" style="font-size:32px;color:var(--gold)"></i></div></main>${footer()}`;
      try {
        const res = await axios.get(`/api/blog/${slug}`);
        const post = res.data.post;
        app.innerHTML = header() + `
        <main id="main-content">
          <article class="blog-post-wrap">
            <div class="blog-post-hero">
              <img src="${post.image}" alt="${esc(post.title)}" class="blog-post-hero-img" loading="eager">
            </div>
            <div class="container blog-post-content">
              <nav aria-label="Breadcrumb"><ol class="breadcrumb"><li><a href="/" onclick="pfiNav('/');return false">Home</a></li><li><a href="/blog" onclick="pfiNav('/blog');return false">Blog</a></li><li>${esc(post.title)}</li></ol></nav>
              <span class="blog-cat-tag">${esc(post.category)}</span>
              <h1>${esc(post.title)}</h1>
              <div class="blog-meta">${post.readTime} · ${new Date(post.date).toLocaleDateString('en-IN',{month:'long',day:'numeric',year:'numeric'})}</div>
              <div class="blog-body">${post.content}</div>
              <div class="blog-cta-box">
                <h3>Shop Our Frame Collections</h3>
                <div class="blog-cta-btns">
                  <a href="/category/divine" onclick="pfiNav('/category/divine');return false" class="btn-primary">🕉️ Divine Frames</a>
                  <a href="/category/motivational" onclick="pfiNav('/category/motivational');return false" class="btn-secondary">💪 Motivational Frames</a>
                </div>
              </div>
            </div>
          </article>
        </main>
        ${footer()}`;
      } catch(e) {
        app.innerHTML = header() + `<main><div class="container" style="padding:80px 20px;text-align:center"><h2>Post not found</h2><a href="/blog" onclick="pfiNav('/blog');return false" class="btn-primary" style="margin-top:16px">Back to Blog</a></div></main>${footer()}`;
      }
    }
  }

  // ══════════════════════════════════════════
  // FAQ PAGE
  // ══════════════════════════════════════════
  async function renderFaq(app) {
    app.innerHTML = header() + `
    <main id="main-content">
      <section class="page-header">
        <div class="container">
          <nav aria-label="Breadcrumb"><ol class="breadcrumb"><li><a href="/" onclick="pfiNav('/');return false">Home</a></li><li>FAQ</li></ol></nav>
          <h1>Frequently Asked Questions</h1>
          <p>Everything about our ₹99 prints, COD policy, delivery & returns</p>
        </div>
      </section>
      <section class="section-pad">
        <div class="container" style="max-width:800px">
          <div id="faq-list"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div></div>
        </div>
      </section>
    </main>
    ${footer()}`;

    try {
      const res = await axios.get('/api/faq');
      const list = $('#faq-list');
      if (list) list.innerHTML = res.data.faq.map((f, i) => `
      <details class="faq-item" ${i===0?'open':''}>
        <summary class="faq-question">${esc(f.q)}</summary>
        <div class="faq-answer">${esc(f.a)}</div>
      </details>`).join('');
    } catch(e) {}
  }

  // ══════════════════════════════════════════
  // STATIC PAGES
  // ══════════════════════════════════════════
  function renderAbout(app) {
    app.innerHTML = header() + `
    <main id="main-content">
      <section class="page-header">
        <div class="container"><h1>About PhotoFrameIn</h1><p>India's premier D2C photo frame brand — from Hyderabad to every corner of India</p></div>
      </section>
      <section class="section-pad">
        <div class="container about-content" style="max-width:800px">
          <h2>Our Story</h2>
          <p>PhotoFrameIn was born from a simple frustration: India had no premium, affordable online destination for divine spiritual frames and motivational wall art. Local shops offered generic options; big marketplaces offered no quality guarantee.</p>
          <p>We set out to change that — starting with two categories we know resonate most with Indian homes: <strong>Divine & Spiritual</strong> (Ganesh, Lakshmi, Om, Durga) and <strong>Motivational Typography</strong> for desks and offices.</p>
          <h2>Our Promise</h2>
          <ul>
            <li>🎯 <strong>Try from ₹99</strong> — our A4 no-frame print lets you test any design with zero risk</li>
            <li>📦 <strong>Dispute Shield</strong> — record your unboxing, damaged items replaced free</li>
            <li>⚡ <strong>12-hour dispatch</strong> — all in-stock orders out the same day</li>
            <li>🇮🇳 <strong>Made with pride</strong> — printed and framed in Hyderabad, Telangana</li>
          </ul>
          <h2>Contact Us</h2>
          <p>WhatsApp: <a href="https://wa.me/917989531818" target="_blank" rel="noopener">+91 79895 31818</a><br>
          Email: <a href="mailto:support@photoframein.in">support@photoframein.in</a><br>
          Hours: Mon–Sun 9AM–9PM IST</p>
        </div>
      </section>
    </main>
    ${footer()}`;
  }

  function renderContact(app) {
    app.innerHTML = header() + `
    <main id="main-content">
      <section class="page-header">
        <div class="container"><h1>Contact Us</h1><p>We reply within 2 hours — WhatsApp is fastest</p></div>
      </section>
      <section class="section-pad">
        <div class="container" style="max-width:600px">
          <div class="contact-cards">
            <a href="https://wa.me/917989531818?text=Hi%2C+I+need+help" target="_blank" rel="noopener" class="contact-card whatsapp-card">
              <i class="fab fa-whatsapp" style="font-size:32px;color:#25D366"></i>
              <h3>WhatsApp (Fastest)</h3>
              <p>+91 79895 31818</p>
              <span class="btn-primary" style="margin-top:12px">Chat Now →</span>
            </a>
            <div class="contact-card">
              <i class="fas fa-envelope" style="font-size:32px;color:var(--gold)"></i>
              <h3>Email Support</h3>
              <p><a href="mailto:support@photoframein.in">support@photoframein.in</a></p>
              <p style="font-size:13px;color:var(--gray3)">Reply within 4 hours</p>
            </div>
          </div>
          <div class="contact-info-row">
            <div><i class="fas fa-map-marker-alt"></i> Hyderabad, Telangana, India</div>
            <div><i class="fas fa-clock"></i> Mon–Sun · 9AM–9PM IST</div>
          </div>
        </div>
      </section>
    </main>
    ${footer()}`;
  }

  function renderTrack(app) {
    app.innerHTML = header() + `
    <main id="main-content">
      <section class="page-header">
        <div class="container"><h1>Track Your Order</h1></div>
      </section>
      <section class="section-pad">
        <div class="container" style="max-width:500px;text-align:center">
          <div class="track-form">
            <input type="text" id="track-input" placeholder="Order ID (e.g. PF-260416-AB12) or Phone" class="track-input" aria-label="Order ID or Phone Number">
            <button class="btn-primary" style="width:100%;margin-top:12px" onclick="trackOrder()">Track Order</button>
          </div>
          <div id="track-result" style="margin-top:24px"></div>
          <p style="margin-top:32px;font-size:13px;color:var(--gray3)">
            SMS and WhatsApp tracking links are sent automatically within 24 hours of dispatch.<br>
            Need help? <a href="https://wa.me/917989531818" target="_blank" rel="noopener" style="color:var(--gold)">WhatsApp us →</a>
          </p>
        </div>
      </section>
    </main>
    ${footer()}`;

    window.trackOrder = function() {
      const val = $('#track-input')?.value?.trim();
      const res = $('#track-result');
      if (!val) { if (res) { res.innerHTML = '<p style="color:#dc2626">Please enter an Order ID or phone number.</p>'; } return; }
      if (res) res.innerHTML = `<div class="track-status-card"><h3>Looking up "${esc(val)}"...</h3><p>Please check your SMS/WhatsApp for the tracking link, or contact us on WhatsApp with your Order ID.</p><a href="https://wa.me/917989531818?text=Track+order+${encodeURIComponent(val)}" target="_blank" rel="noopener" class="btn-primary"><i class="fab fa-whatsapp"></i> Get Update on WhatsApp</a></div>`;
    };
  }

  function renderPolicy(app, section) {
    const content = {
      returns: {
        title: 'Returns & Replacement Policy',
        body: `<h2>7-Day Returns</h2>
<p>We accept returns within <strong>7 days</strong> of delivery for standard (non-personalised) products. Items must be unused and in original packaging.</p>
<h2>Dispute Shield — Damaged Items</h2>
<p>If your order arrives damaged, simply record a short unboxing video and send it to us on WhatsApp (+91 79895 31818) or email (support@photoframein.in). We will replace the item <strong>completely free</strong> — no questions asked, no need to return the damaged item.</p>
<h2>Custom / Personalised Frames</h2>
<p>Custom frames (with your uploaded photo) are non-returnable except in case of damage or manufacturing defect.</p>
<h2>COD Returns</h2>
<p>For COD returns, shipping back to us is at the customer's expense. We recommend prepaid for easier return processing.</p>`
      },
      shipping: {
        title: 'Shipping Policy',
        body: `<h2>Dispatch Times</h2>
<p>All in-stock orders are dispatched within <strong>12 hours</strong> of order confirmation (prepaid) or WhatsApp confirmation (COD).</p>
<h2>Delivery Times</h2>
<ul>
<li><strong>Hyderabad:</strong> 1–2 business days (Express delivery available)</li>
<li><strong>Metro cities (Mumbai, Delhi, Bengaluru, Chennai, Kolkata):</strong> 2–4 business days</li>
<li><strong>Tier 2–3 cities:</strong> 3–6 business days</li>
</ul>
<h2>Shipping Charges</h2>
<ul>
<li><strong>Above ₹799:</strong> FREE shipping</li>
<li><strong>Below ₹799:</strong> ₹60 flat shipping charge</li>
<li><strong>COD orders:</strong> Additional ₹49 handling fee applies</li>
</ul>`
      },
      privacy: {
        title: 'Privacy Policy',
        body: `<h2>Information We Collect</h2>
<p>We collect your name, phone number, delivery address, and email (optional) to process and deliver your orders. We do not store payment card data — all payments are processed by Razorpay (PCI-DSS compliant).</p>
<h2>How We Use Your Information</h2>
<ul>
<li>To process and deliver your order</li>
<li>To send order updates via SMS and WhatsApp</li>
<li>To respond to customer support queries</li>
<li>With your consent, to send promotional messages (opt-out anytime)</li>
</ul>
<h2>Data Security</h2>
<p>We use industry-standard SSL encryption on all data transmission. We do not sell or share your personal data with third parties except for order fulfilment (logistics partners).</p>`
      },
      terms: {
        title: 'Terms & Conditions',
        body: `<h2>Use of Website</h2>
<p>By using photoframein.in, you agree to these terms. You must be 18+ to place orders.</p>
<h2>Product Availability</h2>
<p>All products are subject to availability. We reserve the right to cancel orders if stock is unavailable, with a full refund.</p>
<h2>COD Terms</h2>
<p>COD orders must be confirmed via WhatsApp within 24 hours. Unconfirmed COD orders will be auto-cancelled. Repeated COD non-deliveries may result in account restriction.</p>
<h2>Pricing</h2>
<p>All prices are in Indian Rupees (INR) and include applicable taxes. Prices may change without notice — your cart price is locked at time of checkout.</p>`
      }
    };
    const c = content[section] || { title: 'Policy', body: '<p>Policy content coming soon.</p>' };
    app.innerHTML = header() + `
    <main id="main-content">
      <section class="page-header">
        <div class="container"><h1>${esc(c.title)}</h1></div>
      </section>
      <section class="section-pad">
        <div class="container policy-content" style="max-width:800px">${c.body}</div>
      </section>
    </main>
    ${footer()}`;
  }

  // ══════════════════════════════════════════
  // EXIT INTENT POPUP
  // ══════════════════════════════════════════
  function setupExitIntent() {
    if (exitShown) return;
    const popup = document.createElement('div');
    popup.id = 'exit-popup';
    popup.className = 'exit-popup';
    popup.innerHTML = `
    <div class="exit-popup-box" role="dialog" aria-labelledby="exit-popup-title" aria-modal="true">
      <button class="exit-popup-close" onclick="document.getElementById('exit-popup').remove()" aria-label="Close">&times;</button>
      <div class="exit-popup-emoji">🎁</div>
      <h2 id="exit-popup-title">Wait — Get 10% Off!</h2>
      <p>Leave your email and get a <strong>10% discount code</strong> for your first order. Valid for 24 hours.</p>
      <form onsubmit="submitExitLead(event)">
        <input type="email" id="exit-email" placeholder="your@email.com" required aria-label="Email address" class="exit-email-input">
        <button type="submit" class="btn-primary w-full">Get My 10% Off Code</button>
      </form>
      <p class="exit-popup-footer">No spam. One email only. Unsubscribe anytime.</p>
    </div>`;
    document.body.appendChild(popup);

    window.submitExitLead = async function(e) {
      e.preventDefault();
      const email = $('#exit-email')?.value;
      try { await axios.post('/api/leads', { email, source: 'exit_intent' }); } catch(err) {}
      const box = popup.querySelector('.exit-popup-box');
      if (box) box.innerHTML = `<div style="text-align:center;padding:40px 20px"><div style="font-size:48px;margin-bottom:16px">✅</div><h2>Your Code: <span style="color:var(--gold)">FRAME10</span></h2><p>10% off your first order. Valid 24 hours.</p><a href="/shop" onclick="pfiNav('/shop');document.getElementById('exit-popup').remove();return false" class="btn-primary">Shop Now →</a></div>`;
    };

    // Desktop: mouse leave
    let exitTimer;
    const exitHandler = (e) => {
      if (e.clientY < 20 && !exitShown) {
        exitShown = true;
        popup.classList.add('show');
        document.removeEventListener('mouseleave', exitHandler);
      }
    };
    document.addEventListener('mouseleave', exitHandler);

    // Mobile: 30s timer
    exitTimer = setTimeout(() => {
      if (!exitShown) { exitShown = true; popup.classList.add('show'); }
    }, 30000);

    popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
  }

  // ══════════════════════════════════════════
  // BOOT
  // ══════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', render);
  if (document.readyState !== 'loading') render();

})();
