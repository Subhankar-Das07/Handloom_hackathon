# TANTHAVI — Agent Spec Kit
## File: 11_CODING_STANDARDS.md
## Purpose: Coding conventions and standards. All code written for Tanthavi must comply.

---

## General Principles

1. **Production first**: Write code as if it goes live tomorrow. No `// TODO: add validation later`, no hardcoded values, no console.log in production code.
2. **Explicit over implicit**: Be clear. Name variables and functions descriptively.
3. **Single responsibility**: Each function does one thing. Each module owns one domain.
4. **Fail loudly in development, gracefully in production**: Throw during dev; return structured errors in prod.
5. **Always validate at the boundary**: Validate every request at the API layer. Never trust client data.

---

## TypeScript Standards (All NestJS + Next.js Code)

### Configuration
```json
// tsconfig.json (all projects)
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### Naming Conventions
- **Files**: `kebab-case.ts` (e.g., `product-variant.entity.ts`)
- **Classes**: `PascalCase` (e.g., `ProductService`)
- **Interfaces**: `PascalCase`, prefix with `I` only for generic utility interfaces — not for DTOs/entities
- **Types**: `PascalCase` (e.g., `OrderStatus`)
- **Variables/functions**: `camelCase`
- **Constants**: `SCREAMING_SNAKE_CASE` for module-level constants
- **Enums**: `PascalCase` for enum name, `SCREAMING_SNAKE_CASE` for values

### Enums (define in shared package)
```typescript
// packages/shared/src/enums/user-role.enum.ts
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  SUPPORT_AGENT = 'SUPPORT_AGENT',
  PRODUCER_VERIFIED = 'PRODUCER_VERIFIED',
  PRODUCER_UNVERIFIED = 'PRODUCER_UNVERIFIED',
  RETAILER_VERIFIED = 'RETAILER_VERIFIED',
  RETAILER_UNVERIFIED = 'RETAILER_UNVERIFIED',
  WHOLESALER_VERIFIED = 'WHOLESALER_VERIFIED',
  WHOLESALER_UNVERIFIED = 'WHOLESALER_UNVERIFIED',
  END_CUSTOMER = 'END_CUSTOMER',
}
```

---

## NestJS Backend Standards

### Module Structure (per domain)
```
src/
  modules/
    products/
      products.module.ts          ← Module definition
      products.controller.ts      ← HTTP handlers (thin, delegate to service)
      products.service.ts         ← Business logic
      products.repository.ts      ← Database queries (TypeORM)
      dto/
        create-product.dto.ts     ← Request DTOs (class-validator decorated)
        update-product.dto.ts
        product-response.dto.ts   ← Response DTOs (never return raw entities)
      entities/
        product.entity.ts         ← TypeORM entity
        product-variant.entity.ts
      interfaces/
        product.interface.ts      ← TypeScript interfaces for service contracts
      products.service.spec.ts    ← Unit tests (alongside service file)
      products.controller.spec.ts ← Controller tests
      products.e2e-spec.ts        ← E2E tests (in test/ folder)
```

### Controller Pattern
```typescript
// Always:
// 1. Use @ApiTags and @ApiOperation for Swagger documentation
// 2. Use DTOs for all body/query params — never raw Request object
// 3. Use @Roles() guard
// 4. Return response DTOs (never entity directly)
// 5. HTTP status codes: 200 (ok), 201 (created), 204 (no content), 400 (validation), 401 (unauth), 403 (forbidden), 404 (not found), 409 (conflict), 422 (business logic error), 429 (rate limit), 500 (server error)

@Controller('products')
@ApiTags('Products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles(UserRole.PRODUCER_VERIFIED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Create a new product listing' })
  @ApiResponse({ status: 201, type: ProductResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductDto,
  ): Promise<ApiSuccessResponse<ProductResponseDto>> {
    const product = await this.productsService.create(user.id, dto);
    return ApiSuccessResponse.create(ProductResponseDto.fromEntity(product));
  }
}
```

### Service Pattern
```typescript
// 1. Inject repositories, not other services (when possible)
// 2. Use transactions for multi-table writes
// 3. Emit domain events via EventEmitter for side effects (not direct service calls)
// 4. Never throw HTTP exceptions from services — throw domain exceptions
// 5. Log all mutations at INFO level; log errors at ERROR level

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly productsRepo: ProductsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(userId: string, dto: CreateProductDto): Promise<Product> {
    this.logger.log(`Creating product for producer ${userId}`);
    
    const product = await this.productsRepo.create({
      producerId: userId,
      ...dto,
      status: ProductStatus.DRAFT,
    });
    
    this.eventEmitter.emit('product.created', new ProductCreatedEvent(product));
    
    return product;
  }
}
```

### DTO Validation Pattern
```typescript
// Always use class-validator decorators
// Always strip unknown properties: whitelist: true, forbidNonWhitelisted: true in app setup
// Validate Zod schema in shared package for schema parity with frontend

import { IsString, IsNumber, IsEnum, IsOptional, Min, Max, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ example: 'Handwoven Banarasi Silk Saree' })
  @IsString()
  @Length(10, 200)
  title: string;

  @ApiProperty({ example: 'Rich silk fabric...' })
  @IsString()
  @Length(50, 5000)
  description: string;

  @ApiProperty({ enum: ProductVisibility })
  @IsEnum(ProductVisibility)
  visibility: ProductVisibility;

  @ApiProperty({ example: 4999 }) // prices in paise (integer, not float)
  @IsNumber()
  @Min(100)  // minimum ₹1.00
  mrp_paise: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(100)
  retailer_price_paise?: number;
}
```

### Money Handling Rule
**CRITICAL**: All monetary values are stored and calculated in **paise** (integer) to avoid floating point errors.
- ₹4,999.00 → stored as `499900`
- Display conversion happens at the API response layer (divide by 100 for display)
- Never store prices as float/decimal in JavaScript
- PostgreSQL column type: `BIGINT` (not DECIMAL) for price fields

### Error Handling
```typescript
// Domain exceptions (services throw these)
export class ProductNotFoundException extends NotFoundException {
  constructor(productId: string) {
    super({ code: 'PRODUCT_NOT_FOUND', productId });
  }
}

// Global exception filter converts all exceptions to standard response format:
{
  "success": false,
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Product not found",
    "requestId": "abc-123-xyz"
  }
}
```

### Logging Standards
```typescript
// Use NestJS Logger; always include entity IDs in log messages
// Log levels:
//   ERROR: Unhandled exceptions, payment failures, external API failures
//   WARN: Business rule violations, rate limit hits, validation failures
//   LOG (INFO): Successful mutations (created, updated, deleted)
//   DEBUG: Detailed flow info (dev only; disabled in production)
//   VERBOSE: Raw request/response data (never in production)

// Structured logging — include request ID from Kong header
this.logger.log(`Order ${orderId} shipped by seller ${sellerId}`, { orderId, sellerId, requestId });
```

---

## Next.js Frontend Standards

### File Structure
```
app/
  (consumer)/             ← Route group (no URL segment)
    layout.tsx            ← Layout with auth guard
    page.tsx              ← Page component
  components/             ← Shared UI components
    ui/                   ← Pure UI (no data fetching) — Button, Input, Modal
    features/             ← Feature-specific components (ProductCard, CartItem)
    layouts/              ← Layout components (ConsumerShell, ProducerShell)
  hooks/                  ← Custom React hooks
  lib/                    ← Utilities, API client, config
  stores/                 ← Zustand stores
  styles/                 ← Global CSS + CSS modules
  types/                  ← TypeScript types (frontend-specific)
```

### Data Fetching Rules
```typescript
// SERVER COMPONENTS: Use for initial page data (SEO-friendly)
// CLIENT COMPONENTS: Use for interactive data (TanStack Query)

// API client (lib/api-client.ts): centralized fetch wrapper
//   - Automatically attaches Authorization header
//   - Handles 401 → triggers token refresh → retries request
//   - Throws ApiError with code + message on non-2xx responses

// TanStack Query: all client-side data fetching
//   - Define query keys in lib/query-keys.ts
//   - staleTime: 2 minutes (most data)
//   - staleTime: 30 seconds (cart, order status)
//   - staleTime: 0 (payment status — always fresh)
```

### Component Standards
```tsx
// 1. Server Component by default; add 'use client' only when needed
// 2. Every interactive element has a unique, semantic ID (for accessibility + testing)
// 3. Loading states: always use Suspense boundary with skeleton
// 4. Error states: always have error boundary with fallback UI
// 5. Empty states: explicit UI for empty data (not just blank space)

// Good:
<Suspense fallback={<ProductCardSkeleton count={12} />}>
  <ProductGrid categoryId={categoryId} />
</Suspense>

// Bad:
{products ? <ProductGrid /> : null}
```

### Image Handling
```tsx
// Always use Next.js <Image> component (never raw <img>)
// Always provide width, height, and alt
// For user-generated content: use unoptimized={false} (let Next.js optimize via CloudFront)
// For hero/banner: sizes="100vw"
// For product thumbnails: sizes="(max-width: 768px) 50vw, 25vw"
```

---

## Python AI Service Standards

### Code Style
- Follow PEP 8
- Type hints on all function signatures
- Pydantic v2 models for all request/response schemas
- Use `async def` for all FastAPI route handlers
- Logging via Python's standard `logging` module with JSON formatter (loguru in production)

### Error Handling
```python
# Always return structured errors, never raw exceptions to client
# Use HTTPException with detail as structured dict
from fastapi import HTTPException

raise HTTPException(
    status_code=422,
    detail={
        "code": "IMAGE_QUALITY_INSUFFICIENT",
        "message": "Image is too blurry or dark for analysis",
        "min_resolution": "400x400"
    }
)
```

### Model Loading
```python
# Load model once at startup (not per request — too slow)
# Use lifespan context manager in FastAPI

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load models at startup
    app.state.verifier = EfficientNetVerifier.load("models/verifier.onnx")
    app.state.sentiment = SentimentAnalyzer.load("models/sentiment.onnx")
    yield
    # Cleanup at shutdown (if needed)

app = FastAPI(lifespan=lifespan)
```

---

## Testing Standards

### Coverage Requirements
- NestJS backend: minimum 80% line coverage
- Critical paths (auth, payments, orders): minimum 95% coverage
- Frontend: minimum 70% for utility functions; E2E coverage for all main flows
- AI service: unit test for scoring functions; integration test for full pipeline with mock images

### Test Categories
1. **Unit Tests**: Test service methods in isolation; mock all dependencies
2. **Integration Tests**: Test full request-response cycle through controller; use in-memory test database
3. **E2E Tests (Playwright)**: Test critical user journeys end-to-end in a real browser against staging environment

### Critical User Journeys (must have E2E test coverage):
- End customer registration → browse → add to cart → checkout → order confirmation
- Producer registration flow → verification submission → badge display
- Retailer KYC → login → see wholesale pricing → place bulk order
- Admin review KYC submission → approve → seller notified
- Seller create reel → product tag → consumer views reel → adds to cart

---

## Git Commit Standards

Format: `type(scope): description`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `style`

Examples:
```
feat(products): add product variant color selector UI
fix(auth): resolve refresh token rotation race condition
test(orders): add E2E test for B2B escrow flow
docs(api): update RFQ endpoint documentation
chore(deps): upgrade razorpay SDK to 2.9.0
perf(search): add Elasticsearch index for product price range filter
```

### PR Requirements
- All tests must pass
- No lint errors
- No TypeScript errors
- At least 1 reviewer approval
- PR description: what changed, why, how to test, screenshots for UI changes

---

## Comments and Documentation

```typescript
// Use JSDoc for public service methods
/**
 * Calculates the composite verification score for a seller's submitted images.
 * 
 * @param imageAnalyses - Array of individual image analysis results from AI service
 * @returns Composite score 0-100; above 85 = AI Assured badge eligible
 */
calculateVerificationScore(imageAnalyses: ImageAnalysisResult[]): number { ... }

// Use inline comments sparingly — only to explain WHY, not WHAT
// Good: // Release escrow 72h after delivery regardless of GRN (per terms of service)
// Bad: // Loop through items
```
