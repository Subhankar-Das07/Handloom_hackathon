'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '../../../store/useAuthStore';
import { useRouter } from 'next/navigation';
import { TrendingUp, Users, Package, DollarSign } from 'lucide-react';
import styles from './analytics.module.css';

const salesData = [
  { name: 'Mon', sales: 4000, views: 2400 },
  { name: 'Tue', sales: 3000, views: 1398 },
  { name: 'Wed', sales: 2000, views: 9800 },
  { name: 'Thu', sales: 2780, views: 3908 },
  { name: 'Fri', sales: 1890, views: 4800 },
  { name: 'Sat', sales: 2390, views: 3800 },
  { name: 'Sun', sales: 3490, views: 4300 },
];

const productPerformance = [
  { name: 'Silk Saree', sales: 400 },
  { name: 'Cotton Kurta', sales: 300 },
  { name: 'Handloom Scarf', sales: 200 },
  { name: 'Bamboo Basket', sales: 278 },
  { name: 'Tribal Necklace', sales: 189 },
];

export default function SellerAnalytics() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    if (!user || user.role !== 'producer') {
      router.push('/auth/login');
    }
  }, [user, router]);

  if (!isClient) return null;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className="h2">Business Analytics</h1>
        <p className="subtitle">Track your store's performance and escrow payouts.</p>
      </header>

      <div className={styles.statsGrid}>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div className={styles.statHeader}>
            <p className={styles.statLabel}>Total Revenue</p>
            <DollarSign size={20} className={styles.statIcon} style={{ color: '#10b981' }} />
          </div>
          <h2 className={styles.statValue}>₹1,24,500</h2>
          <p className={styles.statChange + " " + styles.positive}>+14.5% from last month</p>
        </div>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div className={styles.statHeader}>
            <p className={styles.statLabel}>Profile Views</p>
            <Users size={20} className={styles.statIcon} style={{ color: '#3b82f6' }} />
          </div>
          <h2 className={styles.statValue}>8,421</h2>
          <p className={styles.statChange + " " + styles.positive}>+5.2% from last month</p>
        </div>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div className={styles.statHeader}>
            <p className={styles.statLabel}>Orders</p>
            <Package size={20} className={styles.statIcon} style={{ color: '#8b5cf6' }} />
          </div>
          <h2 className={styles.statValue}>142</h2>
          <p className={styles.statChange + " " + styles.negative}>-2.4% from last month</p>
        </div>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div className={styles.statHeader}>
            <p className={styles.statLabel}>Conversion Rate</p>
            <TrendingUp size={20} className={styles.statIcon} style={{ color: '#f59e0b' }} />
          </div>
          <h2 className={styles.statValue}>2.4%</h2>
          <p className={styles.statChange + " " + styles.positive}>+0.8% from last month</p>
        </div>
      </div>

      <div className={styles.chartsGrid}>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 className="h3" style={{ marginBottom: '1.5rem' }}>Revenue vs Views (This Week)</h3>
          <div style={{ width: '100%', height: 300, display: 'flex', alignItems: 'flex-end', gap: '10px', paddingBottom: '20px', borderBottom: '1px solid #e0e0e0' }}>
            {salesData.map((d, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                <div style={{ display: 'flex', gap: '4px', width: '100%', alignItems: 'flex-end', justifyContent: 'center' }}>
                  <div style={{ width: '40%', height: `${(d.sales/4000)*100}%`, background: '#10b981', borderRadius: '4px 4px 0 0' }} title={`Sales: ₹${d.sales}`}></div>
                  <div style={{ width: '40%', height: `${(d.views/10000)*100}%`, background: '#3b82f6', borderRadius: '4px 4px 0 0' }} title={`Views: ${d.views}`}></div>
                </div>
                <span style={{ fontSize: '12px', marginTop: '8px', color: '#666' }}>{d.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 className="h3" style={{ marginBottom: '1.5rem' }}>Top Selling Products</h3>
          <div style={{ width: '100%', height: 300, display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
            {productPerformance.map((p, i) => (
              <div key={i} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                  <span>{p.name}</span>
                  <span>{p.sales} sold</span>
                </div>
                <div style={{ width: '100%', height: '12px', background: '#f3f4f6', borderRadius: '6px' }}>
                  <div style={{ width: `${(p.sales/400)*100}%`, height: '100%', background: '#8b5cf6', borderRadius: '6px' }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
