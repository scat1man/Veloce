import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getAccount, signOut as apiSignOut, type Account } from '../api'

type Notice = 'failed' | 'cancelled' | 'expired' | null

type AccountContextValue = Account & {
  /** False until the server has answered. */
  ready: boolean
  /** How the last Google sign-in ended, when it came back without signing anyone in. */
  notice: Notice
  clearNotice: () => void
  signOut: () => Promise<void>
}

const AccountContext = createContext<AccountContextValue | null>(null)

// The server adds ?signin=… when a Google sign-in comes back without success. Read it once and
// take it out of the address bar, so a reload or a shared link does not repeat the message.
function takeNotice(): Notice {
  const params = new URLSearchParams(window.location.search)
  const value = params.get('signin')
  if (!value) return null
  params.delete('signin')
  const query = params.toString()
  history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash)
  return value === 'cancelled' || value === 'expired' ? value : 'failed'
}

/** Who is signed in on the public site. Signing in itself is a page visit to Google and back. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account>({ google: false, user: null })
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState<Notice>(() => (typeof window === 'undefined' ? null : takeNotice()))

  useEffect(() => {
    getAccount().then(setAccount, () => {}).finally(() => setReady(true))
  }, [])

  const signOut = useCallback(async () => {
    await apiSignOut()
    setAccount((a) => ({ ...a, user: null }))
  }, [])
  const clearNotice = useCallback(() => setNotice(null), [])

  const value = useMemo(() => ({ ...account, ready, notice, clearNotice, signOut }), [account, ready, notice, clearNotice, signOut])
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export function useAccount() {
  const ctx = useContext(AccountContext)
  if (!ctx) throw new Error('useAccount must be used inside <AccountProvider>')
  return ctx
}

export const noticeCopy: Record<Exclude<Notice, null>, string> = {
  failed: 'Google sign-in did not complete. Please try again.',
  cancelled: 'Sign-in was cancelled. You can still book as a guest.',
  expired: 'That sign-in link expired. Please try again.',
}
