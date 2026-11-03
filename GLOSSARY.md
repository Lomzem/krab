# Krab

Krab records where crabbing gear is placed during an outing.

## Language

**Gear**:
A physical crab pot or net used to catch crabs.
_Avoid_: Pod

**Drop**:
A placement of gear at a particular location and time. Placing the same gear again creates a new drop.
_Avoid_: Pin

**Trip**:
One crabbing outing, over one or more days, containing one or more drops.

**Day**:
One calendar date within a trip. A drop belongs to the day it was placed.
_Avoid_: Session, outing day

**Active trip**:
The trip in progress. There is at most one.
_Avoid_: Current session

**Past trip**:
A trip that has ended.
_Avoid_: Archived trip, history

**Active drop**:
A drop whose gear is still in the water.
_Avoid_: Open drop, live pin

**Uncollected drop**:
A drop whose gear was still in the water when its trip ended.
_Avoid_: Lost pot, abandoned drop

**Collect**:
To take a drop's gear out of the water, which ends that drop.
_Avoid_: Pull, retrieve, haul

**Time in the water**:
How long a drop's gear has been in the water, from the drop until now, or until it was collected.
_Avoid_: Soak, soak time

**Catch**:
The crabs kept and released from one drop. Zero kept and zero released means nothing was caught; no catch means it was not recorded. Only a collected drop can have a catch, on an active or a past trip: an active drop or an uncollected drop never came out of the water, so it has none.
_Avoid_: Haul
