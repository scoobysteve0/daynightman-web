import bpy
import math
import os
import mathutils

OUT_DIR = bpy.path.abspath("//../renders")
os.makedirs(OUT_DIR, exist_ok=True)

# ---------- helpers ----------

def reset_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in list(bpy.data.meshes):
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in list(bpy.data.materials):
        if block.users == 0:
            bpy.data.materials.remove(block)


def set_cycles():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 12
    scene.cycles.use_adaptive_sampling = True
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 880
    scene.render.film_transparent = True
    scene.view_settings.look = 'AgX - Medium High Contrast'


def make_material(name, base=(0.2,0.2,0.2,1), rough=0.45, metallic=0.0, emission=None, emission_strength=0.0, transmission=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    for n in nodes:
        nodes.remove(n)
    out = nodes.new('ShaderNodeOutputMaterial')
    out.location = (400,0)
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (0,0)
    bsdf.inputs['Base Color'].default_value = base
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Transmission Weight'].default_value = transmission
    if emission:
        bsdf.inputs['Emission Color'].default_value = emission
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat


def add_cube(name, loc, scale, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    if bevel > 0:
        mod = obj.modifiers.new('Bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 4
        mod.profile = 0.7
    bpy.ops.object.shade_smooth()
    return obj


def add_cylinder(name, loc, radius, depth, rot=(0,0,0), bevel=0.0, vertices=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    if bevel > 0:
        mod = obj.modifiers.new('Bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
    bpy.ops.object.shade_smooth()
    return obj


def add_uv_sphere(name, loc, radius):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=radius, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    bpy.ops.object.shade_smooth()
    return obj


def look_at(obj, target=(0,0,0)):
    direction = mathutils.Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


# ---------- build ----------

def build_scene():
    reset_scene()
    set_cycles()
    scene = bpy.context.scene

    # camera
    bpy.ops.object.camera_add(location=(0, -8.3, 4.45), rotation=(math.radians(67), 0, 0))
    cam = bpy.context.active_object
    cam.data.lens = 58
    scene.camera = cam

    # lights
    bpy.ops.object.light_add(type='AREA', location=(-3.2, -4.5, 5.8))
    key = bpy.context.active_object
    key.data.energy = 3200
    key.data.shape = 'RECTANGLE'
    key.data.size = 5.0
    key.data.size_y = 4.0
    look_at(key, (0, 0, 0.6))

    bpy.ops.object.light_add(type='AREA', location=(4.0, -1.2, 2.8))
    rim = bpy.context.active_object
    rim.data.energy = 1200
    rim.data.shape = 'RECTANGLE'
    rim.data.size = 3.0
    rim.data.size_y = 2.0
    look_at(rim, (0.8, 0.3, 0.6))

    bpy.ops.object.light_add(type='AREA', location=(0, 1.8, 5.0))
    top = bpy.context.active_object
    top.data.energy = 800
    top.data.shape = 'DISK'
    top.data.size = 6
    look_at(top, (0, 0, 0.4))

    # desk plane
    bpy.ops.mesh.primitive_plane_add(size=16, location=(0,0,-0.78))
    desk = bpy.context.active_object
    desk_mat = make_material('Desk', base=(0.11,0.11,0.12,1), rough=0.92)
    desk.data.materials.append(desk_mat)

    # materials
    chassis_mat = make_material('Chassis_Day', base=(0.49,0.46,0.43,1), rough=0.7, metallic=0.15)
    plate_mat = make_material('Plate_Day', base=(0.11,0.105,0.115,1), rough=0.38, metallic=0.28)
    well_mat = make_material('Well_Day', base=(0.08,0.08,0.09,1), rough=0.5, metallic=0.15)
    knob_mat = make_material('Knob', base=(0.08,0.08,0.085,1), rough=0.42, metallic=0.12)
    rubber_mat = make_material('Rubber', base=(0.1,0.08,0.08,1), rough=0.8, metallic=0.0)
    lens_mat = make_material('Lens', base=(0.14,0.18,0.22,1), rough=0.18, metallic=0.0, transmission=0.15, emission=(0.22,0.34,0.48,1), emission_strength=0.25)
    lamp_mat = make_material('Lamp', base=(0.22,0.17,0.09,1), rough=0.22, emission=(1.0,0.74,0.34,1), emission_strength=3.0)
    text_mat = make_material('Text', base=(0.72,0.68,0.62,1), rough=0.6)

    # chassis and faceplate
    chassis = add_cube('Chassis', (0,0,0), (3.45, 2.18, 0.44), bevel=0.12)
    chassis.data.materials.append(chassis_mat)
    chassis.rotation_euler = (math.radians(4), math.radians(0), math.radians(-1.2))

    face = add_cube('Faceplate', (0,0,0.22), (3.0, 1.78, 0.12), bevel=0.08)
    face.data.materials.append(plate_mat)
    face.rotation_euler = chassis.rotation_euler

    riser = add_cube('RearRiser', (0,0.35,0.57), (2.75, 0.34, 0.08), bevel=0.06)
    riser.data.materials.append(chassis_mat)
    riser.rotation_euler = chassis.rotation_euler

    # branding strip
    brand = add_cube('BrandStrip', (0,1.16,0.39), (0.8,0.14,0.03), bevel=0.04)
    brand.data.materials.append(well_mat)
    brand.rotation_euler = chassis.rotation_euler

    # wells
    tone = add_cube('ToneWell', (-1.6,0.56,0.32), (1.02,0.58,0.09), bevel=0.06)
    tex = add_cube('TextureWell', (-1.6,-0.56,0.31), (1.02,0.58,0.08), bevel=0.06)
    hero = add_cube('HeroBay', (0.42,0.02,0.34), (0.86,1.22,0.1), bevel=0.08)
    space = add_cube('SpaceWell', (1.96,-0.56,0.31), (0.92,0.58,0.08), bevel=0.06)
    morph_field = add_cube('MorphField', (1.95,0.74,0.325), (0.92,0.42,0.07), bevel=0.08)
    for obj in (tone, tex, hero, space, morph_field):
        obj.data.materials.append(well_mat)
        obj.rotation_euler = chassis.rotation_euler

    # trackball system
    cup = add_cylinder('TrackballCup', (0.22, 0.1, 0.43), 0.55, 0.18, rot=(math.radians(90),0,0), bevel=0.02)
    cup.data.materials.append(well_mat)
    ring = add_cylinder('TrackballRing', (0.22, 0.1, 0.47), 0.46, 0.08, rot=(math.radians(90),0,0), bevel=0.015)
    ring.data.materials.append(plate_mat)
    ball = add_uv_sphere('Trackball', (0.22, 0.1, 0.67), 0.44)
    ball.data.materials.append(lens_mat)
    for obj in (cup, ring, ball):
        obj.rotation_euler = chassis.rotation_euler

    # kick button
    kick_ring = add_cylinder('KickRing', (1.92, -0.18, 0.45), 0.38, 0.09, rot=(math.radians(90),0,0), bevel=0.02)
    kick_ring.data.materials.append(plate_mat)
    kick_core = add_cylinder('KickCore', (1.92, -0.18, 0.49), 0.27, 0.07, rot=(math.radians(90),0,0), bevel=0.02)
    kick_core.data.materials.append(rubber_mat)
    for obj in (kick_ring, kick_core):
        obj.rotation_euler = chassis.rotation_euler

    # knobs
    knob_positions = [
        (-2.2, 0.56, 0.50), (-1.6, 0.56, 0.50), (-1.0, 0.56, 0.50),
        (-2.2, -0.56, 0.49), (-1.6, -0.56, 0.49), (-1.0, -0.56, 0.49),
        (1.45, -0.56, 0.49), (2.44, -0.56, 0.49)
    ]
    for i, loc in enumerate(knob_positions):
        base = add_cylinder(f'KnobBase_{i}', loc, 0.19, 0.16, rot=(0,0,0), bevel=0.01)
        cap = add_cylinder(f'KnobCap_{i}', (loc[0], loc[1], loc[2]+0.08), 0.13, 0.08, rot=(0,0,0), bevel=0.008)
        for obj in (base, cap):
            obj.rotation_euler = chassis.rotation_euler
        base.data.materials.append(knob_mat)
        cap.data.materials.append(rubber_mat)

    # morph slider
    slider_slot = add_cube('MorphSlot', (1.98,0.73,0.41), (0.14,0.24,0.025), bevel=0.05)
    slider_slot.data.materials.append(plate_mat)
    slider_slot.rotation_euler = chassis.rotation_euler
    thumb = add_cylinder('MorphThumb', (1.98,0.73,0.47), 0.11, 0.06, rot=(math.radians(90),0,0), bevel=0.02)
    thumb.data.materials.append(chassis_mat)
    thumb.rotation_euler = chassis.rotation_euler

    # lamp
    lamp = add_cylinder('Lamp', (0.06,1.17,0.46), 0.08, 0.06, rot=(math.radians(90),0,0), bevel=0.01)
    lamp.data.materials.append(lamp_mat)
    lamp.rotation_euler = chassis.rotation_euler

    # screw accents
    screw_positions = [(-2.85,1.42,0.40),(2.85,1.42,0.40),(-2.85,-1.42,0.39),(2.85,-1.42,0.39)]
    for i, loc in enumerate(screw_positions):
        s = add_cylinder(f'Screw_{i}', loc, 0.05, 0.03, rot=(math.radians(90),0,0), bevel=0.005, vertices=32)
        s.data.materials.append(knob_mat)
        s.rotation_euler = chassis.rotation_euler

    # labels via text objects
    labels = [
        ('DAYNIGHTMAN', (0.0,1.17,0.50), 0.13),
        ('BITE', (-2.2, 0.10,0.49), 0.09), ('HEAT',(-1.6,0.10,0.49),0.09), ('EDGE',(-1.0,0.10,0.49),0.09),
        ('PULSE',(-2.2,-1.00,0.48),0.075), ('HAZE',(-1.6,-1.00,0.48),0.08), ('DRIFT',(-1.0,-1.00,0.48),0.075),
        ('SPACE',(1.45,-1.00,0.48),0.08), ('OUT',(2.44,-1.00,0.48),0.09), ('KICK',(1.92,-0.78,0.48),0.09),
        ('DAY ↔ NIGHT',(1.98,1.08,0.48),0.08), ('PITCH',(0.22,-0.74,0.54),0.09)
    ]
    for txt, loc, size in labels:
        bpy.ops.object.text_add(location=loc, rotation=(math.radians(86), 0, math.radians(-1.2)))
        t = bpy.context.active_object
        t.data.body = txt
        t.data.size = size
        t.data.extrude = 0.001
        t.data.align_x = 'CENTER'
        t.data.font = bpy.data.fonts.load('/System/Library/Fonts/SFNSMono.ttf') if os.path.exists('/System/Library/Fonts/SFNSMono.ttf') else t.data.font
        t.data.materials.append(text_mat)

    return {
        'scene': scene,
        'key': key,
        'rim': rim,
        'top': top,
        'desk': desk,
        'chassis': chassis,
        'face': face,
        'trackball': ball,
        'trackball_ring': ring,
        'kick_core': kick_core,
        'lamp': lamp,
        'thumb': thumb,
        'materials': {
            'chassis': chassis_mat,
            'plate': plate_mat,
            'well': well_mat,
            'lens': lens_mat,
            'lamp': lamp_mat,
            'rubber': rubber_mat,
            'desk': desk_mat,
        }
    }


def apply_state(ctx, morph):
    # morph 0 day, .5 twilight, 1 night
    m = ctx['materials']
    # chassis color warms -> cools
    m['chassis'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (
        0.49 - 0.14*morph,
        0.46 - 0.12*morph,
        0.43 + 0.06*morph,
        1,
    )
    m['plate'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (
        0.11 - 0.02*morph,
        0.105 - 0.01*morph,
        0.115 + 0.05*morph,
        1,
    )
    m['well'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (
        0.08 - 0.01*morph,
        0.08 - 0.005*morph,
        0.09 + 0.05*morph,
        1,
    )
    m['lens'].node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (
        0.30 + 0.08*morph,
        0.42 + 0.14*morph,
        0.52 + 0.30*morph,
        1,
    )
    m['lens'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 0.2 + 1.4*morph
    m['lamp'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 2.4 + 1.0*(1-morph)
    m['desk'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (
        0.13 - 0.03*morph, 0.12 - 0.03*morph, 0.12 + 0.01*morph, 1)

    ctx['key'].data.energy = 3400 - 1200*morph
    ctx['rim'].data.energy = 800 + 1100*morph
    ctx['top'].data.energy = 1000 - 300*morph

    ctx['trackball'].location.z = 0.67 + 0.02*morph
    ctx['thumb'].location.y = 0.73 - 0.25*morph
    ctx['kick_core'].location.z = 0.49 - 0.015*(1 if morph>0.95 else 0)

    # slightly deepen nighttime faceplate and wells perception via transform
    ctx['face'].location.z = 0.22 - 0.02*morph


def render_png(scene, filepath):
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = filepath
    bpy.ops.render.render(write_still=True)


def setup_turntable(scene, obj):
    scene.frame_start = 1
    scene.frame_end = 24
    obj.rotation_euler[2] = math.radians(-6)
    obj.keyframe_insert(data_path='rotation_euler', index=2, frame=1)
    obj.rotation_euler[2] = math.radians(6)
    obj.keyframe_insert(data_path='rotation_euler', index=2, frame=12)
    obj.rotation_euler[2] = math.radians(-6)
    obj.keyframe_insert(data_path='rotation_euler', index=2, frame=24)


def animate_trackball(scene, ball):
    scene.frame_start = 1
    scene.frame_end = 18
    ball.rotation_euler = (0,0,0)
    ball.keyframe_insert(data_path='rotation_euler', frame=1)
    ball.rotation_euler = (math.radians(14), math.radians(0), math.radians(22))
    ball.keyframe_insert(data_path='rotation_euler', frame=9)
    ball.rotation_euler = (math.radians(-6), math.radians(0), math.radians(-14))
    ball.keyframe_insert(data_path='rotation_euler', frame=18)


def animate_kick(scene, kick_core):
    scene.frame_start = 1
    scene.frame_end = 14
    z0 = kick_core.location.z
    kick_core.keyframe_insert(data_path='location', frame=1)
    kick_core.location.z = z0 - 0.05
    kick_core.keyframe_insert(data_path='location', frame=5)
    kick_core.location.z = z0 + 0.008
    kick_core.keyframe_insert(data_path='location', frame=9)
    kick_core.location.z = z0
    kick_core.keyframe_insert(data_path='location', frame=14)


def render_sequence(scene, dirpath):
    os.makedirs(dirpath, exist_ok=True)
    scene.render.image_settings.file_format = 'PNG'
    scene.render.fps = 24
    scene.render.filepath = os.path.join(dirpath, 'frame_')
    bpy.ops.render.render(animation=True)


def main():
    ctx = build_scene()
    scene = ctx['scene']

    # Stills
    for name, morph in [('day', 0.0), ('twilight', 0.5), ('night', 1.0)]:
        apply_state(ctx, morph)
        render_png(scene, os.path.join(OUT_DIR, f'daynightman_{name}.png'))

    # Motion refs
    root = ctx['chassis']
    apply_state(ctx, 0.5)
    setup_turntable(scene, root)
    render_sequence(scene, os.path.join(OUT_DIR, 'seq_idle_turntable'))

    # clear animation
    for obj in bpy.data.objects:
        if obj.animation_data:
            obj.animation_data_clear()

    apply_state(ctx, 1.0)
    animate_trackball(scene, ctx['trackball'])
    render_sequence(scene, os.path.join(OUT_DIR, 'seq_trackball_motion'))
    for obj in bpy.data.objects:
        if obj.animation_data:
            obj.animation_data_clear()

    apply_state(ctx, 0.5)
    animate_kick(scene, ctx['kick_core'])
    render_sequence(scene, os.path.join(OUT_DIR, 'seq_kick_press'))

    bpy.ops.wm.save_as_mainfile(filepath=bpy.path.abspath('//daynightman_reference_pack.blend'))


if __name__ == '__main__':
    main()
