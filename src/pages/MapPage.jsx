import { useEffect, useRef, useState } from 'react'

// 🔌 MAPBOX — uncomment when token is in .env:
// import mapboxgl from 'mapbox-gl'
// import 'mapbox-gl/dist/mapbox-gl.css'
// mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

import { db } from '../firebase'
import { collection, query, onSnapshot, doc, updateDoc } from 'firebase/firestore'

const SEED_LISTINGS = [
  { id: '1', restaurantName: "Xi'an Famous Foods", address: '81 St Marks Pl, East Village',
    lat: 40.7265, lng: -73.9822, foodType: 'Noodles', quantity: 35,
    pickupStart: '18:00', pickupEnd: '20:00', status: 'open' },
  { id: '2', restaurantName: 'Kopitiam', address: '151 E Broadway, Lower East Side',
    lat: 40.7136, lng: -73.9941, foodType: 'Cooked meals', quantity: 22,
    pickupStart: '17:30', pickupEnd: '19:30', status: 'open' },
  { id: '3', restaurantName: 'Sullivan St Bakery', address: "533 W 47th St, Hell's Kitchen",
    lat: 40.7614, lng: -73.9954, foodType: 'Bread & bakery', quantity: 55,
    pickupStart: '17:00', pickupEnd: '18:30', status: 'open' },
  { id: '4', restaurantName: 'Superiority Burger', address: '119 Avenue A, East Village',
    lat: 40.7261, lng: -73.9807, foodType: 'Cooked meals', quantity: 20,
    pickupStart: '19:00', pickupEnd: '21:00', status: 'claimed' },
]

function getPinStyle(status, pickupEnd) {
  if (status === 'claimed') return { bg: 'bg-stone-400', label: 'Claimed', color: '#9ca3af' }
  const [h, m] = pickupEnd.split(':').map(Number)
  const endMin = h * 60 + m
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  if (endMin - nowMin <= 90) return { bg: 'bg-amber-500', label: 'Expiring soon', color: '#f59e0b' }
  return { bg: 'bg-green-600', label: 'Available', color: '#16a34a' }
}

export default function MapPage() {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const [listings, setListings] = useState(SEED_LISTINGS)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    const q = query(collection(db, 'listings'))
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setListings(docs.length > 0 ? docs : SEED_LISTINGS)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    // 🔌 MAPBOX init — uncomment when token ready:
    // if (mapRef.current) return
    // mapRef.current = new mapboxgl.Map({
    //   container: mapContainer.current,
    //   style: 'mapbox://styles/mapbox/light-v11',
    //   center: [-74.006, 40.7128],
    //   zoom: 12,
    // })
  }, [])

  useEffect(() => {
    // 🔌 MAPBOX pins — uncomment when map is ready:
    // markersRef.current.forEach(m => m.remove())
    // markersRef.current = listings.map(listing => {
    //   const { color } = getPinStyle(listing.status, listing.pickupEnd)
    //   const el = document.createElement('div')
    //   el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3);cursor:pointer`
    //   el.addEventListener('click', () => setSelected(listing))
    //   return new mapboxgl.Marker({ element: el })
    //     .setLngLat([listing.lng, listing.lat])
    //     .addTo(mapRef.current)
    // })
  }, [listings])

  const handleClaim = async (id) => {
    await updateDoc(doc(db, 'listings', id), { status: 'claimed', claimedBy: 'volunteer-id' })
    setSelected(prev => prev ? { ...prev, status: 'claimed' } : null)
  }

  return (
    <div style={{ height: 'calc(100vh - 56px)' }} className="flex">
      {/* Map */}
      <div className="flex-1 relative bg-stone-100">
        {/* 🔌 MAPBOX: replace placeholder with: <div ref={mapContainer} className="absolute inset-0" /> */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-4xl mb-3">🗺️</div>
          <p className="text-stone-500 text-sm font-medium">Mapbox loads here</p>
          <p className="text-stone-400 text-xs mt-1">Add VITE_MAPBOX_TOKEN to .env</p>
          <div className="mt-6 flex gap-2 flex-wrap justify-center max-w-sm">
            {listings.map(l => {
              const { bg } = getPinStyle(l.status, l.pickupEnd)
              return (
                <button
                  key={l.id}
                  onClick={() => setSelected(l)}
                  className={`${bg} text-white text-xs font-medium px-3 py-1.5 rounded-full shadow hover:opacity-90 transition`}
                >
                  {l.restaurantName}
                </button>
              )
            })}
          </div>
          <p className="text-stone-400 text-xs mt-3">Click a pin to preview the sidebar</p>
        </div>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-white rounded-xl shadow border border-stone-200 px-4 py-3 text-xs space-y-1.5 z-10">
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-600 inline-block"></span>Available</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span>Expiring soon</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-stone-400 inline-block"></span>Claimed</div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-80 bg-white border-l border-stone-200 flex flex-col overflow-hidden">
        {selected ? (
          <>
            <div className="p-5 border-b border-stone-100">
              <button onClick={() => setSelected(null)} className="text-xs text-stone-400 hover:text-stone-600 mb-3 flex items-center gap-1">
                ← All pickups
              </button>
              <div className="flex items-start justify-between mb-3">
                <h2 className="font-bold text-stone-800 text-base leading-tight" style={{ fontFamily: 'Georgia, serif' }}>
                  {selected.restaurantName}
                </h2>
                <span className={`text-xs font-medium px-2 py-1 rounded-full text-white flex-shrink-0 ml-2 ${getPinStyle(selected.status, selected.pickupEnd).bg}`}>
                  {getPinStyle(selected.status, selected.pickupEnd).label}
                </span>
              </div>
              <div className="space-y-1.5 text-sm text-stone-500">
                <p>📍 {selected.address}</p>
                <p>📦 {selected.quantity} portions · {selected.foodType}</p>
                <p>⏰ Pickup {selected.pickupStart}–{selected.pickupEnd}</p>
              </div>
            </div>
            <div className="p-5 space-y-2">
              {selected.status === 'open' ? (
                <button
                  onClick={() => handleClaim(selected.id)}
                  className="w-full py-3 bg-stone-800 text-white rounded-xl text-sm font-semibold hover:bg-stone-700 transition-colors"
                >
                  Claim this pickup
                </button>
              ) : (
                <div className="w-full py-3 bg-stone-100 text-stone-400 rounded-xl text-sm font-medium text-center">
                  Already claimed
                </div>
              )}
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(selected.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 border border-stone-200 text-stone-600 rounded-xl text-sm font-medium text-center hover:bg-stone-50 transition-colors block"
              >
                Open in Google Maps ↗
              </a>
            </div>
          </>
        ) : (
          <>
            <div className="p-4 border-b border-stone-100">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-stone-800 text-sm">Available pickups</h3>
                <span className="text-xs font-mono bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  {listings.filter(l => l.status === 'open').length} open
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {listings.map(listing => {
                const { bg, label } = getPinStyle(listing.status, listing.pickupEnd)
                return (
                  <button
                    key={listing.id}
                    onClick={() => setSelected(listing)}
                    className="w-full text-left bg-white border border-stone-200 rounded-xl p-3.5 hover:border-green-400 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between mb-1.5">
                      <p className="font-semibold text-stone-800 text-sm leading-tight">{listing.restaurantName}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full text-white ml-2 flex-shrink-0 ${bg}`}>
                        {label}
                      </span>
                    </div>
                    <p className="text-xs text-stone-500">{listing.quantity} portions · {listing.foodType}</p>
                    <p className="text-xs text-stone-400 mt-0.5">⏰ {listing.pickupStart}–{listing.pickupEnd}</p>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
