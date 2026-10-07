import { motion } from 'motion/react'
import { ArrowUp, ArrowUpRight } from 'lucide-react'
import { duration, ease, viewport } from '../animations/tokens'
import { fadeUp, stagger } from '../animations/variants'
import { brand, credit, footerLinks, guestLinks, socialLinks } from '../data/content'
import { scrollToHash } from '../hooks/scrollTo'
import { models } from '../three/models'

const socials = socialLinks.filter((s) => s.url)
const linkClass = 'label group inline-flex items-center gap-1.5 text-bone/80 transition-colors hover:text-bone'

export function Footer() {
  return (
    <footer data-nav-theme="dark" className="relative bg-ink text-bone">
      <div className="gutter pt-24 md:pt-32">
        <motion.div
          className="grid-12 gap-y-14"
          variants={stagger(0.08)}
          initial="hidden"
          whileInView="show"
          viewport={viewport}
        >
          <motion.div variants={fadeUp} className="col-span-12 md:col-span-6 lg:col-span-4">
            <p className="font-wordmark mb-5 text-[0.9375rem]">VELOCÉ</p>
            <p className="text-lede max-w-[26rem] text-stone">Six exceptional cars in five cities, delivered to your door.</p>
          </motion.div>

          <motion.nav variants={fadeUp} aria-label="Footer" className="col-span-6 md:col-span-3 lg:col-span-2 lg:col-start-6">
            <p className="meta mb-5 text-stone">Explore</p>
            <ul className="space-y-3">
              {footerLinks.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    onClick={(e) => {
                      e.preventDefault()
                      scrollToHash(l.href)
                    }}
                    className="label text-bone/80 transition-colors hover:text-bone"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </motion.nav>

          <motion.nav variants={fadeUp} aria-label="Guests" className="col-span-6 md:col-span-3 lg:col-span-2">
            <p className="meta mb-5 text-stone">Guests</p>
            <ul className="space-y-3">
              {guestLinks.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className={linkClass}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </motion.nav>

          <motion.div variants={fadeUp} id="contact" className="col-span-12 md:col-span-6 lg:col-span-3">
            <p className="meta mb-5 text-stone">Contact</p>
            <ul className="space-y-3 text-[0.9375rem]">
              <li>
                <a href={`mailto:${brand.email}`} className="link-underline">
                  {brand.email}
                </a>
              </li>
              <li className="text-bone/70">{brand.phone}</li>
              <li className="meta pt-2 text-stone">Concierge, 7am to 11pm local time</li>
            </ul>
            {socials.length > 0 && (
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3" aria-label="Follow">
                {socials.map((s) => (
                  <li key={s.label}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                      {s.label}
                      <ArrowUpRight
                        className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                        strokeWidth={1.5}
                      />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </motion.div>
      </div>

      {/* Monumental wordmark — set to the full measure with SVG so it fits any width exactly */}
      <div className="gutter mt-20 md:mt-28" aria-hidden>
        <motion.svg
          viewBox="0 0 1000 236"
          className="block h-auto w-full overflow-hidden"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
        >
          <motion.g
            className="text-bone/90"
            variants={{
              hidden: { y: 240 },
              show: { y: 0, transition: { duration: duration.hero, ease: ease.out } },
            }}
          >
            <text
              x={0}
              y={226}
              textLength={1000}
              lengthAdjust="spacing"
              className="fill-current font-semibold"
              style={{ fontSize: 268 }}
            >
              {brand.name}
            </text>
          </motion.g>
        </motion.svg>
      </div>

      <div className="gutter">
        <div className="meta mt-6 grid gap-5 py-6 text-stone md:mt-8 md:grid-cols-12 md:items-start">
          <div className="space-y-2 md:col-span-2">
            <p>© {new Date().getFullYear()} {brand.name}</p>
            {credit.label &&
              (credit.url ? (
                <a href={credit.url} target="_blank" rel="noopener" className="link-underline text-bone/80">
                  {credit.label}
                </a>
              ) : (
                <p className="text-bone/80">{credit.label}</p>
              ))}
          </div>
          <p className="md:col-span-6 md:text-[0.75rem]">{brand.disclaimer}</p>
          <details className="group md:col-span-3 md:text-right">
            <summary className="cursor-pointer list-none transition-colors hover:text-bone [&::-webkit-details-marker]:hidden">
              Credits <span className="inline-block transition-transform group-open:rotate-45">+</span>
            </summary>
            <ul className="mt-4 space-y-2 text-left md:text-right md:text-[0.75rem]">
              {Object.values(models).map((m) => (
                <li key={m.id}>
                  3D: {m.credit.url ? <a className="link-underline text-bone/80" href={m.credit.url} target="_blank" rel="noopener noreferrer">{m.credit.title}</a> : m.credit.title}{' '}
                  — {m.credit.author} · {m.credit.license}
                </li>
              ))}
              <li>Photography via Unsplash (Unsplash License) — see /images/CREDITS.md · Aston Martin mark: svgstack.com · Manufacturer marks are trademarks of their owners.</li>
            </ul>
          </details>
          <button
            type="button"
            onClick={() => scrollToHash('#top')}
            className="meta group flex items-center gap-2 text-bone md:col-span-1 md:justify-self-end"
            aria-label="Back to top"
          >
            Top
            <ArrowUp className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-y-0.5" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </footer>
  )
}
