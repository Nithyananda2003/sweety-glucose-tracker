CREATE TABLE IF NOT EXISTS users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Additive migration: existing accounts stay patients and retain their readings.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'patient'
  CHECK (role IN ('patient', 'doctor'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS reading_revision BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS doctor_patients (
  doctor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (doctor_id, patient_id),
  CHECK (doctor_id <> patient_id)
);
CREATE INDEX IF NOT EXISTS doctor_patients_patient_idx ON doctor_patients(patient_id);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS readings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  slot TEXT NOT NULL CHECK (slot IN ('morning', 'after_breakfast', 'after_lunch', 'after_dinner')),
  value INTEGER NOT NULL CHECK (value BETWEEN 40 AND 600),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT readings_user_date_slot_key UNIQUE (user_id, date, slot)
);
-- The four-slot CHECK and unique key enforce at most four readings per user/day.
CREATE INDEX IF NOT EXISTS readings_user_date_idx ON readings(user_id, date DESC);

-- A database revision makes cache correctness independent of Redis availability.
-- Triggers cover API writes, the seed, and direct SQL changes in one transaction.
CREATE OR REPLACE FUNCTION bump_reading_revision() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE users SET reading_revision = reading_revision + 1 WHERE id = OLD.user_id;
    RETURN OLD;
  END IF;
  UPDATE users SET reading_revision = reading_revision + 1 WHERE id = NEW.user_id;
  IF TG_OP = 'UPDATE' AND OLD.user_id <> NEW.user_id THEN
    UPDATE users SET reading_revision = reading_revision + 1 WHERE id = OLD.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS readings_revision_trigger ON readings;
CREATE TRIGGER readings_revision_trigger AFTER INSERT OR UPDATE OR DELETE ON readings
  FOR EACH ROW EXECUTE FUNCTION bump_reading_revision();

CREATE TABLE IF NOT EXISTS reminder_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reading_count INTEGER NOT NULL CHECK (reading_count BETWEEN 0 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);
