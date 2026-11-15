param([string]$BuildDirectory = "$PSScriptRoot\..\TapBoard\bin\Debug")
$ErrorActionPreference = 'Stop'
# Exercise raw contact behavior independently of the configurable tap debounce.
Add-Type -AssemblyName System.Configuration
[System.Configuration.ConfigurationManager]::AppSettings.Set('SameKeyMinIntervalMs', '0')
# Synthetic instantaneous contacts isolate these tests from duration filtering.
[System.Configuration.ConfigurationManager]::AppSettings.Set('TapMinDurationMs', '0')
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$build = (Resolve-Path $BuildDirectory).Path
$assembly = [Reflection.Assembly]::LoadFrom((Join-Path $build 'TapBoard.exe'))
$area = New-Object TapBoard.KeyArea
try {
    $flags = [Reflection.BindingFlags]'NonPublic,Instance'
    $controller = $area.GetType().GetField('input', $flags).GetValue($area)
    $keyField = $controller.GetType().GetField('keys', $flags)
    $distribute = $controller.GetType().GetMethod('DistributeEvent', $flags)
    $events = New-Object 'System.Collections.Generic.List[string]'
    $area.add_KeyInput({ param($sender, $eventArgs) if ($eventArgs.key) { $events.Add($eventArgs.key) } })
    function Check($condition, $message) { if (-not $condition) { throw $message } }
    function GetKey($code) { @($keyField.GetValue($controller) | Where-Object { $_.GetName() -ceq $code })[0] }
    function Touch($key, $id, $eventType) {
        $x = $key.x + [int]($key.width / 2)
        $y = $key.y + [int]($key.height / 2)
        [void]$distribute.Invoke($controller, @([TapBoard.KeyAreaEvent]$eventType, $id, $x, $y))
    }
    foreach ($pitch in @(72, 73, 144)) {
        $area.Size = New-Object Drawing.Size (17 * $pitch), (10 * $pitch)
        $area.CreateKeys($pitch)
        $keys = @($keyField.GetValue($controller))
        foreach ($key in $keys) {
            Check ($key.x -ge 0 -and $key.y -ge 0 -and $key.x + $key.width -le $area.Width -and $key.y + $key.height -le $area.Height) 'A key is outside the control'
        }
        for ($i = 0; $i -lt $keys.Count; $i++) {
            $a = New-Object Drawing.Rectangle $keys[$i].x, $keys[$i].y, $keys[$i].width, $keys[$i].height
            for ($j = $i + 1; $j -lt $keys.Count; $j++) {
                $b = New-Object Drawing.Rectangle $keys[$j].x, $keys[$j].y, $keys[$j].width, $keys[$j].height
                Check (-not $a.IntersectsWith($b)) ('Overlapping keys: ' + $keys[$i].GetLabel($false) + ', ' + $keys[$j].GetLabel($false))
            }
        }
        $numbers = '`1234567890-='
        for ($i = 1; $i -le 12; $i++) {
            $function = GetKey ('{F' + $i + '}')
            $number = GetKey ('{' + $numbers[$i] + '}')
            Check ($function.x -eq $number.x -and $function.width -eq $pitch) 'Function/number alignment differs'
            Check ($function.height -eq [int][Math]::Round($pitch / 2.0)) 'Function key is not half height'
        }
        Check ((GetKey '{BKSP}').y -eq (GetKey '{1}').y) 'Backspace is not on the number row'
        Check ((GetKey "{'}").GetLabel($false) -ceq "'") 'Quote label is reversed'
        Check ((GetKey "{'}").GetLabel($true) -ceq '"') 'Shift quote label is reversed'
        Check (@($keys | Where-Object { $_.GetName() -match 'PRTSC|PRINTSCREEN' }).Count -eq 0) 'Print Screen remains'
        $events.Clear()
        foreach ($code in @('{F10}', '{APP_EXIT}', '{LEFT}', '{UP}', '{DOWN}', '{RIGHT}', '{HANGUL}', '{HANJA}')) {
            $key = GetKey $code
            Touch $key 1 1
            if ($code -eq '{APP_EXIT}') {
                Check ($events.Contains($code)) 'Power button did not activate on touch-down'
            }
            Touch $key 1 3
            Check ($events.Contains($code)) ('Missing input: ' + $code)
        }
        $events.Clear()
        $win = @($keys | Where-Object { $_.GetLabel($false) -eq 'Win' })[0]
        Touch $win 2 1
        Touch $win 2 3
        Check ($events.Count -eq 2 -and $events[0] -eq '{WIN_DOWN}' -and $events[1] -eq '{WIN_UP}') 'Windows press/release events differ'
        $events.Clear()
        [void]$distribute.Invoke($controller, @([TapBoard.KeyAreaEvent]1, 3, $pitch, (8 * $pitch)))
        [void]$distribute.Invoke($controller, @([TapBoard.KeyAreaEvent]2, 3, (5 * $pitch), (8 * $pitch)))
        [void]$distribute.Invoke($controller, @([TapBoard.KeyAreaEvent]3, 3, (5 * $pitch), (8 * $pitch)))
        Check ($events.Count -eq 0) 'Resting-area touches generated input'
    }
    $area.Size = New-Object Drawing.Size 1224, 720
    $area.CreateKeys(72)
    # Compare by physical QWERTY rows, independently of the alphabetical lookup.
    $rows = @(
        @('qwertyuiop', 'ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔ', 'ㅃㅉㄸㄲㅆㅛㅕㅑㅒㅖ'),
        @('asdfghjkl', 'ㅁㄴㅇㄹㅎㅗㅓㅏㅣ', 'ㅁㄴㅇㄹㅎㅗㅓㅏㅣ'),
        @('zxcvbnm', 'ㅋㅌㅊㅍㅠㅜㅡ', 'ㅋㅌㅊㅍㅠㅜㅡ')
    )
    foreach ($row in $rows) {
        for ($i = 0; $i -lt $row[0].Length; $i++) {
            $letter = $row[0][$i].ToString()
            $key = GetKey ('{' + $letter + '}')
            Check ($key.GetLabel($false, $true, $false) -ceq $row[1][$i].ToString()) ('Korean label differs: ' + $letter)
            Check ($key.GetLabel($true, $true, $false) -ceq $row[2][$i].ToString()) ('Shift Korean label differs: ' + $letter)
            Check ($key.GetLabel($false, $true, $true) -ceq $row[1][$i].ToString()) 'Caps Lock changed Korean labels'
            Check ($key.GetLabel($false, $false, $true) -ceq $letter.ToUpperInvariant()) 'Caps Lock did not capitalize English'
            Check ($key.GetLabel($true, $false, $true) -ceq $letter) 'Shift+Caps Lock did not restore lowercase'
        }
    }
    Check ((GetKey '{1}').GetLabel($true, $true, $true) -ceq '!') 'IME/Caps Lock changed symbol handling'
    $events.Clear()
    $area.SetLabelState($true, $false, $false)
    Touch (GetKey '{q}') 4 1
    Touch (GetKey '{q}') 4 3
    Check ($events.Count -eq 1 -and $events[0] -ceq '{q}') 'Korean labels changed the generated key code'
    $area.SetLabelState($false, $false, $false)
    'PASS: 26 Korean labels, shifted Korean labels, Caps Lock, symbols and unchanged input codes.'
    $bitmap = New-Object Drawing.Bitmap $area.Width, $area.Height
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([Drawing.Color]::Black)
        $area.DrawKeys($graphics)
        $preview = Join-Path $build 'layout-preview.png'
        $bitmap.Save($preview, [Drawing.Imaging.ImageFormat]::Png)
        $area.SetLabelState($true, $false, $false)
        $graphics.Clear([Drawing.Color]::Black)
        $area.DrawKeys($graphics)
        $bitmap.Save((Join-Path $build 'layout-preview-korean.png'), [Drawing.Imaging.ImageFormat]::Png)
        $area.SetLabelState($true, $false, $true)
        $graphics.Clear([Drawing.Color]::Black)
        $area.DrawKeys($graphics)
        $bitmap.Save((Join-Path $build 'layout-preview-korean-shift.png'), [Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
    'PASS: layout bounds, no overlaps, function alignment, key events, Win release, and blank resting area at three pixel pitches.'
    'Preview: ' + $preview
    $inputType = $assembly.GetType('TapBoard.WindowsKeyboardOutput').GetNestedType('Input', [Reflection.BindingFlags]'NonPublic')
    $inputSize = [Runtime.InteropServices.Marshal]::SizeOf([Activator]::CreateInstance($inputType))
    Check ($inputSize -eq $(if ([IntPtr]::Size -eq 8) { 40 } else { 28 })) 'Native input structure size differs'
    'PASS: native input structure size.'
    $keyboardType = $assembly.GetType('TapBoard.WindowsKeyboardOutput')
    $buildInput = $keyboardType.GetMethod('BuildKeyInputs', [Reflection.BindingFlags]'NonPublic,Static')
    function InputSequence($code, $shift, $control, $alt, $physicalShift, $physicalControl, $physicalAlt) {
        $keyArgs = New-Object TapBoard.KeyInputEventArgs
        $keyArgs.key = $code
        $keyArgs.shift = $shift
        $keyArgs.control = $control
        $keyArgs.alt = $alt
        $inputs = $buildInput.Invoke($null, @($keyArgs.PSObject.BaseObject, $physicalShift, $physicalControl, $physicalAlt))
        ($inputs | ForEach-Object { '{0:X2}:{1}' -f $_.data.keyboard.virtualKey, $_.data.keyboard.flags }) -join ','
    }
    Check ((InputSequence '{CAPSLOCK}' $false $false $false $false $false $false) -eq '14:0,14:2') 'Caps Lock is not a single native press/release'
    Check ((InputSequence '{a}' $false $false $false $false $false $false) -eq '41:0,41:2') 'Letter input forces a character case'
    Check ((InputSequence '{a}' $true $false $false $false $false $false) -eq '10:0,41:0,41:2,10:2') 'Shift-letter events differ'
    Check ((InputSequence '{a}' $false $true $false $false $false $false) -eq '11:0,41:0,41:2,11:2') 'Ctrl shortcut events differ'
    Check ((InputSequence '{F4}' $false $false $true $false $false $false) -eq '12:0,73:0,73:2,12:2') 'Alt shortcut events differ'
    Check ((InputSequence '{a}' $true $true $true $true $true $true) -eq '41:0,41:2') 'Input releases a physically held modifier'
    Check ((InputSequence '{LEFT}' $false $false $false $false $false $false) -eq '25:1,25:3') 'Arrow input is not extended'
    foreach ($key in @($keyField.GetValue($controller))) {
        $code = $key.GetName()
        if ($code -and $code -notin @('{APP_EXIT}', '{HANGUL}', '{HANJA}')) {
            Check ((InputSequence $code $false $false $false $false $false $false).Length -gt 0) ('Unmapped key: ' + $code)
        }
    }
    'PASS: native Caps Lock, case-neutral letters, Shift/Ctrl/Alt shortcuts, physical modifier preservation, and every layout key mapping.'
} finally { $area.Dispose() }

