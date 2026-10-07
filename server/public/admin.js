// Concierge dashboard: lists booking requests and lets staff change their status.
const rows = document.getElementById('rows')
const error = document.getElementById('error')
const STATUSES = ['pending', 'confirmed', 'cancelled']
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const fmt = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

// Session expired or signed out elsewhere: back to the sign-in page.
async function api(url, init) {
  const res = await fetch(url, init)
  if (res.status === 401) {
    location.replace('/admin/login')
    throw new Error('Signed out.')
  }
  return res
}

async function load() {
  const res = await api('/api/admin/bookings')
  if (!res.ok) {
    error.textContent = `Could not load bookings (${res.status}).`
    return
  }
  const bookings = await res.json()
  document.getElementById('count').textContent = `${bookings.filter((b) => b.status === 'pending').length} pending · ${bookings.length} total`
  rows.innerHTML = bookings.length
    ? bookings
        .map(
          (b) => `
      <tr class="${STATUSES.includes(b.status) ? b.status : ''}">
        <td class="meta"><span class="dot"></span>${esc(b.reference)}</td>
        <td>${esc(b.name)}<small>${esc(b.email)}</small></td>
        <td>${esc(b.vehicle ?? 'Advise me')}</td>
        <td>${esc(b.city)}</td>
        <td>${esc(fmt(b.pickup))} → ${esc(fmt(b.returnDate))}</td>
        <td><small>${esc(b.createdAt)} UTC</small></td>
        <td><select data-ref="${esc(b.reference)}" aria-label="Status of ${esc(b.reference)}">
          ${STATUSES.map((s) => `<option ${s === b.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select></td>
      </tr>`,
        )
        .join('')
    : '<tr><td colspan="7" class="empty">No requests yet. Book a drive on the site and refresh.</td></tr>'
}

rows.addEventListener('change', async (e) => {
  const ref = e.target.dataset.ref
  if (!ref) return
  error.textContent = ''
  const res = await api(`/api/admin/bookings/${encodeURIComponent(ref)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: e.target.value }),
  })
  if (!res.ok) error.textContent = (await res.json().catch(() => ({}))).error ?? `Update failed (${res.status}).`
  load()
})

document.getElementById('logout').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {})
  location.replace('/admin/login')
})

load().catch(() => {})
