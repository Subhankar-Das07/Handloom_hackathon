'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCartStore } from '../../store/useCartStore';
import { useAuthStore } from '../../store/useAuthStore';
import { ShieldCheck, Loader2, CheckCircle } from 'lucide-react';
import styles from './checkout.module.css';

export default function CheckoutPage() {
  const { items, getTotal, clearCart } = useCartStore();
  const { user, accessToken, logout } = useAuthStore();
  const router = useRouter();
  
  const [mounted, setMounted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [address, setAddress] = useState({
    street: '',
    city: '',
    state: '',
    pincode: '',
  });

  useEffect(() => {
    setMounted(true);
    if (!user) {
      router.push('/auth/login?redirect=/checkout');
    }
  }, [user, router]);

  if (!mounted || !user) return null;

  if (items.length === 0 && !isSuccess) {
    router.push('/cart');
    return null;
  }

  const subtotal = getTotal();
  const tax = subtotal * 0.05;
  const total = subtotal + tax;

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    try {
      // 1. Send Order to backend to create 'PENDING_PAYMENT' order
      const orderPayload = {
        items: items.map(i => ({ product_id: i.id, quantity: i.quantity, price_at_purchase: i.price })),
        shipping_address: `${address.street}, ${address.city}, ${address.state} - ${address.pincode}`,
        total_amount: total
      };

      const res = await fetch('http://localhost:3001/api/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(orderPayload)
      });

      if (res.status === 401) {
        logout();
        router.push('/auth/login');
        return;
      }

      if (!res.ok) {
        throw new Error('Order creation failed');
      }

      // 2. We mock the Razorpay flow success
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate payment delay

      setIsSuccess(true);
      clearCart();
      
      setTimeout(() => {
        router.push('/dashboard'); // or /orders
      }, 3000);

    } catch (err) {
      console.error(err);
      alert('Payment failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isSuccess) {
    return (
      <div className={styles.successContainer + " animate-fade-in"}>
        <CheckCircle size={80} className={styles.successIcon} />
        <h1 className="h1">Payment Successful!</h1>
        <p className="subtitle">Your order has been placed directly with the artisans. You will receive an email confirmation shortly.</p>
        <p className={styles.redirectText}>Redirecting to dashboard...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className="h2">Secure Checkout</h1>
        <div className={styles.secureBadge}>
          <ShieldCheck size={18} />
          <span>256-bit Encrypted</span>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.formSection}>
          <form id="checkout-form" onSubmit={handlePayment} className={styles.form + " glass-panel"}>
            <h3 className="h3" style={{ marginBottom: '1.5rem' }}>Shipping Address</h3>
            
            <div className={styles.inputGroup}>
              <label>Street Address</label>
              <input 
                required 
                className={styles.input} 
                value={address.street} 
                onChange={(e) => setAddress({...address, street: e.target.value})} 
                placeholder="123 Weavers Lane" 
              />
            </div>

            <div className={styles.grid2}>
              <div className={styles.inputGroup}>
                <label>City</label>
                <input 
                  required 
                  className={styles.input} 
                  value={address.city} 
                  onChange={(e) => setAddress({...address, city: e.target.value})} 
                />
              </div>
              <div className={styles.inputGroup}>
                <label>State</label>
                <input 
                  required 
                  className={styles.input} 
                  value={address.state} 
                  onChange={(e) => setAddress({...address, state: e.target.value})} 
                />
              </div>
            </div>

            <div className={styles.inputGroup} style={{ width: '50%' }}>
              <label>Pincode</label>
              <input 
                required 
                className={styles.input} 
                value={address.pincode} 
                onChange={(e) => setAddress({...address, pincode: e.target.value})} 
              />
            </div>
            
            <div className={styles.divider}></div>
            
            <h3 className="h3" style={{ marginBottom: '1.5rem' }}>Payment Method</h3>
            <div className={styles.paymentMock}>
              <p>For this prototype, Razorpay integration is mocked. Clicking Pay will simulate a successful transaction.</p>
            </div>

          </form>
        </div>

        <div className={styles.summarySidebar}>
          <div className={styles.summaryCard + " glass-panel"}>
            <h3 className="h3" style={{ marginBottom: '1.5rem' }}>Order Summary</h3>
            
            <div className={styles.itemList}>
              {items.map(item => (
                <div key={item.id} className={styles.miniItem}>
                  <div className={styles.miniItemInfo}>
                    <span className={styles.miniItemTitle}>{item.title}</span>
                    <span className={styles.miniItemQty}>Qty: {item.quantity}</span>
                  </div>
                  <span className={styles.miniItemPrice}>₹{(item.price * item.quantity).toLocaleString()}</span>
                </div>
              ))}
            </div>
            
            <div className={styles.divider}></div>

            <div className={styles.summaryRow}>
              <span>Subtotal</span>
              <span>₹{subtotal.toLocaleString()}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Tax (5% GST)</span>
              <span>₹{tax.toLocaleString()}</span>
            </div>
            <div className={styles.summaryRow + " " + styles.totalRow}>
              <span>Total</span>
              <span>₹{total.toLocaleString()}</span>
            </div>

            <button 
              form="checkout-form"
              type="submit"
              className="btn btn-primary" 
              style={{ width: '100%', marginTop: '2rem', justifyContent: 'center' }}
              disabled={isProcessing}
            >
              {isProcessing ? <Loader2 className="spinner" /> : `Pay ₹${total.toLocaleString()}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
