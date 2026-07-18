# 03 — Database Schema
# Sutra Handloom Marketplace — Authoritative Database Reference

> **Version:** 1.0.0 | **Engine:** PostgreSQL 15 (primary), MongoDB 6 (search/social/analytics), Redis 7 (cache/queue)
> This document is the single source of truth for all data models. Any deviation from these schemas must be reflected here first.

---

## Table of Contents

1. [PostgreSQL Enums](#1-postgresql-enums)
2. [PostgreSQL Tables](#2-postgresql-tables)
3. [MongoDB Collections](#3-mongodb-collections)
4. [Redis Key Patterns](#4-redis-key-patterns)
5. [Indexing Strategy](#5-indexing-strategy)

---

## 1. PostgreSQL Enums

All enums are created in the `public` schema. They must be created **before** any table that references them.

```sql
-- ============================================================
-- ENUM: user_role
-- Controls access level and visible UI modules per user.
-- ============================================================
CREATE TYPE user_role AS ENUM (
  'consumer',      -- B2C buyer
  'producer',      -- Artisan / seller
  'admin',         -- Platform moderator
  'super_admin',   -- Full platform access
  'partner_agent'  -- Rural inclusion field agent
);

-- ============================================================
-- ENUM: kyc_status
-- Lifecycle of a KYC verification submission.
-- ============================================================
CREATE TYPE kyc_status AS ENUM (
  'not_submitted',  -- Producer hasn't started KYC
  'pending',        -- Submission received, awaiting AI pre-check
  'under_review',   -- Passed AI, in human review queue
  'approved',       -- KYC accepted, seller activated
  'rejected',       -- KYC denied, reason provided
  'expired'         -- Previously approved KYC has expired (annual renewal)
);

-- ============================================================
-- ENUM: verification_status
-- Generic document/badge verification state.
-- ============================================================
CREATE TYPE verification_status AS ENUM (
  'pending',
  'approved',
  'rejected'
);

-- ============================================================
-- ENUM: order_status
-- Full order lifecycle from cart to refunded.
-- ============================================================
CREATE TYPE order_status AS ENUM (
  'cart',               -- Items in cart, not yet ordered
  'pending_payment',    -- Order created, awaiting payment
  'payment_confirmed',  -- Payment received, in escrow
  'processing',         -- Seller acknowledged and is preparing
  'ready_to_ship',      -- Package packed, awaiting pickup
  'shipped',            -- Handed to logistics partner
  'out_for_delivery',   -- Last-mile delivery in progress
  'delivered',          -- Confirmed delivered
  'cancelled',          -- Cancelled before shipment
  'return_requested',   -- Buyer requested return
  'returned',           -- Item received back by seller
  'refund_initiated',   -- Refund process started
  'refunded'            -- Refund completed
);

-- ============================================================
-- ENUM: payment_method
-- ============================================================
CREATE TYPE payment_method AS ENUM (
  'upi',
  'card',
  'net_banking',
  'wallet',
  'cod',
  'emi',
  'bank_transfer'
);

-- ============================================================
-- ENUM: transaction_type
-- ============================================================
CREATE TYPE transaction_type AS ENUM (
  'payment',         -- Buyer pays for order
  'refund',          -- Money returned to buyer
  'payout',          -- Platform pays seller
  'escrow_hold',     -- Funds locked after payment
  'escrow_release',  -- Funds released to seller
  'wallet_credit',   -- Money added to platform wallet
  'wallet_debit',    -- Money spent from platform wallet
  'platform_fee',    -- Commission charged
  'tds_deduction'    -- Tax deducted at source (Section 194-O)
);

-- ============================================================
-- ENUM: transaction_status
-- ============================================================
CREATE TYPE transaction_status AS ENUM (
  'initiated',
  'pending',
  'processing',
  'success',
  'failed',
  'reversed'
);

-- ============================================================
-- ENUM: product_status
-- ============================================================
CREATE TYPE product_status AS ENUM (
  'draft',         -- Not yet published
  'active',        -- Live and purchasable
  'inactive',      -- Hidden by seller
  'out_of_stock',  -- No inventory remaining
  'deleted'        -- Soft-deleted, hidden from all views
);

-- ============================================================
-- ENUM: badge_type
-- Trust and quality signals displayed on producer profiles.
-- ============================================================
CREATE TYPE badge_type AS ENUM (
  'gi_certified',     -- Geographical Indication tag
  'handloom_mark',    -- Government Handloom Mark certification
  'top_seller',       -- Earned via sales volume milestone
  'eco_friendly',     -- Uses natural dyes / sustainable process
  'heritage_craft'    -- UNESCO or state heritage craft designation
);

-- ============================================================
-- ENUM: rfq_status
-- B2B Request-for-Quote lifecycle.
-- ============================================================
CREATE TYPE rfq_status AS ENUM (
  'open',        -- Accepting quotes from producers
  'quoted',      -- At least one quote received
  'negotiating', -- Buyer-seller in active negotiation
  'accepted',    -- A quote has been accepted
  'rejected',    -- All quotes rejected by buyer
  'expired',     -- Past expiry date with no acceptance
  'converted'    -- Converted to a Purchase Order
);

-- ============================================================
-- ENUM: dispute_status
-- ============================================================
CREATE TYPE dispute_status AS ENUM (
  'open',
  'under_review',
  'resolved_buyer',   -- Resolved in buyer's favour
  'resolved_seller',  -- Resolved in seller's favour
  'escalated',        -- Requires super_admin attention
  'closed'
);

-- ============================================================
-- ENUM: notification_channel
-- ============================================================
CREATE TYPE notification_channel AS ENUM (
  'in_app',
  'push',
  'sms',
  'email',
  'whatsapp'
);

-- ============================================================
-- ENUM: content_type
-- Social post formats.
-- ============================================================
CREATE TYPE content_type AS ENUM (
  'post',              -- Static image/text post
  'reel',              -- Short-form video
  'story',             -- Ephemeral 24-hour content
  'product_showcase'   -- Shoppable product-tagged post
);

-- ============================================================
-- ENUM: scheme_type
-- Government scheme categories for weavers.
-- ============================================================
CREATE TYPE scheme_type AS ENUM (
  'subsidy',
  'loan',
  'training',
  'insurance',
  'certification',
  'market_linkage'
);

-- ============================================================
-- ENUM: payout_status
-- ============================================================
CREATE TYPE payout_status AS ENUM (
  'pending',
  'processing',
  'paid',
  'failed',
  'on_hold'
);
```

---

## 2. PostgreSQL Tables

> **Conventions:**
> - All primary keys are `UUID` generated with `gen_random_uuid()`.
> - `created_at` and `updated_at` default to `NOW()`. `updated_at` is maintained by a trigger.
> - Foreign keys use `ON DELETE RESTRICT` unless explicitly noted.
> - All monetary values use `NUMERIC(precision, scale)` — never `FLOAT`.

---

### 2.1 `users`

```sql
CREATE TABLE users (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  email               VARCHAR(255)  UNIQUE,
  phone               VARCHAR(15)   UNIQUE,
  phone_verified      BOOLEAN       NOT NULL DEFAULT false,
  email_verified      BOOLEAN       NOT NULL DEFAULT false,
  password_hash       TEXT,                             -- bcrypt hash; NULL for OAuth-only users
  role                user_role     NOT NULL DEFAULT 'consumer',
  is_active           BOOLEAN       NOT NULL DEFAULT true,
  is_blocked          BOOLEAN       NOT NULL DEFAULT false,
  blocked_reason      TEXT,
  last_login_at       TIMESTAMPTZ,
  login_attempts      SMALLINT      NOT NULL DEFAULT 0,
  lockout_until       TIMESTAMPTZ,
  preferred_language  VARCHAR(10)   NOT NULL DEFAULT 'en', -- BCP-47 code (en, hi, ta, te, kn)
  referral_code       VARCHAR(20)   UNIQUE,               -- Human-readable code for referral program
  referred_by         UUID          REFERENCES users(id) ON DELETE SET NULL,
  oauth_provider      VARCHAR(50),                        -- 'google', 'facebook', NULL for email
  oauth_provider_id   TEXT,                               -- Provider's user ID
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT users_email_or_phone CHECK (email IS NOT NULL OR phone IS NOT NULL),
  CONSTRAINT users_login_attempts_range CHECK (login_attempts >= 0 AND login_attempts <= 20)
);

COMMENT ON TABLE users IS 'Core identity table. Every person interacting with Sutra has a row here.';
COMMENT ON COLUMN users.password_hash IS 'bcrypt(cost=12) hash. NULL when user authenticated only via OAuth.';
COMMENT ON COLUMN users.lockout_until IS 'Set when login_attempts >= 5. User cannot login until this timestamp passes.';
COMMENT ON COLUMN users.referral_code IS 'Unique code shared by user to invite others. Generated at registration.';

CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active) WHERE is_active = true;
CREATE INDEX idx_users_referred_by ON users(referred_by) WHERE referred_by IS NOT NULL;
CREATE INDEX idx_users_oauth ON users(oauth_provider, oauth_provider_id) WHERE oauth_provider IS NOT NULL;
```

---

### 2.2 `user_sessions`

```sql
CREATE TABLE user_sessions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash  TEXT        NOT NULL,          -- SHA-256(refresh_token)
  access_jti          TEXT        NOT NULL,          -- JWT ID of the LAST issued access token
  device_fingerprint  TEXT,                          -- Browser/device fingerprint hash
  ip_address          INET,                          -- IP at session creation
  user_agent          TEXT,                          -- Browser User-Agent string
  is_active           BOOLEAN     NOT NULL DEFAULT true,
  expires_at          TIMESTAMPTZ NOT NULL,          -- Refresh token expiry (30 days)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE user_sessions IS 'Tracks active refresh token sessions. Max 5 concurrent per user.';
COMMENT ON COLUMN user_sessions.refresh_token_hash IS 'SHA-256 hash of the actual refresh token (never store plaintext).';
COMMENT ON COLUMN user_sessions.access_jti IS 'JWT ID of the most recently issued access token for this session. Used for blacklisting on logout.';

CREATE INDEX idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_sessions_is_active ON user_sessions(is_active, expires_at) WHERE is_active = true;
CREATE INDEX idx_sessions_refresh_hash ON user_sessions(refresh_token_hash);
```

---

### 2.3 `user_mfa`

```sql
CREATE TABLE user_mfa (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  totp_secret    TEXT        NOT NULL,              -- AES-256-GCM encrypted TOTP seed
  is_totp_enabled BOOLEAN    NOT NULL DEFAULT false,
  backup_codes   TEXT[]      NOT NULL DEFAULT '{}', -- Array of bcrypt-hashed 8-character backup codes
  last_used_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE user_mfa IS 'TOTP-based Multi-Factor Authentication configuration per user.';
COMMENT ON COLUMN user_mfa.totp_secret IS 'TOTP seed encrypted with AES-256-GCM using AWS KMS data key. Format: {base64(iv)}:{base64(authTag)}:{base64(ciphertext)}.';
COMMENT ON COLUMN user_mfa.backup_codes IS 'Array of 10 single-use backup codes, each bcrypt(cost=10) hashed.';
```

---

### 2.4 `producer_profiles`

```sql
CREATE TABLE producer_profiles (
  id                          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID           NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  business_name               VARCHAR(255),
  display_name                VARCHAR(255)   NOT NULL,
  bio                         TEXT,
  craft_type                  VARCHAR(100),  -- e.g., 'Kanchipuram Silk', 'Banarasi', 'Pochampally Ikat'
  state                       VARCHAR(100),
  district                    VARCHAR(100),
  village                     TEXT,
  pincode                     VARCHAR(10),
  geo_location                POINT,         -- PostGIS POINT (longitude, latitude)
  weaver_id                   VARCHAR(50)    UNIQUE, -- Government-issued Weaver ID
  cooperative_name            TEXT,
  cooperative_registration_no TEXT,
  gstin                       VARCHAR(15),
  pan                         VARCHAR(10),
  aadhaar_last4               CHAR(4),       -- ONLY last 4 digits stored
  kyc_status                  kyc_status     NOT NULL DEFAULT 'not_submitted',
  kyc_verified_at             TIMESTAMPTZ,
  ai_trust_score              NUMERIC(5,2)   NOT NULL DEFAULT 0 CHECK (ai_trust_score >= 0 AND ai_trust_score <= 100),
  ai_trust_score_updated_at   TIMESTAMPTZ,
  banner_image_url            TEXT,
  profile_image_url           TEXT,
  total_sales_count           INTEGER        NOT NULL DEFAULT 0,
  total_revenue               NUMERIC(14,2)  NOT NULL DEFAULT 0,
  avg_rating                  NUMERIC(3,2)   NOT NULL DEFAULT 0 CHECK (avg_rating >= 0 AND avg_rating <= 5),
  review_count                INTEGER        NOT NULL DEFAULT 0,
  follower_count              INTEGER        NOT NULL DEFAULT 0,
  is_verified                 BOOLEAN        NOT NULL DEFAULT false,
  is_featured                 BOOLEAN        NOT NULL DEFAULT false,
  metadata                    JSONB          NOT NULL DEFAULT '{}',
  created_at                  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE producer_profiles IS 'Extended profile for artisan sellers. One-to-one with users.';
COMMENT ON COLUMN producer_profiles.ai_trust_score IS 'AI-computed trustworthiness score 0-100. Higher = more trusted. Used for search ranking and badge eligibility.';
COMMENT ON COLUMN producer_profiles.weaver_id IS 'Unique ID from Office of the Development Commissioner for Handlooms (DC Handlooms).';
COMMENT ON COLUMN producer_profiles.metadata IS 'Extensible JSONB for future fields (social links, working_hours, production_capacity, etc.).';

CREATE INDEX idx_producer_user_id ON producer_profiles(user_id);
CREATE INDEX idx_producer_kyc_status ON producer_profiles(kyc_status);
CREATE INDEX idx_producer_state_district ON producer_profiles(state, district);
CREATE INDEX idx_producer_craft_type ON producer_profiles(craft_type);
CREATE INDEX idx_producer_trust_score ON producer_profiles(ai_trust_score DESC);
CREATE INDEX idx_producer_is_verified ON producer_profiles(is_verified) WHERE is_verified = true;
CREATE INDEX idx_producer_is_featured ON producer_profiles(is_featured) WHERE is_featured = true;
CREATE INDEX idx_producer_geo ON producer_profiles USING GIST(geo_location) WHERE geo_location IS NOT NULL;
CREATE INDEX idx_producer_metadata_gin ON producer_profiles USING GIN(metadata);
```

---

### 2.5 `producer_badges`

```sql
CREATE TABLE producer_badges (
  id                 UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id        UUID            NOT NULL REFERENCES producer_profiles(id) ON DELETE CASCADE,
  badge_type         badge_type      NOT NULL,
  issued_by          TEXT            NOT NULL, -- Authority name e.g., 'Office of DC Handlooms'
  certificate_url    TEXT,                     -- S3 URL to uploaded certificate
  issued_at          DATE            NOT NULL,
  expires_at         DATE,                     -- NULL = does not expire
  is_verified        BOOLEAN         NOT NULL DEFAULT false,
  verification_notes TEXT,
  created_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  UNIQUE(producer_id, badge_type) -- One badge of each type per producer
);

COMMENT ON TABLE producer_badges IS 'Trust badges claimed and verified for producer profiles.';

CREATE INDEX idx_badges_producer_id ON producer_badges(producer_id);
CREATE INDEX idx_badges_type ON producer_badges(badge_type);
CREATE INDEX idx_badges_verified ON producer_badges(is_verified) WHERE is_verified = true;
```

---

### 2.6 `producer_bank_accounts`

```sql
CREATE TABLE producer_bank_accounts (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id              UUID         NOT NULL REFERENCES producer_profiles(id) ON DELETE CASCADE,
  account_holder_name      VARCHAR(255) NOT NULL,
  bank_name                VARCHAR(255) NOT NULL,
  branch_name              VARCHAR(255),
  account_number_encrypted TEXT         NOT NULL, -- AES-256-GCM. Format: {b64(iv)}:{b64(tag)}:{b64(ct)}
  ifsc_code                VARCHAR(11)  NOT NULL CHECK (ifsc_code ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  account_type             VARCHAR(20)  NOT NULL CHECK (account_type IN ('savings', 'current')),
  upi_id                   VARCHAR(255),
  razorpay_fund_account_id TEXT,        -- Razorpay Fund Account ID after penny-drop verification
  is_primary               BOOLEAN      NOT NULL DEFAULT false,
  is_verified              BOOLEAN      NOT NULL DEFAULT false,
  verified_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE producer_bank_accounts IS 'Bank accounts for seller payout. Account numbers encrypted with AES-256-GCM.';
COMMENT ON COLUMN producer_bank_accounts.account_number_encrypted IS 'Full account number encrypted. Decrypted only during payout processing. Never logged.';

CREATE INDEX idx_bank_producer_id ON producer_bank_accounts(producer_id);
CREATE UNIQUE INDEX idx_bank_primary ON producer_bank_accounts(producer_id) WHERE is_primary = true;
```

---

### 2.7 `consumer_profiles`

```sql
CREATE TABLE consumer_profiles (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name     VARCHAR(255),
  display_name  VARCHAR(255),
  avatar_url    TEXT,
  date_of_birth DATE,
  gender        VARCHAR(20),
  gstin         VARCHAR(15),           -- For B2B buyers who want tax invoices
  company_name  TEXT,
  is_b2b        BOOLEAN       NOT NULL DEFAULT false,
  loyalty_points INTEGER      NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0),
  total_orders  INTEGER       NOT NULL DEFAULT 0,
  total_spent   NUMERIC(14,2) NOT NULL DEFAULT 0,
  preferences   JSONB         NOT NULL DEFAULT '{}', -- Craft preferences, notification settings, etc.
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE consumer_profiles IS 'Buyer profile. Extends users table with shopping and preference data.';

CREATE INDEX idx_consumer_user_id ON consumer_profiles(user_id);
CREATE INDEX idx_consumer_is_b2b ON consumer_profiles(is_b2b) WHERE is_b2b = true;
```

---

### 2.8 `consumer_addresses`

```sql
CREATE TABLE consumer_addresses (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id   UUID         NOT NULL REFERENCES consumer_profiles(id) ON DELETE CASCADE,
  address_label VARCHAR(50)  NOT NULL DEFAULT 'Home', -- Home, Work, Other
  full_name     VARCHAR(255) NOT NULL,
  phone         VARCHAR(15)  NOT NULL,
  address_line1 TEXT         NOT NULL,
  address_line2 TEXT,
  city          VARCHAR(100) NOT NULL,
  state         VARCHAR(100) NOT NULL,
  pincode       VARCHAR(10)  NOT NULL CHECK (pincode ~ '^\d{6}$'),
  country       VARCHAR(50)  NOT NULL DEFAULT 'India',
  is_default    BOOLEAN      NOT NULL DEFAULT false,
  geo_location  POINT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE consumer_addresses IS 'Saved delivery addresses for consumers. Used for checkout and shipping.';

CREATE INDEX idx_address_consumer_id ON consumer_addresses(consumer_id);
CREATE UNIQUE INDEX idx_address_default ON consumer_addresses(consumer_id) WHERE is_default = true;
CREATE INDEX idx_address_geo ON consumer_addresses USING GIST(geo_location) WHERE geo_location IS NOT NULL;
```

---

### 2.9 `kyc_submissions`

```sql
CREATE TABLE kyc_submissions (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  producer_id          UUID         NOT NULL REFERENCES producer_profiles(id) ON DELETE RESTRICT,
  submission_number    VARCHAR(20)  NOT NULL UNIQUE, -- Format: KYC-YYYY-NNNNNN (e.g., KYC-2024-001234)
  status               kyc_status   NOT NULL DEFAULT 'pending',
  submitted_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  reviewed_at          TIMESTAMPTZ,
  reviewed_by          UUID         REFERENCES users(id) ON DELETE SET NULL,
  review_notes         TEXT,
  ai_analysis_result   JSONB,       -- Full AI analysis output {documents: [], flags: [], confidence: 0.95}
  ai_confidence_score  NUMERIC(5,4) CHECK (ai_confidence_score >= 0 AND ai_confidence_score <= 1),
  rejection_reason     TEXT,
  resubmission_count   SMALLINT     NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE kyc_submissions IS 'Each KYC verification attempt. A producer may resubmit after rejection (max 3 times before manual review required).';
COMMENT ON COLUMN kyc_submissions.ai_analysis_result IS 'Raw output from the AI verification service. Includes OCR results, authenticity signals, and extracted data per document.';

CREATE INDEX idx_kyc_producer_id ON kyc_submissions(producer_id);
CREATE INDEX idx_kyc_status ON kyc_submissions(status);
CREATE INDEX idx_kyc_submitted_at ON kyc_submissions(submitted_at DESC);
```

---

### 2.10 `verification_documents`

```sql
CREATE TABLE verification_documents (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  kyc_submission_id   UUID         NOT NULL REFERENCES kyc_submissions(id) ON DELETE CASCADE,
  document_type       VARCHAR(50)  NOT NULL,
  -- Valid values: aadhaar_front, aadhaar_back, pan, gstin_certificate,
  --               weaver_id_card, gi_certificate, shop_photo, workshop_photo
  file_key            TEXT         NOT NULL, -- S3 object key (private bucket)
  file_url            TEXT         NOT NULL, -- Presigned URL (refreshed on demand)
  mime_type           VARCHAR(100) NOT NULL,
  file_size_bytes     INTEGER      NOT NULL,
  checksum            VARCHAR(64)  NOT NULL, -- SHA-256 hex of file content
  ai_extracted_data   JSONB,                 -- OCR-extracted fields {name, dob, number, address}
  ai_verified         BOOLEAN      NOT NULL DEFAULT false,
  is_rejected         BOOLEAN      NOT NULL DEFAULT false,
  rejection_reason    TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE verification_documents IS 'Individual documents uploaded as part of a KYC submission.';
COMMENT ON COLUMN verification_documents.checksum IS 'SHA-256 hash of the file bytes. Used to detect tampering and deduplication.';

CREATE INDEX idx_vdoc_kyc_id ON verification_documents(kyc_submission_id);
CREATE INDEX idx_vdoc_type ON verification_documents(document_type);
```

---

### 2.11 `product_categories`

```sql
CREATE TABLE product_categories (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   UUID         REFERENCES product_categories(id) ON DELETE SET NULL,
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  image_url   TEXT,
  sort_order  SMALLINT     NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  metadata    JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE product_categories IS 'Hierarchical product category tree. Max depth: 3 levels (root > category > subcategory).';

CREATE INDEX idx_cat_parent_id ON product_categories(parent_id);
CREATE INDEX idx_cat_slug ON product_categories(slug);
CREATE INDEX idx_cat_active ON product_categories(is_active) WHERE is_active = true;
```

---

### 2.12 `products`

```sql
CREATE TABLE products (
  id                   UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id          UUID           NOT NULL REFERENCES producer_profiles(id) ON DELETE RESTRICT,
  category_id          UUID           NOT NULL REFERENCES product_categories(id) ON DELETE RESTRICT,
  sku                  VARCHAR(100)   NOT NULL UNIQUE,
  title                VARCHAR(500)   NOT NULL,
  slug                 VARCHAR(500)   NOT NULL UNIQUE,
  description          TEXT           NOT NULL,
  short_description    VARCHAR(500),
  craft_type           VARCHAR(100),
  fabric_type          VARCHAR(100),
  weave_technique      VARCHAR(100),
  base_price           NUMERIC(12,2)  NOT NULL CHECK (base_price > 0),
  mrp                  NUMERIC(12,2)  NOT NULL CHECK (mrp >= base_price),
  bulk_price           NUMERIC(12,2)  CHECK (bulk_price > 0),  -- B2B price (nullable)
  min_bulk_quantity    INTEGER        NOT NULL DEFAULT 1,
  gst_rate             NUMERIC(5,2)   NOT NULL DEFAULT 5.00 CHECK (gst_rate IN (0, 5, 12, 18, 28)),
  hsn_code             VARCHAR(20)    NOT NULL, -- e.g., '5208', '5407'
  status               product_status NOT NULL DEFAULT 'draft',
  is_handmade          BOOLEAN        NOT NULL DEFAULT true,
  is_gi_certified      BOOLEAN        NOT NULL DEFAULT false,
  gi_tag_name          VARCHAR(255),
  care_instructions    TEXT,
  origin_state         VARCHAR(100),
  origin_district      VARCHAR(100),
  production_time_days INTEGER,       -- Days from order to ready_to_ship
  weight_grams         INTEGER        CHECK (weight_grams > 0),
  length_cm            NUMERIC(8,2),
  width_cm             NUMERIC(8,2),
  height_cm            NUMERIC(8,2),
  total_sold           INTEGER        NOT NULL DEFAULT 0,
  view_count           INTEGER        NOT NULL DEFAULT 0,
  wishlist_count       INTEGER        NOT NULL DEFAULT 0,
  avg_rating           NUMERIC(3,2)   NOT NULL DEFAULT 0 CHECK (avg_rating >= 0 AND avg_rating <= 5),
  review_count         INTEGER        NOT NULL DEFAULT 0,
  search_tags          TEXT[]         NOT NULL DEFAULT '{}',
  metadata             JSONB          NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE products IS 'Core product catalog. Each row represents a unique handloom product listed by a producer.';
COMMENT ON COLUMN products.hsn_code IS 'Harmonized System Nomenclature code for GST classification. Required for invoice generation.';
COMMENT ON COLUMN products.search_tags IS 'Array of searchable tags (e.g., {wedding, silk, red, kanchipuram}). Synced to Elasticsearch.';

CREATE INDEX idx_products_producer_id ON products(producer_id);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_active ON products(status) WHERE status = 'active';
CREATE INDEX idx_products_craft_type ON products(craft_type);
CREATE INDEX idx_products_origin ON products(origin_state, origin_district);
CREATE INDEX idx_products_price ON products(base_price);
CREATE INDEX idx_products_rating ON products(avg_rating DESC);
CREATE INDEX idx_products_sold ON products(total_sold DESC);
CREATE INDEX idx_products_tags_gin ON products USING GIN(search_tags);
CREATE INDEX idx_products_metadata_gin ON products USING GIN(metadata);
CREATE INDEX idx_products_gi ON products(is_gi_certified) WHERE is_gi_certified = true;
CREATE INDEX idx_products_slug ON products(slug);

-- Full-text search index for title + description
CREATE INDEX idx_products_fts ON products USING GIN(
  to_tsvector('english', title || ' ' || COALESCE(description, '') || ' ' || COALESCE(craft_type, ''))
);
```

---

### 2.13 `product_variants`

```sql
CREATE TABLE product_variants (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_name      VARCHAR(255)  NOT NULL,  -- e.g., 'Red - Large'
  color             VARCHAR(100),
  size              VARCHAR(50),
  material          VARCHAR(100),
  sku_suffix        VARCHAR(50)   NOT NULL,  -- Appended to product SKU
  price_adjustment  NUMERIC(10,2) NOT NULL DEFAULT 0, -- +/- from base_price
  stock_quantity    INTEGER       NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  reserved_quantity INTEGER       NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  reorder_point     INTEGER       NOT NULL DEFAULT 5,
  weight_grams      INTEGER       CHECK (weight_grams > 0),
  image_url         TEXT,
  is_active         BOOLEAN       NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT variants_stock_check CHECK (reserved_quantity <= stock_quantity)
);

COMMENT ON TABLE product_variants IS 'Color/size/material variations of a product. Stock tracked at variant level.';

CREATE INDEX idx_variants_product_id ON product_variants(product_id);
CREATE INDEX idx_variants_stock ON product_variants(stock_quantity) WHERE is_active = true;
```

---

### 2.14 `product_images`

```sql
CREATE TABLE product_images (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id  UUID         REFERENCES product_variants(id) ON DELETE SET NULL,
  file_key    TEXT         NOT NULL,   -- S3 object key
  url         TEXT         NOT NULL,   -- CloudFront CDN URL
  alt_text    VARCHAR(500),
  sort_order  SMALLINT     NOT NULL DEFAULT 0,
  is_primary  BOOLEAN      NOT NULL DEFAULT false,
  width_px    INTEGER,
  height_px   INTEGER,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE product_images IS 'Product media library. Images processed through Sharp (resize + WebP conversion) before storage.';

CREATE INDEX idx_images_product_id ON product_images(product_id);
CREATE INDEX idx_images_primary ON product_images(product_id) WHERE is_primary = true;
CREATE INDEX idx_images_sort ON product_images(product_id, sort_order);
```

---

### 2.15 `cart_items`

```sql
CREATE TABLE cart_items (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id      UUID         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id      UUID         NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity        INTEGER      NOT NULL CHECK (quantity > 0 AND quantity <= 100),
  saved_for_later BOOLEAN      NOT NULL DEFAULT false,
  added_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, variant_id) -- One row per variant per user; update quantity
);

COMMENT ON TABLE cart_items IS 'Persistent cart. Survives browser close. Merged with guest cart on login.';

CREATE INDEX idx_cart_user_id ON cart_items(user_id);
CREATE INDEX idx_cart_product_id ON cart_items(product_id);
```

---

### 2.16 `orders`

```sql
CREATE TABLE orders (
  id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number            VARCHAR(30)     NOT NULL UNIQUE, -- ORD-2024-0001234
  buyer_id                UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  producer_id             UUID            NOT NULL REFERENCES producer_profiles(id) ON DELETE RESTRICT,
  status                  order_status    NOT NULL DEFAULT 'pending_payment',
  subtotal                NUMERIC(12,2)   NOT NULL CHECK (subtotal > 0),
  shipping_fee            NUMERIC(10,2)   NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),
  discount_amount         NUMERIC(10,2)   NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount              NUMERIC(10,2)   NOT NULL CHECK (tax_amount >= 0),
  total_amount            NUMERIC(12,2)   NOT NULL CHECK (total_amount > 0),
  currency                VARCHAR(3)      NOT NULL DEFAULT 'INR',
  coupon_id               UUID            REFERENCES coupons(id) ON DELETE SET NULL,
  shipping_address        JSONB           NOT NULL, -- Snapshot of address at order time
  billing_address         JSONB,
  payment_method          payment_method,
  payment_reference       TEXT,           -- Razorpay payment ID
  estimated_delivery_date DATE,
  delivered_at            TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  cancellation_reason     TEXT,
  buyer_notes             TEXT,
  seller_notes            TEXT,
  is_b2b                  BOOLEAN         NOT NULL DEFAULT false,
  purchase_order_id       UUID            REFERENCES purchase_orders(id) ON DELETE SET NULL,
  logistics_provider      VARCHAR(100),
  tracking_number         VARCHAR(255),
  tracking_url            TEXT,
  metadata                JSONB           NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE orders IS 'One order = one producer. Multi-producer cart splits into multiple orders at checkout.';
COMMENT ON COLUMN orders.shipping_address IS 'JSON snapshot of address used at checkout. Immutable after order creation.';

CREATE INDEX idx_orders_buyer_id ON orders(buyer_id);
CREATE INDEX idx_orders_producer_id ON orders(producer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_order_number ON orders(order_number);
```

---

### 2.17 `order_items`

```sql
CREATE TABLE order_items (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id      UUID          NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id      UUID          REFERENCES product_variants(id) ON DELETE RESTRICT,
  product_title   VARCHAR(500)  NOT NULL,  -- Snapshot
  variant_name    VARCHAR(255),            -- Snapshot
  sku             VARCHAR(100)  NOT NULL,  -- Snapshot
  quantity        INTEGER       NOT NULL CHECK (quantity > 0),
  unit_price      NUMERIC(12,2) NOT NULL CHECK (unit_price > 0),
  total_price     NUMERIC(12,2) NOT NULL,
  gst_rate        NUMERIC(5,2)  NOT NULL,
  hsn_code        VARCHAR(20)   NOT NULL,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE order_items IS 'Line items within an order. Prices are snapshots taken at order creation time and never change.';

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);
```

---

### 2.18 `order_fulfillments`

```sql
CREATE TABLE order_fulfillments (
  id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                UUID         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status                  VARCHAR(50)  NOT NULL DEFAULT 'pending',
  logistics_provider      VARCHAR(100),
  tracking_number         VARCHAR(255),
  tracking_url            TEXT,
  shipped_at              TIMESTAMPTZ,
  estimated_delivery_date DATE,
  delivered_at            TIMESTAMPTZ,
  proof_of_delivery_url   TEXT,        -- Photo or signature URL
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fulfillments_order_id ON order_fulfillments(order_id);
```

---

### 2.19 `returns`

```sql
CREATE TABLE returns (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID          NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_item_id       UUID          NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  buyer_id            UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  return_reason       VARCHAR(255)  NOT NULL,
  return_description  TEXT,
  images              TEXT[]        NOT NULL DEFAULT '{}',
  status              VARCHAR(50)   NOT NULL DEFAULT 'requested',
  -- Statuses: requested, approved, pickup_scheduled, picked_up, received, refunded, rejected
  approved_at         TIMESTAMPTZ,
  pickup_scheduled_at TIMESTAMPTZ,
  received_at         TIMESTAMPTZ,
  refund_amount       NUMERIC(12,2),
  refund_initiated_at TIMESTAMPTZ,
  admin_notes         TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_returns_order_id ON returns(order_id);
CREATE INDEX idx_returns_buyer_id ON returns(buyer_id);
CREATE INDEX idx_returns_status ON returns(status);
```

---

### 2.20 `transactions`

```sql
CREATE TABLE transactions (
  id                  UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_ref     VARCHAR(100)         NOT NULL UNIQUE,
  order_id            UUID                 REFERENCES orders(id) ON DELETE RESTRICT,
  user_id             UUID                 NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type                transaction_type     NOT NULL,
  status              transaction_status   NOT NULL DEFAULT 'initiated',
  amount              NUMERIC(12,2)        NOT NULL CHECK (amount > 0),
  currency            VARCHAR(3)           NOT NULL DEFAULT 'INR',
  payment_gateway     VARCHAR(50),         -- 'razorpay', 'cashfree', 'stripe'
  gateway_payment_id  TEXT,                -- Razorpay payment_id
  gateway_order_id    TEXT,                -- Razorpay order_id
  gateway_signature   TEXT,               -- Razorpay signature (verify at payment time, then discard)
  failure_reason      TEXT,
  initiated_at        TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  metadata            JSONB                NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN transactions.gateway_signature IS 'Stored transiently for idempotency. Should be cleared after 30 days via scheduled job.';

CREATE INDEX idx_txn_order_id ON transactions(order_id);
CREATE INDEX idx_txn_user_id ON transactions(user_id);
CREATE INDEX idx_txn_status ON transactions(status);
CREATE INDEX idx_txn_type ON transactions(type);
CREATE INDEX idx_txn_created_at ON transactions(created_at DESC);
```

---

### 2.21 `seller_payouts`

```sql
CREATE TABLE seller_payouts (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id            UUID          NOT NULL REFERENCES producer_profiles(id) ON DELETE RESTRICT,
  bank_account_id        UUID          NOT NULL REFERENCES producer_bank_accounts(id) ON DELETE RESTRICT,
  payout_reference       VARCHAR(100)  NOT NULL UNIQUE,
  amount                 NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  platform_fee           NUMERIC(10,2) NOT NULL DEFAULT 0,
  tds_amount             NUMERIC(10,2) NOT NULL DEFAULT 0,
  net_amount             NUMERIC(12,2) NOT NULL,
  status                 payout_status NOT NULL DEFAULT 'pending',
  razorpay_payout_id     TEXT,
  payout_batch_id        TEXT,
  period_start           DATE          NOT NULL,
  period_end             DATE          NOT NULL,
  order_ids              UUID[]        NOT NULL DEFAULT '{}',
  initiated_at           TIMESTAMPTZ,
  paid_at                TIMESTAMPTZ,
  failure_reason         TEXT,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE seller_payouts IS 'Weekly payout batches to sellers. TDS deducted per Section 194-O. Net = amount - platform_fee - tds_amount.';

CREATE INDEX idx_payouts_producer_id ON seller_payouts(producer_id);
CREATE INDEX idx_payouts_status ON seller_payouts(status);
CREATE INDEX idx_payouts_period ON seller_payouts(period_start, period_end);
```

---

### 2.22 `escrow_holds`

```sql
CREATE TABLE escrow_holds (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID          NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  transaction_id  UUID          NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  held_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  release_date    TIMESTAMPTZ   NOT NULL, -- Typically 7 days after delivered_at
  released_at     TIMESTAMPTZ,
  release_reason  VARCHAR(100), -- 'auto_release', 'dispute_resolved', 'admin_override'
  is_released     BOOLEAN       NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_escrow_order_id ON escrow_holds(order_id);
CREATE INDEX idx_escrow_release_date ON escrow_holds(release_date) WHERE is_released = false;
```

---

### 2.23 `rfq_requests`

```sql
CREATE TABLE rfq_requests (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_number        VARCHAR(30)   NOT NULL UNIQUE, -- RFQ-2024-000123
  buyer_id          UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title             VARCHAR(500)  NOT NULL,
  description       TEXT          NOT NULL,
  category_id       UUID          REFERENCES product_categories(id) ON DELETE SET NULL,
  craft_type        VARCHAR(100),
  fabric_type       VARCHAR(100),
  quantity_required INTEGER       NOT NULL CHECK (quantity_required > 0),
  budget_min        NUMERIC(12,2),
  budget_max        NUMERIC(12,2),
  required_by_date  DATE,
  delivery_location TEXT,
  status            rfq_status    NOT NULL DEFAULT 'open',
  attachments       TEXT[]        NOT NULL DEFAULT '{}',
  expires_at        TIMESTAMPTZ   NOT NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT rfq_budget_check CHECK (budget_max IS NULL OR budget_min IS NULL OR budget_max >= budget_min)
);

CREATE INDEX idx_rfq_buyer_id ON rfq_requests(buyer_id);
CREATE INDEX idx_rfq_status ON rfq_requests(status);
CREATE INDEX idx_rfq_craft_type ON rfq_requests(craft_type);
CREATE INDEX idx_rfq_expires_at ON rfq_requests(expires_at) WHERE status = 'open';
```

---

### 2.24 `rfq_quotes`

```sql
CREATE TABLE rfq_quotes (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id                  UUID          NOT NULL REFERENCES rfq_requests(id) ON DELETE CASCADE,
  producer_id             UUID          NOT NULL REFERENCES producer_profiles(id) ON DELETE RESTRICT,
  quoted_price_per_unit   NUMERIC(12,2) NOT NULL CHECK (quoted_price_per_unit > 0),
  total_quoted_price      NUMERIC(12,2) NOT NULL,
  quantity_available      INTEGER       NOT NULL,
  delivery_timeline_days  INTEGER       NOT NULL,
  notes                   TEXT,
  sample_images           TEXT[]        NOT NULL DEFAULT '{}',
  is_accepted             BOOLEAN       NOT NULL DEFAULT false,
  is_rejected             BOOLEAN       NOT NULL DEFAULT false,
  accepted_at             TIMESTAMPTZ,
  valid_until             TIMESTAMPTZ   NOT NULL,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE(rfq_id, producer_id) -- One quote per producer per RFQ
);

CREATE INDEX idx_quotes_rfq_id ON rfq_quotes(rfq_id);
CREATE INDEX idx_quotes_producer_id ON rfq_quotes(producer_id);
```

---

### 2.25 `purchase_orders`

```sql
CREATE TABLE purchase_orders (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number             VARCHAR(30)   NOT NULL UNIQUE, -- PO-2024-000001
  rfq_id                UUID          REFERENCES rfq_requests(id) ON DELETE SET NULL,
  buyer_id              UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  producer_id           UUID          NOT NULL REFERENCES producer_profiles(id) ON DELETE RESTRICT,
  status                VARCHAR(50)   NOT NULL DEFAULT 'draft',
  -- Statuses: draft, sent, acknowledged, in_production, completed, cancelled
  total_amount          NUMERIC(14,2) NOT NULL CHECK (total_amount > 0),
  advance_paid          NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance_due           NUMERIC(12,2) NOT NULL,
  terms_and_conditions  TEXT,
  delivery_date         DATE,
  po_document_url       TEXT,         -- Generated PDF stored in S3
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_po_buyer_id ON purchase_orders(buyer_id);
CREATE INDEX idx_po_producer_id ON purchase_orders(producer_id);
CREATE INDEX idx_po_status ON purchase_orders(status);
```

---

### 2.26 `follows`

```sql
CREATE TABLE follows (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE(follower_id, following_id),
  CONSTRAINT follows_no_self CHECK (follower_id != following_id)
);

CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);
```

---

### 2.27 `posts`

```sql
CREATE TABLE posts (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id           UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  producer_id         UUID          REFERENCES producer_profiles(id) ON DELETE SET NULL,
  content_type        content_type  NOT NULL DEFAULT 'post',
  caption             TEXT,
  media_urls          TEXT[]        NOT NULL DEFAULT '{}',
  thumbnail_url       TEXT,
  tagged_product_ids  UUID[]        NOT NULL DEFAULT '{}',
  hashtags            TEXT[]        NOT NULL DEFAULT '{}',
  location            TEXT,
  view_count          INTEGER       NOT NULL DEFAULT 0,
  like_count          INTEGER       NOT NULL DEFAULT 0,
  comment_count       INTEGER       NOT NULL DEFAULT 0,
  share_count         INTEGER       NOT NULL DEFAULT 0,
  is_published        BOOLEAN       NOT NULL DEFAULT true,
  published_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_posts_author_id ON posts(author_id);
CREATE INDEX idx_posts_producer_id ON posts(producer_id);
CREATE INDEX idx_posts_published ON posts(published_at DESC) WHERE is_published = true;
CREATE INDEX idx_posts_hashtags ON posts USING GIN(hashtags);
CREATE INDEX idx_posts_products ON posts USING GIN(tagged_product_ids);
```

---

### 2.28 `comments`

```sql
CREATE TABLE comments (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           UUID         NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_comment_id UUID         REFERENCES comments(id) ON DELETE CASCADE,
  content           TEXT         NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  like_count        INTEGER      NOT NULL DEFAULT 0,
  is_deleted        BOOLEAN      NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_parent ON comments(parent_comment_id);
CREATE INDEX idx_comments_author ON comments(author_id);
```

---

### 2.29 `likes`

```sql
CREATE TABLE likes (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(20)  NOT NULL CHECK (target_type IN ('post', 'comment')),
  target_id   UUID         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, target_type, target_id)
);

CREATE INDEX idx_likes_target ON likes(target_type, target_id);
CREATE INDEX idx_likes_user ON likes(user_id);
```

---

### 2.30 `saved_posts`, `content_reports`, `schemes`, `scheme_subscriptions`

```sql
CREATE TABLE saved_posts (
  id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id  UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);
CREATE INDEX idx_saved_user ON saved_posts(user_id);

-- -------------------------------------------------------

CREATE TABLE content_reports (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type      VARCHAR(20)  NOT NULL CHECK (target_type IN ('post', 'comment', 'product', 'user')),
  target_id        UUID         NOT NULL,
  reason           VARCHAR(100) NOT NULL,
  description      TEXT,
  status           VARCHAR(30)  NOT NULL DEFAULT 'pending',
  reviewed_by      UUID         REFERENCES users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_reports_target ON content_reports(target_type, target_id);
CREATE INDEX idx_reports_status ON content_reports(status);

-- -------------------------------------------------------

CREATE TABLE schemes (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_code            VARCHAR(50)   NOT NULL UNIQUE,
  name                   VARCHAR(500)  NOT NULL,
  description            TEXT          NOT NULL,
  scheme_type            scheme_type   NOT NULL,
  ministry               VARCHAR(255),
  implementing_agency    VARCHAR(255),
  eligibility_criteria   JSONB         NOT NULL DEFAULT '{}',
  benefits_description   TEXT          NOT NULL,
  benefit_amount         NUMERIC(12,2),
  application_url        TEXT,
  is_active              BOOLEAN       NOT NULL DEFAULT true,
  valid_from             DATE,
  valid_until            DATE,
  states_applicable      TEXT[]        NOT NULL DEFAULT '{"ALL"}',
  craft_types_applicable TEXT[]        NOT NULL DEFAULT '{}',
  metadata               JSONB         NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_schemes_type ON schemes(scheme_type);
CREATE INDEX idx_schemes_active ON schemes(is_active) WHERE is_active = true;
CREATE INDEX idx_schemes_states ON schemes USING GIN(states_applicable);
CREATE INDEX idx_schemes_crafts ON schemes USING GIN(craft_types_applicable);
CREATE INDEX idx_schemes_eligibility ON schemes USING GIN(eligibility_criteria);

-- -------------------------------------------------------

CREATE TABLE scheme_subscriptions (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheme_id          UUID         NOT NULL REFERENCES schemes(id) ON DELETE CASCADE,
  application_status VARCHAR(50)  NOT NULL DEFAULT 'tracking',
  applied_at         TIMESTAMPTZ,
  notes              TEXT,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, scheme_id)
);
CREATE INDEX idx_scheme_subs_user ON scheme_subscriptions(user_id);
```

---

### 2.31 `notifications`, `notification_preferences`, `admin_actions`, `disputes`

```sql
CREATE TABLE notifications (
  id              UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID                  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           VARCHAR(500)          NOT NULL,
  body            TEXT                  NOT NULL,
  channel         notification_channel  NOT NULL,
  type            VARCHAR(100)          NOT NULL,
  reference_type  VARCHAR(50),
  reference_id    UUID,
  is_read         BOOLEAN               NOT NULL DEFAULT false,
  read_at         TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  delivery_status VARCHAR(30)           NOT NULL DEFAULT 'queued',
  created_at      TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notif_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notif_ref ON notifications(reference_type, reference_id);

-- -------------------------------------------------------

CREATE TABLE notification_preferences (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email_enabled    BOOLEAN     NOT NULL DEFAULT true,
  sms_enabled      BOOLEAN     NOT NULL DEFAULT true,
  push_enabled     BOOLEAN     NOT NULL DEFAULT true,
  whatsapp_enabled BOOLEAN     NOT NULL DEFAULT false,
  in_app_enabled   BOOLEAN     NOT NULL DEFAULT true,
  order_updates    BOOLEAN     NOT NULL DEFAULT true,
  marketing        BOOLEAN     NOT NULL DEFAULT false,
  scheme_alerts    BOOLEAN     NOT NULL DEFAULT true,
  social_activity  BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------

CREATE TABLE admin_actions (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action_type  VARCHAR(100) NOT NULL,
  target_type  VARCHAR(50)  NOT NULL,
  target_id    UUID         NOT NULL,
  description  TEXT,
  old_value    JSONB,
  new_value    JSONB,
  ip_address   INET,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_admin_actions_admin ON admin_actions(admin_id);
CREATE INDEX idx_admin_actions_target ON admin_actions(target_type, target_id);
CREATE INDEX idx_admin_actions_created ON admin_actions(created_at DESC);

-- -------------------------------------------------------

CREATE TABLE disputes (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_number  VARCHAR(30)     NOT NULL UNIQUE, -- DSP-2024-000001
  order_id        UUID            NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  raised_by       UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  against_id      UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title           VARCHAR(500)    NOT NULL,
  description     TEXT            NOT NULL,
  evidence_urls   TEXT[]          NOT NULL DEFAULT '{}',
  status          dispute_status  NOT NULL DEFAULT 'open',
  assigned_to     UUID            REFERENCES users(id) ON DELETE SET NULL,
  resolution      TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_disputes_order ON disputes(order_id);
CREATE INDEX idx_disputes_status ON disputes(status);
```

---

### 2.32 Reviews, Wallet, Coupons, Rural Inclusion Tables

```sql
CREATE TABLE reviews (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID         NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_id          UUID         NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  reviewer_id         UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  producer_id         UUID         NOT NULL REFERENCES producer_profiles(id) ON DELETE RESTRICT,
  rating              SMALLINT     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title               VARCHAR(255),
  body                TEXT         CHECK (char_length(body) BETWEEN 20 AND 5000),
  is_verified_purchase BOOLEAN     NOT NULL DEFAULT true,
  helpful_count       INTEGER      NOT NULL DEFAULT 0,
  is_approved         BOOLEAN      NOT NULL DEFAULT false,
  approved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(order_id, product_id, reviewer_id)
);
CREATE INDEX idx_reviews_product ON reviews(product_id, is_approved);
CREATE INDEX idx_reviews_producer ON reviews(producer_id);
CREATE INDEX idx_reviews_rating ON reviews(rating);

-- -------

CREATE TABLE review_media (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id   UUID        NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  media_type  VARCHAR(10) NOT NULL CHECK (media_type IN ('image', 'video')),
  file_key    TEXT        NOT NULL,
  url         TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_review_media_review ON review_media(review_id);

-- -------

CREATE TABLE product_questions (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  asker_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question     TEXT         NOT NULL,
  answer       TEXT,
  answered_by  UUID         REFERENCES users(id) ON DELETE SET NULL,
  answered_at  TIMESTAMPTZ,
  is_public    BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_questions_product ON product_questions(product_id, is_public);

-- -------

CREATE TABLE platform_wallets (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  locked_balance  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (locked_balance >= 0),
  currency        VARCHAR(3)    NOT NULL DEFAULT 'INR',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE wallet_transactions (
  id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id       UUID                NOT NULL REFERENCES platform_wallets(id) ON DELETE CASCADE,
  type            transaction_type    NOT NULL,
  amount          NUMERIC(12,2)       NOT NULL CHECK (amount > 0),
  balance_after   NUMERIC(12,2)       NOT NULL,
  reference_type  VARCHAR(50),
  reference_id    UUID,
  description     TEXT,
  created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_wallet_txn_wallet ON wallet_transactions(wallet_id, created_at DESC);

-- -------

CREATE TABLE coupons (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  code                   VARCHAR(50)   NOT NULL UNIQUE,
  description            TEXT,
  discount_type          VARCHAR(20)   NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value         NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  min_order_amount       NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_discount_amount    NUMERIC(10,2),
  usage_limit            INTEGER,
  used_count             INTEGER       NOT NULL DEFAULT 0,
  per_user_limit         INTEGER       NOT NULL DEFAULT 1,
  valid_from             TIMESTAMPTZ   NOT NULL,
  valid_until            TIMESTAMPTZ   NOT NULL,
  applicable_categories  UUID[]        NOT NULL DEFAULT '{}',
  applicable_producers   UUID[]        NOT NULL DEFAULT '{}',
  is_active              BOOLEAN       NOT NULL DEFAULT true,
  created_by             UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_coupons_code ON coupons(code);
CREATE INDEX idx_coupons_active ON coupons(is_active, valid_from, valid_until) WHERE is_active = true;

CREATE TABLE coupon_usages (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id        UUID          NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  user_id          UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id         UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  discount_applied NUMERIC(10,2) NOT NULL,
  used_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(coupon_id, order_id)
);
CREATE INDEX idx_coupon_usage_user ON coupon_usages(coupon_id, user_id);

-- -------

CREATE TABLE partner_agents (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID          NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name                 VARCHAR(255)  NOT NULL,
  phone                     VARCHAR(15)   NOT NULL,
  zone                      VARCHAR(100)  NOT NULL,
  state                     VARCHAR(100)  NOT NULL,
  commission_rate           NUMERIC(5,2)  NOT NULL DEFAULT 5.00 CHECK (commission_rate BETWEEN 0 AND 30),
  total_artisans_onboarded  INTEGER       NOT NULL DEFAULT 0,
  total_sales_facilitated   NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active                 BOOLEAN       NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agents_zone ON partner_agents(zone, state);

CREATE TABLE proxy_artisans (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id            UUID         NOT NULL REFERENCES partner_agents(id) ON DELETE RESTRICT,
  full_name           VARCHAR(255) NOT NULL,
  phone               VARCHAR(15),
  aadhaar_last4       CHAR(4),
  village             TEXT,
  district            VARCHAR(100) NOT NULL,
  state               VARCHAR(100) NOT NULL,
  craft_type          VARCHAR(100),
  profile_image_url   TEXT,
  producer_profile_id UUID         REFERENCES producer_profiles(id) ON DELETE SET NULL,
  is_onboarded        BOOLEAN      NOT NULL DEFAULT false,
  onboarded_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_proxy_agent ON proxy_artisans(agent_id);
CREATE INDEX idx_proxy_onboarded ON proxy_artisans(is_onboarded);

CREATE TABLE proxy_intake_logs (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  proxy_artisan_id  UUID          NOT NULL REFERENCES proxy_artisans(id) ON DELETE RESTRICT,
  agent_id          UUID          NOT NULL REFERENCES partner_agents(id) ON DELETE RESTRICT,
  product_title     VARCHAR(500)  NOT NULL,
  description       TEXT,
  images            TEXT[]        NOT NULL DEFAULT '{}',
  asking_price      NUMERIC(12,2),
  quantity          INTEGER,
  status            VARCHAR(30)   NOT NULL DEFAULT 'pending',
  listed_product_id UUID          REFERENCES products(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_intake_proxy ON proxy_intake_logs(proxy_artisan_id);
CREATE INDEX idx_intake_status ON proxy_intake_logs(status);
```

---

## 3. MongoDB Collections

### 3.1 `products_search`
Elasticsearch sync document, mirrored in MongoDB as a write-through cache.

```json
{
  "_id": "uuid-string",
  "producerId": "uuid-string",
  "title": "Kanchipuram Pure Silk Saree - Red",
  "slug": "kanchipuram-pure-silk-saree-red",
  "description": "...",
  "craftType": "Kanchipuram Silk",
  "fabricType": "Silk",
  "weaveTechnique": "Korvai",
  "basePrice": 12500.00,
  "mrp": 15000.00,
  "gstRate": 5,
  "hsnCode": "5407",
  "status": "active",
  "isGiCertified": true,
  "giTagName": "Kanchipuram Saree",
  "originState": "Tamil Nadu",
  "originDistrict": "Kanchipuram",
  "avgRating": 4.7,
  "reviewCount": 42,
  "totalSold": 156,
  "searchTags": ["silk", "wedding", "red", "kanchipuram", "saree"],
  "categoryPath": ["Sarees", "Silk Sarees", "Kanchipuram"],
  "producer": {
    "id": "uuid",
    "displayName": "Ramu Weaves",
    "state": "Tamil Nadu",
    "aiTrustScore": 87.5,
    "isVerified": true,
    "badges": ["gi_certified", "handloom_mark"]
  },
  "images": [
    { "url": "https://cdn.sutra.com/...", "isPrimary": true }
  ],
  "variants": [
    { "id": "uuid", "variantName": "Red - 5.5m", "stockQuantity": 3, "price": 12500 }
  ],
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

---

### 3.2 `feed_items`

```json
{
  "_id": "uuid-string",
  "authorId": "uuid",
  "producerId": "uuid",
  "contentType": "reel",
  "caption": "Watch how this Pochampally Ikat saree is woven...",
  "mediaUrls": ["https://cdn.sutra.com/social/..."],
  "thumbnailUrl": "https://cdn.sutra.com/social/.../thumb.webp",
  "taggedProductIds": ["uuid1", "uuid2"],
  "hashtags": ["handloom", "ikat", "pochampally", "artisan"],
  "location": "Pochampally, Telangana",
  "engagement": {
    "viewCount": 12543,
    "likeCount": 876,
    "commentCount": 43,
    "shareCount": 128,
    "saveCount": 210
  },
  "isPublished": true,
  "publishedAt": "2024-01-14T08:00:00Z",
  "createdAt": "2024-01-14T07:45:00Z"
}
```

---

### 3.3 `scheme_entries`

```json
{
  "_id": "uuid-string",
  "schemeCode": "NHDC-2024-001",
  "name": "Handloom Weavers Comprehensive Welfare Scheme",
  "schemeType": "insurance",
  "ministry": "Ministry of Textiles",
  "implementingAgency": "National Handloom Development Corporation (NHDC)",
  "eligibilityCriteria": {
    "minAge": 18,
    "maxAge": 59,
    "occupationRequired": "weaver",
    "registrationRequired": true,
    "maxAnnualIncome": 150000,
    "statesApplicable": ["ALL"],
    "craftTypesApplicable": []
  },
  "benefits": {
    "description": "Life insurance of ₹2 lakh + health cover of ₹25,000",
    "benefitAmount": 200000,
    "additionalBenefits": ["scholarship_for_children", "old_age_pension"]
  },
  "applicationUrl": "https://handlooms.nic.in/scheme-apply",
  "isActive": true,
  "validFrom": "2024-04-01",
  "validUntil": "2025-03-31",
  "updatedAt": "2024-01-10T00:00:00Z"
}
```

---

### 3.4 `user_events` (Analytics)

```json
{
  "_id": "ObjectId",
  "userId": "uuid",
  "sessionId": "uuid",
  "eventType": "product_view",
  "eventData": {
    "productId": "uuid",
    "producerId": "uuid",
    "categoryId": "uuid",
    "source": "search",
    "searchQuery": "red silk saree",
    "position": 3
  },
  "device": {
    "type": "mobile",
    "os": "Android",
    "browser": "Chrome",
    "appVersion": "2.1.0"
  },
  "ipAddress": "103.x.x.x",
  "userAgent": "Mozilla/5.0...",
  "timestamp": "2024-01-15T11:22:33.456Z"
}
```
> TTL index on `timestamp` field: 90 days (for analytics retention).

---

### 3.5 `recommendation_signals`

```json
{
  "_id": "ObjectId",
  "userId": "uuid",
  "signals": [
    { "type": "view", "productId": "uuid", "weight": 1, "ts": "2024-01-15T10:00:00Z" },
    { "type": "cart_add", "productId": "uuid", "weight": 3, "ts": "2024-01-15T10:05:00Z" },
    { "type": "purchase", "productId": "uuid", "weight": 10, "ts": "2024-01-14T08:00:00Z" },
    { "type": "wishlist", "productId": "uuid", "weight": 5, "ts": "2024-01-13T12:00:00Z" }
  ],
  "preferredCraftTypes": ["Kanchipuram Silk", "Banarasi"],
  "preferredPriceRange": { "min": 5000, "max": 25000 },
  "lastUpdated": "2024-01-15T11:00:00Z"
}
```

---

### 3.6 `seller_analytics_cache`

```json
{
  "_id": "producer-uuid",
  "period": "2024-01",
  "revenue": 125000.00,
  "orderCount": 23,
  "avgOrderValue": 5434.78,
  "topProducts": [
    { "productId": "uuid", "title": "...", "sold": 8, "revenue": 64000 }
  ],
  "conversionRate": 0.034,
  "viewsToCartRate": 0.12,
  "returnRate": 0.043,
  "newCustomers": 18,
  "repeatCustomers": 5,
  "reputationScore": 4.6,
  "computedAt": "2024-02-01T00:05:00Z",
  "ttl": "2024-02-08T00:00:00Z"
}
```

---

## 4. Redis Key Patterns

| Key Pattern | Type | TTL | Description |
|---|---|---|---|
| `session:{userId}:{sessionId}` | Hash | 30 days | Active session metadata (ip, ua, device) |
| `blacklisted_jti:{jti}` | String | = remaining token TTL | Invalidated JWT IDs (logout) |
| `otp:{phone}` | String | 5 min | 6-digit OTP value for SMS auth |
| `otp_attempts:{phone}` | String | 1 hour | Counter for failed OTP attempts |
| `otp_send_count:{phone}` | String | 10 min | Counter for OTP send rate limiting |
| `rate_limit:{identifier}:{endpoint}` | String | 1 min (sliding) | Sliding window rate limit counter |
| `idempotency:{key}` | String | 24 hours | Cached response for idempotent payment ops |
| `cart:{userId}` | Hash | 7 days | Guest cart (before login); field=variantId, value=qty |
| `stock_lock:{variantId}:{orderId}` | String | 10 min | Pessimistic stock reservation during checkout |
| `product_views:{productId}` | String | Flushed hourly | Buffered view count increment |
| `trending_products:{categoryId}` | Sorted Set | 1 hour | Product IDs scored by trending signal |
| `trending_searches` | Sorted Set | 6 hours | Search terms scored by frequency |
| `autocomplete:{prefix}` | Sorted Set | 1 hour | Autocomplete suggestions for search prefix |
| `feed_cache:{userId}:page:{n}` | String (JSON) | 5 min | Paginated feed cache per user |
| `scheme_eligibility:{userId}` | String (JSON) | 24 hours | Eligible scheme IDs for a producer |
| `seller_dashboard:{producerId}` | String (JSON) | 30 min | Precomputed dashboard stats |
| `notification_queue:{userId}` | List | 7 days | Queued in-app notifications |
| `login_attempts:{ip}` | String | 1 hour | IP-level login failure counter |
| `captcha_required:{ip}` | String | 30 min | Flag: require CAPTCHA for this IP |
| `refresh_family:{familyId}` | String | 30 days | Tracks refresh token family for reuse detection |

---

## 5. Indexing Strategy

### Why These Indexes Matter

| Table | Index | Type | Reason |
|---|---|---|---|
| `users` | `(email)` | B-tree | Login by email; uniqueness constraint |
| `users` | `(phone)` | B-tree | OTP login; uniqueness; notification lookup |
| `users` | `(role)` | B-tree | Admin queries filtered by role |
| `producer_profiles` | `(state, district)` | B-tree | Geographic filtering on discovery page |
| `producer_profiles` | `(ai_trust_score DESC)` | B-tree | Default sort for producer listing |
| `producer_profiles` | `(geo_location)` GIST | GiST | Proximity search (nearby weavers) |
| `products` | `(status)` partial WHERE active | B-tree | 95% of queries only need active products |
| `products` | `(craft_type)` | B-tree | Category/craft browsing |
| `products` | `(base_price)` | B-tree | Price range filtering |
| `products` | `(search_tags)` GIN | GIN | Array containment: find products with tag |
| `products` | FTS tsvector | GIN | Full-text search on title + description |
| `products` | `(avg_rating DESC)` | B-tree | Sort by rating in listing pages |
| `orders` | `(buyer_id, status)` | B-tree | Buyer order history with status filter |
| `orders` | `(producer_id, status)` | B-tree | Seller order management dashboard |
| `orders` | `(created_at DESC)` | B-tree | Latest orders first in admin panel |
| `transactions` | `(order_id)` | B-tree | Transaction lookup per order |
| `notifications` | `(user_id, is_read)` | B-tree | Unread notification count + listing |
| `posts` | `(published_at DESC)` partial WHERE published | B-tree | Chronological feed |
| `posts` | `(hashtags)` GIN | GIN | Hashtag search |
| `follows` | `(follower_id)`, `(following_id)` | B-tree | Feed generation; follower counts |
| `escrow_holds` | `(release_date)` partial WHERE not released | B-tree | Scheduled job: find escrows due for release |
| `schemes` | `(states_applicable)` GIN | GIN | Filter schemes by state |
| `rfq_requests` | `(craft_type, status)` | B-tree | Producers find matching open RFQs |
| `seller_payouts` | `(status, period_end)` | B-tree | Payout processing batch jobs |
