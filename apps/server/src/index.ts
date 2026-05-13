import { createAdapter } from "@socket.io/redis-adapter";
import { PrismaClient } from "@prisma/client";
import cors from "cors";
import express from "express";
import http from "node:http";
import { Redis } from "ioredis";
import { Server } from "socket.io";
import { z } from "zod";
import type { ClientToServerEvents, ServerToClientEvents } from "@draw-and-guess/shared";
import {
  addStroke,
  clearDrawing,
  continueGame,
  createRoomState,
  finishDrawingPhase,
  finishRevealPhase,
  joinRoomState,
  markDisconnected,
  snapshotFor,
  startGame,
  submitGuess,
  type RoomState
} from "./gameEngine.js";
import { createId, createRoomId } from "./ids.js";
import { RoomStore } from "./store.js";

const port = Number(process.env.PORT ?? 4000);
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const prisma = new PrismaClient();
const redis = new Redis(redisUrl);
const pubClient = new Redis(redisUrl);
const subClient = pubClient.duplicate();
const store = new RoomStore(redis);
const app = express();
const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: { origin: webOrigin, credentials: true }
});

io.adapter(createAdapter(pubClient, subClient));
app.use(cors({ origin: webOrigin, credentials: true }));
app.use(express.json());

const nicknameSchema = z.object({ nickname: z.string().trim().min(1).max(24) });
const joinSchema = nicknameSchema.extend({ sessionToken: z.string().optional() });

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/rooms", async (req, res) => {
  try {
    const { nickname } = nicknameSchema.parse(req.body);
    const roomId = await createUniqueRoomId();
    const playerId = createId();
    const sessionToken = createId();
    const state = createRoomState(roomId, playerId, nickname);
    await store.saveRoom(state);
    await store.saveSession(sessionToken, playerId);
    await ensureRoomRow(roomId);
    res.status(201).json({ roomId, playerId, sessionToken, snapshot: snapshotFor(state, playerId) });
  } catch (error) {
    res.status(400).json({ message: errorMessage(error) });
  }
});

app.post("/rooms/:roomId/join", async (req, res) => {
  try {
    const roomId = req.params.roomId.toUpperCase();
    const { nickname, sessionToken } = joinSchema.parse(req.body);
    const state = await mustGetRoom(roomId);
    const restoredPlayerId = await store.getPlayerIdForSession(sessionToken);
    const playerId = restoredPlayerId && state.players.some((player) => player.id === restoredPlayerId) ? restoredPlayerId : createId();
    const nextSessionToken = sessionToken && restoredPlayerId ? sessionToken : createId();
    joinRoomState(state, playerId, nickname);
    await store.saveRoom(state);
    await store.saveSession(nextSessionToken, playerId);
    await emitRoomState(state);
    res.json({ roomId, playerId, sessionToken: nextSessionToken, snapshot: snapshotFor(state, playerId) });
  } catch (error) {
    res.status(400).json({ message: errorMessage(error) });
  }
});

app.get("/rooms/:roomId", async (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const playerId = String(req.query.playerId ?? "");
  const state = await store.getRoom(roomId);
  if (!state || !playerId) {
    res.status(404).json({ message: "Room not found." });
    return;
  }
  res.json(snapshotFor(state, playerId));
});

io.on("connection", (socket) => {
  socket.on("room:join", async ({ roomId, playerId }, ack) => {
    const state = await store.getRoom(roomId);
    if (!state || !state.players.some((player) => player.id === playerId)) {
      socket.emit("error", "Room not found.");
      return;
    }
    socket.data.roomId = roomId;
    socket.data.playerId = playerId;
    await socket.join(roomId);
    ack?.(snapshotFor(state, playerId));
    await emitRoomState(state);
  });

  socket.on("game:start", async ({ roomId, playerId }) => {
    await mutateRoom(roomId, (state) => startGame(state, playerId), async (state) => {
      scheduleRoom(roomId);
      await emitRoomState(state, "game:started");
    });
  });

  socket.on("game:continue", async ({ roomId, playerId }) => {
    await mutateRoom(roomId, (state) => continueGame(state, playerId), async (state) => {
      scheduleRoom(roomId);
      await emitRoomState(state, "game:started");
    });
  });

  socket.on("game:leave", async ({ roomId, playerId }) => {
    await mutateRoom(roomId, (state) => leaveRoom(state, playerId), emitRoomState);
    await socket.leave(roomId);
  });

  socket.on("draw:stroke", async ({ roomId, stroke }) => {
    await mutateRoom(roomId, (state) => addStroke(state, stroke), async (state) => {
      socket.to(roomId).emit("draw:stroke", stroke);
      await emitRoomState(state);
    });
  });

  socket.on("draw:clear", async ({ roomId, playerId }) => {
    await mutateRoom(roomId, (state) => clearDrawing(state, playerId), async (state) => {
      io.to(roomId).emit("draw:clear");
      await emitRoomState(state);
    });
  });

  socket.on("guess:submit", async ({ roomId, playerId, text }) => {
    await mutateRoom(roomId, (state) => {
      const result = submitGuess(state, playerId, text);
      if (result.guess) {
        io.to(roomId).emit("guess:wrong", result.guess);
      }
      return result.state;
    }, async (state) => emitRoomState(state, "guess:correct-status"));
  });

  socket.on("disconnect", async () => {
    const roomId = socket.data.roomId;
    const playerId = socket.data.playerId;
    if (roomId && playerId) {
      await mutateRoom(roomId, (state) => markDisconnected(state, playerId), emitRoomState);
    }
  });
});

server.listen(port, () => {
  console.log(`Draw and Guess server listening on ${port}`);
});

async function mutateRoom(roomId: string, mutator: (state: RoomState) => RoomState, afterSave: (state: RoomState) => Promise<void>): Promise<void> {
  try {
    const state = await mustGetRoom(roomId);
    const nextState = mutator(state);
    await store.saveRoom(nextState);
    await afterSave(nextState);
  } catch (error) {
    io.to(roomId).emit("error", errorMessage(error));
  }
}

async function emitRoomState(state: RoomState, event: keyof ServerToClientEvents = "room:state"): Promise<void> {
  const sockets = await io.in(state.roomId).fetchSockets();
  await Promise.all(
    sockets.map(async (socket) => {
      const playerId = socket.data.playerId as string | undefined;
      if (playerId) {
        socket.emit(event as "room:state", snapshotFor(state, playerId));
      }
    })
  );
}

const timers = new Map<string, NodeJS.Timeout>();

function scheduleRoom(roomId: string): void {
  if (timers.has(roomId)) {
    clearInterval(timers.get(roomId));
  }
  timers.set(
    roomId,
    setInterval(async () => {
      const state = await store.getRoom(roomId);
      if (!state || state.phase === "lobby" || state.phase === "ended") {
        clearScheduled(roomId);
        return;
      }

      if (state.phaseEndsAt && state.phaseEndsAt <= Date.now()) {
        const nextState = state.phase === "drawing" ? finishDrawingPhase(state) : finishRevealPhase(state);
        await store.saveRoom(nextState);
        await emitRoomState(nextState, nextState.phase === "reveal" ? "turn:reveal" : nextState.phase === "ended" ? "game:ended" : "turn:started");
        if (nextState.phase === "ended") {
          await persistGame(nextState);
          clearScheduled(roomId);
        }
        return;
      }

      await emitRoomState(state, "timer:tick");
    }, 1000)
  );
}

function clearScheduled(roomId: string): void {
  const timer = timers.get(roomId);
  if (timer) {
    clearInterval(timer);
    timers.delete(roomId);
  }
}

async function createUniqueRoomId(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const roomId = createRoomId();
    if (!(await store.getRoom(roomId))) {
      return roomId;
    }
  }
  throw new Error("Could not create a unique room ID.");
}

async function mustGetRoom(roomId: string): Promise<RoomState> {
  const state = await store.getRoom(roomId);
  if (!state) {
    throw new Error("Room not found.");
  }
  return state;
}

function leaveRoom(state: RoomState, playerId: string): RoomState {
  if (state.phase === "drawing" || state.phase === "reveal") {
    return markDisconnected(state, playerId);
  }
  state.players = state.players.filter((player) => player.id !== playerId);
  if (state.hostId === playerId && state.players[0]) {
    state.hostId = state.players[0].id;
    state.players.forEach((player) => {
      player.isHost = player.id === state.hostId;
    });
  }
  return state;
}

async function ensureRoomRow(roomId: string): Promise<void> {
  await prisma.room.upsert({ where: { id: roomId }, update: {}, create: { id: roomId } }).catch(() => undefined);
}

async function persistGame(state: RoomState): Promise<void> {
  await ensureRoomRow(state.roomId);
  await prisma.game
    .create({
      data: {
        roomId: state.roomId,
        endedAt: new Date(),
        results: {
          players: state.players.map(({ id, nickname, score }) => ({ id, nickname, score })),
          winnerIds: state.winnerIds
        }
      }
    })
    .catch(() => undefined);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
