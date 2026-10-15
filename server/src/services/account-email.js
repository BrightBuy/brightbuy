import { logoBase64 } from './email-logo.js';
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function accountLink(purpose, token, appUrl = process.env.PUBLIC_APP_URL) {
  const resolvedUrl = appUrl || process.env.PUBLIC_APP_URL || 'http://localhost:5173';
  const base = new URL(resolvedUrl);
  if (base.username || base.password || !(base.protocol === 'https:' || (base.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(base.hostname)))) throw new Error('PUBLIC_APP_URL must use HTTPS (HTTP is allowed for localhost).');
  const url = new URL(purpose === 'verify' ? '/verify-email' : '/reset-password', base);
  // Fragments are not sent to web servers or in Referer headers.
  url.hash = new URLSearchParams({token}).toString();
  return url.href;
}
export function buildAccountEmail({purpose, name, link}) {
  const verify = purpose === 'verify';
  const title = verify ? 'Verify your email' : 'Reset your password';
  const message = verify ? 'Welcome to BrightBuy. Confirm your email address to start shopping.' : 'We received a request to reset your BrightBuy password.';
  const expiry = verify ? '24 hours' : '30 minutes';
  return {
    subject: title + ' — BrightBuy',
    text: title + '\n\nHello ' + name + ',\n' + message + '\n\n' + link + '\n\nThis link expires in ' + expiry + ' and can only be used once. If you did not request this, you can ignore this email.',
    html: `<!doctype html><html><body style="margin:0;background:#eae7df;font-family:Arial,sans-serif;color:#17231b"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="100%" style="max-width:600px;background:white" cellpadding="0" cellspacing="0"><tr><td style="padding:36px"><img src="cid:brightbuy-logo@brightbuy" width="190" alt="BrightBuy"><p style="color:#48735d;font-size:12px;letter-spacing:2px;margin-top:36px">YOUR BRIGHTBUY ACCOUNT</p><h1 style="font-size:30px">${title}</h1><p>Hello ${escape(name)},</p><p style="line-height:1.7">${message}</p><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#17231b" style="padding:16px 24px"><a href="${escape(link)}" style="color:white;text-decoration:none;font-weight:bold">${title} →</a></td></tr></table><p style="line-height:1.7">This link expires in ${expiry} and can only be used once.</p><p style="font-size:13px;color:#626b65;line-height:1.7">If you did not request this, you can ignore this email. Never share this link with anyone.</p><hr style="border:0;border-top:1px solid #eae7df"><p style="font-size:12px;color:#626b65">BrightBuy · Electronics &amp; toys</p></td></tr></table></td></tr></table></body></html>`,
    attachments: [{filename:'brightbuy-logo.png',content:Buffer.from(logoBase64,'base64'),cid:'brightbuy-logo@brightbuy',contentType:'image/png',contentDisposition:'inline'}],
  };
}
