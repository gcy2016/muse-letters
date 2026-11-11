# V3 修模：抹褶子、修嘴角（把右边好的嘴角镜像到左边）、淡化背后缝线
import sys, bpy, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
W=sys.argv[1]; d=sys.argv[2]; out=sys.argv[3]; MOUTH_IT=int(sys.argv[4]); sys.path.insert(0,W); import hl, deform as D
ss=D.ss
bpy.ops.wm.open_mainfile(filepath=d+"/clean.blend"); o=hl.obj()
co0=hl.get_co(o); tris=hl.tris(o); n=len(co0); P=D.adjacency(n,tris); vc=np.load(d+"/vcol.npy")
co=co0.copy(); x,y,z=co0.T; ax=np.abs(x)
skin=ss(0.60,0.66,vc[:,1]/np.maximum(vc[:,0],1e-3))
skin=np.clip(P@(P@skin),0,1)                                   # 边界柔一点
# 1 身体、胳膊、腿上的褶子和小疙瘩
w=skin*ss(0.66,0.62,z)*(1-0.8*ss(0.10,0.07,z))*(1-0.6*ss(0.40,0.43,ax))
co=D.smooth(co,P,w,60)
# 2 耳朵背面
co=D.smooth(co,P,(ax>0.15)*(z>0.97)*ss(0.0,0.02,y),25)
# 3 嘴：上嘴唇鼓包两侧的陡坎抹缓（形状本身左右是对称的）
lip=ss(0.085,0.05,np.hypot(x,z-0.705))*(y<-0.12)
co=D.smooth(co,P,lip,MOUTH_IT)
# 4 缝线：背后淡化，额头抹掉
band=ss(0.016,0.008,ax)
co=D.smooth(co,P,band*(y>0)*np.maximum(skin,z>0.66)*0.8,30)
co[:,2]-=co[:,2].min()
hl.set_co(o,co); np.save(out+"/co.npy",co); bpy.ops.wm.save_as_mainfile(filepath=out+"/fixed.blend")
print("max move",np.abs(co-co0).max())
c=(0,0,0.582)
for nm,dd in (("front",(0,-1,0)),("back",(0,1,0)),("side",(1,0,0)),("q",(0.7,-1,0.25)),("bq",(-0.7,1,0.25))):
    hl.shot(o,f"{out}/clay_{nm}.png",dd,1.257,c,"clay")
for nm,dd,sc,cc in (("mouth",(0,-1,-0.15),0.32,(0,-0.2,0.70)),("mouthL",(0.8,-1,0),0.32,(0.05,-0.2,0.70)),
    ("backwaist",(0,1,0.1),0.6,(0,0.2,0.45)),("backlegs",(0,1,0),0.5,(0,0.1,0.15)),("sideR",(1,0.2,0),0.5,(0.24,0,0.33)),("headback",(0.5,1,0.2),0.5,(0,0.05,0.95))):
    hl.shot(o,f"{out}/cu_{nm}.png",dd,sc,cc,"clay")

for nm,dd,mode,rk in (("a",(0,-1,0),"clay",0.8),("b",(0,-1,0),"clay",-0.3),("c",(0,-1,0),"tex",0.3),("d",(0.7,-1,0.1),"tex",0.3),("e",(0,-1,0),"tex",-0.8),("f",(0,-1,0),"tex",0.8)):
    hl.shot(o,f"{out}/mm_{nm}.png",dd,0.34,(0,-0.2,0.72),mode,rake=rk)
