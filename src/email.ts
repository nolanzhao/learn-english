import type { Env } from "./env";

/** 发登录邮件: 有 RESEND_API_KEY 走 Resend; 开发环境(DEV_MAIL_LOG=1)只打印到控制台. */
export async function sendMail(env: Env, to: string, subject: string, html: string, text: string) {
  if (!env.RESEND_API_KEY) {
    if (env.DEV_MAIL_LOG) { console.log(`[mail→${to}] ${subject}\n${text}`); return; }
    throw new Error("RESEND_API_KEY 未配置");
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html, text }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export function loginMail(app: string, url: string, otp: string) {
  const subject = `${otp} 是你的登录验证码 · ${app}`;
  const text = `点击链接一键登录 ${app}（15 分钟内有效）：\n${url}\n\n或在页面输入验证码：${otp}\n\n如果不是你本人操作，忽略此邮件即可。`;
  const html = `<div style="font:15px/1.6 -apple-system,BlinkMacSystemFont,'PingFang SC',Helvetica,Arial,sans-serif;color:#2a2a35;max-width:480px;margin:0 auto;padding:28px 8px">
<p style="font-size:18px;font-weight:600;margin:0 0 16px">登录 ${esc(app)}</p>
<p><a href="${esc(url)}" style="display:inline-block;background:#6b5bd6;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">一键登录</a></p>
<p style="color:#6b6b7a">链接 15 分钟内有效，只能用一次。</p>
<p>手机上打开的话，也可以回到页面输入验证码：</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:6px 0 18px">${esc(otp)}</p>
<p style="color:#9a9aa8;font-size:13px">如果不是你本人操作，忽略此邮件即可。</p></div>`;
  return { subject, text, html };
}
