# Keep active-trip data on the phone

Amended by ADR 0002: past trips are also kept on the phone.

Krab needs private drop locations for one trip, with no trip history or strong phone-recovery requirement. Persist active-trip records locally in IndexedDB when the product workflows are implemented, restoring them after normal reloads and app closes; do not introduce a cloud database or authentication for the scaffold. This avoids account management, uploading exact drop records, and service quotas for a single-device use case.

The user accepts loss if site data is cleared or evicted. Home Screen installation and a storage-persistence request do not guarantee retention. Revisit cloud persistence and authentication if shared trips, cross-device access, or recovery become requirements; Convex and Clerk with Google sign-in are the preferred services if needed. Map-provider traffic and offline app loading require separate product decisions.
