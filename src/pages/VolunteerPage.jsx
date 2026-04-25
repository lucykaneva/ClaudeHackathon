import { useState } from 'react'

const LISTINGS = [
  { id: 'lc1', emoji: '🥟', name: 'Dim Sum Palace', district: 'Wan Chai',
    type: 'Dim sum / Cantonese', boxes: 35, distance: '0.8 km', window: '6–8 PM', expires: '7:00 PM' },
  { id: 'lc2', emoji: '🍱', name: 'Bento Garden', district: 'Central',
    type: 'Japanese bento', boxes: 40, distance: '2.1 km', window: '6–8 PM', expires: '8:00 PM' },
  { id: 'lc3', emoji: '🍕', name: 'Mama Mia Pizzeria', district: 'TST',
    type: 'Pizza / Italian', boxes: 18, distance: '3.4 km', window: '7–9 PM', expires: '9:00 PM' },
]

const IMPACT = [
  { num: '143', label: 'Meals rescued',    delta: '↑ 3× last Saturday' },
  { num: '7',   label: 'Pickups done',     delta: 'Top 12% this week'  },
  { num: '4',   label: 'Partners thanked', delta: 'Via Claude drafts'  },
]

export default function VolunteerPage() {
  const [form, setForm] = useState({ name: '', phone: '', district: '', availability: '', transport: '' })
  const [pledged, setPledged] = useState(false)
  const [pledgeError, setPledgeError] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [claimed, setClaimed] = useState({})
  const [photos, setPhotos] = useState([])
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState(null)

  const claimedCount = Object.values(claimed).filter(Boolean).length

  function handleInput(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  function handleSubmit() {
    if (!form.name.trim()) return
    if (!pledged) {
      setPledgeError(true)
      setTimeout(() => setPledgeError(false), 1800)
      return
    }
    setRegistered(true)
    // 🔌 FIREBASE: addDoc(collection(db, 'volunteers'), { ...form, pledged: true, createdAt: serverTimestamp() })
  }

  function handleClaim(id) {
    setClaimed(prev => ({ ...prev, [id]: true }))
    // 🔌 FIREBASE: updateDoc(doc(db, 'listings', id), { status: 'claimed', claimedBy: volunteerId })
  }

  function handleFiles(e) {
    const newFiles = Array.from(e.target.files).filter(f => f.type.startsWith('image/'))
    setPhotos(prev => [...prev, ...newFiles])
    setVerifyResult(null)
  }

  function removePhoto(i) {
    setPhotos(prev => prev.filter((_, idx) => idx !== i))
    setVerifyResult(null)
  }

  function handleVerify() {
    setVerifying(true)
    setVerifyResult(null)
    // 🔌 CLAUDE VISION: real API call goes here
    // const base64 = await toBase64(photos[0])
    // const res = await fetch('/api/verify', { method: 'POST', body: JSON.stringify({ image: base64 }) })
    setTimeout(() => {
      setVerifying(false)
      setVerifyResult('Distribution verified — Claude Vision detected food containers in a public outdoor setting. Pickup logged: 35 boxes, Wan Chai → Sham Shui Po. Impact dashboard updated.')
    }, 1800)
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-[340px_1fr] gap-5 items-start">

        {/* ── LEFT COLUMN ── */}
        <div className="space-y-4">

          {/* Registration card */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-4 pb-3 border-b border-stone-100">
              Join as a volunteer
            </p>

            {registered ? (
              <div className="text-center py-6">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 text-green-600 text-lg">✓</div>
                <p className="font-medium text-stone-800 text-sm">You're on the team!</p>
                <p className="text-stone-500 text-xs mt-1">We'll WhatsApp you when a listing opens near you.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Full name</label>
                  <input
                    name="name" value={form.name} onChange={handleInput}
                    placeholder="Jane Smith" required
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                  />
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-1">WhatsApp number</label>
                  <input
                    name="phone" value={form.phone} onChange={handleInput}
                    placeholder="+1 212 555 0123" type="tel"
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">District</label>
                    <select name="district" value={form.district} onChange={handleInput}
                      className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-500 transition">
                      <option value="">Select…</option>
                      {['East Village', 'Lower East Side', "Hell's Kitchen", 'Midtown', 'Brooklyn', 'Harlem'].map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">Availability</label>
                    <select name="availability" value={form.availability} onChange={handleInput}
                      className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-500 transition">
                      <option value="">Select…</option>
                      {['Evenings (5–9pm)', 'Weekends', 'Flexible'].map(a => <option key={a}>{a}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Transport</label>
                  <select name="transport" value={form.transport} onChange={handleInput}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-500 transition">
                    <option value="">Select…</option>
                    {['On foot', 'Bicycle / e-bike', 'Motorcycle', 'Car / van', 'Public transit'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>

                {/* Pledge */}
                <div className={`rounded-xl p-3 flex gap-2.5 items-start border transition ${pledgeError ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                  <input type="checkbox" id="pledge" checked={pledged}
                    onChange={e => setPledged(e.target.checked)}
                    className="mt-0.5 accent-green-600 flex-shrink-0" />
                  <label htmlFor="pledge" className="text-xs text-green-900 leading-relaxed cursor-pointer">
                    <span className="font-semibold block mb-0.5">Volunteer pledge</span>
                    I commit to showing up for claimed pickups, handling food safely, and treating all recipients with dignity and respect.
                  </label>
                </div>

                <button onClick={handleSubmit}
                  className="w-full py-2.5 bg-stone-800 text-white rounded-xl text-sm font-semibold hover:bg-stone-700 transition-colors">
                  Register as volunteer
                </button>
              </div>
            )}
          </div>

          {/* Photo upload card */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-3 pb-3 border-b border-stone-100">
              Upload delivery photos
            </p>
            <p className="text-xs text-stone-500 leading-relaxed mb-3">
              After a pickup, upload a photo so Claude Vision can verify the delivery and log it to the impact dashboard.
            </p>

            {photos.length === 0 ? (
              <label className="block border-2 border-dashed border-stone-200 rounded-xl p-6 text-center cursor-pointer hover:bg-stone-50 hover:border-green-400 transition">
                <input type="file" accept="image/*" multiple onChange={handleFiles} className="hidden" />
                <div className="w-8 h-8 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-2 text-stone-400 text-sm">↑</div>
                <p className="text-xs font-medium text-stone-600">Drop photos or click to browse</p>
                <p className="text-xs text-stone-400 mt-0.5">PNG, JPG — compressed for Claude Vision</p>
              </label>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-1.5 mb-3">
                  {photos.map((f, i) => (
                    <div key={i} className="aspect-square rounded-lg overflow-hidden border border-stone-200 relative">
                      <img src={URL.createObjectURL(f)} alt="preview" className="w-full h-full object-cover" />
                      <button onClick={() => removePhoto(i)}
                        className="absolute top-1 right-1 w-4 h-4 bg-black/50 text-white rounded-full text-xs flex items-center justify-center">
                        ✕
                      </button>
                    </div>
                  ))}
                  {photos.length < 8 && (
                    <label className="aspect-square border-2 border-dashed border-stone-200 rounded-lg flex items-center justify-center cursor-pointer hover:bg-stone-50 text-stone-400 text-xl">
                      <input type="file" accept="image/*" multiple onChange={handleFiles} className="hidden" />
                      +
                    </label>
                  )}
                </div>
                <button onClick={handleVerify} disabled={verifying}
                  className="w-full py-2.5 border border-green-600 text-green-700 rounded-xl text-sm font-medium hover:bg-green-50 transition disabled:opacity-50">
                  {verifying ? 'Verifying…' : 'Verify with Claude Vision ↗'}
                </button>
              </>
            )}

            {verifyResult && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-800 leading-relaxed">
                ✓ {verifyResult}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="space-y-4">

          {/* Listings card */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-stone-100">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest">Open listings near you</p>
              <span className="text-xs font-mono text-green-600 font-medium">{LISTINGS.length - claimedCount} available</span>
            </div>

            <div className="space-y-3">
              {LISTINGS.map(l => (
                <div key={l.id} className={`border rounded-xl p-3.5 transition ${claimed[l.id] ? 'opacity-50 border-stone-100' : 'border-stone-200 hover:border-green-300 hover:bg-green-50/30'}`}>
                  <div className="flex items-start gap-3 mb-2.5">
                    <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center text-lg flex-shrink-0">
                      {l.emoji}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-stone-800">{l.name} · {l.district}</p>
                      <p className="text-xs text-stone-500">~{l.boxes} boxes · Pickup {l.window}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200">{l.type}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">{l.boxes} boxes</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">{l.distance} away</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-stone-400">Expires <span className="text-red-500 font-medium">{l.expires}</span></p>
                    {claimed[l.id]
                      ? <span className="text-xs text-green-600 font-medium">Claimed ✓</span>
                      : <button onClick={() => handleClaim(l.id)}
                          className="text-xs font-medium text-green-700 border border-green-600 px-3 py-1 rounded-full hover:bg-green-600 hover:text-white transition">
                          Claim pickup
                        </button>
                    }
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Claude route card — appears after 2+ claims */}
          {claimedCount >= 2 && (
            <div className="bg-white border border-green-200 rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-widest mb-4 pb-3 border-b border-stone-100">
                <span className="text-green-600">Claude</span> · Optimized route
              </p>
              <div className="space-y-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-800">Stop 1</span>
                  <span className="text-sm font-medium text-stone-800">Dim Sum Palace, Wan Chai</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">Stop 2</span>
                  <span className="text-sm font-medium text-stone-800">Bento Garden, Central</span>
                </div>
              </div>
              <div className="bg-stone-50 rounded-xl p-3 text-xs text-stone-500 leading-relaxed">
                <span className="font-semibold text-stone-700 block mb-1">Claude's reasoning</span>
                Wan Chai expires at 7 PM — do it first. Central's window runs until 8 PM. Skip TST unless another volunteer claims it.
              </div>
            </div>
          )}

          {/* Impact card */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-4 pb-3 border-b border-stone-100">
              Your impact
            </p>
            <div className="grid grid-cols-3 gap-3">
              {IMPACT.map(s => (
                <div key={s.label} className="bg-stone-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-stone-800" style={{ fontFamily: 'Georgia, serif' }}>{s.num}</p>
                  <p className="text-xs text-stone-500 mt-1">{s.label}</p>
                  <p className="text-xs text-green-600 font-medium mt-0.5">{s.delta}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
