# 贴图修补：短裤两侧的黄斑、右嘴角的红点。按 3D 位置从旁边/对面取颜色填回去。
import sys, bpy, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
W=sys.argv[1]; src=sys.argv[2]; out=sys.argv[3]; sys.path.insert(0,W); import hl
bpy.ops.wm.open_mainfile(filepath=src); o=hl.obj()
co=hl.get_co(o).astype(np.float64); tris=hl.tris(o); uv=hl.loop_uv(o).astype(np.float64).reshape(-1,3,2)   # 每个三角形 3 个角的 uv
im=hl.base_image(); px=hl.get_px(im); orig=px.copy(); H,Wd=px.shape[:2]
cen=co[tris].mean(1)
def texels(sel):
    """sel 里每个三角形盖住的贴图像素 → (行, 列, 三角形号, 重心坐标)"""
    R=[];C=[];T=[];B=[]
    for t in sel:
        p=uv[t]*[Wd,H]-0.5; mn=np.floor(p.min(0)-1).astype(int); mx=np.ceil(p.max(0)+1).astype(int)
        xs,ys=np.meshgrid(np.arange(mn[0],mx[0]+1),np.arange(mn[1],mx[1]+1)); q=np.c_[xs.ravel(),ys.ravel()].astype(float)
        a,b,c=p; den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(den)<1e-9: continue
        l0=((b[1]-c[1])*(q[:,0]-c[0])+(c[0]-b[0])*(q[:,1]-c[1]))/den; l1=((c[1]-a[1])*(q[:,0]-c[0])+(a[0]-c[0])*(q[:,1]-c[1]))/den; l2=1-l0-l1
        e=0.9/max(np.sqrt(abs(den)),1.0)               # 边上多盖一点，免得接缝漏
        m=(l0>-e)&(l1>-e)&(l2>-e)&(q[:,0]>=0)&(q[:,0]<Wd)&(q[:,1]>=0)&(q[:,1]<H)
        R.append(q[m,1].astype(int));C.append(q[m,0].astype(int));T.append(np.full(m.sum(),t));B.append(np.c_[l0,l1,l2][m])
    return np.concatenate(R),np.concatenate(C),np.concatenate(T),np.concatenate(B)
def lookup(bvh,sub,pts):
    """pts 这些 3D 点在模型表面最近处的贴图颜色"""
    U=np.zeros((len(pts),2))
    for k,p in enumerate(pts):
        loc,nor,fi,dist=bvh.find_nearest(Vector(p)); t=sub[fi]; a,b,c=co[tris[t]]; v0=b-a; v1=c-a; v2=np.array(loc)-a
        d00=v0@v0; d01=v0@v1; d11=v1@v1; d20=v2@v0; d21=v2@v1; den=d00*d11-d01*d01
        v=(d11*d20-d01*d21)/den; w=(d00*d21-d01*d20)/den; U[k]=uv[t,0]*(1-v-w)+uv[t,1]*v+uv[t,2]*w
    return hl.sample(orig,U)
def mkbvh(m):
    sub=np.nonzero(m)[0]; return BVHTree.FromPolygons([Vector(v) for v in co],tris[sub].tolist()),sub
gr=lambda c:c[:,1]/np.maximum(c[:,0],1e-3); lum=lambda c:c[:,:3].mean(1)
# A 短裤两侧：只改侧缝附近、朝外的面上发黄或发暗的小块
nrm=np.cross(co[tris[:,1]]-co[tris[:,0]],co[tris[:,2]]-co[tris[:,0]]); nrm/=np.maximum(np.linalg.norm(nrm,axis=1),1e-12)[:,None]
for s in (1,-1):
    outer=(nrm[:,0]*s>0.5)&(cen[:,0]*s>0.20)&(cen[:,2]>0.205)&(cen[:,2]<0.438)
    sel=np.nonzero(outer&(cen[:,1]>-0.065)&(cen[:,1]<0.06))[0]
    bvh,sub=mkbvh(outer&(np.abs(cen[:,1])<0.13))
    r,c,t,b=texels(sel); pos=np.einsum("ni,nij->nj",b,co[tris[t]]); cur=orig[r,c]
    # 每 1.5 厘米高度取一次这一带短裤的正常颜色（中位数），偏黄或偏暗的像素换成它
    zb=np.floor(pos[:,2]/0.015).astype(int); ref=np.zeros_like(cur); g=gr(cur); L=lum(cur); bad=np.zeros(len(r),bool)
    for k in np.unique(zb):
        m=zb==k; med=np.median(cur[m],0); mg=med[1]/med[0]; ml=med[:3].mean()
        bad[m]=(g[m]>mg+0.045)|(L[m]<ml-0.08)|(g[m]<mg-0.06)
        ref[m]=med
        print("  z%.3f n=%d med g/r %.3f lum %.3f flagged %d"%(k*0.015,m.sum(),mg,ml,bad[m].sum()))
    mask=np.zeros((H,Wd),bool); mask[r[bad],c[bad]]=True
    for k in range(3): mask=mask|np.roll(mask,1,0)|np.roll(mask,-1,0)|np.roll(mask,1,1)|np.roll(mask,-1,1)
    bad=mask[r,c]
    px[r[bad],c[bad]]=ref[bad]; print("side",s,"texels",len(r),"replaced",bad.sum())
# B 右嘴角红点：取对面（左嘴角）同一位置的颜色
for ctr,rad in (((0.052,0.693),0.02),):
    d=np.hypot(cen[:,0]-ctr[0],cen[:,2]-ctr[1]); sel=np.nonzero((d<rad+0.004)&(cen[:,1]<-0.12))[0]
    bvh,sub=mkbvh((cen[:,0]<0)&(cen[:,1]<-0.1)&(cen[:,2]>0.62)&(cen[:,2]<0.78))
    r,c,t,b=texels(sel); pos=np.einsum("ni,nij->nj",b,co[tris[t]]); ref=lookup(bvh,sub,pos*[-1,1,1])
    w=np.clip((rad-np.hypot(pos[:,0]-ctr[0],pos[:,2]-ctr[1]))/0.006,0,1)[:,None]
    px[r,c]=orig[r,c]*(1-w)+ref*w; print("mouth texels",len(r))
hl.set_px(im,px); im.pack()
bpy.ops.wm.save_as_mainfile(filepath=out+"/final.blend")
for s,nm in ((1,"R"),(-1,"L")): hl.shot(o,f"{out}/t_side{nm}.png",(s,-0.3,0),0.3,(s*0.24,-0.03,0.32),"flat")
hl.shot(o,out+"/t_mouth.png",(0,-1,0),0.34,(0,-0.2,0.72),"flat")
hl.shot(o,out+"/t_mouth2.png",(0.6,-1,0),0.34,(0,-0.2,0.72),"tex",rake=0.3)
