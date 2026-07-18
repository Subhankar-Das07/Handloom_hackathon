'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '../../../store/useAuthStore';
import { Image as ImageIcon, Video, Upload, CheckCircle } from 'lucide-react';
import styles from './studio.module.css';

export default function ProducerStudio() {
  const { accessToken } = useAuthStore();
  const [products, setProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Form state
  const [postType, setPostType] = useState('image_carousel');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchMyProducts();
  }, []);

  const fetchMyProducts = async () => {
    try {
      // In a real scenario, this fetches products for the specific producer
      // Using public products endpoint for demo purposes
      const res = await fetch('http://localhost:3001/api/v1/products');
      if (res.ok) {
        const data = await res.json();
        // Just mock filter to active products
        setProducts(data.filter((p: any) => p.status === 'active'));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingProducts(false);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mediaFile) {
      alert("Please select a file to upload.");
      return;
    }

    setSubmitting(true);
    setSuccess(false);

    try {
      // 1. Get Presigned URL
      const presignRes = await fetch('http://localhost:3001/api/v1/storage/presigned-url', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contentType: mediaFile.type,
          prefix: postType === 'video_reel' ? 'reels' : 'posts'
        })
      });

      if (!presignRes.ok) throw new Error("Failed to get upload URL");
      const { uploadUrl, fileUrl } = await presignRes.json();

      // 2. Upload file directly to MinIO/S3
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': mediaFile.type
        },
        body: mediaFile
      });

      if (!uploadRes.ok) throw new Error("Failed to upload file");

      // 3. Create the post in DB
      const res = await fetch('http://localhost:3001/api/v1/social/posts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: postType,
          media_urls: [fileUrl],
          caption,
          tagged_product_ids: selectedProductId ? [selectedProductId] : []
        })
      });

      if (res.ok) {
        setSuccess(true);
        setMediaFile(null);
        setMediaUrl('');
        setCaption('');
        setSelectedProductId('');
        
        // Hide success message after 3 seconds
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (err) {
      console.error(err);
      alert("Upload failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setMediaFile(file);
      setMediaUrl(URL.createObjectURL(file)); // For preview
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Content Studio</h1>
        <p className={styles.subtitle}>Upload photos or Reels of your weaving process and tag your products.</p>
      </header>

      {success && (
        <div className={styles.successBanner}>
          <CheckCircle size={20} /> Your post is now live in the Explore feed!
        </div>
      )}

      <div className={styles.studioLayout}>
        {/* Left Column - Form */}
        <div className={styles.formSection}>
          <form onSubmit={handlePublish} className={styles.form}>
            
            {/* Type Selector */}
            <div className={styles.typeSelector}>
              <button 
                type="button"
                className={`${styles.typeBtn} ${postType === 'image_carousel' ? styles.active : ''}`}
                onClick={() => setPostType('image_carousel')}
              >
                <ImageIcon size={20} /> Photo
              </button>
              <button 
                type="button"
                className={`${styles.typeBtn} ${postType === 'video_reel' ? styles.active : ''}`}
                onClick={() => setPostType('video_reel')}
              >
                <Video size={20} /> Reel (Video)
              </button>
            </div>

            {/* Media Upload */}
            <div className={styles.formGroup}>
              <label>Upload Media (Image or Video)</label>
              <input 
                required
                type="file" 
                accept={postType === 'video_reel' ? "video/*" : "image/*"}
                onChange={handleFileChange}
                className={styles.input}
              />
              <p className={styles.helperText}>File will be securely uploaded to our S3-compatible storage.</p>
            </div>

            {/* Caption */}
            <div className={styles.formGroup}>
              <label>Caption</label>
              <textarea 
                placeholder="Tell the story behind this weave..."
                value={caption}
                onChange={e => setCaption(e.target.value)}
                className={styles.textarea}
                rows={4}
              />
            </div>

            {/* Product Tagging */}
            <div className={styles.formGroup}>
              <label>Tag a Product (Make it Shoppable)</label>
              <select 
                value={selectedProductId}
                onChange={e => setSelectedProductId(e.target.value)}
                className={styles.input}
                disabled={loadingProducts}
              >
                <option value="">-- No product tagged --</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.title} (₹{p.base_price})</option>
                ))}
              </select>
            </div>

            <button type="submit" disabled={submitting} className={styles.publishBtn}>
              <Upload size={18} /> {submitting ? 'Publishing...' : 'Publish to Feed'}
            </button>
          </form>
        </div>

        {/* Right Column - Preview */}
        <div className={styles.previewSection}>
          <h3 style={{ marginBottom: '1rem', color: '#888', fontSize: '0.9rem', textTransform: 'uppercase' }}>Live Preview</h3>
          <div className={styles.previewPhone}>
            <div className={styles.previewScreen}>
              {mediaUrl ? (
                postType === 'video_reel' ? (
                  <video src={mediaUrl} className={styles.previewMedia} autoPlay muted loop />
                ) : (
                  <img src={mediaUrl} alt="Preview" className={styles.previewMedia} />
                )
              ) : (
                <div className={styles.placeholderMedia}>
                  {postType === 'video_reel' ? <Video size={48} opacity={0.3} /> : <ImageIcon size={48} opacity={0.3} />}
                </div>
              )}
              
              <div className={styles.previewOverlay}>
                {caption && <p className={styles.previewCaption}>{caption}</p>}
                
                {selectedProductId && (
                  <div className={styles.previewTag}>
                    <ShoppingBag size={14} /> Shoppable Tag
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
