'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/useAuthStore';
import styles from './dashboard.module.css';
import { Plus, Package, ShoppingBag, TrendingUp, Settings, LogOut, Loader2, ShieldCheck, Image } from 'lucide-react';

export default function ProducerDashboard() {
  const [products, setProducts] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalSales: 0, activeOrders: 0, awaitingShipment: 0 });
  const [kycStatus, setKycStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { user, accessToken, logout } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.push('/auth/login');
      return;
    }
    if (user.role !== 'producer') {
      router.push('/shop');
      return;
    }
    fetchMyProducts();
  }, [user, router]);

  const fetchMyProducts = async () => {
    try {
      const [prodRes, orderRes, kycRes] = await Promise.all([
        fetch('http://localhost:3001/api/v1/products/producer', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }),
        fetch('http://localhost:3001/api/v1/orders', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }),
        fetch('http://localhost:3001/api/v1/producers/kyc/status', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
      ]);

      if (prodRes.ok) {
        setProducts(await prodRes.json());
      }
      
      if (kycRes.ok) {
        setKycStatus(await kycRes.json());
      }

      if (orderRes.ok) {
        const ordersData = await orderRes.json();
        let totalSales = 0;
        let activeOrders = 0;
        let awaitingShipment = 0;
        
        ordersData.forEach((order: any) => {
          if (!['cancelled', 'returned'].includes(order.status)) {
            totalSales += Number(order.total_amount || 0);
          }
          if (['payment_confirmed', 'processing', 'shipped', 'out_for_delivery'].includes(order.status)) {
            activeOrders++;
          }
          if (order.status === 'payment_confirmed') {
            awaitingShipment++;
          }
        });
        setStats({ totalSales, activeOrders, awaitingShipment });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  if (!user || user.role !== 'producer') return null;

  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <aside className={styles.sidebar + " glass-panel"}>
        <div className={styles.sidebarHeader}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>✦</span> Sutra
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
            <span className={styles.badge}>Weaver Portal</span>
            {kycStatus?.is_verified && (
              <span className={styles.badge} style={{ background: 'rgba(22,163,74,0.1)', color: '#4ade80', borderColor: 'rgba(22,163,74,0.3)' }}>
                <ShieldCheck size={14} style={{ display: 'inline', marginRight: '4px' }} />
                Verified Artisan
              </span>
            )}
          </div>
        </div>

        <nav className={styles.navLinks}>
          <a href="#" className={`${styles.navItem} ${styles.active}`}>
            <Package size={20} /> My Products
          </a>
          <Link href="/dashboard/orders" className={styles.navItem}>
            <ShoppingBag size={20} /> Orders <span className={styles.notificationCount}>1</span>
          </Link>
          <Link href="/dashboard/kyc" className={styles.navItem}>
            <ShieldCheck size={20} /> Identity Verification
          </Link>
          <a href="#" className={styles.navItem}>
            <TrendingUp size={20} /> Analytics
          </a>
          <a href="#" className={styles.navItem}>
            <Settings size={20} /> Settings
          </a>
        </nav>

        <button onClick={handleLogout} className={styles.logoutBtn}>
          <LogOut size={20} /> Logout
        </button>
      </aside>

      {/* Main Content */}
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <h1 className="h2">Dashboard</h1>
            <p className="subtitle">Welcome back, Weaver</p>
          </div>
          <Link href="/dashboard/products/new" className="btn btn-primary">
            <Plus size={20} /> Add New Product
          </Link>
        </header>

        {/* Stats Row */}
        <div className={styles.statsGrid}>
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <p className={styles.statLabel}>Total Sales</p>
            <h2 className={styles.statValue}>₹{stats.totalSales.toLocaleString()}</h2>
            <p className={styles.statChange + " " + styles.positive}>Actual recorded sales</p>
          </div>
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <p className={styles.statLabel}>Active Orders</p>
            <h2 className={styles.statValue}>{stats.activeOrders}</h2>
            <p className={styles.statChange + (stats.awaitingShipment > 0 ? (" " + styles.positive) : "")}>
              {stats.awaitingShipment} awaiting shipment
            </p>
          </div>
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <p className={styles.statLabel}>Total Products</p>
            <h2 className={styles.statValue}>{products.length}</h2>
            <p className={styles.statChange}>Active listings on platform</p>
          </div>
        </div>

        {/* Products Table */}
        <div className={styles.tableContainer + " glass-panel"}>
          <h3 className="h3" style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
            Your Listings
          </h3>
          <div className={styles.actionGrid}>
            <Link href="/dashboard/products/new" className={styles.actionCard}>
              <div className={styles.actionIcon} style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                <Package size={24} />
              </div>
              <h4>Add New Product</h4>
              <p>List a new handloom item for sale</p>
            </Link>

            <Link href="/dashboard/studio" className={styles.actionCard}>
              <div className={styles.actionIcon} style={{ background: 'rgba(139,92,246,0.1)', color: '#8b5cf6' }}>
                <Image size={24} />
              </div>
              <h4>Content Studio</h4>
              <p>Upload a Reel or Post to the Social Feed</p>
            </Link>
          </div>
          {isLoading ? (
            <div className={styles.loadingContainer}>
              <Loader2 className="spinner" size={40} />
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Price</th>
                  <th>AI Trust Score</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>{p.title}</td>
                    <td>{p.sku}</td>
                    <td>₹{p.base_price}</td>
                    <td>
                      {p.ai_verification_badge ? (
                        <span style={{ color: '#16a34a', fontWeight: 'bold' }}>✓ {p.trust_score}%</span>
                      ) : (
                        <span style={{ color: '#64748b' }}>Pending</span>
                      )}
                    </td>
                    <td>
                      <span className={styles.statusBadge + " " + styles[p.status.toLowerCase()]}>
                        {p.status}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '3rem' }}>
                      No products yet. Click "Add New Product" to start selling.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
