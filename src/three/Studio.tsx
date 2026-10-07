import { useCallback, useRef } from 'react'
import { LightRig, type RigState } from './LightRig'
import { LOOKS } from './looks'
import { models } from './models'
import { stage } from './store'
import { lookAt } from './timeline'

/**
 * The 3D act's studio. Each car brings its own look (models.ts → looks.ts);
 * looks only change while the stage is dark, so a studio never visibly "morphs".
 */
export function Studio({ quality }: { quality: 'high' | 'low' }) {
  const hover = useRef(0)
  const state = useRef<RigState>({ from: LOOKS.graphite, to: LOOKS.graphite, mix: 1, light: 0, hover: 0, pool: 1 })

  const read = useCallback((dt: number) => {
    const look = lookAt(stage.screens)
    hover.current += (stage.hover - hover.current) * Math.min(1, dt * 4)
    const s = state.current
    const studio = LOOKS[models[look.model].look]
    s.from = studio
    s.to = studio
    s.mix = 1
    s.light = look.light * stage.reveal
    s.hover = hover.current
    s.pool = 1
    return s
  }, [])

  return <LightRig read={read} quality={quality} />
}
