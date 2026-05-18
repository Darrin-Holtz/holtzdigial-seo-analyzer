import express from 'express';
import rateLimit from 'express-rate-limit';
import auth from '../middleware/auth.js';
import { analyzeUrl, deleteAnalysis, getAnalyses, getAnalysis } from '../controllers/analysisController.js';

const analysisRouter = express.Router();

// 30 analyses per hour per IP — prevents abuse of the costly scrape+AI pipeline
const analyzeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Analysis rate limit reached. Please try again later.' },
});

analysisRouter.post("/analyze", analyzeLimiter, auth, analyzeUrl);
analysisRouter.get("/list", auth, getAnalyses);
analysisRouter.get("/:id", auth, getAnalysis);
analysisRouter.delete("/:id", auth, deleteAnalysis);

export default analysisRouter;