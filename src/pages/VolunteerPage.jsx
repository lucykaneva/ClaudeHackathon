import { useState, useEffect } from "react";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { getVolunteerLocation, haversineDistance } from "../geo";
import { getRouteOrder, verifyPhoto } from "../claude";
import "./VolunteerPage.css";

const FOOD_EMOJI = {
  "Noodles": "🍜",
  "Cooked meals": "🍱",
  "Bread & bakery": "🥖",
  "Dim sum": "🥟",
  "Drinks": "🧃",
  "Other": "🍽️",
};

const ICON_BG = {
  "Noodles": "#FAEEDA",
  "Cooked meals": "#E1F5EE",
  "Bread & bakery": "#FEF3C7",
  "Dim sum": "#E1F5EE",
  "Drinks": "#E6F1FB",
  "Other": "#F3E8FF",
};

const IMPACT = [
  { num: "143", label: "Meals rescued",    delta: "↑ 3× last Saturday" },
  { num: "7",   label: "Pickups done",     delta: "Top 12% this week"  },
  { num: "4",   label: "Partners thanked", delta: "Via Claude drafts"  },
];

export default function VolunteerPage() {
  const [form, setForm] = useState({ name: "", phone: "", district: "", availability: "", transport: "" });
  const [pledged, setPledged] = useState(false);
  const [pledgeError, setPledgeError] = useState(false);
  const [registered, setRegistered] = useState(false);

  const [listings, setListings] = useState([]);
  const [claimed, setClaimed] = useState({});
  const claimedIds = Object.keys(claimed).filter((id) => claimed[id]);

  const [volunteerLocation, setVolunteerLocation] = useState(null);
  const [route, setRoute] = useState(null);
  const [routeReason, setRouteReason] = useState("");
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");

  const [photos, setPhotos] = useState([]);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  // Real-time Firestore listener for open listings
  useEffect(() => {
    const q = query(collection(db, "listings"), where("status", "==", "open"));
    const unsub = onSnapshot(q, (snap) => {
      setListings(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // Get volunteer geolocation on mount
  useEffect(() => {
    getVolunteerLocation()
      .then(setVolunteerLocation)
      .catch(() => {}); // silently fall back — route button will show error
  }, []);

  // Trigger Claude route optimizer when 2+ listings are claimed
  useEffect(() => {
    if (claimedIds.length < 2) { setRoute(null); setRouteReason(""); return; }
    const claimedListings = listings.filter((l) => claimedIds.includes(l.id));
    if (!volunteerLocation || claimedListings.length < 2) return;

    setRouteLoading(true);
    setRouteError("");
    getRouteOrder(volunteerLocation.lat, volunteerLocation.lng, claimedListings)
      .then(({ order, reason }) => {
        setRoute(order);
        setRouteReason(reason);
      })
      .catch((err) => setRouteError(err.message))
      .finally(() => setRouteLoading(false));
  }, [claimedIds.join(","), volunteerLocation]);

  function handleInput(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit() {
    if (!form.name.trim()) { document.getElementById("v-name").focus(); return; }
    if (!pledged) {
      setPledgeError(true);
      setTimeout(() => setPledgeError(false), 1800);
      return;
    }
    await addDoc(collection(db, "volunteers"), { ...form, pledged: true, createdAt: serverTimestamp() });
    setRegistered(true);
  }

  async function handleClaim(id) {
    setClaimed((prev) => ({ ...prev, [id]: true }));
    await updateDoc(doc(db, "listings", id), { status: "claimed", claimedBy: form.name || "volunteer" });
  }

  function handleFiles(e) {
    const newFiles = Array.from(e.target.files).filter((f) => f.type.startsWith("image/"));
    setPhotos((prev) => [...prev, ...newFiles]);
    setVerifyResult(null);
  }

  function removePhoto(i) {
    setPhotos((prev) => prev.filter((_, idx) => idx !== i));
    setVerifyResult(null);
  }

  async function handleVerify() {
    if (!photos[0]) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const base64 = await toBase64(photos[0]);
      const { verified, reason } = await verifyPhoto(base64);
      setVerifyResult(
        verified
          ? `✓ Delivery verified — ${reason}`
          : `✗ Could not verify — ${reason}`
      );
    } catch (err) {
      setVerifyResult(`Error: ${err.message}`);
    } finally {
      setVerifying(false);
    }
  }

  function toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Build ordered listing objects for the route card
  const orderedClaimedListings = route
    ? route.map((id) => listings.find((l) => l.id === id)).filter(Boolean)
    : [];

  return (
    <div>
      {/* NAV */}
      <nav className="fb-nav">
        <div className="fb-nav-logo">
          <div className="fb-logo-dot" />
          FoodBridge
        </div>
        {["Map", "Volunteers", "Restaurants", "Impact"].map((t) => (
          <div key={t} className={`fb-nav-tab ${t === "Volunteers" ? "active" : ""}`}>{t}</div>
        ))}
      </nav>

      {/* BODY */}
      <div className="fb-page">

        {/* ── LEFT COLUMN ── */}
        <div>

          {/* Registration card */}
          <div className="fb-card">
            <div className="fb-card-title">Join as a volunteer</div>

            {registered ? (
              <div className="fb-success-state">
                <div className="fb-success-icon">✓</div>
                <strong style={{ fontSize: 14, fontWeight: 500 }}>You're on the team!</strong>
                <p>We'll WhatsApp you when a listing opens near you.</p>
              </div>
            ) : (
              <>
                <div className="fb-form-group">
                  <label className="fb-form-label">Full name</label>
                  <input id="v-name" className="fb-form-input" type="text" name="name" placeholder="Jane Smith" value={form.name} onChange={handleInput} />
                </div>

                <div className="fb-form-group">
                  <label className="fb-form-label">WhatsApp number</label>
                  <input className="fb-form-input" type="tel" name="phone" placeholder="+852 9123 4567" value={form.phone} onChange={handleInput} />
                </div>

                <div className="fb-form-row">
                  <div className="fb-form-group">
                    <label className="fb-form-label">District</label>
                    <select className="fb-form-select" name="district" value={form.district} onChange={handleInput}>
                      <option value="">Select…</option>
                      {["Wan Chai","Central","Causeway Bay","TST","Mong Kok","Sham Shui Po"].map((d) => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="fb-form-group">
                    <label className="fb-form-label">Availability</label>
                    <select className="fb-form-select" name="availability" value={form.availability} onChange={handleInput}>
                      <option value="">Select…</option>
                      {["Evenings (5–9pm)","Weekends","Flexible"].map((a) => <option key={a}>{a}</option>)}
                    </select>
                  </div>
                </div>

                <div className="fb-form-group">
                  <label className="fb-form-label">Transport</label>
                  <select className="fb-form-select" name="transport" value={form.transport} onChange={handleInput}>
                    <option value="">Select…</option>
                    {["On foot","Bicycle / e-bike","Motorcycle","Car / van","Public transit"].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>

                <div className={`fb-pledge-box ${pledgeError ? "error" : ""}`}>
                  <input type="checkbox" id="pledge" checked={pledged} onChange={(e) => setPledged(e.target.checked)} />
                  <label htmlFor="pledge" className="fb-pledge-text">
                    <strong>Volunteer pledge</strong>
                    I commit to showing up for claimed pickups, handling food safely, and treating all recipients with dignity and respect.
                  </label>
                </div>

                <button className="fb-btn-primary" onClick={handleSubmit}>Register as volunteer</button>
              </>
            )}
          </div>

          {/* Photo upload card */}
          <div className="fb-card">
            <div className="fb-card-title">Upload delivery photos</div>
            <p className="fb-upload-hint">After a pickup, upload a photo so Claude Vision can verify the delivery and log it to the impact dashboard.</p>

            {photos.length === 0 ? (
              <label className="fb-upload-zone">
                <input type="file" accept="image/*" multiple onChange={handleFiles} style={{ display: "none" }} />
                <div className="fb-upload-icon">↑</div>
                <div className="fb-upload-zone-label">Drop photos or click to browse</div>
                <div className="fb-upload-zone-hint">PNG, JPG — compressed for Claude Vision</div>
              </label>
            ) : (
              <>
                <div className="fb-thumb-grid">
                  {photos.map((f, i) => (
                    <div key={i} className="fb-thumb">
                      <img src={URL.createObjectURL(f)} alt="preview" />
                      <button className="fb-thumb-rm" onClick={() => removePhoto(i)}>✕</button>
                    </div>
                  ))}
                  {photos.length < 8 && (
                    <label className="fb-thumb-add">
                      <input type="file" accept="image/*" multiple onChange={handleFiles} style={{ display: "none" }} />
                      +
                    </label>
                  )}
                </div>
                <button className="fb-btn-outline" onClick={handleVerify} disabled={verifying}>
                  {verifying ? "Verifying…" : "Verify with Claude Vision ↗"}
                </button>
              </>
            )}

            {verifyResult && <div className="fb-verify-result">{verifyResult}</div>}
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div>

          {/* Listings card */}
          <div className="fb-card">
            <div className="fb-card-title">
              Open listings near you
              <span className="available-count">{listings.length} available</span>
            </div>

            {listings.length === 0 && (
              <p style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "16px 0" }}>
                Loading listings…
              </p>
            )}

            {listings.map((l) => {
              const emoji = FOOD_EMOJI[l.foodType] || "🍽️";
              const iconBg = ICON_BG[l.foodType] || "#F3F4F6";
              const isClaimed = claimed[l.id];
              return (
                <div key={l.id} className={`fb-listing-card ${isClaimed ? "claimed" : ""}`}>
                  <div className="fb-lc-top">
                    <div className="fb-lc-icon" style={{ background: iconBg }}>{emoji}</div>
                    <div>
                      <div className="fb-lc-name">{l.restaurantName} · {l.address?.split(",")[1]?.trim() || ""}</div>
                      <div className="fb-lc-sub">~{l.quantity} portions · Pickup {l.pickupStart}–{l.pickupEnd}</div>
                    </div>
                  </div>
                  <div className="fb-lc-badges">
                    <span className="fb-badge fb-badge-green">{l.foodType}</span>
                    <span className="fb-badge fb-badge-amber">{l.quantity} portions</span>
                    {volunteerLocation && (
                      <span className="fb-badge fb-badge-blue">
                        {haversineDistance(volunteerLocation.lat, volunteerLocation.lng, l.lat, l.lng).toFixed(1)} mi away
                      </span>
                    )}
                  </div>
                  <div className="fb-lc-meta">
                    <div className="fb-lc-expiry">Closes <span>{l.pickupEnd}</span></div>
                    {isClaimed
                      ? <span className="fb-claimed-label">Claimed ✓</span>
                      : <button className="fb-claim-btn" onClick={() => handleClaim(l.id)}>Claim pickup</button>
                    }
                  </div>
                </div>
              );
            })}
          </div>

          {/* Claude route card — appears after 2+ claims */}
          {claimedIds.length >= 2 && (
            <div className="fb-card route-card" style={{ marginTop: 16 }}>
              <div className="fb-card-title">
                <span><span className="claude-label">Claude</span> · Optimized route</span>
              </div>

              {routeLoading && (
                <p style={{ fontSize: 13, color: "#9ca3af", padding: "8px 0" }}>Calculating best route…</p>
              )}

              {routeError && (
                <p style={{ fontSize: 13, color: "#ef4444", padding: "8px 0" }}>{routeError}</p>
              )}

              {!routeLoading && !routeError && orderedClaimedListings.length > 0 && (
                <div className="fb-route-stops">
                  {orderedClaimedListings.map((l, i) => (
                    <div key={l.id} className="fb-route-stop">
                      <span className={`fb-stop-badge fb-stop-${i + 1}`}>Stop {i + 1}</span>
                      <span className="fb-stop-name">{l.restaurantName}, {l.address?.split(",")[1]?.trim() || l.address}</span>
                    </div>
                  ))}
                  {routeReason && (
                    <div className="fb-route-reasoning">
                      <strong>Claude's reasoning:</strong> {routeReason}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Impact card */}
          <div className="fb-card" style={{ marginTop: 16 }}>
            <div className="fb-card-title">Your impact</div>
            <div className="fb-impact-strip">
              {IMPACT.map((s) => (
                <div key={s.label} className="fb-impact-stat">
                  <div className="fb-impact-num">{s.num}</div>
                  <div className="fb-impact-label">{s.label}</div>
                  <div className="fb-impact-delta">{s.delta}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
