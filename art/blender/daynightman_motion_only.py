import os
import sys
import bpy

SCRIPT_DIR = os.path.dirname(__file__)
if SCRIPT_DIR not in sys.path:
    sys.path.append(SCRIPT_DIR)

from daynightman_reference_pack import build_scene, apply_state, animate_trackball, animate_kick, render_sequence

OUT_DIR = bpy.path.abspath('//../renders')
os.makedirs(OUT_DIR, exist_ok=True)

ctx = build_scene()
scene = ctx['scene']

# Full trackball sequence
for obj in bpy.data.objects:
    if obj.animation_data:
        obj.animation_data_clear()
apply_state(ctx, 1.0)
animate_trackball(scene, ctx['trackball'])
render_sequence(scene, os.path.join(OUT_DIR, 'seq_trackball_motion'))

# Kick press sequence
for obj in bpy.data.objects:
    if obj.animation_data:
        obj.animation_data_clear()
apply_state(ctx, 0.5)
animate_kick(scene, ctx['kick_core'])
render_sequence(scene, os.path.join(OUT_DIR, 'seq_kick_press'))

bpy.ops.wm.save_as_mainfile(filepath=bpy.path.abspath('//daynightman_reference_pack.blend'))
