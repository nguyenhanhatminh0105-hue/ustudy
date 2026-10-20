-- UStudy schema, version 1.
-- XP and coins live on the user row for fast reads; every change to them is
-- also written to progress_events, which is the audit trail and the
-- idempotency guard (a reward for the same thing can only be granted once).

CREATE TABLE users (
  id             serial PRIMARY KEY,
  name           varchar(80)  NOT NULL,
  email          varchar(254) NOT NULL,
  password_hash  text         NOT NULL,
  role           text         NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  companion      text         NOT NULL DEFAULT 'turtle'  CHECK (companion IN ('turtle', 'panda')),
  companion_name varchar(24),
  xp             integer      NOT NULL DEFAULT 0 CHECK (xp >= 0),
  coins          integer      NOT NULL DEFAULT 0 CHECK (coins >= 0),
  created_at     timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

CREATE TABLE progress_events (
  id         serial PRIMARY KEY,
  user_id    integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       text    NOT NULL,
  ref        text    NOT NULL,
  xp         integer NOT NULL DEFAULT 0,
  coins      integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, ref)
);
CREATE INDEX progress_events_user_time ON progress_events (user_id, created_at DESC);

-- Assignments posted by an admin for a whole course; students add them to
-- their own list, which creates a personal copy linked by official_id.
CREATE TABLE official_assignments (
  id              serial PRIMARY KEY,
  course          varchar(40)  NOT NULL,
  title           varchar(160) NOT NULL,
  description     text         NOT NULL DEFAULT '',
  due_at          timestamptz  NOT NULL,
  priority        text         NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  estimated_hours integer      NOT NULL DEFAULT 1 CHECK (estimated_hours BETWEEN 1 AND 200),
  created_by      integer      REFERENCES users (id) ON DELETE SET NULL,
  created_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE assignments (
  id           serial PRIMARY KEY,
  user_id      integer      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  official_id  integer      REFERENCES official_assignments (id) ON DELETE SET NULL,
  course       varchar(40)  NOT NULL,
  title        varchar(160) NOT NULL,
  description  text         NOT NULL DEFAULT '',
  due_at       timestamptz  NOT NULL,
  priority     text         NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status       text         NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  total_hours  integer      NOT NULL DEFAULT 1 CHECK (total_hours BETWEEN 1 AND 200),
  hours_worked integer      NOT NULL DEFAULT 0 CHECK (hours_worked >= 0),
  completed_at timestamptz,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (user_id, official_id)
);
CREATE INDEX assignments_user_due ON assignments (user_id, due_at);

CREATE TABLE habits (
  id              serial PRIMARY KEY,
  user_id         integer     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name            varchar(60) NOT NULL,
  target_per_week integer     NOT NULL DEFAULT 7 CHECK (target_per_week BETWEEN 1 AND 7),
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz
);
CREATE INDEX habits_user ON habits (user_id);

CREATE TABLE habit_checkins (
  habit_id integer NOT NULL REFERENCES habits (id) ON DELETE CASCADE,
  day      date    NOT NULL,
  PRIMARY KEY (habit_id, day)
);

CREATE TABLE focus_sessions (
  id              serial PRIMARY KEY,
  user_id         integer     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  assignment_id   integer     REFERENCES assignments (id) ON DELETE SET NULL,
  planned_minutes integer     NOT NULL CHECK (planned_minutes BETWEEN 1 AND 180),
  minutes         integer     CHECK (minutes BETWEEN 0 AND 180),
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz
);
CREATE INDEX focus_sessions_user_time ON focus_sessions (user_id, started_at DESC);

CREATE TABLE gifts (
  id       serial PRIMARY KEY,
  user_id  integer     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  treat    text        NOT NULL,
  cost     integer     NOT NULL CHECK (cost > 0),
  given_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gifts_user_time ON gifts (user_id, given_at DESC);

CREATE TABLE study_rooms (
  id         varchar(12) PRIMARY KEY,
  name       varchar(60) NOT NULL,
  created_by integer     REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE room_messages (
  id         serial PRIMARY KEY,
  room_id    varchar(12)   NOT NULL REFERENCES study_rooms (id) ON DELETE CASCADE,
  user_id    integer       REFERENCES users (id) ON DELETE SET NULL,
  author     varchar(80)   NOT NULL,
  body       varchar(1000) NOT NULL,
  created_at timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX room_messages_room_time ON room_messages (room_id, created_at);

CREATE TABLE room_notes (
  room_id    varchar(12) PRIMARY KEY REFERENCES study_rooms (id) ON DELETE CASCADE,
  content    text        NOT NULL DEFAULT '' CHECK (length(content) <= 20000),
  updated_by integer     REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
