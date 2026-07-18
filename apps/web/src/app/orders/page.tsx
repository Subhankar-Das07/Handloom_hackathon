'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/useAuthStore';
import { ArrowLeft, Loader2, Package, Calendar, Clock, CreditCard, ChevronRight } from 'lucide-react';
import styles from './orders.module.css';

export default function OrdersHistoryPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, accessToken, logout } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.push('/auth/login?redirect=/orders');
      return;
    }
    fetchOrders();
  }, [user, router]);

  const fetchOrders = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/v1/orders', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (res.status === 401) {
        logout();
        router.push('/auth/login');
        return;
      }

      if (!res.ok) {
        throw new Error('Failed to fetch orders');
      }

      const data = await res.json();
      setOrders(data);
    } catch (err) {
      console.error('Failed to fetch orders, using offline fallback', err);
      // Demo fallback orders
      setOrders([
        {
          id: 'demo-order-1',
          order_number: 'TNT-59281-9921',
          created_at: new Date().toISOString(),
          total_amount: 19425,
          status: 'payment_confirmed',
          shipping_address: 'Flat 402, Weaver Heights, Bhubaneswar, Odisha - 751001',
          payment_method: 'Razorpay (Mocked)',
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusClass = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending_payment': return styles.statusPending;
      case 'payment_confirmed': return styles.statusConfirmed;
      case 'processing': return styles.statusProcessing;
      case 'shipped': return styles.statusShipped;
      case 'delivered': return styles.statusDelivered;
      default: return styles.statusDefault;
    }
  };

  const getStatusText = (status: string) => {
    return status.replace(/_/g, ' ').toUpperCase();
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Loader2 className="spinner" size={40} />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href={user?.role === 'producer' ? '/dashboard' : '/shop'} className={styles.backBtn}>
          <ArrowLeft size={18} /> Back to {user?.role === 'producer' ? 'Dashboard' : 'Shop'}
        </Link>
        <h1 className="h2" style={{ marginTop: '1rem' }}>
          {user?.role === 'producer' ? 'Received Orders' : 'Order History'}
        </h1>
        <p className="subtitle">Track your shipments, transactions, and status updates.</p>
      </header>

      {orders.length === 0 ? (
        <div className={styles.emptyState + " glass-panel"}>
          <Package size={64} className={styles.emptyIcon} />
          <h3>No orders placed yet</h3>
          <p>Once you make a purchase, your order history will be shown here.</p>
          <Link href="/shop" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
            Go to Shop
          </Link>
        </div>
      ) : (
        <div className={styles.ordersList}>
          {orders.map((order) => (
            <div key={order.id} className={styles.orderCard + " glass-panel"}>
              <div className={styles.orderHeader}>
                <div className={styles.headerInfo}>
                  <span className={styles.orderNum}>Order #{order.order_number}</span>
                  <div className={styles.metaRow}>
                    <span className={styles.metaItem}>
                      <Calendar size={14} /> {new Date(order.created_at).toLocaleDateString()}
                    </span>
                    <span className={styles.metaItem}>
                      <Clock size={14} /> {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                <span className={`${styles.statusBadge} ${getStatusClass(order.status)}`}>
                  {getStatusText(order.status)}
                </span>
              </div>

              <div className={styles.orderBody}>
                <div className={styles.bodyCol}>
                  <h4 className={styles.colTitle}>Shipping Details</h4>
                  <p className={styles.colText}>{order.shipping_address}</p>
                </div>
                
                <div className={styles.bodyCol}>
                  <h4 className={styles.colTitle}>Payment</h4>
                  <div className={styles.paymentInfo}>
                    <CreditCard size={16} />
                    <span>{order.payment_method || 'Razorpay'}</span>
                  </div>
                  <span className={styles.amount}>₹{Number(order.total_amount).toLocaleString()}</span>
                </div>
              </div>

              <div className={styles.orderActions}>
                {user?.role === 'producer' && order.status === 'payment_confirmed' && (
                  <button 
                    className="btn btn-primary" 
                    style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                    onClick={async () => {
                      // Trigger mock shipping status update
                      await fetch(`http://localhost:3001/api/v1/orders/${order.id}/status`, {
                        method: 'PATCH',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${accessToken}`
                        },
                        body: JSON.stringify({ status: 'shipped' })
                      });
                      fetchOrders();
                    }}
                  >
                    Mark as Shipped
                  </button>
                )}
                
                <Link href={`/orders/${order.id}`} className={styles.detailsLink}>
                  View Details <ChevronRight size={16} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
