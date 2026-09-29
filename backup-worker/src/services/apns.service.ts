import crypto from "crypto";
import http2 from "http2";
import { prisma } from "@photos/database";

const APNS_KEY_ID = process.env.APNS_KEY_ID ?? "";
const APNS_TEAM_ID = process.env.APNS_TEAM_ID ?? "";
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID ?? "de.baucas.photos";
const APNS_KEY_P8 = process.env.APNS_KEY_P8 ?? "";
const APNS_PROD = process.env.APNS_ENV === "production";

const APNS_HOST = APNS_PROD ? "api.push.apple.com" : "api.sandbox.push.apple.com";

let _cachedJwt: { token: string; issuedAt: number } | null = null;

function buildJwt(): string {
  if (_cachedJwt && Date.now() / 1000 - _cachedJwt.issuedAt < 3000) {
    return _cachedJwt.token;
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: APNS_TEAM_ID, iat: issuedAt })).toString("base64url");
  const unsigned = `${header}.${payload}`;
  const sign = crypto.createSign("SHA256");
  sign.update(unsigned);
  const sig = sign.sign(
    { key: Buffer.from(APNS_KEY_P8, "base64").toString("utf8"), dsaEncoding: "ieee-p1363" }
  ).toString("base64url");
  const token = `${unsigned}.${sig}`;
  _cachedJwt = { token, issuedAt };
  return token;
}

function apnsConfigured(): boolean {
  return !!(APNS_KEY_ID && APNS_TEAM_ID && APNS_KEY_P8);
}

async function sendPush(deviceToken: string, title: string, body: string): Promise<void> {
  const jwt = buildJwt();
  const payload = JSON.stringify({ aps: { alert: { title, body }, sound: "default", badge: 1 } });
  await new Promise<void>((resolve, reject) => {
    const client = http2.connect(`https://${APNS_HOST}`);
    client.on("error", reject);
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      ":scheme": "https",
      ":authority": APNS_HOST,
      "content-type": "application/json",
      "content-length": Buffer.byteLength(payload),
      "apns-push-type": "alert",
      "apns-topic": APNS_BUNDLE_ID,
      "apns-priority": "10",
      authorization: `bearer ${jwt}`,
    });
    req.write(payload);
    req.end();
    req.on("response", (headers) => {
      const status = headers[":status"];
      if (status === 200) {
        resolve();
      } else {
        let responseBody = "";
        req.on("data", (chunk: Buffer) => { responseBody += chunk.toString(); });
        req.on("end", () => { reject(new Error(`APNs ${status}: ${responseBody}`)); });
      }
      client.close();
    });
  });
}

export async function notifyUser(userId: string, title: string, body: string): Promise<void> {
  if (!apnsConfigured()) return;
  const tokens = await prisma.devicePushToken.findMany({ where: { userId } });
  await Promise.allSettled(tokens.map((t) => sendPush(t.token, title, body)));
}
