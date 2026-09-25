const { assertRequestTransition, assertRideTransition } = require('../src/services/stateMachine');

describe('stateMachine — ride_request transitions', () => {
  test('allows the happy path REQUESTED -> MATCHED -> DRIVER_ARRIVED -> STARTED -> COMPLETED', () => {
    expect(() => assertRequestTransition('REQUESTED', 'MATCHED')).not.toThrow();
    expect(() => assertRequestTransition('MATCHED', 'DRIVER_ARRIVED')).not.toThrow();
    expect(() => assertRequestTransition('DRIVER_ARRIVED', 'STARTED')).not.toThrow();
    expect(() => assertRequestTransition('STARTED', 'COMPLETED')).not.toThrow();
  });

  test('allows cancellation from REQUESTED and MATCHED', () => {
    expect(() => assertRequestTransition('REQUESTED', 'CANCELLED')).not.toThrow();
    expect(() => assertRequestTransition('MATCHED', 'CANCELLED')).not.toThrow();
  });

  test('rejects skipping states (REQUESTED -> STARTED)', () => {
    expect(() => assertRequestTransition('REQUESTED', 'STARTED')).toThrow(/Invalid ride_request transition/);
  });

  test('rejects any transition out of a terminal state', () => {
    expect(() => assertRequestTransition('COMPLETED', 'CANCELLED')).toThrow();
    expect(() => assertRequestTransition('CANCELLED', 'MATCHED')).toThrow();
  });

  test('rejects cancelling after the driver has already started the trip', () => {
    expect(() => assertRequestTransition('STARTED', 'CANCELLED')).toThrow();
  });
});

describe('stateMachine — ride (pool) transitions', () => {
  test('happy path', () => {
    expect(() => assertRideTransition('MATCHED', 'DRIVER_ARRIVED')).not.toThrow();
    expect(() => assertRideTransition('DRIVER_ARRIVED', 'STARTED')).not.toThrow();
    expect(() => assertRideTransition('STARTED', 'COMPLETED')).not.toThrow();
  });

  test('rejects starting a ride before the driver has arrived', () => {
    expect(() => assertRideTransition('MATCHED', 'STARTED')).toThrow();
  });
});
