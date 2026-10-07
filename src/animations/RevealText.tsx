import { motion, type Variants } from 'motion/react'
import type { ReactNode } from 'react'
import { maskLine, stagger } from './variants'
import { viewport as defaultViewport } from './tokens'

type Line = { content: ReactNode; className?: string }

type Props = {
  lines: (ReactNode | Line)[]
  as?: 'div' | 'h2' | 'h3' | 'p' | 'span'
  id?: string
  className?: string
  lineClassName?: string
  /** Seconds between lines. */
  each?: number
  delay?: number
  /** 'view' reveals on scroll into view; 'mount' plays immediately; 'parent' inherits from an orchestrating parent. */
  trigger?: 'view' | 'mount' | 'parent'
  amount?: number
  variants?: Variants
}

const isLine = (l: unknown): l is Line =>
  typeof l === 'object' && l !== null && 'content' in (l as Record<string, unknown>)

/**
 * Masked, line-by-line typographic reveal.
 * Each line rises from behind a clipping edge — the site's signature text motion.
 */
export function RevealText({
  lines,
  as = 'div',
  id,
  className,
  lineClassName,
  each = 0.1,
  delay = 0,
  trigger = 'view',
  amount = defaultViewport.amount,
  variants = maskLine,
}: Props) {
  const Tag = motion[as]
  const playProps =
    trigger === 'view'
      ? { initial: 'hidden', whileInView: 'show', viewport: { once: true, amount } }
      : trigger === 'mount'
        ? { initial: 'hidden', animate: 'show' }
        : {}

  return (
    <Tag id={id} className={className} variants={stagger(each, delay)} {...playProps}>
      {lines.map((line, i) => {
        const l = isLine(line) ? line : { content: line }
        return (
          <span
            key={i}
            className={`block overflow-hidden pb-[0.06em] -mb-[0.06em] ${lineClassName ?? ''} ${l.className ?? ''}`}
          >
            <motion.span className="block will-change-transform" variants={variants}>
              {l.content}
            </motion.span>
          </span>
        )
      })}
    </Tag>
  )
}
