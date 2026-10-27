# Classic power assets

The power reanimations and particle XML files in this directory were retrieved from:
https://home.darkok.xyz/Games/Plants%20vs%20Zombies%20Extracted/

Source reanimations are preserved here because the installed pvzHE versions contain hybrid plant tracks. `tools/convert_powers.py` exports the original transforms, sprite references, clip ranges, and particle curves to `public/game/classic` and generates `src/game/power-assets.json`. PNGs are fetched from the same extraction when available, with local raw PNG fallback (WhitePixel).

The runtime plays those reanimation transforms and maps the particle definitions to Phaser images. Gameplay retains this project's five lanes, typing health, six-second freeze and item effect ranges. This is a port of the source animation data, not execution of the original game's engine.
