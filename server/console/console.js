// Velocé Concierge: the staff console. Plain JavaScript, no build step.
// Every piece of guest data goes through esc() before it reaches innerHTML, and no markup
// carries inline styles: sizes and positions are set through the DOM after rendering.

const $ = (id) => document.getElementById(id)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const DAY = 864e5
const STATUSES = ['pending', 'confirmed', 'cancelled']
const VIEWS = { overview: 'Overview', bookings: 'Bookings', fleet: 'Fleet', activity: 'Activity' }
const isMac = /Mac|iPhone|iPad/.test(navigator.platform)

const state = {
  bookings: [],
  activity: [],
  vehicles: {},
  view: 'overview',
  filter: 'all',
  query: '',
  sort: 'created',
  open: null, // reference shown in the drawer
  selected: null, // reference highlighted in the bookings table (keyboard)
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
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
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
  return d === 0 ? 'today' : d === 1 ? 'tomorrow' : d === -1 ? 'yesterday' : d < 0 ? `${-d} days ago` : `in ${d} days`
}
function dayLabel(iso) {
  const d = dayNum(iso) - dayNum(today())
  return d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : fmtDay(iso, { weekday: 'long', month: 'short', day: 'numeric' })
}
function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
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
    if (!quiet) toast(err.message, { error: true })
  }
}

/** PATCH one booking. Status changes offer Undo, which puts the previous status back. */
async function update(reference, patch, message, { undo = true } = {}) {
  const before = state.bookings.find((b) => b.reference === reference)
  try {
    const updated = await api(`/api/admin/bookings/${encodeURIComponent(reference)}`, { method: 'PATCH', body: JSON.stringify(patch) })
    state.bookings = state.bookings.map((b) => (b.reference === reference ? updated : b))
    render()
    loadHistory(reference)
    if (message) {
      const previous = before?.status
      const canUndo = undo && patch.status && previous && previous !== patch.status
      toast(message, canUndo ? { action: 'Undo', onAction: () => update(reference, { status: previous }, `Back to ${previous}`, { undo: false }) } : {})
    }
    return true
  } catch (err) {
    toast(err.message, { error: true })
    return false
  }
}

// ---------- Toasts ----------
function toast(text, { error = false, action, onAction } = {}) {
  const el = document.createElement('div')
  el.className = 'toast' + (error ? ' error' : '')
  el.setAttribute('role', error ? 'alert' : 'status')
  const label = document.createElement('span')
  label.textContent = text
  el.append(label)
  if (action) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = action
    btn.addEventListener('click', () => {
      el.remove()
      onAction()
    })
    el.append(btn)
  }
  $('toasts').append(el)
  setTimeout(() => el.remove(), action ? 6000 : 3200)
}

// ---------- Routing: #overview, #bookings, #bookings?status=pending, #bookings/VLC-XXXX, #fleet, #activity ----------
function route() {
  const [path, query] = location.hash.slice(1).split('?')
  const [view, ref] = path.split('/')
  const changed = state.view !== (VIEWS[view] ? view : 'overview')
  state.view = VIEWS[view] ? view : 'overview'
  const status = new URLSearchParams(query ?? '').get('status')
  if (status && (status === 'all' || STATUSES.includes(status))) state.filter = status
  for (const id of Object.keys(VIEWS)) $(`view-${id}`).hidden = id !== state.view
  document.querySelectorAll('nav a').forEach((a) => (a.dataset.view === state.view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')))
  $('title').textContent = VIEWS[state.view]
  document.title = `${VIEWS[state.view]} · Velocé Concierge`
  if (ref) openDrawer(decodeURIComponent(ref))
  else closeDrawer(false)
  render()
  if (state.view === 'activity') loadActivity()
  if (changed) window.scrollTo({ top: 0 })
}

// ---------- Rendering ----------
const statusPill = (s) => `<span class="status ${STATUSES.includes(s) ? s : ''}">${esc(s)}</span>`
const carName = (b) => b.vehicle ?? 'No preference'
const initials = (name) => esc(String(name).trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join(''))
const avatar = (b) => `<span class="avatar" aria-hidden="true">${initials(b.name)}</span>`
const emptyState = (title, text) => `<strong>${esc(title)}</strong>${text ? `<span>${esc(text)}</span>` : ''}`

// Positions and widths go through the DOM (CSSOM), so the page needs no inline style attributes.
function applyGeometry(root) {
  root.querySelectorAll('[data-left]').forEach((el) => (el.style.left = el.dataset.left + '%'))
  root.querySelectorAll('[data-width]').forEach((el) => (el.style.width = el.dataset.width + '%'))
}

function render() {
  const pending = state.bookings.filter((b) => b.status === 'pending').length
  for (const id of ['pending-badge', 'pending-badge-m']) {
    $(id).hidden = !pending
    $(id).textContent = pending
  }
  $('updated').textContent = state.loadedAt ? `${plural(state.bookings.length, 'booking')} · updated ${state.loadedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Loading…'
  $('eyebrow').textContent = state.view === 'overview' ? `${greeting()} · ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}` : ''
  if (!state.loadedAt) return renderSkeleton()
  if (state.view === 'overview') renderOverview()
  if (state.view === 'bookings') renderBookings()
  if (state.view === 'fleet') renderFleet()
  if (state.view === 'activity') renderActivity()
  if (state.open) fillDrawer()
}

function renderSkeleton() {
  const line = (w) => `<span class="skel" data-width="${w}"></span>`
  $('stats').innerHTML = Array.from({ length: 4 }, () => `<div class="stat">${line(40)}<span class="skel value-skel" data-width="30"></span>${line(60)}</div>`).join('')
  const rows = Array.from({ length: 4 }, () => `<li><span class="avatar"></span><div class="who">${line(50)}${line(80)}</div></li>`).join('')
  $('awaiting').innerHTML = rows
  $('upcoming').innerHTML = `<ul class="list">${rows}</ul>`
  $('rows').innerHTML = Array.from({ length: 6 }, () => `<tr><td colspan="6">${line(100)}</td></tr>`).join('')
  document.querySelectorAll('.skel').forEach((el) => {
    el.style.height = el.classList.contains('value-skel') ? '36px' : '12px'
    el.style.margin = '6px 0'
  })
  applyGeometry(document)
}

function renderOverview() {
  const t = today()
  const live = state.bookings.filter((b) => b.status !== 'cancelled')
  const pending = state.bookings.filter((b) => b.status === 'pending')
  const confirmedAhead = state.bookings.filter((b) => b.status === 'confirmed' && b.returnDate >= t)
  const onRoad = confirmedAhead.filter((b) => b.pickup <= t && b.returnDate > t)
  const week = confirmedAhead.filter((b) => b.pickup >= t && b.pickup <= addDays(t, 7))
  const oldest = pending.map((b) => received(b.createdAt)).sort((a, b) => a - b)[0]
  const stat = (label, value, foot, href, cls = '') => `<a class="stat ${cls}" href="${href}"><span class="label">${label}</span><span class="value">${value}</span><span class="foot">${foot}</span></a>`
  $('stats').innerHTML = [
    stat('Needs a reply', pending.length, oldest ? `Oldest ${ago(oldest)}` : 'All answered', '#bookings?status=pending', pending.length ? 'attention' : ''),
    stat('Confirmed ahead', confirmedAhead.length, plural(confirmedAhead.reduce((n, b) => n + nights(b), 0), 'rental day'), '#bookings?status=confirmed'),
    stat('On the road', onRoad.length, onRoad.length ? onRoad.map((b) => esc(carName(b))).join(', ') : 'Every car is home', '#fleet'),
    stat('Pick-ups this week', week.length, 'Confirmed, next 7 days', '#fleet'),
  ].join('')

  const item = (b, right, sub = `${esc(carName(b))} · ${esc(b.city)} · ${esc(fmtRange(b))}`) =>
    `<li data-ref="${esc(b.reference)}" tabindex="0">${avatar(b)}<div class="who"><strong>${esc(b.name)}</strong><span>${sub}</span></div>${right}</li>`
  const awaiting = [...pending].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, 6)
  $('awaiting').innerHTML = awaiting.length
    ? awaiting
        .map((b) => item(b, `<span class="when">${esc(ago(received(b.createdAt)))}</span><button type="button" class="btn sm go" data-act="confirmed" data-ref="${esc(b.reference)}" aria-label="Confirm ${esc(b.name)}">Confirm</button>`))
        .join('')
    : `<li class="empty">${emptyState('Inbox zero', 'Every request has an answer.')}</li>`

  // Pick-ups and returns for the next week, grouped by day: what staff need to prepare.
  const events = []
  for (const b of live) {
    if (b.pickup >= t && b.pickup <= addDays(t, 7)) events.push({ day: b.pickup, kind: 'Pick-up', b })
    if (b.status === 'confirmed' && b.returnDate >= t && b.returnDate <= addDays(t, 7)) events.push({ day: b.returnDate, kind: 'Return', b })
  }
  events.sort((a, b) => a.day.localeCompare(b.day) || a.kind.localeCompare(b.kind))
  const days = [...new Set(events.map((e) => e.day))]
  $('upcoming').innerHTML = days.length
    ? days
        .map(
          (d) =>
            `<p class="day">${esc(dayLabel(d))}</p><ul class="list">${events
              .filter((e) => e.day === d)
              .map((e) => item(e.b, `<span class="kind ${e.kind === 'Pick-up' ? 'out' : ''}">${e.kind}</span>${e.b.status === 'pending' ? statusPill('pending') : ''}`, `${esc(carName(e.b))} · ${esc(e.b.city)}`))
              .join('')}</ul>`,
        )
        .join('')
    : `<div class="empty">${emptyState('A quiet week', 'No pick-ups or returns in the next seven days.')}</div>`

  const cars = Object.values(state.vehicles)
  const counts = cars.map((name) => ({
    name,
    c: live.filter((b) => b.vehicle === name && b.status === 'confirmed').length,
    p: live.filter((b) => b.vehicle === name && b.status === 'pending').length,
  }))
  const none = live.filter((b) => !b.vehicle)
  if (none.length) counts.push({ name: 'No preference', c: none.filter((b) => b.status === 'confirmed').length, p: none.filter((b) => b.status === 'pending').length })
  const max = Math.max(1, ...counts.map((x) => x.c + x.p))
  $('by-car').innerHTML = counts
    .map(
      (x) =>
        `<div class="bar"><span>${esc(x.name)}</span><span class="track" role="img" aria-label="${x.c} confirmed, ${x.p} pending"><i class="c" data-width="${(x.c / max) * 100}"></i><i class="p" data-width="${(x.p / max) * 100}"></i></span><span class="n">${x.c + x.p}</span></div>`,
    )
    .join('')
  applyGeometry($('view-overview'))
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
function visibleBookings() {
  const q = state.query.trim().toLowerCase()
  const list = state.bookings.filter((b) => (state.filter === 'all' || b.status === state.filter) && matches(b, q))
  return list.sort((a, b) => (state.sort === 'pickup' ? a.pickup.localeCompare(b.pickup) : b.createdAt.localeCompare(a.createdAt)))
}

function renderBookings() {
  const q = state.query.trim().toLowerCase()
  const counts = { all: state.bookings.length }
  for (const s of STATUSES) counts[s] = state.bookings.filter((b) => b.status === s).length
  $('status-tabs').innerHTML = ['all', ...STATUSES]
    .map((s) => `<button type="button" role="tab" data-filter="${s}" aria-selected="${state.filter === s}">${s[0].toUpperCase() + s.slice(1)}<span class="n">${counts[s]}</span></button>`)
    .join('')
  const list = visibleBookings()
  if (state.selected && !list.some((b) => b.reference === state.selected)) state.selected = null
  $('rows').innerHTML = list.length
    ? list
        .map(
          (b, i) => `<tr data-ref="${esc(b.reference)}" tabindex="${b.reference === state.selected || (!state.selected && i === 0) ? 0 : -1}" class="is-${esc(b.status)}${b.reference === state.selected ? ' selected' : ''}" aria-selected="${b.reference === state.selected}">
        <td><div class="guest">${avatar(b)}<div><span class="name">${highlight(b.name, q)}</span>${b.note ? '<span class="note-dot" title="Has a staff note"></span>' : ''}<small>${highlight(b.email, q)}</small></div></div></td>
        <td>${highlight(carName(b), q)}<small>${highlight(b.reference, q)}</small></td>
        <td>${esc(b.city)}</td>
        <td>${esc(fmtRange(b))}<small>${plural(nights(b), 'day')} · pick-up ${esc(until(b.pickup))}</small></td>
        <td>${esc(ago(received(b.createdAt)))}</td>
        <td>${statusPill(b.status)}</td>
      </tr>`,
        )
        .join('')
    : `<tr><td colspan="6" class="empty"><div class="empty">${
        state.bookings.length
          ? emptyState('No bookings match', q ? `Nothing for “${state.query.trim()}”. Try a name, email or reference.` : 'Try another status.')
          : emptyState('No requests yet', 'They appear here as soon as a guest books a drive on the website.')
      }</div></td></tr>`
}

function renderFleet() {
  const start = today()
  const span = 30
  const s0 = dayNum(start)
  const pct = (iso) => (Math.min(Math.max(dayNum(iso) - s0, 0), span) / span) * 100
  const ticks = [0, 7, 14, 21, 28].map((d) => `<span data-left="${(d / span) * 100}">${esc(d === 0 ? 'Today' : fmtDay(addDays(start, d)))}</span>`).join('')
  // Weekends get a faint band so the eye finds Saturdays without gridlines.
  let weekends = ''
  for (let d = 0; d < span; d++) {
    const wd = new Date(Date.parse(addDays(start, d) + 'T12:00:00Z')).getUTCDay()
    if (wd === 6) weekends += `<span class="weekend" data-left="${(d / span) * 100}" data-width="${(Math.min(2, span - d) / span) * 100}"></span>`
  }
  if (new Date(Date.parse(start + 'T12:00:00Z')).getUTCDay() === 0) weekends += `<span class="weekend" data-left="0" data-width="${100 / span}"></span>`
  const rows = Object.values(state.vehicles)
    .map((name) => {
      const slots = state.bookings
        .filter((b) => b.vehicle === name && b.status !== 'cancelled' && b.returnDate > start && b.pickup < addDays(start, span))
        .map((b) => {
          const left = pct(b.pickup)
          const width = Math.max(pct(b.returnDate) - left, 2)
          return `<button type="button" class="slot ${esc(b.status)}" data-ref="${esc(b.reference)}" data-left="${left}" data-width="${width}" title="${esc(b.name)} · ${esc(fmtRange(b))} · ${esc(b.status)}" aria-label="${esc(b.name)}, ${esc(fmtRange(b))}, ${esc(b.status)}">${esc(b.name)}</button>`
        })
        .join('')
      return `<div class="car">${esc(name)}</div><div class="lane">${weekends}<span class="today" data-left="0"></span>${slots}</div>`
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
      const pill = now ? '<span class="status confirmed">On the road</span>' : '<span class="status">Available</span>'
      return `<div class="car-card"><h3>${esc(name)}</h3><p>${line}</p><div class="state">${pill}</div></div>`
    })
    .join('')
  applyGeometry($('view-fleet'))
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
  const tone = e.event === 'login_failed' || e.event === 'booking_deleted' ? 'bad' : e.detail?.endsWith('confirmed') ? 'good' : ''
  // Deleted bookings cannot be opened any more, so their reference is plain text.
  const booking = e.reference && state.bookings.find((b) => b.reference === e.reference)
  const ref = !withRef || !e.reference ? '' : booking ? ` · <a href="#bookings/${esc(e.reference)}">${esc(booking.name)}</a>` : ` · <span class="ref">${esc(e.reference)}</span>`
  return `<li class="${tone}"><i class="dot"></i><div class="who"><strong>${esc(EVENTS[e.event] ?? e.event)}${ref}</strong>${e.detail ? `<span>${esc(e.detail)}</span>` : ''}</div><span class="when" title="${esc(when.toLocaleString())}${e.ip ? ' · ' + esc(e.ip) : ''}">${esc(ago(when))}</span></li>`
}
async function loadActivity() {
  try {
    state.activity = await api('/api/admin/activity')
    renderActivity()
  } catch (err) {
    toast(err.message, { error: true })
  }
}
function renderActivity() {
  $('activity').innerHTML = state.activity.length ? state.activity.map((e) => eventItem(e)).join('') : `<li class="empty">${emptyState('Nothing yet', 'Sign-ins and changes appear here.')}</li>`
}
async function loadHistory(reference) {
  if (state.open !== reference) return
  try {
    const events = await api(`/api/admin/bookings/${encodeURIComponent(reference)}/history`)
    if (state.open !== reference) return
    $('d-history').innerHTML = events.length ? events.map((e) => eventItem(e, { withRef: false })).join('') : '<li class="hint">No changes yet.</li>'
  } catch {
    $('d-history').innerHTML = '<li class="hint">Could not load the history.</li>'
  }
}

// ---------- Drawer ----------
let noteDirty = false
let returnFocus = null
function openDrawer(ref) {
  const reference = ref.toUpperCase()
  if (!state.bookings.find((b) => b.reference === reference) && state.loadedAt) {
    toast('That booking no longer exists.', { error: true })
    history.replaceState(null, '', '#' + state.view)
    return
  }
  const wasOpen = Boolean(state.open)
  if (wasOpen && state.open !== reference && noteDirty && !window.confirm('Discard the unsaved note?')) return
  state.open = reference
  state.selected = reference
  noteDirty = false
  if (!wasOpen) returnFocus = document.activeElement
  const drawer = $('drawer')
  drawer.classList.add('open')
  drawer.setAttribute('aria-hidden', 'false')
  drawer.inert = false
  // Everything behind the drawer is out of reach for keyboard and screen readers while it is open.
  document.querySelector('.shell').inert = true
  $('scrim').hidden = false
  $('d-history').innerHTML = ''
  fillDrawer(true)
  loadHistory(reference)
  if (!wasOpen) setTimeout(() => $('d-close').focus(), 60)
}
function closeDrawer(updateHash = true) {
  if (!state.open) return
  if (noteDirty && !window.confirm('Discard the unsaved note?')) return
  state.open = null
  noteDirty = false
  const drawer = $('drawer')
  drawer.classList.remove('open')
  drawer.setAttribute('aria-hidden', 'true')
  drawer.inert = true
  document.querySelector('.shell').inert = false
  $('scrim').hidden = true
  if (updateHash) history.replaceState(null, '', '#' + state.view)
  render()
  const row = document.querySelector(`#rows tr[data-ref="${CSS.escape(state.selected ?? '')}"]`)
  ;(row ?? returnFocus)?.focus?.({ preventScroll: true })
}
// The list the drawer steps through with J/K: the bookings table as filtered, or every booking.
function neighbours() {
  const list = state.view === 'bookings' ? visibleBookings() : [...state.bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const i = list.findIndex((b) => b.reference === state.open)
  return { prev: list[i - 1], next: list[i + 1] }
}
function step(dir) {
  const target = neighbours()[dir]
  if (target) location.hash = `#${state.view}/${target.reference}`
}
function fillDrawer(reset = false) {
  const b = state.bookings.find((x) => x.reference === state.open)
  if (!b) return
  $('d-ref').textContent = b.reference
  $('d-name').textContent = b.name
  $('d-email').textContent = b.email
  $('d-email').href = 'mailto:' + encodeURIComponent(b.email).replace('%40', '@')
  const { prev, next } = neighbours()
  $('d-prev').disabled = !prev
  $('d-next').disabled = !next
  $('d-primary').innerHTML =
    b.status === 'pending'
      ? `<button type="button" class="btn go" data-act="confirmed" data-ref="${esc(b.reference)}" title="Confirm (C)">Confirm booking</button><button type="button" class="btn ghost" data-act="cancelled" data-ref="${esc(b.reference)}">Decline</button>`
      : ''
  const fact = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`
  $('d-facts').innerHTML = [
    fact('Car', esc(carName(b))),
    fact('City', esc(b.city)),
    fact('Pick-up', esc(fmtDay(b.pickup, { weekday: 'short', year: 'numeric' })) + ` <span class="hint">${esc(until(b.pickup))}</span>`),
    fact('Return', esc(fmtDay(b.returnDate, { weekday: 'short', year: 'numeric' }))),
    fact('Length', plural(nights(b), 'day')),
    fact('Received', esc(received(b.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))),
    b.updatedAt ? fact('Last change', esc(received(b.updatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))) : '',
  ].join('')
  document.querySelectorAll('#d-status button').forEach((btn) => {
    const on = btn.dataset.status === b.status
    btn.setAttribute('aria-checked', String(on))
    btn.tabIndex = on ? 0 : -1
  })
  if (reset || !noteDirty) {
    $('d-note').value = b.note ?? ''
    $('d-note-state').textContent = b.note ? '' : 'No note yet'
    $('d-save').disabled = true
  }
  const subject = `Your Velocé booking ${b.reference}`
  const body = `Hello ${b.name.split(' ')[0]},\n\nThank you for your request for the ${carName(b)} in ${b.city}, ${fmtRange(b)}.\n\n`
  $('d-mail').href = `mailto:${encodeURIComponent(b.email).replace('%40', '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

// ---------- Command palette (⌘K) ----------
const COMMANDS = [
  { label: 'Go to Overview', hint: 'G O', run: () => (location.hash = '#overview') },
  { label: 'Go to Bookings', hint: 'G B', run: () => (location.hash = '#bookings') },
  { label: 'Show pending requests', run: () => (location.hash = '#bookings?status=pending') },
  { label: 'Go to Fleet', hint: 'G F', run: () => (location.hash = '#fleet') },
  { label: 'Go to Activity', hint: 'G A', run: () => (location.hash = '#activity') },
  { label: 'Refresh', hint: 'R', run: () => load().then(() => toast('Up to date')) },
  { label: 'Export bookings to CSV', run: () => $('export').click() },
  { label: 'Keyboard shortcuts', hint: '?', run: () => $('shortcuts').showModal() },
  { label: 'Open the website', run: () => window.open('/', '_blank', 'noopener') },
  { label: 'Sign out', run: () => $('logout').click() },
]
let paletteItems = []
let paletteIndex = 0
function openPalette() {
  if ($('palette').open) return
  $('p-input').value = ''
  renderPalette()
  $('palette').showModal()
  $('p-input').focus()
}
function renderPalette() {
  const q = $('p-input').value.trim().toLowerCase()
  const bookings = (q ? state.bookings.filter((b) => matches(b, q)) : state.bookings.filter((b) => b.status === 'pending')).slice(0, 7)
  const commands = COMMANDS.filter((c) => !q || c.label.toLowerCase().includes(q))
  paletteItems = [...bookings.map((b) => ({ booking: b, run: () => (location.hash = `#${state.view === 'overview' || state.view === 'activity' ? 'bookings' : state.view}/${b.reference}`) })), ...commands]
  paletteIndex = Math.min(paletteIndex, Math.max(0, paletteItems.length - 1))
  if (!q) paletteIndex = 0
  let i = 0
  const opt = (inner) => `<li role="option" id="p-opt-${i}" data-i="${i}" aria-selected="${i++ === paletteIndex}">${inner}</li>`
  const groups = []
  if (bookings.length) groups.push(`<li class="group" role="presentation">${q ? 'Bookings' : 'Needs a reply'}</li>` + bookings.map((b) => opt(`${avatar(b)}<div class="who">${highlight(b.name, q)}<span>${highlight(carName(b), q)} · ${esc(fmtRange(b))} · ${highlight(b.reference, q)}</span></div>${statusPill(b.status)}`)).join(''))
  if (commands.length) groups.push(`<li class="group" role="presentation">Commands</li>` + commands.map((c) => opt(`<div class="who">${esc(c.label)}</div>${c.hint ? `<kbd>${esc(c.hint)}</kbd>` : ''}`)).join(''))
  $('p-list').innerHTML = groups.join('') || `<li class="empty">${emptyState('No results', 'Try a guest name, email, car or reference.')}</li>`
  $('p-input').setAttribute('aria-activedescendant', paletteItems.length ? `p-opt-${paletteIndex}` : '')
  $(`p-opt-${paletteIndex}`)?.scrollIntoView({ block: 'nearest' })
}
function runPalette(i) {
  const item = paletteItems[i]
  if (!item) return
  $('palette').close()
  item.run()
}
$('p-input').addEventListener('input', () => {
  paletteIndex = 0
  renderPalette()
})
$('p-input').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const n = paletteItems.length
    if (!n) return
    paletteIndex = (paletteIndex + (e.key === 'ArrowDown' ? 1 : -1) + n) % n
    renderPalette()
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    runPalette(paletteIndex)
  }
})
$('p-list').addEventListener('click', (e) => {
  const li = e.target.closest('[data-i]')
  if (li) runPalette(Number(li.dataset.i))
})
$('palette').addEventListener('click', (e) => {
  if (e.target === $('palette')) $('palette').close() // click on the backdrop
})
$('open-palette').addEventListener('click', openPalette)
$('open-palette-m').addEventListener('click', openPalette)
$('palette-key').textContent = isMac ? '⌘K' : 'Ctrl K'
$('shortcuts-open').addEventListener('click', () => $('shortcuts').showModal())

// ---------- Events ----------
document.addEventListener('click', async (e) => {
  const act = e.target.closest('[data-act]')
  if (act) {
    e.stopPropagation()
    act.disabled = true
    const b = state.bookings.find((x) => x.reference === act.dataset.ref)
    await update(act.dataset.ref, { status: act.dataset.act }, `${b?.name ?? act.dataset.ref} ${act.dataset.act === 'confirmed' ? 'confirmed' : 'declined'}`)
    act.disabled = false
    return
  }
  const tab = e.target.closest('[data-filter]')
  if (tab) {
    state.filter = tab.dataset.filter
    history.replaceState(null, '', state.filter === 'all' ? '#bookings' : `#bookings?status=${state.filter}`)
    renderBookings()
    return
  }
  if (e.target.closest('a[href]') || e.target.closest('dialog')) return
  const row = e.target.closest('[data-ref]')
  if (row && !e.target.closest('.drawer')) location.hash = `#${state.view}/${row.dataset.ref}`
})

$('scrim').addEventListener('click', () => closeDrawer())
$('d-close').addEventListener('click', () => closeDrawer())
$('d-prev').addEventListener('click', () => step('prev'))
$('d-next').addEventListener('click', () => step('next'))
$('d-status').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-status]')
  if (!btn || !state.open) return
  const b = state.bookings.find((x) => x.reference === state.open)
  if (b.status === btn.dataset.status) return
  await update(state.open, { status: btn.dataset.status }, `Marked ${btn.dataset.status}`)
})
// Radio-group arrows, as screen-reader users expect.
$('d-status').addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
  e.preventDefault()
  const buttons = [...$('d-status').querySelectorAll('button')]
  const i = buttons.indexOf(document.activeElement)
  const next = buttons[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]
  next.focus()
  next.click()
})
$('d-note').addEventListener('input', () => {
  const b = state.bookings.find((x) => x.reference === state.open)
  noteDirty = $('d-note').value !== (b?.note ?? '')
  $('d-save').disabled = !noteDirty
  $('d-note-state').textContent = noteDirty ? 'Unsaved changes' : ''
})
async function saveNote() {
  if (!state.open || !noteDirty) return
  $('d-save').disabled = true
  const ok = await update(state.open, { note: $('d-note').value }, 'Note saved')
  if (ok) {
    noteDirty = false
    $('d-note-state').textContent = 'Saved'
  } else $('d-save').disabled = false
}
$('d-save').addEventListener('click', saveNote)
$('d-note').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    saveNote()
  }
})
$('d-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(state.open)
    toast('Reference copied')
  } catch {
    toast('Copy failed. Select the reference and copy it by hand.', { error: true })
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
        toast(err.message, { error: true })
      }
    },
    { once: true },
  )
})

$('search').addEventListener('input', (e) => {
  state.query = e.target.value
  renderBookings()
})
$('search').addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('search').value) {
    e.stopPropagation()
    $('search').value = ''
    state.query = ''
    renderBookings()
  } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
    // Hand over to the table: the first match is selected, J/K and Enter take it from there.
    e.preventDefault()
    e.stopPropagation()
    state.selected = null
    moveSelection(1)
  }
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

// ---------- Keyboard ----------
function moveSelection(dir) {
  const list = visibleBookings()
  if (!list.length) return
  const i = list.findIndex((b) => b.reference === state.selected)
  const next = list[i < 0 ? (dir > 0 ? 0 : list.length - 1) : Math.min(list.length - 1, Math.max(0, i + dir))]
  state.selected = next.reference
  markSelected(next.reference)
  const tr = document.querySelector(`#rows tr[data-ref="${CSS.escape(next.reference)}"]`)
  tr?.focus({ preventScroll: true })
  tr?.scrollIntoView({ block: 'nearest' })
}
function markSelected(reference) {
  state.selected = reference
  document.querySelectorAll('#rows tr[data-ref]').forEach((tr) => {
    const on = tr.dataset.ref === reference
    tr.classList.toggle('selected', on)
    tr.setAttribute('aria-selected', String(on))
    tr.tabIndex = on ? 0 : -1
  })
}
// Tabbing into the table (or clicking a row) moves the keyboard selection with it.
$('rows').addEventListener('focusin', (e) => {
  const tr = e.target.closest('tr[data-ref]')
  if (tr && tr.dataset.ref !== state.selected) markSelected(tr.dataset.ref)
})
let chord = null
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    return $('palette').open ? $('palette').close() : openPalette()
  }
  if (document.querySelector('dialog[open]')) return // dialogs handle their own keys
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '')
  if (e.key === 'Escape' && state.open) return closeDrawer()
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return
  const key = e.key.toLowerCase()
  if (chord === 'g') {
    chord = null
    const to = { o: 'overview', b: 'bookings', f: 'fleet', a: 'activity' }[key]
    if (to) location.hash = '#' + to
    return
  }
  if (key === 'g') {
    chord = 'g'
    setTimeout(() => (chord = null), 1200)
    return
  }
  if (e.key === '?') return $('shortcuts').showModal()
  if (e.key === 'Enter' && document.activeElement?.matches('li[data-ref]')) return (location.hash = `#bookings/${document.activeElement.dataset.ref}`)
  if (key === 'r') return load()
  if (state.open) {
    if (key === 'j') return step('next')
    if (key === 'k') return step('prev')
    if (key === 'c') {
      const b = state.bookings.find((x) => x.reference === state.open)
      if (b?.status !== 'confirmed') update(b.reference, { status: 'confirmed' }, `${b.name} confirmed`)
    }
    return
  }
  if (e.key === '/') {
    e.preventDefault()
    if (state.view !== 'bookings') location.hash = '#bookings'
    setTimeout(() => $('search').focus(), 0)
    return
  }
  if (state.view === 'bookings') {
    if (key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault()
      moveSelection(1)
    }
    if (key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault()
      moveSelection(-1)
    }
    if (e.key === 'Enter' && state.selected) location.hash = `#bookings/${state.selected}`
  }
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
  $('drawer').inert = true
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
  setInterval(() => document.visibilityState === 'visible' && !state.open && load({ quiet: true }), 60_000)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && load({ quiet: true }))
}

start().catch(() => {})
