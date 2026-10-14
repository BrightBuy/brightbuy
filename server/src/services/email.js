import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
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
        const itemsRows = (order.items || [])
            .map(
                (item) => `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px 0;"><strong>${item.productName || item.name}</strong> (${item.variantName || ''})</td>
          <td style="padding: 10px 0; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px 0; text-align: right;">$${Number(item.unitPrice || item.price).toFixed(2)}</td>
          <td style="padding: 10px 0; text-align: right;">$${(item.quantity * Number(item.unitPrice || item.price)).toFixed(2)}</td>
        </tr>`
            )
            .join('');

        await transporter.sendMail({
            from: process.env.EMAIL_FROM || `"BrightBuy Store" <${process.env.BREVO_SMTP_USER}>`,
            to: customerEmail,
            subject: `Order #${order.id} Confirmed - BrightBuy Receipt`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #2563eb;">BrightBuy Order Receipt</h2>
          <p>Thank you for your order, <strong>${customerName || 'Customer'}</strong>!</p>
          <p><strong>Order ID:</strong> #${order.id} | <strong>Status:</strong> Confirmed</p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
            <thead>
              <tr style="border-bottom: 2px solid #374151; text-align: left;">
                <th>Item</th><th style="text-align: center;">Qty</th><th style="text-align: right;">Price</th><th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>${itemsRows}</tbody>
          </table>
          <h3 style="text-align: right; color: #2563eb; margin-top: 20px;">Total: $${Number(order.total).toFixed(2)}</h3>
        </div>`,
        });
        console.log(`[Email] Invoice sent to ${customerEmail}`);
    } catch (error) {
        console.error('[Email Error] Failed to send email:', error);
    }
}
