import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { simpleGit } from "simple-git";
import { env } from "../config/env.js";

const execFileAsync = promisify(execFile);
const git = simpleGit(env.gitRepoPath);

export interface GitStatus {
  currentCommit: string;
  currentMessage: string;
  remoteCommit: string;
  updateAvailable: boolean;
}

export async function getGitStatus(): Promise<GitStatus> {
  await git.fetch();

  const local = await git.log({ maxCount: 1 });
  const currentCommit = local.latest?.hash ?? "unknown";
  const currentMessage = local.latest?.message ?? "";

  const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
  const remoteCommit = (await git.revparse([`origin/${branch}`])).trim();

  return {
    currentCommit,
    currentMessage,
    remoteCommit,
    updateAvailable: currentCommit !== remoteCommit,
  };
}

export interface GitUpdateResult {
  success: boolean;
  log: string;
}

/**
 * Pulls the latest commit and restarts the backend/frontend containers via
 * the docker compose CLI on the host. Requires the container to have the
 * docker socket mounted - see docker-compose.yml.
 */
export async function pullAndRestart(): Promise<GitUpdateResult> {
  const logLines: string[] = [];

  try {
    const pullSummary = await git.pull();
    logLines.push(`git pull: ${JSON.stringify(pullSummary.summary)}`);

    const { stdout, stderr } = await execFileAsync("docker", [
      "compose",
      "restart",
      "backend",
      "frontend",
    ]);
    logLines.push(stdout, stderr);

    return { success: true, log: logLines.join("\n") };
  } catch (error) {
    logLines.push(error instanceof Error ? error.message : String(error));
    return { success: false, log: logLines.join("\n") };
  }
}
