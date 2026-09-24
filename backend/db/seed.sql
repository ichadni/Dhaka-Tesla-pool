-- Dhaka Tesla Pool — seed.sql
-- Demo cast straight from the brief. Every demo account's password is
-- `password123` (bcrypt hash below). See README "Demo credentials".

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- Zones: coordinates are approximate real Dhaka locations. corridor_group
-- is the hand-assigned pooling grouping used by geoService.isPoolable().
-- ---------------------------------------------------------------------
INSERT INTO zones (name, lat, lng, corridor_group) VALUES
  ('Banani',      23.7937, 90.4066, 'NE_AIRPORT_ROAD'),
  ('Gulshan 1',   23.7808, 90.4142, 'NE_AIRPORT_ROAD'),
  ('Mohakhali',   23.7806, 90.3979, 'NE_AIRPORT_ROAD'),
  ('Uttara',      23.8759, 90.3795, 'NE_AIRPORT_ROAD'),
  ('Bashundhara', 23.8151, 90.4340, 'NE_AIRPORT_ROAD'),
  ('Dhanmondi',   23.7461, 90.3742, 'SW_CENTRAL'),
  ('Mirpur',      23.8223, 90.3654, 'SW_CENTRAL'),
  ('Farmgate',    23.7581, 90.3898, 'SW_CENTRAL')
ON DUPLICATE KEY UPDATE lat = VALUES(lat), lng = VALUES(lng), corridor_group = VALUES(corridor_group);

-- ---------------------------------------------------------------------
-- Users. password_hash is bcrypt('password123', 10).
-- ---------------------------------------------------------------------
INSERT INTO users (name, phone, email, password_hash, role) VALUES
  ('Jashim Uddin', '01710000001', 'jashim@teslapool.dhaka', '$2a$10$pmPP2Dqm6aso8kIm0zIapejm8iKX8Hw5MT3vGTTOu0RyoHupggECG', 'driver'),
  ('Nusrat Jahan',  '01710000002', 'nusrat@teslapool.dhaka', '$2a$10$pmPP2Dqm6aso8kIm0zIapejm8iKX8Hw5MT3vGTTOu0RyoHupggECG', 'passenger'),
  ('Rafiq Islam',   '01710000003', 'rafiq@teslapool.dhaka',  '$2a$10$pmPP2Dqm6aso8kIm0zIapejm8iKX8Hw5MT3vGTTOu0RyoHupggECG', 'passenger'),
  ('Shirin Akter',  '01710000004', 'shirin@teslapool.dhaka', '$2a$10$pmPP2Dqm6aso8kIm0zIapejm8iKX8Hw5MT3vGTTOu0RyoHupggECG', 'passenger')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Jashim's Bullet: 3-seat Tesla.
INSERT INTO teslas (driver_id, name, capacity, status)
SELECT id, 'Bullet', 3, 'ONLINE' FROM users WHERE phone = '01710000001'
ON DUPLICATE KEY UPDATE name = VALUES(name);
