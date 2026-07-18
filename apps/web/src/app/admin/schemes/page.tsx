'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '../../../store/useAuthStore';
import { Landmark, Plus, Trash2 } from 'lucide-react';
import styles from '../kyc/admin-kyc.module.css'; // Reuse table styles

export default function AdminSchemesPage() {
  const { accessToken } = useAuthStore();
  const [schemes, setSchemes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [description, setDescription] = useState('');
  const [benefitAmount, setBenefitAmount] = useState('');
  const [applyUrl, setApplyUrl] = useState('');
  
  // Rule Builder State
  const [ruleState, setRuleState] = useState('All');
  const [ruleIncome, setRuleIncome] = useState('Any');
  const [ruleLoom, setRuleLoom] = useState(false);
  
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchSchemes();
  }, []);

  const fetchSchemes = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/v1/admin/schemes', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (res.ok) {
        setSchemes(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateScheme = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('http://localhost:3001/api/v1/admin/schemes', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title,
          department_name: department,
          description,
          benefit_amount: benefitAmount,
          apply_url: applyUrl,
          eligibility_criteria: {
            state: ruleState,
            income: ruleIncome,
            hasLoom: ruleLoom
          }
        })
      });
      if (res.ok) {
        setShowForm(false);
        setTitle('');
        setDepartment('');
        setDescription('');
        setBenefitAmount('');
        setApplyUrl('');
        setRuleState('All');
        setRuleIncome('Any');
        setRuleLoom(false);
        fetchSchemes();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div>Loading schemes...</div>;

  return (
    <div className={styles.container} style={{ padding: 0 }}>
      <header className={styles.header}>
        <h1 className={styles.title}><Landmark size={32} /> Government Schemes</h1>
        <button onClick={() => setShowForm(true)} className={`${styles.btn} ${styles.btnApprove}`}>
          <Plus size={16} style={{ display: 'inline', marginRight: '8px' }} />
          Add Scheme
        </button>
      </header>

      {showForm && (
        <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
          <h2 style={{ marginBottom: '1.5rem' }}>Create New Scheme</h2>
          <form onSubmit={handleCreateScheme} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input 
              required type="text" placeholder="Scheme Title" 
              value={title} onChange={e => setTitle(e.target.value)} 
              className="input-field" style={{ padding: '0.75rem', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
            />
            <input 
              required type="text" placeholder="Department/Ministry" 
              value={department} onChange={e => setDepartment(e.target.value)} 
              style={{ padding: '0.75rem', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
            />
            <textarea 
              required placeholder="Description" rows={4}
              value={description} onChange={e => setDescription(e.target.value)} 
              style={{ padding: '0.75rem', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
            />
            <div style={{ display: 'flex', gap: '1rem' }}>
              <input 
                type="text" placeholder="Benefit Amount (e.g. ₹10,000)" 
                value={benefitAmount} onChange={e => setBenefitAmount(e.target.value)} 
                style={{ flex: 1, padding: '0.75rem', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
              />
              <input 
                type="url" placeholder="Apply URL" 
                value={applyUrl} onChange={e => setApplyUrl(e.target.value)} 
                style={{ flex: 1, padding: '0.75rem', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
              />
            </div>
            
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginTop: '0.5rem' }}>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Eligibility Rule Builder</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <label>
                  <span style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#888' }}>Target State</span>
                  <select 
                    value={ruleState} onChange={e => setRuleState(e.target.value)}
                    style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                  >
                    <option value="All">All India</option>
                    <option value="Odisha">Odisha</option>
                    <option value="West Bengal">West Bengal</option>
                    <option value="Assam">Assam</option>
                    <option value="Varanasi">Varanasi</option>
                    <option value="Gujarat">Gujarat</option>
                  </select>
                </label>
                
                <label>
                  <span style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#888' }}>Income Limit</span>
                  <select 
                    value={ruleIncome} onChange={e => setRuleIncome(e.target.value)}
                    style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                  >
                    <option value="Any">Any Income</option>
                    <option value="<1L">Less than ₹1 Lakh</option>
                    <option value="1L-3L">₹1 Lakh - ₹3 Lakh</option>
                    <option value=">3L">More than ₹3 Lakh</option>
                  </select>
                </label>
              </div>
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.95rem' }}>
                <input 
                  type="checkbox" 
                  checked={ruleLoom} onChange={e => setRuleLoom(e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                Requires applicant to own a handloom
              </label>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button type="submit" disabled={submitting} className={`${styles.btn} ${styles.btnApprove}`} style={{ padding: '0.75rem 2rem' }}>
                {submitting ? 'Saving...' : 'Publish Scheme'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className={`${styles.btn} ${styles.btnView}`} style={{ padding: '0.75rem 2rem' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className={styles.tableContainer}>
        {schemes.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            No schemes found.
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Department</th>
                <th>Benefit</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {schemes.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 500 }}>{s.title}</td>
                  <td>{s.department_name}</td>
                  <td>{s.benefit_amount || 'N/A'}</td>
                  <td>
                    <span style={{ 
                      padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem',
                      background: s.is_active ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      color: s.is_active ? '#10b981' : '#ef4444'
                    }}>
                      {s.is_active ? 'Active' : 'Archived'}
                    </span>
                  </td>
                  <td>
                    <button className={`${styles.btn} ${styles.btnReject}`} style={{ padding: '0.25rem 0.5rem' }}>
                      <Trash2 size={14} />
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
