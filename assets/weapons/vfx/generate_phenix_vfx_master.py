"""
PHENIX: NULL EDEN -- VFX Sprite Sheet Generator
================================================
Generates 12 high-quality 2D VFX sprite sheets for cyberpunk weapons.
Run in Blender 5.1 headless mode:
  blender --background --python generate_phenix_vfx_master.py

Requires Pillow (pip install Pillow in Blender's Python).
"""

import bpy
import bmesh
import os
import sys
import shutil
import tempfile
import math
import random
from pathlib import Path
from mathutils import Vector, Euler, Matrix

# ---------------------------------------------------------------------------
# Ensure Pillow is available inside Blender's bundled Python
# ---------------------------------------------------------------------------
# Add user site-packages to path (Blender's embedded Python often misses it)
_user_site = os.path.join(os.path.expanduser('~'), 'AppData', 'Roaming', 'Python',
                          f'Python{sys.version_info.major}{sys.version_info.minor}',
                          'site-packages')
if os.path.isdir(_user_site) and _user_site not in sys.path:
    sys.path.append(_user_site)

try:
    from PIL import Image
except ImportError:
    import subprocess
    python_exe = sys.executable
    subprocess.check_call([python_exe, "-m", "ensurepip", "--upgrade"], timeout=60)
    subprocess.check_call([python_exe, "-m", "pip", "install", "Pillow", "--quiet"], timeout=120)
    if _user_site not in sys.path:
        sys.path.append(_user_site)
    from PIL import Image

# ---------------------------------------------------------------------------
# Global paths
# ---------------------------------------------------------------------------
try:
    SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
except NameError:
    # When run via exec() in Blender console, __file__ doesn't exist
    SCRIPT_DIR = r'C:\Dev\phenix_survivors_game\assets\weapons\vfx'
TEMP_BASE = os.path.join(tempfile.gettempdir(), "phenix_vfx_temp")

# ---------------------------------------------------------------------------
# Utility: Render settings
# ---------------------------------------------------------------------------
def setup_render_settings(width: int, height: int):
    """Configure Eevee with bloom, transparent background, emission-friendly."""
    scene = bpy.context.scene
    # Try EEVEE NEXT first (Blender 4.x), fall back to EEVEE (Blender 5.x)
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '16'

    # Eevee settings — handle API changes across Blender versions
    eevee = scene.eevee
    try:
        eevee.use_bloom = True
        eevee.bloom_threshold = 0.2
        eevee.bloom_intensity = 0.8
        eevee.bloom_radius = 6.5
        eevee.bloom_knee = 0.5
        eevee.bloom_color = (1, 1, 1)
        eevee.bloom_clamp = 0
    except (AttributeError, TypeError):
        # Bloom API removed in Blender 5.x EEVEE — emission materials still glow
        print("  [INFO] Bloom not available in this Blender version — skipping (emission glow still works)")
    try:
        eevee.taa_render_samples = 32
    except AttributeError:
        try:
            scene.render.sampling_render_samples = 32
        except AttributeError:
            pass
    try:
        eevee.use_volumetric_shadows = True
    except AttributeError:
        pass

    # World -- pure black, no environment
    world = bpy.data.worlds.get("World")
    if world is None:
        world = bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Color'].default_value = (0, 0, 0, 1)
    bg.inputs['Strength'].default_value = 0.0
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])


def clear_scene():
    """Remove all objects, meshes, materials, particles from the scene."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=True)
    # Purge orphan data
    for block_type in [bpy.data.meshes, bpy.data.materials, bpy.data.textures,
                       bpy.data.images, bpy.data.cameras, bpy.data.lights,
                       bpy.data.particles, bpy.data.curves, bpy.data.node_groups]:
        for block in block_type:
            block_type.remove(block)


def setup_camera_ortho(size: float = 2.0):
    """Create an orthographic camera looking down -Z."""
    bpy.ops.object.camera_add(location=(0, 0, 5))
    cam = bpy.context.object
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = size
    cam.data.clip_start = 0.1
    cam.data.clip_end = 100
    cam.rotation_euler = (0, 0, 0)
    bpy.context.scene.camera = cam
    return cam


# ---------------------------------------------------------------------------
# Utility: Materials
# ---------------------------------------------------------------------------
def hex_to_linear(hex_color: str):
    """Convert hex like '#FF6600' to linear RGB tuple."""
    h = hex_color.lstrip('#')
    r, g, b = int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0
    # sRGB to linear approximation
    def s2l(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (s2l(r), s2l(g), s2l(b))


def create_emission_material(name: str, color_hex: str, strength: float = 10.0,
                              alpha: float = 1.0):
    """Create an emission-only material with optional transparency."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    if hasattr(mat, 'blend_method'):
        try:
            mat.blend_method = 'ALPHA_BLEND'
        except TypeError:
            mat.blend_method = 'BLEND'
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new('ShaderNodeOutputMaterial')
    emit = nt.nodes.new('ShaderNodeEmission')
    lr, lg, lb = hex_to_linear(color_hex)
    emit.inputs['Color'].default_value = (lr, lg, lb, 1.0)
    emit.inputs['Strength'].default_value = strength

    if alpha < 1.0:
        transp = nt.nodes.new('ShaderNodeBsdfTransparent')
        mix = nt.nodes.new('ShaderNodeMixShader')
        mix.inputs['Fac'].default_value = alpha
        nt.links.new(transp.outputs['BSDF'], mix.inputs[1])
        nt.links.new(emit.outputs['Emission'], mix.inputs[2])
        nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    else:
        nt.links.new(emit.outputs['Emission'], out.inputs['Surface'])

    return mat


def create_gradient_emission_material(name: str, color1_hex: str, color2_hex: str,
                                       strength: float = 10.0):
    """Emission material with a gradient between two colours driven by object coords."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new('ShaderNodeOutputMaterial')
    emit = nt.nodes.new('ShaderNodeEmission')
    emit.inputs['Strength'].default_value = strength

    mix_rgb = nt.nodes.new('ShaderNodeMix')
    mix_rgb.data_type = 'RGBA'
    c1 = hex_to_linear(color1_hex)
    c2 = hex_to_linear(color2_hex)
    mix_rgb.inputs[6].default_value = (*c1, 1.0)  # A color
    mix_rgb.inputs[7].default_value = (*c2, 1.0)  # B color

    tex_coord = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tex_coord.outputs['Object'], sep.inputs['Vector'])
    nt.links.new(sep.outputs['X'], mix_rgb.inputs[0])  # Fac
    nt.links.new(mix_rgb.outputs[2], emit.inputs['Color'])
    nt.links.new(emit.outputs['Emission'], out.inputs['Surface'])

    return mat


def assign_material(obj, mat):
    """Assign a material to an object."""
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


# ---------------------------------------------------------------------------
# Utility: Keyframing helpers
# ---------------------------------------------------------------------------
def keyframe_value(obj, data_path: str, frame: int, value):
    """Set a property and keyframe it."""
    parts = data_path.rsplit('.', 1)
    if len(parts) == 2:
        target = obj.path_resolve(parts[0])
        prop = parts[1]
    else:
        target = obj
        prop = data_path
    setattr(target, prop, value)
    target.keyframe_insert(data_path=prop, frame=frame)


def keyframe_location(obj, frame: int, loc):
    obj.location = loc
    obj.keyframe_insert(data_path="location", frame=frame)


def keyframe_scale(obj, frame: int, sc):
    if isinstance(sc, (int, float)):
        obj.scale = (sc, sc, sc)
    else:
        obj.scale = sc
    obj.keyframe_insert(data_path="scale", frame=frame)


def keyframe_rotation(obj, frame: int, rot):
    obj.rotation_euler = rot
    obj.keyframe_insert(data_path="rotation_euler", frame=frame)


def keyframe_emission_strength(mat, frame: int, strength: float):
    """Keyframe the emission strength on the Emission node."""
    nt = mat.node_tree
    for node in nt.nodes:
        if node.type == 'EMISSION':
            node.inputs['Strength'].default_value = strength
            node.inputs['Strength'].keyframe_insert(data_path="default_value", frame=frame)
            return


def keyframe_alpha_fac(mat, frame: int, fac: float):
    """Keyframe the mix factor on a MixShader (controls transparency)."""
    nt = mat.node_tree
    for node in nt.nodes:
        if node.type == 'MIX_SHADER':
            node.inputs['Fac'].default_value = fac
            node.inputs['Fac'].keyframe_insert(data_path="default_value", frame=frame)
            return


# ---------------------------------------------------------------------------
# Utility: Mesh creation helpers
# ---------------------------------------------------------------------------
def create_plane(name, size=1.0, location=(0, 0, 0)):
    bpy.ops.mesh.primitive_plane_add(size=size, location=location)
    obj = bpy.context.object
    obj.name = name
    return obj


def create_circle_mesh(name, radius=1.0, vertices=32, fill='NGON', location=(0, 0, 0)):
    bpy.ops.mesh.primitive_circle_add(radius=radius, vertices=vertices,
                                       fill_type=fill, location=location)
    obj = bpy.context.object
    obj.name = name
    return obj


def create_torus(name, major_radius=1.0, minor_radius=0.1, location=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major_radius,
                                      minor_radius=minor_radius,
                                      location=location,
                                      rotation=(math.pi / 2, 0, 0))
    obj = bpy.context.object
    obj.name = name
    return obj


def create_uv_sphere(name, radius=0.5, segments=16, rings=8, location=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, segments=segments,
                                          ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    return obj


def create_ico_sphere(name, radius=0.5, subdivisions=2, location=(0, 0, 0)):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=radius, subdivisions=subdivisions,
                                           location=location)
    obj = bpy.context.object
    obj.name = name
    return obj


def create_cone(name, radius1=0.5, radius2=0.0, depth=1.0, vertices=16,
                location=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(radius1=radius1, radius2=radius2,
                                     depth=depth, vertices=vertices,
                                     location=location)
    obj = bpy.context.object
    obj.name = name
    return obj


def create_cylinder(name, radius=0.5, depth=1.0, vertices=16, location=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth,
                                         vertices=vertices, location=location)
    obj = bpy.context.object
    obj.name = name
    return obj


def create_curve_arc(name, radius=1.0, angle_start=0, angle_end=math.pi,
                     resolution=24, bevel_depth=0.05, location=(0, 0, 0)):
    """Create a bezier curve arc for slash/sweep effects."""
    curve_data = bpy.data.curves.new(name=name, type='CURVE')
    curve_data.dimensions = '3D'
    curve_data.bevel_depth = bevel_depth
    curve_data.bevel_resolution = 4
    curve_data.fill_mode = 'FULL'

    spline = curve_data.splines.new('POLY')
    spline.points.add(resolution - 1)
    for i in range(resolution):
        t = i / (resolution - 1)
        angle = angle_start + t * (angle_end - angle_start)
        x = radius * math.cos(angle)
        y = radius * math.sin(angle)
        spline.points[i].co = (x, y, 0, 1)

    obj = bpy.data.objects.new(name, curve_data)
    obj.location = location
    bpy.context.collection.objects.link(obj)
    return obj


# ---------------------------------------------------------------------------
# Utility: Rendering & compositing
# ---------------------------------------------------------------------------
def render_frames(total_frames: int, temp_dir: str, width: int, height: int):
    """Render each frame to temp_dir as frame_NNNN.png."""
    os.makedirs(temp_dir, exist_ok=True)
    setup_render_settings(width, height)
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = total_frames

    for f in range(1, total_frames + 1):
        scene.frame_set(f)
        filepath = os.path.join(temp_dir, f"frame_{f:04d}.png")
        scene.render.filepath = filepath
        bpy.ops.render.render(write_still=True)
        print(f"  Rendered frame {f}/{total_frames}")


def composite_sprite_sheet(temp_dir: str, output_path: str,
                            cols: int, rows: int,
                            frame_w: int, frame_h: int):
    """Stitch rendered frames into a single sprite sheet PNG."""
    sheet = Image.new('RGBA', (cols * frame_w, rows * frame_h), (0, 0, 0, 0))

    frame_idx = 0
    for row in range(rows):
        for col in range(cols):
            frame_idx += 1
            fpath = os.path.join(temp_dir, f"frame_{frame_idx:04d}.png")
            if os.path.exists(fpath):
                img = Image.open(fpath).convert('RGBA')
                img = img.resize((frame_w, frame_h), Image.LANCZOS)
                sheet.paste(img, (col * frame_w, row * frame_h))

    sheet.save(output_path, 'PNG')
    print(f"  Sprite sheet saved: {output_path}")


def cleanup_temp(temp_dir: str):
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)


# ===========================================================================
# WEAPON 1: Storm Saber Slash
# ===========================================================================
def generate_storm_saber_slash():
    """4x4 grid, 128px frames. Electric blue + radiation green curved slash wave
    with bone particles. Fluid arc motion."""
    print("\n=== Generating: storm_saber_slash ===")
    cols, rows, fw, fh = 4, 4, 128, 128
    total = cols * rows  # 16 frames
    temp_dir = os.path.join(TEMP_BASE, "storm_saber_slash")

    clear_scene()
    setup_camera_ortho(size=3.0)
    setup_render_settings(fw, fh)

    mat_blue = create_emission_material("slash_blue", "#00BFFF", strength=15.0)
    mat_green = create_emission_material("slash_green", "#39FF14", strength=12.0)
    mat_bone = create_emission_material("bone_particle", "#E0E0C8", strength=8.0)

    # Main slash arc -- bezier curve bevel
    slash_arc = create_curve_arc("slash_arc", radius=1.0,
                                  angle_start=-0.3, angle_end=math.pi * 0.8,
                                  resolution=32, bevel_depth=0.08)
    assign_material(slash_arc, mat_blue)

    # Secondary thinner green arc
    slash_green = create_curve_arc("slash_green_arc", radius=0.85,
                                    angle_start=-0.1, angle_end=math.pi * 0.7,
                                    resolution=24, bevel_depth=0.04)
    assign_material(slash_green, mat_green)

    # Bone particles -- small ico spheres scattered along the arc
    bone_particles = []
    for i in range(8):
        t = i / 7.0
        angle = -0.3 + t * (math.pi * 0.8 + 0.3)
        r = 1.0 + random.uniform(-0.15, 0.15)
        x = r * math.cos(angle)
        y = r * math.sin(angle)
        bp = create_ico_sphere(f"bone_{i}", radius=0.04, subdivisions=1,
                                location=(x, y, 0))
        assign_material(bp, mat_bone)
        bone_particles.append(bp)

    # Animate: slash grows, sweeps, then fades
    for f in range(1, total + 1):
        t = (f - 1) / (total - 1)  # 0..1

        # Arc scale: grow from nothing, peak at 0.4, hold, fade
        if t < 0.15:
            s = t / 0.15
        elif t < 0.7:
            s = 1.0
        else:
            s = 1.0 - (t - 0.7) / 0.3

        keyframe_scale(slash_arc, f, (s, s, s))
        keyframe_scale(slash_green, f, (s * 0.9, s * 0.9, s * 0.9))

        # Rotate the arcs for sweep motion
        rot_z = t * math.pi * 0.6 - 0.3
        keyframe_rotation(slash_arc, f, (0, 0, rot_z))
        keyframe_rotation(slash_green, f, (0, 0, rot_z + 0.1))

        # Emission strength fade
        strength_blue = 15.0 * s
        strength_green = 12.0 * s
        keyframe_emission_strength(mat_blue, f, max(strength_blue, 0.1))
        keyframe_emission_strength(mat_green, f, max(strength_green, 0.1))

        # Bone particles fly outward
        for idx, bp in enumerate(bone_particles):
            bt = min(1.0, t + idx * 0.03)
            angle = -0.3 + (idx / 7.0) * (math.pi * 0.8 + 0.3) + bt * 0.4
            dist = 1.0 + bt * 0.5
            bx = dist * math.cos(angle)
            by = dist * math.sin(angle)
            vis_scale = s * (0.5 + 0.5 * math.sin(bt * math.pi))
            keyframe_location(bp, f, (bx, by, 0))
            keyframe_scale(bp, f, vis_scale * 0.8)

    render_frames(total, temp_dir, fw, fh)
    output = os.path.join(SCRIPT_DIR, "storm_saber_slash.png")
    composite_sprite_sheet(temp_dir, output, cols, rows, fw, fh)
    cleanup_temp(temp_dir)


# ===========================================================================
# WEAPON 2: Magnetic Arc Burst
# ===========================================================================
def generate_magnetic_arc_burst():
    """4x4 grid, 128px frames. White-blue magnetic rings and electric arcs
    shooting forward."""
    print("\n=== Generating: magnetic_arc_burst ===")
    cols, rows, fw, fh = 4, 4, 128, 128
    total = cols * rows
    temp_dir = os.path.join(TEMP_BASE, "magnetic_arc_burst")

    clear_scene()
    setup_camera_ortho(size=3.5)
    setup_render_settings(fw, fh)

    mat_ring = create_emission_material("mag_ring", "#B0E0FF", strength=12.0)
    mat_arc = create_emission_material("mag_arc", "#FFFFFF", strength=18.0)
    mat_core = create_emission_material("mag_core", "#6699FF", strength=20.0)

    # Concentric magnetic rings (torus objects viewed top-down)
    rings = []
    for i in range(3):
        r = 0.4 + i * 0.35
        ring = create_torus(f"mag_ring_{i}", major_radius=r, minor_radius=0.03)
        # Torus was created with rotation pi/2 around X -- already flat for top-down
        assign_material(ring, mat_ring)
        rings.append(ring)

    # Electric arc beams -- thin stretched cones pointing forward (+Y)
    arcs = []
    for i in range(5):
        angle = (i / 5.0) * math.pi * 2
        arc = create_cylinder(f"arc_{i}", radius=0.02, depth=1.5, vertices=6,
                               location=(0.3 * math.cos(angle),
                                         0.3 * math.sin(angle), 0))
        arc.rotation_euler = (math.pi / 2, 0, angle + math.pi / 2)
        assign_material(arc, mat_arc)
        arcs.append(arc)

    # Core glow sphere
    core = create_uv_sphere("mag_core", radius=0.15, location=(0, -0.5, 0))
    assign_material(core, mat_core)

    for f in range(1, total + 1):
        t = (f - 1) / (total - 1)

        # Rings expand outward
        for idx, ring in enumerate(rings):
            phase = (t + idx * 0.15) % 1.0
            expansion = 0.5 + phase * 1.5
            keyframe_scale(ring, f, (expansion, expansion, 1.0))
            ring_alpha = 1.0 - phase
            keyframe_emission_strength(mat_ring, f, max(12.0 * ring_alpha, 0.5))
            keyframe_rotation(ring, f, (math.pi / 2, 0, t * math.pi * 2 + idx * 0.5))

        # Arcs shoot forward
        for idx, arc in enumerate(arcs):
            angle = (idx / 5.0) * math.pi * 2 + t * 0.5
            forward = t * 2.0
            ax = 0.3 * math.cos(angle)
            ay = -0.5 + forward + 0.1 * math.sin(t * math.pi * 4 + idx)
            keyframe_location(arc, f, (ax, ay, 0))
            arc_s = 0.5 + 0.5 * math.sin(t * math.pi)
            keyframe_scale(arc, f, (arc_s, 1.0, arc_s))

        # Core pulses
        core_s = 0.15 + 0.1 * math.sin(t * math.pi * 4)
        keyframe_scale(core, f, core_s)
        keyframe_emission_strength(mat_core, f, 15.0 + 10.0 * math.sin(t * math.pi * 3))
        keyframe_location(core, f, (0, -0.5 + t * 0.3, 0))

    render_frames(total, temp_dir, fw, fh)
    output = os.path.join(SCRIPT_DIR, "magnetic_arc_burst.png")
    composite_sprite_sheet(temp_dir, output, cols, rows, fw, fh)
    cleanup_temp(temp_dir)


# ===========================================================================
# WEAPON 3: Spirit Crescent Kick
# ===========================================================================
def generate_spirit_crescent_kick():
    """4x4 grid, 256x128 frames. Frost cyan translucent crescent moon aura sweep."""
    print("\n=== Generating: spirit_crescent_kick ===")
    cols, rows, fw, fh = 4, 4, 256, 128
    total = cols * rows
    temp_dir = os.path.join(TEMP_BASE, "spirit_crescent_kick")

    clear_scene()
    setup_camera_ortho(size=4.0)
    setup_render_settings(fw, fh)

    mat_cyan = create_emission_material("crescent_cyan", "#00FFFF", strength=14.0,
                                         alpha=0.7)
    mat_glow = create_emission_material("crescent_glow", "#80FFFF", strength=20.0,
                                         alpha=0.4)
    mat_trail = create_emission_material("crescent_trail", "#00CCCC", strength=8.0,
                                          alpha=0.5)

    # Crescent shape -- difference of two circles via mesh boolean
    # We'll approximate with a curved arc
    crescent = create_curve_arc("crescent_main", radius=1.2,
                                 angle_start=math.pi * 0.15,
                                 angle_end=math.pi * 0.85,
                                 resolution=32, bevel_depth=0.15)
    assign_material(crescent, mat_cyan)

    # Inner glow crescent (thinner, brighter)
    crescent_inner = create_curve_arc("crescent_inner", radius=1.0,
                                       angle_start=math.pi * 0.2,
                                       angle_end=math.pi * 0.8,
                                       resolution=24, bevel_depth=0.06)
    assign_material(crescent_inner, mat_glow)

    # Aura trail particles
    trail_parts = []
    for i in range(12):
        t_pos = i / 11.0
        angle = math.pi * 0.15 + t_pos * math.pi * 0.7
        x = 1.2 * math.cos(angle) + random.uniform(-0.1, 0.1)
        y = 1.2 * math.sin(angle) + random.uniform(-0.1, 0.1)
        tp = create_plane(f"trail_{i}", size=0.08, location=(x, y, 0))
        assign_material(tp, mat_trail)
        trail_parts.append(tp)

    for f in range(1, total + 1):
        t = (f - 1) / (total - 1)

        # Sweep motion -- crescent rotates and moves across frame
        sweep_x = -1.5 + t * 3.0
        sweep_rot = -math.pi * 0.3 + t * math.pi * 0.8

        # Scale envelope: appear, peak, fade
        if t < 0.2:
            s = t / 0.2
        elif t < 0.6:
            s = 1.0
        else:
            s = 1.0 - (t - 0.6) / 0.4

        keyframe_location(crescent, f, (sweep_x, 0, 0))
        keyframe_rotation(crescent, f, (0, 0, sweep_rot))
        keyframe_scale(crescent, f, (s, s * 0.8, s))

        keyframe_location(crescent_inner, f, (sweep_x, 0, 0))
        keyframe_rotation(crescent_inner, f, (0, 0, sweep_rot + 0.05))
        keyframe_scale(crescent_inner, f, (s * 0.9, s * 0.7, s * 0.9))

        keyframe_emission_strength(mat_cyan, f, 14.0 * s)
        keyframe_emission_strength(mat_glow, f, 20.0 * s)

        # Trail particles drift behind
        for idx, tp in enumerate(trail_parts):
            lag = max(0, t - idx * 0.02)
            tx = sweep_x - 0.3 - idx * 0.08
            ty = 0.3 * math.sin(lag * math.pi * 3 + idx)
            tp_s = s * (0.3 + 0.7 * (1.0 - idx / 11.0))
            keyframe_location(tp, f, (tx, ty, 0))
            keyframe_scale(tp, f, tp_s)

    render_frames(total, temp_dir, fw, fh)
    output = os.path.join(SCRIPT_DIR, "spirit_crescent_kick.png")
    composite_sprite_sheet(temp_dir, output, cols, rows, fw, fh)
    cleanup_temp(temp_dir)


# ===========================================================================
# WEAPON 4: Shadow Toxic Cuts
# ===========================================================================
def generate_shadow_toxic_cuts():
    """4x3 grid, 128px frames. Double diagonal X-slash with shadow purple + toxic green."""
    print("\n=== Generating: shadow_toxic_cuts ===")
    cols, rows, fw, fh = 4, 3, 128, 128
    total = cols * rows  # 12 frames
    temp_dir = os.path.join(TEMP_BASE, "shadow_toxic_cuts")

    clear_scene()
    setup_camera_ortho(size=3.0)
    setup_render_settings(fw, fh)

    mat_purple = create_emission_material("shadow_purple", "#8B00FF", strength=14.0)
    mat_green = create_emission_material("toxic_green", "#39FF14", strength=12.0)
    mat_spark = create_emission_material("cut_spark", "#FFFFFF", strength=25.0)

    # Slash 1: top-left to bottom-right (purple)
    slash1 = create_cylinder("slash_1", radius=0.03, depth=2.5, vertices=6,
                              location=(0, 0, 0))
    slash1.rotation_euler = (0, 0, math.pi / 4)
    assign_material(slash1, mat_purple)

    # Slash 2: top-right to bottom-left (green)
    slash2 = create_cylinder("slash_2", radius=0.03, depth=2.5, vertices=6,
                              location=(0, 0, 0))
    slash2.rotation_euler = (0, 0, -math.pi / 4)
    assign_material(slash2, mat_green)

    # Wider glow behind each slash
    glow1 = create_cylinder("glow_1", radius=0.1, depth=2.5, vertices=8,
                             location=(0, 0, -0.1))
    glow1.rotation_euler = (0, 0, math.pi / 4)
    mat_pg = create_emission_material("purple_glow", "#8B00FF", strength=6.0, alpha=0.4)
    assign_material(glow1, mat_pg)

    glow2 = create_cylinder("glow_2", radius=0.1, depth=2.5, vertices=8,
                             location=(0, 0, -0.1))
    glow2.rotation_euler = (0, 0, -math.pi / 4)
    mat_gg = create_emission_material("green_glow", "#39FF14", strength=6.0, alpha=0.4)
    assign_material(glow2, mat_gg)

    # Sparks at intersection
    sparks = []
    for i in range(6):
        angle = i / 6.0 * math.pi * 2
        sp = create_ico_sphere(f"spark_{i}", radius=0.03, subdivisions=1,
                                location=(0.05 * math.cos(angle),
                                          0.05 * math.sin(angle), 0))
        assign_material(sp, mat_spark)
        sparks.append(sp)

    for f in range(1, total + 1):
        t = (f - 1) / (total - 1)

        # Slash 1 appears first (0..0.5), slash 2 appears second (0.2..0.7)
        s1 = min(1.0, t / 0.4) if t < 0.4 else max(0.0, 1.0 - (t - 0.6) / 0.4)
        s2_t = max(0, t - 0.15)
        s2 = min(1.0, s2_t / 0.4) if s2_t < 0.4 else max(0.0, 1.0 - (s2_t - 0.5) / 0.4)

        # Slash scale along their length
        keyframe_scale(slash1, f, (s1, 1.0, s1))
        keyframe_scale(slash2, f, (s2, 1.0, s2))
        keyframe_scale(glow1, f, (s1 * 1.5, 1.0, s1 * 1.5))
        keyframe_scale(glow2, f, (s2 * 1.5, 1.0, s2 * 1.5))

        keyframe_emission_strength(mat_purple, f, 14.0 * s1)
        keyframe_emission_strength(mat_green, f, 12.0 * s2)

        # Sparks explode outward when both slashes cross
        cross_t = max(0, min(1, (t - 0.3) / 0.5))
        for idx, sp in enumerate(sparks):
            angle = idx / 6.0 * math.pi * 2
            dist = cross_t * 0.8
            sx = dist * math.cos(angle)
            sy = dist * math.sin(angle)
            sp_s = 0.03 * (1.0 - cross_t) if cross_t > 0 else 0.001
            keyframe_location(sp, f, (sx, sy, 0))
            keyframe_scale(sp, f, max(sp_s, 0.001))

        keyframe_emission_strength(mat_spark, f,
                                    25.0 * max(0, 1.0 - cross_t) if cross_t > 0 else 0.1)

    render_frames(total, temp_dir, fw, fh)
    output = os.path.join(SCRIPT_DIR, "shadow_toxic_cuts.png")
    composite_sprite_sheet(temp_dir, output, cols, rows, fw, fh)
    cleanup_temp(temp_dir)


# ===========================================================================
# WEAPON 5: Nexus Chakram
# ===========================================================================
def generate_nexus_chakram():
    """6x4 grid, 256px frames. Burning pulsating fire ring with flame orange + plasma pink."""
    print("\n=== Generating: nexus_chakram ===")
    cols, rows, fw, fh = 6, 4, 256, 256
    total = cols * rows  # 24 frames
    temp_dir = os.path.join(TEMP_BASE, "nexus_chakram")

    clear_scene()
    setup_camera_ortho(size=4.0)
    setup_render_settings(fw, fh)

    mat_orange = create_emission_material("flame_orange", "#FF6600", strength=16.0)
    mat_pink = create_emission_material("plasma_pink", "#FF00FF", strength=14.0)
    mat_core_fire = create_emission_material("core_fire", "#FFAA00", strength=20.0)
    mat_outer_glow = create_emission_material("outer_glow", "#FF3300", strength=8.0,
                                               alpha=0.5)

    # Main chakram ring
    ring_main = create_torus("chakram_ring", major_radius=1.0, minor_radius=0.12)
    assign_material(ring_main, mat_orange)

    # Inner plasma ring
    ring_inner = create_torus("plasma_ring", major_radius=0.7, minor_radius=0.06)
    assign_material(ring_inner, mat_pink)

    # Outer fire glow ring
    ring_outer = create_torus("fire_glow", major_radius=1.3, minor_radius=0.2)
    assign_material(ring_outer, mat_outer_glow)

    # Fire tendrils -- elongated cones radiating outward
    tendrils = []
    for i in range(8):
        angle = i / 8.0 * math.pi * 2
        x = 1.0 * math.cos(angle)
        y = 1.0 * math.sin(angle)
        tendril = create_cone(f"tendril_{i}", radius1=0.08, radius2=0.0,
                               depth=0.5, vertices=8,
                               location=(x, y, 0))
        tendril.rotation_euler = (0, 0, angle + math.pi / 2)
        assign_material(tendril, mat_core_fire)
        tendrils.append(tendril)

    # Center core
    core = create_uv_sphere("chakram_core", radius=0.25, location=(0, 0, 0))
    assign_material(core, mat_core_fire)

    for f in range(1, total + 1):
        t = (f - 1) / (total - 1)

        # Ring rotation
        rot_z = t * math.pi * 4
        keyframe_rotation(ring_main, f, (math.pi / 2, 0, rot_z))
        keyframe_rotation(ring_inner, f, (math.pi / 2, 0, -rot_z * 1.5))
        keyframe_rotation(ring_outer, f, (math.pi / 2, 0, rot_z * 0.5))

        # Pulsating scale
        pulse = 1.0 + 0.15 * math.sin(t * math.pi * 6)
        keyframe_scale(ring_main, f, pulse)
        keyframe_scale(ring_inner, f, pulse * 0.95)
        keyframe_scale(ring_outer, f, pulse * 1.1)

        # Emission pulsation
        keyframe_emission_strength(mat_orange, f, 12.0 + 8.0 * math.sin(t * math.pi * 8))
        keyframe_emission_strength(mat_pink, f, 10.0 + 8.0 * math.sin(t * math.pi * 6 + 1))

        # Tendrils flicker
        for idx, tendril in enumerate(tendrils):
            angle = idx / 8.0 * math.pi * 2 + rot_z * 0.3
            flicker = 0.3 + 0.7 * abs(math.sin(t * math.pi * 5 + idx * 0.7))
            dist = 1.0 + 0.2 * math.sin(t * math.pi * 4 + idx)
            tx = dist * math.cos(angle)
            ty = dist * math.sin(angle)
            keyframe_location(tendril, f, (tx, ty, 0))
            keyframe_rotation(tendril, f, (0, 0, angle + math.pi / 2))
            keyframe_scale(tendril, f, (flicker, flicker * 1.5, flicker))

        # Core pulsation
        core_s = 0.25 + 0.1 * math.sin(t * math.pi * 10)
        keyframe_scale(core, f, core_s)

    render_frames(total, temp_dir, fw, fh)
    output = os.path.join(SCRIPT_DIR, "nexus_chakram.png")
    composite_sprite_sheet(temp_dir, output, cols, rows, fw, fh)
    cleanup_temp(temp_dir)


# ===========================================================================
# WEAPON 6: Digital Gas Needle
# ===========================================================================
def generate_digital_gas_needle():
    """4x4 grid, 128px frames. Sharp energy needle surrounded by flowing
    toxic green gas cloud."""
    print("\n=== Generating: digital_gas_needle ===")
    cols, rows, fw, fh = 4, 4, 128, 128
    total = cols * rows
    temp_dir = os.path.join(TEMP_BASE, "digital_gas_needle")

    clear_scene()
    setup_camera_ortho(size=3.0)
    setup_render_settings(fw, fh)

    mat_needle = create_emission_material("needle_white", "#EEFFEE", strength=22.0)
    mat_gas = create_emission_material("gas_green", "#39FF14", strength=8.0, alpha=0.35)
    mat_gas_dark = create_emission_material("gas_dark", "#1A8A0A", strength=5.0, alpha=0.25)
    mat_tip = create_emission_material("needle_tip", "#AAFFAA", strength=30.0)

    # Needle body -- very elongated cone
    needle = create_cone("needle", radius1=0.06, radius2=0.0, depth=2.0,
                          vertices=6, location=(0, 0, 0))
    needle.rotation_euler = (0, 0, math.pi / 2)  # Point right
    assign_material(needle, mat_needle)

    # Needle core glow
    needle_core = create_cylinder("needle_core", radius=0.02, depth=1.8,
                                   vertices=4, location=(0, 0, 0))
    needle_core.rotation_euler = (0, 0, math.pi / 2)
    assign_material(needle_core, mat_tip)

    # Gas cloud -- multiple overlapping spheres
    gas_clouds = []
    for i in range(10):
        gx = random.uniform(-0.8, 0.2)
        gy = random.uniform(-0.5, 0.5)
        gr = random.uniform(0.15, 0.4)
        gc = create_uv_sphere(f"gas_{i}", radius=gr, segments=12, rings=6,
                               location=(gx, gy, 0))
        assign_material(gc, mat_gas if i % 2 == 0 else mat_gas_dark)
        gas_clouds.append(gc)

    for f in range(1, total + 1):
        t = (f - 1) / (total - 1)

        # Needle shoots forward
        if t < 0.3:
            nx = -1.5 + (t / 0.3) * 1.5
            ns = t / 0.3
        elif t < 0.7:
            nx = 0 + (t - 0.3) / 0.4 * 1.0
            ns = 1.0
        else:
            nx = 1.0 + (t - 0.7) / 0.3 * 0.5
            ns = 1.0 - (t - 0.7) / 0.3

        keyframe_location(needle, f, (nx, 0, 0))
        keyframe_location(needle_core, f, (nx, 0, 0))
        keyframe_scale(needle, f, (ns, ns, 1.0))
        keyframe_scale(needle_core, f, (ns, ns, 1.0))
        keyframe_emission_strength(mat_needle, f, 22.0 * ns)
        keyframe_emission_strength(mat_tip, f, 30.0 * ns)

        # Gas clouds swirl and drift
        for idx, gc in enumerate(gas_clouds):
            phase = t * math.pi * 2 + idx * 0.6
            base_x = -0.3 + 0.5 * math.sin(phase * 0.7)
            base_y = 0.4 * math.sin(phase + idx)
            drift = t * 0.3
            gas_s = 0.8 + 0.4 * math.sin(phase * 1.3)
            keyframe_location(gc, f, (base_x + drift, base_y, 0))
            keyframe_scale(gc, f, gas_s)

        keyframe_emission_strength(mat_gas, f,
                                    6.0 + 4.0 * math.sin(t * math.pi * 5))

    render_frames(total, temp_dir, fw, fh)
    output = os.path.join(SCRIPT_DIR, "digital_gas_needle.png")
    composite_sprite_sheet(temp_dir, output, cols, rows, fw, fh)
    cleanup_temp(temp_dir)


# ===========================================================================
# WEAPON 7: Demonic Cataclysm Pulse
# ===========================================================================
def generate_demonic_cataclysm_pulse():
    """6x4 grid, 256px frames. Destructive red + black lava shock wave
    with demonic ground sigils."""
    print("\n=== Generating: demonic_cataclysm_pulse ===")
    cols, rows, fw, fh = 6, 4, 256, 256
    total = cols * rows  # 24
    temp_dir = os.path.join(TEMP_BASE, "demonic_cataclysm_pulse")

    clear_scene()
    setup_camera_ortho(size=5.0)
    setup_render_settings(fw, fh)

    mat_red = create_emission_material("demonic_red", "#FF0000", strength=18.0)
    mat_lava = create_emission_material("lava_black", "#331100", strength=6.0)
    mat_sigil = create_emission_material("sigil_glow", "#FF3300", strength=12.0, alpha=0.8)
    mat_shock = create_emission_material("shock_wave", "#FF4400", strength=15.0, alpha=0.6)
    mat_core_dark = create_emission_material("core_dark", "#220000", strength=3.0)

    # Central demonic core
    core = create_uv_sphere("demon_core", radius=0.3, segments=16, rings=8,
                             location=(0, 0, 0))
    assign_material(core, mat_red)

    # Dark lava base
    lava_base = create_circle_mesh("lava_base", radius=0.8, vertices=32,
                                    fill='NGON', location=(0, 0, -0.05))
    assign_material(lava_base, mat_lava)

    # Shock wave rings
    shock_rings = []
    for i in range(3):
        sr = create_torus(f"shock_{i}", major_radius=0.5 + i * 0.3,
                           minor_radius=0.04)
        assign_material(sr, mat_shock)
        shock_rings.append(sr)

    # Sigil elements -- geometric shapes on the ground
    sigils = []
    for i in range(5):
        angle = i / 5.0 * math.pi * 2
        # Pentagram-like arrangement
        sx = 1.2 * math.cos(angle)
        sy = 1.2 * math.sin(angle)
        sigil = create_plane(f"sigil_{i}", size=0.3, location=(sx, sy, -0.02))
        sigil.rotation_euler = (0, 0, angle)
        assign_material(sigil, mat_sigil)
        sigils.append(sigil)

        # Connecting lines between sigils
        if i > 0:
            prev_angle = (i - 1) / 5.0 * math.pi * 2
            mid_x = 0.6 * math.cos((angle + prev_angle) / 2)
            mid_y = 0.6 * math.sin((angle + prev_angle) / 2)
            line = create_cylinder(f"sigil_line_{i}", radius=0.01, depth=1.0,
                                    vertices=4, location=(mid_x, mid_y, -0.02))
            line.rotation_euler = (0, 0, (angle + prev_angle) / 2)
            assign_material(line, mat_sigil)
            sigils.append(line)

    # Lava debris chunks
    debris = []
    for i in range(8):
        angle = i / 8.0 * math.pi * 2
        d = create_ico_sphere(f"debris_{i}", radius=0.08, subdivisions=1,
                               location=(0, 0, 0))
        assign_material(d, mat_red)
        debris.append(d)

    for f in range(1, total + 1):
        t = (f - 1) / (total - 1)

        # Phase: charge (0-0.3), explode (0.3-0.5), shockwave (0.5-0.8), fade (0.8-1)
        if t < 0.3:
            phase = "charge"
            pt = t / 0.3
        elif t < 0.5:
            phase = "explode"
            pt = (t - 0.3) / 0.2
        elif t < 0.8:
            phase = "shock"
            pt = (t - 0.5) / 0.3
        else:
            phase = "fade"
            pt = (t - 0.8) / 0.2

        # Core behavior
        if phase == "charge":
            core_s = 0.3 + 0.2 * pt + 0.05 * math.sin(pt * math.pi * 6)
            core_emit = 10.0 + 15.0 * pt
        elif phase == "explode":
            core_s = 0.5 + pt * 0.8
            core_emit = 25.0 - 10.0 * pt
        elif phase == "shock":
            core_s = 1.3 - pt * 0.8
            core_emit = 15.0 * (1.0 - pt)
        else:
            core_s = 0.5 * (1.0 - pt)
            core_emit = 5.0 * (1.0 - pt)

        keyframe_scale(core, f, max(core_s, 0.01))
        keyframe_emission_strength(mat_red, f, max(core_emit, 0.1))

        # Lava base grows
        lava_s = 0.5 + t * 2.0
        keyframe_scale(lava_base, f, (lava_s, lava_s, 1.0))
        keyframe_emission_strength(mat_lava, f, 3.0 + 5.0 * t)

        # Shock waves expand outward after explosion
        for idx, sr in enumerate(shock_rings):
            delay = 0.3 + idx * 0.1
            if t > delay:
                sw_t = min(1.0, (t - delay) / 0.4)
                sw_scale = 1.0 + sw_t * 3.0
                sw_alpha = 1.0 - sw_t
            else:
                sw_scale = 0.01
                sw_alpha = 0.0
            keyframe_scale(sr, f, (sw_scale, sw_scale, 1.0))
            keyframe_rotation(sr, f, (math.pi / 2, 0, t * math.pi + idx))
            keyframe_emission_strength(mat_shock, f,
                                        max(15.0 * sw_alpha, 0.1))

        # Sigils glow during charge, flash on explode
        if phase == "charge":
            sigil_emit = 5.0 + 10.0 * pt * abs(math.sin(pt * math.pi * 4))
        elif phase == "explode":
            sigil_emit = 15.0
        else:
            sigil_emit = max(3.0 * (1.0 - t), 0.1)
        keyframe_emission_strength(mat_sigil, f, sigil_emit)

        # Debris flies outward after explosion
        for idx, d in enumerate(debris):
            angle = idx / 8.0 * math.pi * 2
            if t > 0.35:
                d_t = min(1.0, (t - 0.35) / 0.5)
                dist = d_t * 2.5
                dz = d_t * 0.5 * math.sin(d_t * math.pi)
                d_s = 0.08 * (1.0 - d_t * 0.7)
            else:
                dist = 0
                dz = 0
                d_s = 0.01
            keyframe_location(d, f, (dist * math.cos(angle),
                                      dist * math.sin(angle), dz))
            keyframe_scale(d, f, max(d_s, 0.001))

    render_frames(total, temp_dir, fw, fh)
    output = os.path.join(SCRIPT_DIR, "demonic_cataclysm_pulse.png")
    composite_sprite_sheet(temp_dir, output, cols, rows, fw, fh)
    cleanup_temp(temp_dir)


# ===========================================================================
# WEAPON 8: Glitch Singularity Tear
# ===========================================================================
def generate_glitch_singularity_tear():
    """5x4 grid, 256px frames. Black hole vortex with violent RGB splits
    and digital distortions."""
    print("\n=== Generating: glitch_singularity_tear ===")
    cols, rows, fw, fh = 5, 4, 256, 256
    total = cols * rows  # 20
    temp_dir = os.path.join(TEMP_BASE, "glitch_singularity_tear")

    clear_scene()
    setup_camera_ortho(size=4.5)
    setup_render_settings(fw, fh)

    mat_black = create_emission_material("void_black", "#0A0010", strength=2.0)
    mat_red_glitch = create_emission_material("glitch_r", "#FF0000", strength=16.0,
                                               alpha=0.7)
    mat_green_glitch = create_emission_material("glitch_g", "#00FF00", strength=16.0,
                                                 alpha=0.7)
    mat_blue_glitch = create_emission_material("glitch_b", "#0000FF", strength=16.0,
                                                alpha=0.7)
    mat_white_edge = create_emission_material("edge_white", "#FFFFFF", strength=25.0)
    mat_purple_swirl = create_emission_material("swirl_purple", "#6600CC", strength=10.0,
                                                 alpha=0.6)

    # Central black hole
    hole = create_uv_sphere("black_hole", radius=0.4, segments=24, rings=12,
                             location=(0, 0, 0))
    assign_material(hole, mat_black)

    # Event horizon ring
    horizon = create_torus("event_horizon", major_radius=0.6, minor_radius=0.03)
    assign_material(horizon, mat_white_edge)

    # RGB split planes (horizontal glitch bars)
    rgb_bars = []
    colors = [mat_red_glitch, mat_green_glitch, mat_blue_glitch]
    for ci, mat in enumerate(colors):
        for i in range(3):
            bar = create_plane(f"glitch_{['r','g','b'][ci]}_{i}",
                               size=0.3, location=(0, 0, 0))
            bar.scale = (1.5, 0.05, 1.0)
            assign_material(bar, mat)
            rgb_bars.append((bar, ci))

    # Spiral distortion arms
    spiral_arms = []
    for i in range(4):
        arm = create_curve_arc(f"spiral_{i}", radius=1.0,
                                angle_start=i * math.pi / 2,
                                angle_end=i * math.pi / 2 + math.pi * 0.6,
                                resolution=16, bevel_depth=0.03)
        assign_material(arm, mat_purple_swirl)
        spiral_arms.append(arm)

    # Digital fragment shards
    shards = []
    for i in range(6):
        shard = create_plane(f"shard_{i}", size=0.15)
        shard.rotation_euler = (0, 0, random.uniform(0, math.pi))
        assign_material(shard, mat_white_edge)
        shards.append(shard)

    for f in range(1, total + 1):
        t = (f - 1) / (total - 1)

        # Black hole grows then implodes
        if t < 0.4:
            h_s = 0.1 + t / 0.4 * 0.9
        elif t < 0.7:
            h_s = 1.0 + (t - 0.4) / 0.3 * 0.3
        else:
            h_s = 1.3 * (1.0 - (t - 0.7) / 0.3)

        keyframe_scale(hole, f, max(h_s, 0.01))

        # Event horizon spins and pulses
        rot_speed = t * math.pi * 6
        keyframe_rotation(horizon, f, (math.pi / 2, 0, rot_speed))
        keyframe_scale(horizon, f, max(h_s * 1.2, 0.01))
        keyframe_emission_strength(mat_white_edge, f,
                                    15.0 + 15.0 * abs(math.sin(t * math.pi * 8)))

        # RGB glitch bars -- offset to create chromatic aberration
        for idx, (bar, ci) in enumerate(rgb_bars):
            offset = 0.15 * math.sin(t * math.pi * 6 + ci * 2.1 + idx * 0.5)
            bar_y = -0.6 + idx * 0.15 + offset
            bar_x = (ci - 1) * 0.08 * math.sin(t * math.pi * 4)
            vis = abs(math.sin(t * math.pi * 3 + idx * 0.7))
            keyframe_location(bar, f, (bar_x, bar_y, 0.01))
            keyframe_scale(bar, f, (1.5 * vis, 0.05, 1.0))

        # Spiral arms rotate inward
        for idx, arm in enumerate(spiral_arms):
            sp_rot = idx * math.pi / 2 + t * math.pi * 3
            sp_scale = h_s * (0.8 + 0.2 * math.sin(t * math.pi * 4 + idx))
            keyframe_rotation(arm, f, (0, 0, sp_rot))
            keyframe_scale(arm, f, max(sp_scale, 0.01))

        # Shards orbit and scatter
        for idx, shard in enumerate(shards):
            angle = idx / 6.0 * math.pi * 2 + t * math.pi * 5
            dist = 0.8 + 0.5 * t + 0.2 * math.sin(t * math.pi * 3 + idx)
            sx = dist * math.cos(angle)
            sy = dist * math.sin(angle)
            sh_s = 0.1 * (1.0 - t * 0.5)
            keyframe_location(shard, f, (sx, sy, 0))
            keyframe_rotation(shard, f, (0, 0, angle * 2))
            keyframe_scale(shard, f, max(sh_s, 0.001))

    render_frames(total, temp_dir, fw, fh)
    output = os.path.join(SCRIPT_DIR, "glitch_singularity_tear.png")
    composite_sprite_sheet(temp_dir, output, cols, rows, fw, fh)
    cleanup_temp(temp_dir)


# ===========================================================================
# WEAPON 9 (Evolution): Storm Conductor
# ===========================================================================
def generate_storm_conductor():
    """6x4 grid, 256px frames. Giant 360-degree circular cutting wave around
    player with lightning flickers."""
    print("\n=== Generating: storm_conductor ===")
    cols, rows, fw, fh = 6, 4, 256, 256
    total = cols * rows  # 24
    temp_dir = os.path.join(TEMP_BASE, "storm_conductor")

    clear_scene()
    setup_camera_ortho(size=5.0)
    setup_render_settings(fw, fh)

    mat_wave = create_emission_material("cutting_wave", "#00BFFF", strength=18.0)
    mat_lightning = create_emission_material("lightning", "#FFFFFF", strength=30.0)
    mat_inner = create_emission_material("inner_glow", "#0088FF", strength=12.0,
                                          alpha=0.5)
    mat_spark = create_emission_material("conductor_spark", "#AAEEFF", strength=20.0)
    mat_ring_secondary = create_emission_material("ring_secondary", "#39FF14",
                                                   strength=10.0, alpha=0.6)

    # Main cutting wave ring
    wave_ring = create_torus("wave_ring", major_radius=1.5, minor_radius=0.08)
    assign_material(wave_ring, mat_wave)

    # Secondary energy ring
    ring2 = create_torus("ring2", major_radius=1.2, minor_radius=0.04)
    assign_material(ring2, mat_ring_secondary)

    # Inner glow disc
    inner_disc = create_circle_mesh("inner_disc", radius=0.8, vertices=32,
                                     fill='NGON', location=(0, 0, -0.05))
    assign_material(inner_disc, mat_inner)

    # Lightning bolts -- zig-zag lines approximated by thin cylinders
    lightnings = []
    for i in range(6):
        angle = i / 6.0 * math.pi * 2
        # Create segmented lightning bolt
        segments = []
        for s in range(4):
            seg_r = 0.5 + s * 0.3
            seg_angle = angle + random.uniform(-0.2, 0.2)
            sx = seg_r * math.cos(seg_angle)
            sy = seg_r * math.sin(seg_angle)
            seg = create_cylinder(f"lightning_{i}_s{s}", radius=0.015,
                                   depth=0.35, vertices=4,
                                   location=(sx, sy, 0))
            seg.rotation_euler = (0, 0, seg_angle + random.uniform(-0.5, 0.5))
            assign_material(seg, mat_lightning)
            segments.append(seg)
        lightnings.append(segments)

    # Spark particles at the wave front
    sparks = []
    for i in range(12):
        angle = i / 12.0 * math.pi * 2
        sp = create_ico_sphere(f"spark_{i}", radius=0.04, subdivisions=1,
                                location=(1.5 * math.cos(angle),
                                          1.5 * math.sin(angle), 0))
        assign_material(sp, mat_spark)
        sparks.append(sp)

    for f in range(1, total + 1):
        t = (f - 1) / (total - 1)

        # Wave expands outward, peaks, contracts
        if t < 0.3:
            wave_r = 0.2 + t / 0.3 * 1.8
        elif t < 0.7:
            wave_r = 2.0 + 0.3 * math.sin((t - 0.3) / 0.4 * math.pi * 4)
        else:
            wave_r = 2.0 * (1.0 - (t - 0.7) / 0.3)

        keyframe_scale(wave_ring, f, (max(wave_r / 1.5, 0.01),
                                       max(wave_r / 1.5, 0.01), 1.0))
        keyframe_rotation(wave_ring, f, (math.pi / 2, 0, t * math.pi * 3))
        keyframe_emission_strength(mat_wave, f,
                                    10.0 + 12.0 * abs(math.sin(t * math.pi * 5)))

        # Secondary ring
        r2_s = max(wave_r / 1.5 * 0.8, 0.01)
        keyframe_scale(ring2, f, (r2_s, r2_s, 1.0))
        keyframe_rotation(ring2, f, (math.pi / 2, 0, -t * math.pi * 4))

        # Inner disc pulses
        disc_s = 0.5 + 0.3 * math.sin(t * math.pi * 6)
        keyframe_scale(inner_disc, f, (disc_s, disc_s, 1.0))

        # Lightning flicker -- random visibility
        for bolt_segs in lightnings:
            for seg in bolt_segs:
                flicker = 1.0 if random.random() > 0.3 else 0.1
                keyframe_scale(seg, f, flicker)

        keyframe_emission_strength(mat_lightning, f,
                                    20.0 + 15.0 * random.random())

        # Sparks orbit along the wave edge
        for idx, sp in enumerate(sparks):
            angle = idx / 12.0 * math.pi * 2 + t * math.pi * 4
            sp_dist = wave_r + random.uniform(-0.1, 0.1)
            keyframe_location(sp, f, (sp_dist * math.cos(angle),
                                       sp_dist * math.sin(angle), 0))
            sp_vis = abs(math.sin(t * math.pi * 6 + idx))
            keyframe_scale(sp, f, 0.04 * sp_vis)

    render_frames(total, temp_dir, fw, fh)
    output = os.path.join(SCRIPT_DIR, "storm_conductor.png")
    composite_sprite_sheet(temp_dir, output, cols, rows, fw, fh)
    cleanup_temp(temp_dir)


# ===========================================================================
# WEAPON 10 (Evolution): Plasma Execution Loop
# ===========================================================================
def generate_plasma_execution_loop():
    """6x4 grid, 256px frames. Dozens of flaming shadow daggers in expanding
    spiral trajectory."""
    print("\n=== Generating: plasma_execution_loop ===")
    cols, rows, fw, fh = 6, 4, 256, 256
    total = cols * rows  # 24
    temp_dir = os.path.join(TEMP_BASE, "plasma_execution_loop")

    clear_scene()
    setup_camera_ortho(size=5.0)
    setup_render_settings(fw, fh)

    mat_flame = create_emission_material("dagger_flame", "#FF6600", strength=14.0)
    mat_shadow = create_emission_material("dagger_shadow", "#330033", strength=4.0)
    mat_trail = create_emission_material("dagger_trail", "#FF00FF", strength=10.0,
                                          alpha=0.5)
    mat_core = create_emission_material("loop_core", "#FF3300", strength=20.0)
    mat_ring = create_emission_material("loop_ring", "#CC00CC", strength=8.0, alpha=0.4)

    # Central vortex core
    core = create_uv_sphere("loop_core", radius=0.2, location=(0, 0, 0))
    assign_material(core, mat_core)

    # Spiral guide ring
    guide_ring = create_torus("guide_ring", major_radius=1.0, minor_radius=0.02)
    assign_material(guide_ring, mat_ring)

    # Create daggers -- elongated cones with a shadow plane behind
    num_daggers = 16
    daggers = []
    dagger_trails = []
    for i in range(num_daggers):
        # Dagger blade
        dagger = create_cone(f"dagger_{i}", radius1=0.04, radius2=0.0,
                              depth=0.4, vertices=4, location=(0, 0, 0))
        assign_material(dagger, mat_flame)

        # Shadow behind dagger
        shadow = create_plane(f"shadow_{i}", size=0.15, location=(0, 0, -0.02))
        assign_material(shadow, mat_shadow)

        # Trail
        trail = create_plane(f"trail_{i}", size=0.08, location=(0, 0, -0.01))
        assign_material(trail, mat_trail)

        daggers.append((dagger, shadow))
        dagger_trails.append(trail)

    for f in range(1, total + 1):
        t = (f - 1) / (total - 1)

        # Core pulses
        core_s = 0.2 + 0.15 * math.sin(t * math.pi * 6)
        keyframe_scale(core, f, core_s)
        keyframe_emission_strength(mat_core, f, 15.0 + 10.0 * math.sin(t * math.pi * 4))

        # Guide ring expands
        ring_s = 0.5 + t * 1.5
        keyframe_scale(guide_ring, f, (ring_s, ring_s, 1.0))
        keyframe_rotation(guide_ring, f, (math.pi / 2, 0, t * math.pi * 2))

        # Each dagger follows a spiral outward
        for idx, (dagger, shadow) in enumerate(daggers):
            # Stagger launch
            launch_t = idx / num_daggers * 0.4
            dt = max(0, t - launch_t)
            if dt <= 0:
                keyframe_scale(dagger, f, 0.001)
                keyframe_scale(shadow, f, 0.001)
                keyframe_scale(dagger_trails[idx], f, 0.001)
                continue

            dt_norm = min(1.0, dt / (1.0 - launch_t))

            # Spiral: angle increases, radius increases
            spiral_angle = idx / num_daggers * math.pi * 2 + dt_norm * math.pi * 3
            spiral_r = 0.3 + dt_norm * 2.0

            dx = spiral_r * math.cos(spiral_angle)
            dy = spiral_r * math.sin(spiral_angle)

            # Dagger points along tangent
            tangent_angle = spiral_angle + math.pi / 2
            keyframe_location(dagger, f, (dx, dy, 0))
            keyframe_rotation(dagger, f, (0, 0, tangent_angle))
            vis = 1.0 if dt_norm < 0.8 else (1.0 - (dt_norm - 0.8) / 0.2)
            keyframe_scale(dagger, f, max(vis, 0.001))

            # Shadow follows dagger
            keyframe_location(shadow, f, (dx, dy, -0.02))
            keyframe_scale(shadow, f, max(vis * 0.8, 0.001))

            # Trail behind dagger
            trail_angle = spiral_angle - 0.2
            trail_r = spiral_r - 0.15
            keyframe_location(dagger_trails[idx], f,
                               (trail_r * math.cos(trail_angle),
                                trail_r * math.sin(trail_angle), -0.01))
            keyframe_scale(dagger_trails[idx], f, max(vis * 0.6, 0.001))

        keyframe_emission_strength(mat_flame, f,
                                    10.0 + 8.0 * math.sin(t * math.pi * 6))
        keyframe_emission_strength(mat_trail, f,
                                    6.0 + 6.0 * math.sin(t * math.pi * 4))

    render_frames(total, temp_dir, fw, fh)
    output = os.path.join(SCRIPT_DIR, "plasma_execution_loop.png")
    composite_sprite_sheet(temp_dir, output, cols, rows, fw, fh)
    cleanup_temp(temp_dir)


# ===========================================================================
# WEAPON 11 (Evolution): Cataclysm Chain Reaction
# ===========================================================================
def generate_cataclysm_chain_reaction():
    """8x4 grid, 256px frames. Sequential volcanic ground explosions in
    stylized mushroom shapes."""
    print("\n=== Generating: cataclysm_chain_reaction ===")
    cols, rows, fw, fh = 8, 4, 256, 256
    total = cols * rows  # 32
    temp_dir = os.path.join(TEMP_BASE, "cataclysm_chain_reaction")

    clear_scene()
    setup_camera_ortho(size=6.0)
    setup_render_settings(fw, fh)

    mat_fire = create_emission_material("volcano_fire", "#FF4400", strength=16.0)
    mat_lava = create_emission_material("volcano_lava", "#FF6600", strength=12.0)
    mat_smoke = create_emission_material("volcano_smoke", "#442200", strength=3.0,
                                          alpha=0.4)
    mat_flash = create_emission_material("explosion_flash", "#FFFF00", strength=25.0)
    mat_ground_crack = create_emission_material("ground_crack", "#FF2200", strength=10.0,
                                                  alpha=0.7)
    mat_debris = create_emission_material("chain_debris", "#CC3300", strength=8.0)

    # Create 4 explosion sites that trigger sequentially
    num_explosions = 4
    explosion_sites = []
    site_positions = [(-1.5, -0.5), (-0.5, 0.3), (0.5, -0.2), (1.5, 0.4)]

    for si in range(num_explosions):
        sx, sy = site_positions[si]
        site = {}

        # Ground crack circle
        site['crack'] = create_circle_mesh(f"crack_{si}", radius=0.6, vertices=16,
                                            fill='NGON', location=(sx, sy, -0.05))
        assign_material(site['crack'], mat_ground_crack)

        # Mushroom stem -- cylinder
        site['stem'] = create_cylinder(f"stem_{si}", radius=0.15, depth=1.0,
                                        vertices=12, location=(sx, sy, 0.5))
        assign_material(site['stem'], mat_fire)

        # Mushroom cap -- flattened sphere
        site['cap'] = create_uv_sphere(f"cap_{si}", radius=0.5, segments=16,
                                        rings=8, location=(sx, sy, 1.0))
        site['cap'].scale = (1.0, 1.0, 0.5)
        assign_material(site['cap'], mat_lava)

        # Smoke cloud -- large soft sphere
        site['smoke'] = create_uv_sphere(f"smoke_{si}", radius=0.7, segments=12,
                                          rings=6, location=(sx, sy, 1.2))
        assign_material(site['smoke'], mat_smoke)

        # Flash
        site['flash'] = create_uv_sphere(f"flash_{si}", radius=0.3,
                                          location=(sx, sy, 0.2))
        assign_material(site['flash'], mat_flash)

        # Debris chunks
        site['debris'] = []
        for di in range(5):
            d = create_ico_sphere(f"debris_{si}_{di}", radius=0.06,
                                   subdivisions=1, location=(sx, sy, 0))
            assign_material(d, mat_debris)
            site['debris'].append(d)

        explosion_sites.append(site)

    for f in range(1, total + 1):
        t = (f - 1) / (total - 1)

        for si, site in enumerate(explosion_sites):
            sx, sy = site_positions[si]
            # Each explosion triggers at a different time
            trigger = si / num_explosions * 0.6
            local_t = max(0, t - trigger)

            if local_t <= 0:
                # Not yet triggered -- hide everything
                for key in ['stem', 'cap', 'smoke', 'flash', 'crack']:
                    keyframe_scale(site[key], f, 0.001)
                for d in site['debris']:
                    keyframe_scale(d, f, 0.001)
                continue

            lt = min(1.0, local_t / (1.0 - trigger)) if trigger < 1.0 else 0

            # Phase: flash (0-0.1), rise (0.1-0.4), bloom (0.4-0.7), dissipate (0.7-1)
            if lt < 0.1:
                p = lt / 0.1
                # Flash
                keyframe_scale(site['flash'], f, 0.3 + p * 1.0)
                keyframe_scale(site['stem'], f, 0.001)
                keyframe_scale(site['cap'], f, 0.001)
                keyframe_scale(site['smoke'], f, 0.001)
                keyframe_scale(site['crack'], f, (0.3 + p * 0.5, 0.3 + p * 0.5, 1.0))
            elif lt < 0.4:
                p = (lt - 0.1) / 0.3
                keyframe_scale(site['flash'], f, max(1.3 * (1.0 - p), 0.001))
                # Stem rises
                stem_h = p * 1.5
                keyframe_scale(site['stem'], f, (0.5 + p * 0.5, 0.5 + p * 0.5,
                                                  max(stem_h, 0.01)))
                keyframe_location(site['stem'], f, (sx, sy, stem_h * 0.5))
                # Cap begins
                cap_s = p * 0.6
                keyframe_scale(site['cap'], f, (cap_s, cap_s, cap_s * 0.5))
                keyframe_location(site['cap'], f, (sx, sy, stem_h))
                keyframe_scale(site['smoke'], f, 0.001)
                keyframe_scale(site['crack'], f, (0.8 + p * 0.3, 0.8 + p * 0.3, 1.0))
            elif lt < 0.7:
                p = (lt - 0.4) / 0.3
                keyframe_scale(site['flash'], f, 0.001)
                # Stem thickens
                keyframe_scale(site['stem'], f, (1.0 + p * 0.3, 1.0 + p * 0.3, 1.5))
                keyframe_location(site['stem'], f, (sx, sy, 0.75))
                # Cap blooms
                cap_s = 0.6 + p * 0.6
                keyframe_scale(site['cap'], f, (cap_s, cap_s, cap_s * 0.4))
                keyframe_location(site['cap'], f, (sx, sy, 1.5 + p * 0.3))
                # Smoke appears
                smoke_s = p * 0.8
                keyframe_scale(site['smoke'], f, (smoke_s, smoke_s, smoke_s * 0.6))
                keyframe_location(site['smoke'], f, (sx, sy, 1.8 + p * 0.3))
                keyframe_scale(site['crack'], f, (1.1, 1.1, 1.0))
            else:
                p = (lt - 0.7) / 0.3
                keyframe_scale(site['flash'], f, 0.001)
                fade = 1.0 - p
                # Everything fades and disperses
                keyframe_scale(site['stem'], f, (max(1.3 * fade, 0.001),
                                                  max(1.3 * fade, 0.001),
                                                  max(1.5 * fade, 0.001)))
                keyframe_location(site['stem'], f, (sx, sy, 0.75))
                cap_s = max(1.2 * fade, 0.001)
                keyframe_scale(site['cap'], f, (cap_s, cap_s, cap_s * 0.4))
                keyframe_location(site['cap'], f, (sx, sy, 1.8 + p * 0.5))
                smoke_s = 0.8 + p * 0.5
                keyframe_scale(site['smoke'], f, (smoke_s, smoke_s, smoke_s * 0.4))
                keyframe_location(site['smoke'], f, (sx, sy, 2.1 + p * 0.5))
                keyframe_scale(site['crack'], f, (max(1.1 * fade, 0.001),
                                                   max(1.1 * fade, 0.001), 1.0))

            # Debris flies outward
            for di, d in enumerate(site['debris']):
                if lt > 0.1:
                    d_t = min(1.0, (lt - 0.1) / 0.7)
                    d_angle = di / 5.0 * math.pi * 2 + si * 0.5
                    d_dist = d_t * 1.5
                    d_z = d_t * 1.0 * math.sin(d_t * math.pi)
                    d_s = 0.06 * (1.0 - d_t * 0.8)
                    keyframe_location(d, f, (sx + d_dist * math.cos(d_angle),
                                              sy + d_dist * math.sin(d_angle),
                                              d_z))
                    keyframe_scale(d, f, max(d_s, 0.001))
                else:
                    keyframe_scale(d, f, 0.001)

        # Global emission keyframes
        fire_strength = 12.0 + 8.0 * abs(math.sin(t * math.pi * 6))
        keyframe_emission_strength(mat_fire, f, fire_strength)
        keyframe_emission_strength(mat_lava, f, 8.0 + 6.0 * abs(math.sin(t * math.pi * 4)))
        keyframe_emission_strength(mat_flash, f,
                                    15.0 + 15.0 * abs(math.sin(t * math.pi * 8)))

    render_frames(total, temp_dir, fw, fh)
    output = os.path.join(SCRIPT_DIR, "cataclysm_chain_reaction.png")
    composite_sprite_sheet(temp_dir, output, cols, rows, fw, fh)
    cleanup_temp(temp_dir)


# ===========================================================================
# WEAPON 12 (Evolution): Frozen Eden Vortex
# ===========================================================================
def generate_frozen_eden_vortex():
    """5x4 grid, 256px frames. Frozen digital vortex pulling enemies in,
    exploding into sharp glitch crystals."""
    print("\n=== Generating: frozen_eden_vortex ===")
    cols, rows, fw, fh = 5, 4, 256, 256
    total = cols * rows  # 20
    temp_dir = os.path.join(TEMP_BASE, "frozen_eden_vortex")

    clear_scene()
    setup_camera_ortho(size=5.0)
    setup_render_settings(fw, fh)

    mat_ice = create_emission_material("ice_core", "#00FFFF", strength=16.0)
    mat_frost = create_emission_material("frost_glow", "#88DDFF", strength=10.0,
                                          alpha=0.5)
    mat_crystal = create_emission_material("crystal_sharp", "#AAFFFF", strength=20.0)
    mat_glitch = create_emission_material("glitch_digital", "#FF00FF", strength=14.0,
                                           alpha=0.6)
    mat_vortex = create_emission_material("vortex_wind", "#44AAFF", strength=8.0,
                                           alpha=0.3)
    mat_dark_ice = create_emission_material("dark_ice", "#003366", strength=5.0)

    # Central vortex core
    core = create_uv_sphere("vortex_core", radius=0.3, segments=20, rings=10,
                             location=(0, 0, 0))
    assign_material(core, mat_ice)

    # Frost aura disc
    frost_disc = create_circle_mesh("frost_disc", radius=1.5, vertices=32,
                                     fill='NGON', location=(0, 0, -0.05))
    assign_material(frost_disc, mat_frost)

    # Vortex spiral arms
    vortex_arms = []
    for i in range(5):
        arm = create_curve_arc(f"vortex_arm_{i}", radius=1.2,
                                angle_start=i * math.pi * 2 / 5,
                                angle_end=i * math.pi * 2 / 5 + math.pi * 1.2,
                                resolution=20, bevel_depth=0.04)
        assign_material(arm, mat_vortex)
        vortex_arms.append(arm)

    # Crystal shards -- sharp elongated cones
    crystals = []
    for i in range(12):
        angle = i / 12.0 * math.pi * 2
        crystal = create_cone(f"crystal_{i}", radius1=0.05, radius2=0.0,
                               depth=0.6, vertices=4, location=(0, 0, 0))
        assign_material(crystal, mat_crystal)
        crystals.append(crystal)

    # Glitch fragments -- small distorted planes
    glitch_frags = []
    for i in range(8):
        frag = create_plane(f"glitch_{i}", size=0.12)
        assign_material(frag, mat_glitch)
        glitch_frags.append(frag)

    # Dark ice chunks orbiting
    ice_chunks = []
    for i in range(6):
        chunk = create_ico_sphere(f"ice_chunk_{i}", radius=0.1, subdivisions=1)
        assign_material(chunk, mat_dark_ice)
        ice_chunks.append(chunk)

    for f in range(1, total + 1):
        t = (f - 1) / (total - 1)

        # Phase: vortex forms (0-0.4), pulls in (0.4-0.65), explodes crystals (0.65-1)
        if t < 0.4:
            phase = "form"
            pt = t / 0.4
        elif t < 0.65:
            phase = "pull"
            pt = (t - 0.4) / 0.25
        else:
            phase = "explode"
            pt = (t - 0.65) / 0.35

        # Core
        if phase == "form":
            core_s = 0.1 + pt * 0.4
            core_emit = 8.0 + 12.0 * pt
        elif phase == "pull":
            core_s = 0.5 + pt * 0.3
            core_emit = 20.0 + 5.0 * math.sin(pt * math.pi * 4)
        else:
            core_s = 0.8 * (1.0 - pt) + 0.01
            core_emit = 25.0 * (1.0 - pt * 0.7)

        keyframe_scale(core, f, max(core_s, 0.01))
        keyframe_emission_strength(mat_ice, f, max(core_emit, 0.5))

        # Frost disc
        if phase == "form":
            disc_s = pt * 1.0
        elif phase == "pull":
            disc_s = 1.0 + pt * 0.5
        else:
            disc_s = 1.5 * (1.0 - pt * 0.5)

        keyframe_scale(frost_disc, f, (max(disc_s, 0.01), max(disc_s, 0.01), 1.0))
        keyframe_emission_strength(mat_frost, f,
                                    6.0 + 6.0 * abs(math.sin(t * math.pi * 5)))

        # Vortex arms spin and contract/expand
        for idx, arm in enumerate(vortex_arms):
            arm_rot = idx / 5.0 * math.pi * 2 + t * math.pi * 4
            if phase == "pull":
                arm_s = 1.0 - pt * 0.3
            elif phase == "explode":
                arm_s = 0.7 + pt * 0.5
            else:
                arm_s = pt
            keyframe_rotation(arm, f, (0, 0, arm_rot))
            keyframe_scale(arm, f, max(arm_s, 0.01))

        # Crystals behavior
        for idx, crystal in enumerate(crystals):
            angle = idx / 12.0 * math.pi * 2

            if phase == "form":
                # Crystals don't appear yet
                keyframe_scale(crystal, f, 0.001)
            elif phase == "pull":
                # Crystals form at edges, pulled inward
                dist = 2.0 - pt * 1.2
                c_s = pt * 0.8
                keyframe_location(crystal, f, (dist * math.cos(angle),
                                                dist * math.sin(angle), 0))
                keyframe_rotation(crystal, f, (0, 0, angle))
                keyframe_scale(crystal, f, max(c_s, 0.001))
            else:
                # Explode outward
                dist = 0.8 + pt * 2.5
                c_s = (1.0 - pt) * 0.8
                exp_angle = angle + pt * 0.5 * (1 if idx % 2 == 0 else -1)
                keyframe_location(crystal, f, (dist * math.cos(exp_angle),
                                                dist * math.sin(exp_angle), 0))
                keyframe_rotation(crystal, f, (pt * math.pi, 0,
                                                exp_angle + pt * math.pi))
                keyframe_scale(crystal, f, max(c_s, 0.001))

        keyframe_emission_strength(mat_crystal, f,
                                    12.0 + 12.0 * abs(math.sin(t * math.pi * 6))
                                    if phase != "form" else 0.5)

        # Glitch fragments
        for idx, frag in enumerate(glitch_frags):
            g_angle = idx / 8.0 * math.pi * 2 + t * math.pi * 3
            if phase == "explode":
                g_dist = 0.5 + pt * 2.0
                g_s = abs(math.sin(pt * math.pi * 3 + idx)) * 0.15
            elif phase == "pull":
                g_dist = 1.5 - pt * 0.8
                g_s = pt * 0.1
            else:
                g_dist = 1.8
                g_s = pt * 0.05

            keyframe_location(frag, f, (g_dist * math.cos(g_angle),
                                         g_dist * math.sin(g_angle), 0))
            keyframe_rotation(frag, f, (0, 0, g_angle * 2 + t * math.pi * 5))
            keyframe_scale(frag, f, max(g_s, 0.001))

        keyframe_emission_strength(mat_glitch, f,
                                    8.0 + 8.0 * abs(math.sin(t * math.pi * 7)))

        # Ice chunks orbit
        for idx, chunk in enumerate(ice_chunks):
            orbit_angle = idx / 6.0 * math.pi * 2 - t * math.pi * 2.5
            if phase == "pull":
                orbit_r = 1.5 - pt * 0.7
            elif phase == "explode":
                orbit_r = 0.8 + pt * 1.5
            else:
                orbit_r = 1.5

            keyframe_location(chunk, f, (orbit_r * math.cos(orbit_angle),
                                          orbit_r * math.sin(orbit_angle), 0))
            i_s = 0.1 if phase != "form" else 0.1 * pt
            keyframe_scale(chunk, f, max(i_s, 0.001))

    render_frames(total, temp_dir, fw, fh)
    output = os.path.join(SCRIPT_DIR, "frozen_eden_vortex.png")
    composite_sprite_sheet(temp_dir, output, cols, rows, fw, fh)
    cleanup_temp(temp_dir)


# ===========================================================================
# MAIN
# ===========================================================================
def main():
    print("=" * 60)
    print("  PHENIX: NULL EDEN -- VFX Sprite Sheet Generator")
    print("=" * 60)
    print(f"  Output directory: {SCRIPT_DIR}")
    print(f"  Temp directory:   {TEMP_BASE}")
    print()

    # Ensure temp base exists
    os.makedirs(TEMP_BASE, exist_ok=True)

    generators = [
        ("Storm Saber Slash",          generate_storm_saber_slash),
        ("Magnetic Arc Burst",         generate_magnetic_arc_burst),
        ("Spirit Crescent Kick",       generate_spirit_crescent_kick),
        ("Shadow Toxic Cuts",          generate_shadow_toxic_cuts),
        ("Nexus Chakram",              generate_nexus_chakram),
        ("Digital Gas Needle",         generate_digital_gas_needle),
        ("Demonic Cataclysm Pulse",    generate_demonic_cataclysm_pulse),
        ("Glitch Singularity Tear",    generate_glitch_singularity_tear),
        ("Storm Conductor",            generate_storm_conductor),
        ("Plasma Execution Loop",      generate_plasma_execution_loop),
        ("Cataclysm Chain Reaction",   generate_cataclysm_chain_reaction),
        ("Frozen Eden Vortex",         generate_frozen_eden_vortex),
    ]

    for idx, (name, func) in enumerate(generators, 1):
        print(f"\n[{idx}/{len(generators)}] Generating: {name}")
        try:
            func()
            print(f"  [OK] {name} complete.")
        except Exception as e:
            print(f"  [ERROR] {name} failed: {e}")
            import traceback
            traceback.print_exc()

    # Cleanup temp base
    cleanup_temp(TEMP_BASE)

    print("\n" + "=" * 60)
    print("  ALL VFX SPRITE SHEETS GENERATED SUCCESSFULLY")
    print("=" * 60)
    print(f"  Output files in: {SCRIPT_DIR}")
    print()


if __name__ == "__main__":
    main()
