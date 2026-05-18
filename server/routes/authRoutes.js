import express from 'express';
import rateLimit from 'express-rate-limit';
import { login, register, getCurrentUser, logout } from '../controllers/authControllers.js';
import auth from '../middleware/auth.js';

const authRouter = express.Router();

// 20 attempts per 15 minutes per IP — prevents brute force on auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' },
});

authRouter.post('/register', authLimiter, register);
authRouter.post('/login', authLimiter, login);
authRouter.post('/logout', auth, logout);
authRouter.get('/user', auth, getCurrentUser);

export default authRouter;