'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../../store/useAuthStore';
import { ShieldAlert, CheckCircle, XCircle, Eye } from 'lucide-react';
import styles from './admin-kyc.module.css';

export default function AdminKycPage() {
  const { user, accessToken } = useAuthStore();
  const router = useRouter();
  const [producers, setProducers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [selectedProducer, setSelectedProducer] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      router.push('/shop');
      return;
    }
    fetchPendingKyc();
  }, [user]);

  const fetchPendingKyc = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/v1/admin/kyc/pending', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (res.ok) {
        setProducers(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const viewDocuments = async (producer: any) => {
    setSelectedProducer(producer);
    try {
      const res = await fetch(`http://localhost:3001/api/v1/admin/kyc/${producer.id}/documents`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (res.ok) {
        setDocuments(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleApprove = async (producerId: string) => {
    if (!confirm('Approve this artisan?')) return;
    try {
      const res = await fetch(`http://localhost:3001/api/v1/admin/kyc/${producerId}/approve`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (res.ok) {
        setSelectedProducer(null);
        fetchPendingKyc();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReject = async (producerId: string) => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;
    try {
      const res = await fetch(`http://localhost:3001/api/v1/admin/kyc/${producerId}/reject`, {
        method: 'PATCH',
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason })
      });
      if (res.ok) {
        setSelectedProducer(null);
        fetchPendingKyc();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!user || user.role !== 'admin') return null;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}><ShieldAlert size={32} /> KYC Review Portal</h1>
      </header>

      <div className={styles.tableContainer}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Loading applications...</div>
        ) : producers.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            No pending KYC applications. Queue is clear!
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Artisan Name</th>
                <th>Business Name</th>
                <th>State</th>
                <th>Submitted Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {producers.map(p => (
                <tr key={p.id}>
                  <td>{p.display_name}</td>
                  <td>{p.business_name || 'N/A'}</td>
                  <td>{p.state || 'N/A'}</td>
                  <td>{new Date(p.updated_at).toLocaleDateString()}</td>
                  <td>
                    <div className={styles.btnGroup}>
                      <button onClick={() => viewDocuments(p)} className={`${styles.btn} ${styles.btnView}`}>
                        <Eye size={16} /> Review Docs
                      </button>
                      <button onClick={() => handleApprove(p.id)} className={`${styles.btn} ${styles.btnApprove}`}>
                        <CheckCircle size={16} /> Approve
                      </button>
                      <button onClick={() => handleReject(p.id)} className={`${styles.btn} ${styles.btnReject}`}>
                        <XCircle size={16} /> Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Document Review Modal */}
      {selectedProducer && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>Reviewing: {selectedProducer.display_name}</h2>
              <button onClick={() => setSelectedProducer(null)} className={styles.closeBtn}>&times;</button>
            </div>
            
            {documents.length === 0 ? (
              <p>No documents found.</p>
            ) : (
              documents.map(doc => (
                <div key={doc.id} style={{ marginBottom: '2rem' }}>
                  <h4 style={{ marginBottom: '0.5rem', textTransform: 'capitalize' }}>
                    {doc.document_type.replace('_', ' ')}
                  </h4>
                  <img src={doc.document_url} alt={doc.document_type} className={styles.docImage} />
                </div>
              ))
            )}

            <div className={styles.btnGroup} style={{ justifyContent: 'flex-end', marginTop: '2rem' }}>
              <button onClick={() => handleReject(selectedProducer.id)} className={`${styles.btn} ${styles.btnReject}`} style={{ padding: '1rem 2rem' }}>
                Reject Application
              </button>
              <button onClick={() => handleApprove(selectedProducer.id)} className={`${styles.btn} ${styles.btnApprove}`} style={{ padding: '1rem 2rem' }}>
                Approve & Verify Artisan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
