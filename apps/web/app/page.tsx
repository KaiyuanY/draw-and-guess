"use client";

import { Brush, Check, Clock, DoorOpen, Eraser, Play, Plus, RotateCcw, Send, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, DrawPoint, DrawStroke, JoinRoomResponse, RoomSnapshot, ServerToClientEvents } from "../../../packages/shared/src/index";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const COLORS = ["#202124", "#d9480f", "#0f8b8d", "#3b6ea8", "#f2b705"];

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export default function Home() {
  const [nickname, setNickname] = useState("");
  const [roomIdInput, setRoomIdInput] = useState("");
  const [session, setSession] = useState<{ roomId: string; playerId: string; sessionToken: string } | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [socket, setSocket] = useState<GameSocket | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("draw-and-guess-session");
    if (saved) {
      setSession(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    localStorage.setItem("draw-and-guess-session", JSON.stringify(session));
    const nextSocket: GameSocket = io(API_URL, { transports: ["websocket"] });
    setSocket(nextSocket);

    const setState = (nextSnapshot: RoomSnapshot) => setSnapshot(nextSnapshot);
    nextSocket.on("room:state", setState);
    nextSocket.on("game:started", setState);
    nextSocket.on("turn:started", setState);
    nextSocket.on("timer:tick", setState);
    nextSocket.on("guess:correct-status", setState);
    nextSocket.on("turn:reveal", setState);
    nextSocket.on("turn:ended", setState);
    nextSocket.on("game:ended", setState);
    nextSocket.on("error", setError);
    nextSocket.emit("room:join", session, setState);

    return () => {
      nextSocket.disconnect();
    };
  }, [session]);

  async function createRoom() {
    setError("");
    const response = await request<JoinRoomResponse>("/rooms", { nickname });
    setSnapshot(response.snapshot);
    setSession({ roomId: response.roomId, playerId: response.playerId, sessionToken: response.sessionToken });
  }

  async function joinRoom() {
    setError("");
    const response = await request<JoinRoomResponse>(`/rooms/${roomIdInput.trim().toUpperCase()}/join`, {
      nickname,
      sessionToken: session?.sessionToken
    });
    setSnapshot(response.snapshot);
    setSession({ roomId: response.roomId, playerId: response.playerId, sessionToken: response.sessionToken });
  }

  async function request<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.message ?? "Request failed.");
      throw new Error(payload.message);
    }
    return payload as T;
  }

  function leaveRoom() {
    if (socket && session) {
      socket.emit("game:leave", { roomId: session.roomId, playerId: session.playerId });
    }
    localStorage.removeItem("draw-and-guess-session");
    setSession(null);
    setSnapshot(null);
    setSocket(null);
  }

  if (!snapshot || !session || !socket) {
    return (
      <main className="page">
        <div className="shell">
          <header className="topbar">
            <div className="brand">
              <div className="brand-mark">
                <Brush size={22} />
              </div>
              <div>
                <h1>Draw and Guess</h1>
                <p>Real-time sketching for 2-4 players</p>
              </div>
            </div>
          </header>
          <section className="landing-grid">
            <div className="playful-stage" aria-hidden="true">
              <div className="sample-drawing">
                <svg viewBox="0 0 800 520" role="img">
                  <path d="M108 356 C172 245 247 240 310 342 C372 444 467 423 538 305 C595 211 686 216 727 329" fill="none" stroke="#0f8b8d" strokeWidth="18" strokeLinecap="round" />
                  <path d="M184 180 L250 120 L318 182 L292 280 L208 280 Z" fill="#f2b705" stroke="#202124" strokeWidth="8" strokeLinejoin="round" />
                  <circle cx="556" cy="169" r="58" fill="#d9480f" stroke="#202124" strokeWidth="8" />
                  <path d="M548 111 C516 82 482 82 458 111" fill="none" stroke="#3b6ea8" strokeWidth="9" strokeLinecap="round" />
                  <path d="M99 423 H705" stroke="#202124" strokeWidth="10" strokeLinecap="round" />
                </svg>
                <div className="sample-caption">
                  <strong>Sketch fast.</strong>
                  <p className="muted">Guess faster. The room waits for nobody.</p>
                </div>
              </div>
            </div>
            <div className="join-panel">
              <h2>Enter a room</h2>
              <div className="form">
                <label className="field">
                  <span>Nickname</span>
                  <input className="input" maxLength={24} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Ada" />
                </label>
                <button className="btn" disabled={!nickname.trim()} onClick={createRoom}>
                  <Plus size={18} /> Create room
                </button>
                <label className="field">
                  <span>Room ID</span>
                  <input className="input" maxLength={8} value={roomIdInput} onChange={(event) => setRoomIdInput(event.target.value.toUpperCase())} placeholder="ABC123" />
                </label>
                <button className="btn secondary" disabled={!nickname.trim() || !roomIdInput.trim()} onClick={joinRoom}>
                  <DoorOpen size={18} /> Join room
                </button>
                <p className="error">{error}</p>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return <RoomView snapshot={snapshot} socket={socket} session={session} onLeave={leaveRoom} error={error} />;
}

function RoomView({
  snapshot,
  socket,
  session,
  onLeave,
  error
}: {
  snapshot: RoomSnapshot;
  socket: GameSocket;
  session: { roomId: string; playerId: string; sessionToken: string };
  onLeave: () => void;
  error: string;
}) {
  const [guess, setGuess] = useState("");
  const self = snapshot.players.find((player) => player.id === session.playerId);
  const drawer = snapshot.players.find((player) => player.id === snapshot.drawerId);
  const isDrawer = snapshot.drawerId === session.playerId;
  const sortedPlayers = useMemo(() => [...snapshot.players].sort((a, b) => b.score - a.score), [snapshot.players]);

  function submitGuess(event: React.FormEvent) {
    event.preventDefault();
    if (!guess.trim()) {
      return;
    }
    socket.emit("guess:submit", { roomId: session.roomId, playerId: session.playerId, text: guess });
    setGuess("");
  }

  return (
    <main className="page">
      <div className="shell">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">
              <Brush size={22} />
            </div>
            <div>
              <h1>Room {snapshot.roomId}</h1>
              <p>{self?.nickname ?? "Player"} joined</p>
            </div>
          </div>
          <button className="btn warn" onClick={onLeave}>
            <DoorOpen size={18} /> Leave
          </button>
        </header>

        <section className="room-grid">
          <div className="main-stack">
            <div className="game-strip">
              <div className="banner">
                <span>{phaseText(snapshot, drawer?.nickname)}</span>
                <strong>{snapshot.turnIndex + 1}/{Math.max(snapshot.totalTurns, 1)}</strong>
              </div>
              <div className="timer">
                <Clock size={18} /> {snapshot.secondsRemaining}s
              </div>
              <div className="word-pill">{snapshot.currentWord ?? wordMask(snapshot.wordLength)}</div>
            </div>

            {snapshot.phase === "lobby" ? (
              <Lobby snapshot={snapshot} socket={socket} session={session} />
            ) : snapshot.phase === "ended" ? (
              <Results snapshot={snapshot} socket={socket} session={session} />
            ) : (
              <>
                <CanvasBoard snapshot={snapshot} socket={socket} session={session} isDrawer={isDrawer} />
                {snapshot.phase === "reveal" && (
                  <div className="panel">
                    <h2>Word revealed: {snapshot.lastTurnResult?.word}</h2>
                    <p className="muted">Next turn starts when the 15-second reveal timer ends.</p>
                  </div>
                )}
              </>
            )}

            <section className="chat-panel">
              <h2>Guesses</h2>
              <div className="guesses">
                {snapshot.guesses.length === 0 ? <p className="muted">Guesses will appear here.</p> : null}
                {snapshot.guesses.map((item) => (
                  <div className={`guess ${item.kind === "correct" ? "correct" : ""}`} key={item.id}>
                    <strong>{item.nickname}</strong>: {item.text}
                  </div>
                ))}
              </div>
              <form className="button-row" onSubmit={submitGuess}>
                <input className="input" disabled={snapshot.phase !== "drawing" || isDrawer} value={guess} onChange={(event) => setGuess(event.target.value)} placeholder={isDrawer ? "You are drawing" : "Type a guess"} />
                <button className="btn" disabled={snapshot.phase !== "drawing" || isDrawer || !guess.trim()}>
                  <Send size={18} /> Guess
                </button>
              </form>
              <p className="error">{error}</p>
            </section>
          </div>

          <aside className="sidebar">
            <h2>Players</h2>
            <div className="players">
              {sortedPlayers.map((player) => (
                <div className="player" key={player.id}>
                  <div className="avatar">
                    {player.nickname.slice(0, 1).toUpperCase()}
                    {player.hasGuessedCorrectly ? (
                      <span className="check">
                        <Check size={12} />
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <strong>{player.nickname}</strong>
                    <p className="muted">{player.id === snapshot.hostId ? "Host" : player.isConnected ? "Online" : "Away"}</p>
                  </div>
                  <span className="score">{player.score}</span>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Lobby({ snapshot, socket, session }: { snapshot: RoomSnapshot; socket: GameSocket; session: { roomId: string; playerId: string } }) {
  return (
    <section className="panel">
      <h2>Lobby</h2>
      <p className="muted">Share room ID {snapshot.roomId}. The host can start once at least two players are here.</p>
      <div className="button-row">
        <button className="btn" disabled={!snapshot.canStart} onClick={() => socket.emit("game:start", { roomId: session.roomId, playerId: session.playerId })}>
          <Play size={18} /> Start game
        </button>
      </div>
    </section>
  );
}

function Results({ snapshot, socket, session }: { snapshot: RoomSnapshot; socket: GameSocket; session: { roomId: string; playerId: string } }) {
  const results = [...snapshot.players].sort((a, b) => b.score - a.score);
  return (
    <section className="panel">
      <h2>Final scores</h2>
      <div className="results">
        {results.map((player, index) => (
          <div className="result-row" key={player.id}>
            <span>{index + 1}. {player.nickname}{snapshot.winnerIds.includes(player.id) ? " wins" : ""}</span>
            <strong>{player.score}</strong>
          </div>
        ))}
      </div>
      <div className="button-row">
        <button className="btn" disabled={!snapshot.canContinue} onClick={() => socket.emit("game:continue", { roomId: session.roomId, playerId: session.playerId })}>
          <RotateCcw size={18} /> Continue
        </button>
      </div>
    </section>
  );
}

function CanvasBoard({
  snapshot,
  socket,
  session,
  isDrawer
}: {
  snapshot: RoomSnapshot;
  socket: GameSocket;
  session: { roomId: string; playerId: string };
  isDrawer: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(6);
  const [mode, setMode] = useState<"draw" | "erase">("draw");
  const colorRef = useRef(color);
  const widthRef = useRef(width);
  const modeRef = useRef(mode);
  const pointsRef = useRef<DrawPoint[]>([]);
  const drawingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const finishStrokeRef = useRef<() => void>(() => undefined);
  const windowPointerEndRef = useRef<() => void>(() => finishStrokeRef.current());
  const pendingStrokesRef = useRef<DrawStroke[]>([]);
  const lastTurnRef = useRef(`${snapshot.roomId}:${snapshot.turnIndex}`);
  const strokeSignature = useMemo(() => snapshot.strokes.map((stroke) => stroke.id).join("|"), [snapshot.strokes]);
  const strokesRef = useRef(snapshot.strokes);
  strokesRef.current = snapshot.strokes;

  useEffect(() => {
    colorRef.current = color;
    widthRef.current = width;
    modeRef.current = mode;
  }, [color, mode, width]);

  useEffect(() => {
    finishStrokeRef.current = finishStroke;
  });

  useEffect(() => {
    const turnKey = `${snapshot.roomId}:${snapshot.turnIndex}`;
    if (lastTurnRef.current !== turnKey || snapshot.phase !== "drawing") {
      pendingStrokesRef.current = [];
      lastTurnRef.current = turnKey;
    } else {
      const confirmedIds = new Set(snapshot.strokes.map((stroke) => stroke.id));
      pendingStrokesRef.current = pendingStrokesRef.current.filter((stroke) => !confirmedIds.has(stroke.id));
    }
    redrawCommittedCanvas();
  }, [snapshot.phase, snapshot.roomId, snapshot.turnIndex, strokeSignature]);

  useEffect(() => {
    if (!isDrawer || snapshot.phase !== "drawing") {
      cancelDraftStroke();
    }
  }, [isDrawer, snapshot.phase]);

  function pointerPoint(event: React.PointerEvent<HTMLCanvasElement>): DrawPoint {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height
    };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawer || snapshot.phase !== "drawing" || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }
    event.preventDefault();
    drawingRef.current = true;
    activePointerIdRef.current = event.pointerId;
    pointsRef.current = [pointerPoint(event)];
    window.addEventListener("pointerup", windowPointerEndRef.current);
    window.addEventListener("pointercancel", windowPointerEndRef.current);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || activePointerIdRef.current !== event.pointerId) {
      return;
    }
    if (event.pointerType === "mouse" && event.buttons === 0) {
      finishStroke();
      return;
    }
    event.preventDefault();
    const point = pointerPoint(event);
    pointsRef.current.push(point);
    const currentMode = modeRef.current;
    const currentColor = colorRef.current;
    const currentWidth = widthRef.current;
    if (currentMode === "erase") {
      drawStroke(canvasRef.current, { id: "preview", playerId: session.playerId, color: currentColor, width: currentWidth, mode: currentMode, points: pointsRef.current.slice(-2) });
    } else {
      drawStroke(previewCanvasRef.current, { id: "preview", playerId: session.playerId, color: currentColor, width: currentWidth, mode: currentMode, points: pointsRef.current.slice(-2) });
    }
  }

  function end(event: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }
    event.preventDefault();
    finishStroke();
  }

  function finishStroke() {
    if (!drawingRef.current || pointsRef.current.length < 2) {
      cancelDraftStroke();
      return;
    }
    commitDraftStroke();
    cancelDraftStroke();
  }

  function commitDraftStroke() {
    const stroke: DrawStroke = {
      id: createClientId(),
      playerId: session.playerId,
      color: colorRef.current,
      width: widthRef.current,
      mode: modeRef.current,
      points: [...pointsRef.current]
    };
    pendingStrokesRef.current.push(stroke);
    drawStroke(canvasRef.current, stroke);
    socket.emit("draw:stroke", { roomId: session.roomId, stroke });
  }

  function cancelDraftStroke() {
    drawingRef.current = false;
    activePointerIdRef.current = null;
    pointsRef.current = [];
    window.removeEventListener("pointerup", windowPointerEndRef.current);
    window.removeEventListener("pointercancel", windowPointerEndRef.current);
    clearCanvasSurface(previewCanvasRef.current);
  }

  function clearCanvas() {
    pendingStrokesRef.current = [];
    cancelDraftStroke();
    clearCanvasSurface(canvasRef.current);
    clearCanvasSurface(previewCanvasRef.current);
    socket.emit("draw:clear", { roomId: session.roomId, playerId: session.playerId });
  }

  function redrawCommittedCanvas() {
    redraw(canvasRef.current, displayStrokes());
  }

  function displayStrokes() {
    if (pendingStrokesRef.current.length === 0) {
      return strokesRef.current;
    }
    const confirmedIds = new Set(strokesRef.current.map((stroke) => stroke.id));
    return [...strokesRef.current, ...pendingStrokesRef.current.filter((stroke) => !confirmedIds.has(stroke.id))];
  }

  function selectMode(nextMode: "draw" | "erase") {
    finishStroke();
    modeRef.current = nextMode;
    setMode(nextMode);
  }

  function selectColor(nextColor: string) {
    finishStroke();
    modeRef.current = "draw";
    colorRef.current = nextColor;
    setMode("draw");
    setColor(nextColor);
  }

  function selectWidth(nextWidth: number) {
    finishStroke();
    widthRef.current = nextWidth;
    setWidth(nextWidth);
  }

  return (
    <section className="canvas-wrap">
      <div className="toolbar">
        <button className={`icon-btn ${mode === "draw" ? "active" : ""}`} title="Brush" onClick={() => selectMode("draw")} disabled={!isDrawer}>
          <Brush size={18} />
        </button>
        <button className={`icon-btn ${mode === "erase" ? "active" : ""}`} title="Eraser" onClick={() => selectMode("erase")} disabled={!isDrawer}>
          <Eraser size={18} />
        </button>
        {COLORS.map((item) => (
          <button key={item} className={`swatch ${item === color ? "active" : ""}`} title={item} style={{ "--swatch": item } as React.CSSProperties} onClick={() => selectColor(item)} disabled={!isDrawer} />
        ))}
        <input className="range" title="Brush size" type="range" min="2" max="18" value={width} onChange={(event) => selectWidth(Number(event.target.value))} disabled={!isDrawer} />
        <button className="icon-btn" title="Clear" disabled={!isDrawer} onClick={clearCanvas}>
          <Trash2 size={18} />
        </button>
      </div>
      <div className="canvas-stage">
        <canvas className="committed-canvas" ref={canvasRef} width={1200} height={900} />
        <canvas className="preview-canvas" ref={previewCanvasRef} width={1200} height={900} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
      </div>
    </section>
  );
}

function clearCanvasSurface(canvas: HTMLCanvasElement | null) {
  if (!canvas) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
}

function redraw(canvas: HTMLCanvasElement | null, strokes: DrawStroke[]) {
  if (!canvas) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  strokes.forEach((stroke) => drawStroke(canvas, stroke));
}

function drawStroke(canvas: HTMLCanvasElement | null, stroke: DrawStroke) {
  if (!canvas || stroke.points.length < 2) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = stroke.width;
  context.globalCompositeOperation = stroke.mode === "erase" ? "destination-out" : "source-over";
  context.strokeStyle = stroke.mode === "erase" ? "#ffffff" : stroke.color;
  context.beginPath();
  const [first, ...rest] = stroke.points;
  context.moveTo(first.x * canvas.width, first.y * canvas.height);
  rest.forEach((point) => context.lineTo(point.x * canvas.width, point.y * canvas.height));
  context.stroke();
  context.restore();
}

function createClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function wordMask(length: number | null): string {
  return length ? Array.from({ length }, () => "_").join(" ") : "Waiting";
}

function phaseText(snapshot: RoomSnapshot, drawerName?: string): string {
  if (snapshot.phase === "drawing") {
    return `${drawerName ?? "A player"} is drawing`;
  }
  if (snapshot.phase === "reveal") {
    return "Reveal and next-turn setup";
  }
  if (snapshot.phase === "ended") {
    return "Game complete";
  }
  return "Waiting for players";
}
