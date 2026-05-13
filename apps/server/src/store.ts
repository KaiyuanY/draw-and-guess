import type { Redis } from "ioredis";
import type { RoomState } from "./gameEngine.js";

const ROOM_TTL_SECONDS = 60 * 60 * 6;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export class RoomStore {
  constructor(private readonly redis: Redis) {}

  async getRoom(roomId: string): Promise<RoomState | null> {
    const raw = await this.redis.get(roomKey(roomId));
    return raw ? (JSON.parse(raw) as RoomState) : null;
  }

  async saveRoom(state: RoomState): Promise<void> {
    await this.redis.set(roomKey(state.roomId), JSON.stringify(state), "EX", ROOM_TTL_SECONDS);
  }

  async saveSession(sessionToken: string, playerId: string): Promise<void> {
    await this.redis.set(sessionKey(sessionToken), playerId, "EX", SESSION_TTL_SECONDS);
  }

  async getPlayerIdForSession(sessionToken?: string): Promise<string | null> {
    if (!sessionToken) {
      return null;
    }
    return this.redis.get(sessionKey(sessionToken));
  }
}

function roomKey(roomId: string): string {
  return `room:${roomId}`;
}

function sessionKey(sessionToken: string): string {
  return `session:${sessionToken}`;
}
