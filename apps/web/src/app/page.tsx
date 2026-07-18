import Link from 'next/link';
import styles from './page.module.css';

export default function Home() {
  return (
    <main className={styles.main}>
      {/* Navigation */}
      <nav className={styles.nav}>
        <div className="container">
          <div className={styles.navContent}>
            <div className={styles.logo}>
              <span className={styles.logoIcon}>✦</span> Sutra
            </div>
            <div className={styles.navLinks} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <Link href="/explore" className="btn btn-secondary" style={{ background: 'transparent', border: 'none' }}>
                Explore Reels
              </Link>
              <Link href="/schemes" className="btn btn-secondary" style={{ background: 'transparent', border: '1px solid var(--border-color)' }}>
                Gov Schemes
              </Link>
              <Link href="/auth/login" className="btn btn-primary">
                Login
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroContent}>
            <div className={styles.heroBadge + " animate-fade-in"}>
              <span className={styles.badgePulse}></span>
              India&apos;s First AI-Verified Handloom Marketplace
            </div>
            
            <h1 className="h1 animate-fade-in delay-100">
              Bridging Artisans <br />
              <span className={styles.textGradient}>With The World.</span>
            </h1>
            
            <p className="subtitle animate-fade-in delay-200" style={{ maxWidth: '600px', margin: '1.5rem auto' }}>
              Eliminating middlemen. Ensuring authenticity. Sutra brings authentic, GI-certified handloom directly from the weaver&apos;s loom to your wardrobe or business.
            </p>
            
            <div className={styles.actionGroup + " animate-fade-in delay-300"}>
              <Link href="/shop" className="btn btn-primary" style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}>
                Shop Authentic Handloom
              </Link>
              <Link href="/auth/register?role=producer" className="btn btn-secondary" style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}>
                Join as a Weaver
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Value Proposition Cards */}
      <section className={styles.features}>
        <div className="container">
          <div className={styles.grid}>
            <div className="glass-panel" style={{ padding: '2rem' }}>
              <div className={styles.iconWrapper}>AI</div>
              <h3 className="h3" style={{ marginBottom: '1rem' }}>AI-Verified Trust</h3>
              <p className="subtitle">Every seller's workshop and products are verified by our computer vision models to ensure 100% handloom authenticity.</p>
            </div>
            <div className="glass-panel" style={{ padding: '2rem' }}>
              <div className={styles.iconWrapper}>₹</div>
              <h3 className="h3" style={{ marginBottom: '1rem' }}>Zero Middlemen</h3>
              <p className="subtitle">Weavers get the price they deserve. Buyers get authentic products at fair prices. B2B bulk orders supported natively.</p>
            </div>
            <div className="glass-panel" style={{ padding: '2rem' }}>
              <div className={styles.iconWrapper}>🏛️</div>
              <h3 className="h3" style={{ marginBottom: '1rem' }}>Scheme Hub</h3>
              <p className="subtitle">Rural artisans can discover and apply for matching government schemes with a simple 8-question eligibility check.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
