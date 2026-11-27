import { useState, useMemo, useEffect, useRef } from "react";
import type { FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Tooltip } from "react-leaflet";
import { LockToCalapan } from "../components/BarangayPinMap";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import api from "../services/api";
import { CompareBar, CompareToggle } from "../components/CompareWidgets";
import { NotificationList, useNotificationFeed } from "../components/NotificationList";
import type { CompareItem } from "../components/CompareWidgets";
import "../components/CompareWidgets.css";
import "./TenantDashboard.css";

interface RentaUser {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: string;
}

interface ApiListing {
  _id: string;
  title: string;
  type: string;
  barangay: string;
  price: number;
  transparency: number;
  verified: boolean;
  capacity: number;
  lat: number;
  lng: number;
  panoramaUrl?: string;
}

interface HistoryEntry {
  listing: ApiListing | null;
  viewedAt: string;
}

const CALAPAN_CENTER: [number, number] = [13.4117, 121.1803];

const TYPE_OPTIONS = ["All types", "Private room", "Studio unit", "1BR unit", "2BR unit", "Bedspace"];
const PRICE_OPTIONS = [
  { label: "Any price", min: 0, max: Infinity },
  { label: "Under ₱5,000", min: 0, max: 5000 },
  { label: "₱5,000 - ₱8,000", min: 5000, max: 8000 },
  { label: "Over ₱8,000", min: 8000, max: Infinity },
];
const CAPACITY_OPTIONS = ["Any capacity", "1 person", "2 people", "3+ people"];

const COMPARE_KEY = "renta_compare";
const COMPARE_LIMIT = 2;

type ActiveView = "discover" | "saved" | "history" | "reservations" | "notifications" | "account";

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
function IconHeart() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z" />
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
function IconBed() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6" />
      <path d="M3 18v2" />
      <path d="M21 18v2" />
      <path d="M7 10V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
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
function IconLayers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}
function IconBuilding() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M9 21v-4h6v4" />
    </svg>
  );
}

const TYPE_ICONS: Record<string, () => React.ReactElement> = {
  "Private room": IconDoor,
  "Studio unit": IconLayers,
  "1BR unit": IconBuilding,
  "2BR unit": IconBuilding,
  "Bedspace": IconBed,
};

function createPinIcon(verified: boolean) {
  const fill = verified ? "#d7f542" : "#061f29";
  const dot = verified ? "#061f29" : "#f5f4ed";
  const svg = `
    <svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 24 14 24s14-13.5 14-24C28 6.3 21.7 0 14 0z" fill="${fill}" stroke="#ffffff" stroke-width="1.5"/>
      <circle cx="14" cy="14" r="5" fill="${dot}"/>
    </svg>`;
  return L.divIcon({
    className: "gps-marker-wrapper",
    html: svg,
    iconSize: [28, 38],
    iconAnchor: [14, 38],
    popupAnchor: [0, -34],
  });
}

function getAuthHeaders() {
  const token = localStorage.getItem("renta_token");
  return { headers: { Authorization: `Bearer ${token}` } };
}

function formatRelativeTime(dateString: string) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

// Selected comparison listings live in sessionStorage, so they survive
// going to the compare page and coming back (but not closing the tab).
function loadCompare(): CompareItem[] {
  try {
    const raw = sessionStorage.getItem(COMPARE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item.id === "string" && typeof item.title === "string")
      .slice(0, COMPARE_LIMIT);
  } catch {
    return [];
  }
}

function TenantDashboard() {
  const navigate = useNavigate();

  const storedUser = localStorage.getItem("renta_user");
  const [user, setUser] = useState<RentaUser>(storedUser ? JSON.parse(storedUser) : {});
  const [profileForm, setProfileForm] = useState({
    firstName: (storedUser ? JSON.parse(storedUser).firstName : "") || "",
    lastName: (storedUser ? JSON.parse(storedUser).lastName : "") || "",
    phone: (storedUser ? JSON.parse(storedUser).phone : "") || "",
  });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });
  const [accountMessage, setAccountMessage] = useState("");
  const initial = user.firstName ? user.firstName.charAt(0).toUpperCase() : "T";

  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>("discover");

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState(TYPE_OPTIONS[0]);
  const [priceFilter, setPriceFilter] = useState(PRICE_OPTIONS[0].label);
  const [capacityFilter, setCapacityFilter] = useState(CAPACITY_OPTIONS[0]);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");

  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchAreaRef = useRef<HTMLDivElement>(null);

  const [realListings, setRealListings] = useState<ApiListing[]>([]);
  const [realListingsLoading, setRealListingsLoading] = useState(true);
  const [realListingsError, setRealListingsError] = useState("");

  const [savedListings, setSavedListings] = useState<ApiListing[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState("");
  const [savedLoaded, setSavedLoaded] = useState(false);

  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const [compareItems, setCompareItems] = useState<CompareItem[]>(loadCompare);
  const [myReservations, setMyReservations] = useState<Array<{
    _id: string;
    queueStatus: string;
    downPaymentAmount?: number;
    occupants?: number;
    intendedMoveIn?: string;
    unitId?: { _id?: string; title?: string; barangay?: string; price?: number };
  }>>([]);
  const [reservationMessage, setReservationMessage] = useState("");
  const notifications = useNotificationFeed();

  useEffect(() => {
    function loadReservations() {
      api.get("/reservations/mine", getAuthHeaders())
        .then((response) => setMyReservations(response.data.reservations ?? []))
        .catch((error) => setReservationMessage(error.response?.data?.message || "Couldn't load reservations."));
    }
    loadReservations();
    const timer = window.setInterval(loadReservations, 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ limit: "50" });
        const q = query.trim();
        if (q) params.set("q", q);
        const response = await api.get(`/listings?${params.toString()}`);
        if (!cancelled) {
          setRealListings(response.data.listings);
          setRealListingsError("");
        }
      } catch {
        if (!cancelled) setRealListingsError("Couldn't load listings right now.");
      } finally {
        if (!cancelled) setRealListingsLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchAreaRef.current && !searchAreaRef.current.contains(event.target as Node)) {
        setFiltersOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    sessionStorage.setItem(COMPARE_KEY, JSON.stringify(compareItems));
  }, [compareItems]);

  useEffect(() => {
    if (activeView !== "saved" || savedLoaded) return;

    let cancelled = false;

    async function loadSaved() {
      try {
        setSavedLoading(true);
        const response = await api.get("/favorites", getAuthHeaders());
        if (!cancelled) setSavedListings(response.data.favorites);
      } catch {
        if (!cancelled) setSavedError("Couldn't load your saved listings.");
      } finally {
        if (!cancelled) {
          setSavedLoading(false);
          setSavedLoaded(true);
        }
      }
    }

    loadSaved();
    return () => {
      cancelled = true;
    };
  }, [activeView, savedLoaded]);

  useEffect(() => {
    if (activeView !== "history" || historyLoaded) return;

    let cancelled = false;

    async function loadHistory() {
      try {
        setHistoryLoading(true);
        const response = await api.get("/history", getAuthHeaders());
        if (!cancelled) setHistoryEntries(response.data.history);
      } catch {
        if (!cancelled) setHistoryError("Couldn't load your history.");
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
          setHistoryLoaded(true);
        }
      }
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [activeView, historyLoaded]);

  const newListings = realListings.slice(0, 4);
  const popularListings = useMemo(
    () => [...realListings].sort((a, b) => b.transparency - a.transparency).slice(0, 4),
    [realListings]
  );
  const generalListings = realListings;

  function handleLogout() {
    localStorage.removeItem("renta_token");
    localStorage.removeItem("renta_user");
    sessionStorage.removeItem(COMPARE_KEY);
    navigate("/login");
  }

  function goToDiscover() {
    setActiveView("discover");
    setQuery("");
    setTypeFilter(TYPE_OPTIONS[0]);
    setPriceFilter(PRICE_OPTIONS[0].label);
    setCapacityFilter(CAPACITY_OPTIONS[0]);
    setVerifiedOnly(false);
    setHasSearched(false);
  }

  function goToView(view: ActiveView) {
    setActiveView(view);
  }

  function exploreType(type: string) {
    setActiveView("discover");
    setTypeFilter(type);
    setHasSearched(true);
  }

  /* ----- COMPARE ----- */

  function toggleCompare(listing: ApiListing) {
    setCompareItems((current) => {
      if (current.some((item) => item.id === listing._id)) {
        return current.filter((item) => item.id !== listing._id);
      }
      if (current.length >= COMPARE_LIMIT) return current;
      return [...current, { id: listing._id, title: listing.title }];
    });
  }

  function removeCompare(id: string) {
    setCompareItems((current) => current.filter((item) => item.id !== id));
  }

  function goCompare() {
    if (compareItems.length !== COMPARE_LIMIT) return;
    navigate(`/compare?a=${compareItems[0].id}&b=${compareItems[1].id}`);
  }

  const activePriceRange = PRICE_OPTIONS.find((p) => p.label === priceFilter) ?? PRICE_OPTIONS[0];

  const filteredListings = useMemo(() => {
    return realListings.filter((listing) => {
      const matchesType = typeFilter === "All types" || listing.type === typeFilter;
      const matchesPrice = listing.price >= activePriceRange.min && listing.price <= activePriceRange.max;
      const matchesCapacity =
        capacityFilter === "Any capacity" ||
        (capacityFilter === "1 person" && listing.capacity === 1) ||
        (capacityFilter === "2 people" && listing.capacity === 2) ||
        (capacityFilter === "3+ people" && listing.capacity >= 3);
      const matchesVerified = !verifiedOnly || listing.verified;

      return matchesType && matchesPrice && matchesCapacity && matchesVerified;
    });
  }, [realListings, typeFilter, activePriceRange, capacityFilter, verifiedOnly]);

  function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    setHasSearched(true);
  }

  function clearFilters() {
    setQuery("");
    setTypeFilter(TYPE_OPTIONS[0]);
    setPriceFilter(PRICE_OPTIONS[0].label);
    setCapacityFilter(CAPACITY_OPTIONS[0]);
    setVerifiedOnly(false);
    setHasSearched(false);
  }

  function renderCard(listing: ApiListing, key: string, viewedAt?: string) {
    const selected = compareItems.some((item) => item.id === listing._id);
    const limitReached = !selected && compareItems.length >= COMPARE_LIMIT;

    return (
      <div className="cmp-card-wrap" key={key}>
        <Link
          to={`/listings/${listing._id}`}
          state={{ from: "/tenant" }}
          className="bracket-listing-card"
        >
          <div className="bracket-listing-thumb">
            <span className="bracket-tour-badge">{listing.lat != null && listing.lng != null ? "Street View" : "Photos"}</span>
            {listing.verified && <span className="bracket-verified-tag">Verified</span>}
          </div>
          <div className="bracket-listing-info">
            <div className="bracket-listing-meta">
              <span>{listing.type} · {listing.barangay}</span>
              <span className="bracket-listing-price">₱{listing.price.toLocaleString()}/mo</span>
            </div>
            <h3>{listing.title}</h3>
            <div className="bracket-listing-footer">
              <span>Up to {listing.capacity} {listing.capacity === 1 ? "person" : "people"}</span>
              <span className="bracket-listing-score">{listing.transparency}%</span>
            </div>
            {viewedAt && <p className="bracket-viewed-note">Viewed {formatRelativeTime(viewedAt)}</p>}
          </div>
        </Link>

        <CompareToggle
          selected={selected}
          disabled={limitReached}
          onToggle={() => toggleCompare(listing)}
        />
      </div>
    );
  }

  function renderListingRow(listings: ApiListing[]) {
    if (realListingsLoading) {
      return (
        <div className="bracket-skeleton">
          {[1, 2, 3].map((item) => (
            <div className="placeholder-card" key={item}>
              <div className="placeholder-thumb" />
              <div className="placeholder-line placeholder-line-wide" />
              <div className="placeholder-line placeholder-line-narrow" />
            </div>
          ))}
        </div>
      );
    }

    if (listings.length === 0) {
      return <p className="bracket-empty">{realListingsError || "No listings yet."}</p>;
    }

    return (
      <div className="bracket-row">
        {listings.map((listing) => renderCard(listing, listing._id))}
      </div>
    );
  }

  function renderSavedView() {
    if (savedLoading) {
      return (
        <div className="bracket-skeleton">
          {[1, 2, 3].map((item) => (
            <div className="placeholder-card" key={item}>
              <div className="placeholder-thumb" />
              <div className="placeholder-line placeholder-line-wide" />
              <div className="placeholder-line placeholder-line-narrow" />
            </div>
          ))}
        </div>
      );
    }

    if (savedError) {
      return <p className="bracket-empty">{savedError}</p>;
    }

    if (savedListings.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-icon"><IconHeart /></div>
          <p className="empty-title">No saved listings yet</p>
          <p className="empty-text">Tap the heart icon on any listing to save it here.</p>
        </div>
      );
    }

    return (
      <div className="bracket-row">
        {savedListings.map((listing) => renderCard(listing, listing._id))}
      </div>
    );
  }

  function renderHistoryView() {
    if (historyLoading) {
      return (
        <div className="bracket-skeleton">
          {[1, 2, 3].map((item) => (
            <div className="placeholder-card" key={item}>
              <div className="placeholder-thumb" />
              <div className="placeholder-line placeholder-line-wide" />
              <div className="placeholder-line placeholder-line-narrow" />
            </div>
          ))}
        </div>
      );
    }

    if (historyError) {
      return <p className="bracket-empty">{historyError}</p>;
    }

    // Skip entries whose listing no longer exists (e.g. after re-seeding)
    const validEntries = historyEntries.filter(
      (entry): entry is HistoryEntry & { listing: ApiListing } => entry.listing !== null
    );

    if (validEntries.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-icon"><IconClock /></div>
          <p className="empty-title">No viewing history yet</p>
          <p className="empty-text">Listings you open will show up here so you can find them again.</p>
        </div>
      );
    }

    return (
      <div className="bracket-row">
        {validEntries.map((entry) =>
          renderCard(entry.listing, `${entry.listing._id}-${entry.viewedAt}`, entry.viewedAt)
        )}
      </div>
    );
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setAccountMessage("");
    try {
      const response = await api.patch("/auth/me", profileForm, getAuthHeaders());
      const next = { ...user, ...response.data.user, role: user.role };
      localStorage.setItem("renta_user", JSON.stringify(next));
      setUser(next);
      setAccountMessage(response.data.message || "Profile updated.");
    } catch (error: any) {
      setAccountMessage(error.response?.data?.message || "Couldn't update your profile.");
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    setAccountMessage("");
    try {
      const response = await api.patch("/auth/password", passwordForm, getAuthHeaders());
      setPasswordForm({ currentPassword: "", newPassword: "" });
      setAccountMessage(response.data.message || "Password updated.");
    } catch (error: any) {
      setAccountMessage(error.response?.data?.message || "Couldn't change your password.");
    }
  }

  function renderAccountView() {
    return (
      <div className="profile-card">
        <div className="profile-header">
          <div className="profile-avatar">{initial}</div>
          <div>
            <p className="profile-name">
              {user.firstName ? `${user.firstName} ${user.lastName ?? ""}` : "Tenant"}
            </p>
            <p className="profile-role">Tenant account</p>
          </div>
        </div>

        <div className="profile-row">
          <span className="profile-label">Email</span>
          <span className="profile-value">{user.email ?? "—"}</span>
        </div>

        <form onSubmit={saveProfile}>
          <input value={profileForm.firstName} onChange={(event) => setProfileForm({ ...profileForm, firstName: event.target.value })} placeholder="First name" required />
          <input value={profileForm.lastName} onChange={(event) => setProfileForm({ ...profileForm, lastName: event.target.value })} placeholder="Last name" required />
          <input value={profileForm.phone} onChange={(event) => setProfileForm({ ...profileForm, phone: event.target.value })} placeholder="09XXXXXXXXX" required />
          <button type="submit">Save profile</button>
        </form>

        <form onSubmit={savePassword}>
          <input type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} placeholder="Current password" required />
          <input type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} placeholder="New password" required />
          <button type="submit">Change password</button>
        </form>

        {accountMessage && <p>{accountMessage}</p>}

        <button className="profile-logout-btn" onClick={handleLogout}>
          Log out
        </button>
      </div>
    );
  }

  const explorableTypes = TYPE_OPTIONS.filter((t) => t !== "All types");

  return (
    <div className="yt-shell">
      <header className="yt-topbar">
        <button className="yt-hamburger" onClick={() => setSidebarExpanded((v) => !v)} aria-label="Toggle menu">
          <IconMenu />
        </button>
        <button className="yt-logo" onClick={goToDiscover}>
          <span className="logo-circle">R.</span>
          <span className="yt-logo-text">RENTA</span>
        </button>
      </header>

      <div className="yt-body">
        <aside className={sidebarExpanded ? "yt-sidebar expanded" : "yt-sidebar"}>
          <div className="yt-sidebar-section">
            <button
              className={activeView === "discover" ? "yt-sidebar-item active" : "yt-sidebar-item"}
              onClick={goToDiscover}
            >
              <IconHome />
              {sidebarExpanded && <span>Discover</span>}
            </button>
          </div>

          <div className="yt-sidebar-divider" />

          <div className="yt-sidebar-section">
            {sidebarExpanded && <span className="yt-sidebar-label">You</span>}
            <button
              className={activeView === "saved" ? "yt-sidebar-item active" : "yt-sidebar-item"}
              onClick={() => goToView("saved")}
            >
              <IconHeart />
              {sidebarExpanded && <span>Saved</span>}
            </button>
            <button
              className={activeView === "history" ? "yt-sidebar-item active" : "yt-sidebar-item"}
              onClick={() => goToView("history")}
            >
              <IconClock />
              {sidebarExpanded && <span>History</span>}
            </button>
            <button
              className={activeView === "reservations" ? "yt-sidebar-item active" : "yt-sidebar-item"}
              onClick={() => goToView("reservations")}
            >
              <IconClock />
              {sidebarExpanded && <span>Reservations</span>}
            </button>
            <button
              className={activeView === "notifications" ? "yt-sidebar-item active" : "yt-sidebar-item"}
              onClick={() => goToView("notifications")}
            >
              <IconBell />
              {sidebarExpanded && <span>Notifications{notifications.unread > 0 ? ` (${notifications.unread})` : ""}</span>}
            </button>
            <button
              className={activeView === "account" ? "yt-sidebar-item active" : "yt-sidebar-item"}
              onClick={() => goToView("account")}
            >
              <IconUser />
              {sidebarExpanded && <span>{user.firstName ?? "Account"}</span>}
            </button>
          </div>

          <div className="yt-sidebar-divider" />

          <div className="yt-sidebar-section">
            {sidebarExpanded && <span className="yt-sidebar-label">Explore</span>}
            {explorableTypes.map((type) => {
              const TypeIcon = TYPE_ICONS[type] ?? IconDoor;
              return (
                <button key={type} className="yt-sidebar-item" onClick={() => exploreType(type)}>
                  <TypeIcon />
                  {sidebarExpanded && <span>{type}</span>}
                </button>
              );
            })}
          </div>

          <div className="yt-sidebar-section yt-sidebar-bottom">
            <button className="yt-sidebar-item" onClick={handleLogout}>
              <IconPower />
              {sidebarExpanded && <span>Log out</span>}
            </button>
          </div>
        </aside>

        <main className="dash-main">
          {activeView === "discover" && (
            <>
              <header className="dash-topbar" ref={searchAreaRef}>
                <div className="search-align-row">
                  <form
                    className="dash-search"
                    onSubmit={handleSearchSubmit}
                    onClick={() => setFiltersOpen(true)}
                  >
                    <span className="search-icon">🔍</span>
                    <input
                      type="text"
                      placeholder="Search barangay, landmark, or type"
                      value={query}
                      onFocus={() => setFiltersOpen(true)}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setHasSearched(true);
                      }}
                    />
                    {query && (
                      <button
                        type="button"
                        className="search-clear"
                        onClick={(event) => {
                          event.stopPropagation();
                          setQuery("");
                        }}
                        aria-label="Clear search"
                      >
                        ×
                      </button>
                    )}
                  </form>
                </div>

                {filtersOpen && (
                  <div className="filter-row">
                    <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setHasSearched(true); }}>
                      {TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>

                    <select value={priceFilter} onChange={(e) => { setPriceFilter(e.target.value); setHasSearched(true); }}>
                      {PRICE_OPTIONS.map((option) => <option key={option.label} value={option.label}>{option.label}</option>)}
                    </select>

                    <select value={capacityFilter} onChange={(e) => { setCapacityFilter(e.target.value); setHasSearched(true); }}>
                      {CAPACITY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>

                    <button
                      type="button"
                      className={verifiedOnly ? "filter-pill active" : "filter-pill"}
                      onClick={() => { setVerifiedOnly(!verifiedOnly); setHasSearched(true); }}
                    >
                      Verified owners only
                    </button>

                    {hasSearched && (
                      <button type="button" className="filter-clear" onClick={clearFilters}>
                        Clear all
                      </button>
                    )}
                  </div>
                )}
              </header>

              {hasSearched ? (
                <section className="search-results" id="search-results-section">
                  <div className="results-heading">
                    <h2>{filteredListings.length} {filteredListings.length === 1 ? "match" : "matches"}</h2>

                    <div className="view-toggle">
                      <button className={viewMode === "list" ? "toggle-btn active" : "toggle-btn"} onClick={() => setViewMode("list")}>List</button>
                      <button className={viewMode === "map" ? "toggle-btn active" : "toggle-btn"} onClick={() => setViewMode("map")}>Map</button>
                    </div>
                  </div>

                  {filteredListings.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">🔍</div>
                      <p className="empty-title">No matches found</p>
                      <p className="empty-text">Try a different search term or clear your filters.</p>
                    </div>
                  ) : viewMode === "list" ? (
                    <div className="results-grid">
                      {filteredListings.map((listing) => (
                        <div className="result-card" key={listing._id}>
                          <div className="result-thumb">
                            {listing.verified && <span className="verified-badge">Verified</span>}
                          </div>
                          <div className="result-info">
                            <div className="result-meta">
                              <span>{listing.type} · Brgy. {listing.barangay}</span>
                              <span className="result-price">₱{listing.price.toLocaleString()}/mo</span>
                            </div>
                            <h3>{listing.title}</h3>
                            <span className="result-capacity">Up to {listing.capacity} {listing.capacity === 1 ? "person" : "people"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="map-split">
                      <div className="map-list-column">
                        {filteredListings.map((listing) => (
                          <div className="compact-card" key={listing._id}>
                            {listing.verified && <span className="compact-verified">Verified</span>}
                            <h4>{listing.title}</h4>
                            <span className="compact-meta">{listing.type} · Brgy. {listing.barangay}</span>
                            <span className="compact-price">₱{listing.price.toLocaleString()}/mo</span>
                          </div>
                        ))}
                      </div>

                      <div className="map-container-wrap">
                        <span className="map-badge">Calapan City · Approximate map</span>
                        <MapContainer center={CALAPAN_CENTER} zoom={14} minZoom={13} maxZoom={18} scrollWheelZoom={true} style={{ height: "500px", width: "100%", borderRadius: "18px" }}>
                          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                          <LockToCalapan />
                          {filteredListings.map((listing) => (
                            <Marker key={listing._id} position={[listing.lat, listing.lng]} icon={createPinIcon(listing.verified)}>
                              <Tooltip direction="top" offset={[0, -34]} opacity={1} className="listing-tooltip">
                                <strong>{listing.title}</strong><br />
                                {listing.type} · Brgy. {listing.barangay}<br />
                                ₱{listing.price.toLocaleString()}/mo
                              </Tooltip>
                            </Marker>
                          ))}
                        </MapContainer>
                      </div>
                    </div>
                  )}
                </section>
              ) : (
                <>
                  <div className="dash-welcome">
                    <p className="dash-eyebrow">TENANT DASHBOARD</p>
                    <h1>Welcome back{user.firstName ? `, ${user.firstName}` : ""}.</h1>
                    <p className="dash-subtext">Browse what's live on RENTA right now.</p>
                  </div>

                  <section className="listing-bracket">
                    <div className="bracket-heading">
                      <h2>New</h2>
                      <span className="bracket-sub">Most recently added</span>
                    </div>
                    {renderListingRow(newListings)}
                  </section>

                  <section className="listing-bracket">
                    <div className="bracket-heading">
                      <h2>Popular</h2>
                      <span className="bracket-sub">Ranked by transparency score</span>
                    </div>
                    {renderListingRow(popularListings)}
                  </section>

                  <section className="listing-bracket">
                    <div className="bracket-heading">
                      <h2>General</h2>
                      <span className="bracket-sub">All active listings</span>
                    </div>
                    {renderListingRow(generalListings)}
                  </section>
                </>
              )}
            </>
          )}

          {activeView === "saved" && (
            <>
              <div className="dash-welcome">
                <p className="dash-eyebrow">YOUR LISTINGS</p>
                <h1>Saved</h1>
                <p className="dash-subtext">Listings you've bookmarked for later.</p>
              </div>
              {renderSavedView()}
            </>
          )}

          {activeView === "history" && (
            <>
              <div className="dash-welcome">
                <p className="dash-eyebrow">YOUR LISTINGS</p>
                <h1>History</h1>
                <p className="dash-subtext">Listings you've recently viewed.</p>
              </div>
              {renderHistoryView()}
            </>
          )}

          {activeView === "reservations" && (
            <>
              <div className="dash-welcome">
                <p className="dash-eyebrow">YOUR STAYS</p>
                <h1>My reservations</h1>
              </div>
              {reservationMessage && <p>{reservationMessage}</p>}
              {myReservations.length === 0 && <p>No reservations yet.</p>}
              {myReservations.map((reservation) => {
                const listing = reservation.unitId;
                const amount = reservation.downPaymentAmount || listing?.price || 0;
                return (
                  <article key={reservation._id} className="yt-reservation-card">
                    <div className="yt-reservation-heading">
                      <h3>{listing?.title || "Listing"}</h3>
                      <span className={`yt-reservation-status status-${reservation.queueStatus}`}>
                        {reservation.queueStatus.replaceAll("_", " ")}
                      </span>
                    </div>
                    <p className="yt-reservation-location">{listing?.barangay || "Calapan City"}</p>
                    <div className="yt-reservation-actions">
                      {reservation.queueStatus === "payment_pending" && (
                        <button
                          type="button"
                          className="yt-reservation-button primary"
                          onClick={async () => {
                            try {
                              const response = await api.post("/payments/checkout", { reservationId: reservation._id }, getAuthHeaders());
                              const checkoutUrl = String(response.data.checkoutUrl || "");
                              const checkout = new URL(checkoutUrl, window.location.origin);
                              if (checkout.pathname.startsWith("/pay/mock/")) {
                                navigate(`${checkout.pathname}${checkout.search}${checkout.hash}`);
                              } else {
                                window.location.assign(checkoutUrl);
                              }
                            } catch (error: any) {
                              setReservationMessage(error.response?.data?.message || "Couldn't start payment.");
                            }
                          }}
                        >
                          Pay down payment
                        </button>
                      )}
                      {(reservation.queueStatus === "queued" || reservation.queueStatus === "payment_pending") && (
                        <button
                          type="button"
                          className="yt-reservation-button secondary"
                          onClick={() => api.patch(`/reservations/${reservation._id}/cancel`, {}, getAuthHeaders()).then(() => setMyReservations((current) => current.map((item) => item._id === reservation._id ? { ...item, queueStatus: "cancelled" } : item)))}
                        >
                          Cancel
                        </button>
                      )}
                      {reservation.queueStatus === "confirmed" && (
                        <button type="button" className="yt-reservation-button secondary" onClick={() => window.print()}>
                          Print receipt
                        </button>
                      )}
                    </div>
                    {reservation.queueStatus === "confirmed" && (
                      <div className="yt-reservation-receipt">
                        <p className="yt-reservation-receipt-label">RENTA RECEIPT</p>
                        <p className="yt-reservation-receipt-title">{listing?.title}</p>
                        <p>Down payment: <strong>₱{amount.toLocaleString()}</strong></p>
                        <p>Status: <strong>Confirmed</strong></p>
                      </div>
                    )}
                  </article>
                );
              })}
            </>
          )}

          {activeView === "notifications" && (
            <>
              <div className="dash-welcome">
                <p className="dash-eyebrow">YOUR LISTINGS</p>
                <h1>Notifications</h1>
              </div>
              <NotificationList items={notifications.items} onRead={notifications.markRead} />
            </>
          )}

          {activeView === "account" && (
            <>
              <div className="dash-welcome">
                <p className="dash-eyebrow">YOUR LISTINGS</p>
                <h1>Account</h1>
                <p className="dash-subtext">Your RENTA profile.</p>
              </div>
              {renderAccountView()}
            </>
          )}
        </main>
      </div>

      <CompareBar
        items={compareItems}
        onRemove={removeCompare}
        onClear={() => setCompareItems([])}
        onCompare={goCompare}
      />
    </div>
  );
}

export default TenantDashboard;