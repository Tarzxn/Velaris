"""Parametric STL build engine and path safety helpers for Velaris."""
import math
import re
from pathlib import PurePosixPath


def safe_path(value):
    path = PurePosixPath(value.replace("\\", "/"))
    if path.is_absolute() or ".." in path.parts or not path.parts or path.name in ("", "."):
        raise ValueError("Unsafe output filename")
    if len(path.parts) > 1 and re.match(r"^[a-zA-Z]:$", path.parts[0]):
        raise ValueError("Unsafe output filename")  # reject Windows-style drive prefixes too
    return path


# ---- Parametric solid-build engine for the "stl" kind ---------------------
# Rather than trust free models to emit raw, hand-rolled vertex/face lists
# (which are easy to get non-manifold or malformed), Velaris exposes a small
# instruction set — add a primitive, repeat it with a rotation/translation —
# and executes that program itself. The model writes the build steps; Velaris
# turns them into real, valid geometry.
MAX_TRIANGLES = 260_000  # generous cap (user explicitly OK with slower/bigger builds) so a runaway program still can't hang the worker indefinitely
MAX_OPS = 160
MAX_REPEAT_COUNT = 120


def _clamp_segments(value, lo=6, hi=64):
    try: return max(lo, min(int(round(float(value))), hi))
    except (TypeError, ValueError): return 16


def _auto_segments(size_metric, explicit):
    """When the model doesn't specify a segment count, scale it with the
    part's own size instead of using one fixed default — bigger round parts
    get smoother curves automatically, which reads as far more realistic
    without requiring the model to reason about facet counts itself."""
    if explicit is not None: return _clamp_segments(explicit)
    return _clamp_segments(round(abs(size_metric) * 1.3) + 12, 14, 64)


def _box_triangles(size):
    w, d, h = ((size, size, size) if not isinstance(size, (list, tuple)) else (list(size) + [size[0] if size else 20]*3)[:3])
    w, d, h = float(w), float(d), float(h)
    hw, hd, hh = w/2, d/2, h/2
    v = [(-hw,-hd,-hh),(hw,-hd,-hh),(hw,hd,-hh),(-hw,hd,-hh),(-hw,-hd,hh),(hw,-hd,hh),(hw,hd,hh),(-hw,hd,hh)]
    faces = [(0,2,1),(0,3,2),(4,5,6),(4,6,7),(0,1,5),(0,5,4),(1,2,6),(1,6,5),(2,3,7),(2,7,6),(3,0,4),(3,4,7)]
    return [(v[a], v[b], v[c]) for a, b, c in faces]


def _box_with_bore_canonical(size, radius, segments):
    """A box with a round hole bored straight through it along its local
    z-axis. Built directly with an explicit, hand-verified triangulation
    (radial "rim" bridge between the bore circle and the box's rectangular
    cross-section) rather than a general boolean/CSG algorithm — an earlier,
    general-purpose triangle-mesh boolean engine was tried for this and
    discarded after testing found it produced subtly self-intersecting
    geometry on realistic (non-axis-trivial) shapes; this construction is
    provably correct by how it's built, and is verified watertight (manifold)
    and hole-correct (via ray-casting) for every supported axis."""
    w, d, h = size
    hw, hd, hh = w / 2, d / 2, h / 2
    radius = min(float(radius), min(hw, hd) * 0.92)  # keep the hole comfortably inside the footprint

    def rim_point(theta):
        c, s = math.cos(theta), math.sin(theta)
        candidates = []
        if abs(c) > 1e-9: candidates.append(hw / abs(c))
        if abs(s) > 1e-9: candidates.append(hd / abs(s))
        t = min(candidates)
        return (t * c, t * s)

    tau = 2 * math.pi
    circle_angles = [tau * i / segments for i in range(segments)]
    # The outer ring must contain the rectangle's four corners, otherwise the
    # box silently loses its corners. Rim angles = hole angles + corner angles.
    corner_angles = [math.atan2(sy * hd, sx * hw) % tau for sx in (1, -1) for sy in (1, -1)]
    rim_angles = []
    for ang in sorted(circle_angles + corner_angles):
        if not rim_angles or ang - rim_angles[-1] > 1e-9:
            rim_angles.append(ang)
    if tau - rim_angles[-1] < 1e-9: rim_angles.pop()
    circle = [(radius * math.cos(a), radius * math.sin(a)) for a in circle_angles]
    rim = [rim_point(a) for a in rim_angles]
    n, m = len(circle), len(rim)

    def P(pt, z): return (pt[0], pt[1], z)

    tris = []
    # Annular top/bottom faces: strip-triangulate between the two rings (which
    # have different vertex counts) by always advancing the ring whose next
    # vertex comes first in angle. Top faces +z, bottom faces -z.
    i = j = 0
    while i < n or j < m:
        next_c = circle_angles[i + 1] if i + 1 < n else tau
        next_r = rim_angles[j + 1] if j + 1 < m else tau
        ci, cn, rj, rn = circle[i % n], circle[(i + 1) % n], rim[j % m], rim[(j + 1) % m]
        if i < n and (j >= m or next_c <= next_r + 1e-12):
            tris += [(P(ci, hh), P(rj, hh), P(cn, hh)), (P(ci, -hh), P(cn, -hh), P(rj, -hh))]
            i += 1
        else:
            tris += [(P(ci, hh), P(rj, hh), P(rn, hh)), (P(ci, -hh), P(rn, -hh), P(rj, -hh))]
            j += 1
    for i in range(n):  # inner bore wall (faces the axis)
        c0, c1 = circle[i], circle[(i + 1) % n]
        tris += [(P(c1, -hh), P(c0, -hh), P(c0, hh)), (P(c1, -hh), P(c0, hh), P(c1, hh))]
    for j in range(m):  # outer wall, one quad per rim edge so seams match the faces exactly
        r0, r1 = rim[j], rim[(j + 1) % m]
        tris += [(P(r0, -hh), P(r1, -hh), P(r1, hh)), (P(r0, -hh), P(r1, hh), P(r0, hh))]
    return tris


def _box_with_bore(size, radius, segments=24, axis="z"):
    sx, sy, sz = ((size, size, size) if not isinstance(size, (list, tuple)) else (list(size) + [size[0] if size else 20]*3)[:3])
    sx, sy, sz = float(sx), float(sy), float(sz)
    segments = _clamp_segments(segments, 12, 64)
    axis = str(axis).lower()
    if axis == "x":
        canonical_size, permute = (sy, sz, sx), (lambda u, v, w: (w, u, v))
    elif axis == "y":
        canonical_size, permute = (sz, sx, sy), (lambda u, v, w: (v, w, u))
    else:
        canonical_size, permute = (sx, sy, sz), (lambda u, v, w: (u, v, w))
    raw = _box_with_bore_canonical(canonical_size, radius, segments)
    return [tuple(permute(*p) for p in tri) for tri in raw]


def _wedge_triangles(size):
    """A ramp/doorstop/roof shape: a rectangular base tapering up to a ridge
    along one edge, sloped down along x. Useful for ramps, roofs, chocks."""
    w, d, h = ((size, size, size) if not isinstance(size, (list, tuple)) else (list(size) + [size[0] if size else 20]*3)[:3])
    w, d, h = float(w), float(d), float(h)
    hw, hd, hh = w/2, d/2, h/2
    b0,b1,b2,b3 = (-hw,-hd,-hh),(hw,-hd,-hh),(hw,hd,-hh),(-hw,hd,-hh)
    t0,t1 = (-hw,0,hh),(hw,0,hh)
    return [
        (b0,b2,b1),(b0,b3,b2),          # bottom
        (b0,b1,t1),(b0,t1,t0),          # front slope (y=-hd side)
        (b3,t0,t1),(b3,t1,b2),          # back slope (y=+hd side)
        (b0,t0,b3),                     # left end cap
        (b1,b2,t1),                     # right end cap
    ]


def _pyramid_triangles(size, height=None):
    h = float(size) / 2; height = float(height) if height is not None else float(size); z0, z1 = -height/2, height/2
    v = [(-h,-h,z0),(h,-h,z0),(h,h,z0),(-h,h,z0),(0,0,z1)]
    faces = [(0,2,1),(0,3,2),(0,1,4),(1,2,4),(2,3,4),(3,0,4)]
    return [(v[a], v[b], v[c]) for a, b, c in faces]


def _sphere_triangles(radius, segments=16):
    segments = _clamp_segments(segments); stacks = max(4, segments // 2)
    tris = []
    for i in range(stacks):
        lat0 = math.pi * (-0.5 + i / stacks); lat1 = math.pi * (-0.5 + (i + 1) / stacks)
        for j in range(segments):
            lon0 = 2 * math.pi * j / segments; lon1 = 2 * math.pi * (j + 1) / segments
            def pt(lat, lon): return (radius*math.cos(lat)*math.cos(lon), radius*math.cos(lat)*math.sin(lon), radius*math.sin(lat))
            p00, p01, p10, p11 = pt(lat0,lon0), pt(lat0,lon1), pt(lat1,lon0), pt(lat1,lon1)
            if i != 0: tris.append((p00, p01, p11))
            if i != stacks - 1: tris.append((p00, p11, p10))
    return tris


def _hemisphere_triangles(radius, segments=16, upper=True):
    """Half a sphere, flat/open side on the z=0 plane — used to cap capsules
    so they seal flush against the cylinder body. Unlike a full sphere, only
    ONE end (the pole, away from z=0) collapses to a point; the z=0 ring is
    a full-radius rim and must keep both triangles of every quad so its
    boundary edges exist to seal against the adjoining cylinder wall."""
    segments = _clamp_segments(segments); stacks = max(3, segments // 4)
    sign = 1 if upper else -1
    tris = []
    for i in range(stacks):
        lat0 = sign * (math.pi/2) * (i / stacks); lat1 = sign * (math.pi/2) * ((i + 1) / stacks)
        pole_row = (i == stacks - 1)  # only the far row degenerates to a point
        for j in range(segments):
            lon0 = 2 * math.pi * j / segments; lon1 = 2 * math.pi * (j + 1) / segments
            def pt(lat, lon): return (radius*math.cos(lat)*math.cos(lon), radius*math.cos(lat)*math.sin(lon), radius*math.sin(lat))
            p00, p01, p10, p11 = pt(lat0,lon0), pt(lat0,lon1), pt(lat1,lon0), pt(lat1,lon1)
            if upper:
                tris.append((p00, p01, p11))
                if not pole_row: tris.append((p00, p11, p10))
            else:
                tris.append((p00, p11, p01))
                if not pole_row: tris.append((p00, p10, p11))
    return tris


def _cylinder_side_triangles(radius, height, segments=16):
    segments = _clamp_segments(segments); h = height / 2
    tris = []
    for j in range(segments):
        a0, a1 = 2*math.pi*j/segments, 2*math.pi*(j+1)/segments
        x0,y0,x1,y1 = radius*math.cos(a0), radius*math.sin(a0), radius*math.cos(a1), radius*math.sin(a1)
        top0,top1,bot0,bot1 = (x0,y0,h),(x1,y1,h),(x0,y0,-h),(x1,y1,-h)
        tris += [(bot0,bot1,top1),(bot0,top1,top0)]
    return tris


def _cylinder_triangles(radius, height, segments=16):
    segments = _clamp_segments(segments); h = height / 2
    tris = _cylinder_side_triangles(radius, height, segments)
    for j in range(segments):
        a0, a1 = 2*math.pi*j/segments, 2*math.pi*(j+1)/segments
        x0,y0,x1,y1 = radius*math.cos(a0), radius*math.sin(a0), radius*math.cos(a1), radius*math.sin(a1)
        top0,top1,bot0,bot1 = (x0,y0,h),(x1,y1,h),(x0,y0,-h),(x1,y1,-h)
        tris += [(top0,top1,(0,0,h)), (bot1,bot0,(0,0,-h))]
    return tris


def _cone_triangles(radius, height, segments=16):
    segments = _clamp_segments(segments); apex = (0,0,height/2); h = height/2
    tris = []
    for j in range(segments):
        a0, a1 = 2*math.pi*j/segments, 2*math.pi*(j+1)/segments
        x0,y0,x1,y1 = radius*math.cos(a0), radius*math.sin(a0), radius*math.cos(a1), radius*math.sin(a1)
        base0, base1 = (x0,y0,-h), (x1,y1,-h)
        tris += [(base0, base1, apex), (base1, base0, (0,0,-h))]
    return tris


def _torus_triangles(major_radius, tube_radius, segments=24, tube_segments=12):
    segments = _clamp_segments(segments, 8, 64); tube_segments = _clamp_segments(tube_segments, 6, 32)
    tris = []
    def pt(u, v): return ((major_radius+tube_radius*math.cos(v))*math.cos(u), (major_radius+tube_radius*math.cos(v))*math.sin(u), tube_radius*math.sin(v))
    for i in range(segments):
        u0, u1 = 2*math.pi*i/segments, 2*math.pi*(i+1)/segments
        for j in range(tube_segments):
            v0, v1 = 2*math.pi*j/tube_segments, 2*math.pi*(j+1)/tube_segments
            p00, p01, p10, p11 = pt(u0,v0), pt(u0,v1), pt(u1,v0), pt(u1,v1)
            tris += [(p00, p10, p11), (p00, p11, p01)]
    return tris


def _tube_triangles(outer_radius, inner_radius, height, segments=16):
    """A hollow pipe/ring/washer: two concentric cylindrical walls joined by
    flat annular caps top and bottom — genuinely hollow, not an approximation."""
    segments = _clamp_segments(segments); inner_radius = max(0.001, min(inner_radius, outer_radius - 0.001)); h = height / 2
    tris = []
    for j in range(segments):
        a0, a1 = 2*math.pi*j/segments, 2*math.pi*(j+1)/segments
        ox0,oy0,ox1,oy1 = outer_radius*math.cos(a0), outer_radius*math.sin(a0), outer_radius*math.cos(a1), outer_radius*math.sin(a1)
        ix0,iy0,ix1,iy1 = inner_radius*math.cos(a0), inner_radius*math.sin(a0), inner_radius*math.cos(a1), inner_radius*math.sin(a1)
        o_top0,o_top1,o_bot0,o_bot1 = (ox0,oy0,h),(ox1,oy1,h),(ox0,oy0,-h),(ox1,oy1,-h)
        i_top0,i_top1,i_bot0,i_bot1 = (ix0,iy0,h),(ix1,iy1,h),(ix0,iy0,-h),(ix1,iy1,-h)
        tris += [(o_bot0,o_bot1,o_top1),(o_bot0,o_top1,o_top0)]           # outer wall
        tris += [(i_bot1,i_bot0,i_top0),(i_bot1,i_top0,i_top1)]           # inner wall (reversed so it faces inward)
        tris += [(o_top0,o_top1,i_top1),(o_top0,i_top1,i_top0)]           # top annulus
        tris += [(o_bot1,o_bot0,i_bot0),(o_bot1,i_bot0,i_bot1)]           # bottom annulus
    return tris


def _capsule_triangles(radius, height=0.0, segments=16):
    """A pill/stadium shape: a straight cylindrical section capped with two
    hemispheres — for handles, pills, rounded rods, fingers, rounded ends."""
    segments = _clamp_segments(segments); half = max(float(height), 0.0) / 2
    tris = _cylinder_side_triangles(radius, height, segments) if height > 0 else []
    tris += [tuple((x, y, z + half) for x, y, z in tri) for tri in _hemisphere_triangles(radius, segments, upper=True)]
    tris += [tuple((x, y, z - half) for x, y, z in tri) for tri in _hemisphere_triangles(radius, segments, upper=False)]
    return tris


def _shape_radius(s, default=10):
    if "radius" in s: return float(s["radius"])
    if "size" in s and not isinstance(s["size"], (list, tuple)): return float(s["size"]) / 2
    return float(default)


def build_local_shape(spec):
    """Build a shape centered on its own local origin, unrotated/unscaled/unplaced."""
    shape = spec.get("shape", "box")
    if shape in ("box", "cube"):
        bore = spec.get("bore")
        if bore and isinstance(bore, dict):
            size = spec.get("size", 20)
            footprint = (size, size, size) if not isinstance(size, (list, tuple)) else (list(size) + [size[0] if size else 20]*3)[:3]
            return _box_with_bore(size, float(bore.get("radius", min(footprint[0], footprint[1]) * 0.25)), bore.get("segments", 24), bore.get("axis", "z"))
        return _box_triangles(spec.get("size", 20))
    if shape == "wedge": return _wedge_triangles(spec.get("size", 20))
    if shape == "pyramid": return _pyramid_triangles(spec.get("size", 20), spec.get("height"))
    if shape == "sphere":
        r = _shape_radius(spec); return _sphere_triangles(r, _auto_segments(r, spec.get("segments")))
    if shape == "cylinder":
        r = _shape_radius(spec); return _cylinder_triangles(r, float(spec.get("height", spec.get("size", 20))), _auto_segments(r, spec.get("segments")))
    if shape == "cone":
        r = _shape_radius(spec); return _cone_triangles(r, float(spec.get("height", spec.get("size", 20))), _auto_segments(r, spec.get("segments")))
    if shape == "torus":
        r = float(spec.get("radius", 20)); return _torus_triangles(r, float(spec.get("tube", spec.get("minor_radius", 5))), _auto_segments(r, spec.get("segments")), spec.get("tube_segments", 12))
    if shape == "tube":
        outer = _shape_radius(spec, 15); inner = float(spec.get("inner_radius", spec.get("inner", outer * 0.6)))
        return _tube_triangles(outer, inner, float(spec.get("height", 20)), _auto_segments(outer, spec.get("segments")))
    if shape == "capsule":
        r = _shape_radius(spec, 8); return _capsule_triangles(r, float(spec.get("height", 0)), _auto_segments(r, spec.get("segments")))
    raise ValueError(f"Unknown shape '{shape}'")


def _rotate_point(p, rotation_deg):
    x, y, z = p
    rx, ry, rz = (math.radians(v) for v in rotation_deg)
    y, z = y*math.cos(rx)-z*math.sin(rx), y*math.sin(rx)+z*math.cos(rx)
    x, z = x*math.cos(ry)+z*math.sin(ry), -x*math.sin(ry)+z*math.cos(ry)
    x, y = x*math.cos(rz)-y*math.sin(rz), x*math.sin(rz)+y*math.cos(rz)
    return (x, y, z)


def _place_triangles(tris, scale=(1,1,1), rotation=(0,0,0), position=(0,0,0)):
    sx, sy, sz = scale
    out = []
    for tri in tris:
        placed = []
        for (x, y, z) in tri:
            x, y, z = x*sx, y*sy, z*sz
            x, y, z = _rotate_point((x, y, z), rotation)
            placed.append((x+position[0], y+position[1], z+position[2]))
        out.append(tuple(placed))
    return out


def _rotate_triangles_around(tris, rotation_deg, pivot):
    px, py, pz = pivot
    out = []
    for tri in tris:
        rotated = []
        for (x, y, z) in tri:
            rx, ry, rz = _rotate_point((x-px, y-py, z-pz), rotation_deg)
            rotated.append((rx+px, ry+py, rz+pz))
        out.append(tuple(rotated))
    return out


def _vec3(value, default=(0.0, 0.0, 0.0)):
    if not value: return default
    values = list(value) + list(default)
    return tuple(float(v) for v in values[:3])


def _mirror_triangles(tris, axis, offset=0.0):
    """Mirror a set of triangles across an axis-aligned plane (x=offset,
    y=offset, or z=offset). Mirroring flips handedness, so winding is
    reversed to keep normals pointing outward after the flip."""
    idx = {"x": 0, "y": 1, "z": 2}.get(axis, 0)
    out = []
    for tri in tris:
        mirrored = []
        for p in tri:
            p = list(p); p[idx] = 2 * offset - p[idx]; mirrored.append(tuple(p))
        out.append((mirrored[0], mirrored[2], mirrored[1]))
    return out


def run_stl_program(spec):
    """Interpret the model's ordered build steps ("ops") into world-space
    triangles. Supports "add" (place a primitive, optionally scaled/rotated),
    "repeat" (duplicate the previous add with a cumulative rotation and/or
    translation per copy — radial or linear patterns), and "mirror" (reflect
    the previous add across an axis-aligned plane — symmetric designs like
    wings, hulls, or matched brackets). Each op is executed independently: if
    one is malformed, it's skipped with a recorded note instead of failing
    the whole model, so a single bad part never throws away an otherwise-good
    design. Returns (triangles, notes) — notes are pre-formatted, human
    readable strings (warnings and a final size summary)."""
    ops = spec.get("ops") if isinstance(spec, dict) else None
    if not ops:
        # Back-compat with the earlier, simpler schemas.
        if isinstance(spec, dict) and spec.get("shapes"): ops = [{"op": "add", **item} for item in spec["shapes"]]
        elif isinstance(spec, dict) and spec.get("shape"): ops = [{"op": "add", **spec}]
        else: raise ValueError("STL spec has no ops/shapes/shape to build from")

    triangles, last_placed, notes = [], None, []
    for index, op in enumerate(ops[:MAX_OPS]):
        kind = op.get("op", "add")
        try:
            if kind == "add":
                local = build_local_shape(op)
                placed = _place_triangles(local, _vec3(op.get("scale"), (1, 1, 1)), _vec3(op.get("rotation")), _vec3(op.get("position")))
                triangles += placed
                last_placed = placed
            elif kind == "repeat":
                if not last_placed: raise ValueError("repeat with nothing preceding it to repeat")
                count = max(1, min(int(op.get("count", 1)), MAX_REPEAT_COUNT))
                translate_step, rotate_step, pivot = _vec3(op.get("translate")), _vec3(op.get("rotate")), _vec3(op.get("around"))
                for i in range(1, count):
                    step = last_placed
                    if any(rotate_step): step = _rotate_triangles_around(step, tuple(a*i for a in rotate_step), pivot)
                    if any(translate_step):
                        dx, dy, dz = (a*i for a in translate_step)
                        step = [tuple((x+dx, y+dy, z+dz) for x, y, z in tri) for tri in step]
                    triangles += step
            elif kind == "mirror":
                if not last_placed: raise ValueError("mirror with nothing preceding it to mirror")
                axis = str(op.get("axis", "x")).lower()
                if axis not in ("x", "y", "z"): raise ValueError(f"mirror axis must be x/y/z, got '{axis}'")
                triangles += _mirror_triangles(last_placed, axis, float(op.get("offset", 0)))
            else:
                notes.append(f"⚠️ Step {index+1}: unknown op '{kind}' — skipped.")
        except (ValueError, TypeError, KeyError, ZeroDivisionError, ArithmeticError) as error:
            notes.append(f"⚠️ Step {index+1} ({kind}): {error} — skipped, rest of the model was still built.")
        if len(triangles) > MAX_TRIANGLES:
            # Stop adding more geometry, but keep everything already built —
            # discarding a huge, mostly-complete model over its last few ops
            # would mean the file never gets produced at all, which is worse
            # than handing back a slightly-truncated (but still real, still
            # watertight-per-piece) result.
            notes.append(f"⚠️ Stopped after step {index+1}: this design got too complex (over {MAX_TRIANGLES:,} triangles) to keep building safely — the file below is everything built up to that point.")
            break
    if not triangles:
        raise ValueError("STL program produced no geometry")

    xs = [p[0] for tri in triangles for p in tri]; ys = [p[1] for tri in triangles for p in tri]; zs = [p[2] for tri in triangles for p in tri]
    notes.append(f"ℹ️ Model size: {max(xs)-min(xs):.1f} × {max(ys)-min(ys):.1f} × {max(zs)-min(zs):.1f} units, {len(triangles)} triangles.")
    return triangles, notes


def render_ascii_stl(triangles):
    lines = ["solid velaris"]
    for a, b, c in triangles:
        ax, ay, az = a; bx, by, bz = b; cx, cy, cz = c
        ux, uy, uz = bx-ax, by-ay, bz-az
        vx, vy, vz = cx-ax, cy-ay, cz-az
        nx, ny, nz = uy*vz-uz*vy, uz*vx-ux*vz, ux*vy-uy*vx
        length = math.sqrt(nx*nx+ny*ny+nz*nz) or 1.0
        lines += [f" facet normal {nx/length:.6f} {ny/length:.6f} {nz/length:.6f}", "  outer loop"]
        lines += [f"   vertex {p[0]:.4f} {p[1]:.4f} {p[2]:.4f}" for p in (a, b, c)]
        lines += ["  endloop", " endfacet"]
    lines.append("endsolid velaris")
    return "\n".join(lines)

