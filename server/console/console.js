// Velocé Concierge: the staff console. Plain JavaScript, no build step.
// Every piece of guest data goes through esc() before it reaches innerHTML.

const $ = (id) => document.getElementById(id)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const DAY = 864e5
const STATUSES = ['pending', 'confirmed', 'cancelled']
const VIEWS = { overview: 'Overview', bookings: 'Bookings', fleet: 'Fleet', activity: 'Activity' }

const state = {
  bookings: [],
  activity: [],
  vehicles: {},
  view: 'overview',
  filter: 'all',
  query: '',
  sort: 'created',
  open: null, // reference shown in the drawer
  loadedAt: null,
  expiresAt: null,
}

// ---------- Dates ----------
const today = () => new Date().toISOString().slice(0, 10)
const dayNum = (iso) => Math.floor(Date.parse(iso + 'T00:00:00Z') / DAY)
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10)
const fmtDay = (iso, opts = {}) => new Date(iso + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC', ...opts })
const fmtRange = (b) => `${fmtDay(b.pickup)} – ${fmtDay(b.returnDate)}`
const nights = (b) => dayNum(b.returnDate) - dayNum(b.pickup)
const received = (utc) => new Date(utc.replace(' ', 'T') + 'Z')
function ago(date) {
  const s = Math.round((Date.now() - date.getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  const d = Math.floor(s / 86400)
  return d === 1 ? 'yesterday' : `${d} days ago`
}
function until(iso) {
  const d = dayNum(iso) - dayNum(today())
  return d === 0 ? 'today' : d === 1 ? 'tomorrow' : d < 0 ? `${-d} days ago` : `in ${d} days`
}

// ---------- Server ----------
async function api(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
  if (res.status === 401) {
    location.replace('/admin/login')
    throw new Error('Signed out.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`)
  return data
}

async function load({ quiet = false } = {}) {
  try {
    state.bookings = await api('/api/admin/bookings')
    if (state.view === 'activity') state.activity = await api('/api/admin/activity')
    state.loadedAt = new Date()
    render()
  } catch (err) {
    if (!quiet) toast(err.message, true)
  }
}

async function update(reference, patch, message) {
  try {
    const updated = await api(`/api/admin/bookings/${encodeURIComponent(reference)}`, { method: 'PATCH', body: JSON.stringify(patch) })
    state.bookings = state.bookings.map((b) => (b.reference === reference ? updated : b))
    render()
    loadHistory(reference)
    if (message) toast(message)
    return true
  } catch (err) {
    toast(err.message, true)
    return false
  }
}

// ---------- Toasts ----------
function toast(text, error = false) {
  const el = document.createElement('div')
  el.className = 'toast' + (error ? ' error' : '')
  el.textContent = text
  $('toasts').append(el)
  setTimeout(() => el.remove(), 3200)
}

// ---------- Routing: #overview, #bookings, #bookings?status=pending, #bookings/VLC-XXXX, #fleet ----------
function route() {
  const [path, query] = location.hash.slice(1).split('?')
  const [view, ref] = path.split('/')
  state.view = VIEWS[view] ? view : 'overview'
  const status = new URLSearchParams(query ?? '').get('status')
  if (status && (status === 'all' || STATUSES.includes(status))) state.filter = status
  for (const [id] of Object.entries(VIEWS)) $(`view-${id}`).hidden = id !== state.view
  document.querySelectorAll('nav a').forEach((a) => (a.dataset.view === state.view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')))
  $('title').textContent = VIEWS[state.view]
  document.title = `${VIEWS[state.view]} · Velocé Concierge`
  if (ref) openDrawer(decodeURIComponent(ref))
  else closeDrawer(false)
  render()
  if (state.view === 'activity') loadActivity()
}

// ---------- Rendering ----------
const statusPill = (s) => `<span class="status ${STATUSES.includes(s) ? s : ''}">${esc(s)}</span>`
const carName = (b) => b.vehicle ?? 'No preference'

function render() {
  const pending = state.bookings.filter((b) => b.status === 'pending').length
  const badge = $('pending-badge')
  badge.hidden = !pending
  badge.textContent = pending
  $('updated').textContent = state.loadedAt ? `${state.bookings.length} booking${state.bookings.length === 1 ? '' : 's'} · updated ${state.loadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Loading…'
  if (state.view === 'overview') renderOverview()
  if (state.view === 'bookings') renderBookings()
  if (state.view === 'fleet') renderFleet()
  if (state.view === 'activity') renderActivity()
  if (state.open) fillDrawer()
}

function renderOverview() {
  const t = today()
  const live = state.bookings.filter((b) => b.status !== 'cancelled')
  const pending = state.bookings.filter((b) => b.status === 'pending')
  const confirmedAhead = state.bookings.filter((b) => b.status === 'confirmed' && b.returnDate >= t)
  const onRoad = confirmedAhead.filter((b) => b.pickup <= t && b.returnDate > t)
  const week = confirmedAhead.filter((b) => b.pickup >= t && b.pickup <= addDays(t, 7))
  const oldest = pending.map((b) => received(b.createdAt)).sort((a, b) => a - b)[0]
  const stat = (label, value, foot, cls = '') => `<div class="stat ${cls}"><span class="label">${label}</span><span class="value">${value}</span><span class="foot">${foot}</span></div>`
  $('stats').innerHTML = [
    stat('Awaiting a reply', pending.length, oldest ? `Oldest ${ago(oldest)}` : 'All answered', pending.length ? 'attention' : ''),
    stat('Confirmed ahead', confirmedAhead.length, `${confirmedAhead.reduce((n, b) => n + nights(b), 0)} rental days`),
    stat('On the road now', onRoad.length, onRoad.length ? onRoad.map((b) => esc(carName(b))).join(', ') : 'Every car is home'),
    stat('Pick-ups this week', week.length, 'Next 7 days'),
  ].join('')

  const item = (b, right) => `<li><div class="who" data-ref="${esc(b.reference)}"><strong>${esc(b.name)}</strong><span>${esc(carName(b))} · ${esc(b.city)} · ${esc(fmtRange(b))}</span></div>${right}</li>`
  const awaiting = [...pending].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, 6)
  $('awaiting').innerHTML = awaiting.length
    ? awaiting
        .map((b) =>
          item(
            b,
            `<span class="when">${esc(ago(received(b.createdAt)))}</span><button type="button" class="btn sm" data-act="confirmed" data-ref="${esc(b.reference)}">Confirm</button>`,
          ),
        )
        .join('')
    : '<li class="empty">Nothing waiting. Nice.</li>'

  const next = confirmedAhead.filter((b) => b.pickup >= t).sort((a, b) => a.pickup.localeCompare(b.pickup)).slice(0, 6)
  $('upcoming').innerHTML = next.length ? next.map((b) => item(b, `<span class="when">${esc(until(b.pickup))}</span>`)).join('') : '<li class="empty">No confirmed pick-ups yet.</li>'

  const cars = Object.values(state.vehicles)
  const counts = cars.map((name) => ({
    name,
    c: live.filter((b) => b.vehicle === name && b.status === 'confirmed').length,
    p: live.filter((b) => b.vehicle === name && b.status === 'pending').length,
  }))
  const none = live.filter((b) => !b.vehicle).length
  if (none) counts.push({ name: 'No preference', c: live.filter((b) => !b.vehicle && b.status === 'confirmed').length, p: live.filter((b) => !b.vehicle && b.status === 'pending').length })
  const max = Math.max(1, ...counts.map((x) => x.c + x.p))
  $('by-car').innerHTML = counts
    .map(
      (x) =>
        `<div class="bar"><span>${esc(x.name)}</span><span class="track" title="${x.c} confirmed, ${x.p} pending"><i class="c" style="width:${(x.c / max) * 100}%"></i><i class="p" style="width:${(x.p / max) * 100}%"></i></span><span class="n">${x.c + x.p}</span></div>`,
    )
    .join('')
}

function matches(b, q) {
  if (!q) return true
  return [b.reference, b.name, b.email, carName(b), b.city].some((v) => String(v).toLowerCase().includes(q))
}
function highlight(text, q) {
  const safe = esc(text)
  if (!q) return safe
  const i = String(text).toLowerCase().indexOf(q)
  if (i < 0) return safe
  return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length))
}

function renderBookings() {
  const q = state.query.trim().toLowerCase()
  const counts = { all: state.bookings.length }
  for (const s of STATUSES) counts[s] = state.bookings.filter((b) => b.status === s).length
  $('status-tabs').innerHTML = ['all', ...STATUSES]
    .map((s) => `<button type="button" role="tab" data-filter="${s}" aria-selected="${state.filter === s}">${s[0].toUpperCase() + s.slice(1)}<span class="n">${counts[s]}</span></button>`)
    .join('')
  let list = state.bookings.filter((b) => (state.filter === 'all' || b.status === state.filter) && matches(b, q))
  list = [...list].sort((a, b) => (state.sort === 'pickup' ? a.pickup.localeCompare(b.pickup) : b.createdAt.localeCompare(a.createdAt)))
  $('rows').innerHTML = list.length
    ? list
        .map(
          (b) => `<tr data-ref="${esc(b.reference)}" class="is-${esc(b.status)}">
        <td><span class="name">${highlight(b.name, q)}</span><small>${highlight(b.email, q)}</small></td>
        <td>${highlight(carName(b), q)}<small>${highlight(b.reference, q)}</small></td>
        <td>${esc(b.city)}</td>
        <td>${esc(fmtRange(b))}<small>${nights(b)} day${nights(b) === 1 ? '' : 's'} · pick-up ${esc(until(b.pickup))}</small></td>
        <td>${esc(ago(received(b.createdAt)))}</td>
        <td>${statusPill(b.status)}</td>
      </tr>`,
        )
        .join('')
    : `<tr><td colspan="6" class="empty">${state.bookings.length ? 'No bookings match.' : 'No requests yet. They appear here as soon as a guest books a drive on the website.'}</td></tr>`
}

function renderFleet() {
  const start = today()
  const span = 30
  const s0 = dayNum(start)
  const pct = (iso) => (Math.min(Math.max(dayNum(iso) - s0, 0), span) / span) * 100
  const ticks = [0, 7, 14, 21, 28].map((d) => `<span style="left:${(d / span) * 100}%">${esc(fmtDay(addDays(start, d)))}</span>`).join('')
  const rows = Object.entries(state.vehicles)
    .map(([, name]) => {
      const slots = state.bookings
        .filter((b) => b.vehicle === name && b.status !== 'cancelled' && b.returnDate > start && b.pickup < addDays(start, span))
        .map((b) => {
          const left = pct(b.pickup)
          const width = Math.max(pct(b.returnDate) - left, 1.5)
          return `<button type="button" class="slot ${esc(b.status)}" data-ref="${esc(b.reference)}" style="left:${left}%;width:${width}%" title="${esc(b.name)} · ${esc(fmtRange(b))} · ${esc(b.status)}">${esc(b.name)}</button>`
        })
        .join('')
      return `<div class="car">${esc(name)}</div><div class="lane"><span class="today" style="left:0"></span>${slots}</div>`
    })
    .join('')
  $('timeline').innerHTML = `<div class="tl"><div></div><div class="lane head">${ticks}</div>${rows}</div>`

  const t = today()
  $('cars').innerHTML = Object.values(state.vehicles)
    .map((name) => {
      const mine = state.bookings.filter((b) => b.vehicle === name && b.status === 'confirmed')
      const now = mine.find((b) => b.pickup <= t && b.returnDate > t)
      const next = mine.filter((b) => b.pickup > t).sort((a, b) => a.pickup.localeCompare(b.pickup))[0]
      const line = now ? `Out with ${esc(now.name)} until ${esc(fmtDay(now.returnDate))}` : next ? `Next out ${esc(until(next.pickup))} · ${esc(next.city)}` : 'No confirmed bookings'
      return `<div class="car-card"><h3>${esc(name)}</h3><p>${line}</p><div class="state">${now ? statusPill('confirmed').replace('confirmed</span>', 'on the road</span>') : '<span class="status">available</span>'}</div></div>`
    })
    .join('')
}

// ---------- Activity: what staff did, from the server's log ----------
const EVENTS = {
  login_ok: 'Signed in',
  login_failed: 'Failed sign-in attempt',
  logout: 'Signed out',
  status_change: 'Status changed',
  note_saved: 'Note saved',
  booking_deleted: 'Booking deleted',
  export: 'Exported bookings to CSV',
}
function eventItem(e, { withRef = true } = {}) {
  const when = received(e.at)
  const tone = e.event === 'login_failed' || e.event === 'booking_deleted' ? 'bad' : ''
  // Deleted bookings cannot be opened any more, so their reference is plain text.
  const exists = e.reference && state.bookings.some((b) => b.reference === e.reference)
  const ref = !withRef || !e.reference ? '' : exists ? ` <a href="#bookings/${esc(e.reference)}">${esc(e.reference)}</a>` : ` <span class="ref">${esc(e.reference)}</span>`
  return `<li class="${tone}"><i class="dot"></i><div class="who"><strong>${esc(EVENTS[e.event] ?? e.event)}${ref}</strong>${e.detail ? `<span>${esc(e.detail)}</span>` : ''}</div><span class="when" title="${esc(when.toLocaleString())}${e.ip ? ' · ' + esc(e.ip) : ''}">${esc(ago(when))}</span></li>`
}
async function loadActivity() {
  try {
    state.activity = await api('/api/admin/activity')
    renderActivity()
  } catch (err) {
    toast(err.message, true)
  }
}
function renderActivity() {
  $('activity').innerHTML = state.activity.length ? state.activity.map((e) => eventItem(e)).join('') : '<li class="empty">Nothing yet. Sign-ins and changes appear here.</li>'
}
async function loadHistory(reference) {
  if (state.open !== reference) return
  try {
    const events = await api(`/api/admin/bookings/${encodeURIComponent(reference)}/history`)
    if (state.open !== reference) return
    $('d-history').innerHTML = events.length ? events.map((e) => eventItem(e, { withRef: false })).join('') : '<li class="empty">No changes yet.</li>'
  } catch {
    $('d-history').innerHTML = '<li class="empty">Could not load the history.</li>'
  }
}

// ---------- Drawer ----------
function openDrawer(ref) {
  state.open = ref.toUpperCase()
  if (!state.bookings.find((b) => b.reference === state.open) && state.loadedAt) {
    toast('That booking no longer exists.', true)
    state.open = null
    return
  }
  $('drawer').classList.add('open')
  $('drawer').setAttribute('aria-hidden', 'false')
  $('scrim').hidden = false
  noteDirty = false
  $('d-history').innerHTML = ''
  fillDrawer(true)
  loadHistory(state.open)
  setTimeout(() => $('d-close').focus(), 50)
}
function closeDrawer(updateHash = true) {
  if (!state.open) return
  if (noteDirty && !window.confirm('Discard the unsaved note?')) return
  state.open = null
  noteDirty = false
  $('drawer').classList.remove('open')
  $('drawer').setAttribute('aria-hidden', 'true')
  $('scrim').hidden = true
  if (updateHash) history.replaceState(null, '', '#' + state.view)
}
let noteDirty = false
function fillDrawer(reset = false) {
  const b = state.bookings.find((x) => x.reference === state.open)
  if (!b) return
  $('d-ref').textContent = b.reference
  $('d-name').textContent = b.name
  $('d-email').textContent = b.email
  $('d-email').href = 'mailto:' + encodeURIComponent(b.email).replace('%40', '@')
  const fact = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`
  $('d-facts').innerHTML = [
    fact('Car', esc(carName(b))),
    fact('City', esc(b.city)),
    fact('Pick-up', esc(fmtDay(b.pickup, { weekday: 'short', year: 'numeric' })) + ` <span class="hint">${esc(until(b.pickup))}</span>`),
    fact('Return', esc(fmtDay(b.returnDate, { weekday: 'short', year: 'numeric' }))),
    fact('Length', `${nights(b)} day${nights(b) === 1 ? '' : 's'}`),
    fact('Received', esc(received(b.createdAt).toLocaleString())),
    b.updatedAt ? fact('Last change', esc(received(b.updatedAt).toLocaleString())) : '',
  ].join('')
  document.querySelectorAll('#d-status button').forEach((btn) => btn.setAttribute('aria-checked', String(btn.dataset.status === b.status)))
  document.querySelectorAll('#d-status button').forEach((btn) => btn.setAttribute('role', 'radio'))
  if (reset || !noteDirty) {
    $('d-note').value = b.note ?? ''
    $('d-note-state').textContent = b.note ? '' : 'No note yet'
  }
  const subject = `Your Velocé booking ${b.reference}`
  const body = `Hello ${b.name.split(' ')[0]},\n\nThank you for your request for the ${carName(b)} in ${b.city}, ${fmtRange(b)}.\n\n`
  $('d-mail').href = `mailto:${encodeURIComponent(b.email).replace('%40', '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

// ---------- Events ----------
document.addEventListener('click', async (e) => {
  const act = e.target.closest('[data-act]')
  if (act) {
    e.stopPropagation()
    act.disabled = true
    await update(act.dataset.ref, { status: act.dataset.act }, `${act.dataset.ref} confirmed`)
    return
  }
  const tab = e.target.closest('[data-filter]')
  if (tab) {
    state.filter = tab.dataset.filter
    history.replaceState(null, '', state.filter === 'all' ? '#bookings' : `#bookings?status=${state.filter}`)
    renderBookings()
    return
  }
  const row = e.target.closest('[data-ref]')
  if (row && !e.target.closest('.drawer')) location.hash = `#${state.view}/${row.dataset.ref}`
})

$('scrim').addEventListener('click', () => closeDrawer())
$('d-close').addEventListener('click', () => closeDrawer())
$('d-status').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-status]')
  if (!btn || !state.open) return
  const b = state.bookings.find((x) => x.reference === state.open)
  if (b.status === btn.dataset.status) return
  await update(state.open, { status: btn.dataset.status }, `Marked ${btn.dataset.status}`)
})
$('d-note').addEventListener('input', () => {
  noteDirty = true
  $('d-note-state').textContent = 'Unsaved changes'
})
$('d-save').addEventListener('click', async () => {
  if (!state.open) return
  $('d-save').disabled = true
  const ok = await update(state.open, { note: $('d-note').value }, 'Note saved')
  $('d-save').disabled = false
  if (ok) {
    noteDirty = false
    $('d-note-state').textContent = 'Saved'
  }
})
$('d-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(state.open)
    toast('Reference copied')
  } catch {
    toast('Copy failed. Select the reference and copy it by hand.', true)
  }
})
$('d-delete').addEventListener('click', async () => {
  const b = state.bookings.find((x) => x.reference === state.open)
  if (!b) return
  $('c-body').textContent = `${b.reference} for ${b.name} will be removed for good, with the guest's name and email. Use this when a guest asks to be forgotten. To turn a request down, mark it Cancelled instead.`
  const dlg = $('confirm')
  dlg.returnValue = ''
  dlg.showModal()
  dlg.addEventListener(
    'close',
    async () => {
      if (dlg.returnValue !== 'ok') return
      try {
        await api(`/api/admin/bookings/${encodeURIComponent(b.reference)}`, { method: 'DELETE', body: '{}' })
        noteDirty = false
        closeDrawer()
        state.bookings = state.bookings.filter((x) => x.reference !== b.reference)
        render()
        toast('Booking deleted')
      } catch (err) {
        toast(err.message, true)
      }
    },
    { once: true },
  )
})

$('search').addEventListener('input', (e) => {
  state.query = e.target.value
  renderBookings()
})
$('sort').addEventListener('change', (e) => {
  state.sort = e.target.value
  renderBookings()
})
$('refresh').addEventListener('click', async () => {
  await load()
  toast('Up to date')
})
$('logout').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {})
  location.replace('/admin/login')
})
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '')
  if (e.key === 'Escape' && state.open && !$('confirm').open) closeDrawer()
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === '/') {
    e.preventDefault()
    if (state.view !== 'bookings') location.hash = '#bookings'
    setTimeout(() => $('search').focus(), 0)
  }
  if (e.key === 'r') load()
})
window.addEventListener('hashchange', route)
window.addEventListener('beforeunload', (e) => {
  if (noteDirty) e.preventDefault()
})

// ---------- Session ----------
function showSession() {
  if (!state.expiresAt) return
  const mins = Math.round((state.expiresAt - Date.now()) / 60000)
  if (mins <= 0) return location.replace('/admin/login')
  $('session').textContent = mins >= 60 ? `Signed in · ${Math.floor(mins / 60)} h ${mins % 60} min left` : `Signed in · ${mins} min left`
}

async function start() {
  const session = await api('/api/admin/session')
  if (!session.authenticated) return location.replace('/admin/login')
  state.vehicles = session.vehicles ?? {}
  state.expiresAt = Date.parse(session.expiresAt)
  $('demo-banner').hidden = !session.demoPassword
  showSession()
  setInterval(showSession, 30_000)
  route()
  await load()
  route()
  // Fresh data while the tab is open; nothing while it sits in the background.
  setInterval(() => document.visibilityState === 'visible' && load({ quiet: true }), 60_000)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && load({ quiet: true }))
}

start().catch(() => {})
