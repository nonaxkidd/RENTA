import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../services/api";
import { contactFieldError } from "../utils/contact";
import "./AdminDashboard.css";

interface RentaUser {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
}

type OwnerState =
  | "awaiting_review"
  | "revision_requested"
  | "not_submitted"
  | "approved"
  | "rejected"
  | "suspended"
  | "archived";

type ActiveView = "overview" | "owners" | "listings" | "reports" | "users" | "payments" | "audit" | "account";
type OwnerFilter = OwnerState | "all";
type ListingFilter = "unverified" | "verified" | "all";
type UserFilter = "all" | "tenant" | "owner" | "admin" | "superadmin";
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
  hasIdDocument?: boolean;
  hasAuthorityDocument?: boolean;
  submittedAt?: string;
  reviewedAt?: string;
  reviewNote?: string;
  revisionRequested?: boolean;
}

interface AdminPayment {
  _id: string;
  amount: number;
  status: string;
  note?: string;
  tenantId?: { firstName?: string; lastName?: string; email?: string };
  listingId?: { title?: string; barangay?: string };
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
  reviewNote?: string;
  createdAt: string;
}

interface AdminUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
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
  reservations?: { _id: string; count: number }[];
  payments?: { _id: string; count: number }[];
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
  archived: "Archived",
};

const STATE_TONE: Record<OwnerState, string> = {
  awaiting_review: "warn",
  revision_requested: "warn",
  not_submitted: "muted",
  approved: "good",
  rejected: "bad",
  suspended: "bad",
  archived: "muted",
};

const OWNER_ACTIONS: Record<OwnerState, string[]> = {
  awaiting_review: ["approve", "revision", "reject"],
  revision_requested: ["reject"],
  not_submitted: [],
  approved: ["suspend"],
  rejected: ["approve"],
  suspended: ["reactivate"],
  archived: [],
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
  disapprove: { label: "Disapprove listing", noteRequired: true, tone: "danger" },
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

function DocLink({ label, url, ownerId, kind, stored }: { label: string; url?: string; ownerId?: string; kind?: "id" | "authority"; stored?: boolean }) {
  const href = safeHref(url);

  async function openStored() {
    const response = await api.get(`/admin/owners/${ownerId}/documents/${kind}`, {
      ...getAuthHeaders(),
      responseType: "blob",
    });
    const blobUrl = URL.createObjectURL(response.data);
    window.open(blobUrl);
  }

  return (
    <div className="adash-doc">
      <span className="adash-doc-label">{label}</span>
      {stored ? (
        <button type="button" className="adash-doc-link" onClick={openStored}>Open document</button>
      ) : !url ? (
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
  const [auditSearch, setAuditSearch] = useState("");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [auditTarget, setAuditTarget] = useState("");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [userForm, setUserForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "tenant",
    password: "",
    adminPassword: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    newPassword: "",
    adminPassword: "",
    note: "",
    role: "tenant",
  });
  const [paymentStatus, setPaymentStatus] = useState("");
  const [userMessage, setUserMessage] = useState("");
  const [userBusy, setUserBusy] = useState(false);

  const auditPath = useMemo(() => {
    const params = new URLSearchParams();
    if (auditSearch.trim()) params.set("search", auditSearch.trim());
    if (auditFrom) params.set("from", auditFrom);
    if (auditTo) params.set("to", auditTo);
    if (auditTarget) params.set("targetType", auditTarget);
    const query = params.toString();
    return query ? `/admin/audit?${query}` : "/admin/audit";
  }, [auditSearch, auditFrom, auditTo, auditTarget]);

  const stats = useAdminData<Stats>("/admin/stats", true);
  const owners = useAdminData<{ owners: AdminOwner[] }>("/admin/owners", activeView === "owners");
  const listings = useAdminData<{ listings: AdminListing[] }>("/admin/listings", activeView === "listings");
  const reports = useAdminData<Reports>("/admin/reports", activeView === "reports");
  const users = useAdminData<{ users: AdminUser[] }>("/admin/users", activeView === "users");
  const payments = useAdminData<{ payments: AdminPayment[] }>(
    paymentStatus ? `/admin/payments?status=${paymentStatus}` : "/admin/payments",
    activeView === "payments"
  );
  const audit = useAdminData<{ entries: AuditEntry[]; total?: number }>(
    auditPath,
    activeView === "audit" || activeView === "reports"
  );

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

  function openUserEditor(account: AdminUser) {
    setEditingId(account._id);
    setEditForm({
      firstName: account.firstName,
      lastName: account.lastName,
      email: account.email,
      phone: account.phone || "",
      newPassword: "",
      adminPassword: "",
      note: "",
      role: account.defaultRole,
    });
    setUserMessage("");
  }

  async function saveUserEdits() {
    if (!editingId) return;
    const problem = contactFieldError(editForm.role, editForm.email, editForm.phone);
    if (problem) {
      setUserMessage(problem);
      return;
    }
    setUserBusy(true);
    setUserMessage("");
    try {
      await api.patch(
        `/admin/users/${editingId}`,
        {
          firstName: editForm.firstName,
          lastName: editForm.lastName,
          email: editForm.email,
          phone: editForm.phone,
          ...(user.role === "superadmin" ? { role: editForm.role } : {}),
        },
        getAuthHeaders()
      );
      if (editForm.newPassword) {
        await api.patch(
          `/admin/users/${editingId}/password`,
          { newPassword: editForm.newPassword, adminPassword: editForm.adminPassword },
          getAuthHeaders()
        );
      }
      setUserMessage("Account updated. The password is stored hashed.");
      setEditingId(null);
      users.reload();
      audit.reload();
    } catch (err: any) {
      setUserMessage(err.response?.data?.message || "Couldn't update this account.");
    } finally {
      setUserBusy(false);
    }
  }

  async function changeAccountStatus(id: string, action: "deactivate" | "reactivate" | "archive" | "restore") {
    setUserBusy(true);
    setUserMessage("");
    try {
      await api.patch(
        `/admin/users/${id}/status`,
        { action, note: editForm.note },
        getAuthHeaders()
      );
      setUserMessage(`Account ${action}d.`);
      users.reload();
      stats.reload();
      audit.reload();
    } catch (err: any) {
      setUserMessage(err.response?.data?.message || "Couldn't change this account.");
    } finally {
      setUserBusy(false);
    }
  }

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    const problem = contactFieldError(userForm.role, userForm.email, userForm.phone);
    if (problem) {
      setUserMessage(problem);
      return;
    }
    setUserBusy(true);
    setUserMessage("");
    try {
      await api.post("/admin/users", userForm, getAuthHeaders());
      setShowCreateUser(false);
      setUserForm({ firstName: "", lastName: "", email: "", phone: "", role: "tenant", password: "", adminPassword: "" });
      setUserMessage("User added. The password is stored hashed.");
      users.reload();
      audit.reload();
    } catch (err: any) {
      setUserMessage(err.response?.data?.message || "Couldn't add this user.");
    } finally {
      setUserBusy(false);
    }
  }

  function renderAuditFilters() {
    return (
      <div className="adash-filters">
        <input
          placeholder="Search logs"
          value={auditSearch}
          onChange={(event) => setAuditSearch(event.target.value)}
        />
        <select value={auditTarget} onChange={(event) => setAuditTarget(event.target.value)}>
          <option value="">All targets</option>
          <option value="owner">Owners</option>
          <option value="listing">Listings</option>
          <option value="user">Users</option>
        </select>
        <input type="date" value={auditFrom} onChange={(event) => setAuditFrom(event.target.value)} />
        <input type="date" value={auditTo} onChange={(event) => setAuditTo(event.target.value)} />
      </div>
    );
  }

  function renderAuditEntries() {
    return renderAsync(audit, ({ entries, total }) =>
      entries.length === 0 ? (
        <div className="adash-empty">
          <p className="adash-empty-title">No activity yet</p>
          <p className="adash-empty-text">Decisions you make will be recorded here.</p>
        </div>
      ) : (
        <div className="adash-audit-list">
          <p className="adash-card-meta">{total ?? entries.length} matching records</p>
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
    );
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
                        <DocLink label="Government-issued ID" url={v?.idDocumentUrl} ownerId={owner._id} kind="id" stored={Boolean(v?.hasIdDocument && !v?.idDocumentUrl)} />
                        <DocLink label="Proof of ownership / authority" url={v?.authorityDocumentUrl} ownerId={owner._id} kind="authority" stored={Boolean(v?.hasAuthorityDocument && !v?.authorityDocumentUrl)} />
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
                        {listing.available ? "Available" : "Reserved"}
                      </p>
                      {listing.reviewNote && !listing.verified && (
                        <p className="adash-note">Disapproval comment: {listing.reviewNote}</p>
                      )}
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
                        <>
                          <button
                            className="adash-btn primary"
                            onClick={() => openReview("listing", listing._id, listing.title, "approve")}
                          >
                            Approve
                          </button>
                          <button
                            className="adash-btn danger"
                            onClick={() => openReview("listing", listing._id, listing.title, "disapprove")}
                          >
                            Disapprove
                          </button>
                        </>
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
                <StatCard
                  label="Paid down payments"
                  value={r.payments?.find((payment) => payment._id === "paid")?.count ?? 0}
                />
                <StatCard
                  label="Open reservations"
                  value={
                    r.reservations
                      ?.filter((item) => item._id === "queued" || item._id === "payment_pending")
                      .reduce((sum, item) => sum + item.count, 0) ?? 0
                  }
                />
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

              <h2 className="adash-section-title">Activity history</h2>
              <p className="adash-card-meta">Filter administrator logs by text, target, or date.</p>
              {renderAuditFilters()}
              {renderAuditEntries()}
            </>
          );
        })}
      </>
    );
  }

  async function markRefunded(id: string) {
    setUserMessage("");
    try {
      await api.patch(`/admin/payments/${id}/refund`, {}, getAuthHeaders());
      payments.reload();
      audit.reload();
    } catch (err: any) {
      setUserMessage(err.response?.data?.message || "Couldn't mark this payment refunded.");
    }
  }

  function renderPaymentsView() {
    return (
      <>
        <PageHeader eyebrow="MANAGE" title="Payments" subtitle="Down payments, including ones that need a refund." />
        {userMessage && <p className="adash-note">{userMessage}</p>}
        <select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
          <option value="needs_refund">Needs refund</option>
          <option value="refunded">Refunded</option>
        </select>
        {renderAsync(payments, ({ payments: rows }) => (
          rows.length === 0 ? <p className="adash-muted">No payments match this filter.</p> : (
            <div className="adash-audit-list">
              {rows.map((payment) => (
                <div className="adash-audit-row" key={payment._id}>
                  <div className="adash-audit-main">
                    <span className="adash-audit-action">{payment.listingId?.title || "Listing"}</span>
                    <span className="adash-audit-target">₱{payment.amount.toLocaleString()} · {payment.status}</span>
                  </div>
                  <p className="adash-card-meta">
                    {payment.tenantId ? `${payment.tenantId.firstName || ""} ${payment.tenantId.lastName || ""}`.trim() : "Tenant"}
                    {payment.listingId?.barangay ? ` · ${payment.listingId.barangay}` : ""}
                  </p>
                  {payment.status === "needs_refund" && (
                    <button type="button" className="adash-btn neutral" onClick={() => markRefunded(payment._id)}>Mark refunded</button>
                  )}
                </div>
              ))}
            </div>
          )
        ))}
      </>
    );
  }

  function renderUsersView() {
    return (
      <>
        <PageHeader
          eyebrow="MANAGE"
          title="Users"
          subtitle="Add or edit accounts, reset a hashed password, or deactivate, archive, and restore them."
        />
        <button className="adash-btn primary" onClick={() => setShowCreateUser((open) => !open)}>
          {showCreateUser ? "Close" : "Add user"}
        </button>
        {userMessage && <p className="adash-note">{userMessage}</p>}
        {showCreateUser && (
          <form className="adash-inline-form" onSubmit={createAccount}>
            <input placeholder="First name" value={userForm.firstName} onChange={(event) => setUserForm({ ...userForm, firstName: event.target.value })} required />
            <input placeholder="Last name" value={userForm.lastName} onChange={(event) => setUserForm({ ...userForm, lastName: event.target.value })} required />
            <input type="email" placeholder="name@gmail.com" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} required />
            <input placeholder="09XXXXXXXXX" value={userForm.phone} onChange={(event) => setUserForm({ ...userForm, phone: event.target.value })} required />
            <select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}>
              <option value="tenant">Tenant</option>
              <option value="owner">Owner</option>
              {user.role === "superadmin" && <option value="admin">Admin</option>}
              {user.role === "superadmin" && <option value="superadmin">Superadmin</option>}
            </select>
            <input type="password" placeholder="Password (hashed when saved)" value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} required />
            <input type="password" placeholder="Your admin password" value={userForm.adminPassword} onChange={(event) => setUserForm({ ...userForm, adminPassword: event.target.value })} required />
            <button className="adash-btn primary" disabled={userBusy}>Save user</button>
          </form>
        )}

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
                  { key: "superadmin", label: "Superadmins", count: list.filter((u) => u.defaultRole === "superadmin").length },
                ]}
              />

              <div className="adash-table-wrap">
                <div className="adash-table">
                  <div className="adash-table-row users head">
                    <span>Name</span>
                    <span>Email</span>
                    <span>Phone</span>
                    <span>Role</span>
                    <span>Status</span>
                    <span>Actions</span>
                  </div>
                  {visible.map((u) => (
                    <div className="adash-table-row users" key={u._id}>
                      <span>
                        {u.firstName} {u.lastName}
                      </span>
                      <span>{u.email}</span>
                      <span>{u.phone || "—"}</span>
                      <span className="adash-cap">{u.defaultRole}</span>
                      <span className="adash-cap">{u.status}</span>
                      <span>
                        <button className="adash-btn neutral" onClick={() => openUserEditor(u)}>Edit</button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {editingId && (
                <form
                  className="adash-inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveUserEdits();
                  }}
                >
                  <h2 className="adash-panel-title">Recover or edit account</h2>
                  <input value={editForm.firstName} onChange={(event) => setEditForm({ ...editForm, firstName: event.target.value })} required />
                  <input value={editForm.lastName} onChange={(event) => setEditForm({ ...editForm, lastName: event.target.value })} required />
                  <input type="email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} required />
                  <input placeholder="09XXXXXXXXX" value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} required />
                  {user.role === "superadmin" && (
                    <select value={editForm.role} onChange={(event) => setEditForm({ ...editForm, role: event.target.value })}>
                      <option value="tenant">Tenant</option>
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="superadmin">Superadmin</option>
                    </select>
                  )}
                  <input type="password" placeholder="New password (optional)" value={editForm.newPassword} onChange={(event) => setEditForm({ ...editForm, newPassword: event.target.value })} />
                  <input type="password" placeholder="Your admin password (required to reset password)" value={editForm.adminPassword} onChange={(event) => setEditForm({ ...editForm, adminPassword: event.target.value })} />
                  <input placeholder="Reason for deactivate or archive" value={editForm.note} onChange={(event) => setEditForm({ ...editForm, note: event.target.value })} />
                  <div className="adash-user-actions">
                    <button className="adash-btn primary" disabled={userBusy}>Save edits</button>
                    <button type="button" className="adash-btn danger" disabled={userBusy} onClick={() => changeAccountStatus(editingId, "deactivate")}>Deactivate</button>
                    <button type="button" className="adash-btn neutral" disabled={userBusy} onClick={() => changeAccountStatus(editingId, "reactivate")}>Activate</button>
                    <button type="button" className="adash-btn danger" disabled={userBusy} onClick={() => changeAccountStatus(editingId, "archive")}>Archive</button>
                    <button type="button" className="adash-btn neutral" disabled={userBusy} onClick={() => changeAccountStatus(editingId, "restore")}>Restore</button>
                  </div>
                </form>
              )}
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

        {renderAuditFilters()}
        {renderAuditEntries()}
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
            <SidebarItem
              icon="clipboard"
              label="Payments"
              active={activeView === "payments"}
              expanded={sidebarExpanded}
              onClick={() => setActiveView("payments")}
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
            {activeView === "payments" && renderPaymentsView()}
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