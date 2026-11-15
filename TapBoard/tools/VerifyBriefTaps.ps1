param([string]$BuildDirectory = "$PSScriptRoot\..\TapBoard\bin\BriefTapFix")
$ErrorActionPreference = 'Stop'
# Exercise raw contact behavior independently of the configurable tap debounce.
Add-Type -AssemblyName System.Configuration
[System.Configuration.ConfigurationManager]::AppSettings.Set('SameKeyMinIntervalMs', '0')
# Synthetic instantaneous contacts isolate these tests from duration filtering.
[System.Configuration.ConfigurationManager]::AppSettings.Set('TapMinDurationMs', '0')
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$build = (Resolve-Path $BuildDirectory).Path
[void][Reflection.Assembly]::LoadFrom((Join-Path $build 'TapBoard.exe'))
$area = New-Object TapBoard.KeyArea
try {
    $area.Size = New-Object Drawing.Size 1500,1000
    $area.CreateKeys(74)
    $flags = [Reflection.BindingFlags]'NonPublic,Instance'
    $controller = $area.GetType().GetField('input', $flags).GetValue($area)
    $keys = $controller.GetType().GetField('keys', $flags).GetValue($controller)
    $send = $controller.GetType().GetMethod('DistributeEvent', $flags)
    $space = @($keys | Where-Object { $_.GetName() -ceq ' ' })[0]
    $events = New-Object 'System.Collections.Generic.List[string]'
    $area.add_KeyInput({ param($sender, $eventArgs) $events.Add($eventArgs.key) })
    function Touch($id, $kind) {
        [void]$send.Invoke($controller, @([TapBoard.KeyAreaEvent]$kind, $id, ($space.x + 10), ($space.y + 10)))
    }
    function Check($ok, $message) { if (-not $ok) { throw $message } }
    Touch 1 1
    Check ($events.Count -eq 0) 'Input occurred before release'
    Start-Sleep -Milliseconds 350
    Touch 2 1
    Touch 3 1
    Touch 2 3
    Touch 3 3
    Check ($events.Count -eq 2) 'Brief overlapping taps lost while another contact rested'
    Touch 1 3
    Check ($events.Count -eq 2) 'Resting contact emitted input'
    Check (-not $space.IsActive()) 'Released contact stayed active'
    for ($i = 10; $i -lt 110; $i++) {
        Touch $i 1
        Touch $i 1
        Touch $i 3
        Touch $i 3
    }
    Check ($events.Count -eq 102) 'Rapid taps lost or duplicate events emitted extra input'
    $events.Clear()
    $hit = $space.GetType().GetMethod('IsPointInside', $flags)
    $x = $space.x + 10
    $extendedY = $space.y + 2 * $space.height - 1
    Check ($hit.Invoke($space,@($x,$extendedY))) 'Lower edge of extended spacebar missed'
    foreach ($kind in @(1,3)) {
        [void]$send.Invoke($controller,@([TapBoard.KeyAreaEvent]$kind,200,$x,$extendedY))
    }
    Check ($events.Count -eq 1 -and $events[0] -ceq ' ') 'Extended area did not produce a space'
    Check (-not $hit.Invoke($space,@($x,($extendedY+1)))) 'Hit area extends beyond twice the key height'
    Check (-not $hit.Invoke($space,@(($space.x-1),$extendedY))) 'Hit area expanded sideways'
    foreach ($key in $keys) {
        if ($key -eq $space) { continue }
        Check (-not $hit.Invoke($key,@(($key.x+1),($key.y+$key.height)))) 'Another key expanded downward'
    }
    [void]$send.Invoke($controller,@([TapBoard.KeyAreaEvent]1,201,$x,$extendedY))
    Start-Sleep -Milliseconds 350
    [void]$send.Invoke($controller,@([TapBoard.KeyAreaEvent]3,201,$x,$extendedY))
    Check ($events.Count -eq 1) 'Resting in extended area produced input'
    Write-Output 'PASS: spacebar hit height doubled downward only; boundary, space input and resting verified.'
    Write-Output 'PASS: input only on brief release; resting contact ignored; overlapping and 100 rapid taps preserved.'
} finally { $area.Dispose() }
