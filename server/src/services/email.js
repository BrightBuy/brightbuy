import nodemailer from 'nodemailer';
import { buildOrderEmail } from './order-email.js';

const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    requireTLS: true,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: {
        user: process.env.BREVO_SMTP_USER,
        pass: process.env.BREVO_SMTP_KEY,
    },
});

export async function sendOrderInvoiceEmail({ customerEmail, customerName, order }) {
    if (!process.env.BREVO_SMTP_USER || !process.env.BREVO_SMTP_KEY) {
        console.warn('[Email] Brevo SMTP not configured. Skipping email.');
        return;
    }
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM || `"BrightBuy Store" <${process.env.BREVO_SMTP_USER}>`,
            to: customerEmail,
            ...buildOrderEmail({ customerName, order }),
        });
        console.log('[Email] Order confirmation sent.');
    } catch (error) {
        console.error('[Email Error] Failed to send email:', error);
    }
}
export async function sendAccountEmail({to, ...message}) {
    if (!process.env.BREVO_SMTP_USER || !process.env.BREVO_SMTP_KEY || !process.env.EMAIL_FROM) throw new Error('Account email is not configured.');
    await transporter.sendMail({from: process.env.EMAIL_FROM, to, ...message});
}
