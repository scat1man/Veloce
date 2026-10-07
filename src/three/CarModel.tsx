import { useGLTF } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { Component, useEffect, useMemo, type ReactNode } from 'react'
import * as THREE from 'three'
import { DRACO_PATH, isSmallScreen, modelUrl, models, type ModelId } from './models'
import { stage } from './store'

type Props = { id: ModelId; onReady?: () => void }

type Fit = { rotationY: number; scale: number; offset: THREE.Vector3; size: THREE.Vector3 }
const fits = new WeakMap<THREE.Object3D, Fit>()

/**
 * Robust fit: bounding boxes from vertex *quantiles* rather than extremes, so a
 * handful of stray vertices (the Porsche file has some ~20 m away) cannot
 * mis-centre or mis-scale the car.
 */
function measure(scene: THREE.Object3D, rotationY: number, length: number): Fit {
  const holder = new THREE.Group()
  const probe = scene.clone(true)
  holder.add(probe)
  probe.rotation.y = rotationY
  holder.updateMatrixWorld(true)

  let total = 0
  probe.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh && m.geometry.attributes.position) total += m.geometry.attributes.position.count
  })
  const stride = Math.max(1, Math.floor(total / 160_000))
  const xs: number[] = []
  const ys: number[] = []
  const zs: number[] = []
  const v = new THREE.Vector3()
  probe.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.geometry.attributes.position) return
    const pos = m.geometry.attributes.position
    for (let i = 0; i < pos.count; i += stride) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)
      xs.push(v.x)
      ys.push(v.y)
      zs.push(v.z)
    }
  })
  const q = (a: number[], t: number) => {
    const s = Float64Array.from(a).sort()
    return s[Math.min(s.length - 1, Math.max(0, Math.round(t * (s.length - 1))))]
  }
  const x0 = q(xs, 0.002), x1 = q(xs, 0.998)
  const z0 = q(zs, 0.002), z1 = q(zs, 0.998)
  const y0 = q(ys, 0.0005), y1 = q(ys, 0.999)
  const rawLength = Math.max(x1 - x0, z1 - z0)
  const scale = length / rawLength
  return {
    rotationY,
    scale,
    offset: new THREE.Vector3(-(x0 + x1) / 2, -y0, -(z0 + z1) / 2),
    size: new THREE.Vector3((x1 - x0) * scale, (y1 - y0) * scale, (z1 - z0) * scale),
  }
}

/** Upgrade the body paint to a clear-coated physical material (same colour/maps). */
function clearcoat(m: THREE.Material): THREE.Material {
  const std = m as THREE.MeshStandardMaterial
  if (!std.isMeshStandardMaterial) return m
  const phys = new THREE.MeshPhysicalMaterial()
  THREE.MeshStandardMaterial.prototype.copy.call(phys, std)
  phys.clearcoat = 1
  phys.clearcoatRoughness = 0.04
  phys.roughness = Math.min(phys.roughness, 0.42)
  phys.envMapIntensity = 1.05
  phys.name = std.name
  return phys
}

// ---- ref-counted lifetime -----------------------------------------------------
const users = new Map<string, number>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function retain(url: string) {
  users.set(url, (users.get(url) ?? 0) + 1)
  clearTimeout(timers.get(url))
}

function release(url: string, scene: THREE.Object3D) {
  const n = (users.get(url) ?? 1) - 1
  users.set(url, n)
  if (n > 0) return
  // Keep it briefly (scrolling back, hovering back), then free GPU + CPU memory.
  timers.set(
    url,
    setTimeout(() => {
      if ((users.get(url) ?? 0) > 0) return
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        m.geometry?.dispose()
        for (const mat of [].concat(m.material as never) as THREE.Material[]) {
          for (const val of Object.values(mat)) if (val instanceof THREE.Texture) val.dispose()
          mat.dispose()
        }
      })
      useGLTF.clear(url)
      users.delete(url)
    }, 30_000),
  )
}

/**
 * <CarModel /> — loads one real vehicle (lite copy on small screens), normalises it
 * and gives the paint a clear-coat. Shared by the act stage, the fleet viewer and
 * the vehicle detail studio.
 */
export function CarModel({ id, onReady }: Props) {
  const spec = models[id]
  const url = useMemo(() => modelUrl(spec, isSmallScreen()), [spec])
  const gltf = useGLTF(url, DRACO_PATH)

  const { object, paints, hit } = useMemo(() => {
    let fit = fits.get(gltf.scene)
    if (!fit) {
      fit = measure(gltf.scene, spec.rotationY, spec.length)
      fits.set(gltf.scene, fit)
    }
    const root = gltf.scene.clone(true)
    const paints: THREE.Material[] = []
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const next = mats.map((m) => {
        if (!spec.paint.test(m.name)) return m
        const p = clearcoat(m)
        if (p !== m) paints.push(p)
        return p
      })
      mesh.material = Array.isArray(mesh.material) ? next : next[0]
    })

    // pivot ← scale ← rotate ← offset, so the fit's numbers apply in order.
    const pivot = new THREE.Group()
    const scaler = new THREE.Group()
    const rotor = new THREE.Group()
    pivot.add(scaler)
    scaler.add(rotor)
    rotor.add(root)
    rotor.rotation.y = fit.rotationY
    scaler.scale.setScalar(fit.scale)
    // Offsets were measured after rotation, so apply them on the scaler side.
    scaler.position.copy(fit.offset).multiplyScalar(fit.scale)
    return { object: pivot, paints, hit: fit.size }
  }, [gltf, spec])

  useEffect(() => {
    retain(url)
    return () => release(url, gltf.scene)
  }, [url, gltf.scene])

  useEffect(() => {
    onReady?.()
  }, [onReady])

  useEffect(() => () => paints.forEach((p) => p.dispose()), [paints])

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    stage.hover = 1
  }
  const out = () => {
    stage.hover = 0
  }

  return (
    <group>
      <primitive object={object} />
      {/* Cheap hover target — raycasting millions of triangles on every move would be wasteful. */}
      <mesh position={[0, hit.y / 2, 0]} onPointerOver={over} onPointerOut={out}>
        <boxGeometry args={[hit.x * 0.92, hit.y, hit.z * 0.95]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  )
}

/** Warm the cache for a model without mounting it (used for "next car" preloading). */
export function preloadModel(id: ModelId) {
  useGLTF.preload(modelUrl(models[id], isSmallScreen()), DRACO_PATH)
}

/**
 * If a model fails, keep the page alive: log the exact asset, render `fallback`.
 */
export class ModelBoundary extends Component<
  { id: ModelId; fallback: ReactNode; children: ReactNode; onError?: (id: ModelId) => void },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: unknown) {
    const spec = models[this.props.id]
    console.error(`[VELOCÉ] 3D model failed to load: ${modelUrl(spec, isSmallScreen())} (source: ${spec.source})`, err)
    this.props.onError?.(this.props.id)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
