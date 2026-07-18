# TANTHAVI — Agent Spec Kit
## File: 02_FEATURE_SPECIFICATIONS.md
## Purpose: Exhaustive feature list for every module. Reference before building any feature.

---

## Module 1: Authentication & Identity

### F-AUTH-001: Dual Portal Entry
- Landing page presents two clearly labelled portals: "Producer / Seller" and "Consumer / Buyer"
- Portal selection routes user to the appropriate registration/login flow
- Guest users can browse the product catalog without logging in
- Cart persists for guest users via localStorage (merged with account cart on login)

### F-AUTH-002: Email + Password Registration
- Email must be unique in system
- Password: min 8 chars, must contain uppercase, lowercase, number, special char
- Email verification link sent within 30 seconds of registration
- Link valid for 24 hours; can request resend (max 3 times per 24h)
- After verification: JWT pair issued, user redirected to profile setup

### F-AUTH-003: Phone OTP Authentication
- User enters phone number with country code (+91 default)
- OTP: 6-digit numeric, valid for 10 minutes
- Rate limit: max 5 OTP requests per phone per hour
- Lockout: 5 failed verification attempts → 15-minute lockout on that phone number
- If phone already registered: logs in; if new: starts registration flow

### F-AUTH-004: Google Sign-In (End Customers Only)
- One-click via Google OAuth 2.0
- Platform reads: email, name, profile picture
- If Google email matches existing account: log in
- If new: auto-create END_CUSTOMER account, skip verification step
- Note: NOT available for business accounts (producers, retailers, wholesalers)

### F-AUTH-005: Multi-Factor Authentication
- Optional for END_CUSTOMER accounts
- Mandatory for accounts with transaction value > ₹50,000/month
- Mandatory for all business accounts (RETAILER, WHOLESALER, PRODUCER)
- TOTP via Google Authenticator / Authy
- Backup codes: 8 single-use codes generated at MFA setup
- MFA enrollment: Scan QR code → verify 6-digit code → enable

### F-AUTH-006: Password Reset
- Via email link or OTP to registered phone
- Link valid for 1 hour (single-use)
- Password history: cannot reuse last 5 passwords
- Triggers logout of all other active sessions

### F-AUTH-007: Account Deactivation & Deletion
- Deactivation: Account suspended but data retained; can be reactivated
- Deletion request: DPDP Act compliance — data anonymized within 30 days
- Seller accounts with pending orders cannot be deleted until all orders resolved
- Deletion sends confirmation email + 7-day cool-off before irreversible deletion executes

---

## Module 2: Producer / Seller Features

### F-PROD-001: Business Profile (Public)
- Cover image (banner): 1920x640px recommended
- Avatar: square, 400x400px minimum
- Business name, tagline (120 chars)
- Craft story (rich text, up to 2000 chars)
- Location: State, District (city-level optional)
- Languages spoken (for buyer-seller communication)
- External links: YouTube, Instagram, Facebook, personal website (max 5 links)
- Contact info: Email (optional public toggle), phone (optional public toggle)
- Verification badges displayed prominently below name
- Seller rating (star average + total review count)
- Joined date ("Crafting since 2019")
- Response rate percentage ("Responds within 4 hours")

### F-PROD-002: Sell-To Preference Control
- Dashboard toggle: "Who can see and buy my products?"
- Options: End Customers, Retailers, Wholesalers (multi-select, at least one required)
- Change takes effect immediately on all live listings
- Products become invisible to excluded groups until preference changed back

### F-PROD-003: Product Listing Creation
- Multi-step wizard:
  - Step 1: Basic info (title, category, description)
  - Step 2: Media (images + optional video)
  - Step 3: Variants (colors, sizes, materials)
  - Step 4: Pricing (MRP, retailer price, wholesaler price, negotiable toggle)
  - Step 5: Inventory & shipping (stock qty, weight, dimensions, made-to-order toggle)
  - Step 6: Visibility settings
  - Step 7: Review & publish
- Auto-save as draft at each step
- Preview mode before publishing
- AI content check runs on product description (auto-flag prohibited content)

### F-PROD-004: Inventory Management
- Current stock: shown per variant
- Low stock threshold: configurable (default: 5 units)
- Low stock email alert sent to seller
- When stock = 0: listing shows "Out of Stock"; not removed from catalog
- Stock reservation during checkout: reserved for 15 minutes (session hold)
- Bulk inventory update via CSV upload

### F-PROD-005: Order Management Panel
- Order list with filters: status, date range, buyer type, value range
- Order detail view: buyer info (masked phone/email until order confirmed), items, shipping address, payment info
- Accept / Reject action (24-hour window to accept; auto-accept if no action)
- Rejection requires reason selection from dropdown
- Mark as packed: confirm packing, optionally upload packing photo
- Mark as shipped: enter tracking number and courier; or auto-generate via Shiprocket integration
- Bulk label printing for multi-item orders
- Chat with buyer (within order context)

### F-PROD-006: Seller Analytics Dashboard
- Revenue overview (current month, last month, 3-month, 12-month, custom range)
- Orders: total, pending, shipped, delivered, returned
- Top-selling products (units + revenue)
- Traffic sources: organic search, explore feed, seller profile, social post/reel
- Conversion funnel: product views → add to cart → orders placed → delivered
- Average order value by buyer type
- Geographic heatmap of buyer locations
- Review sentiment summary (positive/neutral/negative %)
- Payout history and upcoming payout estimate

### F-PROD-007: Payout Management
- Payout schedule: Every Monday for previous week's delivered orders
- Payout summary: gross sales, commission deducted, TDS deducted, net payout
- Downloadable payout reports (CSV)
- Bank account management: add/edit/delete bank accounts
- Wallet balance (accumulated payouts < ₹500 threshold)

### F-PROD-008: Content Studio (Social Commerce)
- Create Post: image carousel (up to 10 images) + caption + product tags
- Create Reel: upload video (15-90s) + thumbnail selection + caption + product tags
- Product tagging: type product name → select from own listings → pins product card on media
- Draft, schedule (future feature), or publish immediately
- View all published content: engagement stats per post/reel
- Delete post/reel (removes from all user feeds)

---

## Module 3: Consumer Features

### F-CON-001: Home Feed (Personalized)
- Above-the-fold: Hero banner (curated collections, seasonal campaigns)
- "Continue Shopping" (recently viewed products)
- Trending Now (most ordered products this week)
- "Because you browsed..." (content-based recommendations)
- Seller Spotlight (featured verified artisans)
- From sellers you follow (if logged in)
- Category quick-links
- New arrivals in preferred categories

### F-CON-002: Product Search & Filtering
- Full-text search (powered by Elasticsearch): searches title, description, category, seller name, craft type
- Search suggestions (type-ahead with popular searches)
- Recent search history (stored locally)
- Filters:
  - Price range (slider)
  - Fabric type (multi-select)
  - Weave technique (multi-select)
  - Seller state/district (location filter)
  - Seller badge (Verified, AI Assured, Government Registered)
  - Color (visual color swatches)
  - Delivery time (within 3 days / within 7 days / made-to-order)
  - Customer rating (4★ and above, etc.)
  - Availability (in stock only toggle)
- Sort by: Relevance, Price (low/high), Rating, Newest, Most Popular

### F-CON-003: Product Detail Page
- Image gallery: thumbnail strip + main view with zoom (pinch on mobile)
- Video player (if seller uploaded product video)
- Title, price display (MRP with tier price if eligible)
- Variant selector (color, size, material) — updates price and images
- Stock status: In Stock / Only X left / Out of Stock / Made to Order (X days)
- Add to Cart button (primary CTA)
- Buy Now button (skips cart, goes directly to checkout)
- Save to Wishlist (heart icon)
- Seller info card: avatar, name, rating, response time, badge, "Visit Seller" button
- Product details section: fabric composition, dimensions, care instructions, weave technique
- Q&A section: show existing Q&As; "Ask a Question" input (requires login)
- Reviews section: star breakdown, review list with photos, "Write a Review" (purchase-gated)
- Related products carousel: "More from this seller" + "Similar products"

### F-CON-004: Shopping Cart
- Multi-seller cart (items from different sellers in one cart)
- Quantity selector per item (respects available stock)
- Per-seller subtotal grouping
- Remove item, Move to wishlist
- Apply coupon code field
- Price summary: subtotal, coupon discount, shipping estimate, GST, total
- "Proceed to Checkout" button

### F-CON-005: Checkout Flow
- Step 1: Delivery address (select saved or add new)
- Step 2: Delivery options (standard, express if available; estimated date shown)
- Step 3: Payment method selection
- Step 4: Order review (final items, address, payment, total)
- Step 5: Place Order → payment processing → confirmation page
- Confirmation page: Order ID, expected delivery date, "Track Order" button

### F-CON-006: Order History & Tracking
- Order list: newest first, each card shows: order ID, date, items, status, total, action buttons
- Order detail page: full item breakdown, seller details, tracking timeline
- Tracking timeline: Order Placed → Seller Accepted → Packed → Picked Up → In Transit → Out for Delivery → Delivered
- Real-time tracking map (if courier supports)
- Download invoice (PDF)
- Contact seller button (opens chat)
- Return initiation button (appears after delivery, within return window)

### F-CON-007: Wishlist
- Save products without committing to cart
- Price change notification (if saved item price changes ±10%)
- Share wishlist link with others
- Move to cart from wishlist
- Stock status indicator on wishlist items

### F-CON-008: Reviews & Ratings
- Only users who received a delivery can review a product
- Star rating (1-5)
- Text review (min 30 chars, max 500 chars)
- Photo upload (up to 5 photos, max 5MB each)
- Review appears after moderation (max 24h)
- Seller can reply to review (one reply per review)
- Buyer can edit review within 30 days of posting
- Report review (for fake or abusive content)

### F-CON-009: Buyer-Seller Chat
- Chat available within order context (for order-related questions only)
- Chat opens within 24 hours of order placement
- No external link sharing allowed in chat (fraud prevention)
- File attachments: images only (for product clarification)
- Chat history retained for 6 months after order completion

---

## Module 4: B2B Features

### F-B2B-001: Tiered Pricing Display
- Wholesale price shown only to WHOLESALER_VERIFIED users
- Retailer price shown only to RETAILER_VERIFIED and WHOLESALER_VERIFIED users
- MRP always shown to everyone
- Pricing table on product page (if seller has multiple tiers): shows ranges and MOQ

### F-B2B-002: Bulk Cart
- Quantity input (no stepper UI — direct number entry for bulk quantities)
- MOQ enforcement: cannot add fewer than MOQ units of wholesale-priced items
- Tiered price updates in real-time as quantity changes
- Multi-product bulk order: all items consolidated for delivery estimate

### F-B2B-003: Request for Quotation (RFQ)
- Buyer submits: product ID (or description if not listed), quantity, required specifications, delivery deadline, delivery address
- Seller receives RFQ notification; responds with: unit price, lead time, MOQ, payment terms, quote validity (days)
- Buyer reviews quote: accept or negotiate (counter-offer)
- Accepted quote converts to purchase order
- RFQ expires: after seller-specified validity period; buyer can request extension

### F-B2B-004: Purchase Order Management
- System-generated PO after RFQ acceptance
- PO includes: PO number, buyer details, seller details, item list, quantities, agreed price, payment terms, delivery address, delivery deadline
- PDF generation of PO document
- Buyer can upload own PO document (uploaded as reference alongside system PO)
- PO tracks through order fulfillment flow

### F-B2B-005: Escrow Payment Hold
- Triggered automatically for orders > ₹10,000 from Retailer/Wholesaler
- Full payment collected at checkout; held in escrow account
- Seller notified of escrow hold and release conditions
- Buyer logs GRN within 72h of delivery confirmation
- GRN records: delivered quantity, quality notes, discrepancies
- On GRN log: funds released to seller on next payout cycle
- If GRN not logged within 72h: auto-release to seller (buyer agreement terms)
- On dispute: funds frozen; admin arbitrates

### F-B2B-006: Net Payment Terms (Future Phase)
- Available only for accounts with minimum 6-month history and track record
- Net-30, Net-60: buyer pays within 30/60 days of delivery
- Credit limit: determined by platform based on transaction history
- Late payment: penalty interest + restriction of credit terms

---

## Module 5: AI Verification & Trusted Seller Program

### F-AI-001: Document AI Pre-Screening
- All KYC documents uploaded trigger AI scan before reaching human queue
- GSTIN: formatted validation (15-character pattern check) + Surepass API verification
- PAN: format validation (ABCDE1234F pattern) + NSDL API verification (future)
- Aadhaar: Only last 4 digits stored; full number used only for real-time UIDAI verification (if integrated)
- Business registration: OCR extraction of CIN/MSME number → database lookup

### F-AI-002: Image Analysis Pipeline
- Triggered on: verification submission by producer (workspace + product images)
- Steps: quality gate → workspace classifier → fabric texture classifier → reverse image check
- Results returned as JSON: `{ confidence_score, class_labels, flags, recommendation }`
- Recommendation values: `AUTO_APPROVE`, `MANUAL_REVIEW`, `REJECT`
- All results stored in `kyc_submissions.ai_report` JSONB field
- Human reviewer sees: images, AI recommendation, confidence score, specific flags

### F-AI-003: Badge Assignment
- **Platform Verified** (🏅): Manual review passed + documents verified
- **AI Assured** (✅): AI confidence ≥ 85% + no fraud flags
- **Premium Artisan** (🌟): AI Assured + seller rating ≥ 4.5 + min 50 completed orders + account age ≥ 6 months
- **Government Registered Artisan** (🏛️): Artisan Card number verified with Ministry of Textiles registry (or self-declaration with document upload)
- **Trusted Producer** (🤝): All of above + no disputes in last 12 months + < 5% return rate
- Badges display on: seller profile page, product listing cards, product detail page

### F-AI-004: Continuous Quality Monitoring
- After each successful delivery, buyer rates product (1-5 stars)
- If seller rating drops below 3.5 (rolling 90-day average): automated review triggered
- Admin reviews flagged seller; can: issue warning, strip badge, suspend account
- Sellers notified of rating decline with actionable feedback

---

## Module 6: Social Commerce

### F-SOC-001: Reel Player
- Full-screen vertical reel player (similar to Instagram Reels)
- Swipe up: next reel; swipe down: previous reel
- Double-tap: like
- Long press: pause
- Bottom overlay: seller name + avatar, caption (truncated with "more"), product tag chip ("Shop 2 items")
- Right-side interaction buttons: Like count, Comment button, Share button, Save button
- Tapping product chip: mini product card slides up (title, price, "Add to Cart" or "View Product")

### F-SOC-002: Post Viewer
- Image carousel with dot indicators
- Like, Comment, Share, Save buttons
- Caption with hashtag and @mention support
- Product tags displayed as shopping bag icons on images
- Tap product tag: opens mini product card

### F-SOC-003: Seller Feed Algorithm (Phase 1: Simplified)
- Recent posts from followed sellers (chronological)
- High-engagement posts from same category as user's past views
- New sellers in user's state/region
- Random sample of trending content

### F-SOC-004: Follow System
- Follow/unfollow any seller
- Follower/following counts on profile
- Following list: browse sellers you follow
- Notifications: "New reel from [Seller Name]"
- Recommended sellers: based on followed sellers' shared characteristics

### F-SOC-005: Interaction System
- Likes: public count; users can see their own like state
- Comments: nested replies (2 levels); max 500 chars per comment
- Reply notification to commenter
- Like a comment
- Report comment (NSFW, spam, harassment)
- Comment moderation: auto-flag comments with prohibited words

### F-SOC-006: Save & Collections
- Save any post/reel to personal "Saved" collection
- Create named collections (e.g., "Wedding Ideas", "Bulk for Shop")
- Move saved items between collections

---

## Module 7: Government Scheme Hub

### F-GOV-001: Scheme Card Display
- Title, ministry/organization name, category badge
- Brief benefit summary (e.g., "Up to ₹10 lakh loan at 4% interest")
- Eligibility summary (2-3 bullet points)
- Application deadline (if applicable) with countdown timer
- "View Full Details" and "Check Eligibility" CTAs
- Official source link (opens in new tab, external)
- "Subscribe for updates" toggle

### F-GOV-002: Eligibility Checker
- 8-question questionnaire:
  1. Your state of residence
  2. Type of weaver/artisan (handloom weaver / powerloom worker / designer / supplier)
  3. Do you have an official Artisan Card?
  4. Annual income range (< ₹1L / ₹1-3L / ₹3-10L / > ₹10L)
  5. Do you own a loom?
  6. Do you have an existing business loan?
  7. Are you part of any cooperative or SHG?
  8. Gender (for gender-specific schemes)
- Results: matched schemes with match percentage + which criteria matched + which didn't
- IMPORTANT DISCLAIMER displayed: "Results are informational only. Official eligibility determined by the issuing authority."

### F-GOV-003: Scheme Detail Page
- Full description (formatted markdown)
- Complete eligibility criteria
- Required documents list
- Benefit amount and disbursement details
- How to apply (step-by-step guide linking to official portal)
- FAQ accordion
- Related schemes
- Last updated timestamp + source attribution

### F-GOV-004: News & Updates Feed
- Government press releases and circulars related to handloom
- Ministry of Textiles announcements
- New scheme launches
- Scheme deadline extensions/closures
- Each news item: title, source, date, 2-3 line summary, "Read Full Article" (external link)

### F-GOV-005: Scheme Admin CMS
- Add new scheme: form with all required fields
- Edit existing scheme
- Archive expired scheme (soft delete; still browsable in "Past Schemes" section)
- Bulk import via CSV (for state scheme data)
- Manual validation flag: mark schemes that need re-verification

---

## Module 8: Proxy Seller / Rural Inclusion Engine

### F-PROXY-001: Artisan Registry (Internal CRM)
- Admin creates artisan profile: name, phone (basic), village, district, state
- Craft type, loom type, products they make
- Bank account details for payout
- Photo uploads (managed by admin team)
- Production capacity notes

### F-PROXY-002: Product Listing Under Company Account
- Admin creates products in platform's own seller account on behalf of artisan
- Each product tagged with artisan's registry ID (internal tracking)
- Revenue attribution: sales tracked per artisan in CRM

### F-PROXY-003: Artisan Payout Tracking
- Platform calculates earnings: sale price - platform costs - physical handling fee
- Payout record created in artisan's CRM entry
- Payout method: cash (via partner agent) or bank transfer
- Partner agents can confirm cash delivery

### F-PROXY-004: Gradual Digital Onboarding
- When artisan gains digital access: send account claim link via SMS to registered phone
- Artisan verifies with OTP → sees "Claim Your Account" screen
- After claiming: can take over profile management, add own images, respond to orders
- Old proxy listings transferred to their new account

---

## Module 9: Admin & Operations

### F-ADM-001: Verification Queue
- List of all pending KYC submissions (producer + buyer)
- Filter by: type, submission date, AI recommendation, assigned reviewer
- Detailed submission view: all documents, AI report, applicant info
- Actions: Approve / Reject (with reason) / Request Additional Info
- Request additional info: sends automated email with checklist to applicant
- Assignment: round-robin auto-assignment to available reviewers; or manual reassignment

### F-ADM-002: Dispute Resolution Center
- All active disputes with status
- Dispute detail: order info, buyer claim, seller response, evidence uploaded by both parties
- Admin actions: Approve buyer claim / Approve seller claim / Partial resolution
- Resolution triggers: refund processing, escrow release, or hold continuation
- Resolution notes sent to both parties

### F-ADM-003: User Management
- Search users by email, phone, name, role
- View full user profile and activity history
- Suspend account (temporary): user cannot login; existing orders continue
- Ban account (permanent): all sessions terminated; listings de-listed
- Role change: upgrade/downgrade roles (e.g., promote RETAILER_UNVERIFIED to RETAILER_VERIFIED)
- Impersonate user (for support purposes; all actions logged)
- Export user data (for DPDP right-to-access requests)

### F-ADM-004: Content Moderation Queue
- All user-reported posts, reels, and comments
- AI-flagged content (NSFW classifier outputs)
- Actions: Approve (no action) / Remove content / Warn user / Suspend account
- Moderation history per seller

### F-ADM-005: Platform Analytics Dashboard
- Total GMV (daily / weekly / monthly)
- Gross orders and delivered orders
- DAU / MAU with trend
- New registrations by role
- Revenue (platform commission) breakdown
- Geographic heatmap (where orders are placed and fulfilled)
- Top categories by volume
- AI verification pass/fail rates
- Average time to verification approval
- Support ticket volume and resolution time

---

## Module 10: Notifications

### F-NOT-001: Notification Center (In-App)
- Bell icon in header with unread count badge
- Notification list grouped by: Today, Yesterday, Earlier This Week
- Categories: Orders, Social, Schemes, Platform Updates
- Mark as read (individual or "mark all read")
- Deep link on click: goes directly to relevant page (order, post, scheme)

### F-NOT-002: Notification Events Catalogue

| Event | Channels | Who Receives |
|---|---|---|
| OTP request | SMS | Requester |
| Email verification | Email | New user |
| Registration approved | Email + Push | Applicant |
| Registration rejected | Email | Applicant |
| Order placed | Email + Push + SMS | Buyer, Seller |
| Payment failed | Email + Push | Buyer |
| Order accepted by seller | Push + SMS | Buyer |
| Order rejected by seller | Push + SMS + Email | Buyer |
| Order shipped | Email + Push + SMS | Buyer |
| Order delivered | Push + SMS | Buyer |
| Return request received | Push + Email | Seller |
| Refund processed | Email + Push | Buyer |
| New RFQ received | Push + Email | Seller |
| RFQ quote received | Push + Email | Buyer |
| Payout sent | Email + SMS | Seller |
| Low stock alert | Email + Push | Seller |
| New review on product | Push | Seller |
| New follower | Push | Seller |
| New comment on post | Push | Post creator |
| New scheme published | Push (if subscribed) | Subscribed users |
| Scheme deadline approaching | Email + Push | Subscribed users |
| Account suspended | Email + SMS | Affected user |
| Badge awarded | Push + Email | Seller |

### F-NOT-003: Notification Preferences
- Per-channel (Email / SMS / Push) per-event-category preferences
- Global quiet hours (e.g., 10pm-8am, no push notifications)
- Unsubscribe from marketing emails (one-click via email footer)
