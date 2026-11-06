# Physical iPhone checks

Run these checks on the intended iPhone and iOS version, including the Home Screen app. Record device/OS, build identity, steps, observed outcome and remaining gaps. Linux WebKit emulation does not establish these behaviors.

- **Install and retain:** add Krab to the Home Screen, launch it, save fictional gear, close and reopen it, then relaunch offline. Check installation presentation and stored-trip retention. Storage eviction remains an operating-system limitation.
- **Location:** allow and deny the native prompt, follow the Settings recovery guidance, and verify real fix delivery after returning to Krab. Use fictional data in any shared evidence.
- **Compass:** first tap prompts once; allow reaches on and deny stays north-up/unavailable, reopening off without a prompt. Turn on the spot and check the nearest card, Gear list and sheet arrows; the map stays north-up with a heading cone. Check landscape both ways, calibration near magnetic interference, app-switch resume without a prompt, and remembered on after reopening. If iOS requires permission again, it stays paused until a tap.
- **Catch entry:** exercise the virtual keypad, rapid stepper taps and typed multi-digit counts. Check native double-tap/pinch behavior, reachable Save, and stable controls while the keyboard is open.
- **Accessibility:** check VoiceOver names, announcements and focus, Dynamic Type/text enlargement, reduced motion and touch operation. Captured narrow widths and CSS zoom are partial layout evidence.
- **Offline and updates:** after one online load, close and relaunch without signal. Deploy a new build while Krab is open; it should take over only after every page closes. Check this in the Home Screen app as well as Safari.
- **Screen on:** during an active visible trip, check that a supported wake lock keeps the screen on, reacquires when appropriate and releases when the trip ends or the app hides. API absence or refusal must still permit dropping gear.
