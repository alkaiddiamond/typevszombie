"""Export additional original actors for endless typing lengths."""
from convert_zombie import parse,ROOT
import json,shutil,math
from PIL import Image
out=ROOT/'public/game/original'
keys=json.loads((ROOT/'src/game/zombie-assets.json').read_text())
index={p.stem.upper():p for p in (ROOT/'assets/pvz/raw').rglob('*.png')}
hidden={'Zombie_duckytube','Zombie_whitewater','anim_gargantuar','anim_bucket','anim_screendoor'}
for kind,name,height in [('imp','Zombie_imp',115),('football','Zombie_football',175),('giant','Zombie_gargantuar',225),('peashooter','PeaShooter',90)]:
 z=parse(ROOT/f'assets/pvz/raw/compiled/reanim/{name}.reanim.compiled');clips={}
 if kind=='peashooter':
  replacements={f'IMAGE_REANIM_PEASHOOTER_{part}C':f'IMAGE_REANIM_PEASHOOTER_{part}' for part in ['HEAD','MOUTH','STALK_TOP','STALK_BOTTOM']}
  z['tracks']=[t for t in z['tracks'] if not any(f[8] and ('CACTUS' in f[8] or 'EYEBROW' in f[8]) for f in t['frames'])]
  for t in z['tracks']:
   for f in t['frames']: f[8]=replacements.get(f[8],f[8])

 for t in z['tracks']:
  if t['name'].startswith('anim_') and not any(f[8] for f in t['frames']):
   v=[i for i,f in enumerate(t['frames']) if f[6]>=0]
   if v:clips[t['name'][5:]]=[min(v),max(v)]
 if kind=='peashooter': clips['idle']=clips['full_idle'];clips['walk']=clips['full_idle'];clips['death']=clips['full_idle']
 clips.setdefault('idle',clips['walk']);z['clips']=clips
 z['hidden']=list(hidden|({'zombie_football_helmet'} if kind=='giant' else set()))
 xs=[];ys=[]
 for t in z['tracks']:
  for f in t['frames']:
   if f[8]:
    key=f[8];source=index[key.removeprefix('IMAGE_REANIM_').removeprefix('IMAGE_')]
    if key not in keys: shutil.copyfile(source,out/(key+'.png'));keys.append(key)
  if t['name'] in z['hidden']:continue
  for f in t['frames'][clips['walk'][0]:clips['walk'][1]+1]:
   if not f[8] or f[6]<0 or f[7]<=0:continue
   w,h=Image.open(out/(f[8]+'.png')).size
   a=f[4]*math.cos(math.radians(f[2]));b=f[4]*math.sin(math.radians(f[2]));c=-f[5]*math.sin(math.radians(f[3]));d=f[5]*math.cos(math.radians(f[3]))
   for x,y in [(0,0),(w,0),(0,h),(w,h)]:xs.append(a*x+c*y+f[0]);ys.append(b*x+d*y+f[1])
 z['pose']={'scale':height/(max(ys)-min(ys)),'center':(min(xs)+max(xs))/2,'bottom':max(ys)}
 (out/(kind+'.json')).write_text(json.dumps(z,separators=(',',':')))
 print(kind,z['pose'])
(ROOT/'src/game/zombie-assets.json').write_text(json.dumps(keys))
