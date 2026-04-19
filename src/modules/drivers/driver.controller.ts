import { Request, Response } from 'express';
import { DriverService } from './driver.service';

export class DriverController {
  static async create(req: Request, res: Response) {
    try {
      const { name, phone } = req.body;

      const driver = await DriverService.create(name, phone);

      res.json(driver);
    } catch (error) {
      res.status(500).json({ error: 'Driver creation failed' });
    }
  }


 static async goOnline(req: Request, res: Response) {
   try {
    const driverId = req.user?.driverId; //if u attach driverId to req.user
      
      if (!driverId) {
        return res.status(400).json({ error: "Driver ID not found" });
      }
      
      const result = await DriverService.goOnline(driverId);
      res.json({ message: "Driver online", ...result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  static async goOffline(req: Request, res: Response) {
    try {
      const driverId = req.user?.driverId;
      
      if (!driverId) {
        return res.status(400).json({ error: "Driver ID not found" });
      }
      
      const result = await DriverService.goOffline(driverId);
      res.json({ message: "Driver offline", ...result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  static async heartbeat(req: Request, res: Response) {
    try {
      const driverId = req.user?.driverId;
      const { lat, lng } = req.body;
      
      if (!driverId) {
        return res.status(400).json({ error: "Driver ID not found" });
      }
      
      if (!lat || !lng) {
        return res.status(400).json({ error: "Location required" });
      }
      
      const result = await DriverService.heartbeat(driverId, lat, lng);
      res.json({ message: "Heartbeat sent", ...result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  static async getStatus(req: Request, res: Response) {
    try {
      const driverId = req.user?.driverId;
      
      if (!driverId) {
        return res.status(400).json({ error: "Driver ID not found" });
      }
      
      const driver = await DriverService.getById(driverId);
      const isInRedis = await redis.sIsMember("drivers:available", driverId);
      const location = await redis.get(`driver:${driverId}:location`);
      
      res.json({
        driver,
        isAvailable: isInRedis,
        location: location ? JSON.parse(location) : null,
        lastSeen: await redis.get(`driver:${driverId}:lastSeen`)
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  static async cleanupStale(req: Request, res: Response) {
    try {
      const result = await DriverService.cleanupStaleDrivers();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }


static async updateLocation(req: Request, res: Response) {
  try {
    const { driverId, lat, lng } = req.body;

    const result = await DriverService.updateLocation(driverId, lat, lng);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Location update failed" });
  }
}
}
