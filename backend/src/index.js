import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDb } from './db.js';
import applicationsRouter from './routes/applications.js';
import authRouter from './routes/auth.js';
import flowerRouter from './routes/flower.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/flower', flowerRouter);

connectDb()
  .then(() => {
    app.listen(PORT, () => console.log(`flower-finance backend on :${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
