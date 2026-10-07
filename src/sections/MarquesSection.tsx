import { motion } from 'motion/react'
import { RevealText } from '../animations/RevealText'
import { viewport } from '../animations/tokens'
import { fadeUp, stagger } from '../animations/variants'
import { BrandLogo } from '../components/BrandLogo'
import { brands } from '../data/brands'
import { vehicles } from '../data/vehicles'
import { scrollToHash } from '../hooks/scrollTo'

/**
 * The marques — the badges of every maker we keep, set loose in one quiet row
 * like the brand wall behind a dealer's front desk. A badge brightens on hover
 * and names its home town; choosing it leads to that car in the Showroom.
 */
export function MarquesSection() {
  return (
    <section id="marques" data-nav-theme="dark" aria-labelledby="marques-title" className="relative bg-ink text-bone">
      <div className="gutter pb-28 pt-28 md:pb-40 md:pt-36">
        <div className="mx-auto max-w-[46rem] text-center">
          <RevealText as="h2" id="marques-title" className="font-display text-display" lines={['From Stuttgart to Woking.']} />
          <p className="text-lede mx-auto mt-6 max-w-[36rem] text-stone">
            Porsche, Ferrari, Lamborghini, McLaren, Aston Martin and Mercedes-AMG. One car from each, kept to factory specification.
          </p>
        </div>

        <motion.ul
          className="mx-auto mt-20 grid max-w-[72rem] grid-cols-3 gap-x-6 gap-y-14 md:mt-28 lg:grid-cols-6"
          aria-label="Marques"
          variants={stagger(0.08)}
          initial="hidden"
          whileInView="show"
          viewport={viewport}
        >
          {vehicles.map((v) => {
            const b = brands[v.manufacturer]
            return (
              <motion.li key={v.id} variants={fadeUp}>
                <button
                  type="button"
                  onClick={() => scrollToHash(`#showroom-${v.id}`, { offset: -110 })}
                  aria-label={`${v.manufacturer}: see the ${v.name} in the Showroom`}
                  className="group flex w-full flex-col items-center gap-5 text-center"
                >
                  <span className="flex h-16 w-full items-center justify-center opacity-55 transition-[opacity,transform] duration-500 ease-[var(--ease-out-expo)] group-hover:-translate-y-1 group-hover:opacity-100 group-focus-visible:opacity-100">
                    <BrandLogo manufacturer={v.manufacturer} size="clamp(2.25rem, 3.4vw, 3.25rem)" maxWidth="min(9rem, 100%)" />
                  </span>
                  <span className="meta text-stone opacity-100 transition-opacity duration-500 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-visible:opacity-100">
                    {b ? b.origin.split(',')[0] : v.manufacturer}
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
