export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const TURN_SECONDS = 90;
export const REVEAL_SECONDS = 15;

export type GamePhase = "lobby" | "drawing" | "reveal" | "ended";

export interface Player {
  id: string;
  nickname: string;
  score: number;
  isHost: boolean;
  isConnected: boolean;
  hasGuessedCorrectly: boolean;
  joinedAt: number;
}

export interface ChatGuess {
  id: string;
  playerId: string;
  nickname: string;
  text: string;
  createdAt: number;
}

export interface DrawPoint {
  x: number;
  y: number;
}

export interface DrawStroke {
  id: string;
  playerId: string;
  color: string;
  width: number;
  mode: "draw" | "erase";
  points: DrawPoint[];
}

export interface TurnResult {
  word: string;
  drawerId: string;
  correctOrder: string[];
  pointsAwarded: Record<string, number>;
}

export interface RoomSnapshot {
  roomId: string;
  phase: GamePhase;
  players: Player[];
  hostId: string;
  selfId: string;
  drawerId: string | null;
  currentWord: string | null;
  wordLength: number | null;
  turnIndex: number;
  totalTurns: number;
  secondsRemaining: number;
  guesses: ChatGuess[];
  strokes: DrawStroke[];
  lastTurnResult: TurnResult | null;
  winnerIds: string[];
  canStart: boolean;
  canContinue: boolean;
}

export interface CreateRoomRequest {
  nickname: string;
}

export interface JoinRoomRequest {
  nickname: string;
  sessionToken?: string;
}

export interface JoinRoomResponse {
  roomId: string;
  playerId: string;
  sessionToken: string;
  snapshot: RoomSnapshot;
}

export interface ServerToClientEvents {
  "room:state": (snapshot: RoomSnapshot) => void;
  "game:started": (snapshot: RoomSnapshot) => void;
  "turn:started": (snapshot: RoomSnapshot) => void;
  "timer:tick": (snapshot: RoomSnapshot) => void;
  "draw:stroke": (stroke: DrawStroke) => void;
  "draw:clear": () => void;
  "guess:wrong": (guess: ChatGuess) => void;
  "guess:correct-status": (snapshot: RoomSnapshot) => void;
  "turn:reveal": (snapshot: RoomSnapshot) => void;
  "turn:ended": (snapshot: RoomSnapshot) => void;
  "game:ended": (snapshot: RoomSnapshot) => void;
  error: (message: string) => void;
}

export interface ClientToServerEvents {
  "room:join": (
    payload: { roomId: string; playerId: string; sessionToken: string },
    ack?: (snapshot: RoomSnapshot) => void
  ) => void;
  "game:start": (payload: { roomId: string; playerId: string }) => void;
  "game:continue": (payload: { roomId: string; playerId: string }) => void;
  "game:leave": (payload: { roomId: string; playerId: string }) => void;
  "draw:stroke": (payload: { roomId: string; stroke: DrawStroke }) => void;
  "draw:clear": (payload: { roomId: string; playerId: string }) => void;
  "guess:submit": (payload: { roomId: string; playerId: string; text: string }) => void;
}
