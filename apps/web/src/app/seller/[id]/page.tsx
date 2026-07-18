'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuthStore } from '../../../store/useAuthStore';
import { ShieldCheck, MapPin, Grid, PlaySquare, UserPlus, UserCheck } from 'lucide-react';
import styles from './seller.module.css';

export default function SellerProfilePage() {
  const params = useParams();
  const sellerId = params.id as string;
  const { user, accessToken } = useAuthStore();
  
  const [profile, setProfile] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('products');
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfileData();
  }, [sellerId]);

  const fetchProfileData = async () => {
    try {
      // In a real app we'd have a specific GET /api/v1/producers/:id profile endpoint.
      // We will mock this data fetching for now to focus on UI composition
      setProfile({
        id: sellerId,
        business_name: 'Authentic Weavers Co.',
        bio: 'Preserving the art of handloom weaving for 3 generations.',
        state: 'Odisha',
        district: 'Sambalpur',
        is_verified: true,
        followers_count: 142
      });

      // Mock products
      setProducts([
        { id: '1', title: 'Sambalpuri Silk Saree', base_price: 4500, status: 'active' },
        { id: '2', title: 'Cotton Ikkat Dupatta', base_price: 1200, status: 'active' }
      ]);

      // Mock posts (Reels)
      setPosts([
        { id: '1', type: 'video_reel', media_url: 'https://www.w3schools.com/html/mov_bbb.mp4', likes_count: 56 },
        { id: '2', type: 'image_carousel', media_url: 'https://via.placeholder.com/400', likes_count: 23 }
      ]);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleFollow = async () => {
    if (!user) {
      alert("Please login to follow this weaver.");
      return;
    }
    
    try {
      if (isFollowing) {
        await fetch(`http://localhost:3001/api/v1/social/follow/${sellerId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        setIsFollowing(false);
      } else {
        await fetch(`http://localhost:3001/api/v1/social/follow/${sellerId}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        setIsFollowing(true);
      }
    } catch (error) {
      console.error(error);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className={styles.container}>
      {/* Banner */}
      <div className={styles.banner}>
        <div className={styles.bannerOverlay}></div>
      </div>
      
      {/* Profile Header */}
      <div className={styles.profileHeader}>
        <div className={styles.avatar}>
          {profile?.business_name?.charAt(0) || 'W'}
        </div>
        
        <div className={styles.info}>
          <h1 className={styles.name}>
            {profile?.business_name}
            {profile?.is_verified && (
              <span className={styles.verifiedBadge} title="AI Verified Authentic Handloom">
                <ShieldCheck size={18} /> Verified
              </span>
            )}
          </h1>
          <p className={styles.location}>
            <MapPin size={16} /> {profile?.district}, {profile?.state}
          </p>
          <p className={styles.bio}>{profile?.bio}</p>
          
          <div className={styles.stats}>
            <div className={styles.stat}><strong>{products.length}</strong> Products</div>
            <div className={styles.stat}><strong>{profile?.followers_count + (isFollowing ? 1 : 0)}</strong> Followers</div>
          </div>
        </div>

        <div className={styles.actions}>
          <button 
            className={`${styles.followBtn} ${isFollowing ? styles.following : ''}`}
            onClick={toggleFollow}
          >
            {isFollowing ? <><UserCheck size={18}/> Following</> : <><UserPlus size={18}/> Follow</>}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button 
          className={`${styles.tab} ${activeTab === 'products' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('products')}
        >
          <Grid size={18} /> Shop Products
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'reels' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('reels')}
        >
          <PlaySquare size={18} /> Studio Reels
        </button>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {activeTab === 'products' && (
          <div className={styles.productGrid}>
            {products.map(p => (
              <div key={p.id} className={styles.productCard}>
                <div className={styles.productImgPlaceholder}>No Image</div>
                <div className={styles.productInfo}>
                  <h4>{p.title}</h4>
                  <p>₹{p.base_price}</p>
                  <button className={styles.buyBtn}>View Product</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'reels' && (
          <div className={styles.reelsGrid}>
            {posts.map(post => (
              <div key={post.id} className={styles.reelCard}>
                {post.type === 'video_reel' ? (
                  <video src={post.media_url} className={styles.reelMedia} />
                ) : (
                  <img src={post.media_url} className={styles.reelMedia} alt="Post" />
                )}
                <div className={styles.reelOverlay}>
                  <PlaySquare size={24} /> {post.likes_count}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
