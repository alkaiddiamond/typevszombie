"""Export classic power reanimations and particle definitions, retaining source curves."""
from pathlib import Path
import xml.etree.ElementTree as ET
import json,re,math
from urllib.request import urlopen
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
src=ROOT/'assets/pvz/classic';out=ROOT/'public/game/classic';out.mkdir(exist_ok=True)
base='https://home.darkok.xyz/Games/Plants%20vs%20Zombies%20Extracted/'
index={}
for folder in ['reanim','particles']:
 for name in re.findall(r'href="([^"]+)"',(src/(folder+'-index.html')).read_text()):
  if name.endswith('.png'):index[name[:-4].upper()]=(folder,name)
local={p.stem.upper():p for p in (ROOT/'assets/pvz/raw').rglob('*.png')}
textures=set();anims={}
for kind,name in [('cherry','CherryBomb'),('pepper','Jalapeno'),('ice','IceShroom'),('doom','DoomShroom'),('fire','fire'),('charred','Zombie_charred'),('charred-imp','Zombie_charred_imp')]:
 root=ET.fromstring('<root>'+ (src/(name+'.reanim')).read_text()+'</root>');tracks=[];clips={}
 for track in root.findall('track'):
  prev=[0,0,0,0,1,1,0,1,''];frames=[]
  for t in track.findall('t'):
   for i,k in enumerate(['x','y','kx','ky','sx','sy','f','a','i']):
    if t.find(k) is not None:prev[i]=t.findtext(k) if k=='i' else float(t.findtext(k))
   frames.append(prev.copy())
   if prev[8]:textures.add(prev[8])
  n=track.findtext('name');tracks.append({'name':n,'frames':frames})
  if n.startswith('anim_') and not any(f[8] for f in frames):
   v=[i for i,f in enumerate(frames) if f[6]>=0]
   if v:clips[n[5:]]=[min(v),max(v)]
 clips.setdefault('idle',next(iter(clips.values()),[0,len(tracks[0]['frames'])-1]))
 anims[kind]={'fps':float(root.findtext('fps','12')),'tracks':tracks,'clips':clips}
particles={}
for name in ['Powie','Doom','IceTrap','IceTrapZombie']:
 root=ET.fromstring('<root>'+(src/(name+'.xml')).read_text()+'</root>');emitters=[]
 for emitter in root:
  e={child.tag:child.text.strip() for child in emitter if not len(child)}
  e['fields']=[{c.tag:c.text.strip() for c in field} for field in emitter.findall('Field')]
  e['systemFields']=[{c.tag:c.text.strip() for c in field} for field in emitter.findall('SystemField')]
  if e.get('Image'):textures.add(e['Image'])
  emitters.append(e)
 particles[name]=emitters

def fetch(key):
 stem=key.removeprefix('IMAGE_REANIM_').removeprefix('IMAGE_');dest=out/(key+'.png')
 if not dest.exists():
  if stem in index:
   folder,name=index[stem];dest.write_bytes(urlopen(base+folder+'/'+name,timeout=30).read())
  elif stem in local:dest.write_bytes(local[stem].read_bytes())
  else:raise ValueError(key)
 return key
with ThreadPoolExecutor(max_workers=10) as pool:list(pool.map(fetch,sorted(textures)))
for kind,z in anims.items():
 xs=[];ys=[];a,b=z['clips']['idle']
 for t in z['tracks']:
  for f in t['frames'][a:b+1]:
   if not f[8] or f[6]<0 or f[7]<=0:continue
   w,h=Image.open(out/(f[8]+'.png')).size
   aa=f[4]*math.cos(math.radians(f[2]));bb=f[4]*math.sin(math.radians(f[2]));cc=-f[5]*math.sin(math.radians(f[3]));dd=f[5]*math.cos(math.radians(f[3]))
   for x,y in [(0,0),(w,0),(0,h),(w,h)]:xs.append(aa*x+cc*y+f[0]);ys.append(bb*x+dd*y+f[1])
 z['pose']={'center':(min(xs)+max(xs))/2,'bottom':max(ys)}
 (out/(kind+'.json')).write_text(json.dumps(z,separators=(',',':')))
 print(kind,z['clips'],z['pose'])
(out/'particles.json').write_text(json.dumps(particles,separators=(',',':')))
(ROOT/'src/game/power-assets.json').write_text(json.dumps(sorted(textures)))
