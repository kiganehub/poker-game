import { prisma } from "@/lib/db/client";
import crypto from "node:crypto";

/**
 * MVP auth: guest id -> user. No passwords, no OAuth. A guestId in the URL
 * query resolves to (or creates) a User row and is used as the identity
 * cookie for all WebSocket / API calls.
 */
export async function resolveGuestUser(
  guestId: string,
  displayName?: string,
): Promise<{ id: string; displayName: string }> {
  const existing = await prisma.user.findUnique({ where: { guestId } });
  if (existing) return { id: existing.id, displayName: existing.displayName };
  const created = await prisma.user.create({
    data: {
      guestId,
      displayName: displayName ?? guestId,
    },
  });
  return { id: created.id, displayName: created.displayName };
}

export function generateInviteCode(): string {
  return crypto.randomBytes(4).toString("hex");
}

export function generateReconnectToken(): string {
  return crypto.randomBytes(16).toString("hex");
}
