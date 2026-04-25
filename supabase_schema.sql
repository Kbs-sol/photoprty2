-- ============================================================
-- PhotoFrameIn — Supabase PostgreSQL Schema v4.0
-- ============================================================
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────────────────────────
-- TABLE: products
-- Master catalog with pricing, add-on flag, stock management
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id               SERIAL PRIMARY KEY,
  slug             TEXT UNIQUE NOT NULL,
  name             TEXT NOT NULL,
  sub_title        TEXT,
  description      TEXT,
  category         TEXT NOT NULL DEFAULT 'divine',        -- divine, motivational, wall-art, gifts, sports
  badge            TEXT,
  image            TEXT,                                   -- Cloudinary URL (primary)
  gallery_images   JSONB DEFAULT '[]'::jsonb,              -- Cloudinary URLs array
  is_addon_only    BOOLEAN DEFAULT FALSE,                  -- TRUE = ₹99 items, cannot be standalone
  loss_fee         INTEGER DEFAULT NULL,                   -- ₹99 entry price (loss-leader)
  price            INTEGER NOT NULL,                       -- base sell price (INR paise-free)
  compare_price    INTEGER,                                -- strikethrough price
  cost             INTEGER NOT NULL DEFAULT 0,             -- COGS (print+frame+packaging)
  pricing_matrix   JSONB NOT NULL DEFAULT '{}'::jsonb,     -- {frameType: {size: price}}
  cost_matrix      JSONB NOT NULL DEFAULT '{}'::jsonb,     -- {frameType: {size: cost}}
  sizes            JSONB DEFAULT '[]'::jsonb,              -- available sizes
  frames           JSONB DEFAULT '[]'::jsonb,              -- available frame types
  upsell_bundle    TEXT,                                   -- upsell message shown on PDP
  gift_message     TEXT,
  tags             JSONB DEFAULT '[]'::jsonb,
  seo_keywords     TEXT,
  rating           NUMERIC(3,2) DEFAULT 4.5,               -- weighted avg, maintained >= 4.0
  review_count     INTEGER DEFAULT 0,
  in_stock         BOOLEAN DEFAULT TRUE,
  featured         BOOLEAN DEFAULT FALSE,
  launch           BOOLEAN DEFAULT FALSE,                  -- TRUE = launch category
  allow_custom_photo BOOLEAN DEFAULT FALSE,                -- for custom upload frames
  requires_unboxing_video BOOLEAN DEFAULT TRUE,            -- exchange/damage protection
  sort_order       INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_featured  ON products(featured);
CREATE INDEX idx_products_in_stock  ON products(in_stock);
CREATE INDEX idx_products_slug      ON products(slug);

-- ──────────────────────────────────────────────────────────────
-- TABLE: users
-- Linked to Supabase Auth (auth.users)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            TEXT,
  name             TEXT,
  phone            TEXT,
  google_id        TEXT,                                   -- Google OAuth sub
  avatar_url       TEXT,
  is_admin         BOOLEAN DEFAULT FALSE,
  preferred_payment TEXT DEFAULT 'prepaid',               -- prepaid | cod
  total_orders     INTEGER DEFAULT 0,
  total_spent      INTEGER DEFAULT 0,                     -- cumulative INR
  ltv_tier         TEXT DEFAULT 'new',                    -- new | regular | vip
  last_order_at    TIMESTAMPTZ,
  notes            TEXT,                                   -- admin notes
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- TABLE: orders
-- Full order lifecycle with Razorpay + Shiprocket integration
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                   TEXT PRIMARY KEY,                  -- PF-YYMMDD-XXXX format
  user_id              UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Customer snapshot (denormalized for reliability)
  customer_name        TEXT NOT NULL,
  customer_phone       TEXT NOT NULL,
  customer_email       TEXT,
  -- Address
  address_line1        TEXT NOT NULL,
  address_city         TEXT NOT NULL,
  address_state        TEXT NOT NULL,
  address_pincode      TEXT NOT NULL,
  address_country      TEXT DEFAULT 'IN',
  -- Items
  cart_items           JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{id,slug,name,frame,size,price,qty,image}]
  -- Financials
  subtotal             INTEGER NOT NULL,                   -- INR, items only
  shipping_fee         INTEGER NOT NULL DEFAULT 0,
  cod_fee              INTEGER NOT NULL DEFAULT 0,         -- 49 for COD, 0 for prepaid
  discount_amount      INTEGER NOT NULL DEFAULT 0,
  coupon_code          TEXT,
  total_amount         INTEGER NOT NULL,                   -- final charged amount
  -- Payment
  payment_method       TEXT NOT NULL DEFAULT 'prepaid',   -- prepaid | cod
  payment_status       TEXT NOT NULL DEFAULT 'pending',   -- pending | paid | failed | refunded
  razorpay_order_id    TEXT,                              -- rzp_order_XXXX
  razorpay_payment_id  TEXT,                              -- pay_XXXX
  razorpay_signature   TEXT,
  payment_verified     BOOLEAN DEFAULT FALSE,
  -- COD-specific
  cod_confirmed        BOOLEAN DEFAULT FALSE,
  cod_confirmed_at     TIMESTAMPTZ,
  cod_auto_cancel_at   TIMESTAMPTZ,                       -- 24h after order creation
  -- Logistics
  order_status         TEXT NOT NULL DEFAULT 'pending',   -- pending | confirmed | processing | dispatched | delivered | cancelled | exchange_requested | exchanged
  shiprocket_order_id  TEXT,
  shiprocket_shipment_id TEXT,
  tracking_id          TEXT,
  courier_name         TEXT,
  estimated_delivery   DATE,
  dispatched_at        TIMESTAMPTZ,
  delivered_at         TIMESTAMPTZ,
  -- Exchange / Damage
  exchange_reason      TEXT,                              -- transit_damage | wrong_item
  exchange_status      TEXT,                              -- nil | requested | approved | completed
  unboxing_video_url   TEXT,                              -- Cloudflare R2 or Cloudinary URL
  exchange_requested_at TIMESTAMPTZ,
  -- Profit Engine
  gross_margin         INTEGER,                           -- total - COGS
  net_contribution     INTEGER,                           -- gross_margin - shipping_cost - gateway_fee
  -- Admin
  admin_notes          TEXT,
  is_flagged           BOOLEAN DEFAULT FALSE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_orders_user_id      ON orders(user_id);
CREATE INDEX idx_orders_status       ON orders(order_status);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_payment_method ON orders(payment_method);
CREATE INDEX idx_orders_created_at   ON orders(created_at DESC);
CREATE INDEX idx_orders_pincode      ON orders(address_pincode);
CREATE INDEX idx_orders_rzp_order    ON orders(razorpay_order_id);
CREATE INDEX idx_orders_cod_cancel   ON orders(cod_auto_cancel_at) WHERE payment_method = 'cod' AND cod_confirmed = FALSE;

-- ──────────────────────────────────────────────────────────────
-- TABLE: reviews
-- Customer reviews with weighted rating enforcement
-- Only approved reviews shown. Weighted avg maintained >= 4.0.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id       INTEGER REFERENCES products(id) ON DELETE CASCADE,
  order_id         TEXT REFERENCES orders(id) ON DELETE SET NULL,
  user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Review content
  reviewer_name    TEXT NOT NULL,
  reviewer_phone   TEXT,                                  -- for verification
  rating           INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title            TEXT,
  comment          TEXT,
  images           JSONB DEFAULT '[]'::jsonb,             -- reviewer-uploaded image URLs
  -- Moderation
  is_approved      BOOLEAN DEFAULT FALSE,                 -- must be approved to show
  is_verified      BOOLEAN DEFAULT FALSE,                 -- verified purchase
  admin_reply      TEXT,
  admin_reply_at   TIMESTAMPTZ,
  moderated_by     TEXT,
  moderated_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  -- Weighted scoring
  weight           NUMERIC(3,2) DEFAULT 1.0,              -- admin-set weight for avg calculation
  -- Metadata
  source           TEXT DEFAULT 'site',                   -- site | import | google
  helpful_votes    INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_reviews_product_id  ON reviews(product_id);
CREATE INDEX idx_reviews_is_approved ON reviews(is_approved);
CREATE INDEX idx_reviews_order_id    ON reviews(order_id);

-- Trigger: Update product rating when a review is approved/rejected
CREATE OR REPLACE FUNCTION update_product_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE products
  SET
    rating = (
      SELECT COALESCE(
        SUM(r.rating * r.weight) / NULLIF(SUM(r.weight), 0),
        4.5  -- default if no approved reviews
      )
      FROM reviews r
      WHERE r.product_id = COALESCE(NEW.product_id, OLD.product_id)
        AND r.is_approved = TRUE
    ),
    review_count = (
      SELECT COUNT(*) FROM reviews
      WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
        AND is_approved = TRUE
    ),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.product_id, OLD.product_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_product_rating
AFTER INSERT OR UPDATE OF is_approved, rating, weight OR DELETE ON reviews
FOR EACH ROW EXECUTE FUNCTION update_product_rating();

-- ──────────────────────────────────────────────────────────────
-- TABLE: system_config
-- Global counters, quotas, and operational toggles
-- Key-value store with typed metadata
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_config (
  key              TEXT PRIMARY KEY,
  value            TEXT NOT NULL,
  value_type       TEXT DEFAULT 'string',                 -- string | integer | boolean | json
  description      TEXT,
  category         TEXT DEFAULT 'general',                -- general | quota | toggle | pricing | ads
  updated_by       TEXT,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default system_config values
INSERT INTO system_config (key, value, value_type, description, category) VALUES
  -- API Quota tracking (resets daily)
  ('brevo_emails_sent_today',      '0',      'integer', 'Brevo emails sent today (free tier limit: 300/day)', 'quota'),
  ('brevo_emails_limit_day',       '300',    'integer', 'Brevo daily email limit', 'quota'),
  ('brevo_alert_threshold',        '80',     'integer', 'Alert at % of limit (80 = 240 emails)', 'quota'),
  ('brevo_quota_date',             to_char(NOW(), 'YYYY-MM-DD'), 'string', 'Date of current quota window', 'quota'),
  ('resend_emails_sent_today',     '0',      'integer', 'Resend fallback emails sent today (limit: 100/day)', 'quota'),
  ('resend_emails_limit_day',      '100',    'integer', 'Resend daily email limit', 'quota'),
  ('resend_quota_date',            to_char(NOW(), 'YYYY-MM-DD'), 'string', 'Date of current quota window', 'quota'),
  -- Operational toggles
  ('cod_enabled',                  'true',   'boolean', 'Global COD enable/disable', 'toggle'),
  ('festival_mode',                'false',  'boolean', 'Festival mode (banner + discount)', 'toggle'),
  ('acrylic_upgrade_enabled',      'false',  'boolean', 'Acrylic upgrade upsell toggle', 'toggle'),
  ('combo_enabled',                'true',   'boolean', 'Bundle/combo products toggle', 'toggle'),
  ('loss_leader_enabled',          'true',   'boolean', '₹99 no-frame loss leader toggle', 'toggle'),
  ('prepaid_only_mode',            'false',  'boolean', 'Prepaid-only mode (disables COD globally)', 'toggle'),
  ('exit_intent_popup',            'true',   'boolean', 'Exit intent popup toggle', 'toggle'),
  ('google_login_enabled',         'false',  'boolean', 'Google OAuth login toggle', 'toggle'),
  ('premium_naming_mode',          'true',   'boolean', 'Show Premium/Standard labels (false = show Teak Wood/MDF labels)', 'toggle'),
  ('exchange_only_policy',         'true',   'boolean', 'Exchange only, no returns', 'toggle'),
  ('unboxing_video_required',      'true',   'boolean', 'Require unboxing video for exchange claims', 'toggle'),
  -- Pricing thresholds
  ('free_shipping_threshold',      '799',    'integer', 'Order total for free shipping (INR)', 'pricing'),
  ('cod_min_order',                '299',    'integer', 'Minimum order for COD (INR)', 'pricing'),
  ('cod_max_order',                '1999',   'integer', 'Maximum order for COD (INR)', 'pricing'),
  ('cod_surcharge',                '49',     'integer', 'COD handling fee (INR)', 'pricing'),
  ('shipping_cost_below_threshold','60',     'integer', 'Shipping cost when below free threshold (INR)', 'pricing'),
  ('prepaid_cashback_min',         '599',    'integer', 'Min order for ₹50 prepaid cashback', 'pricing'),
  ('prepaid_cashback_amount',      '50',     'integer', 'Prepaid cashback amount (INR)', 'pricing'),
  -- Loss prevention & profit engine
  ('loss_prevention_margin_threshold', '35', 'integer', 'If daily loss > 35% gross margin → switch to prepaid-only', 'general'),
  ('daily_gross_margin_inr',       '0',      'integer', 'Running daily gross margin total (INR)', 'quota'),
  ('daily_api_cost_inr',           '0',      'integer', 'Running daily API/logistics cost (INR)', 'quota'),
  ('quota_reset_date',             to_char(NOW(), 'YYYY-MM-DD'), 'string', 'Date of current daily quota window', 'quota'),
  -- Festival settings
  ('festival_banner',              'Navratri Special: 20% OFF on all Divine Frames 🔱', 'string', 'Festival announcement banner text', 'general'),
  ('festival_discount_percent',    '20',     'integer', 'Festival mode discount %', 'pricing'),
  -- Ads & content
  ('loss_leader_ad_budget_inr',    '2000',   'integer', 'Phase 2 loss-leader ad budget/month (INR)', 'ads'),
  ('instagram_reel_budget',        '5000',   'integer', 'Instagram Reels monthly budget (INR)', 'ads'),
  ('google_search_budget',         '8000',   'integer', 'Google Search monthly budget (INR)', 'ads'),
  ('pinterest_budget',             '3000',   'integer', 'Pinterest monthly budget (INR)', 'ads'),
  -- Analytics IDs (placeholders)
  ('ga4_measurement_id',           '',       'string', 'Google Analytics 4 Measurement ID', 'general'),
  ('fb_pixel_id',                  '',       'string', 'Facebook Pixel ID', 'general'),
  ('gtm_container_id',             '',       'string', 'Google Tag Manager Container ID', 'general'),
  -- Store info
  ('store_phone',                  '+91-79895-31818', 'string', 'Customer support phone', 'general'),
  ('store_email',                  'support@photoframein.in', 'string', 'Support email', 'general'),
  ('store_whatsapp',               '917989531818', 'string', 'WhatsApp number (no +)', 'general'),
  ('dispatch_sla_hours',           '12',     'integer', 'Standard dispatch SLA in hours', 'general'),
  ('prepaid_dispatch_sla_hours',   '6',      'integer', 'Prepaid priority dispatch SLA in hours', 'general')
ON CONFLICT (key) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- TABLE: coupons
-- Discount codes with full lifecycle management
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code             TEXT UNIQUE NOT NULL,
  type             TEXT NOT NULL DEFAULT 'percent',       -- percent | flat | free_shipping
  value            INTEGER NOT NULL,                      -- % or INR amount
  min_order        INTEGER DEFAULT 0,                     -- minimum order to apply
  max_discount     INTEGER,                               -- cap for percent coupons
  max_uses         INTEGER,                               -- NULL = unlimited
  uses             INTEGER DEFAULT 0,
  per_user_limit   INTEGER DEFAULT 1,
  active           BOOLEAN DEFAULT TRUE,
  expiry_date      DATE,
  applicable_categories JSONB DEFAULT '[]'::jsonb,        -- [] = all categories
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Seed demo coupons
INSERT INTO coupons (code, type, value, min_order, max_uses, uses, active, expiry_date) VALUES
  ('FRAME10',  'percent', 10,  299,  500,  87,  true, '2026-12-31'),
  ('DIWALI25', 'percent', 25,  799,  1000, 234, false,'2026-10-31'),
  ('FIRST99',  'flat',    99,  499,  200,  45,  true, '2026-06-30'),
  ('WELCOME50','flat',    50,  299,  NULL, 0,   true, '2026-12-31')
ON CONFLICT (code) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- TABLE: api_quota_log
-- Daily log for email/API usage tracking (Brevo + Resend)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_quota_log (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service          TEXT NOT NULL,                         -- brevo | resend | shiprocket | razorpay
  event_type       TEXT NOT NULL,                         -- order_confirmation | cod_confirm | dispatch_alert | otp
  order_id         TEXT REFERENCES orders(id) ON DELETE SET NULL,
  status           TEXT DEFAULT 'sent',                   -- sent | failed | skipped
  provider_used    TEXT,                                  -- actual provider used (brevo/resend)
  cost_inr         NUMERIC(8,2) DEFAULT 0,               -- API cost in INR
  quota_remaining  INTEGER,                               -- quota left after this call
  log_date         DATE DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quota_log_service   ON api_quota_log(service);
CREATE INDEX idx_quota_log_date      ON api_quota_log(log_date);

-- ──────────────────────────────────────────────────────────────
-- TABLE: pincode_cache
-- Cached Indian Post API results for delivery speed lookup
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pincode_cache (
  pincode          TEXT PRIMARY KEY,
  district         TEXT,
  state_name       TEXT,
  post_office      TEXT,
  is_valid         BOOLEAN DEFAULT TRUE,
  delivery_days    INTEGER DEFAULT 5,                     -- estimated days from Hyderabad
  is_metro         BOOLEAN DEFAULT FALSE,
  last_fetched_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed known metros for fast lookup
INSERT INTO pincode_cache (pincode, district, state_name, delivery_days, is_metro) VALUES
  ('500001', 'Hyderabad', 'Telangana', 1, true),
  ('500002', 'Hyderabad', 'Telangana', 1, true),
  ('400001', 'Mumbai',    'Maharashtra', 2, true),
  ('110001', 'New Delhi', 'Delhi', 2, true),
  ('560001', 'Bengaluru', 'Karnataka', 2, true),
  ('600001', 'Chennai',   'Tamil Nadu', 2, true),
  ('700001', 'Kolkata',   'West Bengal', 3, true)
ON CONFLICT (pincode) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- TABLE: exchange_requests
-- Transit damage exchange workflow
-- Policy: Exchange only (no returns). Unboxing video mandatory.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exchange_requests (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id         TEXT REFERENCES orders(id) ON DELETE CASCADE,
  reason           TEXT NOT NULL,                         -- transit_damage | wrong_item
  description      TEXT,
  unboxing_video_url TEXT,                                -- REQUIRED for exchange approval
  images           JSONB DEFAULT '[]'::jsonb,
  status           TEXT DEFAULT 'pending',                -- pending | approved | rejected | completed
  resolution       TEXT,                                  -- replacement | partial_refund
  admin_notes      TEXT,
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  replacement_order_id TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS) Policies
-- ──────────────────────────────────────────────────────────────

-- Enable RLS on all tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_quota_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_requests ENABLE ROW LEVEL SECURITY;

-- Products: public read of active products
CREATE POLICY "products_public_read" ON products
  FOR SELECT USING (in_stock = TRUE);

-- Orders: users can read own orders
CREATE POLICY "orders_user_read" ON orders
  FOR SELECT USING (user_id = auth.uid());

-- Orders: service role has full access (for Cloudflare Workers)
CREATE POLICY "orders_service_role" ON orders
  USING (auth.role() = 'service_role');

-- Reviews: public read of approved reviews only
CREATE POLICY "reviews_public_read" ON reviews
  FOR SELECT USING (is_approved = TRUE);

-- Users: can read/update own profile
CREATE POLICY "users_self_access" ON users
  FOR ALL USING (id = auth.uid());

-- system_config: service role only
CREATE POLICY "system_config_service_role" ON system_config
  USING (auth.role() = 'service_role');

-- ──────────────────────────────────────────────────────────────
-- UTILITY FUNCTIONS
-- ──────────────────────────────────────────────────────────────

-- Function: Get system config value by key
CREATE OR REPLACE FUNCTION get_config(config_key TEXT)
RETURNS TEXT AS $$
  SELECT value FROM system_config WHERE key = config_key;
$$ LANGUAGE SQL STABLE;

-- Function: Increment a counter in system_config
CREATE OR REPLACE FUNCTION increment_config_counter(config_key TEXT, amount INTEGER DEFAULT 1)
RETURNS INTEGER AS $$
DECLARE
  current_val INTEGER;
BEGIN
  SELECT COALESCE(value::INTEGER, 0) INTO current_val
  FROM system_config WHERE key = config_key;
  
  UPDATE system_config
  SET value = (current_val + amount)::TEXT, updated_at = NOW()
  WHERE key = config_key;
  
  RETURN current_val + amount;
END;
$$ LANGUAGE plpgsql;

-- Function: Reset daily quotas (call via cron at midnight IST)
CREATE OR REPLACE FUNCTION reset_daily_quotas()
RETURNS VOID AS $$
BEGIN
  UPDATE system_config
  SET value = '0', updated_at = NOW()
  WHERE key IN ('brevo_emails_sent_today', 'resend_emails_sent_today', 'daily_gross_margin_inr', 'daily_api_cost_inr');
  
  UPDATE system_config
  SET value = to_char(NOW(), 'YYYY-MM-DD'), updated_at = NOW()
  WHERE key IN ('brevo_quota_date', 'resend_quota_date', 'quota_reset_date');
END;
$$ LANGUAGE plpgsql;

-- Function: Check if prepaid-only mode should be auto-activated (35% rule)
CREATE OR REPLACE FUNCTION check_loss_prevention_trigger()
RETURNS BOOLEAN AS $$
DECLARE
  daily_margin INTEGER;
  daily_api_cost INTEGER;
  threshold INTEGER;
  trigger_activated BOOLEAN := FALSE;
BEGIN
  SELECT COALESCE(value::INTEGER, 0) INTO daily_margin FROM system_config WHERE key = 'daily_gross_margin_inr';
  SELECT COALESCE(value::INTEGER, 0) INTO daily_api_cost FROM system_config WHERE key = 'daily_api_cost_inr';
  SELECT COALESCE(value::INTEGER, 35) INTO threshold FROM system_config WHERE key = 'loss_prevention_margin_threshold';
  
  -- If daily API/logistics cost exceeds 35% of gross margin → switch to prepaid only
  IF daily_margin > 0 AND (daily_api_cost::NUMERIC / daily_margin::NUMERIC * 100) > threshold THEN
    UPDATE system_config SET value = 'true', updated_at = NOW() WHERE key = 'prepaid_only_mode';
    trigger_activated := TRUE;
  END IF;
  
  RETURN trigger_activated;
END;
$$ LANGUAGE plpgsql;

-- ──────────────────────────────────────────────────────────────
-- VIEWS
-- ──────────────────────────────────────────────────────────────

-- View: Today's analytics summary
CREATE OR REPLACE VIEW today_analytics AS
SELECT
  COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE) AS orders_today,
  COALESCE(SUM(total_amount) FILTER (WHERE DATE(created_at) = CURRENT_DATE), 0) AS revenue_today,
  COALESCE(SUM(total_amount) FILTER (WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())), 0) AS revenue_mtd,
  COUNT(*) FILTER (WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())) AS orders_mtd,
  COALESCE(AVG(total_amount) FILTER (WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())), 0) AS aov_mtd,
  COUNT(*) FILTER (WHERE payment_method = 'cod' AND cod_confirmed = FALSE AND DATE(created_at) = CURRENT_DATE) AS cod_pending_today,
  COUNT(*) FILTER (WHERE order_status = 'dispatched') AS in_transit
FROM orders
WHERE order_status NOT IN ('cancelled');
