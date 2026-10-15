import nodemailer from 'nodemailer';
import { buildOrderEmail } from './order-email.js';

function parseSender(fromStr = process.env.EMAIL_FROM || '') {
  const match = fromStr.match(/(?:["']?([^"']*)["']?\s*)?<([^>]+)>/);
  if (match) {
    return { name: match[1]?.trim() || 'BrightBuy Store', email: match[2]?.trim() };
  }
  return { name: 'BrightBuy Store', email: fromStr.trim() || process.env.BREVO_SMTP_USER || 'noreply@brightbuy.local' };
}

function getBrevoApiKey() {
  if (process.env.BREVO_API_KEY) return process.env.BREVO_API_KEY;
  if (process.env.BREVO_SMTP_KEY?.startsWith('xkeysib-')) return process.env.BREVO_SMTP_KEY;
  return null;
}

async function sendViaBrevoHttp({ to, subject, html, text, attachments }) {
  const apiKey = getBrevoApiKey();
  const sender = parseSender(process.env.EMAIL_FROM);
  const payload = {
    sender,
    to: [{ email: to }],
    subject,
    htmlContent: html,
    textContent: text,
  };
  if (attachments?.length) {
    payload.attachment = attachments.map(att => ({
      name: att.filename,
      content: Buffer.isBuffer(att.content) ? att.content.toString('base64') : String(att.content),
    }));
  }
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo HTTP API error (${response.status}): ${errorText}`);
  }
  return await response.json();
}

function createTransporter() {
  const port = Number(process.env.BREVO_SMTP_PORT || 465);
  const secure = port === 465;
  return nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
    port,
    secure,
    pool: false,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: {
      user: process.env.BREVO_SMTP_USER,
      pass: process.env.BREVO_SMTP_KEY,
    },
  });
}

export async function sendOrderInvoiceEmail({ customerEmail, customerName, order }) {
  const emailContent = buildOrderEmail({ customerName, order });
  if (getBrevoApiKey()) {
    try {
      await sendViaBrevoHttp({
        to: customerEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        attachments: emailContent.attachments,
      });
      console.log('[Email] Order confirmation sent via Brevo HTTP API.');
      return;
    } catch (error) {
      console.error('[Email Error] Brevo HTTP API failed:', error);
    }
  }

  if (!process.env.BREVO_SMTP_USER || !process.env.BREVO_SMTP_KEY) {
    console.warn('[Email] Brevo not configured. Skipping email.');
    return;
  }

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"BrightBuy Store" <${process.env.BREVO_SMTP_USER}>`,
      to: customerEmail,
      ...emailContent,
    });
    console.log('[Email] Order confirmation sent via SMTP.');
  } catch (error) {
    console.error('[Email Error] Failed to send email via SMTP:', error);
  }
}

export async function sendAccountEmail({ to, subject, html, text, attachments }) {
  if (getBrevoApiKey()) {
    await sendViaBrevoHttp({ to, subject, html, text, attachments });
    console.log('[Email] Account email sent via Brevo HTTP API.');
    return;
  }

  if (!process.env.BREVO_SMTP_USER || !process.env.BREVO_SMTP_KEY || !process.env.EMAIL_FROM) {
    throw new Error('Account email is not configured.');
  }
  const transporter = createTransporter();
  await transporter.sendMail({ from: process.env.EMAIL_FROM, to, subject, html, text, attachments });
  console.log('[Email] Account email sent via SMTP.');
}
