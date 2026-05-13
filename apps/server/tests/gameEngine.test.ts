import { describe, expect, it, vi } from "vitest";
import {
  continueGame,
  createRoomState,
  finishDrawingPhase,
  finishRevealPhase,
  joinRoomState,
  snapshotFor,
  startGame,
  submitGuess
} from "../src/gameEngine.js";

describe("game engine", () => {
  it("scores correct guessers by order and awards the drawer a point per correct guess", () => {
    const state = createStartedRoom();
    const drawerId = state.drawerId!;
    const [firstGuesser, secondGuesser] = state.players.filter((player) => player.id !== drawerId);

    submitGuess(state, firstGuesser.id, state.currentWord!);
    submitGuess(state, secondGuesser.id, state.currentWord!);

    expect(firstGuesser.score).toBe(2);
    expect(secondGuesser.score).toBe(1);
    expect(state.players.find((player) => player.id === drawerId)?.score).toBe(2);
  });

  it("keeps wrong guesses public and correct guesses private", () => {
    const state = createStartedRoom();
    const drawerId = state.drawerId!;
    const guesser = state.players.find((player) => player.id !== drawerId)!;

    const wrong = submitGuess(state, guesser.id, "definitely wrong");
    expect(wrong.guess?.text).toBe("definitely wrong");
    expect(state.guesses).toHaveLength(1);

    const correct = submitGuess(state, guesser.id, state.currentWord!);
    expect(correct.guess).toBeUndefined();
    expect(state.guesses).toHaveLength(1);
    expect(guesser.hasGuessedCorrectly).toBe(true);
  });

  it("hides the word from guessers until reveal", () => {
    const state = createStartedRoom();
    const drawerId = state.drawerId!;
    const guesser = state.players.find((player) => player.id !== drawerId)!;

    expect(snapshotFor(state, drawerId).currentWord).toBe(state.currentWord);
    expect(snapshotFor(state, guesser.id).currentWord).toBeNull();

    finishDrawingPhase(state);
    expect(snapshotFor(state, guesser.id).currentWord).toBe(state.currentWord);
  });

  it("moves from drawing to reveal, then to the next turn, then game end", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-12T12:00:00Z"));
    const state = createStartedRoom();
    const firstDrawer = state.drawerId;

    finishDrawingPhase(state);
    expect(state.phase).toBe("reveal");
    expect(state.lastTurnResult?.word).toBeTruthy();

    finishRevealPhase(state);
    expect(state.phase).toBe("drawing");
    expect(state.drawerId).not.toBe(firstDrawer);

    while (state.phase !== "ended") {
      finishDrawingPhase(state);
      finishRevealPhase(state);
    }
    expect(state.phase).toBe("ended");
    expect(state.winnerIds.length).toBeGreaterThan(0);
    expect(snapshotFor(state, state.hostId).turnIndex + 1).toBe(snapshotFor(state, state.hostId).totalTurns);
    vi.useRealTimers();
  });

  it("allows the host to continue after a completed game", () => {
    const state = createStartedRoom();
    while (state.phase !== "ended") {
      finishDrawingPhase(state);
      finishRevealPhase(state);
    }

    continueGame(state, state.hostId);
    expect(state.phase).toBe("drawing");
    expect(state.turnIndex).toBe(0);
  });
});

function createStartedRoom() {
  const state = createRoomState("ABC123", "p1", "Host");
  joinRoomState(state, "p2", "Ada");
  joinRoomState(state, "p3", "Grace");
  startGame(state, "p1");
  state.currentWord = "apple";
  return state;
}
