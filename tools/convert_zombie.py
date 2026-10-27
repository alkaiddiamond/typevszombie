"""Read local PC Reanim data and export original animation transforms.

Format reference: https://github.com/ec50n9/pvz2godot#文件格式文档
This converter is independently implemented from the documented binary layout.
"""
from pathlib import Path
import struct
import zlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]

def parse(path):
    data = path.read_bytes()
    if data[:4] == bytes.fromhex('d4feadde'):
        expected = struct.unpack_from('<I', data, 4)[0]
        data = zlib.decompress(data[8:])
        assert len(data) == expected
    offset = 0
    def unpack(fmt):
        nonlocal offset
        values = struct.unpack_from('<' + fmt, data, offset)
        offset += struct.calcsize('<' + fmt)
        return values
    def string():
        nonlocal offset
        length, = unpack('I')
        value = data[offset:offset+length].decode('utf-8')
        offset += length
        return value
    magic, _, count, fps, _, stride = unpack('IIIfII')
    assert magic == 0xB393B4C0 and stride == 12
    counts = [unpack('III')[2] for _ in range(count)]
    tracks = []
    for frames in counts:
        name = string()
        assert unpack('I')[0] == 44
        transforms = [unpack('8f12x') for _ in range(frames)]
        elements = [(string(), string(), string()) for _ in range(frames)]
        previous = [0, 0, 0, 0, 1, 1, 0, 1]
        image = ''
        result = []
        for transform, element in zip(transforms, elements):
            previous = [old if abs(value + 10000) < .001 else value for old, value in zip(previous, transform)]
            image = element[0] or image
            result.append([round(v, 5) for v in previous] + [image])
        tracks.append({'name': name, 'frames': result})
    assert offset == len(data), (offset, len(data))
    return {'fps': fps, 'tracks': tracks}

if __name__ == '__main__':
    animation = parse(ROOT / 'assets/pvz/raw/compiled/reanim/Zombie.reanim.compiled')
    output = ROOT / 'public/game/original'
    output.mkdir(exist_ok=True)
    images = set()
    clips = {}
    for track in animation['tracks']:
        images.update(f[8] for f in track['frames'] if f[8])
        if track['name'].startswith('anim_') and not any(f[8] for f in track['frames']):
            visible = [i for i, f in enumerate(track['frames']) if f[6] >= 0]
            if visible: clips[track['name'][5:]] = [min(visible), max(visible)]
    # Alternate damaged textures and original detached parts.
    images.update('IMAGE_REANIM_' + n.upper() for n in ['Zombie_outerarm_upper2', 'Zombie_cone2', 'Zombie_cone3', 'Zombie_bucket2', 'Zombie_bucket3', 'Zombie_flagpole', 'Zombie_flag1', 'Zombie_flag3', 'Zombie_screendoor2', 'Zombie_screendoor3'])
    index = {p.stem.upper(): p for p in (ROOT / 'assets/pvz/raw/reanim').glob('*.png')}
    for image in sorted(images):
        source = index[image.removeprefix('IMAGE_REANIM_')]
        shutil.copyfile(source, output / (image + '.png'))
    flag = parse(ROOT / 'assets/pvz/raw/compiled/reanim/Zombie_FlagPole.reanim.compiled')
    flag['clips'] = {'walk': [0, len(flag['tracks'][0]['frames']) - 1]}
    (output / 'flag.json').write_text(json.dumps(flag, separators=(',', ':')), encoding='utf-8')
    animation['images'] = sorted(images)
    animation['clips'] = clips
    (output / 'zombie.json').write_text(json.dumps(animation, separators=(',', ':')), encoding='utf-8')
    (ROOT / 'src/game/zombie-assets.json').write_text(json.dumps(animation['images']), encoding='utf-8')
    for name in ['ZombieArm.png', 'ZombieHead.png']:
        shutil.copyfile(ROOT / 'assets/pvz/raw/particles' / name, output / name)
    print('Exported', len(animation['tracks']), 'tracks,', len(images), 'textures;', clips)
