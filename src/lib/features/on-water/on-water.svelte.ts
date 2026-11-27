import { Effect, Exit, Result } from 'effect';
import {
  findDrop,
  tripBook,
  type AnotherTripActive,
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
  type Trips,
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
  waited: boolean;
};

type Unsaved = { key: number; retry: Retry };

const unsavedText = (count: number) =>
  count === 1
    ? "Couldn't save the drop"
    : `Couldn't save ${String(count)} drops`;

export type Load = 'opening' | 'ready' | 'failed';

export type SaveProblem =
  | 'depth'
  | 'catch'
  | 'uncollected'
  | 'kind'
  | 'gone'
  | 'storage';

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
  NotCollected: 'uncollected',
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
    return `${placed.name} dropped, rough position`;
  }
  if (!placed.drop.position) return `${placed.name} dropped, no position`;
  return `${placed.name} dropped`;
};

const droppedAgainText = (name: string) =>
  `Couldn't undo, ${name} dropped again`;

const undoCollectFailure = (
  tag: (DropNotFound | DroppedAgain | StorageFailed)['_tag'],
  undo: UndoCollect
): [string, Offer?] => {
  if (tag === 'DroppedAgain') return [droppedAgainText(undo.name)];
  if (tag === 'DropNotFound') return [`Couldn't undo, ${undo.name} is gone`];
  return ["Couldn't undo", undo];
};

const restoreFailure = (
  tag: (AnotherTripActive | DroppedAgain | StorageFailed)['_tag'],
  undo: Extract<Offer, { action: 'restore' }>
): [string, Offer?] => {
  if (tag === 'DroppedAgain') return [droppedAgainText(undo.name)];
  if (tag === 'AnotherTripActive') {
    return ["Couldn't restore, another trip active"];
  }
  return ["Couldn't undo", undo];
};

const resultOf = <A, E>(
  effect: Effect.Effect<A, E>
): Promise<Result.Result<A, E>> => Effect.runPromise(Effect.result(effect));

const askToPersist = () => {
  if (!('storage' in navigator)) return;
  void navigator.storage
    .persisted()
    .then((persisted) => persisted || navigator.storage.persist())
    .catch(() => false);
};

export class OnWater {
  #trips = $state.raw<Trips>({ active: null, past: [] });
  load = $state<Load>('opening');
  #notice = $state.raw<Notice | null>(null);
  #unsaved = $state.raw<readonly Unsaved[]>([]);
  #retrying = $state(false);
  #ending = $state(false);
  readonly notice = $derived.by((): Notice | null => {
    if (this.#notice) return this.#notice;
    const oldest = this.#unsaved.at(0);
    if (!oldest || this.#retrying || this.#ending) return null;
    return {
      key: oldest.key,
      text: unsavedText(this.#unsaved.length),
      offer: { action: 'retry', retry: oldest.retry }
    };
  });
  pending = $state.raw<PendingDrop | null>(null);
  #saving = $state.raw<readonly string[]>([]);
  readonly #book: TripBook;
  #observers: readonly (() => void)[] = [];
  #shown = 0;
  #persistAsked = false;
  #noticeKey = 0;

  constructor(positions: PositionSource) {
    this.#book = tripBook({
      clock,
      positions,
      idb: indexedDB,
      stored: (trips) => {
        this.#trips = trips;
        this.load = 'ready';
        this.#shown += 1;
        for (const observer of this.#observers) observer();
      }
    });
    void this.reload();
  }

  get trip() {
    return this.#trips.active;
  }

  get past() {
    return this.#trips.past;
  }

  observeStored(observer: () => void) {
    this.#observers = [...this.#observers, observer];
  }

  drop(kind: Kind) {
    return this.#place({ kind }, kind);
  }

  dropAgain(dropId: string) {
    const found = this.trip && findDrop([this.trip], dropId);
    if (!found) return Promise.resolve(false);
    return this.#place({ again: dropId }, found.gear.kind);
  }

  async #place(target: DropTarget, kind: Kind) {
    if (this.pending) return false;
    const attempt = this.#book.placeDrop(target);
    const waited = attempt.phase() === 'acquiring';
    this.pending = { kind, attempt, phase: attempt.phase(), waited };
    const unfollow = attempt.subscribe(() => {
      this.pending = { kind, attempt, phase: attempt.phase(), waited };
    });
    const outcome = await resultOf(attempt.result).finally(() => {
      unfollow();
      this.pending = null;
    });
    this.#settle(outcome);
    return true;
  }

  async retry(key: number) {
    const entry = this.#unsaved.find((unsaved) => unsaved.key === key);
    if (!entry || this.#retrying || this.#ending) return;
    this.#retrying = true;
    const outcome = await Effect.runPromise(Effect.result(entry.retry)).finally(
      () => {
        this.#retrying = false;
      }
    );
    if (Result.isFailure(outcome) && outcome.failure._tag === 'DropNotSaved') {
      this.#noticeKey += 1;
      const again = { key: this.#noticeKey, retry: outcome.failure.retry };
      this.#unsaved = this.#unsaved.map((unsaved) =>
        unsaved === entry ? again : unsaved
      );
      return;
    }
    this.#unsaved = this.#unsaved.filter((unsaved) => unsaved !== entry);
    this.#settle(outcome);
  }

  #settle(outcome: Result.Result<PlacedDrop, DropFailure>) {
    if (Result.isFailure(outcome)) {
      const failure = outcome.failure;
      if (failure._tag === 'DropCancelled') {
        this.#say('Drop cancelled');
        return;
      }
      if (failure._tag === 'CannotDropAgain') {
        this.#say("Couldn't drop that gear again");
        return;
      }
      this.#noticeKey += 1;
      const entry = { key: this.#noticeKey, retry: failure.retry };
      this.#notice = null;
      this.#unsaved = [...this.#unsaved, entry];
      return;
    }
    const placed = outcome.success;
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

  undoCollectBlocked(dropId: string) {
    return this.#saving.includes(dropId);
  }

  get undoBlocked() {
    const offer = this.notice?.offer;
    return (
      offer?.action === 'undo-collect' && this.undoCollectBlocked(offer.dropId)
    );
  }

  async undo(undo: Undo) {
    if (undo.action === 'undo-collect')
      return this.undoCollect(undo.dropId, undo.name);
    if (undo.action === 'undo-drop') {
      const exit = await Effect.runPromiseExit(
        this.#book.undoDrop(undo.dropId)
      );
      if (Exit.isFailure(exit)) {
        this.#say("Couldn't undo", undo);
        return true;
      }
      this.#say(`${undo.name} removed`);
      return true;
    }
    const restored = await resultOf(this.#book.restoreDrop(undo.deletion));
    if (Result.isFailure(restored)) {
      this.#say(...restoreFailure(restored.failure._tag, undo));
      return true;
    }
    this.#say(`${undo.name} restored`);
    return true;
  }

  async save(
    dropId: string,
    edit: DropEdit,
    kind: Kind | null
  ): Promise<SaveProblem | null> {
    this.#saving = [...this.#saving, dropId];
    const saved = await resultOf(
      this.#book.saveDrop(dropId, edit, kind)
    ).finally(() => {
      const at = this.#saving.indexOf(dropId);
      this.#saving = this.#saving.filter((_, index) => index !== at);
    });
    if (Result.isFailure(saved)) return PROBLEMS[saved.failure._tag];
    if (saved.success.catchRecorded) this.#retireCollectUndo(dropId);
    return null;
  }

  async collect(dropId: string) {
    const collected = await resultOf(this.#book.collect(dropId));
    if (Result.isFailure(collected)) {
      this.#say(
        collected.failure._tag === 'DropNotFound'
          ? 'That drop is gone'
          : "Couldn't collect"
      );
      return;
    }
    const { name, changed } = collected.success;
    if (changed)
      this.#say(`${name} collected`, { action: 'undo-collect', dropId, name });
  }

  async undoCollect(dropId: string, name: string) {
    if (this.undoCollectBlocked(dropId)) return false;
    const undone = await resultOf(this.#book.undoCollect(dropId));
    if (Result.isFailure(undone)) {
      this.#say(
        ...undoCollectFailure(undone.failure._tag, {
          action: 'undo-collect',
          dropId,
          name
        })
      );
      return true;
    }
    if (undone.success.changed) {
      this.#say(
        undone.success.catchCleared
          ? `${undone.success.name} back in, catch cleared`
          : `${undone.success.name} back in the water`
      );
      return true;
    }
    this.#retireCollectUndo(dropId);
    return true;
  }

  #retireCollectUndo(dropId: string) {
    const offer = this.#notice?.offer;
    if (offer?.action === 'undo-collect' && offer.dropId === dropId) {
      this.#notice = null;
    }
  }

  async remove(dropId: string) {
    const deleted = await resultOf(this.#book.deleteDrop(dropId));
    if (Result.isFailure(deleted)) {
      const alreadyGone = deleted.failure._tag === 'DropNotFound';
      if (alreadyGone) {
        void this.reload();
        return true;
      }
      this.#say("Couldn't delete the drop");
      return false;
    }
    const { name, deletion } = deleted.success;
    this.#say(`${name} deleted`, { action: 'restore', deletion, name });
    return true;
  }

  async endTrip(tripId: string) {
    if (this.pending || this.#ending || this.#retrying) return false;
    this.#ending = true;
    const ended = await resultOf(this.#book.endTrip(tripId)).finally(() => {
      this.#ending = false;
    });
    if (Result.isFailure(ended) && ended.failure._tag === 'StorageFailed') {
      this.#say("Couldn't end the trip");
      return false;
    }
    if (Result.isFailure(ended)) void this.reload();
    this.#unsaved = [];
    this.#say('Trip ended');
    return true;
  }

  async deleteTrip(tripId: string) {
    const deleted = await resultOf(this.#book.deleteTrip(tripId));
    if (Result.isFailure(deleted)) {
      this.#say("Couldn't delete the trip");
      return false;
    }
    this.#say('Trip deleted');
    return true;
  }

  saveLost(name: string) {
    this.#say(`Couldn't save ${name}`);
  }

  dismiss(key: number) {
    if (this.#notice?.key === key) this.#notice = null;
    this.#unsaved = this.#unsaved.filter((unsaved) => unsaved.key !== key);
  }

  async reload() {
    const shown = this.#shown;
    const loaded = await resultOf(this.#book.trips());
    if (Result.isFailure(loaded) && shown === this.#shown) this.load = 'failed';
  }

  #say(text: string, offer: Offer = { action: 'none' }) {
    this.#noticeKey += 1;
    this.#notice = { key: this.#noticeKey, text, offer };
  }
}
