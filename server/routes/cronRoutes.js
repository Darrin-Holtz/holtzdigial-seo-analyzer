import express from 'express';
import KeywordTracking from '../models/keywordTracking.js';
import User from '../models/User.js';
import { keywordTracking } from '../services/keywordTrackingService.js';

const cronRouter = express.Router();
let cronRunning = false;

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
// Runs bounded work before responding because serverless functions may stop
// execution immediately after the response is sent.
cronRouter.get('/rank-tracking', async (req, res) => {
    if (!verifyCronSecret(req, res)) return;

    if (cronRunning) {
        return res.status(409).json({ success: false, message: 'Cron job already running' });
    }

    cronRunning = true;

    const maxTrackings = Number(process.env.CRON_MAX_TRACKINGS || 3);
    const startedAt = Date.now();

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
        const activeTrackings = await KeywordTracking.find({ active: true }).sort({ lastChecked: 1 }).limit(maxTrackings);
        let successCount = 0;
        let failureCount = 0;

        for (const tracking of activeTrackings) {
            tracking.status = 'checking';
            await tracking.save();
            const result = await keywordTracking(tracking);
            if (!result?.success) {
                failureCount += 1;
                console.error(`[CRON] Failed to track keyword "${tracking.keyword}":`, result?.error);
            } else {
                successCount += 1;
            }
        }

        const durationMs = Date.now() - startedAt;
        console.log(`[CRON] Daily rank tracking complete in ${durationMs}ms. Processed=${activeTrackings.length}, success=${successCount}, failed=${failureCount}`);

        return res.json({
            success: true,
            message: 'Rank tracking and analysis count reset completed',
            processed: activeTrackings.length,
            successful: successCount,
            failed: failureCount,
            resetUsers: resetResult.modifiedCount,
            durationMs,
            maxTrackings,
        });
    } catch (error) {
        console.error('[CRON] Rank tracking error:', error.message);
        return res.status(500).json({ success: false, message: 'Cron job failed', error: error.message });
    } finally {
        cronRunning = false;
    }
});

// GET /api/cron/reset-analysis-counts
// Standalone reset endpoint (kept for manual invocation/testing). Vercel
// Cron Jobs only send GET requests, so this must stay GET.
cronRouter.get('/reset-analysis-counts', async (req, res) => {
    if (!verifyCronSecret(req, res)) return;

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const result = await User.updateMany(
            { plan: 'free', lastAnalysisDate: { $lt: today } },
            { $set: { analysisCount: 0 } }
        );
        console.log(`[CRON] Reset analysis counts for ${result.modifiedCount} user(s).`);
        return res.json({ success: true, message: 'Analysis count reset completed', resetUsers: result.modifiedCount });
    } catch (error) {
        console.error('[CRON] Reset analysis counts error:', error.message);
        return res.status(500).json({ success: false, message: 'Reset failed', error: error.message });
    }
});

export default cronRouter;
