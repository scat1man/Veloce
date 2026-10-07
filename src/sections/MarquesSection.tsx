import { motion } from 'motion/react'
import { RevealText } from '../animations/RevealText'
import { viewport } from '../animations/tokens'
import { fadeUp, stagger } from '../animations/variants'
import { BrandLogo } from '../components/BrandLogo'
import { SectionLabel } from '../components/SectionLabel'
import { brands } from '../data/brands'
import { vehicles } from '../data/vehicles'
import { scrollToHash } from '../hooks/scrollTo'

/**
 * The marques — after the single headline car, every maker we keep, set in a
 * row like the brand wall in a dealership. Each mark leads to its car in the
 * Showroom.
 */
export function MarquesSection() {
  return (
    <section id="marques" data-nav-theme="dark" aria-labelledby="marques-title" className="relative bg-ink text-bone">
      <div className="gutter pb-24 pt-24 md:pb-32 md:pt-32">
        <div className="grid-12 items-end gap-y-6">
          <div className="col-span-12 lg:col-span-7">
            <SectionLabel label="The marques" />
            <RevealText as="h2" id="marques-title" className="font-display text-display mt-4" lines={['Six marques.', { content: 'One collection.', className: 'text-stone' }]} />
          </div>
          <p className="col-span-12 font-text text-[1rem] leading-[1.6] text-stone lg:col-span-4 lg:col-start-9">
            One car from each of six makers, chosen and kept to factory specification. Select a marque to see its car in the Showroom.
          </p>
        </div>

        <motion.ul
          className="mt-14 grid grid-cols-2 border-l border-t border-bone/10 md:mt-20 md:grid-cols-3 lg:grid-cols-6"
          aria-label="Marques"
          variants={stagger(0.06)}
          initial="hidden"
          whileInView="show"
          viewport={viewport}
        >
          {vehicles.map((v) => {
            const b = brands[v.manufacturer]
            return (
              <motion.li key={v.id} variants={fadeUp} className="border-b border-r border-bone/10">
                <button
                  type="button"
                  onClick={() => scrollToHash(`#showroom-${v.id}`, { offset: -110 })}
                  aria-label={`${v.manufacturer}: see the ${v.name} in the Showroom`}
                  className="group flex h-full w-full flex-col items-center justify-between gap-8 px-4 pb-6 pt-10 text-center transition-colors duration-300 hover:bg-bone/[0.04] focus-visible:bg-bone/[0.04] md:pt-12"
                >
                  <span className="flex h-16 items-center opacity-70 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
                    <BrandLogo manufacturer={v.manufacturer} size="clamp(2.25rem, 3vw, 2.9rem)" maxWidth="8.5rem" />
                  </span>
                  <span>
                    <span className="eyebrow block text-bone/85">{v.manufacturer}</span>
                    {b && (
                      <span className="meta mt-1.5 block text-stone">
                        <span className="block">{b.origin}</span>
                        <span className="block text-bone/35">Est. {b.founded}</span>
                      </span>
                    )}
                  </span>
                </button>
              </motion.li>
            )
          })}
        </motion.ul>
      </div>
    </section>
  )
}
