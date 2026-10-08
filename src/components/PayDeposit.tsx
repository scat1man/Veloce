import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { getPaymentConfig, startCheckout, type BookingPayment, type PaymentConfig } from '../api'
import { fadeUp } from '../animations/variants'
import { Button } from './Button'

// Asked once per visit: every form and panel shares the answer.
let configRequest: Promise<PaymentConfig> | null = null
const loadConfig = () => (configRequest ??= getPaymentConfig().catch(() => ({ enabled: false }) as const))

/** The deposit settings, or null while loading. `enabled` is false when the site has no Stripe key. */
export function usePaymentConfig() {
  const [config, setConfig] = useState<PaymentConfig | null>(null)
  useEffect(() => {
    let live = true
    loadConfig().then((c) => live && setConfig(c))
    return () => {
      live = false
    }
  }, [])
  return config
}

/** "$500" from 50000 cents, using the currency's own number of decimals. */
export function formatMoney(amount: number, currency: string) {
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency })
  const value = amount / 10 ** (fmt.resolvedOptions().maximumFractionDigits ?? 2)
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: Number.isInteger(value) ? 0 : undefined }).format(value)
}

/** The "Deposit" line for a booking summary, or null when nothing was paid. */
export function depositLine(payment: BookingPayment | undefined) {
  if (!payment || payment.status === 'none' || payment.amount === null || !payment.currency) return null
  const amount = formatMoney(payment.amount, payment.currency)
  return payment.status === 'paid' ? `${amount}, paid` : `${amount}, refunded`
}

/**
 * Sends the guest to Stripe's payment page for a booking's deposit. Renders nothing when
 * the site takes no online payment, so booking keeps working exactly as before.
 */
export function PayDeposit({ reference, email, note }: { reference: string; email: string; note?: string }) {
  const config = usePaymentConfig()
  const [state, setState] = useState<'idle' | 'opening'>('idle')
  const [error, setError] = useState('')
  if (!config?.enabled) return null

  const pay = async () => {
    setState('opening')
    setError('')
    try {
      window.location.assign(await startCheckout(reference, email))
    } catch (err) {
      setError((err as Error).message)
      setState('idle')
    }
  }

  return (
    <motion.div variants={fadeUp} className="mt-8 flex flex-col gap-3">
      <Button variant="solid" size="lg" tone="onLight" className="w-full" onClick={pay} disabled={state === 'opening'}>
        {state === 'opening' ? 'Opening secure checkout' : `Pay ${formatMoney(config.amount, config.currency)} deposit`}
      </Button>
      <p className={`meta text-center ${error ? 'text-ink' : 'text-ash'}`} role={error ? 'alert' : undefined}>
        {error || note || 'Holds the car while a concierge confirms. Paid securely through Stripe.'}
        {!error && config.test && ' Test mode: use card 4242 4242 4242 4242.'}
      </p>
    </motion.div>
  )
}
