## Purpose
Help AI coding assistants become productive quickly in this Express + Postgres backend by summarizing the project shape, conventions, important files, and common patterns.

## Big picture
- This is a Node.js Express backend (CommonJS) serving APIs and periodic jobs. Entry point: `app.js`.
- Postgres (node `pg` Pool) is the primary datastore; most DB access lives in `services/` and uses `pool.connect()` with explicit transactions (BEGIN/COMMIT/ROLLBACK) and `client.release()` in `finally`.
- Directory responsibilities:
  - `routes/` — route wiring (e.g. `authRoutes`, `adminRoutes`, `userRoutes`) mounted in `app.js` as `/api`, `/admin`, `/user`.
  - `controllers/` — HTTP-level validation + calls into services; they call `next(error)` to delegate to `utils/errorHandler.js` for centralized errors.
  - `services/` — business logic, DB queries, transactions. Example: `services/authService.js` performs registration/login, stores refresh tokens in `refresh_tokens` and OTPs in `otp_verifications`.
  - `config/` — external integrations and helpers (e.g. `db.js`, `jwt.js`, `passport.js`, `email.js`).
  - `templates/` — HTML email templates (e.g. `otpEmailTemplate.html`) loaded by `config/email.js`.

## Startup & common commands
- Development: `npm run dev` (uses `nodemon app.js`).
- Production / quick run: `npm start` (runs `node app.js`).
- There is a helper `generate-jwt-secret.js` to print a secure `JWT_SECRET` for `.env`.

## Important environment variables (discoverable in code)
- DB connection: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (used by `config/db.js`).
- Auth & tokens: `JWT_SECRET` (used by `config/jwt.js`), `OTP_EXPIRY` (seconds).
- Email: `EMAIL_USER`, `EMAIL_PASS` (used by `config/email.js` for Nodemailer).
- Frontend / OAuth: `FE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`.

## Key patterns & examples (copyable guidance)
- Controllers validate input and call services. Example: `controllers/authController.js` validates `email`/`password`, then `await authService.login(...)`; errors are forwarded via `next(error)`.
- Services use `const client = await pool.connect()` and wrap multi-statement work in `try { await client.query('BEGIN'); ... await client.query('COMMIT') } catch { await client.query('ROLLBACK') } finally { client.release(); }` — preserve this pattern when adding DB changes.
- Queries use parameterized SQL (`$1, $2, ...`) to avoid injection. Follow existing naming for columns/tables (e.g. `users`, `refresh_tokens`, `otp_verifications`).
- Tokens: short-lived JWTs created with `config/jwt.js::generateToken(user)` and refresh tokens stored as random strings from `generateFreshToken()`.
- OAuth flow: `config/passport.js` uses Google Strategy; `controllers/authController.js::googleCallback` sets secure cookies in production and returns tokens in dev via query params — keep environment-aware behavior.

## Cron & background jobs
- Cron schedules are defined in `app.js`. Example: daily cleanup and a 5-minute task that calls `services/promotionServices.expirePromotions()`.
- Note: `app.js` requires `./scripts/cleanupRefreshTokens` but the repo root contains `cleanupRefreshTokens.js` — validate the path before editing cron jobs.

## Debugging / quick checks
- Use console logs and replicate pattern used in controllers/services (e.g. `console.error('context', err && err.stack ? err.stack : err)`).
- To run a one-off helper: `node generate-jwt-secret.js` to get a `JWT_SECRET` for `.env`.

## Conventions and gotchas specific to this repo
- Error handling: Controllers rarely send raw stack traces; they pass errors to `utils/errorHandler.js` — follow this rather than returning errors directly.
- Transactions: Always `ROLLBACK` on error and `client.release()` in `finally`.
- Environment-aware behavior: production cookie settings vs development token-in-query behavior are intentionally different — match the pattern when adding OAuth/callback changes.
- Email templates: `config/email.js` reads `templates/otpEmailTemplate.html` and replaces `{{OTP}}` — when editing templates preserve the placeholder.
- Database naming & roles: existing code uses `role` values like `customer` and `admin`, and `status` like `active`/`banned` — follow these strings when adding logic.

## Where to look for examples
- Auth flows and DB patterns: `controllers/authController.js`, `services/authService.js`.
- JWT & refresh token handling: `config/jwt.js`, `services/authService.js`.
- Email OTP sending: `config/email.js`, `templates/otpEmailTemplate.html`, `services/authService.js::sendOtp()`.
- Cron tasks and scheduled jobs: `app.js` and `services/promotionServices.js`.

If any section above is unclear or you'd like the instructions to emphasize a different area (tests, migrations, or CI), tell me which part and I will iterate.
