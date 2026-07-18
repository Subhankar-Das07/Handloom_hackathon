'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore } from '../../store/useAuthStore';
import { useCartStore } from '../../store/useCartStore';
import styles from './shop.module.css';
import { Search, Filter, ShoppingCart, User, Loader2, Star, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ShopPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user, logout } = useAuthStore();
  const { items, addItem } = useCartStore();
  const router = useRouter();

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/v1/products');
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          setProducts(data);
          setIsLoading(false);
          return;
        }
      }
    } catch (err) {
      console.error('Failed to fetch products, using offline demo fallback', err);
    }
    
    // Offline / Empty DB Fallback Data for Testing
    const demoProducts = [
      {
        id: 'demo-saree-1',
        title: 'Banarasi Katan Silk Handloom Saree',
        base_price: 18500,
        avg_rating: '4.9',
        producer: {
          business_name: 'Banaras Heritage Weavers'
        }
      },
      {
        id: 'demo-saree-2',
        title: 'Sambalpuri Double Ikat Silk Saree',
        base_price: 24000,
        avg_rating: '4.8',
        producer: {
          business_name: 'Odisha Handloom Co.'
        }
      },
      {
        id: 'demo-saree-3',
        title: 'Pochampally Silk Saree (Geometric Ikat)',
        base_price: 12500,
        avg_rating: '4.7',
        producer: {
          business_name: 'Pochampally Weaving Union'
        }
      }
    ];
    setProducts(demoProducts);
    setIsLoading(false);
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <div className={styles.container}>
      {/* Navbar */}
      <nav className={styles.navbar + " glass-panel"}>
        <Link href="/" className={styles.logo}>
          <span className={styles.logoIcon}>✦</span> Sutra
        </Link>
        
        <div className={styles.searchBar}>
          <Search size={18} className={styles.searchIcon} />
          <input type="text" placeholder="Search authentic handloom..." className={styles.searchInput} />
        </div>

        <div className={styles.navActions}>
          <button onClick={() => router.push('/cart')} className={styles.iconBtn}>
            <ShoppingCart size={20} />
            {items.length > 0 && <span className={styles.cartBadge}>{items.length}</span>}
          </button>
          
          {user ? (
            <div className={styles.userMenu}>
              <Link href="/orders" className={styles.logoutBtn} style={{ marginRight: '0.5rem' }}>
                My Orders
              </Link>
              <div className={styles.avatar}>
                {user.email.charAt(0).toUpperCase()}
              </div>
              <button onClick={handleLogout} className={styles.logoutBtn}>Logout</button>
            </div>
          ) : (
            <Link href="/auth/login" className="btn btn-primary" style={{ padding: '0.5rem 1.5rem' }}>
              Login
            </Link>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className={styles.main}>
        {/* Categories Banner */}
        <div className={styles.categoryBanner + " glass-panel"}>
          {['Kanchipuram Silk', 'Banarasi', 'Pochampally Ikat', 'Chanderi', 'Sambalpuri', 'Patola'].map((cat) => (
            <button key={cat} className={styles.categoryPill}>
              {cat}
            </button>
          ))}
          <button className={styles.categoryPill} style={{ background: 'var(--primary-500)', color: 'white' }}>
            <Filter size={16} /> Filters
          </button>
        </div>

        {/* Product Grid */}
        <div className={styles.productGrid}>
          {isLoading ? (
            <div className={styles.loadingContainer}>
              <Loader2 className="spinner" size={40} />
            </div>
          ) : products.length > 0 ? (
            products.map((product) => (
              <div key={product.id} className={styles.productCard + " glass-panel"}>
                <Link href={`/shop/products/${product.id}`} className={styles.imageLink}>
                  <div className={styles.imagePlaceholder}>
                    <div className={styles.badge}>
                      <ShieldCheck size={14} /> AI Verified
                    </div>
                  </div>
                </Link>
                
                <div className={styles.productInfo}>
                  <p className={styles.producerName}>
                    {product.producer?.business_name || 'Handloom Artisan'}
                  </p>
                  <Link href={`/shop/products/${product.id}`}>
                    <h3 className={styles.productTitle}>{product.title}</h3>
                  </Link>
                  
                  <div className={styles.priceRow}>
                    <span className={styles.price}>₹{product.base_price}</span>
                    <div className={styles.rating}>
                      <Star size={14} fill="var(--accent)" color="var(--accent)" />
                      <span>{product.avg_rating || '4.8'}</span>
                    </div>
                  </div>
                  
                  <button 
                    className="btn btn-secondary" 
                    style={{ width: '100%', marginTop: '1rem', padding: '0.5rem' }}
                    onClick={() => addItem({
                      id: product.id,
                      title: product.title,
                      price: product.base_price,
                      quantity: 1,
                      producer_name: product.producer?.business_name || 'Verified Weaver'
                    })}
                  >
                    Add to Cart
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className={styles.emptyState}>
              <h3>No products found</h3>
              <p>Check back later for new arrivals.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
