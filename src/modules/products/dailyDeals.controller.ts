// src/modules/products/dailyDeals.controller.ts

import { Request, Response } from 'express';
import { DailyDealsService } from '../../services/dailyDeals.service';

export class DailyDealsController {
  
  // Get today's deals
  static async getTodayDeals(req: Request, res: Response) {
    try {
      const deals = await DailyDealsService.getTodayDeals();
      res.json({
        success: true,
        date: new Date().toISOString(),
        dealCount: deals.length,
        deals
      });
    } catch (error: any) {
      console.error('Get today deals error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // Get deals for specific date
  static async getDealsByDate(req: Request, res: Response) {
    try {
      const { date } = req.params;
      const targetDate = new Date(date);
      
      if (isNaN(targetDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format' });
      }
      
      const deals = await DailyDealsService.getDealsForDate(targetDate);
      res.json({
        success: true,
        date: targetDate.toISOString(),
        dealCount: deals.length,
        deals
      });
    } catch (error: any) {
      console.error('Get deals by date error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // Get all deals for a month (calendar view)
  static async getMonthlyDeals(req: Request, res: Response) {
    try {
      const { year, month } = req.query;
      const targetYear = parseInt(year as string) || new Date().getFullYear();
      const targetMonth = parseInt(month as string) || new Date().getMonth();
      
      const deals = await DailyDealsService.getAllMonthlyDeals(targetYear, targetMonth);
      res.json({
        success: true,
        year: targetYear,
        month: targetMonth,
        deals
      });
    } catch (error: any) {
      console.error('Get monthly deals error:', error);
      res.status(500).json({ error: error.message });
    }
  }
}