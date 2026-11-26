import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import OwnerVerificationPanel from "../components/OwnerVerificationPanel";
import BarangayPinMap from "../components/BarangayPinMap";
import { NotificationList, useNotificationFeed } from "../components/NotificationList";
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
  panoramaUrl?: string;
  reviewNote?: string;
  lat?: number;
  lng?: number;
  amenities?: string[];
  houseRules?: string[];
}

type ActiveView = "listings" | "reservations" | "notifications" | "account";
type ListingFilter = "all" | "verified" | "pending" | "available" | "occupied";
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
  const [barangays, setBarangays] = useState<string[]>([]);
  const [pinLat, setPinLat] = useState<number | null>(null);
  const [pinLng, setPinLng] = useState<number | null>(null);
  const [pinHint, setPinHint] = useState("Choose a barangay, then click inside Calapan to place the pin.");
  const [price, setPrice] = useState("");
  const [capacity, setCapacity] = useState("");
  const [description, setDescription] = useState("");
  const [amenitiesText, setAmenitiesText] = useState("");
  const [houseRulesText, setHouseRulesText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [panoramaUrl, setPanoramaUrl] = useState("");
  const [panoramaFile, setPanoramaFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const notifications = useNotificationFeed();
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [reservations, setReservations] = useState<Array<{
    _id: string;
    queueStatus: string;
    occupants: number;
    intendedMoveIn: string;
    notes?: string;
    queuePosition?: number | null;
    tenantId?: { firstName?: string; lastName?: string; email?: string };
    unitId?: { title?: string };
  }>>([]);
  const [reservationNotes, setReservationNotes] = useState<Record<string, string>>({});
  const [reservationMessage, setReservationMessage] = useState("");

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
    api.get("/listings/barangays")
      .then((response) => setBarangays(response.data.barangays ?? []))
      .catch(() => setFormMessage("Couldn't load the Calapan barangay list."));
  }, []);

  useEffect(() => {
    function loadReservations() {
      api.get("/reservations/owner", getAuthHeaders())
        .then((response) => setReservations(response.data.reservations ?? []))
        .catch((err) => setReservationMessage(err.response?.data?.message || "Couldn't load reservations."));
    }
    if (activeView === "reservations") loadReservations();
    const timer = window.setInterval(loadReservations, 30000);
    return () => window.clearInterval(timer);
  }, [activeView]);

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

  async function handleBarangayChange(name: string) {
    setBarangay(name);
    setPinLat(null);
    setPinLng(null);
    if (!name) {
      setPinHint("Choose a barangay, then click inside Calapan to place the pin.");
      return;
    }

    setPinHint("Finding that barangay on the map...");
    try {
      const response = await api.get("/listings/barangay-center", { params: { name } });
      setPinLat(response.data.lat);
      setPinLng(response.data.lng);
      setPinHint("The pin starts at the barangay. Click inside the city outline to move it to the exact house.");
    } catch {
      setPinHint("Click inside the city outline. The barangay center could not be loaded.");
    }
  }

  function resetForm() {
    setTitle("");
    setType(TYPE_OPTIONS[0]);
    setBarangay("");
    setPinLat(null);
    setPinLng(null);
    setPinHint("Choose a barangay, then click inside Calapan to place the pin.");
    setPrice("");
    setCapacity("");
    setDescription("");
    setAmenitiesText("");
    setHouseRulesText("");
    setImageUrl("");
    setPhotoFile(null);
    setPanoramaUrl("");
    setPanoramaFile(null);
    setEditingId(null);
    setFormMessage("");
  }

  function openEditor(listing: OwnerListing) {
    setEditingId(listing._id);
    setTitle(listing.title);
    setType(listing.type);
    setBarangay(listing.barangay);
    setPinLat(listing.lat ?? null);
    setPinLng(listing.lng ?? null);
    setPinHint("Move the pin if the location should change.");
    setPrice(String(listing.price));
    setCapacity(String(listing.capacity));
    setDescription(listing.description);
    setAmenitiesText((listing.amenities ?? []).join(", "));
    setHouseRulesText((listing.houseRules ?? []).join(", "));
    setImageUrl(listing.imageUrl ?? "");
    setPhotoFile(null);
    setPanoramaUrl(listing.panoramaUrl ?? "");
    setPanoramaFile(null);
    setFormMessage("");
    setShowForm(true);
  }

  async function removeListing(id: string) {
    if (!window.confirm("Remove this listing? A paid reservation keeps it listed.")) return;
    try {
      await api.delete(`/listings/${id}`, getAuthHeaders());
      loadMyListings();
    } catch (err: any) {
      setError(err.response?.data?.message || "Couldn't remove that listing.");
    }
  }

  async function handleCreateListing(event: React.FormEvent) {
    event.preventDefault();
    setFormMessage("");

    if (Number(price) <= 0 || Number(capacity) <= 0) {
      setFormMessage("Price and capacity must be positive numbers.");
      return;
    }

    if (!barangay || pinLat == null || pinLng == null) {
      setFormMessage("Choose a barangay and click the map to place the pin.");
      return;
    }

    try {
      setSubmitting(true);
      let photo = imageUrl.trim();
      if (photoFile) {
        const body = new FormData();
        body.append("photo", photoFile);
        const uploaded = await api.post("/listings/photo", body, getAuthHeaders());
        photo = uploaded.data.imageUrl;
      }
      if (!photo) {
        setFormMessage("Upload a photo or paste a photo link.");
        return;
      }

      let panorama = panoramaUrl.trim();
      if (panoramaFile) {
        const body = new FormData();
        body.append("photo", panoramaFile);
        const uploaded = await api.post("/listings/photo", body, getAuthHeaders());
        panorama = uploaded.data.imageUrl;
      }

      const payload = {
          title,
          type,
          barangay,
          lat: pinLat,
          lng: pinLng,
          price: Number(price),
          capacity: Number(capacity),
          description,
          amenities: amenitiesText.split(",").map((a) => a.trim()).filter(Boolean),
          houseRules: houseRulesText.split(",").map((r) => r.trim()).filter(Boolean),
          ownerName: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
          imageUrl: photo,
          panoramaUrl: panorama,
      };
      const response = editingId
        ? await api.put(`/listings/${editingId}`, payload, getAuthHeaders())
        : await api.post("/listings", payload, getAuthHeaders());
      setFormMessage(response.data.message || "");

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
          <button className="odash-new-btn" onClick={() => { if (showForm) { setShowForm(false); resetForm(); } else { resetForm(); setShowForm(true); } }}>
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
            <h2>{editingId ? "Edit listing" : "Create a new listing"}</h2>

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
                <label>Barangay in Calapan</label>
                <select value={barangay} onChange={(e) => handleBarangayChange(e.target.value)} required>
                  <option value="">Select a barangay</option>
                  {barangays.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
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

            <div className="odash-map">
              <BarangayPinMap
                lat={pinLat}
                lng={pinLng}
                onPick={(lat, lng) => {
                  setPinLat(lat);
                  setPinLng(lng);
                  setPinHint("Pin placed inside Calapan. Click again if you need to move it.");
                }}
                onOutside={() => {
                  setPinHint("That spot is outside Calapan City. Keep the pin inside the city.");
                }}
              />
            </div>
            <p className="odash-hint">{pinHint}</p>

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
              <label>Photo</label>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="or paste a photo link"
              />
            </div>

            <div className="odash-form-group">
              <label>360° photo (optional)</label>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPanoramaFile(e.target.files?.[0] ?? null)} />
              <input
                type="url"
                value={panoramaUrl}
                onChange={(e) => setPanoramaUrl(e.target.value)}
                placeholder="or paste a 360° photo link"
              />
              <p className="odash-hint">Use a full equirectangular JPEG, PNG, or WebP. Changing it on an approved listing sends the listing back for review.</p>
            </div>

            {formMessage && <p className="odash-form-message">{formMessage}</p>}

            <button type="submit" className="odash-submit-btn" disabled={submitting}>
              {submitting ? "Saving..." : editingId ? "Save listing" : "Create listing"}
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
                    <span className={listing.verified ? "odash-badge verified" : listing.reviewNote ? "odash-badge rejected" : "odash-badge pending"}>
                      {listing.verified ? "Verified" : listing.reviewNote ? "Disapproved" : "Pending review"}
                    </span>
                  </div>
                  <div className="odash-listing-info">
                    <div className="odash-listing-meta">
                      <span>{listing.type} · {listing.barangay}</span>
                      <span className="odash-listing-price">₱{listing.price.toLocaleString()}/mo</span>
                    </div>
                    <h3>{listing.title}</h3>
                    <span className="odash-listing-status">
                      {listing.available ? "Available" : "Reserved"}
                    </span>
                    {listing.reviewNote && !listing.verified && (
                      <p className="odash-hint">Disapproval comment: {listing.reviewNote}</p>
                    )}
                    <button type="button" className="odash-new-btn" onClick={() => openEditor(listing)}>Edit</button>
                    <button type="button" className="odash-new-btn" onClick={() => removeListing(listing._id)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </>
    );
  }

  async function decideReservation(id: string, decision: "approve" | "reject") {
    setReservationMessage("");
    try {
      const response = await api.patch(
        `/reservations/${id}/decision`,
        { decision, responseNote: reservationNotes[id] || "" },
        getAuthHeaders()
      );
      setReservationMessage(response.data.message);
      const refreshed = await api.get("/reservations/owner", getAuthHeaders());
      setReservations(refreshed.data.reservations ?? []);
    } catch (err: any) {
      setReservationMessage(err.response?.data?.message || "Couldn't save that decision.");
    }
  }

  function renderReservationsView() {
    return (
      <>
        <div className="odash-header">
          <div>
            <p className="odash-eyebrow">MANAGE</p>
            <h1>Reservations</h1>
            <p className="odash-subtext">
              Approving a request starts the down payment. The listing stays available until that payment is confirmed.
            </p>
          </div>
        </div>
        {reservationMessage && <p className="odash-form-message">{reservationMessage}</p>}
        {reservations.length === 0 ? (
          <div className="odash-empty">
            <p className="odash-empty-title">No reservation requests yet</p>
          </div>
        ) : (
          reservations.map((reservation) => (
            <div className="odash-listing-card" key={reservation._id} style={{ marginBottom: 12 }}>
              <div className="odash-listing-info">
                <h3>{reservation.unitId?.title || "Listing"}</h3>
                <p>
                  {reservation.tenantId?.firstName} {reservation.tenantId?.lastName} · {reservation.tenantId?.email}
                </p>
                <p>
                  Move-in {new Date(reservation.intendedMoveIn).toLocaleDateString()} · {reservation.occupants} occupant(s) · {reservation.queueStatus}
                  {reservation.queuePosition ? ` · queue #${reservation.queuePosition}` : ""}
                </p>
                {reservation.notes && <p className="odash-hint">{reservation.notes}</p>}
                {reservation.queueStatus === "queued" && (
                  <>
                    <textarea
                      rows={2}
                      placeholder="Comment (required if you disapprove)"
                      value={reservationNotes[reservation._id] || ""}
                      onChange={(event) =>
                        setReservationNotes((current) => ({ ...current, [reservation._id]: event.target.value }))
                      }
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button type="button" className="odash-new-btn" onClick={() => decideReservation(reservation._id, "approve")}>
                        Approve
                      </button>
                      <button type="button" className="odash-new-btn" onClick={() => decideReservation(reservation._id, "reject")}>
                        Disapprove
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))
        )}
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
              {sidebarExpanded && <span>Notifications{notifications.unread > 0 ? ` (${notifications.unread})` : ""}</span>}
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

            {activeView === "reservations" && renderReservationsView()}

            {activeView === "notifications" && (
              <>
                <div className="odash-header">
                  <div>
                    <p className="odash-eyebrow">YOU</p>
                    <h1>Notifications</h1>
                  </div>
                </div>
                <NotificationList items={notifications.items} onRead={notifications.markRead} />
              </>
            )}

            {activeView === "account" && renderAccountView()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default OwnerDashboard;