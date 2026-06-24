import bpy, bmesh, math, random, os, sys
from mathutils import Vector, Euler

OUT = sys.argv[sys.argv.index("--") + 1]
os.makedirs(OUT, exist_ok=True)
RES = 768

# ───────────────────────── helpers ─────────────────────────
def clear_geo():
    for o in list(bpy.data.objects):
        if o.name != "VFXCAM":
            bpy.data.objects.remove(o, do_unlink=True)

EMI_SCALE = 0.42   # keep cores from clipping to white; coloured fog-glow halo carries identity

def emi_mat(name, color, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (*color, 1.0)
    e.inputs["Strength"].default_value = strength * EMI_SCALE
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(e.outputs["Emission"], o.inputs["Surface"])
    return m

def set_mat(ob, mat):
    ob.data.materials.clear(); ob.data.materials.append(mat)

def poly_curve(name, pts, bevel=0.02, cyclic=False, mat=None):
    cu = bpy.data.curves.new(name, "CURVE"); cu.dimensions = "3D"
    cu.bevel_depth = bevel; cu.fill_mode = "FULL"; cu.bevel_resolution = 2
    sp = cu.splines.new("POLY"); sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (p[0], p[1], p[2], 1.0)
    sp.use_cyclic_u = cyclic
    ob = bpy.data.objects.new(name, cu); bpy.context.collection.objects.link(ob)
    if mat: set_mat(ob, mat)
    return ob

def add_cone(v, r1, r2, depth, loc, rot=(0,0,0), mat=None):
    bpy.ops.mesh.primitive_cone_add(vertices=v, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot)
    ob = bpy.context.object
    if mat: set_mat(ob, mat)
    return ob

def add_ico(r, loc, subdiv=2, mat=None):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=r, location=loc)
    ob = bpy.context.object
    if mat: set_mat(ob, mat)
    return ob

def add_torus(maj, minr, loc=(0,0,0), mat=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=maj, minor_radius=minr, major_segments=64, minor_segments=10, location=loc)
    ob = bpy.context.object
    if mat: set_mat(ob, mat)
    return ob

def add_cube(s, loc, rot=(0,0,0), mat=None):
    bpy.ops.mesh.primitive_cube_add(size=s, location=loc, rotation=rot)
    ob = bpy.context.object
    if mat: set_mat(ob, mat)
    return ob

def jag_branch(start, ang, length, segs, jit):
    pts = [Vector((start[0], start[1], 0))]
    d = Vector((math.cos(ang), math.sin(ang), 0))
    perp = Vector((-d.y, d.x, 0))
    for i in range(1, segs + 1):
        base = Vector((start[0], start[1], 0)) + d * (length * i / segs)
        base += perp * random.uniform(-jit, jit)
        pts.append(base)
    return [(p.x, p.y, 0) for p in pts]

# ───────────────────────── element builders ─────────────────────────
def build_electric():
    random.seed(11)
    cyan = emi_mat("e_cyan", (0.45, 0.92, 1.0), 7.0)
    white = emi_mat("e_white", (0.85, 0.98, 1.0), 9.0)
    N = 56; ring = []
    for i in range(N):
        a = (i / N) * math.tau
        r = 0.62 + random.uniform(-0.05, 0.05) + (0.10 if i % 7 == 0 else 0)
        ring.append((math.cos(a) * r, math.sin(a) * r, 0))
    poly_curve("ring", ring, bevel=0.018, cyclic=True, mat=cyan)
    for k in range(5):
        a = random.uniform(0, math.tau)
        base = (math.cos(a) * 0.62, math.sin(a) * 0.62)
        poly_curve(f"branch{k}", jag_branch(base, a, random.uniform(0.18, 0.32), 4, 0.06),
                   bevel=0.012, mat=white)
    # central spark
    poly_curve("spark", jag_branch((0,0), random.uniform(0,math.tau), 0.25, 3, 0.08), bevel=0.010, mat=white)

def build_toxic():
    random.seed(22)
    grn = emi_mat("t_grn", (0.45, 1.0, 0.30), 7.0)
    dim = emi_mat("t_dim", (0.30, 0.80, 0.20), 2.2)
    # slash = thin lens in XY, sheared diagonal
    bm = bmesh.new()
    seg = 40; top = []; bot = []
    for i in range(seg + 1):
        t = i / seg; x = (t - 0.5) * 1.7
        w = math.sin(t * math.pi) ** 0.7 * 0.16
        top.append(bm.verts.new((x, w, 0))); bot.append(bm.verts.new((x, -w, 0)))
    for i in range(seg):
        bm.faces.new((top[i], top[i+1], bot[i+1], bot[i]))
    me = bpy.data.meshes.new("slash"); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new("slash", me); bpy.context.collection.objects.link(ob)
    ob.rotation_euler = Euler((0, 0, math.radians(35))); set_mat(ob, grn)
    # corrosive droplets / vapor along the slash
    for k in range(11):
        t = random.random(); x = (t - 0.5) * 1.7
        base = Vector((x, 0, 0)); base.rotate(Euler((0,0,math.radians(35))))
        off = Vector((random.uniform(-0.12,0.12), random.uniform(-0.12,0.12), 0))
        add_ico(random.uniform(0.025, 0.075), (base.x+off.x, base.y+off.y, 0), subdiv=1, mat=dim)

def build_frost():
    random.seed(33)
    ice = emi_mat("f_ice", (0.42, 0.70, 1.0), 6.0)    # clearly icy blue (distinct from white electric)
    core = emi_mat("f_core", (0.62, 0.86, 1.0), 7.5)
    # solid faceted central crystal so the burst has a bright blue hub (no empty centre)
    hub = add_ico(0.17, (0, 0, 0), subdiv=1, mat=core); hub.scale = (1.0, 1.0, 0.25)
    M = 9
    for i in range(M):
        a = (i / M) * math.tau + random.uniform(-0.1, 0.1)
        length = random.uniform(0.55, 0.85)
        # base near the hub, tip pointing outward → readable radiating shards
        mid = length * 0.5 + 0.06
        loc = (math.cos(a) * mid, math.sin(a) * mid, 0)
        sh = add_cone(4, random.uniform(0.05, 0.09), 0.0, length, loc, rot=(0, 0, 0), mat=ice)
        sh.rotation_euler = Euler((math.radians(90), 0, a))  # lay shard flat in XY, tip outward
    # a few inner sub-crystals for crystalline density
    for k in range(4):
        add_cone(4, 0.05, 0.0, 0.20, (random.uniform(-0.05,0.05), random.uniform(-0.05,0.05), 0),
                 rot=(math.radians(90), 0, random.uniform(0, math.tau)), mat=core)

def build_magnetic():
    random.seed(44)
    ring1 = emi_mat("m_r1", (0.45, 0.85, 1.0), 6.0)
    ring2 = emi_mat("m_r2", (0.80, 0.95, 1.0), 7.0)
    steel = emi_mat("m_steel", (0.72, 0.78, 0.88), 3.2)
    add_torus(0.72, 0.022, mat=ring1)
    add_torus(0.50, 0.016, mat=ring2)
    add_torus(0.30, 0.012, mat=ring1)
    # metal fragments around the outer pulse
    for i in range(10):
        a = (i / 10) * math.tau
        add_cube(random.uniform(0.05, 0.085),
                 (math.cos(a) * 0.9, math.sin(a) * 0.9, 0),
                 rot=(0, 0, random.uniform(0, math.tau)), mat=steel)
    # radial tech ticks (inner)
    for i in range(12):
        a = (i / 12) * math.tau
        c = add_cube(1.0, (math.cos(a) * 0.62, math.sin(a) * 0.62, 0), rot=(0, 0, a), mat=ring2)
        c.scale = (0.06, 0.012, 0.012)

def build_cataclysm():
    random.seed(55)
    red = emi_mat("c_red", (1.0, 0.18, 0.08), 7.0)
    pur = emi_mat("c_pur", (0.55, 0.12, 0.85), 4.0)
    ember = emi_mat("c_emb", (1.0, 0.45, 0.10), 6.0)
    # cracked ring = arc segments with gaps
    segs = 7
    for s in range(segs):
        a0 = (s / segs) * math.tau + 0.10
        a1 = a0 + (math.tau / segs) * random.uniform(0.55, 0.78)
        pts = []
        steps = 10
        for i in range(steps + 1):
            a = a0 + (a1 - a0) * i / steps
            r = 0.70 + random.uniform(-0.02, 0.02)
            pts.append((math.cos(a) * r, math.sin(a) * r, 0))
        poly_curve(f"arc{s}", pts, bevel=0.045, mat=red)
    # demonic radial spikes
    for s in range(segs):
        a = (s / segs) * math.tau + 0.10
        base = (math.cos(a) * 0.70, math.sin(a) * 0.70)
        tip = (math.cos(a) * 0.95, math.sin(a) * 0.95, 0)
        poly_curve(f"spike{s}", [(base[0], base[1], 0), tip], bevel=0.03, mat=ember)
    # inner purple void glow disc
    d = add_ico(0.34, (0, 0, -0.02), subdiv=3, mat=pur)
    d.scale = (1, 1, 0.05)
    # radial cracks inward
    for s in range(segs):
        a = (s / segs) * math.tau + 0.34
        poly_curve(f"crack{s}", [(0,0,0), (math.cos(a)*0.55, math.sin(a)*0.55, 0)], bevel=0.012, mat=ember)

def build_vector_gas():
    random.seed(66)
    gas = emi_mat("v_gas", (0.35, 0.85, 0.25), 2.4)
    dot = emi_mat("v_dot", (0.55, 1.0, 0.40), 5.0)
    grid = emi_mat("v_grid", (0.30, 0.95, 0.55), 3.2)
    # puffy low-poly cloud
    for k in range(7):
        ang = random.uniform(0, math.tau); rad = random.uniform(0.0, 0.38)
        add_ico(random.uniform(0.20, 0.34), (math.cos(ang)*rad, math.sin(ang)*rad, 0), subdiv=1, mat=gas)
    # dotted toxic particles
    for k in range(22):
        ang = random.uniform(0, math.tau); rad = random.uniform(0.2, 0.7)
        add_ico(random.uniform(0.012, 0.03), (math.cos(ang)*rad, math.sin(ang)*rad, random.uniform(-0.01,0.01)), subdiv=1, mat=dot)
    # vector-grid hints: a few triangles / line segments
    tris = [[(-0.5,-0.1),(-0.2,0.35),(0.05,-0.2)], [(0.15,0.0),(0.5,0.25),(0.45,-0.3)]]
    for ti, tri in enumerate(tris):
        pts = [(p[0], p[1], 0) for p in tri]
        poly_curve(f"vtri{ti}", pts, bevel=0.008, cyclic=True, mat=grid)

# ───────────────────────── scene / render ─────────────────────────
def setup_scene():
    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        sc.render.engine = "CYCLES"; sc.cycles.samples = 64
    if sc.render.engine == "BLENDER_EEVEE_NEXT":
        try: sc.eevee.taa_render_samples = 32
        except Exception: pass
    sc.render.resolution_x = RES; sc.render.resolution_y = RES
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.color_depth = "8"
    try: sc.view_settings.view_transform = "Standard"
    except Exception: pass
    # world black
    if sc.world is None:
        sc.world = bpy.data.worlds.new("W")
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get("Background")
    if bg: bg.inputs[0].default_value = (0,0,0,1); bg.inputs[1].default_value = 0.0
    # camera (top-down ortho)
    cam_data = bpy.data.cameras.new("VFXCAM"); cam_data.type = "ORTHO"; cam_data.ortho_scale = 2.4
    cam = bpy.data.objects.new("VFXCAM", cam_data); bpy.context.collection.objects.link(cam)
    cam.location = (0, 0, 6); cam.rotation_euler = (0, 0, 0)
    sc.camera = cam
    # Glow is applied as a numpy post-process (the 5.x node-group compositor rejects
    # the legacy RLayers/Composite/Glare graph). See add_glow().

def setup_compositor(sc):
    if hasattr(sc, "compositing_node_group"):
        ng = bpy.data.node_groups.new("VFXComp", "CompositorNodeTree")
        sc.compositing_node_group = ng
        nt = ng
    else:
        sc.use_nodes = True
        nt = sc.node_tree
    nt.nodes.clear()
    rl = nt.nodes.new("CompositorNodeRLayers")
    glare = nt.nodes.new("CompositorNodeGlare")
    for gt in ("BLOOM", "FOG_GLOW"):
        try: glare.glare_type = gt; break
        except Exception: continue
    for attr, val in (("mix", 0.0), ("threshold", 0.0), ("size", 7)):
        if hasattr(glare, attr):
            try: setattr(glare, attr, val)
            except Exception: pass
    comp = nt.nodes.new("CompositorNodeComposite")
    nt.links.new(rl.outputs["Image"], glare.inputs["Image"])
    img_src = glare.outputs["Image"]

    # Derive alpha from glow luminance so the coloured halo survives on transparent bg.
    # (MapRange is undefined in the 5.x node-group compositor — build defensively.)
    def _new(tp):
        try: return nt.nodes.new(tp)
        except Exception: return None
    alpha_socket = None
    bw = _new("CompositorNodeRGBToBW")
    if bw:
        nt.links.new(img_src, bw.inputs["Image"])
        alpha_socket = bw.outputs["Val"]
        mult = _new("CompositorNodeMath")
        if mult:
            mult.operation = "MULTIPLY"
            try: mult.use_clamp = True
            except Exception: pass
            mult.inputs[1].default_value = 2.6
            nt.links.new(alpha_socket, mult.inputs[0])
            alpha_socket = mult.outputs["Value"]
    sa = _new("CompositorNodeSetAlpha")
    if sa and alpha_socket:
        for mode in ("REPLACE_ALPHA", "REPLACE"):
            try: sa.mode = mode; break
            except Exception: pass
        nt.links.new(img_src, sa.inputs["Image"])
        nt.links.new(alpha_socket, sa.inputs["Alpha"])
        nt.links.new(sa.outputs["Image"], comp.inputs["Image"])
    else:
        nt.links.new(img_src, comp.inputs["Image"])

import numpy as np

def _box1d(a, r, axis):
    n = a.shape[axis]
    cs = np.cumsum(a, axis=axis)
    z = np.zeros_like(np.take(cs, [0], axis=axis))
    cs = np.concatenate([z, cs], axis=axis)
    hi_i = np.minimum(np.arange(n) + r + 1, n)
    lo_i = np.maximum(np.arange(n) - r, 0)
    hi = np.take(cs, hi_i, axis=axis)
    lo = np.take(cs, lo_i, axis=axis)
    shp = [1] * a.ndim; shp[axis] = n
    cnt = (hi_i - lo_i).astype(np.float32).reshape(shp)
    return (hi - lo) / cnt

def _blur(a, r, passes=2):
    for _ in range(passes):
        a = _box1d(a, r, 1); a = _box1d(a, r, 0)
    return a

def add_glow(path, radius=16, gain=3.0):
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = "Non-Color"   # round-trip stored bytes, no sRGB re-map
    W, H = img.size
    buf = np.empty(W * H * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    a = buf.reshape(H, W, 4)
    rgb, al = a[..., :3], a[..., 3:4]
    core_pm = rgb * al                              # premultiplied core colour
    glow_pm = _blur(core_pm, radius) * gain         # soft coloured halo
    glow_a  = _blur(al, radius) * gain
    out_pm = np.clip(core_pm + glow_pm, 0.0, 1.0)
    out_a  = np.clip(al + glow_a * (1.0 - al), 0.0, 1.0)
    out_rgb = np.clip(out_pm / np.maximum(out_a, 1e-4), 0.0, 1.0)
    out = np.concatenate([out_rgb, out_a], axis=-1).reshape(-1)
    res = bpy.data.images.new("glow_out", W, H, alpha=True)
    res.colorspace_settings.name = "Non-Color"
    res.pixels.foreach_set(out)
    res.filepath_raw = path; res.file_format = "PNG"; res.save()
    bpy.data.images.remove(img); bpy.data.images.remove(res)

def render(name):
    path = os.path.join(OUT, name + ".png")
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    add_glow(path)
    print(f"  rendered -> {name}.png")

ASSETS = [
    ("element_electric_arc_ring", build_electric),
    ("element_toxic_slash",       build_toxic),
    ("element_frost_shard_burst", build_frost),
    ("element_magnetic_pulse",    build_magnetic),
    ("element_cataclysm_shockwave", build_cataclysm),
    ("element_vector_gas_cloud",  build_vector_gas),
]

# fresh scene
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
setup_scene()
for name, fn in ASSETS:
    print(f"[build] {name}")
    try:
        clear_geo(); fn(); render(name)
    except Exception as ex:
        print(f"  !! FAILED {name}: {ex}")
print("ALL DONE")
