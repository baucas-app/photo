import { Queue } from "bullmq";
import { ML_PIPELINE_QUEUE, type MlPipelineJobData } from "@photos/shared";
import { redisConnection } from "./redisConnection.js";

export const mlQueue = new Queue<MlPipelineJobData>(ML_PIPELINE_QUEUE, { connection: redisConnection });

export async function enqueueMlPipeline(data: MlPipelineJobData): Promise<void> {
  await mlQueue.add("process-asset", data, {
    // Stable per-asset id: BullMQ silently no-ops add() if a job with this
    // id is still waiting/active/delayed, so re-queueing the same asset (the
    // admin "Rescan"-Button did this for everyone on every click, since it
    // re-enqueues the whole library) can't pile up duplicate jobs for it.
    // Once a job completes/fails and ages out (removeOnComplete/Fail below),
    // the id frees up again for a genuinely new run.
    jobId: data.assetId,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}
