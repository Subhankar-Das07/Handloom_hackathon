# TANTHAVI — Agent Spec Kit
## File: 00_PROJECT_OVERVIEW.md
## Purpose: Master orientation document — read this first before touching any code.

---

## What Is Sutra?

Sutra is a **production-level multi-sided marketplace platform** for the Indian handloom industry.

It connects:
- **Producers** (weavers, artisans, manufacturers, handloom cooperatives)
- **Retailers** (shop owners, boutiques, resellers)
- **Wholesalers** (distributors, bulk buyers, export houses)
- **End Customers** (individual buyers like you and me)

It is NOT a prototype or demo. It is built to:
- Handle real transactions with real money
- Authenticate and verify real businesses and artisans
- Operate at scale across India

---

## Platform Name

**Sutra** (Sanskrit: *weaver*)

- Domain concept: `sutra.in`
- Brand tone: Trustworthy, empowering, culturally rooted, modern

---

## The Two Portals

The platform has ONE unified codebase but TWO distinct entry flows:

### Portal 1: Producer Portal
- Entry for anyone who **sells** products
- Includes: Individual weavers, artisan cooperatives, manufacturing units, suppliers, the platform company itself (as proxy seller)
- After onboarding → can also **buy** from other producers (role fluidity)

### Portal 2: Consumer Portal
- Entry for anyone who **buys** products
- Sub-classified into three types:
  1. **End Customer** — regular B2C buyer
  2. **Retailer** — business buyer with GST, unlocks wholesale pricing
  3. **Wholesaler** — bulk buyer, higher verification, MOQ-based ordering

---

## Five Core Pillars

| Pillar | What It Does |
|--------|-------------|
| **Marketplace** | B2C + B2B product buying and selling |
| **Verification Engine** | AI + human verification of sellers and products |
| **Social Commerce** | Reels, posts, seller profiles, shoppable media |
| **Gov Scheme Hub** | Discovery of government welfare schemes and loans for weavers |
| **Inclusion Engine** | Proxy seller system for non-digital rural artisans |

---

## Spec Kit File Index

| File | Contents |
|------|----------|
| `00_PROJECT_OVERVIEW.md` | This file — master orientation |
| `01_USER_ROLES_AND_FLOWS.md` | All user types, auth flows, RBAC |
| `02_FEATURE_SPECIFICATIONS.md` | Detailed feature list per module |
| `03_DATABASE_SCHEMA.md` | Full PostgreSQL + MongoDB schema |
| `04_API_CONTRACTS.md` | All API endpoints with request/response shapes |
| `05_SECURITY_RULES.md` | Auth rules, validation rules, fraud prevention |
| `06_AI_ML_SPEC.md` | AI verification model spec and integration |
| `07_TECH_STACK.md` | Technology decisions and rationale |
| `08_BUSINESS_LOGIC_RULES.md` | Pricing logic, order rules, commission, payout rules |
| `09_INTEGRATION_GUIDE.md` | Third-party API integrations |
| `10_DEPLOYMENT_ARCHITECTURE.md` | Infrastructure, CI/CD, environments |
| `11_CODING_STANDARDS.md` | Conventions, error handling, testing standards |
| `12_ROADMAP.md` | Phase-by-phase build plan |

---

## Critical Invariants (Rules That Must Never Be Broken)

1. **No demo data in production** — every piece of data shown to a real user must come from a real database record
2. **Unverified sellers cannot list live products** — listings go to DRAFT state until verification is approved
3. **Wholesale prices are never visible to End Customers** — enforced at API layer, not just UI
4. **Payment data never touches platform servers** — fully delegated to Razorpay
5. **KYC documents are private** — stored in private S3; never publicly accessible via URL
6. **Reviews are purchase-gated** — only buyers who received a delivered order can post a review
7. **All government scheme links must redirect to official .gov.in or .nic.in domains**
8. **Funds are never released to seller before delivery confirmation** (for B2B: before GRN is logged)

---

## Monorepo Structure

```
sutra/
├── apps/
│   ├── web/          ← Next.js 14 frontend (consumer + producer + admin UIs)
│   ├── api/          ← NestJS backend (all microservices as modules initially)
│   └── ai/           ← Python FastAPI (AI verification service)
├── packages/
│   ├── shared/       ← TypeScript types, Zod schemas, constants shared across apps
│   ├── ui/           ← Shared React component library (design system)
│   └── config/       ← ESLint, TSConfig, Tailwind base configs
├── infra/            ← Terraform IaC for AWS
├── scripts/          ← Dev setup, seed scripts, migration runners
├── agent-spec-kit/   ← THIS DIRECTORY — agent knowledge base
└── docker-compose.yml ← Local dev: postgres, mongo, redis, rabbitmq
```

---

## Environment Tiers

| Tier | Purpose | Data |
|------|---------|------|
| `local` | Developer laptop | Docker local DBs, seed data |
| `staging` | Integration testing, QA | Cloned anonymized prod schema |
| `production` | Real users, real money | Production data, real payments |

**Never run `staging` config against `production` databases.**
**Never use production secrets in local/staging.**
