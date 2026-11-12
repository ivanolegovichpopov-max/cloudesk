# Генератор базовых заставок: python3 walls/generate.py walls
import random, math, sys
W,H=1600,1000
out=sys.argv[1]
def ridge(seed, base, amp, n=9, rough=0.35, close=H):
    r=random.Random(seed)
    xs=[i*W/(n-1) for i in range(n)]
    ys=[base - amp*(0.5+0.5*math.sin(i*1.3+seed))*r.uniform(0.6,1.0) + r.uniform(-amp,amp)*rough for i in range(n)]
    pts=list(zip(xs,ys))
    d=f"M0 {close} L0 {pts[0][1]:.0f} "
    for i in range(1,len(pts)):
        x0,y0=pts[i-1]; x1,y1=pts[i]
        mx=(x0+x1)/2
        d+=f"C{mx:.0f} {y0:.0f} {mx:.0f} {y1:.0f} {x1:.0f} {y1:.0f} "
    d+=f"L{W} {close} Z"
    return d,pts
def peaks(seed, base, amp, n=7, close=H):
    r=random.Random(seed)
    d=f"M0 {close} L0 {base} "
    x=0
    pts=[]
    while x<W:
        w=r.uniform(W/n*0.7,W/n*1.3)
        px=x+w/2; py=base-amp*r.uniform(0.45,1)
        d+=f"L{px:.0f} {py:.0f} L{x+w:.0f} {base-r.uniform(0,amp*0.25):.0f} "
        pts.append((px,py,w)); x+=w
    d+=f"L{W} {close} Z"
    return d,pts
def pines(seed, y_at, color, count, hmin, hmax, x0=0, x1=W):
    r=random.Random(seed); s=""
    for _ in range(count):
        x=r.uniform(x0,x1); h=r.uniform(hmin,hmax); y=y_at(x)+4; w=h*0.32
        s+=f"M{x:.0f} {y-h:.0f}L{x+w:.0f} {y:.0f}L{x-w:.0f} {y:.0f}Z"
    return f'<path fill="{color}" d="{s}"/>'
def interp(pts):
    def f(x):
        for i in range(1,len(pts)):
            if pts[i][0]>=x:
                (a,b),(c,d)=pts[i-1],pts[i]; t=(x-a)/(c-a); t=(1-math.cos(t*math.pi))/2
                return b+(d-b)*t
        return pts[-1][1]
    return f
def stars(seed,n,ymax,col="#fff"):
    r=random.Random(seed); s=""
    for _ in range(n):
        x=r.uniform(0,W); y=r.uniform(0,ymax)**1.0; rr=r.choice([0.8,1,1.2,1.6])
        s+=f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{rr}" opacity="{r.uniform(.35,.95):.2f}"/>'
    return f'<g fill="{col}">{s}</g>'
def mist(id,c,op):
    return f'<linearGradient id="{id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{c}" stop-opacity="0"/><stop offset=".5" stop-color="{c}" stop-opacity="{op}"/><stop offset="1" stop-color="{c}" stop-opacity="0"/></linearGradient>'
def svg(defs,body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice"><defs>{defs}</defs>{body}</svg>'
def lg(id,stops,x2=0,y2=1):
    return f'<linearGradient id="{id}" x1="0" y1="0" x2="{x2}" y2="{y2}">'+"".join(f'<stop offset="{o}" stop-color="{c}"/>' for o,c in stops)+'</linearGradient>'
def rg(id,c,op=1):
    return f'<radialGradient id="{id}"><stop offset="0" stop-color="{c}" stop-opacity="{op}"/><stop offset="1" stop-color="{c}" stop-opacity="0"/></radialGradient>'
files={}

# Закат — горы в лиловом закате, низкое солнце
d=[ridge(11,620,160)[0],ridge(12,700,140)[0],ridge(13,790,110)[0],ridge(14,880,80)[0]]
files['dusk']=svg(lg('s',[(0,'#241c3a'),(.45,'#6b3a5f'),(.8,'#d9774f'),(1,'#f2a765')])+rg('g','#ffd29a',.9),
 '<rect width="1600" height="1000" fill="url(#s)"/><circle cx="1050" cy="640" r="260" fill="url(#g)"/><circle cx="1050" cy="640" r="70" fill="#ffd9a3"/>'
 +f'<path fill="#8a4a63" d="{d[0]}"/><path fill="#6a3555" d="{d[1]}"/><path fill="#4a2646" d="{d[2]}"/><path fill="#2c1a33" d="{d[3]}"/>')

# Абрикос — дюны
dd=[ridge(21,640,70,7,0.2)[0],ridge(22,720,80,6,0.2)[0],ridge(23,820,70,6,0.25)[0],ridge(24,910,50,5,0.2)[0]]
files['apricot']=svg(lg('s',[(0,'#d98e62'),(.5,'#f2c49a'),(1,'#f7dcb9')])+rg('g','#fff2dc',.9),
 '<rect width="1600" height="1000" fill="url(#s)"/><circle cx="420" cy="420" r="220" fill="url(#g)"/><circle cx="420" cy="420" r="60" fill="#fff4e2"/>'
 +f'<path fill="#e9a171" d="{dd[0]}"/><path fill="#d9845a" d="{dd[1]}"/><path fill="#bd6646" d="{dd[2]}"/><path fill="#94473a" d="{dd[3]}"/>')

# Озеро — горы, лес, вода с отражением
pk,_=peaks(31,560,230,6,560)
far,fp=ridge(32,600,60,10,0.4,600)
fy=interp(fp)
files['lake']=svg(lg('s',[(0,'#0d2638'),(.5,'#1f5d77'),(1,'#9fd0d0')])+lg('w',[(0,'#5e9fae'),(1,'#0c2a3a')]),
 '<rect width="1600" height="1000" fill="url(#s)"/>'
 +f'<path fill="#2c6680" d="{pk}"/><path fill="#173f55" d="{far}"/>'+pines(33,fy,'#0f3043',90,40,90)
 +'<rect y="598" width="1600" height="402" fill="url(#w)"/><rect y="598" width="1600" height="3" fill="#cfe9ea" opacity=".25"/>'
 +f'<g transform="translate(0 1200) scale(1 -1)" opacity=".28"><path fill="#2c6680" d="{pk}"/><path fill="#173f55" d="{far}"/></g>'
 +'<g stroke="#cfe9ea" stroke-opacity=".35" stroke-width="2" stroke-linecap="round"><path d="M300 690h140M900 740h220M600 820h120M1200 880h160M180 900h90"/></g>')

# Горы — снежные пики в дымке
p1,pp1=peaks(41,640,330,5); p2,_=peaks(42,740,260,6); p3,_=peaks(43,850,200,7)
caps=""
for (x,y,w) in pp1:
    caps+=f"M{x:.0f} {y:.0f}L{x+w*0.12:.0f} {y+w*0.14:.0f}L{x+w*0.04:.0f} {y+w*0.12:.0f}L{x-w*0.03:.0f} {y+w*0.17:.0f}L{x-w*0.12:.0f} {y+w*0.13:.0f}Z"
files['peaks']=svg(lg('s',[(0,'#6f86aa'),(.5,'#b9aecb'),(1,'#e7cfd2')])+mist('m1','#efe4ec',.55)+mist('m2','#e0d0de',.45),
 '<rect width="1600" height="1000" fill="url(#s)"/>'
 +f'<path fill="#8c87a6" d="{p1}"/><path fill="#f4f1f7" opacity=".9" d="{caps}"/>'
 +'<rect y="520" width="1600" height="240" fill="url(#m1)"/>'
 +f'<path fill="#625a7c" d="{p2}"/><rect y="660" width="1600" height="200" fill="url(#m2)"/><path fill="#3b3350" d="{p3}"/>')

# Мох — холмы с хвойным лесом в тумане
h1,a=ridge(51,560,80,8,0.3); h2,b=ridge(52,680,90,8,0.3); h3,c=ridge(53,820,80,8,0.3)
files['moss']=svg(lg('s',[(0,'#5d7458'),(.55,'#b9c9a2'),(1,'#dfe6c9')])+mist('m','#e7ecd7',.6),
 '<rect width="1600" height="1000" fill="url(#s)"/>'
 +f'<path fill="#9fb184" d="{h1}"/>'+pines(54,interp(a),'#8aa071',120,30,60)
 +'<rect y="520" width="1600" height="260" fill="url(#m)"/>'
 +f'<path fill="#5f7a4b" d="{h2}"/>'+pines(55,interp(b),'#4d6a3d',90,60,120)
 +f'<path fill="#2f4628" d="{h3}"/>'+pines(56,interp(c),'#22361e',60,110,200))

# Графит — каменные гряды в тумане, монохром, бледная луна
g1,_=ridge(61,600,120,9,0.5); g2,_=ridge(62,700,110,9,0.5); g3,_=ridge(63,820,90,9,0.5); g4,_=ridge(64,920,60,8,0.5)
files['graphite']=svg(lg('s',[(0,'#2b2d33'),(.6,'#4a4d55'),(1,'#6d7078')])+rg('g','#d9dbe0',.35),
 '<rect width="1600" height="1000" fill="url(#s)"/><circle cx="1180" cy="300" r="200" fill="url(#g)"/><circle cx="1180" cy="300" r="48" fill="#d6d8dd" opacity=".85"/>'
 +f'<path fill="#5a5d65" d="{g1}"/><path fill="#45484f" d="{g2}"/><path fill="#33353b" d="{g3}"/><path fill="#222328" d="{g4}"/>')

# Ночь — звёзды, луна, тёмные холмы
n1,_=ridge(71,760,90,8,0.3); n2,q=ridge(72,860,70,8,0.3)
files['night']=svg(lg('s',[(0,'#070912'),(.6,'#141a33'),(1,'#2a3460')])+rg('g','#9fb4ff',.35),
 '<rect width="1600" height="1000" fill="url(#s)"/>'+stars(73,180,720)
 +'<circle cx="380" cy="260" r="180" fill="url(#g)"/><circle cx="380" cy="260" r="46" fill="#e9eeff"/><circle cx="398" cy="248" r="40" fill="#141a33" opacity=".0"/>'
 +f'<path fill="#151a30" d="{n1}"/><path fill="#0a0d1a" d="{n2}"/>'+pines(74,interp(q),'#070912',40,40,90))
for k,v in files.items():
    open(f"{out}/{k}.svg","w").write(v)
    print(k,len(v))
