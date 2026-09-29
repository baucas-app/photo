import { Worker, type Job } from "bullmq";
import { ML_PIPELINE_QUEUE, type MlPipelineJobData } from "@photos/shared";
import { runMlPipeline } from "../services/mlPipeline.service.js";
import { notifyUser } from "../services/apns.service.js";
import { redisConnection } from "./redisConnection.js";

// Debounce: after 30 s of quiet per user, send one summarising push.
const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; count: number }>();

function scheduleUploadNotification(userId: string): void {
  const entry = pending.get(userId);
  if (entry) {
    clearTimeout(entry.timer);
    entry.count++;
  } else {
    pending.set(userId, { count: 1, timer: undefined! });
  }
  const current = pending.get(userId)!;
  current.timer = setTimeout(async () => {
    pending.delete(userId);
    const n = current.count;
    const body = n === 1 ? "1 Foto wurde verarbeitet." : `${n} Fotos wurden verarbeitet.`;
    await notifyUser(userId, "Backup abgeschlossen", body).catch(() => {});
  }, 30_000);
}

export function startMlWorker(): Worker<MlPipelineJobData> {
  const worker = new Worker<MlPipelineJobData>(
    ML_PIPELINE_QUEUE,
    async (job: Job<MlPipelineJobData>) => {
      await runMlPipeline(job.data.assetId, job.data.userId, job.data.relativePath);
      scheduleUploadNotification(job.data.userId);
    },
    { connection: redisConnection, concurrency: 2 },
  );

  worker.on("failed", (job, err) => {
    console.error(`ml-pipeline job ${job?.id} failed:`, err);
  });

  return worker;
}
