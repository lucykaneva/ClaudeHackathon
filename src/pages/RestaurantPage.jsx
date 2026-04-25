import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { collection, addDoc, doc, getDoc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore'

const FOOD_TYPES = [
  { id: 'cooked',  label: 'Cooked meals',   emoji: '🍱' },
  { id: 'noodles', label: 'Noodles',         emoji: '🍜' },
  { id: 'bakery',  label: 'Bread & bakery',  emoji: '🍞' },
  { id: 'dimsum',  label: 'Dim sum',         emoji: '🥟' },
  { id: 'drinks',  label: 'Drinks',          emoji: '🧃' },
  { id: 'other',   label: 'Other',           emoji: '📦' },
]

const ENTITY_TYPES = ['LLC', 'Corporation', 'Sole Proprietorship', 'Partnership', 'Non-profit 501(c)(3)']
const PRICE_PER_PORTION = 2

async function geocode(address) {
  const token = import.meta.env.VITE_MAPBOX_TOKEN
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${token}&limit=1`
  const res = await fetch(url)
  const data = await res.json()
  if (data.features?.length > 0) {
    const [lng, lat] = data.features[0].center
    return { lat, lng }
  }
  return { lat: 0, lng: 0 }
}

function formatEIN(value) {
  const digits = value.replace(/\D/g, '').slice(0, 9)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}-${digits.slice(2)}`
}

function printReceipt(restaurant, listing) {
  const date = listing.completedAt?.toDate?.()
    ? listing.completedAt.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const totalValue = (listing.quantity * PRICE_PER_PORTION).toFixed(2)
  const receiptNum = `FB-${(listing.id?.slice(-6) || 'XXXXXX').toUpperCase()}`

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Donation Receipt — ${restaurant.restaurantName}</title>
<style>
  body { font-family: Georgia, serif; max-width: 680px; margin: 60px auto; color: #1c1917; line-height: 1.6; }
  .header { border-bottom: 2px solid #1c1917; padding-bottom: 20px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: flex-end; }
  .brand { font-size: 22px; font-weight: bold; letter-spacing: -0.5px; }
  .meta { text-align: right; font-size: 12px; color: #78716c; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #78716c; margin-bottom: 10px; border-bottom: 1px solid #e7e5e4; padding-bottom: 4px; }
  .row { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 6px; }
  .label { color: #78716c; }
  .value { font-weight: 500; text-align: right; max-width: 60%; }
  .total-row { display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; border-top: 2px solid #1c1917; padding-top: 12px; margin-top: 8px; }
  .disclaimer { font-size: 11px; color: #a8a29e; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e7e5e4; line-height: 1.6; }
  @media print { body { margin: 40px; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="brand">FoodBridge</div>
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#78716c;margin-top:2px">Food Donation Receipt</div>
  </div>
  <div class="meta">
    <div style="font-weight:600">${receiptNum}</div>
    <div>${date}</div>
  </div>
</div>

<div class="section">
  <div class="section-title">Donor (Restaurant)</div>
  <div class="row"><span class="label">Legal name</span><span class="value">${restaurant.legalName || restaurant.restaurantName}</span></div>
  <div class="row"><span class="label">Trade name</span><span class="value">${restaurant.restaurantName}</span></div>
  <div class="row"><span class="label">EIN</span><span class="value">${restaurant.ein || '—'}</span></div>
  <div class="row"><span class="label">Entity type</span><span class="value">${restaurant.entityType || '—'}</span></div>
  <div class="row"><span class="label">Address</span><span class="value">${restaurant.address}</span></div>
</div>

<div class="section">
  <div class="section-title">Recipient (Shelter)</div>
  <div class="row"><span class="label">Organization</span><span class="value">${listing.dropOffName || '—'}</span></div>
  <div class="row"><span class="label">EIN</span><span class="value">${listing.dropOffEIN || '—'}</span></div>
  <div class="row"><span class="label">Address</span><span class="value">${listing.dropOffAddress || '—'}</span></div>
</div>

<div class="section">
  <div class="section-title">Donation Details</div>
  <div class="row"><span class="label">Food type</span><span class="value">${listing.foodType}</span></div>
  <div class="row"><span class="label">Quantity</span><span class="value">${listing.quantity} portions</span></div>
  <div class="row"><span class="label">Pickup window</span><span class="value">${listing.pickupStart}–${listing.pickupEnd}</span></div>
  <div class="row"><span class="label">Delivery date</span><span class="value">${date}</span></div>
  <div class="row"><span class="label">Good faith value</span><span class="value">$${PRICE_PER_PORTION}.00 / portion</span></div>
  <div class="total-row"><span>Estimated donation value</span><span>$${totalValue}</span></div>
</div>

<div class="disclaimer">
  This receipt confirms a food donation facilitated through FoodBridge. The good-faith estimate of $${PRICE_PER_PORTION}.00 per portion is provided for reference only and does not constitute a formal appraisal. Donors should consult a qualified tax advisor to determine the deductible value of food donations under IRC §170(e)(3). FoodBridge is not a licensed tax advisor. No goods or services were exchanged for this donation.
</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=800,height=900')
  win.document.write(html)
  win.document.close()
  setTimeout(() => win.print(), 500)
}

export default function RestaurantPage() {
  const [view, setView] = useState('loading') // loading | register | dashboard | new-listing
  const [restaurant, setRestaurant] = useState(null)
  const [listings, setListings] = useState([])

  const [regForm, setRegForm] = useState({ legalName: '', restaurantName: '', ein: '', entityType: '', address: '', phone: '' })
  const [regSubmitting, setRegSubmitting] = useState(false)

  const [selectedFood, setSelectedFood] = useState(null)
  const [listingForm, setListingForm] = useState({ quantity: '', pickupStart: '', pickupEnd: '', notes: '' })
  const [listingSubmitting, setListingSubmitting] = useState(false)
  const [listingDone, setListingDone] = useState(false)

  const inputClass = 'w-full px-4 py-2.5 border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition'

  // Restore session from localStorage
  useEffect(() => {
    const rid = localStorage.getItem('fb_restaurant_id')
    if (!rid) { setView('register'); return }
    getDoc(doc(db, 'restaurants', rid))
      .then(snap => {
        if (snap.exists()) {
          setRestaurant({ id: snap.id, ...snap.data() })
          setView('dashboard')
        } else {
          localStorage.removeItem('fb_restaurant_id')
          setView('register')
        }
      })
      .catch(() => setView('register'))
  }, [])

  // Live listings for this restaurant
  useEffect(() => {
    if (!restaurant?.id) return
    const q = query(collection(db, 'listings'), where('restaurantId', '==', restaurant.id))
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setListings(docs)
    })
    return () => unsub()
  }, [restaurant?.id])

  function handleRegInput(e) {
    setRegForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleRegSubmit(e) {
    e.preventDefault()
    setRegSubmitting(true)
    try {
      const { lat, lng } = await geocode(regForm.address)
      const docRef = await addDoc(collection(db, 'restaurants'), {
        ...regForm,
        ein: formatEIN(regForm.ein),
        lat, lng, createdAt: serverTimestamp(),
      })
      const formattedEIN = formatEIN(regForm.ein)
      localStorage.setItem('fb_restaurant_id', docRef.id)
      setRestaurant({ id: docRef.id, ...regForm, ein: formattedEIN, lat, lng })
      setView('dashboard')
    } finally {
      setRegSubmitting(false)
    }
  }

  function handleListingInput(e) {
    setListingForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleListingSubmit(e) {
    e.preventDefault()
    setListingSubmitting(true)
    try {
      await addDoc(collection(db, 'listings'), {
        restaurantId: restaurant.id,
        restaurantName: restaurant.restaurantName,
        address: restaurant.address,
        lat: restaurant.lat,
        lng: restaurant.lng,
        foodType: FOOD_TYPES.find(t => t.id === selectedFood)?.label || selectedFood || '',
        quantity: Number(listingForm.quantity),
        pickupStart: listingForm.pickupStart,
        pickupEnd: listingForm.pickupEnd,
        notes: listingForm.notes,
        status: 'open',
        claimedBy: null,
        photoUrl: null,
        aiVerified: null,
        createdAt: serverTimestamp(),
      })
      setListingDone(true)
      setListingForm({ quantity: '', pickupStart: '', pickupEnd: '', notes: '' })
      setSelectedFood(null)
      setTimeout(() => { setListingDone(false); setView('dashboard') }, 1800)
    } finally {
      setListingSubmitting(false)
    }
  }

  function switchAccount() {
    localStorage.removeItem('fb_restaurant_id')
    setRestaurant(null)
    setListings([])
    setView('register')
  }

  // ── LOADING ──────────────────────────────────────────────────────────────
  if (view === 'loading') {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-400 text-sm">Loading…</p>
      </div>
    )
  }

  // ── REGISTER ─────────────────────────────────────────────────────────────
  if (view === 'register') {
    return (
      <div className="min-h-screen bg-stone-50">
        <div className="max-w-xl mx-auto px-6 py-10">
          <div className="mb-8">
            <p className="text-xs font-semibold text-green-600 uppercase tracking-widest mb-2">Restaurant portal</p>
            <h1 className="text-3xl font-bold text-stone-800 leading-tight mb-2" style={{ fontFamily: 'Georgia, serif' }}>
              Register your restaurant
            </h1>
            <p className="text-stone-500 text-sm leading-relaxed">
              One-time setup. Your details are saved so future listings take 30 seconds.
            </p>
          </div>

          <form onSubmit={handleRegSubmit} className="bg-white rounded-2xl border border-stone-200 p-7 space-y-6">
            <div>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-4 pb-2 border-b border-stone-100">
                Legal details
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-600 mb-1.5">Legal business name</label>
                  <input name="legalName" value={regForm.legalName} onChange={handleRegInput}
                    placeholder="e.g. Xi'an Famous Foods LLC" required className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-600 mb-1.5">Trade / restaurant name</label>
                  <input name="restaurantName" value={regForm.restaurantName} onChange={handleRegInput}
                    placeholder="e.g. Xi'an Famous Foods" required className={inputClass} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-stone-600 mb-1.5">EIN</label>
                    <input name="ein" value={regForm.ein} onChange={handleRegInput}
                      placeholder="12-3456789" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-600 mb-1.5">Entity type</label>
                    <select name="entityType" value={regForm.entityType} onChange={handleRegInput} className={inputClass}>
                      <option value="">Select…</option>
                      {ENTITY_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-4 pb-2 border-b border-stone-100">
                Location & contact
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-600 mb-1.5">Street address</label>
                  <input name="address" value={regForm.address} onChange={handleRegInput}
                    placeholder="Full street address" required className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-600 mb-1.5">
                    Phone <span className="text-stone-400 font-normal">(optional)</span>
                  </label>
                  <input name="phone" value={regForm.phone} onChange={handleRegInput}
                    placeholder="+1 212 555 0123" type="tel" className={inputClass} />
                </div>
              </div>
            </div>

            <button type="submit" disabled={regSubmitting}
              className="w-full py-3.5 bg-stone-800 text-white rounded-xl font-semibold text-sm hover:bg-stone-700 active:scale-[0.99] transition-all disabled:opacity-60">
              {regSubmitting ? 'Saving…' : 'Register restaurant →'}
            </button>
            <p className="text-center text-xs text-stone-400">
              Your info is saved locally and in our database.
            </p>
          </form>
        </div>
      </div>
    )
  }

  // ── NEW LISTING ───────────────────────────────────────────────────────────
  if (view === 'new-listing') {
    return (
      <div className="min-h-screen bg-stone-50">
        <div className="max-w-xl mx-auto px-6 py-10">
          <button onClick={() => setView('dashboard')}
            className="text-xs text-stone-400 hover:text-stone-600 mb-6 flex items-center gap-1">
            ← Back to dashboard
          </button>

          <div className="mb-8">
            <p className="text-xs font-semibold text-green-600 uppercase tracking-widest mb-2">
              {restaurant.restaurantName}
            </p>
            <h1 className="text-3xl font-bold text-stone-800 leading-tight" style={{ fontFamily: 'Georgia, serif' }}>
              Post surplus food
            </h1>
          </div>

          {listingDone ? (
            <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
              <p className="font-bold text-stone-800 text-xl mb-1" style={{ fontFamily: 'Georgia, serif' }}>Pickup posted!</p>
              <p className="text-stone-500 text-sm">Volunteers have been notified.</p>
            </div>
          ) : (
            <form onSubmit={handleListingSubmit} className="bg-white rounded-2xl border border-stone-200 p-7 space-y-6">

              {/* Pre-filled location */}
              <div className="bg-stone-50 rounded-xl px-4 py-3 border border-stone-100">
                <p className="text-xs text-stone-400 mb-1">Pickup location (from your profile)</p>
                <p className="text-sm font-medium text-stone-700">{restaurant.restaurantName}</p>
                <p className="text-xs text-stone-500">{restaurant.address}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-4 pb-2 border-b border-stone-100">
                  Food details
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-stone-600 mb-2">Food type</label>
                    <div className="grid grid-cols-3 gap-2">
                      {FOOD_TYPES.map(type => (
                        <button key={type.id} type="button" onClick={() => setSelectedFood(type.id)}
                          className={`py-3 px-2 rounded-xl border text-xs font-medium transition-all text-center ${
                            selectedFood === type.id
                              ? 'border-green-500 bg-green-50 text-green-800'
                              : 'border-stone-200 text-stone-600 hover:border-green-300 hover:bg-green-50'
                          }`}>
                          <div className="text-lg mb-1">{type.emoji}</div>
                          {type.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-stone-600 mb-1.5">
                      Quantity <span className="text-stone-400 font-normal">(portions)</span>
                    </label>
                    <input name="quantity" value={listingForm.quantity} onChange={handleListingInput}
                      type="number" min="1" placeholder="e.g. 30" required className={inputClass} />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-stone-600 mb-1.5">Pickup window</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-stone-400 mb-1">From</p>
                        <input name="pickupStart" value={listingForm.pickupStart} onChange={handleListingInput}
                          type="time" required className={inputClass} />
                      </div>
                      <div>
                        <p className="text-xs text-stone-400 mb-1">Until</p>
                        <input name="pickupEnd" value={listingForm.pickupEnd} onChange={handleListingInput}
                          type="time" required className={inputClass} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-stone-600 mb-1.5">
                      Notes <span className="text-stone-400 font-normal">(optional)</span>
                    </label>
                    <textarea name="notes" value={listingForm.notes} onChange={handleListingInput}
                      placeholder="e.g. Use back entrance, bring your own bags…" rows={3}
                      className="w-full px-4 py-2.5 border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition resize-none" />
                  </div>
                </div>
              </div>

              <button type="submit" disabled={listingSubmitting}
                className="w-full py-3.5 bg-stone-800 text-white rounded-xl font-semibold text-sm hover:bg-stone-700 active:scale-[0.99] transition-all disabled:opacity-60">
                {listingSubmitting ? 'Posting…' : 'Post pickup →'}
              </button>
              <p className="text-center text-xs text-stone-400">
                By posting, you confirm this food is safe for consumption.
              </p>
            </form>
          )}
        </div>
      </div>
    )
  }

  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  const openCount      = listings.filter(l => l.status === 'open').length
  const claimedCount   = listings.filter(l => l.status === 'claimed').length
  const completedCount = listings.filter(l => l.status === 'completed').length

  const STATUS_STYLE = {
    open:      { pill: 'bg-green-100 text-green-800 border-green-200',  label: 'Open'      },
    claimed:   { pill: 'bg-amber-100 text-amber-800 border-amber-200',  label: 'Claimed'   },
    completed: { pill: 'bg-stone-100 text-stone-600 border-stone-200',  label: 'Completed' },
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-xs font-semibold text-green-600 uppercase tracking-widest mb-1">Restaurant dashboard</p>
            <h1 className="text-3xl font-bold text-stone-800 leading-tight" style={{ fontFamily: 'Georgia, serif' }}>
              {restaurant.restaurantName}
            </h1>
            <p className="text-stone-400 text-xs mt-1">{restaurant.address}</p>
          </div>
          <button onClick={() => setView('new-listing')}
            className="py-2.5 px-5 bg-stone-800 text-white rounded-xl text-sm font-semibold hover:bg-stone-700 transition-colors flex-shrink-0 ml-4">
            + Post pickup
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { label: 'Open',      value: openCount,      color: 'text-green-600' },
            { label: 'Claimed',   value: claimedCount,   color: 'text-amber-600' },
            { label: 'Completed', value: completedCount, color: 'text-stone-500' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-stone-200 rounded-xl p-4 text-center">
              <p className={`text-3xl font-bold ${s.color}`} style={{ fontFamily: 'Georgia, serif' }}>{s.value}</p>
              <p className="text-xs text-stone-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Listings table */}
        <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-stone-100">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest">Your listings</p>
          </div>

          {listings.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-stone-400 text-sm">No listings yet.</p>
              <button onClick={() => setView('new-listing')}
                className="mt-3 text-sm text-green-600 font-medium hover:underline">
                Post your first pickup →
              </button>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {listings.map(l => {
                const s = STATUS_STYLE[l.status] || STATUS_STYLE.open
                const start = typeof l.pickupStart === 'string' ? l.pickupStart : '—'
                const end   = typeof l.pickupEnd   === 'string' ? l.pickupEnd   : '—'
                return (
                  <div key={l.id} className="px-6 py-4 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${s.pill}`}>
                          {s.label}
                        </span>
                        <p className="text-sm font-medium text-stone-800 truncate">
                          {l.foodType} · {l.quantity} portions
                        </p>
                      </div>
                      <p className="text-xs text-stone-400">Pickup {start}–{end}</p>
                      {l.claimedBy && (
                        <p className="text-xs text-stone-500 mt-0.5">
                          Claimed by {l.claimedBy}{l.dropOffName ? ` → ${l.dropOffName}` : ''}
                        </p>
                      )}
                      {l.status === 'completed' && l.aiVerified && (
                        <p className="text-xs text-green-600 font-medium mt-0.5">AI Verified ✓</p>
                      )}
                    </div>
                    {(l.status === 'completed' || l.status === 'claimed') && l.dropOffName && (
                      <button
                        onClick={() => printReceipt(restaurant, l)}
                        className="flex-shrink-0 text-xs font-medium text-stone-600 border border-stone-200 px-3 py-1.5 rounded-lg hover:bg-stone-50 transition whitespace-nowrap">
                        Download receipt ↓
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-stone-400 mt-6">
          Not {restaurant.restaurantName}?{' '}
          <button onClick={switchAccount} className="text-stone-500 hover:underline">
            Switch account
          </button>
        </p>
      </div>
    </div>
  )
}
