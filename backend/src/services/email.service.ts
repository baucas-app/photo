import nodemailer from "nodemailer";
import { prisma } from "../db/prisma.js";

function createTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT ?? "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

const from = process.env.SMTP_FROM ?? "Photos <noreply@photos.local>";

async function send(to: string, subject: string, html: string) {
  const transport = createTransport();
  if (!transport) return; // SMTP not configured → silent no-op
  try {
    await transport.sendMail({ from, to, subject, html });
  } catch (err) {
    console.error("[email] send failed:", err);
  }
}

// ── Generic user notification ────────────────────────────────────────────────

export async function notifyUserEmail(userId: string, subject: string, html: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (user?.email) await send(user.email, subject, html);
}

// ── Album notifications ──────────────────────────────────────────────────────

export interface AlbumEmailRecipient {
  email: string;
  name?: string | null;
}

export async function sendNewPhotosNotification(opts: {
  albumName: string;
  albumId: string;
  addedCount: number;
  addedByName?: string | null;
  appUrl: string;
  recipients: AlbumEmailRecipient[];
}) {
  const albumUrl = `${opts.appUrl}/albums/${opts.albumId}`;
  const byLine = opts.addedByName ? `von <strong>${opts.addedByName}</strong> ` : "";
  const subject = `${opts.addedCount} neue${opts.addedCount === 1 ? "s Foto" : " Fotos"} in „${opts.albumName}"`;

  const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:560px;">
        <tr>
          <td style="background:#1a1a1a;padding:24px 32px;">
            <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">Photos</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111;">
              ${subject}
            </p>
            <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
              ${opts.addedCount === 1 ? "Ein neues Foto wurde" : `${opts.addedCount} neue Fotos wurden`}
              ${byLine}zum Album <strong>${opts.albumName}</strong> hinzugefügt.
            </p>
            <a href="${albumUrl}"
               style="display:inline-block;background:#1a1a1a;color:#fff;font-size:15px;font-weight:600;
                      text-decoration:none;padding:12px 24px;border-radius:8px;">
              Album öffnen →
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #eee;">
            <p style="margin:0;font-size:12px;color:#aaa;">
              Du erhältst diese E-Mail, weil du Mitglied dieses Albums bist.<br>
              <a href="${albumUrl}" style="color:#aaa;">Album anzeigen</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await Promise.all(opts.recipients.map((r) => send(r.email, subject, html)));
}

export async function sendNewCommentNotification(opts: {
  albumName: string;
  albumId: string;
  commentBody: string;
  commentByName?: string | null;
  appUrl: string;
  recipients: AlbumEmailRecipient[];
}) {
  const albumUrl = `${opts.appUrl}/albums/${opts.albumId}`;
  const by = opts.commentByName ?? "Jemand";
  const subject = `Neuer Kommentar in „${opts.albumName}"`;

  const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:560px;">
        <tr>
          <td style="background:#1a1a1a;padding:24px 32px;">
            <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">Photos</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111;">Neuer Kommentar</p>
            <p style="margin:0 0 16px;font-size:15px;color:#555;">
              <strong>${by}</strong> hat in <strong>${opts.albumName}</strong> kommentiert:
            </p>
            <blockquote style="margin:0 0 24px;padding:16px 20px;background:#f8f8f8;
                               border-left:4px solid #ddd;border-radius:0 8px 8px 0;
                               font-size:15px;color:#333;line-height:1.6;">
              ${opts.commentBody.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
            </blockquote>
            <a href="${albumUrl}"
               style="display:inline-block;background:#1a1a1a;color:#fff;font-size:15px;font-weight:600;
                      text-decoration:none;padding:12px 24px;border-radius:8px;">
              Album öffnen →
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #eee;">
            <p style="margin:0;font-size:12px;color:#aaa;">
              Du erhältst diese E-Mail, weil du Mitglied dieses Albums bist.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await Promise.all(opts.recipients.map((r) => send(r.email, subject, html)));
}
