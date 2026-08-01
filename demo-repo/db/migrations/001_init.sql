CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  avatar_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE rooms (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES rooms(id),
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_messages_room_created ON messages (room_id, created_at DESC);
