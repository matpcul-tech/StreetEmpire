# Converts generated art into phone-sized, tileable WebP textures and release images.
from PIL import Image, ImageFilter
import numpy as np, sys, os
A = "/cursor/stores/store-7a49390b-abf4-4d25-b8a0-a1c755eac77a/grok-bot/agents/7a3bec76-0a98-4dc6-9871-c9c674ebfe2b/assets"
tile = {'brick': 'a41f990b94523f28977d0bba52b2839b2380511d1ff6b9d162c2a77aa3a7b425', 'stucco': 'a8a487df48beb1cc861c44ef35f6b087209905e92af72b0bbc8ea75149de2372',
  'cinder': 'f128ae1318aabb27b31b130955ac0605ceff28ea53eef1a670479406624f1dbd', 'asphalt': '7e2aaeb1ee38f3874e4d365b2a7b33f95c867476039ee687b32d57e6bc5ddeb7',
  'sidewalk': 'c971ac65c7ee94b6da36d148d704b045494e2519391ab9afdbed5693fb9b06b0', 'tower': '27570105126bf42997f1160775d5b795931f436c4a6bb70f983a89d7f32791e0',
  'metal': '1e497220d820740e24a4884a3a00ae91429263a832a33f7aa608c7d6cd7e2558', 'apartment': '924d831e33f34c9e15a4a54eec3976a04d22144296748b9b95e2997efd648295'}
facade = {'liquor': 'ccd8359fb7efee6545ab5b73099644398b2fd47ec89f3bcba55b3b1ca4bd8db7', 'market': 'ddee7561beda4dfb419e3d1d78bddb70878210ac30c3c1940c579dfd070be5f6',
  'gate': '602984eb044da972fdabfe36ec0a0db23a5215ed67cd51ac335aed8e66e9004c', 'house': '28a79d69c543c2075af11916022b007249f6f6772117bcb7942f862d8457881e',
  'graffiti': '9f7c72ad6c2246cf075a525c6e1694930b2d13b3c250ff1351502520ddd8432c', 'court': '113d6bee0d56f1c9126d43b4c7c08c4697e69db483bec0200a4ead36b47572f9'}
def seamless(im):
    a = np.asarray(im).astype(np.float32); h, w = a.shape[:2]
    b = np.roll(np.roll(a, h // 2, 0), w // 2, 1)
    y = np.abs(np.linspace(-1, 1, h))[:, None]; x = np.abs(np.linspace(-1, 1, w))[None, :]
    m = np.clip(1 - np.maximum(x, y), 0, 1) ** 0.6; m = m[..., None]
    return Image.fromarray((a * m + b * (1 - m)).clip(0, 255).astype(np.uint8))
for k, f in tile.items():
    im = Image.open(f"{A}/{f}.jpg").convert('RGB')
    im = seamless(im).resize((512, 512), Image.LANCZOS)
    im.save(f"public/tex/{k}.webp", quality=72)
for k, f in facade.items():
    im = Image.open(f"{A}/{f}.jpg").convert('RGB')
    im = im.resize((512, 512) if k == 'court' else (1024, 512), Image.LANCZOS)
    im.save(f"public/tex/{k}.webp", quality=72)
# release art
key = Image.open(f"{A}/34b7c142fe8a6554c3c14fe3d95766a0ae4bdd5539378cfe4206f89b8e1d7441.jpg").convert('RGB')
title = Image.open(f"{A}/c0b1be69c76caae2149948b13cd79f9d5accc5ef565c564d5b674fbfc4773cf3.jpg").convert('RGB')
icon = Image.open(f"{A}/1706ebfd23ea853a3a5605110737aa387af94fa23a4760a1a243dff5c3ec2ec3.jpg").convert('RGB')
key.save('public/art/keyart.webp', quality=78)
title.resize((1280, 720), Image.LANCZOS).save('public/art/title.webp', quality=78)
title.resize((1200, 630), Image.LANCZOS).save('public/art/og.jpg', quality=82)
for s in (512, 192, 180, 32): icon.resize((s, s), Image.LANCZOS).save(f'public/art/icon-{s}.png', optimize=True)
os.makedirs('/workspace/screenshots', exist_ok=True)
key.save('/workspace/screenshots/v0.4-keyart-poster.png'); title.save('/workspace/screenshots/v0.4-title-screen.png'); icon.save('/workspace/screenshots/v0.4-app-icon.png')
# Night emissive masks: dark glass on towers and apartments gets random lit
# windows; bright sign and window areas on storefronts glow.
import random
random.seed(4)
def mask(name, mode, cells=(8, 8)):
    im = Image.open(f'public/tex/{name}.webp').convert('RGB'); a = np.asarray(im).astype(np.float32) / 255
    v = a.max(2); h, w = v.shape
    if mode == 'windows':
        m = (v < 0.42).astype(np.float32)
        lit = np.zeros((h, w), np.float32); cx, cy = cells
        for j in range(cy):
            for i in range(cx):
                if random.random() < 0.38: lit[j*h//cy:(j+1)*h//cy, i*w//cx:(i+1)*w//cx] = 1
        m *= lit; col = np.array([1.0, 0.72, 0.4])
    else:
        m = np.clip((v - 0.8) * 5, 0, 1); col = None
    m = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    m = np.asarray(m).astype(np.float32)[..., None] / 255
    out = (m * (col if col is not None else a)) * 255
    Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(f'public/tex/{name}_e.webp', quality=60)
mask('tower', 'windows', (10, 10)); mask('apartment', 'windows', (6, 6))
for n in ('liquor', 'market', 'house'): mask(n, 'signs')
