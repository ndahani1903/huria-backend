import { Response } from 'express';
import { AuthRequest } from "../../middleware/auth.middleware";
import { DriverService } from './driver.service';
import { prisma, redis } from "../../config/db";

export class DriverController {
  static async create(req: AuthRequest, res: Response) {
    try {
      const { name, phone } = req.body;

      const driver = await DriverService.create(name, phone);

      res.json(driver);
    } catch (error) {
      res.status(500).json({ error: 'Driver creation failed' });
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
      
      // Find driver by userId
      const driver = await prisma.driver.findUnique({
        where: { userId: userId }
      });

      if (!driver) {
        return res.status(404).json({ error: 'Driver profile not found' });
      }

      await DriverService.updateLocation(driver.id, lat, lng);
      
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

     const status = await DriverService.getStatus(driver.id);
      res.json(status);
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
}
