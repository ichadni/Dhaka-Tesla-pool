const { computeFare } = require('../src/services/fareService');

describe('fareService.computeFare — Nusrat & Rafiq worked example', () => {
  test("Nusrat pooled (Banani -> Mohakhali, 2.22km) = 5064 paisa", () => {
    const fare = computeFare(2.22, true);
    expect(fare.baseFarePaisa).toBe(3000);
    expect(fare.distanceChargePaisa).toBe(3330); // 1500 * 2.22
    expect(fare.poolDiscountPaisa).toBe(1266); // 20% of 6330
    expect(fare.totalFarePaisa).toBe(5064);
  });

  test("Rafiq pooled (Banani -> Gulshan 1, 2.12km) = 4944 paisa", () => {
    const fare = computeFare(2.12, true);
    expect(fare.distanceChargePaisa).toBe(3180);
    expect(fare.poolDiscountPaisa).toBe(1236);
    expect(fare.totalFarePaisa).toBe(4944);
  });

  test('solo rider gets no pool discount', () => {
    const fare = computeFare(2.22, false);
    expect(fare.poolDiscountPaisa).toBe(0);
    expect(fare.totalFarePaisa).toBe(6330);
  });

  test('fare is always an integer number of paisa (no float drift)', () => {
    for (const km of [0.5, 1.33, 7.77, 12.01]) {
      const fare = computeFare(km, true);
      expect(Number.isInteger(fare.totalFarePaisa)).toBe(true);
    }
  });
});
