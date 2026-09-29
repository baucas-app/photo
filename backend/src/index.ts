import { app } from "./app.js";
import { env } from "./config/env.js";
import { purgeExpiredTrash } from "./services/asset.service.js";
import { scheduledBackup } from "./services/backup.service.js";

app.listen(env.port, () => {
  console.log(`Photos backend listening on port ${env.port}`);
});

// No separate job scheduler in this backend, so the trash's 30-day purge
// just runs on a timer in-process - checking once an hour is more than
// often enough for something with a day-granularity retention window.
const PURGE_INTERVAL_MS = 60 * 60 * 1000;
setInterval(() => {
  purgeExpiredTrash()
    .then((count) => {
      if (count > 0) console.log(`Trash purge: removed ${count} asset(s) past the 30-day retention window`);
    })
    .catch((error) => console.error("Trash purge failed", error));
}, PURGE_INTERVAL_MS);
purgeExpiredTrash().catch((error) => console.error("Initial trash purge failed", error));

// Daily database backup at 03:00 local time.
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
function scheduleNextBackup() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(3, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const delay = next.getTime() - now.getTime();
  setTimeout(() => {
    scheduledBackup();
    setInterval(scheduledBackup, BACKUP_INTERVAL_MS);
  }, delay);
}
if (process.env.BACKUP_DIR !== undefined || process.env.STORAGE_ROOT) {
  scheduleNextBackup();
}
