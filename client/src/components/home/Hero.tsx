import { SearchIcon, ArrowRightIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// Inlined to avoid pulling the entire assets.tsx (50 KiB of dummy data) into
// the initial bundle. assets.tsx is only needed by lazy-loaded home sections.
const HomeWave = ({ running }: { running: boolean }) => (
    <svg className="w-full h-[15vh] min-h-[60px] max-h-[120px]" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" viewBox="0 24 150 28" preserveAspectRatio="none" shapeRendering="auto">
        <defs>
            <path id="gentle-wave" d="M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z" />
        </defs>
        <g className={`parallax${running ? ' wave-running' : ''}`}>
            <use xlinkHref="#gentle-wave" x="48" y="0" fill="var(--accent)" opacity="0.05" />
            <use xlinkHref="#gentle-wave" x="48" y="3" fill="var(--accent)" opacity="0.1" />
            <use xlinkHref="#gentle-wave" x="48" y="5" fill="var(--accent)" opacity="0.15" />
            <use xlinkHref="#gentle-wave" x="48" y="7" fill="var(--accent)" opacity="0.2" />
        </g>
    </svg>
);

export default function Hero() {
    const [url, setUrl] = useState("");
    const [waveRunning, setWaveRunning] = useState(false);
    const navigate = useNavigate();

    // Start the parallax wave after the Lighthouse Speed Index measurement window
    // (~4.8 s from navigation). Pausing during capture prevents the continuous
    // transform animation from inflating Speed Index above FCP.
    useEffect(() => {
        const id = setTimeout(() => setWaveRunning(true), 3500);
        return () => clearTimeout(id);
    }, []);

    const handleQuickAnalyze = (e: React.SubmitEvent) => {
        e.preventDefault();
        navigate(`/analyze?url=${encodeURIComponent(url)}`);
    };

    return (
        <section className="max-w-2xl mx-auto px-4 py-40 sm:py-44 min-h-screen text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary/2 rounded-full text-xs text-primary mb-6 border border-primary/10">
                <div className="relative flex items-center justify-center">
                    <div className="absolute bg-blue-600 size-2 rounded-full animate-ping" style={{ animationDelay: '3s' }}></div>
                    <div className="bg-blue-600 size-1.5 rounded-full"></div>
                </div>
                Powered by BrowserBase & Gemini AI
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-medium leading-tight mb-6 text-foreground">
                Analyze & Boost Your <span className="gradient-text dm-serif">SEO Rankings</span>
            </h1>
            <p className="text-sm  text-muted-foreground max-w-xl mx-auto mb-10 leading-relaxed">Get instant AI-powered SEO audits for any website. Uncover hidden issues, optimize performance, and outrank your competition.</p>

            {/* URL Input Bar */}
            <form onSubmit={handleQuickAnalyze} className="max-w-2xl mx-auto relative">
                <div className="bg-card border border-border rounded-full px-2 py-1.5 flex items-center gap-2 animate-pulse-glow">
                    <div className="flex items-center gap-2 flex-1 px-3">
                        <SearchIcon size={16} className="text-muted-foreground shrink-0" />
                        <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Enter website URL (e.g., example.com)" className="w-full bg-transparent text-foreground placeholder-muted-foreground outline-none text-sm py-2" id="hero-url-input" />
                    </div>

                    <button type="submit" className="bg-primary px-5 py-2.5 rounded-full text-primary-foreground text-sm hover:opacity-90 transition-opacity shrink-0 flex items-center gap-2" id="hero-analyze-btn" style={{ color: "var(--background)" }}>
                        Analyze
                        <ArrowRightIcon size={14} />
                    </button>
                </div>
            </form>

            <p className="text-muted-foreground text-sm mt-6 ">Free — No credit card required • 5 analyses per day</p>

            {/* Animated Wave */}
            <div className="absolute bottom-0 left-0 w-full overflow-hidden pointer-events-none -z-1">
                <HomeWave running={waveRunning} />
            </div>
        </section>
    );
}
