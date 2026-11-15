param([string]$BuildDirectory = "$PSScriptRoot\..\TapBoard\bin\Debug")
$ErrorActionPreference = 'Stop'
# Exercise raw contact behavior independently of the configurable tap debounce.
Add-Type -AssemblyName System.Configuration
[System.Configuration.ConfigurationManager]::AppSettings.Set('SameKeyMinIntervalMs', '0')
# Synthetic instantaneous contacts isolate these tests from duration filtering.
[System.Configuration.ConfigurationManager]::AppSettings.Set('TapMinDurationMs', '0')
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
[void][Reflection.Assembly]::LoadFrom((Join-Path (Resolve-Path $BuildDirectory).Path 'TapBoard.exe'))
$area = New-Object TapBoard.KeyArea
try {
    $area.Size = New-Object Drawing.Size 1500,1000
    $area.CreateKeys(74)
    [void]$area.Handle
    $flags = [Reflection.BindingFlags]'NonPublic,Instance'
    $controller = $area.GetType().GetField('input',$flags).GetValue($area)
    $keys = $controller.GetType().GetField('keys',$flags).GetValue($controller)
    $down = $area.GetType().GetMethod('OnTouchDown',$flags)
    $up = $area.GetType().GetMethod('OnTouchUp',$flags)
    $regions = New-Object 'System.Collections.Generic.List[System.Drawing.Rectangle]'
    $area.add_Invalidated({ param($sender,$e) $regions.Add($e.InvalidRect) })
    function Check($ok,$message) { if (-not $ok) { throw $message } }
    function Point($key) { New-Object Drawing.Point ($key.x+10),($key.y+10) }
    function Down($id,$point) { $regions.Clear(); [void]$down.Invoke($area,@($id,$point,$false)) }
    function Up($id,$point) { $regions.Clear(); [void]$up.Invoke($area,@($id,$point)) }
    function OnlyKey($key) {
        Check ($regions.Count -eq 1 -and $regions[0] -eq $key.VisualBounds) 'Ordinary contact invalidated more than its own key'
    }
    function WholeKeyboard {
        $expected = New-Object Drawing.Rectangle 0,0,1500,407
        Check ($regions.Contains($expected)) 'Global label/lock change did not redraw keyboard region'
        Check (-not $regions.Contains($area.ClientRectangle)) 'Blank resting area was invalidated'
    }
    $j = @($keys | Where-Object { $_.GetName() -ceq '{j}' })[0]
    Down 1 (Point $j); OnlyKey $j
    Up 1 (New-Object Drawing.Point 10,900); OnlyKey $j
    $space = @($keys | Where-Object { $_.GetName() -ceq ' ' })[0]
    $extended = New-Object Drawing.Point ($space.x+10),($space.y+$space.height+10)
    Down 2 $extended; OnlyKey $space
    Up 2 $extended; OnlyKey $space
    $blank = New-Object Drawing.Point 10,900
    Down 3 $blank; Check ($regions.Count -eq 0) 'Blank DOWN caused redraw'
    Up 3 $blank; Check ($regions.Count -eq 0) 'Blank UP caused redraw'
    foreach ($label in @('Shift','Ctrl')) {
        $key = @($keys | Where-Object { $_.GetLabel($false) -eq $label })[0]
        Down 4 (Point $key); WholeKeyboard
        Up 4 $blank; WholeKeyboard
    }
    $f = @($keys | Where-Object { $_.GetName() -ceq '{f}' })[0]
    $k = @($keys | Where-Object { $_.GetName() -ceq '{k}' })[0]
    Down 5 (Point $f)
    Down 6 (Point $j)
    Down 7 (Point $k); WholeKeyboard
    Up 5 (Point $f)
    Up 6 (Point $j)
    Up 7 (Point $k); WholeKeyboard
    $regions.Clear()
    $area.SetLabelState($true,$true,$false); WholeKeyboard
    'PASS: per-key DOWN/UP, release outside key, extended Space, no blank-touch repaint; keyboard-only Shift/Ctrl/lock/label refresh.'
} finally { $area.Dispose() }
