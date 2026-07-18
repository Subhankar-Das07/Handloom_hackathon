# TANTHAVI — Agent Spec Kit
## File: 01_USER_ROLES_AND_FLOWS.md
## Purpose: Complete definition of all user types, onboarding flows, and RBAC rules.

---

## 1. User Roles Reference

### System Roles (Stored in `users.role` column)

| Role Constant | Display Name | Description |
|---|---|---|
| `SUPER_ADMIN` | Super Admin | Full system access, cannot be created via UI |
| `ADMIN` | Platform Admin | Manages verifications, disputes, schemes |
| `SUPPORT_AGENT` | Support Agent | Limited admin access for customer support |
| `PRODUCER_VERIFIED` | Verified Producer | Passed verification, can list live products |
| `PRODUCER_UNVERIFIED` | Pending Producer | Registered, awaiting verification |
| `RETAILER_VERIFIED` | Verified Retailer | B2B buyer with verified business (GSTIN) |
| `RETAILER_UNVERIFIED` | Pending Retailer | Registered, awaiting KYC |
| `WHOLESALER_VERIFIED` | Verified Wholesaler | Extended KYC, bulk buyer access |
| `WHOLESALER_UNVERIFIED` | Pending Wholesaler | Registered, awaiting full KYC |
| `END_CUSTOMER` | Customer | Standard B2C buyer, no business verification |
| `GUEST` | Guest | Unauthenticated; can browse only |

### Role Transitions (State Machine)

```
GUEST
  → [Register as Producer] → PRODUCER_UNVERIFIED
    → [AI + Human Approval] → PRODUCER_VERIFIED
    → [Rejection] → PRODUCER_UNVERIFIED (can resubmit after 30 days)

GUEST
  → [Register as End Customer] → END_CUSTOMER (immediate, email verification only)

GUEST
  → [Register as Retailer] → RETAILER_UNVERIFIED
    → [KYC Approval] → RETAILER_VERIFIED
    → [Rejection] → RETAILER_UNVERIFIED (can resubmit after 30 days)

GUEST
  → [Register as Wholesaler] → WHOLESALER_UNVERIFIED
    → [Full KYC Approval] → WHOLESALER_VERIFIED

PRODUCER_VERIFIED
  → [Enable Buyer Mode] → Can act as buyer while retaining PRODUCER_VERIFIED role
  (Buyer mode is a flag `is_buyer_enabled`, not a role change)
```

---

## 2. Onboarding Flow: End Customer

```
Step 1: Landing Page → Click "Consumer Login / Register"
Step 2: Select Consumer Type → "I'm an Individual Buyer"
Step 3: Auth Method Selection → Google / Phone OTP / Email+Password
Step 4: Email Verification (if email method)
Step 5: Basic Profile Setup → Name, profile photo (optional), preferred language
Step 6: → Account Active → Redirect to Home Feed
```

**Required Fields at Registration**: name, email OR phone (one mandatory)
**KYC Required**: NO
**Time to Active Account**: < 2 minutes

---

## 3. Onboarding Flow: Retailer

```
Step 1: Landing Page → Click "Consumer Login / Register"
Step 2: Select Consumer Type → "I'm a Retailer / Business Buyer"
Step 3: Auth Method → Phone OTP or Email+Password (Google not available for business accounts)
Step 4: Email Verification
Step 5: Business Profile Form:
  - Business Name (legal)
  - Type of Business (Sole Proprietor / Partnership / Private Ltd / LLP)
  - GSTIN (validated in real-time via GST API)
  - PAN (business or proprietor)
  - Registered Business Address
  - Proprietor/Director Aadhaar number
Step 6: Document Upload:
  - GST Certificate
  - Business PAN
  - Shop/Trade License (if applicable)
  - Address Proof (utility bill / rent agreement)
  - Proprietor ID (Aadhaar front/back)
Step 7: Submission Confirmation → "Your application is under review (24-48 hours)"
Step 8: → KYC Team Reviews → Approve / Reject
Step 9 (Approved): Email notification → Account unlocked with RETAILER_VERIFIED role
Step 9 (Rejected): Email with reason → 30-day resubmission window
```

**Account State During Review**: `RETAILER_UNVERIFIED`
- Can browse products
- Cannot see wholesale/retailer pricing
- Cannot place orders

**Account State After Approval**: `RETAILER_VERIFIED`
- Sees retailer pricing tiers
- Can place bulk orders
- Can submit RFQs

---

## 4. Onboarding Flow: Wholesaler

Same as Retailer flow PLUS:
- Annual turnover declaration (self-declaration form)
- 2 trade references (name, phone, business)
- Certificate of Incorporation / Partnership Deed
- Bank statement (last 3 months) — for very large credit limit requests only

**Extended Review Time**: 48-72 hours (additional manual diligence)

---

## 5. Onboarding Flow: Individual Artisan / Producer

```
Step 1: Landing Page → Click "Producer Login / Register"
Step 2: Auth → Phone OTP (primary) or Email+Password
Step 3: Phone Verification (OTP)
Step 4: Producer Type Selection:
  - "Individual Artisan / Weaver"
  - "Artisan Cooperative / SHG"
  - "Handloom Business / Company"
  - "Supplier / Raw Material Vendor"
Step 5: Basic Profile:
  - Full Name / Business Name
  - Craft Specialization (Fabric type dropdown — multi-select)
  - State, District, Pincode
  - Years active in craft
  - Brief story (optional at this stage)
Step 6: Document Upload (individual artisan):
  - Aadhaar Card (front and back)
  - PAN Card (optional if turnover < ₹2.5L)
  - Bank account details (cancelled cheque or passbook photo)
  - Artisan Identity Card (Ministry of Textiles) — if available; STRONGLY recommended
  - Workspace photos (minimum 3: loom, raw materials, workspace overview)
  - In-progress weaving photo/video (minimum 1)
  - Product samples (minimum 5 product images)
Step 7: GSTIN (optional for producers below ₹40L annual threshold; mandatory if registered)
Step 8: Sell-To Preference Selection:
  - ☐ End Customers
  - ☐ Retailers
  - ☐ Wholesalers
  (can be changed later from dashboard)
Step 9: Submission → "Verification in progress (24-48 hours)"
Step 10: AI pre-screening of uploaded images (< 5 minutes)
Step 11: Human Review (< 24 hours for standard; < 4 hours for expedited)
Step 12 (Approved): Email + SMS → Profile active → Can create product listings
Step 12 (Rejected): Email with specific reason → Can resubmit in 30 days
```

**Account State During Review**: `PRODUCER_UNVERIFIED`
- Profile visible to admins only
- Cannot publish product listings
- Can start creating products in DRAFT status

**Account State After Approval**: `PRODUCER_VERIFIED`
- Can publish listings
- Listing visible to buyers per Sell-To preferences
- Assigned verification badges based on documents and AI score

---

## 6. Onboarding Flow: Company/Organization Producer

Same as Individual Artisan PLUS:
- Company PAN
- GST Certificate (mandatory — organizations must be GST registered)
- CIN or MSME registration certificate
- Director's Aadhaar
- Factory/production facility photos
- Sample test reports (optional but accelerates Premium Artisan badge)

---

## 7. Role-Based Access Control (RBAC) Matrix

### API Endpoint Access

| Endpoint Category | GUEST | END_CUSTOMER | RETAILER | WHOLESALER | PRODUCER_UNVERIFIED | PRODUCER_VERIFIED | ADMIN |
|---|---|---|---|---|---|---|---|
| Browse products | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| See MRP | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| See retailer pricing | ❌ | ❌ | ✅ | ✅ | ❌ | ✅* | ✅ |
| See wholesaler pricing | ❌ | ❌ | ❌ | ✅ | ❌ | ✅* | ✅ |
| Place order | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ (buyer mode) | ✅ |
| Create product listing | ❌ | ❌ | ❌ | ❌ | ✅ (DRAFT only) | ✅ | ✅ |
| Publish listing | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Submit RFQ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Upload reels/posts | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| View seller analytics | ❌ | ❌ | ❌ | ❌ | ✅ (own only) | ✅ (own only) | ✅ |
| Review KYC | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Approve/reject sellers | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage schemes | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

*Producer sees pricing levels because they also act as a buyer for raw materials.

### Data Visibility Rules (Enforced at API Layer)

1. **Wholesale price field**: Only returned in API response if `request.user.role` is `WHOLESALER_VERIFIED`, `ADMIN`, or `PRODUCER_VERIFIED` (in buyer mode)
2. **Retailer price field**: Only returned if `request.user.role` is `RETAILER_VERIFIED`, `WHOLESALER_VERIFIED`, `ADMIN`, or `PRODUCER_VERIFIED` (buyer mode)
3. **KYC documents**: Only accessible by the submitting user themselves and `ADMIN` role
4. **Other seller's analytics**: Never accessible by any non-admin
5. **Buyer's personal address**: Never returned in any seller-facing API

---

## 8. Session & Token Lifecycle

```
Login Event:
  → Generate Access Token (JWT, RS256, 15min expiry)
  → Generate Refresh Token (opaque string, SHA-256 hashed, stored in Redis)
  → Set Access Token in memory (never in localStorage)
  → Set Refresh Token in HTTP-only, Secure, SameSite=Strict cookie

Authenticated Request:
  → Client sends Access Token in Authorization: Bearer <token> header
  → API Gateway validates JWT signature + expiry
  → If expired → client calls /auth/refresh automatically
  → Server validates refresh token hash in Redis + device fingerprint match

Token Refresh:
  → Old refresh token invalidated immediately (rotation strategy)
  → New token pair issued
  → Redis entry updated with new token hash

Logout:
  → Refresh token deleted from Redis
  → Access token becomes invalid on next expiry (no server-side tracking needed)

Security Events (trigger immediate session invalidation):
  → Password change
  → Role change (by admin)
  → Account suspension
  → Suspicious login from new country/device
```

---

## 9. Social Sign-In (Google OAuth)

- Available for: `END_CUSTOMER` registration and login
- NOT available for: Business accounts (Retailer, Wholesaler, Producer) — requires phone/email for traceability
- Flow:
  1. Client redirects to `/api/v1/auth/oauth/google`
  2. Server generates OAuth state parameter (CSRF protection), stores in Redis (5-min TTL)
  3. Redirect to Google consent screen
  4. Google callback → server validates state, exchanges code for tokens
  5. Fetch user profile from Google
  6. Find or create user record → generate platform JWT pair
  7. Redirect to frontend with access token in URL fragment (one-time, immediately consumed)

---

## 10. Producer Sell-To Preference Logic

Each producer sets `sell_to_preference` as a set of flags stored in `producer_profiles`:

```typescript
sell_to_end_customers: boolean  // default: true
sell_to_retailers: boolean      // default: false  
sell_to_wholesalers: boolean    // default: false
```

**Enforcement at product listing level**:
- When a product is fetched by an End Customer: returned only if `sell_to_end_customers = true`
- When fetched by a Retailer: returned only if `sell_to_retailers = true`
- When fetched by a Wholesaler: returned only if `sell_to_wholesalers = true`
- Admins always see all products regardless

**Note**: A producer can change these preferences at any time from their dashboard settings. Changes take effect immediately for all listed products.
