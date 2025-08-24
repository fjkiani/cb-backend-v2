import express from 'express';
import cors from 'cors';
import logger from './logger.js';
import investing11Routes from './routes/investing11Routes.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/investing11', investing11Routes);

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

export default app; 