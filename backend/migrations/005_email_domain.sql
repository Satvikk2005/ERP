-- Move seeded employee emails from the placeholder domain to the real one.
-- Idempotent: only rows still on @yourcompany.com are touched.

UPDATE employees
SET email = regexp_replace(email, '@yourcompany\.com$', '@accescoliving.com'),
    updated_at = now()
WHERE email LIKE '%@yourcompany.com';
