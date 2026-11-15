param([string]$BuildDirectory = "$PSScriptRoot\..\TapBoard\bin\Debug", [int]$MinimumMs = 10, [int]$MaximumMs = 300)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Configuration, System.Drawing
[System.Configuration.ConfigurationManager]::AppSettings.Set('TapMinDurationMs', "$MinimumMs")
[System.Configuration.ConfigurationManager]::AppSettings.Set('TapDurationMs', "$MaximumMs")
$assembly=[Reflection.Assembly]::LoadFrom((Join-Path (Resolve-Path $BuildDirectory) 'TapBoard.exe'))
$flags=[Reflection.BindingFlags]'NonPublic,Instance'
$settingsType=$assembly.GetType('TapBoard.KeyboardSettings')
$settings=$settingsType.GetField('Current',[Reflection.BindingFlags]'NonPublic,Static').GetValue($null)
$minimum=$settingsType.GetField('TapMinDurationMs',$flags).GetValue($settings)
$expected=if ($MinimumMs -ge 0 -and $MinimumMs -lt $MaximumMs) { $MinimumMs } else { [Math]::Min(10,$MaximumMs-1) }
function Check($ok,$message) { if (-not $ok) { throw $message } }
Check ($minimum -eq $expected) 'Minimum configuration validation failed'
$strokeType=$assembly.GetType('TapBoard.Stroke')
$script:age=0L
$clock=[Func[long]] { $script:age }
$stroke=[Activator]::CreateInstance($strokeType,$flags,$null,@(1,10,10,$clock),$null)
foreach ($age in @(0,($minimum-1),$minimum,($MaximumMs-1),$MaximumMs)) {
    if ($age -lt 0) { continue }
    $script:age=[long]$age
    Check ($stroke.IsTap() -eq ($age -ge $minimum -and $age -lt $MaximumMs)) "Wrong duration boundary at $age ms"
    Check ($strokeType.GetMethod('IsExpired',$flags).Invoke($stroke,@()) -eq ($age -ge $MaximumMs)) 'Young contacts incorrectly marked expired'
}
$script:age=[long]$minimum
$stroke.AddPoint(1,70,10)
Check (-not $stroke.IsTap()) 'Displacement threshold no longer enforced'
# Exercise completed contact cleanup and UI pending state with an injected age.
$key=New-Object TapBoard.Key '{j}','j','J',0,0,74,74,([TapBoard.Key+TYPE]::TAPPER),([Drawing.Color]::Navy)
$state=$key.GetType().GetField('State',$flags).GetValue($key)
$contacts=$state.GetType().GetField('tappingContacts',$flags).GetValue($state)
foreach ($age in @(0,$minimum)) {
    $script:age=[long]$age
    [void]$key.OnKeyAreaEvent([TapBoard.KeyAreaEvent]1,1,10,10)
    $contacts[1]=[Activator]::CreateInstance($strokeType,$flags,$null,@(1,10,10,$clock),$null)
    Check (-not $key.IsExpired()) 'Minimum filter dimmed a pending key'
    $accepted=$key.OnKeyAreaEvent([TapBoard.KeyAreaEvent]3,1,10,10)
    Check ($accepted -eq ($age -ge $minimum)) 'Completed key tap ignored minimum duration'
    Check (-not $key.IsActive()) 'Rejected contact was not cleaned up'
}
foreach ($kind in @([TapBoard.Key+TYPE]::NORMAL,[TapBoard.Key+TYPE]::MODIFIER)) {
    $key=New-Object TapBoard.Key '{BKSP}','Test',$null,0,0,74,74,$kind,([Drawing.Color]::Gray)
    Check ($key.OnKeyAreaEvent([TapBoard.KeyAreaEvent]1,7,10,10)) 'Minimum filter delayed a NORMAL or MODIFIER key'
    [void]$key.OnKeyAreaEvent([TapBoard.KeyAreaEvent]3,7,10,10)
}
Write-Output "PASS: minimum=$minimum maximum=$MaximumMs; inclusive/exclusive boundaries, displacement, pending appearance, release cleanup, NORMAL/MODIFIER exceptions."
