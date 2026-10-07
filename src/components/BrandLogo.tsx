import { useState, type CSSProperties } from 'react'
import { brands } from '../data/brands'

type Props = {
  manufacturer: string
  /** Visual size: the mark is scaled by optical weight, so wide wordmarks and tall crests read evenly. */
  size: string
  tone?: 'onDark' | 'onLight'
  className?: string
  style?: CSSProperties
  /** Upper bound on width (e.g. '80vw'). */
  maxWidth?: string
}

/**
 * The manufacturer's supplied SVG, cropped to its artwork.
 * The files are black artwork, several on opaque white panels. An SVG filter
 * (index.html) maps luminance to alpha: ink becomes the site's colour, white
 * panels become transparent — on any ground, inside any composited layer.
 * If the file fails, the name is set in small capitals and the miss is logged.
 */
export function BrandLogo({ manufacturer, size, tone = 'onDark', className = '', style, maxWidth = '84vw' }: Props) {
  const brand = brands[manufacturer]
  const [failed, setFailed] = useState(!brand)

  if (failed || !brand) {
    return (
      <span role="img" aria-label={manufacturer} className={`label inline-block ${className}`} style={style}>
        {manufacturer}
      </span>
    )
  }

  const { x, y, w, h } = brand.box
  const canvas = brand.aspect ?? 1
  // Visible artwork proportions, in the file's own units.
  const aspect = w / (h * canvas)
  const width = `min(${maxWidth}, calc(${size} * ${(Math.sqrt(aspect) * (brand.scale ?? 1)).toFixed(3)}))`

  return (
    <span
      role="img"
      aria-label={brand.name}
      className={`relative block shrink-0 overflow-hidden ${className}`}
      style={{ width, aspectRatio: `${aspect.toFixed(4)}`, ...style }}
    >
      <img
        src={brand.logo}
        alt=""
        width={Math.round(1000 / w)}
        height={Math.round((1000 / w) * canvas)}
        draggable={false}
        decoding="async"
        onError={() => {
          console.warn(`[VELOCÉ] Brand logo failed to load: ${brand.logo}`)
          setFailed(true)
        }}
        className="block h-auto max-w-none select-none"
        style={{
          width: `${(100 / w).toFixed(3)}%`,
          marginLeft: `${(-(x / w) * 100).toFixed(3)}%`,
          // Percentage margins resolve against the container's *width*, so convert the y offset.
          marginTop: `${(-((y * canvas) / w) * 100).toFixed(3)}%`,
          filter: `url(#logo-${tone === 'onDark' ? 'on-dark' : 'on-light'})`,
        }}
      />
    </span>
  )
}
