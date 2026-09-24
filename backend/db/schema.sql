-- Dhaka Tesla Pool — schema.sql
-- Loaded automatically by the MySQL container on first boot
-- (mounted into /docker-entrypoint-initdb.d). Plain SQL is used instead of
-- an ORM migration DSL so the schema is transparent and reviewable in one
-- file for an MVP of this size — see README "Why raw SQL migrations".

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- users: both passengers and drivers live in one table (role flag).
-- wallet_balance_paisa backs the simulated TeslaPay wallet.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name                  VARCHAR(100) NOT NULL,
  phone                 VARCHAR(20)  NOT NULL,
  email                 VARCHAR(150) NULL,
  password_hash         VARCHAR(255) NOT NULL,
  role                  ENUM('passenger','driver') NOT NULL,
  wallet_balance_paisa  BIGINT NOT NULL DEFAULT 0,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_phone (phone),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- teslas: one driver owns exactly one Tesla in this MVP (documented
-- assumption — real fleets would allow a driver/vehicle m:n history).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teslas (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  driver_id   INT UNSIGNED NOT NULL,
  name        VARCHAR(50) NOT NULL,
  capacity    TINYINT UNSIGNED NOT NULL DEFAULT 3,
  status      ENUM('OFFLINE','ONLINE') NOT NULL DEFAULT 'OFFLINE',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_teslas_driver (driver_id),
  CONSTRAINT fk_teslas_driver FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_capacity_positive CHECK (capacity BETWEEN 1 AND 6)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- zones: predefined Dhaka areas. corridor_group encodes which zones are
-- considered "on the same route" for pooling eligibility (Section 4/17
-- assumption — see README "Matching rule").
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zones (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(50) NOT NULL,
  lat             DECIMAL(9,6) NOT NULL,
  lng             DECIMAL(9,6) NOT NULL,
  corridor_group  VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_zones_name (name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- rides: a "pool" — one active trip instance running on one Tesla.
-- seats_occupied is a denormalized, transactionally-maintained counter
-- so capacity checks are a single indexed read (see services/pool.js).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rides (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tesla_id        INT UNSIGNED NOT NULL,
  status          ENUM('MATCHED','DRIVER_ARRIVED','STARTED','COMPLETED','CANCELLED')
                  NOT NULL DEFAULT 'MATCHED',
  seats_occupied  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  started_at      DATETIME NULL,
  completed_at    DATETIME NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rides_tesla FOREIGN KEY (tesla_id) REFERENCES teslas(id),
  KEY idx_rides_tesla_status (tesla_id, status)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- ride_requests: one row per passenger request. Individual status and
-- individual fare live here so each passenger only ever sees their own.
-- version supports optimistic locking as a second line of defense
-- alongside the row lock used in services/pool.js (see README "Concurrency").
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ride_requests (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  passenger_id            INT UNSIGNED NOT NULL,
  pickup_zone_id          INT UNSIGNED NOT NULL,
  destination_zone_id     INT UNSIGNED NOT NULL,
  seats_requested         TINYINT UNSIGNED NOT NULL DEFAULT 1,
  status                  ENUM('REQUESTED','MATCHED','DRIVER_ARRIVED','STARTED','COMPLETED','CANCELLED')
                          NOT NULL DEFAULT 'REQUESTED',
  ride_id                 INT UNSIGNED NULL,
  distance_km             DECIMAL(6,2) NULL,
  base_fare_paisa         INT UNSIGNED NULL,
  distance_charge_paisa   INT UNSIGNED NULL,
  pool_discount_paisa     INT UNSIGNED NOT NULL DEFAULT 0,
  total_fare_paisa        INT UNSIGNED NULL,
  payment_method          ENUM('CASH','TESLAPAY') NOT NULL DEFAULT 'CASH',
  version                 INT UNSIGNED NOT NULL DEFAULT 0,
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  matched_at              DATETIME NULL,
  cancelled_at            DATETIME NULL,
  updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rr_passenger FOREIGN KEY (passenger_id) REFERENCES users(id),
  CONSTRAINT fk_rr_pickup FOREIGN KEY (pickup_zone_id) REFERENCES zones(id),
  CONSTRAINT fk_rr_destination FOREIGN KEY (destination_zone_id) REFERENCES zones(id),
  CONSTRAINT fk_rr_ride FOREIGN KEY (ride_id) REFERENCES rides(id),
  KEY idx_rr_status (status),
  KEY idx_rr_passenger (passenger_id),
  KEY idx_rr_ride (ride_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- ride_status_history: append-only audit trail so a completed/cancelled
-- ride can be explained after the fact (Section 2 requirement).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ride_status_history (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ride_request_id     INT UNSIGNED NOT NULL,
  from_status         VARCHAR(20) NULL,
  to_status           VARCHAR(20) NOT NULL,
  changed_by_user_id  INT UNSIGNED NULL,
  note                VARCHAR(255) NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rsh_request FOREIGN KEY (ride_request_id) REFERENCES ride_requests(id),
  CONSTRAINT fk_rsh_user FOREIGN KEY (changed_by_user_id) REFERENCES users(id),
  KEY idx_rsh_request (ride_request_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- payments: one row per ride_request. Cash or simulated TeslaPay wallet.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ride_request_id   INT UNSIGNED NOT NULL,
  method            ENUM('CASH','TESLAPAY') NOT NULL,
  amount_paisa      INT UNSIGNED NOT NULL,
  status            ENUM('PENDING','PAID') NOT NULL DEFAULT 'PENDING',
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at           DATETIME NULL,
  UNIQUE KEY uq_payments_request (ride_request_id),
  CONSTRAINT fk_payments_request FOREIGN KEY (ride_request_id) REFERENCES ride_requests(id)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;
