'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '../../../store/useAuthStore';
import styles from './login.module.css';
import { Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect');
  const setAuth = useAuthStore((state) => state.setAuth);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('http://localhost:3001/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        throw new Error('Invalid email or password');
      }

      const data = await res.json();
      
      // Decode JWT payload for user info (simple base64 decode for demo)
      const payloadBase64 = data.access_token.split('.')[1];
      const payload = JSON.parse(atob(payloadBase64));
      
      setAuth(
        { id: payload.sub, email: payload.email, role: payload.role },
        data.access_token
      );

      if (redirectUrl) {
        router.push(redirectUrl);
      } else if (payload.role === 'producer') {
        router.push('/dashboard');
      } else if (payload.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/shop');
      }
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
          <h1 className="h2" style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>Welcome Back</h1>
          <p className="subtitle" style={{ fontSize: '1rem' }}>Enter your credentials to access your account</p>
        </div>

        {error && (
          <div className={styles.errorAlert}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className={styles.form}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Email Address</label>
            <div className={styles.inputWrapper}>
              <Mail className={styles.inputIcon} size={20} />
              <input
                type="email"
                className={styles.input}
                placeholder="artisan@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className={styles.inputGroup}>
            <div className={styles.labelRow}>
              <label className={styles.label}>Password</label>
              <Link href="/auth/forgot-password" className={styles.forgotLink}>Forgot password?</Link>
            </div>
            <div className={styles.inputWrapper}>
              <Lock className={styles.inputIcon} size={20} />
              <input
                type="password"
                className={styles.input}
                placeholder="••••••••"
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
            {isLoading ? <Loader2 className={styles.spinner} /> : 'Sign In'}
            {!isLoading && <ArrowRight size={20} />}
          </button>
        </form>

        <div className={styles.footer}>
          <p className={styles.footerText}>
            Don't have an account?{' '}
            <Link href="/auth/register" className={styles.registerLink}>
              Create one now
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
