import { useEffect } from "react";
import Hero from "../components/home/Hero";
import Features from "../components/home/Features";
import HowItWorks from "../components/home/HowItWorks";
import Pricing from "../components/home/Pricing";
import Footer from "../components/home/Footer";

export default function Home() {
    useEffect(() => { document.title = "Rank Pilot — AI SEO Analyzer"; }, []);
    return (
        <div className="min-h-screen">
            <Hero />
            <Features />
            <HowItWorks />
            <Pricing />
            <Footer />
        </div>
    );
}
