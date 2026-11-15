Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$a=[Reflection.Assembly]::LoadFrom((Resolve-Path 'TapBoard/TapBoard/bin/Release/TapBoard.exe'))
$t=$a.GetType('TapBoard.KeyboardLayout')
$f=[Reflection.BindingFlags]'NonPublic,Instance'
$layout=[Activator]::CreateInstance($t,$f,$null,@([int]19500,[int]307000),$null)
$keys=$t.GetField('Keys',$f).GetValue($layout)
$data=@($keys | ForEach-Object { @{label=$_.GetLabel($false);x=$_.x/1000.0;y=$_.y/1000.0;width=$_.width/1000.0;height=$_.height/1000.0} })
$data | ConvertTo-Json | Set-Content -Encoding UTF8 fabrication/keys.json
