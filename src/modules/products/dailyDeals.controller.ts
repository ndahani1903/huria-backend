// src/modules/products/dailyDeals.controller.ts

import { Request, Response } from "express";
import { DailyDealsService } from "../../services/dailyDeals.service";

function getParamString(
  value: string | string[] | undefined
): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }

  throw new Error("Missing route parameter");
}

export class DailyDealsController {

  // ============================================================
  // GET TODAY'S DEALS
  // ============================================================

  static async getTodayDeals(
    req: Request,
    res: Response
  ) {
    try {
      const deals =
        await DailyDealsService.getTodayDeals();

      return res.json({
        success: true,
        date: new Date().toISOString(),
        dealCount: deals.length,
        deals
      });

    } catch (error: any) {
      console.error(
        "Get today deals error:",
        error
      );

      return res.status(500).json({
        error:
          error?.message ||
          "Failed to get today's deals"
      });
    }
  }

  // ============================================================
  // GET DEALS FOR SPECIFIC DATE
  // ============================================================

  static async getDealsByDate(
    req: Request,
    res: Response
  ) {
    try {
      const date =
        getParamString(req.params.date);

      const targetDate =
        new Date(date);

      if (
        isNaN(
          targetDate.getTime()
        )
      ) {
        return res.status(400).json({
          error:
            "Invalid date format"
        });
      }

      const deals =
        await DailyDealsService.getDealsForDate(
          targetDate
        );

      return res.json({
        success: true,
        date:
          targetDate.toISOString(),
        dealCount:
          deals.length,
        deals
      });

    } catch (error: any) {
      console.error(
        "Get deals by date error:",
        error
      );

      return res.status(500).json({
        error:
          error?.message ||
          "Failed to get deals for date"
      });
    }
  }

  // ============================================================
  // GET ALL DEALS FOR A MONTH
  // ============================================================

  static async getMonthlyDeals(
    req: Request,
    res: Response
  ) {
    try {
      const { year, month } =
        req.query;

      const targetYear =
        parseInt(
          String(year ?? ""),
          10
        ) ||
        new Date().getFullYear();

      const targetMonth =
        parseInt(
          String(month ?? ""),
          10
        ) ||
        new Date().getMonth();

      const deals =
        await DailyDealsService.getAllMonthlyDeals(
          targetYear,
          targetMonth
        );

      return res.json({
        success: true,
        year: targetYear,
        month: targetMonth,
        deals
      });

    } catch (error: any) {
      console.error(
        "Get monthly deals error:",
        error
      );

      return res.status(500).json({
        error:
          error?.message ||
          "Failed to get monthly deals"
      });
    }
  }
}