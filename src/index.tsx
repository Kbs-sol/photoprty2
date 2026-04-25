import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'
import { cors } from 'hono/cors'
import {
  createOrder,
  validateCart,
  validatePincode,
  getQuotaStatus,
  sendEmail,
  createRazorpayOrder,
  createShiprocketOrder,
  getDeliveryPartners,
  verifyRazorpayWebhook,
  verifyGoogleIdToken,
  generateR2UploadUrl,
  dispatchAlertEmail
} from './orderManagementEngine'

const app = new Hono()

// Security headers
app.use('*', async (c, next) => {
  await next()
  c.header('X-Frame-Options', 'SAMEORIGIN')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-XSS-Protection', '1; mode=block')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
})

app.use('/static/*', serveStatic({ root: './' }))
app.use('/api/*', cors())

// ══════════════════════════════════════════════════
//  PRICING MODEL (actual costs → sell prices)
//  ─────────────────────────────────────────────────
//  PRINT COSTS (no frame):
//    A4/Small  ₹30 cost  → sell ₹99   (230% margin)
//    Small     ₹30 cost  → sell ₹199  (563% margin)
//    Medium    ₹50 cost  → sell ₹299  (498% margin)
//
//  STANDARD FRAME (MDF + glass):
//    Small     ₹80 cost  → sell ₹449  (461% margin)
//    Medium    ₹160 cost → sell ₹749  (368% margin)
//    Large     ₹220 cost → sell ₹1099 (399% margin)
//    XL        ₹370 cost → sell ₹1699 (359% margin)
//
//  PREMIUM FRAME (solid wood + museum glass):
//    Small     ₹150 cost → sell ₹599  (299% margin)
//    Medium    ₹240 cost → sell ₹999  (316% margin)
//    Large     ₹370 cost → sell ₹1399 (278% margin)
//    XL        ₹600 cost → sell ₹2199 (266% margin)
//
//  SHIPPING: ₹60 cost, charged ₹0 above ₹799, ₹60 below
//  COD SURCHARGE: ₹49 (covers RTO risk ₹120 avg blended)
//  PACKAGING: ₹35 per order (5-layer + corner guard)
//
//  LAUNCH STRATEGY:
//  ► Category 1: DIVINE & SPIRITUAL  (gifting, emotional, repeat)
//  ► Category 2: MOTIVATIONAL        (offices, students, impulsive)
//  Loss-leader: ₹99 No-Frame poster (print cost ₹30 → margin ₹69)
//               Purpose: low-barrier entry, high upsell potential
// ══════════════════════════════════════════════════

// Pricing matrix for frontend variant selector
const PRICING = {
  noFrame: { 'A4 Small': 99,  'Small (8×12)': 199, 'Medium (12×18)': 299 },
  standard: { 'Small (8×12)': 449, 'Medium (12×18)': 749, 'Large (18×24)': 1099, 'XL (24×36)': 1699 },
  premium:  { 'Small (8×12)': 599, 'Medium (12×18)': 999, 'Large (18×24)': 1399, 'XL (24×36)': 2199 }
}

// Cost matrix for internal margin calculations
const COSTS = {
  noFrame: { 'A4 Small': 30, 'Small (8×12)': 30, 'Medium (12×18)': 50 },
  standard: { 'Small (8×12)': 80, 'Medium (12×18)': 160, 'Large (18×24)': 220, 'XL (24×36)': 370 },
  premium:  { 'Small (8×12)': 150, 'Medium (12×18)': 240, 'Large (18×24)': 370, 'XL (24×36)': 600 }
}

// ── DIVINE & SPIRITUAL PRODUCTS (Launch Category 1) ──────────────────────────
// Rationale: High gifting demand (Diwali, Housewarming, Navratri), low returns,
//            emotional purchase = lower price resistance, high repeat-buy for
//            different deities. Wide pan-India appeal.
const DIVINE_PRODUCTS = [
  {
    id: 101, slug: 'divine-om-mantra-gold-frame',
    name: 'Divine Om Mantra Gold Frame',
    subTitle: 'Sacred Symbol of Peace & Prosperity',
    price: 749, comparePrice: 1299, cost: 160,
    lossFee: 99,  // ₹99 no-frame version (loss-leader entry)
    category: 'divine', badge: '⭐ Top Rated',
    rating: 4.9, reviews: 312,
    image: 'https://images.unsplash.com/photo-1569163139394-de4e5f43e5ca?w=600&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1569163139394-de4e5f43e5ca?w=600&q=80',
      'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=600&q=80',
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80',
    ],
    sizes: ['A4 Small', 'Small (8×12)', 'Medium (12×18)', 'Large (18×24)', 'XL (24×36)'],
    frames: ['No Frame', 'Standard', 'Premium'],
    pricingMatrix: {
      'No Frame': { 'A4 Small': 99, 'Small (8×12)': 199, 'Medium (12×18)': 299 },
      'Standard': { 'Small (8×12)': 449, 'Medium (12×18)': 749, 'Large (18×24)': 1099, 'XL (24×36)': 1699 },
      'Premium':  { 'Small (8×12)': 599, 'Medium (12×18)': 999, 'Large (18×24)': 1399, 'XL (24×36)': 2199 }
    },
    description: 'Infuse your sacred space with divine energy. This premium Om Mantra art print in 24k gold-toned calligraphy radiates peace, prosperity, and spiritual power — a cherished gift for Diwali, housewarmings, and birthdays. Every order includes a ₹99 no-frame poster option — perfect trial size before upgrading.',
    giftMessage: '🪔 Most gifted for Diwali & Housewarming',
    tags: ['spiritual', 'divine', 'om', 'mantra', 'diwali', 'gift', 'housewarming'],
    inStock: true, featured: true,
    upsellBundle: 'Add Lakshmi frame for just ₹449 more (save ₹300)',
    seoKeywords: 'om mantra frame, spiritual photo frame india, divine frame gift'
  },
  {
    id: 102, slug: 'shree-ganesh-blessing-frame',
    name: 'Shree Ganesh Blessing Art Frame',
    subTitle: 'Remover of Obstacles — Auspicious for New Beginnings',
    price: 749, comparePrice: 1299, cost: 160,
    lossFee: 99,
    category: 'divine', badge: '🎁 Gift Favourite',
    rating: 4.9, reviews: 278,
    image: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=600&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=600&q=80',
      'https://images.unsplash.com/photo-1569163139394-de4e5f43e5ca?w=600&q=80',
    ],
    sizes: ['A4 Small', 'Small (8×12)', 'Medium (12×18)', 'Large (18×24)', 'XL (24×36)'],
    frames: ['No Frame', 'Standard', 'Premium'],
    pricingMatrix: {
      'No Frame': { 'A4 Small': 99, 'Small (8×12)': 199, 'Medium (12×18)': 299 },
      'Standard': { 'Small (8×12)': 449, 'Medium (12×18)': 749, 'Large (18×24)': 1099, 'XL (24×36)': 1699 },
      'Premium':  { 'Small (8×12)': 599, 'Medium (12×18)': 999, 'Large (18×24)': 1399, 'XL (24×36)': 2199 }
    },
    description: 'Invoke the blessings of Lord Ganesha in your home, office, or car puja. This vibrant digital artwork rendered in a traditional Pattachitra-inspired style is the most auspicious gift for new offices, new homes, and Navratri. Museum-quality archival print; no fading for 75+ years.',
    giftMessage: '✨ #1 New Office & Housewarming Gift',
    tags: ['ganesh', 'ganesha', 'spiritual', 'divine', 'navratri', 'housewarming', 'gift'],
    inStock: true, featured: true,
    upsellBundle: 'Pair with Om Mantra for ₹449 extra — complete your pooja corner',
    seoKeywords: 'ganesh frame, ganesha photo frame, spiritual gift india'
  },
  {
    id: 103, slug: 'goddess-lakshmi-prosperity-frame',
    name: 'Goddess Lakshmi Prosperity Frame',
    subTitle: 'Bless Your Home with Wealth & Fortune',
    price: 749, comparePrice: 1299, cost: 160,
    lossFee: 99,
    category: 'divine', badge: '🪔 Diwali Special',
    rating: 4.9, reviews: 341,
    image: 'https://images.unsplash.com/photo-1594284222012-7bade13f2c50?w=600&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1594284222012-7bade13f2c50?w=600&q=80',
      'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=600&q=80',
    ],
    sizes: ['A4 Small', 'Small (8×12)', 'Medium (12×18)', 'Large (18×24)', 'XL (24×36)'],
    frames: ['No Frame', 'Standard', 'Premium'],
    pricingMatrix: {
      'No Frame': { 'A4 Small': 99, 'Small (8×12)': 199, 'Medium (12×18)': 299 },
      'Standard': { 'Small (8×12)': 449, 'Medium (12×18)': 749, 'Large (18×24)': 1099, 'XL (24×36)': 1699 },
      'Premium':  { 'Small (8×12)': 599, 'Medium (12×18)': 999, 'Large (18×24)': 1399, 'XL (24×36)': 2199 }
    },
    description: 'Bring Lakshmi Mata\'s blessings into your home this Diwali with this stunning premium art print. The gold-vermillion colour palette is specifically designed to complement Indian home interiors. The single best-selling frame every October-November.',
    giftMessage: '🪔 #1 Diwali Gift — Order Before Oct 15 for Diwali Delivery',
    tags: ['lakshmi', 'diwali', 'spiritual', 'divine', 'gift', 'prosperity', 'goddess'],
    inStock: true, featured: true,
    upsellBundle: 'Complete the trio: Add Ganesha + Om for just ₹799 more (save ₹650)',
    seoKeywords: 'lakshmi frame, diwali gift photo frame, goddess lakshmi print india'
  },
  {
    id: 104, slug: 'maa-durga-navratri-frame',
    name: 'Maa Durga Navratri Power Frame',
    subTitle: 'Fierce Grace — Ward Off Evil, Invite Strength',
    price: 749, comparePrice: 1299, cost: 160,
    lossFee: 99,
    category: 'divine', badge: '🔱 Seasonal Hit',
    rating: 4.8, reviews: 198,
    image: 'https://images.unsplash.com/photo-1631375672284-4a53ef20d7b5?w=600&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1631375672284-4a53ef20d7b5?w=600&q=80',
    ],
    sizes: ['A4 Small', 'Small (8×12)', 'Medium (12×18)', 'Large (18×24)', 'XL (24×36)'],
    frames: ['No Frame', 'Standard', 'Premium'],
    pricingMatrix: {
      'No Frame': { 'A4 Small': 99, 'Small (8×12)': 199, 'Medium (12×18)': 299 },
      'Standard': { 'Small (8×12)': 449, 'Medium (12×18)': 749, 'Large (18×24)': 1099, 'XL (24×36)': 1699 },
      'Premium':  { 'Small (8×12)': 599, 'Medium (12×18)': 999, 'Large (18×24)': 1399, 'XL (24×36)': 2199 }
    },
    description: 'Celebrate the divine feminine power of Maa Durga. This vibrant Navratri special print captures her fierce grace in rich crimson and gold. High-demand during Navratri, Dussehra, and Durga Puja seasons.',
    giftMessage: '🔱 Navratri & Durga Puja Season Bestseller',
    tags: ['durga', 'navratri', 'dussehra', 'spiritual', 'divine', 'goddess'],
    inStock: true, featured: false,
    upsellBundle: 'Add Lakshmi + Ganesha — complete divine trio for ₹799 extra',
    seoKeywords: 'durga frame, navratri photo frame, maa durga print india'
  },
  {
    id: 105, slug: 'divine-pooja-corner-triptych',
    name: 'Divine Pooja Corner Triptych Set',
    subTitle: 'Complete 3-Frame Set for Your Pooja Room',
    price: 1799, comparePrice: 2997, cost: 480,
    lossFee: null,
    category: 'divine', badge: '🔥 Best Value',
    rating: 4.9, reviews: 142,
    image: 'https://images.unsplash.com/photo-1569163139394-de4e5f43e5ca?w=600&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1569163139394-de4e5f43e5ca?w=600&q=80',
      'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=600&q=80',
      'https://images.unsplash.com/photo-1594284222012-7bade13f2c50?w=600&q=80',
    ],
    sizes: ['Small Set (8×12 each)', 'Medium Set (12×18 each)'],
    frames: ['Standard', 'Premium'],
    pricingMatrix: {
      'Standard': { 'Small Set (8×12 each)': 1199, 'Medium Set (12×18 each)': 1799 },
      'Premium':  { 'Small Set (8×12 each)': 1599, 'Medium Set (12×18 each)': 2499 }
    },
    description: 'The complete pooja room upgrade. Includes Ganesha + Lakshmi + Om Mantra in a matching frame set. Save ₹1,198 vs buying individually. Most gifted housewarming set — includes premium gift box and greeting card (₹150 value). Orders ship as a single beautifully packaged gift.',
    giftMessage: '🎁 Includes Premium Gift Box + Greeting Card (₹150 Value)',
    tags: ['bundle', 'set', 'divine', 'triptych', 'pooja', 'housewarming', 'gift'],
    inStock: true, featured: true,
    upsellBundle: null,
    seoKeywords: 'pooja room frames set, divine triptych frame, housewarming gift frame set india'
  }
]

// ── MOTIVATIONAL PRODUCTS (Launch Category 2) ────────────────────────────────
// Rationale: Broad appeal (students, WFH, offices), impulsive buy (<₹600),
//            easy digital content on Instagram, repeat gifting for birthdays.
//            Low return rate (no personalisation expectations).
const MOTIVATIONAL_PRODUCTS = [
  {
    id: 201, slug: 'stay-hungry-stay-foolish-frame',
    name: '"Stay Hungry, Stay Foolish" Frame',
    subTitle: 'Steve Jobs — The Quote That Changed Everything',
    price: 449, comparePrice: 899, cost: 80,
    lossFee: 99,
    category: 'motivational', badge: '🔥 #1 Bestseller',
    rating: 4.9, reviews: 412,
    image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&q=80',
      'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&q=80',
    ],
    sizes: ['A4 Small', 'Small (8×12)', 'Medium (12×18)', 'Large (18×24)'],
    frames: ['No Frame', 'Standard', 'Premium'],
    pricingMatrix: {
      'No Frame': { 'A4 Small': 99, 'Small (8×12)': 199, 'Medium (12×18)': 299 },
      'Standard': { 'Small (8×12)': 449, 'Medium (12×18)': 749, 'Large (18×24)': 1099 },
      'Premium':  { 'Small (8×12)': 599, 'Medium (12×18)': 999, 'Large (18×24)': 1399 }
    },
    description: 'The most iconic motivational quote of all time, in a minimalist premium typography print that looks razor-sharp on your desk or wall. Every entrepreneur, student, and hustler needs this. Bold black/white with gold accent. Printed on premium 200gsm matte art paper.',
    giftMessage: '🎓 Perfect Birthday Gift for Entrepreneurs & Students',
    tags: ['motivational', 'typography', 'hustle', 'office', 'student', 'startup', 'steve jobs'],
    inStock: true, featured: true,
    upsellBundle: 'Add "Do What You Love" for ₹299 more — desk duo deal',
    seoKeywords: 'stay hungry stay foolish frame, motivational frame india, typography poster frame'
  },
  {
    id: 202, slug: 'do-what-you-love-frame',
    name: '"Do What You Love" Minimal Frame',
    subTitle: 'Bold. Clean. Powerful. For Every Desk & Wall.',
    price: 449, comparePrice: 799, cost: 80,
    lossFee: 99,
    category: 'motivational', badge: '⭐ New Arrival',
    rating: 4.8, reviews: 156,
    image: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&q=80',
      'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&q=80',
    ],
    sizes: ['A4 Small', 'Small (8×12)', 'Medium (12×18)', 'Large (18×24)'],
    frames: ['No Frame', 'Standard', 'Premium'],
    pricingMatrix: {
      'No Frame': { 'A4 Small': 99, 'Small (8×12)': 199, 'Medium (12×18)': 299 },
      'Standard': { 'Small (8×12)': 449, 'Medium (12×18)': 749, 'Large (18×24)': 1099 },
      'Premium':  { 'Small (8×12)': 599, 'Medium (12×18)': 999, 'Large (18×24)': 1399 }
    },
    description: 'Three powerful words that reshape your entire workday. Clean sans-serif typography on premium cream art stock with a subtle watercolour wash background. Perfect for WFH setups, home offices, and dorm rooms. Instantly elevates any workspace.',
    giftMessage: '💼 WFH Upgrade & Graduation Gift',
    tags: ['motivational', 'typography', 'office', 'wfh', 'desk', 'love', 'work'],
    inStock: true, featured: true,
    upsellBundle: 'Bundle with "Stay Hungry" for ₹299 extra — matching desk duo',
    seoKeywords: 'do what you love frame, motivational poster frame, home office wall art india'
  },
  {
    id: 203, slug: 'hustle-hard-dream-big-frame',
    name: '"Hustle Hard, Dream Big" Frame',
    subTitle: 'For the Grinders Who Never Stop',
    price: 449, comparePrice: 799, cost: 80,
    lossFee: 99,
    category: 'motivational', badge: '💪 Hustler Pick',
    rating: 4.8, reviews: 234,
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80',
    ],
    sizes: ['A4 Small', 'Small (8×12)', 'Medium (12×18)', 'Large (18×24)'],
    frames: ['No Frame', 'Standard', 'Premium'],
    pricingMatrix: {
      'No Frame': { 'A4 Small': 99, 'Small (8×12)': 199, 'Medium (12×18)': 299 },
      'Standard': { 'Small (8×12)': 449, 'Medium (12×18)': 749, 'Large (18×24)': 1099 },
      'Premium':  { 'Small (8×12)': 599, 'Medium (12×18)': 999, 'Large (18×24)': 1399 }
    },
    description: 'Fire up your hustle with this raw, bold typography print on a dramatic dark gradient. Popular in coaching centres, start-up offices, and student hostels across India. The gold metallic ink accents catch the light — extremely photogenic on Instagram.',
    giftMessage: '🚀 Most Gifted for 18-24 Year Old Entrepreneurs',
    tags: ['hustle', 'motivational', 'startup', 'dream', 'office', 'grind'],
    inStock: true, featured: true,
    upsellBundle: 'Add "Stay Hungry" for a 3-piece motivational wall — ₹249 extra',
    seoKeywords: 'hustle hard dream big frame, motivational wall art india, startup office decor'
  },
  {
    id: 204, slug: 'motivational-3-pack-office-bundle',
    name: 'Motivational 3-Pack Office Bundle',
    subTitle: 'Complete Your Desk Wall in One Order',
    price: 999, comparePrice: 1797, cost: 240,
    lossFee: null,
    category: 'motivational', badge: '💰 Best Value',
    rating: 4.9, reviews: 87,
    image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&q=80',
      'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&q=80',
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80',
    ],
    sizes: ['Small Set (8×12 each)', 'Medium Set (12×18 each)'],
    frames: ['Standard', 'Premium'],
    pricingMatrix: {
      'Standard': { 'Small Set (8×12 each)': 999, 'Medium Set (12×18 each)': 1699 },
      'Premium':  { 'Small Set (8×12 each)': 1299, 'Medium Set (12×18 each)': 2199 }
    },
    description: 'The complete motivational wall transformation kit. Includes "Stay Hungry", "Do What You Love", and "Hustle Hard" in matching frames. Shipped as a curated wall kit with layout guide included. Save ₹798 vs buying individually. Most gifted for office setups and new joiners.',
    giftMessage: '🎁 Best Gift for New Job, Graduation & Hostel Movers',
    tags: ['bundle', 'set', 'motivational', 'office', 'desk', '3-pack'],
    inStock: true, featured: true,
    upsellBundle: null,
    seoKeywords: 'motivational frame bundle, office wall art set india, 3 piece motivational poster set'
  }
]

// ── AUTOMOTIVE PRODUCTS (Launch Category 3) ──────────────────────────────────
// Rationale: Car enthusiasts are passionate buyers, high ASP (₹749-₹1699),
//            gifting for birthdays (car lovers), office decor for auto businesses.
//            Low competition in D2C photo frame space. India is world's 3rd largest
//            auto market — huge TAM.
const AUTOMOTIVE_PRODUCTS = [
  {
    id: 301, slug: 'supercars-wall-art-frame',
    name: 'Supercar Dreams Wall Art Frame',
    subTitle: 'Lamborghini · Ferrari · McLaren — Ultimate Speed Icons',
    price: 749, comparePrice: 1399, cost: 160,
    lossFee: 99, isHidden: false,
    category: 'automotive', badge: '🚗 Speed Legends',
    rating: 4.9, reviews: 187,
    image: 'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=600&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=600&q=80',
      'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&q=80',
    ],
    sizes: ['A4 Small', 'Small (8×12)', 'Medium (12×18)', 'Large (18×24)', 'XL (24×36)'],
    frames: ['No Frame', 'Standard', 'Premium'],
    pricingMatrix: {
      'No Frame': { 'A4 Small': 99, 'Small (8×12)': 199, 'Medium (12×18)': 299 },
      'Standard': { 'Small (8×12)': 449, 'Medium (12×18)': 749, 'Large (18×24)': 1099, 'XL (24×36)': 1699 },
      'Premium':  { 'Small (8×12)': 599, 'Medium (12×18)': 999, 'Large (18×24)': 1399, 'XL (24×36)': 2199 }
    },
    description: 'Celebrate the world\'s most iconic supercars in a stunning collage art print. Lamborghini Huracán, Ferrari SF90, McLaren 720S — curated for the true speed enthusiast. Premium archival print on 200gsm matte art paper. The ultimate garage or office wall statement.',
    giftMessage: '🏎️ Perfect Birthday Gift for Car Enthusiasts',
    tags: ['automotive', 'supercar', 'ferrari', 'lamborghini', 'speed', 'garage', 'gift'],
    inStock: true, featured: true,
    upsellBundle: 'Add Royal Enfield Legends for ₹449 more — complete your garage wall',
    seoKeywords: 'supercar wall art frame india, car photo frame, ferrari lamborghini poster india'
  },
  {
    id: 302, slug: 'royal-enfield-legends-frame',
    name: 'Royal Enfield Legends Tribute Frame',
    subTitle: 'Born Like a Gun — Made Like a Gun',
    price: 749, comparePrice: 1299, cost: 160,
    lossFee: 99, isHidden: false,
    category: 'automotive', badge: '🏍️ Biker Favourite',
    rating: 4.9, reviews: 312,
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80',
      'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=600&q=80',
    ],
    sizes: ['A4 Small', 'Small (8×12)', 'Medium (12×18)', 'Large (18×24)', 'XL (24×36)'],
    frames: ['No Frame', 'Standard', 'Premium'],
    pricingMatrix: {
      'No Frame': { 'A4 Small': 99, 'Small (8×12)': 199, 'Medium (12×18)': 299 },
      'Standard': { 'Small (8×12)': 449, 'Medium (12×18)': 749, 'Large (18×24)': 1099, 'XL (24×36)': 1699 },
      'Premium':  { 'Small (8×12)': 599, 'Medium (12×18)': 999, 'Large (18×24)': 1399, 'XL (24×36)': 2199 }
    },
    description: 'A tribute to the cult icon of Indian roads. Royal Enfield Bullet silhouette in dramatic chiaroscuro — chrome meets soul. India\'s most beloved motorcycle, rendered in museum-quality art print. Mandatory for every RE rider\'s garage, man cave, or office.',
    giftMessage: '🏍️ #1 Gift for Royal Enfield Riders',
    tags: ['royal enfield', 'motorcycle', 'bike', 'india', 'bullet', 'rider', 'gift'],
    inStock: true, featured: true,
    upsellBundle: 'Add Supercar Dreams for ₹449 extra — the ultimate speed duo',
    seoKeywords: 'royal enfield frame, motorcycle photo frame india, bike wall art'
  },
  {
    id: 303, slug: 'bmw-audi-luxury-car-frame',
    name: 'German Engineering Luxury Frame',
    subTitle: 'BMW M Series · Audi RS · Mercedes AMG',
    price: 749, comparePrice: 1299, cost: 160,
    lossFee: 99, isHidden: false,
    category: 'automotive', badge: '⚡ German Power',
    rating: 4.8, reviews: 143,
    image: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=600&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=600&q=80',
      'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=600&q=80',
    ],
    sizes: ['A4 Small', 'Small (8×12)', 'Medium (12×18)', 'Large (18×24)', 'XL (24×36)'],
    frames: ['No Frame', 'Standard', 'Premium'],
    pricingMatrix: {
      'No Frame': { 'A4 Small': 99, 'Small (8×12)': 199, 'Medium (12×18)': 299 },
      'Standard': { 'Small (8×12)': 449, 'Medium (12×18)': 749, 'Large (18×24)': 1099, 'XL (24×36)': 1699 },
      'Premium':  { 'Small (8×12)': 599, 'Medium (12×18)': 999, 'Large (18×24)': 1399, 'XL (24×36)': 2199 }
    },
    description: 'The holy trinity of German automotive excellence. BMW M3 Competition, Audi RS6, Mercedes-AMG GT — three machines that define the art of performance. Dark dramatic background with gold accent highlights. Perfect for the luxury car enthusiast.',
    giftMessage: '⚡ Perfect for Luxury Car Aspirants',
    tags: ['bmw', 'audi', 'mercedes', 'luxury car', 'german', 'automotive', 'amg'],
    inStock: true, featured: false,
    upsellBundle: 'Add the Supercar Dreams frame for ₹449 more — wall of speed',
    seoKeywords: 'bmw frame india, luxury car wall art, german car poster india'
  },
  {
    id: 304, slug: 'car-enthusiast-3-pack-bundle',
    name: 'Car Enthusiast 3-Pack Garage Bundle',
    subTitle: 'Supercars + Royal Enfield + German Power',
    price: 999, comparePrice: 1797, cost: 240,
    lossFee: null, isHidden: false,
    category: 'automotive', badge: '🔥 Garage Kit',
    rating: 4.9, reviews: 67,
    image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&q=80',
      'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=600&q=80',
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80',
    ],
    sizes: ['Small Set (8×12 each)', 'Medium Set (12×18 each)'],
    frames: ['Standard', 'Premium'],
    pricingMatrix: {
      'Standard': { 'Small Set (8×12 each)': 999, 'Medium Set (12×18 each)': 1699 },
      'Premium':  { 'Small Set (8×12 each)': 1299, 'Medium Set (12×18 each)': 2199 }
    },
    description: 'Transform any garage, home office, or man cave with the complete car enthusiast wall kit. Includes Supercar Dreams + Royal Enfield Legends + German Engineering in matching frames. Ships as a curated wall kit with layout guide. Save ₹798 vs individual purchase.',
    giftMessage: '🎁 Ultimate Birthday Gift for Car Lovers',
    tags: ['bundle', 'set', 'automotive', 'garage', 'car', '3-pack'],
    inStock: true, featured: true,
    upsellBundle: null,
    seoKeywords: 'car wall art bundle india, garage decor frame set, automotive gift india'
  }
]

// Combined catalog with all products
const PRODUCTS = [
  ...DIVINE_PRODUCTS,
  ...MOTIVATIONAL_PRODUCTS,
  ...AUTOMOTIVE_PRODUCTS,
  // Keep legacy products for SEO continuity
  {
    id: 3, slug: 'minimalist-city-skyline-wall-art',
    name: 'Minimalist City Skyline Wall Art',
    price: 749, comparePrice: 1299, cost: 160,
    category: 'wall-art', badge: 'New Arrival',
    rating: 4.7, reviews: 94,
    image: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=600&q=80',
    galleryImages: ['https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=600&q=80'],
    sizes: ['Small (8×12)', 'Medium (12×18)', 'Large (18×24)', 'XL (24×36)'],
    frames: ['Standard', 'Premium'],
    pricingMatrix: {
      'Standard': { 'Small (8×12)': 449, 'Medium (12×18)': 749, 'Large (18×24)': 1099, 'XL (24×36)': 1699 },
      'Premium':  { 'Small (8×12)': 599, 'Medium (12×18)': 999, 'Large (18×24)': 1399, 'XL (24×36)': 2199 }
    },
    description: 'A bold architectural statement for modern homes.',
    giftMessage: '🏙️ Modern Home Office Statement Piece',
    tags: ['city', 'skyline', 'minimalist', 'architecture'],
    inStock: true, featured: false, upsellBundle: null
  },
  {
    id: 5, slug: 'couple-love-custom-photo-frame',
    name: 'Romantic Couple Love Custom Photo Frame',
    price: 849, comparePrice: 1499, cost: 240,
    category: 'gifts', badge: 'Gift Favourite',
    rating: 4.8, reviews: 156,
    image: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=600&q=80',
    galleryImages: ['https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=600&q=80'],
    sizes: ['Small (8×12)', 'Medium (12×18)', 'Large (18×24)'],
    frames: ['Standard', 'Premium'],
    pricingMatrix: {
      'Standard': { 'Small (8×12)': 449, 'Medium (12×18)': 749, 'Large (18×24)': 1099 },
      'Premium':  { 'Small (8×12)': 599, 'Medium (12×18)': 999, 'Large (18×24)': 1399 }
    },
    description: 'Preserve your most precious moments forever. Upload your favourite photo and receive a premium museum-quality print.',
    giftMessage: '💕 Best Anniversary & Valentine\'s Gift',
    tags: ['couple', 'custom', 'personalised', 'gift', 'anniversary'],
    inStock: true, featured: true, upsellBundle: null
  },
  {
    id: 8, slug: 'sports-cricket-legends-frame',
    name: 'Cricket Legends Collage Photo Frame',
    price: 799, comparePrice: 1399, cost: 160,
    category: 'sports', badge: 'Fan Favourite',
    rating: 4.8, reviews: 201,
    image: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=600&q=80',
    galleryImages: ['https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=600&q=80'],
    sizes: ['Small (8×12)', 'Medium (12×18)', 'Large (18×24)', 'XL (24×36)'],
    frames: ['Standard', 'Premium'],
    pricingMatrix: {
      'Standard': { 'Small (8×12)': 449, 'Medium (12×18)': 749, 'Large (18×24)': 1099, 'XL (24×36)': 1699 },
      'Premium':  { 'Small (8×12)': 599, 'Medium (12×18)': 999, 'Large (18×24)': 1399, 'XL (24×36)': 2199 }
    },
    description: 'A tribute to India\'s greatest cricket heroes. Premium collage frame featuring iconic cricketing moments.',
    giftMessage: '🏏 Perfect Cricket Fan Birthday Gift',
    tags: ['cricket', 'sports', 'india', 'fan', 'gift'],
    inStock: true, featured: true, upsellBundle: null
  }
]

const CATEGORIES = [
  { slug: 'divine', name: 'Divine & Spiritual', desc: 'Sacred frames for your sacred space — Ganesh, Lakshmi, Om, Durga', emoji: '🕉️', count: 5, launch: true },
  { slug: 'motivational', name: 'Motivational', desc: 'Fuel your daily hustle — bold typography for offices & study rooms', emoji: '💪', count: 4, launch: true },
  { slug: 'automotive', name: 'Automotive', desc: 'Supercars, bikes & speed legends for the true enthusiast', emoji: '🚗', count: 4, launch: true },
  { slug: 'sports', name: 'Sports & Teams', desc: 'Celebrate your sporting passion — cricket, football & more', emoji: '🏏', count: 2 },
  { slug: 'wall-art', name: 'Wall Art', desc: 'Transform bare walls into gallery masterpieces', emoji: '🎨', count: 1 },
  { slug: 'gifts', name: 'Gifts & Custom', desc: 'Personalised frames they\'ll love forever', emoji: '🎁', count: 1 },
  { slug: 'vintage', name: 'Vintage & Retro', desc: 'Timeless classics with nostalgic charm', emoji: '🎞️', count: 0 },
  { slug: 'abstract', name: 'Abstract & Modern', desc: 'Bold designs for modern spaces', emoji: '🖼️', count: 0 },
  { slug: 'kids', name: 'Kids & Nursery', desc: 'Magical prints for little dreamers', emoji: '🌈', count: 0 }
]

const BLOG_POSTS = [
  {
    slug: 'best-divine-frames-diwali-housewarming-gift-india',
    title: 'Best Divine Photo Frames for Diwali & Housewarming Gifts India 2025',
    excerpt: 'Ganesh, Lakshmi, Om, Durga — the complete guide to choosing the most auspicious spiritual frame gifts for Diwali, housewarmings, and Navratri in India.',
    category: 'Gift Guide',
    date: '2026-04-10',
    readTime: '6 min read',
    image: 'https://images.unsplash.com/photo-1569163139394-de4e5f43e5ca?w=800&q=80',
    content: `<h2>Why Divine Photo Frames Are India's #1 Gifting Category</h2>
<p>In India, gifting a religious or spiritual frame is never just a gift — it is a blessing. Whether you are attending a housewarming, celebrating Diwali, or gifting during Navratri, a premium divine frame conveys reverence, warmth, and lasting meaning.</p>
<h3>The Top Divine Frames to Gift in 2025</h3>
<ul>
<li><strong>Om Mantra Frame:</strong> Universally beloved — suitable for any Hindu home regardless of sect or regional tradition. Gold typography on a black matte background. Our most-gifted item.</li>
<li><strong>Ganesh Blessing Frame:</strong> The ideal gift for new offices, business launches, and new homes. Ganesha is the remover of obstacles — the most universally auspicious deity.</li>
<li><strong>Lakshmi Prosperity Frame:</strong> Diwali's most requested frame. The goddess of wealth and prosperity in a rich gold and vermillion colour palette.</li>
<li><strong>Durga Power Frame:</strong> Rising fast during Navratri and Durga Puja. Especially popular in West Bengal, UP, and Maharashtra.</li>
</ul>
<h3>Frame Type Recommendation for Divine Gifts</h3>
<p>For gifts, always choose <strong>Standard Frame (₹749 for Medium)</strong> minimum — the Premium Frame (₹999 for Medium) with its solid wood and museum glass is the gold standard for any gifting occasion above ₹500.</p>
<p>Our ₹99 no-frame print is perfect as a try-before-you-upgrade option — start with the print, and order the framed version when you see how beautiful it looks.</p>
<h3>Bundle Value: The Divine Triptych Set</h3>
<p>Our best value is the <strong>Divine Pooja Corner Triptych Set (₹1,799)</strong> — includes Ganesh + Lakshmi + Om in matching Standard frames. Saves ₹1,198 vs individual purchase and ships in a premium gift box.</p>`
  },
  {
    slug: 'motivational-frames-home-office-wfh-india',
    title: 'Best Motivational Photo Frames for Home Office & WFH Setups India 2025',
    excerpt: 'Transform your WFH desk with premium motivational typography frames. Curated picks for Indian home offices, study rooms, and startup offices.',
    category: 'Buying Guide',
    date: '2026-04-05',
    readTime: '5 min read',
    image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&q=80',
    content: `<h2>Why Your WFH Setup Needs a Motivational Frame</h2>
<p>Studies show that visual cues in your workspace directly impact productivity and mood. A powerful motivational typography print on your wall or desk creates a daily reminder of your goals — and signals to your Zoom call background that you mean business.</p>
<h3>The 3 Types of Motivational Frames That Actually Work</h3>
<ul>
<li><strong>Minimalist Typography (Black/White):</strong> Timeless and professional. "Stay Hungry, Stay Foolish" is the most universally resonant quote for Indian entrepreneurs and students.</li>
<li><strong>Bold Dark Theme:</strong> High contrast, photogenic for Instagram, great for dorm rooms and startup offices. "Hustle Hard, Dream Big" falls in this category.</li>
<li><strong>Inspirational Action Quote:</strong> Lighter, positive energy — "Do What You Love" works beautifully in creative spaces and home offices.</li>
</ul>
<h3>Size Guide for Home Office Frames</h3>
<p>For a desk top or shelf: <strong>A4 (₹99 no-frame / ₹449 Standard)</strong> — looks great leaning against a wall or in a book stand.</p>
<p>For a wall behind your chair (Zoom background): <strong>Medium (12×18) Standard Frame at ₹749</strong> — creates a clean, professional backdrop.</p>
<h3>Best Gift for Students & New Employees</h3>
<p>Our <strong>Motivational 3-Pack Bundle (₹999)</strong> is the highest-rated birthday and graduation gift — three matching small frames that transform any desk wall, at a price that saves ₹798 vs individual purchase.</p>`
  },
  {
    slug: 'how-to-choose-right-photo-frame-size-for-your-wall',
    title: 'How to Choose the Right Photo Frame Size for Your Wall',
    excerpt: 'A complete beginner\'s guide to selecting the perfect frame size for every room — from bedroom accent walls to living room gallery grids.',
    category: 'Buying Guide',
    date: '2026-04-01',
    readTime: '6 min read',
    image: 'https://images.unsplash.com/photo-1581428982868-e410dd047a90?w=800&q=80',
    content: `<h2>Why Frame Size Matters More Than You Think</h2>
<p>Choosing the wrong frame size is the #1 mistake homeowners make when decorating their walls. Too small and the artwork gets lost. Too large and it overwhelms the room. Here's your definitive guide.</p>
<h3>The Golden Rule of Wall Art Sizing</h3>
<p>Your artwork should cover <strong>60-75% of the wall space</strong> above furniture. For a 90cm sofa, your art arrangement should span 54-67cm wide.</p>
<h3>Room-by-Room Size Guide</h3>
<ul>
<li><strong>Bedroom (above headboard):</strong> Large (18×24) or XL (24×36)</li>
<li><strong>Living Room (above sofa):</strong> XL or a gallery wall of 3-5 Medium prints</li>
<li><strong>Home Office / WFH Desk:</strong> Medium (12×18) or Small (8×12)</li>
<li><strong>Hallway:</strong> Small to Medium, portrait orientation</li>
<li><strong>Pooja Corner:</strong> Small (8×12) Standard or Premium for a dignified look</li>
</ul>
<h3>Our Size Pricing Quick Reference</h3>
<p><strong>Trial (₹99):</strong> A4 No-Frame print — test before committing to a frame. Perfect for trying a design in your space.</p>
<p><strong>Starter (₹449):</strong> Small Standard Frame — desk, shelf, or small wall. Our most popular entry point.</p>
<p><strong>Statement (₹749):</strong> Medium Standard Frame — the sweet spot for most Indian homes.</p>
<p><strong>Gallery Anchor (₹1,099+):</strong> Large Standard or Premium — the centrepiece of any gallery wall.</p>`
  },
  {
    slug: 'top-10-wall-art-ideas-for-indian-homes-2025',
    title: 'Top 10 Wall Art Ideas for Indian Homes in 2025',
    excerpt: 'From divine pooja corners to bold motivational walls — discover the wall art trends transforming Indian homes in 2025.',
    category: 'Inspiration',
    date: '2026-03-15',
    readTime: '8 min read',
    image: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80',
    content: `<h2>The Wall Art Trends Shaping Indian Homes in 2025</h2>
<p>Indian home décor is undergoing a renaissance. Gone are the days of generic calendar art — today's urban homeowner wants pieces that tell a story.</p>
<h3>1. The Divine Pooja Corner Gallery</h3>
<p>A dedicated pooja corner wall with 3-5 framed divine prints in matching frames is the #1 home décor upgrade in Indian homes. Ganesh + Lakshmi + Om as a triptych is the most-shared interior on Instagram India.</p>
<h3>2. The Motivational Home Office Wall</h3>
<p>WFH culture has made motivational typography walls the fastest-growing décor category. The key: matching frames, consistent typography style, clean spacing.</p>
<h3>3. Dark Luxury Maximalism</h3>
<p>Deep navy, forest green, and charcoal walls paired with gold-toned art frames. This trend exploded in Tier 1 cities and is spreading rapidly.</p>
<h3>4. Regional Heritage Art</h3>
<p>Madhubani, Warli, Kalamkari, and Pattachitra digital reproductions in premium frames.</p>
<h3>5. Custom Memory Galleries</h3>
<p>Personalised multi-photo collage frames for weddings, anniversaries, and housewarmings.</p>`
  },
  {
    slug: 'best-photo-frame-gift-ideas-india',
    title: 'Best Photo Frame Gift Ideas for Every Occasion in India',
    excerpt: 'Wedding, birthday, anniversary, housewarming — the perfect framed art gift for every occasion and every budget.',
    category: 'Gift Guide',
    date: '2026-02-20',
    readTime: '5 min read',
    image: 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=800&q=80',
    content: `<h2>Why Photo Frames Make the Best Gifts in India</h2>
<p>In an age of digital everything, a beautifully framed piece stands out as a deeply personal, lasting gift. For Indian families, frames have cultural and spiritual resonance that no digital gift can replicate.</p>
<h3>Housewarming Gift: Divine Triptych Set (₹1,799)</h3>
<p>Our most gifted set — Ganesh + Lakshmi + Om in matching Standard frames. Covers all auspicious bases. Ships in a premium gift box. Price: ₹1,199-₹1,799.</p>
<h3>Birthday Gift: Motivational 3-Pack (₹999)</h3>
<p>For the entrepreneur, student, or professional in your life. Three matching motivational prints that transform any desk wall. Most popular with 18-30 age group.</p>
<h3>Diwali Gift: Lakshmi Prosperity Frame (₹749)</h3>
<p>The single most appropriate Diwali gift — Lakshmi in gold and vermillion, framed in our Standard or Premium frame. Order before Oct 15 for guaranteed Diwali delivery.</p>
<h3>Anniversary Gift: Romantic Custom Frame (₹849+)</h3>
<p>Upload your couple photo for a museum-quality custom print in a premium wooden frame. Truly unique, deeply personal.</p>`
  },
  {
    slug: 'gallery-wall-ideas-indian-living-room',
    title: '7 Stunning Gallery Wall Ideas for Your Indian Living Room',
    excerpt: 'Create a jaw-dropping gallery wall in your Indian living room with these expert-curated layout formulas and frame mix ideas.',
    category: 'Inspiration',
    date: '2025-11-05',
    readTime: '7 min read',
    image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80',
    content: `<h2>Gallery Walls: The Biggest Interior Design Trend in Indian Homes</h2>
<p>Gallery walls have taken Indian homes by storm — versatile, personal, and dramatically transformative.</p>
<h3>Layout 1: The Divine Corner (Most Popular in India)</h3>
<p>3 divine frames in a vertical column above the puja shelf. Ganesh at top, Om in centre, Lakshmi at base. All Medium Standard frames (₹749 each = ₹2,247 or ₹1,799 as bundle).</p>
<h3>Layout 2: The Motivational Desk Wall</h3>
<p>3 small motivational frames horizontally above your desk. All matching Standard frames for a clean, professional look.</p>
<h3>Layout 3: The Classic Grid</h3>
<p>9 uniform A4 prints in a 3×3 grid — all matching frame style. Works beautifully with 9 different divine prints for a sacred gallery wall.</p>
<h3>Layout 4: The Asymmetric Cascade</h3>
<p>One Large anchor frame surrounded by 4 Small frames. Mix divine and motivational for a dynamic living room feature wall.</p>`
  }
]

const FAQS = [
  { q: 'What is the ₹99 poster — is it real?', a: 'Yes! Our ₹99 No-Frame A4 print is a real, full-quality archival print shipped flat in a rigid protective envelope. It\'s our way of letting you try before you commit to a framed version. Print cost to us is ₹30, so yes — it\'s a loss-leader and we\'re okay with that because 67% of ₹99 buyers come back for a Standard Frame within 30 days.' },
  { q: 'How long does delivery take?', a: 'We dispatch all in-stock orders within 12 hours of confirmation. Delivery takes 3-5 business days across India, and 1-2 days within Hyderabad for Express orders. Tracking is sent via SMS and WhatsApp.' },
  { q: 'What happens if my frame arrives damaged?', a: 'We use 5-layer protective packaging with corner protectors. If your frame arrives damaged, record a short unboxing video showing the damage — we will replace it completely free, no questions asked. This is our Dispute Shield guarantee.' },
  { q: 'Is Cash on Delivery (COD) available?', a: 'Yes! COD is available for orders between ₹299 and ₹1,999. A ₹49 handling fee applies to COD orders. You will receive a WhatsApp confirmation within 24 hours — please respond "CONFIRM" to confirm your order. Unconfirmed COD orders are auto-cancelled after 24 hours to protect delivery slots.' },
  { q: 'Why should I choose Prepaid over COD?', a: 'Prepaid saves you ₹49 COD fee. Plus you get priority dispatch (within 6 hours vs 12 for COD) and are eligible for our ₹50 prepaid cashback on orders above ₹599. Most importantly, prepaid orders get locked in immediately — no risk of cancellation.' },
  { q: 'What is the difference between Standard and Premium frames?', a: 'Standard Frame: Quality MDF wood-effect frame with clear glass. 6mm profile. Perfect for everyday décor and gifting up to ₹1,000. Premium Frame: Solid kiln-dried wood, 12mm deep profile, museum-quality UV-protective glass. Archival-safe — prints won\'t fade for 75+ years. Recommended for statement pieces and premium gifts.' },
  { q: 'Do you offer bulk or corporate orders?', a: 'Yes! Corporate orders of 10+ frames receive 15-25% discount. We have fulfilled orders for offices, hotels, and event décor. WhatsApp us at +91 79895 31818 or email bulk@photoframein.com for a same-day quote.' },
  { q: 'What is your return policy?', a: 'We accept returns within 7 days for standard products (unused, original packaging). Custom/personalised frames are non-returnable. Damaged items are replaced free with unboxing video proof. No-frame (print only) returns accepted if print is undamaged and in original flat mailer.' }
]

// ══════════════════════════════════════════════════
// API ROUTES
// ══════════════════════════════════════════════════

app.get('/api/products', (c) => {
  const category = c.req.query('category')
  const sort = c.req.query('sort') || 'featured'
  const includeHidden = c.req.query('include_hidden') === 'true'  // Admin use only
  let products = [...PRODUCTS]
  // Hide isHidden (loss-leader ₹99 only) products from main shop grid
  if (!includeHidden) products = products.filter(p => !(p as any).isHidden)
  if (category) products = products.filter(p => p.category === category)
  if (sort === 'price_low') products.sort((a, b) => a.price - b.price)
  else if (sort === 'price_high') products.sort((a, b) => b.price - a.price)
  else if (sort === 'rating') products.sort((a, b) => b.rating - a.rating)
  else products.sort((a, b) => ((b as any).featured ? 1 : 0) - ((a as any).featured ? 1 : 0))
  return c.json({ products, total: products.length })
})

app.get('/api/products/featured', (c) => {
  return c.json({ products: PRODUCTS.filter(p => (p as any).featured) })
})

app.get('/api/products/:slug', (c) => {
  const slug = c.req.param('slug')
  const product = PRODUCTS.find(p => p.slug === slug)
  if (!product) return c.json({ error: 'Not found' }, 404)
  const related = PRODUCTS.filter(p => p.category === product.category && p.id !== product.id).slice(0, 4)
  return c.json({ product, related })
})

app.get('/api/categories', (c) => {
  return c.json({ categories: CATEGORIES })
})

app.get('/api/blog', (c) => {
  return c.json({ posts: BLOG_POSTS.map(({ content: _c, ...p }) => p) })
})

app.get('/api/blog/:slug', (c) => {
  const slug = c.req.param('slug')
  const post = BLOG_POSTS.find(p => p.slug === slug)
  if (!post) return c.json({ error: 'Not found' }, 404)
  return c.json({ post })
})

app.get('/api/faq', (c) => {
  return c.json({ faq: FAQS })
})

app.get('/api/pricing', (c) => {
  return c.json({ pricing: PRICING, costs: COSTS })
})

app.post('/api/leads', async (c) => {
  return c.json({ success: true, message: 'Thank you! Your 10% off code: FRAME10 — valid for 24 hours.' })
})

app.post('/api/orders/create', async (c) => {
  const body = await c.req.json()

  // Use the full order management engine if Supabase/Razorpay configured
  const env = c.env as any
  if (env?.RAZORPAY_KEY_ID || env?.SUPABASE_URL) {
    try {
      const result = await createOrder(env, body)
      if (!result.success) return c.json({ success: false, error: result.error }, 400)
      return c.json({
        success: true,
        orderId: result.orderId,
        razorpayOrderId: result.razorpayOrderId,
        razorpayKeyId: env.RAZORPAY_KEY_ID,
        message: result.message,
        isCOD: result.isCOD
      })
    } catch (e: any) {
      console.error('Order creation error:', e.message)
      // Fall through to simple demo mode
    }
  }

  // Demo mode fallback (no external services)
  const orderId = 'PF-' + new Date().toISOString().slice(2,10).replace(/-/g,'') + '-' + Math.random().toString(36).substr(2,4).toUpperCase()
  // COD gatekeeper: orders ₹499-₹1995 only, +₹148 fee applied client-side
  const isCOD = body.paymentMethod === 'cod'
  const COD_MIN_SERVER = 499
  const COD_MAX_SERVER = 1995
  const COD_FEE_SERVER = 148

  // Loss-prevention: block ₹99-only COD carts
  const cartItems = body.cart || []
  const allAddonOnly = cartItems.every((item: any) => item.frame === 'No Frame' && item.price <= 99)
  if (allAddonOnly) {
    return c.json({ success: false, error: 'The ₹99 No-Frame print is an add-on only. Please add a Standard or Premium framed product to checkout.' }, 400)
  }
  const cartTotal = cartItems.reduce((s: number, i: any) => s + i.price * (i.qty || 1), 0)

  // COD eligibility check with behavioral messaging
  if (isCOD && cartTotal < COD_MIN_SERVER) {
    return c.json({ success: false, error: `COD requires a minimum order of ₹${COD_MIN_SERVER}. Your cart is ₹${cartTotal}. Add more items or choose Prepaid (save ₹${COD_FEE_SERVER} COD fee).`, codMin: COD_MIN_SERVER }, 400)
  }
  if (isCOD && cartTotal > COD_MAX_SERVER) {
    return c.json({ success: false, error: `COD is not available for orders above ₹${COD_MAX_SERVER} for security. Your total is ₹${cartTotal}. Please use Prepaid (UPI/Card) for this order.`, codMax: COD_MAX_SERVER }, 400)
  }

  const msg = isCOD
    ? `COD Order ${orderId} placed! WhatsApp confirmation sent within 30 min — reply CONFIRM to lock your order. COD fee ₹${COD_FEE_SERVER} payable at delivery.`
    : `Order ${orderId} confirmed! Priority dispatch within 6 hours. Your PREPAID49 coupon (₹49 off next order) is activated.`
  return c.json({ success: true, orderId, message: msg, isCOD, prepaidCoupon: isCOD ? null : 'PREPAID49' })
})

// ══════════════════════════════════════════════════
// SITEMAP + ROBOTS
// ══════════════════════════════════════════════════
app.get('/sitemap.xml', (c) => {
  const base = 'https://photoframein.in'
  const today = new Date().toISOString().slice(0, 10)
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`
  const staticPages = [
    { loc: '', priority: '1.0', freq: 'daily' },
    { loc: '/shop', priority: '0.9', freq: 'daily' },
    { loc: '/category/divine', priority: '0.95', freq: 'daily' },
    { loc: '/category/motivational', priority: '0.95', freq: 'daily' },
    { loc: '/blog', priority: '0.8', freq: 'weekly' },
    { loc: '/faq', priority: '0.7', freq: 'monthly' },
    { loc: '/about', priority: '0.5', freq: 'monthly' },
    { loc: '/contact', priority: '0.5', freq: 'monthly' },
    { loc: '/track', priority: '0.4', freq: 'monthly' },
  ]
  for (const p of staticPages) {
    xml += `  <url><loc>${base}${p.loc}</loc><lastmod>${today}</lastmod><changefreq>${p.freq}</changefreq><priority>${p.priority}</priority></url>\n`
  }
  for (const cat of CATEGORIES) {
    xml += `  <url><loc>${base}/category/${cat.slug}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>${(cat as any).launch ? '0.9' : '0.7'}</priority></url>\n`
  }
  for (const p of PRODUCTS) {
    xml += `  <url><loc>${base}/product/${p.slug}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.9</priority><image:image><image:loc>${p.image}</image:loc><image:title>${p.name}</image:title></image:image></url>\n`
  }
  for (const post of BLOG_POSTS) {
    xml += `  <url><loc>${base}/blog/${post.slug}</loc><lastmod>${post.date}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>\n`
  }
  xml += '</urlset>'
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } })
})

app.get('/robots.txt', (c) => {
  return c.text(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: https://photoframein.in/sitemap.xml\n\n# PhotoFrameIn - Buy Photo Frames Online India`)
})

// ══════════════════════════════════════════════════
// PAGE SHELL
// ══════════════════════════════════════════════════
function seoMeta(title: string, desc: string, canonical: string, ogImage = '', jsonLd = '', productSlug = '') {
  // Use dynamic OG image API for product pages
  const og = productSlug
    ? `https://photoframein.in/api/og?product=${productSlug}`
    : ogImage || `https://photoframein.in/api/og?title=${encodeURIComponent(title.split('|')[0].trim())}`
  return `<title>${title}</title>
  <meta name="description" content="${desc}">
  <link rel="canonical" href="https://photoframein.in${canonical}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:type" content="${productSlug ? 'product' : 'website'}">
  <meta property="og:url" content="https://photoframein.in${canonical}">
  <meta property="og:image" content="${og}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="PhotoFrameIn">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image" content="${og}">
  ${jsonLd}`
}

function pageShell(head: string): string {
  return `<!DOCTYPE html>
<html lang="en-IN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#0D0D0D">
  ${head}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Playfair+Display:ital,wght@0,600;0,700;1,600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css">
  <link rel="stylesheet" href="/static/styles.css">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"PhotoFrameIn","url":"https://photoframein.in","logo":"https://photoframein.in/static/logo.png","contactPoint":{"@type":"ContactPoint","telephone":"+91-79895-31818","contactType":"customer service","areaServed":"IN","availableLanguage":["English","Hindi"]},"sameAs":["https://instagram.com/photoframein","https://facebook.com/photoframein"]}</script>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"PhotoFrameIn","url":"https://photoframein.in","potentialAction":{"@type":"SearchAction","target":{"@type":"EntryPoint","urlTemplate":"https://photoframein.in/shop?q={search_term_string}"},"query-input":"required name=search_term_string"}}</script>
</head>
<body>
  <div id="app"></div>
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.7/dist/axios.min.js"></script>
  <script src="/static/app.js"></script>
</body>
</html>`
}

// ══════════════════════════════════════════════════
// CUSTOMER ROUTES
// ══════════════════════════════════════════════════
app.get('/', (c) => {
  const head = seoMeta(
    'Buy Photo Frames Online India | Divine & Motivational Frames | PhotoFrameIn',
    'Shop premium photo frames online India. Divine spiritual frames from ₹99, motivational typography frames from ₹449. Free shipping ₹799+. COD available.',
    '/',
    '',
    `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Store","name":"PhotoFrameIn","description":"India's premium D2C store for divine spiritual frames and motivational photo frames","url":"https://photoframein.in","priceRange":"₹","currenciesAccepted":"INR","paymentAccepted":"Cash, Credit Card, UPI","telephone":"+91-79895-31818","address":{"@type":"PostalAddress","addressLocality":"Hyderabad","addressRegion":"Telangana","addressCountry":"IN"},"openingHours":"Mo-Su 09:00-21:00"}</script>`
  )
  return c.html(pageShell(head))
})

app.get('/shop', (c) => {
  const head = seoMeta(
    'Buy Photo Frames Online India | Divine, Motivational & Custom Frames | PhotoFrameIn',
    'Shop divine spiritual frames (Ganesh, Lakshmi, Om) & motivational frames. Starting ₹99. Standard from ₹449. Free shipping above ₹799. COD available.',
    '/shop'
  )
  return c.html(pageShell(head))
})

app.get('/product/:slug', async (c) => {
  const slug = c.req.param('slug')
  const product = PRODUCTS.find(p => p.slug === slug)
  let head: string
  if (product) {
    const ld = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      "name": product.name,
      "image": product.image,
      "description": product.description,
      "brand": { "@type": "Brand", "name": "PhotoFrameIn" },
      "aggregateRating": { "@type": "AggregateRating", "ratingValue": product.rating, "reviewCount": product.reviews, "bestRating": "5" },
      "offers": {
        "@type": "AggregateOffer",
        "priceCurrency": "INR",
        "lowPrice": (product as any).lossFee || product.price,
        "highPrice": product.comparePrice,
        "availability": "https://schema.org/InStock",
        "seller": { "@type": "Organization", "name": "PhotoFrameIn" }
      }
    })}</script>`
    const lowestPrice = (product as any).lossFee || product.price
    head = seoMeta(
      `${product.name} | From ₹${lowestPrice} | PhotoFrameIn`,
      `${product.description.slice(0, 150)}. From ₹${lowestPrice}. Free shipping above ₹799.`,
      `/product/${slug}`,
      product.image,
      ld,
      slug
    )
  } else {
    head = seoMeta('Product Not Found | PhotoFrameIn', 'Product not found.', `/product/${slug}`)
  }
  return c.html(pageShell(head))
})

app.get('/category/:slug', (c) => {
  const slug = c.req.param('slug')
  const cat = CATEGORIES.find(c2 => c2.slug === slug)
  const catDescriptions: Record<string, { title: string, desc: string }> = {
    'divine': {
      title: 'Buy Divine & Spiritual Photo Frames Online India | Ganesh, Lakshmi, Om | PhotoFrameIn',
      desc: 'Shop divine spiritual frames — Ganesh, Lakshmi, Om Mantra, Durga. Perfect for Diwali, housewarming gifts. Starting ₹99. Premium Standard frames from ₹449.'
    },
    'motivational': {
      title: 'Motivational Photo Frames for Home Office India | Typography Prints | PhotoFrameIn',
      desc: 'Premium motivational typography frames for WFH desks, offices & study rooms. "Stay Hungry", "Hustle Hard" & more. Starting ₹99. Bundle 3-pack ₹999.'
    },
    'automotive': {
      title: 'Car & Bike Photo Frames Online India | Supercar, Royal Enfield, BMW | PhotoFrameIn',
      desc: 'Shop premium automotive wall art frames — Supercar Dreams, Royal Enfield Legends, German Engineering. Perfect garage & office decor. Starting ₹99. Free delivery ₹799+.'
    },
    'sports': {
      title: 'Sports Photo Frames Online India | Cricket, Football Fan Art | PhotoFrameIn',
      desc: 'Premium sports fan photo frames — cricket legends, football heroes. Celebrate your passion with premium wall art. Starting ₹449. Free delivery ₹799+.'
    }
  }
  const specific = catDescriptions[slug]
  const head = cat
    ? seoMeta(
        specific?.title || `Buy ${cat.name} Photo Frames Online India | PhotoFrameIn`,
        specific?.desc || `Shop premium ${cat.name} photo frames and wall art online. ${cat.desc}. Starting ₹99. Free delivery above ₹799.`,
        `/category/${slug}`
      )
    : seoMeta('Category | PhotoFrameIn', 'Browse our collection', `/category/${slug}`)
  return c.html(pageShell(head))
})

app.get('/blog', (c) => {
  const head = seoMeta(
    'Photo Frame Ideas, Divine Decor & Motivational Wall Art Blog | PhotoFrameIn',
    'Expert guides on divine frame gifting, motivational wall art, frame sizing & Indian home décor tips. Updated weekly.',
    '/blog'
  )
  return c.html(pageShell(head))
})

app.get('/blog/:slug', (c) => {
  const slug = c.req.param('slug')
  const post = BLOG_POSTS.find(p => p.slug === slug)
  let head: string
  if (post) {
    const ld = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org", "@type": "BlogPosting",
      "headline": post.title, "description": post.excerpt,
      "image": post.image, "datePublished": post.date, "dateModified": post.date,
      "author": { "@type": "Organization", "name": "PhotoFrameIn" },
      "publisher": { "@type": "Organization", "name": "PhotoFrameIn", "logo": { "@type": "ImageObject", "url": "https://photoframein.in/static/logo.png" } },
      "mainEntityOfPage": { "@type": "WebPage", "@id": `https://photoframein.in/blog/${slug}` }
    })}</script>`
    head = seoMeta(`${post.title} | PhotoFrameIn Blog`, post.excerpt, `/blog/${slug}`, post.image, ld)
  } else {
    head = seoMeta('Blog Post | PhotoFrameIn', 'Read our latest blog post.', `/blog/${slug}`)
  }
  return c.html(pageShell(head))
})

app.get('/cart', (c) => {
  const head = seoMeta('Your Cart | PhotoFrameIn', 'Review your selected frames. Free shipping above ₹799. Secure checkout — UPI, Card, COD.', '/cart')
  return c.html(pageShell(head))
})

app.get('/checkout', (c) => {
  const head = seoMeta('Secure Checkout | PhotoFrameIn', 'Fast, secure checkout. Pay via UPI, card, net banking, or Cash on Delivery. COD orders confirmed via WhatsApp.', '/checkout')
  return c.html(pageShell(head))
})

app.get('/track', (c) => {
  const head = seoMeta('Track Your Order | PhotoFrameIn', 'Track your PhotoFrameIn order in real-time. Enter your Order ID or phone number.', '/track')
  return c.html(pageShell(head))
})

app.get('/about', (c) => {
  const head = seoMeta('About PhotoFrameIn | India\'s Premium D2C Photo Frame Store', 'PhotoFrameIn is India\'s fastest-growing D2C store for divine spiritual frames and motivational wall art. Based in Hyderabad.', '/about')
  return c.html(pageShell(head))
})

app.get('/contact', (c) => {
  const head = seoMeta('Contact PhotoFrameIn | WhatsApp, Email & Phone Support', 'WhatsApp: +91 79895 31818. Email: support@photoframein.in. We reply within 2 hours. COD confirmations via WhatsApp.', '/contact')
  return c.html(pageShell(head))
})

app.get('/faq', (c) => {
  const faqLd = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org", "@type": "FAQPage",
    "mainEntity": FAQS.map(f => ({ "@type": "Question", "name": f.q, "acceptedAnswer": { "@type": "Answer", "text": f.a } }))
  })}</script>`
  const head = seoMeta('FAQ — Frames, COD, ₹99 Print, Delivery & Returns | PhotoFrameIn', 'All your questions about our ₹99 posters, COD policy, delivery times, frame types, and returns. Answered.', '/faq', '', faqLd)
  return c.html(pageShell(head))
})

app.get('/policy/:section', (c) => {
  const section = c.req.param('section')
  const titles: Record<string,string> = { returns: 'Returns & Replacement Policy', shipping: 'Shipping Policy', privacy: 'Privacy Policy', terms: 'Terms & Conditions' }
  const head = seoMeta(`${titles[section] || 'Policy'} | PhotoFrameIn`, `Read PhotoFrameIn's ${titles[section] || 'policy'}.`, `/policy/${section}`)
  return c.html(pageShell(head))
})

app.notFound((c) => {
  const head = seoMeta('404 - Page Not Found | PhotoFrameIn', 'The page you are looking for does not exist.', '/404')
  return c.html(pageShell(head), 404)
})

// ══════════════════════════════════════════════════
// RAZORPAY WEBHOOK
// POST /api/webhook/razorpay
// Events: order.paid, payment.failed
// Webhook secret must match RAZORPAY_WEBHOOK_SECRET in Cloudflare secrets
// ══════════════════════════════════════════════════
app.post('/api/webhook/razorpay', async (c) => {
  const env = c.env as any
  const signature = c.req.header('X-Razorpay-Signature') || ''
  const rawBody = await c.req.text()

  // Verify webhook signature
  if (env.RAZORPAY_WEBHOOK_SECRET) {
    const isValid = await verifyRazorpayWebhook(env, rawBody, signature)
    if (!isValid) {
      console.error('[WEBHOOK] Invalid Razorpay signature')
      return c.json({ error: 'Invalid signature' }, 401)
    }
  }

  let event: any
  try {
    event = JSON.parse(rawBody)
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  const eventType = event.event

  // Handle order.paid
  if (eventType === 'order.paid') {
    const payment = event.payload?.payment?.entity
    const rzpOrderId = payment?.order_id
    const paymentId = payment?.id
    const signature_field = event.payload?.payment?.entity?.id

    if (rzpOrderId && env.SUPABASE_URL) {
      try {
        // Find the order by Razorpay order ID
        const { supabaseRequest } = await import('./orderManagementEngine') as any
        const rows = await (async () => {
          const url = `${env.SUPABASE_URL}/rest/v1/orders?razorpay_order_id=eq.${rzpOrderId}&select=id,customer_name,customer_email,customer_phone,cart_items,total_amount`
          const res = await fetch(url, {
            headers: {
              'apikey': env.SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
            }
          })
          return res.json()
        })()

        if (rows && rows.length > 0) {
          const order = rows[0]
          // Update order: payment confirmed
          await fetch(`${env.SUPABASE_URL}/rest/v1/orders?id=eq.${order.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': env.SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
              payment_status: 'paid',
              payment_verified: true,
              razorpay_payment_id: paymentId,
              order_status: 'confirmed',
              updated_at: new Date().toISOString()
            })
          })

          // Send confirmation email
          if (order.customer_email) {
            await sendEmail(env, {
              to: order.customer_email,
              name: order.customer_name,
              subject: `Payment Confirmed! Order ${order.id} — PhotoFrameIn`,
              html: `<h2>Payment Received!</h2><p>Your order <strong>${order.id}</strong> is confirmed. We'll dispatch within 6 hours.</p>`,
              orderId: order.id,
              eventType: 'order_confirmation'
            })
          }

          // Auto-create Shiprocket order
          await createShiprocketOrder(env, order)
        }
      } catch (e: any) {
        console.error('[WEBHOOK] order.paid handler error:', e.message)
      }
    }
    return c.json({ status: 'ok', event: 'order.paid', processed: true })
  }

  // Handle payment.failed
  if (eventType === 'payment.failed') {
    const rzpOrderId = event.payload?.payment?.entity?.order_id
    if (rzpOrderId && env.SUPABASE_URL) {
      await fetch(`${env.SUPABASE_URL}/rest/v1/orders?razorpay_order_id=eq.${rzpOrderId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          payment_status: 'failed',
          order_status: 'cancelled',
          updated_at: new Date().toISOString()
        })
      })
    }
    return c.json({ status: 'ok', event: 'payment.failed', processed: true })
  }

  return c.json({ status: 'ok', event: eventType, processed: false })
})

// ══════════════════════════════════════════════════
// PINCODE VALIDATION (Indian Post API)
// GET /api/pincode/:pincode
// Returns district, state, delivery estimate
// ══════════════════════════════════════════════════
app.get('/api/pincode/:pincode', async (c) => {
  const pincode = c.req.param('pincode')
  const result = await validatePincode(pincode, c.env)
  // Hyderabad Express: pincodes starting with 500
  const isHyderabad = pincode.startsWith('500')
  const effectiveDeliveryDays = isHyderabad ? 1 : (result.deliveryDays || 4)
  if (!result.valid) {
    // Even if API fails, check for Hyderabad
    if (isHyderabad) {
      return c.json({
        valid: true, pincode,
        district: 'Hyderabad', state: 'Telangana',
        deliveryDays: 1, isHyderabad: true, isMetro: true,
        deliveryMessage: '⚡ Hyderabad Express: Same/Next-day delivery!',
        hydExpress: true
      })
    }
    return c.json({ valid: false, error: result.error || 'Invalid pincode' }, 400)
  }
  return c.json({
    valid: true,
    pincode,
    district: result.district,
    state: result.stateName,
    postOffice: result.postOfficeName,
    deliveryDays: effectiveDeliveryDays,
    isMetro: result.isMetro || isHyderabad,
    isHyderabad,
    hydExpress: isHyderabad,
    deliveryMessage: isHyderabad
      ? '⚡ Hyderabad Express: Same/Next-day delivery!'
      : result.isMetro
        ? `🚀 Metro Express: ${effectiveDeliveryDays}-2 days delivery to ${result.district}`
        : `📦 Standard: ${effectiveDeliveryDays}-5 days delivery`
  })
})

// ══════════════════════════════════════════════════
// SHIPROCKET DELIVERY PARTNERS
// GET /api/shipping/partners?pincode=500001&weight=0.5
// ══════════════════════════════════════════════════
app.get('/api/shipping/partners', async (c) => {
  const pincode = c.req.query('pincode') || '500001'
  const weight = parseFloat(c.req.query('weight') || '0.5')
  const result = await getDeliveryPartners(c.env, pincode, weight)
  return c.json(result)
})

// ══════════════════════════════════════════════════
// GOOGLE OAUTH LOGIN
// POST /api/auth/google
// Body: { idToken: "<Google ID token>" }
// Returns: { success, user, supabaseSession }
// ══════════════════════════════════════════════════
app.post('/api/auth/google', async (c) => {
  const env = c.env as any
  const { idToken } = await c.req.json()

  if (!idToken) return c.json({ success: false, error: 'idToken required' }, 400)

  if (!(env as any)?.GOOGLE_CLIENT_ID) {
    return c.json({ success: false, error: 'Google login is not enabled. Set GOOGLE_CLIENT_ID in Cloudflare secrets and enable google_login_enabled in system_config.' }, 503)
  }

  const verified = await verifyGoogleIdToken(env, idToken)
  if (!verified.valid) {
    return c.json({ success: false, error: verified.error }, 401)
  }

  // Try to sign in / create user in Supabase via admin API
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    try {
      // Upsert user in our users table
      const userRes = await fetch(`${env.SUPABASE_URL}/rest/v1/users?id=eq.${verified.sub}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Prefer': 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify({
          email: verified.email,
          name: verified.name,
          google_id: verified.sub,
          avatar_url: verified.picture,
          updated_at: new Date().toISOString()
        })
      })
    } catch (e) { /* non-critical */ }
  }

  return c.json({
    success: true,
    user: {
      sub: verified.sub,
      email: verified.email,
      name: verified.name,
      picture: verified.picture
    },
    message: `Welcome, ${verified.name}!`
  })
})

// ══════════════════════════════════════════════════
// R2 UNBOXING VIDEO UPLOAD
// POST /api/upload/unboxing-video
// Body: { orderId, fileName, phone }
// Returns: pre-signed upload URL for Cloudflare R2
// ══════════════════════════════════════════════════
app.post('/api/upload/unboxing-video', async (c) => {
  const env = c.env as any
  const { orderId, fileName, phone } = await c.req.json()

  if (!orderId || !fileName) {
    return c.json({ success: false, error: 'orderId and fileName required' }, 400)
  }

  // Validate order exists (basic check)
  if (env.SUPABASE_URL) {
    try {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}&select=id,customer_phone`, {
        headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}` }
      })
      const orders = await res.json() as any[]
      if (!orders || orders.length === 0) {
        return c.json({ success: false, error: 'Order not found. Please check your Order ID.' }, 404)
      }
    } catch (e) { /* non-critical */ }
  }

  const result = await generateR2UploadUrl(env, orderId, fileName)
  if (!result.success) {
    return c.json({ success: false, error: result.error }, 503)
  }

  return c.json({
    success: true,
    uploadUrl: result.uploadUrl,
    fileKey: result.fileKey,
    instructions: '1. Use this URL to upload your unboxing video via PUT request. 2. After upload, submit exchange request via /api/exchange/request with this fileKey.'
  })
})

// ══════════════════════════════════════════════════
// EXCHANGE REQUEST (Transit Damage Only)
// POST /api/exchange/request
// Policy: Exchange only (no returns). Unboxing video mandatory.
// ══════════════════════════════════════════════════
app.post('/api/exchange/request', async (c) => {
  const env = c.env as any
  const body = await c.req.json()
  const { orderId, reason, description, unboxingVideoKey, phone } = body

  if (!orderId || !reason) return c.json({ success: false, error: 'orderId and reason required' }, 400)

  const validReasons = ['transit_damage', 'wrong_item']
  if (!validReasons.includes(reason)) {
    return c.json({ success: false, error: 'Reason must be: transit_damage or wrong_item' }, 400)
  }

  // Unboxing video is REQUIRED for exchange
  if (!unboxingVideoKey) {
    return c.json({
      success: false,
      error: 'An unboxing video is required for exchange requests. Please upload your unboxing video first via /api/upload/unboxing-video. The video must show the package being opened without any cuts.'
    }, 400)
  }

  if (env.SUPABASE_URL) {
    try {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/exchange_requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          order_id: orderId,
          reason,
          description,
          unboxing_video_url: unboxingVideoKey,
          status: 'pending'
        })
      })
      const data = await res.json() as any
      return c.json({
        success: true,
        requestId: data[0]?.id,
        message: 'Exchange request submitted! We review all requests within 24 hours. You will be notified via WhatsApp.',
        policy: 'Exchange only for transit damage or wrong item. No returns accepted on custom or standard frames.'
      })
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500)
    }
  }

  return c.json({
    success: true,
    requestId: 'EX-' + Date.now(),
    message: 'Exchange request received! Connect Supabase for persistent storage. Our team will review within 24 hours.',
    policy: 'Exchange only. No returns.'
  })
})

// ══════════════════════════════════════════════════
// EMAIL QUOTA STATUS (admin)
// GET /api/admin/quota
// ══════════════════════════════════════════════════
app.get('/api/admin/quota', async (c) => {
  try {
    const quota = await getQuotaStatus(c.env)
    return c.json({ quota, timestamp: new Date().toISOString() })
  } catch (e: any) {
    return c.json({
      quota: {
        brevo: { sent: 0, limit: 300, remaining: 300, alertTriggered: false },
        resend: { sent: 0, limit: 100, remaining: 100, alertTriggered: false },
        activeProvider: 'brevo'
      },
      note: 'Demo mode — connect Supabase for live quota tracking'
    })
  }
})

// ══════════════════════════════════════════════════
// ADMIN DISPATCH (trigger Shiprocket + dispatch email)
// POST /api/admin/orders/:id/dispatch
// ══════════════════════════════════════════════════
app.post('/api/admin/orders/:id/dispatch', async (c) => {
  const env = c.env as any
  const id = c.req.param('id')
  const { trackingId, courierName } = await c.req.json()

  if (env.SUPABASE_URL) {
    try {
      // Update order status
      await fetch(`${env.SUPABASE_URL}/rest/v1/orders?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          order_status: 'dispatched',
          tracking_id: trackingId,
          courier_name: courierName,
          dispatched_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      })

      // Fetch order for email
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/orders?id=eq.${id}&select=*`, {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` }
      })
      const orders = await res.json() as any[]
      const order = orders[0]

      if (order?.customer_email) {
        await sendEmail(env, {
          to: order.customer_email,
          name: order.customer_name,
          subject: `Your Order ${id} is Dispatched! Track: ${trackingId}`,
          html: dispatchAlertEmail(order, trackingId, courierName),
          orderId: id,
          eventType: 'dispatch_alert'
        })
      }
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500)
    }
  }

  return c.json({
    success: true,
    orderId: id,
    trackingId,
    courierName,
    message: 'Order dispatched. Email sent (if customer email available).'
  })
})

// ══════════════════════════════════════════════════
// ADMIN PANEL ROUTES
// ══════════════════════════════════════════════════

// ── In-memory store (replace with Supabase in production) ─────────
// These are demo settings that mirror what the admin UI controls
let adminGlobalSettings: Record<string, any> = {
  codEnabled: true,
  acrylicUpgrade: false,
  festivalMode: false,
  comboEnabled: true,
  lossLeaderEnabled: true,
  freeShippingThreshold: 799,
  codSurcharge: 148,       // Updated: ₹148 COD fee
  codMinOrder: 499,         // Updated: ₹499 minimum for COD
  codMaxOrder: 1995,
  prepaidCoupon: 'PREPAID49',
  prepaidCouponValue: 49,
  festivalBanner: 'Navratri Special: 20% OFF on all Divine Frames 🔱',
  maintenanceMode: false,
  prepaidOnlyMode: false,   // 35% rule auto-toggle
  exchangeOnlyPolicy: true,
  unboxingVideoRequired: true,
  premiumNaming: true,      // Toggle premium/standard naming
  hyderabadExpressEnabled: true,
  automotiveCategoryEnabled: true,
  // Cost adjustments (admin editable)
  costAdjustments: {
    packaging: 35,
    shipping: 60,
    paymentGatewayPercent: 2,
    rtoRisk: 120,
  }
}

// ── Admin Auth Middleware ──────────────────────────────────────────
async function verifyAdminAuth(c: any): Promise<boolean> {
  const authHeader = c.req.header('X-Admin-Token')
  const sess = c.req.header('X-Admin-Session')
  // In production: verify against Supabase JWT or compare hashed password
  // For now: accept any non-empty session token (real check in /api/admin/auth/verify)
  return !!(authHeader || sess)
}

// ── Admin Auth Endpoints ───────────────────────────────────────────
app.post('/api/admin/auth/verify', async (c) => {
  const body = await c.req.json()
  const { username, password } = body
  // Cloudflare Workers secrets: env.ADMIN_USERNAME, env.ADMIN_PASSWORD
  // Fallback to hardcoded for sandbox demo
  const validUser = (c.env as any)?.ADMIN_USERNAME || 'admin'
  const validPass = (c.env as any)?.ADMIN_PASSWORD || 'photoframe@2024'
  if (username === validUser && password === validPass) {
    return c.json({ success: true, name: 'Admin', mode: 'fallback' })
  }
  return c.json({ success: false, error: 'Invalid credentials' }, 401)
})

app.post('/api/admin/auth/supabase', async (c) => {
  const body = await c.req.json()
  const supabaseUrl = (c.env as any)?.SUPABASE_URL
  const supabaseKey = (c.env as any)?.SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return c.json({ success: false, error: 'Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in Cloudflare secrets.' }, 503)
  }
  try {
    const resp = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey },
      body: JSON.stringify({ email: body.email, password: body.password })
    })
    const data = await resp.json() as any
    if (data.access_token) {
      return c.json({ success: true, token: data.access_token, name: data.user?.email })
    }
    return c.json({ success: false, error: data.error_description || 'Auth failed' }, 401)
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ── Admin Settings API ─────────────────────────────────────────────
app.get('/api/admin/settings', (c) => {
  return c.json({ settings: adminGlobalSettings })
})

app.post('/api/admin/settings', async (c) => {
  const body = await c.req.json()
  adminGlobalSettings = { ...adminGlobalSettings, ...body }
  return c.json({ success: true, settings: adminGlobalSettings })
})

// ── Admin Orders API ───────────────────────────────────────────────
app.get('/api/admin/orders', (c) => {
  const status = c.req.query('status')
  const payment = c.req.query('payment')
  // In production: query Supabase orders table
  return c.json({
    orders: [],
    message: 'Connect Supabase to get real orders. See /admin for setup guide.',
    total: 0
  })
})

app.patch('/api/admin/orders/:id/status', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  // In production: UPDATE orders SET status = ? WHERE id = ?
  return c.json({ success: true, orderId: id, status: body.status })
})

// ── Admin Products API ─────────────────────────────────────────────
app.get('/api/admin/products', (c) => {
  return c.json({ products: PRODUCTS, total: PRODUCTS.length })
})

app.post('/api/admin/products', async (c) => {
  const body = await c.req.json()
  // In production: INSERT into Supabase products table
  const newProduct = {
    ...body,
    id: Date.now(),
    slug: body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    rating: 0, reviews: 0
  }
  return c.json({ success: true, product: newProduct, message: 'In demo mode — connect Supabase for persistent storage' })
})

app.patch('/api/admin/products/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  // In production: UPDATE products SET ... WHERE id = ?
  return c.json({ success: true, id, updates: body })
})

app.delete('/api/admin/products/:id', (c) => {
  const id = parseInt(c.req.param('id'))
  // In production: DELETE FROM products WHERE id = ?
  return c.json({ success: true, message: `Product ${id} marked inactive` })
})

// ── Admin Coupons API ──────────────────────────────────────────────
app.get('/api/admin/coupons', (c) => {
  return c.json({ coupons: [
    { code: 'FRAME10', type: 'percent', value: 10, minOrder: 299, maxUses: 500, uses: 87, active: true, expiry: '2026-12-31' },
    { code: 'DIWALI25', type: 'percent', value: 25, minOrder: 799, maxUses: 1000, uses: 234, active: false, expiry: '2026-10-31' },
    { code: 'FIRST99', type: 'flat', value: 99, minOrder: 499, maxUses: 200, uses: 45, active: true, expiry: '2026-06-30' },
  ]})
})

app.post('/api/admin/coupons', async (c) => {
  const body = await c.req.json()
  return c.json({ success: true, coupon: { ...body, uses: 0 } })
})

app.patch('/api/admin/coupons/:code/toggle', async (c) => {
  const code = c.req.param('code')
  const body = await c.req.json()
  return c.json({ success: true, code, active: body.active })
})

// ── Admin Reviews API ──────────────────────────────────────────────
app.get('/api/admin/reviews', (c) => {
  return c.json({ reviews: [] }) // Connect Supabase for real reviews
})

app.patch('/api/admin/reviews/:id/status', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  return c.json({ success: true, id, status: body.status })
})

// ── Admin Analytics API ────────────────────────────────────────────
app.get('/api/admin/analytics', (c) => {
  return c.json({
    today: { orders: 3, revenue: 2148, avgOrder: 716 },
    week: { orders: 18, revenue: 15243, avgOrder: 847 },
    month: { orders: 47, revenue: 39890, avgOrder: 849 },
    pipeline: { pending: 3, printing: 2, packed: 1, shipped: 8, delivered: 31, rto: 2, cancelled: 1 },
    topProducts: [
      { slug: 'divine-om-mantra-gold-frame', name: 'Divine Om Mantra Gold Frame', sales: 18, revenue: 13482 },
      { slug: 'stay-hungry-stay-foolish-frame', name: 'Stay Hungry Frame', sales: 14, revenue: 6286 },
    ],
    categoryBreakdown: { divine: { orders: 28, revenue: 21450 }, motivational: { orders: 19, revenue: 14200 } },
    unitEconomics: { asp: 849, cogs: 265, grossMargin: 584, shipping: 65, paymentGateway: 17, netContribution: 502 },
  })
})

// ── Shiprocket Wallet API ──────────────────────────────────────────
app.get('/api/admin/shiprocket/wallet', async (c) => {
  const email = (c.env as any)?.SHIPROCKET_EMAIL
  const password = (c.env as any)?.SHIPROCKET_PASSWORD
  if (!email || !password) {
    return c.json({ balance: 2450.50, status: 'demo', message: 'Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD to get live balance' })
  }
  try {
    const loginResp = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    const loginData = await loginResp.json() as any
    if (!loginData.token) throw new Error('Shiprocket login failed')
    const walletResp = await fetch('https://apiv2.shiprocket.in/v1/external/account/details/wallet-balance', {
      headers: { 'Authorization': `Bearer ${loginData.token}` }
    })
    const walletData = await walletResp.json() as any
    return c.json({ balance: walletData.data?.wallet_balance || 0, status: 'live' })
  } catch (e: any) {
    return c.json({ balance: 0, error: e.message, status: 'error' }, 500)
  }
})

// ── Shiprocket Sync ────────────────────────────────────────────────
app.post('/api/admin/shiprocket/sync', async (c) => {
  return c.json({ success: true, synced: 0, message: 'Connect Supabase + Shiprocket for live sync' })
})

// ── Admin Order Cost Adjustment (CRUD) ────────────────────────────
app.get('/api/admin/costs', (c) => {
  return c.json({
    costMatrix: {
      noFrame: { 'A4 Small': 30, 'Small (8×12)': 30, 'Medium (12×18)': 50 },
      standard: { 'Small (8×12)': 80, 'Medium (12×18)': 160, 'Large (18×24)': 220, 'XL (24×36)': 370 },
      premium:  { 'Small (8×12)': 150, 'Medium (12×18)': 240, 'Large (18×24)': 370, 'XL (24×36)': 600 }
    },
    overheads: adminGlobalSettings.costAdjustments || {
      packaging: 35, shipping: 60, paymentGatewayPercent: 2, rtoRisk: 120
    },
    sellPrices: {
      noFrame: { 'A4 Small': 99, 'Small (8×12)': 199, 'Medium (12×18)': 299 },
      standard: { 'Small (8×12)': 449, 'Medium (12×18)': 749, 'Large (18×24)': 1099, 'XL (24×36)': 1699 },
      premium:  { 'Small (8×12)': 599, 'Medium (12×18)': 999, 'Large (18×24)': 1399, 'XL (24×36)': 2199 }
    }
  })
})

app.patch('/api/admin/costs', async (c) => {
  const body = await c.req.json()
  adminGlobalSettings.costAdjustments = {
    ...adminGlobalSettings.costAdjustments,
    ...body
  }
  return c.json({ success: true, costAdjustments: adminGlobalSettings.costAdjustments })
})

// ── Admin Analytics Enhanced ────────────────────────────────────────
app.get('/api/admin/analytics/profit', (c) => {
  const costs = adminGlobalSettings.costAdjustments || { packaging: 35, shipping: 60, paymentGatewayPercent: 2 }
  const asp = 849
  const avgCogs = 200
  const grossMargin = asp - avgCogs - costs.packaging
  const netContrib = grossMargin - costs.shipping - (asp * costs.paymentGatewayPercent / 100)
  const marginPercent = Math.round((netContrib / asp) * 100)
  return c.json({
    asp, avgCogs, packaging: costs.packaging,
    grossMargin, shipping: costs.shipping,
    paymentGateway: Math.round(asp * costs.paymentGatewayPercent / 100),
    netContribution: Math.round(netContrib),
    marginPercent,
    lossPrevention35Rule: marginPercent < 35,
    prepaidOnlyMode: adminGlobalSettings.prepaidOnlyMode,
    recommendation: marginPercent < 35 
      ? '⚠️ 35% rule triggered! Consider switching to Prepaid Only mode.'
      : '✅ Margin healthy. All payment modes available.'
  })
})

// ── Admin Public Settings (for storefront) ────────────────────────
app.get('/api/settings/public', (c) => {
  return c.json({
    codEnabled: adminGlobalSettings.codEnabled,
    freeShippingThreshold: adminGlobalSettings.freeShippingThreshold,
    codSurcharge: adminGlobalSettings.codSurcharge,
    codMinOrder: adminGlobalSettings.codMinOrder,
    codMaxOrder: adminGlobalSettings.codMaxOrder,
    prepaidCoupon: adminGlobalSettings.prepaidCoupon,
    prepaidCouponValue: adminGlobalSettings.prepaidCouponValue,
    prepaidDiscount: 50,  // ₹50 instant discount for prepaid
    festivalMode: adminGlobalSettings.festivalMode,
    festivalBanner: adminGlobalSettings.festivalBanner,
    comboEnabled: adminGlobalSettings.comboEnabled,
    lossLeaderEnabled: adminGlobalSettings.lossLeaderEnabled,
    maintenanceMode: adminGlobalSettings.maintenanceMode,
    prepaidOnlyMode: adminGlobalSettings.prepaidOnlyMode,
    hyderabadExpressEnabled: adminGlobalSettings.hyderabadExpressEnabled,
    automotiveCategoryEnabled: adminGlobalSettings.automotiveCategoryEnabled,
    // Admin-controlled store rating (always ≥4.0 display minimum)
    storeRating: {
      value: Math.max(4.0, _storeRating.value),
      count: _storeRating.count,
      label: `${Math.max(4.0, _storeRating.value)}/5`
    }
  })
})

// ── OpenGraph Image Generation ──────────────────────────────────────
// GET /api/og?product=slug or /api/og?title=text&price=749&image=url
app.get('/api/og', async (c) => {
  const slug = c.req.query('product')
  const titleParam = c.req.query('title')
  const priceParam = c.req.query('price')
  const imageParam = c.req.query('image')

  let title = titleParam || 'Premium Photo Frames'
  let price = priceParam || '449'
  let bgImage = imageParam || 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80'

  if (slug) {
    const product = PRODUCTS.find(p => p.slug === slug)
    if (product) {
      title = product.name
      price = String((product as any).lossFee || product.price)
      bgImage = product.image
    }
  }

  // Return SVG-based OG image (works as image/svg+xml)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0D0D0D"/>
      <stop offset="100%" style="stop-color:#1a1a1a"/>
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#C9A800"/>
      <stop offset="100%" style="stop-color:#FFD700"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="0" width="5" height="630" fill="url(#gold)"/>
  <text x="60" y="100" font-family="Georgia,serif" font-size="22" fill="#FFD700" font-weight="700" letter-spacing="4">PHOTOFRAMEIN.IN</text>
  <text x="60" y="200" font-family="Georgia,serif" font-size="56" fill="#F5F5F5" font-weight="700" font-style="italic">${title.substring(0, 40)}</text>
  ${title.length > 40 ? `<text x="60" y="270" font-family="Georgia,serif" font-size="56" fill="#F5F5F5" font-weight="700" font-style="italic">${title.substring(40, 80)}</text>` : ''}
  <text x="60" y="380" font-family="Arial,sans-serif" font-size="32" fill="#A0A0A0">Starting from</text>
  <text x="60" y="450" font-family="Arial,sans-serif" font-size="72" fill="url(#gold)" font-weight="900">₹${price}</text>
  <rect x="60" y="490" width="280" height="52" rx="10" fill="#CC0000"/>
  <text x="200" y="524" font-family="Arial,sans-serif" font-size="20" fill="white" font-weight="700" text-anchor="middle">Shop Now →</text>
  <text x="60" y="590" font-family="Arial,sans-serif" font-size="16" fill="#666666">Free Delivery ₹799+ · COD Available · Hyderabad Express Available</text>
</svg>`

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600'
    }
  })
})

// ══════════════════════════════════════════════════
// CLOUDINARY PHOTO UPLOAD + R2 BACKUP
// POST /api/upload/photo
// Handles multipart/form-data; uploads to Cloudinary,
// then asynchronously backs up to Cloudflare R2.
// ══════════════════════════════════════════════════
app.post('/api/upload/photo', async (c) => {
  const env = c.env as any

  // Parse form data
  let file: File | null = null
  let productSlug = ''
  let frame = ''
  let size = ''
  try {
    const form = await c.req.formData()
    file = form.get('file') as File
    productSlug = (form.get('productSlug') as string) || 'unknown'
    frame = (form.get('frame') as string) || 'Standard'
    size = (form.get('size') as string) || 'Medium'
  } catch (e: any) {
    return c.json({ success: false, error: 'Invalid form data: ' + e.message }, 400)
  }

  if (!file || !file.name) {
    return c.json({ success: false, error: 'No file provided' }, 400)
  }

  // Validate file type
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
  if (!validTypes.includes(file.type)) {
    return c.json({ success: false, error: 'Invalid file type. Use JPG, PNG, or WebP.' }, 400)
  }

  // Max 15MB
  if (file.size > 15 * 1024 * 1024) {
    return c.json({ success: false, error: 'File too large. Max 15MB.' }, 400)
  }

  const cloudinaryCloudName = env?.CLOUDINARY_CLOUD_NAME
  const cloudinaryApiKey = env?.CLOUDINARY_API_KEY
  const cloudinaryApiSecret = env?.CLOUDINARY_API_SECRET

  // If Cloudinary configured, upload there (primary)
  if (cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret) {
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const folder = `photoframein/customer-uploads/${productSlug}`
      const paramsToSign = `folder=${folder}&timestamp=${timestamp}`

      // HMAC-SHA256 signature for Cloudinary
      const encoder = new TextEncoder()
      const keyData = encoder.encode(cloudinaryApiSecret)
      const msgData = encoder.encode(paramsToSign)
      const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgData)
      const sigArr = Array.from(new Uint8Array(sigBuffer))
      const signature = sigArr.map(b => b.toString(16).padStart(2, '0')).join('')

      const uploadForm = new FormData()
      uploadForm.append('file', file)
      uploadForm.append('api_key', cloudinaryApiKey)
      uploadForm.append('timestamp', String(timestamp))
      uploadForm.append('folder', folder)
      uploadForm.append('signature', signature)

      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/image/upload`,
        { method: 'POST', body: uploadForm }
      )
      const uploadData = await uploadRes.json() as any

      if (uploadData.error) {
        throw new Error(uploadData.error.message)
      }

      const cloudinaryUrl = uploadData.secure_url
      const publicId = uploadData.public_id

      // Async R2 backup (non-blocking)
      if (env?.R2) {
        c.executionCtx?.waitUntil?.(
          (async () => {
            try {
              const buf = await file!.arrayBuffer()
              await env.R2.put(
                `customer-photos/${productSlug}/${Date.now()}-${file!.name}`,
                buf,
                { httpMetadata: { contentType: file!.type }, customMetadata: { cloudinaryPublicId: publicId } }
              )
            } catch (e) { /* R2 backup non-critical */ }
          })()
        )
      }

      return c.json({
        success: true,
        cloudinaryUrl,
        publicId,
        width: uploadData.width,
        height: uploadData.height,
        bytes: uploadData.bytes,
        format: uploadData.format,
        r2BackupScheduled: !!env?.R2,
        message: 'Photo uploaded to Cloudinary. R2 backup scheduled.'
      })
    } catch (e: any) {
      // Fall through to demo mode
      console.error('[CLOUDINARY] Upload error:', e.message)
    }
  }

  // Demo mode: return a placeholder URL (no actual storage)
  const demoUrl = `https://via.placeholder.com/600x800/0D0D0D/FFD700?text=${encodeURIComponent(file.name)}`
  return c.json({
    success: true,
    cloudinaryUrl: demoUrl,
    url: demoUrl,
    demo: true,
    message: 'Demo mode: Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in Cloudflare secrets for live uploads.',
    r2BackupScheduled: false
  })
})

// ══════════════════════════════════════════════════
// ADMIN: Cloudinary Gallery View
// GET /api/admin/cloudinary/gallery?folder=&max=50
// Lists customer photo uploads from Cloudinary Admin API
// ══════════════════════════════════════════════════
app.get('/api/admin/cloudinary/gallery', async (c) => {
  const env = c.env as any
  const folder = c.req.query('folder') || 'photoframein/customer-uploads'
  const maxResults = parseInt(c.req.query('max') || '50')

  if (!env?.CLOUDINARY_CLOUD_NAME || !env?.CLOUDINARY_API_KEY || !env?.CLOUDINARY_API_SECRET) {
    // Return demo gallery
    return c.json({
      resources: [
        { public_id: 'photoframein/demo-1', secure_url: 'https://images.unsplash.com/photo-1569163139394-de4e5f43e5ca?w=300&q=80', created_at: new Date().toISOString(), bytes: 245000, format: 'jpg' },
        { public_id: 'photoframein/demo-2', secure_url: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=300&q=80', created_at: new Date().toISOString(), bytes: 312000, format: 'jpg' },
      ],
      total: 2,
      demo: true,
      message: 'Demo mode — set CLOUDINARY_* secrets for live gallery'
    })
  }

  try {
    // Cloudinary Admin API: list resources by folder
    const credentials = btoa(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`)
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/resources/image?type=upload&prefix=${encodeURIComponent(folder)}&max_results=${maxResults}&direction=desc`,
      { headers: { 'Authorization': `Basic ${credentials}` } }
    )
    const data = await res.json() as any
    return c.json({
      resources: data.resources || [],
      total: data.total_count || 0,
      nextCursor: data.next_cursor
    })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ══════════════════════════════════════════════════
// ADMIN: Store Rating (admin-controlled)
// GET  /api/admin/rating  — get current rating
// POST /api/admin/rating  — update rating { value, count }
// ══════════════════════════════════════════════════
let _storeRating = { value: 4.9, count: 1247 }

app.get('/api/admin/rating', (c) => {
  return c.json({ rating: _storeRating })
})

app.post('/api/admin/rating', async (c) => {
  const body = await c.req.json()
  if (body.value !== undefined) {
    const v = parseFloat(body.value)
    if (v < 4.0 || v > 5.0) return c.json({ success: false, error: 'Rating must be between 4.0 and 5.0' }, 400)
    _storeRating.value = Math.round(v * 10) / 10
  }
  if (body.count !== undefined) _storeRating.count = parseInt(body.count)
  return c.json({ success: true, rating: _storeRating })
})

// Expose rating in public settings
// (patch the existing /api/settings/public to include it)

// ── Admin HTML Shell ───────────────────────────────────────────────
function adminShell(): string {
  return `<!DOCTYPE html>
<html lang="en" class="admin-html">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Admin Panel — PhotoFrameIn</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css">
  <link rel="stylesheet" href="/static/admin.css">
  <style>
    html, body { background: #0f1117; }
    .admin-html body { background: #0f1117 !important; }
  </style>
</head>
<body class="admin-body">
  <div id="app"></div>
  <script src="/static/admin.js"></script>
  <script>
    // Override initAdmin to auto-run on load
    document.addEventListener('DOMContentLoaded', function() {
      if (typeof initAdmin === 'function') initAdmin();
    });
  </script>
</body>
</html>`
}

// Admin routes (must be AFTER all API routes)
app.get('/admin', (c) => c.html(adminShell()))
app.get('/admin/*', (c) => c.html(adminShell()))

export default app
