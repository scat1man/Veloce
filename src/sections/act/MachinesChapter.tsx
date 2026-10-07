import { motion, useReducedMotion, useTransform } from 'motion/react'
import { BrandLogo } from '../../components/BrandLogo'
import { vehicles } from '../../data/vehicles'
import { scrollToHash } from '../../hooks/scrollTo'
import { chapterStart, MACHINES_LEN } from '../../three/timeline'
import { actScreens, useWindow } from './actScroll'
import { Chapter } from './Chapter'

const start = chapterStart.machines

/**
 * The fleet, introduced. The title rises out of its masks as the camera pulls
 * back, then the six marques arrive one after another along the floor of the
 * frame — each one a way into its car. Scrubbed by scroll, not a timer.
 */
export function MachinesChapter() {
  const reduce = useReducedMotion()
  const { opacity } = useWindow(start - 0.35, start + 0.05, start + MACHINES_LEN - 0.6, start + MACHINES_LEN - 0.2)
  const l1 = useTransform(actScreens, [start - 0.5, start + 0.05], reduce ? ['0%', '0%'] : ['110%', '0%'], { clamp: true })
  const l2 = useTransform(actScreens, [start - 0.4, start + 0.15], reduce ? ['0%', '0%'] : ['110%', '0%'], { clamp: true })
  const sub = useWindow(start - 0.2, start + 0.2, start + 5, start + 6, 16)

  return (
    <Chapter id="machines" label="The fleet" length={MACHINES_LEN}>
      <motion.div className="gutter flex h-full flex-col justify-between pb-8 pt-28 md:pb-12 md:pt-36" style={{ opacity }}>
        <div className="max-w-[44rem]">
          <motion.p className="text-[1.0625rem] font-semibold tracking-[-0.015em] text-stone" style={{ opacity: sub.opacity }}>
            The fleet
          </motion.p>
          <h2 className="font-display text-display mt-3">
            <span className="block overflow-hidden pb-[0.12em] -mb-[0.12em]">
              <motion.span className="block" style={{ y: l1 }}>
                Six cars.
              </motion.span>
            </span>
            <span className="block overflow-hidden pb-[0.12em] -mb-[0.12em] text-stone">
              <motion.span className="block" style={{ y: l2 }}>
                Six marques.
              </motion.span>
            </span>
          </h2>
          <motion.p className="text-lede mt-6 max-w-[26rem] text-stone" style={{ opacity: sub.opacity, y: sub.y }}>
            Each kept to manufacturer specification and inspected before every drive.
          </motion.p>
        </div>

        <ul className="pointer-events-auto grid grid-cols-3 items-center gap-x-4 gap-y-6 md:grid-cols-6 md:gap-x-8" aria-label="Marques">
          {vehicles.map((v, i) => (
            <Marque key={v.id} i={i} manufacturer={v.manufacturer} name={v.name} chapter={v.chapter!} />
          ))}
        </ul>
      </motion.div>
    </Chapter>
  )
}

function Marque({ i, manufacturer, name, chapter }: { i: number; manufacturer: string; name: string; chapter: string }) {
  const at = start - 0.3 + i * 0.045
  const { opacity, y } = useWindow(at, at + 0.22, start + 5, start + 6, 18)
  return (
    <motion.li style={{ opacity, y }} className="flex justify-center">
      <button
        type="button"
        onClick={() => scrollToHash(`#${chapter}`, { offset: window.innerHeight * 1.3 })}
        aria-label={`${manufacturer} ${name}`}
        className="group flex h-16 w-full items-center justify-center opacity-60 transition-opacity duration-300 hover:opacity-100 focus-visible:opacity-100"
      >
        <span className="transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:-translate-y-0.5">
          <BrandLogo manufacturer={manufacturer} size="clamp(1.9rem, 2.6vw, 2.6rem)" maxWidth="7.5rem" />
        </span>
      </button>
    </motion.li>
  )
}
