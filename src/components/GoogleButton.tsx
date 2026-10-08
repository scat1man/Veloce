import { googleSignInUrl } from '../api'

/** Google's four-colour "G", drawn inline so no image has to be fetched from Google. */
export function GoogleMark({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" className={className} aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  )
}

/**
 * "Continue with Google": a plain link. The server sends the visitor to Google and back to
 * `returnTo`, so the site loads no Google code. `onBeforeLeave` can save anything the page
 * should remember (e.g. a half-filled booking).
 */
export function GoogleButton({ returnTo, onBeforeLeave, className = '' }: { returnTo: string; onBeforeLeave?: () => void; className?: string }) {
  return (
    <a
      href={googleSignInUrl(returnTo)}
      onClick={onBeforeLeave}
      className={`flex h-14 w-full items-center justify-center gap-3 rounded-full border border-ink/15 bg-white text-[1.0625rem] font-medium text-ink transition-[border-color,background-color] duration-200 hover:border-ink/30 hover:bg-ink/[0.02] ${className}`}
    >
      <GoogleMark />
      Continue with Google
    </a>
  )
}
