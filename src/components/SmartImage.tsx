import { motion, type HTMLMotionProps } from 'motion/react'
import { useState, type CSSProperties } from 'react'
import type { SiteImage } from '../data/images'

type Props = Omit<HTMLMotionProps<'img'>, 'src' | 'srcSet' | 'alt'> & {
  image: SiteImage
  sizes?: string
  priority?: boolean
}

/**
 * The only way photography enters the page.
 * Responsive srcSet, lazy by default, art-directed crop from the registry,
 * and a designed fallback so a missing file never shows a broken icon.
 */
export function SmartImage({ image, sizes = '100vw', priority = false, className = '', style, ...rest }: Props) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div
        role="img"
        aria-label={image.alt}
        className={`relative flex items-end overflow-hidden bg-carbon ${className}`}
        style={style as CSSProperties}
      >
        <span className="meta relative p-4 text-stone">Image unavailable</span>
      </div>
    )
  }

  return (
    <motion.img
      src={image.src}
      srcSet={image.srcSet}
      sizes={sizes}
      alt={image.alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : 'auto'}
      draggable={false}
      onError={() => setFailed(true)}
      className={`object-cover [filter:saturate(0.82)_contrast(1.06)_brightness(0.94)] [object-position:var(--pos-m,var(--pos))] md:[object-position:var(--pos)] ${className}`}
      style={{ '--pos': image.position ?? '50% 50%', '--pos-m': image.positionMobile, ...style } as never}
      {...rest}
    />
  )
}
