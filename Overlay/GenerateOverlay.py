from pathlib import Path
import argparse, json, math
from PIL import Image, ImageDraw, ImageFont
parser=argparse.ArgumentParser(description="Generate a centred TapBoard laser-cutting overlay in millimetres.")
parser.add_argument('shrink', nargs='?', type=float, help='Optional width/height reduction in mm, e.g. 0, 1, 2 or 3.')
parser.add_argument('--shrink-mm', type=float, default=0,
                    help="Reduce each opening's total width and height by this many mm (default: 0).")
parser.add_argument('--min-cutout-mm', type=float, default=5,
                    help="Minimum width and height of every cutout in mm (default: 5).")
parser.add_argument('--marker-width-mm', type=float, default=10,
                    help="Width of the retained triangular F/J tabs in mm (default: 5).")
parser.add_argument('--marker-depth-mm', type=float, default=5,
                    help="Depth of the F/J tabs into their openings in mm (default: 2.5).")
args=parser.parse_args()
for name in ('marker_width_mm', 'marker_depth_mm'):
 if not math.isfinite(getattr(args,name)) or getattr(args,name) <= 0:
  parser.error('--'+name.replace('_','-')+' must be finite and positive')
if not math.isfinite(args.min_cutout_mm) or args.min_cutout_mm <= 0:
 parser.error('--min-cutout-mm must be a finite, positive number')
if args.shrink is not None and args.shrink_mm is not None:
 parser.error('Specify either a positional reduction or --shrink-mm, not both')
args.shrink_mm=args.shrink_mm if args.shrink_mm is not None else (args.shrink if args.shrink is not None else 0)
if not math.isfinite(args.shrink_mm) or args.shrink_mm < 0:
 parser.error('--shrink-mm must be a finite, nonnegative number')
# Resolve inputs beside this script, independently of the working directory.
p=Path(__file__).resolve().parent; keys=json.loads((p/'keys.json').read_text(encoding='utf-8-sig'))
w,h,base_margin=307,120,1.3     # Tapboard 프로그램의 키 아웃라인 크기 기준
# Shrink around each centre, clamping width and height independently.
# This also protects half-height arrows, function keys, and the power button.
suffix=f'-shrink{args.shrink_mm:g}-min{args.min_cutout_mm:g}'
y_offset=4      # from the top of the overlay to the top of the key area (19.5)
rects=[]
for k in keys:
 cw=max(args.min_cutout_mm,k['width']-2*base_margin-args.shrink_mm)
 ch=max(args.min_cutout_mm,k['height']-2*base_margin-args.shrink_mm)
 cx=k['x']+k['width']/2
 cy=k['y']+y_offset+k['height']/2
 rects.append((cx-cw/2,cy-ch/2,cx+cw/2,cy+ch/2))
for i,(x,y,r,b) in enumerate(rects):
 if not (0<x<r<w and 0<y<b<h):
  parser.error('Cutout exceeds film bounds; reduce --min-cutout-mm')
 for X,Y,R,B in rects[:i]:
  if min(r,R)>=max(x,X) and min(b,B)>=max(y,Y):
   parser.error('Cutouts overlap or touch; reduce --min-cutout-mm')
# F/J landmarks are retained film, connected to the lower bridge.
# One notched opening contour avoids detached islands and duplicate cut lines.
# Coordinates here use the preview convention: y increases downward.
cutouts=[]
marker_count=0
for key,(x,y,r,b) in zip(keys,rects):
 if key['label'].lower() in ('f','j'):
  if args.marker_width_mm >= r-x or args.marker_depth_mm >= b-y:
   parser.error('F/J marker must be narrower and shallower than its opening')
  cx=(x+r)/2
  half=args.marker_width_mm/2
  points=[(x,y),(r,y),(r,b),(cx+half,b),
          (cx,b-args.marker_depth_mm),(cx-half,b),(x,b)]
  marker_count+=1
 else:
  points=[(x,y),(r,y),(r,b),(x,b)]
 cutouts.append(points)
if marker_count != 2:
 parser.error('Expected exactly one F and one J key in keys.json')
# ASCII DXF R12: closed 2D polylines only; all coordinates in millimetres.
pairs=[]
def put(c,v): pairs.extend([str(c),str(v)])
put(0,'SECTION');put(2,'HEADER');put(9,'$ACADVER');put(1,'AC1009');put(9,'$MEASUREMENT');put(70,1);put(9,'$INSUNITS');put(70,4);put(0,'ENDSEC')
put(0,'SECTION');put(2,'TABLES');put(0,'TABLE');put(2,'LAYER');put(70,2)
for layer,color in [('OUTER_CUT',1),('KEY_CUT',7)]:
 put(0,'LAYER');put(2,layer);put(70,0);put(62,color);put(6,'CONTINUOUS')
put(0,'ENDTAB');put(0,'ENDSEC');put(0,'SECTION');put(2,'ENTITIES')
def contour(points,layer):
 put(0,'POLYLINE');put(8,layer);put(66,1);put(70,1);put(10,0);put(20,0);put(30,0)
 for x,y in points:
  put(0,'VERTEX');put(8,layer);put(10,f'{x:.6f}');put(20,f'{y:.6f}');put(30,0)
 put(0,'SEQEND');put(8,layer)
contour([(0,0),(w,0),(w,h),(0,h)],'OUTER_CUT')
for points in cutouts: contour([(x,h-y) for x,y in points],'KEY_CUT')
put(0,'ENDSEC');put(0,'EOF')
out=p/f'overlay-307x120{suffix}.dxf';out.write_text('\n'.join(pairs)+'\n',encoding='ascii')
assert pairs.count('POLYLINE')==len(keys)+1
scale=5; pad=35
im=Image.new('RGB',(int(w*scale)+pad*2,int(h*scale)+pad*2),'white');d=ImageDraw.Draw(im)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',13)
def box(rect): return tuple(round(v*scale+pad) for v in rect)
d.rectangle(box((0,0,w,h)),fill='#c7d6e3',outline='red',width=2)
for k,rect,points in zip(keys,rects,cutouts):
 d.polygon([(round(x*scale+pad),round(y*scale+pad)) for x,y in points],fill='white',outline='black',width=1)
 x,y,r,b=rect
 label=k['label']
 if label=='⏻': label='Power'
 if label=='한/영': label='Hangul'
 if label=='한자': label='Hanja'
 d.text(((x+r)*scale/2+pad,(y+b)*scale/2+pad),label,font=font,fill='black',anchor='mm')
d.text((pad,10),f'307 x 120 mm | pitch 19.5 mm | shrink {args.shrink_mm:g} mm | min {args.min_cutout_mm:g} mm | blue = film | white = cutouts',font=font,fill='black')
im.save(p/f'overlay-preview{suffix}.png')
(p/f'README-overlay{suffix}.txt').write_text(f'''TapBoard overlay - laser cutting drawing
Material: 0.1 mm plastic film, material type to be confirmed with laser operator.
Units: millimetres. Import at 1:1; verify outside dimensions 307 x 120 mm.
OUTER_CUT: one closed outer contour.
KEY_CUT: 79 closed cutouts, no engraving or labels.
F/J cutouts retain triangular film tabs at their lower centres.
Tab base width: {args.marker_width_mm:g} mm; inward depth: {args.marker_depth_mm:g} mm.
Tabs remain attached to the lower film bridge; no separate marker pieces are cut.
Minimum cutout dimensions describe bounding rectangles, not local clearance at a tab.
Marker dimensions are design assumptions, not measurements from the reference drawing.
Keyboard cell layout: 292.5 x 107.25 mm, 19.5 mm pitch.
Cell layout starts 7.25 mm from left, 6.375 mm from top.
Visible key outlines are inset 1.3 mm on each side (pitch/15).
Additional width/height reduction: {args.shrink_mm:g} mm, half on each edge.
Minimum cutout width and height: {args.min_cutout_mm:g} mm, clamped independently at fixed centres.
Standard opening: {max(args.min_cutout_mm,16.9-args.shrink_mm):g} x {max(args.min_cutout_mm,16.9-args.shrink_mm):g} mm. Half-height opening: {max(args.min_cutout_mm,16.9-args.shrink_mm):g} x {max(args.min_cutout_mm,7.15-args.shrink_mm):g} mm.
Actual minimum cutout dimension: {min(min(r-x,b-y) for x,y,r,b in rects):g} mm.
Top and bottom film borders: {min(y for x,y,r,b in rects):g} mm / {h-max(b for x,y,r,b in rects):g} mm.
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
''',encoding='utf-8')
print(f'Validated {len(keys)} nonoverlapping cutouts, two F/J tabs and one outer contour: {out}')

