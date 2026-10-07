import { motion } from 'motion/react'
import { RevealText } from '../animations/RevealText'
import { Reveal } from '../animations/Reveal'
import { ease, viewport } from '../animations/tokens'
import { fadeUp, stagger } from '../animations/variants'
import { BookingForm } from '../components/BookingPanel'
import { SectionLabel } from '../components/SectionLabel'
import { brand } from '../data/content'

/** The request card rises into place and settles, like a sheet laid on a desk. */
const cardIn = {
  hidden: { opacity: 0, y: 48, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.9, ease: ease.out } },
}

const steps = [
  { t: 'Request', d: 'Car, city and dates. It takes a minute.' },
  { t: 'Confirm', d: 'A concierge calls within two hours to arrange the details.' },
  { t: 'Drive', d: 'Delivered, fuelled and explained, wherever you are.' },
]

/** Book a drive — the booking experience in the page rather than behind a button. */
export function ConciergeSection() {
  return (
    <section id="concierge" data-nav-theme="light" aria-labelledby="concierge-title" className="bg-paper text-ink">
      <div className="gutter pb-28 pt-28 md:pb-40 md:pt-40">
        <div className="grid-12 gap-y-16">
          <div className="col-span-12 lg:col-span-5">
            <SectionLabel label="Book a drive" tone="onLight" />
            <RevealText as="h2" id="concierge-title" className="font-display text-display mt-3" lines={['Your car,', { content: 'at your door.', className: 'text-ash' }]} />
            <Reveal className="mt-6 max-w-md" delay={0.15}>
              <p className="text-lede text-ash">Tell us the car, the city and your dates. Nothing is charged until a concierge has confirmed every detail with you.</p>
            </Reveal>

            <motion.ol className="mt-12 max-w-md" variants={stagger(0.1)} initial="hidden" whileInView="show" viewport={viewport}>
              {steps.map((s) => (
                <motion.li key={s.t} variants={fadeUp} className="py-4">
                  <p className="text-[1.0625rem] font-semibold tracking-[-0.015em]">{s.t}</p>
                  <p className="mt-1 text-[1rem] leading-[1.5] text-ash">{s.d}</p>
                </motion.li>
              ))}
            </motion.ol>
            <p className="meta mt-6 text-ash">
              Prefer to talk?{' '}
              <a className="link-underline text-ink" href={`mailto:${brand.email}`}>
                {brand.email}
              </a>
            </p>
            <p className="meta mt-3 text-ash">
              Already requested?{' '}
              <a className="link-underline text-ink" href="#manage">
                Check its status
              </a>
            </p>
          </div>

          {/* The observed element stays untransformed so the in-view check is reliable. */}
          <motion.div className="col-span-12 lg:col-span-6 lg:col-start-7" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }}>
            <motion.div variants={cardIn} className="flex min-h-full flex-col rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(10,10,11,0.04),0_24px_60px_-24px_rgba(10,10,11,0.18)] md:p-10">
              <BookingForm inline />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
