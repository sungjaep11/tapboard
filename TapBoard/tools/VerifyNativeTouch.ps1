param([string]$BuildDirectory = "$PSScriptRoot\..\TapBoard\bin\Debug")
$ErrorActionPreference = 'Stop'
# Exercise raw contact behavior independently of the configurable tap debounce.
Add-Type -AssemblyName System.Configuration
[System.Configuration.ConfigurationManager]::AppSettings.Set('SameKeyMinIntervalMs', '0')
# Synthetic instantaneous contacts isolate these tests from duration filtering.
[System.Configuration.ConfigurationManager]::AppSettings.Set('TapMinDurationMs', '0')
[System.Configuration.ConfigurationManager]::AppSettings.Set('MaxActiveKeys', '2')
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$build = (Resolve-Path $BuildDirectory).Path
[void][Reflection.Assembly]::LoadFrom((Join-Path $build 'TapBoard.exe'))
$area = New-Object TapBoard.KeyArea
try {
    $area.Size = New-Object Drawing.Size 1900,1200
    $area.CreateKeys(120)
    [void]$area.Handle
    $flags = [Reflection.BindingFlags]'NonPublic,Instance'
    $controller = $area.GetType().GetField('input', $flags).GetValue($area)
    $type = [TapBoard.KeyArea].Assembly.GetType('TapBoard.WindowsTouchInput').GetNestedType('NativeTouch', [Reflection.BindingFlags]::NonPublic)
    $expected = if ([IntPtr]::Size -eq 8) {48} else {40}
    if ([Runtime.InteropServices.Marshal]::SizeOf([Activator]::CreateInstance($type)) -ne $expected) { throw 'Native TOUCHINPUT layout incorrect' }
    $keys = $controller.GetType().GetField('keys', $flags).GetValue($controller)
    $f = @($keys | Where-Object { $_.GetName() -ceq '{f}' })[0]
    $j = @($keys | Where-Object { $_.GetName() -ceq '{j}' })[0]
    $process = $area.GetType().GetMethod('ProcessTouchInputs', $flags)
    $touchEvents = New-Object 'System.Collections.Generic.List[int]'
    $touchHandler = [Action]{ $touchEvents.Add(1) }
    $area.GetType().GetEvent('KeyTouched', $flags).GetAddMethod($true).Invoke($area, @($touchHandler)) | Out-Null
    $events = New-Object 'System.Collections.Generic.List[string]' 
    $inputEvents = New-Object 'System.Collections.Generic.List[TapBoard.KeyInputEventArgs]'
    $area.add_KeyInput({ param($sender, $eventArgs) $events.Add($eventArgs.key); $inputEvents.Add($eventArgs) })
    function Input($key, $id, $bits) {
        $point = $area.PointToScreen((New-Object Drawing.Point ($key.x+10),($key.y+10)))
        $item = [Activator]::CreateInstance($type)
        $item.x = $point.X * 100; $item.y = $point.Y * 100
        $item.id = $id; $item.flags = $bits
        return $item
    }
    function Packet($items) {
        $array = [Array]::CreateInstance($type, $items.Count)
        for ($i=0; $i -lt $items.Count; $i++) { $array.SetValue($items[$i],$i) }
        [void]$process.Invoke($area, (, $array))
    }
    Packet @((Input $f 1 26))
    if ($events.Count -ne 0) { throw 'Touch-down emitted input' }
    Start-Sleep -Milliseconds 350
    for ($id=2; $id -le 11; $id++) {
        Packet @((Input $f 1 25),(Input $j $id 10))
        Packet @((Input $f 1 25),(Input $j $id 4))
    }
    Packet @((Input $f 1 20))
    if ($events.Count -ne 10 -or @($events | Where-Object { $_ -cne '{j}' }).Count -ne 0) { throw ('Expected ten J inputs; received: ' + ($events -join '|')) }
    if ($touchEvents.Count -ne 11) { throw 'Expected exactly one touch feedback for resting F and each J tap' }
    $down = $area.GetType().GetMethod('OnTouchDown', $flags)
    $up = $area.GetType().GetMethod('OnTouchUp', $flags)
    $blank = New-Object Drawing.Point 10,1100
    [void]$down.Invoke($area, @(99,$blank,$true))
    [void]$up.Invoke($area, @(99,$blank))
    if ($touchEvents.Count -ne 11) { throw 'Blank resting area produced touch feedback' }
    Write-Output 'PASS: touch feedback occurs once on key-down, including resting; no feedback for blank area.'
    if ($f.IsActive() -or $j.IsActive()) { throw 'Released contact remained active' }
    $k = @($keys | Where-Object { $_.GetName() -ceq '{k}' })[0]
    $locked = $controller.GetType().GetField('inputLocked', $flags)
    $events.Clear()
    Packet @((Input $f 18 26),(Input $j 17 10))
    Packet @((Input $j 17 4),(Input $f 18 20))
    if (($events -join ',') -cne '{f},{j}') { throw 'Reverse-order lifts changed native press order' }
    $events.Clear()
    Packet @((Input $f 20 26),(Input $j 21 10))
    Packet @((Input $k 22 10))
    if (-not $locked.GetValue($controller)) { throw 'Third distinct key did not lock' }
    Packet @((Input $f 20 20),(Input $j 21 4))
    if (-not $locked.GetValue($controller)) { throw 'Unlocked before all key contacts released' }
    Packet @((Input $j 23 10),(Input $j 23 4))
    if ($events.Count -ne 0) { throw 'Locked keyboard emitted a tap' }
    Packet @((Input $k 22 4))
    if ($locked.GetValue($controller)) { throw 'Did not unlock after all key contacts released' }
    Packet @((Input $j 24 10),(Input $j 24 4))
    if ($events.Count -ne 1 -or $events[0] -cne '{j}') { throw 'Input did not recover' }
    # Three contacts on only two distinct keys remain permitted.
    $events.Clear()
    Packet @((Input $f 30 26),(Input $f 31 10),(Input $j 32 10))
    if ($locked.GetValue($controller)) { throw 'Counted contacts instead of distinct keys' }
    Packet @((Input $f 30 20),(Input $f 31 4),(Input $j 32 4))
    if ($events.Count -ne 3) { throw 'Permitted overlapping taps lost' }
    # An up earlier in the packet must not commit before a third down.
    $events.Clear()
    Packet @((Input $f 40 26),(Input $j 41 10))
    Packet @((Input $f 40 20),(Input $k 42 10))
    Packet @((Input $j 41 4),(Input $k 42 4))
    if ($events.Count -ne 0) { throw 'Mixed up/down packet bypassed lock' }
    # Both left/right Ctrl and Shift can accompany an immediately repeating key.
    $shifts = @($keys | Where-Object { $_.GetLabel($false) -ceq 'Shift' })
    $controls = @($keys | Where-Object { $_.GetLabel($false) -ceq 'Ctrl' })
    $right = @($keys | Where-Object { $_.GetName() -ceq '{RIGHT}' })[0]
    foreach ($shift in $shifts) {
        foreach ($control in $controls) {
            $inputEvents.Clear()
            Packet @((Input $control 60 26),(Input $shift 61 10),(Input $right 62 10))
            if ($locked.GetValue($controller)) { throw 'Ctrl+Shift+arrow incorrectly locked' }
            $arrow = @($inputEvents | Where-Object { $_.key -ceq '{RIGHT}' })
            if ($arrow.Count -ne 1 -or -not $arrow[0].shift -or -not $arrow[0].control) { throw 'Shortcut lost modifier flags' }
            Packet @((Input $right 62 4),(Input $shift 61 4),(Input $control 60 20))
        }
    }
    # All modifier keys remain independent of two ordinary keys and same-key contacts.
    $modifiers = @($keys | Where-Object { $_.GetLabel($false) -cin @('Shift','Ctrl','Alt','Win') })
    $inputEvents.Clear()
    for ($i=0; $i -lt $modifiers.Count; $i++) { Packet @((Input $modifiers[$i] (70+$i) 10)) }
    Packet @((Input $f 80 10),(Input $f 81 10),(Input $j 82 10))
    if ($locked.GetValue($controller)) { throw 'Modifiers consumed ordinary-key slots' }
    Packet @((Input $f 80 4),(Input $f 81 4),(Input $j 82 4))
    $letters = @($inputEvents | Where-Object { $_.key -cin @('{f}','{j}') })
    if ($letters.Count -ne 3) { throw 'Modifiers prevented overlapping ordinary taps' }
    foreach ($letter in $letters) {
        if (-not $letter.shift -or -not $letter.control -or -not $letter.alt) { throw 'Held modifier flags were lost' }
    }
    for ($i=0; $i -lt $modifiers.Count; $i++) { Packet @((Input $modifiers[$i] (70+$i) 4)) }
    # A modifier DOWN in a mixed packet must not cancel an earlier ordinary UP.
    $events.Clear()
    Packet @((Input $f 90 26),(Input $j 91 10))
    Packet @((Input $f 90 20),(Input $controls[0] 92 10),(Input $shifts[0] 93 10))
    if ($locked.GetValue($controller) -or -not $events.Contains('{f}')) { throw 'Modifier packet preflight cancelled an allowed tap' }
    Packet @((Input $j 91 4),(Input $controls[0] 92 4),(Input $shifts[0] 93 4))
    # Cancel held Win and repeat keys only on the third NON-modifier key.
    $win = @($keys | Where-Object { $_.GetLabel($false) -ceq 'Win' })[0]
    $back = @($keys | Where-Object { $_.GetName() -ceq '{BKSP}' })[0]
    $events.Clear()
    Packet @((Input $win 50 26),(Input $back 51 10))
    Packet @((Input $f 52 10))
    if ($locked.GetValue($controller) -or $events.Contains('{WIN_UP}')) { throw 'Win consumed an ordinary-key slot' }
    Packet @((Input $f 52 4),(Input $j 53 10))
    if (-not $locked.GetValue($controller) -or $events.Contains('{f}')) { throw 'Third non-modifier DOWN failed packet preflight' }
    if (-not $events.Contains('{WIN_UP}')) { throw 'Win was left held on lock' }
    if ($back.WantRepeat()) { throw 'Repeat remained active on lock' }
    Packet @((Input $back 51 4),(Input $j 53 4))
    if (-not $locked.GetValue($controller)) { throw 'Unlocked while a tracked modifier remained' }
    Packet @((Input $shifts[0] 54 10))
    if ($shifts[0].IsActive()) { throw 'Modifier activated during lock' }
    Packet @((Input $win 50 20))
    if (-not $locked.GetValue($controller)) { throw 'Ignored modifier contact added during lock' }
    Packet @((Input $shifts[0] 54 4))
    if ($locked.GetValue($controller)) { throw 'Modifier release failed to unlock' }
    if (@($events | Where-Object { $_ -ceq '{WIN_UP}' }).Count -ne 1) { throw 'Win release was duplicated' }
    # Reusing a former modifier contact ID must resolve to the new ordinary key.
    $inputEvents.Clear()
    Packet @((Input $f 50 10),(Input $f 50 4))
    $letter = @($inputEvents | Where-Object { $_.key -ceq '{f}' })
    if ($letter.Count -ne 1 -or $letter[0].shift -or $letter[0].control -or $letter[0].alt) { throw 'Recovered input retained modifier state' }
    # Rebuilding clears both contact registries and releases held Win.
    Packet @((Input $win 100 10),(Input $controls[0] 101 10))
    $events.Clear()
    $area.CreateKeys(120)
    if (-not $events.Contains('{WIN_UP}')) { throw 'Layout reset left Win held' }
    foreach ($field in @('keyContacts','modifierContacts')) {
        if ($controller.GetType().GetField($field,$flags).GetValue($controller).Count -ne 0) { throw 'Layout reset retained contacts' }
    }
    Write-Output 'PASS: modifiers excluded from two-key limit; left/right Ctrl+Shift+arrow; all modifiers with two ordinary keys; mixed packets; lock cleanup; contact ID reuse; layout reset.'
    Write-Output 'PASS: third non-modifier cancellation; release-all-to-unlock; same-key contacts; modifier release and repeat cancellation.'
    Write-Output 'PASS: native multi-contact packets; resting F suppressed; all ten brief J taps accepted on release; physical coordinates and native layout verified.'
} finally { $area.Dispose() }

