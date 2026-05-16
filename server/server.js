import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv/config';
import connectDB from './config/db.js';
import authRouter from './routes/authRoutes.js';

connectDB();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.send("Server is running"));
app.use('/api/auth', authRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
