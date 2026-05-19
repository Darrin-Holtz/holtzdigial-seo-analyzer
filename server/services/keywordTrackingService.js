import { rankTracker } from "./rankTrackerService.js";

export async function keywordTracking(tracking){
    try {
        const result = await rankTracker(tracking.keyword, tracking.domain);

        if(result.success) {
            const prev = tracking.currentPosition;
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            tracking.currentPosition = result.data.position;
            tracking.currentPage = result.data.page;
            tracking.competitors = result.data.competitors;
            tracking.lastChecked = new Date();
            tracking.status = 'completed';

            // Update stats
            tracking.positionChange = prev && result.data.position ? prev - result.data.position : 0;
            if(result.data.position && (!tracking.bestPosition || result.data.position < tracking.bestPosition)) {
                tracking.bestPosition = result.data.position;
            }

            // Update history
            const historyEntry = {
                date: today,
                position: result.data.position,
                page: result.data.page,
                title: result.data.title,
                snippet: result.data.snippet,
            };
            const idx = tracking.rankHistory.findIndex((h) => h.date.toDateString() === today.toDateString());
            if(idx >= 0) {
                tracking.rankHistory[idx] = historyEntry;
            } else {
                tracking.rankHistory.push(historyEntry);
            }
        }else {
            tracking.status = 'failed';
        }
        
        await tracking.save();
        return result;
    } catch (err) {
        console.error("Rank update error:", err.message);
        tracking.status = "failed";
        await tracking.save().catch(() => {});
        return { success: false, error: err.message };
    }
}