import sys, bpy, bmesh, numpy as np
sys.path.insert(0, sys.argv[3]); import hl
src,out=sys.argv[1],sys.argv[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
o=hl.obj(); print("meshes",len([x for x in bpy.data.objects if x.type=="MESH"]))
bpy.context.view_layer.objects.active=o; o.select_set(True)
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bm=bmesh.new(); bm.from_mesh(o.data); bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=1e-6)
print("verts",len(bm.verts),"faces",len(bm.faces),"nonmanifold",sum(1 for e in bm.edges if not e.is_manifold))
bm.to_mesh(o.data); bm.free()
for p in o.data.polygons: p.use_smooth=True
bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=out+"/base.blend")
co=hl.get_co(o); tris=hl.tris(o); np.save(out+"/co.npy",co); np.save(out+"/tris.npy",tris)
print("bbox",co.min(0),co.max(0))
# 连通块
import scipy.sparse as sp, scipy.sparse.csgraph as cg
n=len(co); A=sp.coo_matrix((np.ones(len(tris)*3),(tris.ravel(),np.roll(tris,1,1).ravel())),shape=(n,n))
k,lab=cg.connected_components(A,directed=False); cnt=np.bincount(lab); order=np.argsort(-cnt)
print("components",k)
for i in order[:15]:
    p=co[lab==i]; print(" n=%d ctr=%s size=%s"%(cnt[i],np.round(p.mean(0),3),np.round(p.max(0)-p.min(0),3)))
np.save(out+"/lab.npy",lab)
c=(0,0,(co[:,2].max())/2); sc=max(co.max(0)-co.min(0))*1.08
for nm,d in (("front",(0,-1,0)),("back",(0,1,0)),("side",(1,0,0)),("q",(0.7,-1,0.25)),("bottom",(0,0,-1)),("top",(0,0.01,1))):
    hl.shot(o,f"{out}/clay_{nm}.png",d,sc,c,"clay"); 
    if nm in("front","back","side","q"): hl.shot(o,f"{out}/flat_{nm}.png",d,sc,c,"flat")
