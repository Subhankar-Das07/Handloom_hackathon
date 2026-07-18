'use client';

import { useState, useEffect } from 'react';
import { Heart, MessageCircle, Share2, Play, ShoppingBag } from 'lucide-react';
import styles from './explore.module.css';

export default function ExploreFeed() {
  const [feed, setFeed] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFeed();
  }, []);

  const fetchFeed = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/v1/social/feed');
      if (res.ok) {
        setFeed(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className={styles.loadingContainer}>Loading weavers' stories...</div>;
  }

  if (feed.length === 0) {
    return (
      <div className={styles.loadingContainer}>
        <h3>No posts yet.</h3>
        <p>Verified weavers will appear here once they start uploading.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.feedWrapper}>
        {feed.map((post) => (
          <div key={post.id} className={styles.postCard}>
            
            {/* Header: Producer Info */}
            <div className={styles.postHeader}>
              <div className={styles.avatar}>
                {post.producer?.name?.charAt(0) || 'W'}
              </div>
              <div className={styles.producerInfo}>
                <h4 className={styles.producerName}>
                  {post.producer?.name || 'Artisan Weaver'}
                  {post.producer?.is_verified && <span className={styles.verifiedBadge}>✓</span>}
                </h4>
                <p className={styles.postTime}>
                  {new Date(post.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            {/* Media Area */}
            <div className={styles.mediaContainer}>
              {post.type === 'video_reel' ? (
                <div className={styles.videoWrapper}>
                  <video 
                    src={post.media_urls[0]} 
                    className={styles.media}
                    controls
                    autoPlay
                    muted
                    loop
                  />
                  <div className={styles.playIcon}><Play size={48} color="white" /></div>
                </div>
              ) : (
                <div className={styles.imageWrapper}>
                  {/* Simplistic carousel for MVP - just shows first image */}
                  <img src={post.media_urls[0]} alt="Post media" className={styles.media} />
                </div>
              )}
            </div>

            {/* Caption */}
            {post.caption && (
              <div className={styles.caption}>
                {post.caption}
              </div>
            )}

            {/* Shoppable Tag */}
            {post.tagged_products && post.tagged_products.length > 0 && (
              <div className={styles.shoppableTagContainer}>
                {post.tagged_products.map((product: any) => (
                  <div key={product.id} className={styles.shoppableTag}>
                    <div className={styles.shoppableIcon}><ShoppingBag size={18} /></div>
                    <div className={styles.shoppableInfo}>
                      <p className={styles.shoppableTitle}>{product.title}</p>
                      <p className={styles.shoppablePrice}>₹{product.base_price}</p>
                    </div>
                    <a href={`/shop`} className={styles.buyBtn}>Buy Now</a>
                  </div>
                ))}
              </div>
            )}

            {/* Interaction Bar */}
            <div className={styles.interactionBar}>
              <button className={styles.actionBtn}>
                <Heart size={24} /> <span>{post.likes_count || 0}</span>
              </button>
              <button className={styles.actionBtn}>
                <MessageCircle size={24} />
              </button>
              <button className={styles.actionBtn}>
                <Share2 size={24} />
              </button>
            </div>
            
          </div>
        ))}
      </div>
    </div>
  );
}
