import express from 'express';
import KeywordTracking from '../models/keywordTracking.js';
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

// POST /api/cron/rank-tracking
// Called daily by Vercel Crons at 6:00 AM ET
cronRouter.post('/rank-tracking', async (req, res) => {
    if (!verifyCronSecret(req, res)) return;

    res.json({ success: true, message: 'Rank tracking started' });

    // Continue processing after response is sent
    try {
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

export default cronRouter;
