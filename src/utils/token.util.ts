import jwt from "jsonwebtoken";

const ACCESS_SECRET = process.env.JWT_SECRET as string;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET as string;

// Add validation
if (!ACCESS_SECRET) {
  console.error("❌ JWT_SECRET is not defined in environment variables");
  throw new Error("JWT_SECRET is required");
}

if (!REFRESH_SECRET) {
  console.error("❌ JWT_REFRESH_SECRET is not defined in environment variables");
  throw new Error("JWT_REFRESH_SECRET is required");
}

export const signAccessToken = (payload: any) => {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '7d' });
 };

export const signRefreshToken = (payload: any) => {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: "30d" });
  };

export const verifyAccessToken = (token: string) => {
  return jwt.verify(token, ACCESS_SECRET);
};

export const verifyRefreshToken = (token: string) => {
  return jwt.verify(token, REFRESH_SECRET);
 };