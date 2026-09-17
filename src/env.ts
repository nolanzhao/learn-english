export interface Env {
  DB: D1Database;
  RATE: KVNamespace;
  ASSETS: Fetcher;
  APP_NAME: string;
  APP_URL: string;
  EMAIL_FROM: string;
  DEV_MAIL_LOG?: string;
  BETTER_AUTH_SECRET?: string;
  RESEND_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
}
