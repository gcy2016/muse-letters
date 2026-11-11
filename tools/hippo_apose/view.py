# 通用查看：按物体自带材质渲染。用法 view.py blend out name:dx,dy,dz:scale:cx,cy,cz[:amb] ...
import sys, bpy
from mathutils import Vector
blend,out=sys.argv[1],sys.argv[2]
bpy.ops.wm.open_mainfile(filepath=blend)
sc=bpy.context.scene; sc.render.engine="CYCLES"; sc.cycles.device="CPU"; sc.cycles.samples=24; sc.cycles.use_denoising=False; sc.view_settings.view_transform="Standard"
w=bpy.data.worlds.new("w"); sc.world=w; w.use_nodes=True; bg=w.node_tree.nodes["Background"]; bg.inputs[0].default_value=(1,1,1,1)
cam=bpy.data.objects.new("c",bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera=cam; cam.data.type="ORTHO"
sun=bpy.data.objects.new("s",bpy.data.lights.new("s","SUN")); sc.collection.objects.link(sun); sun.data.angle=0.3
def render(a):
    p=a.split(":"); nm=p[0]; d=Vector([float(v) for v in p[1].split(",")]).normalized(); scl=float(p[2]); c=Vector([float(v) for v in p[3].split(",")])
    amb=float(p[4]) if len(p)>4 else 0.45
    bg.inputs[1].default_value=amb; sun.data.energy=0 if amb>=1 else 3.0
    sc.render.resolution_x=sc.render.resolution_y=900; cam.data.ortho_scale=scl; cam.location=c+d*5
    cam.rotation_euler=(c-cam.location).to_track_quat("-Z","Y").to_euler()
    up=Vector((0,0,1)); right=up.cross(d).normalized(); ld=(d*0.6+right*0.5+up*0.6).normalized(); sun.rotation_euler=ld.to_track_quat("Z","Y").to_euler()
    sc.render.filepath=f"{out}/{nm}.png"; bpy.ops.render.render(write_still=True)

rg=[o for o in bpy.data.objects if o.type=="ARMATURE"]
for a in sys.argv[3:]:
    if a.startswith("action="):
        if a[7:]=="none":
            rg[0].animation_data.action=None
            for pb in rg[0].pose.bones: pb.rotation_quaternion=(1,0,0,0)
        else: rg[0].animation_data.action=bpy.data.actions[a[7:]]
    elif a.startswith("frame="): sc.frame_set(int(a[6:]))
    elif a.startswith("key="):
        k,v=a[4:].split("=")
        for o in bpy.data.objects:
            if o.type=="MESH" and o.data.shape_keys: o.data.shape_keys.key_blocks[k].value=float(v)
    else: render(a)
