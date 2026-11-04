import { Effect, Exit, Result } from 'effect';
import {
  openTripBook,
  type CannotDropAgain,
  type Clock,
  type Deletion,
  type DropAttempt,
  type DropCancelled,
  type DropEdit,
  type DropNotFound,
  type DroppedAgain,
  type DropNotSaved,
  type DropPhase,
  type DropTarget,
  type InvalidCatch,
  type InvalidDepth,
  type Kind,
  type KindLocked,
  type NotCollected,
  type PlacedDrop,
  type PositionSource,
  type StorageFailed,
  type Trip,
  type TripBook
} from '#lib/features/trip/index.js';

type DropFailure = DropCancelled | DropNotSaved | CannotDropAgain;

export type Retry = Effect.Effect<
  PlacedDrop,
  Exclude<DropFailure, DropCancelled>
>;

export type Offer =
  | { action: 'none' }
  | { action: 'undo-drop'; dropId: string; name: string }
  | { action: 'restore'; deletion: Deletion; name: string }
  | { action: 'undo-collect'; dropId: string; name: string }
  | { action: 'retry'; retry: Retry };

export type Undo = Extract<
  Offer,
  { action: 'undo-drop' | 'restore' | 'undo-collect' }
>;

type UndoCollect = Extract<Offer, { action: 'undo-collect' }>;

export type Notice = { key: number; text: string; offer: Offer };

export type PendingDrop = {
  kind: Kind;
  attempt: DropAttempt;
  phase: DropPhase;
};

export type SaveProblem = 'depth' | 'catch' | 'kind' | 'gone' | 'storage';

type SaveFailure =
  | DropNotFound
  | InvalidDepth
  | InvalidCatch
  | NotCollected
  | KindLocked
  | StorageFailed;

const PROBLEMS: Record<SaveFailure['_tag'], SaveProblem> = {
  InvalidDepth: 'depth',
  InvalidCatch: 'catch',
  NotCollected: 'catch',
  KindLocked: 'kind',
  DropNotFound: 'gone',
  StorageFailed: 'storage'
};

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

const undoCollectFailure = (
  tag: (DropNotFound | DroppedAgain | StorageFailed)['_tag'],
  undo: UndoCollect
): [string, Offer?] => {
  if (tag === 'DroppedAgain') {
    return [`Couldn't undo. ${undo.name} has been dropped again since.`];
  }
  if (tag === 'DropNotFound') return [`Couldn't undo. ${undo.name} is gone.`];
  return ["Couldn't undo. Try again.", undo];
};

const resultOf = <A, E>(
  effect: Effect.Effect<A, E>
): Promise<Result.Result<A, E>> => Effect.runPromise(Effect.result(effect));

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
  trip = $state.raw<Trip | null>(null);
  past = $state.raw<readonly Trip[]>([]);
  ready = $state(false);
  notice = $state.raw<Notice | null>(null);
  pending = $state.raw<PendingDrop | null>(null);
  readonly #book: Promise<TripBook | null>;
  #persistAsked = false;
  #noticeKey = 0;

  constructor(positions: PositionSource) {
    this.#book = openBook(positions);
    void this.#load();
  }

  drop(kind: Kind) {
    return this.#place({ kind }, kind);
  }

  dropAgain(dropId: string) {
    const drop = this.trip?.drops.find((item) => item.id === dropId);
    const gear =
      drop && this.trip?.gear.find((item) => item.id === drop.gearId);
    if (!gear) return Promise.resolve(false);
    return this.#place({ again: dropId }, gear.kind);
  }

  async #place(target: DropTarget, kind: Kind) {
    if (this.pending) return false;
    const book = await this.#book;
    if (!book) {
      this.#say("Couldn't save the drop. Storage isn't available.");
      return false;
    }
    const attempt = await Effect.runPromise(book.placeDrop(target));
    const waited = attempt.phase() === 'acquiring';
    const unfollow = waited ? this.#follow(kind, attempt) : () => undefined;
    const outcome = await Effect.runPromise(Effect.result(attempt.result));
    unfollow();
    this.pending = null;
    this.#settle(outcome);
    return waited;
  }

  #follow(kind: Kind, attempt: DropAttempt) {
    const show = () => {
      this.pending = { kind, attempt, phase: attempt.phase() };
    };
    show();
    return attempt.subscribe(show);
  }

  async retry(retry: Retry) {
    this.notice = null;
    this.#settle(await Effect.runPromise(Effect.result(retry)));
  }

  #settle(outcome: Result.Result<PlacedDrop, DropFailure>) {
    if (Result.isFailure(outcome)) {
      const failure = outcome.failure;
      if (failure._tag === 'DropCancelled') {
        this.#say('Drop cancelled. Nothing was saved.');
        return;
      }
      if (failure._tag === 'CannotDropAgain') {
        this.#say(
          "Couldn't drop that gear again. It's no longer the latest collected drop, so nothing was saved."
        );
        return;
      }
      this.#say("Couldn't save the drop, so nothing was saved.", {
        action: 'retry',
        retry: failure.retry
      });
      return;
    }
    const placed = outcome.success;
    this.trip = placed.trip;
    this.#say(droppedText(placed), {
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
    if (undo.action === 'undo-collect') {
      await this.undoCollect(undo.dropId, undo.name);
      return;
    }
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
    const restored = await resultOf(book.restoreDrop(undo.deletion));
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
    else await this.#loadPast(book);
    this.#say(`${undo.name} restored`);
  }

  async save(
    dropId: string,
    edit: DropEdit,
    kind: Kind | null
  ): Promise<SaveProblem | null> {
    const book = await this.#book;
    if (!book) return 'storage';
    const saved = await resultOf(book.saveDrop(dropId, edit, kind));
    if (Result.isFailure(saved)) return PROBLEMS[saved.failure._tag];
    this.#show(saved.success.trip);
    if (saved.success.trip.endedAt !== null) await this.#loadPast(book);
    return null;
  }

  async collect(dropId: string) {
    const book = await this.#book;
    if (!book) return;
    const collected = await resultOf(book.collect(dropId));
    if (Result.isFailure(collected)) {
      this.#say(
        collected.failure._tag === 'DropNotFound'
          ? "Couldn't collect. That drop is gone."
          : "Couldn't collect. Try again."
      );
      return;
    }
    const { name, changed } = collected.success;
    this.#show(collected.success.trip);
    if (changed)
      this.#say(`${name} collected`, { action: 'undo-collect', dropId, name });
  }

  async undoCollect(dropId: string, name: string) {
    const book = await this.#book;
    if (!book) return;
    const undone = await resultOf(book.undoCollect(dropId));
    if (Result.isFailure(undone)) {
      this.#say(
        ...undoCollectFailure(undone.failure._tag, {
          action: 'undo-collect',
          dropId,
          name
        })
      );
      return;
    }
    this.#show(undone.success.trip);
    if (undone.success.changed) {
      this.#say(`${name} back in the water`);
      return;
    }
    const { notice } = this;
    if (
      notice?.offer.action === 'undo-collect' &&
      notice.offer.dropId === dropId
    ) {
      this.notice = null;
    }
  }

  async remove(dropId: string) {
    const book = await this.#book;
    if (!book) return false;
    const deleted = await resultOf(book.deleteDrop(dropId));
    if (Result.isFailure(deleted)) {
      const alreadyGone = deleted.failure._tag === 'DropNotFound';
      if (alreadyGone) return true;
      this.#say("Couldn't delete the drop. Try again.");
      return false;
    }
    const { trip, name, deletion } = deleted.success;
    if (this.trip?.id === deletion.trip.id) this.trip = trip;
    if (deletion.trip.endedAt !== null) await this.#loadPast(book);
    this.#say(`${name} deleted`, { action: 'restore', deletion, name });
    return true;
  }

  async endTrip(tripId: string) {
    if (this.pending) return false;
    const book = await this.#book;
    if (!book) return false;
    const ended = await resultOf(book.endTrip(tripId));
    if (Result.isFailure(ended) && ended.failure._tag === 'StorageFailed') {
      this.#say("Couldn't end the trip. Try again.");
      return false;
    }
    if (this.trip?.id === tripId) this.trip = null;
    await this.#loadPast(book);
    this.#say('Trip ended. It is under Past trips.');
    return true;
  }

  async deleteTrip(tripId: string) {
    const book = await this.#book;
    if (!book) return false;
    const deleted = await resultOf(book.deleteTrip(tripId));
    if (Result.isFailure(deleted)) {
      this.#say("Couldn't delete the trip. Try again.");
      return false;
    }
    await this.#loadPast(book);
    this.#say('Trip deleted');
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
      await this.#loadPast(book);
    }
    this.ready = true;
  }

  async #loadPast(book: TripBook) {
    const exit = await Effect.runPromiseExit(book.pastTrips());
    if (Exit.isSuccess(exit)) this.past = exit.value;
  }

  #show(trip: Trip) {
    if (this.trip?.id === trip.id) this.trip = trip;
  }

  #say(text: string, offer: Offer = { action: 'none' }) {
    this.#noticeKey += 1;
    this.notice = { key: this.#noticeKey, text, offer };
  }
}
