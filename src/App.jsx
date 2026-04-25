import { BrowserRouter, Routes, Route, Link } from "react-router-dom"
import RestaurantPage from "./pages/RestaurantPage"
import VolunteerPage from "./pages/VolunteerPage"
import MapPage from "./pages/MapPage"

export default function App() {
  return (
    <BrowserRouter>
      <nav className="flex gap-6 p-4 border-b text-sm font-medium">
        <Link to="/restaurant">Restaurant</Link>
        <Link to="/volunteer">Volunteer</Link>
        <Link to="/map">Map</Link>
      </nav>
      <Routes>
        <Route path="/restaurant" element={<RestaurantPage />} />
        <Route path="/volunteer" element={<VolunteerPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/" element={<RestaurantPage />} />
      </Routes>
    </BrowserRouter>
  )
}