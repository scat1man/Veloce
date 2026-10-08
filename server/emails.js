// The emails the site sends, as { subject, html, text }. Written like the site reads:
// one clear headline, a few calm lines, the booking details, nothing else.
//
// Every value that came from a guest (name, email) or from a booking row goes through esc()
// before it touches the HTML, so nothing typed into the form can become markup.

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const formatDate = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '') ? day.format(new Date(`${iso}T00:00:00Z`)) : String(iso ?? ''))
const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || 'there'
const carName = (b) => b.vehicle ?? 'Chosen with our concierge'

const SANS = `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Helvetica Neue', 'Segoe UI', Arial, sans-serif`
const DISPLAY = `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Helvetica Neue', 'Segoe UI', Arial, sans-serif`
const INK = '#0b0b0c'
const ASH = '#605e59'
const STONE = '#8d8b86'
const PAPER = '#f4f3f0'

/** Joins a site address and a path, or returns null when no site address is configured. */
const link = (siteUrl, path) => (siteUrl ? siteUrl.replace(/\/+$/, '') + path : null)

function detailRows(rows) {
  return rows
    .map(
      ([label, value]) => `
      <tr><td style="padding:0 0 18px 0;font-family:${SANS};">
        <div style="font-size:13px;line-height:18px;color:${STONE};">${esc(label)}</div>
        <div style="font-size:17px;line-height:24px;color:${INK};">${esc(value)}</div>
      </td></tr>`,
    )
    .join('')
}

/** The shared frame: wordmark, headline, intro lines, details, an optional link, a quiet footnote. */
function layout({ preheader, headline, lines, details, action, footnote }) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>${esc(headline)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER};">
<tr><td align="center" style="padding:48px 20px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border-radius:22px;">
    <tr><td style="padding:44px 40px 8px 40px;font-family:${DISPLAY};font-size:13px;letter-spacing:0.32em;color:${INK};">VELOCÉ</td></tr>
    <tr><td style="padding:28px 40px 0 40px;font-family:${DISPLAY};font-size:34px;line-height:40px;font-weight:600;letter-spacing:-0.02em;color:${INK};">${esc(headline)}</td></tr>
    ${lines.map((line) => `<tr><td style="padding:16px 40px 0 40px;font-family:${SANS};font-size:17px;line-height:26px;color:${ASH};">${esc(line)}</td></tr>`).join('')}
    <tr><td style="padding:36px 40px 18px 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${detailRows(details)}</table></td></tr>
    ${
      action
        ? `<tr><td style="padding:0 40px 8px 40px;">
      <a href="${esc(action.href)}" style="display:inline-block;padding:13px 26px;border-radius:999px;background:${INK};color:#ffffff;font-family:${SANS};font-size:15px;line-height:20px;text-decoration:none;">${esc(action.label)}</a>
    </td></tr>`
        : ''
    }
    <tr><td style="padding:36px 40px 44px 40px;font-family:${SANS};font-size:13px;line-height:20px;color:${STONE};">${esc(footnote)}</td></tr>
  </table>
</td></tr></table>
</body></html>`

  const text = [
    'VELOCÉ',
    '',
    headline,
    '',
    ...lines.flatMap((line) => [line, '']),
    ...details.map(([label, value]) => `${label}: ${value}`),
    ...(action ? ['', `${action.label}: ${action.href}`] : []),
    '',
    footnote,
    '',
  ].join('\n')

  return { html, text }
}

const guestDetails = (b) => [
  ['Car', carName(b)],
  ['Pick-up', `${formatDate(b.pickup)}, ${b.city}`],
  ['Return', formatDate(b.returnDate)],
  ['Reference', b.reference],
]

const NOT_YOU = 'You are receiving this because a drive was requested with this address on VELOCÉ. If that was not you, you can ignore this email.'

/** To the guest, the moment their request is saved. */
export function bookingReceived(b, { siteUrl } = {}) {
  const manage = link(siteUrl, '/#manage')
  return {
    subject: `We have your request ${b.reference}`,
    ...layout({
      preheader: `${carName(b)}, ${formatDate(b.pickup)}. Our concierge will confirm shortly.`,
      headline: 'Request received.',
      lines: [
        `Thank you, ${firstName(b.name)}. Our concierge is preparing your drive and will confirm by email shortly.`,
        'Keep your reference handy. With it and this email address you can check the status at any time.',
      ],
      details: guestDetails(b),
      action: manage && { label: 'Manage booking', href: manage },
      footnote: NOT_YOU,
    }),
  }
}

/** To the guest, when staff confirm the booking. */
export function bookingConfirmed(b, { siteUrl } = {}) {
  const manage = link(siteUrl, '/#manage')
  return {
    subject: `Confirmed: your drive on ${formatDate(b.pickup)}`,
    ...layout({
      preheader: `${carName(b)} is yours from ${formatDate(b.pickup)}.`,
      headline: 'You are confirmed.',
      lines: [
        b.vehicle
          ? `${firstName(b.name)}, the ${b.vehicle} will be ready for you in ${b.city} on ${formatDate(b.pickup)}.`
          : `${firstName(b.name)}, your drive in ${b.city} on ${formatDate(b.pickup)} is confirmed. Your concierge will be in touch about the car.`,
        'Bring your driving licence on the day. We will be in touch beforehand with the hand-over details.',
      ],
      details: guestDetails(b),
      action: manage && { label: 'View booking', href: manage },
      footnote: NOT_YOU,
    }),
  }
}

/** To the guest, when staff decline or cancel the booking. */
export function bookingCancelled(b, { siteUrl, canReply } = {}) {
  const home = link(siteUrl, '/')
  return {
    subject: `About your request ${b.reference}`,
    ...layout({
      preheader: 'We could not confirm these dates.',
      headline: 'We could not confirm this one.',
      lines: [
        `We are sorry, ${firstName(b.name)}. Your request for ${formatDate(b.pickup)} could not be confirmed.`,
        canReply
          ? 'Reply to this email and our concierge will suggest other dates or a similar car.'
          : 'Other dates or a similar car may well be free. We would be glad to see you again.',
      ],
      details: guestDetails(b),
      action: home && { label: 'Choose other dates', href: home },
      footnote: NOT_YOU,
    }),
  }
}

/** To the guest, when their deposit is paid. `amount` is already formatted, e.g. "500.00 USD". */
export function depositReceived(b, { siteUrl, amount } = {}) {
  const manage = link(siteUrl, '/#manage')
  return {
    subject: `Deposit received for ${b.reference}`,
    ...layout({
      preheader: `${amount} received. Thank you.`,
      headline: 'Deposit received.',
      lines: [
        `Thank you, ${firstName(b.name)}. We have received your deposit of ${amount} for ${formatDate(b.pickup)}.`,
        'Keep this email as your receipt. Stripe may also send you its own.',
      ],
      details: [['Amount', amount], ...guestDetails(b), ...(b.payment?.paymentId ? [['Payment', b.payment.paymentId]] : [])],
      action: manage && { label: 'View booking', href: manage },
      footnote: NOT_YOU,
    }),
  }
}

/** To the guest, when their deposit is refunded in full. */
export function depositRefunded(b, { siteUrl, amount } = {}) {
  const manage = link(siteUrl, '/#manage')
  return {
    subject: `Deposit refunded for ${b.reference}`,
    ...layout({
      preheader: `${amount} is on its way back to you.`,
      headline: 'Your deposit is on its way back.',
      lines: [
        `${firstName(b.name)}, we have refunded your deposit of ${amount}.`,
        'Most banks show it within 5 to 10 business days, on the card you paid with.',
      ],
      details: [['Amount', amount], ...guestDetails(b)],
      action: manage && { label: 'View booking', href: manage },
      footnote: NOT_YOU,
    }),
  }
}

/** To the owner, for every new request. */
export function ownerNewBooking(b, { siteUrl } = {}) {
  const admin = link(siteUrl, '/admin')
  return {
    subject: `New request ${b.reference} from ${b.name}`,
    ...layout({
      preheader: `${carName(b)}, ${formatDate(b.pickup)} to ${formatDate(b.returnDate)}, ${b.city}.`,
      headline: 'A new request.',
      lines: [`${b.name} would like to drive from ${formatDate(b.pickup)} to ${formatDate(b.returnDate)}. It is waiting for you in the console.`],
      details: [
        ['Guest', b.name],
        ['Email', b.email],
        ['Car', carName(b)],
        ['Pick-up', `${formatDate(b.pickup)}, ${b.city}`],
        ['Return', formatDate(b.returnDate)],
        ['Reference', b.reference],
      ],
      action: admin && { label: 'Open console', href: admin },
      footnote: 'Sent to the address in OWNER_EMAIL on your host. Remove it there to stop these.',
    }),
  }
}

export const _test = { esc, formatDate }
