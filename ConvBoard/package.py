"""Package the Windows GUI executable using the SDK's offline .NET Standard 2.0 contract (available in .NET Framework 4.8)."""
from pathlib import Path
import re
import subprocess
import sys
from tempfile import TemporaryDirectory
from xml.etree import ElementTree
from zipfile import ZipFile, ZIP_DEFLATED

project = Path(__file__).resolve().parent
root = project.parent
study = root / "tapboard-study"
project_xml = ElementTree.parse(project / "ConvBoard.csproj")
sources = sorted(project.glob("*.cs"))
for item in project_xml.findall(".//Compile"):
    sources.extend(project / name for name in item.attrib["Include"].split(";"))
sdk_line = subprocess.check_output(["dotnet", "--list-sdks"], text=True).splitlines()[-1]
version, directory = re.fullmatch(r"(\S+) \[(.+)\]", sdk_line).groups()
sdk = Path(directory) / version
destination = study / "dist/downloads/ConvBoard-Windows.zip"
with TemporaryDirectory() as temp:
    work = Path(temp)
    html = work / "tapboard-test.html"
    subprocess.run([sys.executable, str(study / "build-standalone.py"), str(html)], check=True)
    shortcut = work / "Open-Study.url"
    shortcut.write_bytes(b"[InternetShortcut]\r\nURL=http://127.0.0.1:47831/\r\n")
    archive = work / destination.name
    with ZipFile(archive, "w", ZIP_DEFLATED) as bundle:
        for name, defines, config in [
            ("ConvBoard", "CONVBOARD", project / "ConvBoard.exe.config"),
            ("TapBoard", "CONVBOARD,TAPBOARD_STUDY", root / "TapBoard/TapBoard/app.config"),
        ]:
            exe = work / (name + ".exe")
            subprocess.run(["dotnet", str(sdk / "Roslyn/bincore/csc.dll"), "-nologo", "-noconfig",
                            "-nostdlib+", "-target:winexe", "-platform:anycpu", "-optimize+", "-deterministic+",
                            "-define:" + defines, "-runtimeMetadataVersion:v4.0.30319", "-r:" + str(sdk / "ref/netstandard.dll"),
                            "-resource:" + str(html) + ",tapboard-test.html", "-out:" + str(exe), *map(str, sources)], check=True)
            bundle.write(exe, exe.name)
            bundle.write(config, exe.name + ".config")
        for file in [shortcut, html, project / "README.md"]:
            bundle.write(file, file.name)
    destination.write_bytes(archive.read_bytes())
print(destination)
