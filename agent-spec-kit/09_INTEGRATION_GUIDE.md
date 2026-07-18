# 09 — Third-Party Integration Guide
# Tanthavi Handloom Marketplace Platform
**Version:** 1.0.0  
**Last Updated:** 2026-07-15  
**Status:** Production Reference  

> [!IMPORTANT]
> All API keys, secrets, and credentials referenced in this document must be stored in **AWS Secrets Manager** or the NestJS application's environment variables (`.env.production`). Never commit credentials to version control. Variable names in `${VARIABLE}` format are placeholders — retrieve actual values from the secrets store.

---

## Table of Contents

1. [Razorpay Payment Gateway](#1-razorpay-payment-gateway)
2. [MSG91 SMS & OTP](#2-msg91-sms--otp)
3. [Resend Email](#3-resend-email)
4. [Shiprocket Logistics](#4-shiprocket-logistics)
5. [Google OAuth 2.0](#5-google-oauth-20)
6. [Firebase Cloud Messaging (Push Notifications)](#6-firebase-cloud-messaging-push-notifications)
7. [AWS S3](#7-aws-s3)
8. [GST Verification API](#8-gst-verification-api)
9. [Elasticsearch / AWS OpenSearch](#9-elasticsearch--aws-opensearch)
10. [Google Vision API (Fraud Detection)](#10-google-vision-api-fraud-detection)

---

## 1. Razorpay Payment Gateway

### 1.1 Credentials & Environment Setup

```bash
# .env.production
RAZORPAY_KEY_ID=rzp_live_XXXXXXXXXXXX
RAZORPAY_KEY_SECRET=XXXXXXXXXXXXXXXXXXXXXXXX
RAZORPAY_WEBHOOK_SECRET=XXXXXXXXXXXXXXXXXXXXXXXX

# Test mode
RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXX
RAZORPAY_KEY_SECRET=XXXXXXXXXXXXXXXXXXXXXXXX
```

**Test vs Live Switching:**
- All `rzp_test_*` keys: 100% sandbox; no real money moved; test cards available at [razorpay.com/docs/payments/payments/test-card-details](https://razorpay.com/docs/payments/payments/test-card-details)
- All `rzp_live_*` keys: Live production; real transactions
- **Never mix** live keys in development environments
- Key prefix is the only differentiator; no code changes needed between environments

```typescript
// razorpay.provider.ts
import Razorpay from "razorpay";

export const razorpayClient = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});
```

---

### 1.2 Create Payment Order — Full API Call Sequence

**Step 1 — Backend: Create Razorpay Order**

```typescript
// payment.service.ts
async function createRazorpayOrder(
  order: Order,
  buyer: User
): Promise<RazorpayOrder> {
  const options = {
    amount:   Math.round(order.total_amount * 100),  // Razorpay expects paise (1 INR = 100 paise)
    currency: "INR",
    receipt:  `rcpt_${order.id}`,               // Max 40 chars; must be unique per order
    notes: {
      order_id:   order.id,
      buyer_id:   buyer.id,
      buyer_name: buyer.full_name,
      platform:   "tanthavi",
    },
    payment_capture: 1,    // Auto-capture payment immediately on success (1 = yes)
  };

  const razorpayOrder = await razorpayClient.orders.create(options);

  // Save Razorpay order ID to our orders table for reconciliation
  await db.query(
    "UPDATE orders SET razorpay_order_id = $1, payment_status = 'AWAITING' WHERE id = $2",
    [razorpayOrder.id, order.id]
  );

  return {
    razorpay_order_id: razorpayOrder.id,
    amount:            razorpayOrder.amount,
    currency:          razorpayOrder.currency,
    key_id:            process.env.RAZORPAY_KEY_ID!,    // Sent to frontend; key_id is safe to expose
  };
}
```

**Step 2 — Frontend: Open Razorpay Checkout**

```html
<!-- index.html: include Razorpay.js (CDN — do NOT self-host) -->
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
```

```typescript
// checkout.ts (frontend)
async function initiatePayment(orderDetails: OrderDetails): Promise<void> {
  // Fetch Razorpay order from backend
  const { razorpay_order_id, amount, currency, key_id } = await api.post(
    "/api/v1/payments/create-order",
    { order_id: orderDetails.id }
  );

  const rzpOptions = {
    key:         key_id,        // From backend (never hardcode in frontend)
    amount:      amount,        // In paise
    currency:    currency,
    name:        "Tanthavi Handloom Marketplace",
    description: `Order #${orderDetails.id}`,
    image:       "https://tanthavi.com/logo.png",
    order_id:    razorpay_order_id,
    handler: async function (response: RazorpayPaymentResponse) {
      // Payment success handler — ALWAYS verify on backend before showing success UI
      const verificationResult = await api.post("/api/v1/payments/verify", {
        razorpay_payment_id:   response.razorpay_payment_id,
        razorpay_order_id:     response.razorpay_order_id,
        razorpay_signature:    response.razorpay_signature,
        tanthavi_order_id:     orderDetails.id,
      });

      if (verificationResult.verified) {
        router.navigate(`/orders/${orderDetails.id}/confirmation`);
      } else {
        showErrorAlert("Payment verification failed. Please contact support.");
      }
    },
    prefill: {
      name:    currentUser.full_name,
      email:   currentUser.email,
      contact: currentUser.phone,
    },
    notes: {
      address: "Tanthavi Marketplace – Handloom India",
    },
    theme: {
      color: "#7C3AED",    // Tanthavi purple brand color
    },
    modal: {
      ondismiss: function () {
        // User closed payment modal without completing payment
        trackEvent("payment_modal_dismissed", { order_id: orderDetails.id });
      },
    },
  };

  const rzp = new (window as any).Razorpay(rzpOptions);
  
  rzp.on("payment.failed", function (response: any) {
    console.error("Payment failed:", response.error);
    showErrorAlert(`Payment failed: ${response.error.description}`);
    trackEvent("payment_failed", {
      order_id:    orderDetails.id,
      error_code:  response.error.code,
      error_reason: response.error.reason,
    });
  });

  rzp.open();
}
```

**Step 3 — Backend: Verify Payment Signature**

```typescript
// payment.service.ts
import crypto from "crypto";

async function verifyPaymentSignature(
  razorpay_order_id: string,
  razorpay_payment_id: string,
  razorpay_signature: string,
  tanthavi_order_id: string
): Promise<{ verified: boolean }> {
  
  // Razorpay signature = HMAC-SHA256(order_id + "|" + payment_id, key_secret)
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  const isValid = crypto.timingSafeEqual(
    Buffer.from(expectedSignature, "hex"),
    Buffer.from(razorpay_signature, "hex")
  );

  if (!isValid) {
    logger.error(
      `Payment signature verification failed for order ${tanthavi_order_id}. ` +
      `Possible tampering or replay attack.`
    );
    await auditLogService.log({
      event: "PAYMENT_SIGNATURE_INVALID",
      order_id: tanthavi_order_id,
      razorpay_payment_id,
    });
    return { verified: false };
  }

  // Signature valid: transition order status
  await orderService.transitionStatus(tanthavi_order_id, "PAYMENT_CONFIRMED", "SYSTEM", {
    razorpay_payment_id,
    razorpay_order_id,
  });

  return { verified: true };
}
```

---

### 1.3 Webhook Events Handled

Configure webhook URL in Razorpay Dashboard → Settings → Webhooks:
- URL: `https://api.tanthavi.com/webhooks/razorpay`
- Events to subscribe: `payment.captured`, `payment.failed`, `refund.processed`, `order.paid`

```typescript
// webhooks/razorpay.controller.ts
import { createHmac, timingSafeEqual } from "crypto";

// Middleware: Verify Razorpay webhook signature
function verifyRazorpayWebhookSignature(
  rawBody: Buffer,
  signature: string
): boolean {
  const expectedSignature = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest("hex");

  return timingSafeEqual(
    Buffer.from(expectedSignature, "hex"),
    Buffer.from(signature, "hex")
  );
}

// Webhook handler
async function handleRazorpayWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.headers["x-razorpay-signature"] as string;
  
  if (!verifyRazorpayWebhookSignature(req.rawBody, signature)) {
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }

  const event = req.body;

  switch (event.event) {
    case "payment.captured":
      await handlePaymentCaptured(event.payload.payment.entity);
      break;

    case "payment.failed":
      await handlePaymentFailed(event.payload.payment.entity);
      break;

    case "refund.processed":
      await handleRefundProcessed(event.payload.refund.entity);
      break;

    case "order.paid":
      // Alternative capture confirmation; treat same as payment.captured
      await handleOrderPaid(event.payload.order.entity);
      break;

    default:
      logger.info(`Unhandled Razorpay event: ${event.event}`);
  }

  res.status(200).json({ received: true });
}

async function handlePaymentCaptured(payment: any): Promise<void> {
  const order = await orderRepository.findByRazorpayOrderId(payment.order_id);
  if (!order) {
    logger.error(`Order not found for Razorpay order: ${payment.order_id}`);
    return;
  }

  // Idempotency: skip if already processed
  if (order.status !== "PENDING_PAYMENT") {
    logger.warn(`Duplicate payment.captured event for order ${order.id}; status = ${order.status}`);
    return;
  }

  await orderService.transitionStatus(order.id, "PAYMENT_CONFIRMED", "WEBHOOK");
  await notificationService.sendOrderConfirmation(order);
}

async function handlePaymentFailed(payment: any): Promise<void> {
  const order = await orderRepository.findByRazorpayOrderId(payment.order_id);
  if (!order) return;

  await orderService.transitionStatus(order.id, "PAYMENT_FAILED", "WEBHOOK", {
    failure_reason: payment.error_reason,
    failure_code:   payment.error_code,
  });

  await notificationService.sendPaymentFailedAlert(order, payment.error_description);
}

async function handleRefundProcessed(refund: any): Promise<void> {
  const refundRecord = await refundRepository.findByRazorpayRefundId(refund.id);
  if (!refundRecord) {
    logger.error(`Refund record not found for Razorpay refund: ${refund.id}`);
    return;
  }

  await refundRepository.markAsCompleted(refundRecord.id, {
    razorpay_refund_id: refund.id,
    refunded_at: new Date(refund.created_at * 1000),   // Razorpay uses Unix timestamps
  });

  await orderService.transitionStatus(refundRecord.order_id, "REFUNDED", "WEBHOOK");
  await notificationService.sendRefundConfirmation(refundRecord);
}
```

---

### 1.4 Split Payment (Razorpay Route)

Razorpay Route is used for marketplace payouts — splitting payment between platform and seller.

**Note:** Razorpay Route is applied at PAYOUT time (weekly), not at payment time. We collect the full amount and payout weekly via Route transfers.

```typescript
// payout.service.ts — Weekly payout via Razorpay Route
async function initiateSellerPayout(
  seller: Seller,
  payout_amount_paise: number,
  payout_id: string
): Promise<void> {
  // Seller must have a linked Razorpay Linked Account
  if (!seller.razorpay_linked_account_id) {
    throw new Error(`Seller ${seller.id} does not have a linked Razorpay account`);
  }

  const transfer = await razorpayClient.transfers.create({
    account: seller.razorpay_linked_account_id,
    amount:  payout_amount_paise,
    currency: "INR",
    notes: {
      payout_id,
      seller_id:  seller.id,
      description: `Weekly payout — Tanthavi Marketplace`,
    },
    on_hold: 0,    // 0 = immediate transfer; 1 = held until manually released
  });

  await payoutRepository.update(payout_id, {
    razorpay_transfer_id: transfer.id,
    status: "PROCESSING",
    initiated_at: new Date(),
  });
}

// Onboard seller to Razorpay Linked Accounts (done during seller KYC approval)
async function onboardSellerLinkedAccount(seller: Seller): Promise<string> {
  const account = await razorpayClient.accounts.create({
    email:        seller.email,
    profile: {
      category:     "ecommerce",
      subcategory:  "arts_and_crafts",
      addresses: {
        registered: {
          street1:   seller.address_line1,
          city:      seller.city,
          state:     seller.state,
          postal_code: seller.pincode,
          country:   "IN",
        },
      },
    },
    legal_info: {
      pan:  seller.pan_number,
      gst:  seller.gstin ?? undefined,
    },
    type: "route",
  });

  await sellerRepository.update(seller.id, {
    razorpay_linked_account_id: account.id,
  });

  return account.id;
}
```

---

## 2. MSG91 SMS & OTP

### 2.1 Credentials

```bash
MSGS91_AUTH_KEY=XXXXXXXXXXXXXXXXXXXXXX
MSG91_SENDER_ID=TNTHVI    # 6-char sender ID registered with TRAI
MSG91_OTP_TEMPLATE_ID=XXXXXXXXXXXX
MSG91_TRANSACTIONAL_TEMPLATE_IDS_ORDER_CONFIRMED=XXXXXXXXXXXX
MSG91_TRANSACTIONAL_TEMPLATE_IDS_ORDER_SHIPPED=XXXXXXXXXXXX
MSG91_TRANSACTIONAL_TEMPLATE_IDS_ORDER_DELIVERED=XXXXXXXXXXXX
```

### 2.2 OTP Template Setup

Register the following DLT-approved template on MSG91 Dashboard:

**Template Name:** `TANTHAVI_OTP`  
**Template Content (exact text for TRAI DLT registration):**
```
Your OTP for Tanthavi Marketplace is ##OTP##. Valid for 10 minutes. Do not share this OTP with anyone. - TNTHVI
```

The `##OTP##` variable is replaced by MSG91 automatically.

### 2.3 Send OTP

```typescript
// otp.service.ts
import axios from "axios";

const MSG91_BASE_URL = "https://control.msg91.com/api/v5";

async function sendOTP(phone: string): Promise<{ request_id: string }> {
  // Phone must be in format: 91XXXXXXXXXX (country code + 10-digit mobile)
  const formattedPhone = phone.startsWith("91") ? phone : `91${phone}`;

  const response = await axios.post(
    `${MSG91_BASE_URL}/otp`,
    {
      template_id: process.env.MSG91_OTP_TEMPLATE_ID!,
      mobile:      formattedPhone,
      authkey:     process.env.MSGS91_AUTH_KEY!,
      otp_length:  6,
      otp_expiry:  10,   // minutes
    },
    { headers: { "Content-Type": "application/json" } }
  );

  if (response.data.type !== "success") {
    throw new SMSServiceError(`MSG91 OTP send failed: ${JSON.stringify(response.data)}`);
  }

  return { request_id: response.data.request_id };
}
```

### 2.4 Verify OTP

```typescript
async function verifyOTP(phone: string, otp: string): Promise<boolean> {
  const formattedPhone = phone.startsWith("91") ? phone : `91${phone}`;

  const response = await axios.get(
    `${MSG91_BASE_URL}/otp/verify`,
    {
      params: {
        authkey: process.env.MSGS91_AUTH_KEY!,
        mobile:  formattedPhone,
        otp,
      },
    }
  );

  return response.data.type === "success";
}
```

### 2.5 Rate Limiting (OTP)

OTP rate limiting is enforced at the application layer using Redis. MSG91 also has its own limits, but we enforce stricter rules to prevent abuse.

```typescript
// otp-rate-limiter.ts
async function checkOTPRateLimit(phone: string): Promise<void> {
  const key = `otp:rate:${phone}`;
  const windowSeconds = 600;   // 10 minutes
  const maxAttempts = 5;

  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, windowSeconds);   // Reset window on each request (sliding window)
  const [count] = await pipeline.exec() as [number, any];

  if (count > maxAttempts) {
    const ttl = await redis.ttl(key);
    throw new RateLimitError(
      `Maximum ${maxAttempts} OTP requests allowed per 10 minutes. ` +
      `Please wait ${Math.ceil(ttl / 60)} minute(s) before trying again.`
    );
  }
}

// Usage in auth controller
async function requestOTP(phone: string): Promise<void> {
  await checkOTPRateLimit(phone);     // Throws if limit exceeded
  const { request_id } = await otpService.sendOTP(phone);
  await redis.set(`otp:reqid:${phone}`, request_id, "EX", 600);
}
```

### 2.6 Transactional SMS Templates

All transactional SMS must use pre-approved DLT templates.

**Order Confirmed:**
```
Dear {name}, your order #{order_id} for {product_name} has been confirmed. 
Expected delivery: {expected_date}. Track at: tanthavi.com/orders/{order_id} - TNTHVI
```

**Order Shipped:**
```
Your order #{order_id} has been shipped via {courier_name}. 
AWB: {awb_number}. Track: {tracking_url} - TNTHVI
```

**Order Delivered:**
```
Your order #{order_id} has been delivered. 
Loved it? Leave a review: tanthavi.com/orders/{order_id}/review - TNTHVI
```

```typescript
async function sendTransactionalSMS(
  phone: string,
  template_id: string,
  variables: Record<string, string>
): Promise<void> {
  const formattedPhone = `91${phone.replace(/^\+?91/, "")}`;

  await axios.post(
    `${MSG91_BASE_URL}/flow/`,
    {
      template_id,
      sender:   process.env.MSG91_SENDER_ID!,
      short_url: "0",
      mobiles:  formattedPhone,
      VAR1: variables.var1 ?? "",
      VAR2: variables.var2 ?? "",
      VAR3: variables.var3 ?? "",
      VAR4: variables.var4 ?? "",
      VAR5: variables.var5 ?? "",
    },
    {
      headers: {
        authkey: process.env.MSGS91_AUTH_KEY!,
        "Content-Type": "application/json",
      },
    }
  );
}
```

---

## 3. Resend Email

### 3.1 Setup

```bash
RESEND_API_KEY=re_XXXXXXXXXXXXXXXXXXXX
EMAIL_FROM_NAME="Tanthavi Marketplace"
EMAIL_FROM_ADDRESS="noreply@mail.tanthavi.com"
EMAIL_REPLY_TO="support@tanthavi.com"
```

```typescript
// resend.provider.ts
import { Resend } from "resend";

export const resendClient = new Resend(process.env.RESEND_API_KEY!);
```

**DNS Setup Required (Resend Dashboard):**  
Add SPF, DKIM, and DMARC records to `mail.tanthavi.com` subdomain:
- SPF: `v=spf1 include:_spf.resend.com ~all`
- DKIM: Add CNAME records provided by Resend
- DMARC: `v=DMARC1; p=quarantine; rua=mailto:dmarc@tanthavi.com`

### 3.2 Email Templates (All 12+)

| # | Template ID | Trigger | Recipient |
|---|-------------|---------|-----------|
| 1 | `welcome` | User registration complete | New user |
| 2 | `otp_verification` | OTP request (email channel) | Requester |
| 3 | `seller_verification_approved` | Seller verification score → badge assigned (✅ or 🏅) | Seller |
| 4 | `seller_verification_rejected` | Seller verification score → FAILED | Seller |
| 5 | `order_confirmed` | Payment captured | Buyer |
| 6 | `order_confirmed_seller` | Payment captured | Seller |
| 7 | `order_shipped` | Order status → SHIPPED | Buyer |
| 8 | `order_delivered` | Order status → DELIVERED | Buyer |
| 9 | `return_approved` | Return status → RETURN_APPROVED | Buyer |
| 10 | `refund_processed` | Refund status → REFUNDED | Buyer |
| 11 | `payout_sent` | Weekly payout initiated | Seller |
| 12 | `new_scheme_available` | New government scheme added | All sellers (batched) |
| 13 | `password_reset` | User requests password reset | User |
| 14 | `price_drop_alert` | Product price drops > 5% | Wishlisted buyers |
| 15 | `payout_failure_action_required` | Payout fails after 3 retries | Seller |

### 3.3 React Email Template Structure

```tsx
// emails/templates/order-confirmed.tsx
import {
  Body, Button, Container, Head, Heading, Hr, Html, Img,
  Link, Preview, Section, Text, Row, Column,
} from "@react-email/components";

interface OrderConfirmedEmailProps {
  buyer_name: string;
  order_id: string;
  product_name: string;
  product_image_url: string;
  order_amount: number;
  expected_delivery_date: string;
  order_url: string;
  seller_name: string;
}

export default function OrderConfirmedEmail({
  buyer_name,
  order_id,
  product_name,
  product_image_url,
  order_amount,
  expected_delivery_date,
  order_url,
  seller_name,
}: OrderConfirmedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your order is confirmed — {product_name}</Preview>
      <Body style={main}>
        <Container style={container}>
          
          {/* Header */}
          <Section style={header}>
            <Img src="https://tanthavi.com/logo-email.png" width="150" alt="Tanthavi" />
          </Section>
          
          {/* Hero */}
          <Section style={hero}>
            <Heading style={h1}>Order Confirmed! 🎉</Heading>
            <Text style={subtext}>Hi {buyer_name}, your order has been placed successfully.</Text>
          </Section>
          
          {/* Order Details */}
          <Section style={orderBox}>
            <Row>
              <Column style={{ width: "120px" }}>
                <Img src={product_image_url} width="100" height="100" alt={product_name} style={productImg} />
              </Column>
              <Column>
                <Text style={productName}>{product_name}</Text>
                <Text style={sellerName}>Sold by: {seller_name}</Text>
                <Text style={amount}>₹{order_amount.toLocaleString("en-IN")}</Text>
              </Column>
            </Row>
          </Section>
          
          <Hr style={divider} />
          
          {/* Delivery Info */}
          <Section>
            <Text style={infoLabel}>Order ID</Text>
            <Text style={infoValue}>{order_id}</Text>
            <Text style={infoLabel}>Expected Delivery</Text>
            <Text style={infoValue}>{expected_delivery_date}</Text>
          </Section>
          
          <Hr style={divider} />
          
          {/* CTA */}
          <Section style={{ textAlign: "center" }}>
            <Button style={ctaButton} href={order_url}>Track Your Order</Button>
          </Section>
          
          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              If you have any questions, reply to this email or contact{" "}
              <Link href="mailto:support@tanthavi.com">support@tanthavi.com</Link>
            </Text>
            <Text style={footerText}>
              Tanthavi Marketplace — Connecting Artisans to the World
            </Text>
          </Section>
          
        </Container>
      </Body>
    </Html>
  );
}

// Styles
const main = { backgroundColor: "#f6f9fc", fontFamily: "Inter, -apple-system, sans-serif" };
const container = { maxWidth: "600px", margin: "0 auto", backgroundColor: "#ffffff", borderRadius: "8px" };
const header = { backgroundColor: "#7C3AED", padding: "24px", borderRadius: "8px 8px 0 0", textAlign: "center" as const };
const hero = { padding: "32px 40px 16px" };
const h1 = { color: "#1a1a1a", fontSize: "28px", fontWeight: "700", margin: "0 0 8px" };
const subtext = { color: "#6b7280", fontSize: "16px", margin: "0" };
const orderBox = { padding: "16px 40px", backgroundColor: "#f9fafb", margin: "0 24px", borderRadius: "8px" };
const productImg = { borderRadius: "6px", objectFit: "cover" as const };
const productName = { fontWeight: "600", fontSize: "16px", color: "#1a1a1a", margin: "0 0 4px" };
const sellerName = { color: "#6b7280", fontSize: "14px", margin: "0 0 8px" };
const amount = { fontWeight: "700", fontSize: "20px", color: "#7C3AED", margin: "0" };
const divider = { borderColor: "#e5e7eb", margin: "24px 40px" };
const infoLabel = { color: "#6b7280", fontSize: "12px", textTransform: "uppercase" as const, margin: "0 0 2px 40px" };
const infoValue = { color: "#1a1a1a", fontSize: "16px", fontWeight: "600", margin: "0 0 16px 40px" };
const ctaButton = { backgroundColor: "#7C3AED", color: "#ffffff", padding: "14px 32px", borderRadius: "6px", fontWeight: "600", fontSize: "16px", textDecoration: "none" };
const footer = { padding: "24px 40px", backgroundColor: "#f6f9fc", borderRadius: "0 0 8px 8px" };
const footerText = { color: "#9ca3af", fontSize: "13px", margin: "4px 0", textAlign: "center" as const };
```

### 3.4 Sending Emails via Resend

```typescript
// email.service.ts
import { render } from "@react-email/render";
import OrderConfirmedEmail from "./templates/order-confirmed";

async function sendOrderConfirmedEmail(order: Order, buyer: User): Promise<void> {
  const html = render(
    OrderConfirmedEmail({
      buyer_name:             buyer.full_name,
      order_id:               order.id,
      product_name:           order.product.title,
      product_image_url:      order.product.primary_image_url,
      order_amount:           order.total_amount,
      expected_delivery_date: formatDate(order.expected_delivery_date),
      order_url:              `https://tanthavi.com/orders/${order.id}`,
      seller_name:            order.seller.display_name,
    })
  );

  await resendClient.emails.send({
    from:    `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM_ADDRESS}>`,
    to:      [buyer.email],
    reply_to: process.env.EMAIL_REPLY_TO!,
    subject: `✅ Order Confirmed — ${order.product.title}`,
    html,
    tags: [
      { name: "category",    value: "transactional" },
      { name: "order_id",    value: order.id },
      { name: "template",    value: "order_confirmed" },
    ],
  });
}
```

---

## 4. Shiprocket Logistics

### 4.1 Authentication (JWT Token — Refreshed Every 24h)

```typescript
// shiprocket.auth.ts
const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";

let cachedToken: { token: string; expiresAt: Date } | null = null;

async function getShiprocketToken(): Promise<string> {
  // Return cached token if still valid (within 23h to allow buffer)
  if (cachedToken && new Date() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const response = await axios.post(`${SHIPROCKET_BASE_URL}/auth/login`, {
    email:    process.env.SHIPROCKET_EMAIL!,
    password: process.env.SHIPROCKET_PASSWORD!,
  });

  const token = response.data.token;
  cachedToken = {
    token,
    expiresAt: new Date(Date.now() + 23 * 60 * 60 * 1000),   // Expire after 23h (Shiprocket tokens last 24h)
  };

  return token;
}

// Axios instance with auto-injected token
async function shiprocketRequest(config: AxiosRequestConfig): Promise<AxiosResponse> {
  const token = await getShiprocketToken();
  return axios({
    ...config,
    baseURL: SHIPROCKET_BASE_URL,
    headers: {
      ...config.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}
```

### 4.2 Create Shipment

```typescript
async function createShipment(order: Order): Promise<ShipmentCreationResult> {
  const payload = {
    order_id:        order.id,
    order_date:      order.created_at.toISOString().split("T")[0],   // YYYY-MM-DD
    pickup_location: "Primary",     // Warehouse name configured in Shiprocket dashboard
    comment:         `Tanthavi Marketplace Order ${order.id}`,
    
    billing_customer_name:    order.buyer.full_name,
    billing_last_name:        "",
    billing_address:          order.delivery_address.line1,
    billing_address_2:        order.delivery_address.line2 ?? "",
    billing_city:             order.delivery_address.city,
    billing_pincode:          order.delivery_address.pincode,
    billing_state:            order.delivery_address.state,
    billing_country:          "India",
    billing_email:            order.buyer.email,
    billing_phone:            order.buyer.phone,
    billing_alternate_phone:  "",

    shipping_is_billing: true,   // Use billing address as shipping address (true for most B2C)

    order_items: order.items.map(item => ({
      name:       item.product.title,
      sku:        item.product.sku ?? `SKU-${item.product.id.slice(0, 8)}`,
      units:      item.quantity,
      selling_price: item.unit_price,
      discount:   0,
      tax:        item.gst_amount,
      hsn:        item.product.hsn_code ?? "63015000",   // Default HSN for handloom fabrics
    })),

    payment_method:   order.payment_method === "COD" ? "COD" : "Prepaid",
    shipping_charges: order.shipping_charges,
    giftwrap_charges: 0,
    transaction_charges: 0,
    total_discount:  0,
    sub_total:       order.product_value,
    length:          order.package_dimensions?.length_cm ?? 30,
    breadth:         order.package_dimensions?.breadth_cm ?? 20,
    height:          order.package_dimensions?.height_cm ?? 5,
    weight:          order.package_weight_kg ?? 0.5,
  };

  const response = await shiprocketRequest({
    method: "POST",
    url: "/orders/create/adhoc",
    data: payload,
  });

  const { shipment_id, order_id: shiprocket_order_id } = response.data;

  await orderRepository.update(order.id, {
    shiprocket_order_id,
    shiprocket_shipment_id: shipment_id,
    shipment_status: "CREATED",
  });

  return { shipment_id, shiprocket_order_id };
}
```

### 4.3 Generate AWB Number

```typescript
async function generateAWB(
  shipment_id: number,
  courier_id: number   // See rate calculator to select courier_id
): Promise<string> {
  const response = await shiprocketRequest({
    method: "POST",
    url: "/courier/assign/awb",
    data: {
      shipment_id: shipment_id.toString(),
      courier_id:  courier_id.toString(),
    },
  });

  const awb = response.data.response?.data?.awb_code;
  if (!awb) {
    throw new Error(`AWB generation failed: ${JSON.stringify(response.data)}`);
  }

  return awb;
}
```

### 4.4 Track Shipment

```typescript
async function trackShipment(awb: string): Promise<TrackingInfo> {
  const response = await shiprocketRequest({
    method: "GET",
    url: `/courier/track/awb/${awb}`,
  });

  const tracking = response.data.tracking_data;

  return {
    awb,
    current_status:        tracking.shipment_track[0]?.current_status,
    current_status_detail: tracking.shipment_track[0]?.current_status_detail,
    delivered:             tracking.shipment_track[0]?.delivered,
    estimated_delivery:    tracking.shipment_track[0]?.etd,
    tracking_history: tracking.shipment_track_activities?.map((a: any) => ({
      date:     a.date,
      activity: a.activity,
      location: a.location,
    })) ?? [],
  };
}
```

### 4.5 Webhook — `shipment_track_status_changed`

Configure in Shiprocket Dashboard → Settings → Webhooks:
- URL: `https://api.tanthavi.com/webhooks/shiprocket`

```typescript
// webhooks/shiprocket.controller.ts
async function handleShiprocketWebhook(req: Request, res: Response): Promise<void> {
  const event = req.body;

  // Map Shiprocket status codes to our order statuses
  const STATUS_MAP: Record<string, string> = {
    "Pickup Scheduled":          "PROCESSING",
    "Pickup Generated":          "PROCESSING",
    "Shipped":                   "SHIPPED",
    "In Transit":                "IN_TRANSIT",
    "Out for Delivery":          "OUT_FOR_DELIVERY",
    "Delivered":                 "DELIVERED",
    "Delivery Failed":           "DELIVERY_FAILED",
    "Pickup Rescheduled":        "RESCHEDULED",
    "Undelivered":               "DELIVERY_FAILED",
    "Returned to Origin (RTO)":  "RETURNED_TO_SELLER",
    "RTO Delivered":             "RETURNED_TO_SELLER",
  };

  const shiprocket_status = event.current_status;
  const our_status = STATUS_MAP[shiprocket_status];

  if (!our_status) {
    logger.info(`Unhandled Shiprocket status: ${shiprocket_status}`);
    res.status(200).json({ received: true });
    return;
  }

  const order = await orderRepository.findByShiprocketOrderId(event.order_id);
  if (!order) {
    logger.error(`Order not found for Shiprocket order: ${event.order_id}`);
    res.status(200).json({ received: true });    // 200 to prevent retry storms
    return;
  }

  await orderService.transitionStatus(order.id, our_status, "WEBHOOK", {
    shiprocket_status,
    awb: event.awb_code,
    courier: event.courier_name,
    location: event.current_location,
  });

  res.status(200).json({ received: true });
}
```

### 4.6 Rate Calculator

```typescript
async function getShippingRates(
  pickup_pincode:   string,
  delivery_pincode: string,
  weight_kg:        number,
  cod:              boolean
): Promise<ShippingRate[]> {
  const response = await shiprocketRequest({
    method: "GET",
    url: "/courier/serviceability/",
    params: {
      pickup_postcode:   pickup_pincode,
      delivery_postcode: delivery_pincode,
      weight:            weight_kg,
      cod:               cod ? 1 : 0,
    },
  });

  const couriers = response.data.data?.available_courier_companies ?? [];

  return couriers
    .filter((c: any) => c.is_hyperlocal === 0)   // Exclude hyperlocal couriers for national shipping
    .map((c: any) => ({
      courier_id:       c.courier_company_id,
      courier_name:     c.courier_name,
      rate:             c.rate,
      estimated_days:   c.etd,
      is_cod_available: c.cod === 1,
    }))
    .sort((a: any, b: any) => a.rate - b.rate);   // Sort by price ascending
}
```

---

## 5. Google OAuth 2.0

### 5.1 Setup

```bash
GOOGLE_CLIENT_ID=XXXXXXXXXXXX-XXXXXXXXXXXX.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-XXXXXXXXXXXXXXXXXXXX
GOOGLE_CALLBACK_URL=https://tanthavi.com/auth/google/callback
```

**Google Cloud Console Configuration:**
1. Create project at console.cloud.google.com
2. Enable **Google+ API** and **People API**
3. Create OAuth 2.0 credentials (Web Application type)
4. Add authorized redirect URIs:
   - `https://tanthavi.com/auth/google/callback` (production)
   - `http://localhost:3000/auth/google/callback` (development)
5. Add authorized JavaScript origins: `https://tanthavi.com`

### 5.2 OAuth 2.0 Flow

```typescript
// auth/google.strategy.ts (using Passport.js + NestJS)
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, VerifyCallback } from "passport-google-oauth20";

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor(private authService: AuthService) {
    super({
      clientID:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL:  process.env.GOOGLE_CALLBACK_URL!,
      scope:        ["email", "profile"],   // Required scopes only — no Calendar, Drive, etc.
      passReqToCallback: true,              // Pass req for state validation
    });
  }

  async validate(
    req: Request,
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback
  ): Promise<any> {
    // CSRF protection: validate state parameter
    const stateFromSession = (req as any).session?.oauthState;
    const stateFromQuery   = req.query?.state;
    
    if (!stateFromSession || stateFromSession !== stateFromQuery) {
      return done(new Error("OAuth state mismatch — possible CSRF attack"), null);
    }

    const { emails, name, photos, id: googleId } = profile;
    const email = emails[0]?.value;

    if (!email) {
      return done(new Error("No email returned from Google"), null);
    }

    // Find or create user
    const user = await this.authService.findOrCreateOAuthUser({
      provider:       "google",
      provider_id:    googleId,
      email,
      full_name:      `${name.givenName} ${name.familyName}`.trim(),
      avatar_url:     photos[0]?.value,
      email_verified: true,    // Google emails are pre-verified
    });

    return done(null, user);
  }
}
```

### 5.3 OAuth Initiation — State Parameter for CSRF

```typescript
// auth.controller.ts
@Get("google")
@UseGuards(AuthGuard("google"))
async googleLogin(@Req() req: Request, @Res() res: Response): Promise<void> {
  // Generate and store CSRF state token
  const state = crypto.randomBytes(32).toString("hex");
  (req as any).session.oauthState = state;
  
  // Passport handles redirect to Google's OAuth URL with state param
  // The state is automatically included by passport-google-oauth20
}

@Get("google/callback")
@UseGuards(AuthGuard("google"))
async googleCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
  const user = req.user as User;
  
  // Issue JWT
  const { access_token, refresh_token } = await this.authService.generateTokens(user);
  
  // Clear OAuth state from session
  delete (req as any).session.oauthState;
  
  // Redirect to frontend with token (use httpOnly cookie for security)
  res.cookie("access_token", access_token, {
    httpOnly: true,
    secure:   true,
    sameSite: "lax",
    maxAge:   15 * 60 * 1000,   // 15 minutes
  });
  res.cookie("refresh_token", refresh_token, {
    httpOnly: true,
    secure:   true,
    sameSite: "lax",
    maxAge:   30 * 24 * 60 * 60 * 1000,   // 30 days
  });
  
  res.redirect("https://tanthavi.com/auth/complete");
}
```

---

## 6. Firebase Cloud Messaging (Push Notifications)

### 6.1 FCM Setup

```bash
FIREBASE_PROJECT_ID=tanthavi-marketplace
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nXXXX\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-XXXXX@tanthavi-marketplace.iam.gserviceaccount.com
FIREBASE_STORAGE_BUCKET=tanthavi-marketplace.appspot.com
```

```typescript
// firebase.provider.ts
import * as admin from "firebase-admin";

admin.initializeApp({
  credential: admin.credential.cert({
    projectId:    process.env.FIREBASE_PROJECT_ID!,
    privateKey:   process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    clientEmail:  process.env.FIREBASE_CLIENT_EMAIL!,
  }),
});

export const firebaseMessaging = admin.messaging();
```

### 6.2 Frontend: Service Worker Registration

```javascript
// public/firebase-messaging-sw.js (served at root, must be accessible at /firebase-messaging-sw.js)
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey:            "XXXXXXXX",
  authDomain:        "tanthavi-marketplace.firebaseapp.com",
  projectId:         "tanthavi-marketplace",
  storageBucket:     "tanthavi-marketplace.appspot.com",
  messagingSenderId: "XXXXXXXXXXXX",
  appId:             "1:XXXXXXXXXXXX:web:XXXXXXXXXXXX",
});

const messaging = firebase.messaging();

// Handle background push notifications (when tab is not focused)
messaging.onBackgroundMessage((payload) => {
  const { title, body, image, click_action } = payload.notification;

  self.registration.showNotification(title, {
    body,
    icon:  image ?? "/icons/icon-192x192.png",
    badge: "/icons/badge-72x72.png",
    data:  { click_action },
  });
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.click_action ?? "https://tanthavi.com";
  event.waitUntil(clients.openWindow(url));
});
```

```typescript
// frontend: push-notification.service.ts
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const VAPID_KEY = "BM7xxx..."; // FCM VAPID key from Firebase Console → Project Settings → Cloud Messaging

async function registerPushNotifications(): Promise<string | null> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const messaging = getMessaging();
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });

    if (token) {
      // Send token to backend for storage
      await api.post("/api/v1/users/me/push-token", { token, platform: "web" });
    }

    return token;
  } catch (error) {
    console.warn("Push notification registration failed:", error);
    return null;
  }
}

// Handle foreground notifications (when app is open)
onMessage(getMessaging(), (payload) => {
  const { title, body } = payload.notification!;
  showInAppToast({ title, body, action_url: payload.data?.click_action });
});
```

### 6.3 Token Storage

```sql
CREATE TABLE user_push_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       TEXT NOT NULL UNIQUE,
    platform    TEXT NOT NULL CHECK (platform IN ('web', 'ios', 'android')),
    device_id   TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_push_tokens_user ON user_push_tokens(user_id) WHERE is_active = true;
```

### 6.4 Sending Notifications from Backend

```typescript
// notification.service.ts
async function sendPushNotification(
  user_id: string,
  notification: PushNotificationPayload
): Promise<void> {
  const tokens = await db.query<{ token: string; platform: string }>(
    "SELECT token, platform FROM user_push_tokens WHERE user_id = $1 AND is_active = true",
    [user_id]
  );

  if (!tokens.length) return;

  const messages: admin.messaging.MulticastMessage = {
    tokens: tokens.map(t => t.token),
    notification: {
      title: notification.title,
      body:  notification.body,
      imageUrl: notification.image_url,
    },
    data: {
      click_action: notification.action_url ?? "https://tanthavi.com",
      category:     notification.category,
      ...notification.extra_data,
    },
    webpush: {
      fcmOptions: { link: notification.action_url },
      notification: { icon: "https://tanthavi.com/icons/icon-192x192.png" },
    },
    android: {
      notification: {
        channelId: notification.category,  // Android notification channel
        priority:  notification.priority === "high" ? "high" : "normal",
      },
    },
  };

  const response = await firebaseMessaging.sendEachForMulticast(messages);

  // Handle invalid tokens (deregister them)
  response.responses.forEach((result, idx) => {
    if (!result.success) {
      const errorCode = result.error?.code;
      if (errorCode === "messaging/registration-token-not-registered" ||
          errorCode === "messaging/invalid-registration-token") {
        // Deactivate stale token
        db.query(
          "UPDATE user_push_tokens SET is_active = false WHERE token = $1",
          [tokens[idx].token]
        );
      }
    }
  });
}
```

### 6.5 Notification Categories & Click Actions

| Category | Title Format | Click Action URL |
|----------|-------------|-----------------|
| `order_update` | "Order #{id} Update" | `/orders/{id}` |
| `payment_confirmed` | "Payment Confirmed! 🎉" | `/orders/{id}` |
| `order_shipped` | "Your order is on the way! 📦" | `/orders/{id}/tracking` |
| `order_delivered` | "Delivered! Share your feedback" | `/orders/{id}/review` |
| `return_update` | "Return Update for Order #{id}" | `/orders/{id}/return` |
| `refund_processed` | "Refund Processed ✅" | `/wallet` |
| `price_drop` | "Price Drop Alert! 💰" | `/products/{id}` |
| `new_message` | "New message from {name}" | `/messages/{thread_id}` |
| `payout_sent` | "₹{amount} Payout Sent 💸" | `/seller/earnings` |
| `verification_update` | "Verification Result Available" | `/seller/verification` |
| `scheme_alert` | "New Scheme: {scheme_name}" | `/schemes/{id}` |

---

## 7. AWS S3

### 7.1 Bucket Structure

**Bucket Name Conventions:** `tanthavi-{environment}-{purpose}` (e.g., `tanthavi-prod-kyc`)

```
tanthavi-prod-kyc/              [Private — no public access]
  ├── pending/{seller_id}/{submission_id}/
  │     ├── workspace_1.jpg
  │     ├── product_1.jpg
  │     └── ...
  ├── verified/{seller_id}/
  │     └── {document_type}_{timestamp}.jpg
  └── aadhaar/ pan/ gst/        [Subfolder per document type]

tanthavi-prod-media/            [Public via CloudFront]
  ├── product-images/
  │     └── {product_id}/
  │           ├── original/     → Raw upload (private, pre-signed URL generation)
  │           └── processed/    → Resized variants (public via CloudFront)
  │                 ├── 300x300.webp
  │                 ├── 600x600.webp
  │                 └── 1200x1200.webp
  ├── post-media/
  │     └── {post_id}/
  │           ├── image_1.webp
  │           └── ...
  ├── reel-transcoded/
  │     └── {reel_id}/
  │           ├── 360p/         → HLS segments
  │           ├── 480p/
  │           ├── 720p/
  │           └── master.m3u8
  └── avatars/
        └── {user_id}.webp

tanthavi-prod-documents/        [Private — pre-signed URL only]
  ├── invoice-pdfs/
  │     └── {order_id}/invoice_{order_id}.pdf
  ├── payout-statements/
  │     └── {seller_id}/{year}/{month}/statement.pdf
  └── tds-certificates/
        └── {seller_id}/{year}/form_16a.pdf
```

**Bucket Policies Summary:**

| Bucket | Public Access | Access Method |
|--------|--------------|---------------|
| `tanthavi-prod-kyc` | ❌ Blocked | IAM role only (backend + AI service) |
| `tanthavi-prod-media` | ✅ via CloudFront | Public CDN URL (no S3 direct access) |
| `tanthavi-prod-documents` | ❌ Blocked | Pre-signed URLs (15-min TTL) |

### 7.2 Pre-Signed Upload URL Generation

```typescript
// s3.service.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function generatePresignedUploadUrl(
  bucket: string,
  key: string,
  contentType: string,
  maxSizeMB: number = 10
): Promise<{ upload_url: string; key: string }> {
  
  const command = new PutObjectCommand({
    Bucket:        bucket,
    Key:           key,
    ContentType:   contentType,
    Metadata: {
      "uploaded-by":  "tanthavi-api",
      "upload-time":  new Date().toISOString(),
    },
    // Content-length restriction enforced via bucket policy, not here
  });

  const upload_url = await getSignedUrl(s3Client, command, {
    expiresIn: 300,   // 5 minutes to initiate upload
  });

  return { upload_url, key };
}

// Usage: seller uploading a product image
async function getProductImageUploadUrl(
  seller_id: string,
  product_id: string,
  filename: string,
  content_type: string
): Promise<{ upload_url: string; key: string; public_url: string }> {
  
  const ext = filename.split(".").pop()?.toLowerCase() ?? "jpg";
  const key = `product-images/${product_id}/original/${Date.now()}.${ext}`;

  const { upload_url } = await generatePresignedUploadUrl(
    "tanthavi-prod-media",
    key,
    content_type,
    10   // Max 10MB for product images
  );

  // CloudFront URL for the processed version (will be available after image processing Lambda runs)
  const public_url = `https://${process.env.CLOUDFRONT_DOMAIN}/${key}`;

  return { upload_url, key, public_url };
}

// Generate pre-signed download URL for private documents
async function generatePresignedDownloadUrl(
  bucket: string,
  key: string,
  ttl_seconds: number = 900   // 15 minutes default
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn: ttl_seconds });
}
```

### 7.3 CloudFront Distribution Setup

**Distribution Settings:**

| Setting | Value |
|---------|-------|
| Origin | S3 bucket (`tanthavi-prod-media`) |
| Origin Access Control | OAC (not legacy OAI) — restricts S3 to CloudFront only |
| Viewer Protocol Policy | Redirect HTTP to HTTPS |
| Allowed HTTP Methods | GET, HEAD |
| TTL (Default) | 86400s (24h) |
| TTL (Maximum) | 31536000s (1 year) for versioned assets |
| Price Class | PriceClass_200 (North America + Europe + India — covers Indian users best) |
| Custom Domain | media.tanthavi.com |
| SSL | ACM certificate for `*.tanthavi.com` |
| Compression | GZip + Brotli enabled |

**Cache Behaviors:**

```
/product-images/*/processed/*  → TTL 1 year (images are immutable once processed; new version = new key)
/reel-transcoded/*/master.m3u8 → TTL 1 hour (playlist may update if transcoding restarts)
/reel-transcoded/*/*.ts        → TTL 1 year (HLS segments are immutable)
/avatars/*                     → TTL 1 day
/post-media/*                  → TTL 7 days
```

### 7.4 CORS Configuration

Apply to `tanthavi-prod-media` bucket (for pre-signed upload URLs):

```json
[
  {
    "AllowedHeaders": ["Content-Type", "Content-Length", "x-amz-server-side-encryption"],
    "AllowedMethods": ["PUT", "POST"],
    "AllowedOrigins": ["https://tanthavi.com", "https://seller.tanthavi.com", "http://localhost:3000"],
    "ExposeHeaders":  ["ETag"],
    "MaxAgeSeconds":  3000
  },
  {
    "AllowedHeaders": [],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders":  [],
    "MaxAgeSeconds":  3000
  }
]
```

### 7.5 Image Processing Lambda (Post-Upload)

After seller uploads product image to S3 (`product-images/{id}/original/`), a Lambda function processes it:

```python
# lambda/image_processor.py
import boto3
from PIL import Image
import io

s3 = boto3.client("s3")

SIZES = [(300, 300), (600, 600), (1200, 1200)]

def handler(event, context):
    record = event["Records"][0]
    bucket = record["s3"]["bucket"]["name"]
    key    = record["s3"]["object"]["key"]   # product-images/{id}/original/xxx.jpg
    
    # Download original
    response = s3.get_object(Bucket=bucket, Key=key)
    image = Image.open(io.BytesIO(response["Body"].read())).convert("RGB")
    
    product_dir = "/".join(key.split("/")[:-2])    # product-images/{id}
    
    for width, height in SIZES:
        # Thumbnail: maintains aspect ratio, fits within WxH
        img_copy = image.copy()
        img_copy.thumbnail((width, height), Image.LANCZOS)
        
        # Pad to exact WxH with white background
        canvas = Image.new("RGB", (width, height), (255, 255, 255))
        offset = ((width - img_copy.width) // 2, (height - img_copy.height) // 2)
        canvas.paste(img_copy, offset)
        
        # Save as WebP
        buffer = io.BytesIO()
        canvas.save(buffer, format="WEBP", quality=85, optimize=True)
        buffer.seek(0)
        
        out_key = f"{product_dir}/processed/{width}x{height}.webp"
        s3.put_object(
            Bucket=bucket,
            Key=out_key,
            Body=buffer.getvalue(),
            ContentType="image/webp",
            CacheControl="max-age=31536000",   # 1-year browser cache
        )
    
    return {"status": "success", "processed_key": key}
```

---

## 8. GST Verification API

### 8.1 Provider Options

**Primary:** Surepass (`https://kyc-api.surepass.io`)  
**Fallback:** Karza (`https://api.karza.in`) — used if Surepass is down

```bash
SUREPASS_API_TOKEN=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
KARZA_API_KEY=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
KARZA_CLIENT_ID=XXXXXXXXXXXX
```

### 8.2 GSTIN Validation (Surepass)

```typescript
// gst.service.ts

interface GSTNDetails {
  gstin: string;
  legal_name: string;
  trade_name?: string;
  status: "Active" | "Cancelled" | "Suspended";
  registration_date: string;
  taxpayer_type: string;
  principal_address: string;
  state: string;
  state_code: string;
}

async function verifyGSTIN(gstin: string): Promise<{ valid: boolean; details?: GSTNDetails; error?: string }> {
  // Basic format validation before API call (saves API credits)
  const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!GSTIN_REGEX.test(gstin)) {
    return { valid: false, error: "Invalid GSTIN format" };
  }

  try {
    const response = await axios.post(
      "https://kyc-api.surepass.io/api/v1/corporate/gstin",
      { id_number: gstin },
      {
        headers: {
          Authorization: `Bearer ${process.env.SUREPASS_API_TOKEN!}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,   // 10s timeout
      }
    );

    const data = response.data.data;

    if (!data || response.data.success !== true) {
      return { valid: false, error: "GSTIN not found in government records" };
    }

    return {
      valid: data.gstin_status === "Active",
      details: {
        gstin:               gstin,
        legal_name:          data.legal_name_of_business,
        trade_name:          data.trade_name,
        status:              data.gstin_status,
        registration_date:   data.date_of_registration,
        taxpayer_type:       data.taxpayer_type,
        principal_address:   data.principal_place_of_business_fields?.address ?? "",
        state:               data.state_jurisdiction,
        state_code:          gstin.slice(0, 2),
      },
    };

  } catch (error: any) {
    if (error.response?.status === 404) {
      return { valid: false, error: "GSTIN does not exist in GST portal records" };
    }
    if (error.response?.status === 429) {
      // Rate limited: try fallback
      return verifyGSTINFallback(gstin);
    }
    // Network error, API down, etc.
    logger.error(`Surepass GSTIN verification failed: ${error.message}`);
    return verifyGSTINFallback(gstin);
  }
}

// Karza fallback
async function verifyGSTINFallback(gstin: string): Promise<{ valid: boolean; details?: GSTNDetails; error?: string }> {
  try {
    const response = await axios.post(
      "https://api.karza.in/v3/gst/gstindetails",
      { gstin, consent: "Y" },
      {
        headers: {
          "x-karza-key": process.env.KARZA_API_KEY!,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    const data = response.data;
    if (data.statusCode !== 101) {
      return { valid: false, error: "GSTIN verification failed via fallback provider" };
    }

    return {
      valid: data.result?.sts === "Active",
      details: {
        gstin,
        legal_name:        data.result?.lgnm ?? "",
        trade_name:        data.result?.tradeNam,
        status:            data.result?.sts,
        registration_date: data.result?.rgdt,
        taxpayer_type:     data.result?.dty,
        principal_address: data.result?.pradr?.addr?.stcd ?? "",
        state:             data.result?.pradr?.addr?.stcd ?? "",
        state_code:        gstin.slice(0, 2),
      },
    };

  } catch (error: any) {
    // Both Surepass and Karza failed: trigger manual review
    logger.error(`Both GSTIN verification providers failed for ${gstin}. Flagging for manual review.`);
    await adminAlertService.createAlert({
      type: "GST_VERIFICATION_API_DOWN",
      message: `GSTIN ${gstin} could not be verified automatically. Manual verification required.`,
      severity: "medium",
    });
    return {
      valid: false,
      error: "Automatic GSTIN verification is currently unavailable. Our team will verify manually within 24 hours.",
    };
  }
}
```

---

## 9. Elasticsearch / AWS OpenSearch

### 9.1 Index Configuration

**Index Name:** `tanthavi_products_v1` (aliased as `tanthavi_products` for zero-downtime reindexing)

```json
{
  "settings": {
    "number_of_shards":   3,
    "number_of_replicas": 1,
    "analysis": {
      "analyzer": {
        "hindi_analyzer": {
          "type":      "custom",
          "tokenizer": "standard",
          "filter":    ["lowercase", "hindi_normalization", "stemmer"]
        },
        "autocomplete_analyzer": {
          "type":      "custom",
          "tokenizer": "standard",
          "filter":    ["lowercase", "edge_ngram_filter"]
        },
        "search_autocomplete_analyzer": {
          "type":      "custom",
          "tokenizer": "standard",
          "filter":    ["lowercase"]
        }
      },
      "filter": {
        "hindi_normalization": { "type": "icu_normalizer" },
        "edge_ngram_filter": {
          "type":     "edge_ngram",
          "min_gram": 2,
          "max_gram": 20
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "id":               { "type": "keyword" },
      "title": {
        "type":   "text",
        "analyzer": "standard",
        "fields": {
          "hindi": { "type": "text", "analyzer": "hindi_analyzer" },
          "autocomplete": { "type": "text", "analyzer": "autocomplete_analyzer", "search_analyzer": "search_autocomplete_analyzer" },
          "keyword": { "type": "keyword" }
        }
      },
      "description":      { "type": "text", "analyzer": "standard" },
      "craft_type":       { "type": "keyword" },
      "category_id":      { "type": "keyword" },
      "category_path":    { "type": "keyword" },
      "material":         { "type": "keyword" },
      "primary_color":    { "type": "keyword" },
      "technique":        { "type": "keyword" },
      "mrp":              { "type": "scaled_float", "scaling_factor": 100 },
      "retailer_price":   { "type": "scaled_float", "scaling_factor": 100 },
      "is_negotiable":    { "type": "boolean" },
      "is_in_stock":      { "type": "boolean" },
      "status":           { "type": "keyword" },
      "avg_rating":       { "type": "float" },
      "review_count":     { "type": "integer" },
      "orders_count":     { "type": "integer" },
      "views_30d":        { "type": "integer" },
      "verification_score": { "type": "integer" },
      "seller_id":        { "type": "keyword" },
      "seller_name":      { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "seller_state":     { "type": "keyword" },
      "seller_district":  { "type": "keyword" },
      "seller_verified":  { "type": "boolean" },
      "seller_badge":     { "type": "keyword" },
      "seller_reputation_score": { "type": "float" },
      "location": {
        "type": "geo_point"   // { "lat": 20.5937, "lon": 78.9629 }
      },
      "images":           { "type": "keyword", "index": false },  // S3 keys; not searchable
      "tags":             { "type": "keyword" },
      "is_made_to_order": { "type": "boolean" },
      "published_at":     { "type": "date" },
      "updated_at":       { "type": "date" }
    }
  }
}
```

### 9.2 Indexing Strategy — Change Data Capture

Products are indexed in Elasticsearch/OpenSearch via **event-driven updates**:

```
PostgreSQL → Debezium CDC → Kafka topic (tanthavi.products.changes) → Indexer microservice → OpenSearch
```

```typescript
// indexer/product.indexer.ts
async function handleProductChange(event: CDCEvent): Promise<void> {
  const { operation, after: product } = event;   // operation: INSERT | UPDATE | DELETE

  if (operation === "DELETE" || product.status === "DELETED") {
    await opensearch.delete({ index: "tanthavi_products", id: product.id });
    return;
  }

  if (!["PUBLISHED"].includes(product.status)) {
    // Don't index unpublished products; delete if it was previously indexed
    try {
      await opensearch.delete({ index: "tanthavi_products", id: product.id });
    } catch { /* ignore 404 */ }
    return;
  }

  // Enrich with seller data
  const seller = await sellerRepository.findById(product.seller_id);

  const doc = {
    id:              product.id,
    title:           product.title,
    description:     product.description,
    craft_type:      product.craft_type,
    category_id:     product.category_id,
    material:        product.material,
    primary_color:   product.primary_color,
    mrp:             product.mrp,
    retailer_price:  product.retailer_price,
    is_negotiable:   product.is_negotiable,
    is_in_stock:     product.is_in_stock,
    status:          product.status,
    avg_rating:      product.avg_rating ?? 0,
    review_count:    product.review_count ?? 0,
    orders_count:    product.orders_count ?? 0,
    verification_score: seller.verification_score,
    seller_id:       seller.id,
    seller_name:     seller.display_name,
    seller_state:    seller.state,
    seller_district: seller.district,
    seller_verified: seller.verification_badge !== "UNVERIFIED",
    seller_badge:    seller.verification_badge,
    seller_reputation_score: seller.reputation_score,
    location:        seller.latitude && seller.longitude
                       ? { lat: seller.latitude, lon: seller.longitude }
                       : null,
    tags:            product.tags ?? [],
    published_at:    product.published_at,
    updated_at:      new Date().toISOString(),
  };

  await opensearch.index({
    index: "tanthavi_products",
    id:    product.id,
    document: doc,
  });
}
```

### 9.3 Search Query Construction

```typescript
// search.service.ts
async function searchProducts(params: SearchParams): Promise<SearchResult> {
  const {
    query,          // Full-text search string
    category_id,   // Filter by category
    state,          // Filter by seller state
    craft_type,
    min_price,
    max_price,
    in_stock_only = true,
    verified_only = false,
    sort_by = "relevance",    // relevance | price_asc | price_desc | rating | newest
    lat,            // For geo-based proximity search
    lon,
    radius_km = 500,
    page = 1,
    page_size = 20,
  } = params;

  const from = (page - 1) * page_size;

  // Build query
  const must: any[] = [
    { term: { status: "PUBLISHED" } },
  ];

  if (in_stock_only) {
    must.push({ term: { is_in_stock: true } });
  }

  if (verified_only) {
    must.push({ term: { seller_verified: true } });
  }

  // Full-text search
  const should: any[] = [];
  if (query) {
    should.push(
      {
        multi_match: {
          query,
          fields: [
            "title^3",                    // Title matches weighted 3x
            "title.autocomplete^2",
            "title.hindi^2",
            "description",
            "seller_name",
            "tags^2",
            "craft_type^2",
          ],
          type:     "best_fields",
          fuzziness: "AUTO",              // Typo tolerance
          prefix_length: 2,
          operator: "or",
        },
      }
    );
  }

  // Filters
  const filter: any[] = [];

  if (category_id) {
    filter.push({ term: { category_id } });
  }

  if (state) {
    filter.push({ term: { seller_state: state } });
  }

  if (craft_type) {
    filter.push({ term: { craft_type } });
  }

  if (min_price !== undefined || max_price !== undefined) {
    filter.push({
      range: {
        mrp: {
          ...(min_price !== undefined ? { gte: min_price } : {}),
          ...(max_price !== undefined ? { lte: max_price } : {}),
        },
      },
    });
  }

  // Geo filter
  if (lat && lon) {
    filter.push({
      geo_distance: {
        distance:  `${radius_km}km`,
        location:  { lat, lon },
      },
    });
  }

  // Sort
  let sort: any[] = [];
  switch (sort_by) {
    case "price_asc":  sort = [{ mrp: "asc" }]; break;
    case "price_desc": sort = [{ mrp: "desc" }]; break;
    case "rating":     sort = [{ avg_rating: "desc" }, { review_count: "desc" }]; break;
    case "newest":     sort = [{ published_at: "desc" }]; break;
    default:           sort = ["_score", { verification_score: "desc" }, { seller_reputation_score: "desc" }];
  }

  const esQuery = {
    index: "tanthavi_products",
    from,
    size: page_size,
    query: {
      bool: {
        must,
        should,
        filter,
        minimum_should_match: should.length > 0 ? 1 : 0,
      },
    },
    sort,
    aggs: {
      // Facets for filters
      categories: { terms: { field: "category_id", size: 20 } },
      states:     { terms: { field: "seller_state", size: 35 } },
      craft_types:{ terms: { field: "craft_type",   size: 40 } },
      colors:     { terms: { field: "primary_color",size: 20 } },
      price_ranges: {
        range: {
          field: "mrp",
          ranges: [
            { to: 500 },
            { from: 500, to: 2000 },
            { from: 2000, to: 5000 },
            { from: 5000, to: 20000 },
            { from: 20000 },
          ],
        },
      },
    },
    highlight: {
      fields: {
        title:       { number_of_fragments: 1, fragment_size: 150 },
        description: { number_of_fragments: 2, fragment_size: 200 },
      },
    },
  };

  const response = await opensearchClient.search(esQuery);

  return {
    total:    response.hits.total.value,
    products: response.hits.hits.map(hit => ({
      ...hit._source,
      _score:     hit._score,
      _highlight: hit.highlight,
    })),
    facets: {
      categories:   response.aggregations?.categories?.buckets ?? [],
      states:       response.aggregations?.states?.buckets ?? [],
      craft_types:  response.aggregations?.craft_types?.buckets ?? [],
      colors:       response.aggregations?.colors?.buckets ?? [],
      price_ranges: response.aggregations?.price_ranges?.buckets ?? [],
    },
    page,
    page_size,
    total_pages: Math.ceil(response.hits.total.value / page_size),
  };
}
```

---

## 10. Google Vision API (Fraud Detection)

### 10.1 Setup and Authentication

```bash
GOOGLE_APPLICATION_CREDENTIALS=/secrets/google-vision-service-account.json
# OR use environment variable (for containerized deployments):
GOOGLE_VISION_SA_JSON_BASE64=base64_encoded_service_account_json
```

```typescript
// vision.service.ts
import { ImageAnnotatorClient } from "@google-cloud/vision";

let visionClient: ImageAnnotatorClient | null = null;

function getVisionClient(): ImageAnnotatorClient {
  if (!visionClient) {
    if (process.env.GOOGLE_VISION_SA_JSON_BASE64) {
      const credentials = JSON.parse(
        Buffer.from(process.env.GOOGLE_VISION_SA_JSON_BASE64, "base64").toString("utf-8")
      );
      visionClient = new ImageAnnotatorClient({ credentials });
    } else {
      visionClient = new ImageAnnotatorClient();    // Uses GOOGLE_APPLICATION_CREDENTIALS
    }
  }
  return visionClient;
}
```

### 10.2 Web Detection API Call

```typescript
// vision.service.ts

interface WebDetectionResult {
  is_stock_image:     boolean;
  confidence:         number;
  stock_site_matches: string[];
  full_match_count:   number;
  partial_match_count: number;
  web_entity_labels:  string[];
  best_guess_labels:  string[];
  total_pages_matching: number;
}

async function detectStockImage(imageBytes: Buffer): Promise<WebDetectionResult> {
  const client = getVisionClient();

  const [result] = await client.webDetection({
    image: { content: imageBytes.toString("base64") },
    imageContext: {
      webDetectionParams: {
        includeGeoResults: false,
      },
    },
  });

  const webDetection = result.webDetection;

  if (!webDetection) {
    return {
      is_stock_image:     false,
      confidence:         0,
      stock_site_matches: [],
      full_match_count:   0,
      partial_match_count: 0,
      web_entity_labels:  [],
      best_guess_labels:  [],
      total_pages_matching: 0,
    };
  }

  // Known stock photography domains
  const STOCK_DOMAINS = [
    "shutterstock.com", "gettyimages.com", "istockphoto.com",
    "alamy.com", "stock.adobe.com", "dreamstime.com",
    "depositphotos.com", "freepik.com", "unsplash.com",
    "pexels.com", "pixabay.com", "canva.com",
    "123rf.com", "vectorstock.com", "bigstockphoto.com",
  ];

  const pagesWithMatchingImages = webDetection.pagesWithMatchingImages ?? [];
  const fullMatchingImages       = webDetection.fullMatchingImages ?? [];
  const partialMatchingImages    = webDetection.partialMatchingImages ?? [];
  const webEntities              = webDetection.webEntities ?? [];
  const bestGuessLabels          = webDetection.bestGuessLabels ?? [];

  // Find pages from stock sites
  const stockSiteMatches: string[] = [];
  for (const page of pagesWithMatchingImages) {
    const url = page.url ?? "";
    for (const domain of STOCK_DOMAINS) {
      if (url.includes(domain)) {
        stockSiteMatches.push(url);
        break;
      }
    }
  }

  // Scoring
  const fullMatchScore    = Math.min(fullMatchingImages.length * 0.3, 0.6);    // Max 0.6 from full matches
  const stockSiteScore    = Math.min(stockSiteMatches.length * 0.4, 0.4);      // Max 0.4 from stock sites
  const pageCountScore    = Math.min(pagesWithMatchingImages.length / 20, 0.2); // Normalized page count
  
  // Confidence = weighted combination (max 1.0)
  const confidence = Math.min(fullMatchScore + stockSiteScore + pageCountScore, 1.0);
  
  // Image is considered stock if:
  // 1. Appears on any known stock site, OR
  // 2. Confidence > 0.6 (many full matches across multiple sites)
  const is_stock_image = stockSiteMatches.length > 0 || confidence > 0.60;

  return {
    is_stock_image,
    confidence:         Math.round(confidence * 1000) / 1000,
    stock_site_matches: stockSiteMatches.slice(0, 5),   // Return top 5
    full_match_count:   fullMatchingImages.length,
    partial_match_count: partialMatchingImages.length,
    web_entity_labels:  webEntities.slice(0, 10).map(e => e.description ?? ""),
    best_guess_labels:  bestGuessLabels.map(l => l.label ?? ""),
    total_pages_matching: pagesWithMatchingImages.length,
  };
}
```

### 10.3 Interpreting Results

| Condition | Interpretation | Action |
|-----------|---------------|--------|
| `stockSiteMatches.length >= 1` | Image definitively found on stock site | **Immediate rejection** — show seller exact URL(s) |
| `fullMatchingImages.length >= 3` | Identical image found in 3+ places online | **Flag for admin review** |
| `confidence >= 0.80` | High confidence stock/internet image | **Immediate rejection** |
| `confidence >= 0.60` | Moderate confidence | **Flag for admin review** (allow seller to contest) |
| `confidence >= 0.30` | Low risk — may be original but shared | Log for pattern analysis; no immediate action |
| `confidence < 0.30` | Original image | Accept; record result |

### 10.4 SafeSearch Detection (for Content Moderation)

```typescript
async function checkSafeSearch(
  imageBytes: Buffer
): Promise<SafeSearchResult> {
  const client = getVisionClient();

  const [result] = await client.safeSearchDetection({
    image: { content: imageBytes.toString("base64") },
  });

  const annotation = result.safeSearchAnnotation;

  const LIKELIHOOD_MAP: Record<string, number> = {
    VERY_UNLIKELY: 0, UNLIKELY: 1, POSSIBLE: 2, LIKELY: 3, VERY_LIKELY: 4,
  };

  const adult   = LIKELIHOOD_MAP[annotation?.adult ?? "VERY_UNLIKELY"] ?? 0;
  const violence = LIKELIHOOD_MAP[annotation?.violence ?? "VERY_UNLIKELY"] ?? 0;
  const racy    = LIKELIHOOD_MAP[annotation?.racy ?? "VERY_UNLIKELY"] ?? 0;

  // Rejection threshold: LIKELY or higher for adult/violence; VERY_LIKELY for racy
  const should_reject  = adult >= 3 || violence >= 3 || racy >= 4;
  const should_review  = adult === 2 || violence === 2 || racy === 3;  // POSSIBLE

  return {
    adult_score:     adult,
    violence_score:  violence,
    racy_score:      racy,
    should_reject,
    should_review,
    rejection_reason: should_reject
      ? adult >= 3     ? "Content flagged as adult/explicit"
      : violence >= 3  ? "Content flagged as violent"
      : "Content flagged as inappropriate"
      : null,
  };
}
```

### 10.5 Rate Limits & Cost Management

| API Feature | Free Tier | Cost After Free Tier |
|-------------|-----------|---------------------|
| Web Detection | 1,000/month | $3.50 per 1,000 |
| SafeSearch Detection | 1,000/month | $1.50 per 1,000 |
| Label Detection | 1,000/month | $1.50 per 1,000 |

**Cost Control Rules:**
1. Web Detection (stock image check) runs ONLY on seller KYC verification submissions — not on every product image upload
2. SafeSearch runs on ALL post/reel uploads (first frame for video)
3. Implement local NSFW classifier as primary check; Google Vision as confirmation for borderline cases
4. Cache results: pHash-based cache prevents re-checking images already analyzed

```typescript
async function cachedStockImageCheck(
  imageBytes: Buffer,
  phash: string
): Promise<WebDetectionResult> {
  const cacheKey = `stock:check:${phash}`;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    return JSON.parse(cached);
  }

  const result = await detectStockImage(imageBytes);
  
  // Cache for 30 days (image content doesn't change; result is deterministic)
  await redis.set(cacheKey, JSON.stringify(result), "EX", 30 * 24 * 60 * 60);
  
  return result;
}
```

---

*End of 09_INTEGRATION_GUIDE.md*
