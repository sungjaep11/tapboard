# TapBoard+ · ConvBoard Windows 실험용 앱

두 앱은 Windows 듀얼스크린 실험용 터치 키보드입니다. 아래쪽 화면에 키보드를 표시하고 현재 포커스된 앱에 Windows 키 입력을 전달합니다. ConvBoard는 글자 키에 닿을 때 입력하고, TapBoard+는 기존 TapBoard 입력 엔진으로 짧은 탭을 판정한 뒤 손을 뗄 때 입력합니다. Shift·Ctrl·Alt 조합, 한·영 전환, Backspace와 방향키의 길게 누르기를 지원합니다.

## Windows에서 실행

1. Windows 10/11 터치 PC에서 ZIP 전체를 압축 해제하세요. 각 EXE와 같은 이름의 설정 파일을 함께 둡니다. .NET Framework 4.8 이상이 필요합니다.
2. 아래 화면 표시 영역의 실제 가로 길이(mm)를 측정하세요. 두 앱의 설정 파일에서 `DisplayWidthMm`을 측정값으로 맞추고 같은 `KeyPitchMm`을 사용합니다. 기본 키 간격은 19.5mm입니다. `KeyboardDisplay`를 비워 두면 Windows에서 가장 아래에 배치된 화면을 사용합니다.
3. A/B 조건은 `ConvBoard.exe`, C/D 조건은 `TapBoard.exe`를 실행합니다. 위 화면에서 `Open-Study.url`을 열거나 Chrome/Edge 주소창에 `http://127.0.0.1:47831/`을 입력하세요.
4. 해당 조건을 선택하고 ‘실시간 연결됨’을 확인하세요. 아래 화면 가로 길이와 키 간격을 페이지에도 입력합니다. 첫 문장이 미리보기로 표시됩니다. **로깅 시작**을 누른 뒤 화면 지시에 따라 손을 떼고, 양 검지를 F·J 위치에 올렸다가 들면 문장 입력이 시작됩니다.
5. 조건 전환은 회차를 마친 뒤 키보드 오른쪽 위 전원 키로 앱을 종료하고 다른 앱을 실행하세요. 열린 실험 탭은 새 앱에 자동 연결됩니다. 데이터를 보관할 때는 그 탭에서 **전체 데이터 JSON**을 내보내세요.

직접 연결은 같은 PC 안에서 동작하며 기본 설정에서는 JSONL이 생기지 않습니다. 기존 파일 방식을 쓰려면 해당 설정 파일의 `ExperimentConnection`을 `file`로 변경하고 앱을 다시 실행한 뒤, 동봉한 HTML의 **터치 로그 연결**을 사용하세요. HTML 파일과 직접 연결 주소의 브라우저 기록은 별도로 보관됩니다.

## 빌드

저장소의 `ConvBoard/ConvBoard.csproj`는 TapBoard와 키 배열, 키 출력, 한글 레이블, 소리, 반복 키 처리, 터치 로그 구현을 공유합니다. Windows의 .NET SDK와 .NET Framework 4.8 참조 어셈블리가 설치된 환경에서는 `dotnet build ConvBoard/ConvBoard.csproj -c Release`로 빌드합니다. 배포 ZIP은 저장소 루트에서 `python3 ConvBoard/package.py`로 다시 만들 수 있습니다.
