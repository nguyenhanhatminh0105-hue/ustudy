-- Who has joined which study room, so "My rooms" survives across devices.
CREATE TABLE room_members (
  room_id   varchar(12) NOT NULL REFERENCES study_rooms (id) ON DELETE CASCADE,
  user_id   integer     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX room_members_user ON room_members (user_id);
