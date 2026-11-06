-- Phone reminders (Web Push). One row per browser subscription; not tied to an account so it works before sign-up.
-- sched = JSON { tz: minutes east of UTC, d: { "0".."6": [[minuteOfDay, kind, title, body], ...] } } built by the app
-- state = JSON { trained: 'YYYY-MM-DD', quests: 'YYYY-MM-DD' } so the server can skip a reminder that is already done
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  sched TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT '{}',
  last_run INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  fails INTEGER NOT NULL DEFAULT 0
);
