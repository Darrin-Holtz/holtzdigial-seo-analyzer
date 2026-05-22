import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import ScoreGauge from "../components/ScoreGauge";
import IssueCard from "../components/IssueCard";
import { ArrowLeft, Globe, Clock, FileText, Image, Link2, Heading, Tag, AlertCircle, ExternalLink, Type, Search, Download, Smartphone, Zap, Code } from "lucide-react";
import { api } from "../lib/api";

interface AnalysisData {
    _id: string;
    url: string;
    overallScore: number;
    status: string;
    createdAt: string;
    loadTime: number;
    pageSize: number;
    wordCount: number;
    categories: {
        seo: number;
        performance: number;
        accessibility: number;
        bestPractices: number;
    };
    metaData: {
        title: string;
        description: string;
        canonical: string;
        robots: string;
        ogTitle: string;
        ogDescription: string;
        ogImage: string;
        twitterCard: string;
        viewport: string;
        charset: string;
    };
    headings: {
        h1: number;
        h2: number;
        h3: number;
        h4: number;
        h5: number;
        h6: number;
        h1Texts: string[];
    };
    links: {
        internal: number;
        external: number;
        total: number;
        broken: number;
    };
    images: {
        total: number;
        missingAlt: number;
        withAlt: number;
    };
    keywords: { word: string; count: number; density: number }[];
    issues: { severity: string; category: string; message: string; recommendation: string }[];
    coreWebVitals?: { fcp: number | null; lcp: number | null; cls: number | null; ttfb: number | null };
    mobileFriendliness?: { isMobileFriendly: boolean; issues: string[] };
    robotsTxt?: { exists: boolean; allowsCrawling: boolean; sitemapUrl: string | null };
    structuredData?: object[];
}

export default function Report() {
    const { id } = useParams();
    const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
    const [prevAnalysis, setPrevAnalysis] = useState<AnalysisData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState("overview");
    useEffect(() => {
        if (analysis?.url) {
            const domain = new URL(analysis.url).hostname.replace(/^www\./, "");
            document.title = `SEO Report: ${domain} — Rank Pilot`;
        } else {
            document.title = "SEO Report — Rank Pilot";
        }
    }, [analysis?.url]);

    // ── CSV Export ────────────────────────────────────────────────────────────
    const exportCSV = () => {
        if (!analysis) return;
        const rows = [
            ["Field", "Value"],
            ["URL", analysis.url],
            ["Date", new Date(analysis.createdAt).toLocaleString()],
            ["Overall Score", analysis.overallScore],
            ["SEO Score", analysis.categories.seo],
            ["Performance Score", analysis.categories.performance],
            ["Accessibility Score", analysis.categories.accessibility],
            ["Best Practices Score", analysis.categories.bestPractices],
            ["Load Time (ms)", analysis.loadTime],
            ["Page Size (KB)", Math.round(analysis.pageSize / 1024)],
            ["Word Count", analysis.wordCount],
            ["LCP (ms)", analysis.coreWebVitals?.lcp ?? "N/A"],
            ["FCP (ms)", analysis.coreWebVitals?.fcp ?? "N/A"],
            ["CLS", analysis.coreWebVitals?.cls ?? "N/A"],
            ["TTFB (ms)", analysis.coreWebVitals?.ttfb ?? "N/A"],
            ["Mobile Friendly", analysis.mobileFriendliness?.isMobileFriendly ?? "N/A"],
            ["Internal Links", analysis.links.internal],
            ["External Links", analysis.links.external],
            ["Broken Links", analysis.links.broken ?? 0],
            ["Total Images", analysis.images.total],
            ["Images Missing Alt", analysis.images.missingAlt],
            [],
            ["Issues"],
            ["Severity", "Category", "Message", "Recommendation"],
            ...analysis.issues.map((i) => [i.severity, i.category, `"${i.message.replace(/"/g, '""')}"`, `"${i.recommendation.replace(/"/g, '""')}"`]),
        ];
        const csv = rows.map((r) => r.join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `seo-report-${new URL(analysis.url).hostname}-${new Date(analysis.createdAt).toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    // ── Print-to-PDF ──────────────────────────────────────────────────────────
    const exportPDF = () => window.print();

    const fetchAnalysis = async () => {
        try {
            const res = await api.get(`/api/analysis/${id}`);
            if (res.data.success) {
                if (res.data.analysis.status === "processing") {
                    setTimeout(fetchAnalysis, 2000);
                    return;
                }
                const current = res.data.analysis;
                setAnalysis(current);

                // Fetch previous analysis of same URL for historical comparison
                try {
                    const listRes = await api.get(`/api/analysis/list?limit=50`);
                    if (listRes.data.success) {
                        const others = listRes.data.analyses.filter(
                            (a: AnalysisData) => a.url === current.url && a._id !== current._id && a.status === "completed"
                        );
                        if (others.length > 0) {
                            // Pick the most recent previous run
                            others.sort((a: AnalysisData, b: AnalysisData) =>
                                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                            );
                            const prevRes = await api.get(`/api/analysis/${others[0]._id}`);
                            if (prevRes.data.success) setPrevAnalysis(prevRes.data.analysis);
                        }
                    }
                } catch { /* comparison is optional */ }
            } else {
                setError(res.data.message || "Failed to fetch analysis.");
            }
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || "Failed to fetch analysis.");
        } finally {
            setLoading(false);
        }
    };

    const getScoreClass = (s: number) => {
        if (s >= 80) return "score-good";
        if (s >= 50) return "score-medium";
        return "score-poor";
    };

    const getScoreBgClass = (s: number) => {
        if (s >= 80) return "score-bg-good";
        if (s >= 50) return "score-bg-medium";
        return "score-bg-poor";
    };

    const tabs = [
        { id: "overview", label: "Overview" },
        { id: "meta", label: "Meta Tags" },
        { id: "content", label: "Content" },
        { id: "vitals", label: "Vitals" },
        { id: "issues", label: "Issues" },
        ...(prevAnalysis ? [{ id: "compare", label: "Compare" }] : []),
    ];

    useEffect(() => {
        (async () => await fetchAnalysis())();
    }, [id]);

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center">
                    <div className="size-7 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground text-sm">Loading report...</p>
                </div>
            </div>
        );
    }

    if (error || !analysis) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center bg-card border border-border rounded-2xl p-10">
                    <AlertCircle size={48} className="mx-auto text-danger mb-4" />
                    <h2 className="text-xl font-bold text-foreground mb-2">Report Not Found</h2>
                    <p className="text-muted-foreground text-sm mb-6">{error || "This analysis doesn't exist."}</p>
                    <Link to="/dashboard" className="bg-primary px-5 py-2.5 rounded-xl text-sm font-semibold text-primary-foreground inline-block" style={{ color: "var(--background)" }}>
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    if (analysis.status === "failed") {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center bg-card border border-border rounded-2xl p-10">
                    <AlertCircle size={48} className="mx-auto text-danger mb-4" />
                    <h2 className="text-xl font-bold text-foreground mb-2">Analysis Failed</h2>
                    <p className="text-muted-foreground text-sm mb-6">The AI model might be down. Please try again later.</p>
                    <Link to="/analyze" className="bg-primary px-5 py-2.5 rounded-xl text-sm font-semibold text-primary-foreground inline-block" style={{ color: "var(--background)" }}>
                        Try Again
                    </Link>
                </div>
            </div>
        );
    }

    const criticalCount = analysis.issues.filter((i) => i.severity === "critical").length;
    const warningCount = analysis.issues.filter((i) => i.severity === "warning").length;
    const infoCount = analysis.issues.filter((i) => i.severity === "info").length;

    return (
        <div className="min-h-screen pt-16 md:pt-24 bg-background">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
                {/* Back + Header */}
                <div className="mb-8">
                    <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
                        <ArrowLeft size={16} />
                        Back to Dashboard
                    </Link>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                            <h1 className="text-2xl font-medium text-foreground truncate">{new URL(analysis.url).hostname}</h1>
                            <div className="flex items-center gap-3 mt-1">
                                <a href={analysis.url} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary truncate flex items-center gap-1 transition-colors">
                                    {analysis.url}
                                    <ExternalLink size={12} />
                                </a>
                                <span className="text-xs text-muted-foreground">
                                    {new Date(analysis.createdAt).toLocaleDateString()} at {new Date(analysis.createdAt).toLocaleTimeString()}
                                </span>
                            </div>
                        </div>
                        {/* Export buttons */}
                        <div className="flex items-center gap-2 print:hidden">
                            <button onClick={exportCSV} className="glass px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 hover:bg-muted/50 transition-all text-foreground">
                                <Download size={14} />
                                CSV
                            </button>
                            <button onClick={exportPDF} className="glass px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 hover:bg-muted/50 transition-all text-foreground">
                                <Download size={14} />
                                PDF
                            </button>
                        </div>
                    </div>
                </div>

                {/* Score Hero */}
                <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 mb-6" style={{ animationDelay: "100ms" }}>
                    <div className="flex flex-col md:flex-row items-center gap-8">
                        {/* Overall Score */}
                        <ScoreGauge score={analysis.overallScore} size={160} strokeWidth={12} label="Overall Score" />

                        {/* Category Scores */}
                        <div className="flex-1 w-full">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                {[
                                    { label: "SEO", value: analysis.categories.seo, icon: <Search size={18} /> },
                                    { label: "Performance", value: analysis.categories.performance, icon: <Clock size={18} /> },
                                    { label: "Accessibility", value: analysis.categories.accessibility, icon: <Globe size={18} /> },
                                    { label: "Best Practices", value: analysis.categories.bestPractices, icon: <Tag size={18} /> },
                                ].map((cat) => (
                                    <div key={cat.label} className={`rounded-xl p-4 border text-center ${getScoreBgClass(cat.value)}`}>
                                        <div className="flex items-center justify-center gap-1.5 mb-2 text-muted-foreground/80">
                                            {cat.icon}
                                            <span className="text-xs font-medium">{cat.label}</span>
                                        </div>
                                        <p className={`text-2xl font-bold ${getScoreClass(cat.value)}`}>{cat.value}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Quick Stats */}
                            <div className="grid grid-cols-3 gap-3 mt-4">
                                <div className="bg-muted/30 border border-border rounded-xl p-3 text-center">
                                    <p className="text-lg font-bold text-primary">{analysis.loadTime}ms</p>
                                    <p className="text-[10px] text-muted-foreground">Load Time</p>
                                </div>
                                <div className="bg-muted/30 border border-border rounded-xl p-3 text-center">
                                    <p className="text-lg font-bold text-secondary">{Math.round(analysis.pageSize / 1024)}KB</p>
                                    <p className="text-[10px] text-muted-foreground">Page Size</p>
                                </div>
                                <div className="bg-muted/30 border border-border rounded-xl p-3 text-center">
                                    <p className="text-lg font-bold text-accent">{analysis.wordCount.toLocaleString()}</p>
                                    <p className="text-[10px] text-muted-foreground">Words</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mb-6 overflow-x-auto pb-1" style={{ animationDelay: "200ms" }}>
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.id ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                            style={activeTab === tab.id ? { color: "var(--background)" } : {}}
                        >
                            {tab.label}
                            {tab.id === "issues" && analysis.issues.length > 0 && <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-danger/20 text-danger">{analysis.issues.length}</span>}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div key={activeTab}>
                    {activeTab === "overview" && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Issues Summary */}
                            <div className="bg-card border border-border rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                    <AlertCircle size={20} className="text-danger" />
                                    Issues Summary
                                </h3>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="severity-critical rounded-xl p-4 text-center">
                                        <p className="text-2xl font-bold">{criticalCount}</p>
                                        <p className="text-xs mt-1">Critical</p>
                                    </div>
                                    <div className="severity-warning rounded-xl p-4 text-center">
                                        <p className="text-2xl font-bold">{warningCount}</p>
                                        <p className="text-xs mt-1">Warnings</p>
                                    </div>
                                    <div className="severity-info rounded-xl p-4 text-center">
                                        <p className="text-2xl font-bold">{infoCount}</p>
                                        <p className="text-xs mt-1">Info</p>
                                    </div>
                                </div>

                                {analysis.issues.length > 0 && (
                                    <div className="mt-4 space-y-2">
                                        {analysis.issues.slice(0, 3).map((issue, i) => (
                                            <IssueCard key={i} issue={issue} />
                                        ))}
                                        {analysis.issues.length > 3 && (
                                            <button onClick={() => setActiveTab("issues")} className="w-full text-center text-sm text-primary hover:underline py-2">
                                                View all {analysis.issues.length} issues →
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Links & Images */}
                            <div className="space-y-6">
                                <div className="bg-card border border-border rounded-2xl p-6">
                                    <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                        <Link2 size={20} className="text-primary" />
                                        Links Analysis
                                    </h3>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="glass rounded-xl p-4 text-center">
                                            <p className="text-2xl font-bold text-primary">{analysis.links.internal}</p>
                                            <p className="text-xs text-gray-500">Internal</p>
                                        </div>
                                        <div className="glass rounded-xl p-4 text-center">
                                            <p className="text-2xl font-bold text-secondary">{analysis.links.external}</p>
                                            <p className="text-xs text-gray-500">External</p>
                                        </div>
                                        <div className="glass rounded-xl p-4 text-center">
                                            <p className="text-2xl font-bold text-accent">{analysis.links.total}</p>
                                            <p className="text-xs text-gray-500">Total</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-card border border-border rounded-2xl p-6">
                                    <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                        <Image size={20} className="text-accent" />
                                        Images Audit
                                    </h3>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="glass rounded-xl p-4 text-center">
                                            <p className="text-2xl font-bold">{analysis.images.total}</p>
                                            <p className="text-xs text-gray-500">Total</p>
                                        </div>
                                        <div className="glass rounded-xl p-4 text-center">
                                            <p className="text-2xl font-bold text-success">{analysis.images.withAlt}</p>
                                            <p className="text-xs text-gray-500">With Alt</p>
                                        </div>
                                        <div className="glass rounded-xl p-4 text-center">
                                            <p className={`text-2xl font-bold ${analysis.images.missingAlt > 0 ? "text-danger" : "text-success"}`}>{analysis.images.missingAlt}</p>
                                            <p className="text-xs text-gray-500">Missing Alt</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Headings */}
                            <div className="bg-card border border-border rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                    <Heading size={20} className="text-secondary" />
                                    Heading Structure
                                </h3>
                                <div className="space-y-2">
                                    {["h1", "h2", "h3", "h4", "h5", "h6"].map((tag) => {
                                        const count = analysis.headings[tag as keyof typeof analysis.headings] as number;
                                        const maxBar = Math.max(analysis.headings.h1, analysis.headings.h2, analysis.headings.h3, analysis.headings.h4, analysis.headings.h5, analysis.headings.h6, 1);
                                        return (
                                            <div key={tag} className="flex items-center gap-3">
                                                <span className="text-xs font-mono text-gray-400 w-6 uppercase">{tag}</span>
                                                <div className="flex-1 h-6 rounded-lg bg-white/5 overflow-hidden">
                                                    <div className="h-full rounded-lg gradient-bg transition-all" style={{ width: `${(count / maxBar) * 100}%`, minWidth: count > 0 ? "20px" : "0" }} />
                                                </div>
                                                <span className={`text-sm font-bold w-6 text-right ${tag === "h1" && count !== 1 ? "text-danger" : ""}`}>{count}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                {analysis.headings.h1Texts.length > 0 && (
                                    <div className="mt-4 p-3 rounded-xl bg-white/3 border border-white/5">
                                        <p className="text-xs text-gray-500 mb-1">H1 Text:</p>
                                        {analysis.headings.h1Texts.map((text, i) => (
                                            <p key={i} className="text-sm text-gray-300 truncate">
                                                {text}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Keywords */}
                            <div className="bg-card border border-border rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                    <Type size={20} className="text-warning" />
                                    Top Keywords
                                </h3>
                                {analysis.keywords.length > 0 ? (
                                    <div className="space-y-2">
                                        {analysis.keywords.map((kw, i) => (
                                            <div key={kw.word} className="flex items-center gap-3">
                                                <span className="text-xs text-gray-500 w-4">{i + 1}</span>
                                                <span className="flex-1 text-sm font-medium">{kw.word}</span>
                                                <span className="text-xs text-gray-400">{kw.count}×</span>
                                                <div className="w-16 h-1.5 rounded-full bg-white/5 overflow-hidden">
                                                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(kw.density * 10, 100)}%` }} />
                                                </div>
                                                <span className="text-xs text-gray-500 w-12 text-right">{kw.density}%</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500">No keyword data available.</p>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === "meta" && (
                        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                            <h3 className="text-lg font-semibold text-foreground mb-6 flex items-center gap-2">
                                <FileText size={20} className="text-primary" />
                                Meta Tags Analysis
                            </h3>
                            <div className="space-y-4">
                                {[
                                    { label: "Title", value: analysis.metaData.title, ideal: "50-60 characters", len: analysis.metaData.title.length },
                                    { label: "Description", value: analysis.metaData.description, ideal: "150-160 characters", len: analysis.metaData.description.length },
                                    { label: "Canonical URL", value: analysis.metaData.canonical },
                                    { label: "Robots", value: analysis.metaData.robots },
                                    { label: "Viewport", value: analysis.metaData.viewport },
                                    { label: "Charset", value: analysis.metaData.charset },
                                    { label: "OG Title", value: analysis.metaData.ogTitle },
                                    { label: "OG Description", value: analysis.metaData.ogDescription },
                                    { label: "OG Image", value: analysis.metaData.ogImage },
                                    { label: "Twitter Card", value: analysis.metaData.twitterCard },
                                ].map((meta) => (
                                    <div key={meta.label} className="bg-muted/50 border border-border rounded-xl p-4">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-medium text-foreground">{meta.label}</span>
                                            <div className="flex items-center gap-2">
                                                {meta.len !== undefined && <span className="text-xs text-muted-foreground">{meta.len} chars</span>}
                                                {meta.value ? <span className="w-2 h-2 rounded-full bg-success" /> : <span className="w-2 h-2 rounded-full bg-danger" />}
                                            </div>
                                        </div>
                                        {meta.value ? <p className="text-sm text-muted-foreground break-all">{meta.value}</p> : <p className="text-sm text-danger/60 italic">Missing</p>}
                                        {meta.ideal && <p className="text-[10px] text-gray-600 mt-1">Ideal: {meta.ideal}</p>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === "content" && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-card border border-border rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-foreground mb-4">Content Stats</h3>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center p-3 bg-muted/50 border border-border rounded-xl">
                                        <span className="text-sm text-muted-foreground">Word Count</span>
                                        <span className="font-bold text-foreground">{analysis.wordCount.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-muted/50 border border-border rounded-xl">
                                        <span className="text-sm text-muted-foreground">Page Size</span>
                                        <span className="font-bold text-foreground">{Math.round(analysis.pageSize / 1024)} KB</span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-muted/50 border border-border rounded-xl">
                                        <span className="text-sm text-muted-foreground">Load Time</span>
                                        <span className={`font-bold ${analysis.loadTime < 3000 ? "score-good" : analysis.loadTime < 5000 ? "score-medium" : "score-poor"}`}>{(analysis.loadTime / 1000).toFixed(2)}s</span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-muted/50 border border-border rounded-xl">
                                        <span className="text-sm text-muted-foreground">Total Links</span>
                                        <span className="font-bold text-foreground">{analysis.links.total}</span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-muted/50 border border-border rounded-xl">
                                        <span className="text-sm text-muted-foreground">Total Images</span>
                                        <span className="font-bold text-foreground">{analysis.images.total}</span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-muted/50 border border-border rounded-xl">
                                        <span className="text-sm text-muted-foreground">Total Headings</span>
                                        <span className="font-bold text-foreground">{analysis.headings.h1 + analysis.headings.h2 + analysis.headings.h3 + analysis.headings.h4 + analysis.headings.h5 + analysis.headings.h6}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-card border border-border rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-foreground mb-4">Heading Hierarchy</h3>
                                <div className="space-y-2">
                                    {["h1", "h2", "h3", "h4", "h5", "h6"].map((tag, i) => {
                                        const count = analysis.headings[tag as keyof typeof analysis.headings] as number;
                                        return (
                                            <div key={tag} className="flex items-center gap-3 p-2.5 bg-muted/30 border border-border rounded-lg" style={{ paddingLeft: `${i * 12 + 12}px` }}>
                                                <span className="text-xs font-mono font-bold text-primary uppercase">&lt;{tag}&gt;</span>
                                                <span className="text-sm text-muted-foreground flex-1">
                                                    {count} {count === 1 ? "tag" : "tags"}
                                                </span>
                                                {tag === "h1" && <span className={`text-xs px-2 py-0.5 rounded-full ${count === 1 ? "score-bg-good text-success" : "score-bg-poor text-danger"}`}>{count === 1 ? "✓ Good" : count === 0 ? "✗ Missing" : "✗ Multiple"}</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "issues" && (
                        <div>
                            {analysis.issues.length > 0 ? (
                                <>
                                    <div className="flex items-center gap-3 mb-4 flex-wrap">
                                        <span className="text-sm text-muted-foreground">Filter:</span>
                                        <span className="severity-critical px-2.5 py-1 rounded-full text-xs font-semibold">{criticalCount} Critical</span>
                                        <span className="severity-warning px-2.5 py-1 rounded-full text-xs font-semibold">{warningCount} Warnings</span>
                                        <span className="severity-info px-2.5 py-1 rounded-full text-xs font-semibold">{infoCount} Info</span>
                                    </div>
                                    <div className="space-y-3">
                                        {analysis.issues.map((issue, i) => (
                                            <IssueCard key={i} issue={issue} />
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="bg-card border border-border rounded-2xl p-12 text-center">
                                    <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                                        <AlertCircle size={32} className="text-success" />
                                    </div>
                                    <h3 className="text-lg font-semibold text-foreground mb-2">No Issues Found!</h3>
                                    <p className="text-sm text-muted-foreground">Your website is following SEO best practices.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === "vitals" && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Core Web Vitals */}
                            <div className="bg-card border border-border rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                    <Zap size={20} className="text-warning" />
                                    Core Web Vitals
                                </h3>
                                {analysis.coreWebVitals ? (
                                    <div className="space-y-3">
                                        {[
                                            { label: "LCP", desc: "Largest Contentful Paint", value: analysis.coreWebVitals.lcp, unit: "ms", good: 2500, ok: 4000, format: (v: number) => `${v}ms` },
                                            { label: "FCP", desc: "First Contentful Paint", value: analysis.coreWebVitals.fcp, unit: "ms", good: 1800, ok: 3000, format: (v: number) => `${v}ms` },
                                            { label: "TTFB", desc: "Time to First Byte", value: analysis.coreWebVitals.ttfb, unit: "ms", good: 800, ok: 1800, format: (v: number) => `${v}ms` },
                                            { label: "CLS", desc: "Cumulative Layout Shift", value: analysis.coreWebVitals.cls, unit: "", good: 0.1, ok: 0.25, format: (v: number) => v.toFixed(3) },
                                        ].map((metric) => {
                                            const status = metric.value === null ? "unknown"
                                                : metric.value <= metric.good ? "good"
                                                : metric.value <= metric.ok ? "ok" : "poor";
                                            const colorClass = status === "good" ? "text-success" : status === "ok" ? "text-warning" : status === "poor" ? "text-danger" : "text-muted-foreground";
                                            const bgClass = status === "good" ? "bg-success/10 border-success/20" : status === "ok" ? "bg-warning/10 border-warning/20" : status === "poor" ? "bg-danger/10 border-danger/20" : "bg-muted/30 border-border";
                                            return (
                                                <div key={metric.label} className={`flex items-center justify-between p-3.5 rounded-xl border ${bgClass}`}>
                                                    <div>
                                                        <span className="text-sm font-bold text-foreground">{metric.label}</span>
                                                        <p className="text-xs text-muted-foreground">{metric.desc}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className={`text-lg font-bold ${colorClass}`}>
                                                            {metric.value !== null ? metric.format(metric.value) : "N/A"}
                                                        </span>
                                                        <p className="text-xs text-muted-foreground capitalize">{status}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">Core Web Vitals not available for this analysis.</p>
                                )}
                            </div>

                            {/* Mobile Friendliness */}
                            <div className="bg-card border border-border rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                    <Smartphone size={20} className="text-primary" />
                                    Mobile Friendliness
                                </h3>
                                {analysis.mobileFriendliness ? (
                                    <div>
                                        <div className={`flex items-center gap-3 p-4 rounded-xl border mb-4 ${analysis.mobileFriendliness.isMobileFriendly ? "bg-success/10 border-success/20" : "bg-danger/10 border-danger/20"}`}>
                                            <span className="text-3xl">{analysis.mobileFriendliness.isMobileFriendly ? "✓" : "✗"}</span>
                                            <div>
                                                <p className={`font-bold ${analysis.mobileFriendliness.isMobileFriendly ? "text-success" : "text-danger"}`}>
                                                    {analysis.mobileFriendliness.isMobileFriendly ? "Mobile Friendly" : "Not Mobile Friendly"}
                                                </p>
                                                <p className="text-xs text-muted-foreground">Tested at 375×667 viewport</p>
                                            </div>
                                        </div>
                                        {analysis.mobileFriendliness.issues.length > 0 && (
                                            <div className="space-y-2">
                                                {analysis.mobileFriendliness.issues.map((issue, i) => (
                                                    <div key={i} className="flex items-start gap-2 p-3 bg-warning/5 border border-warning/20 rounded-lg text-sm text-foreground">
                                                        <span className="text-warning mt-0.5">⚠</span>
                                                        {issue}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">Mobile check not available for this analysis.</p>
                                )}
                            </div>

                            {/* robots.txt + Structured Data */}
                            <div className="bg-card border border-border rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                    <FileText size={20} className="text-secondary" />
                                    robots.txt
                                </h3>
                                {analysis.robotsTxt ? (
                                    <div className="space-y-3">
                                        <div className="flex justify-between p-3 bg-muted/50 border border-border rounded-xl">
                                            <span className="text-sm text-muted-foreground">File exists</span>
                                            <span className={`text-sm font-semibold ${analysis.robotsTxt.exists ? "text-success" : "text-danger"}`}>{analysis.robotsTxt.exists ? "Yes" : "No"}</span>
                                        </div>
                                        <div className="flex justify-between p-3 bg-muted/50 border border-border rounded-xl">
                                            <span className="text-sm text-muted-foreground">Allows crawling</span>
                                            <span className={`text-sm font-semibold ${analysis.robotsTxt.allowsCrawling ? "text-success" : "text-danger"}`}>{analysis.robotsTxt.allowsCrawling ? "Yes" : "Blocked"}</span>
                                        </div>
                                        <div className="flex justify-between p-3 bg-muted/50 border border-border rounded-xl">
                                            <span className="text-sm text-muted-foreground">Sitemap URL</span>
                                            <span className="text-sm font-semibold text-foreground truncate max-w-[180px]">{analysis.robotsTxt.sitemapUrl || "Not found"}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">robots.txt data not available.</p>
                                )}
                            </div>

                            <div className="bg-card border border-border rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                    <Code size={20} className="text-accent" />
                                    Structured Data (JSON-LD)
                                </h3>
                                {analysis.structuredData && analysis.structuredData.length > 0 ? (
                                    <div className="space-y-2">
                                        {analysis.structuredData.map((sd: any, i) => {
                                            const types = Array.isArray(sd["@type"]) ? sd["@type"] : sd["@type"] ? [sd["@type"]] : [];
                                            const typeName = types.length > 0 ? types.join(", ") : "Unknown Type";
                                            let detail = "";
                                            if (sd.name) detail = sd.name;
                                            else if (sd.url) detail = sd.url;
                                            if (!detail && Array.isArray(sd.mainEntity)) detail = `${sd.mainEntity.length} item${sd.mainEntity.length !== 1 ? "s" : ""}`;
                                            return (
                                                <div key={i} className="p-3 bg-success/5 border border-success/20 rounded-xl flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-semibold text-success">{typeName}</p>
                                                        {detail && <p className="text-xs text-muted-foreground truncate mt-0.5">{detail}</p>}
                                                    </div>
                                                    <span className="text-xs text-muted-foreground shrink-0">{sd["@context"] || "schema.org"}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="p-4 bg-warning/5 border border-warning/20 rounded-xl">
                                        <p className="text-sm text-warning font-medium">No structured data found</p>
                                        <p className="text-xs text-muted-foreground mt-1">Adding JSON-LD schema markup can improve rich search results.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === "compare" && prevAnalysis && (
                        <div className="bg-card border border-border rounded-2xl p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-semibold text-foreground">Score Comparison</h3>
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-primary inline-block" /> Current ({new Date(analysis.createdAt).toLocaleDateString()})</span>
                                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-muted-foreground inline-block" /> Previous ({new Date(prevAnalysis.createdAt).toLocaleDateString()})</span>
                                </div>
                            </div>
                            <div className="space-y-4">
                                {[
                                    { label: "Overall Score", curr: analysis.overallScore, prev: prevAnalysis.overallScore },
                                    { label: "SEO", curr: analysis.categories.seo, prev: prevAnalysis.categories.seo },
                                    { label: "Performance", curr: analysis.categories.performance, prev: prevAnalysis.categories.performance },
                                    { label: "Accessibility", curr: analysis.categories.accessibility, prev: prevAnalysis.categories.accessibility },
                                    { label: "Best Practices", curr: analysis.categories.bestPractices, prev: prevAnalysis.categories.bestPractices },
                                ].map((row) => {
                                    const diff = row.curr - row.prev;
                                    const diffClass = diff > 0 ? "text-success" : diff < 0 ? "text-danger" : "text-muted-foreground";
                                    return (
                                        <div key={row.label} className="flex items-center gap-4 p-4 bg-muted/30 border border-border rounded-xl">
                                            <span className="text-sm font-medium text-foreground w-32 shrink-0">{row.label}</span>
                                            <div className="flex-1 flex items-center gap-3">
                                                <span className="text-sm text-muted-foreground w-8 text-right">{row.prev}</span>
                                                <div className="flex-1 relative h-2 bg-muted rounded-full overflow-hidden">
                                                    <div className="absolute inset-y-0 left-0 bg-muted-foreground/40 rounded-full" style={{ width: `${row.prev}%` }} />
                                                    <div className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all" style={{ width: `${row.curr}%` }} />
                                                </div>
                                                <span className="text-sm font-bold text-foreground w-8">{row.curr}</span>
                                            </div>
                                            <span className={`text-sm font-bold w-12 text-right ${diffClass}`}>
                                                {diff > 0 ? `+${diff}` : diff === 0 ? "—" : diff}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                    { label: "Issues", curr: analysis.issues.length, prev: prevAnalysis.issues.length, lowerBetter: true },
                                    { label: "Load Time", curr: analysis.loadTime, prev: prevAnalysis.loadTime, lowerBetter: true, unit: "ms" },
                                    { label: "Broken Links", curr: analysis.links.broken ?? 0, prev: prevAnalysis.links.broken ?? 0, lowerBetter: true },
                                    { label: "Missing Alt", curr: analysis.images.missingAlt, prev: prevAnalysis.images.missingAlt, lowerBetter: true },
                                ].map((row) => {
                                    const diff = row.curr - row.prev;
                                    const improved = row.lowerBetter ? diff < 0 : diff > 0;
                                    return (
                                        <div key={row.label} className="p-3 bg-muted/30 border border-border rounded-xl text-center">
                                            <p className="text-xs text-muted-foreground mb-1">{row.label}</p>
                                            <p className="text-lg font-bold text-foreground">{row.curr}{row.unit}</p>
                                            <p className={`text-xs font-medium ${diff === 0 ? "text-muted-foreground" : improved ? "text-success" : "text-danger"}`}>
                                                {diff === 0 ? "No change" : `${diff > 0 ? "+" : ""}${diff}${row.unit || ""}`}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
