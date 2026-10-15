"""Image-only capability uploads. Expire after two hours on ephemeral disk."""
import io
import json
import os
from pathlib import Path
import re
import time
import uuid
import warnings

from PIL import Image, ImageOps

ROOT = Path(os.environ.get('UPLOAD_DIR','data/uploads'))
TTL = 7200
MAX_IMAGES = 4
MAX_BYTES = 8*1024*1024
MAX_PIXELS = 20_000_000


def clean_image(raw):
    if not raw or len(raw) > MAX_BYTES:
        raise ValueError('Each image must be nonempty and at most 8 MB')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as im:
                if im.format not in ('JPEG','PNG','WEBP','GIF'):
                    raise ValueError('Upload a JPEG, PNG, WebP, or GIF image')
                if im.width*im.height > MAX_PIXELS:
                    raise ValueError('Image exceeds 20 megapixels; resize it first')
                im.seek(0)  # first frame only
                im = ImageOps.exif_transpose(im)
                im.thumbnail((1600,1600))
                if im.mode in ('RGBA','LA') or 'transparency' in im.info:
                    rgba = im.convert('RGBA')
                    background = Image.new('RGB', im.size, 'white')
                    background.paste(rgba,mask=rgba.getchannel('A'))
                    im = background
                else:
                    im = im.convert('RGB')
                out = io.BytesIO()
                im.save(out,'JPEG',quality=90)  # strips EXIF/GPS and active metadata
                return out.getvalue(), im.size
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise ValueError('Image is too large to decode safely; resize it first') from error
    except (OSError, SyntaxError) as error:
        raise ValueError('This file is not a readable image') from error


def prune():
    ROOT.mkdir(parents=True,exist_ok=True)
    for p in ROOT.iterdir():
        try:
            if p.is_file() and p.stat().st_mtime < time.time()-TTL:
                p.unlink(missing_ok=True)
        except OSError:
            pass


def save_many(files):
    if not 1 <= len(files) <= MAX_IMAGES:
        raise ValueError('Attach 1–4 images at a time')
    prune()
    if sum(p.stat().st_size for p in ROOT.glob('*.jpg')) > 128*1024*1024:
        raise ValueError('Temporary photo storage is full; retry after older uploads expire.')
    # Decode the full batch before writing any files.
    decoded = [(f.filename, *clean_image(f.stream.read(MAX_BYTES+1))) for f in files]
    results, written = [], []
    try:
        for filename, data, size in decoded:
            ident = uuid.uuid4().hex
            name = str(filename or 'photo').replace('\\','/').split('/')[-1][:120]
            image_path = ROOT / (ident+'.jpg')
            info_path = ROOT / (ident+'.json')
            image_path.write_bytes(data); written.append(image_path)
            info_path.write_text(json.dumps({'name':name,'width':size[0],'height':size[1]}),encoding='utf-8'); written.append(info_path)
            results.append({'id':ident,'name':name,'width':size[0],'height':size[1]})
        return results
    except Exception:
        for p in written:
            p.unlink(missing_ok=True)
        raise


def resolve(ident):
    if not isinstance(ident,str) or not re.fullmatch('[a-f0-9]{32}',ident):
        raise ValueError('Invalid image attachment ID')
    path = ROOT / (ident+'.jpg')
    if not path.is_file() or path.stat().st_mtime < time.time()-TTL:
        raise ValueError('An attached photo has expired or was lost when Render restarted. Attach it again.')
    return path


def read_many(refs):
    if not isinstance(refs,list) or len(refs) > MAX_IMAGES:
        raise ValueError('A message can reference at most 4 images')
    return [resolve(r.get('id') if isinstance(r,dict) else r).read_bytes() for r in refs]
