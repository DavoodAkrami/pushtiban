import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Hero } from "@/components/sections/hero";
import { Features } from "@/components/sections/features";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Showcase } from "@/components/sections/showcase";
import { Benefits } from "@/components/sections/benefits";
import { Integrations } from "@/components/sections/integrations";
// import { Pricing } from "@/components/sections/pricing";
import { Faq } from "@/components/sections/faq";
import { FinalCta } from "@/components/sections/final-cta";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Showcase />
        <Benefits />
        <Integrations />
        {/* <Pricing /> */}
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
