# 纯 numpy 的形变函数（并腿、抹平），fix.py 调用
import numpy as np, scipy.sparse as sp
def ss(e0,e1,v):
    t=np.clip((v-e0)/(e1-e0),0,1); return t*t*(3-2*t)
def adjacency(n,tris):
    i=np.concatenate([tris[:,0],tris[:,1],tris[:,2],tris[:,1],tris[:,2],tris[:,0]])
    j=np.concatenate([tris[:,1],tris[:,2],tris[:,0],tris[:,0],tris[:,1],tris[:,2]])
    A=sp.csr_matrix((np.ones(len(i)),(i,j)),shape=(n,n)); A.data[:]=1
    d=np.asarray(A.sum(1)).ravel(); return sp.diags(1/np.maximum(d,1))@A
def smooth(co,P,w,iters,lam=0.6,taubin=False):
    """w: 每个点的抹平强度 0..1；taubin=True 时不缩水（只去小起伏）"""
    co=co.copy(); idx=np.nonzero(w>1e-4)[0]
    if len(idx)==0: return co
    Ps=P[idx]; ww=w[idx,None]
    for k in range(iters):
        co[idx]+=lam*ww*(Ps@co-co[idx])
        if taubin: co[idx]-=0.63*ww*(Ps@co-co[idx])
    return co
def rot_xz(p,piv,ang):
    """绕过 piv、沿 y 轴的直线转 ang（每个点一个角度）"""
    c,s=np.cos(ang),np.sin(ang); dx=p[:,0]-piv[0]; dz=p[:,2]-piv[2]; q=p.copy()
    q[:,0]=piv[0]+dx*c+dz*s; q[:,2]=piv[2]-dx*s+dz*c; return q
def close_legs(co,theta=np.radians(33),piv=(0.11,0.22),t0=0.0,t1=0.10,ankle_z=0.085,foot=(0.11,0.045)):
    out=co.copy(); info={}
    for sgn in (1,-1):
        p=co.copy(); p[:,0]*=sgn                      # 都当成右腿算
        dx=p[:,0]-piv[0]; dz=p[:,2]-piv[1]
        t=dx*np.sin(theta)-dz*np.cos(theta)           # 沿腿方向离髋多远
        w=ss(t0,t1,t)*ss(0.0,0.035,p[:,0])*(p[:,2]<0.5)
        q=rot_xz(p,(piv[0],0,piv[1]),theta*w)
        # 脚：绕脚踝转回去，脚底重新放平
        wf=ss(foot[0],foot[1],q[:,2])*(w>0.5)
        ank=(piv[0],0,ankle_z)
        q=rot_xz(q,ank,-theta*wf)
        m=w>0; q[:,0]*=sgn; out[m]=q[m]; info[sgn]=w
    return out,info
def fit_sphere(p):
    A=np.c_[2*p,np.ones(len(p))]; b=(p**2).sum(1); s=np.linalg.lstsq(A,b,rcond=None)[0]
    c=s[:3]; return c,np.sqrt(s[3]+c@c)
def to_sphere(co,mask_w,c=None,pct=35):
    """把 mask_w>0 的点按权重压到一个球面上（去掉尖刺）"""
    idx=np.nonzero(mask_w>0.5)[0]
    if c is None: c,_=fit_sphere(co[idx])
    r=np.linalg.norm(co[idx]-c,axis=1); R=np.percentile(r,pct)
    idx=np.nonzero(mask_w>0)[0]; d=co[idx]-c; r=np.linalg.norm(d,axis=1)[:,None]
    out=co.copy(); out[idx]=co[idx]+(mask_w[idx,None])*(c+d/r*R-co[idx]); return out,c,R
def box(co,lo,hi,soft=0.01):
    w=np.ones(len(co))
    for a in range(3):
        if lo[a] is not None: w*=ss(lo[a]-soft,lo[a]+soft,co[:,a])
        if hi[a] is not None: w*=ss(hi[a]+soft,hi[a]-soft,co[:,a])
    return w
