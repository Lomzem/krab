import { Effect, Exit } from 'effect';
import {
  openTripBook,
  type Kind,
  type PositionSource,
  type Trip,
  type TripBook
} from '#lib/features/trip/index.js';

export type Notice = {
  key: number;
  text: string;
  undo: { dropId: string; name: string } | null;
};

const openBook = (positions: PositionSource) =>
  Effect.runPromiseExit(
    openTripBook({
      clock: { now: () => Date.now() },
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
  readonly #book: Promise<TripBook | null>;
  #persistAsked = false;
  #noticeKey = 0;

  constructor(positions: PositionSource) {
    this.#book = openBook(positions);
    void this.#load();
  }

  async drop(kind: Kind) {
    const book = await this.#book;
    if (!book) {
      this.#say("Couldn't save the drop. Storage isn't available.");
      return;
    }
    const exit = await Effect.runPromiseExit(book.placeDrop(kind));
    if (Exit.isFailure(exit)) {
      this.#say("Couldn't save the drop. Try again.");
      return;
    }
    const placed = exit.value;
    this.trip = placed.trip;
    this.#say(`${placed.name} dropped`, {
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

  #say(text: string, undo: Notice['undo'] = null) {
    this.#noticeKey += 1;
    this.notice = { key: this.#noticeKey, text, undo };
  }
}
