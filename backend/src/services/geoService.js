/**
 * Geography kept deliberately simple (Section 4): a fixed list of Dhaka
 * zones with plain lat/lng, no routing API. Distance is the haversine
 * (straight-line) distance between zone centroids, multiplied by a fixed
 * DETOUR_FACTOR to roughly approximate real road distance. This is a
 * documented simplification, not real routing.
 */
const DETOUR_FACTOR = 1.3;
const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/** Straight-line km between two {lat,lng} points, via the haversine formula. */
function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Approximate road distance in km between two zones, rounded to 2dp. */
function distanceKm(zoneA, zoneB) {
  const raw = haversineKm(zoneA, zoneB) * DETOUR_FACTOR;
  return Math.round(raw * 100) / 100;
}

/**
 * Pooling / matching rule (Section 4 — invented and documented here):
 * Two ride requests are poolable when:
 *   1. They share the same pickup zone (driver only has to stop once), AND
 *   2. Their destination zones belong to the same `corridor_group`
 *      (a hand-assigned "these areas sit along the same road corridor"
 *      grouping — e.g. Banani/Gulshan/Mohakhali/Uttara/Bashundhara all sit
 *      along the Airport-Road/Progoti Sarani corridor in the NE of the
 *      seed data, while Dhanmondi/Mirpur/Farmgate sit along a separate
 *      west/central corridor).
 *
 * This is intentionally coarse (no detour-distance optimisation) — good
 * enough to correctly pool Nusrat (Banani -> Mohakhali) with Rafiq
 * (Banani -> Gulshan 1), both NE-corridor trips from the same pickup zone,
 * while correctly refusing to pool either of them with someone requesting
 * Banani -> Dhanmondi.
 */
function isPoolable(requestA, requestB) {
  if (requestA.pickup_zone_id !== requestB.pickup_zone_id) return false;
  return requestA.destination_corridor_group === requestB.destination_corridor_group;
}

module.exports = { haversineKm, distanceKm, isPoolable, DETOUR_FACTOR };
