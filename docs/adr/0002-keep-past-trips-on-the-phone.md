---
Status: accepted
---

# Keep past trips on the phone

Krab records bait, depth, and catch for each drop, and that data is most useful when trips can be compared. Ending a trip therefore keeps it on the phone as a past trip instead of deleting it; this amends ADR 0001, which assumed no trip history. Storage stays phone-local in IndexedDB with no cloud database or authentication, and the loss accepted in ADR 0001 now covers past trips too. Deleted trip data cannot be recovered later, which is why history is kept from the first release even before any view analyzes it.
