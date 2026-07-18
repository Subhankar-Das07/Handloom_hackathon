# TANTHAVI — Agent Spec Kit
## File: 10_DEPLOYMENT_ARCHITECTURE.md
## Purpose: Infrastructure layout, CI/CD pipeline, environment config. Never deviate from this without team review.

---

## Environment Configuration

### Three Environments

| Environment | Purpose | Data | Payment Mode | AI Model |
|---|---|---|---|---|
| `local` | Developer laptops | Docker seed data | Razorpay test mode | ONNX mock (small model) |
| `staging` | Integration QA, hackathon demo | Anonymized realistic data | Razorpay test mode | Full model, test images |
| `production` | Real users | Real user data | Razorpay live mode | Full model, live pipeline |

### Environment Variable Management

- `local`: `.env.local` file (not committed to git)
- `staging` / `production`: AWS Secrets Manager; injected at container startup via ECS task definition
- Never use `process.env` directly in code; always go through config service wrapper

```typescript
// apps/api/src/config/config.service.ts
// All env vars read here, validated with Joi schema on startup
// App will not start if required env vars are missing
```

---

## AWS Architecture Diagram (Text Representation)

```
Internet
    │
    ▼
Cloudflare (WAF + DDoS + DNS)
    │
    ▼
AWS Route 53 (DNS)
    │
    ▼
AWS Certificate Manager (TLS termination)
    │
    ▼
Application Load Balancer (ALB)
    │
    ├── /api/* ──────────────────────► Kong API Gateway (ECS Service)
    │                                          │
    │                    ┌──────────────────────┴───────────────────────┐
    │                    │                                              │
    │              Auth Service                              Product Service
    │            (ECS, 2-8 tasks)                          (ECS, 2-10 tasks)
    │                    │                                              │
    │              Order Service                              Social Service
    │            (ECS, 2-8 tasks)                          (ECS, 2-12 tasks)
    │                    │                                              │
    │            Payment Service                             AI Service
    │            (ECS, dedicated)                    (EC2 G4dn.xlarge + ONNX)
    │                    │                                              │
    │                    └──────────────────────────────────────────────┘
    │                                          │
    │                         ┌────────────────┼────────────────┐
    │                         ▼                ▼                ▼
    │                    PostgreSQL          MongoDB           Redis
    │                   (RDS Multi-AZ)   (Atlas M10)      (ElastiCache)
    │
    └── /* (static) ──────────────────► Next.js App (ECS, 2 tasks)
                                              │
                                        CloudFront CDN
                                              │
                                          S3 Buckets
```

---

## ECS Fargate Service Configuration

### Production Task Definitions

```yaml
# auth-service
  CPU: 512 mCPU
  Memory: 1024 MB
  Min Tasks: 2
  Max Tasks: 8
  Scale Policy: CPU > 70% → scale up; CPU < 30% for 5min → scale down
  Health Check: GET /health → 200

# product-service
  CPU: 512 mCPU
  Memory: 1024 MB
  Min Tasks: 2
  Max Tasks: 12 (peak shopping events)
  Scale Policy: CPU > 70% or Request Count > 500/min → scale up

# social-service (highest traffic after product)
  CPU: 1024 mCPU
  Memory: 2048 MB
  Min Tasks: 2
  Max Tasks: 16
  Scale Policy: CPU > 65% → scale up

# payment-service (isolated, no auto-scale to prevent split-brain)
  CPU: 512 mCPU
  Memory: 1024 MB
  Min Tasks: 2
  Max Tasks: 2 (fixed; critical service)
  Network: Private subnet only; no direct internet access
  Security Group: Only allows inbound from API Gateway and Razorpay IP ranges

# ai-service (GPU-based)
  Type: EC2 Launch Type (not Fargate — needs GPU)
  Instance: g4dn.xlarge (NVIDIA T4 GPU)
  Min Instances: 1
  Max Instances: 3
  Scale Policy: Queue depth (SQS ai-verification-queue) > 10 → launch new instance
  Spot Instances: 70% spot, 30% on-demand (for cost, with fallback)

# web-frontend (Next.js)
  CPU: 512 mCPU
  Memory: 1024 MB
  Min Tasks: 2
  Max Tasks: 10
  CloudFront in front for static asset caching
```

---

## Kong API Gateway Configuration

All traffic enters through Kong. Kong handles:

1. **Rate Limiting** (plugin: `rate-limiting`):
   ```
   Consumer: guest → 60 req/min
   Consumer: end_customer → 200 req/min
   Consumer: business (retailer/wholesaler) → 500 req/min
   Consumer: producer → 300 req/min
   Consumer: admin → 1000 req/min
   ```
   Violations: 429 Too Many Requests

2. **JWT Validation** (plugin: `jwt`): Validates JWT on all `/api/v1/*` routes except: `/auth/login`, `/auth/register`, `/auth/oauth/*`, `/auth/otp/*`, `/products` (GET), `/schemes` (GET), `/search` (GET)

3. **Request Logging** (plugin: `file-log`): All requests logged with: timestamp, method, path, status, response time, consumer role, request ID

4. **Correlation ID** (plugin: `correlation-id`): Injects `X-Request-ID` header on every request (propagated through all microservices for distributed tracing)

5. **IP Restriction** (plugin: `ip-restriction`): `/admin/*` routes restricted to office IP ranges + VPN

6. **CORS** (plugin: `cors`): Origins whitelist: `https://tanthavi.in`, `https://www.tanthavi.in`, `https://staging.tanthavi.in`

7. **Bot Detection** (plugin: `bot-detection`): Block known scraper user agents

8. **Request Size Limiting** (plugin: `request-size-limiting`): Max 50MB (for file upload endpoints); 1MB for API endpoints

---

## CI/CD Pipeline (GitHub Actions)

### Pipeline Stages

```yaml
# .github/workflows/deploy.yml

on:
  push:
    branches: [main]   # → production deploy
    branches: [develop] # → staging deploy

stages:
  1. setup:
     - checkout code
     - install pnpm
     - restore pnpm cache

  2. lint-and-typecheck:
     - pnpm -r lint
     - pnpm -r typecheck
     (parallel across all apps)

  3. unit-tests:
     - pnpm -r test
     (parallel across all apps)
     - Upload coverage to Codecov

  4. build:
     - docker build apps/api → push to ECR as :sha-{commit}
     - docker build apps/web → push to ECR as :sha-{commit}
     - docker build apps/ai → push to ECR as :sha-{commit}

  5. integration-tests (staging only):
     - Deploy to staging ECS (update task definition image tag)
     - Run Playwright E2E test suite against staging URL
     - Run k6 load test (smoke level: 10 VUs for 30s)

  6. staging-deploy (develop branch):
     - Update ECS staging services with new image tags
     - Run database migrations: typeorm migration:run
     - Slack notification: "Staging deployed: {commit message}"

  7. production-gate (main branch only):
     - Require 1 manual approval from senior team member
     - Deploy blocker if: any unit test failed, E2E tests failed

  8. production-deploy (main branch, after approval):
     - Run DB migrations on production (migration:run)
     - Rolling deploy to production ECS (one task at a time)
     - CloudFront cache invalidation: /api/*
     - Slack notification: "Production deployed: {commit message} by {author}"
     - Sentry release notification

  9. rollback-trigger:
     - If health checks fail within 5 minutes of deploy
     - Auto-rollback to previous task definition revision
     - Alert: PagerDuty P0 incident created
```

### Branch Strategy

```
main ──────────────────────────────────────── Production
        ↑ PR + approval required
develop ────────────────────────────────────── Staging (auto-deploy)
        ↑
feature/[feature-name] ──────────────────────── Developer branches
fix/[bug-description]
hotfix/[issue-id]
```

---

## Database Migration Strategy

- **Tool**: TypeORM migrations (for PostgreSQL)
- **Rule**: Every schema change MUST have a migration file; never modify DB schema manually on any environment
- **Naming**: `YYYYMMDDHHMMSS-descriptive-name.ts` (timestamp auto-generated by TypeORM CLI)
- **Run**: Automatically on deploy (before service start in ECS entrypoint)
- **Rollback**: Every migration has a `down()` method
- **Lock**: Use advisory lock during migration to prevent concurrent runs
- **Staging**: Migrations tested on staging first, then production
- **Zero-downtime migrations**: Additive changes only (new columns, new tables); never rename/delete in same deploy. Old columns dropped in a follow-up migration after code no longer references them.

---

## Secrets Management

All secrets stored in AWS Secrets Manager, never in environment files or code:

| Secret Name | Contents |
|---|---|
| `tanthavi/{env}/database/postgres` | `host, port, username, password, database` |
| `tanthavi/{env}/database/mongo` | `connection_string` |
| `tanthavi/{env}/cache/redis` | `host, port, auth_token` |
| `tanthavi/{env}/payments/razorpay` | `key_id, key_secret, webhook_secret` |
| `tanthavi/{env}/messaging/msg91` | `auth_key, sender_id, otp_template_id` |
| `tanthavi/{env}/email/resend` | `api_key` |
| `tanthavi/{env}/storage/aws` | `s3_bucket_names, cloudfront_domains` |
| `tanthavi/{env}/auth/jwt` | `private_key (RSA-256), public_key` |
| `tanthavi/{env}/logistics/shiprocket` | `email, password` |
| `tanthavi/{env}/ai/google-vision` | `service_account_json` |
| `tanthavi/{env}/kyc/surepass` | `api_token` |

---

## Disaster Recovery Plan

### RTO (Recovery Time Objective): 30 minutes
### RPO (Recovery Point Objective): 5 minutes

| Failure Scenario | Detection | Recovery Action | RTO |
|---|---|---|---|
| Single ECS task crash | ECS health check (30s) | Auto-restart by ECS scheduler | < 1 min |
| Entire ECS service failure | ALB health check, CloudWatch alarm | ECS re-deploys; PagerDuty P0 | < 5 min |
| RDS primary failure | CloudWatch + RDS monitoring | Multi-AZ automatic failover | < 2 min |
| Redis failure | CloudWatch | ElastiCache auto-failover (Multi-AZ) | < 1 min |
| Full region failure (Mumbai outage) | Route 53 health check | Manual failover to Singapore (ap-southeast-1); restoration from RDS snapshot | < 60 min |
| Data corruption | CloudWatch data anomaly | Restore from last RDS snapshot (max 5-min old) | < 30 min |
| DDoS attack | Cloudflare detection | Cloudflare challenge/block mode activated; AWS Shield Advanced | < 5 min |

### Backup Policy

| Data | Backup Method | Frequency | Retention |
|---|---|---|---|
| PostgreSQL | RDS automated backup | Continuous (PITR) + daily snapshot | 7 days |
| MongoDB Atlas | Atlas automated backup | Daily | 7 days |
| S3 (KYC docs) | S3 Versioning + Replication | Continuous | Permanent (compliance) |
| S3 (invoices) | S3 Versioning | Continuous | 7 years (GST compliance) |
| S3 (media) | S3 Cross-Region Replication | Async | 90 days for deleted items |

---

## Networking & Security Groups

```
VPC: 10.0.0.0/16

Public Subnets (3 AZs): 10.0.1.0/24, 10.0.2.0/24, 10.0.3.0/24
  - ALB, NAT Gateway, Kong Gateway

Private Subnets (3 AZs): 10.0.11.0/24, 10.0.12.0/24, 10.0.13.0/24
  - All ECS services
  - RDS, ElastiCache, OpenSearch

Security Groups:
  sg-alb: Inbound: 80, 443 from 0.0.0.0/0
  sg-kong: Inbound: 8000, 8443 from sg-alb only
  sg-services: Inbound: 3000-3099 from sg-kong only
  sg-ai: Inbound: 8080 from sg-kong only
  sg-rds: Inbound: 5432 from sg-services, sg-ai only
  sg-redis: Inbound: 6379 from sg-services only
  sg-opensearch: Inbound: 443 from sg-services only
  
Payment service has additional restriction:
  sg-payment: Inbound only from sg-kong; NO outbound except to Razorpay IPs + sg-rds
```

---

## Hackathon Deployment Plan (Simplified)

For the hackathon, use this simplified stack (achieves same demo effect at zero/low cost):

| Component | Hackathon Solution | Notes |
|---|---|---|
| Backend | Single NestJS app (all modules) | Not microservices yet |
| Frontend | Next.js on Vercel (free tier) | Easy deploy, free SSL |
| PostgreSQL | Neon.tech or Supabase (free tier) | Serverless Postgres |
| MongoDB | MongoDB Atlas M0 (free) | 512MB limit |
| Redis | Upstash Redis (free tier) | Serverless |
| Email | Resend (free: 3000/month) | Sufficient for demo |
| SMS | MSG91 trial | Limited sends |
| Payments | Razorpay test mode | No real money |
| AI Service | Python on Railway.app or Render | Free tier for demos |
| Media Storage | Cloudflare R2 (free 10GB) | S3-compatible |
| Search | MongoDB Atlas Search (built-in) | No separate Elasticsearch |

**Upgrade Path**: Hackathon to Production is just environment variable changes + Terraform apply. The code is identical — production-quality from day one.
