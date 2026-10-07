import { AnimatePresence, motion, useMotionValueEvent } from 'motion/react'
import { useEffect, useState } from 'react'
import { ease } from '../animations/tokens'
import { stageUI, useStageUI } from '../three/store'
import { actScreens } from '../sections/act/actScroll'

/** Wordmark rise (≈1.2 s) + hold (0.5 s). The fade-out (0.7 s) is the exit. */
const FADE_IN_MS = 1200
const HOLD_MS = 500
const SESSION_KEY = 'veloce:intro-seen'
const LETTERS = 'VELOCÉ'.split('')

const seenThisSession = () => {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * The opening ident: black → the VELOCÉ wordmark rises letter by letter and
 * opens out → a short hold → it fades → the car emerges from the dark.
 * Plays once per session; any click or key skips it; reduced motion never sees
 * it (App sets the intro straight to 'text'). If the car is still loading after
 * the hold, a hairline shows progress — never a spinner.
 */
export function BrandIntro() {
  const phase = useStageUI((s) => s.intro)
  const ready = useStageUI((s) => s.ready)
  const progress = useStageUI((s) => s.progress)
  const [repeat] = useState(seenThisSession)
  const [held, setHeld] = useState(repeat)
  const [skipped, setSkipped] = useState(repeat)

  // Once it has started, it has been seen — a reload in this session goes straight to the car.
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, '1')
    } catch {
      /* private mode — the intro simply plays again next time */
    }
  }, [])

  useEffect(() => {
    if (held) return
    const t = setTimeout(() => setHeld(true), FADE_IN_MS + HOLD_MS)
    return () => clearTimeout(t)
  }, [held])

  // Skip: any click or key.
  useEffect(() => {
    if (phase !== 'logo') return
    const skip = () => {
      setHeld(true)
      setSkipped(true)
    }
    window.addEventListener('pointerdown', skip)
    window.addEventListener('keydown', skip)
    return () => {
      window.removeEventListener('pointerdown', skip)
      window.removeEventListener('keydown', skip)
    }
  }, [phase])

  useEffect(() => {
    if (phase === 'logo' && held && ready) {
      stageUI.set({ intro: 'reveal' })
    }
  }, [phase, held, ready])

  useMotionValueEvent(actScreens, 'change', (s) => {
    if (s > 0.08 && stageUI.get().intro !== 'text') stageUI.set({ intro: 'text' })
  })

  const waiting = held && !ready

  return (
    <AnimatePresence>
      {phase === 'logo' && (
        <motion.div
          key="intro"
          aria-label="VELOCÉ"
          role="img"
          className="fixed inset-0 z-[55] flex flex-col items-center justify-center bg-ink"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.7, ease: ease.inOut } }}
        >
          {!skipped && (
            <motion.div
              className="font-wordmark flex overflow-hidden pl-[0.22em] pt-[0.25em] text-[clamp(1.75rem,4.4vw,3.5rem)] leading-none text-bone"
              initial={{ letterSpacing: '0.12em' }}
              animate={{ letterSpacing: '0.22em' }}
              exit={{ opacity: 0, filter: 'blur(6px)', transition: { duration: 0.6, ease: ease.inOut } }}
              transition={{ duration: 1.8, ease: ease.out }}
            >
              {LETTERS.map((l, i) => (
                <motion.span
                  key={i}
                  className="inline-block pb-[0.1em]"
                  initial={{ y: '110%', opacity: 0 }}
                  animate={{ y: '0%', opacity: 1 }}
                  transition={{ delay: 0.15 + i * 0.07, duration: 0.8, ease: ease.out }}
                >
                  {l}
                </motion.span>
              ))}
            </motion.div>
          )}

          {/* Only if the car is still on its way: a hairline, never a spinner. */}
          <motion.div
            aria-hidden
            className="absolute bottom-[40%] h-px w-28 overflow-hidden bg-bone/10"
            initial={{ opacity: 0 }}
            animate={{ opacity: waiting ? 1 : 0 }}
            transition={{ duration: 0.4 }}
          >
            <div
              className="h-px origin-left bg-bone/60 transition-transform duration-300"
              style={{ transform: `scaleX(${progress / 100})` }}
            />
          </motion.div>

        </motion.div>
      )}
    </AnimatePresence>
  )
}
