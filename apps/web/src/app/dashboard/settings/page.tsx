'use client';

import { useAuthStore } from '../../../store/useAuthStore';
import { useRouter } from 'next/navigation';
import { Settings as SettingsIcon, Bell, Shield, Wallet, Users } from 'lucide-react';
import styles from '../dashboard.module.css'; // Reusing dashboard styles

export default function SettingsPage() {
  const { user } = useAuthStore();
  const router = useRouter();

  if (!user) {
    router.push('/auth/login');
    return null;
  }

  return (
    <div className={styles.container}>
      <header className={styles.header} style={{ marginBottom: '2rem' }}>
        <h1 className="h2">Account Settings</h1>
        <p className="subtitle">Manage your profile, notifications, and proxy artisan accounts.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        
        {/* Profile */}
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <h3 className="h3" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <SettingsIcon size={20} color="var(--primary)" /> Profile Details
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Full Name</label>
              <input type="text" className="input" defaultValue={user.fullName || 'User'} disabled />
            </div>
            <div>
              <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Email</label>
              <input type="text" className="input" defaultValue={user.email} disabled />
            </div>
            <div>
              <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Role</label>
              <input type="text" className="input" defaultValue={user.role.toUpperCase()} disabled />
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <h3 className="h3" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Bell size={20} color="var(--primary)" /> Notifications
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" defaultChecked /> Email alerts for new orders
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" defaultChecked /> SMS alerts for payments
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" /> Marketing emails
            </label>
          </div>
        </div>

        {/* Proxy CRM (Only for NGOs/Admins) */}
        {(user.role === 'admin' || user.role === 'partner_agent') && (
          <div className="glass-panel" style={{ padding: '2rem', border: '1px solid var(--primary)' }}>
            <h3 className="h3" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--primary)' }}>
              <Users size={20} /> Proxy Artisan CRM
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Manage accounts on behalf of offline rural weavers. You can list products and manage orders for them.
            </p>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              Onboard New Offline Artisan
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
