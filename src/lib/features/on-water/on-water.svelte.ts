import { Effect, Exit, Result } from 'effect';
import {
  openTripBook,
  type Clock,
  type DropAttempt,
  type DropCancelled,
  type DropNotSaved,
  type Kind,
  type PlacedDrop,
  type PositionSource,
  type Trip,
  type TripBook
} from '#lib/features/trip/index.js';

export type Retry = Effect.Effect<PlacedDrop, DropNotSaved>;

export type Notice = {
  key: number;
  text: string;
  undo: { dropId: string; name: string } | null;
  retry: Retry | null;
};

export type Acquiring = { kind: Kind; attempt: DropAttempt };

const clock: Clock = {
  now: () => Date.now(),
  sleepUntil: (at) =>
    Effect.suspend(() => Effect.sleep(Math.max(0, at - Date.now())))
};

const droppedText = (placed: PlacedDrop) => {
  if (placed.rough) {
    return `${placed.name} dropped. Rough position, within about ${placed.rough.short}.`;
  }
  if (!placed.drop.position)
    return `${placed.name} dropped without a position.`;
  return `${placed.name} dropped`;
};

const openBook = (positions: PositionSource) =>
  Effect.runPromiseExit(
    openTripBook({
      clock,
      positions,
      idb: indexedDB
    })
  ).then((exit) =>
    Exit.match(exit, { onSuccess: (book) => book, onFailure: () => null })
  );

const askToPersist = () => {
  if (!('storage' in navigator)) return;
  void navigator.storage
    .persisted()
    .then((persisted) => persisted || navigator.storage.persist())
    .catch(() => false);
};

export class OnWater {
  trip = $state<Trip | null>(null);
  ready = $state(false);
  notice = $state<Notice | null>(null);
  acquiring = $state<Acquiring | null>(null);
  readonly #book: Promise<TripBook | null>;
  #persistAsked = false;
  #noticeKey = 0;

  constructor(positions: PositionSource) {
    this.#book = openBook(positions);
    void this.#load();
  }

  async drop(kind: Kind) {
    if (this.acquiring) return false;
    const book = await this.#book;
    if (!book) {
      this.#say("Couldn't save the drop. Storage isn't available.");
      return false;
    }
    const attempt = await Effect.runPromise(book.placeDrop(kind));
    const waited = attempt.gettingPosition();
    if (waited) this.acquiring = { kind, attempt };
    const outcome = await Effect.runPromise(Effect.result(attempt.result));
    this.acquiring = null;
    this.#settle(outcome);
    return waited;
  }

  async retry(retry: Retry) {
    this.notice = null;
    this.#settle(await Effect.runPromise(Effect.result(retry)));
  }

  #settle(outcome: Result.Result<PlacedDrop, DropCancelled | DropNotSaved>) {
    if (Result.isFailure(outcome)) {
      const failure = outcome.failure;
      if (failure._tag === 'DropCancelled') {
        this.#say('Drop cancelled. Nothing was saved.');
        return;
      }
      this.#say(
        "Couldn't save the drop, so nothing was saved.",
        null,
        failure.retry
      );
      return;
    }
    const placed = outcome.success;
    this.trip = placed.trip;
    this.#say(droppedText(placed), {
      dropId: placed.drop.id,
      name: placed.name
    });
    if (!this.#persistAsked) {
      this.#persistAsked = true;
      askToPersist();
    }
  }

  async undo(undo: { dropId: string; name: string }) {
    const book = await this.#book;
    if (!book) return;
    const exit = await Effect.runPromiseExit(book.undoDrop(undo.dropId));
    if (Exit.isFailure(exit)) {
      this.#say("Couldn't undo. Try again.", undo);
      return;
    }
    this.trip = exit.value;
    this.#say(`${undo.name} removed`);
  }

  dismiss(key: number) {
    if (this.notice?.key === key) this.notice = null;
  }

  async #load() {
    const book = await this.#book;
    if (book) {
      const exit = await Effect.runPromiseExit(book.activeTrip());
      if (Exit.isSuccess(exit)) this.trip = exit.value;
    }
    this.ready = true;
  }

  #say(text: string, undo: Notice['undo'] = null, retry: Retry | null = null) {
    this.#noticeKey += 1;
    this.notice = { key: this.#noticeKey, text, undo, retry };
  }
}
