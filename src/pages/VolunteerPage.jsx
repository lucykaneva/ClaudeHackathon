import { useState, useEffect } from 'react'
import { db, storage } from '../firebase'
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { getVolunteerLocation, haversineDistance, assignNearestShelter } from '../geo'
import { getRouteOrder, verifyPhoto } from '../claude'

const FOOD_EMOJI = { 'Noodles':'🍜', 'Cooked meals':'🍱', 'Bread & bakery':'🥖', 'Dim sum':'🥟', 'Drinks':'🧃' }

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

export default function VolunteerPage() {
  const [form, setForm] = useState({ name: '', phone: '' })
  const [locStatus, setLocStatus] = useState('idle') // idle | loading | found | error
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

  const [photos, setPhotos] = useState([])
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState(null)

  const [flagCount, setFlagCount] = useState(0)
  const FLAG_THRESHOLD = 3
  const isLocked = flagCount >= FLAG_THRESHOLD

  const sessionClaimedListings = listings.filter(l => claimed[l.id] && l.status === 'claimed')
  const sessionClaimedIds = sessionClaimedListings.map(l => l.id)
  const verifyTarget = sessionClaimedListings.at(-1) || null

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
    if (coords) {
      setVolunteerLocation(coords)
      setLocStatus('found')
    }
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

  function handleFiles(e) {
    const newFiles = Array.from(e.target.files).filter(f => f.type.startsWith('image/'))
    setPhotos(prev => [...prev, ...newFiles])
    setVerifyResult(null)
  }

  function removePhoto(i) {
    setPhotos(prev => prev.filter((_, idx) => idx !== i))
    setVerifyResult(null)
  }

  async function handleVerify() {
    if (!photos[0]) return
    setVerifying(true)
    setVerifyResult(null)
    try {
      const storageRef = ref(storage, `deliveries/${Date.now()}_${photos[0].name}`)
      await uploadBytes(storageRef, photos[0])
      const photoUrl = await getDownloadURL(storageRef)

      const base64 = await toBase64(photos[0])
      const { verified, flagged, reason } = await verifyPhoto(base64)

      if (flagged) setFlagCount(prev => prev + 1)

      if (verifyTarget) {
        await updateDoc(doc(db, 'listings', verifyTarget.id), {
          status: 'completed',
          photoUrl,
          aiVerified: verified,
          aiFlagged: flagged ?? false,
          aiReason: reason,
          completedAt: serverTimestamp(),
        })
      }

      setVerifyResult({
        ok: verified,
        text: verified ? `Delivery verified — ${reason}` : `Could not verify — ${reason}`,
      })
    } catch (err) {
      setVerifyResult({ ok: false, text: `Error: ${err.message}` })
    } finally {
      setVerifying(false)
    }
  }

  function toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const orderedClaimedListings = route
    ? route.map(id => sessionClaimedListings.find(l => l.id === id)).filter(Boolean)
    : sessionClaimedListings

  const inputClass = 'w-full px-3 py-2 border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition'

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-[340px_1fr] gap-5 items-start">

        {/* LEFT COLUMN */}
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
                  <input name="name" value={form.name} onChange={handleInput} placeholder="Jane Smith" required className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-1">WhatsApp number</label>
                  <input name="phone" value={form.phone} onChange={handleInput} placeholder="+1 212 555 0123" type="tel" className={inputClass} />
                </div>

                <div>
                  <label className="block text-xs text-stone-500 mb-1.5">Your location</label>
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    disabled={locStatus === 'loading'}
                    className={`w-full py-2 rounded-lg text-sm font-medium border transition flex items-center justify-center gap-2 ${
                      locStatus === 'found'
                        ? 'bg-green-50 border-green-300 text-green-700'
                        : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    {locStatus === 'loading' ? 'Getting location…' : locStatus === 'found' ? '📍 Location found' : '📍 Use my location'}
                  </button>
                  {(locStatus === 'error' || locStatus === 'idle') && (
                    <>
                      {locStatus === 'error' && (
                        <p className="text-xs text-stone-400 mt-1.5">GPS unavailable. Select your borough:</p>
                      )}
                      <select onChange={handleBoroughFallback} defaultValue="" className={`${inputClass} mt-1.5`}>
                        <option value="">Borough fallback…</option>
                        {Object.keys(BOROUGH_COORDS).map(b => <option key={b}>{b}</option>)}
                      </select>
                    </>
                  )}
                </div>

                <div className={`rounded-xl p-3 flex gap-2.5 items-start border transition ${pledgeError ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                  <input type="checkbox" id="pledge" checked={pledged} onChange={e => setPledged(e.target.checked)} className="mt-0.5 accent-green-600 flex-shrink-0" />
                  <label htmlFor="pledge" className="text-xs text-green-900 leading-relaxed cursor-pointer">
                    <span className="font-semibold block mb-0.5">Volunteer pledge</span>
                    I commit to showing up for claimed pickups, handling food safely, and treating all recipients with dignity and respect.
                  </label>
                </div>

                <button onClick={handleSubmit} className="w-full py-2.5 bg-stone-800 text-white rounded-xl text-sm font-semibold hover:bg-stone-700 transition-colors">
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

            {verifyTarget && (
              <div className="text-xs text-stone-500 bg-stone-50 rounded-lg px-3 py-2 mb-3 border border-stone-100 leading-relaxed">
                Verifying for: <span className="font-semibold text-stone-700">{verifyTarget.restaurantName}</span>
                {verifyTarget.dropOffName && (
                  <> → <span className="font-semibold text-stone-700">{verifyTarget.dropOffName}</span></>
                )}
              </div>
            )}

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
                      <button onClick={() => removePhoto(i)} className="absolute top-1 right-1 w-4 h-4 bg-black/50 text-white rounded-full text-xs flex items-center justify-center">✕</button>
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
                  {verifying ? 'Uploading & verifying…' : 'Verify with Claude Vision ↗'}
                </button>
              </>
            )}

            {verifyResult && (
              <div className={`mt-3 p-3 rounded-xl text-xs leading-relaxed border ${verifyResult.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                {verifyResult.ok ? '✓' : '✗'} {verifyResult.text}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">

          {/* Listings card */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-stone-100">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest">Open listings near you</p>
              <span className="text-xs text-green-600 font-medium">
                {listings.filter(l => l.status === 'open').length} available
              </span>
            </div>

            {isLocked && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 font-medium">
                Account locked — {FLAG_THRESHOLD} failed verifications. Contact support to appeal.
              </div>
            )}
            {!isLocked && flagCount > 0 && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                Warning: {flagCount}/{FLAG_THRESHOLD} verification failures. Account locks at {FLAG_THRESHOLD}.
              </div>
            )}

            {listings.length === 0 && (
              <p className="text-xs text-stone-400 text-center py-4">Loading listings…</p>
            )}

            <div className="space-y-3">
              {sortedListings.map(l => {
                const isMyClaim = !!claimed[l.id]
                const isClaimed = l.status === 'claimed'
                const isCompleted = l.status === 'completed'
                const distMi = volunteerLocation && l.lat && l.lng
                  ? haversineDistance(volunteerLocation.lat, volunteerLocation.lng, l.lat, l.lng)
                  : null

                return (
                  <div key={l.id} className={`border rounded-xl p-3.5 transition ${
                    isCompleted ? 'opacity-50 border-stone-100' :
                    isClaimed && !isMyClaim ? 'opacity-50 border-stone-100' :
                    isMyClaim ? 'border-green-300 bg-green-50/30' :
                    'border-stone-200 hover:border-green-300 hover:bg-green-50/30'
                  }`}>
                    <div className="flex items-start gap-3 mb-2.5">
                      <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center text-lg flex-shrink-0">
                        {FOOD_EMOJI[l.foodType] || '🍽️'}
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

                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200">{l.foodType}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">{l.quantity} portions</span>
                      {distMi !== null && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                          {distMi.toFixed(1)} mi
                        </span>
                      )}
                    </div>

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

                    {/* Expanded info for volunteer's own claimed listings */}
                    {isMyClaim && l.dropOffName && (
                      <div className="mt-2.5 pt-2.5 border-t border-stone-100 space-y-2">
                        <div className="flex items-start gap-2">
                          <span className="text-[11px] text-stone-400 w-14 flex-shrink-0 pt-0.5">Pick up</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-stone-700 leading-snug">{l.address}</p>
                            <a
                              href={`https://maps.google.com/?q=${encodeURIComponent(l.address)}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-[11px] text-green-600 hover:underline"
                            >Open in Maps ↗</a>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-[11px] text-stone-400 w-14 flex-shrink-0 pt-0.5">Drop off</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-stone-700">{l.dropOffName}</p>
                            <p className="text-xs text-stone-500 leading-snug">{l.dropOffAddress}</p>
                            <a
                              href={`https://maps.google.com/?q=${encodeURIComponent(l.dropOffAddress)}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-[11px] text-green-600 hover:underline"
                            >Open in Maps ↗</a>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Claude route card — appears after 2+ session claims */}
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
                      <span className="text-sm font-medium text-stone-800 truncate">{l.restaurantName}, {l.address?.split(',')[1]?.trim() || l.address}</span>
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
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-4 pb-3 border-b border-stone-100">
              Your impact
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { num: '143', label: 'Meals rescued',    delta: '↑ 3× last Saturday' },
                { num: '7',   label: 'Pickups done',     delta: 'Top 12% this week'  },
                { num: '4',   label: 'Partners thanked', delta: 'Via Claude drafts'  },
              ].map(s => (
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
