import { animate, motion, useMotionValueEvent, useReducedMotion, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { BrandLogo } from '../../components/BrandLogo'
import type { Vehicle } from '../../data/vehicles'
import { useSite } from '../../hooks/useSite'
import { stageUI, useStageUI } from '../../three/store'
import { BEAT, CAR_LEN, carStart, copySide } from '../../three/timeline'
import { actScreens, useWindow } from './actScroll'
import { Chapter } from './Chapter'

type Props = { v: Vehicle; i: number }

const num = (s: string) => parseFloat(s.replace(/,/g, ''))

/**
 * One car, three beats — the same grammar for every car, with its own
 * choreography (camera: timeline.ts; studio: looks.ts).
 *   brand  — the marque alone in the dark, then the car's full name
 *   reveal — the light rises on the car; name, one line, two actions
 *   specs  — four manufacturer figures frame the car
 */
export function CarChapter({ v, i }: Props) {
  const s0 = carStart(i)
  const side = copySide(i)
  const { openBooking } = useSite()
  const failed = useStageUI((st) => !!st.failed[v.model3d])

  const reveal = useWindow(s0 + BEAT.reveal - 0.02, s0 + BEAT.reveal + 0.24, s0 + BEAT.specs - 0.26, s0 + BEAT.specs - 0.02, 28)
  const specs = useWindow(s0 + BEAT.specs - 0.02, s0 + BEAT.specs + 0.2, s0 + BEAT.handover - 0.04, s0 + CAR_LEN - 0.06, 20)

  const panel = side === 'right' ? 'lg:col-span-5 lg:col-start-8' : 'lg:col-span-5 lg:col-start-1'
  const nameY = useTransform(actScreens, [s0 + BEAT.reveal - 0.02, s0 + BEAT.reveal + 0.3], ['110%', '0%'], { clamp: true })

  return (
    <Chapter id={`car-${v.id}`} length={CAR_LEN} label={`${v.manufacturer} ${v.name}`}>
      <BrandMark s0={s0} manufacturer={v.manufacturer} name={v.name} />

      {/* Mobile: soften the lower half so copy reads over the car */}
      <motion.div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-ink via-ink/75 to-transparent lg:hidden"
        style={{ opacity: reveal.opacity }}
      />

      {/* Reveal */}
      <motion.div className="gutter relative flex h-full flex-col pb-8 pt-20 md:pb-12 md:pt-28" style={{ opacity: reveal.opacity }}>
        <div className="grid-12 relative mt-auto lg:mb-auto lg:mt-[14svh]">
          <motion.div className={`col-span-12 ${panel}`} style={{ y: reveal.y }}>
            <BrandLogo manufacturer={v.manufacturer} size="1.75rem" maxWidth="9rem" />
            <h2 className="font-display text-headline mt-5 overflow-hidden pb-[0.1em]">
              <span className="sr-only">{v.manufacturer} </span>
              <motion.span className="block" style={{ y: nameY }}>
                {v.name}
              </motion.span>
            </h2>
            <p className="text-lede mt-3 max-w-[24rem] text-stone">{v.tagline}</p>
            {failed && <p className="meta mt-3 text-stone">The 3D model could not be loaded.</p>}
            <div className="pointer-events-auto mt-7 flex flex-wrap items-center gap-x-7 gap-y-3">
              <Button onClick={() => openBooking({ vehicleId: v.id })}>Book a drive</Button>
              {!failed && (
                <Button variant="text" onClick={() => stageUI.set({ exploring: v.model3d })}>
                  Explore in 3D
                </Button>
              )}
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Specification */}
      <motion.div
        className="gutter pointer-events-none absolute inset-0 flex flex-col justify-between pb-14 pt-24 md:pb-16 md:pt-28"
        style={{ opacity: specs.opacity }}
      >
        <div className="grid grid-cols-2 gap-6">
          <Figure value={actScreens} s0={s0} at={0} target={num(v.specs.power)} unit="hp" caption="Peak output" />
          <Figure value={actScreens} s0={s0} at={0.08} target={num(v.specs.sprint)} decimals={1} unit="s" caption={v.specs.sprintLabel} align="right" />
        </div>
        <div className="grid grid-cols-2 gap-6">
          <Figure value={actScreens} s0={s0} at={0.14} target={num(v.specs.topSpeed)} unit="mph" caption="Top speed" />
          <Figure value={actScreens} s0={s0} at={0.2} target={num(v.specs.displacement)} group unit="cc" caption={v.specs.engine} align="right" />
        </div>
      </motion.div>
    </Chapter>
  )
}

/**
 * Brand beat — the manufacturer's mark alone in the dark. It comes into focus
 * (blur → sharp, a slight settle), the car's full name follows beneath it, both
 * hold, then lift away as the light comes up on the car. Scrubbed by scroll.
 */
function BrandMark({ s0, manufacturer, name }: { s0: number; manufacturer: string; name: string }) {
  const reduce = useReducedMotion()
  const range = [s0 + 0.02, s0 + 0.22, s0 + BEAT.brandOut - 0.14, s0 + BEAT.brandOut + 0.02]
  const show = useWindow(range[0], range[1], range[2], range[3], 0)
  const scale = useTransform(actScreens, range, reduce ? [1, 1, 1, 1] : [0.94, 1, 1, 1.02])
  const blur = useTransform(actScreens, range, reduce ? ['blur(0px)', 'blur(0px)', 'blur(0px)', 'blur(0px)'] : ['blur(10px)', 'blur(0px)', 'blur(0px)', 'blur(4px)'])
  const title = useWindow(s0 + 0.18, s0 + 0.32, s0 + BEAT.brandOut - 0.16, s0 + BEAT.brandOut - 0.02, 10)

  return (
    <motion.div className="gutter pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center" style={{ opacity: show.opacity }}>
      <motion.div style={{ scale, filter: blur }}>
        <BrandLogo manufacturer={manufacturer} size="clamp(3.5rem, 6.5vw, 6rem)" />
      </motion.div>
      <motion.p className="mt-10 text-[1.0625rem] font-medium tracking-[-0.015em] text-bone/80 md:mt-12" style={{ opacity: title.opacity, y: title.y }}>
        {manufacturer} {name}
      </motion.p>
    </motion.div>
  )
}

/**
 * Oversized figure. When the specification beat arrives it counts up once, on a
 * clock (0.8 s) rather than scrubbed by scroll — a figure must never come to rest
 * on a number that isn't the car's.
 */
function Figure({
  value,
  s0,
  at,
  target,
  decimals = 0,
  group = false,
  unit,
  caption,
  align = 'left',
}: {
  value: MotionValue<number>
  s0: number
  at: number
  target: number
  decimals?: number
  group?: boolean
  unit: string
  caption: string
  align?: 'left' | 'right'
}) {
  const reduce = useReducedMotion()
  const fmt = (n: number) => (group ? Math.round(n).toLocaleString('en-US') : n.toFixed(decimals))
  const [text, setText] = useState(() => fmt(reduce ? target : 0))
  const played = useRef(false)
  const enter = s0 + BEAT.specs - 0.05

  useMotionValueEvent(value, 'change', (s) => {
    if (played.current || s < enter) return
    played.current = true
    if (reduce) return setText(fmt(target))
    animate(0, target, { delay: at, duration: 0.8, ease: [0.16, 1, 0.3, 1], onUpdate: (n) => setText(fmt(n)) })
  })
  useEffect(() => {
    if (value.get() >= enter && !played.current) {
      played.current = true
      setText(fmt(target))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const right = align === 'right'
  return (
    <figure className={right ? 'text-right' : ''}>
      <div className={`flex items-start gap-1.5 ${right ? 'justify-end' : ''}`}>
        <p className="font-display text-numeral" aria-hidden>
          {text}
        </p>
        <span className="mt-[0.35em] text-[1.0625rem] font-medium text-stone" aria-hidden>
          {unit}
        </span>
        <span className="sr-only">
          {fmt(target)} {unit}
        </span>
      </div>
      <figcaption className={`meta mt-3 max-w-[16rem] text-stone ${right ? 'ml-auto' : ''}`}>{caption}</figcaption>
    </figure>
  )
}
