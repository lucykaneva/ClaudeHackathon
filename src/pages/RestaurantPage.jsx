import { useState } from 'react'

const FOOD_TYPES = [
  { id: 'cooked', label: 'Cooked meals', emoji: '🍱' },
  { id: 'noodles', label: 'Rice & noodles', emoji: '🍜' },
  { id: 'bakery', label: 'Bread & bakery', emoji: '🍞' },
  { id: 'dimsum', label: 'Dim sum', emoji: '🥟' },
  { id: 'drinks', label: 'Drinks', emoji: '🧃' },
  { id: 'other', label: 'Other', emoji: '📦' },
]

export default function RestaurantPage() {
  const [selectedFood, setSelectedFood] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({
    restaurantName: '',
    address: '',
    quantity: '',
    pickupStart: '',
    pickupEnd: '',
    notes: '',
  })

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    // 🔌 FIREBASE HOOK — Person A wires this in:
    // import { db } from '../firebase'
    // import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
    // await addDoc(collection(db, 'listings'), {
    //   ...form,
    //   foodType: selectedFood,
    //   status: 'open',
    //   lat: 0, // swap with geocoded lat from Google Places
    //   lng: 0, // swap with geocoded lng from Google Places
    //   claimedBy: null,
    //   photoUrl: null,
    //   aiVerified: null,
    //   createdAt: serverTimestamp(),
    // })
    console.log('Submitting:', { ...form, foodType: selectedFood })
    setSubmitted(true)
  }

  const handleReset = () => {
    setSubmitted(false)
    setForm({ restaurantName: '', address: '', quantity: '', pickupStart: '', pickupEnd: '', notes: '' })
    setSelectedFood(null)
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl border border-stone-200 p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5 text-3xl">
            ✓
          </div>
          <h2 className="text-2xl font-bold text-stone-800 mb-2" style={{ fontFamily: 'Georgia, serif' }}>
            Pickup posted
          </h2>
          <p className="text-stone-500 text-sm leading-relaxed mb-4">
            Nearby volunteers have been notified. You'll get a confirmation once someone claims this pickup.
          </p>
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-6 text-left">
            <p className="text-green-800 text-xs font-semibold uppercase tracking-wide mb-1">Summary</p>
            <p className="text-green-900 text-sm font-medium">{form.restaurantName}</p>
            <p className="text-green-700 text-xs">{form.quantity} portions · Pickup {form.pickupStart}–{form.pickupEnd}</p>
          </div>
          <button
            onClick={handleReset}
            className="w-full py-3 bg-stone-800 text-white rounded-xl text-sm font-semibold hover:bg-stone-700 transition-colors"
          >
            Post another pickup
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-xs font-semibold text-green-600 uppercase tracking-widest mb-2">Restaurant portal</p>
          <h1 className="text-3xl font-bold text-stone-800 leading-tight mb-2" style={{ fontFamily: 'Georgia, serif' }}>
            List your surplus food
          </h1>
          <p className="text-stone-500 text-sm leading-relaxed">
            Takes 60 seconds. Volunteers are notified the moment you submit.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-stone-200 p-7 space-y-6">

          <div>
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-4 pb-2 border-b border-stone-100">
              Your restaurant
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1.5">Restaurant name</label>
                <input
                  name="restaurantName"
                  value={form.restaurantName}
                  onChange={handleChange}
                  placeholder="Search or enter name..."
                  required
                  className="w-full px-4 py-2.5 border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                />
                {/* 🔌 Replace with Google Places Autocomplete when API key is ready */}
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1.5">Address</label>
                <input
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  placeholder="Full street address"
                  required
                  className="w-full px-4 py-2.5 border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-4 pb-2 border-b border-stone-100">
              Food details
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-600 mb-2">Food type</label>
                <div className="grid grid-cols-3 gap-2">
                  {FOOD_TYPES.map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setSelectedFood(type.id)}
                      className={`py-3 px-2 rounded-xl border text-xs font-medium transition-all text-center ${
                        selectedFood === type.id
                          ? 'border-green-500 bg-green-50 text-green-800'
                          : 'border-stone-200 text-stone-600 hover:border-green-300 hover:bg-green-50'
                      }`}
                    >
                      <div className="text-lg mb-1">{type.emoji}</div>
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1.5">
                  Quantity <span className="text-stone-400 font-normal">(boxes or portions)</span>
                </label>
                <input
                  name="quantity"
                  value={form.quantity}
                  onChange={handleChange}
                  type="number"
                  min="1"
                  placeholder="e.g. 30"
                  required
                  className="w-full px-4 py-2.5 border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1.5">Pickup window</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-stone-400 mb-1">From</p>
                    <input
                      name="pickupStart"
                      value={form.pickupStart}
                      onChange={handleChange}
                      type="time"
                      required
                      className="w-full px-4 py-2.5 border border-stone-200 rounded-lg text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-stone-400 mb-1">Until</p>
                    <input
                      name="pickupEnd"
                      value={form.pickupEnd}
                      onChange={handleChange}
                      type="time"
                      required
                      className="w-full px-4 py-2.5 border border-stone-200 rounded-lg text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1.5">
                  Notes <span className="text-stone-400 font-normal">(optional)</span>
                </label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  placeholder="e.g. Use back entrance, bring your own bags..."
                  rows={3}
                  className="w-full px-4 py-2.5 border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition resize-none"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3.5 bg-stone-800 text-white rounded-xl font-semibold text-sm hover:bg-stone-700 active:scale-[0.99] transition-all"
          >
            Post pickup →
          </button>
          <p className="text-center text-xs text-stone-400">
            By posting, you confirm this food is safe for consumption.
          </p>
        </form>
      </div>
    </div>
  )
}
