import { Worker, type Job } from "bullmq";
import { ML_PIPELINE_QUEUE, type MlPipelineJobData } from "@photos/shared";
import { runMlPipeline } from "../services/mlPipeline.service.js";
import { redisConnection } from "./redisConnection.js";

export function startMlWorker(): Worker<MlPipelineJobData> {
  const worker = new Worker<MlPipelineJobData>(
    ML_PIPELINE_QUEUE,
    async (job: Job<MlPipelineJobData>) => {
      await runMlPipeline(job.data.assetId, job.data.userId, job.data.relativePath);
    },
    { connection: redisConnection, concurrency: 2 },
  );

  worker.on("failed", (job, err) => {
    console.error(`ml-pipeline job ${job?.id} failed:`, err);
  });

  return worker;
}
