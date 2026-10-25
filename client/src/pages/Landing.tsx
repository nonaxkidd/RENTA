import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import api from "../services/api";
import "./Landing.css";

interface ApiListing {
  _id: string;
  title: string;
  type: string;
  barangay: string;
  price: number;
  transparency: number;
  verified: boolean;
  lat: number;
  lng: number;
  updatedAt: string;
}

const CALAPAN_CENTER: [number, number] = [13.4117, 121.1803];

function formatRelativeTime(dateString: string) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Updated today";
  if (diffDays === 1) return "Updated yesterday";
  return `Updated ${diffDays} days ago`;
}

function Landing() {
  const CARDS_PER_VIEW = 3;
  const GAP = 24; // must match .carousel-track gap in Landing.css

  const [listings, setListings] = useState<ApiListing[]>([]);
  const [carouselLoading, setCarouselLoading] = useState(true);
  const [listingsError, setListingsError] = useState("");

  const [index, setIndex] = useState(CARDS_PER_VIEW);
  const [paused, setPaused] = useState(false);
  const [transition, setTransition] = useState(true);
  const [cardStep, setCardStep] = useState(0);
  const [mapLoading, setMapLoading] = useState(true);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);

  const activeListingsCount = listings.length;
  const barangaysMappedCount = new Set(listings.map((listing) => listing.barangay)).size;

  // Clones: last 3 real cards glued to the front, first 3 glued to the end
  const extendedListings =
    listings.length > 0
      ? [
          ...listings.slice(-CARDS_PER_VIEW),
          ...listings,
          ...listings.slice(0, CARDS_PER_VIEW),
        ]
      : [];

  const next = () => setIndex((i) => i + 1);
  const prev = () => setIndex((i) => i - 1);

  function handleListingClick(event: React.MouseEvent) {
    // Landing always shows the sign-in prompt on listing clicks, even if
    // the user is already logged in — this keeps Landing a pure entry
    // point and avoids "Back to listings" ever needing to return here.
    event.preventDefault();
    setShowAuthPrompt(true);
  }

  // Fetch real listings from MongoDB via the backend
  useEffect(() => {
    let cancelled = false;

    async function loadListings() {
      try {
        const response = await api.get("/listings");
        if (!cancelled) {
          setListings(response.data.listings);
        }
      } catch (error) {
        if (!cancelled) {
          setListingsError("Couldn't load listings right now.");
        }
      } finally {
        if (!cancelled) {
          setCarouselLoading(false);
        }
      }
    }

    loadListings();
    return () => {
      cancelled = true;
    };
  }, []);

  // Measure exact pixel width per card (accounts for the gap correctly)
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const measure = () => {
      const viewportWidth = element.offsetWidth;
      if (viewportWidth === 0) return;
      const cardWidth = (viewportWidth - GAP * (CARDS_PER_VIEW - 1)) / CARDS_PER_VIEW;
      setCardStep(cardWidth + GAP);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, [listings, carouselLoading]);

  useEffect(() => {
    if (paused || listings.length === 0) return;
    const timer = setInterval(next, 4000);
    return () => clearInterval(timer);
  }, [paused, listings]);

  // Silently snap back when we scroll onto a clone, so the loop feels seamless
  useEffect(() => {
    if (listings.length === 0) return;
    if (index === CARDS_PER_VIEW + listings.length) {
      const timeout = setTimeout(() => {
        setTransition(false);
        setIndex(CARDS_PER_VIEW);
      }, 500);
      return () => clearTimeout(timeout);
    }
    if (index === CARDS_PER_VIEW - 1) {
      const timeout = setTimeout(() => {
        setTransition(false);
        setIndex(CARDS_PER_VIEW + listings.length - 1);
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [index, listings]);

  useEffect(() => {
    if (!transition) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setTransition(true));
      });
    }
  }, [transition]);

  const realIndex =
    listings.length > 0
      ? ((index - CARDS_PER_VIEW) % listings.length + listings.length) % listings.length
      : 0;

  return (
    <div className="landing-page">
      {/* NAV */}
      <nav className="landing-nav">
        <div className="nav-logo">
          <span className="logo-circle">R.</span>
          <span className="logo-name">RENTA</span>
          <span className="logo-tag">CALAPAN CITY</span>
        </div>

        <div className="nav-links">
          <a href="#how-it-works">How it works</a>
          <a href="#listings">Discover</a>
          <a href="#for-owners">For owners</a>
          <Link to="/login" className="nav-signin">Sign in</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-text">
          <span className="hero-eyebrow">— Long-term rentals, made clear</span>

          <h1>
            Find your next place.
            <br />
            <span className="italic-accent">Know it</span> before you go.
          </h1>

          <p className="hero-description">
            One local place to explore verified long-term rentals in Calapan
            City — complete with transparent listing details, approximate
            locations, and immersive 360° views.
          </p>

          <form className="hero-search" onSubmit={(e) => e.preventDefault()}>
            <input type="text" placeholder="Search barangay, landmark, or type" />
            <button type="submit">
              Explore rentals <span className="button-arrow">↗</span>
            </button>
          </form>

          <div className="hero-stats">
            <div><strong>{activeListingsCount}</strong> Active listings</div>
            <div><strong>{barangaysMappedCount}</strong> Barangays mapped</div>
            <div><strong>360°</strong> Tours available</div>
          </div>
        </div>

        <div className="hero-map">
          {mapLoading && (
            <div className="map-loading-overlay">
              <div className="map-spinner" />
            </div>
          )}
          <MapContainer
            center={CALAPAN_CENTER}
            zoom={13}
            scrollWheelZoom={true}
            style={{ height: "460px", width: "100%", borderRadius: "24px" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              eventHandlers={{ load: () => setMapLoading(false) }}
            />
          </MapContainer>
        </div>
      </section>

      {/* LISTINGS CAROUSEL */}
      <section className="listings-section" id="listings">
        <div className="listings-heading">
          <div>
            <span className="section-eyebrow">Freshly reviewed</span>
            <h2>Places with the details in view.</h2>
          </div>
          <div className="carousel-controls">
            <button onClick={prev} aria-label="Previous listing">←</button>
            <button onClick={next} aria-label="Next listing">→</button>
          </div>
        </div>

        <div
          className="carousel-viewport"
          ref={viewportRef}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {carouselLoading ? (
            <div className="carousel-skeleton">
              {[1, 2, 3].map((item) => (
                <div className="skeleton-card" key={item}>
                  <div className="skeleton-thumb" />
                  <div className="skeleton-line skeleton-line-wide" />
                  <div className="skeleton-line skeleton-line-narrow" />
                </div>
              ))}
            </div>
          ) : listings.length === 0 ? (
            <div className="carousel-empty">
              <p>{listingsError || "No listings yet — check back soon."}</p>
            </div>
          ) : (
            <div
              className="carousel-track carousel-track-loaded"
              style={{
                transform: `translateX(-${index * cardStep}px)`,
                transition: transition ? "transform 0.5s ease" : "none",
              }}
            >
              {extendedListings.map((listing, i) => (
                <Link
                  to={`/listings/${listing._id}`}
                  className="listing-card"
                  key={`${listing._id}-${i}`}
                  style={{ width: cardStep - GAP }}
                  onClick={handleListingClick}
                >
                  <div className="listing-thumb">
                    <span className="tour-badge">360° Tour</span>
                  </div>
                  <div className="listing-info">
                    <div className="listing-meta">
                      <span>{listing.type} · {listing.barangay}</span>
                      <span className="listing-price">₱{listing.price.toLocaleString()}/mo</span>
                    </div>
                    <h3>{listing.title}</h3>
                    <div className="listing-footer">
                      <span>{listing.verified ? "Verified owner" : "Owner"} · {formatRelativeTime(listing.updatedAt)}</span>
                      <span className="listing-score">{listing.transparency}%</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {listings.length > 0 && (
          <div className="carousel-dots">
            {listings.map((listing, i) => (
              <button
                key={listing._id}
                className={i === realIndex ? "dot active" : "dot"}
                onClick={() => setIndex(i + CARDS_PER_VIEW)}
                aria-label={`Go to listing ${i + 1}`}
              />
            ))}
          </div>
        )}
      </section>

      {/* CTA BANNER */}
      <section className="owner-cta" id="for-owners">
        <div>
          <span className="section-eyebrow light">For property owners & managers</span>
          <h2>Your rentals deserve more than a disappearing post.</h2>
          <p>
            Organize your units, answer fewer repeated questions, and share a
            clear, trusted view of every accommodation.
          </p>
        </div>
        <Link to="/register" className="cta-button">
          List your accommodation <span className="button-arrow">→</span>
        </Link>
      </section>

      {/* FOOTER */}
      <footer className="landing-footer">
        <span className="footer-logo">RENTA</span>
        <span>Made for longer stays in Calapan City, Oriental Mindoro.</span>
        <span>© {new Date().getFullYear()}</span>
      </footer>

      {/* AUTH PROMPT MODAL */}
      {showAuthPrompt && (
        <div className="auth-modal-overlay" onClick={() => setShowAuthPrompt(false)}>
          <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
            <button className="auth-modal-close" onClick={() => setShowAuthPrompt(false)} aria-label="Close">
              ×
            </button>
            <h3>Sign in to view this listing</h3>
            <p>Create a free tenant account or sign in to see full accommodation details and request a viewing.</p>
            <div className="auth-modal-actions">
              <Link to="/login" className="auth-modal-btn primary">Sign in</Link>
              <Link to="/register" className="auth-modal-btn secondary">Create account</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Landing;