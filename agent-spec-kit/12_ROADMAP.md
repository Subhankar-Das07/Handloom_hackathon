# TANTHAVI — Agent Spec Kit
## File: 12_ROADMAP.md
## Purpose: Phase-by-phase build plan. Track current phase and update as milestones are completed.

---

## Current Status

**Active Phase**: Phase 0 (Foundation Setup)
**Target Event**: Handloom Hackathon Demo
**Post-Hackathon Goal**: Production launch within 12 weeks

---

## Phase 0: Foundation (Days 1–3)
### Goal: Working local dev environment + auth system live

#### Setup Tasks
- [ ] Initialize monorepo with Turborepo (`pnpm dlx create-turbo@latest sutra`)
- [ ] Add `apps/web` (Next.js 14), `apps/api` (NestJS), `apps/ai` (FastAPI), `packages/shared`
- [ ] Configure Docker Compose: PostgreSQL 15, MongoDB 7, Redis 7, Elasticsearch 8, MailHog, MinIO
- [ ] Set up ESLint + Prettier + Husky pre-commit hooks
- [ ] Configure TypeScript strict mode across all apps
- [ ] Set up GitHub repository + branch protection on `main` and `develop`

#### Database Tasks
- [ ] Write all PostgreSQL migrations (all tables from `03_DATABASE_SCHEMA.md`)
- [ ] Write seed script with realistic test data (not fake lorem ipsum)
- [ ] Set up TypeORM entities for all tables
- [ ] Configure MongoDB connection + define Mongoose schemas

#### Auth Service Tasks
- [ ] Implement JWT generation (RS256 keypair) + validation
- [ ] Implement refresh token rotation (Redis-backed)
- [ ] POST /auth/register (email + phone flows)
- [ ] POST /auth/login
- [ ] POST /auth/otp/send + /auth/otp/verify (MSG91 integration)
- [ ] POST /auth/oauth/google (Google OAuth flow)
- [ ] POST /auth/refresh
- [ ] POST /auth/logout
- [ ] Rate limiting on all auth endpoints
- [ ] RBAC guard (RolesGuard) implementation

#### Frontend Auth Tasks
- [ ] Dual portal landing page (Producer / Consumer entry)
- [ ] Consumer registration flow: role selection → end customer / retailer / wholesaler
- [ ] Producer registration wizard (5-step)
- [ ] Login page (email / phone / Google)
- [ ] Auth state management (Zustand store)
- [ ] HTTP-only cookie handling for refresh token
- [ ] Token refresh interceptor in API client
- [ ] Protected route middleware in Next.js

**Milestone**: Auth flow working end-to-end locally. Producer can register, consumer can register, login with all 3 methods working.

---

## Phase 1: Core Marketplace (Days 4–10)
### Goal: A product can be listed, found, and purchased end-to-end

#### Product Service
- [ ] POST /products (create listing — producer only)
- [ ] GET /products (list with filters — role-aware pricing)
- [ ] GET /products/:id (detail — role-aware pricing)
- [ ] PATCH /products/:id (update)
- [ ] DELETE /products/:id (archive)
- [ ] Product images: pre-signed S3 upload + CDN URL storage
- [ ] Product variant management
- [ ] Sell-To preference enforcement (filter products per buyer role)
- [ ] Product status workflow (DRAFT → PENDING_REVIEW → LIVE)

#### Search
- [ ] Elasticsearch index mapping for products
- [ ] Sync product data to Elasticsearch on create/update
- [ ] GET /search/products (full-text + filters: price, fabric, state, badge, rating)
- [ ] Category management (product_categories table + API)

#### Order Service
- [ ] Cart operations (add, remove, update quantity, get — with stock check)
- [ ] Stock reservation (Redis hold during checkout — 15 min)
- [ ] POST /orders (place order → create Razorpay payment order)
- [ ] Payment webhook handler (HMAC verification → order status update)
- [ ] Order status state machine (all transitions)
- [ ] GET /orders + GET /orders/:id (buyer)
- [ ] GET /sellers/orders (seller incoming orders)
- [ ] Seller order acceptance/rejection (with 24h auto-accept)
- [ ] Order shipped + tracking number entry (seller)

#### Payment
- [ ] Razorpay test mode order creation
- [ ] Frontend Razorpay Checkout integration
- [ ] Webhook handler: payment.captured → activate order
- [ ] Razorpay test payment flow working end-to-end

#### Consumer UI
- [ ] Home feed (non-personalized: trending + new products)
- [ ] Category browsing
- [ ] Search results page with filters
- [ ] Product detail page (all sections except Q&A)
- [ ] Cart page
- [ ] Checkout flow (4 steps)
- [ ] Order confirmation + order history page
- [ ] Basic order detail page

#### Producer UI
- [ ] Producer dashboard (basic: product list, order list)
- [ ] Product creation wizard (all 7 steps)
- [ ] Product management (edit, archive, change status)
- [ ] Incoming orders panel (accept/reject/ship actions)

**Milestone**: A weaver can register, list a product with images and pricing tiers, a retailer can register and see retailer pricing, an end customer can buy a product and receive order confirmation. All with real data flowing through real databases.

---

## Phase 2: Differentiators (Days 11–18)
### Goal: USP features live for hackathon judging

#### KYC & Verification Module
- [ ] Document upload flow (KYC submissions table)
- [ ] Pre-signed S3 upload for KYC documents (private bucket)
- [ ] Admin KYC review queue UI
- [ ] Approve/Reject actions with email notification
- [ ] Badge display on seller profiles and product cards

#### AI Verification (FastAPI Service)
- [ ] Set up FastAPI app with all middleware
- [ ] Implement EfficientNet-B3 model loading (ONNX)
- [ ] Image pre-processing pipeline
- [ ] Classification endpoint POST /ai/verify/images
- [ ] Composite scoring algorithm
- [ ] Queue-based async processing (Celery + Redis)
- [ ] Result stored in kyc_submissions.ai_report
- [ ] Admin sees AI score + recommendation in review queue
- [ ] Demonstrate live: judge uploads image → AI score returned in < 10 seconds

#### Social Commerce Module
- [ ] Seller post creation (image carousel + caption + product tags)
- [ ] Reel upload flow (upload → MediaConvert → HLS segments)
- [ ] Social feed page (explore + following tabs)
- [ ] Full-screen reel player (HLS.js)
- [ ] Shoppable product chips in reel player
- [ ] Like, comment, save functionality
- [ ] Follow/unfollow sellers
- [ ] Seller public profile page (tabs: Products / Reels / Posts / Reviews)

#### Government Scheme Hub
- [ ] Seed database with top 15 central + 5 state schemes (real data from government sources)
- [ ] Scheme list page with search and filters
- [ ] Scheme detail page
- [ ] Eligibility checker (rule-based, 8 questions)
- [ ] Admin scheme CMS (add/edit/archive)

#### Notification System (Basic)
- [ ] Email notifications via Resend (order confirmed, shipped, review approved)
- [ ] In-app notification center (bell icon + list)
- [ ] Push notification setup (FCM, basic events)

**Milestone (Hackathon Demo Day)**: Can demonstrate: 1) dual-portal login with different pricing views, 2) AI verification live with image upload, 3) social commerce reel with shoppable product, 4) government scheme eligibility checker, 5) full B2C order flow.

---

## Phase 3: Production Hardening (Weeks 3–8 Post-Hackathon)
### Goal: Platform safe and ready for first real artisans and buyers

#### Security Hardening
- [ ] Penetration testing (use OWASP ZAP + manual review)
- [ ] Fix all findings from pen test
- [ ] Implement full RBAC enforcement audit (review every endpoint)
- [ ] Add missing input validation (edge cases found in testing)
- [ ] Set up AWS WAF rules + Cloudflare settings
- [ ] Configure security headers (CSP, HSTS, X-Frame-Options, etc.)
- [ ] Secrets audit: ensure no hardcoded secrets in code
- [ ] Dependency vulnerability scan (npm audit, pip audit) + fixes

#### Real Integrations
- [ ] MSG91 production account + DLT-registered templates
- [ ] Razorpay production account + Route setup for split payments
- [ ] Shiprocket production API integration (AWB + tracking)
- [ ] Surepass/Karza GST verification API (replace mock validation)
- [ ] Real S3 production buckets + CloudFront distributions
- [ ] Firebase production project (FCM + Google OAuth)

#### Missing Production Features
- [ ] Review system (purchase-gated; photos; seller replies)
- [ ] Q&A on product pages (buyer asks → seller answers)
- [ ] Dispute resolution module
- [ ] Return flow (full end-to-end: request → approval → pickup → refund)
- [ ] Refund processing via Razorpay
- [ ] Seller payout batch job (weekly Monday run)
- [ ] TDS calculation logic
- [ ] GST-compliant invoice PDF generation
- [ ] Seller analytics dashboard (all charts)
- [ ] Account settings (update profile, change password, MFA setup)
- [ ] Admin: user management, content moderation queue, platform analytics

#### B2B Module Completion
- [ ] RFQ creation and management (buyer side)
- [ ] Quote response flow (seller side)
- [ ] PO generation
- [ ] Escrow payment hold (orders > ₹10,000)
- [ ] GRN logging flow (buyer after delivery)
- [ ] Escrow auto-release (72h timeout)

#### Proxy Seller Module
- [ ] Internal artisan registry CRM (admin-only)
- [ ] Product listing under platform company account
- [ ] Revenue attribution and payout tracking
- [ ] Account claim SMS flow

#### Infrastructure
- [ ] Deploy staging environment on AWS
- [ ] Set up GitHub Actions CI/CD pipeline
- [ ] Configure monitoring (Grafana dashboards, CloudWatch alarms)
- [ ] Set up Sentry error tracking (frontend + backend)
- [ ] Load testing with k6 (baseline performance benchmarks)
- [ ] RDS Multi-AZ setup
- [ ] Redis ElastiCache with failover
- [ ] Set up backup policies

**Milestone**: Platform is security-audited, all real integrations working, first 10 real artisans onboarded via proxy seller model.

---

## Phase 4: Beta Launch (Weeks 9–16)
### Goal: 50 sellers, 200 buyers, first ₹1 lakh GMV

- [ ] Mobile web optimization (PWA features: offline cart, home screen install)
- [ ] Multilingual support: Hindi UI + regional language product descriptions (Odia, Telugu, Tamil)
- [ ] Personalized recommendation engine (collaborative filtering — Phase 2)
- [ ] Algorithmic social feed (engagement-weighted ranking)
- [ ] Partner agent onboarding portal
- [ ] Marketing campaigns (targeted outreach to weaving cooperatives in Odisha, Varanasi, Kanchipuram)
- [ ] SEO optimization (product pages, seller profiles indexable by Google)
- [ ] Sitemap generation
- [ ] Performance optimization (Core Web Vitals targets: LCP < 2.5s, INP < 200ms)
- [ ] Accessibility audit (WCAG 2.1 AA compliance)
- [ ] Customer support chat widget (Intercom or Crisp — free tier)
- [ ] Public roadmap and changelog page

**Milestone**: Platform public, real transactions happening, first seller payouts sent.

---

## Phase 5: Scale (Months 5–12)
### Goal: 1,000 sellers, 10,000 buyers, ₹1 crore GMV

- [ ] React Native mobile app (iOS + Android)
- [ ] Advanced AI model: retrain on proprietary dataset (10,000+ images from onboarded sellers)
- [ ] Microservices extraction (social-service, search-service split from monolith)
- [ ] Kubernetes migration for high-traffic services
- [ ] International shipping integration (for export-focused artisans — US, UK, Australia)
- [ ] Live commerce module (live video selling)
- [ ] Custom fabric order portal (buyer specifies design → matched to artisan)
- [ ] Export facilitation module (DGFT docs, shipping documents)
- [ ] Impact dashboard (public: artisans empowered, livelihoods created, income generated)
- [ ] Series A fundraising data room

---

## Hackathon Demo Script (5-Minute Pitch)

### Minute 1: Problem Statement
- Show: gap in India's handloom market (₹31,000 crore industry, 35 lakh weavers, 80% unorganized)
- Show: current challenges (middlemen, no digital presence, no B2B tools)

### Minute 2: Dual Portal Demo
- Open platform → show two portals
- Login as Producer (Meena Devi, Sambalpuri weaver) → show products, analytics, AI badge
- Login as Wholesaler → show retailer pricing visible, bulk cart, RFQ button

### Minute 3: AI Verification Live Demo
- Upload 3 test images (handloom workspace, weaving in progress, fabric closeup)
- Watch AI analyze → show confidence scores → badge assignment
- "This replaces 2 weeks of manual verification with 8 seconds of AI"

### Minute 4: Social Commerce + Scheme Hub
- Play a reel from a weaver → tap product chip → add to cart
- Switch to Scheme Hub → run eligibility checker → show Mudra loan match → redirect to official portal

### Minute 5: Impact & Scalability
- Show architecture slide (all real tech, production-grade from day one)
- "This is not a prototype. All data is real. All integrations are live-ready."
- Show roadmap: 6 months to ₹1 crore GMV, 1,000 artisans supported
