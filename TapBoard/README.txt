TapBoard: resting-friendly touchscreen keyboard

Run on Windows 10 or later with .NET Framework 4.8. Arrange the displays
vertically using Extend in Windows Display Settings. TapBoard covers the
lowest display and places the keyboard at its top; apps keep focus on the
upper display. The blank area below absorbs touches without typing.

Press the small power button beside Del to exit immediately on touch DOWN. F10 is a normal function key.
Alternatively, run in PowerShell: Stop-Process -Name TapBoard

INPUT BEHAVIOR

Character and space keys commit on release only when the contact is at least
10 ms and shorter than 300 ms and its release displacement is less than 60 pixels. Resting
contacts do not type. Backspace and arrow keys activate immediately and repeat
while held. Hold Shift, Ctrl, Alt or Win while tapping another key.
Shift/Ctrl/Alt now stay down in Windows for the lifetime of the touch, as Win
already does. Hold Alt and tap Tab repeatedly, use Shift+Tab or the arrows,
then lift Alt to commit the selected window. Tab remains a brief-release tap;
holding Tab does not repeat. Releasing one of two Shift/Ctrl keys, or one of
multiple fingers on a modifier, keeps it held until the last contact lifts.
Native holds are released on input lock, layout reset, touch-window destruction
and normal exit, not on foreground-window changes. Modifiers already held on
a physical keyboard are not acquired or released by TapBoard; if that hold
ends, TapBoard acquires its own hold before the next ordinary key.

At most two distinct non-modifier keys may be touched. Shift, Ctrl, Alt and
Win contacts are tracked separately and do not consume this limit, allowing
shortcuts such as Ctrl+Shift+arrow. A third non-modifier key cancels pending
taps, stops repeats, releases all injected modifiers, and locks the keyboard.
All key contacts, including modifiers, must lift before typing resumes.
Multiple contacts on the same key count as one key; blank-area contacts do
not count. Every down in a native packet is checked before any up commits.
Already emitted input cannot
be retracted. The locked palette is slightly darker than the base palette.

Space has an explicit hit rectangle extending down to twice its visible
height. Width and top edge are unchanged. This extension participates in tap
classification, the active-key limit, and touch feedback just like the drawn
spacebar. Other keys keep their normal hit rectangles.

Labels follow the foreground app's Korean/English IME state. Shift changes
Hangul consonants/vowels; Caps Lock changes English letter case only. Native
virtual-key events let the target app's IME and Caps Lock determine the text.
The last known language remains if an app cannot expose its IME state.

Touch feedback is a quiet C4 sine; accepted input is an E4 sine. The dedicated
WASAPI worker keeps an event-driven stream open, mixes overlapping voices,
and counts every request without coalescing. Input never waits for playback.
The minimum engine period is requested, falling back to the current shared
period if necessary. Reported periods are not measured audible latency.

CONFIGURATION

Edit TapBoard.exe.config beside the executable, then restart. The source is
TapBoard/app.config. Invalid/out-of-range values use safe defaults.

KeyboardDisplay: blank selects the lowest display; override with a Windows
display name such as \\.\DISPLAY2.
DisplayWidthMm: 0 uses reported monitor width. Enter measured visible width
in millimetres for accurate physical spacing. Check with a ruler because
reported monitor dimensions may be rounded.
KeyPitchMm: 19.5 by default. The layout is 15 by 5.5 keyboard units; function
keys have normal width and half height. Keys are never shrunk to fit.
TapMinDurationMs: inclusive minimum tap duration (10 ms); 0 disables.
It applies only to TAPPER keys and must be below TapDurationMs. Invalid values
fall back to 10 ms, or maximum minus 1 when the maximum is 10 ms or less.
Normal repeat keys and modifiers are unaffected. Young contacts remain visually
pending until they expire or lift; the minimum does not delay touch feedback.
TapDurationMs / TapDistancePixels: exclusive maximum tap thresholds (300 / 60).
MaxActiveKeys: distinct non-modifier key limit (2); modifiers do not count.
SameKeyMinIntervalMs: suppress consecutive same-key accepted taps less than
100 ms apart (0 disables). Different intervening keys or changed software
modifiers are not suppressed. Normal held-key repeat is unaffected. Suppression
happens after release classification and adds no waiting. REJECT_DUPLICATE marks
suppressed taps in diagnostics; rejected contacts do not extend the interval.
RepeatIntervalMs: held Backspace/arrow repeat interval (100). A late callback never
shortens the following interval or generates catch-up bursts. MOVE packets
do not trigger full keyboard paints; rendering honors the invalidated region.
Ordinary DOWN/UP repaints only the contact owner key, even if release occurs
outside it. Shift/Ctrl, label-state changes and lock transitions repaint the
keyboard region; they do not repaint the blank resting area.
Windows/UI scheduling can still cause jitter.
SpaceHitHeightMultiplier: downward spacebar hit extension (2).
LockedBrightness: fraction of base color during lock (0.85).
TouchSoundEnabled: enable touch-down audio feedback (true).
InputSoundEnabled: enable accepted-input audio feedback (true).
Both audio switches are independent; restart the application after changing them.
Legacy SoundEnabled is used only as a fallback when a channel switch is absent.
FilterTouchMouse: enable touch mouse filtering (true).
TouchFrequencyHz / InputFrequencyHz: C4 / E4 (261.625565 / 329.627557).
TouchGain / InputGain: feedback amplitudes (0.07 / 0.12).
TouchDurationMs / InputDurationMs: voice lengths (70 / 60).
TraceTouches: diagnostic logging, off by default. When enabled, periodic CSV
snapshots are saved beside the executable off the touch callback thread.
WINDOWS INTEGRATION

The app-lifetime WH_MOUSE_LL hook runs on a dedicated message thread and
filters touch-promoted mouse events over the client area, including the blank
resting area. Physical mouse and pen events pass through. Touches starting
outside retain their mouse sequence. The hook is removed when the app closes.
Per-window settings disable press-and-hold and legacy gestures. Native touch
uses WANTPALM for immediate delivery, avoiding Windows palm buffering.
Windows may still hide the cursor during touch. System edge-swipe gestures
are controlled by Windows and are separate from these per-window settings.

SOURCE STRUCTURE

Keyboard.cs: form lifecycle and service wiring; never classifies taps.
KeyArea.cs: Windows-contact translation, primary-touch ownership, UI timers,
label state and repaint requests. Screen coordinates are physical pixels.
KeyboardInputController.cs: distinct-key lock, modifiers, repeat dispatch and
standalone touch dispatch, independent of WinForms controls/native handles.
Contact events go directly to the key selected at DOWN using the contact ID;
MOVE/UP never scan all keys or reassign a contact based on its new position.
KeyboardLayout.cs: physical-unit layout and explicit hit-area extensions.
KeyDefinition.cs: identity, labels, geometry and base appearance.
KeyState.cs / Stroke.cs: contact lifetimes and brief-release classification.
Key.cs: joins a definition with its state; exposes visual and hit rectangles.
KeyRenderer.cs / KeyboardTheme.cs: drawing and palette; cached fonts belong
to the renderer and are disposed with the control.
KeyboardSettings.cs: validated, immutable startup configuration.
KeyboardEvents.cs: shared input contracts without UI dependencies.
WindowsTouchInput.cs: native TOUCHINPUT layout, flags and API boundary.
WindowsKeyboardOutput.cs: native target-key sequences and held-modifier ownership/cleanup.
TouchMouseFilter.cs / TouchGestureSettings.cs: mouse and gesture isolation.
ImeStateReader.cs / DisplayGeometry.cs: target language and screen calibration.
ClickFeedback.cs / ClickMixer.cs: WASAPI lifecycle / pure sound synthesis.
TouchDiagnostics.cs: bounded trace storage and asynchronous snapshot writes.

Contact state, rendering and diagnostics snapshots run on the UI thread.
Audio, mouse hooks, IME queries and periodic diagnostic writes use background work.
Comments explain ordering and ownership rules that must survive refactoring.

BUILD AND VERIFICATION

From this folder: dotnet msbuild TapBoard.sln /t:Build /p:Configuration=Debug
The Windows .NET Framework 4.8 targeting pack is required. Output:
TapBoard/bin/Debug/TapBoard.exe. The old Windows7.Multitouch DLLs are unused.

Run tools/VerifyLayout.ps1, VerifyBriefTaps.ps1, VerifyNativeTouch.ps1,
VerifyResponsiveness.ps1, VerifyTouchMouseFilter.ps1, VerifyTraceSave.ps1,
VerifyRepeatSchedule.ps1 and VerifyInvalidation.ps1
with Windows PowerShell. Each accepts -BuildDirectory pointing to the output.
Use -NativeAudio for a silent WASAPI start/stop check and -NativeLifecycle for
native mouse-hook lifecycle checks. Layout checks generate preview images.
Synthetic contact tests verify algorithms; actual feel and driver behavior
must also be checked on the ASUS touchscreen.

Held-modifier regression check (Windows or macOS with the .NET 10 SDK):
dotnet run --project tools/HeldModifierCheck/HeldModifierCheck.csproj
Runs the real controller and output policy with a simulated native boundary;
checks Alt+Tab/Shift+Tab/arrows, shared contacts, cleanup, physical keys already
held at touch-down, and failed injection. It does not inject real OS keys.
On Windows also check the actual switcher: hold Alt, tap Tab twice, add Shift
and tap Tab, release Shift, use arrows, then release Alt to select the window.
Check Ctrl+Shift+arrows and that releasing/closing TapBoard leaves no stuck keys.
