# 05 — Security Rules
# Tanthavi Handloom Marketplace — Authoritative Security Reference

> **Version:** 1.0.0 | **Classification:** Internal — Engineering & AI Agents
> This document is the authoritative security specification. Every feature touching authentication, data handling, payments, or user input MUST comply with these rules. Deviations require explicit super_admin sign-off and must be documented.

---

## Table of Contents

1. [Authentication & Token Lifecycle](#1-authentication--token-lifecycle)
2. [Input Validation Rules](#2-input-validation-rules)
3. [File Upload Security](#3-file-upload-security)
4. [Payment Security](#4-payment-security)
5. [RBAC Enforcement](#5-rbac-enforcement)
6. [Data Encryption](#6-data-encryption)
7. [PII Handling](#7-pii-handling)
8. [Fraud Detection Rules](#8-fraud-detection-rules)
9. [API Rate Limits](#9-api-rate-limits)
10. [HTTP Security Headers & CORS](#10-http-security-headers--cors)
11. [GST / Tax Compliance](#11-gst--tax-compliance)

---

## 1. Authentication & Token Lifecycle

### 1.1 JWT Access Token

| Property | Value |
|---|---|
| Algorithm | `RS256` (asymmetric — private key signs, public key verifies) |
| TTL | 15 minutes |
| Transport | `Authorization: Bearer {token}` header |
| Storage (client) | In-memory only (never localStorage/sessionStorage) |
| Key storage | RSA private key in AWS KMS (never on application server disk) |

**JWT Payload:**

```typescript
interface JwtPayload {
  sub: string;        // userId (UUID)
  jti: string;        // Unique token ID (nanoid, used for blacklisting)
  role: UserRole;     // 'consumer' | 'producer' | 'admin' | 'super_admin' | 'partner_agent'
  sessionId: string;  // References user_sessions.id
  iat: number;        // Issued at (UNIX timestamp)
  exp: number;        // Expiry (iat + 900 seconds)
}
```

**Signing Process:**

```typescript
// NestJS JwtService config
const jwtConfig = {
  algorithm: 'RS256',
  privateKey: await kms.getSigningKey('tanthavi-jwt-signing-key'),
  publicKey: await kms.getPublicKey('tanthavi-jwt-signing-key'),
  expiresIn: '15m',
};
```

**Invalidation:**
- On logout: add `jti` to Redis SET `blacklisted_jtis` with TTL = remaining token lifetime.
- JWT middleware checks Redis for `blacklisted_jtis:{jti}` before allowing request.
- On password change: all existing JTIs for the user are blacklisted via set scan.

---

### 1.2 JWT Refresh Token

| Property | Value |
|---|---|
| Algorithm | `HS256` with 512-bit secret |
| Secret storage | AWS Secrets Manager (`tanthavi/jwt/refresh-secret`) |
| TTL | 30 days (sliding window — resets on each use) |
| Storage (server) | SHA-256 hash stored in `user_sessions.refresh_token_hash` |
| Transport | HTTP-only cookie: `refreshToken` |
| Cookie flags | `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth/refresh` |

**Refresh Token Rotation:**

```typescript
async function rotateRefreshToken(oldToken: string, sessionId: string): Promise<string> {
  // 1. Hash the incoming token
  const hash = crypto.createHash('sha256').update(oldToken).digest('hex');

  // 2. Lookup in DB
  const session = await db.userSessions.findOne({ id: sessionId, refreshTokenHash: hash, isActive: true });

  if (!session) {
    // Token not found — could be reuse attack
    // Invalidate entire session family
    await db.userSessions.updateMany({ userId: session.userId }, { isActive: false });
    throw new SecurityError('TOKEN_REUSE_DETECTED');
  }

  if (new Date() > session.expiresAt) {
    throw new AuthError('SESSION_EXPIRED');
  }

  // 3. Generate new refresh token
  const newToken = crypto.randomBytes(64).toString('hex');
  const newHash = crypto.createHash('sha256').update(newToken).digest('hex');

  // 4. Update session atomically
  await db.userSessions.update(sessionId, {
    refreshTokenHash: newHash,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  // 5. Return new token (set in HTTP-only cookie by caller)
  return newToken;
}
```

---

### 1.3 OTP Authentication

| Property | Value |
|---|---|
| Length | 6 digits (`Math.floor(Math.random() * 900000) + 100000`) |
| Validity | 5 minutes |
| Redis key | `otp:{phone}` |
| Max attempts | 5 per OTP code |
| Attempt counter | `otp_attempts:{phone}`, TTL 1 hour |
| Send rate limit | 3 OTPs per phone per 10 minutes (`otp_send_count:{phone}`) |
| Primary provider | MSG91 (India) |
| Fallback provider | Twilio |
| Algorithm | HMAC-based; compare with `crypto.timingSafeEqual()` |

```typescript
async function verifyOtp(phone: string, submittedOtp: string): Promise<boolean> {
  const attemptsKey = `otp_attempts:${phone}`;
  const attempts = await redis.incr(attemptsKey);
  await redis.expire(attemptsKey, 3600);

  if (attempts > 5) {
    throw new AuthError('OTP_MAX_ATTEMPTS_EXCEEDED');
  }

  const storedOtp = await redis.get(`otp:${phone}`);
  if (!storedOtp) throw new AuthError('OTP_EXPIRED');

  // Constant-time comparison to prevent timing attacks
  const valid = crypto.timingSafeEqual(
    Buffer.from(storedOtp, 'utf8'),
    Buffer.from(submittedOtp, 'utf8')
  );

  if (valid) {
    await redis.del(`otp:${phone}`);
    await redis.del(attemptsKey);
  }

  return valid;
}
```

---

### 1.4 Account Lockout Policy

| Trigger | Consecutive failed password attempts |
|---|---|
| Threshold | 5 attempts |
| Initial lockout | 30 minutes |
| Progressive doubling | Each subsequent lockout doubles: 30min → 60min → 120min → ... → max 24hr |
| Max lockout | 24 hours |
| Reset | Successful login OR admin action |
| Storage | `users.lockout_until` (TIMESTAMPTZ), `users.login_attempts` (SMALLINT) |
| Notification | Email sent to registered email on first lockout |

```typescript
async function handleFailedLogin(userId: string): Promise<void> {
  const user = await db.users.increment(userId, 'loginAttempts');

  if (user.loginAttempts >= 5) {
    const previousLockouts = user.metadata?.lockoutCount ?? 0;
    const lockoutMinutes = Math.min(30 * Math.pow(2, previousLockouts), 1440); // max 24hr
    const lockoutUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000);

    await db.users.update(userId, {
      lockoutUntil,
      'metadata.lockoutCount': previousLockouts + 1,
    });

    await emailService.sendLockoutNotification(user.email, lockoutUntil);
  }
}
```

---

### 1.5 CAPTCHA Trigger Conditions

| Condition | Provider | Action |
|---|---|---|
| 3+ failed login attempts from same IP | reCAPTCHA v3 | Require score > 0.5 |
| Login from new unrecognized device | reCAPTCHA v3 | Challenge if score < 0.7 |
| Account registration from TOR/VPN IP | reCAPTCHA v3 | Require score > 0.8 |
| Password reset request | reCAPTCHA v3 | Require score > 0.5 |
| OTP send request (first time) | reCAPTCHA v3 | Require score > 0.4 |

**Server-side CAPTCHA verification:**

```typescript
async function verifyCaptcha(token: string, action: string): Promise<boolean> {
  const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    body: new URLSearchParams({
      secret: process.env.RECAPTCHA_SECRET_KEY,
      response: token,
    }),
  });
  const data = await response.json();

  return data.success && data.action === action && data.score >= 0.5;
}
```

---

### 1.6 Session Management

| Property | Rule |
|---|---|
| Max concurrent sessions | 5 per user |
| Overflow policy | Oldest session (by `created_at`) revoked automatically |
| Session data | Tracked in `user_sessions` table: IP, user-agent, device fingerprint, expiry |
| Admin revocation | Admin can call `DELETE /api/v1/admin/users/:id/sessions/:sessionId` |
| Self-service | User can view and revoke sessions from account settings |

---

## 2. Input Validation Rules

### 2.1 Email

```typescript
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

function validateEmail(email: string): ValidationResult {
  // 1. Max length
  if (email.length > 255) return { valid: false, message: 'Email exceeds 255 characters' };

  // 2. Regex check (RFC 5322 simplified)
  if (!EMAIL_REGEX.test(email)) return { valid: false, message: 'Invalid email format' };

  // 3. Normalize
  const normalized = email.toLowerCase().trim();

  // 4. Disposable domain check
  const domain = normalized.split('@')[1];
  if (DISPOSABLE_EMAIL_DOMAINS.includes(domain)) {
    return { valid: false, message: 'Disposable email addresses are not allowed' };
  }

  return { valid: true, value: normalized };
}
```

Disposable domain list: maintained as `src/config/disposable-email-domains.txt` (2000+ entries, updated monthly).

---

### 2.2 Phone Number

```typescript
// Indian mobile: starts with 6-9, exactly 10 digits
const INDIAN_PHONE_REGEX = /^[6-9]\d{9}$/;
// International E.164
const INTL_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

function validatePhone(phone: string): ValidationResult {
  // Strip spaces, dashes, parentheses
  const cleaned = phone.replace(/[\s\-().]/g, '');

  if (INDIAN_PHONE_REGEX.test(cleaned)) return { valid: true, value: `+91${cleaned}` };
  if (INTL_PHONE_REGEX.test(cleaned)) return { valid: true, value: cleaned };

  return { valid: false, message: 'Invalid phone number. Use 10-digit Indian mobile or E.164 international format.' };
}
```

---

### 2.3 GSTIN

```typescript
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const VALID_STATE_CODES = ['01','02','03','04','05','06','07','08','09','10','11','12','13',
  '14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30',
  '31','32','33','34','35','36','37','38'];

function validateGstin(gstin: string): ValidationResult {
  if (gstin.length !== 15) return { valid: false, message: 'GSTIN must be exactly 15 characters' };
  if (!GSTIN_REGEX.test(gstin)) return { valid: false, message: 'Invalid GSTIN format' };

  const stateCode = gstin.substring(0, 2);
  if (!VALID_STATE_CODES.includes(stateCode)) {
    return { valid: false, message: `Invalid state code '${stateCode}' in GSTIN` };
  }

  // Luhn-style check digit validation for GSTIN
  if (!validateGstinCheckDigit(gstin)) {
    return { valid: false, message: 'GSTIN check digit validation failed' };
  }

  return { valid: true, value: gstin.toUpperCase() };
}

function validateGstinCheckDigit(gstin: string): boolean {
  const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let factor = 2;
  let sum = 0;
  const codeLength = CHARS.length;

  for (let i = gstin.length - 2; i >= 0; i--) {
    let addend = factor * CHARS.indexOf(gstin[i]);
    factor = factor === 2 ? 1 : 2;
    addend = Math.floor(addend / codeLength) + (addend % codeLength);
    sum += addend;
  }
  const remainder = sum % codeLength;
  const checkCodeIndex = (codeLength - remainder) % codeLength;
  return CHARS[checkCodeIndex] === gstin[gstin.length - 1];
}
```

---

### 2.4 PAN

```typescript
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const PAN_ENTITY_TYPES: Record<string, string> = {
  'P': 'Individual',
  'C': 'Company',
  'H': 'Hindu Undivided Family',
  'F': 'Firm',
  'A': 'Association of Persons',
  'T': 'Trusts',
  'B': 'Body of Individuals',
  'L': 'Local Authority',
  'J': 'Artificial Juridical Person',
  'G': 'Government',
};

function validatePan(pan: string): ValidationResult {
  const upper = pan.toUpperCase().trim();
  if (!PAN_REGEX.test(upper)) {
    return { valid: false, message: 'PAN must be 10 characters: AAAAA9999A format' };
  }

  const entityCode = upper[3];
  if (!PAN_ENTITY_TYPES[entityCode]) {
    return { valid: false, message: `Invalid entity type character '${entityCode}' in PAN` };
  }

  return { valid: true, value: upper, entityType: PAN_ENTITY_TYPES[entityCode] };
}
```

---

### 2.5 Aadhaar

> **CRITICAL SECURITY RULE:** The full Aadhaar number MUST NEVER be stored in any database, log, or file on Tanthavi systems. Only the last 4 digits are stored (`aadhaar_last4 CHAR(4)`).

```typescript
const AADHAAR_REGEX = /^\d{12}$/;

function validateAndProcessAadhaar(aadhaar: string): AadhaarProcessResult {
  const cleaned = aadhaar.replace(/\s/g, '');

  // 1. Format check
  if (!AADHAAR_REGEX.test(cleaned)) {
    return { valid: false, message: 'Aadhaar must be exactly 12 digits' };
  }

  // 2. Verhoeff algorithm check digit
  if (!verhoeffCheck(cleaned)) {
    return { valid: false, message: 'Aadhaar number failed checksum validation' };
  }

  // 3. Extract only last 4 digits for storage
  const last4 = cleaned.slice(-4);

  // 4. Hash full number for deduplication check (SHA-256)
  const hash = crypto.createHash('sha256').update(cleaned + process.env.AADHAAR_HASH_SALT).digest('hex');

  // NEVER return full aadhaar number after this point
  return { valid: true, last4, hash };
}

// Verhoeff Algorithm implementation
function verhoeffCheck(number: string): boolean {
  const d = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],
    [2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],
    [4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
    [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],
    [8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
  const p = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],
    [5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],
    [9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],
    [2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
  const inv = [0,4,3,2,1,9,8,7,6,5];

  let check = 0;
  const digits = number.split('').reverse().map(Number);
  for (let i = 0; i < digits.length; i++) {
    check = d[check][p[i % 8][digits[i]]];
  }
  return check === 0;
}
```

---

### 2.6 Amounts and Quantities

```typescript
function validateAmount(amount: unknown, context: 'product_price' | 'order_total' | 'refund'): ValidationResult {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return { valid: false, message: 'Amount must be a number' };
  }

  // Max 2 decimal places
  if (Math.round(amount * 100) !== amount * 100) {
    return { valid: false, message: 'Amount cannot have more than 2 decimal places' };
  }

  const limits: Record<string, { min: number; max: number }> = {
    product_price: { min: 0.01, max: 10_000_000 },
    order_total: { min: 1, max: 50_000_000 },
    refund: { min: 0.01, max: 50_000_000 },
  };

  const { min, max } = limits[context];
  if (amount < min || amount > max) {
    return { valid: false, message: `Amount must be between ₹${min} and ₹${max.toLocaleString('en-IN')}` };
  }

  return { valid: true, value: Math.round(amount * 100) / 100 };
}

function validateQuantity(qty: unknown): ValidationResult {
  if (!Number.isInteger(qty) || (qty as number) < 1 || (qty as number) > 10000) {
    return { valid: false, message: 'Quantity must be an integer between 1 and 10,000' };
  }
  return { valid: true };
}
```

---

### 2.7 Text Fields

```typescript
import DOMPurify from 'isomorphic-dompurify';

const TEXT_FIELD_RULES = {
  product_title:       { min: 10, max: 500 },
  product_description: { min: 50, max: 10000 },
  bio:                 { min: 0, max: 500 },
  comment:             { min: 1, max: 2000 },
  review_body:         { min: 20, max: 5000 },
  coupon_code:         { min: 3, max: 50, pattern: /^[A-Z0-9_-]+$/ },
};

function sanitizeText(text: string, fieldType: keyof typeof TEXT_FIELD_RULES): ValidationResult {
  // 1. Strip null bytes and control characters
  const cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 2. HTML sanitization (allow no HTML in all text fields)
  const sanitized = DOMPurify.sanitize(cleaned, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });

  const rules = TEXT_FIELD_RULES[fieldType];

  // 3. Length check
  if (sanitized.length < rules.min) {
    return { valid: false, message: `${fieldType} must be at least ${rules.min} characters` };
  }
  if (sanitized.length > rules.max) {
    return { valid: false, message: `${fieldType} must not exceed ${rules.max} characters` };
  }

  // 4. Pattern check (if applicable)
  if (rules.pattern && !rules.pattern.test(sanitized)) {
    return { valid: false, message: `${fieldType} contains invalid characters` };
  }

  return { valid: true, value: sanitized };
}
```

---

### 2.8 Pagination

```typescript
function validatePagination(page: unknown, limit: unknown): { page: number; limit: number } {
  const p = Math.max(1, parseInt(String(page ?? '1'), 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(String(limit ?? '20'), 10) || 20));
  return { page: p, limit: l };
}
```

---

## 3. File Upload Security

### 3.1 Magic Byte Validation

```typescript
const MAGIC_BYTES: Record<string, Buffer[]> = {
  'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/png':  [Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])],
  'image/webp': [Buffer.from([0x52, 0x49, 0x46, 0x46])],  // RIFF
  'application/pdf': [Buffer.from([0x25, 0x50, 0x44, 0x46])],  // %PDF
  'video/mp4': [
    Buffer.from([0x66, 0x74, 0x79, 0x70]),  // ftyp (offset 4)
    Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]),
  ],
};

async function validateMagicBytes(fileBuffer: Buffer, declaredMime: string): Promise<boolean> {
  const signatures = MAGIC_BYTES[declaredMime];
  if (!signatures) return false;

  return signatures.some(sig => {
    const offset = declaredMime === 'video/mp4' ? 4 : 0;
    return fileBuffer.slice(offset, offset + sig.length).equals(sig);
  });
}
```

---

### 3.2 KYC Documents

| Property | Rule |
|---|---|
| Allowed MIME | `image/jpeg`, `image/png`, `application/pdf` |
| Max size | 10 MB per file |
| Magic bytes | Required (see §3.1) |
| Virus scan | ClamAV scan before S3 write |
| S3 bucket | `tanthavi-kyc-private` (Block All Public Access) |
| S3 path | `kyc/{producerId}/{submissionId}/{documentType}/{uuid}.{ext}` |
| Access | Presigned URL only (1-hour TTL), proxied through backend with auth check |
| EXIF stripping | For images: strip EXIF via Sharp before storage |

**Upload pipeline:**

```typescript
async function processKycDocument(file: Express.Multer.File, context: KycContext): Promise<string> {
  // 1. Size check
  if (file.size > 10 * 1024 * 1024) throw new ValidationError('File exceeds 10MB limit');

  // 2. MIME type validation
  const allowedMimes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (!allowedMimes.includes(file.mimetype)) throw new ValidationError('Invalid file type');

  // 3. Magic byte validation
  const validMagic = await validateMagicBytes(file.buffer, file.mimetype);
  if (!validMagic) throw new SecurityError('File magic bytes do not match declared MIME type');

  // 4. Virus scan
  const scanResult = await clamav.scan(file.buffer);
  if (!scanResult.clean) throw new SecurityError(`Malware detected: ${scanResult.signature}`);

  // 5. EXIF strip (for images)
  let processedBuffer = file.buffer;
  if (file.mimetype.startsWith('image/')) {
    processedBuffer = await sharp(file.buffer).withMetadata(false).toBuffer();
  }

  // 6. SHA-256 checksum
  const checksum = crypto.createHash('sha256').update(processedBuffer).digest('hex');

  // 7. Upload to S3
  const key = `kyc/${context.producerId}/${context.submissionId}/${context.documentType}/${nanoid()}.${getExtension(file.mimetype)}`;
  await s3.putObject({
    Bucket: 'tanthavi-kyc-private',
    Key: key,
    Body: processedBuffer,
    ContentType: file.mimetype,
    ServerSideEncryption: 'aws:kms',
    SSEKMSKeyId: process.env.KMS_KEY_ID,
  });

  return key;
}
```

---

### 3.3 Product Images

| Property | Rule |
|---|---|
| Allowed MIME | `image/jpeg`, `image/png`, `image/webp` |
| Max size | 8 MB per file |
| Max per product | 10 images |
| Processing | Strip EXIF → resize to max 2000×2000px (preserve AR) → generate 400px + 800px thumbnails → convert to WebP |
| S3 path | `products/{producerId}/{productId}/images/{uuid}-{size}.webp` |
| CDN | CloudFront (`cdn.tanthavi.com`) |
| Cache-Control | `public, max-age=31536000, immutable` (images are versioned by UUID) |

---

### 3.4 Video (Reels)

| Property | Rule |
|---|---|
| Allowed MIME | `video/mp4` only |
| Max size | 100 MB |
| Max duration | 60 seconds |
| Magic bytes | Required: `ftyp` at offset 4 |
| Transcoding | AWS MediaConvert → H.264/AAC, max 1080p, bitrate adaptive |
| S3 path (raw) | `social/{userId}/{postId}/video/raw/{uuid}.mp4` |
| S3 path (processed) | `social/{userId}/{postId}/video/{uuid}_{quality}.mp4` |

---

## 4. Payment Security

### 4.1 Razorpay Webhook Signature Verification

```typescript
import crypto from 'crypto';

async function verifyRazorpayWebhook(
  rawBody: Buffer,
  signature: string,
  secret: string
): Promise<boolean> {
  // 1. Compute expected signature using raw body (NOT parsed JSON)
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // 2. Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(signature, 'hex')
    );
  } catch {
    // Buffers of different lengths throw — means mismatch
    return false;
  }
}

// NestJS middleware — must use raw body
@Controller('payments')
export class PaymentController {
  @Post('webhook')
  @UseGuards(RazorpayWebhookGuard)
  async handleWebhook(
    @RawBody() rawBody: Buffer,
    @Headers('x-razorpay-signature') signature: string,
    @Body() payload: RazorpayWebhookPayload,
  ) {
    const webhookSecret = await secretsManager.getSecret('tanthavi/razorpay/webhook-secret');
    const isValid = await verifyRazorpayWebhook(rawBody, signature, webhookSecret);

    if (!isValid) {
      this.logger.warn('Invalid Razorpay webhook signature', { signature });
      throw new BadRequestException('Invalid webhook signature');
    }

    // Process idempotently
    await this.paymentsService.processWebhookEvent(payload);
    return { status: 'ok' };
  }
}
```

---

### 4.2 Idempotency

```typescript
async function withIdempotency<T>(
  key: string,
  handler: () => Promise<T>
): Promise<T> {
  const cacheKey = `idempotency:${key}`;

  // Check if result already exists
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as T;
  }

  // Execute handler
  const result = await handler();

  // Cache result for 24 hours
  await redis.setex(cacheKey, 86400, JSON.stringify(result));

  return result;
}
```

**Rules:**
- `Idempotency-Key` is a UUID generated by the client per payment attempt.
- Backend validates UUID format before using as Redis key.
- Stored results expire after 24 hours.
- If same key sent with different parameters (different amount): return `409 CONFLICT`.

---

### 4.3 Payment Flow Security

```typescript
async function verifyPaymentAmount(orderId: string, gatewayAmount: number): Promise<void> {
  const order = await db.orders.findById(orderId);

  // Amount from gateway is in paise; convert to rupees
  const gatewayAmountRupees = gatewayAmount / 100;

  // Allow for ±0.01 floating point tolerance (do NOT trust client-passed amounts)
  if (Math.abs(gatewayAmountRupees - order.totalAmount) > 0.01) {
    // Log as potential fraud
    await fraudDetection.flagSuspiciousPayment({
      orderId,
      expectedAmount: order.totalAmount,
      receivedAmount: gatewayAmountRupees,
      severity: 'HIGH',
    });

    // Initiate refund for the received amount
    await razorpay.refunds.create({ payment_id: gatewayPaymentId, amount: gatewayAmount });

    throw new PaymentError('AMOUNT_MISMATCH', 'Payment amount does not match order total');
  }
}
```

**Rules:**
- Server-side order amount is the source of truth; client-side amounts are NEVER trusted.
- Razorpay order is created with the server-computed amount (in paise).
- PCI DSS compliance: card numbers never touch Tanthavi servers; handled entirely by Razorpay tokenization.
- `gateway_signature` stored in `transactions` table for idempotency; cleared after 30 days via scheduled job.

---

### 4.4 Refund Authorization Rules

| Refund Type | Who Can Initiate | Conditions |
|---|---|---|
| Full refund (cancelled order) | System auto-trigger | Order cancelled before shipment |
| Return refund | Admin | Return approved + item received |
| Partial refund | Admin only | Admin discretion (disputes, price adjustments) |
| Manual refund | Super admin only | Any situation; logged in `admin_actions` |

```typescript
async function authorizeRefund(
  orderId: string,
  refundAmount: number,
  initiatorRole: UserRole
): Promise<void> {
  const order = await db.orders.findById(orderId);
  const originalPayment = await db.transactions.findByOrderAndType(orderId, 'payment');

  // Refund cannot exceed original payment
  if (refundAmount > originalPayment.amount) {
    throw new ValidationError('Refund amount cannot exceed original payment amount');
  }

  // Partial refunds only by admin
  const isPartial = refundAmount < originalPayment.amount;
  if (isPartial && !['admin', 'super_admin'].includes(initiatorRole)) {
    throw new ForbiddenError('Partial refunds can only be initiated by admin');
  }

  // Verify order is in refundable state
  const refundableStatuses = ['delivered', 'cancelled', 'returned', 'return_requested'];
  if (!refundableStatuses.includes(order.status)) {
    throw new ValidationError(`Cannot refund order in '${order.status}' status`);
  }
}
```

---

### 4.5 Escrow Rules

| Event | Escrow Action |
|---|---|
| `payment_confirmed` | Create `escrow_holds` row; amount locked |
| 7 days after `delivered` (no dispute) | Auto-release escrow → trigger seller payout |
| `return_requested` | Extend escrow hold until return resolved |
| `dispute` raised | Freeze escrow until dispute closed |
| Dispute resolved in buyer's favor | Release escrow → refund buyer |
| Dispute resolved in seller's favor | Release escrow → pay seller |
| Order `cancelled` | Immediate escrow release → refund buyer |

---

## 5. RBAC Enforcement

### 5.1 NestJS Guards

```typescript
import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no @Roles decorator, allow any authenticated user
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user: JwtPayload = request.user;

    if (!user) throw new ForbiddenException('Authentication required');

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Role '${user.role}' is not authorized. Required: ${requiredRoles.join(', ')}`
      );
    }

    return true;
  }
}
```

**Resource Ownership Guard (Producer own products):**

```typescript
@Injectable()
export class ProductOwnershipGuard implements CanActivate {
  constructor(
    private producerProfilesService: ProducerProfilesService,
    private productsService: ProductsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: JwtPayload = request.user;
    const productId = request.params.id;

    // Admins bypass ownership check
    if (['admin', 'super_admin'].includes(user.role)) return true;

    // Producers must own the product
    if (user.role === 'producer') {
      const producerProfile = await this.producerProfilesService.findByUserId(user.sub);
      const product = await this.productsService.findById(productId);

      if (!product) throw new NotFoundException('Product not found');
      if (product.producerId !== producerProfile.id) {
        throw new ForbiddenException('You do not own this product');
      }
      return true;
    }

    throw new ForbiddenException('Insufficient permissions');
  }
}

// Usage in controller:
@Patch(':id')
@UseGuards(JwtAuthGuard, ProductOwnershipGuard)
async updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) { ... }
```

---

### 5.2 Role-Based Access Matrix

| Endpoint | consumer | producer | admin | super_admin | partner_agent |
|---|---|---|---|---|---|
| `GET /products` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /products` | ❌ | ✅ (own) | ✅ | ✅ | ❌ |
| `PATCH /products/:id` | ❌ | ✅ (own) | ✅ | ✅ | ❌ |
| `DELETE /products/:id` | ❌ | ✅ (own) | ✅ | ✅ | ❌ |
| `GET /orders` | ✅ (own) | ✅ (own) | ✅ (all) | ✅ (all) | ❌ |
| `POST /orders` | ✅ | ❌ | ✅ | ✅ | ❌ |
| `PATCH /orders/:id/status` | ❌ | ✅ (own, limited) | ✅ | ✅ | ❌ |
| `POST /kyc/submit` | ❌ | ✅ | ❌ | ❌ | ❌ |
| `PATCH /admin/kyc/:id/review` | ❌ | ❌ | ✅ | ✅ | ❌ |
| `GET /admin/dashboard` | ❌ | ❌ | ✅ | ✅ | ❌ |
| `PATCH /admin/users/:id/block` | ❌ | ❌ | ✅ | ✅ | ❌ |
| `PATCH /admin/users/:id/role` | ❌ | ❌ | ❌ | ✅ | ❌ |
| `POST /admin/payouts/process` | ❌ | ❌ | ✅ | ✅ | ❌ |
| `POST /social/posts` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `POST /rfq` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `POST /rfq/:id/quotes` | ❌ | ✅ | ✅ | ✅ | ❌ |
| `GET /proxy-artisans` | ❌ | ❌ | ✅ | ✅ | ✅ (own zone) |
| `POST /proxy-artisans` | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 6. Data Encryption

### 6.1 Fields Encrypted at Rest (Application-Level AES-256-GCM)

> Note: These are encrypted at the **application layer** BEFORE storage. DB-level encryption (RDS AES-256) is a separate additional layer.

| Field | Table | Reason |
|---|---|---|
| `account_number_encrypted` | `producer_bank_accounts` | Financial PII; regulatory requirement |
| `totp_secret` | `user_mfa` | TOTP seed must not be readable from DB dump |
| Aadhaar (transient) | Processed in memory only | Legal prohibition on Aadhaar storage |

---

### 6.2 Encryption Implementation

```typescript
import { KMSClient, GenerateDataKeyCommand, DecryptCommand } from '@aws-sdk/client-kms';

const kms = new KMSClient({ region: 'ap-south-1' });
const DATA_KEY_CACHE = new Map<string, { key: Buffer; expiresAt: number }>();

async function getDataKey(): Promise<Buffer> {
  const cached = DATA_KEY_CACHE.get('primary');
  if (cached && cached.expiresAt > Date.now()) return cached.key;

  // Generate new data key from KMS
  const response = await kms.send(new GenerateDataKeyCommand({
    KeyId: process.env.KMS_CMK_ARN,
    KeySpec: 'AES_256',
  }));

  const plainKey = Buffer.from(response.Plaintext!);

  // Cache for 5 minutes (never persist to disk)
  DATA_KEY_CACHE.set('primary', {
    key: plainKey,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  return plainKey;
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getDataKey();
  const iv = crypto.randomBytes(12);  // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Storage format: base64(iv):base64(authTag):base64(ciphertext)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

async function decrypt(stored: string): Promise<string> {
  const [ivB64, tagB64, ctB64] = stored.split(':');
  const key = await getDataKey();
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(ctB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(ciphertext) + decipher.final('utf8');
}
```

---

### 6.3 Database and Network Encryption

| Layer | Encryption |
|---|---|
| RDS PostgreSQL | AES-256 at rest via AWS KMS; TLS 1.3 in transit |
| MongoDB Atlas | Encryption at rest (Atlas managed); TLS 1.3 in transit |
| Redis ElastiCache | TLS 1.3 in transit; encryption at rest via AWS KMS |
| S3 buckets | Server-Side Encryption with KMS (`aws:kms`); SSE-KMS enforced via bucket policy |
| All API connections | TLS 1.3 minimum; TLS 1.0 and 1.1 disabled |
| Internal service mesh | mTLS via AWS App Mesh |

---

## 7. PII Handling

### 7.1 PII Field Inventory

| Field | Table | Classification | Retention |
|---|---|---|---|
| `email` | `users` | PII — Contact | Active + 7 years (GST) |
| `phone` | `users` | PII — Contact | Active + 7 years |
| `full_name` | `consumer_profiles` | PII — Identity | Active + 7 years |
| `date_of_birth` | `consumer_profiles` | PII — Sensitive | Active only |
| `aadhaar_last4` | `producer_profiles` | PII — Gov ID | Active + 8 years (audit) |
| `pan` | `producer_profiles` | PII — Financial ID | Active + 8 years |
| `gstin` | `producer_profiles` | PII — Financial ID | Active + 8 years |
| `account_number_encrypted` | `producer_bank_accounts` | PII — Financial | Active + 8 years |
| `ip_address` | `user_sessions` | PII — Technical | 90 days |
| `address_line1/2` | `consumer_addresses` | PII — Location | Active only |
| `shipping_address` JSONB | `orders` | PII — Location | 7 years (GST) |

---

### 7.2 Log Masking

All logs pass through a custom Winston formatter that masks PII:

```typescript
const PII_MASKS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /("email"\s*:\s*)"([^"]{3})[^"]*(@[^"]+)"/g, replacement: '$1"$2***$3"' },
  { pattern: /("phone"\s*:\s*)"[^"]{6}([^"]{4})"/g, replacement: '$1"******$2"' },
  { pattern: /("pan"\s*:\s*)"([A-Z])[A-Z0-9]{8}([A-Z])"/g, replacement: '$1"$2*******$3"' },
  { pattern: /("account_number[^"]*"\s*:\s*)"[^"]+"/g, replacement: '$1"[REDACTED]"' },
  { pattern: /\b\d{12}\b/g, replacement: '[AADHAAR-REDACTED]' },  // Full 12-digit numbers
  { pattern: /\b[6-9]\d{9}\b/g, replacement: '******$0'.slice(-4) },  // Phone in logs
];

function maskPii(message: string): string {
  return PII_MASKS.reduce((msg, { pattern, replacement }) => msg.replace(pattern, replacement), message);
}
```

**Rules:**
- Email: `use***@gmail.com`
- Phone: `***6789` (last 4 visible)
- PAN: `A***Z` (first + last visible)
- Account numbers: `[REDACTED]`
- Full Aadhaar: `[AADHAAR-REDACTED]`
- Aadhaar is never stored; if detected in logs, it is a security incident.

---

### 7.3 Right to Erasure (GDPR / India DPDP Act 2023)

**Trigger:** `DELETE /api/v1/users/me` or admin action.

**Step-by-step erasure procedure:**

```typescript
async function executeDataErasure(userId: string, adminId?: string): Promise<void> {
  await db.transaction(async (trx) => {
    // Step 1: Revoke all sessions
    await trx.userSessions.updateMany({ userId }, { isActive: false });
    await redis.del(`session:${userId}:*`);

    // Step 2: Anonymize PII in users table
    await trx.users.update(userId, {
      email: `deleted_${userId}@tanthavi.deleted`,
      phone: null,
      passwordHash: null,
      oauthProviderId: null,
      isActive: false,
    });

    // Step 3: Anonymize consumer profile
    await trx.consumerProfiles.update({ userId }, {
      fullName: 'Deleted User',
      displayName: 'Deleted User',
      avatarUrl: null,
      dateOfBirth: null,
      phone: null,
    });

    // Step 4: Anonymize producer profile (if applicable)
    await trx.producerProfiles.update({ userId }, {
      bio: null,
      pan: null,
      aadhaarLast4: null,
      geoLocation: null,
    });

    // Step 5: Delete addresses
    await trx.consumerAddresses.deleteMany({ consumerId: trx.consumerProfiles.findByUserId(userId).id });

    // Step 6: Remove media from S3
    await s3Service.deletePrefix(`profiles/${userId}/`);

    // Step 7: Cancel pending orders
    const pendingOrders = await trx.orders.findMany({
      buyerId: userId,
      status: { in: ['pending_payment', 'payment_confirmed', 'processing'] }
    });
    for (const order of pendingOrders) {
      await orderService.cancelOrder(order.id, 'Account deleted by user');
    }

    // Step 8: Purge from Elasticsearch and MongoDB
    await elasticsearch.delete({ index: 'users', id: userId });
    await mongodb.userEvents.deleteMany({ userId });
    await mongodb.recommendationSignals.deleteOne({ userId });

    // Step 9: Anonymize reviews (keep content, remove author link)
    await trx.reviews.updateMany({ reviewerId: userId }, {
      reviewerId: ANONYMOUS_USER_ID, // Sentinel UUID for deleted users
    });

    // Step 10: Log erasure event (immutable audit trail)
    await trx.adminActions.create({
      adminId: adminId ?? userId,  // Self-initiated erasure
      actionType: 'DATA_ERASURE',
      targetType: 'user',
      targetId: userId,
      description: 'User data erased per DPDP Act request',
    });
  });
}
```

**Notes:**
- Financial records (orders, transactions, invoices) retained 7 years per GST Act; buyer identity replaced with `Deleted User`.
- Erasure completed within 30 days maximum. Automated job processes queue.
- User receives confirmation email before email is anonymized.

---

## 8. Fraud Detection Rules

### 8.1 Velocity Limits (Auto-flag for review)

| Signal | Threshold | Action |
|---|---|---|
| Orders per user in 1 hour | > 5 | Level 1 flag |
| Orders > ₹50,000 per user in 24 hours | > 3 | Level 2 flag |
| Login attempts from same IP in 1 hour | > 10 | Block IP + Level 1 flag |
| Different payment methods in 24 hours | > 3 | Level 2 flag |
| New account (< 24hr) placing order > ₹10,000 | Any | Level 2 flag |
| Refund requests per user in 30 days | > 5 | Level 1 flag |
| OTP requests per phone per day | > 20 | Block phone for 24hr |
| Product listings per producer per day | > 50 | Level 1 flag |

---

### 8.2 Anomaly Conditions

| Condition | Trigger | Action |
|---|---|---|
| New shipping address + order > ₹20,000 | First-time address use | Require OTP confirmation before payment |
| IP flagged in threat intel (GreyNoise, AbuseIPDB) | Any authenticated action | Level 1 flag, require CAPTCHA |
| B2B order with billing name ≠ KYC name | PO creation | Require manual document verification |
| Multiple accounts sharing device fingerprint | Login | Level 2 flag, review accounts |
| Product listed at > 50% below category average | Product publish | Admin review before listing goes live |
| Seller daily orders > 5× their 30-day average | Any order | Level 1 flag |
| Payout address changed within 24hr of large payout | Bank account update | Hold payout, notify super_admin |

---

### 8.3 Response Actions

```typescript
enum FraudLevel {
  LEVEL_1 = 1,  // Add to review queue, notify fraud team
  LEVEL_2 = 2,  // Auto-hold payment/payout, notify user + fraud team
  LEVEL_3 = 3,  // Auto-block account, escalate to super_admin
}

async function handleFraudSignal(userId: string, signals: FraudSignal[]): Promise<void> {
  const maxLevel = Math.max(...signals.map(s => s.level)) as FraudLevel;

  if (maxLevel >= FraudLevel.LEVEL_1) {
    await fraudQueue.add({ userId, signals, level: maxLevel });
    await slackService.notifyFraudTeam({ userId, signals });
  }

  if (maxLevel >= FraudLevel.LEVEL_2) {
    await db.orders.holdPendingPayments(userId);
    await notificationService.send(userId, {
      type: 'account_review',
      message: 'Your account is under review. Payments temporarily held. Contact support.',
    });
  }

  if (maxLevel >= FraudLevel.LEVEL_3) {
    await db.users.update(userId, { isBlocked: true, blockedReason: 'Automated fraud detection' });
    await sessionService.revokeAll(userId);
    await adminService.createEscalation(userId, signals);
    await slackService.notifySuperAdmin({ userId, signals, severity: 'CRITICAL' });
  }
}
```

---

## 9. API Rate Limits

### 9.1 Implementation (Redis Sliding Window)

```typescript
async function slidingWindowRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, '-inf', windowStart);   // Remove old entries
  pipeline.zadd(key, now, `${now}-${Math.random()}`);    // Add current request
  pipeline.zcard(key);                                    // Count requests in window
  pipeline.expire(key, windowSeconds);

  const results = await pipeline.exec();
  const count = results![2][1] as number;

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt: Math.floor((now + windowSeconds * 1000) / 1000),
  };
}
```

---

### 9.2 Rate Limit Table

| Endpoint | Anonymous | Consumer | Producer | Admin/Super |
|---|---|---|---|---|
| `POST /auth/register` | 5/hr/IP | — | — | unlimited |
| `POST /auth/login` | 10/hr/IP | — | — | unlimited |
| `POST /auth/login/otp` | 5/hr/IP | — | — | unlimited |
| `POST /auth/send-otp` | 3/10min/phone | — | — | unlimited |
| `POST /auth/refresh` | 20/hr | 20/hr | 20/hr | unlimited |
| `POST /auth/forgot-password` | 3/hr/IP | — | — | unlimited |
| `GET /products` | 100/min | 100/min | 200/min | unlimited |
| `POST /products` | — | — | 50/day | unlimited |
| `POST /products/:id/images` | — | — | 100/day | unlimited |
| `GET /search/products` | 60/min | 60/min | 60/min | unlimited |
| `GET /search/autocomplete` | 120/min | 120/min | 120/min | unlimited |
| `POST /cart/items` | — | 60/hr | — | unlimited |
| `POST /orders` | — | 10/hr | — | unlimited |
| `POST /payments/initiate` | — | 10/hr | — | unlimited |
| `POST /payments/webhook` | IP-whitelist only | — | — | unlimited |
| `POST /social/posts` | — | 10/day | 20/day | unlimited |
| `GET /social/feed` | 30/min | 60/min | 60/min | unlimited |
| `POST /social/posts/:id/like` | — | 200/hr | 200/hr | unlimited |
| `POST /social/posts/:id/comments` | — | 30/hr | 30/hr | unlimited |
| `POST /reviews` | — | 5/hr | — | unlimited |
| `POST /rfq` | — | 5/day | — | unlimited |
| `POST /rfq/:id/quotes` | — | — | 20/day | unlimited |
| `GET /admin/*` | — | — | — | 300/min |
| `POST /ai/verify-document` | — | — | 10/day | unlimited |
| `POST /ai/classify-product` | — | — | 20/day | unlimited |
| `GET /kyc/status` | — | 20/hr | — | unlimited |

---

### 9.3 Rate Limit Response Headers

Every API response includes:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 47
X-RateLimit-Reset: 1705312800
```

When limit exceeded, HTTP 429 with body:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please slow down.",
    "details": [{ "field": "retryAfter", "message": "Try again in 47 seconds" }]
  }
}
```

And header: `Retry-After: 47`

---

## 10. HTTP Security Headers & CORS

### 10.1 Content Security Policy

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{RANDOM_NONCE}' https://www.google.com https://www.gstatic.com https://checkout.razorpay.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com data:;
  img-src 'self' data: blob: https://cdn.tanthavi.com https://*.cloudfront.net https://www.google.com;
  media-src 'self' https://cdn.tanthavi.com https://*.cloudfront.net;
  connect-src 'self' https://api.tanthavi.com https://analytics.tanthavi.com wss://api.tanthavi.com;
  frame-src https://api.razorpay.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  object-src 'none';
  upgrade-insecure-requests;
  block-all-mixed-content;
```

> Nonce is generated per request (16 random bytes → base64). Applied to inline scripts only. Inline scripts must use `nonce` attribute; no `unsafe-inline` for scripts.

---

### 10.2 CORS Configuration

```typescript
// src/config/cors.config.ts
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://tanthavi.com',
      'https://www.tanthavi.com',
      'https://seller.tanthavi.com',
      'https://admin.tanthavi.com',
    ];

    if (process.env.NODE_ENV === 'development') {
      allowedOrigins.push('http://localhost:3000', 'http://localhost:5173', 'http://localhost:4000');
    }

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy: origin '${origin}' not allowed`));
    }
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-ID',
    'X-Idempotency-Key',
    'X-Device-Fingerprint',
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-ID',
  ],
  credentials: true,        // Required for cookie-based refresh tokens
  maxAge: 86400,            // 24-hour preflight cache
};
```

---

### 10.3 All Security Headers (Applied via Helmet.js + custom middleware)

```typescript
// NestJS main.ts
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: { /* as above */ },
  },
  hsts: {
    maxAge: 31536000,          // 1 year
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,               // X-Content-Type-Options: nosniff
  frameguard: { action: 'deny' },  // X-Frame-Options: DENY
  xssFilter: true,             // X-XSS-Protection: 1; mode=block
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: false,
}));

// Additional custom headers
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(self)');
  res.setHeader('X-Request-ID', req.headers['x-request-id'] || nanoid());
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  }
  next();
});
```

---

## 11. GST / Tax Compliance

### 11.1 GST Rate Schedule for Handloom Products

| HSN Code Range | Product Type | GST Rate |
|---|---|---|
| 5208–5212 | Cotton woven fabrics | 5% |
| 5407–5408 | Silk woven fabrics (Banarasi, Kanchipuram, etc.) | 5% |
| 5512–5516 | Synthetic/artificial woven fabrics | 12% |
| 5804 | Lace, trimmings, embroidery | 12% |
| 6302 | Bed linen, handloom household textiles | 5% |
| 9999 | Handlooms sold by weavers directly (Notification 45/2017) | Exempt (0%) |
| Shipping/delivery charges | Service | 18% |
| Platform service fees | Digital service | 18% |

**GST Type Determination (inter-state vs. intra-state):**

```typescript
function determineGstType(sellerState: string, buyerState: string): 'CGST_SGST' | 'IGST' {
  // Normalize state names to handle variants (e.g., 'Tamil Nadu' vs 'TamilNadu')
  const normalize = (s: string) => s.toLowerCase().replace(/\s/g, '');
  return normalize(sellerState) === normalize(buyerState) ? 'CGST_SGST' : 'IGST';
}

function computeGst(basePrice: number, gstRate: number, gstType: 'CGST_SGST' | 'IGST') {
  const totalGst = Math.round(basePrice * (gstRate / 100) * 100) / 100;
  if (gstType === 'CGST_SGST') {
    return {
      cgst: totalGst / 2,
      sgst: totalGst / 2,
      igst: 0,
      total: totalGst,
    };
  }
  return { cgst: 0, sgst: 0, igst: totalGst, total: totalGst };
}
```

---

### 11.2 TDS Deduction (Section 194-O)

| Rule | Detail |
|---|---|
| Applicable to | All payments by Tanthavi (as e-commerce operator) to sellers |
| Rate | 1% TDS on gross sales amount |
| Exemption | Sellers with turnover < ₹5 lakh may file self-declaration (Form 194-O Cert) |
| Deduction timing | At payout processing (before transferring to seller) |
| Deposit to govt | By 7th of following month (Challan 281) |
| Reporting | Form 26AS reflects TDS for seller's income tax filing |
| Record keeping | `seller_payouts.tds_amount` per payout; annual Form 16A issued to sellers |

```typescript
async function computePayout(producerId: string, grossAmount: number): Promise<PayoutCalculation> {
  const PLATFORM_COMMISSION_RATE = 0.08;  // 8% platform fee
  const TDS_RATE = 0.01;                   // 1% TDS Section 194-O

  const producer = await db.producerProfiles.findById(producerId);
  const annualRevenue = await db.sellerPayouts.sumPaidThisYear(producerId);

  // Check TDS exemption
  const tdsExempt = annualRevenue < 500_000 && producer.hasTdsExemptionDeclaration;

  const platformFee = Math.round(grossAmount * PLATFORM_COMMISSION_RATE * 100) / 100;
  const tdsAmount = tdsExempt ? 0 : Math.round(grossAmount * TDS_RATE * 100) / 100;
  const netAmount = grossAmount - platformFee - tdsAmount;

  return { grossAmount, platformFee, tdsAmount, netAmount, tdsExempt };
}
```

---

### 11.3 GST-Compliant Invoice Requirements

Every order generates a tax invoice with these mandatory fields:

```typescript
interface GstInvoice {
  invoiceNumber: string;          // Sequential: INV-2024-000001 (per seller)
  invoiceDate: string;            // ISO date of order confirmation
  seller: {
    businessName: string;
    gstin: string;                // Required
    address: string;
    state: string;
    stateCode: string;            // 2-digit state code
  };
  buyer: {
    name: string;
    gstin?: string;               // Required for B2B invoices
    address: string;
    state: string;
    stateCode: string;
  };
  placeOfSupply: string;          // Buyer's state name + code
  lineItems: {
    description: string;
    hsnCode: string;              // Required per line item
    quantity: number;
    unit: string;                 // 'NOS' (numbers) for sarees, 'MTR' for fabric by meter
    unitPrice: number;
    discount: number;
    taxableValue: number;
    gstRate: number;
    cgst: number;                 // 0 for inter-state
    sgst: number;                 // 0 for inter-state
    igst: number;                 // 0 for intra-state
    total: number;
  }[];
  summary: {
    subtotal: number;
    totalDiscount: number;
    taxableAmount: number;
    totalCgst: number;
    totalSgst: number;
    totalIgst: number;
    totalGst: number;
    shippingCharge: number;
    shippingGst: number;
    grandTotal: number;
    amountInWords: string;        // e.g., "Twelve Thousand Five Hundred Only"
  };
  reverseCharge: boolean;         // Usually false for handloom marketplace
  digitalSignature?: string;      // If seller has digital signature
}
```

**Invoice Storage:**
- Generated as PDF via `pdfmake` or `puppeteer` on backend.
- Stored in S3: `invoices/{producerId}/{year}/{month}/{orderNumber}.pdf`.
- Retained for **8 years** (GST Act requires 6 years; ICAI recommends 8).
- Accessible via `GET /api/v1/orders/:id/invoice` (auth-required presigned URL).

---

### 11.4 GSTR Compliance Reports

| Report | Who generates | Frequency | Available via |
|---|---|---|---|
| GSTR-1 (Outward Supplies) | Per-producer | Monthly | `GET /api/v1/producers/me/reports/gstr1?month=2024-01` |
| GSTR-8 (E-commerce Operator) | Platform (Tanthavi) | Monthly | Admin export |
| TDS Certificate (Form 16A) | Platform | Quarterly | Emailed to producers |
| Annual Sales Summary | Per-producer | Yearly | Seller dashboard download |

All financial records (orders, transactions, payouts, invoices) are retained for **7 years minimum** per GST Act Section 36, irrespective of account deletion requests.
