import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { ease } from '../animations/tokens'
import { useScrollLock } from '../hooks/useScrollLock'

type Props = {
  /** Small label in the sheet's top bar (e.g. "Concierge"). */
  label: string
  /** Accessible name for the close button. */
  closeLabel: string
  titleId: string
  onClose: () => void
  children: ReactNode
}

/**
 * An editorial side sheet (full screen on mobile): the one dialog shell shared by
 * the booking form, booking lookup and the legal notes. Render it inside
 * <AnimatePresence> so it can slide out. Locks scroll, closes on Esc and returns
 * focus to whatever opened it.
 */
export function SideSheet({ label, closeLabel, titleId, onClose, children }: Props) {
  useScrollLock(true)

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      trigger?.focus?.({ preventScroll: true })
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <motion.div
        className="absolute inset-0 bg-ink/70"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.4, delay: 0.15 } }}
        transition={{ duration: 0.5, ease: ease.soft }}
      />
      <motion.div
        data-lenis-prevent
        className="absolute inset-y-0 right-0 flex w-full flex-col overflow-y-auto overscroll-contain bg-paper text-ink md:w-[min(580px,100%)]"
        initial={{ x: '100%' }}
        animate={{ x: '0%' }}
        exit={{ x: '100%', transition: { duration: 0.55, ease: ease.inOut } }}
        transition={{ duration: 0.8, ease: ease.inOut }}
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-5 md:h-20 md:px-10">
          <p className="label text-ash">{label}</p>
          <button type="button" onClick={onClose} className="label group -mr-2 flex h-11 items-center gap-3 px-2" aria-label={closeLabel}>
            Close
            <span className="flex h-9 w-9 items-center justify-center rounded-[2px] border border-ink/20 transition-colors duration-300 group-hover:border-ink/60">
              <X className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" strokeWidth={1.5} />
            </span>
          </button>
        </div>
        <div className="flex flex-1 flex-col px-5 pb-10 pt-10 md:px-10 md:pt-14">{children}</div>
      </motion.div>
    </div>
  )
}
