import { Router, Request, Response, NextFunction } from 'express';
import investorController from '../controllers/investor.controller';

const router = Router();

const INVESTOR_API_KEY = process.env.INVESTOR_API_KEY || 'huria_investor_2024';

// Optional: API key middleware for investor routes
const requireInvestorKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] as string || req.query.api_key as string;
  if (apiKey !== INVESTOR_API_KEY) {
    res.status(401).json({ error: 'Invalid or missing API key' });
    return;
  }
  next();
};

// Investor pitch deck endpoint
router.get('/pitch-deck', requireInvestorKey, investorController.getPitchDeck);

export default router;