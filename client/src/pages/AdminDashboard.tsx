import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../services/api";
import "./AdminDashboard.css";

interface RentaUser {
  firstName?: string;
  lastName?: string;
  email?: string;
}

type OwnerState =
  | "awaiting_review"
  | "revision_requested"
  | "not_submitted"
  | "approved"
  | "rejected"
  | "suspended";

type ActiveView = "overview" | "owners" | "listings" | "reports" | "users" | "audit" | "account";
type OwnerFilter = OwnerState | "all";
type ListingFilter = "unverified" | "verified" | "all";
type UserFilter = "all" | "tenant" | "owner" | "admin";
type IconName =
  | "menu"
  | "grid"
  | "shield"
  | "building"
  | "chart"
  | "clipboard"
  | "users"
  | "user"
  | "power";

interface Verification {
  idDocumentUrl?: string;
  authorityDocumentUrl?: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewNote?: string;
  revisionRequested?: boolean;
}

interface AdminOwner {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  createdAt: string;
  state: OwnerState;
  verification?: Verification;
}

interface AdminListing {
  _id: string;
  title: string;
  type: string;
  barangay: string;
  price: number;
  capacity: number;
  verified: boolean;
  available: boolean;
  ownerName: string;
  imageUrl?: string;
  createdAt: string;
}

interface AdminUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  defaultRole: string;
  status: string;
  createdAt: string;
}

interface AuditEntry {
  _id: string;
  actorName: string;
  action: string;
  targetLabel: string;
  note?: string;
  createdAt: string;
}

interface Stats {
  users: { tenants: number; owners: number; admins: number };
  owners: Record<OwnerState, number>;
  listings: { total: number; verified: number; unverified: number };
}

interface Reports {
  listingsByType: { _id: string; count: number; avgPrice: number }[];
  listingsByBarangay: { _id: string; count: number }[];
  priceStats: { avg: number; min: number; max: number; avgTransparency: number } | null;
  availability: { _id: boolean; count: number }[];
  usersByRole: { _id: string; count: number }[];
  staleListings: number;
}

interface ReviewTarget {
  kind: "owner" | "listing";
  id: string;
  label: string;
  decision: string;
}

interface DecisionMeta {
  label: string;
  noteRequired: boolean;
  tone: "primary" | "danger" | "neutral";
}

const OWNER_FILTERS: { key: OwnerFilter; label: string }[] = [
  { key: "awaiting_review", label: "Awaiting review" },
  { key: "revision_requested", label: "Revision requested" },
  { key: "not_submitted", label: "Not submitted" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "suspended", label: "Suspended" },
  { key: "all", label: "All" },
];

const STATE_LABEL: Record<OwnerState, string> = {
  awaiting_review: "Awaiting review",
  revision_requested: "Revision requested",
  not_submitted: "No documents yet",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
};

const STATE_TONE: Record<OwnerState, string> = {
  awaiting_review: "warn",
  revision_requested: "warn",
  not_submitted: "muted",
  approved: "good",
  rejected: "bad",
  suspended: "bad",
};

const OWNER_ACTIONS: Record<OwnerState, string[]> = {
  awaiting_review: ["approve", "revision", "reject"],
  revision_requested: ["reject"],
  not_submitted: [],
  approved: ["suspend"],
  rejected: ["approve"],
  suspended: ["reactivate"],
};

const OWNER_DECISIONS: Record<string, DecisionMeta> = {
  approve: { label: "Approve", noteRequired: false, tone: "primary" },
  revision: { label: "Request revision", noteRequired: true, tone: "neutral" },
  reject: { label: "Reject", noteRequired: true, tone: "danger" },
  suspend: { label: "Suspend", noteRequired: true, tone: "danger" },
  reactivate: { label: "Reactivate", noteRequired: false, tone: "primary" },
};

const LISTING_DECISIONS: Record<string, DecisionMeta> = {
  approve: { label: "Approve listing", noteRequired: false, tone: "primary" },
  revoke: { label: "Revoke approval", noteRequired: true, tone: "danger" },
};

/* ---------- ICONS (hand-built line icons, no external library) ---------- */

const ICON_PATHS: Record<IconName, ReactNode> = {
  menu: (
    <>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  building: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M9 21v-4h6v4" />
      <path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01" />
    </>
  ),
  chart: (
    <>
      <line x1="5" y1="20" x2="5" y2="11" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="19" y1="20" x2="19" y2="14" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4h6v3H9z" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="15" y2="16" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M17 14.5c2.5 0 4.5 1.5 4.5 4.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
  power: (
    <>
      <path d="M12 2v8" />
      <path d="M6.5 6.5a8 8 0 1 0 11 0" />
    </>
  ),
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

/* ---------- HELPERS ---------- */

function getAuthHeaders() {
  const token = localStorage.getItem("renta_token");
  return { headers: { Authorization: `Bearer ${token}` } };
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

function formatPeso(value: number) {
  return `₱${Math.round(value).toLocaleString()}`;
}

// Only ever link to http(s) URLs — never render a "javascript:" link
function safeHref(url?: string) {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

function useAdminData<T>(path: string, enabled: boolean) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setLoading(true);
    setError("");

    api
      .get(path, getAuthHeaders())
      .then((response) => {
        if (!cancelled) setData(response.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || "Couldn't load this data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [path, enabled, version]);

  return { data, loading, error, reload: () => setVersion((v) => v + 1) };
}

/* ---------- SMALL COMPONENTS ---------- */

function PageHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="adash-header">
      <p className="adash-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {subtitle && <p className="adash-subtext">{subtitle}</p>}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="adash-stat-card">
      <span className="adash-stat-label">{label}</span>
      <span className="adash-stat-value">{value}</span>
    </div>
  );
}

function AttentionRow({
  count,
  text,
  actionLabel,
  onAction,
}: {
  count: number;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className={count > 0 ? "adash-attention-row" : "adash-attention-row clear"}>
      <span className="adash-attention-count">{count}</span>
      <span className="adash-attention-text">{text}</span>
      {count > 0 && onAction && (
        <button className="adash-link-btn" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="adash-chips">
      {options.map((option) => (
        <button
          key={option.key}
          className={value === option.key ? "adash-chip active" : "adash-chip"}
          onClick={() => onChange(option.key)}
        >
          {option.label}
          {option.count !== undefined && <span className="adash-chip-count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

function BarList({ items }: { items: { label: string; value: number; sub?: string }[] }) {
  const max = Math.max(1, ...items.map((item) => item.value));

  if (items.length === 0) {
    return <p className="adash-muted">No data yet.</p>;
  }

  return (
    <div className="adash-bars">
      {items.map((item) => (
        <div className="adash-bar-row" key={item.label}>
          <div className="adash-bar-label">
            <span>{item.label}</span>
            <span className="adash-bar-value">
              {item.value}
              {item.sub ? ` · ${item.sub}` : ""}
            </span>
          </div>
          <div className="adash-bar-track">
            <div className="adash-bar-fill" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DocLink({ label, url }: { label: string; url?: string }) {
  const href = safeHref(url);

  return (
    <div className="adash-doc">
      <span className="adash-doc-label">{label}</span>
      {!url ? (
        <span className="adash-doc-missing">Not submitted</span>
      ) : href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="adash-doc-link">
          Open document ↗
        </a>
      ) : (
        <span className="adash-doc-missing">Invalid link</span>
      )}
    </div>
  );
}

function SidebarItem({
  icon,
  label,
  active,
  expanded,
  badge,
  onClick,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  expanded: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      className={active ? "adash-sidebar-item active" : "adash-sidebar-item"}
      onClick={onClick}
      title={expanded ? undefined : label}
    >
      <span className="adash-sidebar-icon">
        <Icon name={icon} />
        {!expanded && badge ? <span className="adash-dot" /> : null}
      </span>
      {expanded && <span className="adash-sidebar-text">{label}</span>}
      {expanded && badge ? <span className="adash-badge">{badge}</span> : null}
    </button>
  );
}

function renderAsync<T>(
  hook: { data: T | null; error: string },
  render: (data: T) => ReactNode
): ReactNode {
  if (hook.error) {
    return (
      <div className="adash-empty">
        <p className="adash-empty-title">{hook.error}</p>
      </div>
    );
  }

  if (!hook.data) {
    return <p className="adash-muted">Loading…</p>;
  }

  return render(hook.data);
}

/* ---------- MAIN COMPONENT ---------- */

function AdminDashboard() {
  const navigate = useNavigate();

  const storedUser = localStorage.getItem("renta_user");
  const user: RentaUser = storedUser ? JSON.parse(storedUser) : {};

  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>("overview");
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("awaiting_review");
  const [listingFilter, setListingFilter] = useState<ListingFilter>("unverified");
  const [userFilter, setUserFilter] = useState<UserFilter>("all");

  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState("");

  const stats = useAdminData<Stats>("/admin/stats", true);
  const owners = useAdminData<{ owners: AdminOwner[] }>("/admin/owners", activeView === "owners");
  const listings = useAdminData<{ listings: AdminListing[] }>("/admin/listings", activeView === "listings");
  const reports = useAdminData<Reports>("/admin/reports", activeView === "reports");
  const users = useAdminData<{ users: AdminUser[] }>("/admin/users", activeView === "users");
  const audit = useAdminData<{ entries: AuditEntry[] }>("/admin/audit", activeView === "audit");

  const awaitingCount = stats.data?.owners.awaiting_review ?? 0;
  const unverifiedCount = stats.data?.listings.unverified ?? 0;

  const reviewMeta: DecisionMeta | null = reviewTarget
    ? (reviewTarget.kind === "owner" ? OWNER_DECISIONS : LISTING_DECISIONS)[reviewTarget.decision]
    : null;

  function handleLogout() {
    localStorage.removeItem("renta_token");
    localStorage.removeItem("renta_user");
    navigate("/login");
  }

  function openOwners(filter: OwnerFilter) {
    setOwnerFilter(filter);
    setActiveView("owners");
  }

  function openListings(filter: ListingFilter) {
    setListingFilter(filter);
    setActiveView("listings");
  }

  function openReview(kind: "owner" | "listing", id: string, label: string, decision: string) {
    setReviewTarget({ kind, id, label, decision });
    setReviewNote("");
    setReviewError("");
  }

  function closeReview() {
    if (reviewBusy) return;
    setReviewTarget(null);
  }

  async function submitReview() {
    if (!reviewTarget || !reviewMeta) return;

    if (reviewMeta.noteRequired && !reviewNote.trim()) {
      setReviewError("A reason is required for this decision.");
      return;
    }

    try {
      setReviewBusy(true);
      setReviewError("");

      const url =
        reviewTarget.kind === "owner"
          ? `/admin/owners/${reviewTarget.id}/review`
          : `/admin/listings/${reviewTarget.id}/review`;

      await api.patch(
        url,
        { decision: reviewTarget.decision, note: reviewNote.trim() },
        getAuthHeaders()
      );

      setReviewTarget(null);
      stats.reload();
      owners.reload();
      listings.reload();
      audit.reload();
    } catch (err: any) {
      setReviewError(err.response?.data?.message || "Couldn't save this decision.");
    } finally {
      setReviewBusy(false);
    }
  }

  /* ----- VIEWS ----- */

  function renderOverview() {
    return (
      <>
        <PageHeader
          eyebrow="ADMINISTRATOR DASHBOARD"
          title={`Welcome back${user.firstName ? `, ${user.firstName}` : ""}.`}
          subtitle="Here's where RENTA stands right now."
        />

        {renderAsync(stats, (s) => (
          <>
            <div className="adash-stat-grid">
              <StatCard label="Tenants" value={s.users.tenants} />
              <StatCard label="Property owners" value={s.users.owners} />
              <StatCard label="Total listings" value={s.listings.total} />
              <StatCard label="Approved listings" value={s.listings.verified} />
            </div>

            <h2 className="adash-section-title">Needs attention</h2>
            <div className="adash-attention-list">
              <AttentionRow
                count={s.owners.awaiting_review}
                text="owner submissions waiting for document review"
                actionLabel="Review owners"
                onAction={() => openOwners("awaiting_review")}
              />
              <AttentionRow
                count={s.listings.unverified}
                text="listings waiting for approval"
                actionLabel="Review listings"
                onAction={() => openListings("unverified")}
              />
              <AttentionRow
                count={s.owners.not_submitted}
                text="owners haven't submitted their documents yet"
                actionLabel="View owners"
                onAction={() => openOwners("not_submitted")}
              />
            </div>
          </>
        ))}
      </>
    );
  }

  function renderOwnersView() {
    return (
      <>
        <PageHeader
          eyebrow="REVIEW"
          title="Owner verification"
          subtitle="Review the identity and authority documents owners submit. Every decision is saved to the audit trail."
        />

        <div className="adash-notice">
          <strong>Prototype note:</strong> documents are submitted as links. Use sample documents
          only — never real IDs — until protected, reviewer-only file storage is in place.
        </div>

        {renderAsync(owners, ({ owners: list }) => {
          const counts: Record<string, number> = {};
          list.forEach((owner) => {
            counts[owner.state] = (counts[owner.state] ?? 0) + 1;
          });

          const visible = ownerFilter === "all" ? list : list.filter((o) => o.state === ownerFilter);

          return (
            <>
              <Chips
                value={ownerFilter}
                onChange={setOwnerFilter}
                options={OWNER_FILTERS.map((f) => ({
                  key: f.key,
                  label: f.label,
                  count: f.key === "all" ? list.length : counts[f.key] ?? 0,
                }))}
              />

              {visible.length === 0 ? (
                <div className="adash-empty">
                  <p className="adash-empty-title">Nothing here right now</p>
                  <p className="adash-empty-text">No owners match this filter.</p>
                </div>
              ) : (
                visible.map((owner) => {
                  const v = owner.verification;
                  const fullName = `${owner.firstName} ${owner.lastName}`;

                  return (
                    <div className="adash-card" key={owner._id}>
                      <div className="adash-card-head">
                        <div className="adash-avatar">{owner.firstName.charAt(0).toUpperCase()}</div>
                        <div className="adash-card-id">
                          <p className="adash-card-name">{fullName}</p>
                          <p className="adash-card-sub">
                            {owner.email} · Joined {formatDate(owner.createdAt)}
                          </p>
                        </div>
                        <span className={`adash-pill ${STATE_TONE[owner.state]}`}>
                          {STATE_LABEL[owner.state]}
                        </span>
                      </div>

                      <div className="adash-doc-grid">
                        <DocLink label="Government-issued ID" url={v?.idDocumentUrl} />
                        <DocLink label="Proof of ownership / authority" url={v?.authorityDocumentUrl} />
                      </div>

                      {v?.submittedAt && (
                        <p className="adash-card-meta">Submitted {formatDate(v.submittedAt)}</p>
                      )}

                      {v?.reviewNote && (
                        <p className="adash-note">
                          <strong>Last decision note:</strong> {v.reviewNote}
                        </p>
                      )}

                      <div className="adash-actions">
                        {OWNER_ACTIONS[owner.state].map((decision) => (
                          <button
                            key={decision}
                            className={`adash-btn ${OWNER_DECISIONS[decision].tone}`}
                            onClick={() => openReview("owner", owner._id, fullName, decision)}
                          >
                            {OWNER_DECISIONS[decision].label}
                          </button>
                        ))}
                        {owner.state === "not_submitted" && (
                          <span className="adash-muted">Waiting for the owner to submit documents.</span>
                        )}
                        {owner.state === "revision_requested" && (
                          <span className="adash-muted">Waiting for the owner to resubmit.</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          );
        })}
      </>
    );
  }

  function renderListingsView() {
    return (
      <>
        <PageHeader
          eyebrow="REVIEW"
          title="Listing approvals"
          subtitle="Approve listings once the owner's documents are verified."
        />

        {renderAsync(listings, ({ listings: list }) => {
          const approved = list.filter((l) => l.verified).length;
          const visible =
            listingFilter === "all"
              ? list
              : list.filter((l) => (listingFilter === "verified" ? l.verified : !l.verified));

          return (
            <>
              <Chips
                value={listingFilter}
                onChange={setListingFilter}
                options={[
                  { key: "unverified", label: "Awaiting approval", count: list.length - approved },
                  { key: "verified", label: "Approved", count: approved },
                  { key: "all", label: "All", count: list.length },
                ]}
              />

              {visible.length === 0 ? (
                <div className="adash-empty">
                  <p className="adash-empty-title">Nothing here right now</p>
                  <p className="adash-empty-text">No listings match this filter.</p>
                </div>
              ) : (
                visible.map((listing) => (
                  <div className="adash-card adash-listing-row" key={listing._id}>
                    <div
                      className="adash-thumb"
                      style={
                        safeHref(listing.imageUrl)
                          ? { backgroundImage: `url("${encodeURI(listing.imageUrl as string)}")` }
                          : undefined
                      }
                    />
                    <div className="adash-listing-body">
                      <Link to={`/listings/${listing._id}`} className="adash-listing-title">
                        {listing.title}
                      </Link>
                      <p className="adash-card-sub">
                        {listing.type} · {listing.barangay} · {formatPeso(listing.price)}/mo · Owner:{" "}
                        {listing.ownerName}
                      </p>
                      <p className="adash-card-meta">
                        Added {formatDate(listing.createdAt)} ·{" "}
                        {listing.available ? "Available" : "Occupied"}
                      </p>
                    </div>
                    <span className={`adash-pill ${listing.verified ? "good" : "warn"}`}>
                      {listing.verified ? "Approved" : "Awaiting approval"}
                    </span>
                    <div className="adash-actions">
                      {listing.verified ? (
                        <button
                          className="adash-btn danger"
                          onClick={() => openReview("listing", listing._id, listing.title, "revoke")}
                        >
                          Revoke
                        </button>
                      ) : (
                        <button
                          className="adash-btn primary"
                          onClick={() => openReview("listing", listing._id, listing.title, "approve")}
                        >
                          Approve
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </>
          );
        })}
      </>
    );
  }

  function renderReportsView() {
    return (
      <>
        <PageHeader
          eyebrow="INSIGHTS"
          title="Reports"
          subtitle="Summaries built from the users and listings currently in RENTA."
        />

        {renderAsync(reports, (r) => {
          const occupied = r.availability.find((a) => a._id === false)?.count ?? 0;

          return (
            <>
              <div className="adash-stat-grid">
                <StatCard label="Average rent" value={r.priceStats ? formatPeso(r.priceStats.avg) : "—"} />
                <StatCard label="Lowest rent" value={r.priceStats ? formatPeso(r.priceStats.min) : "—"} />
                <StatCard label="Highest rent" value={r.priceStats ? formatPeso(r.priceStats.max) : "—"} />
                <StatCard
                  label="Avg. transparency"
                  value={r.priceStats ? `${Math.round(r.priceStats.avgTransparency)}%` : "—"}
                />
                <StatCard label="Occupied listings" value={occupied} />
                <StatCard label="Not updated in 30+ days" value={r.staleListings} />
              </div>

              <div className="adash-report-grid">
                <div className="adash-panel">
                  <h2 className="adash-panel-title">Listings by type</h2>
                  <BarList
                    items={r.listingsByType.map((t) => ({
                      label: t._id,
                      value: t.count,
                      sub: `avg ${formatPeso(t.avgPrice)}`,
                    }))}
                  />
                </div>

                <div className="adash-panel">
                  <h2 className="adash-panel-title">Listings by barangay (top 8)</h2>
                  <BarList items={r.listingsByBarangay.map((b) => ({ label: b._id, value: b.count }))} />
                </div>

                <div className="adash-panel">
                  <h2 className="adash-panel-title">Owner verification</h2>
                  {stats.data ? (
                    <BarList
                      items={(Object.keys(STATE_LABEL) as OwnerState[]).map((key) => ({
                        label: STATE_LABEL[key],
                        value: stats.data!.owners[key],
                      }))}
                    />
                  ) : (
                    <p className="adash-muted">Loading…</p>
                  )}
                </div>

                <div className="adash-panel">
                  <h2 className="adash-panel-title">Accounts by role</h2>
                  <BarList items={r.usersByRole.map((u) => ({ label: u._id, value: u.count }))} />
                </div>
              </div>

              <div className="adash-notice">
                <strong>Not available yet:</strong> tenant-submitted listing reports, review
                moderation, and reservation or test-payment monitoring. Those features haven't been
                built, so there's no data to report on.
              </div>
            </>
          );
        })}
      </>
    );
  }

  function renderUsersView() {
    return (
      <>
        <PageHeader eyebrow="MANAGE" title="Users" subtitle="Everyone with a RENTA account." />

        {renderAsync(users, ({ users: list }) => {
          const visible = userFilter === "all" ? list : list.filter((u) => u.defaultRole === userFilter);

          return (
            <>
              <Chips
                value={userFilter}
                onChange={setUserFilter}
                options={[
                  { key: "all", label: "All", count: list.length },
                  { key: "tenant", label: "Tenants", count: list.filter((u) => u.defaultRole === "tenant").length },
                  { key: "owner", label: "Owners", count: list.filter((u) => u.defaultRole === "owner").length },
                  { key: "admin", label: "Admins", count: list.filter((u) => u.defaultRole === "admin").length },
                ]}
              />

              <div className="adash-table-wrap">
                <div className="adash-table">
                  <div className="adash-table-row head">
                    <span>Name</span>
                    <span>Email</span>
                    <span>Role</span>
                    <span>Status</span>
                    <span>Joined</span>
                  </div>
                  {visible.map((u) => (
                    <div className="adash-table-row" key={u._id}>
                      <span>
                        {u.firstName} {u.lastName}
                      </span>
                      <span>{u.email}</span>
                      <span className="adash-cap">{u.defaultRole}</span>
                      <span className="adash-cap">{u.status}</span>
                      <span>{formatDate(u.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          );
        })}
      </>
    );
  }

  function renderAuditView() {
    return (
      <>
        <PageHeader
          eyebrow="INSIGHTS"
          title="Audit log"
          subtitle="A record of every administrative decision, with the reason given."
        />

        {renderAsync(audit, ({ entries }) =>
          entries.length === 0 ? (
            <div className="adash-empty">
              <p className="adash-empty-title">No activity yet</p>
              <p className="adash-empty-text">Decisions you make will be recorded here.</p>
            </div>
          ) : (
            <div className="adash-audit-list">
              {entries.map((entry) => (
                <div className="adash-audit-row" key={entry._id}>
                  <div className="adash-audit-main">
                    <span className="adash-audit-action">{entry.action}</span>
                    <span className="adash-audit-target">{entry.targetLabel}</span>
                  </div>
                  <p className="adash-card-meta">
                    {entry.actorName} · {formatDateTime(entry.createdAt)}
                  </p>
                  {entry.note && <p className="adash-note">“{entry.note}”</p>}
                </div>
              ))}
            </div>
          )
        )}
      </>
    );
  }

  function renderAccountView() {
    return (
      <>
        <PageHeader eyebrow="YOU" title="Account" subtitle="Your RENTA administrator profile." />

        <div className="adash-profile-card">
          <div className="adash-card-head">
            <div className="adash-avatar large">
              {(user.firstName ?? "A").charAt(0).toUpperCase()}
            </div>
            <div className="adash-card-id">
              <p className="adash-card-name">
                {user.firstName ? `${user.firstName} ${user.lastName ?? ""}` : "Administrator"}
              </p>
              <p className="adash-card-sub">Administrator</p>
            </div>
          </div>

          <div className="adash-profile-row">
            <span className="adash-profile-label">Email</span>
            <span className="adash-profile-value">{user.email ?? "—"}</span>
          </div>

          <button className="adash-profile-logout" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </>
    );
  }

  /* ----- LAYOUT ----- */

  return (
    <div className="adash-shell">
      <header className="adash-topbar">
        <button
          className="adash-hamburger"
          onClick={() => setSidebarExpanded((v) => !v)}
          aria-label="Toggle menu"
        >
          <Icon name="menu" size={22} />
        </button>
        <button className="adash-logo" onClick={() => setActiveView("overview")}>
          <span className="adash-logo-circle">R.</span>
          <span className="adash-logo-text">RENTA</span>
          <span className="adash-logo-tag">Admin</span>
        </button>
      </header>

      <div className="adash-body">
        <aside className={sidebarExpanded ? "adash-sidebar expanded" : "adash-sidebar"}>
          <div className="adash-sidebar-section">
            <SidebarItem
              icon="grid"
              label="Overview"
              active={activeView === "overview"}
              expanded={sidebarExpanded}
              onClick={() => setActiveView("overview")}
            />
          </div>

          <div className="adash-sidebar-divider" />

          <div className="adash-sidebar-section">
            {sidebarExpanded && <span className="adash-sidebar-label">Review</span>}
            <SidebarItem
              icon="shield"
              label="Owner verification"
              active={activeView === "owners"}
              expanded={sidebarExpanded}
              badge={awaitingCount}
              onClick={() => openOwners("awaiting_review")}
            />
            <SidebarItem
              icon="building"
              label="Listing approvals"
              active={activeView === "listings"}
              expanded={sidebarExpanded}
              badge={unverifiedCount}
              onClick={() => openListings("unverified")}
            />
          </div>

          <div className="adash-sidebar-divider" />

          <div className="adash-sidebar-section">
            {sidebarExpanded && <span className="adash-sidebar-label">Insights</span>}
            <SidebarItem
              icon="chart"
              label="Reports"
              active={activeView === "reports"}
              expanded={sidebarExpanded}
              onClick={() => setActiveView("reports")}
            />
            <SidebarItem
              icon="clipboard"
              label="Audit log"
              active={activeView === "audit"}
              expanded={sidebarExpanded}
              onClick={() => setActiveView("audit")}
            />
          </div>

          <div className="adash-sidebar-divider" />

          <div className="adash-sidebar-section">
            {sidebarExpanded && <span className="adash-sidebar-label">Manage</span>}
            <SidebarItem
              icon="users"
              label="Users"
              active={activeView === "users"}
              expanded={sidebarExpanded}
              onClick={() => setActiveView("users")}
            />
          </div>

          <div className="adash-sidebar-divider" />

          <div className="adash-sidebar-section">
            {sidebarExpanded && <span className="adash-sidebar-label">You</span>}
            <SidebarItem
              icon="user"
              label={user.firstName ?? "Account"}
              active={activeView === "account"}
              expanded={sidebarExpanded}
              onClick={() => setActiveView("account")}
            />
          </div>

          <div className="adash-sidebar-section adash-sidebar-bottom">
            <SidebarItem
              icon="power"
              label="Log out"
              active={false}
              expanded={sidebarExpanded}
              onClick={handleLogout}
            />
          </div>
        </aside>

        <main className="adash-main">
          <div className="adash-content">
            {activeView === "overview" && renderOverview()}
            {activeView === "owners" && renderOwnersView()}
            {activeView === "listings" && renderListingsView()}
            {activeView === "reports" && renderReportsView()}
            {activeView === "users" && renderUsersView()}
            {activeView === "audit" && renderAuditView()}
            {activeView === "account" && renderAccountView()}
          </div>
        </main>
      </div>

      {reviewTarget && reviewMeta && (
        <div className="adash-modal-overlay" onClick={closeReview}>
          <div className="adash-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{reviewMeta.label}</h3>
            <p className="adash-modal-target">{reviewTarget.label}</p>

            <label className="adash-modal-label" htmlFor="review-note">
              {reviewMeta.noteRequired ? "Reason (required)" : "Note (optional)"}
            </label>
            <textarea
              id="review-note"
              rows={4}
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder={
                reviewTarget.kind === "owner"
                  ? "Saved to the audit trail. The owner can see this on their Account page."
                  : "Saved to the audit trail."
              }
            />

            {reviewError && <p className="adash-modal-error">{reviewError}</p>}

            <div className="adash-modal-actions">
              <button className="adash-btn neutral" onClick={closeReview} disabled={reviewBusy}>
                Cancel
              </button>
              <button
                className={`adash-btn ${reviewMeta.tone === "danger" ? "danger-solid" : "primary"}`}
                onClick={submitReview}
                disabled={reviewBusy}
              >
                {reviewBusy ? "Saving…" : `Confirm: ${reviewMeta.label}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;