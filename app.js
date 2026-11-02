const $=s=>document.querySelector(s);
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const COL=['#5b5bf0','#10b981','#f59e0b','#ec4899','#06b6d4','#ef4444','#8b5cf6'];
let files=[],pages=[],sel=new Set(),hist=[],uid=0,thumbs={},last=null,dragIds=[],loading=false,cropId=null,cr={l:.05,t:.05,r:.05,b:.05};
const key=p=>p.fi<0?'b':p.fi+':'+p.pn;
const busy=(m)=>{$('#bt').textContent=m||'';$('#busy').classList.toggle('on',!!m)};
const snap=()=>{hist.push(JSON.stringify(pages));if(hist.length>80)hist.shift()};

/* tema */
(function(){try{const t=localStorage.getItem('th');if(t)document.documentElement.dataset.theme=t}catch(e){}})();
$('#bTheme').onclick=()=>{const d=document.documentElement,dark=d.dataset.theme?d.dataset.theme==='dark':matchMedia('(prefers-color-scheme:dark)').matches;d.dataset.theme=dark?'light':'dark';try{localStorage.setItem('th',d.dataset.theme)}catch(e){}};

/* dosya ekleme */
const zone=$('#zone');
zone.onclick=()=>$('#fi').click();$('#bAdd').onclick=()=>$('#fi').click();
$('#fi').onchange=e=>{addFiles([...e.target.files]);e.target.value=''};
let dc=0;const isF=e=>e.dataTransfer&&[...e.dataTransfer.types].includes('Files');
document.addEventListener('dragenter',e=>{if(isF(e)){e.preventDefault();dc++;document.body.classList.add('fdrag')}});
document.addEventListener('dragover',e=>{if(isF(e))e.preventDefault()});
document.addEventListener('dragleave',e=>{if(isF(e)&&--dc<=0){dc=0;document.body.classList.remove('fdrag')}});
document.addEventListener('drop',e=>{dc=0;document.body.classList.remove('fdrag');if(isF(e)&&e.dataTransfer.files.length){e.preventDefault();addFiles([...e.dataTransfer.files])}});

async function addFiles(list){
  list=list.filter(f=>f.type==='application/pdf'||f.type.startsWith('image/')||/\.pdf$/i.test(f.name));
  if(!list.length)return;busy('Dosyalar okunuyor…');snap();
  for(const f of list){
    try{
      const color=COL[files.length%COL.length];
      if(f.type.startsWith('image/')){
        const url=await new Promise((res,rej)=>{const u=URL.createObjectURL(f),im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext('2d').drawImage(im,0,0);URL.revokeObjectURL(u);res({d:c.toDataURL('image/png'),w:c.width,h:c.height})};im.onerror=rej;im.src=u});
        files.push({name:f.name,img:url.d,w:url.w,h:url.h,color});
        pages.push({id:++uid,fi:files.length-1,pn:1,rot:0,crop:null});
      }else{
        const bytes=await f.arrayBuffer();
        const doc=await pdfjsLib.getDocument({data:bytes.slice(0)}).promise;
        files.push({name:f.name,bytes,doc,color});
        for(let n=1;n<=doc.numPages;n++)pages.push({id:++uid,fi:files.length-1,pn:n,rot:0,crop:null});
      }
    }catch(e){alert('“'+f.name+'” açılamadı.')}
  }
  busy();render();loadThumbs();
}
async function loadThumbs(){
  if(loading)return;loading=true;
  try{
    for(;;){
      const p=pages.find(p=>p.fi>=0&&!thumbs[key(p)]);if(!p)break;
      const f=files[p.fi],k=key(p);
      if(f.img)thumbs[k]={url:f.img,w:f.w,h:f.h};
      else{
        const pg=await f.doc.getPage(p.pn),v=pg.getViewport({scale:1}),s=330/Math.max(v.width,v.height),vp=pg.getViewport({scale:s});
        const c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;
        await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
        thumbs[k]={url:c.toDataURL('image/jpeg',.82),w:vp.width,h:vp.height};
      }
      pageThumb(k);
    }
  }finally{loading=false}
}
function pageThumb(k){document.querySelectorAll('.card').forEach(el=>{const p=pages.find(x=>x.id==el.dataset.id);if(p&&key(p)===k)el.querySelector('.pv').innerHTML=pvHTML(p)})}
function imgStyle(p){
  const t=p.fi<0?{w:210,h:297}:thumbs[key(p)];if(!t)return'';
  const o=p.rot%180!==0,rw=o?t.h:t.w,rh=o?t.w:t.h,s=Math.min(138/rw,198/rh),c=p.crop;
  return`width:${t.w*s}px;height:${t.h*s}px;transform:translate(-50%,-50%) rotate(${p.rot}deg)`+(c?`;clip-path:inset(${c.t*100}% ${c.r*100}% ${c.b*100}% ${c.l*100}%)`:'');
}
function pvHTML(p){
  if(p.fi<0)return`<img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" style="${imgStyle(p)}">`;
  const t=thumbs[key(p)];return t?`<img alt="" src="${t.url}" style="${imgStyle(p)}">`:'<div class="sp"></div>';
}

/* arayüz */
function render(){
  const has=pages.length>0,fine=matchMedia('(pointer:fine)').matches;
  $('#drop').hidden=has;$('#ed').hidden=!has;$('#hb').classList.toggle('on',has);document.body.classList.toggle('has',has);
  sel=new Set([...sel].filter(id=>pages.some(p=>p.id===id)));
  $('#grid').innerHTML=pages.map((p,i)=>{
    const f=files[p.fi];
    return`<div class="card ${sel.has(p.id)?'sel':''}" draggable="${fine}" data-id="${p.id}"><div class="pv">${pvHTML(p)}</div><span class="num">${i+1}</span><span class="chk">✓</span>
<div class="meta"><i style="background:${f?f.color:'#94a3b8'}"></i><span>${f?esc(f.name)+(f.doc?' · s.'+p.pn:''):'Boş sayfa'}</span>${p.crop?'<em>✂</em>':''}</div>
<div class="acts"><button data-a="ml" title="Sola taşı">◀</button><button data-a="l" title="Sola döndür">⟲</button><button data-a="r" title="Sağa döndür">⟳</button><button data-a="mr" title="Sağa taşı">▶</button><button data-a="k" title="Kes">✂</button><button data-a="c" title="Kopyala">⧉</button><button data-a="d" title="Sil">🗑</button></div></div>`}).join('')+`<button class="addc" title="PDF veya resim ekle"><b>＋</b><span>PDF veya resim ekle</span></button>`;
  $('#st').textContent=pages.length+' sayfa · '+files.length+' dosya'+(sel.size?' · '+sel.size+' seçili':'');
  $('#bulk').classList.toggle('on',sel.size>0);document.body.classList.toggle('bar',sel.size>0);$('#bc').textContent=sel.size+' seçili';
  $('#bUndo').disabled=$('#dUndo').disabled=!hist.length;
}
const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const rot=(p,d)=>p.rot=(p.rot+d+360)%360;
function act(a,ids){
  const L=pages.filter(p=>ids.includes(p.id));if(!L.length)return;
  if(a==='k'){openCrop(L[0].id);return}
  if(a==='i'){openImg(ids);return}
  if(a==='m'){openMd(ids);return}
  snap();
  if(a==='l')L.forEach(p=>rot(p,-90));
  if(a==='r')L.forEach(p=>rot(p,90));
  if(a==='ml'||a==='mr'){const idx=pages.map((p,i)=>ids.includes(p.id)?i:-1).filter(i=>i>=0);
    if(a==='ml')idx.forEach(i=>{if(i>0&&!ids.includes(pages[i-1].id))[pages[i-1],pages[i]]=[pages[i],pages[i-1]]});
    else idx.reverse().forEach(i=>{if(i<pages.length-1&&!ids.includes(pages[i+1].id))[pages[i+1],pages[i]]=[pages[i],pages[i+1]]})}
  if(a==='d'){pages=pages.filter(p=>!ids.includes(p.id));if(!pages.length){files=[];thumbs={}}}
  if(a==='c'){const out=[];pages.forEach(p=>{out.push(p);if(ids.includes(p.id))out.push({...JSON.parse(JSON.stringify(p)),id:++uid})});pages=out}
  render();
}
$('#grid').addEventListener('click',e=>{
  if(Date.now()<noClick)return;
  const card=e.target.closest('.card');if(!card)return;const id=+card.dataset.id,b=e.target.closest('button');
  if(b){act(b.dataset.a,[id]);return}
  if(e.shiftKey&&last!=null){const a=pages.findIndex(p=>p.id===last),z=pages.findIndex(p=>p.id===id);pages.slice(Math.min(a,z),Math.max(a,z)+1).forEach(p=>sel.add(p.id))}
  else sel.has(id)?sel.delete(id):sel.add(id);
  last=id;render();
});
$('#bulk').onclick=e=>{
  const b=e.target.closest('button');if(!b)return;const t=b.dataset.b,ids=[...sel];
  if(t==='x'){sel.clear();render()}else if(t==='s')dlSel();else if(t==='z')dlZip();else act(t,ids);
};
$('#bAll').onclick=()=>{sel.size===pages.length?sel.clear():pages.forEach(p=>sel.add(p.id));render()};
$('#bUndo').onclick=undo;
function undo(){if(!hist.length)return;pages=JSON.parse(hist.pop());render()}
$('#bBlank').onclick=()=>{snap();pages.push({id:++uid,fi:-1,pn:0,rot:0,crop:null});render();scrollTo({top:1e6,behavior:'smooth'})};
$('#bClear').onclick=()=>{if(confirm('Tüm sayfalar kaldırılsın mı?')){snap();pages=[];files=[];thumbs={};sel.clear();render()}};
addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();undo()}
  if((e.key==='Delete'||e.key==='Backspace')&&sel.size&&!$('#cd').open)act('d',[...sel]);
  if((e.ctrlKey||e.metaKey)&&e.key==='a'&&pages.length){e.preventDefault();pages.forEach(p=>sel.add(p.id));render()}
  if(e.key==='Escape'&&sel.size){sel.clear();render()}
});

/* sürükle-bırak sıralama (fare + dokunmatik uzun basma) */
var noClick=0;
const g=$('#grid');
function movePages(tid,after){
  if(!dragIds.length||dragIds.includes(tid))return;snap();
  const moved=pages.filter(p=>dragIds.includes(p.id)),rest=pages.filter(p=>!dragIds.includes(p.id));
  rest.splice(rest.findIndex(p=>p.id===tid)+(after?1:0),0,...moved);pages=rest;
}
const grp=id=>sel.has(id)?pages.filter(p=>sel.has(p.id)).map(p=>p.id):[id];
const mark=(c,after)=>{g.querySelectorAll('.ovl,.ovr').forEach(x=>x.classList.remove('ovl','ovr'));if(c)c.classList.add(after?'ovr':'ovl')};
g.addEventListener('click',e=>{if(e.target.closest('.addc'))$('#fi').click()});
g.addEventListener('dragstart',e=>{const c=e.target.closest('.card');if(!c)return;dragIds=grp(+c.dataset.id);e.dataTransfer.setData('text/plain','p');e.dataTransfer.effectAllowed='move';setTimeout(()=>dragIds.forEach(i=>g.querySelector(`[data-id="${i}"]`)?.classList.add('drag')),0)});
g.addEventListener('dragover',e=>{if(!dragIds.length)return;e.preventDefault();const c=e.target.closest('.card');if(!c)return mark();const r=c.getBoundingClientRect();mark(c,e.clientX>=r.left+r.width/2)});
g.addEventListener('dragend',()=>{dragIds=[];render()});
g.addEventListener('drop',e=>{if(!dragIds.length)return;e.preventDefault();const c=e.target.closest('.card');if(c){const r=c.getBoundingClientRect();movePages(+c.dataset.id,e.clientX>=r.left+r.width/2)}dragIds=[];render()});
let tp=null;
g.addEventListener('touchstart',e=>{const c=e.target.closest('.card');if(!c||e.target.closest('button'))return;const t=e.touches[0];
  tp={x:t.clientX,y:t.clientY,on:false,over:null,after:false,tm:setTimeout(()=>{tp.on=true;dragIds=grp(+c.dataset.id);dragIds.forEach(i=>g.querySelector(`[data-id="${i}"]`)?.classList.add('drag'));navigator.vibrate&&navigator.vibrate(18)},380)}},{passive:true});
g.addEventListener('touchmove',e=>{if(!tp)return;const t=e.touches[0];
  if(!tp.on){if(Math.hypot(t.clientX-tp.x,t.clientY-tp.y)>10){clearTimeout(tp.tm);tp=null}return}
  e.preventDefault();const c=document.elementFromPoint(t.clientX,t.clientY)?.closest('.card');
  if(c){const r=c.getBoundingClientRect();tp.over=c;tp.after=t.clientX>=r.left+r.width/2;mark(c,tp.after)}
  if(t.clientY<110)scrollBy(0,-14);else if(t.clientY>innerHeight-130)scrollBy(0,14)},{passive:false});
const tEnd=()=>{if(!tp)return;clearTimeout(tp.tm);if(tp.on){noClick=Date.now()+500;if(tp.over)movePages(+tp.over.dataset.id,tp.after);dragIds=[];render()}tp=null};
g.addEventListener('touchend',tEnd);g.addEventListener('touchcancel',tEnd);
$('#dock').onclick=e=>{const b=e.target.closest('button');if(b)$(b.dataset.t).click()};

/* kesme */
async function openCrop(id){
  const p=pages.find(x=>x.id===id);if(!p)return;cropId=id;cr=p.crop?{...p.crop}:{l:.06,t:.06,r:.06,b:.06};
  let url;
  if(p.fi<0)url=(()=>{const c=document.createElement('canvas');c.width=420;c.height=594;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,420,594);return c.toDataURL()})();
  else if(files[p.fi].img)url=files[p.fi].img;
  else{busy('Sayfa hazırlanıyor…');const pg=await files[p.fi].doc.getPage(p.pn),v=pg.getViewport({scale:1}),vp=pg.getViewport({scale:1100/Math.max(v.width,v.height)}),c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;url=c.toDataURL('image/jpeg',.9);busy()}
  $('#ci').src=url;$('#cS').style.display=sel.size?'':'none';$('#cS').textContent='Seçililere ('+sel.size+')';
  $('#cd').showModal();drawCr();
}
function drawCr(){const s=$('#cr').style;s.left=cr.l*100+'%';s.top=cr.t*100+'%';s.right=cr.r*100+'%';s.bottom=cr.b*100+'%'}
let drag=null;
$('#cr').addEventListener('pointerdown',e=>{const h=e.target.dataset.h||'m';drag={h,x:e.clientX,y:e.clientY,s:{...cr}};$('#cr').setPointerCapture(e.pointerId);e.preventDefault()});
$('#cr').addEventListener('pointermove',e=>{
  if(!drag)return;const w=$('#ci').getBoundingClientRect(),dx=(e.clientX-drag.x)/w.width,dy=(e.clientY-drag.y)/w.height,s=drag.s,h=drag.h,m=.03,n={...s};
  if(h==='m'){const W=1-s.l-s.r,H=1-s.t-s.b;n.l=Math.min(Math.max(0,s.l+dx),1-W);n.r=1-W-n.l;n.t=Math.min(Math.max(0,s.t+dy),1-H);n.b=1-H-n.t}
  else{if(h.includes('w'))n.l=Math.min(Math.max(0,s.l+dx),1-s.r-m);if(h.includes('e'))n.r=Math.min(Math.max(0,s.r-dx),1-s.l-m);if(h.includes('n'))n.t=Math.min(Math.max(0,s.t+dy),1-s.b-m);if(h.includes('s'))n.b=Math.min(Math.max(0,s.b-dy),1-s.t-m)}
  cr=n;drawCr();
});
$('#cr').addEventListener('pointerup',()=>drag=null);
function applyCrop(ids,val){snap();pages.forEach(p=>{if(ids.includes(p.id))p.crop=val?{...val}:null});$('#cd').close();render()}
$('#cX').onclick=()=>$('#cd').close();
$('#cO').onclick=()=>applyCrop([cropId],cr);
$('#cS').onclick=()=>applyCrop([...sel],cr);
$('#cA').onclick=()=>applyCrop(pages.map(p=>p.id),cr);
$('#cN').onclick=()=>applyCrop([cropId,...sel],null);

/* PDF üretme */
function setCrop(pg,c,r0){
  if(!c)return;const m=pg.getMediaBox(),W=m.width,H=m.height;
  const[L,T,R,B]=r0===90?[c.t,c.r,c.b,c.l]:r0===180?[c.r,c.b,c.l,c.t]:r0===270?[c.b,c.l,c.t,c.r]:[c.l,c.t,c.r,c.b];
  pg.setCropBox(m.x+L*W,m.y+B*H,W*(1-L-R),H*(1-T-B));
}
async function build(list){
  const{PDFDocument,degrees}=PDFLib,out=await PDFDocument.create(),cache={};
  for(const p of list){
    if(p.fi<0){const pg=out.addPage([595.28,841.89]);pg.setRotation(degrees(p.rot));setCrop(pg,p.crop,0);continue}
    const f=files[p.fi];
    if(f.img){const im=await out.embedPng(f.img),pg=out.addPage([im.width,im.height]);pg.drawImage(im,{x:0,y:0,width:im.width,height:im.height});pg.setRotation(degrees(p.rot));setCrop(pg,p.crop,0);continue}
    cache[p.fi]??=await PDFDocument.load(f.bytes,{ignoreEncryption:true});
    const[pg]=await out.copyPages(cache[p.fi],[p.pn-1]),r0=pg.getRotation().angle;
    pg.setRotation(degrees((r0+p.rot)%360));setCrop(pg,p.crop,r0);out.addPage(pg);
  }
  return out.save();
}
async function save(filename,data){
  const u=URL.createObjectURL(data instanceof Blob?data:new Blob([data])),a=document.createElement('a');
  a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);
}
const pdfBlob=b=>new Blob([b],{type:'application/pdf'});
async function run(msg,fn){busy(msg);try{await fn()}catch(e){alert('Bir hata oluştu: '+(e.message||e))}busy()}
$('#bDl').onclick=()=>run('PDF hazırlanıyor…',async()=>save('duzenlenmis.pdf',pdfBlob(await build(pages))));
const chosen=()=>pages.filter(p=>sel.has(p.id));
function dlSel(){run('Seçilen sayfalar hazırlanıyor…',async()=>save('secilen-sayfalar.pdf',pdfBlob(await build(chosen()))))}
function dlZip(){run('ZIP hazırlanıyor…',async()=>{
  const list=sel.size?chosen():pages,z=new JSZip(),w=String(list.length).length;
  for(let i=0;i<list.length;i++)z.file('sayfa-'+String(i+1).padStart(w,'0')+'.pdf',await build([list[i]]));
  save('sayfalar.zip',await z.generateAsync({type:'blob'}));
})}
/* JPG / PNG olarak indirme */
var imgIds=[];
const loadImg=u=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=u});
const mkCanvas=(w,h)=>{const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);return c};
async function pageBlob(p,dpi,mime){
  let src;
  if(p.fi<0)src=mkCanvas(595.28*dpi/72,841.89*dpi/72);
  else if(files[p.fi].img){const f=files[p.fi],im=await loadImg(f.img);src=mkCanvas(f.w,f.h);src.getContext('2d').drawImage(im,0,0)}
  else{
    const pg=await files[p.fi].doc.getPage(p.pn),v=pg.getViewport({scale:1}),sc=Math.min(dpi/72,Math.sqrt(16e6/(v.width*v.height))),vp=pg.getViewport({scale:sc});
    src=mkCanvas(vp.width,vp.height);await pg.render({canvasContext:src.getContext('2d'),viewport:vp}).promise;
  }
  const c=p.crop||{l:0,t:0,r:0,b:0},W=src.width,H=src.height,sx=c.l*W,sy=c.t*H,sw=W*(1-c.l-c.r),sh=H*(1-c.t-c.b),o=p.rot%180!==0;
  const out=mkCanvas(o?sh:sw,o?sw:sh),x=out.getContext('2d');
  x.translate(out.width/2,out.height/2);x.rotate(p.rot*Math.PI/180);x.drawImage(src,sx,sy,sw,sh,-sw/2,-sh/2,sw,sh);
  return new Promise(r=>out.toBlob(r,mime,.92));
}
function openImg(ids){
  imgIds=ids;const n=ids.length;$('#in').textContent=n===1?'1 sayfa':n+' sayfa';
  $('#imode').disabled=n===1;if(n===1)$('#imode').value='zip';$('#id').showModal();
}
$('#bImg').onclick=()=>openImg(sel.size?[...sel]:pages.map(p=>p.id));
$('#iX').onclick=()=>$('#id').close();
$('#iO').onclick=()=>{
  const list=pages.filter(p=>imgIds.includes(p.id)),fmt=document.querySelector('input[name=fm]:checked').value,dpi=+$('#idpi').value,mode=$('#imode').value;
  const ext=fmt==='png'?'png':'jpg',mime=fmt==='png'?'image/png':'image/jpeg';
  $('#id').close();
  run('Görseller hazırlanıyor…',async()=>{
    const w=String(pages.length).length,items=[];
    for(const p of list)items.push(['sayfa-'+String(pages.indexOf(p)+1).padStart(w,'0')+'.'+ext,await pageBlob(p,dpi,mime)]);
    if(items.length===1||mode==='sep'){for(const[n,b]of items){await save(n,b);await new Promise(r=>setTimeout(r,400))}}
    else{const z=new JSZip();items.forEach(([n,b])=>z.file(n,b));await save('sayfalar-'+ext+'.zip',await z.generateAsync({type:'blob'}))}
  });
};
/* PDF → Markdown dönüştürücü */
var mdIds=[],mdData=[],mdParts=[];
async function pageLines(p){
  if(p.fi<0)return[];
  const f=files[p.fi];if(f.img)return null;
  const pg=await f.doc.getPage(p.pn),vp=pg.getViewport({scale:1}),tc=await pg.getTextContent(),U=pdfjsLib.Util;
  const c=p.crop||{l:0,t:0,r:0,b:0},x0=c.l*vp.width,x1=vp.width*(1-c.r),y0=c.t*vp.height,y1=vp.height*(1-c.b),its=[];
  for(const it of tc.items){
    if(!it.str||!it.str.trim())continue;
    const t=U.transform(vp.transform,it.transform),size=Math.hypot(t[2],t[3])||Math.hypot(t[0],t[1]),x=t[4],y=t[5];
    if(x<x0||x>x1||y<y0||y>y1)continue;
    its.push({s:it.str,x,y,w:it.width,size});
  }
  its.sort((a,b)=>a.y-b.y||a.x-b.x);
  const lines=[];
  for(const it of its){const L=lines[lines.length-1];
    if(L&&Math.abs(it.y-L.y)<=Math.max(it.size,L.size)*.45){L.its.push(it);L.size=Math.max(L.size,it.size)}
    else lines.push({y:it.y,size:it.size,its:[it]})}
  for(const L of lines){
    L.its.sort((a,b)=>a.x-b.x);
    const segs=[];let cur='',end=null,txt='';
    for(const it of L.its){
      if(end!==null){const gap=it.x-end,sp=gap>L.size*.12&&!/\s$/.test(txt)&&!/^\s/.test(it.s);
        if(gap>L.size*2.2){segs.push(cur.trim());cur=''}else if(sp)cur+=' ';
        if(sp)txt+=' '}
      cur+=it.s;txt+=it.s;end=it.x+it.w;
    }
    segs.push(cur.trim());L.segs=segs.filter(Boolean);L.text=txt.replace(/\s+/g,' ').trim();L.x=L.its[0].x;delete L.its;
  }
  return lines.filter(L=>L.text);
}
function renderPageMd(ls,body,opt){
  const blocks=[];let para=[],tbl=[],prev=null,list=null;
  const flushP=()=>{if(para.length){blocks.push({t:para.join(' ').replace(/\s+/g,' ').trim()});para=[]}};
  const flushT=()=>{if(!tbl.length)return;const n=Math.max(...tbl.map(r=>r.length)),row=r=>'| '+Array.from({length:n},(_,i)=>(r[i]||'').replace(/\|/g,'\\|')).join(' | ')+' |';
    blocks.push({t:[row(tbl[0]),'|'+' --- |'.repeat(n),...tbl.slice(1).map(row)].join('\n')});tbl=[]};
  for(const L of ls){
    const t=L.text,gap=prev?L.y-prev.y:0,lh=Math.max(L.size,prev?prev.size:0),near=prev&&gap<lh*1.7;
    if(opt.tables&&L.segs.length>=2){flushP();list=null;tbl.push(L.segs);prev=L;continue}
    flushT();
    const r=L.size/body,bl=t.match(/^([•▪●◦·■○►]\s*|[–—*-]\s+)(.+)/),nl=t.match(/^(\d{1,3})[.)]\s+(.+)/);
    if(r>=1.18&&t.length<140){flushP();list=null;blocks.push({t:'#'.repeat(r>=1.8?1:r>=1.4?2:3)+' '+t})}
    else if(bl||nl){flushP();list={t:bl?'- '+bl[2]:nl[1]+'. '+nl[2],list:1};blocks.push(list)}
    else if(list&&near&&L.x>prev.x-1){list.t+=' '+t}
    else{list=null;if(para.length&&!near)flushP();
      if(para.length&&/\p{L}-$/u.test(para[para.length-1])&&/^\p{Ll}/u.test(t))para[para.length-1]=para[para.length-1].slice(0,-1)+t;else para.push(t)}
    prev=L;
  }
  flushP();flushT();
  let out='';blocks.forEach((b,i)=>{out+=(i?(b.list&&blocks[i-1].list?'\n':'\n\n'):'')+b.t});
  return out;
}
function renderMd(data,opt){
  const sz={};data.forEach(ls=>(ls||[]).forEach(L=>{const k=Math.round(L.size*2)/2;sz[k]=(sz[k]||0)+L.text.length}));
  const body=+Object.keys(sz).sort((a,b)=>sz[b]-sz[a])[0]||12;
  return data.map(ls=>ls===null?'<!-- Görsel sayfa: metin yok -->':ls.length?renderPageMd(ls,body,opt):'<!-- Bu sayfada metin bulunamadı (taranmış veya boş olabilir) -->');
}
const mdOpt=()=>({tables:$('#mTbl').checked,sep:$('#mSep').checked});
function mdGen(){const o=mdOpt();mdParts=renderMd(mdData,o);$('#mTxt').value=mdParts.join(o.sep?'\n\n---\n\n':'\n\n')}
function openMd(ids){
  mdIds=ids;
  run('Metin okunuyor…',async()=>{
    const list=pages.filter(p=>ids.includes(p.id));mdData=[];
    for(const p of list)mdData.push(await pageLines(p));
    $('#mn').textContent=list.length+' sayfa';$('#mZip').disabled=list.length<2;if(list.length<2)$('#mZip').checked=false;
    mdGen();
  }).then(()=>$('#md').showModal());
}
['#mTbl','#mSep'].forEach(s=>$(s).onchange=mdGen);
$('#bMd').onclick=()=>openMd(sel.size?[...sel]:pages.map(p=>p.id));
$('#mX').onclick=()=>$('#md').close();
$('#mC').onclick=async()=>{
  const t=$('#mTxt').value,b=$('#mC');
  try{await navigator.clipboard.writeText(t)}catch(e){$('#mTxt').select();document.execCommand('copy')}
  b.textContent='Kopyalandı ✓';setTimeout(()=>b.textContent='⧉ Kopyala',1500);
};
$('#mO').onclick=()=>{
  const base=((files.find(f=>f.name)||{}).name||'belge').replace(/\.[^.]+$/,'');
  if($('#mZip').checked&&mdParts.length>1){
    run('ZIP hazırlanıyor…',async()=>{const z=new JSZip(),w=String(mdParts.length).length;
      mdParts.forEach((t,i)=>z.file('sayfa-'+String(i+1).padStart(w,'0')+'.md',t));
      await save(base+'-markdown.zip',await z.generateAsync({type:'blob'}))});
  }else save(base+'.md',new Blob([$('#mTxt').value],{type:'text/markdown;charset=utf-8'}));
};
render();