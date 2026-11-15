param([string]$BuildDirectory = "$PSScriptRoot\..\TapBoard\bin\TapDebounce")
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing, System.Configuration
# Synthetic instantaneous contacts isolate these tests from duration filtering.
[System.Configuration.ConfigurationManager]::AppSettings.Set('TapMinDurationMs', '0')
$assembly = [Reflection.Assembly]::LoadFrom((Join-Path (Resolve-Path $BuildDirectory) 'TapBoard.exe'))
$flags = [Reflection.BindingFlags]'NonPublic,Instance'
$type = $assembly.GetType('TapBoard.KeyboardInputController')
$script:now = 0.0
$clock = [Func[double]] { $script:now }
$controller = [Activator]::CreateInstance($type,$flags,$null,@([int]100,$clock),$null)
[void]$type.GetMethod('CreateKeys',$flags).Invoke($controller,@(74,1500))
$keys = $type.GetField('keys',$flags).GetValue($controller)
$send = $type.GetMethod('DistributeEvent',$flags)
$events = New-Object 'System.Collections.Generic.List[string]'
$controller.add_KeyInput({param($sender,$eventArgs) $events.Add($eventArgs.key)})
function Check($ok,$message) { if (-not $ok) { throw $message } }
function Key($code) { @($keys | Where-Object { $_.GetName() -ceq $code })[0] }
function Contact($key,$id,$kind) {
    [void]$send.Invoke($controller,@([TapBoard.KeyAreaEvent]$kind,$id,($key.x+10),($key.y+10)))
}
function Tap($key,$id) { Contact $key $id 1; Contact $key $id 3 }
$space=Key ' '
Contact $space 1 1
Check ($events.Count -eq 0) 'Tap committed before release'
Contact $space 1 3
Check ($events.Count -eq 1) 'First space was rejected'
foreach ($time in @(10,50,99)) {
    $script:now=$time
    Tap $space (10+$time)
    Check ($events.Count -eq 1) 'Bounce emitted another space'
    Check (-not $space.IsActive()) 'Rejected tap left a contact active'
}
$script:now=100
Tap $space 200
Check ($events.Count -eq 2) 'Boundary tap rejected or rejected bounces extended the interval'
$script:now=101
Tap (Key '{j}') 201
Tap $space 202
Check ($events.Count -eq 4) 'Different intervening key was debounced'
# Modifier changes are intentional new input, even on the same physical key.
$shift=@($keys | Where-Object { $_.GetLabel($false) -eq 'Shift' })[0]
Contact $shift 300 1
Tap $space 301
Check ($events.Count -eq 6) 'Changed modifier combination was debounced'
Contact $shift 300 3
# NORMAL down events must not be suppressed by tap debounce.
$back=Key '{BKSP}'
Tap $back 400
Tap $back 401
Check (($events | Where-Object { $_ -eq '{BKSP}' }).Count -eq 2) 'Normal key was debounced'
# Debounce can be disabled without altering tap classification.
$disabled=[Activator]::CreateInstance($type,$flags,$null,@([int]0,$clock),$null)
[void]$type.GetMethod('CreateKeys',$flags).Invoke($disabled,@(74,1500))
$disabled.add_KeyInput({param($sender,$eventArgs) $events.Add($eventArgs.key)})
$space2=@($type.GetField('keys',$flags).GetValue($disabled) | Where-Object { $_.GetName() -ceq ' ' })[0]
$before=$events.Count
foreach ($id in @(500,501)) {
    foreach ($kind in @(1,3)) {
        [void]$send.Invoke($disabled,@([TapBoard.KeyAreaEvent]$kind,$id,($space2.x+10),($space2.y+10)))
    }
}
Check ($events.Count -eq $before+2) 'Zero interval did not disable debounce'
Write-Output 'PASS: release-only debounce, first tap, bounce suppression, exact boundary, no extension, contact cleanup, intervening keys, modifier changes, NORMAL keys and disabled mode.'
