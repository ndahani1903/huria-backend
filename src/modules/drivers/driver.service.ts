import { prisma } from '../../config/db';
import { redis } from "../../config/redis";
import { io } from "../../server";

export class DriverService {
  /* static async create(name: string, phone: string) {
    const user =await prisma.user.create({
      data: {
        name,
        phone,
        email,
        password: hashed,
        role,
      },
    });

    await prisma.driver.create({
      data: {
        userId: user.id, //link
        name: user.name,
        phone: user.phone,
        status: 'available',
      },
    });
  }      
*/
  
static async acceptOrder(orderId: string, driverId: string) {
    const order = await prisma.order.findUnique({
      where: { orderId },
    });

    if (!order) throw new Error("Order not found");

    if (order.status !== "paid") {
      throw new Error("Order not ready for pickup");
    }

    // assign driver
    await prisma.order.update({
      where: { orderId },
      data: {
        driverId,
        status: "accepted",
      },
    });
}

  // ADD THIS METHOD to DriverService class:
static async initDriverAvailability(driverId: string) {
  await redis.sAdd("drivers:available", driverId);
}

  // ✅ GET AVAILABLE DRIVERS
  static async getAvailable() {
    return prisma.driver.findMany({
      where: { status: 'available' },
    });
  }
    // ✅ MARK DRIVER BUSY
  static async markBusy(driverId: string) {
    await prisma.driver.update({
      where: { id: driverId },
      data: { status: "busy" },
    });

    await redis.sRem("drivers:available", driverId);
  }

   // ✅ MARK DRIVER AVAILABLE
  static async markAvailable(driverId: string) {
     // Update database
    await prisma.driver.update({
      where: { id: driverId },
      data: { status: "available" },
    });
  
    // free driver
    if (order.driverId) {
      await prisma.driver.update({
        where: { id: order.driverId },
        data: { status: "available" },
      });
    }
    // 🔥 ADD THIS
  await redis.sAdd("drivers:available", driverId);
  console.log("✅ Driver available again:", driverId);
  
  return { success: true };

}

    // ✅ GO OFFLINE (manual)
  static async goOffline(driverId: string) {
    // Update database
    await prisma.driver.update({
      where: { id: driverId },
      data: { status: "offline" },
    });
    
    // Remove from Redis
    await redis.sRem("drivers:available", driverId);
    
    // Clear location
    await redis.del(`driver:${driverId}:location`);
    
    console.log("✅ Driver went offline:", driverId);
    
    return { success: true };
  }
  
  // ✅ GO ONLINE
  static async goOnline(driverId: string) {
    // Update database
    await prisma.driver.update({
      where: { id: driverId },
      data: { status: "available" },
    });
    
    // Add to Redis
    await redis.sAdd("drivers:available", driverId);
    
    console.log("✅ Driver went online:", driverId);
    
    return { success: true };
  }
  
  // ✅ HEARTBEAT - Keep driver alive
  static async heartbeat(driverId: string, lat: number, lng: number) {
    // Update location with extended expiry
    const key = `driver:${driverId}:location`;
    await redis.set(key, JSON.stringify({ lat, lng, lastHeartbeat: Date.now() }), "EX", 60);
    
    // Ensure they're in available set
    await redis.sAdd("drivers:available", driverId);
    
    // Update last seen timestamp
    await redis.set(`driver:${driverId}:lastSeen`, Date.now().toString(), "EX", 70);
    
    return { success: true };
  }
  
  // ✅ CLEAN UP STALE DRIVERS (run every minute)
  static async cleanupStaleDrivers() {
    try {
      const allDrivers = await prisma.driver.findMany({
        where: { status: { in: ['available', 'busy'] } }
      });
      
      const now = Date.now();
      const staleThreshold = 5 * 60 * 1000; // 5 minutes
      const staleDrivers = [];
      
      for (const driver of allDrivers) {
        const lastSeen = await redis.get(`driver:${driver.id}:lastSeen`);
        
        if (lastSeen) {
          const lastSeenTime = parseInt(lastSeen);
          const isStale = (now - lastSeenTime) > staleThreshold;
          
          if (isStale && driver.status === 'available') {
            // Driver hasn't sent heartbeat in 5 minutes
            await redis.sRem("drivers:available", driver.id);
            await redis.del(`driver:${driver.id}:location`);
            await prisma.driver.update({
              where: { id: driver.id },
              data: { status: "offline" }
            });
            staleDrivers.push(driver.id);
            console.log(`🧹 Cleaned up stale driver: ${driver.id}`);
          }
        }
      }
      
      return { cleaned: staleDrivers.length, drivers: staleDrivers };
    } catch (error) {
      console.error("Stale driver cleanup error:", error);
      return { cleaned: 0, error: error.message };
    }
  }


// ✅ GET DRIVER BY USER ID (IMPORTANT FOR WALLET / LOCATION)
  static async getByUserId(userId: string) {
    return prisma.driver.findUnique({
      where: { userId },
    });
  }

     // ✅ GET DRIVER BY ID
  static async getById(driverId: string) {
    return prisma.driver.findUnique({
      where: { id: driverId },
    });
  }
  

  static async deliverOrder(orderId: string) {
    const order = await prisma.order.update({
      where: { orderId },
      data: { status: "delivered" },
    });

    return order;
  }

  static async completeOrder(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { orderId },
    });

    if (!order || order.status !== "delivered") {
      throw new Error("Order not delivered yet");
    }

    await prisma.order.update({
      where: { orderId },
      data: { status: "completed" },
    });

    return { message: "Order completed" };
  }

 // ✅ UPDATE LOCATION (with heartbeat)
static async updateLocation(driverId: string, lat: number, lng: number) {
  const key = `driver:${driverId}:location`;

   await redis.set(key, JSON.stringify({ lat, lng, timestamp: Date.now() }), "EX", 10);

 // Also update heartbeat
    await this.heartbeat(driverId, lat, lng);

  // Broadcast to customers + admin dashboards
  io.emit("driver_location_update", {
    driverId,
    lat,
    lng
  });
  return { driverId, lat, lng };
}
}