import { Effect, Exit, Result } from 'effect';
import {
  openTripBook,
  StorageFailed,
  type Deletion,
  type DropNotFound,
  type DropEdit,
  type InvalidDepth,
  type KindLocked,
  type Kind,
  type PositionSource,
  type Trip,
  type TripBook
} from '#lib/features/trip/index.js';

export type Offer =
  | { action: 'none' }
  | { action: 'undo-drop'; dropId: string; name: string }
  | { action: 'restore'; deletion: Deletion; name: string };

export type Undo = Exclude<Offer, { action: 'none' }>;

export type Notice = { key: number; text: string; offer: Offer };

export type SaveProblem = 'depth' | 'kind' | 'storage';

type SaveFailure = DropNotFound | InvalidDepth | KindLocked | StorageFailed;

const PROBLEMS: Record<SaveFailure['_tag'], SaveProblem> = {
  InvalidDepth: 'depth',
  KindLocked: 'kind',
  DropNotFound: 'storage',
  StorageFailed: 'storage'
};

const outcome = <A, E>(
  effect: Effect.Effect<A, E>
): Promise<Result.Result<A, E | StorageFailed>> =>
  Effect.runPromise(Effect.result(effect)).catch((cause: unknown) =>
    Result.fail(new StorageFailed({ cause }))
  );

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
  trip = $state.raw<Trip | null>(null);
  ready = $state(false);
  notice = $state.raw<Notice | null>(null);
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
      action: 'undo-drop',
      dropId: placed.drop.id,
      name: placed.name
    });
    if (!this.#persistAsked) {
      this.#persistAsked = true;
      askToPersist();
    }
  }

  async undo(undo: Undo) {
    const book = await this.#book;
    if (!book) return;
    if (undo.action === 'undo-drop') {
      const exit = await Effect.runPromiseExit(book.undoDrop(undo.dropId));
      if (Exit.isFailure(exit)) {
        this.#say("Couldn't undo. Try again.", undo);
        return;
      }
      this.trip = exit.value;
      this.#say(`${undo.name} removed`);
      return;
    }
    const restored = await outcome(book.restoreDrop(undo.deletion));
    if (Result.isFailure(restored)) {
      const retry = restored.failure._tag === 'StorageFailed';
      this.#say(
        retry
          ? "Couldn't undo. Try again."
          : `Couldn't restore ${undo.name}. Another trip has started.`,
        retry ? undo : undefined
      );
      return;
    }
    const { trip } = restored.success;
    if (trip.endedAt === null) this.trip = trip;
    this.#say(`${undo.name} restored`);
  }

  async save(
    dropId: string,
    edit: DropEdit,
    kind: Kind | null
  ): Promise<SaveProblem | null> {
    const book = await this.#book;
    if (!book) return 'storage';
    const updated = await outcome(book.updateDrop(dropId, edit));
    if (Result.isFailure(updated)) return PROBLEMS[updated.failure._tag];
    this.#show(updated.success);
    if (!kind) return null;
    const changed = await outcome(book.changeKind(dropId, kind));
    if (Result.isFailure(changed)) return PROBLEMS[changed.failure._tag];
    this.#show(changed.success.trip);
    return null;
  }

  async remove(dropId: string) {
    const book = await this.#book;
    if (!book) return false;
    const deleted = await outcome(book.deleteDrop(dropId));
    if (Result.isFailure(deleted)) {
      const alreadyGone = deleted.failure._tag === 'DropNotFound';
      if (alreadyGone) return true;
      this.#say("Couldn't delete the drop. Try again.");
      return false;
    }
    const { trip, name, deletion } = deleted.success;
    if (this.trip?.id === deletion.trip.id) this.trip = trip;
    this.#say(`${name} deleted`, { action: 'restore', deletion, name });
    return true;
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

  #show(trip: Trip) {
    if (this.trip?.id === trip.id) this.trip = trip;
  }

  #say(text: string, offer: Offer = { action: 'none' }) {
    this.#noticeKey += 1;
    this.notice = { key: this.#noticeKey, text, offer };
  }
}
