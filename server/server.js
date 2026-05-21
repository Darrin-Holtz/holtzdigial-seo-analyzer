import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv/config';
import connectDB from './config/db.js';
import authRouter from './routes/authRoutes.js';
import rankRouter from './routes/rankRoutes.js';
import analysisRouter from './routes/analysisRoutes.js';
import cronRouter from './routes/cronRoutes.js';
import { startRankTrackingCron } from './cron/rankTrackingCron.js';

// Validate required environment variables at startup
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET', 'GEMINI_API_KEY', 'SERPAPI_KEY'];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
    console.error(`[STARTUP] Missing required environment variables: ${missingEnv.join(', ')}`);
    process.exit(1);
}

connectDB();

const app = express();

// Start background cron jobs (local/long-running server only; Vercel uses HTTP cron routes)
if (process.env.NODE_ENV !== 'production') {
    startRankTrackingCron();
}

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : [];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
}));

app.use(helmet());
app.use(morgan('combined'));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

app.get('/', (req, res) => res.send("Server is running"));
app.use('/api/auth', authRouter);
app.use('/api/rank', rankRouter);
app.use('/api/analysis', analysisRouter);
app.use('/api/cron', cronRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
