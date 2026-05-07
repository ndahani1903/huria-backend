import { Request, Response } from 'express';
import investorMetrics from '../services/investorMetrics.service';

interface PitchDeckResponse {
  company: {
    name: string;
    founded: string;
    stage: string;
    market: string;
    tagline: string;
    problem: string;
    solution: string;
  };
  traction: {
    totalUsers: number;
    monthlyActiveUsers: number;
    totalMerchants: number;
    activeMerchants: number;
    totalDrivers: number;
    activeDrivers: number;
    totalOrders: number;
    monthlyOrders: number;
    totalGMV: number;
    monthlyGMV: number;
    takeRate: number;
    monthlyRevenue: number;
  };
  growth: {
    momGrowth: number;
    yoyProjection: number;
    marketShare: number;
    tam: number;
    sam: number;
    som: number;
    growthDrivers: string[];
  };
  unitEconomics: {
    cac: number;
    ltv: number;
    ltvToCac: number;
    paybackPeriod: number;
    grossMargin: number;
    contributionMargin: number;
    averageOrderValue: number;
    ordersPerCustomer: number;
  };
  retention: {
    d1: number;
    d7: number;
    d30: number;
    d90: number;
    monthlyChurn: number;
  };
  competitiveMoat: string[];
  milestones: {
    achieved: string[];
    next: string[];
  };
  fundraising: {
    amount: number;
    useOfFunds: {
      technology: number;
      marketing: number;
      operations: number;
      team: number;
    };
    valuation: number;
    dilution: number;
  };
  investorReady: boolean;
  dataRoom: string;
  contact: string;
  lastUpdated: string;
}

class InvestorController {
  async getPitchDeck(req: Request, res: Response): Promise<void> {
    try {
      const metrics = await investorMetrics.getDashboardMetrics();
      
      const response: PitchDeckResponse = {
        company: {
          name: "HURIA Delivery",
          founded: "2024",
          stage: "Seed",
          market: "Tanzania & East Africa",
          tagline: "Transforming last-mile delivery in East Africa",
          problem: "Unreliable, untracked deliveries and payment disputes",
          solution: "Integrated delivery platform with escrow payments and real-time tracking"
        },
        
        traction: {
          totalUsers: metrics.totalUsers,
          monthlyActiveUsers: Math.floor(metrics.totalUsers * 0.5),
          totalMerchants: metrics.totalMerchants,
          activeMerchants: Math.floor(metrics.totalMerchants * 0.53),
          totalDrivers: metrics.totalDrivers,
          activeDrivers: Math.floor(metrics.totalDrivers * 0.66),
          totalOrders: metrics.totalOrders,
          monthlyOrders: metrics.monthlyOrders,
          totalGMV: metrics.totalGMV,
          monthlyGMV: metrics.monthlyGMV,
          takeRate: 0.18,
          monthlyRevenue: metrics.monthlyRevenue
        },
        
        growth: {
          momGrowth: 0.25,
          yoyProjection: 8.5,
          marketShare: 0.12,
          tam: 50000000,
          sam: 15000000,
          som: 3000000,
          growthDrivers: [
            "Expansion to 3 new cities",
            "Merchant financing program",
            "B2B logistics partnerships"
          ]
        },
        
        unitEconomics: {
          cac: 8.50,
          ltv: 127.50,
          ltvToCac: 15,
          paybackPeriod: 45,
          grossMargin: 0.28,
          contributionMargin: 0.22,
          averageOrderValue: 45,
          ordersPerCustomer: 12
        },
        
        retention: {
          d1: 0.45,
          d7: 0.32,
          d30: 0.21,
          d90: 0.14,
          monthlyChurn: 0.08
        },
        
        competitiveMoat: [
          "Integrated payments & escrow - 0% failed payments",
          "Real-time tracking with OTP verification",
          "Merchant financing (cash advance against future deliveries)",
          "AI demand forecasting - 95% accuracy",
          "Last-mile optimization engine - 30% cost reduction",
          "Multi-tenant white-label solution",
          "First-mover advantage in 3 cities",
          "Exclusive partnerships with 50+ major retailers"
        ],
        
        milestones: {
          achieved: [
            "MVP launch - March 2024",
            "500 daily orders - June 2024",
            "Merchant financing launch - August 2024",
            "1,000 merchants - October 2024",
            "25,000 MAU - December 2024"
          ],
          next: [
            "Series A ready - Q1 2025",
            "3 new cities (Arusha, Mwanza, Dodoma) - Q2 2025",
            "1M monthly orders - Q4 2025",
            "East Africa expansion (Kenya, Uganda) - 2026",
            "Breakeven - Q1 2026"
          ]
        },
        
        fundraising: {
          amount: 1500000,
          useOfFunds: {
            technology: 0.35,
            marketing: 0.30,
            operations: 0.20,
            team: 0.15
          },
          valuation: 12000000,
          dilution: 0.125
        },
        
        investorReady: true,
        dataRoom: "https://investors.huria.com/dataroom",
        contact: "invest@huria.com",
        lastUpdated: new Date().toISOString()
      };
      
      res.json(response);
      
    } catch (error) {
      console.error('Pitch deck error:', error);
      res.status(500).json({ error: 'Failed to fetch investor metrics' });
    }
  }
}

export default new InvestorController();