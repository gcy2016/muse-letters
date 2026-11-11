import sys, bpy, numpy as np
W=sys.argv[1]; d=sys.argv[2]; sys.path.insert(0,W); import hl
bpy.ops.wm.open_mainfile(filepath=d+"/clean.blend"); o=hl.obj()
co=hl.get_co(o); uv=hl.loop_uv(o); lv=hl.loop_vert(o); px=hl.get_px(hl.base_image())
vuv=np.zeros((len(co),2),np.float32); vuv[lv]=uv; vc=hl.sample(px,vuv)[:,:3]; np.save(d+"/vcol.npy",vc)
x,y,z=co.T; r,g,b=vc.T; gr=g/np.maximum(r,1e-3)
def st(nm,m): print(nm,m.sum(),"rgb",np.round(np.median(vc[m],0),3),"g/r pct",np.round(np.percentile(gr[m],[5,50,95]),3))
st("shorts back",(z>0.25)&(z<0.38)&(y>0.15)&(abs(x)>0.08)); st("skin back",(z>0.5)&(z<0.6)&(y>0.15)); st("leg",(z>0.1)&(z<0.17)); 
# 眼睛：暗的点
dark=(r+g+b<1.2)&(z>0.7); print("dark n",dark.sum())
for s in (1,-1):
    m=dark&(x*s>0); print(" eye",s,np.round(co[m].mean(0),3),np.round(co[m].min(0),3),np.round(co[m].max(0),3))
# 短裤范围
orange=(gr<0.62)&(z<0.6)
for yy,nm in ((-1,"front"),(1,"back")):
    m=orange&(y*yy>0.1)&(abs(x)<0.05); print("shorts z",nm,np.round(np.percentile(z[m],[0.5,99.5]),3))
m=orange&(abs(x)>0.2); print("shorts side z",np.round(np.percentile(z[m],[0.5,99.5]),3))
# 侧缝上的黄斑
for s in (1,-1):
    m=(x*s>0.2)&(z>0.2)&(z<0.44)&(gr>0.68)&(abs(y)<0.12)
    print("mark",s,m.sum(),"y",np.round(np.percentile(y[m],[1,50,99]),3),"z",np.round(np.percentile(z[m],[1,25,50,75,99]),3))
# 嘴：正面 z 0.66-0.74 的截面
for zz in (0.68,0.69,0.70,0.71,0.72):
    m=(abs(z-zz)<0.002)&(y<-0.15)&(abs(x)<0.08); print("z",zz,"ymin",round(y[m].min(),3))
for zz in np.arange(0.56,0.70,0.02):
    m=abs(z-zz)<0.003; print("z %.2f x %.3f..%.3f y %.3f..%.3f"%(zz,x[m].min(),x[m].max(),y[m].min(),y[m].max()))
