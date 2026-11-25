# ConvBoard

ConvBoard는 Windows 듀얼스크린 실험용 터치 키보드입니다. 아래쪽 화면에 키보드를 표시하고 현재 포커스된 앱에 Windows 키 입력을 전달합니다. 글자는 접촉 시작 시 한 번 입력합니다. Shift·Ctrl·Alt 조합, 한·영 전환, Backspace와 방향키의 길게 누르기를 지원합니다.

## Windows에서 실행

1. Windows 10/11 터치 PC에서 압축을 풀고 `ConvBoard.exe.config`와 `ConvBoard.exe`를 같은 폴더에 둡니다. 실행에는 .NET Framework 4.8 이상이 필요합니다.
2. 실험 PC의 아래 화면 표시 영역 가로 길이(mm)를 측정하고 두 키보드 앱의 `DisplayWidthMm`을 같은 값으로 설정합니다. `KeyPitchMm` 기본값은 19.5입니다. `KeyboardDisplay`가 비어 있으면 Windows 디스플레이 배치에서 하단 가장자리가 가장 낮은 화면을 사용합니다. 특정 화면은 예를 들어 `\\.\DISPLAY2`로 지정할 수 있습니다.
3. TapBoard를 종료하고 `ConvBoard.exe`를 실행합니다. 위쪽 화면에서 입력할 앱이나 입력란을 선택합니다. 키보드 오른쪽 위 전원 키로 종료합니다.
4. 실험은 같은 PC에서 동봉한 `tapboard-test.html`을 Chrome/Edge로 열고 조건 A 또는 B와 **Windows 앱**을 선택합니다. **터치 로그 연결**을 누르고 문서 폴더의 `TapBoard-Experiments/convboard-touch-*.jsonl` 중 방금 생성된 파일을 엽니다. 앱을 다시 실행하면 새 로그가 생성됩니다.
5. 실측 가로 길이를 페이지에도 입력합니다. 페이지가 네이티브 로그에서 실제 화면 가로 픽셀 수와 키 간격(px)을 읽어 홈키 접촉과 탐색 궤적을 그립니다.

## 빌드

저장소의 `ConvBoard/ConvBoard.csproj`는 TapBoard와 키 배열, 키 출력, 한글 레이블, 소리, 반복 키 처리, 터치 로그 구현을 공유합니다. Windows의 .NET SDK와 .NET Framework 4.8 참조 어셈블리가 설치된 환경에서는 `dotnet build ConvBoard/ConvBoard.csproj -c Release`로 빌드합니다. 배포 ZIP은 저장소 루트에서 `python3 ConvBoard/package.py`로 다시 만들 수 있습니다.
