import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, emailOTP } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1";
export const auth = betterAuth({
  database: drizzleAdapter(drizzle({} as any), { provider: "sqlite" }),
  emailAndPassword: { enabled: false },
  socialProviders: { google: { clientId: "x", clientSecret: "x" }, github: { clientId: "x", clientSecret: "x" }, microsoft: { clientId: "x", clientSecret: "x" } },
  user: { deleteUser: { enabled: true } },
  plugins: [emailOTP({ async sendVerificationOTP() {} }), magicLink({ async sendMagicLink() {} })],
});
