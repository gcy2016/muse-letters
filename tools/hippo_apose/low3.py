# 高模 → 网页用的低模：减面、重新展 UV、把颜色和表面细节烘到新贴图上
import sys, bpy, bmesh, numpy as np, time
W=sys.argv[1]; src=sys.argv[2]; out=sys.argv[3]; NT=int(sys.argv[4]); sys.path.insert(0,W); import hl
bpy.ops.wm.open_mainfile(filepath=src); hi=hl.obj(); hi.name="hi"
t=time.time()
low=hi.copy(); low.data=hi.data.copy(); low.name="lulu"; bpy.context.scene.collection.objects.link(low)
bpy.ops.object.select_all(action="DESELECT"); low.select_set(True); bpy.context.view_layer.objects.active=low
m=low.modifiers.new("dec","DECIMATE"); m.ratio=NT/len(low.data.polygons); bpy.ops.object.modifier_apply(modifier="dec")
print("decimated",len(low.data.polygons),"faces",len(low.data.vertices),"verts",round(time.time()-t),"s")
for p in low.data.polygons: p.use_smooth=True
while low.data.uv_layers: low.data.uv_layers.remove(low.data.uv_layers[0])
low.data.uv_layers.new(name="UVMap")
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=0.004,area_weight=0.0)
bpy.ops.object.mode_set(mode="OBJECT")
# 新材质 + 两张新贴图
col=bpy.data.images.new("lulu_color",2048,2048,alpha=False); nor=bpy.data.images.new("lulu_normal",1024,1024,alpha=False); nor.colorspace_settings.name="Non-Color"
mat=bpy.data.materials.new("lulu"); mat.use_nodes=True; nt=mat.node_tree; bsdf=nt.nodes["Principled BSDF"]
tc=nt.nodes.new("ShaderNodeTexImage"); tc.image=col; tn=nt.nodes.new("ShaderNodeTexImage"); tn.image=nor; nm=nt.nodes.new("ShaderNodeNormalMap")
low.data.materials.clear(); low.data.materials.append(mat)
sc=bpy.context.scene; sc.render.engine="CYCLES"; sc.cycles.device="CPU"; sc.cycles.samples=4
bk=sc.render.bake; bk.use_selected_to_active=True; bk.cage_extrusion=0.006; bk.max_ray_distance=0.03; bk.margin=12; bk.use_clear=True
bpy.ops.object.select_all(action="DESELECT"); hi.select_set(True); low.select_set(True); bpy.context.view_layer.objects.active=low
nt.nodes.active=tc; bk.use_pass_direct=False; bk.use_pass_indirect=False; bk.use_pass_color=True
t=time.time(); bpy.ops.object.bake(type="DIFFUSE"); print("bake color",round(time.time()-t),"s")
nt.nodes.active=tn; t=time.time(); bpy.ops.object.bake(type="NORMAL"); print("bake normal",round(time.time()-t),"s")
nt.links.new(tc.outputs[0],bsdf.inputs["Base Color"]); nt.links.new(tn.outputs[0],nm.inputs["Color"]); nt.links.new(nm.outputs[0],bsdf.inputs["Normal"])
bsdf.inputs["Metallic"].default_value=0; bsdf.inputs["Roughness"].default_value=0.75; bsdf.inputs["Specular IOR Level"].default_value=0.3
col.pack(); nor.pack()
bpy.data.objects.remove(hi)
bpy.ops.wm.save_as_mainfile(filepath=out+"/low.blend")
np.save(out+"/co.npy",hl.get_co(low))
