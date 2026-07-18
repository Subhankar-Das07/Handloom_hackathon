'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuthStore } from '../../../../store/useAuthStore';
import styles from './new-product.module.css';
import { ArrowLeft, Loader2, UploadCloud, CheckCircle } from 'lucide-react';

const productSchema = z.object({
  title: z.string().min(10, 'Title must be at least 10 characters'),
  description: z.string().min(50, 'Description must be at least 50 characters'),
  category_id: z.string().min(1, 'Category is required'),
  sku: z.string().min(3, 'SKU is required'),
  base_price: z.coerce.number().min(1, 'Base price must be greater than 0'),
  mrp: z.coerce.number().min(1, 'MRP must be greater than 0'),
  hsn_code: z.string().min(4, 'HSN Code required for GST'),
});

type ProductFormValues = z.infer<typeof productSchema>;

export default function NewProductPage() {
  const [step, setStep] = useState(1);
  const [images, setImages] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  const router = useRouter();
  const { user, accessToken } = useAuthStore();

  const { register, handleSubmit, formState: { errors, isValid }, trigger } = useForm<ProductFormValues>({
    // @ts-ignore - Zod coercion type mismatch with react-hook-form
    resolver: zodResolver(productSchema),
    mode: 'onChange',
    defaultValues: {
      category_id: '123e4567-e89b-12d3-a456-426614174000', // Mock UUID for now
    }
  });

  const nextStep = async () => {
    // Validate step 1 fields before proceeding
    const fieldsToValidate: (keyof ProductFormValues)[] = ['title', 'description', 'category_id', 'sku', 'base_price', 'mrp', 'hsn_code'];
    const isStepValid = await trigger(fieldsToValidate);
    
    if (isStepValid) {
      setStep(2);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setImages(Array.from(e.target.files));
    }
  };

  const onSubmit = async (data: ProductFormValues) => {
    if (images.length === 0) {
      setError('Please upload at least 1 product image for AI Verification.');
      return;
    }
    
    setIsSubmitting(true);
    setError('');

    try {
      // 1. Send image to AI Verification Engine
      const formData = new FormData();
      formData.append('file', images[0]);

      const aiRes = await fetch('http://localhost:8000/verify-image', {
        method: 'POST',
        body: formData,
      });
      
      let aiTrustScore = 0;
      let hasAiBadge = false;

      if (aiRes.ok) {
        const aiResult = await aiRes.json();
        aiTrustScore = Math.round(aiResult.confidence_score * 100);
        hasAiBadge = aiResult.is_handloom;
      }

      // 2. Upload to S3/MinIO
      const presignRes = await fetch('http://localhost:3001/api/v1/storage/presigned-url', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contentType: images[0].type,
          prefix: 'products'
        })
      });

      if (!presignRes.ok) throw new Error("Failed to get upload URL");
      const { uploadUrl, fileUrl } = await presignRes.json();

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': images[0].type
        },
        body: images[0]
      });

      if (!uploadRes.ok) throw new Error("Failed to upload image to storage");

      // 3. Create product in NestJS Backend
      const res = await fetch('http://localhost:3001/api/v1/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          ...data,
          slug: data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).substring(2, 6),
          trust_score: aiTrustScore,
          ai_verification_badge: hasAiBadge,
          images: [fileUrl]
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to create product. Please ensure your SKU is unique.');
      }

      setStep(3); // Success step
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Link href="/dashboard" className={styles.backBtn}>
          <ArrowLeft size={20} /> Back to Dashboard
        </Link>
        <h1 className="h2">Add New Product</h1>
        <div className={styles.stepper}>
          <div className={`${styles.step} ${step >= 1 ? styles.activeStep : ''}`}>1. Details</div>
          <div className={styles.stepDivider}></div>
          <div className={`${styles.step} ${step >= 2 ? styles.activeStep : ''}`}>2. Media</div>
          <div className={styles.stepDivider}></div>
          <div className={`${styles.step} ${step >= 3 ? styles.activeStep : ''}`}>3. AI Verify</div>
        </div>
      </div>

      <div className={styles.formCard + " glass-panel"}>
        {error && <div className={styles.errorAlert}>{error}</div>}

        <form onSubmit={handleSubmit(onSubmit)}>
          {step === 1 && (
            <div className={styles.formSection + " animate-fade-in"}>
              <h3 className="h3" style={{ marginBottom: '1.5rem' }}>Basic Information</h3>
              
              <div className={styles.grid2}>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Product Title</label>
                  <input {...register('title')} className={styles.input} placeholder="e.g. Kanchipuram Silk Pure Zari" />
                  {errors.title && <span className={styles.errorText}>{errors.title.message}</span>}
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.label}>SKU (Stock Keeping Unit)</label>
                  <input {...register('sku')} className={styles.input} placeholder="e.g. KAN-SILK-001" />
                  {errors.sku && <span className={styles.errorText}>{errors.sku.message}</span>}
                </div>
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.label}>Description</label>
                <textarea {...register('description')} className={styles.textarea} placeholder="Describe the weave, material, and origin..." rows={4} />
                {errors.description && <span className={styles.errorText}>{errors.description.message}</span>}
              </div>

              <div className={styles.grid3}>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Base Price (₹)</label>
                  <input type="number" {...register('base_price')} className={styles.input} />
                  {errors.base_price && <span className={styles.errorText}>{errors.base_price.message}</span>}
                </div>
                
                <div className={styles.inputGroup}>
                  <label className={styles.label}>MRP (₹)</label>
                  <input type="number" {...register('mrp')} className={styles.input} />
                  {errors.mrp && <span className={styles.errorText}>{errors.mrp.message}</span>}
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.label}>HSN Code</label>
                  <input {...register('hsn_code')} className={styles.input} placeholder="e.g. 5007" />
                  {errors.hsn_code && <span className={styles.errorText}>{errors.hsn_code.message}</span>}
                </div>
              </div>

              <div className={styles.formActions}>
                <button type="button" onClick={nextStep} className="btn btn-primary" disabled={!isValid}>
                  Continue to Media
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className={styles.formSection + " animate-fade-in"}>
              <h3 className="h3" style={{ marginBottom: '1.5rem' }}>Images & Verification</h3>
              <p className="subtitle" style={{ marginBottom: '2rem' }}>
                Upload clear images of your product and your loom workspace. Our AI will automatically verify authenticity.
              </p>
              
              <div className={styles.uploadArea}>
                <input 
                  type="file" 
                  multiple 
                  accept="image/jpeg, image/png, image/webp" 
                  onChange={handleImageChange}
                  className={styles.fileInput}
                  id="file-upload"
                />
                <label htmlFor="file-upload" className={styles.uploadLabel}>
                  <UploadCloud size={48} className={styles.uploadIcon} />
                  <h4>Click to upload images</h4>
                  <p>Min 3 images required for AI Verification (Max 10MB each)</p>
                </label>
              </div>

              {images.length > 0 && (
                <div className={styles.imagePreviewGrid}>
                  {images.map((img, i) => (
                    <div key={i} className={styles.imagePreview}>
                      <span className={styles.imageName}>{img.name}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.formActions} style={{ justifyContent: 'space-between' }}>
                <button type="button" onClick={() => setStep(1)} className="btn btn-secondary">
                  Back
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="spinner" /> : 'Submit for Verification'}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className={styles.successSection + " animate-fade-in"}>
              <CheckCircle size={64} className={styles.successIcon} />
              <h2 className="h2">Product Submitted!</h2>
              <p className="subtitle">
                Your product has been queued for AI Authenticity Verification. 
                You will be redirected to your dashboard momentarily.
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
