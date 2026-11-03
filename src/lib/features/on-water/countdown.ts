export class Countdown {
  #left: number;
  #since = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  readonly #holds = new Set<string>();
  readonly #done: () => void;

  constructor(ms: number, done: () => void) {
    this.#left = ms;
    this.#done = done;
    this.#run();
  }

  hold(reason: string) {
    if (this.#holds.size === 0) {
      clearTimeout(this.#timer);
      this.#left -= Date.now() - this.#since;
    }
    this.#holds.add(reason);
  }

  release(reason: string) {
    if (this.#holds.delete(reason) && this.#holds.size === 0) this.#run();
  }

  cancel() {
    clearTimeout(this.#timer);
  }

  #run() {
    this.#since = Date.now();
    this.#timer = setTimeout(this.#done, Math.max(this.#left, 0));
  }
}
