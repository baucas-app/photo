import { Queue } from "bullmq";
import { ML_PIPELINE_QUEUE, type MlPipelineJobData } from "@photos/shared";
import { redisConnection } from "./redisConnection.js";

export const mlQueue = new Queue<MlPipelineJobData>(ML_PIPELINE_QUEUE, { connection: redisConnection });

export async function enqueueMlPipeline(data: MlPipelineJobData): Promise<void> {
  await mlQueue.add("process-asset", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}
