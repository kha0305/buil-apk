from PIL import Image, ImageDraw, ImageFilter

SRC = "/home/hatch/workspace/user/media_library/image/image-406.png"
OUT = "/home/hatch/workspace/notes-app/src-tauri/icons"

im = Image.open(SRC).convert("RGBA")
w, h = im.size
px = im.load()

# Nen + bong do deu la xam gan trang (3 kenh gan nhau, sang > 190);
# so, but, vong lo xo dam hon nen khong bi nhan la nen.
def bg_like(r, g, b):
    return (max(r, g, b) - min(r, g, b) < 25) and min(r, g, b) > 190

mask = Image.new("L", (w, h), 0)
mp = mask.load()
for y in range(h):
    for x in range(w):
        r, g, b, _ = px[x, y]
        mp[x, y] = 0 if bg_like(r, g, b) else 255

# Lấp lỗ nhỏ (điểm sáng trên vòng lò xo) rồi lấp lỗ kín bên trong vật.
mask = mask.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
f = mask.copy()
ImageDraw.floodfill(f, (0, 0), 128, thresh=0)
solid = f.point(lambda p: 0 if p == 128 else 255)
solid = solid.filter(ImageFilter.GaussianBlur(1))

# Cắt sát vật còn lại, đặt vào giữa khung 512, chừa viền 24px.
box = solid.point(lambda p: 255 if p > 10 else 0).getbbox()
crop = im.crop(box)
alpha = solid.crop(box)
crop.putalpha(alpha)
print("object box:", box, "crop size:", crop.size)

CANVAS, PAD = 512, 24
inner = CANVAS - 2 * PAD
scale = inner / max(crop.size)
new_size = (max(1, round(crop.size[0] * scale)), max(1, round(crop.size[1] * scale)))
resized = crop.resize(new_size, Image.LANCZOS).filter(
    ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))

canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
canvas.alpha_composite(resized, ((CANVAS - new_size[0]) // 2, (CANVAS - new_size[1]) // 2))

canvas.save(f"{OUT}/icon.png")
canvas.resize((256, 256), Image.LANCZOS).save(f"{OUT}/128x128@2x.png")
canvas.resize((128, 128), Image.LANCZOS).save(f"{OUT}/128x128.png")
canvas.resize((32, 32), Image.LANCZOS).save(f"{OUT}/32x32.png")
canvas.save(f"{OUT}/icon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("done")
