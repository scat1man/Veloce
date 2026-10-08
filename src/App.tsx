import { MotionConfig } from 'motion/react'
import { startAnalytics } from './analytics'
import { useEffect, useState } from 'react'
import { BookingPanel } from './components/BookingPanel'
import { ErrorBoundary } from './components/ErrorBoundary'
import { MobileBookBar } from './components/MobileBookBar'
import { Navbar } from './components/Navbar'
import { SitePanels } from './components/SitePanels'
import { startSmoothScroll } from './hooks/smoothScroll'
import { SiteProvider } from './hooks/useSite'
import { Footer } from './sections/Footer'
import { HeroReveal } from './sections/HeroReveal'
import { AboutSection } from './sections/AboutSection'
import { ConciergeSection } from './sections/ConciergeSection'
import { ExperienceSection } from './sections/ExperienceSection'
import { LocationsSection } from './sections/LocationsSection'
import { MarquesSection } from './sections/MarquesSection'
import { ShowroomSection } from './sections/ShowroomSection'
import { hasWebGL, stageUI } from './three/store'

/**
 * One main page: the car reveal, the marques, the Showroom, then how a
 * rental works, the cities, the company and the concierge. Booking opens as
 * a side panel from any "Book" action.
 */
export default function App() {
  const [webgl] = useState(() => hasWebGL())

  useEffect(() => {
    if (!webgl) stageUI.set({ webgl: false, ready: true })
  }, [webgl])

  useEffect(() => startSmoothScroll(), [])
  useEffect(() => startAnalytics(), [])

  return (
    // reducedMotion="user": transform & layout animations are dropped for visitors who ask for less motion.
    <MotionConfig reducedMotion="user">
      <SiteProvider>
        <div>
          <a href="#showroom" className="label sr-only fixed left-4 top-4 z-[90] rounded-full bg-bone px-4 py-3 text-ink focus:not-sr-only">
            Skip to content
          </a>

          <Navbar />
          <main className="relative z-10">
            {/* If the 3D studio fails to load, the reveal falls back to photography. */}
            <ErrorBoundary fallback={<HeroReveal />} onError={() => stageUI.set({ webgl: false, ready: true })}>
              <HeroReveal />
            </ErrorBoundary>
            <MarquesSection />
            <ShowroomSection />
            <ExperienceSection />
            <LocationsSection />
            <AboutSection />
            <ConciergeSection />
          </main>
          <Footer />
          <MobileBookBar />
          <BookingPanel />
          <SitePanels />
        </div>
      </SiteProvider>
    </MotionConfig>
  )
}
