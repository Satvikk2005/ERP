-- Web Push subscriptions. One person can have several (phone, laptop, …); each
-- browser/device gives a unique endpoint. Dead ones are pruned on send.
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    endpoint    TEXT NOT NULL UNIQUE,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subs_emp ON push_subscriptions(employee_id);

-- Guard against sending the same deadline reminder twice for one task.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline_notified_on DATE;
