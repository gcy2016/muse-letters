import json, numpy as np, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
rng=np.random.default_rng(7)
W,H=int(sys.argv[1]),int(sys.argv[2]); OUT=sys.argv[3]
D='/tmp/w/'
def yahoo(n):
    c=[x for x in json.load(open(D+n+'.json'))['chart']['result'][0]['indicators']['quote'][0]['close'] if x]; return np.array(c)
def tx(n,k): return np.array([float(r[2]) for r in json.load(open(D+n+'.tx.json'))['data'][k]['week']])
series=[yahoo('gspc'),tx('csi','sh000300'),yahoo('ixic'),tx('chinext','sz399006')]
rets=[s/s[0]-1 for s in series]
rets=[np.convolve(np.pad(r,(3,3),mode='edge'),np.ones(7)/7,'valid') for r in rets]
names=['标普500','沪深300','纳斯达克综合','创业板指']
for n,r in zip(names,rets): print(n,len(r),round(r.min(),3),round(r.max(),3),round(r[-1],3))
# value noise
def vnoise(shape,cells,seed):
    g=np.random.default_rng(seed).random((cells[0]+2,cells[1]+2))
    ys=np.linspace(0,cells[0],shape[0],endpoint=False); xs=np.linspace(0,cells[1],shape[1],endpoint=False)
    y0=ys.astype(int);x0=xs.astype(int);fy=ys-y0;fx=xs-x0
    fy=fy*fy*(3-2*fy);fx=fx*fx*(3-2*fx)
    a=g[np.ix_(y0,x0)];b=g[np.ix_(y0,x0+1)];c=g[np.ix_(y0+1,x0)];d=g[np.ix_(y0+1,x0+1)]
    return (a*(1-fx)+b*fx)*(1-fy[:,None])+(c*(1-fx)+d*fx)*fy[:,None]
def fbm(shape,base,seed,oct=6):
    t=0;amp=1;tot=0
    for i in range(oct):
        t=t+amp*vnoise(shape,(base[0]*2**i,base[1]*2**i),seed+i);tot+=amp;amp*=0.5
    return t/tot
# grid
XMIN,XMAX,ZMIN,ZMAX=-80,80,0,170
NX,NZ=1600,1700
xs=np.linspace(XMIN,XMAX,NX);zs=np.linspace(ZMIN,ZMAX,NZ)
X,Z=np.meshgrid(xs,zs)
n1=fbm((NZ,NX),(8,8),1);n2=fbm((NZ,NX),(30,30),20);n3=fbm((NZ,NX),(4,4),40)
widths=21; gap_in=1.5; gap_out=13
starts=[]; x=-(4*widths+2*gap_in+gap_out)/2
for i in range(4):
    starts.append(x); x+=widths+(gap_in if i%2==0 else gap_out if i==1 else gap_in)
K=26.0; BASE=5.5   # units per 100% return; height at zero baseline
hm=np.zeros((NZ,NX)); tint=np.zeros((NZ,NX)); rid=-np.ones((NZ,NX),int)
ZC=70
for i,(s0,r) in enumerate(zip(starts,rets)):
    t=np.clip((X-s0)/widths,0,1)
    ret=np.interp(t,np.linspace(0,1,len(r)),r)
    ret=np.convolve(np.pad(ret,0),np.ones(1))[:0] if False else ret
    Hh=np.maximum(BASE+K*ret,1.2)
    # smooth the ridge height a bit along x
    zc=ZC+7*(n3-0.5)*2+ (i%2)*2
    w=6.5+3*n1
    prof=np.exp(-((Z-zc)/w)**2)
    win=np.clip((X-s0)/3.5,0,1)*np.clip((s0+widths-X)/3.5,0,1); win=win*win*(3-2*win)
    rough=0.8+0.45*(n2*0.6+n1*0.6)
    m=Hh*prof*win*rough
    # ridged detail
    m=m+Hh*prof*win*0.25*np.abs(n2-0.5)*2
    sel=(m>hm)&(m>0.3)
    hm=np.where(sel,m,hm); tint=np.where(sel,ret,tint); rid=np.where(sel,i,rid)
# smooth ridge heights in x slightly to keep it natural
# island foreground
ze=20+3*(fbm((1,NX),(1,6),77)[0]-0.5)*2
ISL=np.clip((ze[None,:]-Z)/1.5,0,1); ISL=ISL*ISL*(3-2*ISL)
isl_h=1.0*ISL+0.15*(n2-0.5)*ISL
hm=np.maximum(hm,0)
hm=np.where(ISL>0.02,np.maximum(hm*0, isl_h),hm)
land=(hm>0.04)
# sea depth variation
gy,gx=np.gradient(hm,zs[1]-zs[0],xs[1]-xs[0])
# camera
cam=np.array([0.0,4.6,0.0]); hfov=np.radians(84)
f=(W/2)/np.tan(hfov/2)
u=np.arange(W)-W/2+0.5; v=np.arange(H)-H/2+0.5
pitch=np.radians(2.0)
U,V=np.meshgrid(u,v)
dx=U/f; dy=-V/f; dz=np.ones_like(U)
# pitch rotation around x
cp,sp=np.cos(pitch),np.sin(pitch)
dy2=dy*cp+dz*sp; dz2=dz*cp-dy*sp
d=np.stack([dx,dy2,dz2],-1); d/=np.linalg.norm(d,axis=-1,keepdims=True)
dx,dy,dz=d[...,0].ravel(),d[...,1].ravel(),d[...,2].ravel()
N=dx.size
def samp(arr,px,pz):
    ix=np.clip(((px-XMIN)/(XMAX-XMIN)*(NX-1)).round().astype(int),0,NX-1)
    iz=np.clip(((pz-ZMIN)/(ZMAX-ZMIN)*(NZ-1)).round().astype(int),0,NZ-1)
    return arr[iz,ix]
tt=np.full(N,-1.0); tcur=np.full(N,0.5); active=np.ones(N,bool)
prev_t=tcur.copy()
idx=np.arange(N)
t=0.5
ids=idx
tc=np.full(N,0.5)
hit=np.zeros(N,bool)
while ids.size and True:
    pass_=False
    break
tc=np.full(N,0.3); alive=np.arange(N)
while alive.size:
    a=alive
    px=cam[0]+dx[a]*tc[a];py=cam[1]+dy[a]*tc[a];pz=cam[2]+dz[a]*tc[a]
    h=samp(hm,px,pz)
    below=(py<h)&(h>0.05)
    hit[a[below]]=True; tt[a[below]]=tc[a[below]]
    step=0.08+0.012*tc[a]
    # also stop rays that exceed range or left above max height going up or below sea
    tc[a]+=step
    keep=(~below)&(tc[a]<ZMAX*1.2)&~((py>40)&(dy[a]>0))&(px>XMIN)&(px<XMAX)&(pz<ZMAX)
    sea=(~below)&(py<=0)&(dy[a]<0)
    keep&=~sea
    alive=a[keep]
# refine hit via bisection
lo=np.maximum(tt-(0.08+0.012*tt),0.1);hi=tt.copy()
hid=np.where(hit)[0]
for _ in range(8):
    mid=(lo+hi)/2
    px=cam[0]+dx[hid]*mid[hid];py=cam[1]+dy[hid]*mid[hid];pz=cam[2]+dz[hid]*mid[hid]
    b=(py<samp(hm,px,pz))
    hi[hid]=np.where(b,mid[hid],hi[hid]);lo[hid]=np.where(b,lo[hid],mid[hid])
tt=np.where(hit,hi,tt)
# sea hit
tsea=np.where(dy<-1e-4,(0-cam[1])/np.minimum(dy,-1e-4),np.inf)
usesea=(~hit)&(tsea<400)
sky=(~hit)&~usesea
# sky
dirs=np.stack([dx,dy,dz],-1)
def lerp(a,b,t): return a+(b-a)*t[...,None]
yy=np.clip(dy,0,1)
sky_h=np.array([0.80,0.88,0.95]);sky_z=np.array([0.36,0.58,0.88])
col=lerp(np.broadcast_to(sky_h,(N,3)).copy(),np.broadcast_to(sky_z,(N,3)).copy(),np.clip(yy*3.2,0,1)**0.7)
sun=np.array([-0.45,0.35,0.82]);sun/=np.linalg.norm(sun)
sd=np.clip(dirs@sun,0,1)
col+= (sd**200)[:,None]*np.array([1.0,0.9,0.6])*0.9 + (sd**8)[:,None]*np.array([0.25,0.2,0.1])
# clouds
cn=fbm((H,W),(3,5),90,6).ravel()
cm=np.clip((cn-0.52)*4.5,0,1)*np.clip(dy*6,0,1)*np.clip(1-dy*1.6,0,1)
col=lerp(col,np.ones((N,3)),cm*0.85)
img=np.zeros((N,3));img[sky]=col[sky]
horizon=np.array([0.80,0.88,0.95])
# sea
def fogmix(c,t,k=0.012):
    f=1-np.exp(-(t*k)**1.4); return c*(1-f[:,None])+horizon*f[:,None]
si=np.where(usesea)[0]
if si.size:
    ts=tsea[si]; px=cam[0]+dx[si]*ts;pz=cam[2]+dz[si]*ts
    wv=np.sin(px*0.9+np.sin(pz*0.7)*2)*0.5+np.sin(pz*1.7+px*0.3)*0.5
    deep=np.array([0.05,0.33,0.66]);shal=np.array([0.22,0.68,0.82])
    mix=np.clip(np.exp(-ts/30),0,1)*0.6
    c=lerp(np.broadcast_to(deep,(si.size,3)).copy(),np.broadcast_to(shal,(si.size,3)).copy(),mix)
    fres=np.clip(1-(-dy[si]),0,1)**8*0.8+0.05
    cs=col[si]
    c=lerp(c,cs,fres)+0.04*wv[:,None]
    c+= ((np.clip(dirs[si]@np.array([-sun[0],sun[1],sun[2]]),0,1))**300)[:,None]*0.6
    img[si]=fogmix(c,ts,0.0018)
# terrain
hi_=np.where(hit)[0]
if hi_.size:
    t_=tt[hi_];px=cam[0]+dx[hi_]*t_;py=cam[1]+dy[hi_]*t_;pz=cam[2]+dz[hi_]*t_
    ix=np.clip(((px-XMIN)/(XMAX-XMIN)*(NX-1)).round().astype(int),0,NX-1)
    iz=np.clip(((pz-ZMIN)/(ZMAX-ZMIN)*(NZ-1)).round().astype(int),0,NZ-1)
    # smoother gradient (sample over wider baseline)
    k=3
    def gat(dzk,dxk):
        return hm[np.clip(iz+dzk,0,NZ-1),np.clip(ix+dxk,0,NX-1)]
    gxx=(gat(0,k)-gat(0,-k))/(2*k*(xs[1]-xs[0]));gzz=(gat(k,0)-gat(-k,0))/(2*k*(zs[1]-zs[0]))
    nrm=np.stack([-gxx,np.ones_like(gxx),-gzz],-1);nrm/=np.linalg.norm(nrm,axis=-1,keepdims=True)
    lam=np.clip(nrm@sun,0,1)
    isl=ISL[iz,ix]>0.5
    h_=hm[iz,ix];tn=tint[iz,ix]
    # mountain colour
    rock=np.array([0.52,0.47,0.43])
    red=np.array([0.86,0.33,0.27]);grn=np.array([0.22,0.62,0.36])
    up=np.clip(tn/0.35,-1,1)
    tcol=np.where((up>0)[:,None],red,grn)
    strength=np.clip(np.abs(up),0.35,1)[:,None]
    slope=np.clip(1-nrm[:,1],0,1)
    base=lerp(np.broadcast_to(tcol,(len(hi_),3)).copy(),np.broadcast_to(rock,(len(hi_),3)).copy(),np.clip(slope*1.2,0,0.5))
    det=fbm((NZ,NX),(60,60),55)[iz,ix]
    base=base*(0.8+0.4*det)[:,None]
    # high altitude lightening
    base=lerp(base,np.broadcast_to(np.array([0.9,0.88,0.86]),base.shape).copy(),np.clip((h_-14)/16,0,0.35))
    # island colours
    grass=np.array([0.45,0.78,0.36])*(0.85+0.3*det)[:,None]
    sand=np.array([0.93,0.84,0.62])
    edge=ISL[iz,ix]
    ic=lerp(grass,np.broadcast_to(sand,grass.shape).copy(),np.clip((0.75-edge)*5,0,1)*0.9)
    cliff=slope>0.25
    ic=np.where(cliff[:,None],np.array([0.62,0.5,0.38]),ic)
    c=np.where(isl[:,None],ic,base)
    c=c*(0.45+0.75*lam)[:,None]
    # soft sky ambient
    c+=0.08*np.array([0.5,0.65,0.9])
    # fake shadow: mountains darker where facing away already; island soft
    img[hi_]=fogmix(c,t_,0.0055)
    # island has little fog
    img[hi_[isl]]=np.where(True,img[hi_[isl]],0)
img=np.clip(img,0,1)
im=Image.fromarray((img.reshape(H,W,3)**(1/1.05)*255).astype(np.uint8))
# post: slight blur for AA
im=im.filter(ImageFilter.GaussianBlur(0.6))
# foreground decorations
S=W/2000
dr=ImageDraw.Draw(im,'RGBA')
def tree(cx,base,sz):
    dr.rectangle([cx-sz*0.07,base-sz*0.9,cx+sz*0.07,base],fill=(110,78,50))
    for (ox,oy,r,c) in [(0,-1.15,0.55,(52,138,62)),(-0.3,-0.95,0.42,(60,150,68)),(0.32,-0.95,0.4,(46,128,58)),(0,-1.4,0.4,(70,160,75))]:
        dr.ellipse([cx+(ox-r)*sz,base+oy*sz-r*sz,cx+(ox+r)*sz,base+oy*sz+r*sz],fill=c)
    dr.ellipse([cx-sz*0.7,base-sz*0.05,cx+sz*0.7,base+sz*0.08],fill=(0,0,0,50))
tree(int(W*0.07),int(H*0.97),int(H*0.17)); tree(int(W*0.13),int(H*0.995),int(H*0.11)); tree(int(W*0.93),int(H*0.985),int(H*0.15))
# fence
fy=int(H*0.955)
for xx in range(int(W*0.30),int(W*0.70),int(W*0.018)):
    dr.rectangle([xx,fy,xx+int(W*0.004),fy+int(H*0.05)],fill=(150,105,66))
dr.rectangle([int(W*0.30),fy+int(H*0.012),int(W*0.70),fy+int(H*0.02)],fill=(166,118,76))
dr.rectangle([int(W*0.30),fy+int(H*0.03),int(W*0.70),fy+int(H*0.038)],fill=(166,118,76))
# labels
fp='/tmp/w/font.otf'
F=lambda s:ImageFont.truetype(fp,int(s*S))
cx_of=lambda x0,x1:None
def screen_x(wx,wz=ZC): return W/2+f*(wx-cam[0])/(wz-cam[2])
def label_y(i):
    # top of range: find max height
    return None
d2=ImageDraw.Draw(im,'RGBA')
for i,(s0,nm,r) in enumerate(zip(starts,names,rets)):
    cx=screen_x(s0+widths/2)
    # find peak screen y
    sl=(xs>=s0)&(xs<=s0+widths); pk=hm[:,sl].max()
    sy=H/2+f*(cam[1]-pk)/(ZC-cam[2])+ (0)
    ty=max(sy-95*S,30*S)
    txt=nm; fnt=F(34)
    w=d2.textlength(txt,font=fnt)
    pill=[cx-w/2-16*S,ty-6*S,cx+w/2+16*S,ty+46*S]
    d2.rounded_rectangle(pill,radius=22*S,fill=(255,255,255,175))
    d2.text((cx-w/2,ty),txt,font=fnt,fill=(50,60,80))
    pct=f"{r[-1]*100:+.0f}%"
    pf=F(24);pw=d2.textlength(pct,font=pf)
    d2.text((cx-pw/2,ty+52*S),pct,font=pf,fill=(190,50,45) if r[-1]>0 else (40,140,70))
# group brackets
def bracket(a,b,label,y):
    xa=screen_x(starts[a]);xb=screen_x(starts[b]+widths)
    d2.line([xa,y,xb,y],fill=(255,255,255,230),width=int(4*S))
    d2.line([xa,y,xa,y+14*S],fill=(255,255,255,230),width=int(4*S));d2.line([xb,y,xb,y+14*S],fill=(255,255,255,230),width=int(4*S))
    fnt=F(30);w=d2.textlength(label,font=fnt)
    d2.text(((xa+xb)/2-w/2,y-42*S),label,font=fnt,fill=(255,255,255,245),stroke_width=int(2*S),stroke_fill=(40,60,90,200))
by=int(H*0.065)
bracket(0,1,"第一组",by);bracket(2,3,"第二组",by)
# title & caption
tf=F(44);d2.text((40*S,H-110*S-40*S+0),"",font=tf)
cap="四座山脉 = 四个指数近五年真实周收盘走势（2021-10 至 2026-10，统一垂直比例，各自以起点为零基准）  ·  红色 = 上涨  绿色 = 下跌  ·  效果图仅为艺术示意，非投资建议"
cf=F(22);cw=d2.textlength(cap,font=cf)
d2.rounded_rectangle([W/2-cw/2-18*S,H-52*S,W/2+cw/2+18*S,H-12*S],radius=16*S,fill=(255,255,255,190))
d2.text((W/2-cw/2,H-46*S),cap,font=cf,fill=(50,60,80))
tf=F(40);d2.text((36*S,H*0.5+0),"",font=tf)
im.save(OUT)
