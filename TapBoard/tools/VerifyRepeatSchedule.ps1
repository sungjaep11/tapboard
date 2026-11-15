param([string]$BuildDirectory = "$PSScriptRoot\..\TapBoard\bin\Debug")
$ErrorActionPreference = 'Stop'
$assembly = [Reflection.Assembly]::LoadFrom((Join-Path (Resolve-Path $BuildDirectory).Path 'TapBoard.exe'))
$type = $assembly.GetType('TapBoard.RepeatSchedule')
$flags = [Reflection.BindingFlags]'NonPublic,Instance'
$script:time = 0.0
$clock = [Func[double]]{ $script:time }
$constructor = @($type.GetConstructors($flags) | Where-Object { $_.GetParameters().Count -eq 2 })[0]
$schedule = $constructor.Invoke(@(100,$clock))
$start = $type.GetMethod('Start',$flags)
$stop = $type.GetMethod('Stop',$flags)
$due = $type.GetMethod('IsDue',$flags)
function Check($ok,$message) { if (-not $ok) { throw $message } }
function DueAt($time) { $script:time = $time; return $due.Invoke($schedule,@()) }
Check (-not (DueAt 0)) 'Stopped schedule repeated'
[void]$start.Invoke($schedule,@())
Check (-not (DueAt 99)) 'Repeated before first interval'
Check (DueAt 107) 'Late first tick missed repeat'
Check (-not (DueAt 200)) 'Late callback caused a shortened next interval'
Check (DueAt 207) 'Minimum interval did not resume repeat'
Check (DueAt 316) 'Late third tick missed repeat'
Check (-not (DueAt 400)) 'Compensation produced a short repeat interval'
Check (DueAt 416) 'Repeat did not resume after full interval'
Check (DueAt 950) 'Long stall failed to resume'
Check (-not (DueAt 950)) 'Long stall generated burst repeats'
Check (-not (DueAt 1000)) 'Long stall caused a shortened interval'
Check (DueAt 1050) 'Long stall failed to resume at full interval'
[void]$stop.Invoke($schedule,@())
Check (-not (DueAt 2000)) 'Release/lock failed to stop repeat'
[void]$start.Invoke($schedule,@())
Check (-not (DueAt 2099)) 'Fresh press reused previous deadline'
Check (DueAt 2100) 'Fresh press failed to start repeat'
'PASS: minimum intervals, no short compensation after late callbacks, no catch-up bursts, immediate stop and fresh-press restart.'
