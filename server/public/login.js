// Concierge sign-in: posts the password as JSON; the server answers with an HttpOnly session cookie.
const form = document.getElementById('login')
const error = document.getElementById('error')
const button = form.querySelector('button')

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  error.textContent = ''
  button.disabled = true
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: document.getElementById('password').value }),
    })
    if (res.ok) return location.replace('/admin')
    error.textContent = (await res.json().catch(() => ({}))).error ?? `Sign-in failed (${res.status}).`
  } catch {
    error.textContent = 'Could not reach the server.'
  } finally {
    button.disabled = false
  }
})
