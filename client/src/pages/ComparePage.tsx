import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../services/api";
import "./ComparePage.css";

interface CompareListing {
  _id: string;
  title: string;
  type: string;
  barangay: string;
  price: number;
  transparency: number;
  verified: boolean;
  capacity: number;
  available: boolean;
  amenities: string[];
  houseRules: string[];
  ownerName: string;
  imageUrl?: string;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function formatPeso(value: number) {
  return `₱${value.toLocaleString()}`;
}

// Only ever use http(s) image links
function safeImage(url?: string) {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cmpg-row">
      <div className="cmpg-label">{label}</div>
      {children}
    </div>
  );
}

function Cell({ children, tag }: { children: ReactNode; tag?: string }) {
  return (
    <div className={tag ? "cmpg-cell edge" : "cmpg-cell"}>
      <div className="cmpg-cell-value">{children}</div>
      {tag && <span className="cmpg-tag">{tag}</span>}
    </div>
  );
}

function ComparePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const idA = params.get("a");
  const idB = params.get("b");

  const [listings, setListings] = useState<[CompareListing | null, CompareListing | null] | null>(null);
  const [notes, setNotes] = useState<[string, string]>(["", ""]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!idA || !idB || idA === idB) {
      setError("Pick two different listings to compare.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      api.get(`/listings/${idA}`).then((response) => ({ listing: response.data.listing as CompareListing, note: "" })).catch(() => ({ listing: null, note: "This listing was removed." })),
      api.get(`/listings/${idB}`).then((response) => ({ listing: response.data.listing as CompareListing, note: "" })).catch(() => ({ listing: null, note: "This listing was removed." })),
    ])
      .then(([first, second]) => {
        if (cancelled) return;
        setListings([first.listing, second.listing]);
        setNotes([
          first.note || (first.listing && !first.listing.available ? "This listing is no longer available." : ""),
          second.note || (second.listing && !second.listing.available ? "This listing is no longer available." : ""),
        ]);
        if (!first.listing && !second.listing) setError("Both listings were removed.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [idA, idB]);

  const nav = (
    <nav className="cmpg-nav">
      <Link to="/tenant" className="cmpg-logo">
        <span className="cmpg-logo-circle">R.</span>
        <span className="cmpg-logo-text">RENTA</span>
      </Link>
      <button className="cmpg-back" onClick={() => navigate("/tenant")}>
        ← Back to listings
      </button>
    </nav>
  );

  if (loading) {
    return (
      <div className="cmpg-page">
        {nav}
        <div className="cmpg-center">
          <div className="cmpg-spinner" />
        </div>
      </div>
    );
  }

  if (error || !listings) {
    return (
      <div className="cmpg-page">
        {nav}
        <div className="cmpg-center">
          <p className="cmpg-error">{error || "Something went wrong."}</p>
          <button className="cmpg-primary" onClick={() => navigate("/tenant")}>
            Choose listings
          </button>
        </div>
      </div>
    );
  }

  const [a, b] = listings;
  if (!a || !b) {
    return (
      <div className="cmpg-page">
        {nav}
        <div className="cmpg-center">
          {notes[0] && <p className="cmpg-error">{notes[0]}</p>}
          {notes[1] && <p className="cmpg-error">{notes[1]}</p>}
          {(a || b) && <p>{[a?.title, b?.title].filter(Boolean).join(" and ")} is still listed.</p>}
          <button className="cmpg-primary" onClick={() => navigate("/tenant")}>Choose listings</button>
        </div>
      </div>
    );
  }
  const pair = [a, b];

  const cheaper = a.price === b.price ? null : a.price < b.price ? a : b;
  const priceGap = Math.abs(a.price - b.price);

  const aAmenities = new Set(a.amenities.map(normalize));
  const bAmenities = new Set(b.amenities.map(normalize));
  const sharedAmenities = a.amenities.filter((item) => bAmenities.has(normalize(item)));

  const lowestPriceId = cheaper ? cheaper._id : null;
  const topTransparencyId =
    a.transparency === b.transparency ? null : a.transparency > b.transparency ? a._id : b._id;
  const verifiedEdgeId = a.verified === b.verified ? null : a.verified ? a._id : b._id;
  const availableEdgeId = a.available === b.available ? null : a.available ? a._id : b._id;

  return (
    <div className="cmpg-page">
      {nav}

      <main className="cmpg-main">
        <p className="cmpg-eyebrow">COMPARE</p>
        <h1 className="cmpg-title">Side by side</h1>

        {(notes[0] || notes[1]) && (
          <p className="cmpg-error">{[notes[0], notes[1]].filter(Boolean).join(" ")}</p>
        )}

        <div className="cmpg-summary">
          <p>
            {cheaper ? (
              <>
                <strong>{cheaper.title}</strong> is {formatPeso(priceGap)} cheaper per month.
              </>
            ) : (
              "Both listings cost the same per month."
            )}
          </p>
          <p>
            {sharedAmenities.length > 0
              ? `Both include: ${sharedAmenities.join(", ")}.`
              : "These listings don't share any listed amenities."}
          </p>
        </div>

        <div className="cmpg-table">
          <div className="cmpg-row cmpg-head">
            <div className="cmpg-label" />
            {pair.map((listing) => {
              const image = safeImage(listing.imageUrl);

              return (
                <div className="cmpg-listing-card" key={listing._id}>
                  {image ? (
                    <img className="cmpg-photo" src={image} alt={listing.title} />
                  ) : (
                    <div className="cmpg-photo placeholder">No photo</div>
                  )}
                  <div className="cmpg-listing-body">
                    <Link to={`/listings/${listing._id}`} className="cmpg-listing-title">
                      {listing.title}
                    </Link>
                    <p className="cmpg-listing-sub">
                      {listing.type} · {listing.barangay}
                    </p>
                    <p className="cmpg-listing-price">
                      {formatPeso(listing.price)}
                      <span> / month</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <Row label="Monthly rent">
            {pair.map((l) => (
              <Cell key={l._id} tag={l._id === lowestPriceId ? "Lower rent" : undefined}>
                {formatPeso(l.price)}
              </Cell>
            ))}
          </Row>

          <Row label="Type">
            {pair.map((l) => (
              <Cell key={l._id}>{l.type}</Cell>
            ))}
          </Row>

          <Row label="Barangay">
            {pair.map((l) => (
              <Cell key={l._id}>{l.barangay}</Cell>
            ))}
          </Row>

          <Row label="Capacity">
            {pair.map((l) => (
              <Cell key={l._id}>
                Up to {l.capacity} {l.capacity === 1 ? "person" : "people"}
              </Cell>
            ))}
          </Row>

          <Row label="Availability">
            {pair.map((l) => (
              <Cell key={l._id} tag={l._id === availableEdgeId ? "Available" : undefined}>
                {l.available ? "Available now" : "Currently occupied"}
              </Cell>
            ))}
          </Row>

          <Row label="Transparency score">
            {pair.map((l) => (
              <Cell key={l._id} tag={l._id === topTransparencyId ? "Higher score" : undefined}>
                {l.transparency}%
              </Cell>
            ))}
          </Row>

          <Row label="Verification">
            {pair.map((l) => (
              <Cell key={l._id} tag={l._id === verifiedEdgeId ? "Verified" : undefined}>
                {l.verified ? "Verified" : "Not yet verified"}
              </Cell>
            ))}
          </Row>

          <Row label="Amenities">
            {pair.map((l) => {
              const otherSet = l._id === a._id ? bAmenities : aAmenities;

              return (
                <Cell key={l._id}>
                  {l.amenities.length === 0 ? (
                    <span className="cmpg-none">None listed</span>
                  ) : (
                    <div className="cmpg-chips">
                      {l.amenities.map((item) => (
                        <span
                          key={item}
                          className={otherSet.has(normalize(item)) ? "cmpg-chip" : "cmpg-chip unique"}
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  )}
                </Cell>
              );
            })}
          </Row>
          <p className="cmpg-legend">Highlighted amenities are only offered by that listing.</p>

          <Row label="House rules">
            {pair.map((l) => (
              <Cell key={l._id}>
                {l.houseRules.length === 0 ? (
                  <span className="cmpg-none">None listed</span>
                ) : (
                  <ul className="cmpg-list">
                    {l.houseRules.map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ul>
                )}
              </Cell>
            ))}
          </Row>

          <Row label="Owner">
            {pair.map((l) => (
              <Cell key={l._id}>{l.ownerName}</Cell>
            ))}
          </Row>
        </div>
      </main>
    </div>
  );
}

export default ComparePage;