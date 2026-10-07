import { ContactShadows } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { CarModel, ModelBoundary, preloadModel } from './CarModel'
import type { Group } from 'three'
import type { ModelId } from './models'
import { stage, stageUI } from './store'
import { ACT_CARS, carIndexAt, lookAt } from './timeline'

function Ready() {
  useEffect(() => stageUI.set({ ready: true }), [])
  return null
}

const markFailed = (id: ModelId) => {
  stageUI.set({ failed: { ...stageUI.get().failed, [id]: true } })
  if (id === ACT_CARS[0]) stageUI.set({ ready: true })
}

/**
 * The act shows one car at a time — the car of the chapter under the camera.
 * Only that model is mounted; the *next* one is preloaded once it is up.
 * Swaps happen in the dark between chapters (timeline.ts).
 */
export function Cars({ quality }: { quality: 'high' | 'low' }) {
  const [shown, setShown] = useState<ModelId>(ACT_CARS[0])
  const current = useRef<ModelId>(ACT_CARS[0])
  const group = useRef<Group>(null)

  useFrame(() => {
    const { model, light } = lookAt(stage.screens)
    if (loaded.current && stage.screens > 0.5) {
      const next = ACT_CARS[Math.max(0, carIndexAt(stage.screens)) + 1]
      if (next && !preloaded.current.has(next)) {
        preloaded.current.add(next)
        const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 300))
        idle(() => preloadModel(next))
      }
    }
    // Truly black during brand beats too: the mark owns the screen, the car waits.
    if (group.current) group.current.visible = stage.reveal > 0.002 && light > 0.02
    if (model !== current.current) {
      current.current = model
      setShown(model)
    }
  })

  // Preload only the *next* car, and only once the visitor is actually scrolling —
  // first paint downloads the opening car and nothing else.
  const preloaded = useRef(new Set<ModelId>([ACT_CARS[0]]))
  const loaded = useRef(false)
  const onReady = useCallback(() => {
    loaded.current = true
  }, [])

  return (
    <group key={shown} ref={group}>
      <ModelBoundary id={shown} onError={markFailed} fallback={null}>
        <Suspense fallback={null}>
          <CarModel id={shown} onReady={onReady} />
          <Shadow quality={quality} />
          <Ready />
        </Suspense>
      </ModelBoundary>
    </group>
  )
}

/** Contact shadow, baked a few frames after its car appears. */
function Shadow({ quality }: { quality: 'high' | 'low' }) {
  return (
    <ContactShadows
      frames={6}
      position={[0, 0.004, 0]}
      scale={12}
      far={2}
      blur={2.6}
      opacity={1}
      resolution={quality === 'high' ? 1024 : 512}
      color="#000000"
    />
  )
}
