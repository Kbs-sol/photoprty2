-- ═══════════════════════════════════════════════════════════════════
--  PhotoFrameIn — Supabase PostgreSQL Schema v1.0
--  Run this in Supabase SQL Editor (Database → SQL Editor → New Query)
-- ═══════════════════════════════════════════════════════════════════

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for fuzzy search

-- ── ENUM TYPES ────────────────────────────────────────────────────
CREATE TYPE order_status AS ENUM (
  'pending_payment', 'payment_failed', 'confirmed',
  'printing', 'packed', 'dispatched', 'in_transit',
  'delivered', 'rto_initiated', 'rto_received', 'cancelled', 'refunded'
);

CREATE TYPE payment_method AS ENUM ('razorpay', 'cod', 'upi_manual');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
CREATE TYPE frame_type AS ENUM ('no_frame', 'classic', 'premium', 'acrylic');
-- NOTE: 'Standard' renamed to 'Classic', 'Premium' to 'Premium/Acrylic' per business rule

CREATE TYPE review_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE alert_level AS ENUM ('ok', 'warning', 'critical');

-- ══════════════════════════════════════════════════════════════════
--  TABLE: products
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE products (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  subtitle      TEXT,
  category      TEXT NOT NULL,            -- divine, motivational, sports, custom, etc.
  badge         TEXT,
  description   TEXT,
  gift_message  TEXT,
  seo_keywords  TEXT,
  upsell_text   TEXT,

  -- Pricing matrix stored as JSONB
  -- {"no_frame":{"A4 Small":99,"Small (8x12)":199},"classic":{...},"premium":{...},"acrylic":{...}}
  pricing_matrix JSONB NOT NULL DEFAULT '{}',
  cost_matrix    JSONB NOT NULL DEFAULT '{}', -- internal only, never expose to frontend

  -- Images
  primary_image   TEXT,   -- Cloudinary URL or Unsplash placeholder
  gallery_images  JSONB DEFAULT '[]', -- array of URLs
  cloudinary_public_id TEXT,

  -- Flags
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_featured     BOOLEAN NOT NULL DEFAULT false,
  is_addon        BOOLEAN NOT NULL DEFAULT false, -- if true, cannot be sole cart item
  is_loss_leader  BOOLEAN NOT NULL DEFAULT false, -- disables COD
  in_stock        BOOLEAN NOT NULL DEFAULT true,

  -- Frame availability
  has_no_frame    BOOLEAN NOT NULL DEFAULT true,
  has_classic     BOOLEAN NOT NULL DEFAULT true,  -- formerly 'Standard'
  has_premium     BOOLEAN NOT NULL DEFAULT true,
  has_acrylic     BOOLEAN NOT NULL DEFAULT false, -- toggled by admin

  -- Analytics
  view_count      INTEGER NOT NULL DEFAULT 0,
  order_count     INTEGER NOT NULL DEFAULT 0,
  rating_avg      DECIMAL(3,2) DEFAULT 0,
  rating_count    INTEGER NOT NULL DEFAULT 0,

  -- Size metadata for image quality checker
  size_pixel_requirements JSONB DEFAULT '{
    "A4 Small":     {"min_px": 794,  "min_py": 1123, "dpi": 96},
    "Small (8x12)": {"min_px": 768,  "min_py": 1152, "dpi": 96},
    "Medium (12x18)":{"min_px": 1152,"min_py": 1728, "dpi": 96},
    "Large (18x24)":{"min_px": 1728, "min_py": 2304, "dpi": 96},
    "XL (24x36)":   {"min_px": 2304, "min_py": 3456, "dpi": 96}
  }',

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_slug     ON products(slug);
CREATE INDEX idx_products_active   ON products(is_active, is_featured);
CREATE INDEX idx_products_search   ON products USING gin(name gin_trgm_ops);

-- ══════════════════════════════════════════════════════════════════
--  TABLE: orders
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_id      TEXT UNIQUE NOT NULL, -- e.g. PF-260410-AB12 (human-readable)

  -- Customer
  customer_name   TEXT NOT NULL,
  customer_email  TEXT,
  customer_phone  TEXT NOT NULL,
  customer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Shipping address
  address_line1   TEXT NOT NULL,
  address_line2   TEXT,
  city            TEXT NOT NULL,
  state           TEXT NOT NULL,
  pincode         TEXT NOT NULL,
  country         TEXT NOT NULL DEFAULT 'IN',
  pincode_verified BOOLEAN DEFAULT false,
  pincode_post_office TEXT,  -- from Indian Post API

  -- Order items (denormalized for immutability)
  -- [{"product_id":"uuid","product_name":"...","frame_type":"classic","size":"Medium","qty":1,"unit_price":749,"subtotal":749}]
  items           JSONB NOT NULL DEFAULT '[]',
  item_count      INTEGER NOT NULL DEFAULT 1,

  -- Financials
  subtotal        DECIMAL(10,2) NOT NULL,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  coupon_code     TEXT,
  shipping_charge DECIMAL(10,2) NOT NULL DEFAULT 0,
  cod_charge      DECIMAL(10,2) NOT NULL DEFAULT 0,
  total           DECIMAL(10,2) NOT NULL,
  cogs_total      DECIMAL(10,2),  -- calculated from cost_matrix, for profit tracking

  -- Payment
  payment_method  payment_method NOT NULL,
  payment_status  payment_status NOT NULL DEFAULT 'pending',
  razorpay_order_id   TEXT UNIQUE,
  razorpay_payment_id TEXT,
  razorpay_signature  TEXT,

  -- COD gatekeeper
  cod_confirmed       BOOLEAN DEFAULT false,
  cod_confirm_sent_at TIMESTAMPTZ,
  cod_confirm_deadline TIMESTAMPTZ,

  -- Order status
  status          order_status NOT NULL DEFAULT 'pending_payment',
  status_history  JSONB DEFAULT '[]', -- [{status,timestamp,note}]
  admin_note      TEXT,

  -- Fulfillment (Shiprocket)
  shiprocket_order_id   TEXT,
  shiprocket_shipment_id TEXT,
  courier_name          TEXT,
  awb_number            TEXT,
  tracking_url          TEXT,
  pickup_scheduled_at   TIMESTAMPTZ,
  dispatched_at         TIMESTAMPTZ,
  estimated_delivery_at TIMESTAMPTZ,
  delivered_at          TIMESTAMPTZ,
  rto_initiated_at      TIMESTAMPTZ,

  -- Custom frame upload (Cloudflare R2)
  custom_image_r2_key TEXT,
  custom_image_url    TEXT,
  image_quality_score INTEGER, -- 0-100 from JS quality checker

  -- Customer requests
  callback_needed     BOOLEAN DEFAULT false,
  callback_note       TEXT,
  gift_wrap           BOOLEAN DEFAULT false,
  gift_message        TEXT,

  -- Damage claim
  unboxing_video_url  TEXT,
  damage_claimed      BOOLEAN DEFAULT false,
  damage_claim_at     TIMESTAMPTZ,
  replacement_order_id UUID REFERENCES orders(id),

  -- Meta
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  user_agent      TEXT,
  ip_country      TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_display_id    ON orders(display_id);
CREATE INDEX idx_orders_phone         ON orders(customer_phone);
CREATE INDEX idx_orders_email         ON orders(customer_email);
CREATE INDEX idx_orders_status        ON orders(status);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_created       ON orders(created_at DESC);
CREATE INDEX idx_orders_pincode       ON orders(pincode);
CREATE INDEX idx_orders_user          ON orders(customer_user_id);

-- ══════════════════════════════════════════════════════════════════
--  TABLE: reviews
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE reviews (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Review content
  customer_name TEXT NOT NULL,
  customer_city TEXT,
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title         TEXT,
  body          TEXT NOT NULL,
  photos        JSONB DEFAULT '[]', -- array of R2/Cloudinary URLs

  -- Weighted rating logic:
  -- Only approved reviews count. 
  -- Display: if avg < 3.8, add up to 2 "neutral" (3-star) synthetic reviews to pull up.
  -- NEVER fake reviews — only show real approved ones. The weight is for sorting/display order.
  weight        DECIMAL(4,2) DEFAULT 1.0,

  -- Moderation
  status        review_status NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  approved_by   UUID REFERENCES auth.users(id),
  approved_at   TIMESTAMPTZ,

  -- Verified purchase flag
  is_verified_purchase BOOLEAN DEFAULT false,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reviews_product  ON reviews(product_id, status);
CREATE INDEX idx_reviews_order    ON reviews(order_id);
CREATE INDEX idx_reviews_rating   ON reviews(rating, status);

-- ══════════════════════════════════════════════════════════════════
--  TABLE: system_config
--  Single-row table (enforced by trigger) for global store settings
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE system_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- enforces single row

  -- Store toggles
  cod_enabled             BOOLEAN NOT NULL DEFAULT true,
  prepaid_only_mode       BOOLEAN NOT NULL DEFAULT false, -- 35% RTO rule override
  acrylic_enabled         BOOLEAN NOT NULL DEFAULT false,
  festival_mode           BOOLEAN NOT NULL DEFAULT false,
  combo_enabled           BOOLEAN NOT NULL DEFAULT true,
  loss_leader_enabled     BOOLEAN NOT NULL DEFAULT true,
  exit_popup_enabled      BOOLEAN NOT NULL DEFAULT true,
  maintenance_mode        BOOLEAN NOT NULL DEFAULT false,
  callback_feature_enabled BOOLEAN NOT NULL DEFAULT true,
  image_quality_check_enabled BOOLEAN NOT NULL DEFAULT true,

  -- COD rules
  cod_min_order           DECIMAL(10,2) NOT NULL DEFAULT 499,   -- per brief: ₹499 min
  cod_max_order           DECIMAL(10,2) NOT NULL DEFAULT 1995,  -- per brief: ₹1995 max
  cod_surcharge           DECIMAL(10,2) NOT NULL DEFAULT 49,

  -- Shipping
  free_shipping_threshold DECIMAL(10,2) NOT NULL DEFAULT 799,
  shipping_below_threshold DECIMAL(10,2) NOT NULL DEFAULT 79,
  cod_shipping_small_med  DECIMAL(10,2) NOT NULL DEFAULT 99,
  cod_shipping_large_xl   DECIMAL(10,2) NOT NULL DEFAULT 149,
  express_fee             DECIMAL(10,2) NOT NULL DEFAULT 99,
  prepaid_cashback        DECIMAL(10,2) NOT NULL DEFAULT 50,

  -- Frame naming (admin can rename)
  classic_frame_label     TEXT NOT NULL DEFAULT 'Classic Frame',  -- NOT 'Standard'
  premium_frame_label     TEXT NOT NULL DEFAULT 'Premium Frame',
  acrylic_frame_label     TEXT NOT NULL DEFAULT 'Acrylic Frame',
  no_frame_label          TEXT NOT NULL DEFAULT 'Print Only',

  -- Festival banner
  festival_banner         TEXT DEFAULT 'Navratri Special: 20% OFF on all Divine Frames 🔱',
  festival_discount_pct   INTEGER DEFAULT 20,

  -- Exit popup
  exit_popup_discount_pct INTEGER DEFAULT 10,
  exit_popup_coupon       TEXT DEFAULT 'FRAME10',

  -- Contact
  whatsapp_number         TEXT DEFAULT '917989531818',
  support_email           TEXT DEFAULT 'support@photoframein.in',
  alert_email             TEXT DEFAULT 'alerts@photoframein.in', -- for quota alerts
  instagram_handle        TEXT DEFAULT '@photoframein',
  address_line1           TEXT DEFAULT 'Hyderabad, Telangana',
  address_line2           TEXT DEFAULT '500001, India',

  -- Analytics
  ga_measurement_id       TEXT DEFAULT '',
  meta_pixel_id           TEXT DEFAULT '',
  gtm_id                  TEXT DEFAULT '',

  -- Free tier quota tracking (reset daily at midnight IST)
  brevo_emails_today      INTEGER NOT NULL DEFAULT 0,
  brevo_daily_limit       INTEGER NOT NULL DEFAULT 300,
  resend_emails_today     INTEGER NOT NULL DEFAULT 0,
  resend_daily_limit      INTEGER NOT NULL DEFAULT 100,
  supabase_rows_count     BIGINT NOT NULL DEFAULT 0,
  supabase_rows_limit     BIGINT NOT NULL DEFAULT 500000, -- free tier
  quota_last_reset        DATE DEFAULT CURRENT_DATE,
  quota_alert_threshold   DECIMAL(4,2) DEFAULT 0.80, -- 80% triggers alert

  -- Profit engine
  rto_rate_today          DECIMAL(5,2) DEFAULT 0,  -- live RTO %
  rto_rate_7day           DECIMAL(5,2) DEFAULT 0,
  gross_margin_today      DECIMAL(10,2) DEFAULT 0,
  rto_cost_today          DECIMAL(10,2) DEFAULT 0,
  rto_threshold_pct       DECIMAL(4,2) DEFAULT 35.0, -- 35% rule
  auto_prepaid_only_trigger BOOLEAN DEFAULT true, -- auto-switch on 35% breach

  -- Legal pages (editable via admin)
  terms_content           TEXT DEFAULT '',
  privacy_content         TEXT DEFAULT '',
  returns_content         TEXT DEFAULT '',
  shipping_content        TEXT DEFAULT '',
  about_content           TEXT DEFAULT '',

  -- Ads monthly budget tracking
  ads_budget_month        DECIMAL(10,2) DEFAULT 2000,
  ads_spent_month         DECIMAL(10,2) DEFAULT 0,

  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by              UUID REFERENCES auth.users(id)
);

-- Insert the single config row
INSERT INTO system_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════════
--  TABLE: coupons
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE coupons (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        TEXT UNIQUE NOT NULL,
  description TEXT,
  type        TEXT NOT NULL CHECK (type IN ('percent', 'flat', 'shipping')),
  value       DECIMAL(10,2) NOT NULL,
  min_order   DECIMAL(10,2) DEFAULT 0,
  max_uses    INTEGER DEFAULT 1000,
  uses        INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  valid_from  TIMESTAMPTZ DEFAULT now(),
  valid_until TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO coupons (code, description, type, value, min_order, max_uses, is_active)
VALUES
  ('FRAME10', 'Welcome 10% off', 'percent', 10, 299, 5000, true),
  ('FIRST99', 'First order ₹99 off', 'flat', 99, 499, 200, true),
  ('FREESHIP', 'Free shipping', 'shipping', 0, 0, 300, true)
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════════
--  TABLE: quota_log (audit trail for API usage)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE quota_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service     TEXT NOT NULL, -- 'brevo', 'resend', 'shiprocket', 'razorpay', 'indianpost', 'cloudinary'
  action      TEXT NOT NULL, -- 'email_sent', 'shipment_created', 'payment_created', etc.
  count       INTEGER DEFAULT 1,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quota_log_service ON quota_log(service, created_at DESC);
CREATE INDEX idx_quota_log_date    ON quota_log(created_at::date);

-- ══════════════════════════════════════════════════════════════════
--  FUNCTIONS & TRIGGERS
-- ══════════════════════════════════════════════════════════════════

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_updated    BEFORE UPDATE ON products    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_orders_updated      BEFORE UPDATE ON orders      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_reviews_updated     BEFORE UPDATE ON reviews     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_system_config_updated BEFORE UPDATE ON system_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Generate display_id for orders
CREATE OR REPLACE FUNCTION generate_display_id()
RETURNS TRIGGER AS $$
DECLARE
  date_part TEXT;
  rand_part TEXT;
BEGIN
  date_part := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYMMDD');
  rand_part := upper(substr(md5(random()::text), 1, 4));
  NEW.display_id := 'PF-' || date_part || '-' || rand_part;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_display_id
  BEFORE INSERT ON orders
  FOR EACH ROW
  WHEN (NEW.display_id IS NULL OR NEW.display_id = '')
  EXECUTE FUNCTION generate_display_id();

-- Update product rating when review approved
CREATE OR REPLACE FUNCTION update_product_rating()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    UPDATE products SET
      rating_avg   = (SELECT AVG(rating) FROM reviews WHERE product_id = NEW.product_id AND status = 'approved'),
      rating_count = (SELECT COUNT(*) FROM reviews WHERE product_id = NEW.product_id AND status = 'approved'),
      order_count  = order_count + 1,
      updated_at   = now()
    WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_review_product_rating
  AFTER INSERT OR UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_product_rating();

-- Daily quota reset check
CREATE OR REPLACE FUNCTION reset_daily_quotas()
RETURNS void AS $$
BEGIN
  UPDATE system_config SET
    brevo_emails_today  = 0,
    resend_emails_today = 0,
    quota_last_reset    = CURRENT_DATE
  WHERE quota_last_reset < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- ══════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY (RLS)
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE products     ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews      ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons      ENABLE ROW LEVEL SECURITY;
ALTER TABLE quota_log    ENABLE ROW LEVEL SECURITY;

-- Products: anyone can read active products
CREATE POLICY "Public read active products" ON products
  FOR SELECT USING (is_active = true);

-- Orders: users can only see their own orders
CREATE POLICY "Users read own orders" ON orders
  FOR SELECT USING (customer_user_id = auth.uid() OR auth.uid() IS NOT NULL);

-- Orders: anyone can insert (guest checkout)
CREATE POLICY "Anyone can create order" ON orders
  FOR INSERT WITH CHECK (true);

-- Reviews: anyone can read approved
CREATE POLICY "Public read approved reviews" ON reviews
  FOR SELECT USING (status = 'approved');

-- Reviews: authenticated users can insert
CREATE POLICY "Auth users can submit review" ON reviews
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- System config: public read (non-sensitive fields via view)
CREATE POLICY "No direct public access to system_config" ON system_config
  FOR SELECT USING (false); -- use the view below instead

-- Coupons: service role only
CREATE POLICY "No public coupon access" ON coupons
  FOR SELECT USING (false);

-- ══════════════════════════════════════════════════════════════════
--  PUBLIC SETTINGS VIEW (safe subset for storefront)
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public_settings AS
SELECT
  cod_enabled,
  prepaid_only_mode,
  acrylic_enabled,
  festival_mode,
  combo_enabled,
  loss_leader_enabled,
  exit_popup_enabled,
  maintenance_mode,
  callback_feature_enabled,
  image_quality_check_enabled,
  cod_min_order,
  cod_max_order,
  cod_surcharge,
  free_shipping_threshold,
  shipping_below_threshold,
  cod_shipping_small_med,
  cod_shipping_large_xl,
  prepaid_cashback,
  classic_frame_label,
  premium_frame_label,
  acrylic_frame_label,
  no_frame_label,
  festival_banner,
  festival_discount_pct,
  exit_popup_discount_pct,
  exit_popup_coupon,
  whatsapp_number,
  support_email,
  instagram_handle,
  brevo_emails_today,
  brevo_daily_limit,
  updated_at
FROM system_config WHERE id = 1;

-- Allow public to read the view
GRANT SELECT ON public_settings TO anon, authenticated;

-- ══════════════════════════════════════════════════════════════════
--  ANALYTICS VIEWS
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW order_analytics AS
SELECT
  date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata') AS day,
  COUNT(*) AS total_orders,
  COUNT(*) FILTER (WHERE status = 'delivered') AS delivered,
  COUNT(*) FILTER (WHERE status IN ('rto_initiated','rto_received')) AS rto,
  COUNT(*) FILTER (WHERE payment_method = 'cod') AS cod_orders,
  COUNT(*) FILTER (WHERE payment_method = 'razorpay') AS prepaid_orders,
  SUM(total) AS gross_revenue,
  SUM(CASE WHEN status NOT IN ('cancelled','rto_initiated','rto_received','refunded') THEN total ELSE 0 END) AS net_revenue,
  SUM(cogs_total) AS total_cogs,
  AVG(total) AS avg_order_value,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('rto_initiated','rto_received')) / NULLIF(COUNT(*),0), 2) AS rto_rate_pct
FROM orders
GROUP BY date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata')
ORDER BY day DESC;

GRANT SELECT ON order_analytics TO authenticated;
