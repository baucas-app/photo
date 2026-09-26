import { startMlWorker } from "./queues/mlWorker.js";

const worker = startMlWorker();
console.log("Photos backup-worker: listening for ml-pipeline jobs");

process.on("SIGTERM", async () => {
  await worker.close();
  process.exit(0);
});
