import { Response } from 'express';
import { AuthRequest } from "../../middleware/auth.middleware";
import { DriverService } from './driver.service';
import { prisma } from "../../config/db";
import redis from "../../config/redis";

export class DriverController {
  static async completeOrder(req: AuthRequest, res: Response) {
  try {
    const { orderId } = req.body;
    const userId = req.user.id;
    
    // Find driver by userId
    const driver = await prisma.driver.findUnique({
      where: { userId: userId }
    });

    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }

    const result = await DriverService.completeOrder(orderId, driver.id);
    res.json(result);
  } catch (error: any) {
    console.error('Complete order error:', error);
    res.status(500).json({ error: error.message });
  }
}

 static async goOnline(req: AuthRequest, res: Response) {
   try {
    const userId = req.user.id;
      
     // Find driver by userId
      const driver = await prisma.driver.findUnique({
        where: { userId: userId }
      });

      if (!driver) {
        return res.status(404).json({ error: 'Driver profile not found' });
      }

      await DriverService.goOnline(driver.id);
      res.json({ success: true, message: 'Driver is now online' });
    } catch (error: any) {
      console.error('Go online error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  static async goOffline(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;
      
      // Find driver by userId
      const driver = await prisma.driver.findUnique({
        where: { userId: userId }
      });

      if (!driver) {
        return res.status(404).json({ error: 'Driver profile not found' });
      }

      await DriverService.goOffline(driver.id);
      res.json({ success: true, message: 'Driver is now offline' });
    } catch (error: any) {
      console.error('Go offline error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  static async heartbeat(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;
      const { lat, lng } = req.body;
      
     console.log("💓 Heartbeat received:", { userId, lat, lng });

      // Find driver by userId
      const driver = await prisma.driver.findUnique({
        where: { userId: userId }
      });

      if (!driver) {
        return res.status(404).json({ error: 'Driver profile not found' });
      }

      await DriverService.updateLocation(driver.id, lat, lng);
      
     console.log(`✅ Heartbeat processed for driver ${driver.id}`);
      res.json({ success: true, message: 'Heartbeat received' });
    } catch (error: any) {
      console.error('Heartbeat error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
  
  static async getStatus(req: AuthRequest, res: Response) {
    try {
       const userId = req.user.id;
      
      // Find driver by userId
      const driver = await prisma.driver.findUnique({
        where: { userId: userId }
      });

      if (!driver) {
        return res.status(404).json({ error: 'Driver profile not found' });
      }

  // ✅ Fixed: Use getById instead of getStatus
    const driverData = await DriverService.getById(driver.id);
   res.json({ driver: driverData, isOnline: driverData?.status === 'available' });
    } catch (error: any) {
      console.error('Get status error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  
  static async cleanupStale(req: AuthRequest, res: Response) {
    try {
      const result = await DriverService.cleanupStaleDrivers();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }


static async updateLocation(req: AuthRequest, res: Response) {
  try {
    const { lat, lng } = req.body;

    const result = await DriverService.updateLocation(req.user.id, lat, lng);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Location update failed" });
  }
}

// In your driver.controller.ts - add this for debugging
static async checkLocation(req: AuthRequest, res: Response) {
  try {
    const userId = req.user.id;
    const driver = await prisma.driver.findUnique({
      where: { userId: userId }
    });
    
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    
    const key = `driver:${driver.id}:location`;
    const locationRaw = await redis.get(key);
    const location = locationRaw ? JSON.parse(locationRaw.toString()) : null;
    
    const isInAvailableSet = await redis.sismember("drivers:available", driver.id);
    
    res.json({
      driverId: driver.id,
      location,
      isInAvailableSet: isInAvailableSet === 1,
      status: driver.status,
      currentLat: driver.currentLat,
      currentLng: driver.currentLng
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}


}
