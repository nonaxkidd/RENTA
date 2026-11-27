import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import { LockToCalapan } from "../components/BarangayPinMap";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import api from "../services/api";
import PanoramaTour from "../components/PanoramaTour";
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
  panoramaUrl?: string;
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
  const [searchParams] = useSearchParams();

  const storedUser = localStorage.getItem("renta_user");
  const user: RentaUser = storedUser ? JSON.parse(storedUser) : {};
  const isTenant = user.role === "tenant";

  function goBack() {
    if (user.role === "tenant") {
      navigate("/tenant");
    } else if (user.role === "owner") {
      navigate("/owner");
    } else if (user.role === "admin" || user.role === "superadmin") {
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
  const [reviews, setReviews] = useState<{ tenantName: string; rating: number; comment: string }[]>([]);
  const [average, setAverage] = useState(0);
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [moveIn, setMoveIn] = useState("");
  const [occupants, setOccupants] = useState("1");
  const [reserveNotes, setReserveNotes] = useState("");
  const [reserveMessage, setReserveMessage] = useState("");
  const [myReservation, setMyReservation] = useState<{ _id: string; queueStatus: string; ownerResponse?: string } | null>(null);
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    if (!tourOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setTourOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tourOpen]);

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

  useEffect(() => {
    if (!id) return;
    api.get(`/reviews/listing/${id}`)
      .then((response) => {
        setReviews(response.data.reviews ?? []);
        setAverage(response.data.average ?? 0);
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!isTenant || !id) return;
    api.get("/reservations/mine", getAuthHeaders())
      .then((response) => {
        const match = (response.data.reservations ?? []).find((item: { unitId?: { _id?: string } | string }) => {
          const unit = item.unitId;
          const unitId = typeof unit === "string" ? unit : unit?._id;
          return unitId === id;
        });
        setMyReservation(match ?? null);
      })
      .catch(() => {});
  }, [id, isTenant]);

  useEffect(() => {
    const reservationId = searchParams.get("reservation");
    if (!isTenant || !reservationId) return;
    api.post("/payments/sync", { reservationId }, getAuthHeaders())
      .then((response) => {
        if (response.data.status === "paid") {
          setReserveMessage("Down payment received. This listing is now reserved and no longer available.");
          setListing((current) => (current ? { ...current, available: false } : current));
        }
      })
      .catch((err) => setReserveMessage(err.response?.data?.message || "Payment is not confirmed yet."));
  }, [searchParams, isTenant]);

  async function submitReservation(event: FormEvent) {
    event.preventDefault();
    setReserveMessage("");
    try {
      const response = await api.post(`/reservations/listings/${id}`, {
        intendedMoveIn: moveIn,
        occupants: Number(occupants),
        notes: reserveNotes,
      }, getAuthHeaders());
      setMyReservation(response.data.reservation);
      setReserveMessage("Request sent. The listing stays available until the owner approves it and you pay the one-month down payment.");
    } catch (err: any) {
      setReserveMessage(err.response?.data?.message || "Couldn't send the reservation.");
    }
  }

  async function payDownPayment() {
    if (!myReservation) return;
    setReserveMessage("");
    try {
      const response = await api.post("/payments/checkout", { reservationId: myReservation._id }, getAuthHeaders());
      const checkoutUrl = String(response.data.checkoutUrl || "");
      const checkout = new URL(checkoutUrl, window.location.origin);
      if (checkout.pathname.startsWith("/pay/mock/")) {
        navigate(`${checkout.pathname}${checkout.search}${checkout.hash}`);
      } else {
        window.location.assign(checkoutUrl);
      }
    } catch (err: any) {
      setReserveMessage(err.response?.data?.message || "Couldn't start payment.");
    }
  }

  async function submitReview(event: FormEvent) {
    event.preventDefault();
    setReviewMessage("");
    try {
      await api.post(`/reviews/listing/${id}`, { rating: Number(rating), comment }, getAuthHeaders());
      setComment("");
      setReviewMessage("Thanks. Your rating was saved.");
      const response = await api.get(`/reviews/listing/${id}`);
      setReviews(response.data.reviews ?? []);
      setAverage(response.data.average ?? 0);
    } catch (err: any) {
      setReviewMessage(err.response?.data?.message || "Couldn't save your rating.");
    }
  }

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
        <button onClick={goBack} className="detail-back-link detail-back-button">
          ← Back
        </button>
        <Link to="/" className="detail-logo">
          <span className="logo-circle">R.</span>
          <span className="logo-name">RENTA</span>
        </Link>
      </nav>

      <div
        className="detail-hero"
        style={listing.imageUrl ? { backgroundImage: `url(${listing.imageUrl})` } : undefined}>
        {listing.verified && <span className="detail-verified-badge">Verified owner</span>}
        <button type="button" className="detail-tour-badge detail-tour-trigger" onClick={() => setTourOpen(true)}>
          Street View
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
                <p className="detail-owner-name">
                  {listing.ownerName}
                  {listing.verified && <span className="detail-verified-badge detail-owner-badge">Verified owner</span>}
                </p>
                <p className="detail-owner-sub">
                  {listing.verified ? "Identity verified by RENTA" : "Verification pending"}
                </p>
              </div>
            </div>
          </section>

          {isTenant && (
            <section className="detail-section">
              <h2>Reserve</h2>
              <p>
                Down payment is one month of rent (₱{listing.price.toLocaleString()}). The listing stays on Available until that payment is confirmed.
              </p>
              {myReservation ? (
                <div>
                  <p>Status: {myReservation.queueStatus.replaceAll("_", " ")}</p>
                  {myReservation.ownerResponse && <p>Owner comment: {myReservation.ownerResponse}</p>}
                  {myReservation.queueStatus === "payment_pending" && (
                    <button type="button" className="detail-submit" onClick={payDownPayment}>
                      Pay down payment
                    </button>
                  )}
                </div>
              ) : listing.available ? (
                <form className="detail-form" onSubmit={submitReservation}>
                  <label>
                    Move-in date
                    <input type="date" value={moveIn} onChange={(event) => setMoveIn(event.target.value)} required />
                  </label>
                  <label>
                    Occupants
                    <input type="number" min="1" max={listing.capacity} value={occupants} onChange={(event) => setOccupants(event.target.value)} required />
                  </label>
                  <label>
                    Notes
                    <textarea value={reserveNotes} onChange={(event) => setReserveNotes(event.target.value)} rows={3} />
                  </label>
                  <button type="submit" className="detail-submit">Request reservation</button>
                </form>
              ) : (
                <p>This listing is already reserved.</p>
              )}
              {reserveMessage && <p>{reserveMessage}</p>}
            </section>
          )}

          <section className="detail-section">
            <h2>Owner ratings {average > 0 ? `· ${average} / 5` : ""}</h2>
            {reviews.length === 0 && <p>No ratings yet.</p>}
            {reviews.map((review) => (
              <div className="detail-review" key={`${review.tenantName}-${review.comment}`}>
                <p className="detail-stars">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)} {review.tenantName}</p>
                <p>{review.comment}</p>
              </div>
            ))}
            {isTenant && (
              <form className="detail-form" onSubmit={submitReview}>
                <label>
                  Rating
                  <select value={rating} onChange={(event) => setRating(event.target.value)}>
                    {[5, 4, 3, 2, 1].map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Comment
                  <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} required />
                </label>
                <button type="submit" className="detail-submit">Rate owner</button>
              </form>
            )}
            {reviewMessage && <p>{reviewMessage}</p>}
          </section>
        </div>
        <div className="detail-map-column">
          <div className="detail-map-wrap">
            <MapContainer
              center={[listing.lat, listing.lng]}
              zoom={15}
              minZoom={13}
              maxZoom={18}
              scrollWheelZoom={false}
              style={{ height: "420px", width: "100%", borderRadius: "20px" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <LockToCalapan />
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

      {tourOpen && (
        <div className="tour-modal-overlay" onClick={() => setTourOpen(false)}>
          <div className="tour-modal" role="dialog" aria-label="Google Street View" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="tour-modal-close" onClick={() => setTourOpen(false)} aria-label="Close tour">
              ×
            </button>
            <PanoramaTour lat={listing.lat} lng={listing.lng} />
            <p className="tour-modal-note">Google Street View near this pin in Calapan City. Drag to look around.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default ListingDetail;