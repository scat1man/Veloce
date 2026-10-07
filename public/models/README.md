# Vehicle models

The site loads the files in `web/` (and `web/lite/` on small screens). They are
optimised copies of the original files in this folder, which are kept untouched
and are **excluded from production builds** (see `vite.config.ts`).

| Car | Original (source) | Loaded by the site | Notes |
|---|---|---|---|
| Porsche 911 GT3 RS | `2023_porsche_911_gt3_rs.glb` (14.0 MB) | `web/porsche-911-gt3-rs.glb` (1.8 MB) | Draco + WebP. Nose faces −Z (rotated in code). Contains a few stray vertices ~20 m out — handled by robust (quantile) normalisation. |
| Ferrari SF90 Stradale | `法拉利SF90 Stradale.glb` (162.6 MB) | `web/ferrari-sf90-stradale.glb` (4.3 MB), `web/lite/…` (1.9 MB) | **The source is a USDZ archive, not a GLB** — browsers cannot load it. Converted with `usd2gltf` (usd-core 26.8), then Draco + WebP. No author/licence metadata in the file. |
| Lamborghini Revuelto | `free_lamborghini_revuelto.glb` (5.7 MB) | `web/lamborghini-revuelto.glb` (0.8 MB) | Draco + WebP. |
| McLaren 750S | `mc_laren_750s.glb` (126.8 MB, 3.9 M triangles) | `web/mclaren-750s.glb` (2.5 MB) | Simplified to ~630 k triangles (error ≤ 0.08 %), Draco. |
| Aston Martin DB12 Volante | `2024_aston_martin_db12_volante.glb` (13.5 MB) | `web/aston-martin-db12-volante.glb` (1.8 MB) | Draco + WebP. Licence is **CC BY-NC-SA** (non-commercial). |
| Mercedes-AMG GT 63 | `mercedes_amg_gt_63_rigged_model__free.glb` (113.9 MB) | `web/mercedes-amg-gt-63.glb` (5.1 MB), `web/lite/…` (2.6 MB) | Draco, geometry kept full on desktop (simplification visibly dented the bodywork); lite copy simplified to 30 %. |

`standin-*.glb` are retired placeholders — no code references them and they are not shipped.

## Licences (from each file's embedded metadata)

- Porsche 911 GT3 RS — Galaxy Car Showroom, CC BY 4.0
- Lamborghini Revuelto — ALIEEEN, CC BY 4.0
- McLaren 750S — MistHars, CC BY 4.0
- Mercedes-AMG GT 63 — ZRA Performance, CC BY 4.0
- Aston Martin DB12 Volante — OUTPISTON, **CC BY-NC-SA 4.0** (not for commercial use)
- Ferrari SF90 Stradale — **unknown** (no metadata in the supplied file)

Credits are shown in the site footer. Manufacturer names and marks are trademarks of their owners.

## Re-creating the web copies

```bash
SAFE="--instance false --join false --flatten false --palette false --texture-compress webp --texture-size 2048 --compress draco"
npx @gltf-transform/cli@4 optimize <source>.glb web/<name>.glb $SAFE --simplify false
# heavy meshes:
npx @gltf-transform/cli@4 optimize <source>.glb web/<name>.glb $SAFE --simplify true --simplify-ratio 0.1 --simplify-error 0.0008
```

Keep `--join/--flatten/--instance` off — they can break wheel transforms.

## Swapping a model

Point `src` (and optionally `lite`) for the car in `src/three/models.ts` at the new
file, and set `rotationY` so the nose faces +Z. Scale, centring and floor contact are
computed automatically from the model's geometry.
