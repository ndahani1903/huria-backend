import { prisma } from '../../config/db';
import redis from "../../config/redis";
import { io } from "../../server";
import driverGamificationService from '../drivers/gamification.service';

export class DriverService {

  static async acceptOrder(orderId: string, driverId: string) {
    const order = await prisma.order.findUnique({
      where: { orderId },
    });

    if (!order) {
      throw new Error("Order not found");
    }

    // Verify driver matches assigned driver
    if (order.driverId !== driverId) {
      throw new Error("This order is not assigned to you");
    }

    // The order must be assigned before the driver can accept it.
    // Do NOT check for "paid" here because Prisma's status type
    // does not allow that comparison after the assigned check.
    if (order.status !== "assigned") {
      throw new Error("Order not ready for pickup");
    }

    // Update status to show driver has accepted the order
    await prisma.order.update({
      where: { orderId },
      data: {
        driverId,
        status: "picked_up",
        tripStage: "picked_up"
      },
    });

    return {
      success: true,
      message: "Order accepted"
    };
  }

  // Initialize driver availability
  static async initDriverAvailability(driverId: string) {
    await redis.sadd("drivers:available", driverId);
  }

  // GET AVAILABLE DRIVERS
  static async getAvailable() {
    return prisma.driver.findMany({
      where: { status: 'available' },
    });
  }

  // MARK DRIVER BUSY
  static async markBusy(driverId: string) {
    await prisma.driver.update({
      where: { id: driverId },
      data: { status: "busy" },
    });

    await redis.srem("drivers:available", driverId);
  }

  // MARK DRIVER AVAILABLE
  static async markAvailable(driverId: string) {
    try {
      // Add back to Redis available set
      await redis.sadd("drivers:available", driverId);

      // Update database
      await prisma.driver.update({
        where: { id: driverId },
        data: { status: "available" },
      });

      console.log(`🚚 Driver ${driverId} marked as AVAILABLE`);
    } catch (error: any) {
      console.error(
        `Error marking driver ${driverId} as available:`,
        error
      );
    }

    console.log("✅ Driver available again:", driverId);

    return {
      success: true
    };
  }

  // GO OFFLINE (manual)
  static async goOffline(driverId: string) {
    // Remove from Redis
    await redis.srem("drivers:available", driverId);

    // Update database
    await prisma.driver.update({
      where: { id: driverId },
      data: { status: "offline" },
    });

    // Clear location
    await redis.del(`driver:${driverId}:location`);

    console.log(`🚚 Driver ${driverId} is now OFFLINE`);
    console.log("✅ Driver went offline:", driverId);

    return {
      success: true
    };
  }

  // GO ONLINE
  static async goOnline(driverId: string) {
    // Add to Redis
    await redis.sadd("drivers:available", driverId);

    // Update database
    await prisma.driver.update({
      where: { id: driverId },
      data: { status: "available" },
    });

    console.log(`🚚 Driver ${driverId} is now ONLINE`);

    return {
      success: true
    };
  }

  // HEARTBEAT - Keep driver alive
  static async heartbeat(
    driverId: string,
    lat: number,
    lng: number
  ) {
    console.log(`💓 Heartbeat from driver ${driverId}`);

    // Update location with extended expiry
    const key = `driver:${driverId}:location`;

    await redis.setex(
      key,
      60,
      JSON.stringify({
        lat,
        lng,
        lastHeartbeat: Date.now()
      })
    );

    // Ensure they're in available set
    await redis.sadd("drivers:available", driverId);

    // Update last seen timestamp
    await redis.setex(
      `driver:${driverId}:lastSeen`,
      70,
      Date.now().toString()
    );

    console.log(`✅ Heartbeat recorded for driver ${driverId}`);

    return {
      success: true
    };
  }

  // CLEAN UP STALE DRIVERS (run every minute)
  static async cleanupStaleDrivers() {
    try {
      const allDrivers = await prisma.driver.findMany({
        where: {
          status: {
            in: ['available', 'busy']
          }
        }
      });

      const now = Date.now();
      const staleThreshold = 5 * 60 * 1000;
      const staleDrivers: string[] = [];

      for (const driver of allDrivers) {
        const lastSeen = await redis.get(
          `driver:${driver.id}:lastSeen`
        );

        if (lastSeen) {
          const lastSeenTime = parseInt(lastSeen as string, 10);
          const isStale =
            (now - lastSeenTime) > staleThreshold;

          if (isStale && driver.status === 'available') {
            // Driver hasn't sent heartbeat in 5 minutes
            await redis.srem(
              "drivers:available",
              driver.id
            );

            await redis.del(
              `driver:${driver.id}:location`
            );

            await prisma.driver.update({
              where: { id: driver.id },
              data: {
                status: "offline"
              }
            });

            staleDrivers.push(driver.id);

            console.log(
              `🧹 Cleaned up stale driver: ${driver.id}`
            );
          }
        }
      }

      return {
        cleaned: staleDrivers.length,
        drivers: staleDrivers
      };
    } catch (error: any) {
      console.error(
        "Stale driver cleanup error:",
        error
      );

      return {
        cleaned: 0,
        error: error.message
      };
    }
  }

  // GET DRIVER BY USER ID
  static async getByUserId(userId: string) {
    return prisma.driver.findUnique({
      where: { userId },
    });
  }

  // GET DRIVER BY ID
  static async getById(driverId: string) {
    return prisma.driver.findUnique({
      where: { id: driverId },
    });
  }

  static async deliverOrder(orderId: string) {
    const order = await prisma.order.update({
      where: { orderId },
      data: {
        status: "delivered"
      },
    });

    return order;
  }

  static async completeOrder(
    orderId: string,
    driverId?: string
  ) {
    const order = await prisma.order.findUnique({
      where: { orderId },
    });

    if (!order || order.status !== "delivered") {
      throw new Error("Order not delivered yet");
    }

    await prisma.order.update({
      where: { orderId },
      data: {
        status: "completed",
        completedAt: new Date()
      },
    });

    // TRIGGER GAMIFICATION
    if (driverId) {
      try {
        await driverGamificationService.updateDriverStats(
          driverId,
          orderId
        );

        console.log(
          `🏆 Gamification updated for driver ${driverId}`
        );
      } catch (error) {
        console.error(
          'Gamification update failed:',
          error
        );
      }
    }

    return {
      message: "Order completed"
    };
  }

  // UPDATE LOCATION
  static async updateLocation(
    driverId: string,
    lat: number,
    lng: number
  ) {
    console.log(
      `📍 Updating location for driver ${driverId}:`,
      { lat, lng }
    );

    // Save to Redis with 60 second expiration
    const key = `driver:${driverId}:location`;

    const locationData = JSON.stringify({
      lat,
      lng,
      timestamp: Date.now()
    });

    await redis.setex(
      key,
      60,
      locationData
    );

    console.log(
      `✅ Location saved to Redis: ${key}`
    );

    console.log(
      `📍 Driver ${driverId} location updated`
    );

    // Also update heartbeat
    await this.heartbeat(
      driverId,
      lat,
      lng
    );

    // Update database as fallback
    await prisma.driver.update({
      where: { id: driverId },
      data: {
        currentLat: lat,
        currentLng: lng,
        lastLocationAt: new Date()
      }
    });

    // Broadcast to customers + admin dashboards
    io.emit("driver_location_update", {
      driverId,
      lat,
      lng
    });

    return {
      driverId,
      lat,
      lng
    };
  }
}

export default DriverService;