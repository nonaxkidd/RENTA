import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import api from "../services/api";
import PanoramaViewer from "../components/PanoramaViewer";
import "./ListingDetail.css";

interface ListingData {
  _id: string;
  title: string;
  type: string;
  barangay: string;
  price: number;
  transparency: number;
  verified: boolean;
  lat: number;
  lng: number;
  description: string;
  amenities: string[];
  houseRules: string[];
  capacity: number;
  available: boolean;
  ownerName: string;
  imageUrl?: string;
}

interface RentaUser {
  role?: string;
}

function createPriceIcon(priceLabel: string) {
  return L.divIcon({
    className: "price-marker-wrapper",
    html: `<div class="price-pin verified">${priceLabel}</div>`,
    iconSize: [70, 30],
    iconAnchor: [35, 15],
  });
}

function getAuthHeaders() {
  const token = localStorage.getItem("renta_token");
  return { headers: { Authorization: `Bearer ${token}` } };
}

function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const storedUser = localStorage.getItem("renta_user");
  const user: RentaUser = storedUser ? JSON.parse(storedUser) : {};
  const isTenant = user.role === "tenant";

  function goBack() {
    if (user.role === "tenant") {
      navigate("/tenant");
    } else if (user.role === "owner") {
      navigate("/owner");
    } else if (user.role === "admin") {
      navigate("/admin");
    } else {
      navigate("/");
    }
  }

  const [listing, setListing] = useState<ListingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [isFavorited, setIsFavorited] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await api.get(`/listings/${id}`);
        if (!cancelled) setListing(response.data.listing);
      } catch {
        if (!cancelled) setError("This listing couldn't be found.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Check whether this listing is already in the tenant's favorites
  useEffect(() => {
    if (!isTenant || !id) return;

    let cancelled = false;

    async function checkFavorite() {
      try {
        const response = await api.get("/favorites", getAuthHeaders());
        if (cancelled) return;
        const favoriteIds: string[] = response.data.favorites.map((f: any) => f._id);
        setIsFavorited(favoriteIds.includes(id!));
      } catch {
        // Silently ignore — favorites are a nice-to-have, not critical to the page loading
      }
    }

    checkFavorite();
    return () => {
      cancelled = true;
    };
  }, [id, isTenant]);

  // Record this view in the tenant's history (fire-and-forget — not
  // critical to the page working, so failures are silently ignored)
  useEffect(() => {
    if (!isTenant || !id) return;
    api.post(`/history/${id}`, {}, getAuthHeaders()).catch(() => {});
  }, [id, isTenant]);

  async function toggleFavorite() {
    if (!isTenant || !id || favoriteBusy) return;

    setFavoriteBusy(true);
    try {
      if (isFavorited) {
        await api.delete(`/favorites/${id}`, getAuthHeaders());
        setIsFavorited(false);
      } else {
        await api.post(`/favorites/${id}`, {}, getAuthHeaders());
        setIsFavorited(true);
      }
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
    } finally {
      setFavoriteBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="detail-page">
        <div className="detail-loading">
          <div className="detail-spinner" />
        </div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="detail-page">
        <div className="detail-error">
          <p>{error || "Something went wrong."}</p>
          <Link to="/" className="detail-back-link">← Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="detail-page">
      <nav className="detail-nav">
        <Link to="/" className="detail-logo">
          <span className="logo-circle">R.</span>
          <span className="logo-name">RENTA</span>
        </Link>
        <button onClick={goBack} className="detail-back-link detail-back-button">
          ← Back to listings
        </button>
      </nav>

      <div
        className="detail-hero"
        style={listing.imageUrl ? { backgroundImage: `url(${listing.imageUrl})` } : undefined}>
        {listing.verified && <span className="detail-verified-badge">Verified owner</span>}
                <button className="detail-tour-badge detail-tour-trigger" onClick={() => setShowTour(true)}>
          360° Tour
        </button>

        {isTenant && (
          <button
            className={isFavorited ? "detail-favorite-btn active" : "detail-favorite-btn"}
            onClick={toggleFavorite}
            disabled={favoriteBusy}
            aria-label={isFavorited ? "Remove from favorites" : "Save to favorites"}
            title={isFavorited ? "Remove from favorites" : "Save to favorites"}
          >
            {isFavorited ? "♥" : "♡"}
          </button>
        )}
      </div>

      <div className="detail-split">
        <div className="detail-info">
          <div className="detail-title-row">
            <div>
              <span className="detail-eyebrow">{listing.type} · {listing.barangay}</span>
              <h1>{listing.title}</h1>
            </div>
            <div className="detail-price-block">
              <span className="detail-price">₱{listing.price.toLocaleString()}</span>
              <span className="detail-price-sub">per month</span>
            </div>
          </div>

          <div className="detail-stats-row">
            <div className="detail-stat">
              <span className="detail-stat-label">Transparency</span>
              <span className="detail-stat-value">{listing.transparency}%</span>
            </div>
            <div className="detail-stat">
              <span className="detail-stat-label">Capacity</span>
              <span className="detail-stat-value">
                Up to {listing.capacity} {listing.capacity === 1 ? "person" : "people"}
              </span>
            </div>
            <div className="detail-stat">
              <span className="detail-stat-label">Availability</span>
              <span className="detail-stat-value">
                {listing.available ? "Available now" : "Currently occupied"}
              </span>
            </div>
          </div>

          <section className="detail-section">
            <h2>About this place</h2>
            <p>{listing.description}</p>
          </section>

          {listing.amenities.length > 0 && (
            <section className="detail-section">
              <h2>Amenities</h2>
              <div className="detail-tags">
                {listing.amenities.map((amenity) => (
                  <span className="detail-tag" key={amenity}>{amenity}</span>
                ))}
              </div>
            </section>
          )}

          {listing.houseRules.length > 0 && (
            <section className="detail-section">
              <h2>House rules</h2>
              <ul className="detail-list">
                {listing.houseRules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="detail-section">
            <h2>Owner</h2>
            <div className="detail-owner-card">
              <div className="detail-owner-avatar">
                {listing.ownerName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="detail-owner-name">{listing.ownerName}</p>
                <p className="detail-owner-sub">
                  {listing.verified ? "Identity verified by RENTA" : "Verification pending"}
                </p>
              </div>
            </div>
          </section>
        </div>
        <div className="detail-map-column">
            {showTour && (
          <div className="tour-modal-overlay" onClick={() => setShowTour(false)}>
            <div className="tour-modal" onClick={(e) => e.stopPropagation()}>
              <button className="tour-modal-close" onClick={() => setShowTour(false)} aria-label="Close">
                ×
              </button>
              <PanoramaViewer imageUrl="https://pannellum.org/images/alma.jpg" />
              <p className="tour-modal-note">
                Demo panorama — real owner-uploaded 360° tours are coming in a future update.
              </p>
            </div>
          </div>
            )}
          <div className="detail-map-wrap">
            <MapContainer
              center={[listing.lat, listing.lng]}
              zoom={15}
              scrollWheelZoom={false}
              style={{ height: "420px", width: "100%", borderRadius: "20px" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Marker
                position={[listing.lat, listing.lng]}
                icon={createPriceIcon(`₱${(listing.price / 1000).toFixed(1)}K`)}
              />
            </MapContainer>
          </div>
          <p className="detail-map-note">
            Exact address is shared only after a reservation is confirmed.
          </p>
        </div>
      </div>
    </div>
  );
}

export default ListingDetail;