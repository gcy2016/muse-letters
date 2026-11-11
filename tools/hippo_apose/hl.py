# 共用：打开底稿、取/写顶点、渲染
import bpy, numpy as np
from mathutils import Vector
def obj(): return [o for o in bpy.data.objects if o.type=="MESH"][0]
def get_co(o):
    n=len(o.data.vertices); a=np.empty(n*3); o.data.vertices.foreach_get("co",a); return a.reshape(-1,3)
def set_co(o,co):
    o.data.vertices.foreach_set("co",np.ascontiguousarray(co,dtype=np.float32).ravel()); o.data.update()
def tris(o):
    n=len(o.data.polygons); a=np.empty(n*3,dtype=np.int32); o.data.polygons.foreach_get("vertices",a); return a.reshape(-1,3)
_setup=False
def setup(o):
    global _setup, cam, sun, texmat, clay, flat
    sc=bpy.context.scene
    sc.render.engine="CYCLES"; sc.cycles.device="CPU"; sc.cycles.samples=16; sc.cycles.use_denoising=False
    sc.view_settings.view_transform="Standard"
    w=bpy.data.worlds.get("w") or bpy.data.worlds.new("w"); sc.world=w; w.use_nodes=True
    bg=w.node_tree.nodes["Background"]; bg.inputs[0].default_value=(1,1,1,1); bg.inputs[1].default_value=0.35
    texmat=[m for m in bpy.data.materials if m.name.startswith("Material")][0]
    clay=bpy.data.materials.get("clay") or bpy.data.materials.new("clay"); clay.use_nodes=True
    b=clay.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value=(.7,.7,.7,1); b.inputs["Roughness"].default_value=0.45
    flat=bpy.data.materials.get("flat")
    if not flat:
        flat=bpy.data.materials.new("flat"); flat.use_nodes=True; nt=flat.node_tree; nt.nodes.clear()
        im=[n for n in texmat.node_tree.nodes if n.type=="TEX_IMAGE" and n.image and "normal" not in n.image.name and "rough" not in n.image.name][0].image
        t=nt.nodes.new("ShaderNodeTexImage"); t.image=im; e=nt.nodes.new("ShaderNodeEmission"); out=nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(t.outputs[0],e.inputs[0]); nt.links.new(e.outputs[0],out.inputs[0])
    cam=bpy.data.objects.get("c")
    if not cam:
        cam=bpy.data.objects.new("c",bpy.data.cameras.new("c")); sc.collection.objects.link(cam)
        sun=bpy.data.objects.new("s",bpy.data.lights.new("s","SUN")); sc.collection.objects.link(sun)
    else: sun=bpy.data.objects["s"]
    sc.camera=cam; cam.data.type="ORTHO"; sun.data.energy=3.5; sun.data.angle=0.05
    _setup=True
def shot(o,path,d,scale,target,mode="clay",res=900,rake=0.8):
    if not _setup: setup(o)
    sc=bpy.context.scene; d=Vector(d).normalized()
    sc.render.resolution_x=sc.render.resolution_y=res
    cam.data.ortho_scale=scale; cam.location=Vector(target)+d*5
    cam.rotation_euler=(Vector(target)-cam.location).to_track_quat("-Z","Y").to_euler()
    up=Vector((0,0,1)) if abs(d.z)<0.9 else Vector((0,1,0)); right=up.cross(d).normalized()
    ld=(d*0.5+right*rake+up*0.6).normalized(); sun.rotation_euler=ld.to_track_quat("Z","Y").to_euler()
    o.data.materials[0]={"clay":clay,"tex":texmat,"flat":flat}[mode]
    sc.render.filepath=path; bpy.ops.render.render(write_still=True)
    o.data.materials[0]=texmat
def loop_uv(o):
    n=len(o.data.loops); a=np.empty(n*2,dtype=np.float32); o.data.uv_layers.active.data.foreach_get("uv",a); return a.reshape(-1,2)
def loop_vert(o):
    n=len(o.data.loops); a=np.empty(n,dtype=np.int32); o.data.loops.foreach_get("vertex_index",a); return a
def base_image():
    m=[m for m in bpy.data.materials if m.name.startswith("Material")][0]
    return [n for n in m.node_tree.nodes if n.type=="TEX_IMAGE" and n.image and "normal" not in n.image.name and "rough" not in n.image.name][0].image
def get_px(im):
    w,h=im.size; a=np.empty(w*h*4,dtype=np.float32); im.pixels.foreach_get(a); return a.reshape(h,w,4)
def set_px(im,a):
    im.pixels.foreach_set(np.ascontiguousarray(a,dtype=np.float32).ravel()); im.update()
def sample(px,uv):
    h,w=px.shape[:2]; x=np.clip(uv[:,0]*w-0.5,0,w-1.001); y=np.clip(uv[:,1]*h-0.5,0,h-1.001)
    x0=x.astype(int); y0=y.astype(int); fx=(x-x0)[:,None]; fy=(y-y0)[:,None]
    return (px[y0,x0]*(1-fx)+px[y0,x0+1]*fx)*(1-fy)+(px[y0+1,x0]*(1-fx)+px[y0+1,x0+1]*fx)*fy
