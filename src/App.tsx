import { MotionConfig } from 'motion/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { BookingPanel } from './components/BookingPanel'
import { BrandIntro } from './components/BrandIntro'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Navbar } from './components/Navbar'
import { SitePanels } from './components/SitePanels'
import { SmartImage } from './components/SmartImage'
import { images } from './data/images'
import { startSmoothScroll } from './hooks/smoothScroll'
import { SiteProvider } from './hooks/useSite'
import { Act } from './sections/act/Act'
import { AboutSection } from './sections/AboutSection'
import { ConciergeSection } from './sections/ConciergeSection'
import { ExperienceSection } from './sections/ExperienceSection'
import { FinalCTA } from './sections/FinalCTA'
import { FleetSection } from './sections/FleetSection'
import { Footer } from './sections/Footer'
import { LocationsSection } from './sections/LocationsSection'
import { hasWebGL, stageUI } from './three/store'

// three.js + R3F + drei are only fetched once the page has painted.
const Stage = lazy(() => import('./three/Stage'))

export default function App() {
  const [webgl] = useState(() => hasWebGL())

  useEffect(() => {
    if (!webgl) stageUI.set({ webgl: false, ready: true })
    // Reduced motion: no opening sequence — the page is simply there.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) stageUI.set({ intro: 'text' })
  }, [webgl])

  useEffect(() => startSmoothScroll(), [])

  return (
    // reducedMotion="user": transform & layout animations are dropped for visitors who ask for less motion.
    <MotionConfig reducedMotion="user">
      <SiteProvider>
        <div>
          <a href="#fleet" className="label sr-only fixed left-4 top-4 z-[90] rounded-full bg-bone px-4 py-3 text-ink focus:not-sr-only">
            Skip to content
          </a>

          {webgl ? (
            // If the 3D stage fails (driver fault, chunk failed to load), fall back to the photo stage.
            <ErrorBoundary fallback={<PhotoStage />} onError={() => stageUI.set({ webgl: false, ready: true, intro: 'text' })}>
              <Suspense fallback={null}>
                <Stage />
              </Suspense>
            </ErrorBoundary>
          ) : (
            <PhotoStage />
          )}

          <BrandIntro />
          <Navbar />
          <main className="relative z-10">
            <Act />
            <FleetSection />
            <ExperienceSection />
            <LocationsSection />
            <AboutSection />
            <FinalCTA />
            <ConciergeSection />
          </main>
          <Footer />
          <BookingPanel />
          <SitePanels />
        </div>
      </SiteProvider>
    </MotionConfig>
  )
}

/** No WebGL: a photographic stage keeps the act legible. */
function PhotoStage() {
  return (
    <div className="fixed inset-0 z-0" aria-hidden>
      <SmartImage image={images.gt3Sunset} priority className="h-full w-full opacity-60" />
    </div>
  )
}
