# TANTHAVI — Agent Spec Kit
## File: 07_TECH_STACK.md
## Purpose: Technology decisions with rationale. Do not change these without updating this file.

---

## Core Technology Decisions

### Frontend: Next.js 14 (App Router)

**Why**: Server-Side Rendering for SEO (product pages indexed by Google), React Server Components for fast initial loads, built-in image optimization, and file-based routing.

**Key Libraries**:
- `tanstack/react-query` v5 — server state management, caching, optimistic updates
- `zustand` — client-side UI state (cart, modals, filter state)
- `react-hook-form` + `zod` — form validation (consistent schema with backend)
- `radix-ui` — accessible UI primitives (modals, dropdowns, tabs) without opinionated styling
- `framer-motion` — animations (page transitions, micro-interactions)
- `hls.js` — HLS video playback for reels in browser
- `mapbox-gl` — maps (seller location display, delivery area)
- `recharts` — seller analytics charts
- `react-hot-toast` — toast notifications
- `@upstash/ratelimit` — optional frontend-side rate limiting for forms

**Styling**: CSS Modules + CSS Custom Properties (design tokens). **No Tailwind** (to avoid CDN dependency, better production performance control).

**Package Manager**: `pnpm` (faster installs, better monorepo support)

---

### Backend: NestJS (TypeScript)

**Why**: Structured, opinionated, decorator-based framework with built-in DI. Scales from monolith → microservices with minimal restructuring. TypeScript throughout ensures type safety shared with frontend.

**Module Structure (initial monolith, extracted to microservices in Phase 4)**:
```
AuthModule
UsersModule
ProducersModule
ConsumersModule
ProductsModule
OrdersModule
PaymentsModule
B2BModule (RFQ, quotes, POs)
SocialModule (posts, reels, follows)
SchemesModule (government schemes)
NotificationsModule
LogisticsModule
ReviewsModule
AdminModule
SearchModule
AnalyticsModule
ProxySellerModule
```

**Key Libraries**:
- `@nestjs/passport` + `passport-jwt` — JWT auth middleware
- `@nestjs/swagger` — auto-generated OpenAPI docs (every endpoint documented)
- `typeorm` — PostgreSQL ORM (entities, migrations, repositories)
- `mongoose` — MongoDB ODM (social feed, scheme entries)
- `ioredis` — Redis client (caching, OTP, sessions)
- `bull` — job queue for async processing (email, notifications, AI verification jobs)
- `sharp` — server-side image processing (resize thumbnails, convert formats)
- `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` — S3 operations
- `razorpay` — Razorpay Node SDK
- `class-validator` + `class-transformer` — request DTO validation
- `helmet` — security HTTP headers
- `express-rate-limit` — API rate limiting (wrapped as NestJS middleware)
- `@nestjs/event-emitter` — internal event bus (domain events)
- `pdfkit` or `puppeteer` — PDF invoice generation

---

### AI Service: Python + FastAPI

**Why**: Python has the best ML ecosystem. FastAPI is async-native, production-grade, and generates OpenAPI docs automatically.

**Key Libraries**:
- `fastapi` — web framework
- `uvicorn` — ASGI server (production: gunicorn + uvicorn workers)
- `torch` + `torchvision` — PyTorch for model inference
- `onnxruntime` — optimized inference (ONNX exported models)
- `transformers` (HuggingFace) — NLP models (sentiment, multilingual)
- `Pillow` — image processing
- `imagehash` — perceptual hashing for duplicate detection
- `boto3` — S3 access for downloading images to process
- `pydantic` v2 — request/response models
- `celery` + `redis` — async task queue for long-running AI jobs
- `google-cloud-vision` — Google Vision API client (reverse image search)

---

### Primary Database: PostgreSQL 15 (AWS RDS)

**Why**: ACID compliance for financial data. Rich JSON(B) support for flexible fields. Mature, battle-tested. Multi-AZ deployment for production HA.

**Configuration**:
- Instance: `db.r6g.large` (production) / `db.t3.medium` (staging)
- Multi-AZ: Yes (production)
- Read replica: 1 (for analytics queries)
- Automated backups: 7-day retention, daily snapshots
- Connection pooling: PgBouncer in transaction mode (max 100 app connections → 10,000 clients)
- Extensions: `uuid-ossp`, `pgcrypto`, `pg_trgm` (trigram similarity search)

---

### Document Database: MongoDB Atlas

**Why**: Flexible schema for social feed (evolving media schemas), product search documents (varying attributes per fabric type), government scheme entries (complex eligibility rules as nested documents).

**Collections**: `products_search`, `feed_items`, `scheme_entries`, `user_events`, `recommendation_signals`

**Cluster**: M10 (production) / M0 free tier (local dev + staging demo)

---

### Cache & Session Store: Redis (AWS ElastiCache)

**Why**: Sub-millisecond reads for session validation (happens on every authenticated request). Native pub/sub for real-time notifications. Sorted sets for leaderboard-style ranking.

**Usage Patterns**:
- OTP storage: `otp:{phone}` → TTL 10 minutes
- Session/refresh token: `session:{user_id}:{device_fingerprint}` → TTL 7 days
- Rate limiting counters: `ratelimit:{ip}:{endpoint}` → TTL 1 minute
- Product page cache: `product:{id}` → TTL 5 minutes (invalidated on product update)
- Cart data (guest): `cart:guest:{session_id}` → TTL 30 days
- Stock reservation: `stock_hold:{variant_id}:{order_id}` → TTL 15 minutes
- Scheme list cache: `schemes:list:{filter_hash}` → TTL 1 hour

**Configuration**: Redis 7.x, `cache.r6g.large`, Multi-AZ with auto-failover, encryption at rest + in-transit

---

### Search Engine: AWS OpenSearch (Elasticsearch-compatible)

**Why**: Full-text product search with faceted filtering. Cannot do this efficiently with PostgreSQL alone at scale. OpenSearch is managed (no cluster management overhead).

**Indices**:
- `products` — searchable product data synced from PostgreSQL
- `schemes` — government scheme search
- `sellers` — seller directory search

**Data Sync Strategy**: Event-driven — PostgreSQL change triggers NestJS event → Elasticsearch index update within 30 seconds. Nightly full re-index job for consistency.

---

### Message Queue: AWS SQS + SNS (or RabbitMQ for self-hosted)

**Why**: Decouple async operations from request-response cycle. Ensure reliability (messages not lost on service restart).

**Queues**:
- `ai-verification-queue` — AI image analysis jobs
- `notification-queue` — email/SMS/push notification dispatch
- `payout-queue` — weekly payout batch processing
- `search-index-queue` — product index update jobs
- `logistics-queue` — Shiprocket API calls

---

### Payment: Razorpay

**Why**: Best payment gateway for India. Supports UPI, cards, net banking, EMI, wallets. Has marketplace/split payment via Routes. Razorpay handles PCI DSS — platform never sees raw card data.

**Integration Points**:
- `razorpay.orders.create()` — create payment order
- Razorpay Checkout (frontend) — collect payment
- Webhook: `payment.captured`, `payment.failed`, `order.paid`
- `razorpay.refunds.create()` — initiate refunds
- Routes: split payment — seller receives amount minus commission automatically

---

### Logistics: Shiprocket API

**Why**: Single API for multi-courier India coverage (Delhivery, Blue Dart, DTDC, Ekart, Xpressbees). Handles domestic + international. Auto-select cheapest/fastest courier.

**Integration Points**:
- `POST /v1/external/orders/create/adhoc` — create shipment
- `GET /v1/external/courier/serviceability` — check deliverability
- `GET /v1/external/courier/track/shipment/{awb}` — track
- `POST /v1/external/orders/return/create` — return shipment
- Webhook: shipment status updates → update `order_fulfillments.status`

---

### Email: Resend

**Why**: Developer-friendly API, React Email templates (same component model as frontend), excellent deliverability, generous free tier.

**Template Engine**: React Email (`.tsx` templates rendered server-side to HTML)

---

### SMS / OTP: MSG91

**Why**: Indian SMS gateway with DLT-registered sender IDs (mandatory for India). Template-based OTP (WhatsApp OTP option available).

---

### Object Storage: AWS S3 + CloudFront

**Bucket Policy**:
- `tanthavi-kyc-docs` — private; no public access; pre-signed URLs only; AES-256 server-side encryption
- `tanthavi-product-media` — public read; served via CloudFront CDN
- `tanthavi-post-media` — public read; served via CloudFront CDN
- `tanthavi-hls-reels` — public read; HLS transcoded segments; served via CloudFront
- `tanthavi-invoices` — private; pre-signed URLs; 7-year retention (tax compliance)
- `tanthavi-exports` — private; admin-generated reports; 30-day retention

**CloudFront**: Global CDN with cache-control headers. Images: `max-age=31536000, immutable` (content-addressed with hash in filename). HLS segments: `max-age=86400`.

---

### Video Transcoding: AWS Elastic Transcoder / MediaConvert

**Why**: Reel uploads arrive as MP4/MOV → must be transcoded to HLS (Adaptive Bitrate Streaming) for smooth playback on varying connections (critical for users on 2G/3G in rural India).

**Transcoding Presets**: 
- 360p HLS (for 2G/3G)
- 720p HLS (default)
- 1080p HLS (if source resolution allows)

**Flow**: Upload to S3 raw bucket → MediaConvert job triggered → HLS segments stored in `tanthavi-hls-reels` → thumbnail extracted → `posts.media_s3_keys` updated with HLS manifest URL

---

### Authentication Provider: Custom JWT + Firebase Auth (supplementary)

**Primary**: Custom JWT implementation in NestJS (full control, no vendor lock-in)
**Supplementary**: Firebase Auth used only for Google Sign-In (to handle the OAuth dance cleanly) and FCM (push notifications). User record in Firebase Auth is immediately mapped to platform user record.

---

### Infrastructure: AWS (Mumbai Region — ap-south-1)

| Service | AWS Service | Usage |
|---|---|---|
| Containers | ECS Fargate | All microservices |
| Container Registry | ECR | Docker image storage |
| Load Balancing | ALB (Application Load Balancer) | Route traffic to services |
| DNS | Route 53 | Domain management, health checks |
| SSL Certificates | ACM | Free SSL/TLS, auto-renewal |
| Secrets | AWS Secrets Manager | API keys, DB credentials |
| KMS | AWS KMS | Encryption key management |
| Monitoring | CloudWatch + CloudWatch Logs | Metrics, logs, alarms |
| Distributed Tracing | AWS X-Ray | Request tracing across services |
| CI/CD | GitHub Actions → ECR → ECS | Automated deployment |
| CDN | CloudFront | Media and static asset delivery |
| Edge Security | Cloudflare | WAF, DDoS, DNS (in front of AWS) |

---

### Infrastructure as Code: Terraform

All AWS resources defined as Terraform modules. State stored in S3 backend with DynamoDB lock.

Modules:
- `vpc` — networking (VPC, subnets, security groups, NAT gateway)
- `rds` — PostgreSQL with multi-AZ and read replica
- `elasticache` — Redis cluster
- `ecs` — ECS cluster, task definitions, services, ALB
- `s3` — all S3 buckets with policies
- `cloudfront` — distributions per bucket
- `opensearch` — OpenSearch domain
- `sqs` — all queues with DLQ
- `iam` — roles and policies for services

---

### Monitoring Stack

| Tool | Purpose |
|---|---|
| CloudWatch | AWS-native metrics + alarms |
| Grafana | Custom dashboards for all metrics |
| AWS X-Ray | Distributed request tracing |
| Sentry | Application error tracking (frontend + backend) |
| PagerDuty | On-call alerting for P0/P1 incidents |
| Uptime Robot | External uptime monitoring |

**Alert Channels**: Slack (engineering) + PagerDuty (on-call)

**Key Alerts**:
- API error rate > 1% (warning) / > 5% (critical)
- Payment webhook failure (immediate critical)
- Database CPU > 80% (warning) / > 95% (critical)
- Redis memory > 85% (warning)
- Failed AI verification jobs > 10 in 5 minutes (warning)
- 5xx rate from load balancer (immediate critical)

---

### Development Tools

| Tool | Usage |
|---|---|
| Turborepo | Monorepo task orchestration |
| pnpm workspaces | Package management |
| ESLint + Prettier | Code formatting (shared config in `packages/config`) |
| TypeScript strict mode | All TS projects use `strict: true` |
| Jest + Supertest | Unit + integration testing (NestJS) |
| Playwright | E2E testing (web app) |
| pytest | Python AI service tests |
| Husky + lint-staged | Pre-commit hooks (lint + type check) |
| Docker Compose | Local dev environment |
| k6 | Load testing |
| Postman / Bruno | API testing collections |

---

### Local Development Environment (docker-compose.yml services)

```yaml
services:
  postgres:    image: postgres:15-alpine, port: 5432
  mongo:       image: mongo:7, port: 27017
  redis:       image: redis:7-alpine, port: 6379
  rabbitmq:    image: rabbitmq:3-management, port: 5672, 15672 (management UI)
  elasticsearch: image: elasticsearch:8.11.0, port: 9200
  mailhog:     image: mailhog/mailhog, port: 1025 (SMTP), 8025 (web UI) — local email testing
  minio:       image: minio/minio — local S3-compatible storage
```

**Seed Data Script**: `scripts/seed.ts` — populates all tables with realistic (non-demo) test data for development. Run via `pnpm seed`.

**Environment Variables**: Full `.env.example` file checked into repo; `.env.local` ignored by git.
