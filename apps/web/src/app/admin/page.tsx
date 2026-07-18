'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { Users, Package, ShoppingBag, ShieldAlert } from 'lucide-react';
import styles from './admin-dashboard.module.css';

export default function AdminDashboard() {
  const { accessToken } = useAuthStore();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/v1/admin/stats', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading dashboard...</div>;

  return (
    <div>
      <h1 style={{ marginBottom: '2rem', fontSize: '2rem' }}>Platform Overview</h1>
      
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
            <Users size={24} />
          </div>
          <div>
            <p className={styles.statLabel}>Total Users</p>
            <h2 className={styles.statValue}>{stats?.totalUsers || 0}</h2>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
            <Package size={24} />
          </div>
          <div>
            <p className={styles.statLabel}>Active Listings</p>
            <h2 className={styles.statValue}>{stats?.activeListings || 0}</h2>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
            <ShoppingBag size={24} />
          </div>
          <div>
            <p className={styles.statLabel}>Total Orders</p>
            <h2 className={styles.statValue}>{stats?.totalOrders || 0}</h2>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
            <ShieldAlert size={24} />
          </div>
          <div>
            <p className={styles.statLabel}>Pending KYC</p>
            <h2 className={styles.statValue}>{stats?.pendingKyc || 0}</h2>
          </div>
        </div>
      </div>
    </div>
  );
}
