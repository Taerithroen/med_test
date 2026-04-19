import { Queue } from "bullmq";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const url = new URL(redisUrl);

export const reportQueue = new Queue("report-jobs", {
  connection: {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
  },
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: 50,
    removeOnFail: 200,
  },
});

