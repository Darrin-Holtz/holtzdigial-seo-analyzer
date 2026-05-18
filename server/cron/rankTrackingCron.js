import cron from "node-cron";
import KeywordTracking from "../models/keywordTracking.js";
import Analysis from "../models/Analysis.js";
import { keywordTracking } from "../services/keywordTrackingService.js";

// Concurrency lock: prevent overlapping runs if a job takes longer than 24h
let rankCronRunning = false;

export function startRankTrackingCron() {
    // Daily rank tracking at 6:00 AM
    cron.schedule('0 6 * * *', async () => {
        if (rankCronRunning) {
            console.warn("[CRON] Rank tracking already running, skipping this trigger.");
            return;
        }
        rankCronRunning = true;
        console.log("[CRON] Starting daily rank tracking...");
        try {
            const activeTrackings = await KeywordTracking.find({ active: true });
            for (const tracking of activeTrackings) {
                tracking.status = "checking";
                await tracking.save();

                const result = await keywordTracking(tracking);
                if (!result?.success) {
                    console.error(`[CRON] Failed to track keyword "${tracking.keyword}":`, result?.error);
                }
                // Delay between checks to avoid rate limiting
                await new Promise((r) => setTimeout(r, 10000 + Math.random() * 5000));
            }
        } catch (error) {
            console.error("[CRON] Rank Tracking Cron Error:", error.message);
        } finally {
            rankCronRunning = false;
            console.log("[CRON] Daily rank tracking complete.");
        }
    });

    // Stuck-processing cleanup: every 10 minutes, fail analyses stuck > 5 minutes
    cron.schedule('*/10 * * * *', async () => {
        try {
            const staleThreshold = new Date(Date.now() - 5 * 60 * 1000);
            const result = await Analysis.updateMany(
                { status: 'processing', updatedAt: { $lt: staleThreshold } },
                { $set: { status: 'failed' } }
            );
            if (result.modifiedCount > 0) {
                console.log(`[CRON] Cleaned up ${result.modifiedCount} stale processing analyses.`);
            }
        } catch (error) {
            console.error("[CRON] Stale analysis cleanup error:", error.message);
        }
    });

    console.log("[CRON] Rank tracking scheduled at 6:00 AM daily. Stale cleanup runs every 10 minutes.");
}