param([string]$BuildDirectory = "$PSScriptRoot\..\TapBoard\bin\Debug")
$ErrorActionPreference = 'Stop'
$assembly = [Reflection.Assembly]::LoadFrom((Join-Path (Resolve-Path $BuildDirectory).Path 'TapBoard.exe'))
$type = $assembly.GetType('TapBoard.RepeatSchedule')
$flags = [Reflection.BindingFlags]'NonPublic,Instance'
$script:time = 0.0
$clock = [Func[double]]{ $script:time }
$constructor = @($type.GetConstructors($flags) | Where-Object { $_.GetParameters().Count -eq 3 })[0]
$schedule = $constructor.Invoke(@(450,100,$clock))
$start = $type.GetMethod('Start',$flags)
$stop = $type.GetMethod('Stop',$flags)
$due = $type.GetMethod('IsDue',$flags)
function Check($ok,$message) { if (-not $ok) { throw $message } }
function DueAt($time) { $script:time = $time; return $due.Invoke($schedule,@()) }
Check (-not (DueAt 0)) 'Stopped schedule repeated'
[void]$start.Invoke($schedule,@())
Check (-not (DueAt 100)) 'First repeat used the subsequent repeat interval'
Check (-not (DueAt 150)) 'Brief tap produced a repeat'
[void]$stop.Invoke($schedule,@())
Check (-not (DueAt 450)) 'Released tap retained a pending repeat'
[void]$start.Invoke($schedule,@())
Check (-not (DueAt 899)) 'Repeated before initial delay'
Check (DueAt 900) 'First repeat missed the initial delay boundary'
Check (-not (DueAt 999)) 'Repeated before subsequent interval'
Check (DueAt 1000) 'Subsequent repeat used initial delay instead of interval'
Check (DueAt 1107) 'Late tick missed repeat'
Check (-not (DueAt 1200)) 'Late callback caused a shortened next interval'
Check (DueAt 1207) 'Minimum interval did not resume repeat'
Check (DueAt 1950) 'Long stall failed to resume'
Check (-not (DueAt 1950)) 'Long stall generated burst repeats'
Check (-not (DueAt 2000)) 'Long stall caused a shortened interval'
Check (DueAt 2050) 'Long stall failed to resume at full interval'
[void]$stop.Invoke($schedule,@())
Check (-not (DueAt 3000)) 'Release/lock failed to stop repeat'
[void]$start.Invoke($schedule,@())
Check (-not (DueAt 3100)) 'Fresh press reused the shorter repeat interval'
Check (-not (DueAt 3449)) 'Fresh press reused previous deadline'
Check (DueAt 3450) 'Fresh press failed to wait the full initial delay'
'PASS: 150ms taps never repeat; 450ms initial delay, independent 100ms intervals, no shortened intervals or catch-up bursts, immediate stop and fresh-press restart.'
