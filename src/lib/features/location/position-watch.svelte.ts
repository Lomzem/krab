import type { Fix, PositionSource } from '#lib/features/trip/index.js';

export type LocationPermission = 'prompt' | 'granted' | 'denied';

const PERMISSION_DENIED = 1;

export class PositionWatch implements PositionSource {
  fix = $state<Fix | null>(null);
  permission = $state<LocationPermission>('prompt');
  #watchId: number | null = null;
  #wanted = false;

  readonly latest = () => this.fix;

  start() {
    if (this.#wanted) return;
    this.#wanted = true;
    document.addEventListener('visibilitychange', this.#sync);
    this.#sync();
  }

  stop() {
    this.#wanted = false;
    document.removeEventListener('visibilitychange', this.#sync);
    this.#sync();
  }

  readonly #sync = () => {
    const visible = document.visibilityState === 'visible';
    if (this.#wanted && visible && this.#watchId === null) {
      this.#watchId = navigator.geolocation.watchPosition(
        this.#onPosition,
        this.#onError,
        { enableHighAccuracy: true, maximumAge: 0 }
      );
    }
    if ((!this.#wanted || !visible) && this.#watchId !== null) {
      navigator.geolocation.clearWatch(this.#watchId);
      this.#watchId = null;
    }
  };

  readonly #onPosition = (position: GeolocationPosition) => {
    this.permission = 'granted';
    this.fix = {
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      accuracyM: position.coords.accuracy,
      at: position.timestamp
    };
  };

  readonly #onError = (error: GeolocationPositionError) => {
    if (error.code === PERMISSION_DENIED) this.permission = 'denied';
  };
}
