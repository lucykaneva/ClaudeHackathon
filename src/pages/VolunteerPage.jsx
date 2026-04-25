import { useState, useEffect } from 'react'
import { db, storage } from '../firebase'
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { getVolunteerLocation, haversineDistance, assignNearestShelter } from '../geo'
import { getRouteOrder, verifyPhoto } from '../claude'

const FOOD_TYPES = [
  { id: 'Noodles',        emoji: '🍜' },
  { id: 'Cooked meals',   emoji: '🍱' },
  { id: 'Bread & bakery', emoji: '🥖' },
  { id: 'Dim sum',        emoji: '🥟' },
  { id: 'Drinks',         emoji: '🧃' },
  { id: 'Other',          emoji: '🍽️' },
]

const TRANSPORT_SPEEDS_MPH = {
  'On foot': 3,
  'Bicycle / e-bike': 10,
  'Motorcycle': 20,
  'Car / van': 20,
  'Public transit': 10,
}

const BOROUGH_COORDS = {
  'Manhattan':     { lat: 40.7831, lng: -73.9712 },
  'Brooklyn':      { lat: 40.6782, lng: -73.9442 },
  'Queens':        { lat: 40.7282, lng: -73.7949 },
  'Bronx':         { lat: 40.8448, lng: -73.8648 },
  'Staten Island': { lat: 40.5795, lng: -74.1502 },
}

function formatTime(val) {
  if (!val) return '—'
  if (typeof val === 'string') return val
  if (val?.toDate) return val.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return String(val)
}

function estimateMinutes(distMi, transport) {
  const speed = TRANSPORT_SPEEDS_MPH[transport]
  if (!speed || !distMi) return null
  return Math.round((distMi / speed) * 60)
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function VolunteerPage() {
  const [form, setForm] = useState({ name: '', phone: '', transport: '' })
  const [locStatus, setLocStatus] = useState('idle')
  const [pledged, setPledged] = useState(false)
  const [pledgeError, setPledgeError] = useState(false)
  const [registered, setRegistered] = useState(false)

  const [listings, setListings] = useState([])
  const [claimed, setClaimed] = useState({})

  const [volunteerLocation, setVolunteerLocation] = useState(null)
  const [route, setRoute] = useState(null)
  const [routeReason, setRouteReason] = useState('')
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState('')

  // Per-listing photo state
  const [listingPhotos, setListingPhotos] = useState({})     // { id: File[] }
  const [verifyingId, setVerifyingId] = useState(null)
  const [listingResults, setListingResults] = useState({})   // { id: { ok, text, photoUrl, submitted } }

  const [flagCount, setFlagCount] = useState(0)
  const FLAG_THRESHOLD = 3
  const isLocked = flagCount >= FLAG_THRESHOLD

  const sessionClaimedListings = listings.filter(l => claimed[l.id] && l.status === 'claimed')
  const sessionClaimedIds = sessionClaimedListings.map(l => l.id)

  const sortedListings = volunteerLocation
    ? [...listings].sort((a, b) => {
        if (a.status === 'open' && b.status !== 'open') return -1
        if (a.status !== 'open' && b.status === 'open') return 1
        if (!a.lat || !a.lng) return 1
        if (!b.lat || !b.lng) return -1
        return haversineDistance(volunteerLocation.lat, volunteerLocation.lng, a.lat, a.lng)
             - haversineDistance(volunteerLocation.lat, volunteerLocation.lng, b.lat, b.lng)
      })
    : listings

  const orderedClaimedListings = route
    ? route.map(id => sessionClaimedListings.find(l => l.id === id)).filter(Boolean)
    : sessionClaimedListings

  useEffect(() => {
    const q = query(collection(db, 'listings'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setListings(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (sessionClaimedIds.length < 2) { setRoute(null); setRouteReason(''); return }
    if (!volunteerLocation) return
    setRouteLoading(true)
    setRouteError('')
    getRouteOrder(volunteerLocation.lat, volunteerLocation.lng, sessionClaimedListings)
      .then(({ order, reason }) => { setRoute(order); setRouteReason(reason) })
      .catch(err => setRouteError(err.message))
      .finally(() => setRouteLoading(false))
  }, [sessionClaimedIds.join(','), volunteerLocation])

  function handleInput(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function handleGetLocation() {
    setLocStatus('loading')
    try {
      const loc = await getVolunteerLocation()
      setVolunteerLocation(loc)
      setLocStatus('found')
    } catch {
      setLocStatus('error')
    }
  }

  function handleBoroughFallback(e) {
    const borough = e.target.value
    if (!borough) return
    const coords = BOROUGH_COORDS[borough]
    if (coords) { setVolunteerLocation(coords); setLocStatus('found') }
  }

  async function handleSubmit() {
    if (!form.name.trim()) return
    if (!pledged) {
      setPledgeError(true)
      setTimeout(() => setPledgeError(false), 1800)
      return
    }
    await addDoc(collection(db, 'volunteers'), {
      name: form.name,
      phone: form.phone,
      transport: form.transport,
      lat: volunteerLocation?.lat ?? null,
      lng: volunteerLocation?.lng ?? null,
      pledged: true,
      createdAt: serverTimestamp(),
    })
    setRegistered(true)
  }

  async function handleClaim(listing) {
    const shelter = assignNearestShelter(listing)
    await updateDoc(doc(db, 'listings', listing.id), {
      status: 'claimed',
      claimedBy: form.name || 'volunteer',
      claimedByLat: volunteerLocation?.lat ?? null,
      claimedByLng: volunteerLocation?.lng ?? null,
      dropOffId: shelter.id,
      dropOffName: shelter.name,
      dropOffAddress: shelter.address,
      dropOffLat: shelter.lat,
      dropOffLng: shelter.lng,
      dropOffEIN: shelter.ein,
    })
    setClaimed(prev => ({ ...prev, [listing.id]: true }))
  }

  function handleListingFiles(id, e) {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'))
    setListingPhotos(prev => ({ ...prev, [id]: [...(prev[id] || []), ...files] }))
  }

  function removeListingPhoto(id, i) {
    setListingPhotos(prev => ({ ...prev, [id]: (prev[id] || []).filter((_, idx) => idx !== i) }))
  }

  async function handleVerifyAndSubmit(listing) {
    const photos = listingPhotos[listing.id]
    if (!photos?.[0]) return
    setVerifyingId(listing.id)
    try {
      const storageRef = ref(storage, `deliveries/${Date.now()}_${photos[0].name}`)
      await uploadBytes(storageRef, photos[0])
      const photoUrl = await getDownloadURL(storageRef)

      const base64 = await toBase64(photos[0])
      const { verified, flagged, reason } = await verifyPhoto(base64)

      if (flagged) setFlagCount(prev => prev + 1)

      setListingResults(prev => ({
        ...prev,
        [listing.id]: { ok: verified, text: verified ? `Verified — ${reason}` : `Not verified — ${reason}`, photoUrl, submitted: true },
      }))
    } catch (err) {
      setListingResults(prev => ({
        ...prev,
        [listing.id]: { ok: false, text: `Error: ${err.message}`, submitted: true },
      }))
    } finally {
      setVerifyingId(null)
    }
  }

  async function handleMarkDelivered(listing) {
    const result = listingResults[listing.id]
    await updateDoc(doc(db, 'listings', listing.id), {
      status: 'completed',
      photoUrl: result?.photoUrl ?? null,
      aiVerified: result?.ok ?? false,
      completedAt: serverTimestamp(),
    })
  }

  const inputClass = 'w-full px-3 py-2 border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition'

  // ── PRE-REGISTRATION: single centered form ──
  if (!registered) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-6">
            <p className="text-xs font-semibold text-green-600 uppercase tracking-widest mb-1">Volunteer portal</p>
            <h1 className="text-2xl font-bold text-stone-800" style={{ fontFamily: 'Georgia, serif' }}>Join as a volunteer</h1>
            <p className="text-stone-500 text-sm mt-1">Takes 60 seconds. Start claiming pickups right away.</p>
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-5">

            {/* Personal info */}
            <div>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-3 pb-2 border-b border-stone-100">
                Your info
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Full name</label>
                  <input name="name" value={form.name} onChange={handleInput} placeholder="Jane Smith" required className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-1">WhatsApp number</label>
                  <input name="phone" value={form.phone} onChange={handleInput} placeholder="+1 212 555 0123" type="tel" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Transport</label>
                  <select name="transport" value={form.transport} onChange={handleInput} className={inputClass}>
                    <option value="">Select…</option>
                    {Object.keys(TRANSPORT_SPEEDS_MPH).map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Your location</label>
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    disabled={locStatus === 'loading'}
                    className={`w-full py-2 rounded-lg text-sm font-medium border transition flex items-center justify-center gap-2 ${
                      locStatus === 'found' ? 'bg-green-50 border-green-300 text-green-700' : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    {locStatus === 'loading' ? 'Getting location…' : locStatus === 'found' ? '📍 Location found' : '📍 Use my location'}
                  </button>
                  {(locStatus === 'error' || locStatus === 'idle') && (
                    <>
                      {locStatus === 'error' && <p className="text-xs text-stone-400 mt-1.5">GPS unavailable. Select your borough:</p>}
                      <select onChange={handleBoroughFallback} defaultValue="" className={`${inputClass} mt-1.5`}>
                        <option value="">Borough fallback…</option>
                        {Object.keys(BOROUGH_COORDS).map(b => <option key={b}>{b}</option>)}
                      </select>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Pledge */}
            <div className={`rounded-xl p-3 flex gap-2.5 items-start border transition ${pledgeError ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              <input type="checkbox" id="pledge" checked={pledged} onChange={e => setPledged(e.target.checked)} className="mt-0.5 accent-green-600 flex-shrink-0" />
              <label htmlFor="pledge" className="text-xs text-green-900 leading-relaxed cursor-pointer">
                <span className="font-semibold block mb-0.5">Volunteer pledge</span>
                I commit to showing up for claimed pickups, handling food safely, and treating all recipients with dignity and respect.
              </label>
            </div>

            <button onClick={handleSubmit} className="w-full py-3 bg-stone-800 text-white rounded-xl text-sm font-semibold hover:bg-stone-700 transition-colors">
              Become a volunteer →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── POST-REGISTRATION: two-column dashboard ──
  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-[300px_1fr] gap-5 items-start">

        {/* LEFT COLUMN */}
        <div className="space-y-4">

          {/* Volunteer card */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600 text-lg flex-shrink-0">✓</div>
              <div>
                <p className="font-semibold text-stone-800 text-sm">{form.name}</p>
                <p className="text-xs text-stone-400">{form.transport || 'Volunteer'}</p>
              </div>
            </div>
          </div>

          {/* Claude route card */}
          {sessionClaimedIds.length >= 2 && (
            <div className="bg-white border border-green-200 rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-widest mb-4 pb-3 border-b border-stone-100">
                <span className="text-green-600">Claude</span> · Optimized route
              </p>
              {routeLoading && <p className="text-xs text-stone-400 py-2">Calculating best route…</p>}
              {routeError && <p className="text-xs text-red-400 py-2">{routeError}</p>}
              {!routeLoading && !routeError && orderedClaimedListings.length > 0 && (
                <div className="space-y-2">
                  {orderedClaimedListings.map((l, i) => (
                    <div key={l.id} className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${i === 0 ? 'bg-green-100 text-green-800' : i === 1 ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                        Stop {i + 1}
                      </span>
                      <span className="text-sm font-medium text-stone-800 truncate">{l.restaurantName}</span>
                    </div>
                  ))}
                  {routeReason && (
                    <div className="bg-stone-50 rounded-xl p-3 text-xs text-stone-500 leading-relaxed mt-1">
                      <span className="font-semibold text-stone-700 block mb-1">Claude's reasoning</span>
                      {routeReason}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Impact card */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-4 pb-3 border-b border-stone-100">Your impact</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { num: '143', label: 'Meals rescued',    delta: '↑ 3×' },
                { num: '7',   label: 'Pickups done',     delta: 'Top 12%' },
                { num: '4',   label: 'Partners',         delta: 'Via Claude' },
              ].map(s => (
                <div key={s.label} className="bg-stone-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-stone-800">{s.num}</p>
                  <p className="text-[10px] text-stone-500 mt-1">{s.label}</p>
                  <p className="text-[10px] text-green-600 font-medium mt-0.5">{s.delta}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — Listings */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest">Open listings near you</p>
            <span className="text-xs text-green-600 font-medium">{listings.filter(l => l.status === 'open').length} available</span>
          </div>

          {isLocked && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 font-medium">
              Account locked — {FLAG_THRESHOLD} failed verifications. Contact support to appeal.
            </div>
          )}
          {!isLocked && flagCount > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
              Warning: {flagCount}/{FLAG_THRESHOLD} verification failures. Account locks at {FLAG_THRESHOLD}.
            </div>
          )}

          {listings.length === 0 && (
            <p className="text-xs text-stone-400 text-center py-8">Loading listings…</p>
          )}

          {sortedListings.map(l => {
            const isMyClaim = !!claimed[l.id]
            const isClaimed = l.status === 'claimed'
            const isCompleted = l.status === 'completed'
            const distMi = volunteerLocation && l.lat && l.lng
              ? haversineDistance(volunteerLocation.lat, volunteerLocation.lng, l.lat, l.lng)
              : null
            const mins = estimateMinutes(distMi, form.transport)
            const photos = listingPhotos[l.id] || []
            const result = listingResults[l.id]
            const isVerifying = verifyingId === l.id

            return (
              <div key={l.id} className={`bg-white border rounded-2xl p-4 transition ${
                isCompleted ? 'opacity-50 border-stone-100' :
                isClaimed && !isMyClaim ? 'opacity-50 border-stone-100' :
                isMyClaim ? 'border-green-300' :
                'border-stone-200'
              }`}>
                {/* Header */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center text-lg flex-shrink-0">
                    {FOOD_TYPES.find(t => t.id === l.foodType)?.emoji || '🍽️'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-stone-800 truncate">{l.restaurantName}</p>
                    <p className="text-xs text-stone-500 truncate">{l.address}</p>
                  </div>
                  {isCompleted && (
                    <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${l.aiVerified ? 'bg-green-100 text-green-800 border-green-300' : 'bg-stone-100 text-stone-500 border-stone-200'}`}>
                      {l.aiVerified ? 'AI Verified ✓' : 'Completed'}
                    </span>
                  )}
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200">{l.foodType}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">{l.quantity} portions</span>
                  {distMi !== null && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">{distMi.toFixed(1)} mi</span>
                  )}
                  {mins !== null && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">~{mins} min</span>
                  )}
                </div>

                {/* Footer row */}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-stone-400">
                    Pickup <span className="text-stone-600">{formatTime(l.pickupStart)}–{formatTime(l.pickupEnd)}</span>
                  </p>
                  {isCompleted
                    ? <span className="text-xs font-medium text-stone-400">Completed ✓</span>
                    : isClaimed && !isMyClaim
                      ? <span className="text-xs font-medium text-stone-400">Claimed</span>
                      : isMyClaim
                        ? <span className="text-xs font-medium text-green-600">Claimed by you ✓</span>
                        : isLocked
                          ? <span className="text-xs font-medium text-red-400">Account locked</span>
                          : (
                            <button onClick={() => handleClaim(l)}
                              className="text-xs font-medium text-green-700 border border-green-600 px-3 py-1 rounded-full hover:bg-green-600 hover:text-white transition">
                              Claim pickup
                            </button>
                          )
                  }
                </div>

                {/* Expanded section for volunteer's own claimed listings */}
                {isMyClaim && !isCompleted && (
                  <div className="mt-3 pt-3 border-t border-stone-100 space-y-3">
                    {/* Pickup / drop-off info */}
                    {l.dropOffName && (
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <span className="text-[11px] text-stone-400 w-14 flex-shrink-0 pt-0.5">Pick up</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-stone-700 leading-snug">{l.address}</p>
                            <a href={`https://maps.google.com/?q=${encodeURIComponent(l.address)}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-green-600 hover:underline">Open in Maps ↗</a>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-[11px] text-stone-400 w-14 flex-shrink-0 pt-0.5">Drop off</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-stone-700">{l.dropOffName}</p>
                            <p className="text-xs text-stone-500 leading-snug">{l.dropOffAddress}</p>
                            <a href={`https://maps.google.com/?q=${encodeURIComponent(l.dropOffAddress)}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-green-600 hover:underline">Open in Maps ↗</a>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Photo upload — only if no result yet */}
                    {!result?.submitted && (
                      <div>
                        <p className="text-xs font-medium text-stone-600 mb-2">Upload delivery photo</p>
                        {photos.length === 0 ? (
                          <label className="block border-2 border-dashed border-stone-200 rounded-xl p-4 text-center cursor-pointer hover:bg-stone-50 hover:border-green-400 transition">
                            <input type="file" accept="image/*" onChange={e => handleListingFiles(l.id, e)} className="hidden" />
                            <div className="w-7 h-7 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-1.5 text-stone-400 text-xs">↑</div>
                            <p className="text-xs text-stone-500">Tap to add photo</p>
                          </label>
                        ) : (
                          <>
                            <div className="grid grid-cols-4 gap-1.5 mb-2">
                              {photos.map((f, i) => (
                                <div key={i} className="aspect-square rounded-lg overflow-hidden border border-stone-200 relative">
                                  <img src={URL.createObjectURL(f)} alt="preview" className="w-full h-full object-cover" />
                                  <button onClick={() => removeListingPhoto(l.id, i)} className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/50 text-white rounded-full text-xs flex items-center justify-center">✕</button>
                                </div>
                              ))}
                            </div>
                            <button
                              onClick={() => handleVerifyAndSubmit(l)}
                              disabled={isVerifying}
                              className="w-full py-2 border border-green-600 text-green-700 rounded-xl text-xs font-medium hover:bg-green-50 transition disabled:opacity-50"
                            >
                              {isVerifying ? 'Uploading & verifying…' : 'Submit photo →'}
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Verification result + Mark as delivered */}
                    {result?.submitted && (
                      <div className="space-y-2">
                        <div className={`p-3 rounded-xl text-xs leading-relaxed border ${result.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                          {result.ok ? '✓' : '✗'} {result.text}
                        </div>
                        <button
                          onClick={() => handleMarkDelivered(l)}
                          className="w-full py-2.5 bg-green-600 text-white rounded-xl text-xs font-semibold hover:bg-green-700 transition-colors"
                        >
                          Mark as delivered ✓
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
