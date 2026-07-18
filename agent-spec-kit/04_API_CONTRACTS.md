# 04 — API Contracts
# Tanthavi Handloom Marketplace — Complete Endpoint Reference

> **Version:** 1.0.0 | **Base URL:** `https://api.tanthavi.com`
> All requests use `Content-Type: application/json` unless noted (multipart for file uploads).
> All timestamps are ISO 8601 UTC. All monetary amounts are in INR (Indian Rupees).

---

## Standard Response Envelopes

### Success Response

```json
{
  "success": true,
  "data": { "...": "..." }
}
```

### Paginated Success Response

```json
{
  "success": true,
  "data": [ "..." ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 250,
    "totalPages": 13
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields failed validation.",
    "details": [
      { "field": "email", "message": "Invalid email format" },
      { "field": "phone", "message": "Phone must be a 10-digit Indian mobile number" }
    ]
  }
}
```

### Common Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body / query param validation failed |
| `UNAUTHORIZED` | 401 | No or invalid JWT token |
| `TOKEN_EXPIRED` | 401 | JWT has expired |
| `FORBIDDEN` | 403 | Authenticated but insufficient role |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Duplicate resource (e.g., email already registered) |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unhandled server error |
| `PAYMENT_FAILED` | 402 | Payment gateway rejected the transaction |
| `INSUFFICIENT_STOCK` | 409 | Requested quantity exceeds available stock |

---

## 1. Auth Service (`/api/v1/auth/*`)

### `POST /api/v1/auth/register`
**Auth:** None

```typescript
// Request
interface RegisterRequest {
  email?: string;          // Required if no phone
  phone?: string;          // Required if no email; Indian format: 10 digits starting 6-9
  password?: string;       // Min 8 chars, 1 uppercase, 1 digit, 1 special char
  role: 'consumer' | 'producer';
  referralCode?: string;   // Optional referral code from another user
  captchaToken: string;    // Google reCAPTCHA v3 token
}

// Response
interface RegisterResponse {
  userId: string;
  email?: string;
  phone?: string;
  role: string;
  message: string;         // "Verification email sent" or "OTP sent to phone"
}
```

**Business Logic:**
- Validates email uniqueness OR phone uniqueness.
- If email provided: sends 6-character email verification token (expires 24hr).
- If phone provided: sends OTP (expires 5min).
- Creates `users` row with `is_active = false` until verified.
- Creates empty `consumer_profiles` or `producer_profiles` row.
- Referral code validated and stored if provided; bonus credits added after first purchase.
- reCAPTCHA score < 0.5 returns `CAPTCHA_FAILED` error.

**Errors:** `CONFLICT` (email/phone in use), `VALIDATION_ERROR`, `CAPTCHA_FAILED`

---

### `POST /api/v1/auth/verify-email`
**Auth:** None

```typescript
interface VerifyEmailRequest {
  token: string;  // 6-character alphanumeric token from email
}

interface VerifyEmailResponse {
  message: string;  // "Email verified successfully"
  accessToken: string;
  refreshToken: string;  // Set as HTTP-only cookie
}
```

**Business Logic:** Sets `users.email_verified = true`, `is_active = true`. Issues JWT pair.

---

### `POST /api/v1/auth/send-otp`
**Auth:** None

```typescript
interface SendOtpRequest {
  phone: string;
  purpose: 'register' | 'login' | 'verify_phone' | 'reset_password';
}
```

**Business Logic:** Rate limited: 3 OTPs per phone per 10 min. Stores OTP in Redis (`otp:{phone}`) with 5-min TTL.

---

### `POST /api/v1/auth/verify-phone`
**Auth:** Bearer (self)

```typescript
interface VerifyPhoneRequest {
  phone: string;
  otp: string;  // 6 digits
}
```

**Business Logic:** Sets `phone_verified = true`. Max 5 attempts before 1hr lockout.

---

### `POST /api/v1/auth/login`
**Auth:** None

```typescript
interface LoginRequest {
  email: string;
  password: string;
  captchaToken?: string;  // Required after 3 failed attempts
  deviceFingerprint?: string;
}

interface LoginResponse {
  accessToken: string;    // RS256 JWT, 15min TTL
  user: {
    id: string;
    email: string;
    role: string;
    isVerified: boolean;
    mfaEnabled: boolean;
  };
  mfaRequired: boolean;   // True if MFA is enabled; withhold full token until MFA verified
}
```

**Business Logic:**
- Check `lockout_until`. If in future, return `ACCOUNT_LOCKED` with unlock time.
- On success: reset `login_attempts = 0`.
- On failure: increment `login_attempts`. At 5 attempts: set `lockout_until = NOW() + 30min`.
- If `mfaEnabled`: issue short-lived pre-MFA token (5min), require `/auth/mfa/verify` to get full token.
- New device login triggers email alert.
- Max 5 concurrent sessions: oldest session revoked.

**Errors:** `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `ACCOUNT_INACTIVE`, `CAPTCHA_REQUIRED`

---

### `POST /api/v1/auth/login/otp`
**Auth:** None

```typescript
interface OtpLoginRequest {
  phone: string;
  otp: string;
  deviceFingerprint?: string;
}
```

**Business Logic:** Same session management as password login. If phone not registered, creates new consumer account.

---

### `POST /api/v1/auth/login/google`
**Auth:** None

```typescript
interface GoogleLoginRequest {
  idToken: string;  // Google ID token from frontend OAuth flow
}

interface GoogleLoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: string; isNewUser: boolean; };
}
```

**Business Logic:** Verify ID token against Google's public keys. Create user if new. Link `oauth_provider = 'google'`.

---

### `POST /api/v1/auth/refresh`
**Auth:** Refresh token in HTTP-only cookie

```typescript
// No body needed; refresh token read from cookie

interface RefreshResponse {
  accessToken: string;  // New 15-min access token
}
```

**Business Logic:**
- Hash incoming refresh token with SHA-256; lookup in `user_sessions`.
- If found and active: issue new access token + rotate refresh token (old invalidated).
- If old token reused after rotation: detect reuse → invalidate entire session family → log security event.

**Errors:** `INVALID_REFRESH_TOKEN`, `SESSION_EXPIRED`, `TOKEN_REUSE_DETECTED`

---

### `POST /api/v1/auth/logout`
**Auth:** Bearer (any authenticated user)

```typescript
// No body
interface LogoutResponse {
  message: string;  // "Logged out successfully"
}
```

**Business Logic:** Adds `access_jti` to Redis blacklist. Deletes session row. Clears cookie.

---

### `POST /api/v1/auth/logout-all`
**Auth:** Bearer (any authenticated user)

Invalidates all active sessions for the user. All JTIs blacklisted in Redis.

---

### `POST /api/v1/auth/forgot-password`
**Auth:** None

```typescript
interface ForgotPasswordRequest {
  email: string;
  captchaToken: string;
}
```

**Business Logic:** If email exists, sends signed reset link (JWT signed with password-reset key, 1hr TTL). Always returns success to prevent email enumeration.

---

### `POST /api/v1/auth/reset-password`
**Auth:** None

```typescript
interface ResetPasswordRequest {
  token: string;    // From email link
  newPassword: string;  // Min 8 chars, complexity required
}
```

**Business Logic:** Validates token. Sets new `password_hash`. Logs out all existing sessions.

---

### `POST /api/v1/auth/mfa/setup`
**Auth:** Bearer (any authenticated user)

```typescript
interface MfaSetupResponse {
  secret: string;         // Base32 TOTP seed to show in UI
  qrCodeUrl: string;      // otpauth:// URL for QR code generation
  backupCodes: string[];  // 10 plaintext backup codes (shown once)
}
```

**Business Logic:** Generates TOTP secret via `speakeasy`. Encrypts with AES-256-GCM before storing. Backup codes hashed with bcrypt before storage.

---

### `POST /api/v1/auth/mfa/verify`
**Auth:** Bearer (pre-MFA token or full token)

```typescript
interface MfaVerifyRequest {
  code: string;  // 6-digit TOTP code OR 8-char backup code
}

interface MfaVerifyResponse {
  accessToken: string;   // Full-privilege access token (if pre-MFA token was used)
  mfaEnabled: boolean;   // true if this was a setup-verification, false for regular
}
```

**Business Logic:** Validates TOTP with ±1 time step tolerance. Backup codes are single-use (removed from array after use).

---

### `POST /api/v1/auth/mfa/disable`
**Auth:** Bearer (any authenticated user)

```typescript
interface MfaDisableRequest {
  password: string;  // Confirm identity with current password
  totpCode: string;  // Current TOTP code as second factor
}
```

---

### `GET /api/v1/auth/me`
**Auth:** Bearer (any authenticated user)

```typescript
interface MeResponse {
  id: string;
  email: string;
  phone: string;
  role: string;
  isActive: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  mfaEnabled: boolean;
  createdAt: string;
  profile: ProducerProfile | ConsumerProfile;  // Based on role
}
```

---

## 2. User/Profile Service

### `GET /api/v1/users/:id`
**Auth:** None (public profile)

Returns public user/producer profile. Sensitive fields (email, phone) omitted.

---

### `PATCH /api/v1/users/me`
**Auth:** Bearer (any)

```typescript
interface UpdateUserRequest {
  preferredLanguage?: 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml';
}
```

---

### `DELETE /api/v1/users/me`
**Auth:** Bearer (any)

```typescript
interface DeleteAccountRequest {
  password: string;    // Confirm with password
  reason?: string;     // Why they're leaving (optional analytics)
}
```

**Business Logic:** Initiates GDPR/DPDP erasure flow. Soft-deletes user, anonymizes PII, cancels pending orders, revokes sessions. See 05_SECURITY_RULES.md §7 for full erasure steps.

---

### `GET /api/v1/producers`
**Auth:** None

```typescript
// Query params
interface ProducerListQuery {
  page?: number;        // Default 1
  limit?: number;       // Default 20, max 100
  state?: string;
  district?: string;
  craftType?: string;
  isVerified?: boolean;
  isFeatured?: boolean;
  sortBy?: 'trust_score' | 'rating' | 'total_sales' | 'newest';
  search?: string;      // Full-text search on name, bio, craft_type
}

interface ProducerSummary {
  id: string;
  displayName: string;
  businessName: string;
  craftType: string;
  state: string;
  district: string;
  profileImageUrl: string;
  bannerImageUrl: string;
  avgRating: number;
  reviewCount: number;
  followerCount: number;
  totalSalesCount: number;
  isVerified: boolean;
  isFeatured: boolean;
  aiTrustScore: number;
  badges: string[];
  kycStatus: string;
}
```

---

### `GET /api/v1/producers/:id`
**Auth:** None

Returns full producer profile including badges, bank accounts (count only), recent posts, top products.

---

### `PATCH /api/v1/producers/me`
**Auth:** Bearer [producer]

```typescript
interface UpdateProducerRequest {
  displayName?: string;
  businessName?: string;
  bio?: string;
  craftType?: string;
  village?: string;
  pincode?: string;
  cooperativeName?: string;
  geoLocation?: { latitude: number; longitude: number };
  metadata?: Record<string, unknown>;
}
```

---

### `POST /api/v1/producers/me/badges`
**Auth:** Bearer [producer]

```typescript
interface BadgeClaimRequest {
  badgeType: 'gi_certified' | 'handloom_mark' | 'eco_friendly' | 'heritage_craft';
  issuedBy: string;
  issuedAt: string;     // ISO date
  expiresAt?: string;
  certificateFile: File;  // multipart/form-data
}
```

**Business Logic:** Uploads certificate to S3 (`kyc/{producerId}/badges/{uuid}.pdf`). Sets `is_verified = false` (pending admin review).

---

### `POST /api/v1/producers/me/bank-accounts`
**Auth:** Bearer [producer]

```typescript
interface AddBankAccountRequest {
  accountHolderName: string;
  bankName: string;
  branchName?: string;
  accountNumber: string;    // Encrypted before storage; never logged
  ifscCode: string;         // /^[A-Z]{4}0[A-Z0-9]{6}$/
  accountType: 'savings' | 'current';
  upiId?: string;
}
```

**Business Logic:** Account number encrypted with AES-256-GCM. Triggers Razorpay penny-drop verification (₹1 deposited + withdrawn to verify account). `is_verified` set true on success.

---

### `GET /api/v1/consumers/me/addresses`
**Auth:** Bearer [consumer]

Returns list of saved addresses sorted: default first, then by recency.

---

### `POST /api/v1/consumers/me/addresses`
**Auth:** Bearer [consumer]

```typescript
interface CreateAddressRequest {
  addressLabel: string;   // 'Home', 'Work', 'Other'
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;        // Must be 6-digit Indian pincode
  isDefault?: boolean;
}
```

**Business Logic:** Validates pincode against India Post API. If `isDefault = true`, unsets previous default. Max 10 addresses per user.

---

## 3. KYC Service (`/api/v1/kyc/*`)

### `POST /api/v1/kyc/submit`
**Auth:** Bearer [producer]
**Content-Type:** `multipart/form-data`

```typescript
interface KycSubmitRequest {
  // Form fields (JSON stringified as 'data' field)
  data: {
    gstin?: string;
    pan: string;
    aadhaarLast4: string;
    weaverId?: string;
    cooperativeRegistrationNo?: string;
  };
  // File fields (binary uploads)
  aadhaarFront: File;       // Required. JPEG/PNG/PDF, max 10MB
  aadhaarBack: File;        // Required
  panCard: File;            // Required
  gstinCertificate?: File;  // Required if gstin provided
  weaverIdCard?: File;
  shopPhoto?: File;
  workshopPhoto?: File;
}

interface KycSubmitResponse {
  submissionId: string;
  submissionNumber: string;  // e.g., KYC-2024-001234
  status: 'pending';
  message: string;
}
```

**Business Logic:**
1. Validate file MIME types and magic bytes.
2. Virus scan each file via ClamAV.
3. Strip EXIF from images.
4. Upload to private S3 bucket: `kyc/{producerId}/{submissionId}/{docType}/{uuid}.{ext}`.
5. Compute SHA-256 checksum per file.
6. Queue AI verification job (async): `kyc-verification-queue`.
7. Create `kyc_submissions` + `verification_documents` rows.
8. Notify producer: "KYC submitted, under review."

---

### `GET /api/v1/kyc/status`
**Auth:** Bearer [producer]

```typescript
interface KycStatusResponse {
  status: 'not_submitted' | 'pending' | 'under_review' | 'approved' | 'rejected' | 'expired';
  submittedAt?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  aiConfidenceScore?: number;
  resubmissionCount: number;
  canResubmit: boolean;
}
```

---

### `PATCH /api/v1/admin/kyc/:id/review`
**Auth:** Bearer [admin, super_admin]

```typescript
interface KycReviewRequest {
  decision: 'approved' | 'rejected';
  reviewNotes?: string;
  rejectionReason?: string;  // Required if rejected
}
```

**Business Logic:** On approval: sets `producer_profiles.kyc_status = 'approved'`, `is_verified = true`. Sends approval email/SMS. On rejection: `resubmission_count++`. If count >= 3, flags for manual escalation.

---

## 4. Product Service (`/api/v1/products/*`)

### `GET /api/v1/products`
**Auth:** None

```typescript
interface ProductListQuery {
  page?: number;
  limit?: number;
  categoryId?: string;
  craftType?: string;
  fabricType?: string;
  state?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  isGiCertified?: boolean;
  isHandmade?: boolean;
  producerId?: string;
  status?: 'active';         // Non-admin only sees active
  sortBy?: 'price_asc' | 'price_desc' | 'rating' | 'newest' | 'bestseller' | 'relevance';
  search?: string;
}

interface ProductListItem {
  id: string;
  title: string;
  slug: string;
  basePrice: number;
  mrp: number;
  avgRating: number;
  reviewCount: number;
  totalSold: number;
  status: string;
  isGiCertified: boolean;
  craftType: string;
  primaryImageUrl: string;
  producer: { id: string; displayName: string; state: string; isVerified: boolean; };
  variants: { id: string; stockQuantity: number; color: string; }[];
}
```

---

### `POST /api/v1/products`
**Auth:** Bearer [producer]

```typescript
interface CreateProductRequest {
  categoryId: string;
  title: string;              // 10-500 chars
  description: string;        // 50-10,000 chars
  shortDescription?: string;
  craftType: string;
  fabricType?: string;
  weaveTechnique?: string;
  basePrice: number;          // > 0, max 2 decimal places
  mrp: number;                // >= basePrice
  bulkPrice?: number;
  minBulkQuantity?: number;
  gstRate: 0 | 5 | 12 | 18 | 28;
  hsnCode: string;
  isHandmade?: boolean;       // Default true
  isGiCertified?: boolean;
  giTagName?: string;
  careInstructions?: string;
  originState?: string;
  originDistrict?: string;
  productionTimeDays?: number;
  weightGrams?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  searchTags?: string[];      // Max 20 tags
  variants: CreateVariantRequest[];
}

interface CreateVariantRequest {
  variantName: string;
  color?: string;
  size?: string;
  material?: string;
  skuSuffix: string;
  priceAdjustment?: number;
  stockQuantity: number;      // >= 0
  reorderPoint?: number;
  weightGrams?: number;
}

interface CreateProductResponse {
  id: string;
  sku: string;
  slug: string;
  status: 'draft';
  message: string;  // "Product created. Add images to publish."
}
```

**Business Logic:**
- Auto-generates SKU: `{producerId_prefix}-{categoryCode}-{nanoid(8)}`.
- Auto-generates slug from title (URL-safe, appends short ID for uniqueness).
- Producer must have `kyc_status = 'approved'` to publish (can create drafts without KYC).
- Syncs to Elasticsearch on publish.

---

### `GET /api/v1/products/:id`
**Auth:** None (active products); Bearer [producer] (own drafts)

```typescript
interface ProductDetailResponse {
  id: string;
  sku: string;
  title: string;
  slug: string;
  description: string;
  shortDescription: string;
  craftType: string;
  fabricType: string;
  weaveTechnique: string;
  basePrice: number;
  mrp: number;
  bulkPrice: number;
  minBulkQuantity: number;
  gstRate: number;
  hsnCode: string;
  status: string;
  isHandmade: boolean;
  isGiCertified: boolean;
  giTagName: string;
  careInstructions: string;
  originState: string;
  originDistrict: string;
  productionTimeDays: number;
  dimensions: { weightGrams: number; lengthCm: number; widthCm: number; heightCm: number };
  totalSold: number;
  avgRating: number;
  reviewCount: number;
  searchTags: string[];
  images: ProductImage[];
  variants: ProductVariant[];
  producer: ProducerSummary;
  category: { id: string; name: string; slug: string; path: string[] };
  relatedProducts: ProductListItem[];
}
```

---

### `PATCH /api/v1/products/:id`
**Auth:** Bearer [producer (own), admin]

Accepts partial updates to any field in `CreateProductRequest`. Status transitions:
- `draft` → `active`: requires at least 1 image and 1 variant with stock > 0.
- `active` → `inactive`: immediate.
- Any → `deleted`: soft-delete (status = 'deleted').

---

### `POST /api/v1/products/:id/images`
**Auth:** Bearer [producer (own), admin]
**Content-Type:** `multipart/form-data`

```typescript
// Form fields
interface ProductImageUploadRequest {
  images: File[];    // Multiple files; max 10 total per product; 8MB each
  altText?: string;
  isPrimary?: boolean;
}
```

**Business Logic:** Images processed through Sharp pipeline → WebP → S3 → CloudFront. Updates `products.updated_at`. Re-syncs Elasticsearch document.

---

### `GET /api/v1/products/:id/questions`
**Auth:** None

```typescript
interface ProductQuestionsResponse {
  questions: {
    id: string;
    question: string;
    answer: string | null;
    askedBy: { id: string; displayName: string };
    answeredAt: string | null;
    createdAt: string;
  }[];
}
```

---

### `POST /api/v1/products/:id/questions`
**Auth:** Bearer [consumer]

```typescript
interface AskQuestionRequest {
  question: string;  // 10-500 chars
}
```

**Business Logic:** Notifies producer via in-app + email notification.

---

### `PATCH /api/v1/products/:id/questions/:questionId/answer`
**Auth:** Bearer [producer (own product)]

```typescript
interface AnswerQuestionRequest {
  answer: string;  // 5-2000 chars
}
```

---

### `GET /api/v1/categories`
**Auth:** None

Returns full category tree (3 levels deep) as nested JSON. Cached in Redis for 1 hour.

---

## 5. Order Service (`/api/v1/orders/*`, `/api/v1/cart/*`)

### `GET /api/v1/cart`
**Auth:** Bearer (any)

```typescript
interface CartResponse {
  items: CartItem[];
  summary: {
    subtotal: number;
    itemCount: number;
    estimatedShipping: number;
    estimatedTotal: number;
  };
}

interface CartItem {
  id: string;
  product: { id: string; title: string; slug: string; primaryImageUrl: string; status: string };
  variant: { id: string; variantName: string; color: string; size: string; stockQuantity: number; price: number };
  quantity: number;
  savedForLater: boolean;
  addedAt: string;
  isAvailable: boolean;  // false if product inactive or out of stock
}
```

---

### `POST /api/v1/cart/items`
**Auth:** Bearer (any)

```typescript
interface AddToCartRequest {
  productId: string;
  variantId: string;
  quantity: number;  // 1-100
}
```

**Business Logic:** If item already in cart: updates quantity. Validates stock availability. Checks `stock_quantity - reserved_quantity >= requested_quantity`.

---

### `POST /api/v1/cart/checkout`
**Auth:** Bearer [consumer]

```typescript
interface CheckoutRequest {
  addressId: string;
  couponCode?: string;
}

interface CheckoutResponse {
  orders: {
    producerId: string;
    producerName: string;
    items: CartItem[];
    subtotal: number;
    shippingFee: number;
    discount: number;
    taxAmount: number;
    total: number;
    gstBreakdown: { cgst: number; sgst: number; igst: number };
  }[];
  totalAmount: number;
  couponApplied?: { code: string; discount: number };
}
```

**Business Logic:**
- Validates all cart items are active and in stock.
- Locks stock in Redis (`stock_lock:{variantId}:{checkoutId}`, 10-min TTL).
- Splits cart by producer (one order per producer).
- Computes GST: if buyer state == seller state → CGST+SGST; else → IGST.
- Validates coupon (usage limits, validity, minimum order, applicable categories).
- Computes shipping fee via logistics rate API.

**Errors:** `INSUFFICIENT_STOCK`, `COUPON_INVALID`, `COUPON_EXPIRED`, `COUPON_USAGE_EXCEEDED`

---

### `POST /api/v1/orders`
**Auth:** Bearer [consumer]

```typescript
interface CreateOrderRequest {
  checkoutSessionId: string;  // From POST /cart/checkout
  paymentMethod: 'upi' | 'card' | 'net_banking' | 'wallet' | 'cod' | 'emi';
  billingAddressId?: string;
  buyerNotes?: string;
}

interface CreateOrderResponse {
  orders: { orderId: string; orderNumber: string }[];
  razorpayOrderId?: string;   // Present for online payment methods
  razorpayKeyId?: string;     // Public Razorpay key for frontend SDK
  totalAmount: number;
  currency: 'INR';
}
```

**Business Logic:**
- Creates `orders` rows with `status = 'pending_payment'`.
- Creates `order_items` rows with price snapshots.
- Decrements `product_variants.reserved_quantity`.
- If COD: immediately sets `status = 'processing'`.
- If online: creates Razorpay order; amount locked server-side.
- Clears cart items that were converted to orders.

---

### `GET /api/v1/orders`
**Auth:** Bearer (role-dependent)

| Role | Sees |
|---|---|
| consumer | Own orders |
| producer | Orders for their products |
| admin/super_admin | All orders |

Query params: `status`, `page`, `limit`, `startDate`, `endDate`, `producerId`, `buyerId`.

---

### `PATCH /api/v1/orders/:id/status`
**Auth:** Bearer (role-dependent)

```typescript
interface UpdateOrderStatusRequest {
  status: order_status;
  trackingNumber?: string;
  logisticsProvider?: string;
  trackingUrl?: string;
  notes?: string;
}
```

**Allowed transitions by role:**
- producer: `processing` → `ready_to_ship` → `shipped`
- admin: any transition
- consumer: cannot directly update status (use cancel/return endpoints)

---

### `POST /api/v1/orders/:id/cancel`
**Auth:** Bearer [consumer (own, before shipped), admin]

```typescript
interface CancelOrderRequest {
  reason: string;
}
```

**Business Logic:** Cancellable only if `status IN ('pending_payment', 'payment_confirmed', 'processing')`. Releases stock reservation. Triggers refund if payment was made.

---

### `POST /api/v1/orders/:id/returns`
**Auth:** Bearer [consumer]
**Content-Type:** `multipart/form-data`

```typescript
interface ReturnRequestBody {
  data: {
    orderItemId: string;
    returnReason: string;
    description?: string;
  };
  images?: File[];  // Max 5, proof of damage/defect
}
```

**Business Logic:** Only allowed if `status = 'delivered'` and within 7 days of `delivered_at`. Creates `returns` row. Notifies producer and admin.

---

### `GET /api/v1/orders/:id/invoice`
**Auth:** Bearer [consumer (own), producer (own), admin]

Returns PDF invoice. Generated on-demand by backend PDF service. Cached in S3 after first generation. GST-compliant format.

---

## 6. Payment Service (`/api/v1/payments/*`)

### `POST /api/v1/payments/initiate`
**Auth:** Bearer [consumer]

```typescript
interface InitiatePaymentRequest {
  orderId: string;
  idempotencyKey: string;  // UUID; client generates for dedup
}

interface InitiatePaymentResponse {
  razorpayOrderId: string;
  razorpayKeyId: string;    // Public key for Razorpay SDK
  amount: number;           // In paise (INR * 100)
  currency: 'INR';
  transactionId: string;    // Internal transaction ref
}
```

---

### `POST /api/v1/payments/verify`
**Auth:** Bearer [consumer]

```typescript
interface VerifyPaymentRequest {
  razorpayPaymentId: string;
  razorpayOrderId: string;
  razorpaySignature: string;
}
```

**Business Logic:**
1. Verify signature: `HMAC-SHA256(razorpayOrderId + "|" + razorpayPaymentId, razorpayKeySecret)`.
2. Verify amount matches locked order total.
3. Update `transactions.status = 'success'`.
4. Update `orders.status = 'payment_confirmed'`.
5. Create `escrow_holds` row.
6. Release stock reservation locks.
7. Send order confirmation to buyer and seller.

---

### `POST /api/v1/payments/webhook`
**Auth:** None (IP whitelist + HMAC verification)

Handles Razorpay webhook events:
- `payment.captured`: same as verify flow
- `payment.failed`: update transaction to failed, release stock
- `refund.processed`: update return status
- `payout.processed`: update `seller_payouts.status = 'paid'`

**Security:** Raw body must be used for HMAC computation. Parse JSON after signature check.

---

### `GET /api/v1/payments/wallet`
**Auth:** Bearer (any)

```typescript
interface WalletResponse {
  balance: number;
  lockedBalance: number;
  currency: string;
  recentTransactions: WalletTransaction[];
}
```

---

### `GET /api/v1/producers/me/payouts`
**Auth:** Bearer [producer]

Returns payout history with `period_start`, `period_end`, `net_amount`, `tds_amount`, `status`.

---

### `POST /api/v1/admin/payouts/process`
**Auth:** Bearer [admin, super_admin]

```typescript
interface ProcessPayoutsRequest {
  periodStart: string;  // ISO date
  periodEnd: string;
  producerIds?: string[];  // If empty, process all eligible
}
```

**Business Logic:** Aggregates all `released` escrow holds in period. Deducts platform fee + TDS. Creates `seller_payouts` rows. Triggers Razorpay payout API batch.

---

## 7. B2B Service

### `POST /api/v1/rfq`
**Auth:** Bearer [consumer, producer (as buyer)]

```typescript
interface CreateRfqRequest {
  title: string;
  description: string;
  categoryId?: string;
  craftType?: string;
  fabricType?: string;
  quantityRequired: number;
  budgetMin?: number;
  budgetMax?: number;
  requiredByDate?: string;
  deliveryLocation: string;
  expiresInDays?: number;  // Default 30
  attachments?: File[];     // multipart/form-data
}
```

---

### `POST /api/v1/rfq/:rfqId/quotes`
**Auth:** Bearer [producer]

```typescript
interface SubmitQuoteRequest {
  quotedPricePerUnit: number;
  quantityAvailable: number;
  deliveryTimelineDays: number;
  notes?: string;
  validUntil: string;
  sampleImages?: File[];
}
```

---

### `POST /api/v1/rfq/:rfqId/quotes/:quoteId/accept`
**Auth:** Bearer [consumer]

**Business Logic:** Sets `rfq_quotes.is_accepted = true`, `rfq_requests.status = 'accepted'`. Notifies producer. Creates draft `purchase_orders` row.

---

## 8. Social Service (`/api/v1/social/*`)

### `POST /api/v1/social/posts`
**Auth:** Bearer [any authenticated]
**Content-Type:** `multipart/form-data`

```typescript
interface CreatePostRequest {
  data: {
    contentType: 'post' | 'reel' | 'story' | 'product_showcase';
    caption?: string;
    taggedProductIds?: string[];
    hashtags?: string[];
    location?: string;
  };
  media: File[];  // Images (JPEG/PNG/WebP) or video (MP4) for reels
}
```

**Business Logic:** Media processed asynchronously. Post created with `is_published = false` until media processing completes. Webhook/polling to check processing status.

---

### `GET /api/v1/social/feed`
**Auth:** Bearer (any); anonymous gets trending feed

```typescript
interface FeedQuery {
  page?: number;
  limit?: number;  // Max 50
  type?: 'following' | 'discover' | 'trending';
}
```

**Business Logic:** Feed algorithm:
1. `following`: posts from followed users, ranked by recency.
2. `discover`: ML-ranked posts based on `recommendation_signals`.
3. `trending`: top posts by engagement in last 24hr.
Cached per user in Redis for 5 minutes.

---

### `POST /api/v1/social/posts/:id/like`
**Auth:** Bearer (any authenticated)

Toggle like. Returns `{ liked: true, likeCount: 1234 }`. Updates `posts.like_count` via atomic Redis increment; flushed to DB every 5 minutes.

---

### `POST /api/v1/social/follow/:userId`
**Auth:** Bearer (any authenticated)

Toggle follow. Returns `{ following: true, followerCount: 500 }`. Updates `producer_profiles.follower_count`.

---

## 9. Scheme Service (`/api/v1/schemes/*`)

### `GET /api/v1/schemes`
**Auth:** None (but personalization requires Bearer)

```typescript
interface SchemeListQuery {
  page?: number;
  limit?: number;
  schemeType?: 'subsidy' | 'loan' | 'training' | 'insurance' | 'certification' | 'market_linkage';
  state?: string;
  craftType?: string;
  isEligible?: boolean;  // Only works if authenticated producer
}
```

---

### `GET /api/v1/schemes/recommended`
**Auth:** Bearer [producer]

Returns AI-recommended schemes based on producer profile (state, craft_type, kyc_status, income estimate). Uses eligibility rules in `schemes.eligibility_criteria` JSONB.

---

### `POST /api/v1/admin/schemes`
**Auth:** Bearer [admin, super_admin]

```typescript
interface CreateSchemeRequest {
  schemeCode: string;
  name: string;
  description: string;
  schemeType: string;
  ministry?: string;
  implementingAgency?: string;
  eligibilityCriteria: {
    minAge?: number;
    maxAge?: number;
    maxAnnualIncome?: number;
    occupationRequired?: string;
    registrationRequired?: boolean;
    statesApplicable?: string[];
    craftTypesApplicable?: string[];
  };
  benefitsDescription: string;
  benefitAmount?: number;
  applicationUrl?: string;
  validFrom?: string;
  validUntil?: string;
  statesApplicable?: string[];
  craftTypesApplicable?: string[];
}
```

---

## 10. AI Verification Service (`/api/v1/ai/*`)

### `POST /api/v1/ai/verify-document`
**Auth:** Bearer [producer, admin]

```typescript
interface DocumentVerifyRequest {
  documentType: 'aadhaar_front' | 'aadhaar_back' | 'pan' | 'gstin_certificate' | 'weaver_id_card' | 'gi_certificate';
  fileKey: string;  // S3 key of already-uploaded file
  kycSubmissionId: string;
}

interface DocumentVerifyResponse {
  documentId: string;
  aiVerified: boolean;
  confidenceScore: number;   // 0-1
  extractedData: {
    name?: string;
    documentNumber?: string;  // Masked: last 4 visible
    dateOfBirth?: string;
    address?: string;
    issuingAuthority?: string;
  };
  flags: string[];  // e.g., ['low_image_quality', 'possible_tampering']
}
```

**Business Logic:** Sends to AI verification microservice (internal). Uses AWS Textract for OCR + custom ML model for document authenticity. Results stored in `verification_documents.ai_extracted_data`.

---

### `GET /api/v1/ai/trust-score/:producerId`
**Auth:** Bearer [producer (own), admin]

```typescript
interface TrustScoreResponse {
  producerId: string;
  aiTrustScore: number;    // 0-100
  scoreBreakdown: {
    kycVerification: number;    // weight: 40%
    badgeCredentials: number;   // weight: 20%
    sellerReputation: number;   // weight: 20%
    transactionHistory: number; // weight: 10%
    socialEngagement: number;   // weight: 10%
  };
  updatedAt: string;
  nextUpdateScheduled: string;
}
```

---

### `POST /api/v1/ai/classify-product`
**Auth:** Bearer [producer]

```typescript
interface ClassifyProductRequest {
  title: string;
  description: string;
  imageFileKeys: string[];  // S3 keys of product images
}

interface ClassifyProductResponse {
  suggestedCategoryId: string;
  suggestedCategoryName: string;
  confidence: number;
  craftType: string;
  fabricType: string;
  suggestedHsnCode: string;
  suggestedGstRate: number;
  suggestedTags: string[];
}
```

---

## 11. Logistics Service (`/api/v1/logistics/*`)

### `POST /api/v1/logistics/shipment`
**Auth:** Bearer [producer]

```typescript
interface CreateShipmentRequest {
  orderId: string;
  logisticsProvider: 'shiprocket' | 'delhivery' | 'ekart' | 'self';
  packageWeight: number;    // grams
  packageDimensions: { length: number; width: number; height: number };  // cm
  pickupDate?: string;
}

interface CreateShipmentResponse {
  shipmentId: string;
  trackingNumber: string;
  trackingUrl: string;
  estimatedDeliveryDate: string;
  label: string;  // Base64 PDF shipping label
}
```

---

### `POST /api/v1/logistics/estimate`
**Auth:** None

```typescript
interface ShippingEstimateRequest {
  fromPincode: string;
  toPincode: string;
  weightGrams: number;
  codAmount?: number;
}

interface ShippingEstimateResponse {
  providers: {
    name: string;
    price: number;
    estimatedDays: number;
    isCodAvailable: boolean;
  }[];
}
```

---

## 12. Review Service (`/api/v1/reviews/*`)

### `POST /api/v1/reviews`
**Auth:** Bearer [consumer]

```typescript
interface CreateReviewRequest {
  orderId: string;
  productId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title?: string;
  body: string;          // 20-5000 chars
  mediaFiles?: File[];   // Max 5 images + 1 video
}
```

**Business Logic:**
- Validates `order.status = 'delivered'` and `order.buyer_id = currentUser.id`.
- Only one review per (orderId, productId, reviewerId).
- Review saved with `is_approved = false`; runs AI content moderation.
- If AI confidence > 0.9 safe: auto-approve.
- Else: queued for human review.
- On approval: updates `products.avg_rating` and `review_count` via atomic update.

---

### `GET /api/v1/reviews/product/:productId`
**Auth:** None

```typescript
interface ReviewListQuery {
  page?: number;
  limit?: number;  // Default 20
  sortBy?: 'newest' | 'highest_rated' | 'lowest_rated' | 'most_helpful';
  filterRating?: 1 | 2 | 3 | 4 | 5;
  withMedia?: boolean;
}

interface ReviewResponse {
  id: string;
  rating: number;
  title: string;
  body: string;
  isVerifiedPurchase: boolean;
  helpfulCount: number;
  media: { url: string; type: 'image' | 'video' }[];
  reviewer: { id: string; displayName: string; avatarUrl: string; totalReviews: number };
  createdAt: string;
}
```

---

## 13. Admin Service (`/api/v1/admin/*`)

### `GET /api/v1/admin/dashboard`
**Auth:** Bearer [admin, super_admin]

```typescript
interface DashboardResponse {
  summary: {
    totalUsers: number;
    activeUsers24h: number;
    newUsersToday: number;
    totalProducers: number;
    verifiedProducers: number;
    pendingKyc: number;
    totalOrders: number;
    ordersToday: number;
    totalRevenue: number;
    revenueToday: number;
    pendingDisputes: number;
    pendingReports: number;
  };
  recentOrders: OrderSummary[];
  recentDisputes: DisputeSummary[];
}
```

---

### `PATCH /api/v1/admin/users/:id/block`
**Auth:** Bearer [admin, super_admin]

```typescript
interface BlockUserRequest {
  blocked: boolean;
  reason?: string;  // Required when blocking
}
```

**Business Logic:** If blocking: revokes all sessions, cancels active orders, logs to `admin_actions`.

---

### `PATCH /api/v1/admin/disputes/:id/resolve`
**Auth:** Bearer [admin, super_admin]

```typescript
interface ResolveDisputeRequest {
  decision: 'resolved_buyer' | 'resolved_seller' | 'closed';
  resolution: string;
  refundAmount?: number;  // If resolved in buyer's favor
}
```

---

### `GET /api/v1/admin/analytics/revenue`
**Auth:** Bearer [admin, super_admin]

```typescript
interface RevenueAnalyticsQuery {
  period: 'day' | 'week' | 'month' | 'year';
  startDate?: string;
  endDate?: string;
  groupBy?: 'day' | 'week' | 'month';
}

interface RevenueAnalyticsResponse {
  totalRevenue: number;
  totalOrders: number;
  platformFees: number;
  tdsDeducted: number;
  netPayouts: number;
  averageOrderValue: number;
  chartData: { period: string; revenue: number; orders: number }[];
  topProducers: { producerId: string; name: string; revenue: number }[];
  topCategories: { categoryId: string; name: string; revenue: number }[];
}
```

---

## 14. Search Service (`/api/v1/search/*`)

### `GET /api/v1/search/products`
**Auth:** None

```typescript
interface ProductSearchQuery {
  q: string;               // Search query
  page?: number;
  limit?: number;
  // Facets
  category?: string;
  craftType?: string[];
  fabricType?: string[];
  state?: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  isGiCertified?: boolean;
  isHandmade?: boolean;
  sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'newest' | 'bestseller';
}

interface ProductSearchResponse {
  results: ProductListItem[];
  meta: { page: number; limit: number; total: number };
  facets: {
    craftTypes: { value: string; count: number }[];
    fabricTypes: { value: string; count: number }[];
    states: { value: string; count: number }[];
    priceRanges: { range: string; count: number }[];
    ratings: { rating: number; count: number }[];
  };
  queryId: string;   // For analytics click tracking
}
```

**Business Logic:** Query sent to Elasticsearch. Boosting factors:
- `is_verified` producer: +1.5x
- `ai_trust_score > 70`: +1.2x
- `avg_rating > 4`: +1.1x
- Personalized re-ranking if authenticated (based on user preferences from `recommendation_signals`).

---

### `GET /api/v1/search/autocomplete`
**Auth:** None

```typescript
interface AutocompleteQuery {
  q: string;      // Minimum 2 characters
  limit?: number; // Default 8, max 15
}

interface AutocompleteResponse {
  suggestions: {
    type: 'product' | 'producer' | 'category' | 'craft' | 'query';
    text: string;
    imageUrl?: string;
    id?: string;
  }[];
}
```

**Business Logic:** Checks Redis `autocomplete:{prefix}` first (1hr TTL). Falls back to Elasticsearch prefix query.

---

### `GET /api/v1/search/similar/:productId`
**Auth:** None

Returns 12 similar products using collaborative filtering signals from `recommendation_signals`. Falls back to same category + similar price range if insufficient signal data.
