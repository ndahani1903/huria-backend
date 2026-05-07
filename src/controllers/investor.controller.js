const investorMetrics = require('../services/investorMetrics.service');

class InvestorController {
  async getPitchDeck(req, res) {
    try {
      const metrics = await investorMetrics.getDashboardMetrics();
      
      res.json({
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
          monthlyRevenue: Math.floor(metrics.monthlyGMV * 0.18)
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
          monthlyChurn: 0.08,
          cohortAnalysis: {
            "2024-01": { d30: 0.25, d60: 0.18, d90: 0.12 },
            "2024-02": { d30: 0.28, d60: 0.20, d90: 0.14 },
            "2024-03": { d30: 0.30, d60: 0.22, d90: 0.15 }
          }
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
          dilution: 0.125,
          previousRounds: [
            { round: "Pre-seed", amount: 250000, valuation: 2000000, date: "2024-01" }
          ],
          investors: [
            "Tanzania Innovation Fund",
            "East African Angel Network",
            "Techstars Alumni"
          ]
        },
        
        marketOpportunity: {
          totalAddressableMarket: 50000000,
          serviceableAddressableMarket: 15000000,
          serviceableObtainableMarket: 3000000,
          marketGrowthRate: 0.35,
          keyTrends: [
            "E-commerce growing 40% YoY in Tanzania",
            "Mobile money penetration at 85%",
            "Government support for digital economy"
          ]
        },
        
        team: {
          founders: [
            { name: "John Doe", role: "CEO", background: "10 years logistics, ex-DHL" },
            { name: "Jane Smith", role: "CTO", background: "8 years software, ex-Google" },
            { name: "James Wilson", role: "COO", background: "12 years operations, ex-Uber" }
          ],
          size: 25,
          keyHires: ["Head of Sales", "Product Manager", "Data Scientist"]
        },
        
        investorReady: true,
        dataRoom: "https://investors.huria.com/dataroom",
        contact: "invest@huria.com",
        deck: "https://investors.huria.com/pitch-deck.pdf",
        lastUpdated: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Pitch deck error:', error);
      res.status(500).json({ error: 'Failed to fetch investor metrics' });
    }
  }
}

module.exports = new InvestorController();