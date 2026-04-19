import { redis } from "../../config/redis";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/db";

const SECRET = process.env.JWT_SECRET as string;

export class AuthService {

  static async register(
    name: string,
    phone: string,
    email: string,
    password: string,
    role: string
  ) {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { phone }],
      },
    });

    if (existing) {
      throw new Error("User already exists");
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        phone,
        email,
        password: hashed,
        role,
      },
    });

    if (role === "merchant") {
      await prisma.merchant.create({
        data: {
        userId: user.id,
        name,
        phone,
       },
     });
    }

    // 🔥 CREATE DRIVER PROFILE
    if (role === "driver") {
      {/*await prisma.driver.create({ */}
      const driver = await prisma.driver.create({
        data: {
          userId: user.id,
          name: user.name,
          phone: user.phone,
          status: "available",
        },
      });

// 🔥 ADD THIS LINE:
  await redis.sAdd("drivers:available", driver.id);
  console.log("✅ New driver added to Redis:", driver.id);
    }

       const token = jwt.sign(
      { id: user.id, role: user.role },
      SECRET,
      { expiresIn: "7d" }
    );

    return { 
      token,
      user: {
        id: user.id,
        role: user.role
       } 
     };
  }

  static async login(phone: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { phone },
    });

    if (!user) {throw new Error("User not found");}

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw new Error("Invalid credentials");

    let driverId = null;

    // 🔥 GET DRIVER ID IF DRIVER
    if (user.role === "driver") {
      const driver = await prisma.driver.findUnique({
        where: { userId: user.id },
      });

      if (!driver) throw new Error("Driver profile missing");

      driverId = driver.id;
    
   //Add driver to Redis available set
    await redis.sAdd("drivers:available", driver.id);
    console.log("✅ Driver added to Redis available set:", driver.id);
  }

// ✅ CRITICAL PART
  const token = jwt.sign(
    { id: user.id, role: user.role, driverId: driverId },
     SECRET,
   // process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  return {
      token,
      user: {
        id: user.id,
        role: user.role,
        driverId: driverId
      }
   };
 }

  // Add a logout endpoint to remove from Redis
static async logout(driverId: string) {
  await redis.sRem("drivers:available", driverId);
}
}