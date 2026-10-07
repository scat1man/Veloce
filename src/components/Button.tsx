import { ChevronRight } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'

/**
 * One call-to-action language for the whole site:
 *   primary — a filled pill: the single main action in a view (`solid` is an alias)
 *   text    — a text link with a chevron that steps forward on hover (`outline` is an alias)
 *
 * Renders <a> when given `href` (navigation), otherwise <button> (an action).
 */
type Variant = 'primary' | 'solid' | 'text' | 'outline'
type Tone = 'onDark' | 'onLight'

type Props = {
  children: ReactNode
  variant?: Variant
  tone?: Tone
  href?: string
  onClick?: (e: MouseEvent<HTMLElement>) => void
  type?: 'button' | 'submit'
  className?: string
  size?: 'sm' | 'md' | 'lg'
  ariaLabel?: string
  disabled?: boolean
}

const pill: Record<Tone, string> = {
  onDark: 'bg-bone text-ink hover:bg-white',
  onLight: 'bg-ink text-bone hover:bg-carbon',
}
const link: Record<Tone, string> = {
  onDark: 'text-bone/90 hover:text-bone',
  onLight: 'text-ink/85 hover:text-ink',
}

export function Button({
  children,
  variant = 'primary',
  tone = 'onDark',
  href,
  onClick,
  type = 'button',
  className = '',
  size = 'md',
  ariaLabel,
  disabled,
}: Props) {
  const isPill = variant === 'primary' || variant === 'solid'
  const cls = `cta cta-${size} ${isPill ? `cta-pill ${pill[tone]}` : `cta-link ${link[tone]}`} ${className}`

  const inner = (
    <>
      <span className="cta-label">{children}</span>
      {!isPill && <ChevronRight className="cta-chevron" strokeWidth={2} aria-hidden />}
    </>
  )

  if (href) {
    return (
      <a href={href} onClick={onClick} className={cls} aria-label={ariaLabel}>
        {inner}
      </a>
    )
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls} aria-label={ariaLabel}>
      {inner}
    </button>
  )
}
