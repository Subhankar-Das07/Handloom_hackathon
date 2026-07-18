'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../../store/useAuthStore';
import styles from './orders.module.css';

interface OrderItem {
  id: string;
  product_title: string;
  sku: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Order {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  total_amount: number;
  shipping_address: any;
  tracking_number?: string;
}

export default function ProducerOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, accessToken } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!user || user.role !== 'producer') {
      router.push('/auth/login?redirect=/dashboard/orders');
      return;
    }
    fetchOrders();
  }, [user, router]);

  const fetchOrders = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/v1/orders', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch (err) {
      console.error('Failed to load orders', err);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (orderId: string, newStatus: string) => {
    try {
      const res = await fetch(`http://localhost:3001/api/v1/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchOrders(); // Refresh the list
      }
    } catch (err) {
      console.error('Failed to update status', err);
    }
  };

  const generateShippingLabel = async (orderId: string) => {
    try {
      setLoading(true);
      const res = await fetch(`http://localhost:3001/api/v1/logistics/ship/${orderId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
      });
      if (res.ok) {
        fetchOrders(); // Refresh the list
      } else {
        alert('Failed to generate shipping label');
        setLoading(false);
      }
    } catch (err) {
      console.error('Failed to generate shipping label', err);
      setLoading(false);
    }
  };

  if (loading) return <div className={styles.loading}>Loading orders...</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Manage Incoming Orders</h1>
        <p>Review orders from buyers, pack them, and mark them as shipped.</p>
      </header>

      {orders.length === 0 ? (
        <div className={styles.emptyState}>
          <p>You have no active orders yet.</p>
        </div>
      ) : (
        <div className={styles.ordersList}>
          {orders.map((order) => (
            <div key={order.id} className={styles.orderCard}>
              <div className={styles.orderHeader}>
                <div>
                  <h3>Order #{order.order_number}</h3>
                  <span className={styles.date}>{new Date(order.created_at).toLocaleDateString()}</span>
                </div>
                <div className={styles.statusBadge} data-status={order.status}>
                  {order.status.replace(/_/g, ' ')}
                </div>
              </div>

              <div className={styles.orderDetails}>
                <div className={styles.infoGroup}>
                  <strong>Total Value</strong>
                  <p>₹{order.total_amount.toLocaleString()}</p>
                </div>
                
                <div className={styles.infoGroup}>
                  <strong>Delivery Details</strong>
                  <p className={styles.address}>
                    {order.shipping_address?.fullName}<br/>
                    {order.shipping_address?.addressLine1}<br/>
                    {order.shipping_address?.city}, {order.shipping_address?.state} - {order.shipping_address?.pincode}
                  </p>
                </div>
                {order.tracking_number && (
                  <div className={styles.infoGroup}>
                    <strong>Tracking (Shiprocket)</strong>
                    <p style={{fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 'bold'}}>
                      {order.tracking_number}
                    </p>
                  </div>
                )}
              </div>

              <div className={styles.actions}>
                {order.status === 'payment_confirmed' && (
                  <button onClick={() => generateShippingLabel(order.id)} className={styles.shipBtn}>
                    Generate Shipping Label
                  </button>
                )}
                {order.status === 'shipped' && (
                  <button onClick={() => updateStatus(order.id, 'delivered')} className={styles.deliverBtn}>
                    Mark as Delivered
                  </button>
                )}
                <button onClick={() => router.push(`/orders/${order.id}`)} className={styles.viewBtn}>
                  View Full Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
