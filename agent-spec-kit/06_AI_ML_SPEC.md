# 06 — AI/ML Specification
# Sutra Handloom Marketplace Platform
**Version:** 1.0.0  
**Last Updated:** 2026-07-15  
**Status:** Production Reference  

---

## Table of Contents

1. [Seller & Product Verification Model](#1-seller--product-verification-model)
2. [Fraud & Duplicate Detection](#2-fraud--duplicate-detection)
3. [Review Sentiment & NLP](#3-review-sentiment--nlp)
4. [Recommendation Engine](#4-recommendation-engine)
5. [Government Scheme Eligibility Matcher](#5-government-scheme-eligibility-matcher)
6. [FastAPI Service Structure & Code](#6-fastapi-service-structure--code)

---

## 1. Seller & Product Verification Model

### 1.1 Model Architecture

**Base Model:** EfficientNet-B3 (EfficientNet family, Tan & Le 2019)  
**Pre-training:** ImageNet-21k, then fine-tuned on ImageNet-1k  
**Domain Adaptation:** Three-stage transfer learning on handloom-specific image dataset  

#### Architecture Details

```
Input: (batch_size, 3, 300, 300)
  └─ EfficientNet-B3 Backbone (frozen first 3 blocks during Stage 1)
       ├─ MBConv blocks × 26 (varying expansion, kernel sizes 3x3 and 5x5)
       ├─ SE (Squeeze-Excitation) Attention after each MBConv
       └─ Final Conv: 1536 feature maps
  └─ Global Average Pooling → (batch_size, 1536)
  └─ Domain Adapter Head
       ├─ Dense(512) + BatchNorm + ReLU + Dropout(0.4)
       ├─ Dense(256) + BatchNorm + ReLU + Dropout(0.3)
       └─ Dense(8, activation='softmax')  → 8 output classes

Total Parameters: ~12.3M (backbone) + ~0.8M (adapter head) = ~13.1M
Trainable during Stage 2: ~5.2M (last 5 MBConv blocks + adapter head)
Trainable during Stage 3: all 13.1M
```

**Rationale for EfficientNet-B3:**
- B3 strikes the optimal balance of accuracy (81.1% top-1 ImageNet) vs parameter count for our deployment budget
- Scales to 300×300 input natively (B0=224, B3=300, B7=600)
- ONNX-exportable with deterministic outputs
- Inference time ≈ 28ms on CPU, ≈ 4ms on T4 GPU (single image, batch=1)

---

### 1.2 Input Preprocessing Pipeline

All images, whether uploaded by sellers or fetched from product listings, are processed through a deterministic preprocessing pipeline before inference. This pipeline is applied **identically** during training and serving — any deviation between training-time and serving-time preprocessing is a critical bug.

#### 1.2.1 Preprocessing Steps (Inference/Serving — No Augmentation)

```python
from PIL import Image
import numpy as np
import torchvision.transforms as T

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD  = [0.229, 0.224, 0.225]

inference_transform = T.Compose([
    T.Resize((300, 300), interpolation=T.InterpolationMode.BICUBIC),
    T.ToTensor(),                         # [0,255] uint8 → [0.0, 1.0] float32
    T.Normalize(mean=IMAGENET_MEAN,
                std=IMAGENET_STD),
])

def preprocess_image(image_bytes: bytes) -> torch.Tensor:
    """
    Accepts raw image bytes (JPEG, PNG, WebP).
    Returns a normalized (1, 3, 300, 300) tensor ready for model inference.
    Raises ValueError if image cannot be decoded or is smaller than 64x64.
    """
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        raise ValueError(f"Cannot decode image: {e}")

    if image.width < 64 or image.height < 64:
        raise ValueError("Image too small (minimum 64×64 pixels required)")

    tensor = inference_transform(image)       # (3, 300, 300)
    return tensor.unsqueeze(0)               # (1, 3, 300, 300)
```

#### 1.2.2 Training Augmentation Pipeline

During training, the following augmentations are applied **after** the base resize to 300×300 and **before** normalization. Augmentation is applied only to the training split, never to validation or test splits.

```python
train_transform = T.Compose([
    T.Resize((340, 340), interpolation=T.InterpolationMode.BICUBIC),
    T.RandomCrop((300, 300)),
    T.RandomHorizontalFlip(p=0.5),
    T.RandomVerticalFlip(p=0.2),             # Fabric textures can be inverted
    T.ColorJitter(
        brightness=0.3,
        contrast=0.3,
        saturation=0.3,
        hue=0.05,                            # Minimal hue shift; color matters for handloom
    ),
    T.RandomRotation(degrees=15),
    T.RandomPerspective(distortion_scale=0.2, p=0.3),
    T.GaussianBlur(kernel_size=3, sigma=(0.1, 1.0)),
    T.ToTensor(),
    T.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
    T.RandomErasing(p=0.2, scale=(0.02, 0.1)),  # Simulate partial occlusion
])
```

**Augmentation Rationale:**
- `RandomVerticalFlip`: Weave textures appear similar inverted; models should be invariant
- `ColorJitter`: Regional variations in natural dye colors; prevents color-bias overfitting
- `RandomRotation(15°)`: Fabric photographs are rarely perfectly aligned
- `RandomErasing`: Simulates fingers, tags, or partial obstruction in artisan selfies
- **No Mixup/CutMix** — class semantics must remain pure (a mixed workspace/powerloom image is invalid training signal)

---

### 1.3 Output Classes with Definitions

The model outputs a probability distribution over 8 mutually exclusive classes. Each inference call is scoped to one of two modes: **workspace verification** or **product/fabric verification**. The applicable classes depend on which mode is invoked.

| Class ID | Class Name | Mode | Definition |
|----------|-----------|------|------------|
| 0 | `handloom_authentic_workspace` | Workspace | Image clearly shows a traditional handloom loom structure — pit loom, frame loom, or Jacquard handloom — with no motorized components visible. The loom must be the primary subject occupying ≥30% of frame area. Human weaver presence is a positive signal but not required. |
| 1 | `powerloom_detected` | Workspace | Image shows a mechanized power loom with motor, spindle, or electrical drive mechanism visible. Shuttle looms with belts or electric connections are classified here regardless of claim. |
| 2 | `workspace_insufficient` | Workspace | The image does not contain enough loom structure to classify (e.g., photo of hands only, yarn bundles, outdoor scene without equipment). Cannot confirm or deny handloom status. Seller prompted to re-upload. |
| 3 | `stock_image_detected` | Both | The image has high perceptual similarity to indexed stock photography or manufacturer product shots. Detected via pHash match against stock image database AND/OR Google Vision Web Detection API returning >3 matching web pages. |
| 4 | `fabric_handloom_authentic` | Product | Close-up of fabric weave showing irregular thread tension variation, slight warp/weft misalignment, and natural imperfections consistent with handloom production. Ikat, Jamdani, Banarasi, Kanjeevaram texture patterns recognized. |
| 5 | `fabric_powerloom_suspected` | Product | Fabric weave shows machine-perfect thread regularity, uniform tension, and pixel-level consistency in texture repeat pattern. Automated shuttle marks may be present. |
| 6 | `raw_material_valid` | Product | Image shows raw materials: unspun cotton/silk/wool fiber, yarn skeins, natural dye vats, or spinning wheel in operation. Used for artisan profile verification photos. |
| 7 | `image_quality_insufficient` | Both | Image fails quality gate: too dark (mean pixel brightness < 40/255), too blurry (Laplacian variance < 100), corrupted (non-decodable region > 10% of area), or too small (< 100KB for fabric close-ups). |

**Important invariants:**
- Classes 0–3 are Workspace-mode classes; only these are evaluated against workspace photos
- Classes 4–7 are Product-mode classes (4 and 5 exclusive; 6 and 7 also apply to workspace)
- `image_quality_insufficient` (class 7) can be returned in either mode and takes priority — if the quality gate fails, no semantic class is assigned
- `stock_image_detected` (class 3) is checked via a separate perceptual hash lookup **before** model inference; if triggered, the model result is overridden

---

### 1.4 Scoring Algorithm — Composite `verification_score`

The composite `verification_score` (integer, 0–100) is calculated from multiple image analyses submitted as part of a seller's verification batch. A single seller verification submission includes:

- **1–3 workspace images** (required: at least 1)
- **2–5 product/fabric images** (required: at least 2)
- **1 raw material image** (optional; bonus points)
- **KYC document scan** (not processed by vision model; scored separately by document validation service)

#### 1.4.1 Score Component Definitions

```
verification_score = (
  workspace_component * 0.40 +
  product_component   * 0.40 +
  bonus_component     * 0.10 +
  consistency_bonus   * 0.10
) * 100

Capped at 100. Floored at 0.
```

**Workspace Component (0.0 – 1.0):**

```python
def compute_workspace_component(workspace_results: list[ClassProbability]) -> float:
    """
    workspace_results: list of per-image softmax outputs for workspace images.
    Returns a float in [0, 1].
    """
    if not workspace_results:
        return 0.0

    scores = []
    for result in workspace_results:
        p_authentic  = result.probs[0]   # handloom_authentic_workspace
        p_powerloom  = result.probs[1]   # powerloom_detected
        p_insufficient = result.probs[2] # workspace_insufficient
        p_stock      = result.probs[3]   # stock_image_detected
        p_quality    = result.probs[7]   # image_quality_insufficient

        # Hard disqualifiers
        if p_powerloom > 0.70:
            scores.append(-1.0)          # Disqualifying: powerloom confirmed
            continue
        if p_stock > 0.80:
            scores.append(-0.5)          # Penalizing: stock image
            continue
        if p_quality > 0.70:
            scores.append(0.0)           # Neutral: bad quality, ignore this image
            continue

        # Graded score
        image_score = p_authentic - (p_powerloom * 0.8) - (p_stock * 0.5)
        scores.append(max(0.0, min(1.0, image_score)))

    if not scores or all(s == 0.0 for s in scores):
        return 0.0

    # Weighted average: best image counts more
    scores.sort(reverse=True)
    if -1.0 in scores:
        return 0.0   # Any powerloom detection → workspace component = 0

    weights = [0.5, 0.3, 0.2][:len(scores)]
    weighted = sum(s * w for s, w in zip(scores, weights[:len(scores)]))
    return max(0.0, weighted)
```

**Product Component (0.0 – 1.0):**

```python
def compute_product_component(product_results: list[ClassProbability]) -> float:
    if not product_results:
        return 0.0

    scores = []
    for result in product_results:
        p_authentic  = result.probs[4]   # fabric_handloom_authentic
        p_powerloom  = result.probs[5]   # fabric_powerloom_suspected
        p_stock      = result.probs[3]   # stock_image_detected
        p_quality    = result.probs[7]   # image_quality_insufficient

        if p_stock > 0.80:
            scores.append(-0.3)
            continue
        if p_quality > 0.70:
            scores.append(0.0)
            continue

        image_score = p_authentic - (p_powerloom * 0.6) - (p_stock * 0.4)
        scores.append(max(0.0, min(1.0, image_score)))

    if not scores:
        return 0.0

    scores.sort(reverse=True)
    # Equal weight for product images
    valid = [s for s in scores if s > 0]
    return sum(valid) / len(valid) if valid else 0.0
```

**Bonus Component (raw material image):**

```python
def compute_bonus_component(raw_material_results: list[ClassProbability]) -> float:
    if not raw_material_results:
        return 0.0
    best = max(r.probs[6] for r in raw_material_results)  # raw_material_valid
    return min(1.0, best * 1.2)    # 20% boost to encourage raw material photos
```

**Consistency Bonus:**

```python
def compute_consistency_bonus(workspace_component: float, product_component: float) -> float:
    """
    Both workspace and product signal handloom → seller is consistent.
    Inconsistency (one strong, one weak) reduces trust.
    """
    if workspace_component >= 0.7 and product_component >= 0.7:
        return 1.0
    elif workspace_component >= 0.5 and product_component >= 0.5:
        return 0.5
    elif abs(workspace_component - product_component) > 0.5:
        return 0.0   # Large inconsistency: suspicious
    return 0.2
```

---

### 1.5 Badge Assignment Thresholds

| Score Range | Badge | Label Displayed | Marketplace Privileges |
|-------------|-------|-----------------|----------------------|
| 90–100 | `VERIFIED_MASTER_ARTISAN` | 🏅 Verified Master Artisan | Priority listing placement, Scheme Hub fast-track, reduced commission (flat 5% regardless of buyer tier) |
| 75–89 | `VERIFIED_HANDLOOM` | ✅ Verified Handloom | Standard verified listing, eligible for government scheme display |
| 50–74 | `PENDING_REVIEW` | 🔄 Under Review | Listing live but no verification badge; admin manual review queued |
| 25–49 | `UNVERIFIED` | ⚠️ Unverified Seller | Listing live with warning banner; ineligible for B2B visibility |
| 0–24 | `VERIFICATION_FAILED` | ❌ Verification Failed | Listing hidden; seller receives detailed rejection reasons; can reapply after 14 days |
| Special | `FLAGGED_POWERLOOM` | 🚫 Flagged | Listing immediately hidden; admin notified; seller account restricted |

**`FLAGGED_POWERLOOM`** is assigned when:
- `powerloom_detected` probability > 0.85 in any workspace image, OR
- `fabric_powerloom_suspected` probability > 0.90 in majority (>50%) of product images

**Badge Expiry:** Badges expire 12 months from assignment. Sellers receive a reminder at 11 months to re-upload verification images. Expired badges downgrade to `PENDING_REVIEW` automatically.

---

### 1.6 Training Approach

#### Stage 1 — Backbone Pretraining Preservation (Epoch 1–5)
- **Frozen layers:** All EfficientNet backbone blocks (blocks 0–2 frozen)
- **Trainable:** Adapter head only
- **Learning rate:** 1e-3 (Adam optimizer with β1=0.9, β2=0.999)
- **Batch size:** 32
- **Loss:** Categorical Cross-Entropy with label smoothing = 0.1
- **Goal:** Teach the adapter head to interpret ImageNet features in handloom context

#### Stage 2 — Partial Backbone Unfreezing (Epoch 6–20)
- **Frozen layers:** Blocks 0–2 (stem and early feature extractors)
- **Unfrozen:** Blocks 3–7 (texture-sensitive mid-level features) + adapter head
- **Learning rate:** Cosine decay from 1e-4 → 1e-6
- **Batch size:** 16
- **Loss:** Focal Loss (γ=2.0, α per-class weighted) — addresses class imbalance
- **Gradient clipping:** max_norm=1.0

#### Stage 3 — Full Fine-Tuning (Epoch 21–40)
- **Frozen layers:** None (all parameters trainable)
- **Learning rate:** 5e-5 → 1e-7 (cosine with warm restart every 10 epochs)
- **Batch size:** 8 (gradient accumulation × 4 = effective 32)
- **Regularization:** L2 weight decay = 1e-4, Dropout 0.4 in adapter
- **Augmentation:** Full pipeline from Section 1.2.2

#### Dataset Requirements

| Split | Images per Class | Total |
|-------|-----------------|-------|
| Train | 1,500 min | 12,000 min |
| Validation | 300 min | 2,400 min |
| Test | 150 min | 1,200 min |

**Data Sources:**
1. Artisan platform uploads (post-labeling)
2. Government scheme photo databases (O/o DC Handlooms)
3. Licensed photography from NHDC (National Handloom Development Corporation)
4. Synthetic augmented copies of verified authentic images
5. **Negative samples:** Power loom manufacturer websites, Alibaba product listings (for powerloom class)
6. **Stock image samples:** Shutterstock, Getty editorial handloom section (for stock_image_detected class)

**Labeling Protocol:**
- Each image labeled by 3 independent annotators using Label Studio
- Majority vote for final label
- Inter-annotator agreement < 0.75 (Fleiss κ) → image escalated to domain expert (handloom industry professional)
- Images from `workspace_insufficient` class labeled by domain expert only

---

### 1.7 Serving Architecture

#### ONNX Export

```python
import torch
import torch.onnx

def export_model_to_onnx(model: EfficientNetVerifier, output_path: str):
    model.eval()
    dummy_input = torch.randn(1, 3, 300, 300)
    
    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        export_params=True,
        opset_version=17,
        do_constant_folding=True,
        input_names=['image'],
        output_names=['class_probabilities'],
        dynamic_axes={
            'image': {0: 'batch_size'},
            'class_probabilities': {0: 'batch_size'}
        }
    )
    
    # Validate exported model
    import onnxruntime as ort
    session = ort.InferenceSession(output_path, providers=['CPUExecutionProvider'])
    ort_output = session.run(None, {'image': dummy_input.numpy()})
    torch_output = model(dummy_input).detach().numpy()
    np.testing.assert_allclose(torch_output, ort_output[0], rtol=1e-3, atol=1e-5)
    print(f"✅ ONNX export validated. Max diff: {np.max(np.abs(torch_output - ort_output[0])):.6f}")
```

**ONNX Runtime Configuration (Production):**

```python
import onnxruntime as ort

session_options = ort.SessionOptions()
session_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
session_options.intra_op_num_threads = 4
session_options.inter_op_num_threads = 2
session_options.enable_mem_pattern = True
session_options.enable_cpu_mem_arena = True

# Prefer CUDA if available, fallback to CPU
providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
session = ort.InferenceSession('efficientnet_verifier.onnx', 
                                session_options, providers=providers)
```

#### FastAPI Async Queue Architecture

```
Seller uploads images via POST /api/v1/verify/submit
    │
    ▼
FastAPI endpoint validates files (size, format, count)
    │
    ▼
Images uploaded to S3: s3://sutra-kyc/pending/{seller_id}/{submission_id}/
    │
    ▼
Verification job enqueued to AWS SQS queue: sutra-verification-jobs
    │
    ▼
Verification worker (separate ECS task) polls SQS
    │
    ├── Downloads images from S3
    ├── Runs preprocessing pipeline
    ├── Runs ONNX inference
    ├── Computes composite score
    ├── Assigns badge
    └── Writes results to PostgreSQL: verification_submissions table
         │
         ▼
    Publishes event to SNS: sutra-verification-complete
         │
         ▼
    Lambda function → sends notification email + in-app notification
```

**SQS Message Format:**

```json
{
  "submission_id": "sub_01HXYZ...",
  "seller_id": "usr_01HABC...",
  "workspace_image_keys": [
    "pending/usr_01HABC.../sub_01HXYZ.../workspace_1.jpg"
  ],
  "product_image_keys": [
    "pending/usr_01HABC.../sub_01HXYZ.../product_1.jpg",
    "pending/usr_01HABC.../sub_01HXYZ.../product_2.jpg"
  ],
  "raw_material_image_key": null,
  "submitted_at": "2026-07-15T08:00:00Z",
  "priority": "normal"
}
```

---

### 1.8 Retraining Trigger Policy

The model is retrained when **any** of the following conditions are met:

| Trigger | Condition | Action |
|---------|-----------|--------|
| **Data volume trigger** | 500+ new labeled images accumulated since last training run | Schedule retraining in next weekly batch window |
| **Drift trigger** | Prediction confidence distribution shifts (KL divergence > 0.15 vs baseline over 7-day window) | Immediate retraining flag; alert ML team |
| **Error rate trigger** | Admin overrides on verification badges exceed 10% of weekly verifications | Retraining with admin corrections as additional labeled data |
| **New class trigger** | New fraud pattern identified requiring new output class | Architectural change required; full retraining from Stage 1 |
| **Scheduled** | Quarterly (every 90 days regardless of triggers) | Ensures model stays fresh with latest platform data |

**Retraining Pipeline:**

```
1. Export admin-corrected labels from verification_submissions (status = 'manually_overridden')
2. Merge with existing labeled dataset
3. Run data validation: check class distribution, remove duplicates, flag mislabels
4. Retrain using Stage 2 + Stage 3 only (Stage 1 not repeated unless class changes)
5. Evaluate on held-out test set:
   - Minimum accuracy: 88% overall
   - Minimum per-class F1: 0.80 for handloom_authentic_workspace and fabric_handloom_authentic
   - Maximum false positive rate for powerloom_detected: 5% (penalizes legitimate sellers)
6. If evaluation passes: export to ONNX, deploy to staging, A/B test for 48h
7. If evaluation fails: rollback; alert ML team; keep current model
8. Promotion to production: requires ML lead approval + product manager sign-off
```

---

## 2. Fraud & Duplicate Detection

### 2.1 Duplicate Product Image Detection (pHash)

**Algorithm:** Perceptual Hashing (pHash) using DCT (Discrete Cosine Transform)

```python
import imagehash
from PIL import Image
import io

def compute_phash(image_bytes: bytes) -> str:
    """
    Compute pHash of image. Returns 64-bit hex string.
    pHash is robust to: resizing, mild compression, brightness changes, minor color shifts.
    pHash is NOT robust to: heavy cropping, text overlay, format conversion artifacts beyond ~20%.
    """
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    phash = imagehash.phash(image, hash_size=8)   # 8x8 DCT = 64-bit hash
    return str(phash)   # 16-char hex string

def hamming_distance(hash1: str, hash2: str) -> int:
    """
    Compute Hamming distance between two pHash strings.
    Distance 0: identical images
    Distance 1-6: near-duplicates (different compression/minor edit)
    Distance 7-12: similar images (same scene, different angle)
    Distance >12: different images
    """
    h1 = imagehash.hex_to_hash(hash1)
    h2 = imagehash.hex_to_hash(hash2)
    return h1 - h2    # imagehash overloads subtraction as Hamming distance
```

**Deduplication Flow:**

```
New product image uploaded by seller
    │
    ▼
Compute pHash of new image
    │
    ▼
Query product_image_hashes table: 
  SELECT product_id, seller_id, phash 
  FROM product_image_hashes 
  WHERE phash_bucket = compute_bucket(new_phash)   -- bucket by first 2 hex chars for O(1) lookup
    │
    ▼
For each candidate: compute Hamming distance
    │
    ├── Distance <= 6: NEAR_DUPLICATE
    │     ├── Same seller_id: warn seller "This image appears similar to {product_name}; use unique images"
    │     └── Different seller_id: FLAG for admin review; possible product cloning
    │
    ├── Distance 7-12: SIMILAR_IMAGE
    │     └── Log similarity; no action unless pattern repeats (>3 similar images from same seller)
    │
    └── Distance > 12: UNIQUE — store hash, proceed
```

**Database Schema for pHash Index:**

```sql
CREATE TABLE product_image_hashes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products(id),
    seller_id       UUID NOT NULL REFERENCES users(id),
    image_key       TEXT NOT NULL,        -- S3 key
    phash           CHAR(16) NOT NULL,    -- 64-bit hex pHash
    phash_bucket    CHAR(2) GENERATED ALWAYS AS (LEFT(phash, 2)) STORED,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_phash_bucket ON product_image_hashes(phash_bucket);
CREATE INDEX idx_phash_seller  ON product_image_hashes(seller_id);
```

---

### 2.2 Stock Image Detection (Google Vision API)

```python
from google.cloud import vision
from typing import Optional

async def detect_stock_image(image_bytes: bytes) -> dict:
    """
    Returns:
      is_stock: bool
      confidence: float (0.0 - 1.0)
      matching_pages: list of URLs where similar image found
      reasoning: str
    """
    client = vision.ImageAnnotatorClient()
    image = vision.Image(content=image_bytes)
    
    response = client.web_detection(image=image)
    web = response.web_detection
    
    stock_domains = [
        'shutterstock.com', 'gettyimages.com', 'istockphoto.com',
        'alamy.com', 'stock.adobe.com', 'dreamstime.com',
        'depositphotos.com', 'freepik.com', 'unsplash.com'
    ]
    
    matching_stock_pages = []
    total_matches = len(web.pages_with_matching_images)
    
    for page in web.pages_with_matching_images:
        for domain in stock_domains:
            if domain in page.url:
                matching_stock_pages.append(page.url)
    
    # Scoring
    stock_domain_hits = len(matching_stock_pages)
    full_match_score = len(web.full_matching_images) * 0.4
    partial_match_score = min(total_matches / 10, 1.0) * 0.3
    stock_domain_score = min(stock_domain_hits / 2, 1.0) * 0.3
    
    confidence = full_match_score + partial_match_score + stock_domain_score
    is_stock = confidence > 0.60 or stock_domain_hits > 0
    
    return {
        "is_stock": is_stock,
        "confidence": round(confidence, 3),
        "matching_pages": matching_stock_pages[:5],  # Return top 5
        "total_web_matches": total_matches,
        "reasoning": (
            f"Found {stock_domain_hits} stock site matches, "
            f"{len(web.full_matching_images)} full matches, "
            f"{total_matches} total web occurrences."
        )
    }
```

**Flagging Thresholds:**

| Condition | Action |
|-----------|--------|
| `confidence >= 0.8` OR `stock_domain_hits >= 1` | Image rejected; seller shown specific URLs where image was found |
| `confidence >= 0.6` | Image flagged for manual admin review; not blocked immediately |
| `confidence < 0.6` | Image accepted; result logged for pattern analysis |

---

### 2.3 Account Fraud Signals

Account-level fraud is detected via a multi-signal scoring system. Each signal contributes to a `fraud_risk_score` (0–100). Accounts above threshold trigger different actions.

#### Velocity Signals

| Signal | Weight | Description |
|--------|--------|-------------|
| `new_account_product_velocity` | 20 | >10 products listed within 24h of registration |
| `rfq_spam_velocity` | 15 | >20 RFQ requests sent within 1 hour |
| `message_spam_velocity` | 15 | >50 messages sent within 1 hour |
| `registration_velocity_same_ip` | 25 | >3 accounts registered from same IP within 24h |
| `payout_request_velocity` | 20 | Multiple payout requests within 1h |
| `failed_login_velocity` | 10 | >10 failed logins within 15 minutes |

#### Device Fingerprint Signals

```javascript
// Frontend: collect device fingerprint on registration and login
const fingerprint = {
  userAgent: navigator.userAgent,
  language: navigator.language,
  screenResolution: `${screen.width}x${screen.height}`,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  platform: navigator.platform,
  cookiesEnabled: navigator.cookieEnabled,
  doNotTrack: navigator.doNotTrack,
  canvasFingerprint: getCanvasFingerprint(),   // hash of canvas rendering
  webglRenderer: getWebGLRenderer(),
  audioFingerprint: getAudioFingerprint(),
};
```

Backend flags:
- Same device fingerprint used for >2 accounts → link accounts for fraud review
- Device fingerprint changed within same session (VPN/proxy detection)

#### IP Reputation

```python
async def check_ip_reputation(ip_address: str) -> dict:
    """
    Checks IP via AbuseIPDB API + internal blocklist.
    Returns: {risk_level: 'low'|'medium'|'high', abuse_score: int, is_vpn: bool, is_tor: bool}
    """
    # AbuseIPDB check
    response = await httpx.get(
        "https://api.abuseipdb.com/api/v2/check",
        params={"ipAddress": ip_address, "maxAgeInDays": 30},
        headers={"Key": ABUSEIPDB_API_KEY, "Accept": "application/json"}
    )
    data = response.json()["data"]
    
    return {
        "risk_level": "high" if data["abuseConfidenceScore"] > 50 else 
                      "medium" if data["abuseConfidenceScore"] > 20 else "low",
        "abuse_score": data["abuseConfidenceScore"],
        "is_vpn": data.get("usageType") in ["VPN", "Proxy", "TOR"],
        "is_tor": data.get("isTor", False),
        "country": data["countryCode"],
    }
```

#### Account Fraud Risk Thresholds

| fraud_risk_score | Action |
|-----------------|--------|
| 0–30 | Normal: no action |
| 31–60 | Soft flag: additional CAPTCHA on next action, manual review queued |
| 61–80 | Account suspended temporarily (48h); email notification; appeal option |
| 81–100 | Account permanently suspended; all listings hidden; admin notified immediately |

---

### 2.4 Review Fraud Detection

#### Burst Detection

```python
def detect_review_burst(product_id: str, window_hours: int = 24) -> dict:
    """
    Detects sudden spike in reviews for a product.
    Normal rate baseline is computed over 30-day rolling average.
    """
    recent_count = db.query("""
        SELECT COUNT(*) FROM reviews 
        WHERE product_id = $1 
        AND created_at > NOW() - INTERVAL '{hours} hours'
    """, product_id, window_hours)
    
    baseline_rate = db.query("""
        SELECT COUNT(*) / 30.0 as daily_rate FROM reviews 
        WHERE product_id = $1 
        AND created_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days'
    """, product_id)
    
    expected = baseline_rate * (window_hours / 24)
    actual = recent_count
    
    if expected == 0 and actual >= 5:
        burst_ratio = 10.0    # New product suddenly gets many reviews
    elif expected > 0:
        burst_ratio = actual / expected
    else:
        burst_ratio = 1.0
    
    is_burst = burst_ratio > 5.0 or (actual > 10 and expected < 2)
    
    return {
        "is_burst": is_burst,
        "burst_ratio": round(burst_ratio, 2),
        "recent_count": actual,
        "expected_count": round(expected, 1),
        "action": "FLAG_FOR_REVIEW" if is_burst else "NORMAL"
    }
```

#### Purchase Gate Check

- **Rule:** A review can only be submitted if the reviewer has a verified delivered order for that product (or a product from the same seller, for seller-level reviews)
- **Implementation:** Before accepting a review submission, check: `SELECT 1 FROM orders WHERE buyer_id = $reviewer_id AND product_id = $product_id AND status IN ('DELIVERED', 'COMPLETED')`
- **Exception for new sellers:** Seller profile reviews allowed within 30 days of first interaction even without completed order
- **Violation:** `REVIEW_WITHOUT_PURCHASE` error returned; attempt logged against user account

#### Sentiment Clustering (Coordinated Review Detection)

```python
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

def detect_coordinated_reviews(product_id: str, window_hours: int = 48) -> dict:
    """
    Detects reviews that are suspiciously similar in embedding space.
    Coordinated fake reviews often use the same template or are copy-pasted.
    """
    recent_reviews = db.fetch_recent_reviews(product_id, window_hours)
    
    if len(recent_reviews) < 3:
        return {"is_coordinated": False}
    
    # Embed review texts
    embeddings = sentence_encoder.encode([r.text for r in recent_reviews])
    
    # Compute pairwise cosine similarity
    sim_matrix = cosine_similarity(embeddings)
    
    # Count pairs with similarity > 0.85 (very similar text)
    high_sim_pairs = 0
    total_pairs = len(recent_reviews) * (len(recent_reviews) - 1) / 2
    
    for i in range(len(recent_reviews)):
        for j in range(i + 1, len(recent_reviews)):
            if sim_matrix[i][j] > 0.85:
                high_sim_pairs += 1
    
    pair_ratio = high_sim_pairs / total_pairs if total_pairs > 0 else 0
    is_coordinated = pair_ratio > 0.30    # >30% of pairs are very similar
    
    return {
        "is_coordinated": is_coordinated,
        "similar_pair_ratio": round(pair_ratio, 3),
        "high_sim_pairs": high_sim_pairs,
        "total_reviews": len(recent_reviews),
        "action": "HOLD_ALL_REVIEWS_FOR_ADMIN" if is_coordinated else "NORMAL"
    }
```

---

## 3. Review Sentiment & NLP

### 3.1 Model Selection

**Primary Model:** `intfloat/multilingual-e5-base`  
- 278M parameters, supports 100+ languages including Hindi, Tamil, Telugu, Bengali, Kannada (all major handloom-producing regions)
- 768-dimensional embeddings
- Fine-tuned on product review data with task prefix `"query: "` for query encoding and `"passage: "` for passage encoding

**Alternative (if multilingual-e5 unavailable):** `xlm-roberta-base`  
- 270M parameters
- Fine-tuned on same dataset; slightly lower on regional language reviews

**Fine-tuning Configuration:**

```python
# Fine-tuning for sentiment classification
model = AutoModelForSequenceClassification.from_pretrained(
    "intfloat/multilingual-e5-base",
    num_labels=3,          # positive, neutral, negative
    problem_type="single_label_classification"
)

training_args = TrainingArguments(
    output_dir="./sentiment_model",
    num_train_epochs=5,
    per_device_train_batch_size=32,
    per_device_eval_batch_size=64,
    learning_rate=2e-5,
    warmup_ratio=0.1,
    weight_decay=0.01,
    evaluation_strategy="epoch",
    save_strategy="epoch",
    load_best_model_at_end=True,
    metric_for_best_model="f1_macro",
    fp16=True,              # Mixed precision for faster training
)
```

---

### 3.2 Sentiment Classification

**Classes:** `positive` | `neutral` | `negative`

**Thresholds (post-softmax probabilities):**

| Condition | Label |
|-----------|-------|
| `p_positive >= 0.6` | `positive` |
| `p_negative >= 0.6` | `negative` |
| Neither above 0.6 | `neutral` |

**Language-specific preprocessing:**
- Hindi text: Normalize Devanagari Unicode (NFC normalization)
- All languages: Remove emojis before model input (emojis handled separately via emoji sentiment lookup)
- Transliterated text (Hinglish): Accept as-is; multilingual-e5 handles reasonably

---

### 3.3 Aspect Extraction

Aspects are extracted using a fine-tuned Named Entity Recognition (NER) / span classification model on top of the same multilingual-e5 backbone.

**Aspect Categories:**

| Aspect | Definition | Example Trigger Phrases |
|--------|-----------|------------------------|
| `quality` | Physical quality of fabric, stitching, material | "material is", "quality achhi hai", "fabric soft", "thread loose" |
| `color` | Color accuracy, vibrancy, fastness | "color pheeka", "rang pakka", "exactly as shown", "color faded" |
| `packaging` | Packaging quality and protection | "packing good", "damaged box", "wrapping", "bubble wrap" |
| `delivery` | Speed of delivery, courier experience | "jaldi aaya", "late delivery", "delayed", "came on time" |
| `value` | Price-value perception | "paisa vasool", "expensive", "worth the price", "overpriced" |

**Aspect Sentiment Output Format:**

```json
{
  "review_id": "rev_01HX...",
  "overall_sentiment": "positive",
  "overall_confidence": 0.87,
  "aspects": [
    {"aspect": "quality", "sentiment": "positive", "span": "fabric is very soft and authentic"},
    {"aspect": "delivery", "sentiment": "negative", "span": "came 5 days late"},
    {"aspect": "value", "sentiment": "positive", "span": "paisa vasool product"}
  ],
  "language_detected": "hi-Latn",    // Hinglish
  "processed_at": "2026-07-15T08:05:00Z"
}
```

---

### 3.4 Seller Reputation Score

```
reputation_score = (
    avg_product_rating * 0.40 +
    delivery_score      * 0.25 +    # % of orders delivered on-time
    response_rate_score * 0.20 +    # % of RFQs/queries answered within 24h
    (1 - return_rate)   * 100 * 0.15   # lower return rate → higher score
)
```

**Component Definitions:**

```python
def compute_seller_reputation(seller_id: str) -> dict:
    """
    All metrics computed over the trailing 90 days.
    Returns reputation_score (float, 0-100) and component breakdown.
    """
    
    # avg_product_rating: mean star rating across all products
    # Range: 0.0 - 5.0 → normalized to 0-100 by multiplying by 20
    avg_rating = db.scalar("""
        SELECT COALESCE(AVG(r.rating), 0.0) * 20
        FROM reviews r 
        JOIN products p ON r.product_id = p.id
        WHERE p.seller_id = $1 
        AND r.created_at > NOW() - INTERVAL '90 days'
    """, seller_id)
    
    # delivery_score: % of orders delivered on or before promised_delivery_date
    delivery_score = db.scalar("""
        SELECT COALESCE(
            100.0 * COUNT(*) FILTER (WHERE actual_delivery_date <= promised_delivery_date) 
            / NULLIF(COUNT(*) FILTER (WHERE status IN ('DELIVERED','COMPLETED')), 0),
            50.0    -- default 50 if no data
        )
        FROM orders 
        WHERE seller_id = $1 
        AND created_at > NOW() - INTERVAL '90 days'
    """, seller_id)
    
    # response_rate_score: % of RFQs and buyer messages responded to within 24h
    response_rate_score = db.scalar("""
        SELECT COALESCE(
            100.0 * COUNT(*) FILTER (
                WHERE first_seller_response_at IS NOT NULL
                AND first_seller_response_at <= created_at + INTERVAL '24 hours'
            ) / NULLIF(COUNT(*), 0),
            50.0
        )
        FROM buyer_messages
        WHERE seller_id = $1
        AND created_at > NOW() - INTERVAL '90 days'
    """, seller_id)
    
    # return_rate: fraction of orders that resulted in a return
    return_rate = db.scalar("""
        SELECT COALESCE(
            1.0 * COUNT(*) FILTER (WHERE status IN ('RETURN_APPROVED','RETURNED_TO_SELLER'))
            / NULLIF(COUNT(*) FILTER (WHERE status NOT IN ('CANCELLED','PAYMENT_FAILED')), 0),
            0.05    -- default 5% if no data
        )
        FROM orders 
        WHERE seller_id = $1 
        AND created_at > NOW() - INTERVAL '90 days'
    """, seller_id)
    
    reputation_score = (
        avg_rating * 0.40 +
        delivery_score * 0.25 +
        response_rate_score * 0.20 +
        (1 - return_rate) * 100 * 0.15
    )
    
    return {
        "seller_id": seller_id,
        "reputation_score": round(reputation_score, 2),
        "components": {
            "avg_product_rating_component": round(avg_rating * 0.40, 2),
            "delivery_score_component": round(delivery_score * 0.25, 2),
            "response_rate_component": round(response_rate_score * 0.20, 2),
            "return_rate_component": round((1 - return_rate) * 100 * 0.15, 2),
        },
        "raw_values": {
            "avg_rating_normalized": round(avg_rating, 2),
            "delivery_score": round(delivery_score, 2),
            "response_rate_score": round(response_rate_score, 2),
            "return_rate": round(return_rate, 4),
        },
        "computed_at": datetime.utcnow().isoformat()
    }
```

**Reputation Score Tiers:**

| Score | Tier | Badge |
|-------|------|-------|
| 85–100 | Platinum Seller | 🏆 |
| 70–84 | Gold Seller | 🥇 |
| 55–69 | Silver Seller | 🥈 |
| 40–54 | Standard | — |
| < 40 | Below Standard | ⚠️ (prompted to improve) |

**Update frequency:** Reputation score recomputed every 6 hours via background job.

---

## 4. Recommendation Engine

### 4.1 Phase 1 — Content-Based Filtering (Hackathon / MVP)

**Strategy:** Represent each product as a feature vector; recommend products with highest cosine similarity to user's interaction history.

**Product Feature Vector Construction:**

```python
def build_product_feature_vector(product: Product) -> np.ndarray:
    """
    Constructs a normalized feature vector from product metadata.
    Total dimensions: ~450
    """
    
    # Categorical features → one-hot encoding
    craft_type_ohe = one_hot(product.craft_type, CRAFT_TYPES)         # dim: 40
    category_ohe   = one_hot(product.category_id, LEAF_CATEGORIES)    # dim: 120
    color_ohe      = one_hot(product.primary_color, COLOR_PALETTE)    # dim: 25
    material_ohe   = one_hot(product.material, MATERIALS)             # dim: 20
    state_ohe      = one_hot(product.seller_state, INDIAN_STATES)     # dim: 28
    
    # Numerical features → normalized [0, 1]
    price_norm  = min(product.mrp / 50000, 1.0)    # cap at ₹50,000
    rating_norm = (product.avg_rating or 0) / 5.0
    trust_norm  = product.seller.verification_score / 100.0
    
    # Text embedding: product title + description
    text_embed = sentence_encoder.encode(
        f"query: {product.title} {product.description[:200]}"
    )[:200]    # Take first 200 dims of 768-dim embedding
    
    vector = np.concatenate([
        craft_type_ohe, category_ohe, color_ohe, 
        material_ohe, state_ohe,
        [price_norm, rating_norm, trust_norm],
        text_embed
    ])
    
    return vector / np.linalg.norm(vector)    # L2 normalize
```

**User Profile Vector:**

```python
def build_user_profile_vector(user_id: str) -> np.ndarray:
    """
    Averages feature vectors of products the user has interacted with,
    weighted by interaction strength.
    """
    interactions = db.fetch("""
        SELECT product_id, 
               SUM(CASE action 
                   WHEN 'purchase'   THEN 10
                   WHEN 'cart_add'   THEN 5
                   WHEN 'wishlist'   THEN 3
                   WHEN 'detail_view' THEN 2
                   WHEN 'impression' THEN 0.5
                   ELSE 1 END) as weight
        FROM user_interactions
        WHERE user_id = $1
        AND created_at > NOW() - INTERVAL '90 days'
        GROUP BY product_id
        ORDER BY weight DESC
        LIMIT 50
    """, user_id)
    
    if not interactions:
        return None    # Cold start: use popularity-based
    
    vectors = []
    weights = []
    for row in interactions:
        vec = get_product_vector(row.product_id)    # cached in Redis
        if vec is not None:
            vectors.append(vec)
            weights.append(row.weight)
    
    profile = np.average(vectors, axis=0, weights=weights)
    return profile / np.linalg.norm(profile)
```

**Recommendation Query:**

```python
async def get_content_recommendations(user_id: str, limit: int = 20) -> list[str]:
    user_vector = build_user_profile_vector(user_id)
    
    if user_vector is None:
        return await get_cold_start_recommendations(user_id, limit)
    
    # FAISS index for ANN search
    distances, indices = faiss_index.search(
        user_vector.reshape(1, -1).astype(np.float32), 
        limit * 3    # Fetch 3x to allow post-filtering
    )
    
    candidate_product_ids = [product_index_map[i] for i in indices[0]]
    
    # Post-filter: exclude already purchased, out-of-stock, own products
    filtered = await post_filter_candidates(candidate_product_ids, user_id)
    
    return filtered[:limit]
```

---

### 4.2 Phase 2 — Collaborative Filtering

**Algorithm:** Alternating Least Squares (ALS) on implicit feedback matrix

```python
from implicit import als

# User-item interaction matrix (sparse)
# Rows: users, Columns: products
# Values: interaction weights (purchase=10, cart=5, view=1, etc.)

model = als.AlternatingLeastSquares(
    factors=128,        # Latent dimensions
    regularization=0.1,
    iterations=20,
    use_gpu=True,
    calculate_training_loss=True,
)

model.fit(user_item_matrix)    # (n_users, n_products) sparse csr_matrix

# Recommend for a user
user_idx = user_id_to_idx[user_id]
recommendations = model.recommend(
    user_idx, 
    user_item_matrix[user_idx], 
    N=20,
    filter_already_liked_items=True
)
```

**Retraining:** ALS model retrained weekly using full interaction history (all-time, not windowed).  
**Inference:** Pre-computed top-100 recommendations per user, stored in Redis with 6-hour TTL.

---

### 4.3 Phase 3 — Hybrid + Contextual Bandits

**Hybrid Blending:**

```python
def hybrid_recommend(user_id: str, context: dict, limit: int = 20) -> list:
    content_recs = get_content_recommendations(user_id, limit * 2)
    collab_recs  = get_collaborative_recommendations(user_id, limit * 2)
    
    # Score fusion
    scored = {}
    for i, pid in enumerate(content_recs):
        scored[pid] = scored.get(pid, 0) + (1 / (i + 1)) * 0.5    # Content weight: 50%
    for i, pid in enumerate(collab_recs):
        scored[pid] = scored.get(pid, 0) + (1 / (i + 1)) * 0.5    # Collab weight: 50%
    
    candidates = sorted(scored.items(), key=lambda x: -x[1])[:limit * 2]
    
    # Contextual bandit for final ranking
    bandit_scored = contextual_bandit.score(
        user_id, 
        [pid for pid, _ in candidates],
        context    # {time_of_day, day_of_week, device_type, location_state}
    )
    
    return [pid for pid, _ in sorted(bandit_scored.items(), key=lambda x: -x[1])][:limit]
```

---

### 4.4 Cold Start Handling

```python
async def get_cold_start_recommendations(user_id: str, limit: int = 20) -> list[str]:
    """
    Used when user has < 3 interactions or is brand new.
    Combines popularity + location signals.
    """
    user_state = await get_user_state(user_id)    # From registration or IP geolocation
    
    # 60% from local artisans (same state or neighboring states)
    local_products = await db.fetch("""
        SELECT p.id FROM products p
        JOIN users u ON p.seller_id = u.id
        WHERE u.state = ANY($1)     -- user_state + neighboring states
        AND p.status = 'PUBLISHED'
        AND p.is_in_stock = true
        ORDER BY p.views_7d DESC, p.orders_7d DESC
        LIMIT $2
    """, get_state_and_neighbors(user_state), int(limit * 0.6))
    
    # 40% from platform bestsellers
    popular_products = await db.fetch("""
        SELECT p.id FROM products p
        WHERE p.status = 'PUBLISHED'
        AND p.seller_id NOT IN (SELECT id FROM users WHERE state = ANY($1))
        ORDER BY (p.orders_7d * 3 + p.views_7d) DESC
        LIMIT $2
    """, get_state_and_neighbors(user_state), int(limit * 0.4))
    
    combined = [r.id for r in local_products] + [r.id for r in popular_products]
    return combined[:limit]
```

---

### 4.5 Feed Ranking Signals

The social commerce feed (posts + reels + products) is ranked using a weighted multi-signal score:

```python
def rank_feed_item(item: FeedItem, user: User) -> float:
    """
    Returns a feed_score for ranking. Higher = shown earlier.
    All signals normalized to [0, 1].
    """
    
    # Recency: exponential decay
    age_hours = (datetime.utcnow() - item.published_at).total_seconds() / 3600
    recency_score = math.exp(-0.1 * age_hours)    # Half-life ≈ 7 hours
    
    # Engagement rate: (likes + 2*saves + 3*purchases) / impressions
    engagement_score = min(
        (item.likes + 2 * item.saves + 3 * item.purchases_from_post) 
        / max(item.impressions, 1) * 50,   # scale to ~0-1
        1.0
    )
    
    # Seller trust
    trust_score = item.seller.verification_score / 100.0
    
    # Geographic proximity
    user_state = user.state
    seller_state = item.seller.state
    if user_state == seller_state:
        geo_score = 1.0
    elif seller_state in NEIGHBORING_STATES.get(user_state, []):
        geo_score = 0.7
    else:
        geo_score = 0.3
    
    # Content type preference (personalized)
    content_pref = get_user_content_preference(user.id, item.content_type)
    
    feed_score = (
        recency_score    * 0.30 +
        engagement_score * 0.25 +
        trust_score      * 0.20 +
        geo_score        * 0.15 +
        content_pref     * 0.10
    )
    
    return feed_score
```

---

## 5. Government Scheme Eligibility Matcher

### 5.1 Eligibility Rule Schema

Each government scheme in the database has a structured `eligibility_rules` JSON array. Rules are evaluated against user-submitted answers from the eligibility questionnaire.

**Rule Object Schema:**

```typescript
interface EligibilityRule {
  field: string;                              // questionnaire field name
  operator: 'EQ' | 'NEQ' | 'IN' | 'NIN' | 'LT' | 'LTE' | 'GT' | 'GTE' | 'BETWEEN' | 'EXISTS';
  value: string | number | boolean | string[] | [number, number];  // depends on operator
  description?: string;                       // human-readable rule explanation
  is_knockout?: boolean;                      // if true, failing this rule disqualifies entirely
}
```

**Example Scheme Definition:**

```json
{
  "scheme_id": "sch_pm_mudra_shishu",
  "name": "PM Mudra Yojana – Shishu Category",
  "category": "loan",
  "max_loan_amount": 50000,
  "eligibility_rules": [
    {
      "field": "has_artisan_card",
      "operator": "EQ",
      "value": true,
      "description": "Must possess a valid Artisan Identity Card",
      "is_knockout": false
    },
    {
      "field": "annual_income",
      "operator": "LTE",
      "value": 300000,
      "description": "Annual household income must be ≤ ₹3 lakh",
      "is_knockout": true
    },
    {
      "field": "state",
      "operator": "IN",
      "value": ["Odisha", "West Bengal", "Assam", "Jharkhand", "Bihar", "Uttar Pradesh", "Andhra Pradesh", "Telangana", "Karnataka", "Tamil Nadu", "Kerala", "Manipur", "Nagaland", "Meghalaya"],
      "description": "Scheme available in selected handloom-producing states",
      "is_knockout": true
    },
    {
      "field": "business_type",
      "operator": "IN",
      "value": ["sole_proprietor", "artisan_self_employed"],
      "description": "Must be individual artisan or sole proprietor",
      "is_knockout": false
    },
    {
      "field": "age",
      "operator": "BETWEEN",
      "value": [18, 65],
      "description": "Applicant must be between 18 and 65 years of age",
      "is_knockout": true
    }
  ]
}
```

---

### 5.2 Rule Evaluation Engine

```python
from typing import Any, Union

class EligibilityMatcher:
    
    OPERATOR_FNS = {
        'EQ':      lambda field_val, rule_val: field_val == rule_val,
        'NEQ':     lambda field_val, rule_val: field_val != rule_val,
        'IN':      lambda field_val, rule_val: field_val in rule_val,
        'NIN':     lambda field_val, rule_val: field_val not in rule_val,
        'LT':      lambda field_val, rule_val: field_val < rule_val,
        'LTE':     lambda field_val, rule_val: field_val <= rule_val,
        'GT':      lambda field_val, rule_val: field_val > rule_val,
        'GTE':     lambda field_val, rule_val: field_val >= rule_val,
        'BETWEEN': lambda field_val, rule_val: rule_val[0] <= field_val <= rule_val[1],
        'EXISTS':  lambda field_val, rule_val: field_val is not None and field_val != "",
    }
    
    def evaluate_scheme(
        self, 
        scheme: Scheme, 
        user_answers: dict[str, Any]
    ) -> dict:
        """
        Evaluates a single scheme's eligibility rules against user answers.
        Returns:
            is_eligible: bool
            is_knockout: bool (True if a knockout rule failed)
            matched_rules: list of passed rule descriptions
            failed_rules: list of failed rule descriptions
            relevance_score: float (0.0–1.0) for sorting
        """
        matched_rules = []
        failed_rules = []
        is_knockout = False
        
        for rule in scheme.eligibility_rules:
            field_value = user_answers.get(rule['field'])
            
            # Handle missing answer
            if field_value is None:
                if rule.get('is_knockout'):
                    failed_rules.append({
                        "field": rule['field'],
                        "description": rule.get('description', f"Missing: {rule['field']}"),
                        "reason": "answer_not_provided"
                    })
                    is_knockout = True
                continue
            
            # Evaluate rule
            operator_fn = self.OPERATOR_FNS.get(rule['operator'])
            if operator_fn is None:
                raise ValueError(f"Unknown operator: {rule['operator']}")
            
            try:
                rule_passed = operator_fn(field_value, rule['value'])
            except TypeError as e:
                rule_passed = False    # Type mismatch → treat as failed
            
            if rule_passed:
                matched_rules.append(rule.get('description', f"{rule['field']} {rule['operator']} {rule['value']}"))
            else:
                failed_rules.append({
                    "field": rule['field'],
                    "description": rule.get('description', f"Required: {rule['field']} {rule['operator']} {rule['value']}"),
                    "reason": "rule_not_satisfied"
                })
                if rule.get('is_knockout'):
                    is_knockout = True
        
        # Eligibility determination
        is_eligible = len(failed_rules) == 0 or (
            not is_knockout and 
            len(matched_rules) >= len(scheme.eligibility_rules) * 0.6    # 60% rules must pass
        )
        
        # Relevance score: fraction of rules matched
        total_rules = len(scheme.eligibility_rules)
        relevance_score = len(matched_rules) / total_rules if total_rules > 0 else 0.0
        
        return {
            "scheme_id": scheme.id,
            "scheme_name": scheme.name,
            "is_eligible": is_eligible,
            "is_knockout_failed": is_knockout,
            "relevance_score": round(relevance_score, 3),
            "matched_rules": matched_rules,
            "failed_rules": failed_rules,
            "official_url": scheme.official_url,
            "disclaimer": "This result is informational only. Official eligibility is determined by the respective government agency. Sutra does not process loan or scheme applications."
        }
    
    def match_all_schemes(
        self, 
        user_answers: dict[str, Any], 
        schemes: list[Scheme]
    ) -> list[dict]:
        """
        Evaluates all active schemes. Returns eligible schemes sorted by relevance.
        """
        results = []
        for scheme in schemes:
            result = self.evaluate_scheme(scheme, user_answers)
            if result['is_eligible']:
                results.append(result)
        
        # Sort by relevance_score descending
        results.sort(key=lambda x: -x['relevance_score'])
        return results
```

**Eligibility Questionnaire Fields:**

```python
QUESTIONNAIRE_FIELDS = {
    "state":               {"type": "select", "options": INDIAN_STATES},
    "age":                 {"type": "integer", "min": 18, "max": 100},
    "gender":              {"type": "select", "options": ["male", "female", "other"]},
    "annual_income":       {"type": "integer", "min": 0, "max": 10000000},
    "has_artisan_card":    {"type": "boolean"},
    "artisan_card_number": {"type": "string", "optional": True},
    "craft_type":          {"type": "select", "options": CRAFT_TYPES},
    "business_type":       {"type": "select", "options": ["sole_proprietor", "partnership", "cooperative", "artisan_self_employed"]},
    "has_gstin":           {"type": "boolean"},
    "bank_account_linked": {"type": "boolean"},
    "years_in_craft":      {"type": "integer", "min": 0, "max": 60},
    "sc_st_obc":           {"type": "select", "options": ["general", "sc", "st", "obc", "ews"]},
    "has_existing_loan":   {"type": "boolean"},
    "is_women_led":        {"type": "boolean"},
    "district":            {"type": "string"},
}
```

---

## 6. FastAPI Service Structure & Code

### 6.1 Directory Structure

```
apps/ai/
├── main.py
├── config.py
├── requirements.txt
├── routers/
│   ├── __init__.py
│   ├── verify.py
│   ├── moderate.py
│   ├── search.py
│   └── recommend.py
├── models/
│   ├── __init__.py
│   ├── efficientnet_verifier.py
│   ├── fraud_detector.py
│   └── sentiment_analyzer.py
├── schemas/
│   ├── __init__.py
│   ├── verification.py
│   └── moderation.py
├── services/
│   ├── __init__.py
│   ├── s3_service.py
│   └── queue_service.py
└── utils/
    ├── __init__.py
    ├── image_utils.py
    └── scoring.py
```

---

### 6.2 `main.py`

```python
"""
main.py — Sutra AI Service Entry Point
FastAPI application with CORS, authentication middleware, routers, and startup events.
"""

import logging
import time
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from config import settings
from models.efficientnet_verifier import EfficientNetVerifier
from models.fraud_detector import FraudDetector
from models.sentiment_analyzer import SentimentAnalyzer
from routers import verify, moderate, search, recommend
from services.queue_service import QueueService

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Application State: loaded once at startup, shared across all requests
# ---------------------------------------------------------------------------
app_state = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: load models into memory.
    Shutdown: clean up resources.
    """
    logger.info("🚀 Starting Sutra AI Service...")
    
    # Load verification model
    logger.info("Loading EfficientNet Verifier...")
    app_state["verifier"] = EfficientNetVerifier(
        model_path=settings.VERIFIER_MODEL_PATH,
        device=settings.INFERENCE_DEVICE,
    )
    logger.info(f"✅ Verifier loaded. Device: {settings.INFERENCE_DEVICE}")
    
    # Load fraud detector
    logger.info("Loading Fraud Detector...")
    app_state["fraud_detector"] = FraudDetector()
    logger.info("✅ Fraud Detector loaded.")
    
    # Load sentiment analyzer
    logger.info("Loading Sentiment Analyzer...")
    app_state["sentiment_analyzer"] = SentimentAnalyzer(
        model_name=settings.SENTIMENT_MODEL_NAME,
        device=settings.INFERENCE_DEVICE,
    )
    logger.info("✅ Sentiment Analyzer loaded.")
    
    # Initialize queue service
    app_state["queue_service"] = QueueService(
        queue_url=settings.SQS_VERIFICATION_QUEUE_URL,
        region=settings.AWS_REGION,
    )
    logger.info("✅ Queue Service initialized.")
    
    logger.info("🎉 All models loaded. Service ready.")
    
    yield    # Application runs here
    
    # Shutdown cleanup
    logger.info("🛑 Shutting down Sutra AI Service...")
    app_state.clear()


# ---------------------------------------------------------------------------
# FastAPI Application
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Sutra AI Service",
    description="AI/ML backend for Sutra Handloom Marketplace — verification, moderation, recommendations, sentiment analysis.",
    version="1.0.0",
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)

# Gzip compression for large responses
app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.middleware("http")
async def request_timing_middleware(request: Request, call_next) -> Response:
    """Log request timing for performance monitoring."""
    start = time.perf_counter()
    request_id = request.headers.get("X-Request-ID", "unknown")
    
    response = await call_next(request)
    
    duration_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Response-Time-Ms"] = str(round(duration_ms, 2))
    response.headers["X-Request-ID"] = request_id
    
    logger.info(
        f"{request.method} {request.url.path} "
        f"status={response.status_code} "
        f"duration={duration_ms:.1f}ms "
        f"request_id={request_id}"
    )
    return response


@app.middleware("http")
async def internal_auth_middleware(request: Request, call_next) -> Response:
    """
    Verify internal service token for AI endpoints.
    The AI service is not exposed to the internet — only called by the NestJS backend.
    """
    # Health check bypasses auth
    if request.url.path in ["/health", "/metrics"]:
        return await call_next(request)
    
    api_key = request.headers.get("X-Internal-API-Key")
    if api_key != settings.INTERNAL_API_KEY:
        return JSONResponse(
            status_code=401,
            content={"error": "Unauthorized", "detail": "Invalid internal API key"}
        )
    
    return await call_next(request)


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(
    verify.router,
    prefix="/api/v1/verify",
    tags=["Verification"],
)
app.include_router(
    moderate.router,
    prefix="/api/v1/moderate",
    tags=["Moderation"],
)
app.include_router(
    search.router,
    prefix="/api/v1/search",
    tags=["Search & Recommendations"],
)
app.include_router(
    recommend.router,
    prefix="/api/v1/recommend",
    tags=["Recommendations"],
)


# ---------------------------------------------------------------------------
# Health & Metrics
# ---------------------------------------------------------------------------
@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint for load balancer and container orchestration."""
    models_loaded = all(
        k in app_state 
        for k in ["verifier", "fraud_detector", "sentiment_analyzer"]
    )
    return {
        "status": "healthy" if models_loaded else "degraded",
        "models_loaded": models_loaded,
        "environment": settings.ENVIRONMENT,
        "version": "1.0.0",
    }


@app.get("/", tags=["Root"])
async def root():
    return {"service": "Sutra AI Service", "docs": "/docs"}


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.PORT,
        workers=1,      # Single worker (models loaded in lifespan; multi-worker needs model re-load)
        log_level="info",
        access_log=True,
    )
```

---

### 6.3 `schemas/verification.py`

```python
"""
schemas/verification.py — Pydantic models for verification request/response.
Used for input validation and OpenAPI schema generation.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, validator, HttpUrl


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class VerificationClass(str, Enum):
    HANDLOOM_AUTHENTIC_WORKSPACE = "handloom_authentic_workspace"
    POWERLOOM_DETECTED            = "powerloom_detected"
    WORKSPACE_INSUFFICIENT        = "workspace_insufficient"
    STOCK_IMAGE_DETECTED          = "stock_image_detected"
    FABRIC_HANDLOOM_AUTHENTIC     = "fabric_handloom_authentic"
    FABRIC_POWERLOOM_SUSPECTED    = "fabric_powerloom_suspected"
    RAW_MATERIAL_VALID            = "raw_material_valid"
    IMAGE_QUALITY_INSUFFICIENT    = "image_quality_insufficient"


class VerificationMode(str, Enum):
    WORKSPACE = "workspace"
    PRODUCT   = "product"
    RAW_MATERIAL = "raw_material"


class VerificationStatus(str, Enum):
    PENDING    = "pending"
    PROCESSING = "processing"
    COMPLETED  = "completed"
    FAILED     = "failed"
    QUEUED     = "queued"


class VerificationBadge(str, Enum):
    VERIFIED_MASTER_ARTISAN = "VERIFIED_MASTER_ARTISAN"
    VERIFIED_HANDLOOM        = "VERIFIED_HANDLOOM"
    PENDING_REVIEW           = "PENDING_REVIEW"
    UNVERIFIED               = "UNVERIFIED"
    VERIFICATION_FAILED      = "VERIFICATION_FAILED"
    FLAGGED_POWERLOOM        = "FLAGGED_POWERLOOM"


# ---------------------------------------------------------------------------
# Request Schemas
# ---------------------------------------------------------------------------

class ImageAnalysisRequest(BaseModel):
    """Request to analyze a single image."""
    image_s3_key: str = Field(
        ...,
        description="S3 key of the image to analyze. Must be in the kyc-documents bucket.",
        example="pending/usr_01HABC/sub_01HXYZ/workspace_1.jpg"
    )
    mode: VerificationMode = Field(
        ...,
        description="Analysis mode: workspace, product, or raw_material"
    )


class VerificationSubmitRequest(BaseModel):
    """
    Seller submits a batch of images for verification.
    At least 1 workspace image and 2 product images are required.
    """
    seller_id: UUID = Field(..., description="UUID of the seller being verified")
    submission_id: Optional[str] = Field(
        None,
        description="Client-provided idempotency key. If omitted, server generates one."
    )
    workspace_image_keys: list[str] = Field(
        ...,
        min_items=1,
        max_items=3,
        description="S3 keys of workspace/loom images (1–3 required)"
    )
    product_image_keys: list[str] = Field(
        ...,
        min_items=2,
        max_items=5,
        description="S3 keys of fabric/product images (2–5 required)"
    )
    raw_material_image_key: Optional[str] = Field(
        None,
        description="S3 key of raw material image (optional, earns bonus points)"
    )
    priority: str = Field(
        "normal",
        pattern="^(normal|high|urgent)$",
        description="Queue priority. 'urgent' for re-verifications after admin escalation."
    )

    @validator("workspace_image_keys", "product_image_keys", each_item=True)
    def validate_s3_key(cls, v):
        if not v.startswith("pending/"):
            raise ValueError(f"Image key must start with 'pending/': {v}")
        if not v.endswith((".jpg", ".jpeg", ".png", ".webp")):
            raise ValueError(f"Image must be JPEG, PNG, or WebP: {v}")
        return v


class ManualReviewOverrideRequest(BaseModel):
    """Admin endpoint: manually override a verification result."""
    submission_id: str
    override_badge: VerificationBadge
    override_score: int = Field(..., ge=0, le=100)
    admin_user_id: UUID
    reason: str = Field(..., min_length=20, description="Reason for manual override (min 20 chars)")


# ---------------------------------------------------------------------------
# Response Schemas
# ---------------------------------------------------------------------------

class ClassProbability(BaseModel):
    """Softmax probability for a single output class."""
    class_name: VerificationClass
    probability: float = Field(..., ge=0.0, le=1.0)


class SingleImageAnalysisResult(BaseModel):
    """Result of analyzing a single image."""
    image_key: str
    mode: VerificationMode
    predicted_class: VerificationClass
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence in predicted class")
    all_probabilities: list[ClassProbability]
    is_stock_image: bool
    stock_confidence: Optional[float] = None
    quality_passed: bool
    processing_time_ms: float
    model_version: str


class ScoreComponents(BaseModel):
    """Breakdown of composite verification score."""
    workspace_component: float = Field(..., ge=0.0, le=40.0, description="Out of 40 points")
    product_component:   float = Field(..., ge=0.0, le=40.0, description="Out of 40 points")
    bonus_component:     float = Field(..., ge=0.0, le=10.0, description="Out of 10 points")
    consistency_bonus:   float = Field(..., ge=0.0, le=10.0, description="Out of 10 points")


class VerificationResultResponse(BaseModel):
    """Full verification result returned after processing."""
    submission_id: str
    seller_id: UUID
    status: VerificationStatus
    verification_score: Optional[int] = Field(None, ge=0, le=100)
    assigned_badge: Optional[VerificationBadge] = None
    score_components: Optional[ScoreComponents] = None
    image_results: list[SingleImageAnalysisResult] = []
    rejection_reasons: list[str] = Field(
        default_factory=list,
        description="Human-readable rejection reasons shown to seller"
    )
    admin_review_required: bool = False
    is_manually_overridden: bool = False
    submitted_at: datetime
    completed_at: Optional[datetime] = None
    next_reapply_date: Optional[datetime] = Field(
        None,
        description="Earliest date seller can reapply (set when badge = VERIFICATION_FAILED)"
    )
    model_version: str


class VerificationSubmitResponse(BaseModel):
    """Immediate response to a verification submission (async processing)."""
    submission_id: str
    status: VerificationStatus = VerificationStatus.QUEUED
    message: str = "Verification job queued. Results typically available within 2–5 minutes."
    estimated_completion_at: Optional[datetime] = None
    poll_url: str = Field(..., description="URL to poll for results")
```

---

### 6.4 `utils/scoring.py`

```python
"""
utils/scoring.py — Composite verification score calculation.
This module is the single source of truth for how verification_score is computed.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Class indices (must match model output layer ordering)
# ---------------------------------------------------------------------------
CLASS_HANDLOOM_WORKSPACE   = 0
CLASS_POWERLOOM_DETECTED   = 1
CLASS_WORKSPACE_INSUFFICIENT = 2
CLASS_STOCK_IMAGE          = 3
CLASS_FABRIC_AUTHENTIC     = 4
CLASS_FABRIC_POWERLOOM     = 5
CLASS_RAW_MATERIAL         = 6
CLASS_QUALITY_INSUFFICIENT = 7

# Score thresholds for badge assignment
BADGE_MASTER_ARTISAN_MIN  = 90
BADGE_VERIFIED_MIN        = 75
BADGE_PENDING_REVIEW_MIN  = 50
BADGE_UNVERIFIED_MIN      = 25
BADGE_FAILED_MIN          = 0

# Component weights (must sum to 1.0)
WEIGHT_WORKSPACE    = 0.40
WEIGHT_PRODUCT      = 0.40
WEIGHT_BONUS        = 0.10
WEIGHT_CONSISTENCY  = 0.10


@dataclass
class ImageAnalysis:
    """Result of running model inference on a single image."""
    image_key: str
    probs: list[float]     # 8-element softmax probability list


@dataclass
class ScoreBreakdown:
    workspace_raw:     float   # raw component value [0.0, 1.0]
    product_raw:       float
    bonus_raw:         float
    consistency_raw:   float
    workspace_weighted: float  # raw * weight
    product_weighted:   float
    bonus_weighted:     float
    consistency_weighted: float
    composite_score:   int     # final 0-100 integer
    is_powerloom_flagged: bool  # True if powerloom definitively detected


def compute_workspace_component(workspace_analyses: list[ImageAnalysis]) -> tuple[float, bool]:
    """
    Compute the workspace component score [0.0, 1.0] and powerloom flag.
    
    Returns:
        (component_score, is_powerloom_flagged)
        
    Powerloom flag is True if any single workspace image has p_powerloom > 0.85.
    In that case, component_score is forced to 0.0 and the overall verification
    results in FLAGGED_POWERLOOM badge regardless of other scores.
    """
    if not workspace_analyses:
        logger.warning("No workspace images provided; workspace component = 0.0")
        return 0.0, False
    
    is_powerloom_flagged = False
    image_scores = []
    
    for analysis in workspace_analyses:
        p_authentic   = analysis.probs[CLASS_HANDLOOM_WORKSPACE]
        p_powerloom   = analysis.probs[CLASS_POWERLOOM_DETECTED]
        p_insufficient = analysis.probs[CLASS_WORKSPACE_INSUFFICIENT]
        p_stock       = analysis.probs[CLASS_STOCK_IMAGE]
        p_quality     = analysis.probs[CLASS_QUALITY_INSUFFICIENT]
        
        # Hard disqualifiers
        if p_powerloom > 0.85:
            logger.warning(f"Powerloom definitively detected in {analysis.image_key}: p={p_powerloom:.3f}")
            is_powerloom_flagged = True
            return 0.0, True    # Early exit: no need to evaluate further
        
        if p_powerloom > 0.70:
            image_scores.append(-1.0)    # Likely powerloom
            continue
        
        if p_stock > 0.80:
            image_scores.append(-0.5)    # Stock image penalty
            continue
        
        if p_quality > 0.70:
            image_scores.append(0.0)     # Poor quality: neutral (ignore)
            continue
        
        # Graded score for valid images
        raw = p_authentic - (p_powerloom * 0.80) - (p_stock * 0.50) - (p_insufficient * 0.20)
        image_scores.append(max(0.0, min(1.0, raw)))
    
    if not image_scores or all(s <= 0 for s in image_scores):
        return 0.0, False
    
    # If any score is -1.0 (likely powerloom): component = 0
    if -1.0 in image_scores:
        return 0.0, False
    
    # Weight best image at 50%, second at 30%, third at 20%
    valid_scores = sorted([s for s in image_scores if s > 0], reverse=True)
    weights = [0.50, 0.30, 0.20][:len(valid_scores)]
    total_weight = sum(weights)
    
    weighted_score = sum(s * w for s, w in zip(valid_scores, weights)) / total_weight
    return max(0.0, min(1.0, weighted_score)), False


def compute_product_component(product_analyses: list[ImageAnalysis]) -> float:
    """
    Compute the product/fabric component score [0.0, 1.0].
    Equal weight given to all product images.
    """
    if not product_analyses:
        logger.warning("No product images provided; product component = 0.0")
        return 0.0
    
    image_scores = []
    
    for analysis in product_analyses:
        p_authentic = analysis.probs[CLASS_FABRIC_AUTHENTIC]
        p_powerloom = analysis.probs[CLASS_FABRIC_POWERLOOM]
        p_stock     = analysis.probs[CLASS_STOCK_IMAGE]
        p_quality   = analysis.probs[CLASS_QUALITY_INSUFFICIENT]
        
        if p_stock > 0.80:
            image_scores.append(-0.3)
            continue
        
        if p_quality > 0.70:
            image_scores.append(0.0)
            continue
        
        raw = p_authentic - (p_powerloom * 0.60) - (p_stock * 0.40)
        image_scores.append(max(0.0, min(1.0, raw)))
    
    valid_scores = [s for s in image_scores if s > 0]
    if not valid_scores:
        return 0.0
    
    return sum(valid_scores) / len(valid_scores)    # Simple average


def compute_bonus_component(raw_material_analyses: list[ImageAnalysis]) -> float:
    """
    Compute bonus score from raw material images [0.0, 1.0].
    Optional: no raw material images → 0.0 bonus (not penalized).
    """
    if not raw_material_analyses:
        return 0.0
    
    best_prob = max(a.probs[CLASS_RAW_MATERIAL] for a in raw_material_analyses)
    return min(1.0, best_prob * 1.20)    # 20% boost factor


def compute_consistency_bonus(workspace_raw: float, product_raw: float) -> float:
    """
    Reward sellers whose workspace and product images are both strongly authentic.
    Penalize when signals are contradictory (e.g., great workspace, poor product authenticity).
    """
    if workspace_raw >= 0.70 and product_raw >= 0.70:
        return 1.0    # Both strong → full consistency bonus
    
    if workspace_raw >= 0.50 and product_raw >= 0.50:
        return 0.50   # Both moderate
    
    discrepancy = abs(workspace_raw - product_raw)
    if discrepancy > 0.50:
        return 0.0    # Large inconsistency: suspicious
    
    return 0.20       # Small inconsistency: minimal bonus


def compute_composite_score(
    workspace_analyses: list[ImageAnalysis],
    product_analyses:   list[ImageAnalysis],
    raw_material_analyses: list[ImageAnalysis] = None,
) -> ScoreBreakdown:
    """
    Main entry point for score computation.
    
    Args:
        workspace_analyses: Inference results for workspace images
        product_analyses:   Inference results for product/fabric images
        raw_material_analyses: Inference results for raw material images (optional)
    
    Returns:
        ScoreBreakdown with all components and the final composite_score (0-100)
    """
    raw_material_analyses = raw_material_analyses or []
    
    # Compute each component
    workspace_raw, is_flagged = compute_workspace_component(workspace_analyses)
    
    if is_flagged:
        # Short-circuit: powerloom definitively detected
        return ScoreBreakdown(
            workspace_raw=0.0,
            product_raw=0.0,
            bonus_raw=0.0,
            consistency_raw=0.0,
            workspace_weighted=0.0,
            product_weighted=0.0,
            bonus_weighted=0.0,
            consistency_weighted=0.0,
            composite_score=0,
            is_powerloom_flagged=True,
        )
    
    product_raw    = compute_product_component(product_analyses)
    bonus_raw      = compute_bonus_component(raw_material_analyses)
    consistency_raw = compute_consistency_bonus(workspace_raw, product_raw)
    
    # Apply weights
    workspace_weighted   = workspace_raw   * WEIGHT_WORKSPACE   * 100
    product_weighted     = product_raw     * WEIGHT_PRODUCT     * 100
    bonus_weighted       = bonus_raw       * WEIGHT_BONUS       * 100
    consistency_weighted = consistency_raw * WEIGHT_CONSISTENCY * 100
    
    composite_score = int(round(
        workspace_weighted + product_weighted + bonus_weighted + consistency_weighted
    ))
    composite_score = max(0, min(100, composite_score))
    
    logger.info(
        f"Score computed: "
        f"workspace={workspace_weighted:.1f} + product={product_weighted:.1f} + "
        f"bonus={bonus_weighted:.1f} + consistency={consistency_weighted:.1f} "
        f"= {composite_score}/100"
    )
    
    return ScoreBreakdown(
        workspace_raw=round(workspace_raw, 4),
        product_raw=round(product_raw, 4),
        bonus_raw=round(bonus_raw, 4),
        consistency_raw=round(consistency_raw, 4),
        workspace_weighted=round(workspace_weighted, 2),
        product_weighted=round(product_weighted, 2),
        bonus_weighted=round(bonus_weighted, 2),
        consistency_weighted=round(consistency_weighted, 2),
        composite_score=composite_score,
        is_powerloom_flagged=False,
    )


def score_to_badge(score: int, is_powerloom_flagged: bool) -> str:
    """Map composite score (and powerloom flag) to badge string."""
    if is_powerloom_flagged:
        return "FLAGGED_POWERLOOM"
    if score >= BADGE_MASTER_ARTISAN_MIN:
        return "VERIFIED_MASTER_ARTISAN"
    if score >= BADGE_VERIFIED_MIN:
        return "VERIFIED_HANDLOOM"
    if score >= BADGE_PENDING_REVIEW_MIN:
        return "PENDING_REVIEW"
    if score >= BADGE_UNVERIFIED_MIN:
        return "UNVERIFIED"
    return "VERIFICATION_FAILED"


def generate_rejection_reasons(
    breakdown: ScoreBreakdown,
    workspace_analyses: list[ImageAnalysis],
    product_analyses: list[ImageAnalysis],
) -> list[str]:
    """
    Generate human-readable rejection reasons for the seller.
    Always specific; never vague. Used in rejection email and in-app notification.
    """
    reasons = []
    
    if breakdown.is_powerloom_flagged:
        reasons.append(
            "One or more of your workspace photos appears to show a power loom machine. "
            "Sutra Marketplace is exclusively for handloom artisans. "
            "If this is an error, please re-upload clearer photos showing only your handloom setup."
        )
        return reasons
    
    if breakdown.workspace_raw < 0.30:
        reasons.append(
            "Your workspace photos did not clearly show a handloom loom structure. "
            "Please ensure the loom is the primary subject of the photo, "
            "fully visible, and taken in good lighting."
        )
    
    if breakdown.product_raw < 0.30:
        reasons.append(
            "Your fabric/product photos did not show sufficient handloom texture characteristics. "
            "Please upload close-up shots of the weave that clearly show the hand-woven nature of the fabric."
        )
    
    # Check for stock images
    stock_in_workspace = any(
        a.probs[CLASS_STOCK_IMAGE] > 0.60 for a in workspace_analyses
    )
    stock_in_product = any(
        a.probs[CLASS_STOCK_IMAGE] > 0.60 for a in product_analyses
    )
    
    if stock_in_workspace or stock_in_product:
        reasons.append(
            "One or more of your photos was identified as a stock or internet image. "
            "All verification photos must be original photos taken by you at your own workspace. "
            "Downloaded or copied images are not accepted."
        )
    
    # Check image quality
    quality_failures = sum(
        1 for a in workspace_analyses + product_analyses
        if a.probs[CLASS_QUALITY_INSUFFICIENT] > 0.70
    )
    if quality_failures > 0:
        reasons.append(
            f"{quality_failures} photo(s) did not meet quality requirements. "
            "Please ensure all photos are: well-lit (not dark), in focus (not blurry), "
            "and at least 800×800 pixels resolution."
        )
    
    if breakdown.consistency_raw == 0.0:
        reasons.append(
            "There is a significant inconsistency between your workspace photos and product photos. "
            "The workspace appears handloom but product photos do not match, or vice versa. "
            "Please ensure all photos represent your actual production setup."
        )
    
    if not reasons:
        reasons.append(
            "The overall verification score did not meet the minimum threshold. "
            "Please review the photo guidelines and resubmit with clearer, "
            "higher-quality images of your handloom setup and products."
        )
    
    return reasons
```

---

### 6.5 `routers/verify.py`

```python
"""
routers/verify.py — Verification endpoints.

Endpoints:
  POST /api/v1/verify/submit      — Seller submits images for verification
  GET  /api/v1/verify/status/{id} — Poll verification result
  POST /api/v1/verify/admin/override — Admin manually overrides result
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks

from models.efficientnet_verifier import EfficientNetVerifier
from schemas.verification import (
    VerificationSubmitRequest,
    VerificationSubmitResponse,
    VerificationResultResponse,
    VerificationStatus,
    ManualReviewOverrideRequest,
)
from services.queue_service import QueueService
from services.s3_service import S3Service
from utils.scoring import (
    compute_composite_score,
    score_to_badge,
    generate_rejection_reasons,
    ImageAnalysis,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Dependency injection helpers
# ---------------------------------------------------------------------------

def get_verifier(request: Request) -> EfficientNetVerifier:
    return request.app.state.verifier if hasattr(request.app.state, "verifier") \
        else request.app.extra.get("verifier") or request.state.app_state["verifier"]


def get_queue_service(request: Request) -> QueueService:
    from main import app_state
    return app_state["queue_service"]


def get_s3_service() -> S3Service:
    return S3Service()


# ---------------------------------------------------------------------------
# POST /submit — Submit verification job
# ---------------------------------------------------------------------------

@router.post(
    "/submit",
    response_model=VerificationSubmitResponse,
    status_code=202,    # 202 Accepted: async processing
    summary="Submit seller verification images",
    description=(
        "Accepts a batch of workspace and product images, enqueues them for "
        "AI verification. Results are processed asynchronously; poll /status/{id} for results."
    ),
)
async def submit_verification(
    request_body: VerificationSubmitRequest,
    background_tasks: BackgroundTasks,
    queue_service: QueueService = Depends(get_queue_service),
    s3_service: S3Service = Depends(get_s3_service),
):
    """
    Validation → S3 existence check → SQS enqueue → return 202.
    
    NOTE: Actual model inference happens in the worker service (separate ECS task)
    that polls the SQS queue. This endpoint only validates and enqueues.
    """
    
    submission_id = request_body.submission_id or f"sub_{uuid.uuid4().hex[:16]}"
    
    # Check for duplicate submission (idempotency)
    existing = await _get_submission_from_db(submission_id)
    if existing:
        logger.info(f"Duplicate submission detected: {submission_id}")
        return VerificationSubmitResponse(
            submission_id=submission_id,
            status=existing.status,
            message="Submission already received.",
            poll_url=f"/api/v1/verify/status/{submission_id}",
        )
    
    # Validate all S3 keys exist
    all_keys = (
        request_body.workspace_image_keys +
        request_body.product_image_keys +
        ([request_body.raw_material_image_key] if request_body.raw_material_image_key else [])
    )
    
    missing_keys = []
    for key in all_keys:
        if not await s3_service.object_exists(bucket="sutra-kyc", key=key):
            missing_keys.append(key)
    
    if missing_keys:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "S3_KEYS_NOT_FOUND",
                "message": "One or more image files were not found in S3. Upload images first.",
                "missing_keys": missing_keys,
            }
        )
    
    # Create submission record in DB
    await _create_submission_record(
        submission_id=submission_id,
        seller_id=str(request_body.seller_id),
        status=VerificationStatus.QUEUED,
    )
    
    # Enqueue to SQS
    sqs_message = {
        "submission_id": submission_id,
        "seller_id":     str(request_body.seller_id),
        "workspace_image_keys": request_body.workspace_image_keys,
        "product_image_keys":   request_body.product_image_keys,
        "raw_material_image_key": request_body.raw_material_image_key,
        "submitted_at": datetime.utcnow().isoformat(),
        "priority":     request_body.priority,
    }
    
    await queue_service.enqueue(
        message=sqs_message,
        message_group_id=str(request_body.seller_id),    # FIFO: group by seller
        deduplication_id=submission_id,
    )
    
    logger.info(f"Verification job queued: submission_id={submission_id}, seller_id={request_body.seller_id}")
    
    estimated_completion = datetime.utcnow() + timedelta(minutes=5)
    
    return VerificationSubmitResponse(
        submission_id=submission_id,
        status=VerificationStatus.QUEUED,
        message="Your verification images have been received and are queued for processing. "
                "You will be notified by email and in-app notification when results are ready.",
        estimated_completion_at=estimated_completion,
        poll_url=f"/api/v1/verify/status/{submission_id}",
    )


# ---------------------------------------------------------------------------
# GET /status/{submission_id} — Poll for results
# ---------------------------------------------------------------------------

@router.get(
    "/status/{submission_id}",
    response_model=VerificationResultResponse,
    summary="Get verification result",
    description="Poll this endpoint to check the status of a verification submission.",
)
async def get_verification_status(submission_id: str):
    result = await _get_submission_from_db(submission_id)
    
    if result is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "SUBMISSION_NOT_FOUND", "submission_id": submission_id}
        )
    
    return result


# ---------------------------------------------------------------------------
# POST /admin/override — Admin manual override
# ---------------------------------------------------------------------------

@router.post(
    "/admin/override",
    response_model=VerificationResultResponse,
    summary="Admin: manually override verification result",
    description="Allows admin to override AI-assigned badge. Requires admin_user_id.",
)
async def admin_override_verification(override: ManualReviewOverrideRequest):
    submission = await _get_submission_from_db(override.submission_id)
    
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    # Apply override
    await _apply_override_to_db(
        submission_id=override.submission_id,
        badge=override.override_badge,
        score=override.override_score,
        admin_id=str(override.admin_user_id),
        reason=override.reason,
    )
    
    logger.info(
        f"Admin override applied: submission={override.submission_id}, "
        f"badge={override.override_badge}, admin={override.admin_user_id}"
    )
    
    updated = await _get_submission_from_db(override.submission_id)
    return updated


# ---------------------------------------------------------------------------
# Internal Worker Endpoint (called by SQS worker, not public)
# ---------------------------------------------------------------------------

@router.post(
    "/internal/process",
    include_in_schema=False,    # Hidden from public API docs
    summary="[INTERNAL] Process a verification job synchronously",
    description="Called by the SQS worker to run inference and write results to DB.",
)
async def process_verification_job(
    job: dict,
    request: Request,
):
    """
    This endpoint is called by the verification worker process.
    It runs the full inference pipeline synchronously and writes results to DB.
    
    NOT exposed externally. Protected by internal API key middleware.
    """
    from main import app_state
    from services.s3_service import S3Service
    
    verifier: EfficientNetVerifier = app_state["verifier"]
    s3_service = S3Service()
    
    submission_id = job["submission_id"]
    
    # Update status to PROCESSING
    await _update_submission_status(submission_id, VerificationStatus.PROCESSING)
    
    try:
        workspace_analyses = []
        product_analyses   = []
        raw_material_analyses = []
        
        # Download and analyze workspace images
        for key in job["workspace_image_keys"]:
            image_bytes = await s3_service.download_object(bucket="sutra-kyc", key=key)
            probs = verifier.predict(image_bytes)    # Returns list[float] of length 8
            workspace_analyses.append(ImageAnalysis(image_key=key, probs=probs))
        
        # Download and analyze product images
        for key in job["product_image_keys"]:
            image_bytes = await s3_service.download_object(bucket="sutra-kyc", key=key)
            probs = verifier.predict(image_bytes)
            product_analyses.append(ImageAnalysis(image_key=key, probs=probs))
        
        # Download and analyze raw material image (if provided)
        if job.get("raw_material_image_key"):
            image_bytes = await s3_service.download_object(
                bucket="sutra-kyc", key=job["raw_material_image_key"]
            )
            probs = verifier.predict(image_bytes)
            raw_material_analyses.append(ImageAnalysis(image_key=job["raw_material_image_key"], probs=probs))
        
        # Compute composite score
        breakdown = compute_composite_score(workspace_analyses, product_analyses, raw_material_analyses)
        badge = score_to_badge(breakdown.composite_score, breakdown.is_powerloom_flagged)
        rejection_reasons = generate_rejection_reasons(breakdown, workspace_analyses, product_analyses)
        
        # Write results to DB
        await _write_verification_result(
            submission_id=submission_id,
            score=breakdown.composite_score,
            badge=badge,
            breakdown=breakdown,
            rejection_reasons=rejection_reasons if badge in ["VERIFICATION_FAILED", "FLAGGED_POWERLOOM"] else [],
        )
        
        # Update seller's verification badge
        await _update_seller_badge(
            seller_id=job["seller_id"],
            badge=badge,
            score=breakdown.composite_score,
        )
        
        logger.info(f"Verification complete: {submission_id} → {badge} ({breakdown.composite_score}/100)")
    
    except Exception as e:
        logger.error(f"Verification processing failed for {submission_id}: {e}", exc_info=True)
        await _update_submission_status(submission_id, VerificationStatus.FAILED)
        raise
    
    return {"submission_id": submission_id, "status": "completed"}


# ---------------------------------------------------------------------------
# Database helper stubs (implemented in db layer)
# ---------------------------------------------------------------------------

async def _get_submission_from_db(submission_id: str):
    """Fetch verification submission from PostgreSQL."""
    # Implementation in apps/backend/src/verification/verification.service.ts (via internal API)
    pass

async def _create_submission_record(submission_id: str, seller_id: str, status: VerificationStatus):
    pass

async def _update_submission_status(submission_id: str, status: VerificationStatus):
    pass

async def _write_verification_result(submission_id, score, badge, breakdown, rejection_reasons):
    pass

async def _update_seller_badge(seller_id: str, badge: str, score: int):
    pass

async def _apply_override_to_db(submission_id, badge, score, admin_id, reason):
    pass
```

---

### 6.6 `models/efficientnet_verifier.py`

```python
"""
models/efficientnet_verifier.py — EfficientNet-B3 model loading and inference.

This module manages the ONNX Runtime session for the handloom verification model.
It provides a thread-safe inference interface suitable for async FastAPI usage.
"""

from __future__ import annotations

import io
import logging
import threading
import time
from pathlib import Path
from typing import Optional

import numpy as np
import onnxruntime as ort
from PIL import Image

logger = logging.getLogger(__name__)

# Preprocessing constants (must match training pipeline)
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD  = np.array([0.229, 0.224, 0.225], dtype=np.float32)
TARGET_SIZE   = (300, 300)
NUM_CLASSES   = 8

# Class name mapping
CLASS_NAMES = [
    "handloom_authentic_workspace",
    "powerloom_detected",
    "workspace_insufficient",
    "stock_image_detected",
    "fabric_handloom_authentic",
    "fabric_powerloom_suspected",
    "raw_material_valid",
    "image_quality_insufficient",
]


class EfficientNetVerifier:
    """
    Thread-safe ONNX Runtime wrapper for EfficientNet-B3 verification model.
    
    Usage:
        verifier = EfficientNetVerifier(model_path="models/efficientnet_verifier.onnx")
        probs = verifier.predict(image_bytes)
    """
    
    def __init__(
        self, 
        model_path: str,
        device: str = "cpu",
        num_threads: int = 4,
    ):
        self.model_path  = model_path
        self.device      = device
        self._lock       = threading.Lock()    # ONNX session is thread-safe for reads but we lock for safety
        self.model_version = self._read_model_version(model_path)
        
        self._session = self._load_session(model_path, device, num_threads)
        
        # Warm up with dummy input (eliminates cold-start latency for first real request)
        self._warmup()
        
        logger.info(
            f"EfficientNetVerifier initialized: "
            f"path={model_path}, device={device}, version={self.model_version}"
        )
    
    def _load_session(self, model_path: str, device: str, num_threads: int) -> ort.InferenceSession:
        if not Path(model_path).exists():
            raise FileNotFoundError(f"Model file not found: {model_path}")
        
        session_options = ort.SessionOptions()
        session_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        session_options.intra_op_num_threads = num_threads
        session_options.inter_op_num_threads = 2
        session_options.enable_mem_pattern   = True
        session_options.enable_cpu_mem_arena = True
        
        # Provider selection
        if device == "cuda" and "CUDAExecutionProvider" in ort.get_available_providers():
            providers = [
                ("CUDAExecutionProvider", {"device_id": 0, "arena_extend_strategy": "kSameAsRequested"}),
                "CPUExecutionProvider"
            ]
        else:
            if device == "cuda":
                logger.warning("CUDA requested but CUDAExecutionProvider not available. Falling back to CPU.")
            providers = ["CPUExecutionProvider"]
        
        session = ort.InferenceSession(model_path, session_options, providers=providers)
        
        logger.info(f"ONNX session loaded. Active provider: {session.get_providers()[0]}")
        return session
    
    def _warmup(self) -> None:
        """Run a dummy inference pass to warm up the ONNX runtime."""
        dummy = np.random.randn(1, 3, 300, 300).astype(np.float32)
        self._session.run(None, {"image": dummy})
        logger.debug("Model warmup complete.")
    
    def _read_model_version(self, model_path: str) -> str:
        """Read model version from companion .version file if exists."""
        version_path = str(model_path).replace(".onnx", ".version")
        try:
            return Path(version_path).read_text().strip()
        except FileNotFoundError:
            return "unknown"
    
    def preprocess(self, image_bytes: bytes) -> np.ndarray:
        """
        Convert raw image bytes to preprocessed numpy array.
        
        Args:
            image_bytes: Raw bytes of JPEG, PNG, or WebP image
            
        Returns:
            Float32 numpy array of shape (1, 3, 300, 300), normalized
            
        Raises:
            ValueError: If image cannot be decoded or is too small
        """
        try:
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        except Exception as e:
            raise ValueError(f"Cannot decode image: {e}")
        
        # Size validation
        if image.width < 64 or image.height < 64:
            raise ValueError(
                f"Image too small: {image.width}x{image.height}. Minimum 64x64 required."
            )
        
        # Resize to 300x300
        image = image.resize(TARGET_SIZE, Image.BICUBIC)
        
        # Convert to float32 numpy array, scale to [0, 1]
        arr = np.array(image, dtype=np.float32) / 255.0    # (300, 300, 3)
        
        # Normalize with ImageNet mean and std
        arr = (arr - IMAGENET_MEAN) / IMAGENET_STD          # (300, 300, 3)
        
        # HWC → CHW and add batch dimension
        arr = arr.transpose(2, 0, 1)[np.newaxis, ...]        # (1, 3, 300, 300)
        
        return arr.astype(np.float32)
    
    def predict(self, image_bytes: bytes) -> list[float]:
        """
        Run inference on a single image.
        
        Args:
            image_bytes: Raw image bytes
            
        Returns:
            List of 8 softmax probabilities (one per class).
            Probabilities sum to 1.0.
            Index 0 = handloom_authentic_workspace
            Index 1 = powerloom_detected
            Index 2 = workspace_insufficient
            Index 3 = stock_image_detected
            Index 4 = fabric_handloom_authentic
            Index 5 = fabric_powerloom_suspected
            Index 6 = raw_material_valid
            Index 7 = image_quality_insufficient
            
        Raises:
            ValueError: If image preprocessing fails
            RuntimeError: If ONNX inference fails
        """
        input_tensor = self.preprocess(image_bytes)
        
        t_start = time.perf_counter()
        
        try:
            outputs = self._session.run(
                output_names=["class_probabilities"],
                input_feed={"image": input_tensor}
            )
        except Exception as e:
            raise RuntimeError(f"ONNX inference failed: {e}") from e
        
        inference_ms = (time.perf_counter() - t_start) * 1000
        logger.debug(f"Inference complete in {inference_ms:.1f}ms")
        
        # outputs[0] shape: (1, 8) → flatten to list
        probs = outputs[0][0].tolist()
        
        # Sanity check: probabilities should sum close to 1.0
        prob_sum = sum(probs)
        if abs(prob_sum - 1.0) > 0.01:
            logger.warning(f"Probability sum deviation: {prob_sum:.4f} (expected ~1.0)")
        
        return probs
    
    def predict_with_metadata(self, image_bytes: bytes) -> dict:
        """
        Run inference and return probabilities with class names and timing.
        Useful for debugging and admin review interfaces.
        """
        t_total = time.perf_counter()
        probs = self.predict(image_bytes)
        total_ms = (time.perf_counter() - t_total) * 1000
        
        predicted_idx = int(np.argmax(probs))
        
        return {
            "predicted_class": CLASS_NAMES[predicted_idx],
            "confidence": round(probs[predicted_idx], 4),
            "all_probabilities": {
                name: round(prob, 4) 
                for name, prob in zip(CLASS_NAMES, probs)
            },
            "inference_time_ms": round(total_ms, 2),
            "model_version": self.model_version,
        }
    
    def batch_predict(self, image_bytes_list: list[bytes]) -> list[list[float]]:
        """
        Run inference on multiple images in a single batch.
        More efficient than calling predict() in a loop when batch_size > 1.
        
        Args:
            image_bytes_list: List of raw image bytes
            
        Returns:
            List of probability lists (one per image)
        """
        if not image_bytes_list:
            return []
        
        tensors = [self.preprocess(b) for b in image_bytes_list]
        batch = np.concatenate(tensors, axis=0)    # (N, 3, 300, 300)
        
        outputs = self._session.run(
            output_names=["class_probabilities"],
            input_feed={"image": batch}
        )
        
        return outputs[0].tolist()    # List of N probability lists


# ---------------------------------------------------------------------------
# Quality pre-check (before model inference)
# ---------------------------------------------------------------------------

def check_image_quality(image_bytes: bytes) -> dict:
    """
    Fast pre-check for image quality before running expensive model inference.
    Uses OpenCV-free approach (PIL + numpy only).
    
    Returns:
        {
            passed: bool,
            blur_score: float,          # Laplacian variance proxy (higher = sharper)
            brightness_mean: float,     # Mean pixel brightness [0, 255]
            file_size_kb: float,
            resolution: tuple[int, int],
            failure_reason: str | None
        }
    """
    import io
    import numpy as np
    from PIL import ImageFilter
    
    file_size_kb = len(image_bytes) / 1024
    
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("L")    # Grayscale
    except Exception as e:
        return {"passed": False, "failure_reason": f"Cannot decode: {e}"}
    
    resolution = (image.width, image.height)
    
    # Brightness check
    arr = np.array(image, dtype=np.float32)
    brightness_mean = float(arr.mean())
    
    # Blur check: Laplacian variance (approximate using PIL)
    laplacian = image.filter(ImageFilter.FIND_EDGES)
    lap_arr = np.array(laplacian, dtype=np.float32)
    blur_score = float(lap_arr.var())
    
    # Failure conditions
    failure_reason = None
    if brightness_mean < 40:
        failure_reason = "Image is too dark (mean brightness < 40/255)"
    elif blur_score < 100:
        failure_reason = f"Image is too blurry (blur score: {blur_score:.1f} < 100)"
    elif file_size_kb < 20:
        failure_reason = f"Image file is too small ({file_size_kb:.1f}KB)"
    elif resolution[0] < 200 or resolution[1] < 200:
        failure_reason = f"Image resolution too low: {resolution[0]}x{resolution[1]}"
    
    return {
        "passed": failure_reason is None,
        "blur_score": round(blur_score, 2),
        "brightness_mean": round(brightness_mean, 2),
        "file_size_kb": round(file_size_kb, 2),
        "resolution": resolution,
        "failure_reason": failure_reason,
    }
```

---

### 6.7 `requirements.txt`

```
# Core framework
fastapi==0.111.0
uvicorn[standard]==0.29.0
python-multipart==0.0.9

# Pydantic
pydantic==2.7.1
pydantic-settings==2.2.1

# ML inference
onnxruntime==1.17.3           # CPU; use onnxruntime-gpu==1.17.3 for CUDA
numpy==1.26.4
Pillow==10.3.0

# Perceptual hashing
ImageHash==4.3.1

# Sentence embeddings (recommendation + sentiment)
sentence-transformers==2.7.0
torch==2.3.0                  # CPU build; remove and use CUDA build on GPU instances
transformers==4.41.0

# AWS
boto3==1.34.100
aioboto3==13.0.0              # Async S3 operations

# Google Cloud Vision
google-cloud-vision==3.7.2

# HTTP client
httpx==0.27.0

# Database (async PostgreSQL)
asyncpg==0.29.0
sqlalchemy[asyncio]==2.0.30

# Caching
redis==5.0.4
aioredis==2.0.1

# ML tools (for recommendation engine)
implicit==0.7.2               # ALS collaborative filtering
faiss-cpu==1.8.0              # FAISS ANN search

# Fraud detection
abuseipdb==1.0.0              # AbuseIPDB API client

# Monitoring
prometheus-fastapi-instrumentator==6.1.0

# Logging
structlog==24.1.0

# Testing
pytest==8.2.0
pytest-asyncio==0.23.6
httpx==0.27.0                 # Also used for test client
```

---

*End of 06_AI_ML_SPEC.md*
