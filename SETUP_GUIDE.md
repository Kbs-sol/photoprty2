# PhotoFrameIn v4.0 — Service Setup Guide

Complete step-by-step setup for all third-party integrations.

---

## 1. Supabase — PostgreSQL Database & Auth

### Step 1: Create Supabase Project
1. Go to **https://supabase.com** → New Project
2. Project name: `photoframein`
3. Database password: (save securely)
4. Region: **Asia South (Mumbai)** for lowest latency

### Step 2: Run Schema
1. Supabase Dashboard → **SQL Editor** → New Query
2. Paste contents of `supabase_schema.sql` → Run
3. Verify tables: products, orders, reviews, users, system_config, coupons, api_quota_log, pincode_cache, exchange_requests

### Step 3: Get API Keys
1. Project Settings → **API**
2. Copy:
   - `Project URL` → `SUPABASE_URL`
   - `anon/public key` → `SUPABASE_ANON_KEY`
   - `service_role key` → `SUPABASE_SERVICE_KEY` *(NEVER expose in frontend)*

### Step 4: Configure Auth Providers
1. Authentication → **Providers**
2. Enable **Email** (for admin login)
3. Enable **Google** (for customer login, see Section 3)

---

## 2. Razorpay — Payment Gateway

### Step 1: Create Account
1. Go to **https://razorpay.com** → Sign Up (business account)
2. Complete KYC: PAN card + bank account + business proof

### Step 2: Get API Keys
1. Settings → **API Keys** → Generate Key
2. Copy **Key ID** and **Key Secret**
3. For Webhooks: Settings → **Webhooks** → Add New

### Step 3: Configure Webhook
- **Webhook URL**: `https://your-worker.dev/api/webhook/razorpay`
  - Or after Cloudflare deployment: `https://photoframein.pages.dev/api/webhook/razorpay`
- **Secret**: Create a random 32-char string (save as `RAZORPAY_WEBHOOK_SECRET`)
- **Active Events**:
  - ✅ `payment.captured` (= order.paid)
  - ✅ `payment.failed`
  - ✅ `order.paid`

### Step 4: Test Credentials (Test Mode)
- Key ID: `rzp_test_XXXXXXXXXXXXXXXX`
- Key Secret: `XXXXXXXXXXXXXXXXXXXXXXXX`
- Use test cards: 4111 1111 1111 1111 (Visa), CVV: any 3 digits, expiry: any future date

### Step 5: Add Cloudflare Secrets
```bash
npx wrangler secret put RAZORPAY_KEY_ID
# Enter: rzp_live_XXXXXXXXXXXXXXXX

npx wrangler secret put RAZORPAY_KEY_SECRET
# Enter: your_key_secret

npx wrangler secret put RAZORPAY_WEBHOOK_SECRET
# Enter: your_webhook_secret
```

---

## 3. Google OAuth — Customer Login

### Step 1: Create Google Cloud Project
1. Go to **https://console.cloud.google.com**
2. New Project: `photoframein`
3. APIs & Services → **OAuth consent screen**
   - User Type: External
   - App name: PhotoFrameIn
   - Support email: support@photoframein.in
   - Authorized domains: `photoframein.in`, `photoframein.pages.dev`

### Step 2: Create OAuth Credentials
1. APIs & Services → **Credentials** → Create Credentials → **OAuth Client ID**
2. Application type: **Web application**
3. Authorized redirect URIs (add ALL of these):
   ```
   https://YOUR_SUPABASE_PROJECT.supabase.co/auth/v1/callback
   https://photoframein.in/auth/callback
   https://photoframein.pages.dev/auth/callback
   http://localhost:3000/auth/callback
   ```
4. Copy **Client ID** and **Client Secret**

### Step 3: Configure Supabase Auth Provider
1. Supabase Dashboard → Authentication → **Providers** → Google
2. Enable Google → Enter:
   - **Client ID**: `123456789-xxx.apps.googleusercontent.com`
   - **Client Secret**: `GOCSPX-xxxxxxxxxxxx`
3. Save

### Step 4: Add Cloudflare Secret
```bash
npx wrangler secret put GOOGLE_CLIENT_ID
# Enter: 123456789-xxx.apps.googleusercontent.com
```

### Step 5: Enable in Admin Panel
- Admin → Settings → **Google Login** toggle → ON

### Frontend Implementation (auto-handled in v4.0):
The Google Sign-In button uses `window.google.accounts.id.initialize()`:
```html
<!-- Add to pageShell (already included in v4.0) -->
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

---

## 4. Shiprocket — Logistics Integration

### Step 1: Create Account
1. **https://app.shiprocket.in** → Sign Up
2. Business type: D2C / E-commerce
3. Add pickup address: your Hyderabad warehouse/home address

### Step 2: Get Credentials
- Shiprocket uses email + password auth (no API keys needed)
- Email: the email you registered with
- Password: your account password

### Step 3: Add Cloudflare Secrets
```bash
npx wrangler secret put SHIPROCKET_EMAIL
# Enter: your@shiprocket-email.com

npx wrangler secret put SHIPROCKET_PASSWORD
# Enter: your_shiprocket_password
```

### Step 4: Top Up Wallet
- Minimum ₹500 to start shipping
- Set up auto-recharge at ₹1,000 threshold

---

## 5. Brevo (formerly Sendinblue) — Primary Email

### Step 1: Create Account
1. **https://www.brevo.com** → Free plan (300 emails/day)
2. Verify sending domain: `photoframein.in`
   - Add DNS records (SPF, DKIM, DMARC) to your domain registrar

### Step 2: Verify Sender
- Senders → Add Sender: `orders@photoframein.in`

### Step 3: Get API Key
- My Profile → SMTP & API → **API Keys** → Create API Key
- Copy the key

### Step 4: Add Cloudflare Secret
```bash
npx wrangler secret put BREVO_API_KEY
# Enter: xkeysib-xxxxxxxxxxxxxxxx...
```

---

## 6. Resend — Email Fallback (100/day free)

### Step 1: Create Account
1. **https://resend.com** → Sign Up
2. Add domain: `photoframein.in`
3. Add DNS records (MX, SPF, DKIM)

### Step 2: Create API Key
- API Keys → Create API Key: `photoframein-production`

### Step 3: Add Cloudflare Secret
```bash
npx wrangler secret put RESEND_API_KEY
# Enter: re_xxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 7. Cloudinary — Product Image CDN

### Step 1: Create Account
1. **https://cloudinary.com** → Free plan (25GB storage, 25GB bandwidth/month)
2. Cloud Name: `photoframein` (or auto-generated)

### Step 2: Upload Product Images
1. Media Library → Upload images
2. Organize in folders: `products/divine/`, `products/motivational/`
3. Use naming convention: `divine-om-mantra-1`, `divine-ganesh-1`, etc.

### Step 3: Add Cloudflare Secret
```bash
npx wrangler secret put CLOUDINARY_CLOUD_NAME
# Enter: photoframein

npx wrangler secret put CLOUDINARY_API_KEY
# Enter: 123456789012345

npx wrangler secret put CLOUDINARY_API_SECRET
# Enter: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Step 4: URL Format
Images auto-transform via URL parameters:
```
https://res.cloudinary.com/photoframein/image/upload/c_fill,w_600,h_600,q_auto,f_auto/products/divine/om-mantra-1
```

---

## 8. Cloudflare R2 — Unboxing Video Storage

### Step 1: Enable R2
1. Cloudflare Dashboard → **R2** → Create Bucket
2. Bucket name: `photoframein-uploads`
3. Location: Automatic (Asia preferred)

### Step 2: Create R2 API Token
1. R2 → Manage R2 API Tokens → Create API Token
2. Permissions: **Object Read & Write** on `photoframein-uploads`
3. Copy:
   - Account ID (from Dashboard URL)
   - Access Key ID
   - Secret Access Key

### Step 3: Add wrangler.jsonc binding
```jsonc
{
  "r2_buckets": [
    {
      "binding": "R2_UPLOADS",
      "bucket_name": "photoframein-uploads"
    }
  ]
}
```

### Step 4: Add Cloudflare Secrets
```bash
npx wrangler secret put R2_ACCOUNT_ID
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY

# R2_BUCKET_NAME via env var (not secret):
npx wrangler secret put R2_BUCKET_NAME
# Enter: photoframein-uploads
```

---

## 9. Admin Credentials Setup

```bash
# Set admin credentials as Cloudflare secrets
npx wrangler secret put ADMIN_USERNAME
# Enter: admin (or your preferred username)

npx wrangler secret put ADMIN_PASSWORD
# Enter: your_secure_password (replace photoframe@2024 in production!)
```

---

## 10. Complete .dev.vars (Local Development)

Create `/home/user/webapp/.dev.vars` (NEVER commit to git):
```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXXXXX
RAZORPAY_KEY_SECRET=your_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

SHIPROCKET_EMAIL=your@shiprocket-email.com
SHIPROCKET_PASSWORD=your_shiprocket_password

BREVO_API_KEY=xkeysib-xxxx...
RESEND_API_KEY=re_xxxx...

CLOUDINARY_CLOUD_NAME=photoframein
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=xxxxxxxxxxxxxxxxxxxxx

R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET_NAME=photoframein-uploads

GOOGLE_CLIENT_ID=123456789-xxx.apps.googleusercontent.com

ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password
```

---

## 11. Production Deployment Checklist

```bash
# 1. Install Wrangler
npm install -g wrangler

# 2. Login to Cloudflare
wrangler login

# 3. Add all secrets (see above sections)

# 4. Build
npm run build

# 5. Deploy
npx wrangler pages deploy dist --project-name photoframein

# 6. Verify endpoints
curl https://photoframein.pages.dev/api/settings/public
curl https://photoframein.pages.dev/api/pincode/500001
curl https://photoframein.pages.dev/admin
```

---

## 12. System Config Keys Reference

After Supabase is connected, these keys control live behavior:

| Key | Default | Description |
|-----|---------|-------------|
| `cod_enabled` | `true` | Global COD on/off |
| `prepaid_only_mode` | `false` | Auto-activates if API cost > 35% margin |
| `loss_prevention_margin_threshold` | `35` | % trigger for prepaid-only mode |
| `brevo_emails_sent_today` | `0` | Daily counter, resets at midnight |
| `resend_emails_sent_today` | `0` | Fallback counter |
| `brevo_alert_threshold` | `80` | Alert at 80% (240 emails) |
| `premium_naming_mode` | `true` | Premium/Standard vs Teak/MDF labels |
| `exchange_only_policy` | `true` | Exchange only, no returns |
| `unboxing_video_required` | `true` | Video required for exchange claims |
| `google_login_enabled` | `false` | Enable after Google OAuth setup |
| `festival_mode` | `false` | Festival banner + discount |
| `free_shipping_threshold` | `799` | Free shipping above ₹799 |
| `cod_min_order` | `299` | Min order for COD |
| `cod_max_order` | `1999` | Max order for COD |

---

## 13. Loss Prevention Rules (Always Active)

1. **₹99 Add-on Gate**: Cart with ONLY ₹99 No-Frame items → checkout blocked
   - Enforced at: `validateCart()` in `orderManagementEngine.ts`
   - Message: "The ₹99 No-Frame print is an add-on only. Please add a Standard or Premium frame."

2. **COD Gatekeeper**: 
   - Below ₹299 → COD blocked
   - Above ₹1,995 → COD blocked  
   - ₹99-only cart → COD blocked
   - Enforced at: frontend checkout + `api/orders/create`

3. **35% Margin Rule**: If `daily_api_cost / daily_gross_margin > 35%` → auto-enable prepaid-only mode
   - Runs after every order via `checkAndApplyLossPrevention()`
   - Resets daily via `reset_daily_quotas()` PostgreSQL function
   - Override in Admin → Settings → "Prepaid-Only Mode" toggle

4. **Global Prepaid-Only**: Admin toggle or auto-trigger → COD disabled globally

---

## 14. Email Flow Summary

```
Order Created
    ↓
sendEmail() called
    ↓
getQuotaStatus() checks counters
    ↓
Brevo remaining > 0? → Send via Brevo → increment brevo counter
    ↓
Brevo failed/exhausted? → Try Resend → increment resend counter
    ↓
Both exhausted? → Log to api_quota_log, skip email
    ↓
Alert at 80%? → Console warning logged
```

---

*Last updated: 2026-04-16 — PhotoFrameIn v4.0*
