'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '../../../store/useAuthStore';
import { useRouter } from 'next/navigation';
import { ShieldAlert, CheckCircle, RefreshCcw, DollarSign } from 'lucide-react';
import styles from '../kyc/admin-kyc.module.css';

interface EscrowRecord {
  id: string;
  order_id: string;
  order: any;
  producer_id: string;
  producer: any;
  amount: number;
  status: string;
  created_at: string;
  release_notes: string;
}

export default function AdminEscrowManagement() {
  const [escrows, setEscrows] = useState<EscrowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, accessToken } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      router.push('/');
      return;
    }
    fetchEscrows();
  }, [user, router]);

  const fetchEscrows = async () => {
    try {
      // We will mock this fetch for now, since we haven't built the GET /admin/escrows endpoint yet
      // In a real scenario, this would fetch from the backend.
      setEscrows([
        {
          id: 'esc-1234',
          order_id: 'ord-9999',
          order: { order_number: 'ORD-9999', status: 'delivered' },
          producer_id: 'prod-1111',
          producer: { store_name: 'Odisha Handlooms' },
          amount: 15000,
          status: 'HELD',
          created_at: new Date().toISOString(),
          release_notes: ''
        },
        {
          id: 'esc-5678',
          order_id: 'ord-8888',
          order: { order_number: 'ORD-8888', status: 'processing' },
          producer_id: 'prod-2222',
          producer: { store_name: 'Bengal Weaves' },
          amount: 45000,
          status: 'HELD',
          created_at: new Date(Date.now() - 86400000).toISOString(),
          release_notes: ''
        }
      ]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (id: string, action: 'release' | 'refund') => {
    if (!confirm(`Are you sure you want to manually ${action} this escrow?`)) return;
    
    // Mocking the manual resolution
    alert(`Escrow manually marked as ${action === 'release' ? 'RELEASED' : 'REFUNDED'}`);
    fetchEscrows();
  };

  if (loading) return <div className={styles.loading}>Loading Escrow Records...</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className="h2">B2B Escrow Management</h1>
          <p className="subtitle">Monitor held funds, handle disputes, and manage GRN payouts.</p>
        </div>
        <div className={styles.headerStats}>
          <div className={styles.statBadge}>
            <DollarSign size={16} /> Total Held: ₹60,000
          </div>
          <div className={styles.statBadge} style={{ background: '#fef3c7', color: '#d97706' }}>
            <ShieldAlert size={16} /> 0 Disputes
          </div>
        </div>
      </header>

      <div className={styles.queueContainer}>
        {escrows.length === 0 ? (
          <div className={styles.emptyState}>No active escrow holds found.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Escrow ID</th>
                <th>Order Ref</th>
                <th>Seller</th>
                <th>Amount</th>
                <th>Order Status</th>
                <th>Escrow Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {escrows.map((record) => (
                <tr key={record.id}>
                  <td style={{ fontFamily: 'monospace' }}>{record.id.split('-')[1]}</td>
                  <td>{record.order.order_number}</td>
                  <td>{record.producer.store_name}</td>
                  <td style={{ fontWeight: 'bold' }}>₹{record.amount.toLocaleString()}</td>
                  <td>
                    <span className={styles.badge} data-status={record.order.status}>
                      {record.order.status}
                    </span>
                  </td>
                  <td>
                    <span className={styles.badge} data-status={record.status.toLowerCase()}>
                      {record.status}
                    </span>
                  </td>
                  <td className={styles.actionCell}>
                    <button 
                      onClick={() => handleResolve(record.id, 'release')}
                      className={styles.approveBtn}
                      title="Force Release to Seller"
                    >
                      <CheckCircle size={18} />
                    </button>
                    <button 
                      onClick={() => handleResolve(record.id, 'refund')}
                      className={styles.rejectBtn}
                      title="Refund to Buyer (Dispute)"
                    >
                      <RefreshCcw size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
