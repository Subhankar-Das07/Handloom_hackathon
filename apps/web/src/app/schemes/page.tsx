'use client';

import { useState, useEffect } from 'react';
import { Landmark, CheckCircle, Search, ArrowRight } from 'lucide-react';
import styles from './schemes.module.css';

export default function PublicSchemesPage() {
  const [schemes, setSchemes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Local Storage Eligibility State
  const [showChecker, setShowChecker] = useState(false);
  const [eligibilityData, setEligibilityData] = useState({
    state: '',
    income: '',
    hasLoom: false
  });
  const [eligibleSchemeIds, setEligibleSchemeIds] = useState<string[]>([]);

  useEffect(() => {
    fetchSchemes();
    loadEligibility();
  }, []);

  const fetchSchemes = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/v1/admin/schemes'); // Open endpoint for reading in reality
      if (res.ok) {
        setSchemes(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadEligibility = () => {
    const saved = localStorage.getItem('tanthavi_eligibility');
    if (saved) {
      const data = JSON.parse(saved);
      setEligibilityData(data);
      calculateEligibility(data);
    }
  };

  const handleSaveEligibility = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('tanthavi_eligibility', JSON.stringify(eligibilityData));
    calculateEligibility(eligibilityData);
    setShowChecker(false);
  };

  const calculateEligibility = (data: any) => {
    if (!schemes || schemes.length === 0) return;

    const matched = schemes.filter(s => {
      // If no criteria defined, it's open to all
      if (!s.eligibility_criteria) return true;
      
      const rules = s.eligibility_criteria;
      let isMatch = true;

      // Rule 1: State Match
      if (rules.state && rules.state !== 'All') {
        if (data.state.toLowerCase() !== rules.state.toLowerCase()) {
          isMatch = false;
        }
      }

      // Rule 2: Income Match (simplified check for demo)
      if (rules.income && rules.income !== 'Any') {
        if (data.income !== rules.income) {
          isMatch = false;
        }
      }

      // Rule 3: Loom Match
      if (rules.hasLoom && !data.hasLoom) {
        isMatch = false;
      }

      return isMatch;
    }).map(s => s.id);
    
    setEligibleSchemeIds(matched); 
  };

  if (loading) return <div>Loading Government Schemes...</div>;

  return (
    <div className={styles.container}>
      <div className={styles.hero}>
        <h1><Landmark size={40} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '1rem' }} /> Government Scheme Hub</h1>
        <p>Discover financial aid, subsidies, and support programs for weavers and artisans.</p>
        <button onClick={() => setShowChecker(true)} className={styles.checkerBtn}>
          <CheckCircle size={20} /> Check My Eligibility
        </button>
      </div>

      {showChecker && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2>Eligibility Questionnaire</h2>
            <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>We store this locally on your device to match you with relevant schemes.</p>
            <form onSubmit={handleSaveEligibility} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label>
                State of Residence
                <input 
                  type="text" required
                  value={eligibilityData.state}
                  onChange={e => setEligibilityData({...eligibilityData, state: e.target.value})}
                  className={styles.input}
                />
              </label>
              <label>
                Annual Income (₹)
                <select 
                  value={eligibilityData.income}
                  onChange={e => setEligibilityData({...eligibilityData, income: e.target.value})}
                  className={styles.input}
                >
                  <option value="">Select Range</option>
                  <option value="<1L">Less than ₹1 Lakh</option>
                  <option value="1L-3L">₹1 Lakh - ₹3 Lakh</option>
                  <option value=">3L">More than ₹3 Lakh</option>
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={eligibilityData.hasLoom}
                  onChange={e => setEligibilityData({...eligibilityData, hasLoom: e.target.checked})}
                />
                I own a handloom
              </label>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" className={styles.btnPrimary}>Find Matches</button>
                <button type="button" onClick={() => setShowChecker(false)} className={styles.btnSecondary}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className={styles.schemesGrid}>
        {schemes.map(s => (
          <div key={s.id} className={`${styles.schemeCard} ${eligibleSchemeIds.includes(s.id) ? styles.eligible : ''}`}>
            {eligibleSchemeIds.includes(s.id) && localStorage.getItem('tanthavi_eligibility') && (
              <div className={styles.badge}><CheckCircle size={14} /> You're Eligible</div>
            )}
            <h3>{s.title}</h3>
            <p className={styles.department}>{s.department_name}</p>
            <p className={styles.desc}>{s.description}</p>
            {s.benefit_amount && (
              <div className={styles.benefit}>Benefit: {s.benefit_amount}</div>
            )}
            
            {/* Display the rules */}
            {s.eligibility_criteria && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                {s.eligibility_criteria.state && s.eligibility_criteria.state !== 'All' && (
                  <span style={{ fontSize: '0.75rem', padding: '4px 8px', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', borderRadius: '4px' }}>
                    State: {s.eligibility_criteria.state}
                  </span>
                )}
                {s.eligibility_criteria.income && s.eligibility_criteria.income !== 'Any' && (
                  <span style={{ fontSize: '0.75rem', padding: '4px 8px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', borderRadius: '4px' }}>
                    Income: {s.eligibility_criteria.income}
                  </span>
                )}
                {s.eligibility_criteria.hasLoom && (
                  <span style={{ fontSize: '0.75rem', padding: '4px 8px', background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', borderRadius: '4px' }}>
                    Must own handloom
                  </span>
                )}
              </div>
            )}

            <a href={s.apply_url || '#'} target="_blank" className={styles.applyLink} style={{ display: 'flex', background: 'var(--primary-color)', color: 'white', padding: '0.75rem', borderRadius: '8px', justifyContent: 'center', fontWeight: 'bold' }}>
              Apply on Official Portal <ArrowRight size={16} />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
