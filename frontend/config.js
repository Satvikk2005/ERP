// Set this to your backend's URL when frontend and backend are hosted on
// DIFFERENT domains (e.g. frontend on Vercel, backend on Render) — this is
// the free-tier deployment path. Leave it as '' (same-origin) only if
// Nginx is reverse-proxying both from one domain, as in the Docker/VPS setup.
window.WORKTRACK_API_BASE = window.WORKTRACK_API_BASE || 'https://YOUR-BACKEND.onrender.com';
