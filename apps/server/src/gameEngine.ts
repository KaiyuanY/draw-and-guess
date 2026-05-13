import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  REVEAL_SECONDS,
  TURN_SECONDS,
  type ChatGuess,
  type DrawStroke,
  type GamePhase,
  type Player,
  type RoomSnapshot,
  type TurnResult
} from "@draw-and-guess/shared";
import { pickWord } from "./words.js";

export interface RoomState {
  roomId: string;
  phase: GamePhase;
  players: Player[];
  hostId: string;
  drawerId: string | null;
  currentWord: string | null;
  turnIndex: number;
  turnOrder: string[];
  phaseEndsAt: number | null;
  guesses: ChatGuess[];
  strokes: DrawStroke[];
  correctOrder: string[];
  lastTurnResult: TurnResult | null;
  winnerIds: string[];
  createdAt: number;
}

export function createRoomState(roomId: string, playerId: string, nickname: string): RoomState {
  const now = Date.now();
  return {
    roomId,
    phase: "lobby",
    players: [
      {
        id: playerId,
        nickname,
        score: 0,
        isHost: true,
        isConnected: true,
        hasGuessedCorrectly: false,
        joinedAt: now
      }
    ],
    hostId: playerId,
    drawerId: null,
    currentWord: null,
    turnIndex: 0,
    turnOrder: [],
    phaseEndsAt: null,
    guesses: [],
    strokes: [],
    correctOrder: [],
    lastTurnResult: null,
    winnerIds: [],
    createdAt: now
  };
}

export function joinRoomState(state: RoomState, playerId: string, nickname: string): RoomState {
  const existing = state.players.find((player) => player.id === playerId);
  if (existing) {
    existing.nickname = nickname || existing.nickname;
    existing.isConnected = true;
    return state;
  }

  if (state.players.length >= MAX_PLAYERS) {
    throw new Error("Room is full.");
  }

  if (state.phase !== "lobby" && state.phase !== "ended") {
    throw new Error("This game is already in progress.");
  }

  state.players.push({
    id: playerId,
    nickname,
    score: 0,
    isHost: false,
    isConnected: true,
    hasGuessedCorrectly: false,
    joinedAt: Date.now()
  });

  return state;
}

export function startGame(state: RoomState, hostId: string): RoomState {
  if (state.hostId !== hostId) {
    throw new Error("Only the host can start the game.");
  }
  if (state.players.length < MIN_PLAYERS) {
    throw new Error("At least 2 players are required.");
  }

  state.players.forEach((player) => {
    player.score = 0;
    player.hasGuessedCorrectly = false;
  });
  state.turnOrder = [...state.players].sort((a, b) => a.joinedAt - b.joinedAt).map((player) => player.id);
  state.turnIndex = 0;
  state.winnerIds = [];
  state.lastTurnResult = null;
  return beginTurn(state);
}

export function continueGame(state: RoomState, hostId: string): RoomState {
  if (state.phase !== "ended") {
    throw new Error("The current game has not ended yet.");
  }
  return startGame(state, hostId);
}

export function beginTurn(state: RoomState): RoomState {
  const drawerId = state.turnOrder[state.turnIndex];
  if (!drawerId) {
    return endGame(state);
  }

  state.phase = "drawing";
  state.drawerId = drawerId;
  state.currentWord = pickWord();
  state.phaseEndsAt = Date.now() + TURN_SECONDS * 1000;
  state.guesses = [];
  state.strokes = [];
  state.correctOrder = [];
  state.lastTurnResult = null;
  state.players.forEach((player) => {
    player.hasGuessedCorrectly = player.id === drawerId;
  });
  return state;
}

export function submitGuess(state: RoomState, playerId: string, text: string): { state: RoomState; guess?: ChatGuess; correct: boolean } {
  if (state.phase !== "drawing" || !state.currentWord || playerId === state.drawerId) {
    return { state, correct: false };
  }

  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || player.hasGuessedCorrectly) {
    return { state, correct: false };
  }

  const normalizedGuess = normalize(text);
  const normalizedWord = normalize(state.currentWord);
  if (normalizedGuess === normalizedWord) {
    const guesserCount = Math.max(state.players.length - 1, 0);
    const points = Math.max(guesserCount - state.correctOrder.length, 1);
    const drawer = state.players.find((candidate) => candidate.id === state.drawerId);
    player.score += points;
    player.hasGuessedCorrectly = true;
    state.correctOrder.push(playerId);
    if (drawer) {
      drawer.score += 1;
    }
    return { state, correct: true };
  }

  const guess: ChatGuess = {
    id: crypto.randomUUID(),
    playerId,
    nickname: player.nickname,
    text: text.slice(0, 120),
    createdAt: Date.now()
  };
  state.guesses.push(guess);
  return { state, guess, correct: false };
}

export function addStroke(state: RoomState, stroke: DrawStroke): RoomState {
  if (state.phase === "drawing" && state.drawerId === stroke.playerId) {
    state.strokes.push(stroke);
  }
  return state;
}

export function clearDrawing(state: RoomState, playerId: string): RoomState {
  if (state.phase === "drawing" && state.drawerId === playerId) {
    state.strokes = [];
  }
  return state;
}

export function finishDrawingPhase(state: RoomState): RoomState {
  const pointsAwarded: Record<string, number> = {};
  state.players.forEach((player) => {
    pointsAwarded[player.id] = player.score;
  });
  state.lastTurnResult = {
    word: state.currentWord ?? "",
    drawerId: state.drawerId ?? "",
    correctOrder: [...state.correctOrder],
    pointsAwarded
  };
  state.phase = "reveal";
  state.phaseEndsAt = Date.now() + REVEAL_SECONDS * 1000;
  return state;
}

export function finishRevealPhase(state: RoomState): RoomState {
  state.turnIndex += 1;
  if (state.turnIndex >= state.turnOrder.length) {
    return endGame(state);
  }
  return beginTurn(state);
}

export function endGame(state: RoomState): RoomState {
  const highestScore = Math.max(...state.players.map((player) => player.score));
  state.phase = "ended";
  state.turnIndex = Math.max(state.turnOrder.length - 1, 0);
  state.drawerId = null;
  state.currentWord = null;
  state.phaseEndsAt = null;
  state.winnerIds = state.players.filter((player) => player.score === highestScore).map((player) => player.id);
  state.players.forEach((player) => {
    player.hasGuessedCorrectly = false;
  });
  return state;
}

export function markDisconnected(state: RoomState, playerId: string): RoomState {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (player) {
    player.isConnected = false;
  }
  return state;
}

export function secondsRemaining(state: RoomState): number {
  if (!state.phaseEndsAt) {
    return 0;
  }
  return Math.max(0, Math.ceil((state.phaseEndsAt - Date.now()) / 1000));
}

export function snapshotFor(state: RoomState, selfId: string): RoomSnapshot {
  const isDrawer = state.drawerId === selfId;
  const canSeeWord = isDrawer || state.phase === "reveal";
  return {
    roomId: state.roomId,
    phase: state.phase,
    players: state.players,
    hostId: state.hostId,
    selfId,
    drawerId: state.drawerId,
    currentWord: canSeeWord ? state.currentWord : null,
    wordLength: state.currentWord ? state.currentWord.length : null,
    turnIndex: state.turnIndex,
    totalTurns: state.turnOrder.length || state.players.length,
    secondsRemaining: secondsRemaining(state),
    guesses: state.guesses,
    strokes: state.strokes,
    lastTurnResult: state.phase === "reveal" || state.phase === "ended" ? state.lastTurnResult : null,
    winnerIds: state.winnerIds,
    canStart: state.phase === "lobby" && state.players.length >= MIN_PLAYERS && selfId === state.hostId,
    canContinue: state.phase === "ended" && state.players.length >= MIN_PLAYERS && selfId === state.hostId
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
