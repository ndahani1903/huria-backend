import { z } from "zod";

export const stkPushSchema = z.object({
  orderId: z.string().min(3, "Order ID required"),
  phone: z.string().min(10, "Valid phone required"),
  amount: z.coerce.number().positive("Amount must be greater than 0")
});