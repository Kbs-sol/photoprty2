# PhotoFrameIn — System Literacy Guide v6.0

> **For AI Maintainers & Future Developers**
> This document covers all pricing formulas, business logic, API integrations, and architectural decisions. Read this before making any changes.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Cloudflare Pages (Edge)                                 │
│  ├── src/index.tsx          — Hono backend (Worker)      │
│  ├── public/static/app.js   — Customer SPA (vanilla JS)  │
│  ├── public/static/admin.js — Admin panel SPA            │
│  ├── public/static/styles.css — Dark luxury theme        │
│  └── src/orderManagementEngine.ts — Core business logic  │
└─────────────────────────────────────────────────────────┘
         │                │                │
    Supabase DB      Cloudinary      Cloudflare R2
    (orders, RLS)   (photo uploads)  (video/backup)
         │
    Razorpay / COD → Shiprocket → Customer
```

---

## 2. Pricing Formula

```
Final Price = Base Price + ₹50 (v6.0 uplift)

Prepaid Customer Total = Base Price - ₹50 discount
COD Customer Total     = Base Price + ₹148 COD fee
```

### Price Matrix (v6.0 — all prices include ₹50 uplift)

| Option       | A4/Small | Small (8×12) | Medium (12×18) | Large (18×24) | XL (24×36) |
|--------------|----------|--------------|----------------|---------------|------------|
| No Frame     | ₹149     | ₹249         | ₹349           | N/A           | N/A        |
| Standard MDF | N/A      | ₹499         | ₹799           | ₹1,149        | ₹1,749     |
| Premium Wood | N/A      | ₹649         | ₹1,049         | ₹1,449        | ₹2,249     |

### Prepaid Discount (₹50 off)
- Applied at checkout automatically when payment method = "prepaid"
- Shows as "Prepaid Price: ₹X" (₹50 less than listed)
- Also earns PREPAID49 coupon (₹49 off next order)

### COD Rules
- **Minimum**: ₹499 (enforced client-side + server-side)
- **Maximum**: ₹1,995 (enforced client-side + server-side)
- **COD Fee**: ₹148 (covers RTO risk ₹120 average)
- Gatekeeper at `/api/orders/create` — returns 400 if outside range

### Shipping
- **Free** if order ≥ ₹799 (threshold constant: `SHIPPING_THRESHOLD`)
- **₹60** if below threshold (`FREE_SHIPPING_BELOW` constant)
- Shiprocket live rates shown after pincode entry (display only, ≤₹99 shown as "Free")

---

## 3. Shiprocket Logic Tree

```
1. Customer enters 6-digit pincode → triggers /api/pincode/:pincode
   ├── Valid? → auto-fill city/state
   │   ├── Starts with 500? → Hyderabad Express badge (1-day)
   │   ├── Metro (Mumbai/Delhi/etc)? → 2-3 days
   │   └── Other → 3-6 days
   └── Invalid? → red error badge

2. After pincode validated → GET /api/shipping/partners?pincode=X&weight=0.5
   ├── Shiprocket credentials configured?
   │   ├── Yes → Live rate from Shiprocket API
   │   │   ├── Rate ≤ ₹99 → show "Free Shipping"
   │   │   └── Rate > ₹99 → show "₹X via Courier"
   │   └── No → show nothing (non-blocking)
   └── Display in .shiprocket-rates div (PDP) or inline at checkout

3. Checkout order summary shows only:
   - Product Total  
   - Shipping (FREE or ₹60)
   - Prepaid Discount (-₹50) OR COD Fee (+₹148)
   - Grand Total
```

---

## 4. Cloudinary → R2 Sync Workflow

```
Customer uploads photo on PDP →
  1. POST /api/upload/photo (multipart/form-data)
  2. Server receives file → validates type + size (<15MB)
  3. Primary: Upload to Cloudinary
     └── Folder: photoframein/customer-uploads/{productSlug}/
     └── HMAC-SHA256 signature (using API Secret)
     └── Returns cloudinaryUrl + publicId
  4. Backup: R2 PUT (async via waitUntil)
     └── Key: customer-photos/{productSlug}/{timestamp}-{filename}
     └── Metadata: cloudinaryPublicId
  5. Response: { success, cloudinaryUrl, r2BackupScheduled }
  6. Frontend: shows live preview with CSS frame overlay

Admin gallery:
  - GET /api/admin/cloudinary/gallery
  - Lists resources from Cloudinary Admin API
  - Displays in /admin → Gallery & Ratings section
  - Supports delete (when credentials configured)
```

**Environment variables required:**
```
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=your-api-secret
```

---

## 5. CSS Frame Preview Component

The frame preview is a pure CSS implementation — no canvas, no WebGL.

```
.frame-preview-outer  → box-shadow creates the frame illusion
  ├── data-color="wood|black|gold|white" → border color variant
  ├── data-frame="standard|premium|no frame" → bevel depth
  └── .frame-mount-layer → padding=10% for Mount mode, 0% for Direct

Box-shadow layers:
  - Layer 1 (inner): Frame color (#6b4226 for wood, #0a0a0a for black, etc.)
  - Layer 2 (outer): Slight highlight/shadow for depth
  - Layer 3: Drop shadow
```

**Mount mode**: when selected, adds `padding: 10%` + `background: #fff` to `.frame-mount-layer`, creating a white inner border (classic gallery mount/mat effect).

---

## 6. Progressive Disclosure UI

Principle: Show only **Upload button** + **Live Preview** initially. Everything else is in a collapsible "Customization Options" drawer.

```
Always visible (PDP):
├── Product image / Live preview canvas
├── Upload Your Photo button (.btn-upload-primary)
└── Price block (with prepaid price shown)

Collapsible (opens on click or after upload):
├── Border Color (Wood | Black | Gold | White)
├── Mounting Style (Direct | Mount)
├── Upload (detailed — syncs to hero upload)
├── Gift Message textarea
└── Add-on No-Frame Print checkbox (if product.lossFee exists)

On mobile: sticky ATC bar at bottom (.pdp-sticky-cta)
├── Price + Prepaid price
├── Add to Cart button
└── Buy Now button (navigates to /checkout directly)
```

---

## 7. Admin-Controlled Store Rating

```
Default: 4.9/5 (1,247 reviews)

Update via Admin Panel → Gallery & Ratings → Store Rating Control:
  - POST /api/admin/rating { value: 4.8, count: 1300 }
  - Validation: 4.0 ≤ value ≤ 5.0 (enforced server-side)
  - Stored in _storeRating in-memory (resets on deploy)
  - For production: persist in Supabase system_config table

Exposed to frontend via:
  GET /api/settings/public → { storeRating: { value, count, label } }
  Loaded in app.js on init → updates hero badge + PDP rating display

Frontend guarantee: Math.max(4.0, value) — never shows below 4.0
```

---

## 8. Loss-Prevention Middleware

```
Client-side (app.js):
├── addToCartPDP: blocks No Frame only carts (≤₹149)
└── placeOrder: double-checks before API call

Server-side (/api/orders/create):
├── allAddonOnly check: all items No Frame AND price ≤ ₹99
│   └── Returns 400: "₹99 print is add-on only"
├── COD min check: cartTotal < ₹499 → 400
└── COD max check: cartTotal > ₹1,995 → 400
```

---

## 9. Supabase Integration

**Tables**: orders, reviews, users, system_config, coupons, api_quota_log, pincode_cache, exchange_requests, products

**RLS Policies** (from supabase_schema.sql):
- Orders: only owner can read (by phone/user_id)
- Products: public read, admin write
- Reviews: public read, authenticated write
- Exchange requests: authenticated write only

**Webhook verification** (Razorpay):
```
HMAC-SHA256(webhookSecret, rawBody) === X-Razorpay-Signature header
```

---

## 10. Email Quota Guard

```
Brevo: 300/day free → alert at 240 (80%)
Resend: 100/day free → alert at 80 (80%)

Flow:
  sendEmail() →
  ├── Check api_quota_log in Supabase
  ├── Brevo < 240? → use Brevo
  ├── Brevo ≥ 240? → switch to Resend
  └── Both exhausted? → pause queue, alert admin

Monitor at: /admin → Integrations → Email Quota Monitor
```

---

## 11. Hyderabad Express Logic

```
Pincode starts with "500" → hydExpress = true
  - Delivery: 1 day (same/next day)
  - Shows gold "⚡ HYD EXPRESS" badge in pincode result
  - Also shows in announcement bar header

Server enforcement:
  GET /api/pincode/500XXX → { hydExpress: true, deliveryDays: 1 }
  GET /api/pincode/400001 → { hydExpress: false, deliveryDays: 2 }
```

---

## 12. WhatsApp Deep Links

| Trigger | URL |
|---------|-----|
| COD Confirmation | `wa.me/917989531818?text=CONFIRM+{orderId}+|+COD+Order` |
| Prepaid Tracking | `wa.me/917989531818?text=Hi!+My+prepaid+order+{orderId}...` |
| Support | `wa.me/917989531818?text=Hi,+I+need+help` |
| Callback | `wa.me/917989531818` |

---

## 13. Future AI Maintenance Instructions

### Adding a new product category:
1. Add products to a new `CATEGORY_NAME_PRODUCTS` array in `src/index.tsx`
2. Spread into `PRODUCTS` array
3. Add to `CATEGORIES` array with slug/name/emoji
4. Add category route SEO in `catDescriptions` object
5. Add to `getCatName()` map in `app.js`

### Changing prices:
1. Update `PRICING_MATRIX` in `app.js` (frontend display)
2. Update `PRICING` in `src/index.tsx` (backend canonical)
3. Update individual `pricingMatrix` in each product object
4. All prices must follow: `Base + ₹50 (v6.0 uplift)`

### Adding new frame border colors:
1. Add button in `selectBorderColor` HTML template in `app.js`
2. Add `.swatch-{color}` CSS class
3. Add `.frame-preview-outer[data-color="{color}"]` CSS rule

### Environment Variables Reference:
```
# Required for payments
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...

# Required for database
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...

# Required for photo uploads
CLOUDINARY_CLOUD_NAME=photoframein
CLOUDINARY_API_KEY=123456789
CLOUDINARY_API_SECRET=abc123...

# Required for shipping
SHIPROCKET_EMAIL=logistics@...
SHIPROCKET_PASSWORD=...

# Required for email
BREVO_API_KEY=xkeysib-...
RESEND_API_KEY=re_...

# Required for video uploads
R2_BUCKET_NAME=photoframein-uploads
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...

# Admin access
ADMIN_USERNAME=admin
ADMIN_PASSWORD=photoframe@2024
```

---

*Last updated: v6.0 — April 2026*
*Tech stack: Hono + TypeScript + Cloudflare Pages + Cloudinary + R2 + Supabase + Razorpay + Shiprocket*
