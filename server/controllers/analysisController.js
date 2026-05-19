import Analysis from "../models/Analysis.js";
import User from "../models/User.js";
import { analyzeSeoData } from "../services/geminiService.js";
import { scrapeUrl } from "../services/scraperService.js";

// SSRF protection: block private/loopback IP ranges and reserved hostnames
const BLOCKED_HOSTNAMES = new Set(['localhost', '0.0.0.0']);
const PRIVATE_IP_REGEX = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1$|fc00:|fe80:)/;

function isSsrfTarget(hostname) {
    if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) return true;
    if (PRIVATE_IP_REGEX.test(hostname)) return true;
    // Block raw IPv4 addresses that map to private ranges after resolution
    return false;
}

// Check whether user has exceeded their daily free-plan limit
async function checkPlanLimit(userId) {
    const user = await User.findById(userId).select('plan analysisCount lastAnalysisDate');
    if (!user) return { allowed: false, user: null };

    if (user.plan === 'pro') return { allowed: true, user };

    // Reset daily count if last analysis was on a previous calendar day
    const today = new Date().toDateString();
    const lastDate = user.lastAnalysisDate ? new Date(user.lastAnalysisDate).toDateString() : null;
    if (lastDate !== today) {
        user.analysisCount = 0;
        await user.save();
    }

    if (user.analysisCount >= 5) return { allowed: false, user };
    return { allowed: true, user };
}

// Analyze a URL
export const analyzeUrl = async (req, res) => {
    try{
        const { url } = req.body;

        if (!url) return res.status(400).json({ success: false, message: 'URL is required' });

        // Validate URL format
        let validUrl;
        try {
            validUrl = new URL(url.startsWith("http") ? url : `https://${url}`);
        } catch (error) {
            return res.status(400).json({ success: false, message: 'Invalid URL format' });
        }

        // SSRF protection: reject private/internal targets
        if (isSsrfTarget(validUrl.hostname)) {
            return res.status(400).json({ success: false, message: 'The provided URL is not allowed.' });
        }

        // Plan enforcement: free users get 5 analyses per day
        const { allowed, user } = await checkPlanLimit(req.userId);
        if (!allowed) {
            return res.status(403).json({ success: false, message: 'Daily analysis limit reached. Upgrade to Pro for unlimited analyses.' });
        }

        // Create analysis record with pending status
        const analysis = await Analysis.create({
            userId: req.userId,
            url: validUrl.href,
            status: 'processing',
        });

        // Increment usage counter immediately so concurrent requests are blocked too
        await User.findByIdAndUpdate(req.userId, {
            $inc: { analysisCount: 1 },
            lastAnalysisDate: new Date(),
        });

        // Step 1: Scrape the URL with BrowserBase
        const scrapeResult = await scrapeUrl(validUrl.href);

        if (!scrapeResult || !scrapeResult.success) {
            analysis.status = 'failed';
            await analysis.save();
            return res.status(422).json({ success: false, message: 'Failed to access the website. It may be blocking our crawler.' });
        }

        // Step 2: Analyze with Gemini AI
        const aiResult = await analyzeSeoData(scrapeResult.data);

        if (!aiResult.success) {
            analysis.status = 'failed';
            await analysis.save();
            return res.status(422).json({ success: false, message: 'AI analysis failed. Please try again.' });
        }

        // Step 3: Save results to database
        analysis.overallScore = aiResult.data.overallScore || 0;
        analysis.categories = aiResult.data.categories || {};
        analysis.metaData = scrapeResult.data.metaData || {};
        analysis.headings = scrapeResult.data.headings || {};
        analysis.links = scrapeResult.data.links || {};
        analysis.images = scrapeResult.data.images || {};
        analysis.keywords = aiResult.data.keywords || [];
        analysis.issues = aiResult.data.issues || [];
        analysis.loadTime = scrapeResult.data.loadTime || 0;
        analysis.pageSize = scrapeResult.data.pageSize || 0;
        analysis.wordCount = scrapeResult.data.wordCount || 0;
        analysis.coreWebVitals = scrapeResult.data.coreWebVitals || {};
        analysis.mobileFriendliness = scrapeResult.data.mobileFriendliness || {};
        analysis.robotsTxt = scrapeResult.data.robotsTxt || {};
        analysis.structuredData = scrapeResult.data.structuredData || [];
        analysis.status = 'completed';

        await analysis.save();

        res.status(200).json({ success: true, message: "Analysis complete", analysisId: analysis._id });

    } catch (error) {
        console.error("Analyze URL Error:", error.message);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Server error', error: error.message });
        }
    }
};

// Get analysis by ID
export const getAnalysis = async (req, res) => {
    try {
        let analysis = await Analysis.findOne({ _id: req.params.id, userId: req.userId });
        if (!analysis) return res.status(404).json({ success: false, message: 'Analysis not found' });

        // Inline stale-processing cleanup: if stuck in processing > 5 min, mark failed
        if (analysis.status === 'processing') {
            const ageMs = Date.now() - new Date(analysis.updatedAt).getTime();
            if (ageMs > 5 * 60 * 1000) {
                analysis.status = 'failed';
                await analysis.save();
            }
        }

        const doc = analysis.toObject();
        // Normalize legacy field: old docs stored withoutAlt before the rename to missingAlt
        if (doc.images) {
            const v = doc.images.missingAlt;
            if (v === undefined || v === null || (typeof v === 'number' && isNaN(v))) {
                doc.images.missingAlt = Number(doc.images.withoutAlt) || 0;
            }
        }

        res.json({ success: true, analysis: doc });
    } catch (error) {
        console.error("Get Analysis Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get all analyses for a user
export const getAnalyses = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const analyses = await Analysis.find({ userId: req.userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).select("-issues -keywords");
        const total = await Analysis.countDocuments({ userId: req.userId });
        const totalPages = Math.ceil(total / limit);

        res.json({ success: true, analyses, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (error) {
        console.error("Get Analyses Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Delete an analysis
export const deleteAnalysis = async (req, res) => {
    try {
        await Analysis.findByIdAndDelete({ _id: req.params.id, userId: req.userId });
        res.json({ success: true, message: 'Analysis deleted' });
    } catch (error) {
        console.error("Delete Analysis Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

