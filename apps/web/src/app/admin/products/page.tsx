'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '../../../store/useAuthStore';
import { AlertTriangle, PackageX } from 'lucide-react';
import styles from '../kyc/admin-kyc.module.css'; // Reuse table styles

export default function AdminProductsPage() {
  const { accessToken } = useAuthStore();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/v1/admin/products', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (res.ok) {
        setProducts(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSuspend = async (productId: string) => {
    if (!confirm('Are you sure you want to suspend this product? It will be removed from the public shop.')) return;
    try {
      const res = await fetch(`http://localhost:3001/api/v1/admin/products/${productId}/suspend`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (res.ok) {
        fetchProducts();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div>Loading products...</div>;

  return (
    <div className={styles.container} style={{ padding: 0 }}>
      <header className={styles.header}>
        <h1 className={styles.title}><AlertTriangle size={32} /> Product Moderation</h1>
      </header>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Title</th>
              <th>Seller ID</th>
              <th>Status</th>
              <th>AI Trust Score</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id}>
                <td>{p.title}</td>
                <td style={{ fontSize: '0.8rem', color: '#888' }}>{p.producer_id}</td>
                <td>
                  <span style={{ 
                    padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem',
                    background: p.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    color: p.status === 'active' ? '#10b981' : '#ef4444'
                  }}>
                    {p.status}
                  </span>
                </td>
                <td>
                  <span style={{ color: p.trust_score < 70 ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>
                    {p.trust_score}%
                  </span>
                </td>
                <td>
                  {p.status === 'active' && (
                    <button 
                      onClick={() => handleSuspend(p.id)} 
                      className={`${styles.btn} ${styles.btnReject}`}
                      title="Suspend Product"
                    >
                      <PackageX size={16} /> Suspend
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
