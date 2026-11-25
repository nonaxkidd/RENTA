import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import api from "../services/api";
import "./OwnerVerificationPanel.css";

interface VerificationInfo {
  hasIdDocument?: boolean;
  hasAuthorityDocument?: boolean;
  submittedAt?: string;
  reviewedAt?: string;
  reviewNote?: string;
  revisionRequested?: boolean;
}

interface VerificationResponse {
  status: "pending" | "active" | "suspended" | "rejected";
  verification: VerificationInfo | null;
}

interface OwnerVerificationPanelProps {
  onStatusChange: () => void;
}

function getAuthHeaders() {
  const token = localStorage.getItem("renta_token");
  return { headers: { Authorization: `Bearer ${token}` } };
}

// Keeps the cached login info in sync when an admin has changed the status
function syncStoredStatus(status: string): boolean {
  const stored = localStorage.getItem("renta_user");
  if (!stored) return false;

  const parsed = JSON.parse(stored);
  if (parsed.status === status) return false;

  parsed.status = status;
  localStorage.setItem("renta_user", JSON.stringify(parsed));
  return true;
}

function formatDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function OwnerVerificationPanel({ onStatusChange }: OwnerVerificationPanelProps) {
  const [data, setData] = useState<VerificationResponse | null>(null);
  const [error, setError] = useState("");
  const [idFile, setIdFile] = useState<File | null>(null);
  const [authorityFile, setAuthorityFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [replacing, setReplacing] = useState(false);

  async function load() {
    try {
      const response = await api.get<VerificationResponse>("/verification/me", getAuthHeaders());
      setData(response.data);
      if (syncStoredStatus(response.data.status)) {
        onStatusChange();
      }
    } catch {
      setError("Couldn't load your verification status.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormMessage("");

    try {
      if (!idFile || !authorityFile) {
        setFormMessage("Choose both files.");
        return;
      }
      setSubmitting(true);
      const body = new FormData();
      body.append("idDocument", idFile);
      body.append("authorityDocument", authorityFile);
      await api.post("/verification", body, getAuthHeaders());
      setIdFile(null);
      setAuthorityFile(null);
      setReplacing(false);
      await load();
    } catch (err: any) {
      setFormMessage(err.response?.data?.message || "Couldn't submit your documents.");
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <div className="ovp-card">
        <p className="ovp-muted">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="ovp-card">
        <p className="ovp-muted">Loading verification status…</p>
      </div>
    );
  }

  const v = data.verification;
  const submitted = Boolean(v?.hasIdDocument && v?.hasAuthorityDocument);

  async function openMine(kind: "id" | "authority") {
    const response = await api.get(`/verification/files/me/${kind}`, { ...getAuthHeaders(), responseType: "blob" });
    window.open(URL.createObjectURL(response.data), "_blank", "noopener,noreferrer");
  }
  const awaitingReview = data.status === "pending" && submitted && !v?.revisionRequested;
  const canSubmit = data.status === "pending" || data.status === "rejected";
  const showForm = canSubmit && (!submitted || v?.revisionRequested || data.status === "rejected" || replacing);

  return (
    <div className="ovp-card">
      <h2 className="ovp-title">Verification</h2>

      {data.status === "active" && (
        <div className="ovp-banner good">
          Your account is verified. Your listings can now be reviewed for approval.
        </div>
      )}

      {data.status === "suspended" && (
        <div className="ovp-banner bad">
          Your account is suspended.
          {v?.reviewNote ? ` Reason: ${v.reviewNote}` : ""} Please contact an administrator.
        </div>
      )}

      {data.status === "rejected" && (
        <div className="ovp-banner bad">
          Your submission was rejected.
          {v?.reviewNote ? ` Reason: ${v.reviewNote}` : ""} You can submit new documents below.
        </div>
      )}

      {data.status === "pending" && v?.revisionRequested && (
        <div className="ovp-banner warn">
          The administrator asked for a revision.
          {v.reviewNote ? ` Note: ${v.reviewNote}` : ""} Please resubmit your documents below.
        </div>
      )}

      {awaitingReview && (
        <div className="ovp-banner warn">
          Submitted {formatDate(v?.submittedAt)} — waiting for administrator review.
        </div>
      )}

      {data.status === "pending" && !submitted && (
        <div className="ovp-banner warn">
          Submit your documents so an administrator can verify your account.
        </div>
      )}

      {submitted && (
        <p>
          <button type="button" className="ovp-link-btn" onClick={() => openMine("id")}>View my ID</button>
          <button type="button" className="ovp-link-btn" onClick={() => openMine("authority")}>View my proof</button>
        </p>
      )}

      {awaitingReview && !replacing && (
        <button className="ovp-link-btn" onClick={() => setReplacing(true)}>
          Replace my submitted documents
        </button>
      )}

      {showForm && (
        <form className="ovp-form" onSubmit={handleSubmit}>
          <p className="ovp-warning">
            Upload a government ID and proof of authority. JPEG, PNG, WEBP, or PDF, up to 5 MB. The files are encrypted before they are saved.
          </p>

          <label htmlFor="ovp-id">Government-issued ID</label>
          <input id="ovp-id" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setIdFile(e.target.files?.[0] ?? null)} required />

          <label htmlFor="ovp-authority">Proof of ownership or authority to manage</label>
          <input id="ovp-authority" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setAuthorityFile(e.target.files?.[0] ?? null)} required />

          {formMessage && <p className="ovp-error">{formMessage}</p>}

          <button type="submit" className="ovp-submit" disabled={submitting}>
            {submitting ? "Submitting…" : submitted ? "Resubmit documents" : "Submit for review"}
          </button>
        </form>
      )}
    </div>
  );
}

export default OwnerVerificationPanel;