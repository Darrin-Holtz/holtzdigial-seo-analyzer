import express from 'express';
import KeywordTracking from '../models/keywordTracking.js';
import User from '../models/User.js';
import { keywordTracking } from '../services/keywordTrackingService.js';

const cronRouter = express.Router();

// Verify request comes from Vercel Cron (or any caller that knows CRON_SECRET)
function verifyCronSecret(req, res) {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        // No secret configured — reject to prevent accidental open access
        res.status(500).json({ success: false, message: 'CRON_SECRET not configured' });
        return false;
    }
    if (req.headers.authorization !== `Bearer ${secret}`) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return false;
    }
    return true;
}

// GET /api/cron/rank-tracking
// Called daily by Vercel Crons. Vercel Cron Jobs ONLY send GET requests —
// defining this as POST silently fails (404), so it must stay GET.
// Handles rank tracking AND analysis count reset so both fit within the
// single cron job allowed on Vercel's free tier.
cronRouter.get('/rank-tracking', async (req, res) => {
    if (!verifyCronSecret(req, res)) return;

    res.json({ success: true, message: 'Rank tracking and analysis count reset started' });

    // Continue processing after response is sent
    try {
        // 1. Reset free-plan analysis counts for users whose last analysis was before today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const resetResult = await User.updateMany(
            { plan: 'free', lastAnalysisDate: { $lt: today } },
            { $set: { analysisCount: 0 } }
        );
        console.log(`[CRON] Reset analysis counts for ${resetResult.modifiedCount} free-plan user(s).`);

        // 2. Run keyword rank tracking
        console.log('[CRON] Starting daily rank tracking...');
        const activeTrackings = await KeywordTracking.find({ active: true });

        for (const tracking of activeTrackings) {
            tracking.status = 'checking';
            await tracking.save();
            const result = await keywordTracking(tracking);
            if (!result?.success) {
                console.error(`[CRON] Failed to track keyword "${tracking.keyword}":`, result?.error);
            }
        }
        console.log('[CRON] Daily rank tracking complete.');
    } catch (error) {
        console.error('[CRON] Rank tracking error:', error.message);
    }
});

// GET /api/cron/reset-analysis-counts
// Standalone reset endpoint (kept for manual invocation/testing). Vercel
// Cron Jobs only send GET requests, so this must stay GET.
cronRouter.get('/reset-analysis-counts', async (req, res) => {
    if (!verifyCronSecret(req, res)) return;

    res.json({ success: true, message: 'Analysis count reset started' });

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const result = await User.updateMany(
            { plan: 'free', lastAnalysisDate: { $lt: today } },
            { $set: { analysisCount: 0 } }
        );
        console.log(`[CRON] Reset analysis counts for ${result.modifiedCount} user(s).`);
    } catch (error) {
        console.error('[CRON] Reset analysis counts error:', error.message);
    }
});

export default cronRouter;
