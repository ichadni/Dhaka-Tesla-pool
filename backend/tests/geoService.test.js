const { distanceKm, isPoolable } = require('../src/services/geoService');

const banani = { lat: 23.7937, lng: 90.4066 };
const mohakhali = { lat: 23.7806, lng: 90.3979 };
const gulshan = { lat: 23.7808, lng: 90.4142 };
const dhanmondi = { lat: 23.7461, lng: 90.3742 };

describe('geoService', () => {
  test('distanceKm(Banani, Mohakhali) matches the documented worked example', () => {
    expect(distanceKm(banani, mohakhali)).toBeCloseTo(2.22, 1);
  });

  test("Nusrat (Banani->Mohakhali) and Rafiq (Banani->Gulshan1) are poolable", () => {
    const nusrat = { pickup_zone_id: 1, destination_corridor_group: 'NE_AIRPORT_ROAD' };
    const rafiq = { pickup_zone_id: 1, destination_corridor_group: 'NE_AIRPORT_ROAD' };
    expect(isPoolable(nusrat, rafiq)).toBe(true);
  });

  test('a Banani->Dhanmondi rider is NOT poolable with a Banani->Mohakhali rider (different corridor)', () => {
    const nusrat = { pickup_zone_id: 1, destination_corridor_group: 'NE_AIRPORT_ROAD' };
    const crossTown = { pickup_zone_id: 1, destination_corridor_group: 'SW_CENTRAL' };
    expect(isPoolable(nusrat, crossTown)).toBe(false);
  });

  test('two requests from different pickup zones are never poolable', () => {
    const fromBanani = { pickup_zone_id: 1, destination_corridor_group: 'NE_AIRPORT_ROAD' };
    const fromUttara = { pickup_zone_id: 4, destination_corridor_group: 'NE_AIRPORT_ROAD' };
    expect(isPoolable(fromBanani, fromUttara)).toBe(false);
  });
});
