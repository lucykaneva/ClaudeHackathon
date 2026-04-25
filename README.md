# FoodBridge

> **Restaurant wins. Volunteer wins. Hungry people win.**

FoodBridge connects NYC restaurants with end-of-day surplus food to nearby volunteers who deliver it to  501(c)(3) nonprofit food pantries and shelters, and auto-generates a tax donation record for every completed pickup.

Inspired by a Hong Kong teenager who spent her own money buying meal boxes to hand-deliver to homeless people. We built the infrastructure to let anyone do the same, effortlessly.

---

## What It Does

- **Restaurants** post surplus food in 60 seconds and receive an auto-generated tax donation record tied to a real shelter EIN and USDA reference pricing
- **Volunteers** see open listings sorted by distance from their live location, claim a pickup, get auto-assigned the nearest shelter drop-off, and verify delivery via Claude Vision photo recognition
- **Shelters** receive fresh, hot, culturally specific meals that bulk food bank schedules never reach

---

## Built With

- [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- [Firebase Firestore](https://firebase.google.com/docs/firestore) — real-time listings and volunteer data
- [Firebase Storage](https://firebase.google.com/docs/storage) — delivery photo uploads
- [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/) — live pickup map
- [Claude API (Sonnet)](https://docs.anthropic.com/) — route optimization and donation record generation
- [Claude Vision](https://docs.anthropic.com/) — delivery photo verification
- [Tailwind CSS](https://tailwindcss.com/)

---

## Team

- Harini Dave
- Angela Koo
- Suzy Zeng
- Lyudmila Kaneva

---

## Getting Started

### Prerequisites

- Node.js v18+
- A [Firebase](https://firebase.google.com/) project with Firestore and Storage enabled
- A [Mapbox](https://www.mapbox.com/) account and access token
- An [Anthropic](https://www.anthropic.com/) API key

### 1. Clone the repo

```bash
git clone https://github.com/your-username/foodbridge.git
cd foodbridge
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env` file in the project root:

```env
# Mapbox
VITE_MAPBOX_TOKEN=your_mapbox_token_here

# Firebase
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Anthropic
VITE_ANTHROPIC_API_KEY=your_anthropic_api_key
```

### 4. Firebase setup

In the [Firebase Console](https://console.firebase.google.com/):

1. Create a new project
2. Enable **Firestore Database** — start in test mode for development
3. Enable **Storage** — start in test mode for development
4. Copy your project config into the `.env` file above

The app expects two Firestore collections:
- `listings` — surplus food postings from restaurants
- `volunteers` — registered volunteer profiles

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Project Structure

```
src/
├── pages/
│   ├── RestaurantPage.jsx   # Surplus food listing form + donation record
│   ├── VolunteerPage.jsx    # Volunteer dashboard, claims, photo verify
│   └── MapPage.jsx          # Live Mapbox map of open pickups
├── data/
│   └── shelters.js          # Hardcoded NYC shelter drop-off locations
├── firebase.js              # Firebase config
├── geo.js                   # Haversine distance + shelter assignment
└── claude.js                # Claude API calls (route, verify, record)
```

---

## Known Limitations (Hackathon Scope)

- Donation records are generated from hardcoded USDA reference prices, not a certified appraisal
- Restaurant authorization is hardcoded — no real auth system yet
- Shelter data is hardcoded — future versions will pull live capacity feeds
- Donation record PDF pipeline is client-side — production would move this to a Cloud Function for tamper-proof generation

---

## What's Next

- Real PDF generation via Firebase Cloud Functions with cryptographic hashing
- Proper restaurant authentication tied to verified EINs
- Live geocoding via Google Places for accurate distance matching
- Shelter capacity API integration
- Impact dashboard connected to live Firestore aggregates

---

## License

MIT
