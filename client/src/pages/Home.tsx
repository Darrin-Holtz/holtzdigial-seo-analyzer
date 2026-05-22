import { lazy, Suspense, useEffect } from "react";
import Hero from "../components/home/Hero";

// Below-fold sections are lazy-loaded so they don't block the initial Hero render.
// Vite splits these into a separate async chunk that starts fetching in parallel
// with React's first paint, reducing initial JS parse cost and improving FCP/LCP.
const Features = lazy(() => import("../components/home/Features"));
const HowItWorks = lazy(() => import("../components/home/HowItWorks"));
const Pricing = lazy(() => import("../components/home/Pricing"));
const Footer = lazy(() => import("../components/home/Footer"));

export default function Home() {
    useEffect(() => { document.title = "Rank Pilot — AI SEO Analyzer"; }, []);
    return (
        <main className="min-h-screen">
            <Hero />
            {/* null fallback: sections are below the fold so no visible layout shift */}
            <Suspense fallback={null}>
                <Features />
                <HowItWorks />
                <Pricing />
                <Footer />
            </Suspense>
        </main>
    );
}
