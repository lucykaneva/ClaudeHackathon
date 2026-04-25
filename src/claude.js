import { haversineDistance } from './geo.js'

export async function getRouteOrder(volunteerLat, volunteerLng, listings) {
  const enriched = listings
    .map(l => ({
      id: l.id,
      restaurantName: l.restaurantName,
      foodType: l.foodType,
      quantity: l.quantity,
      pickupEnd: l.pickupEnd,
      distanceMiles: parseFloat(haversineDistance(volunteerLat, volunteerLng, l.lat, l.lng).toFixed(2)),
    }))

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `You are a food rescue coordinator optimizing a volunteer's pickup route.

Volunteer location: ${volunteerLat}, ${volunteerLng}
Open listings (each includes distanceMiles from volunteer and pickupEnd time):
${JSON.stringify(enriched, null, 2)}

Return the optimal pickup order balancing two factors:
1. Urgency — listings with earlier pickupEnd expire sooner and should be prioritized
2. Efficiency — minimize total travel distance when expiry times are similar (within 30 min)

Respond with JSON only, no markdown:
{ "order": ["id1", "id2", ...], "reason": "One sentence explaining the top pick." }`
        }
      ]
    })
  })

  const data = await response.json()
  if (data.error) throw new Error(data.error.message)
  const text = data.content[0].text
  const clean = text.replace(/```json\n?|\n?```/g, '').trim()
  return JSON.parse(clean)
}

export async function verifyPhoto(base64Image) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: base64Image }
            },
            {
              type: "text",
              text: `This photo was submitted by a food rescue volunteer as proof of delivery. Does it plausibly show food being distributed in a communal or public setting?

Respond with JSON only:
{
  "verified": true/false,
  "flagged": true/false,
  "reason": "one sentence"
}
verified: true if the photo plausibly shows food distribution.
flagged: true if the image appears fraudulent, irrelevant, or deliberately misleading (e.g. blank wall, stock photo, repeated submission).`
            }
          ]
        }
      ]
    })
  })
  const data = await response.json()
  if (data.error) throw new Error(data.error.message)
  const text = data.content[0].text
  const clean = text.replace(/```json\n?|\n?```/g, '').trim()
  return JSON.parse(clean)
}