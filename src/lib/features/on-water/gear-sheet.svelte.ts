import {
  dayOf,
  findDrop,
  gearName,
  type Day,
  type Drop,
  type DropEdit,
  type Gear,
  type Kind,
  type Trip
} from '#lib/features/trip/index.js';
import { baitChoices, type BaitChoice, type BaitSearch } from './bait-options';
import {
  catchDraftOf,
  checkDraft,
  draftChanged,
  draftOf,
  type CatchDraft,
  type DetailsDraft,
  type GearDraft,
  type InvalidField
} from './details-draft';
import type { SaveProblem } from './on-water.svelte';

export type SheetSubject = {
  trip: Trip;
  drop: Drop;
  gear: Gear;
  name: string;
  day: Day | null;
  baits: BaitChoice[];
};

export type SheetOrigin = {
  dropId: string;
  from: 'list' | 'map';
  returnFocus: () => HTMLElement | null;
};

export type SheetCommands = {
  trips: () => readonly Trip[];
  save: (
    dropId: string,
    edit: DropEdit,
    kind: Kind | null
  ) => Promise<SaveProblem | null>;
  collect: (dropId: string) => Promise<unknown>;
  remove: (dropId: string) => Promise<boolean>;
  undoCollect: (dropId: string, name: string) => Promise<unknown>;
  undoCollectBlocked: (dropId: string) => boolean;
  observeStored: (observer: () => void) => void;
  dropAgain: (dropId: string) => void;
  saveLost: (name: string) => void;
  showOnMap: (subject: SheetSubject) => void;
};

export type Loss = 'draft' | 'catch';

export type Leaving = 'left' | 'asked' | 'waiting' | 'kept';

export type Refusal = { invalid: readonly InvalidField[] };

type Operation = {
  origin: SheetOrigin;
  kind: 'save' | 'other';
  pending: boolean;
  problem: SaveProblem | null;
};

export const openerFocus = (dropId: string, opener: HTMLElement) => () =>
  opener.isConnected
    ? opener
    : opener.ownerDocument.querySelector<HTMLElement>(
        `[data-drop="${CSS.escape(dropId)}"]`
      );

const sheetSubject = (
  trips: readonly Trip[],
  dropId: string | null
): SheetSubject | null => {
  const found = dropId === null ? null : findDrop(trips, dropId);
  return (
    found && {
      ...found,
      name: gearName(found.gear),
      day: dayOf(found.trip, found.drop),
      baits: baitChoices(trips, found.trip.id)
    }
  );
};

const DETAILS = ['label', 'bait', 'depth', 'notes'] as const;

export class SheetDraft {
  readonly details = {} as DetailsDraft;
  #base: () => SheetSubject;
  #edits = $state.raw<Partial<DetailsDraft>>({});
  #kind = $state.raw<Kind | null>(null);
  baitSearch = $state<BaitSearch>({ query: '', refused: false });
  #typedCatch = $state.raw<{
    collectedAt: number;
    value: CatchDraft | null;
  } | null>(null);

  constructor(base: () => SheetSubject) {
    this.#base = base;
    for (const field of DETAILS) {
      Object.defineProperty(this.details, field, {
        enumerable: true,
        get: () => this.#edits[field] ?? draftOf(this.#base().drop)[field],
        set: (value: string) => {
          this.#edits = { ...this.#edits, [field]: value };
        }
      });
    }
  }

  get subject() {
    return this.#base();
  }

  get kind() {
    return this.#kind ?? this.#base().gear.kind;
  }

  set kind(kind: Kind) {
    this.#kind = kind;
  }

  catchOf(drop: Drop): CatchDraft | null {
    if (drop.collectedAt === null) return null;
    const typed = this.#typedCatch;
    return typed?.collectedAt === drop.collectedAt
      ? typed.value
      : catchDraftOf(drop.catch);
  }

  typeCatch(drop: Drop, value: CatchDraft | null) {
    if (drop.collectedAt === null) return;
    this.#typedCatch = { collectedAt: drop.collectedAt, value };
  }

  of(drop: Drop): GearDraft {
    return {
      details: this.details,
      catch: this.catchOf(drop),
      kind: this.kind,
      baitQuery: this.baitSearch.query
    };
  }
}

export class GearSheetSession {
  #commands: SheetCommands;
  #origin = $state.raw<SheetOrigin | null>(null);
  #draft = $state.raw<SheetDraft | null>(null);
  #operation = $state.raw<Operation | null>(null);
  #asking = $state.raw<{ exit: () => void; loss: Loss } | null>(null);
  #refusal = $state.raw<Refusal | null>(null);
  #waiting: (() => void) | null = null;
  #returnFocus: SheetOrigin['returnFocus'] = () => null;
  #subject = $derived.by(() =>
    sheetSubject(this.#commands.trips(), this.#origin?.dropId ?? null)
  );

  constructor(commands: SheetCommands) {
    this.#commands = commands;
    commands.observeStored(() => {
      if (this.#origin && !this.#subject) this.close();
    });
  }

  get subject() {
    return this.#subject;
  }

  get open() {
    return this.#subject !== null;
  }

  get from() {
    return this.#origin?.from ?? null;
  }

  get draft() {
    return this.#draft;
  }

  get busy() {
    return this.#current?.pending ?? false;
  }

  get problem() {
    return this.#current?.problem ?? null;
  }

  get asking() {
    return this.#asking?.loss ?? null;
  }

  get refusal() {
    return this.#refusal;
  }

  get undoCollectBlocked() {
    const subject = this.#subject;
    return (
      subject !== null && this.#commands.undoCollectBlocked(subject.drop.id)
    );
  }

  get dirty() {
    const subject = this.#subject;
    const draft = this.#draft;
    return (
      subject !== null &&
      draft !== null &&
      draftChanged(subject.drop, subject.gear.kind, draft.of(subject.drop))
    );
  }

  get #current() {
    const operation = this.#operation;
    return operation?.origin === this.#origin ? operation : null;
  }

  show(origin: SheetOrigin) {
    this.#origin = origin;
    this.#returnFocus = origin.returnFocus;
    this.#restart();
  }

  close() {
    this.#origin = null;
    this.#restart();
  }

  returnFocus() {
    return this.#returnFocus();
  }

  leave(exit: () => void): Leaving {
    if (this.#asking) {
      this.#asking = null;
      return 'kept';
    }
    if (!this.dirty || (this.busy && this.#current?.kind === 'save')) {
      exit();
      return 'left';
    }
    if (this.busy) {
      this.#waiting = exit;
      return 'waiting';
    }
    this.#asking = { exit, loss: 'draft' };
    return 'asked';
  }

  dismiss() {
    return this.leave(() => {
      this.close();
    });
  }

  backdrop() {
    if (!this.dirty && !this.#asking) this.close();
  }

  keepEditing() {
    this.#asking = null;
  }

  discard() {
    const shown = this.#asking;
    this.#asking = null;
    if (shown?.loss === 'draft') this.#startDraft();
    shown?.exit();
  }

  save() {
    const ready = this.#checked();
    if (!ready) return;
    const { subject, edit, kind } = ready;
    void this.#operate(
      'save',
      () => this.#commands.save(subject.drop.id, edit, kind),
      (problem) => {
        if (problem === null) this.close();
        return problem;
      },
      this.#reportLost(subject.name)
    );
  }

  dropAgain() {
    const ready = this.#checked();
    if (!ready) return;
    const { subject, edit, kind } = ready;
    void this.#operate(
      'save',
      () => this.#commands.save(subject.drop.id, edit, kind),
      (problem) => {
        if (problem !== null) return problem;
        this.close();
        this.#commands.dropAgain(subject.drop.id);
        return null;
      },
      this.#reportLost(subject.name)
    );
  }

  collect() {
    const subject = this.#subject;
    if (!subject) return;
    void this.#operate(
      'other',
      () => this.#commands.collect(subject.drop.id),
      () => null
    );
  }

  deleteDrop() {
    const subject = this.#subject;
    if (!subject || this.busy) return;
    this.leave(() => {
      void this.#operate(
        'other',
        () => this.#commands.remove(subject.drop.id),
        (deleted) => {
          if (deleted) this.close();
          return null;
        }
      );
    });
  }

  undoCollect() {
    const subject = this.#subject;
    if (!subject || this.busy || this.undoCollectBlocked) return;
    const putBack = () => {
      void this.#operate(
        'other',
        () => this.#commands.undoCollect(subject.drop.id, subject.name),
        () => null
      );
    };
    this.leave(() => {
      if (subject.drop.catch) this.#asking = { exit: putBack, loss: 'catch' };
      else putBack();
    });
  }

  showOnMap() {
    const subject = this.#subject;
    if (!subject || this.busy) return;
    this.leave(() => {
      this.#commands.showOnMap(subject);
      this.close();
    });
  }

  #restart() {
    this.#startDraft();
    this.#asking = null;
    this.#waiting = null;
  }

  #startDraft() {
    const subject = this.#subject;
    this.#draft = subject && new SheetDraft(() => this.#subject ?? subject);
    this.#refusal = null;
  }

  #checked() {
    const subject = this.#subject;
    const draft = this.#draft;
    if (!subject || !draft || this.busy) return null;
    const checked = checkDraft(draft.of(subject.drop), subject.gear.kind);
    if (checked.valid)
      return { subject, edit: checked.edit, kind: checked.kind };
    if (checked.invalid.includes('bait')) draft.baitSearch.refused = true;
    this.#refusal = { invalid: checked.invalid };
    return null;
  }

  #reportLost(name: string) {
    return (outcome: { result: SaveProblem | null } | null) => {
      if (outcome?.result !== null) this.#commands.saveLost(name);
    };
  }

  async #operate<A>(
    kind: Operation['kind'],
    work: () => Promise<A>,
    settle: (result: A) => SaveProblem | null,
    closed: (outcome: { result: A } | null) => void = () => {}
  ) {
    const origin = this.#origin;
    if (!origin || this.busy) return;
    const operation: Operation = { origin, kind, pending: true, problem: null };
    this.#operation = operation;
    this.#refusal = null;
    const outcome = await work().then(
      (result) => ({ result }),
      () => null
    );
    const owned = this.#operation === operation;
    if (this.#origin !== origin) {
      if (owned) this.#operation = null;
      closed(outcome);
      return;
    }
    if (!owned) return;
    const problem = outcome ? settle(outcome.result) : 'storage';
    this.#operation = { ...operation, pending: false, problem };
    const exit = this.#waiting;
    this.#waiting = null;
    if (exit && this.#origin === origin) this.leave(exit);
  }
}
