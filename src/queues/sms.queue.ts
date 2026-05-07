import { Queue } from "bullmq";

export const smsQueue = new Queue("sms", {
  connection: {
    host: "127.0.0.1",
    port: 6379
  }
});