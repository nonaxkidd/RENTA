import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import OwnerVerificationPanel from "../components/OwnerVerificationPanel";
import "./OwnerDashboard.css";

interface RentaUser {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  status?: string;
}

interface OwnerListing {
  _id: string;
  title: string;
  type: string;
  barangay: string;
  price: number;
  capacity: number;
  verified: boolean;
  available: boolean;
  description: string;
  imageUrl?: string;
}

type ActiveView = "listings" | "reservations" | "viewings" | "notifications" | "account";
type ListingFilter = "all" | "verified" | "pending" | "available" | "occupied";
type IconComponent = () => React.ReactElement;

const TYPE_OPTIONS = ["Private room", "Studio unit", "1BR unit", "2BR unit", "Bedspace"];

const FILTER_LABELS: Record<ListingFilter, string> = {
  all: "My listings",
  verified: "Verified listings",
  pending: "Pending review",
  available: "Available listings",
  occupied: "Occupied listings",
};

/* ---------- LINE ICONS (hand-built, no external library) ---------- */

function IconMenu() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
function IconHome() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h5v-6h4v6h5V10" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </svg>
  );
}
function IconEye() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function IconCheckCircle() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}
function IconDoor() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="1" />
      <circle cx="14" cy="12" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconLock() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
function IconBell() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 12 6 8z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}
function IconPower() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v8" />
      <path d="M6.5 6.5a8 8 0 1 0 11 0" />
    </svg>
  );
}

function OwnerDashboard() {
  const navigate = useNavigate();

  const storedUser = localStorage.getItem("renta_user");
  const user: RentaUser = storedUser ? JSON.parse(storedUser) : {};
  const initial = user.firstName ? user.firstName.charAt(0).toUpperCase() : "O";

  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>("listings");
  const [listingFilter, setListingFilter] = useState<ListingFilter>("all");
  const [showForm, setShowForm] = useState(false);
  const [, setUserVersion] = useState(0);

  const [listings, setListings] = useState<OwnerListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Form state
  const [title, setTitle] = useState("");
  const [type, setType] = useState(TYPE_OPTIONS[0]);
  const [barangay, setBarangay] = useState("");
  const [price, setPrice] = useState("");
  const [capacity, setCapacity] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [description, setDescription] = useState("");
  const [amenitiesText, setAmenitiesText] = useState("");
  const [houseRulesText, setHouseRulesText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState("");

  function getAuthHeaders() {
    const token = localStorage.getItem("renta_token");
    return { headers: { Authorization: `Bearer ${token}` } };
  }

  async function loadMyListings() {
    try {
      setLoading(true);
      const response = await api.get("/listings/mine", getAuthHeaders());
      setListings(response.data.listings);
    } catch (err: any) {
      setError(err.response?.data?.message || "Couldn't load your listings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMyListings();
  }, []);

  function handleLogout() {
    localStorage.removeItem("renta_token");
    localStorage.removeItem("renta_user");
    navigate("/login");
  }

  function goToListings(filter: ListingFilter) {
    setActiveView("listings");
    setListingFilter(filter);
  }

  function goToView(view: ActiveView) {
    setActiveView(view);
  }

  function resetForm() {
    setTitle("");
    setType(TYPE_OPTIONS[0]);
    setBarangay("");
    setPrice("");
    setCapacity("");
    setLat("");
    setLng("");
    setDescription("");
    setAmenitiesText("");
    setHouseRulesText("");
    setImageUrl("");
    setFormMessage("");
  }

  async function handleCreateListing(event: React.FormEvent) {
    event.preventDefault();
    setFormMessage("");

    if (Number(price) <= 0 || Number(capacity) <= 0) {
      setFormMessage("Price and capacity must be positive numbers.");
      return;
    }

    try {
      setSubmitting(true);

      await api.post(
        "/listings",
        {
          title,
          type,
          barangay,
          price: Number(price),
          capacity: Number(capacity),
          lat: Number(lat),
          lng: Number(lng),
          description,
          amenities: amenitiesText.split(",").map((a) => a.trim()).filter(Boolean),
          houseRules: houseRulesText.split(",").map((r) => r.trim()).filter(Boolean),
          ownerName: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
          imageUrl: imageUrl.trim() || undefined,
        },
        getAuthHeaders()
      );

      resetForm();
      setShowForm(false);
      loadMyListings();
    } catch (err: any) {
      setFormMessage(err.response?.data?.message || "Failed to create listing.");
    } finally {
      setSubmitting(false);
    }
  }

  const isPending = user.status === "pending";

  const visibleListings = listings.filter((listing) => {
    if (listingFilter === "verified") return listing.verified;
    if (listingFilter === "pending") return !listing.verified;
    if (listingFilter === "available") return listing.available;
    if (listingFilter === "occupied") return !listing.available;
    return true;
  });

  function renderListingsView() {
    return (
      <>
        <div className="odash-header">
          <div>
            <p className="odash-eyebrow">OWNER DASHBOARD</p>
            <h1>
              {listingFilter === "all"
                ? `Welcome back${user.firstName ? `, ${user.firstName}` : ""}.`
                : FILTER_LABELS[listingFilter]}
            </h1>
          </div>
          <button className="odash-new-btn" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "+ New listing"}
          </button>
        </div>

        {isPending && (
          <div className="odash-pending-banner">
            <strong>Your owner account is pending verification.</strong> You can still create
            listings, but they won't be visible to tenants until an administrator verifies your
            account and approves each listing.
          </div>
        )}

        {showForm && (
          <form className="odash-form" onSubmit={handleCreateListing}>
            <h2>Create a new listing</h2>

            <div className="odash-form-row">
              <div className="odash-form-group">
                <label>Title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div className="odash-form-group">
                <label>Type</label>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div className="odash-form-row">
              <div className="odash-form-group">
                <label>Barangay</label>
                <input
                  value={barangay}
                  onChange={(e) => setBarangay(e.target.value)}
                  placeholder="Brgy. Bayanan"
                  required
                />
              </div>
              <div className="odash-form-group">
                <label>Monthly price (₱)</label>
                <input type="number" min="1" value={price} onChange={(e) => setPrice(e.target.value)} required />
              </div>
              <div className="odash-form-group">
                <label>Capacity</label>
                <input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} required />
              </div>
            </div>

            <div className="odash-form-row">
              <div className="odash-form-group">
                <label>Approximate latitude</label>
                <input type="number" step="0.0001" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="13.41" required />
              </div>
              <div className="odash-form-group">
                <label>Approximate longitude</label>
                <input type="number" step="0.0001" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="121.18" required />
              </div>
            </div>
            <p className="odash-hint">
              Use an approximate point near your property, not the exact address — RENTA only
              shows approximate locations publicly, per platform policy.
            </p>

            <div className="odash-form-group">
              <label>Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} required />
            </div>

            <div className="odash-form-row">
              <div className="odash-form-group">
                <label>Amenities (comma-separated)</label>
                <input value={amenitiesText} onChange={(e) => setAmenitiesText(e.target.value)} placeholder="Wi-Fi, Parking, CCTV" />
              </div>
              <div className="odash-form-group">
                <label>House rules (comma-separated)</label>
                <input value={houseRulesText} onChange={(e) => setHouseRulesText(e.target.value)} placeholder="No smoking, No pets" />
              </div>
            </div>

            <div className="odash-form-group">
              <label>Photo URL (optional)</label>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/your-property-photo.jpg"
              />
            </div>

            <div className="odash-media-placeholder">
              Direct file uploads and 360° tour uploads are coming in a future update — for now, paste a link to a hosted photo above.
            </div>

            {formMessage && <p className="odash-form-message">{formMessage}</p>}

            <button type="submit" className="odash-submit-btn" disabled={submitting}>
              {submitting ? "Creating..." : "Create listing"}
            </button>
          </form>
        )}

        <section className="odash-listings-section">
          <h2>{FILTER_LABELS[listingFilter]}</h2>

          {loading ? (
            <p className="odash-muted">Loading your listings...</p>
          ) : error ? (
            <p className="odash-muted">{error}</p>
          ) : listings.length === 0 ? (
            <div className="odash-empty">
              <p className="odash-empty-title">You haven't created any listings yet.</p>
              {!showForm && (
                <button className="odash-new-btn" onClick={() => setShowForm(true)}>+ Create your first listing</button>
              )}
            </div>
          ) : visibleListings.length === 0 ? (
            <div className="odash-empty">
              <p className="odash-empty-title">No listings match this filter.</p>
            </div>
          ) : (
            <div className="odash-listing-grid">
              {visibleListings.map((listing) => (
                <div className="odash-listing-card" key={listing._id}>
                  <div
                    className="odash-listing-thumb"
                    style={listing.imageUrl ? { backgroundImage: `url(${listing.imageUrl})` } : undefined}
                  >
                    <span className={listing.verified ? "odash-badge verified" : "odash-badge pending"}>
                      {listing.verified ? "Verified" : "Pending review"}
                    </span>
                  </div>
                  <div className="odash-listing-info">
                    <div className="odash-listing-meta">
                      <span>{listing.type} · {listing.barangay}</span>
                      <span className="odash-listing-price">₱{listing.price.toLocaleString()}/mo</span>
                    </div>
                    <h3>{listing.title}</h3>
                    <span className="odash-listing-status">
                      {listing.available ? "Available" : "Occupied"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </>
    );
  }

  function renderComingSoon(
    eyebrow: string,
    heading: string,
    subtext: string,
    Icon: IconComponent,
    emptyTitle: string,
    emptyText: string
  ) {
    return (
      <>
        <div className="odash-header">
          <div>
            <p className="odash-eyebrow">{eyebrow}</p>
            <h1>{heading}</h1>
            <p className="odash-subtext">{subtext}</p>
          </div>
        </div>
        <div className="odash-empty">
          <div className="odash-empty-icon"><Icon /></div>
          <p className="odash-empty-title">{emptyTitle}</p>
          <p className="odash-empty-text">{emptyText}</p>
        </div>
      </>
    );
  }

  function renderAccountView() {
    return (
      <>
        <div className="odash-header">
          <div>
            <p className="odash-eyebrow">YOU</p>
            <h1>Account</h1>
            <p className="odash-subtext">Your RENTA owner profile.</p>
          </div>
        </div>

        <div className="odash-profile-card">
          <div className="odash-profile-header">
            <div className="odash-profile-avatar">{initial}</div>
            <div>
              <p className="odash-profile-name">
                {user.firstName ? `${user.firstName} ${user.lastName ?? ""}` : "Owner"}
              </p>
              <p className="odash-profile-role">Property owner / manager</p>
            </div>
          </div>

          <div className="odash-profile-row">
            <span className="odash-profile-label">Email</span>
            <span className="odash-profile-value">{user.email ?? "—"}</span>
          </div>
          <div className="odash-profile-row">
            <span className="odash-profile-label">Verification status</span>
            <span className={user.status === "active" ? "odash-status-pill active" : "odash-status-pill pending"}>
              {user.status === "active"
                ? "Verified"
                : user.status === "rejected"
                ? "Rejected"
                : user.status === "suspended"
                ? "Suspended"
                : "Pending verification"}
            </span>
          </div>
          <div className="odash-profile-row">
            <span className="odash-profile-label">Total listings</span>
            <span className="odash-profile-value">{listings.length}</span>
          </div>

          <button className="odash-profile-logout" onClick={handleLogout}>
            Log out
          </button>
        </div>

        <OwnerVerificationPanel onStatusChange={() => setUserVersion((v) => v + 1)} />
      </>
    );
  }

  function sidebarItemClass(isActive: boolean) {
    return isActive ? "odash-sidebar-item active" : "odash-sidebar-item";
  }

  return (
    <div className="odash-shell">
      <header className="odash-topbar">
        <button
          className="odash-hamburger"
          onClick={() => setSidebarExpanded((v) => !v)}
          aria-label="Toggle menu"
        >
          <IconMenu />
        </button>
        <button className="odash-logo" onClick={() => goToListings("all")}>
          <span className="odash-logo-circle">R.</span>
          <span className="odash-logo-text">RENTA</span>
        </button>
      </header>

      <div className="odash-body">
        <aside className={sidebarExpanded ? "odash-sidebar expanded" : "odash-sidebar"}>
          <div className="odash-sidebar-section">
            <button
              className={sidebarItemClass(activeView === "listings" && listingFilter === "all")}
              onClick={() => goToListings("all")}
            >
              <IconHome />
              {sidebarExpanded && <span>My listings</span>}
            </button>
          </div>

          <div className="odash-sidebar-divider" />

          <div className="odash-sidebar-section">
            {sidebarExpanded && <span className="odash-sidebar-label">Manage</span>}
            <button
              className={sidebarItemClass(activeView === "reservations")}
              onClick={() => goToView("reservations")}
            >
              <IconCalendar />
              {sidebarExpanded && <span>Reservations</span>}
            </button>
            <button
              className={sidebarItemClass(activeView === "viewings")}
              onClick={() => goToView("viewings")}
            >
              <IconEye />
              {sidebarExpanded && <span>Viewing requests</span>}
            </button>
          </div>

          <div className="odash-sidebar-divider" />

          <div className="odash-sidebar-section">
            {sidebarExpanded && <span className="odash-sidebar-label">Listings</span>}
            <button
              className={sidebarItemClass(activeView === "listings" && listingFilter === "verified")}
              onClick={() => goToListings("verified")}
            >
              <IconCheckCircle />
              {sidebarExpanded && <span>Verified</span>}
            </button>
            <button
              className={sidebarItemClass(activeView === "listings" && listingFilter === "pending")}
              onClick={() => goToListings("pending")}
            >
              <IconClock />
              {sidebarExpanded && <span>Pending review</span>}
            </button>
            <button
              className={sidebarItemClass(activeView === "listings" && listingFilter === "available")}
              onClick={() => goToListings("available")}
            >
              <IconDoor />
              {sidebarExpanded && <span>Available</span>}
            </button>
            <button
              className={sidebarItemClass(activeView === "listings" && listingFilter === "occupied")}
              onClick={() => goToListings("occupied")}
            >
              <IconLock />
              {sidebarExpanded && <span>Occupied</span>}
            </button>
          </div>

          <div className="odash-sidebar-divider" />

          <div className="odash-sidebar-section">
            {sidebarExpanded && <span className="odash-sidebar-label">You</span>}
            <button
              className={sidebarItemClass(activeView === "notifications")}
              onClick={() => goToView("notifications")}
            >
              <IconBell />
              {sidebarExpanded && <span>Notifications</span>}
            </button>
            <button
              className={sidebarItemClass(activeView === "account")}
              onClick={() => goToView("account")}
            >
              <IconUser />
              {sidebarExpanded && <span>{user.firstName ?? "Account"}</span>}
            </button>
          </div>

          <div className="odash-sidebar-section odash-sidebar-bottom">
            <button className="odash-sidebar-item" onClick={handleLogout}>
              <IconPower />
              {sidebarExpanded && <span>Log out</span>}
            </button>
          </div>
        </aside>

        <main className="odash-main">
          <div className="odash-content">
            {activeView === "listings" && renderListingsView()}

            {activeView === "reservations" &&
              renderComingSoon(
                "MANAGE",
                "Reservations",
                "Review and respond to tenant reservation requests.",
                IconCalendar,
                "No reservation requests yet",
                "Reservation requests from tenants will appear here once reservations are enabled."
              )}

            {activeView === "viewings" &&
              renderComingSoon(
                "MANAGE",
                "Viewing requests",
                "Approve, reject, or reschedule in-person viewings.",
                IconEye,
                "No viewing requests yet",
                "Viewing requests from tenants will appear here once that feature is enabled."
              )}

            {activeView === "notifications" &&
              renderComingSoon(
                "YOU",
                "Notifications",
                "Updates about your listings and account.",
                IconBell,
                "No notifications yet",
                "You'll see updates here once RENTA's notification system is live."
              )}

            {activeView === "account" && renderAccountView()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default OwnerDashboard;