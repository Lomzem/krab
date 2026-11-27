# Physical iPhone checks

Run these checks on the intended iPhone and iOS version, including the Home Screen app. Record device/OS, build identity, steps, observed outcome and remaining gaps. Linux WebKit emulation does not establish these behaviors.

- **Home Screen install:** add Krab to the Home Screen and launch it. Check the installed presentation, safe areas and that it opens on Map.
- **Storage retention and eviction:** save fictional gear, close and reopen Krab, then relaunch offline and after a day unused. Check that the stored trip remains. Record any eviction; storage eviction remains an operating-system limitation that emulation cannot show.
- **Location:** allow and deny the native prompt, follow the Settings recovery guidance, and verify real fix delivery after returning to Krab. Use fictional data in any shared evidence.
- **Compass:** with the motion permission undecided, the first tap shows the iOS prompt once and Krab never asks before a tap. Deny shows the visible `Motion access off` beside the capsule, keeps arrows north-up and reopens off without a prompt. After a later grant in Settings, a tap turns the compass on without a reload. Turn on the spot and check the nearest card, Gear list and sheet arrows; the map stays north-up with a heading cone. Check landscape both ways, calibration near magnetic interference, app-switch resume without a prompt, and remembered on after reopening. If iOS requires permission again, it stays paused until a tap.
- **Catch entry:** exercise the virtual keypad, rapid stepper taps and typed multi-digit counts. Check native double-tap/pinch behavior, reachable Save, and stable controls while the keyboard is open.
- **WCAG 2.2 AA on the device:** captured narrow widths and CSS zoom are partial layout evidence only. Check each of these:
  - **Wet-hand gestures:** with wet fingers, Drop, Collect, the steppers and sheet buttons work by single taps; no action needs a drag, pinch or path gesture; a swipe down closes only a clean sheet.
  - **Native zoom:** pinch-zoom Safari to 200 percent and check that no content or control is lost, and that map gestures do not trap the page.
  - **Text spacing:** with larger line, paragraph, letter and word spacing (for example through a bookmarklet), no UI copy clips or overlaps.
  - **Native Back:** the iOS back swipe and Safari Back close an open sheet first, ask `Unsaved changes` for a dirty sheet, and leave history consistent.
  - **VoiceOver:** names, roles and states of tabs, map controls, gear pins and groups, the Messages toast, sheets and confirmations; one announcement per message; focus order and focus return after each sheet and confirmation.
  - **Dynamic Type:** at the largest accessibility text sizes, the dock, sheets and confirmations reflow without clipping and keep every control reachable.
  - **Reduced motion:** with Reduce Motion on, sheets and toasts appear at once.
- **Offline and updates:** after one online load, close and relaunch without signal. Deploy a new build while Krab is open; it should take over only after every page closes. Check this in the Home Screen app as well as Safari.
- **Screen on:** during an active visible trip, check that a supported wake lock keeps the screen on, reacquires when appropriate and releases when the trip ends or the app hides. API absence or refusal must still permit dropping gear.
