import express from 'express';
import { login, register, getCurrentUser } from '../controllers/authControllers.js';
import auth from '../middleware/auth.js';

const authRouter = express.Router();

authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.get('/user', auth, getCurrentUser);

export default authRouter;