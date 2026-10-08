// Sends email through an HTTPS email API. Render's free plan blocks outgoing SMTP ports,
// so plain SMTP is not an option there; Brevo and Resend both take a JSON POST over 443.
//
// Emails are a courtesy, never a requirement: with no API key the site works exactly as
// before, and a provider that is down or slow never fails or delays a booking.

const PROVIDERS = {
  // Free plan: 300 emails a day. Sends from a single verified address (a Gmail works), no domain needed.
  brevo: {
    url: 'https://api.brevo.com/v3/smtp/email',
    headers: (key) => ({ 'api-key': key }),
    body: ({ from, fromName, to, subject, html, text, replyTo }) => ({
      sender: { email: from, name: fromName },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
      ...(replyTo ? { replyTo: { email: replyTo } } : {}),
    }),
  },
  // Needs a verified domain to email anyone but the account owner; a good fit once a client has one.
  resend: {
    url: 'https://api.resend.com/emails',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    body: ({ from, fromName, to, subject, html, text, replyTo }) => ({
      from: `${fromName} <${from}>`,
      to: [to],
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  },
}

const TIMEOUT_MS = 10_000

/**
 * `email` is config.email: { provider, apiKey, from, fromName, replyTo } or null when off.
 * Returns { enabled, send(message) }. send() resolves to true when the provider accepted the
 * message and false otherwise; it never throws.
 */
export function createMailer(email, { log = console.log, fetchImpl = fetch } = {}) {
  if (!email) return { enabled: false, send: async () => false }
  const provider = PROVIDERS[email.provider]
  return {
    enabled: true,
    async send({ to, subject, html, text, tag }) {
      try {
        const res = await fetchImpl(provider.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...provider.headers(email.apiKey) },
          body: JSON.stringify(provider.body({ ...email, to, subject, html, text })),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (res.ok) {
          log(`[email] sent ${tag ?? 'message'} via ${email.provider}`)
          return true
        }
        // The provider's error text says what is wrong (unverified sender, bad key) and holds no guest data.
        const detail = (await res.text().catch(() => '')).slice(0, 300)
        console.error(`[email] ${email.provider} refused ${tag ?? 'message'}: HTTP ${res.status} ${detail}`)
      } catch (err) {
        console.error(`[email] could not reach ${email.provider} for ${tag ?? 'message'}: ${err?.name === 'TimeoutError' ? 'timed out' : err?.message}`)
      }
      return false
    },
  }
}

export const EMAIL_PROVIDERS = Object.keys(PROVIDERS)
