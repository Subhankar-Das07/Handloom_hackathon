'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '../../../store/useAuthStore';
import { ShieldCheck, UploadCloud, FileText, AlertCircle } from 'lucide-react';
import styles from './kyc.module.css';

export default function KycPage() {
  const { user, accessToken } = useAuthStore();
  const [kycData, setKycData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [aadhaarUrl, setAadhaarUrl] = useState('');
  const [artisanCardUrl, setArtisanCardUrl] = useState('');

  useEffect(() => {
    fetchKycStatus();
  }, []);

  const fetchKycStatus = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/v1/producers/kyc/status', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (res.ok) {
        setKycData(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    // In a real app, we would upload to S3 first, then send URLs. 
    // Here we just send the raw mock URLs for demo.
    const documents = [
      { document_type: 'AADHAAR', document_url: aadhaarUrl },
      { document_type: 'ARTISAN_CARD', document_url: artisanCardUrl }
    ];

    try {
      const res = await fetch('http://localhost:3001/api/v1/producers/kyc/submit', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ documents })
      });
      
      if (res.ok) {
        fetchKycStatus();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div>Loading KYC profile...</div>;

  const status = kycData?.kyc_status || 'not_submitted';

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Identity & Verification</h1>
        <p>Complete your KYC to get the "Verified Artisan" badge and unlock payouts.</p>
      </header>

      {/* Status Banner */}
      <div className={`${styles.statusCard} ${styles[`status_${status}`]}`}>
        <div>
          <h3 style={{ marginBottom: '0.25rem' }}>Current Status: <span style={{textTransform: 'capitalize'}}>{status.replace('_', ' ')}</span></h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-color)' }}>
            {status === 'not_submitted' && "You haven't submitted your documents yet."}
            {status === 'under_review' && "Your documents are currently being reviewed by an admin."}
            {status === 'approved' && "Congratulations! You are a verified artisan."}
            {status === 'rejected' && "Your application was rejected. Please check the reasons and re-submit."}
          </p>
        </div>
        <div className={`${styles.statusBadge} ${styles[`badge_${status}`]}`}>
          {status.replace('_', ' ')}
        </div>
      </div>

      {kycData?.is_verified && (
        <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
          <h3>Your Trust Badges</h3>
          <div className={styles.badgesContainer}>
            {kycData.verified_badges?.map((badge: string) => (
              <div key={badge} className={styles.trustBadge}>
                <ShieldCheck size={18} /> {badge.replace('_', ' ')}
              </div>
            ))}
          </div>
        </div>
      )}

      {(status === 'not_submitted' || status === 'rejected') && (
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <h2 style={{ marginBottom: '1.5rem' }}>Upload Documents</h2>
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formGroup}>
              <label>Aadhaar Card (Mock URL)</label>
              <input 
                type="text" 
                className={styles.input} 
                placeholder="https://example.com/aadhaar.jpg" 
                value={aadhaarUrl}
                onChange={e => setAadhaarUrl(e.target.value)}
                required
              />
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>For the hackathon, just paste any image URL.</span>
            </div>

            <div className={styles.formGroup}>
              <label>Artisan Identity Card (Mock URL)</label>
              <input 
                type="text" 
                className={styles.input} 
                placeholder="https://example.com/artisan-card.jpg" 
                value={artisanCardUrl}
                onChange={e => setArtisanCardUrl(e.target.value)}
                required
              />
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Ministry of Textiles issued ID.</span>
            </div>

            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit for Verification'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
