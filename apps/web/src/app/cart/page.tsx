'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCartStore } from '../../store/useCartStore';
import { Minus, Plus, Trash2, ArrowRight, ShoppingBag } from 'lucide-react';
import styles from './cart.module.css';

export default function CartPage() {
  const { items, removeItem, updateQuantity, getTotal } = useCartStore();
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null; // Prevent hydration mismatch with persisted state

  const subtotal = getTotal();
  const tax = subtotal * 0.05; // 5% GST for Handloom typically
  const total = subtotal + tax;

  if (items.length === 0) {
    return (
      <div className={styles.emptyContainer}>
        <ShoppingBag size={64} className={styles.emptyIcon} />
        <h2 className="h2">Your cart is empty</h2>
        <p className="subtitle">Looks like you haven't added any authentic handloom products yet.</p>
        <Link href="/shop" className="btn btn-primary" style={{ marginTop: '2rem' }}>
          Explore Marketplace
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className="h2" style={{ marginBottom: '2rem' }}>Your Shopping Cart</h1>
      
      <div className={styles.grid}>
        <div className={styles.cartItems}>
          {items.map((item) => (
            <div key={item.id} className={styles.cartItem + " glass-panel"}>
              <div className={styles.itemImagePlaceholder}>
                {/* Placeholder for actual image */}
                <span className={styles.imageText}>IMG</span>
              </div>
              
              <div className={styles.itemDetails}>
                <div className={styles.itemHeader}>
                  <h3 className="h3">{item.title}</h3>
                  <button onClick={() => removeItem(item.id)} className={styles.removeBtn} aria-label="Remove item">
                    <Trash2 size={18} />
                  </button>
                </div>
                
                <p className={styles.producerName}>By {item.producer_name || 'Verified Weaver'}</p>
                <div className={styles.priceRow}>
                  <span className={styles.price}>₹{item.price.toLocaleString()}</span>
                  
                  <div className={styles.quantityControls}>
                    <button 
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                      className={styles.qtyBtn}
                    >
                      <Minus size={16} />
                    </button>
                    <span className={styles.qtyValue}>{item.quantity}</span>
                    <button 
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className={styles.qtyBtn}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.summarySidebar}>
          <div className={styles.summaryCard + " glass-panel"}>
            <h3 className="h3" style={{ marginBottom: '1.5rem' }}>Order Summary</h3>
            
            <div className={styles.summaryRow}>
              <span>Subtotal ({items.length} items)</span>
              <span>₹{subtotal.toLocaleString()}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Estimated Tax (5% GST)</span>
              <span>₹{tax.toLocaleString()}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Shipping</span>
              <span className={styles.freeShipping}>Free</span>
            </div>
            
            <div className={styles.divider}></div>
            
            <div className={styles.summaryRow + " " + styles.totalRow}>
              <span>Total</span>
              <span>₹{total.toLocaleString()}</span>
            </div>

            <button 
              onClick={() => router.push('/checkout')} 
              className="btn btn-primary" 
              style={{ width: '100%', marginTop: '2rem', justifyContent: 'center' }}
            >
              Proceed to Checkout <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
