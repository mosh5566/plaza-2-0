-- PLAZA 2.0 — סכמת בסיס נתונים (SQLite)

CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT, phone TEXT,
  password_hash TEXT NOT NULL,
  display_name TEXT, avatar_url TEXT, cover_url TEXT,
  location TEXT, country TEXT DEFAULT 'IL', lang TEXT DEFAULT 'he',
  bio TEXT, profession TEXT, hobby TEXT,
  wa_dial TEXT, wa_num TEXT,
  biz_email TEXT, biz_phone TEXT, biz_web TEXT,
  is_admin INTEGER DEFAULT 0, is_verified INTEGER DEFAULT 0, is_banned INTEGER DEFAULT 0,
  prefs TEXT,
  last_seen INTEGER DEFAULT (strftime('%s','now')),
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS posts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL, -- text/image/video/audio/poll/product/job/location/file
  text TEXT, topic TEXT, lang TEXT, country TEXT,
  media_urls TEXT, video_url TEXT, sound_url TEXT, audio_url TEXT,
  link TEXT, product_data TEXT, job_data TEXT, poll_data TEXT, loc_data TEXT,
  expires_at INTEGER NOT NULL,
  auto_extend INTEGER DEFAULT 0, scheduled_at INTEGER,
  like_count INTEGER DEFAULT 0, comment_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_posts_feed ON posts(hidden, expires_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_topic ON posts(topic);

CREATE TABLE IF NOT EXISTS comments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  text TEXT, audio_url TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS likes(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  UNIQUE(post_id,user_id)
);

CREATE TABLE IF NOT EXISTS bookmarks(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  snapshot TEXT,
  UNIQUE(post_id,user_id)
);

CREATE TABLE IF NOT EXISTS rooms(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT UNIQUE NOT NULL, name TEXT NOT NULL, icon TEXT,
  approved INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS room_messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  text TEXT, audio_url TEXT, image_url TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS private_chats(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  a_id INTEGER NOT NULL, b_id INTEGER NOT NULL,
  status TEXT DEFAULT 'pending', -- pending/accepted/declined/blocked
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS private_messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  text TEXT, audio_url TEXT, image_url TEXT, seen INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS topic_requests(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_name TEXT NOT NULL, votes INTEGER DEFAULT 1,
  status TEXT DEFAULT 'open', -- open/sent_to_admin/approved/rejected
  created_by INTEGER, created_at INTEGER DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS topic_votes(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  UNIQUE(request_id,user_id)
);

CREATE TABLE IF NOT EXISTS reports(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER, target_type TEXT, target_id INTEGER,
  reason TEXT, handled INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS notifications(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL, type TEXT, payload TEXT,
  read INTEGER DEFAULT 0,
  expires_at INTEGER, created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);
