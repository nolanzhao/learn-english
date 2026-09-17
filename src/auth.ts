import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, emailOTP } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./db/auth-schema";
import type { Env } from "./env";
import { sendMail, loginMail } from "./email";

export function enabledProviders(env: Env) {
  const p: string[] = [];
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) p.push("google");
  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) p.push("microsoft");
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) p.push("github");
  return p;
}

/* 登录邮件同时带"一键登录链接"和"6 位验证码":
   magic-link 插件生成链接, email-otp 插件生成验证码. 发链接时顺手向 OTP 插件要一枚验证码(不单独发信), 合并进同一封邮件. */
export function createAuth(env: Env) {
  const db = drizzle(env.DB, { schema });
  const social: Record<string, any> = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) social.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, prompt: "select_account" };
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) social.github = { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET };
  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) social.microsoft = { clientId: env.MICROSOFT_CLIENT_ID, clientSecret: env.MICROSOFT_CLIENT_SECRET, tenantId: "common", prompt: "select_account" };

  const capture = new Map<string, string>(); // email -> "__capture__" | otp
  let self: any;

  const auth = betterAuth({
    appName: env.APP_NAME,
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET || "dev-secret-change-me-dev-secret-change-me",
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: { enabled: false },
    socialProviders: social,
    user: { deleteUser: { enabled: true } },
    account: { accountLinking: { enabled: true, trustedProviders: ["google", "github", "microsoft", "email-otp", "magic-link"] } },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24, cookieCache: { enabled: true, maxAge: 60 * 5 } },
    rateLimit: { enabled: true, window: 60, max: 40 },
    advanced: { database: { generateId: () => crypto.randomUUID() } },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 60 * 15,
        async sendVerificationOTP({ email, otp }) {
          if (capture.get(email) === "__capture__") { capture.set(email, otp); return; } // 被 magic link 流程借用, 不单独发信
          const m = loginMail(env.APP_NAME, `${env.APP_URL}/login.html?email=${encodeURIComponent(email)}`, otp);
          await sendMail(env, email, m.subject, m.html, m.text);
        },
      }),
      magicLink({
        expiresIn: 60 * 15,
        async sendMagicLink({ email, url }) {
          let otp = "";
          capture.set(email, "__capture__");
          try { await self.api.sendVerificationOTP({ body: { email, type: "sign-in" } }); otp = capture.get(email) || ""; }
          catch (e) { console.error("otp generate failed", e); }
          finally { capture.delete(email); }
          if (otp === "__capture__") otp = "";
          const m = loginMail(env.APP_NAME, url, otp || "（请点上方链接登录）");
          await sendMail(env, email, m.subject, m.html, m.text);
        },
      }),
    ],
  });
  self = auth;
  return auth;
}
export type Auth = ReturnType<typeof createAuth>;
