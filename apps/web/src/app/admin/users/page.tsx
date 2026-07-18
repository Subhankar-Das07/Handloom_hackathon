'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '../../../store/useAuthStore';
import { Users as UsersIcon, UserX } from 'lucide-react';
import styles from '../kyc/admin-kyc.module.css';

export default function AdminUsersPage() {
  const { accessToken } = useAuthStore();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/v1/admin/users', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (res.ok) {
        setUsers(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading users...</div>;

  return (
    <div className={styles.container} style={{ padding: 0 }}>
      <header className={styles.header}>
        <h1 className={styles.title}><UsersIcon size={32} /> User Management</h1>
      </header>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td style={{ fontSize: '0.75rem', color: '#888' }}>{u.id.substring(0,8)}...</td>
                <td style={{ fontWeight: 500 }}>{u.email}</td>
                <td>{u.phone || '-'}</td>
                <td>
                  <span style={{ 
                    padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold',
                    background: u.role === 'admin' ? 'rgba(139,92,246,0.1)' : 
                               u.role === 'producer' ? 'rgba(59,130,246,0.1)' : 'rgba(100,116,139,0.1)',
                    color: u.role === 'admin' ? '#8b5cf6' : 
                           u.role === 'producer' ? '#3b82f6' : '#64748b'
                  }}>
                    {u.role.toUpperCase()}
                  </span>
                </td>
                <td>
                  <span style={{ 
                    padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem',
                    background: u.is_active ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    color: u.is_active ? '#10b981' : '#ef4444'
                  }}>
                    {u.is_active ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td style={{ fontSize: '0.85rem' }}>{new Date(u.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
