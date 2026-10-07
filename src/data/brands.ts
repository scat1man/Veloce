/**
 * Manufacturer marks — the supplied SVGs in /public/brands, used as-is.
 *
 * `box` is the artwork's measured bounds inside the file's canvas
 * (fractions of the viewBox width / height), so each mark can be cropped to its ink and sized
 * by optical weight rather than by its canvas.
 */
export type Brand = {
  name: string
  logo: string
  box: { x: number; y: number; w: number; h: number }
  /** viewBox height ÷ width. Square files (the default) need nothing; wide ones must say so. */
  aspect?: number
  /** Optical correction for marks that read light at the same nominal size. */
  scale?: number
  origin: string
  founded: string
}

export const brands: Record<string, Brand> = {
  Porsche: {
    name: 'Porsche',
    logo: '/brands/porsche-logo-svgrepo-com.svg',
    box: { x: 0.045, y: 0.477, w: 0.902, h: 0.043 },
    origin: 'Stuttgart',
    founded: '1931',
  },
  Ferrari: {
    name: 'Ferrari',
    logo: '/brands/ferrari-logo-svgrepo-com.svg',
    box: { x: 0.158, y: 0.015, w: 0.682, h: 0.97 },
    origin: 'Maranello',
    founded: '1947',
  },
  Lamborghini: {
    name: 'Lamborghini',
    logo: '/brands/lamborghini-svgrepo-com.svg',
    box: { x: 0.065, y: 0, w: 0.868, h: 0.998 },
    origin: "Sant'Agata Bolognese",
    founded: '1963',
  },
  McLaren: {
    name: 'McLaren',
    logo: '/brands/mclaren-svgrepo-com.svg',
    box: { x: 0.005, y: 0.23, w: 0.993, h: 0.532 },
    origin: 'Woking',
    founded: '1963',
  },
  'Aston Martin': {
    name: 'Aston Martin',
    // The supplied svgstack artwork (viewBox 113 × 50), copied verbatim — the one canonical Aston mark.
    logo: '/brands/aston-martin.svg',
    box: { x: 0.006, y: 0.2795, w: 0.9896, h: 0.501 },
    aspect: 50 / 113,
    scale: 1.25,
    origin: 'Gaydon',
    founded: '1913',
  },
  'Mercedes-AMG': {
    name: 'Mercedes-AMG',
    logo: '/brands/amg-logo-svgrepo-com.svg',
    box: { x: 0.015, y: 0.453, w: 0.968, h: 0.092 },
    origin: 'Affalterbach',
    founded: '1967',
  },
}
