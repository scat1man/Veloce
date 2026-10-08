// Concierge sign-in: posts the password as JSON; the server answers with an HttpOnly session cookie.
const form = document.getElementById('login')
const input = document.getElementById('password')
const error = document.getElementById('error')
const caps = document.getElementById('caps')
const reveal = document.getElementById('reveal')
const button = form.querySelector('.submit')

reveal.addEventListener('click', () => {
  const show = input.type === 'password'
  input.type = show ? 'text' : 'password'
  reveal.textContent = show ? 'Hide' : 'Show'
  reveal.setAttribute('aria-pressed', String(show))
  reveal.setAttribute('aria-label', show ? 'Hide password' : 'Show password')
  input.focus()
})
// A password that "doesn't work" is often typed with Caps Lock on.
const checkCaps = (e) => (caps.hidden = !e.getModifierState?.('CapsLock'))
input.addEventListener('keydown', checkCaps)
input.addEventListener('keyup', checkCaps)
input.addEventListener('input', () => {
  input.removeAttribute('aria-invalid')
  error.textContent = ''
})

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  error.textContent = ''
  const password = input.value
  if (!password.trim()) {
    error.textContent = 'Enter the password.'
    input.focus()
    return
  }
  button.disabled = true
  button.textContent = 'Signing in…'
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) return location.replace('/admin')
    error.textContent = (await res.json().catch(() => ({}))).error ?? `Sign-in failed (${res.status}).`
    input.setAttribute('aria-invalid', 'true')
    input.select()
  } catch {
    error.textContent = 'Could not reach the server. Check your connection and try again.'
  } finally {
    button.disabled = false
    button.textContent = 'Sign in'
  }
})
