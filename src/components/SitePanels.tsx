import { AnimatePresence, motion } from 'motion/react'
import { createPortal } from 'react-dom'
import { fadeUp, maskLine, stagger } from '../animations/variants'
import { privacy, terms, type LegalDoc } from '../data/legal'
import { useHashPanel } from '../hooks/useHashPanel'
import { Button } from './Button'
import { ManageBooking } from './ManageBooking'
import { SideSheet } from './SideSheet'

const TITLE_ID = 'site-panel-title'

/** The sheets opened by #manage, #privacy and #terms links. */
export function SitePanels() {
  const { panel, close } = useHashPanel()
  return createPortal(
    <AnimatePresence>
      {panel === 'manage' && (
        <SideSheet key="manage" label="Manage a booking" closeLabel="Close booking lookup" titleId={TITLE_ID} onClose={close}>
          <ManageBooking titleId={TITLE_ID} onDone={close} />
        </SideSheet>
      )}
      {(panel === 'privacy' || panel === 'terms') && (
        <SideSheet key={panel} label="Legal" closeLabel={`Close ${panel}`} titleId={TITLE_ID} onClose={close}>
          <LegalNote doc={panel === 'privacy' ? privacy : terms} onDone={close} />
        </SideSheet>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function LegalNote({ doc, onDone }: { doc: LegalDoc; onDone: () => void }) {
  return (
    <motion.article className="flex flex-1 flex-col" variants={stagger(0.05, 0.35)} initial="hidden" animate="show">
      <motion.p variants={fadeUp} className="meta text-ash">
        Updated {doc.updated}
      </motion.p>
      <h2 id={TITLE_ID} className="font-display text-headline mt-5">
        <span className="block overflow-hidden pb-[0.1em] -mb-[0.1em]">
          <motion.span variants={maskLine} className="block">
            {doc.title}.
          </motion.span>
        </span>
      </h2>
      <motion.p variants={fadeUp} className="text-lede mt-6 max-w-md text-ash">
        {doc.intro}
      </motion.p>
      <div className="mt-8">
        {doc.sections.map((s) => (
          <motion.section key={s.heading} variants={fadeUp} className="py-5">
            <h3 className="text-[1.0625rem] font-semibold tracking-[-0.015em]">{s.heading}</h3>
            <p className="mt-2 text-[1rem] leading-[1.55] text-ash">{s.body}</p>
          </motion.section>
        ))}
      </div>
      <motion.div variants={fadeUp} className="mt-auto pt-12">
        <Button tone="onLight" variant="text" onClick={onDone}>
          Back to the site
        </Button>
      </motion.div>
    </motion.article>
  )
}
