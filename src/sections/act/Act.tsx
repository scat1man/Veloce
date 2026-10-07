import { useEffect, useRef } from 'react'
import { vehicleById } from '../../data/vehicles'
import { stage, stageUI, useStageUI } from '../../three/store'
import { ACT_CARS } from '../../three/timeline'
import { actScreens } from './actScroll'
import { CarChapter } from './CarChapter'
import { HeroChapter } from './HeroChapter'

/**
 * The 3D act: the hero, then a chapter for the headline car — all transparent,
 * scrolling over the fixed WebGL stage. Owns the scroll → stage bridge and tells
 * the renderer when to sleep.
 */
export function Act() {
  const ref = useRef<HTMLDivElement>(null)
  const probe = useRef<HTMLDivElement>(null)
  const exploring = useStageUI((s) => s.exploring)

  useEffect(() => {
    const el = ref.current!
    let top = 0
    let vh = window.innerHeight
    const update = () => {
      const s = (window.scrollY - top) / vh
      stage.screens = s
      actScreens.set(s)
    }
    const measure = () => {
      top = el.getBoundingClientRect().top + window.scrollY
      // Chapters are sized in svh; measure the same unit the CSS uses.
      vh = probe.current?.offsetHeight || window.innerHeight
      update()
    }
    measure()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', measure)
    const io = new IntersectionObserver(([e]) => stageUI.set({ active: e.isIntersecting }))
    io.observe(el)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', measure)
      io.disconnect()
    }
  }, [])

  return (
    <div
      ref={ref}
      className="pointer-events-none relative flow-root transition-opacity duration-700"
      style={{ opacity: exploring ? 0 : 1 }}
      inert={exploring ? true : undefined}
    >
      <div ref={probe} aria-hidden className="pointer-events-none absolute left-0 top-0 h-svh w-px" />
      <HeroChapter />
      {ACT_CARS.map((id, i) => {
        const v = vehicleById(id)!
        return <CarChapter key={v.id} v={v} i={i} />
      })}
      {/* Gives the last chapter its final screen before the marques slide over it */}
      <div aria-hidden className="h-svh" />
    </div>
  )
}
