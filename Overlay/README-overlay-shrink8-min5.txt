TapBoard overlay - laser cutting drawing
Material: 0.1 mm plastic film, material type to be confirmed with laser operator.
Units: millimetres. Import at 1:1; verify outside dimensions 307 x 120 mm.
OUTER_CUT: one closed outer contour.
KEY_CUT: 79 closed cutouts, no engraving or labels.
F/J cutouts retain triangular film tabs at their lower centres.
Tab base width: 6.2 mm; inward depth: 3.1 mm.
Tabs remain attached to the lower film bridge; no separate marker pieces are cut.
Minimum cutout dimensions describe bounding rectangles, not local clearance at a tab.
Marker dimensions are design assumptions, not measurements from the reference drawing.
Keyboard cell layout: 292.5 x 107.25 mm, 19.5 mm pitch.
Cell layout starts 7.25 mm from left, 6.375 mm from top.
Visible key outlines are inset 1.3 mm on each side (pitch/15).
Additional width/height reduction: 8 mm, half on each edge.
Minimum cutout width and height: 5 mm, clamped independently at fixed centres.
Standard opening: 8.9 x 8.9 mm. Half-height opening: 8.9 x 5 mm.
Actual minimum cutout dimension: 5 mm.
Top and bottom film borders: 6.375 mm / 11.125 mm.
Spacebar cutout follows visible key only, not the extended touch hit region.
No kerf compensation has been applied. Use CAM compensation if needed.
Screen rendering rounds geometry to pixels; these are ideal physical dimensions.
Centre the film horizontally on the keyboard. The cell layout begins 6.375 mm below the film top.
To match the app, its keyboard cell layout must also start 6.375 mm below the film top.
Verify using a paper template before cutting film.
Preview labels are reference only and are not present in the DXF.
Usage: python Overlay/GenerateOverlay.py 2 --min-cutout-mm 5
Custom tabs: python Overlay/GenerateOverlay.py 2 --marker-width-mm 5 --marker-depth-mm 2.5
Alternatively: python Overlay/GenerateOverlay.py 2
Use 0 or omit the argument for original outlines. Every variant includes its reduction and minimum dimension in the filename.
