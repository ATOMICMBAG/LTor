"""
maazi.de | LTor — Laserlabor 3D model.

Builds the optical bench used by the Laserlabor module and exports it as
glTF binary. Run headless (Blender 4.x / 5.x):

    blender --background --factory-startup --python assets/blender/build_ltor_lab.py

Outputs
    assets/blender/ltor_lab.blend
    src/renderer/src/assets/ltor_lab.glb

Conventions (the 3D view relies on them):
    * Units: metres. Blender is Z-up; the glTF exporter converts to Y-up.
    * The optical axis runs along +X at height BEAM_H above the breadboard.
    * "Aperture"   origin = exit plane of the laser   (bench z = 0)
    * "LensMount"  origin = centre of the lens        (moved along X in the app)
    * "Shutter"    origin = blade centre              (moved up to open)
    * "PowerMeter" origin = absorber surface          (end of the beam)
    * Clickable parts carry their name; the app shows an explanation for each.
"""

import math
import os

import bpy
import bmesh

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
GLB_PATH = os.path.join(ROOT, "src", "renderer", "src", "assets", "ltor_lab.glb")
BLEND_PATH = os.path.join(HERE, "ltor_lab.blend")

BEAM_H = 0.075  # optical axis height above the breadboard [m]
APERTURE_X = -0.25  # exit plane of the laser
POWER_METER_X = 0.40

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"


def material(name, color, metallic=0.0, roughness=0.5, transmission=0.0,
             emission=None, ior=1.5, alpha=1.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if mat.node_tree is None:  # Blender < 5 creates materials without nodes
        mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["IOR"].default_value = ior
    for key in ("Transmission Weight", "Transmission"):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = transmission
            break
    if emission is not None:
        for key in ("Emission Color", "Emission"):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = (*emission, 1.0)
                break
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = 1.0
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
    return mat


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def box(name, x0, x1, y0, y1, z0, z1, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (x1 - x0, y1 - y0, z1 - z0)
    obj.location = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = "ANGLE"
    for p in obj.data.polygons:
        p.use_smooth = False
    return assign(obj, mat)


def cylinder(name, radius, depth, location, axis="Z", mat=None, verts=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=location)
    obj = bpy.context.active_object
    obj.name = name
    if axis == "X":
        obj.rotation_euler = (0, math.radians(90), 0)
    elif axis == "Y":
        obj.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    smooth_sides(obj)
    if mat:
        assign(obj, mat)
    return obj


def ring(name, r_out, r_in, depth, location, mat, axis="X", verts=48):
    """Hollow cylinder (lens holder ring)."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for side in (-0.5, 0.5):
        for r in (r_out, r_in):
            loop = []
            for k in range(verts):
                a = 2 * math.pi * k / verts
                loop.append(bm.verts.new((side * depth, r * math.cos(a), r * math.sin(a))))
            rings.append(loop)
    o0, i0, o1, i1 = rings
    for k in range(verts):
        n = (k + 1) % verts
        bm.faces.new((o0[k], o0[n], o1[n], o1[k]))  # outer wall
        bm.faces.new((i0[k], i1[k], i1[n], i0[n]))  # inner wall
        bm.faces.new((o0[k], i0[k], i0[n], o0[n]))  # back face
        bm.faces.new((o1[k], o1[n], i1[n], i1[k]))  # front face
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    if axis != "X":
        raise ValueError("only X supported")
    return assign(obj, mat)


def smooth_sides(obj):
    for p in obj.data.polygons:
        p.use_smooth = len(p.vertices) == 4


def lens_mesh(name, radius, thickness, location, mat, segments=48, rings=12):
    """Biconvex lens: two spherical caps, optical axis along X."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    half = thickness / 2
    edge = 0.0006  # edge thickness
    cap = half - edge / 2
    curv_r = (radius * radius + cap * cap) / (2 * cap)  # sphere radius of the cap

    def cap_rings(sign):
        loops = []
        for j in range(rings + 1):
            r = radius * j / rings
            sag = curv_r - math.sqrt(max(curv_r * curv_r - r * r, 0.0))
            x = sign * (half - sag)
            if j == 0:
                loops.append([bm.verts.new((x, 0.0, 0.0))])
                continue
            loop = []
            for k in range(segments):
                a = 2 * math.pi * k / segments
                loop.append(bm.verts.new((x, r * math.cos(a), r * math.sin(a))))
            loops.append(loop)
        return loops

    front = cap_rings(+1)
    back = cap_rings(-1)
    for loops, flip in ((front, False), (back, True)):
        for j in range(1, len(loops)):
            inner, outer = loops[j - 1], loops[j]
            for k in range(segments):
                n = (k + 1) % segments
                if len(inner) == 1:
                    face = (inner[0], outer[k], outer[n])
                else:
                    face = (inner[k], outer[k], outer[n], inner[n])
                bm.faces.new(tuple(reversed(face)) if flip else face)
    fo, bo = front[-1], back[-1]
    for k in range(segments):
        n = (k + 1) % segments
        bm.faces.new((fo[k], bo[k], bo[n], fo[n]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    return assign(obj, mat)


def triangle(name, center, size, mat, y, z_offset=0.0):
    """Upright equilateral triangle on a plane of constant Y (laser warning label)."""
    mesh = bpy.data.meshes.new(name)
    h = size * math.sqrt(3) / 2
    cx, cz = center
    verts = [(cx - size / 2, y, cz - h / 3 + z_offset), (cx + size / 2, y, cz - h / 3 + z_offset),
             (cx, y, cz + 2 * h / 3 + z_offset)]
    mesh.from_pydata(verts, [], [(0, 1, 2)])
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return assign(obj, mat)


def text(name, body, location, rotation, size, mat, extrude=0.0003):
    bpy.ops.object.text_add(location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.body = body
    obj.data.size = size
    obj.data.extrude = extrude
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.active_object
    obj.name = name
    return assign(obj, mat)


def empty(name, location):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.02
    obj.location = location
    bpy.context.collection.objects.link(obj)
    return obj


def parent_keep(child, parent):
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


def join(name, objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    return obj


# ---------------------------------------------------------------------------
# scene
# ---------------------------------------------------------------------------


def build():
    reset_scene()

    m_board = material("Breadboard_Anodized", (0.035, 0.037, 0.042), metallic=0.55, roughness=0.5)
    m_hole = material("Breadboard_Hole", (0.004, 0.004, 0.005), roughness=0.9)
    m_alu = material("Aluminium", (0.78, 0.79, 0.81), metallic=1.0, roughness=0.32)
    m_black = material("Anodized_Black", (0.02, 0.02, 0.024), metallic=0.5, roughness=0.42)
    m_housing = material("Housing_White", (0.86, 0.86, 0.84), metallic=0.1, roughness=0.45)
    m_label = material("Warning_Yellow", (1.0, 0.78, 0.0), roughness=0.6)
    m_ink = material("Ink_Black", (0.01, 0.01, 0.01), roughness=0.7)
    m_glass = material("Glass_NBK7", (0.95, 0.97, 1.0), roughness=0.02, transmission=1.0, ior=1.517)
    m_led = material("LED_Emission", (0.25, 0.02, 0.02), roughness=0.3, emission=(0.0, 0.0, 0.0))
    m_absorber = material("Absorber_Black", (0.008, 0.008, 0.008), roughness=0.95)
    m_key = material("Key_Brass", (0.85, 0.65, 0.25), metallic=1.0, roughness=0.3)

    # -- Breadboard (900 × 300 mm, M6 grid 25 mm) ---------------------------
    box("Breadboard", -0.45, 0.45, -0.15, 0.15, -0.0127, 0.0, m_board, bevel=0.002)
    holes = []
    for ix in range(36):
        for iy in range(12):
            x = -0.4375 + ix * 0.025
            y = -0.1375 + iy * 0.025
            bpy.ops.mesh.primitive_circle_add(vertices=10, radius=0.003, fill_type="NGON",
                                              location=(x, y, 0.0002))
            holes.append(bpy.context.active_object)
    assign(join("Breadboard_Holes", holes), m_hole)

    # -- Laser head ---------------------------------------------------------
    hx0, hx1 = -0.42, APERTURE_X - 0.01
    box("LaserHead", hx0, hx1, -0.035, 0.035, BEAM_H - 0.035, BEAM_H + 0.035, m_housing,
        bevel=0.004)
    box("LaserHead_Front", hx1 - 0.002, hx1 + 0.004, -0.033, 0.033, BEAM_H - 0.033,
        BEAM_H + 0.033, m_black, bevel=0.002)
    ap = cylinder("Aperture", 0.009, 0.006, (APERTURE_X - 0.003, 0, BEAM_H), axis="X",
                  mat=m_black)
    # move origin to the exit plane: bench z = 0 there
    ap.data.transform(__import__("mathutils").Matrix.Translation((-0.003, 0, 0)))
    ap.location.x = APERTURE_X
    cylinder("Aperture_Bore", 0.0035, 0.0062, (APERTURE_X - 0.003, 0, BEAM_H), axis="X",
             mat=m_absorber)

    # heat sink with fins below the head (TEC sits between head and sink)
    box("TEC", hx0 + 0.01, hx1 - 0.01, -0.03, 0.03, BEAM_H - 0.041, BEAM_H - 0.035, m_label)
    fins = [box("HeatSink_Base", hx0, hx1, -0.04, 0.04, BEAM_H - 0.047, BEAM_H - 0.041,
                m_black)]
    for k in range(9):
        y = -0.036 + k * 0.009
        fins.append(box(f"Fin{k}", hx0, hx1, y - 0.0011, y + 0.0011, 0.0, BEAM_H - 0.047,
                        m_black))
    join("HeatSink", fins)

    # warning label (yellow triangle with black rim) and branding on the -Y
    # side, which faces the default camera of the app (laser left, beam right)
    side_y = -0.0352
    triangle("WarningLabel_Rim", (-0.385, BEAM_H + 0.004), 0.034, m_ink, side_y)
    triangle("WarningLabel", (-0.385, BEAM_H + 0.004), 0.028, m_label, side_y - 0.0002)
    text("Brand", "maazi.de | LTor", (-0.315, side_y - 0.0002, BEAM_H + 0.012),
         (math.radians(90), 0, 0), 0.011, m_ink)
    text("Brand_Sub", "LASER LAB SIM", (-0.315, side_y - 0.0002, BEAM_H - 0.006),
         (math.radians(90), 0, 0), 0.007, m_ink)

    # emission indicator LED and key switch
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0045, location=(-0.29, -0.018, BEAM_H + 0.035))
    led = bpy.context.active_object
    led.name = "EmissionLED"
    for p in led.data.polygons:
        p.use_smooth = True
    assign(led, m_led)
    cylinder("KeySwitch", 0.008, 0.008, (hx0 - 0.004, 0.015, BEAM_H + 0.012), axis="X",
             mat=m_alu)
    box("KeySwitch_Key", hx0 - 0.02, hx0 - 0.007, 0.0135, 0.0165, BEAM_H + 0.004,
        BEAM_H + 0.02, m_key)

    # -- Shutter --------------------------------------------------------------
    sx = APERTURE_X + 0.012
    box("ShutterBody", sx - 0.005, sx + 0.005, -0.022, 0.022, 0.0, BEAM_H - 0.016,
        m_black, bevel=0.0015)
    box("ShutterBody_Top", sx - 0.005, sx + 0.005, -0.022, 0.022, BEAM_H + 0.016,
        BEAM_H + 0.05, m_black, bevel=0.0015)
    for yy in (-0.022, 0.016):
        box(f"ShutterFrame{yy:+.3f}", sx - 0.005, sx + 0.005, yy, yy + 0.006, BEAM_H - 0.016,
            BEAM_H + 0.016, m_black)
    blade = box("Shutter", sx - 0.0012, sx + 0.0012, -0.016, 0.016, BEAM_H - 0.016,
                BEAM_H + 0.016, m_alu)
    # box() already places the origin at the blade centre (sx, 0, BEAM_H)
    assert abs(blade.location.z - BEAM_H) < 1e-6

    # -- Optical rail -------------------------------------------------------
    box("Rail", -0.215, 0.375, -0.012, 0.012, 0.0, 0.012, m_alu, bevel=0.0015)
    rail_marks = []
    for k in range(0, 59):
        x = -0.21 + k * 0.01
        h = 0.004 if k % 5 else 0.007
        rail_marks.append(box(f"Mark{k}", x - 0.0003, x + 0.0003, 0.0121, 0.0123, 0.012 - h,
                              0.0118, m_ink))
    join("Rail_Scale", rail_marks)

    # -- Lens mount (moved by the app) -------------------------------------
    lens_x = 0.0
    mount = empty("LensMount", (lens_x, 0, BEAM_H))
    parts = [
        box("LensMount_Carriage", lens_x - 0.018, lens_x + 0.018, -0.02, 0.02, 0.012, 0.024,
            m_black, bevel=0.0015),
        cylinder("LensMount_Post", 0.0063, BEAM_H - 0.02 - 0.024,
                 (lens_x, 0, 0.024 + (BEAM_H - 0.02 - 0.024) / 2), mat=m_alu),
        ring("LensMount_Ring", 0.0205, 0.0128, 0.009, (lens_x, 0, BEAM_H), m_black),
    ]
    lens = lens_mesh("Lens", 0.0125, 0.0052, (lens_x, 0, BEAM_H), m_glass)
    for p in parts + [lens]:
        parent_keep(p, mount)

    # -- Power meter (thermal head, end of the beam) -----------------------
    pm = empty("PowerMeter", (POWER_METER_X, 0, BEAM_H))
    pm_parts = [
        cylinder("PowerMeter_Head", 0.032, 0.024, (POWER_METER_X + 0.012, 0, BEAM_H), axis="X",
                 mat=m_black),
        cylinder("PowerMeter_Fins", 0.036, 0.004, (POWER_METER_X + 0.03, 0, BEAM_H), axis="X",
                 mat=m_alu),
        cylinder("PowerMeter_Post", 0.0063, BEAM_H - 0.032,
                 (POWER_METER_X + 0.012, 0, (BEAM_H - 0.032) / 2), mat=m_alu),
        box("PowerMeter_Base", POWER_METER_X - 0.01, POWER_METER_X + 0.034, -0.025, 0.025, 0.0,
            0.006, m_black, bevel=0.0015),
    ]
    absorber = cylinder("Absorber", 0.0245, 0.0012, (POWER_METER_X + 0.0004, 0, BEAM_H),
                        axis="X", mat=m_absorber)
    for p in pm_parts + [absorber]:
        parent_keep(p, pm)

    # Clickable groups: tag every mesh with the logical part it belongs to.
    groups = {
        "LaserHead": ["LaserHead", "LaserHead_Front", "WarningLabel", "WarningLabel_Rim",
                      "Brand", "Brand_Sub"],
        "Aperture": ["Aperture", "Aperture_Bore"],
        "HeatSink": ["HeatSink"],
        "TEC": ["TEC"],
        "EmissionLED": ["EmissionLED"],
        "KeySwitch": ["KeySwitch", "KeySwitch_Key"],
        "Shutter": ["Shutter", "ShutterBody", "ShutterBody_Top"] +
                   [o.name for o in bpy.data.objects if o.name.startswith("ShutterFrame")],
        "Rail": ["Rail", "Rail_Scale"],
        "Lens": ["Lens", "LensMount_Carriage", "LensMount_Post", "LensMount_Ring"],
        "PowerMeter": ["PowerMeter_Head", "PowerMeter_Fins", "PowerMeter_Post",
                       "PowerMeter_Base", "Absorber"],
        "Breadboard": ["Breadboard", "Breadboard_Holes"],
    }
    for part, names in groups.items():
        for n in names:
            obj = bpy.data.objects.get(n)
            if obj is not None:
                obj["ltor_part"] = part

    # -- Camera & light for previews in Blender (not exported) --------------
    bpy.ops.object.camera_add(location=(0.1, -0.72, 0.32),
                              rotation=(math.radians(68), 0, 0))
    bpy.context.scene.camera = bpy.context.active_object
    bpy.ops.object.light_add(type="AREA", location=(0, -0.2, 0.8))
    bpy.context.active_object.data.energy = 60
    bpy.context.active_object.data.size = 0.8


def export():
    os.makedirs(os.path.dirname(GLB_PATH), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.data.objects:
        if obj.type in {"MESH", "EMPTY"}:
            obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=GLB_PATH,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
    )
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    print(f"[ltor] exported {GLB_PATH} ({os.path.getsize(GLB_PATH) / 1024:.0f} KiB)")


if __name__ == "__main__":
    build()
    export()
