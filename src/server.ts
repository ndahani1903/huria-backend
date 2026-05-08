import redis from "./config/redis";
import dotenv from "dotenv";
dotenv.config();

import jwt from "jsonwebtoken";
import http from "http";
import { Server } from "socket.io";
import app from './app';
import { env } from './config/env';
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import OrderService from "./modules/orders/order.service";

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
import investorRoutes from './routes/investor.routes';
import merchantLendingRoutes from './modules/lending/merchantLending.routes';
import driverLendingRoutes from './modules/lending/driverLending.routes';
import merchantTierRoutes from './modules/merchants/tiers.routes';
import subscriptionRoutes from './modules/subscription/subscription.routes';
import './jobs/subscriptionRenewal.job'; // Start the cron job
import './jobs/gamificationReset.job';
import './jobs/tierEvaluation.job';
import forecastRoutes from './routes/forecast.routes';
import legalRoutes from './routes/legal.routes';
import coPilotRoutes from './routes/copilot.routes';
import addressRoutes from './routes/address.routes';
import userRoutes from "./modules/users/user.routes";
import reviewRoutes from './modules/reviews/review.routes';
import notificationSettingsRoutes from './modules/notifications/notificationSettings.routes';
import testNotificationRoutes from './modules/notifications/testNotification.routes';

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
app.use('/api/investor', investorRoutes);
app.use('/api/merchants/lending', merchantLendingRoutes);
app.use('/api/drivers/lending', driverLendingRoutes);
app.use('/api/merchant/tier', merchantTierRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/forecast', forecastRoutes);
app.use('/legal', legalRoutes);
app.use('/api/copilot', coPilotRoutes);
app.use('/api/addresses', addressRoutes);
app.use("/api/users", userRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/users', notificationSettingsRoutes);
app.use('/api/test', testNotificationRoutes);

export const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});

let pubClient: any;
let subClient: any;

if (redis) {
  // Use your existing ioredis client as the pub client
  pubClient = redis;
  // Create a duplicate with the same config for subscription
  subClient = redis.duplicate();
  
  // Ensure the duplicate also has family: 0
  if (subClient.options) {
    subClient.options.family = 0;
  }
} else {
  console.log("⚠️ Redis client not available. Using memory adapter.");
}

async function initSocketRedis() {
  try {
    if (!pubClient || !subClient) {
  console.log("⚠️ REDIS_URL missing. Using memory adapter.");
  return;
}

// For ioredis, we don't call connect() - it connects automatically
    // Just wait a moment for connection to be ready
    await new Promise(resolve => setTimeout(resolve, 100));

io.adapter(createAdapter(pubClient, subClient));
    console.log("✅ Socket.IO Redis adapter connected");
  } catch (error) {
    console.error("❌ Redis connection failed:", error);
    // Don't crash the app - continue without Redis adapter
    console.log("⚠️ Running without Redis adapter (Socket.IO will use memory adapter)");
  }
}

initSocketRedis();

function verifyToken(token: string): any {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!);
  } catch {
    return null;
  }
}


io.on("connection", socket => {
 console.log("Client connected:", socket.id);

  //driver join
socket.on("driver:join", async ({ token }) => {
   const user = verifyToken(token);

   if (!user || user.role !== "driver") return;

   socket.join(`driver:${user.driverId}`);
    console.log(`🚚 Driver joined room: ${user.driverId}`);
  });

   socket.on("user:join", (userId:string)=>{
   socket.join(`user:${userId}`);
});

socket.on("merchant:join", (merchantId:string)=>{
   socket.join(`merchant:${merchantId}`);
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
const socketRate = new Map();

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

    await redis.setex(
      `driver:${driverId}:location`, 60, 
      JSON.stringify({ lat, lng, timestamp: now })
      // 🔥 expires in 60 sec (Use object syntax)
    );

 const last = socketRate.get(socket.id) || 0;

 if (Date.now() - last < 2000) return;

 socketRate.set(socket.id, Date.now());

   // optional: broadcast for tracking
  const trackingOrder = await OrderService.getDriverCurrentOrder(driverId);

if (trackingOrder) {
   io.to(`user:${trackingOrder.userId}`).emit("driver:location",  {
      driverId,
      lat,
      lng
    });
  
  await OrderService.refreshActiveRoute(driverId, lat, lng);
 }
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
  const driversRaw = await redis.smembers("drivers:available");
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

//10,000 old drivers = memory growth. so Every 10 mins cleanup:
setInterval(() => {
   const cutoff = Date.now() - 3600000;

   Object.keys(lastLogTime).forEach(id => {
      if (lastLogTime[id] < cutoff) delete lastLogTime[id];
   });
}, 600000);


// At the bottom of server.ts, modify the listen:

const PORT = parseInt(env.PORT as string) || 5000;

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});