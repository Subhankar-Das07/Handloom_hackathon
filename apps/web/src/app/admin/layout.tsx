'use client';

import { useAuthStore } from '../../store/useAuthStore';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect } from 'react';
import { LayoutDashboard, Users, ShieldAlert, Package, Landmark, LogOut } from 'lucide-react';
import styles from './admin-layout.module.css';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      router.push('/auth/login');
    }
  }, [user]);

  if (!user || user.role !== 'admin') return null;

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <span>✦</span> Sutra Admin
        </div>
        
        <nav className={styles.nav}>
          <Link href="/admin" className={`${styles.navItem} ${pathname === '/admin' ? styles.active : ''}`}>
            <LayoutDashboard size={20} /> Dashboard
          </Link>
          <Link href="/admin/users" className={`${styles.navItem} ${pathname.includes('/users') ? styles.active : ''}`}>
            <Users size={20} /> Users
          </Link>
          <Link href="/admin/kyc" className={`${styles.navItem} ${pathname.includes('/kyc') ? styles.active : ''}`}>
            <ShieldAlert size={20} /> KYC Queue
          </Link>
          <Link href="/admin/products" className={`${styles.navItem} ${pathname.includes('/products') ? styles.active : ''}`}>
            <Package size={20} /> Moderation
          </Link>
          <Link href="/admin/schemes" className={`${styles.navItem} ${pathname.includes('/schemes') ? styles.active : ''}`}>
            <Landmark size={20} /> Scheme CMS
          </Link>
        </nav>

        <button onClick={() => { logout(); router.push('/'); }} className={styles.logoutBtn}>
          <LogOut size={20} /> Logout
        </button>
      </aside>

      <main className={styles.mainContent}>
        {children}
      </main>
    </div>
  );
}
