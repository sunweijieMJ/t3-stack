import type { Transporter } from 'nodemailer';
import nodemailer from 'nodemailer';
import { env } from '@/env';

// HTML 转义，防止用户输入注入 HTML 邮件模板
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error('[EMAIL] 生产环境必须配置 SMTP 变量: SMTP_USER, SMTP_PASS');
  }

  const host = env.SMTP_HOST;
  const port = env.SMTP_PORT;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

export async function sendEmailOtp(email: string, code: string): Promise<void> {
  if (env.NODE_ENV !== 'production') {
    console.log(`[EMAIL OTP] 邮箱: ${email} | 验证码: ${code}`);
    return;
  }

  await getTransporter().sendMail({
    from: `"验证码" <${env.SMTP_USER}>`,
    to: email,
    subject: '您的登录验证码',
    html: `
      <div style="max-width:400px;margin:0 auto;padding:32px;font-family:sans-serif;">
        <h2 style="color:#333;margin-bottom:16px;">登录验证码</h2>
        <p style="color:#666;margin-bottom:24px;">您的验证码为：</p>
        <div style="background:#f5f5f5;border-radius:8px;padding:16px;text-align:center;font-size:32px;letter-spacing:8px;font-weight:bold;color:#333;">
          ${esc(code)}
        </div>
        <p style="color:#999;margin-top:24px;font-size:13px;">验证码 10 分钟内有效，请勿泄露给他人。</p>
      </div>
    `,
  });
}
