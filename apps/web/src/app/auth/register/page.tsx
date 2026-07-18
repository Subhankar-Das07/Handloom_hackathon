'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '../../../store/useAuthStore';
import styles from '../login/login.module.css';
import { Mail, Lock, User, Phone, ArrowRight, Loader2, Store, ShoppingBag } from 'lucide-react';

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const defaultRole = searchParams.get('role') === 'producer' ? 'producer' : 'consumer';
  
  const [role, setRole] = useState<'consumer' | 'producer'>(defaultRole);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('http://localhost:3001/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone, password, role }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Registration failed');
      }

      // Registration successful, now login
      const loginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!loginRes.ok) throw new Error('Auto-login failed. Please login manually.');
      
      const data = await loginRes.json();
      const payload = JSON.parse(atob(data.access_token.split('.')[1]));
      
      useAuthStore.getState().setAuth(
        { id: payload.sub, email: payload.email, role: payload.role },
        data.access_token
      );

      router.push(role === 'producer' ? '/dashboard' : '/shop');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.authCard + " glass-panel animate-fade-in"}>
        <div className={styles.header}>
          <Link href="/" className={styles.logo}>
            <span className={styles.logoIcon}>✦</span> Tanthavi
          </Link>
          <h1 className="h2" style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>Create Account</h1>
          <p className="subtitle" style={{ fontSize: '1rem' }}>Join the authentic handloom marketplace</p>
        </div>

        {/* Role Selector */}
        <div className={styles.roleSelector} style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <button 
            type="button"
            onClick={() => setRole('consumer')}
            className={`btn ${role === 'consumer' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1 }}
          >
            <ShoppingBag size={18} /> Buyer
          </button>
          <button 
            type="button"
            onClick={() => setRole('producer')}
            className={`btn ${role === 'producer' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1 }}
          >
            <Store size={18} /> Weaver
          </button>
        </div>

        {error && (
          <div className={styles.errorAlert}>
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className={styles.form}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Email Address</label>
            <div className={styles.inputWrapper}>
              <Mail className={styles.inputIcon} size={20} />
              <input
                type="email"
                className={styles.input}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>Phone Number</label>
            <div className={styles.inputWrapper}>
              <Phone className={styles.inputIcon} size={20} />
              <input
                type="tel"
                className={styles.input}
                placeholder="+91 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>Password</label>
            <div className={styles.inputWrapper}>
              <Lock className={styles.inputIcon} size={20} />
              <input
                type="password"
                className={styles.input}
                placeholder="Create a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button 
            type="submit" 
            className={`btn btn-primary ${styles.submitBtn}`}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className={styles.spinner} /> : 'Create Account'}
            {!isLoading && <ArrowRight size={20} />}
          </button>
        </form>

        <div className={styles.footer}>
          <p className={styles.footerText}>
            Already have an account?{' '}
            <Link href="/auth/login" className={styles.registerLink}>
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
