import { logoBase64 } from './email-logo.js';
import { parseMoney, formatMoneyUnits } from '../utils/money.js';

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const money = value => '$' + formatMoneyUnits(parseMoney(String(value), { max: null }));
const logoCid = 'brightbuy-logo@brightbuy';

export function buildOrderEmail({ customerName, order, appUrl = process.env.PUBLIC_APP_URL }) {
  if (!Number.isSafeInteger(order.id) || order.id < 1 || order.currency !== 'USD') {
    throw new TypeError('A valid USD order is required for an order email.');
  }
  const backordered = order.status === 'backordered';
  const status = backordered ? 'Backordered' : 'Confirmed';
  const heading = backordered ? 'We have received your order.' : 'Good finds. Order confirmed.';
  const intro = backordered
    ? 'We have received your order. One or more items are awaiting stock, so the whole order will be prepared once all items are available. No stock has been allocated yet.'
    : 'Thank you for shopping with BrightBuy. We have received your order and allocated your items.';
  // A backorder is recorded, but no inventory is reserved.

  const pickup = order.fulfillment === 'pickup';
  const snapshot = order.delivery?.destinationSnapshot || order.addressSnapshot || {};
  const destination = (pickup
    ? [snapshot.storeName, snapshot.addressLine, snapshot.city, snapshot.country]
    : [snapshot.recipient, snapshot.line1, snapshot.line2, snapshot.line3,
      [snapshot.city, snapshot.postalCode].filter(Boolean).join(' '), snapshot.country]
  ).filter(Boolean);
  const timing = pickup
    ? 'Wait until your order is marked Ready for pickup before visiting the store.'
    : order.delivery?.estimatedDate
      ? `Estimated delivery: ${new Intl.DateTimeFormat('en-US', {month:'long', day:'numeric', year:'numeric', timeZone:'UTC'}).format(new Date(order.delivery.estimatedDate + 'T12:00:00Z'))}. This is an estimate, not a guaranteed arrival date.`
      : 'Check your order details for delivery updates.';
  const card = order.payment?.method === 'card';
  const payment = card ? 'Simulated card · Paid' : 'Cash on delivery / collection · Pending';
  const paymentNote = card
    ? 'This is a demonstration payment. No real card was charged.'
    : 'Payment is due on delivery or collection. This confirmation is not proof of payment.';
  const lines = (order.items || []).map(item => {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new TypeError('Invalid item quantity.');
    const unitPrice = item.unitPrice ?? item.price;
    return { name: item.productName || item.name, variant: item.variantName || '', quantity: item.quantity,
      price: money(unitPrice), total: '$' + formatMoneyUnits(parseMoney(String(unitPrice), {max:null}) * BigInt(item.quantity)) };
  });
  let orderUrl = '';
  if (appUrl) {
    try { const url = new URL(appUrl); if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) orderUrl = new URL(`/account/orders/${order.id}`, url).href; } catch { /* Omit invalid configured links. */ }
  }
  const total = money(order.total);
  const subject = `BrightBuy | Order #${order.id} ${backordered ? 'received — backordered' : 'confirmed'}`;
  const preheader = `Order #${order.id} · ${status} · ${total} USD. ${pickup ? 'Store pickup' : 'Standard delivery'}.`;
  const rows = lines.map(line => `<tr><td style="padding:20px 0;border-bottom:1px solid #e3e6e1;vertical-align:top;word-break:break-word"><strong style="color:#17231b;font-size:15px">${escape(line.name)}</strong>${line.variant ? `<br><span style="font-size:13px;color:#626862">${escape(line.variant)}</span>` : ''}<br><span style="font-size:12px;color:#626862">Qty ${line.quantity} &nbsp;·&nbsp; ${line.price} each</span></td><td align="right" width="104" style="padding:20px 0 20px 12px;border-bottom:1px solid #e3e6e1;vertical-align:top;white-space:nowrap;color:#17231b;font-size:15px">${line.total}</td></tr>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(subject)}</title><style>@media only screen and (max-width:480px){.pad{padding-left:22px!important;padding-right:22px!important}.headline{font-size:28px!important}.outer{padding:12px 0!important}}</style></head>
<body style="margin:0;padding:0;background:#f4f3ef;color:#17231b;font-family:Manrope,'DM Sans',Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escape(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f4f3ef"><tr><td align="center" class="outer" style="padding:32px 12px">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #e0e3dd">
<tr><td class="pad" style="padding:30px 36px;background:#ffffff"><img src="cid:${logoCid}" width="200" height="37" alt="BrightBuy" style="display:block;border:0;width:200px;height:37px;max-width:100%;color:#17231b;font-size:24px;font-weight:bold"></td></tr>
<tr><td class="pad" bgcolor="#17231b" style="padding:32px 36px;background:#17231b;color:#ffffff"><p style="margin:0 0 16px;font-size:11px;letter-spacing:2px;color:#c5d6c9">ORDER CONFIRMATION &nbsp;/&nbsp; #${order.id}</p><h1 class="headline" style="margin:0;font-size:34px;line-height:1.22;font-weight:700;color:#ffffff">${heading}</h1><p style="margin:20px 0 0;color:#d5e0d8;font-size:13px">${status} &nbsp;·&nbsp; ${pickup ? 'Store pickup' : 'Standard delivery'}</p></td></tr>
<tr><td class="pad" style="padding:30px 36px 10px"><p style="margin:0 0 12px;font-size:16px">Hi ${escape(customerName || 'there')},</p><p style="margin:0;font-size:14px;line-height:1.8;color:#505a52">${intro}</p></td></tr>
<tr><td class="pad" style="padding:20px 36px"><h2 style="margin:0 0 6px;font-size:18px">Your items</h2><table aria-label="Order items" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse"><thead><tr><th scope="col" align="left" style="padding:10px 0;font-size:11px;letter-spacing:1px;color:#626862;border-bottom:1px solid #e3e6e1">ITEM</th><th scope="col" align="right" style="padding:10px 0;font-size:11px;letter-spacing:1px;color:#626862;border-bottom:1px solid #e3e6e1">AMOUNT</th></tr></thead><tbody>${rows}</tbody></table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;background:#f4f3ef"><tr><td style="padding:20px;font-size:16px;font-weight:bold">Order total</td><td align="right" style="padding:20px;font-size:22px;font-weight:bold;white-space:nowrap">${total}<br><span style="font-size:10px;font-weight:normal;letter-spacing:1px">USD</span></td></tr></table></td></tr>
<tr><td class="pad" style="padding:10px 36px 22px"><h2 style="margin:0 0 10px;font-size:17px">${pickup ? 'Pickup location' : 'Delivery address'}</h2><p style="margin:0 0 12px;font-size:14px;line-height:1.8;color:#505a52">${destination.length ? destination.map(escape).join('<br>') : 'See your order details for the selected destination.'}</p><p style="margin:0;font-size:13px;line-height:1.7;color:#48735d">${escape(timing)}</p></td></tr>
<tr><td class="pad" style="padding:0 36px 28px"><h2 style="margin:0 0 10px;font-size:17px">Payment</h2><p style="margin:0 0 8px;font-size:14px">${payment}</p><p style="margin:0;font-size:12px;line-height:1.7;color:#626862">${paymentNote}</p></td></tr>
${orderUrl ? `<tr><td class="pad" style="padding:0 36px 28px"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#17231b" style="background:#17231b;padding:15px 24px"><a href="${escape(orderUrl)}" style="color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;display:inline-block">View your order &rarr;</a></td></tr></table><p style="font-size:11px;color:#626862;line-height:1.7">Sign in with the account used to place this order.<br>If the button does not work: <a href="${escape(orderUrl)}" style="color:#48735d;word-break:break-all">${escape(orderUrl)}</a></p></td></tr>` : '<tr><td class="pad" style="padding:0 36px 28px;font-size:13px;color:#626862">Sign in to BrightBuy and open My orders to follow your order.</td></tr>'}
<tr><td class="pad" style="padding:24px 36px;background:#eae7df;border-top:1px solid #dddcd5"><p style="margin:0 0 7px;font-size:15px;font-weight:bold">Good finds. Brighter days.</p><p style="margin:0;font-size:11px;line-height:1.8;color:#626862">BrightBuy · Electronics &amp; toys<br>This order email was sent because you placed an order with BrightBuy.<br>Keep order #${order.id} for your records.</p></td></tr>
</table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
  const text = [`BrightBuy — Order #${order.id}`,status,`Hi ${customerName || 'there'},`,intro,'',
    ...lines.map(l=>`${l.name}${l.variant ? ' / '+l.variant : ''}: ${l.quantity} × ${l.price} = ${l.total}`),
    `Order total: ${total} USD`,'',pickup?'Pickup location':'Delivery address',...destination,timing,'',payment,paymentNote,'',
    orderUrl ? `View your order: ${orderUrl}` : 'Sign in to BrightBuy and open My orders.', 'Good finds. Brighter days.'].join('\n');
  return {subject,html,text,attachments:[{filename:'brightbuy-logo.png',content:Buffer.from(logoBase64,'base64'),contentType:'image/png',cid:logoCid,contentDisposition:'inline'}]};
}
