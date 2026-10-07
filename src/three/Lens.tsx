import { Bloom, EffectComposer, SMAA, Vignette } from '@react-three/postprocessing'

/**
 * Photographic finish, desktop only: lamps and specular hits bloom softly
 * (only genuinely bright pixels — paint stays crisp), a gentle lens vignette,
 * and SMAA to replace the MSAA the composer bypasses.
 */
export function Lens() {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom mipmapBlur intensity={0.18} luminanceThreshold={0.94} luminanceSmoothing={0.15} radius={0.6} />
      <Vignette offset={0.3} darkness={0.5} eskil={false} />
      <SMAA />
    </EffectComposer>
  )
}
