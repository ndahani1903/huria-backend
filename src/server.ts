import { redis } from "./config/redis";
import dotenv from "dotenv";
dotenv.config();

import http from "http";
import { Server } from "socket.io";
import app from './app';
import { env } from './config/env';
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

import orderRoutes from './modules/orders/order.routes';
import driverRoutes from './modules/drivers/driver.routes';
import disputeRoutes from './modules/disputes/dispute.routes';
import authRoutes from "./modules/auth/auth.routes";
import adminRoutes from "./modules/admin/admin.routes";
import walletRoutes from "./modules/wallet/wallet.routes";
import withdrawalRoutes from "./modules/withdrawal/withdrawal.routes";
import productRoutes from './modules/products/product.routes';
import merchantRoutes from './modules/merchants/merchant.routes';
import merchantWalletRoutes from './modules/merchants/merchantWallet.routes';

const httpServer = http.createServer(app);
const lastLogTime: Record<string, number> = {};

app.use('/api/orders', orderRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/disputes', disputeRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/withdrawals", withdrawalRoutes);
app.use('/api/products', productRoutes);
app.use('/api/merchants', merchantRoutes);
app.use('/api/merchants', merchantWalletRoutes);

export const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});

const redisUrl = process.env."redis://default:ytTLWKXYcpRTskkxmMrWyfxwaQOUfwUL@redis.railway.internal:6379" || "redis://localhost:6379";

const pubClient = createClient({ url: redisUrl });
const subClient = pubClient.duplicate();

async function initSocketRedis() {
  try {
    await pubClient.connect();
    await subClient.connect();
    io.adapter(createAdapter(pubClient, subClient));
    console.log("✅ Socket.IO Redis adapter connected");
  } catch (error) {
    console.error("❌ Redis connection failed:", error);
    // Don't crash the app - continue without Redis adapter
    console.log("⚠️ Running without Redis adapter (Socket.IO will use memory adapter)");
  }
}

initSocketRedis();

io.on("connection", socket => {
 console.log("Client connected:", socket.id);

  //driver join
socket.on("driver:join", (driverId: string) => {
    socket.join(driverId);
    console.log(`🚚 Driver joined room: ${driverId}`);
  });


/* type Driver = {
  id: string; 
  lat: number;  
  lng: number; 
  speed: number;
};

const drivers: Driver[] = [
  { id: "dc834ca5-ca78-40b8-9d93-c1d13fccbdb7", lat: -6.8, lng: 39.2, speed: 0.0005 },
  { id: "26fb45d8-ae3d-4de9-a441-1f64edee0124", lat: -6.81, lng: 39.21, speed: 0.0006 },
  { id: "a3d7b976-4150-4f13-ba5b-5994050fb12e", lat: -6.82, lng: 39.22, speed: 0.0004 },
];

///move drivers randomly
function moveDrivers() {
  drivers.forEach((d) => {
    d.lat +=(Math.random() - 0.5) * d.speed;
    d.lng +=(Math.random() - 0.5) * d.speed;
  });
}

//broadcast to frontend
function broadcastDrivers() {
   io.emit("drivers:update", drivers);
  }

//simulation loop
setInterval(() => {
  moveDrivers();
  broadcastDrivers();
}, 3000); */


//driver location update (very important)
socket.on("driver:location", async (data) => {
 const { driverId, lat, lng } = data;

    if (!driverId) {
      console.error("No driverId provided");
      return;
    }

     // ✅ Reduce logging frequency - only log every 30 seconds
     const now = Date.now();
    if (!lastLogTime[driverId] || now - lastLogTime[driverId] > 30000) {
       console.log("📡 Saving location:", driverId, lat, lng);
       lastLogTime[driverId] = now;
      }

    await redis.set(
      `driver:${driverId}:location`,
      JSON.stringify({ lat, lng, timestamp: now }),
      { EX: 60 } // 🔥 expires in 60 sec (Use object syntax)
    );

   // optional: broadcast for tracking
   io.emit("driver:location", { driverId, lat, lng }); // keep as-is
  });
socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
   });
 });

import { DriverService } from './modules/drivers/driver.service';

// 🧹 CLEAN UP STALE DRIVERS EVERY MINUTE
setInterval(async () => {
  try {
    const result = await DriverService.cleanupStaleDrivers();
    if (result.cleaned > 0) {
      console.log(`🧹 Cleaned up ${result.cleaned} stale drivers`);
    }
  } catch (error) {
    console.error("Stale driver cleanup failed:", error);
  }
}, 60 * 1000); // Every minute

// 💓 HEARTBEAT MONITOR (optional - log stale drivers)
setInterval(async () => {
  const driversRaw = await redis.sMembers("drivers:available");
  let drivers: string[];
  if (driversRaw instanceof Set) {
    drivers = Array.from(driversRaw).map(id => id.toString());
  } else if (Array.isArray(driversRaw)) {
    drivers = driversRaw.map(id => id.toString());
  } else {
    drivers = [];
  }
  if (drivers.length > 0) {
    console.log(`💓 Active drivers: ${drivers.length}`);
  }
}, 30 * 1000); // Every 30 seconds

// At the bottom of server.ts, modify the listen:

const PORT = parseInt(env.PORT as string) || 5000;

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});