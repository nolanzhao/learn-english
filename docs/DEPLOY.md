# Deploying with accounts and cloud sync (optional)

The site works as a pure static app (guest mode). The optional Cloudflare Worker adds email/OAuth login and cross-device progress sync.

## One-time setup
```bash
npm install
npx wrangler login
npx wrangler d1 create learn-english        # put database_id into wrangler.jsonc
npx wrangler kv namespace create RATE       # put id into wrangler.jsonc
openssl rand -base64 32 | npx wrangler secret put BETTER_AUTH_SECRET
npm run content && npm run db:migrate:remote && npm run deploy
```
Set `APP_URL` in `wrangler.jsonc` to your site URL and deploy again.

## Enabling login
Login UI appears automatically once at least one method is configured:
- Email (magic link + 6-digit code): `npx wrangler secret put RESEND_API_KEY`, set `EMAIL_FROM` to an address on a domain verified in Resend.
- Google / Microsoft / GitHub: create an OAuth app with callback `https://<your-domain>/api/auth/callback/<google|microsoft|github>` and set `<PROVIDER>_CLIENT_ID` / `<PROVIDER>_CLIENT_SECRET` secrets.

## CI
`.github/workflows/deploy.yml` deploys on push to `main` when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets are set.

## Local development of the backend
```bash
cp .dev.vars.example .dev.vars   # DEV_MAIL_LOG=1 prints login emails to the terminal
npm run db:migrate:local && npm run dev
```
