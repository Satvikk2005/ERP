-- Projects get their own priority (none/low/medium/high) so they can be sorted
-- and filtered high-to-low or low-to-high, just like tasks.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority VARCHAR(10) NOT NULL DEFAULT 'none';
