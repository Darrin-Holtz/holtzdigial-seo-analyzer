/* eslint-disable react-refresh/only-export-components */
import { BarChart3Icon, EyeIcon, FileSearchIcon, GlobeIcon, ShieldIcon, TargetIcon, TrendingUpIcon, ZapIcon } from "lucide-react";

export const homeFeaturesData = [
    {
        icon: <BarChart3Icon size={28} />,
        title: "SEO Score",
        desc: "Get a comprehensive SEO score analyzing 50+ ranking factors with AI-powered insights.",
    },
    {
        icon: <ZapIcon size={28} />,
        title: "Performance",
        desc: "Analyze load times, page size, and Core Web Vitals to maximize your site speed.",
    },
    {
        icon: <ShieldIcon size={28} />,
        title: "Best Practices",
        desc: "Check meta tags, heading structure, image optimization, and technical SEO health.",
    },
    {
        icon: <EyeIcon size={28} />,
        title: "Accessibility",
        desc: "Ensure your site is accessible to all users with alt text, ARIA, and contrast checks.",
    },
    {
        icon: <TargetIcon size={28} />,
        title: "Keyword Analysis",
        desc: "Discover top keywords, density analysis, and content optimization opportunities.",
    },
    {
        icon: <TrendingUpIcon size={28} />,
        title: "Actionable Fixes",
        desc: "Get prioritized, actionable recommendations to boost your search rankings.",
    },
];

export const homeHowItWorksData = [
    {
        num: "01",
        icon: <GlobeIcon size={24} />,
        title: "Enter Your URL",
        desc: "Paste any website URL into the analyzer bar.",
    },
    {
        num: "02",
        icon: <FileSearchIcon size={24} />,
        title: "AI Scans Your Site",
        desc: "BrowserBase visits your site and Gemini AI analyzes every SEO factor.",
    },
    {
        num: "03",
        icon: <BarChart3Icon size={24} />,
        title: "Get Your Report",
        desc: "Receive a detailed report with scores, issues, and recommendations.",
    },
];

export const homefooterLinks = [
    {
        title: "Product",
        links: ["Features", "Pricing", "API", "Browser Extension"],
    },
    {
        title: "Resources",
        links: ["Documentation", "Blog", "SEO Guide", "Support"],
    },
    {
        title: "Company",
        links: ["About Us", "Careers", "Contact", "Press"],
    },
    {
        title: "Legal",
        links: ["Privacy Policy", "Terms of Service", "Cookie Policy"],
    },
];
