import type { ReactNode } from 'react'

type Props = { id: string; length: number; label: string; children: ReactNode; className?: string }

/**
 * A scroll chapter of the 3D act: transparent (the stage shows through),
 * `length` screens tall, with content pinned for its duration.
 * Pointer events pass through to the canvas except on interactive children.
 */
export function Chapter({ id, length, label, children, className = '' }: Props) {
  return (
    // One extra screen of height, overlapped by the next chapter (-100svh), so the
    // pinned content holds for the chapter's *full* length rather than length − 1.
    <section
      id={id}
      aria-label={label}
      data-nav-theme="dark"
      className="relative"
      style={{ height: `${(length + 1) * 100}svh`, marginBottom: '-100svh' }}
    >
      <div className={`sticky top-0 h-svh overflow-hidden ${className}`}>{children}</div>
    </section>
  )
}
