import { HeroSection } from "@/components/hero-section"
import { LiveStatsTicker } from "@/components/live-stats-ticker"
import { FeaturesGrid } from "@/components/features-grid"

export default function Home() {
  return (
    <div className="min-h-screen">
      <HeroSection />
      <LiveStatsTicker />
      <FeaturesGrid />
    </div>
  )
}
