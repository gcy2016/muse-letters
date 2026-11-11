# 删掉漂在外面的小碎片，另存底稿
import sys, bpy, bmesh, numpy as np
W=sys.argv[1]; d=sys.argv[2]; sys.path.insert(0,W); import hl
bpy.ops.wm.open_mainfile(filepath=d+"/base.blend"); o=hl.obj()
lab=np.load(d+"/lab.npy"); main=np.bincount(lab).argmax()
bm=bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm,geom=[v for v in bm.verts if lab[v.index]!=main],context="VERTS")
bm.to_mesh(o.data); bm.free(); o.data.update()
bpy.ops.wm.save_as_mainfile(filepath=d+"/clean.blend")
co=hl.get_co(o); np.save(d+"/co.npy",co); np.save(d+"/tris.npy",hl.tris(o)); print("verts",len(co))
for s,nm in ((1,"R"),(-1,"L")):
    hl.shot(o,f"{d}/bit{nm}.png",(s,-0.3,0),0.3,(s*0.24,-0.03,0.32),"clay",rake=1.2)
    hl.shot(o,f"{d}/bit{nm}_t.png",(s,-0.3,0),0.3,(s*0.24,-0.03,0.32),"flat")
