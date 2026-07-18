'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../../../store/useAuthStore';
import { useCartStore } from '../../../../store/useCartStore';
import { ArrowLeft, ShoppingCart, Star, ShieldCheck, Truck, RefreshCw, Award, Loader2, MessageSquare, Briefcase } from 'lucide-react';
import styles from './product-detail.module.css';

interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ProductDetailPage({ params }: ProductDetailPageProps) {
  const resolvedParams = use(params);
  const productId = resolvedParams.id;
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const { addItem } = useCartStore();
  const router = useRouter();

  useEffect(() => {
    fetchProductDetails();
  }, [productId]);

  const fetchProductDetails = async () => {
    try {
      const res = await fetch(`http://localhost:3001/api/v1/products/${productId}`);
      if (res.ok) {
        const data = await res.json();
        setProduct(data);
      } else {
        throw new Error('Product not found');
      }
    } catch (err) {
      console.error('Failed to fetch product details, using fallback', err);
      // Fallback for mock items
      const demoProducts: Record<string, any> = {
        'demo-saree-1': {
          id: 'demo-saree-1',
          title: 'Banarasi Katan Silk Handloom Saree',
          description: 'A masterpiece woven by master artisans. Made from 100% pure Katan silk with intricate pure zari work. It takes over 15 days of intensive handloom work to finish this single piece. Certified authentic by the Handloom Board.',
          base_price: 18500,
          mrp: 22000,
          sku: 'BAN-KAT-001',
          hsn_code: '5007',
          avg_rating: '4.9',
          producer: {
            business_name: 'Banaras Heritage Weavers',
            ai_trust_score: 95,
            state: 'Uttar Pradesh',
            district: 'Varanasi',
            craft_type: 'Katan Silk Weaving'
          }
        },
        'demo-saree-2': {
          id: 'demo-saree-2',
          title: 'Sambalpuri Double Ikat Silk Saree',
          description: 'Authentic hand-woven Sambalpuri Double Ikat saree in mulberry silk. Featuring traditional bandha motifs on the body and an elaborate pallu. Woven by National Award-winning weavers in Barpali, Odisha.',
          base_price: 24000,
          mrp: 28000,
          sku: 'SAM-IKAT-002',
          hsn_code: '5007',
          avg_rating: '4.8',
          producer: {
            business_name: 'Odisha Handloom Co.',
            ai_trust_score: 98,
            state: 'Odisha',
            district: 'Bargarh',
            craft_type: 'Double Ikat Bandha'
          }
        },
        'demo-saree-3': {
          id: 'demo-saree-3',
          title: 'Pochampally Silk Saree (Geometric Ikat)',
          description: 'Beautifully crafted pure silk saree from Pochampally, Telangana. Features clean geometric patterns created using the traditional tie-and-dye Ikat method. Lightweight and extremely comfortable for all occasions.',
          base_price: 12500,
          mrp: 15000,
          sku: 'POC-IKAT-003',
          hsn_code: '5007',
          avg_rating: '4.7',
          producer: {
            business_name: 'Pochampally Weaving Union',
            ai_trust_score: 92,
            state: 'Telangana',
            district: 'Yadadri Bhuvanagiri',
            craft_type: 'Single Ikat'
          }
        }
      };

      setProduct(demoProducts[productId] || demoProducts['demo-saree-1']);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = () => {
    addItem({
      id: product.id,
      title: product.title,
      price: product.base_price,
      quantity: quantity,
      producer_name: product.producer?.business_name || 'Verified Weaver'
    });
    router.push('/cart');
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Loader2 className="spinner" size={40} />
      </div>
    );
  }

  if (!product) {
    return (
      <div className={styles.container}>
        <h2 className="h2">Product not found</h2>
        <Link href="/shop" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
          Back to Shop
        </Link>
      </div>
    );
  }

  const discount = Math.round(((product.mrp - product.base_price) / product.mrp) * 100);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href="/shop" className={styles.backBtn}>
          <ArrowLeft size={18} /> Back to Shop
        </Link>
      </header>

      <div className={styles.grid}>
        {/* Left Col: Media Gallery */}
        <div className={styles.galleryCol}>
          <div className={styles.imageViewer + " glass-panel"}>
            <div className={styles.badge}>
              <ShieldCheck size={16} /> AI Verified Authentic
            </div>
            <span className={styles.imagePlaceholderText}>Authentic Handloom Weave Image</span>
          </div>
        </div>

        {/* Right Col: Purchase Details */}
        <div className={styles.detailsCol}>
          <div className={styles.producerCard + " glass-panel"}>
            <div className={styles.producerInfo}>
              <span className={styles.producerLabel}>Artisan Collective</span>
              <h4 className={styles.producerName}>{product.producer?.business_name || 'Handloom Artisan'}</h4>
              <span className={styles.originText}>{product.producer?.district}, {product.producer?.state}</span>
            </div>
            <div className={styles.trustScoreCol}>
              <span className={styles.trustLabel}>AI Trust Score</span>
              <span className={styles.trustValue}>{product.producer?.ai_trust_score || 94}%</span>
            </div>
          </div>

          <h1 className="h1" style={{ fontSize: '2rem', marginTop: '1.5rem', marginBottom: '0.5rem' }}>
            {product.title}
          </h1>

          <div className={styles.metaRow}>
            <div className={styles.rating}>
              <Star size={16} fill="var(--accent)" color="var(--accent)" />
              <span>{product.avg_rating || '4.8'} (42 reviews)</span>
            </div>
            <span className={styles.skuText}>SKU: {product.sku}</span>
          </div>

          <div className={styles.priceContainer}>
            <div className={styles.priceRow}>
              <span className={styles.price}>₹{product.base_price.toLocaleString()}</span>
              {product.mrp > product.base_price && (
                <>
                  <span className={styles.mrp}>MRP ₹{product.mrp.toLocaleString()}</span>
                  <span className={styles.discountBadge}>{discount}% OFF</span>
                </>
              )}
            </div>
            <p className={styles.taxLabel}>Inclusive of all taxes (GST 5% included)</p>
          </div>

          <p className={styles.description}>{product.description}</p>

          <div className={styles.purchaseForm}>
            <div className={styles.qtyContainer}>
              <label className={styles.qtyLabel}>Quantity</label>
              <select 
                value={quantity} 
                onChange={(e) => setQuantity(Number(e.target.value))} 
                className={styles.qtySelect}
              >
                {[1, 2, 3, 4, 5].map(q => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
            </div>

            <button onClick={handleAddToCart} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
              <ShoppingCart size={20} /> Add to Cart
            </button>
          </div>

          <div style={{ marginTop: '1rem', width: '100%' }}>
            <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1' }} onClick={() => alert('RFQ Flow: Requesting bulk quote...')}>
              <Briefcase size={20} /> Request Bulk Quote (B2B)
            </button>
          </div>

          <div className={styles.divider}></div>

          {/* Delivery & Guarantees */}
          <div className={styles.guaranteesGrid}>
            <div className={styles.guaranteeItem}>
              <Award size={20} className={styles.guaranteeIcon} />
              <div>
                <h5>GI Tagged Handloom</h5>
                <p>100% genuine registered craft origin product.</p>
              </div>
            </div>
            <div className={styles.guaranteeItem}>
              <Truck size={20} className={styles.guaranteeIcon} />
              <div>
                <h5>Free Secure Delivery</h5>
                <p>Delivered via Shiprocket in 3-5 business days.</p>
              </div>
            </div>
            <div className={styles.guaranteeItem}>
              <RefreshCw size={20} className={styles.guaranteeIcon} />
              <div>
                <h5>Easy Returns</h5>
                <p>7-day hassle free return policy direct with weaver.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reviews Section */}
      <div className="glass-panel" style={{ marginTop: '3rem', padding: '2rem' }}>
        <h3 className="h3" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MessageSquare size={24} color="var(--primary)" /> Verified Buyer Reviews
        </h3>
        
        <div style={{ padding: '1.5rem', background: '#f8fafc', borderRadius: '8px', marginBottom: '2rem', border: '1px solid #e2e8f0' }}>
          <h4 style={{ marginBottom: '0.5rem' }}>Have you purchased this product?</h4>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
            To maintain trust and authenticity, only users who have a confirmed 'DELIVERED' order for this exact item can leave a review.
          </p>
          <button className="btn btn-primary" onClick={() => alert('Backend strictly validates purchase history before allowing review submission.')}>
            Write a Review
          </button>
        </div>

        <div className={styles.reviewList}>
          {/* Mock Review */}
          <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>A</div>
                <strong>Ananya Sharma</strong>
                <span className={styles.badge} style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: '#ecfdf5', color: '#10b981', border: '1px solid #a7f3d0' }}>✓ Verified Purchase</span>
              </div>
              <div style={{ color: 'var(--accent)', display: 'flex' }}>
                <Star size={16} fill="var(--accent)" />
                <Star size={16} fill="var(--accent)" />
                <Star size={16} fill="var(--accent)" />
                <Star size={16} fill="var(--accent)" />
                <Star size={16} fill="var(--accent)" />
              </div>
            </div>
            <h5 style={{ margin: '0.5rem 0' }}>Exquisite craftsmanship!</h5>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              The weave is so intricate and beautiful. It looks exactly like the photo, and knowing I bought it directly from the weaver makes it even more special. The GI tag certificate was included in the package.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
