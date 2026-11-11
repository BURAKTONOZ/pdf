const $=s=>document.querySelector(s);
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const COL=['#6366f1','#10b981','#f59e0b','#ec4899','#06b6d4','#ef4444','#8b5cf6'];
let files=[],pages=[],sel=new Set(),hist=[],redoStack=[],uid=0,thumbs={},last=null,dragIds=[],loading=false,cropId=null,previewId=null,zoomMode='md',cr={l:.06,t:.06,r:.06,b:.06};
const key=p=>p.fi<0?'b':p.fi+':'+p.pn;
const busy=(m)=>{$('#bt').textContent=m||'';$('#busy').classList.toggle('on',!!m)};
const snap=()=>{hist.push(JSON.stringify(pages));if(hist.length>80)hist.shift();redoStack=[]};

/* Tema */
(function(){try{const t=localStorage.getItem('th');if(t)document.documentElement.dataset.theme=t}catch(e){}})();
$('#bTheme').onclick=()=>{const d=document.documentElement,dark=d.dataset.theme?d.dataset.theme==='dark':matchMedia('(prefers-color-scheme:dark)').matches;d.dataset.theme=dark?'light':'dark';try{localStorage.setItem('th',d.dataset.theme)}catch(e){}};
if($('#logoBtn'))$('#logoBtn').onclick=()=>scrollTo({top:0,behavior:'smooth'});

/* Dosya ekleme */
const zone=$('#zone');
zone.onclick=()=>$('#fi').click();$('#bAdd').onclick=()=>$('#fi').click();
$('#fi').onchange=e=>{addFiles([...e.target.files]);e.target.value=''};
let dc=0;const isF=e=>e.dataTransfer&&[...e.dataTransfer.types].includes('Files');
document.addEventListener('dragenter',e=>{if(isF(e)){e.preventDefault();dc++;document.body.classList.add('fdrag')}});
document.addEventListener('dragover',e=>{if(isF(e))e.preventDefault()});
document.addEventListener('dragleave',e=>{if(isF(e)&&--dc<=0){dc=0;document.body.classList.remove('fdrag')}});
document.addEventListener('drop',e=>{dc=0;document.body.classList.remove('fdrag');if(isF(e)&&e.dataTransfer.files.length){e.preventDefault();addFiles([...e.dataTransfer.files])}});

async function addFiles(list){
  const bad=list.filter(f=>!kind(f));list=list.filter(kind);
  if(!list.length){if(bad.length)unsup(bad);return}busy('Dosyalar okunuyor…');snap();
  for(const f of list){
    try{
      const color=COL[files.length%COL.length];
      if(kind(f)==='doc'){
        busy('“'+f.name+'” çevriliyor…');
        (await convertDoc(f)).forEach((o,i)=>{files.push({...o,name:f.name,color,pnum:i+1});pages.push({id:++uid,fi:files.length-1,pn:1,rot:0,crop:null})});
      }else if(kind(f)==='img'){
        const url=await new Promise((res,rej)=>{const u=URL.createObjectURL(f),im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext('2d').drawImage(im,0,0);URL.revokeObjectURL(u);res({d:c.toDataURL('image/png'),w:c.width,h:c.height})};im.onerror=rej;im.src=u});
        files.push({name:f.name,img:url.d,w:url.w,h:url.h,color});
        pages.push({id:++uid,fi:files.length-1,pn:1,rot:0,crop:null});
      }else{
        const bytes=await f.arrayBuffer();
        const doc=await pdfjsLib.getDocument({data:bytes.slice(0)}).promise;
        files.push({name:f.name,bytes,doc,color});
        for(let n=1;n<=doc.numPages;n++)pages.push({id:++uid,fi:files.length-1,pn:n,rot:0,crop:null});
      }
    }catch(err){alert('“'+f.name+'” açılamadı. '+(err&&err.message||''))}
  }
  busy();render();loadThumbs();if(bad.length)unsup(bad);
}

async function loadThumbs(){
  if(loading)return;loading=true;
  try{
    for(;;){
      const p=pages.find(p=>p.fi>=0&&!thumbs[key(p)]);if(!p)break;
      const f=files[p.fi],k=key(p);
      if(f.img)thumbs[k]={url:f.th||f.img,w:f.w,h:f.h};
      else{
        const pg=await f.doc.getPage(p.pn),v=pg.getViewport({scale:1}),s=360/Math.max(v.width,v.height),vp=pg.getViewport({scale:s});
        const c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;
        await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
        thumbs[k]={url:c.toDataURL('image/jpeg',.85),w:vp.width,h:vp.height};
      }
      pageThumb(k);
    }
  }finally{loading=false}
}

function pageThumb(k){document.querySelectorAll('.card').forEach(el=>{const p=pages.find(x=>x.id==el.dataset.id);if(p&&key(p)===k)el.querySelector('.pv').innerHTML=pvHTML(p)})}
function imgStyle(p){
  const t=p.fi<0?{w:210,h:297}:thumbs[key(p)];if(!t)return'';
  const maxW=zoomMode==='sm'?112:zoomMode==='lg'?195:146;
  const maxH=zoomMode==='sm'?146:zoomMode==='lg'?262:200;
  const o=p.rot%180!==0,rw=o?t.h:t.w,rh=o?t.w:t.h,s=Math.min(maxW/rw,maxH/rh),c=p.crop;
  return`width:${t.w*s}px;height:${t.h*s}px;transform:translate(-50%,-50%) rotate(${p.rot}deg)`+(c?`;clip-path:inset(${c.t*100}% ${c.r*100}% ${c.b*100}% ${c.l*100}%)`:'');
}
function pvHTML(p){
  if(p.fi<0)return`<img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" style="${imgStyle(p)}">`;
  const t=thumbs[key(p)];return t?`<img alt="" src="${t.url}" style="${imgStyle(p)}">`:'<div class="sp"></div>';
}

/* Arayüz */
function render(){
  const has=pages.length>0,fine=matchMedia('(pointer:fine)').matches;
  $('#drop').hidden=has;$('#ed').hidden=!has;$('#hb').classList.toggle('on',has);document.body.classList.toggle('has',has);
  sel=new Set([...sel].filter(id=>pages.some(p=>p.id===id)));
  $('#grid').className=zoomMode==='sm'?'z-sm':zoomMode==='lg'?'z-lg':'';
  $('#grid').innerHTML=pages.map((p,i)=>{
    const f=files[p.fi];
    return`<div class="card ${sel.has(p.id)?'sel':''}" draggable="${fine}" data-id="${p.id}"><div class="pv" title="Büyütmek için çift tıklayın">${pvHTML(p)}</div><span class="num">${i+1}</span><span class="chk">✓</span>
<div class="meta"><i style="background:${f?f.color:'#94a3b8'}"></i><span>${f?esc(f.name)+(f.doc?' · s.'+p.pn:f.pnum?' · s.'+f.pnum:''):'Boş sayfa'}</span>${p.crop?'<em title="Kırpılmış sayfa">✂</em>':''}</div>
<div class="acts"><button data-a="ml" title="Sola taşı">◀</button><button data-a="l" title="Sola döndür">⟲</button><button data-a="r" title="Sağa döndür">⟳</button><button data-a="mr" title="Sağa taşı">▶</button><button data-a="v" title="Sayfayı incele / büyüt">🔍</button><button data-a="k" title="Sayfayı kırp">✂</button><button data-a="c" title="Sayfayı çoğalt">⧉</button><button data-a="d" title="Sayfayı sil">🗑</button></div></div>`}).join('')+`<button class="addc" title="Dosya ekle"><b>＋</b><span>Dosya ekle<br><small>PDF, Word, Excel, resim…</small></span></button>`;

  if($('#fileChips')){
    const fileMap=new Map();
    pages.forEach(p=>{
      if(p.fi<0)return;
      const f=files[p.fi];if(!f)return;
      const k=f.name+'|'+f.color;
      if(!fileMap.has(k))fileMap.set(k,{name:f.name,color:f.color,ids:[]});
      fileMap.get(k).ids.push(p.id);
    });
    $('#fileChips').innerHTML=[...fileMap.values()].map(fc=>`<div class="fchip" data-fids="${fc.ids.join(',')}" title="Bu dosyanın tüm sayfalarını seçmek için tıklayın"><i style="background:${fc.color}"></i><span>${esc(fc.name)}</span><small>(${fc.ids.length} s.)</small></div>`).join('');
  }

  const fileCount=new Set(pages.filter(p=>p.fi>=0).map(p=>files[p.fi]?.name)).size;
  $('#st').textContent=pages.length+' sayfa · '+fileCount+' dosya'+(sel.size?' · '+sel.size+' sayfa seçili':'');
  $('#bulk').classList.toggle('on',sel.size>0);document.body.classList.toggle('has-bulk',sel.size>0);$('#bc').textContent=sel.size+' seçili';
  $('#bUndo').disabled=$('#dUndo').disabled=!hist.length;
  if($('#bRedo'))$('#bRedo').disabled=!redoStack.length;
}

if($('#fileChips'))$('#fileChips').onclick=e=>{
  const ch=e.target.closest('.fchip');if(!ch)return;
  const ids=ch.dataset.fids.split(',').map(Number).filter(Boolean);
  const allSel=ids.every(id=>sel.has(id));
  ids.forEach(id=>allSel?sel.delete(id):sel.add(id));
  render();
};
if($('#zoomSeg'))$('#zoomSeg').onclick=e=>{
  const b=e.target.closest('button');if(!b)return;
  zoomMode=b.dataset.z||'md';
  [...$('#zoomSeg').querySelectorAll('button')].forEach(x=>x.classList.toggle('on',x===b));
  render();
};
if($('#bRotAllL'))$('#bRotAllL').onclick=()=>act('l',sel.size?[...sel]:pages.map(p=>p.id));
if($('#bRotAllR'))$('#bRotAllR').onclick=()=>act('r',sel.size?[...sel]:pages.map(p=>p.id));
if($('#bRevOrder'))$('#bRevOrder').onclick=()=>{if(pages.length<2)return;snap();pages.reverse();render()};

const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const rot=(p,d)=>p.rot=(p.rot+d+360)%360;
function act(a,ids){
  const L=pages.filter(p=>ids.includes(p.id));if(!L.length)return;
  if(a==='v'){openPreview(L[0].id);return}
  if(a==='k'){openCrop(L[0].id);return}
  if(a==='i'){openImg(ids);return}
  if(a==='m'){openMd(ids);return}
  if(a==='w'){exportWord(ids);return}
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
$('#grid').addEventListener('dblclick',e=>{
  const card=e.target.closest('.card');if(!card||e.target.closest('button'))return;
  openPreview(+card.dataset.id);
});

$('#bulk').onclick=e=>{
  const b=e.target.closest('button');if(!b)return;const t=b.dataset.b,ids=[...sel];
  if(t==='x'){sel.clear();render()}else if(t==='s')dlSel();else if(t==='z')dlZip();else act(t,ids);
};
$('#bAll').onclick=()=>{sel.size===pages.length?sel.clear():pages.forEach(p=>sel.add(p.id));render()};
$('#bUndo').onclick=undo;
if($('#bRedo'))$('#bRedo').onclick=redo;
function undo(){if(!hist.length)return;redoStack.push(JSON.stringify(pages));pages=JSON.parse(hist.pop());render()}
function redo(){if(!redoStack.length)return;hist.push(JSON.stringify(pages));pages=JSON.parse(redoStack.pop());render()}
$('#bBlank').onclick=()=>{snap();pages.push({id:++uid,fi:-1,pn:0,rot:0,crop:null});render();scrollTo({top:1e6,behavior:'smooth'})};
$('#bClear').onclick=()=>{if(confirm('Tüm sayfalar kaldırılsın mı?')){snap();pages=[];files=[];thumbs={};sel.clear();render()}};

addEventListener('keydown',e=>{
  if(document.querySelector('dialog[open]')||/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement||{}).tagName))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo()}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo()}
  if((e.key==='Delete'||e.key==='Backspace')&&sel.size&&!$('#cd').open)act('d',[...sel]);
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'&&pages.length){e.preventDefault();pages.forEach(p=>sel.add(p.id));render()}
  if(e.key==='Escape'&&sel.size){sel.clear();render()}
});

/* Sürükle-bırak sıralama */
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

/* Sayfa Önizleme (Lightbox) */
async function openPreview(id){
  const idx=pages.findIndex(x=>x.id===id);if(idx<0)return;
  previewId=id;
  const p=pages[idx],f=files[p.fi];
  $('#pIdx').textContent=(idx+1)+' / '+pages.length;
  $('#pTitle').textContent='🔍 '+(f?f.name+' (Sayfa '+p.pn+')':'Boş Sayfa');
  $('#pPrev').disabled=idx===0;
  $('#pNext').disabled=idx===pages.length-1;
  busy('Önizleme hazırlanıyor…');
  try{
    const blob=await pageBlob(p,160,'image/jpeg');
    const u=URL.createObjectURL(blob);
    $('#pi').onload=()=>URL.revokeObjectURL(u);
    $('#pi').src=u;
    if(!$('#pd').open)$('#pd').showModal();
  }finally{busy()}
}
if($('#pPrev'))$('#pPrev').onclick=()=>{const idx=pages.findIndex(x=>x.id===previewId);if(idx>0)openPreview(pages[idx-1].id)};
if($('#pNext'))$('#pNext').onclick=()=>{const idx=pages.findIndex(x=>x.id===previewId);if(idx>=0&&idx<pages.length-1)openPreview(pages[idx+1].id)};
if($('#pRotL'))$('#pRotL').onclick=()=>{act('l',[previewId]);openPreview(previewId)};
if($('#pRotR'))$('#pRotR').onclick=()=>{act('r',[previewId]);openPreview(previewId)};
if($('#pCrop'))$('#pCrop').onclick=()=>{$('#pd').close();openCrop(previewId)};
if($('#pWord'))$('#pWord').onclick=()=>{$('#pd').close();exportWord([previewId])};
if($('#pX'))$('#pX').onclick=()=>$('#pd').close();

/* Kesme / Kırpma Stüdyosu */
async function openCrop(id){
  const p=pages.find(x=>x.id===id);if(!p)return;cropId=id;cr=p.crop?{...p.crop}:{l:.06,t:.06,r:.06,b:.06};
  let url;
  if(p.fi<0)url=(()=>{const c=document.createElement('canvas');c.width=420;c.height=594;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,420,594);return c.toDataURL()})();
  else if(files[p.fi].img)url=files[p.fi].img;
  else{
    busy('Sayfa hazırlanıyor…');
    const pg=await files[p.fi].doc.getPage(p.pn),v=pg.getViewport({scale:1}),vp=pg.getViewport({scale:1100/Math.max(v.width,v.height)}),c=document.createElement('canvas');
    c.width=vp.width;c.height=vp.height;
    await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
    url=c.toDataURL('image/jpeg',.92);
    busy();
  }
  await new Promise(res=>{$('#ci').onload=res;$('#ci').onerror=res;$('#ci').src=url});
  $('#cS').style.display=sel.size?'':'none';$('#cS').textContent='Seçililere ('+sel.size+')';
  $('#cd').showModal();drawCr();
}

function drawCr(){
  const s=$('#cr').style;
  s.left=(cr.l*100).toFixed(2)+'%';
  s.top=(cr.t*100).toFixed(2)+'%';
  s.right=(cr.r*100).toFixed(2)+'%';
  s.bottom=(cr.b*100).toFixed(2)+'%';
  if($('#cInfo')){
    $('#cInfo').textContent=`Sol: %${Math.round(cr.l*100)} · Üst: %${Math.round(cr.t*100)} · Sağ: %${Math.round(cr.r*100)} · Alt: %${Math.round(cr.b*100)}`;
  }
}

document.querySelectorAll('[data-cp]').forEach(btn=>{
  btn.onclick=()=>{
    const v=parseFloat(btn.dataset.cp)||0;
    cr={l:v,t:v,r:v,b:v};
    drawCr();
  };
});

if($('#cAuto'))$('#cAuto').onclick=()=>{
  const im=$('#ci');
  if(!im.naturalWidth||!im.naturalHeight)return;
  const c=document.createElement('canvas');
  const W=c.width=im.naturalWidth,H=c.height=im.naturalHeight;
  const ctx=c.getContext('2d');
  ctx.drawImage(im,0,0);
  const data=ctx.getImageData(0,0,W,H).data;
  let minX=W,minY=H,maxX=0,maxY=0,found=false;
  const step=Math.max(1,Math.floor(Math.min(W,H)/300));
  for(let y=Math.floor(H*0.01);y<H*0.99;y+=step){
    for(let x=Math.floor(W*0.01);x<W*0.99;x+=step){
      const idx=(y*W+x)*4;
      if(data[idx]<242||data[idx+1]<242||data[idx+2]<242){
        if(x<minX)minX=x;if(x>maxX)maxX=x;
        if(y<minY)minY=y;if(y>maxY)maxY=y;
        found=true;
      }
    }
  }
  if(found&&maxX>minX+20&&maxY>minY+20){
    const pad=0.018;
    cr={
      l:Math.max(0,minX/W-pad),
      t:Math.max(0,minY/H-pad),
      r:Math.max(0,(W-maxX)/W-pad),
      b:Math.max(0,(H-maxY)/H-pad)
    };
    drawCr();
  }
};

let drag=null;
$('#cr').addEventListener('pointerdown',e=>{const h=e.target.dataset.h||'m';drag={h,x:e.clientX,y:e.clientY,s:{...cr}};$('#cr').setPointerCapture(e.pointerId);e.preventDefault()});
$('#cr').addEventListener('pointermove',e=>{
  if(!drag)return;const w=$('#ci').getBoundingClientRect();
  if(w.width<10||w.height<10)return;
  const dx=(e.clientX-drag.x)/w.width,dy=(e.clientY-drag.y)/w.height,s=drag.s,h=drag.h,m=.03,n={...s};
  if(h==='m'){const W=1-s.l-s.r,H=1-s.t-s.b;n.l=Math.min(Math.max(0,s.l+dx),1-W);n.r=1-W-n.l;n.t=Math.min(Math.max(0,s.t+dy),1-H);n.b=1-H-n.t}
  else{if(h.includes('w'))n.l=Math.min(Math.max(0,s.l+dx),1-s.r-m);if(h.includes('e'))n.r=Math.min(Math.max(0,s.r-dx),1-s.l-m);if(h.includes('n'))n.t=Math.min(Math.max(0,s.t+dy),1-s.b-m);if(h.includes('s'))n.b=Math.min(Math.max(0,s.b-dy),1-s.t-m)}
  cr=n;drawCr();
});
$('#cr').addEventListener('pointerup',()=>drag=null);
function applyCrop(ids,val){
  const isZero=val&&(val.l<.005&&val.t<.005&&val.r<.005&&val.b<.005);
  snap();pages.forEach(p=>{if(ids.includes(p.id))p.crop=(val&&!isZero)?{...val}:null});$('#cd').close();render();
}
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
    if(f.img){const im=await out.embedPng(f.img),W=f.pw||im.width,H=f.ph||im.height,pg=out.addPage([W,H]);pg.drawImage(im,{x:0,y:0,width:W,height:H});pg.setRotation(degrees(p.rot));setCrop(pg,p.crop,0);continue}
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
$('#bDl').onclick=()=>run('PDF hazırlanıyor…',async()=>save(baseName()+'-duzenlenmis.pdf',pdfBlob(await build(pages))));
const chosen=()=>pages.filter(p=>sel.has(p.id));
function dlSel(){run('Seçilen sayfalar hazırlanıyor…',async()=>save(baseName()+'-secilen.pdf',pdfBlob(await build(chosen()))))}
function dlZip(){run('ZIP hazırlanıyor…',async()=>{
  const list=sel.size?chosen():pages,z=new JSZip(),w=String(list.length).length;
  for(let i=0;i<list.length;i++)z.file('sayfa-'+String(i+1).padStart(w,'0')+'.pdf',await build([list[i]]));
  save(baseName()+'-sayfalar.zip',await z.generateAsync({type:'blob'}));
})}

/* ---------- Word / Excel / PowerPoint / metin dosyaları → sayfa ---------- */
const ext=n=>(n.split('.').pop()||'').toLowerCase();
const CODE=['json','xml','yml','yaml','ini','js','css','py','sql','log','conf','toml'];
const CONV=['docx','xlsx','xls','xlsm','ods','csv','tsv','txt','md','markdown','html','htm','pptx',...CODE];
const kind=f=>{const e=ext(f.name);if(f.type==='application/pdf'||e==='pdf')return'pdf';if(f.type.startsWith('image/'))return'img';return CONV.includes(e)?'doc':null};
function unsup(bad){
  alert('Bu dosyalar desteklenmiyor:\n• '+bad.map(f=>f.name).join('\n• ')+'\n\nDesteklenenler: PDF, Word (.docx), Excel (.xlsx .xls .csv), PowerPoint (.pptx, yalnızca metin), resimler, .txt .md .html .json ve benzeri metin dosyaları.\nEski .doc / .ppt dosyalarını Word veya PowerPoint’te “Farklı kaydet” ile .docx / .pptx ya da PDF yap.');
}
const LIB={h2c:['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js','html2canvas'],docx:['https://cdn.jsdelivr.net/npm/docx-preview@0.3.5/dist/docx-preview.min.js','docx'],xlsx:['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js','XLSX'],marked:['https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js','marked'],purify:['https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js','DOMPurify'],tess:['https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js','Tesseract']};
const libs={};
const need=(...ks)=>Promise.all(ks.map(k=>libs[k]||(libs[k]=new Promise((res,rej)=>{
  if(window[LIB[k][1]])return res();
  const s=document.createElement('script');s.src=LIB[k][0];s.onload=res;
  s.onerror=()=>{delete libs[k];rej(new Error('Gerekli kütüphane yüklenemedi ('+k+'). İnternet bağlantını kontrol et.'))};document.head.appendChild(s)}))));

/* HTML → Markdown */
function domToMd(root){
  const wrap=(x,m)=>{const t=x.trim();return t?(/^\s/.test(x)?' ':'')+m+t+m+(/\s$/.test(x)?' ':''):x};
  function inl(n){
    let o='';
    n.childNodes.forEach(c=>{
      if(c.nodeType===3)o+=c.textContent.replace(/\s+/g,' ');
      else if(c.nodeType===1){
        const t=c.tagName.toLowerCase();if(/^(script|style|img|svg)$/.test(t))return;
        const x=inl(c);
        if(t==='strong'||t==='b')o+=wrap(x,'**');
        else if(t==='em'||t==='i')o+=wrap(x,'*');
        else if(t==='code')o+='`'+x+'`';
        else if(t==='a'&&c.getAttribute('href')&&x.trim())o+='['+x.trim()+']('+c.getAttribute('href')+')';
        else if(t==='br')o+='  \n';
        else o+=x;
      }
    });return o;
  }
  const list=(l,ord,ind)=>{let i=0;return[...l.children].filter(li=>li.tagName==='LI').map(li=>{i++;
    const cl=li.cloneNode(true),subs=[...li.children].filter(x=>/^(UL|OL)$/.test(x.tagName));cl.querySelectorAll('ul,ol').forEach(x=>x.remove());
    let s=ind+(ord?i+'. ':'- ')+inl(cl).trim();subs.forEach(u=>s+='\n'+list(u,u.tagName==='OL',ind+'  '));return s}).join('\n')};
  const tbl=t=>{const rows=[...t.querySelectorAll('tr')].map(r=>[...r.children].map(c=>inl(c).replace(/\|/g,'\\|').replace(/\s+/g,' ').trim()));
    if(!rows.length)return'';const n=Math.max(...rows.map(r=>r.length)),row=r=>'| '+Array.from({length:n},(_,i)=>r[i]||'').join(' | ')+' |';
    return[row(rows[0]),'|'+' --- |'.repeat(n),...rows.slice(1).map(row)].join('\n')};
  function blk(n){
    const out=[];
    n.childNodes.forEach(c=>{
      if(c.nodeType===3){const t=c.textContent.trim();if(t)out.push(t);return}
      if(c.nodeType!==1)return;
      const t=c.tagName.toLowerCase();
      if(/^(script|style|img|svg|header|footer)$/.test(t))return;
      if(/^h[1-6]$/.test(t)){const x=inl(c).trim();if(x)out.push('#'.repeat(+t[1])+' '+x)}
      else if(t==='ul'||t==='ol')out.push(list(c,t==='ol',''));
      else if(t==='table')out.push(tbl(c));
      else if(t==='pre')out.push('```\n'+c.textContent.replace(/\n$/,'')+'\n```');
      else if(t==='blockquote')out.push(blk(c).join('\n\n').split('\n').map(l=>'> '+l).join('\n'));
      else if(t==='hr')out.push('---');
      else if(c.querySelector('p,h1,h2,h3,h4,h5,h6,ul,ol,table,pre,div,blockquote'))out.push(...blk(c));
      else{const x=inl(c).trim();if(x)out.push(x)}
    });return out;
  }
  return blk(root).filter(Boolean).join('\n\n');
}
const small=c=>{const s=330/Math.max(c.width,c.height),t=document.createElement('canvas');t.width=Math.max(1,c.width*s);t.height=Math.max(1,c.height*s);t.getContext('2d').drawImage(c,0,0,t.width,t.height);return t.toDataURL('image/jpeg',.8)};

async function convertDoc(file){
  const e=ext(file.name),out=[];
  await need('h2c');
  const stage=document.createElement('div');stage.id='stage';document.body.appendChild(stage);
  const snap=async(el,pw,ph,md,i,n)=>{
    busy('“'+file.name+'” çevriliyor… '+(i+1)+'/'+n);
    const c=await html2canvas(el,{scale:2,backgroundColor:'#fff',logging:false});
    out.push({img:c.toDataURL('image/png'),th:small(c),w:c.width,h:c.height,pw,ph,md});
  };
  try{
    if(e==='docx'){
      await need('docx');
      await docx.renderAsync(await file.arrayBuffer(),stage,null,{className:'docx',inWrapper:false,breakPages:true,useBase64URL:true,ignoreLastRenderedPageBreak:false});
      await document.fonts.ready;
      let secs=[...stage.querySelectorAll('section.docx')];if(!secs.length)secs=[stage];
      for(let i=0;i<secs.length;i++){const s=secs[i];await snap(s,s.offsetWidth*.75,s.offsetHeight*.75,domToMd(s),i,secs.length)}
    }else{
      let src=document.createElement('div'),land=false,mono=false,plain=false;
      if(e==='pptx'){
        const z=await JSZip.loadAsync(await file.arrayBuffer());land=true;
        const names=Object.keys(z.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>a.match(/\d+/)[0]-b.match(/\d+/)[0]);
        for(const n of names){
          const x=new DOMParser().parseFromString(await z.file(n).async('string'),'application/xml'),d=document.createElement('div');d.dataset.brk='1';
          [...x.getElementsByTagNameNS('*','p')].forEach(p=>{const t=[...p.getElementsByTagNameNS('*','t')].map(a=>a.textContent).join('').trim();if(!t)return;const el=document.createElement(d.childElementCount?'p':'h1');el.textContent=t;d.appendChild(el)});
          if(!d.childElementCount)d.innerHTML='<p style="color:#888">(Bu slaytta metin yok)</p>';
          src.appendChild(d);
        }
      }else if(['xlsx','xls','xlsm','ods','csv','tsv'].includes(e)){
        await need('xlsx');land=true;const txt=e==='csv'||e==='tsv';
        const wb=XLSX.read(txt?await file.text():await file.arrayBuffer(),txt?(e==='tsv'?{type:'string',FS:'\t'}:{type:'string'}):{type:'array'});
        wb.SheetNames.forEach(sn=>{const h=document.createElement('h2');h.textContent=sn;h.dataset.brk='1';src.appendChild(h);
          const t=new DOMParser().parseFromString(XLSX.utils.sheet_to_html(wb.Sheets[sn]),'text/html').querySelector('table');if(t)src.appendChild(t)});
      }else if(e==='md'||e==='markdown'){
        await need('marked','purify');src.innerHTML=DOMPurify.sanitize(marked.parse(await file.text()));
      }else if(e==='html'||e==='htm'){
        await need('purify');src.innerHTML=DOMPurify.sanitize(await file.text(),{FORBID_TAGS:['style','link','meta','iframe','form','input','button','video','audio','object','embed']});
      }else{
        plain=true;mono=CODE.includes(e);
        (await file.text()).replace(/\r/g,'').split('\n').forEach(l=>{const d=document.createElement('div');d.className='ln';d.textContent=l.replace(/\t/g,'    ');src.appendChild(d)});
      }
      src.querySelectorAll('img').forEach(i=>{if(!/^data:/.test(i.getAttribute('src')||''))i.remove()});
      [...src.childNodes].forEach(n=>{if(n.nodeType===3){if(n.textContent.trim()){const p=document.createElement('p');p.textContent=n.textContent;src.replaceChild(p,n)}else src.removeChild(n)}});
      while(src.children.length===1&&/^(DIV|SECTION|ARTICLE|MAIN|BODY)$/.test(src.firstElementChild.tagName)&&!src.firstElementChild.dataset.brk)src=src.firstElementChild;

      const pgs=[];let cur;
      const mk=()=>{const pg=document.createElement('div');pg.className='pg'+(land?' land':'')+(mono?' mono':'');const inn=document.createElement('div');inn.className='in';pg.appendChild(inn);stage.appendChild(pg);pgs.push(pg);return inn};
      const full=()=>cur.scrollHeight>cur.clientHeight+1,newPg=()=>{cur=mk()},put=n=>{cur.appendChild(n);return!full()};
      cur=mk();
      function place(b){
        if(b.dataset&&b.dataset.brk&&cur.childElementCount)newPg();
        if(put(b))return;
        cur.removeChild(b);
        if(cur.childElementCount){newPg();if(put(b))return;cur.removeChild(b)}
        const tag=b.tagName,isT=tag==='TABLE',isL=tag==='UL'||tag==='OL',isP=tag==='PRE';
        if(/^(DIV|SECTION|ARTICLE|MAIN|HEADER|FOOTER)$/.test(tag)&&b.children.length>1){[...b.children].forEach(place);return}
        if(!(isT||isL||isP)){cur.appendChild(b);return}
        const items=isT?[...b.rows].filter(r=>r.parentNode.tagName!=='THEAD'):isL?[...b.children]:b.textContent.split('\n');
        let host;
        const fresh=()=>{const sh=b.cloneNode(false);if(isT){if(b.tHead)sh.appendChild(b.tHead.cloneNode(true));host=sh.appendChild(document.createElement('tbody'))}else host=sh;cur.appendChild(sh)};
        fresh();
        for(const it of items){
          if(isP){const prev=host.textContent;host.textContent=prev+it+'\n';if(full()&&prev){host.textContent=prev;newPg();fresh();host.textContent=it+'\n'}}
          else{host.appendChild(it);if(full()&&host.childElementCount>1){host.removeChild(it);newPg();fresh();host.appendChild(it)}}
        }
      }
      [...src.children].forEach(place);
      await document.fonts.ready;
      const real=pgs.filter(p=>p.firstChild.childElementCount);
      if(!real.length)throw new Error('Dosyada gösterilecek içerik yok.');
      if(real.length>400)throw new Error('Dosya çok büyük (400 sayfadan fazla).');
      for(let i=0;i<real.length;i++){
        const inn=real[i].firstChild;
        const md=plain?(mono?'```\n':'')+[...inn.children].map(c=>c.textContent).join('\n').trim()+(mono?'\n```':''):domToMd(inn);
        await snap(real[i],(land?841.89:595.28),(land?595.28:841.89),md,i,real.length);
      }
    }
  }finally{stage.remove()}
  if(!out.length)throw new Error('İçerik okunamadı.');
  return out;
}

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
    else{const z=new JSZip();items.forEach(([n,b])=>z.file(n,b));await save(baseName()+'-'+ext+'.zip',await z.generateAsync({type:'blob'}))}
  });
};

/* ---------- OCR (taranmış PDF ve resimlerden metin) ---------- */
var mdList=[],mdTok=0,ocrW=null,ocrL='',ocrCache={},mdLabel='';
const ocrKey=(p,l)=>p.id+'|'+p.rot+'|'+JSON.stringify(p.crop)+'|'+l;
function mdProg(label,pct){
  const b=$('#mProg');b.hidden=false;if(label!=null){mdLabel=label;$('#mPt').textContent=label}
  const bar=$('#mPb');if(pct==null){bar.style.width='35%';bar.classList.add('ind')}else{bar.classList.remove('ind');bar.style.width=Math.round(pct*100)+'%'}
}
async function mdWork(fn){
  const dlg=$('#md'),ctl=[...dlg.querySelectorAll('input,select,button')].filter(x=>x.id!=='mX');
  ctl.forEach(x=>x.disabled=true);dlg.classList.add('wk');
  try{await fn()}catch(err){alert('Bir hata oluştu: '+(err&&err.message||err))}
  finally{ctl.forEach(x=>x.disabled=false);$('#mZip').disabled=mdList.length<2;dlg.classList.remove('wk');$('#mProg').hidden=true}
}
async function ocrWorker(lang){
  await need('tess');
  if(ocrW&&ocrL===lang)return ocrW;
  if(ocrW){try{await ocrW.terminate()}catch(e){}ocrW=null}
  mdProg('OCR motoru ve dil verisi indiriliyor… (ilk seferde biraz sürebilir)',null);
  ocrW=await Tesseract.createWorker(lang.split('+'),1,{logger:m=>{if(m.status==='recognizing text')mdProg(null,m.progress)}});
  ocrL=lang;return ocrW;
}
function ocrToMd(t){
  const out=[];let para=[];
  const flush=()=>{if(para.length){out.push(para.join(' ').replace(/\s+/g,' ').trim());para=[]}};
  for(const raw of t.replace(/\r/g,'').split('\n')){
    const l=raw.trim();
    if(!l){flush();continue}
    const b=l.match(/^[•●▪◦·*»›-]\s+(.+)/),n=l.match(/^(\d{1,3})[.)]\s+(.+)/);
    if(b||n){flush();out.push({li:b?'- '+b[1]:n[1]+'. '+n[2]});continue}
    if(para.length&&/\p{L}-$/u.test(para[para.length-1])&&/^\p{Ll}/u.test(l))para[para.length-1]=para[para.length-1].slice(0,-1)+l;else para.push(l);
  }
  flush();
  let s='';out.forEach((b,i)=>{s+=(i?(b.li&&out[i-1].li?'\n':'\n\n'):'')+(typeof b==='string'?b:b.li)});
  return s;
}
const needsOcr=d=>d===null||(Array.isArray(d)&&d.reduce((n,L)=>n+L.text.length,0)<20);
async function mdOcrFill(tok){
  if(!$('#mOcr').checked)return;
  const lang=$('#mLang').value,todo=mdList.filter((p,i)=>p.fi>=0&&needsOcr(mdData[i])&&ocrCache[ocrKey(p,lang)]===undefined);
  if(!todo.length)return;
  const w=await ocrWorker(lang);
  for(let k=0;k<todo.length;k++){
    if(tok!==mdTok)return;
    const p=todo[k];mdProg('OCR okunuyor: sayfa '+(k+1)+'/'+todo.length,0);
    const r=await w.recognize(await pageBlob(p,250,'image/png'));
    ocrCache[ocrKey(p,lang)]=ocrToMd(r.data.text||'');
  }
}

/* PDF → Markdown dönüştürücü */
var mdIds=[],mdData=[],mdParts=[];
async function pageLines(p){
  if(p.fi<0)return[];
  const f=files[p.fi];if(f.img)return typeof f.md==='string'?f.md:null;
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
  const sz={};data.forEach(ls=>Array.isArray(ls)&&ls.forEach(L=>{const k=Math.round(L.size*2)/2;sz[k]=(sz[k]||0)+L.text.length}));
  const body=+Object.keys(sz).sort((a,b)=>sz[b]-sz[a])[0]||12;
  return data.map(ls=>typeof ls==='string'?(ls.trim()||'<!-- Bu sayfada metin bulunamadı -->'):ls===null?'<!-- Görsel sayfa: metin yok -->':ls.length?renderPageMd(ls,body,opt):'<!-- Bu sayfada metin bulunamadı (taranmış veya boş olabilir) -->');
}
const mdOpt=()=>({tables:$('#mTbl').checked,sep:$('#mSep').checked});
function mdGen(){const o=mdOpt(),on=$('#mOcr').checked,lang=$('#mLang').value;
  const data=mdData.map((d,i)=>{const r=on&&mdList[i]?ocrCache[ocrKey(mdList[i],lang)]:undefined;return(typeof r==='string'&&r.trim()&&needsOcr(d))?r:d});
  mdParts=renderMd(data,o);$('#mTxt').value=mdParts.join(o.sep?'\n\n---\n\n':'\n\n')}
var mdInitialText='';
function openMd(ids){
  mdIds=ids;mdList=pages.filter(p=>ids.includes(p.id));mdData=[];mdParts=[];const tok=++mdTok;
  $('#mn').textContent=mdList.length+' sayfa';
  $('#mTitle').textContent='📝 Markdown & OCR Stüdyosu';
  $('#mO').classList.add('pri');
  $('#mTxt').value='';
  $('#md').showModal();
  mdWork(async()=>{
    for(let k=0;k<mdList.length;k++){if(tok!==mdTok)return;mdProg('Metin okunuyor… '+(k+1)+'/'+mdList.length,null);mdData.push(await pageLines(mdList[k]))}
    await mdOcrFill(tok);if(tok!==mdTok)return;mdGen();
    mdInitialText=$('#mTxt').value;
  });
}
['#mTbl','#mSep'].forEach(s=>$(s).onchange=mdGen);
['#mOcr','#mLang'].forEach(s=>$(s).onchange=()=>{const tok=mdTok;mdWork(async()=>{await mdOcrFill(tok);mdGen()})});
$('#bMd').onclick=()=>openMd(sel.size?[...sel]:pages.map(p=>p.id));
$('#mX').onclick=()=>$('#md').close();
$('#mC').onclick=async()=>{
  const t=$('#mTxt').value,b=$('#mC');
  try{await navigator.clipboard.writeText(t)}catch(e){$('#mTxt').select();document.execCommand('copy')}
  b.textContent='Kopyalandı ✓';setTimeout(()=>b.textContent='⧉ Kopyala',1500);
};
$('#mO').onclick=()=>{
  const base=baseName();
  if($('#mZip').checked&&mdParts.length>1){
    run('ZIP hazırlanıyor…',async()=>{const z=new JSZip(),w=String(mdParts.length).length;
      mdParts.forEach((t,i)=>z.file('sayfa-'+String(i+1).padStart(w,'0')+'.md',t));
      await save(base+'-markdown.zip',await z.generateAsync({type:'blob'}))});
  }else save(base+'.md',new Blob([$('#mTxt').value],{type:'text/markdown;charset=utf-8'}));
};

/* ---------- Markdown → Word (.docx) ---------- */
const X=s=>String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function mdToDocx(md){
  const rels=[],nums=[],body=[];let nextNum=2,lastOrd=null,para=[];
  const run=(t,o={})=>{if(!t)return'';const col=o.link?'0563C1':o.color;
    return'<w:r><w:rPr>'+(o.code?'<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>':'')+(o.b?'<w:b/>':'')+(o.i?'<w:i/>':'')+(col?'<w:color w:val="'+col+'"/>':'')+(o.sz?'<w:sz w:val="'+o.sz+'"/>':'')+(o.link?'<w:u w:val="single"/>':'')+'</w:rPr><w:t xml:space="preserve">'+X(t)+'</w:t></w:r>'};
  const inl=(s,base={})=>{
    let out='',last=0,m;const re=/\*\*([^*]+?)\*\*|\*(?!\s)([^*\n]+?)(?<!\s)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\u0001/g;
    while((m=re.exec(s))){
      out+=run(s.slice(last,m.index),base);
      if(m[1]!=null)out+=run(m[1],{...base,b:1});
      else if(m[2]!=null)out+=run(m[2],{...base,i:1});
      else if(m[3]!=null)out+=run(m[3],{...base,code:1});
      else if(m[4]!=null){const id='rIdL'+(rels.length+1);rels.push('<Relationship Id="'+id+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="'+X(m[5])+'" TargetMode="External"/>');out+='<w:hyperlink r:id="'+id+'">'+run(m[4],{...base,link:1})+'</w:hyperlink>'}
      else out+='<w:r><w:br/></w:r>';
      last=re.lastIndex;
    }
    return out+run(s.slice(last),base);
  };
  const P=(inner,ppr)=>'<w:p>'+(ppr?'<w:pPr>'+ppr+'</w:pPr>':'')+inner+'</w:p>';
  const splitRow=l=>l.trim().replace(/^\||\|$/g,'').split(/(?<!\\)\|/).map(c=>c.trim().replace(/\\\|/g,'|'));
  const tbl=rows=>{
    if(!rows.length)return'';
    const n=Math.max(...rows.map(r=>r.length)),w=Math.floor(9638/n),bd=['top','left','bottom','right','insideH','insideV'].map(k=>'<w:'+k+' w:val="single" w:sz="4" w:space="0" w:color="999999"/>').join('');
    return'<w:tbl><w:tblPr><w:tblW w:w="9638" w:type="dxa"/><w:tblBorders>'+bd+'</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>'+('<w:gridCol w:w="'+w+'"/>').repeat(n)+'</w:tblGrid>'+
      rows.map((r,ri)=>'<w:tr>'+Array.from({length:n},(_,c)=>'<w:tc><w:tcPr><w:tcW w:w="'+w+'" w:type="dxa"/>'+(ri===0?'<w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/>':'')+'</w:tcPr>'+P(inl(r[c]||'',ri===0?{b:1}:{}),'<w:spacing w:before="40" w:after="40"/>')+'</w:tc>').join('')+'</w:tr>').join('')+'</w:tbl><w:p/>';
  };
  const flush=()=>{if(para.length){body.push(P(inl(para.reduce((a,b)=>a+(a.endsWith('\u0001')?'':' ')+b))));para=[]}};
  const lines=md.replace(/\r/g,'').split('\n'),isRow=l=>/^\s*\|.*\|\s*$/.test(l);
  let i=0;
  while(i<lines.length){
    const l=lines[i];let m;
    if(!l.trim()){flush();i++;continue}
    if(/^```/.test(l)){flush();i++;while(i<lines.length&&!/^```/.test(lines[i])){body.push(P(run(lines[i]||' ',{code:1,sz:20}),'<w:spacing w:before="0" w:after="0"/>'));i++}i++;lastOrd=null;continue}
    if(/^\s*---+\s*$/.test(l)){flush();body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');i++;lastOrd=null;continue}
    if((m=l.match(/^<!--\s*(.*?)\s*-->$/))){flush();body.push(P(run(m[1],{i:1,color:'888888'})));i++;continue}
    if((m=l.match(/^(#{1,6})\s+(.+)/))){flush();body.push(P(inl(m[2]),'<w:pStyle w:val="Heading'+m[1].length+'"/>'));i++;lastOrd=null;continue}
    if(isRow(l)){flush();const rows=[];while(i<lines.length&&isRow(lines[i])){if(!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i]))rows.push(splitRow(lines[i]));i++}body.push(tbl(rows));lastOrd=null;continue}
    if((m=l.match(/^(\s*)[-*•]\s+(.*)/))){flush();body.push(P(inl(m[2]),'<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="'+Math.min(2,Math.floor(m[1].length/2))+'"/><w:numId w:val="1"/></w:numPr>'));i++;lastOrd=null;continue}
    if((m=l.match(/^(\s*)(\d{1,3})[.)]\s+(.*)/))){flush();if(lastOrd==null){lastOrd=nextNum++;nums.push(lastOrd)}body.push(P(inl(m[3]),'<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="'+Math.min(2,Math.floor(m[1].length/2))+'"/><w:numId w:val="'+lastOrd+'"/></w:numPr>'));i++;continue}
    if((m=l.match(/^>\s?(.*)/))){flush();body.push(P(inl(m[1],{color:'555555'}),'<w:ind w:left="567"/>'));i++;lastOrd=null;continue}
    para.push(/ {2}$/.test(l)?l.trim()+'\u0001':l.trim());lastOrd=null;i++;
  }
  flush();
  return{body:body.join(''),rels,nums,media:[],margin:1134};
}

async function docxBlob(d,type){
  const H='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',W='xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',R='xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const z=new JSZip(),T='http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  z.file('[Content_Types].xml',H+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>');
  z.file('_rels/.rels',H+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="'+T+'officeDocument" Target="word/document.xml"/></Relationships>');
  z.file('word/_rels/document.xml.rels',H+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="'+T+'styles" Target="styles.xml"/><Relationship Id="rId2" Type="'+T+'numbering" Target="numbering.xml"/>'+(d.rels||[]).join('')+(d.media||[]).map(m=>'<Relationship Id="'+m.id+'" Type="'+T+'image" Target="media/'+m.name+'"/>').join('')+'</Relationships>');
  const mg=d.margin||1134,mgT=d.marginTop||mg,mgB=d.marginBottom||mg,mgL=d.marginLeft||mg,mgR=d.marginRight||mg,pw=d.pw||11906,ph=d.ph||16838;
  z.file('word/document.xml',H+'<w:document '+W+' '+R+' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>'+d.body+'<w:sectPr><w:pgSz w:w="'+pw+'" w:h="'+ph+'"/><w:pgMar w:top="'+mgT+'" w:right="'+mgR+'" w:bottom="'+mgB+'" w:left="'+mgL+'" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>');
  const hs=[36,30,26,24,22,22].map((s,k)=>'<w:style w:type="paragraph" w:styleId="Heading'+(k+1)+'"><w:name w:val="heading '+(k+1)+'"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="140" w:after="70"/><w:outlineLvl w:val="'+k+'"/></w:pPr><w:rPr><w:b/><w:sz w:val="'+s+'"/></w:rPr></w:style>').join('');
  z.file('word/styles.xml',H+'<w:styles '+W+'><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="tr-TR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="40" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'+hs+'<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="40"/></w:pPr></w:style></w:styles>');
  const lv=(fmt,txt)=>[0,1,2].map(k=>'<w:lvl w:ilvl="'+k+'"><w:start w:val="1"/><w:numFmt w:val="'+fmt+'"/><w:lvlText w:val="'+(fmt==='bullet'?['•','–','▪'][k]:'%'+(k+1)+'.')+'"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="'+(720+k*720)+'" w:hanging="360"/></w:pPr></w:lvl>').join('');
  z.file('word/numbering.xml',H+'<w:numbering '+W+'><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>'+lv('bullet')+'</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>'+lv('decimal')+'</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'+(d.nums||[]).map(n=>'<w:num w:numId="'+n+'"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>').join('')+'</w:numbering>');
  (d.media||[]).forEach(m=>z.file('word/media/'+m.name,m.data));
  return z.generateAsync({type:type||'blob',compression:'DEFLATE',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}

/* ---------- Süper PDF → Word Dönüştürücü (Tam Biçimlendirme & Tablo Motoru) ---------- */
function getItemStyle(it,styles,pg){
  const s=(styles&&styles[it.fontName])||{};
  let objName='',objBold=false,objItalic=false;
  if(pg&&it.fontName){
    try{
      if(pg.commonObjs&&pg.commonObjs.has(it.fontName)){
        const fo=pg.commonObjs.get(it.fontName);
        if(fo){
          objName=fo.name||'';
          objBold=!!(fo.bold||fo.black);
          objItalic=!!fo.italic;
        }
      }
    }catch(e){}
  }

  const combined=(objName+' '+(s.fontFamily||'')+' '+(it.fontName||'')).toLowerCase();
  const bold=objBold||/bold|black|heavy|demi|semibold|extrab|ultrab|w[6-9]|600|700|800|900|[-+,_](bd|b)(?=$|[-+,_\s])/i.test(combined)||(s.weight&&s.weight>=600);
  const italic=objItalic||/italic|oblique|slanted|[-+,_](it|obl)(?=$|[-+,_\s])/i.test(combined);

  let rawFam=(objName||s.fontFamily||'Calibri').replace(/["']/g,'').trim();
  rawFam=rawFam.replace(/^[a-z]{6}\+/i,'').replace(/[,_-].*$/,'').trim();
  const low=rawFam.toLowerCase();

  let fam='Calibri';
  if(low.includes('times')||low.includes('roman')||low.includes('nimbusrom')||low.includes('liberationserif')||low.includes('dejavuserif')||low.includes('ptserif')||low.includes('noto serif')){
    fam='Times New Roman';
  }else if(low.includes('arial')||low.includes('helvetica')||low.includes('liberationsans')||low.includes('nimbussan')||low.includes('arimo')){
    fam='Arial';
  }else if(low.includes('calibri')||low.includes('carlito')){
    fam='Calibri';
  }else if(low.includes('tahoma')){
    fam='Tahoma';
  }else if(low.includes('verdana')){
    fam='Verdana';
  }else if(low.includes('segoe')){
    fam='Segoe UI';
  }else if(low.includes('cambria')||low.includes('caladea')){
    fam='Cambria';
  }else if(low.includes('georgia')){
    fam='Georgia';
  }else if(low.includes('garamond')){
    fam='Garamond';
  }else if(low.includes('trebuchet')){
    fam='Trebuchet MS';
  }else if(low.includes('century')){
    fam='Century Gothic';
  }else if(low.includes('palatino')||low.includes('antiqua')){
    fam='Palatino Linotype';
  }else if(low.includes('courier')||(low.includes('mono')&&objName.toLowerCase().includes('mono'))||low.includes('consolas')){
    fam='Consolas';
  }else if(low.includes('sourcesans')||low.includes('opensans')||low.includes('roboto')||low.includes('notosans')||low.includes('dejavusans')||low.includes('ubuntu')||low.includes('inter')||low.includes('lato')||low.includes('montserrat')){
    fam='Calibri';
  }else if((s.fontFamily||'').toLowerCase()==='serif'){
    fam='Times New Roman';
  }

  return{bold:!!bold,italic:!!italic,font:fam};
}

function rgbToHex(rgb,allowDark){
  if(!rgb||rgb.length<3)return null;
  const r=Math.max(0,Math.min(255,rgb[0]>1?Math.round(rgb[0]):Math.round(rgb[0]*255)));
  const g=Math.max(0,Math.min(255,rgb[1]>1?Math.round(rgb[1]):Math.round(rgb[1]*255)));
  const b=Math.max(0,Math.min(255,rgb[2]>1?Math.round(rgb[2]):Math.round(rgb[2]*255)));
  if(r>=246&&g>=246&&b>=246)return null;
  if(!allowDark&&r<=25&&g<=25&&b<=25)return null;
  return[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
}

async function extractPageGraphics(pg,vp){
  const hLines=[],vLines=[],shadedRects=[],textStylings=[],imageBoxes=[];
  try{
    const opList=await pg.getOperatorList();
    const fnArray=opList.fnArray,argsArray=opList.argsArray;
    const OPS=pdfjsLib.OPS,U=pdfjsLib.Util;
    let ctm=[1,0,0,1,0,0];
    let fillRgb=[0,0,0],strokeRgb=[0,0,0],lineWidth=1,textRenderMode=0;
    let clipBox={x1:0,y1:0,x2:vp.width,y2:vp.height};
    let tm=[1,0,0,1,0,0],tlm=[1,0,0,1,0,0],textLeading=0;
    const stateStack=[];
    const tr=(px,py)=>{const p1=U.applyTransform([px,py],ctm);return U.applyTransform(p1,vp.transform)};
    let curPath=[],lastPt=[0,0];

    const clampX=x=>Math.max(clipBox.x1,Math.min(clipBox.x2,x));
    const clampY=y=>Math.max(clipBox.y1,Math.min(clipBox.y2,y));

    const addH=(x1,x2,y,col,thk)=>{
      if(y<clipBox.y1-2||y>clipBox.y2+2)return;
      const cx1=clampX(Math.min(x1,x2)),cx2=clampX(Math.max(x1,x2)),cy=clampY(y);
      if(cx2-cx1>=4.5)hLines.push({x1:cx1,x2:cx2,y:cy,color:col||'334155',thk:thk||1});
    };
    const addV=(x,y1,y2,col,thk)=>{
      if(x<clipBox.x1-2||x>clipBox.x2+2)return;
      const cy1=clampY(Math.min(y1,y2)),cy2=clampY(Math.max(y1,y2)),cx=clampX(x);
      if(cy2-cy1>=4)vLines.push({x:cx,y1:cy1,y2:cy2,color:col||'334155',thk:thk||1});
    };

    const parseColorArgs=args=>{
      if(!args||!args.length)return[0,0,0];
      if(typeof args[0]==='string'&&args[0].startsWith('#')){
        const hex=args[0].slice(1);
        if(hex.length===6)return[parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)];
      }
      if(args.length===4){
        const c=Number(args[0])||0,m=Number(args[1])||0,y=Number(args[2])||0,k=Number(args[3])||0;
        return[(1-c)*(1-k),(1-m)*(1-k),(1-y)*(1-k)];
      }
      if(args.length>=3)return[Number(args[0])||0,Number(args[1])||0,Number(args[2])||0];
      if(args.length===1){const g=Number(args[0])||0;return[g,g,g]}
      return[0,0,0];
    };

    const getPathBounds=path=>{
      let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
      for(const seg of path){
        if(seg[0]==='line'){
          x1=Math.min(x1,seg[1][0],seg[2][0]);x2=Math.max(x2,seg[1][0],seg[2][0]);
          y1=Math.min(y1,seg[1][1],seg[2][1]);y2=Math.max(y2,seg[1][1],seg[2][1]);
        }else if(seg[0]==='rect'){
          const pTL=tr(seg[1],seg[2]+seg[4]),pBR=tr(seg[1]+seg[3],seg[2]);
          x1=Math.min(x1,pTL[0],pBR[0]);x2=Math.max(x2,pTL[0],pBR[0]);
          y1=Math.min(y1,pTL[1],pBR[1]);y2=Math.max(y2,pTL[1],pBR[1]);
        }
      }
      return x2>x1&&y2>y1?{x1,y1,x2,y2}:null;
    };

    for(let i=0;i<fnArray.length;i++){
      const fn=fnArray[i],args=argsArray[i];
      if(fn===OPS.save){
        stateStack.push({ctm:[...ctm],fillRgb:[...fillRgb],strokeRgb:[...strokeRgb],lineWidth,textRenderMode,clipBox:{...clipBox}});
      }else if(fn===OPS.restore){
        if(stateStack.length){
          const st=stateStack.pop();
          ctm=st.ctm;fillRgb=st.fillRgb;strokeRgb=st.strokeRgb;lineWidth=st.lineWidth;textRenderMode=st.textRenderMode;clipBox=st.clipBox;
        }
      }else if(fn===OPS.transform){
        ctm=U.transform(ctm,args);
      }else if(fn===OPS.setLineWidth){
        lineWidth=Number(args&&args[0])||1;
      }else if(fn===OPS.setTextRenderingMode){
        textRenderMode=Number(args&&args[0])||0;
      }else if(fn===OPS.setFillRGBColor||fn===OPS.setFillGray||fn===OPS.setFillColor||fn===OPS.setFillCMYKColor){
        fillRgb=parseColorArgs(args);
      }else if(fn===OPS.setStrokeRGBColor||fn===OPS.setStrokeGray||fn===OPS.setStrokeColor||fn===OPS.setStrokeCMYKColor){
        strokeRgb=parseColorArgs(args);
      }else if(fn===OPS.beginText){
        tm=[1,0,0,1,0,0];tlm=[1,0,0,1,0,0];
      }else if(fn===OPS.setTextMatrix){
        if(args&&args.length>=6){tm=[...args];tlm=[...args]}
      }else if(fn===OPS.moveText){
        if(args&&args.length>=2){tlm=U.transform(tlm,[1,0,0,1,args[0],args[1]]);tm=[...tlm]}
      }else if(fn===OPS.moveTextSetLeading){
        if(args&&args.length>=2){textLeading=-args[1];tlm=U.transform(tlm,[1,0,0,1,args[0],args[1]]);tm=[...tlm]}
      }else if(fn===OPS.setLeading){
        textLeading=Number(args&&args[0])||0;
      }else if(fn===OPS.nextLine){
        tlm=U.transform(tlm,[1,0,0,1,0,-textLeading]);tm=[...tlm];
      }else if(fn===OPS.showText||fn===OPS.showSpacedText||fn===OPS.nextLineShowText||fn===OPS.nextLineSetSpacingShowText){
        const hexCol=rgbToHex(fillRgb,false);
        const isSynthBold=(textRenderMode===2||textRenderMode===6);
        if(hexCol||isSynthBold){
          const pt=tr(tm[4],tm[5]);
          textStylings.push({x:pt[0],y:pt[1],color:hexCol,synthBold:isSynthBold});
        }
      }else if(fn===OPS.paintImageXObject||fn===OPS.paintJpegXObject||fn===OPS.paintInlineImageXObject){
        const p0=tr(0,0),p1=tr(1,1);
        const ix=Math.min(p0[0],p1[0]),iy=Math.min(p0[1],p1[1]);
        const iw=Math.abs(p1[0]-p0[0]),ih=Math.abs(p1[1]-p0[1]);
        if(iw>=16&&ih>=16&&!(iw>=vp.width*0.85&&ih>=vp.height*0.85)){
          imageBoxes.push({x:clampX(ix),y:clampY(iy),w:Math.min(iw,vp.width),h:Math.min(ih,vp.height)});
        }
      }else if(fn===OPS.moveTo){
        lastPt=tr(args[0],args[1]);
      }else if(fn===OPS.lineTo){
        const pt=tr(args[0],args[1]);
        curPath.push(['line',lastPt,pt]);
        lastPt=pt;
      }else if(fn===OPS.rectangle){
        curPath.push(['rect',args[0],args[1],args[2],args[3]]);
      }else if(fn===OPS.constructPath){
        curPath=[];
        const subOps=args[0],subArgs=args[1];
        let idx=0,startPt=[0,0];
        for(let j=0;j<subOps.length;j++){
          const sOp=subOps[j];
          if(sOp===OPS.moveTo){
            lastPt=tr(subArgs[idx],subArgs[idx+1]);
            startPt=lastPt;
            idx+=2;
          }else if(sOp===OPS.lineTo){
            const pt=tr(subArgs[idx],subArgs[idx+1]);
            curPath.push(['line',lastPt,pt]);
            lastPt=pt;
            idx+=2;
          }else if(sOp===OPS.rectangle){
            curPath.push(['rect',subArgs[idx],subArgs[idx+1],subArgs[idx+2],subArgs[idx+3]]);
            idx+=4;
          }else if(sOp===OPS.curveTo){
            lastPt=tr(subArgs[idx+4],subArgs[idx+5]);
            idx+=6;
          }else if(sOp===OPS.curveTo2||sOp===OPS.curveTo3){
            lastPt=tr(subArgs[idx+2],subArgs[idx+3]);
            idx+=4;
          }else if(sOp===OPS.closePath){
            if(lastPt&&startPt)curPath.push(['line',lastPt,startPt]);
          }
        }
      }else if(fn===OPS.clip||fn===OPS.eoClip){
        const b=getPathBounds(curPath);
        if(b&&b.x2-b.x1>=20&&b.y2-b.y1>=15){
          clipBox={
            x1:Math.max(clipBox.x1,b.x1),
            y1:Math.max(clipBox.y1,b.y1),
            x2:Math.min(clipBox.x2,b.x2),
            y2:Math.min(clipBox.y2,b.y2)
          };
        }
        curPath=[];
      }else if(fn===OPS.endPath){
        curPath=[];
      }else if(fn===OPS.stroke||fn===OPS.closeStroke||fn===OPS.strokePath||fn===OPS.fillStroke||fn===OPS.eoFillStroke){
        const stHex=rgbToHex(strokeRgb,true)||'334155';
        for(const seg of curPath){
          if(seg[0]==='line'){
            const p1=seg[1],p2=seg[2];
            const dx=Math.abs(p2[0]-p1[0]),dy=Math.abs(p2[1]-p1[1]);
            if(dy<=2.5&&dx>=4.5)addH(p1[0],p2[0],(p1[1]+p2[1])/2,stHex,lineWidth);
            else if(dx<=2.5&&dy>=4)addV((p1[0]+p2[0])/2,p1[1],p2[1],stHex,lineWidth);
          }else if(seg[0]==='rect'){
            const pTL=tr(seg[1],seg[2]+seg[4]),pBR=tr(seg[1]+seg[3],seg[2]);
            const xMin=Math.min(pTL[0],pBR[0]),xMax=Math.max(pTL[0],pBR[0]);
            const yMin=Math.min(pTL[1],pBR[1]),yMax=Math.max(pTL[1],pBR[1]);
            const w=xMax-xMin,h=yMax-yMin;
            if(w>=vp.width*0.93&&h>=vp.height*0.88)continue;
            if(h<=3.5&&w>=4.5)addH(xMin,xMax,(yMin+yMax)/2,stHex,h);
            else if(w<=3.5&&h>=4)addV((xMin+xMax)/2,yMin,yMax,stHex,w);
            else if(w>=5&&h>=4){
              addH(xMin,xMax,yMin,stHex,lineWidth);
              addH(xMin,xMax,yMax,stHex,lineWidth);
              addV(xMin,yMin,yMax,stHex,lineWidth);
              addV(xMax,yMin,yMax,stHex,lineWidth);
            }
          }
        }
        curPath=[];
      }else if(fn===OPS.fill||fn===OPS.eoFill){
        const fillHex=rgbToHex(fillRgb,false);
        const lineHex=rgbToHex(fillRgb,true)||'334155';
        let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,hasLine=false;
        for(const seg of curPath){
          if(seg[0]==='rect'){
            const pTL=tr(seg[1],seg[2]+seg[4]),pBR=tr(seg[1]+seg[3],seg[2]);
            const xMin=Math.min(pTL[0],pBR[0]),xMax=Math.max(pTL[0],pBR[0]);
            const yMin=Math.min(pTL[1],pBR[1]),yMax=Math.max(pTL[1],pBR[1]);
            const w=xMax-xMin,h=yMax-yMin;
            if(h<=3.5&&w>=4.5)addH(xMin,xMax,(yMin+yMax)/2,lineHex,h);
            else if(w<=3.5&&h>=4)addV((xMin+xMax)/2,yMin,yMax,lineHex,w);
            else if(fillHex&&w>3.5&&h>4&&!(w>=vp.width*0.90&&h>=vp.height*0.85)){
              shadedRects.push({x:clampX(xMin),y:clampY(yMin),w:Math.min(w,vp.width),h:Math.min(h,vp.height),color:fillHex});
            }
          }else if(seg[0]==='line'){
            hasLine=true;
            minX=Math.min(minX,seg[1][0],seg[2][0]);
            maxX=Math.max(maxX,seg[1][0],seg[2][0]);
            minY=Math.min(minY,seg[1][1],seg[2][1]);
            maxY=Math.max(maxY,seg[1][1],seg[2][1]);
          }
        }
        if(hasLine){
          const w=maxX-minX,h=maxY-minY;
          if(h<=3.5&&w>=4.5)addH(minX,maxX,(minY+maxY)/2,lineHex,h);
          else if(w<=3.5&&h>=4)addV((minX+maxX)/2,minY,maxY,lineHex,w);
          else if(fillHex&&w>3.5&&h>4&&!(w>=vp.width*0.90&&h>=vp.height*0.85)){
            shadedRects.push({x:clampX(minX),y:clampY(minY),w:Math.min(w,vp.width),h:Math.min(h,vp.height),color:fillHex});
          }
        }
        curPath=[];
      }
    }
  }catch(err){console.warn('Graphics extraction note:',err)}
  return{hLines,vLines,shadedRects,textStylings,imageBoxes};
}

function mergeCollinearSegments(lines,isHoriz){
  const kPos=isHoriz?'y':'x',kStart=isHoriz?'x1':'y1',kEnd=isHoriz?'x2':'y2';
  const sortedByPos=[...lines].sort((a,b)=>a[kPos]-b[kPos]);
  const clusters=[];
  for(const seg of sortedByPos){
    const last=clusters[clusters.length-1];
    if(last&&Math.abs(seg[kPos]-last.pos)<=3.2){
      last.items.push(seg);
      last.pos=last.items.reduce((s,it)=>s+it[kPos],0)/last.items.length;
    }else{
      clusters.push({pos:seg[kPos],items:[seg]});
    }
  }
  const merged=[];
  for(const cl of clusters){
    const pos=cl.pos;
    const intervals=cl.items.sort((a,b)=>a[kStart]-b[kStart]);
    let cur=null;
    for(const it of intervals){
      if(!cur){
        cur={[kPos]:pos,[kStart]:it[kStart],[kEnd]:it[kEnd],color:it.color||'334155',thk:it.thk||1};
      }else if(it[kStart]<=cur[kEnd]+4.5){
        cur[kEnd]=Math.max(cur[kEnd],it[kEnd]);
        cur.thk=Math.max(cur.thk||1,it.thk||1);
      }else{
        merged.push(cur);
        cur={[kPos]:pos,[kStart]:it[kStart],[kEnd]:it[kEnd],color:it.color||'334155',thk:it.thk||1};
      }
    }
    if(cur)merged.push(cur);
  }
  return merged;
}

function clusterCoords(vals,tol){
  const sorted=[...vals].sort((a,b)=>a-b);
  const clusters=[];
  for(const v of sorted){
    const last=clusters[clusters.length-1];
    if(last&&Math.abs(v-last.center)<=tol){
      last.items.push(v);
      last.center=last.items.reduce((a,b)=>a+b,0)/last.items.length;
    }else{
      clusters.push({center:v,items:[v]});
    }
  }
  return clusters.map(c=>c.center);
}

function detectPageTables(hLines,vLines,shadedRects,vp){
  const allMergedH=mergeCollinearSegments(hLines,true);
  const mergedH=allMergedH.filter(h=>h.x2-h.x1>=10);
  const mergedV=mergeCollinearSegments(vLines,false).filter(v=>v.y2-v.y1>=8);
  const H=mergedH.length,V=mergedV.length;
  if(H<2||V<2)return{tables:[],freeHLines:allMergedH};

  const adjH=Array.from({length:H},()=>[]);
  const adjV=Array.from({length:V},()=>[]);
  const tol=4.8;

  for(let i=0;i<H;i++){
    const hl=mergedH[i];
    for(let j=0;j<V;j++){
      const vl=mergedV[j];
      if(vl.x>=hl.x1-tol&&vl.x<=hl.x2+tol&&hl.y>=vl.y1-tol&&hl.y<=vl.y2+tol){
        adjH[i].push(j);
        adjV[j].push(i);
      }
    }
  }

  const visH=new Uint8Array(H),visV=new Uint8Array(V),usedHInTable=new Uint8Array(H);
  const tables=[];

  for(let i=0;i<H;i++){
    if(visH[i]||!adjH[i].length)continue;
    const compHIdx=[],compH=[],compV=[];
    const q=[['H',i]];
    visH[i]=1;

    while(q.length){
      const[type,idx]=q.shift();
      if(type==='H'){
        compHIdx.push(idx);
        compH.push(mergedH[idx]);
        for(const vIdx of adjH[idx]){
          if(!visV[vIdx]){visV[vIdx]=1;q.push(['V',vIdx])}
        }
      }else{
        compV.push(mergedV[idx]);
        for(const hIdx of adjV[idx]){
          if(!visH[hIdx]){visH[hIdx]=1;q.push(['H',hIdx])}
        }
      }
    }

    if(compH.length<2||compV.length<2)continue;

    const vEndCandidates=[];
    for(const v of compV)vEndCandidates.push(v.y1,v.y2);
    vEndCandidates.sort((a,b)=>a-b);
    const validVEnds=[];
    for(let ci=0;ci<vEndCandidates.length;){
      let cj=ci+1;
      while(cj<vEndCandidates.length&&vEndCandidates[cj]-vEndCandidates[ci]<=4.5)cj++;
      if(cj-ci>=2){
        let sum=0;for(let k=ci;k<cj;k++)sum+=vEndCandidates[k];
        validVEnds.push(sum/(cj-ci));
      }
      ci=cj;
    }

    const hEndCandidates=[];
    for(const h of compH)hEndCandidates.push(h.x1,h.x2);
    hEndCandidates.sort((a,b)=>a-b);
    const validHEnds=[];
    for(let hi=0;hi<hEndCandidates.length;){
      let hj=hi+1;
      while(hj<hEndCandidates.length&&hEndCandidates[hj]-hEndCandidates[hi]<=4.5)hj++;
      if(hj-hi>=2){
        let sum=0;for(let k=hi;k<hj;k++)sum+=hEndCandidates[k];
        validHEnds.push(sum/(hj-hi));
      }
      hi=hj;
    }

    const rawYs=clusterCoords([...compH.map(h=>h.y),...validVEnds],4.5);
    const rawXs=clusterCoords([...compV.map(v=>v.x),...validHEnds],4.5);

    const rowYs=[rawYs[0]];
    for(let k=1;k<rawYs.length;k++){
      if(rawYs[k]-rowYs[rowYs.length-1]>=6)rowYs.push(rawYs[k]);
    }
    const colXs=[rawXs[0]];
    for(let k=1;k<rawXs.length;k++){
      if(rawXs[k]-colXs[colXs.length-1]>=6)colXs.push(rawXs[k]);
    }

    if(rowYs.length<2||colXs.length<2)continue;
    const xMin=colXs[0],xMax=colXs[colXs.length-1];
    const yMin=rowYs[0],yMax=rowYs[rowYs.length-1];
    if(xMax-xMin<40||yMax-yMin<12)continue;

    compHIdx.forEach(idx=>{usedHInTable[idx]=1});

    const R=rowYs.length-1,C=colXs.length-1;
    const borderColor=(compH[0]&&compH[0].color)||'334155';

    const hasHBorder=Array.from({length:R+1},(_,r)=>Array.from({length:C},(_,c)=>{
      if(r===0||r===R)return true;
      const y=rowYs[r],x1=colXs[c],x2=colXs[c+1],cw=x2-x1;
      for(const hl of compH){
        if(Math.abs(hl.y-y)<=4.5){
          const ov=Math.min(hl.x2,x2)-Math.max(hl.x1,x1);
          if(ov>=Math.min(8,cw*0.35)&&ov>=cw*0.35)return true;
        }
      }
      return false;
    }));

    const hasVBorder=Array.from({length:R},(_,r)=>Array.from({length:C+1},(_,c)=>{
      if(c===0||c===C)return true;
      const x=colXs[c],y1=rowYs[r],y2=rowYs[r+1],rh=y2-y1;
      for(const vl of compV){
        if(Math.abs(vl.x-x)<=4.5){
          const ov=Math.min(vl.y2,y2)-Math.max(vl.y1,y1);
          if(ov>=Math.min(5,rh*0.35)&&ov>=rh*0.35)return true;
        }
      }
      return false;
    }));

    const grid=Array.from({length:R},(_,r)=>Array.from({length:C},(_,c)=>({
      r,c,colSpan:1,rowSpan:1,vMerge:null,skipH:false,masterR:r,masterC:c,items:[]
    })));

    for(let r=0;r<R;r++){
      let c=0;
      while(c<C){
        let span=1;
        while(c+span<C&&!hasVBorder[r][c+span])span++;
        grid[r][c].colSpan=span;
        for(let k=1;k<span;k++){
          grid[r][c+k].skipH=true;
          grid[r][c+k].masterR=r;
          grid[r][c+k].masterC=c;
        }
        c+=span;
      }
    }

    for(let r=0;r<R;r++){
      for(let c=0;c<C;c++){
        const cell=grid[r][c];
        if(cell.skipH||cell.vMerge==='continue')continue;
        const span=cell.colSpan;
        let nr=r+1;
        while(nr<R){
          let bottomOpen=true;
          for(let k=0;k<span;k++){
            if(hasHBorder[nr][c+k]){bottomOpen=false;break}
          }
          if(!bottomOpen)break;
          const nextCell=grid[nr][c];
          if(nextCell.skipH||nextCell.colSpan!==span)break;
          cell.vMerge='restart';
          cell.rowSpan++;
          nextCell.vMerge='continue';
          nextCell.masterR=r;
          nextCell.masterC=c;
          for(let k=0;k<span;k++){
            grid[nr][c+k].masterR=r;
            grid[nr][c+k].masterC=c;
          }
          nr++;
        }
      }
    }

    tables.push({
      xMin,xMax,yMin,yMax,rowYs,colXs,grid,R,C,borderColor,
      shadedRects:shadedRects.filter(sr=>sr.x>=xMin-8&&sr.x+sr.w<=xMax+8&&sr.y>=yMin-8&&sr.y+sr.h<=yMax+8)
    });
  }

  tables.sort((a,b)=>a.yMin-b.yMin||a.xMin-b.xMin);
  const freeHLines=allMergedH.filter(hl=>!tables.some(tb=>hl.x1>=tb.xMin-6&&hl.x2<=tb.xMax+6&&hl.y>=tb.yMin-6&&hl.y<=tb.yMax+6));
  return{tables,freeHLines};
}

function groupItemsIntoVisualLines(items){
  const sorted=[...items].sort((a,b)=>a.y-b.y||a.x-b.x);
  const lines=[];
  for(const it of sorted){
    let matched=null;
    for(let k=lines.length-1;k>=Math.max(0,lines.length-3);k--){
      const cand=lines[k];
      const maxSz=Math.max(it.size,cand.size);
      const xOverlaps=cand.items.some(ci=>Math.min(ci.x+ci.w,it.x+it.w)-Math.max(ci.x,it.x)>2);
      const tol=xOverlaps?maxSz*0.42:maxSz*0.58;
      if(Math.abs(it.y-cand.y)<=tol){matched=cand;break}
    }
    if(matched){
      matched.items.push(it);
      matched.size=Math.max(matched.size,it.size);
    }else{
      lines.push({y:it.y,size:it.size,items:[it]});
    }
  }
  for(const L of lines)L.items.sort((a,b)=>a.x-b.x);
  return lines;
}

function buildLineSegmentsAndRuns(lineItems,forceBold){
  const tokens=[];
  for(const it of lineItems){
    if(!it.text)continue;
    const isSpaceOnly=/^\s+$/.test(it.text);
    if(isSpaceOnly){
      if(tokens.length)tokens[tokens.length-1].trailingSpace=true;
      continue;
    }
    tokens.push({
      text:it.text,
      x:it.x,
      right:it.x+it.w,
      size:it.size,
      bold:!!(forceBold||it.bold),
      italic:!!it.italic,
      underline:!!it.underline,
      strike:!!it.strike,
      color:it.color||null,
      highlight:it.highlight||null,
      font:it.font||'Calibri',
      trailingSpace:false
    });
  }
  if(!tokens.length)return{segs:[],fullText:''};

  const segs=[];
  let curSeg={x:tokens[0].x,right:tokens[0].right,runs:[]};

  for(let i=0;i<tokens.length;i++){
    const tk=tokens[i];
    if(i===0){
      curSeg.runs.push({...tk});
      continue;
    }
    const prevTk=tokens[i-1];
    const gap=tk.x-prevTk.right;
    const refSize=Math.max(tk.size,prevTk.size);

    if(gap>Math.max(15,refSize*2.1)){
      segs.push(curSeg);
      curSeg={x:tk.x,right:tk.right,runs:[{...tk}]};
      continue;
    }

    const needSpace=prevTk.trailingSpace||gap>refSize*0.17;
    const lastRun=curSeg.runs[curSeg.runs.length-1];
    const sameStyle=
      lastRun.bold===tk.bold&&
      lastRun.italic===tk.italic&&
      lastRun.underline===tk.underline&&
      lastRun.strike===tk.strike&&
      lastRun.color===tk.color&&
      lastRun.highlight===tk.highlight&&
      lastRun.font===tk.font&&
      Math.abs(lastRun.size-tk.size)<=0.8;

    const prefix=(needSpace&&!/\s$/.test(lastRun.text)&&!/^\s/.test(tk.text))?' ':'';
    if(sameStyle){
      lastRun.text+=prefix+tk.text;
      lastRun.right=Math.max(lastRun.right,tk.right);
    }else{
      curSeg.runs.push({...tk,text:prefix+tk.text});
    }
    curSeg.right=Math.max(curSeg.right,tk.right);
  }
  segs.push(curSeg);

  const fullText=segs.map(s=>s.runs.map(r=>r.text).join('')).join(' ').trim();
  return{segs,fullText};
}

function renderRunXml(r,minHalfPt){
  const szVal=Math.max(minHalfPt||10,Math.min(96,Math.round(r.size*2)));
  const colXml=r.color?`<w:color w:val="${X(r.color)}"/>`:'';
  const uXml=r.underline?'<w:u w:val="single"/>':'';
  const stXml=r.strike?'<w:strike/>':'';
  const shdXml=r.highlight?`<w:shd w:val="clear" w:color="auto" w:fill="${X(r.highlight)}"/>`:'';
  return`<w:r><w:rPr><w:rFonts w:ascii="${X(r.font)}" w:hAnsi="${X(r.font)}" w:cs="${X(r.font)}"/>${r.bold?'<w:b/><w:bCs/>':''}${r.italic?'<w:i/><w:iCs/>':''}${uXml}${stXml}${colXml}${shdXml}<w:sz w:val="${szVal}"/><w:szCs w:val="${szVal}"/></w:rPr><w:t xml:space="preserve">${X(r.text)}</w:t></w:r>`;
}

function buildWordTableXml(tb,allItems,maxTableW){
  const R=tb.R,C=tb.C,grid=tb.grid;

  for(const it of allItems){
    if(it.used)continue;
    const xCenter=it.x+Math.min(it.w*0.5,6);
    const yCenter=it.y-it.size*0.32;
    if(xCenter>=tb.xMin-4&&xCenter<=tb.xMax+4&&yCenter>=tb.yMin-4&&yCenter<=tb.yMax+4){
      let r=0;
      for(let ri=0;ri<R;ri++){
        if(yCenter>=tb.rowYs[ri]&&(ri===R-1||yCenter<tb.rowYs[ri+1])){r=ri;break}
      }
      let c=0;
      for(let ci=0;ci<C;ci++){
        if(xCenter>=tb.colXs[ci]&&(ci===C-1||xCenter<tb.colXs[ci+1])){c=ci;break}
      }

      const cell=grid[r][c];
      grid[cell.masterR][cell.masterC].items.push(it);
      it.used=true;
    }
  }

  let colW=[];
  for(let c=0;c<C;c++)colW.push(Math.max(120,Math.round((tb.colXs[c+1]-tb.colXs[c])*20)));
  let totalW=colW.reduce((s,w)=>s+w,0);
  const scale=totalW>maxTableW?maxTableW/totalW:1;
  if(scale<1){
    colW=colW.map(w=>Math.max(100,Math.round(w*scale)));
    totalW=colW.reduce((s,w)=>s+w,0);
  }

  const trXmlParts=[];
  for(let r=0;r<R;r++){
    const tcXmlParts=[];
    const rowH=Math.max(160,Math.round((tb.rowYs[r+1]-tb.rowYs[r])*20*0.85));

    for(let c=0;c<C;c++){
      const cell=grid[r][c];
      if(cell.skipH)continue;

      const span=cell.colSpan;
      let wDxa=0;
      for(let k=0;k<span;k++)wDxa+=colW[c+k];

      const gridSpanXml=span>1?`<w:gridSpan w:val="${span}"/>`:'';
      let vMergeXml='';
      if(cell.vMerge==='restart')vMergeXml='<w:vMerge w:val="restart"/>';
      else if(cell.vMerge==='continue')vMergeXml='<w:vMerge/>';

      const cellX1=tb.colXs[c],cellX2=tb.colXs[c+span];
      const cellY1=tb.rowYs[r],cellY2=tb.rowYs[Math.min(R,r+cell.rowSpan)];
      const cellWidthPt=cellX2-cellX1;

      let fillHex=null;
      if(tb.shadedRects&&tb.shadedRects.length){
        for(const sr of tb.shadedRects){
          const ovX=Math.min(sr.x+sr.w,cellX2)-Math.max(sr.x,cellX1);
          const ovY=Math.min(sr.y+sr.h,cellY2)-Math.max(sr.y,cellY1);
          if(ovX>(cellX2-cellX1)*0.38&&ovY>(cellY2-cellY1)*0.38){
            fillHex=sr.color;break;
          }
        }
      }
      const shdXml=fillHex?`<w:shd w:val="clear" w:color="auto" w:fill="${fillHex}"/>`:'';
      const padH=C>=8?45:80;
      const tcPr=`<w:tcPr><w:tcW w:w="${wDxa}" w:type="dxa"/>${gridSpanXml}${vMergeXml}${shdXml}<w:tcMar><w:top w:w="30" w:type="dxa"/><w:left w:w="${padH}" w:type="dxa"/><w:bottom w:w="30" w:type="dxa"/><w:right w:w="${padH}" w:type="dxa"/></w:tcMar><w:vAlign w:val="center"/></w:tcPr>`;

      if(cell.vMerge==='continue'||!cell.items.length){
        tcXmlParts.push(`<w:tc>${tcPr}<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="200" w:lineRule="auto"/></w:pPr></w:p></w:tc>`);
        continue;
      }

      const vLines=groupItemsIntoVisualLines(cell.items);
      const paraXmlParts=[];

      for(const L of vLines){
        const{segs}=buildLineSegmentsAndRuns(L.items,false);
        if(!segs.length)continue;

        const firstOffsetPt=segs[0].x-cellX1;
        if(segs.length>=2&&cellWidthPt>=140){
          const needFirstTab=firstOffsetPt>20;
          const tabTargets=needFirstTab?segs:segs.slice(1);
          const tabsXml=tabTargets.map(s=>{
            const pos=Math.max(100,Math.round((s.x-cellX1)*20*scale));
            return`<w:tab w:val="left" w:pos="${pos}"/>`;
          }).join('');
          const segRuns=segs.map((s,idx)=>{
            const rXml=s.runs.map(rn=>renderRunXml(rn,10)).join('');
            return(idx===0&&!needFirstTab)?rXml:`<w:r><w:tab/></w:r>${rXml}`;
          }).join('');
          paraXmlParts.push(`<w:p><w:pPr><w:tabs>${tabsXml}</w:tabs><w:spacing w:before="15" w:after="15" w:line="215" w:lineRule="auto"/></w:pPr>${segRuns}</w:p>`);
        }else{
          const segL=segs[0].x,segR=segs[segs.length-1].right;
          const segCenter=(segL+segR)/2,cellCenter=(cellX1+cellX2)/2;
          const segW=segR-segL;
          let jc='left',indXml='';
          if(segW<cellWidthPt*0.84&&Math.abs(segCenter-cellCenter)<=Math.max(9,cellWidthPt*0.13)){
            jc='center';
          }else if(segW<cellWidthPt*0.84&&(cellX2-segR)<=14&&(segL-cellX1)>cellWidthPt*0.22){
            jc='right';
          }else if(cellWidthPt>=160&&firstOffsetPt>22){
            const indDxa=Math.round(firstOffsetPt*20*scale);
            indXml=`<w:ind w:left="${indDxa}"/>`;
          }
          const jcXml=jc!=='left'?`<w:jc w:val="${jc}"/>`:'';
          const allRuns=segs.flatMap((s,idx)=>idx===0?s.runs:[{...s.runs[0],text:' '+s.runs[0].text},...s.runs.slice(1)]);
          const runsXml=allRuns.map(rn=>renderRunXml(rn,10)).join('');
          paraXmlParts.push(`<w:p><w:pPr>${jcXml}${indXml}<w:spacing w:before="15" w:after="15" w:line="215" w:lineRule="auto"/></w:pPr>${runsXml}</w:p>`);
        }
      }

      tcXmlParts.push(`<w:tc>${tcPr}${paraXmlParts.join('')}</w:tc>`);
    }

    const trPr=`<w:trPr><w:trHeight w:val="${rowH}" w:hRule="atLeast"/><w:cantSplit/></w:trPr>`;
    trXmlParts.push(`<w:tr>${trPr}${tcXmlParts.join('')}</w:tr>`);
  }

  const gridXml=`<w:tblGrid>${colW.map(w=>`<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  const bc=tb.borderColor||'334155';
  const bdXml=`<w:tblBorders><w:top w:val="single" w:sz="6" w:space="0" w:color="${bc}"/><w:left w:val="single" w:sz="6" w:space="0" w:color="${bc}"/><w:bottom w:val="single" w:sz="6" w:space="0" w:color="${bc}"/><w:right w:val="single" w:sz="6" w:space="0" w:color="${bc}"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="${bc}"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="${bc}"/></w:tblBorders>`;
  const tblPr=`<w:tblPr><w:tblW w:w="${totalW}" w:type="dxa"/><w:jc w:val="center"/>${bdXml}<w:tblLayout w:type="fixed"/></w:tblPr>`;

  return`<w:tbl>${tblPr}${gridXml}${trXmlParts.join('')}</w:tbl><w:p><w:pPr><w:spacing w:before="20" w:after="20" w:line="120" w:lineRule="auto"/></w:pPr></w:p>`;
}

function buildWordParagraphsXml(items,vp,marginLeftPt,freeHLines){
  const unused=items.filter(it=>!it.used);
  const paraBlocks=[];

  for(const hl of(freeHLines||[])){
    if(hl.x2-hl.x1>=vp.width*0.35&&!hl.usedAsDeco){
      paraBlocks.push({
        y:hl.y,
        xml:`<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${X(hl.color||'64748B')}"/></w:pBdr><w:spacing w:before="40" w:after="40"/></w:pPr></w:p>`
      });
    }
  }

  if(!unused.length)return paraBlocks;

  const rawLines=groupItemsIntoVisualLines(unused);
  const parsedLines=[];
  for(const L of rawLines){
    const{segs,fullText}=buildLineSegmentsAndRuns(L.items,false);
    if(!segs.length||!fullText)continue;
    parsedLines.push({
      y:L.y,
      size:L.size,
      segs,
      fullText,
      leftX:segs[0].x,
      rightX:segs[segs.length-1].right
    });
  }
  if(!parsedLines.length)return paraBlocks;

  const paraGroups=[];
  let curGroup=[];

  const flushGroup=()=>{
    if(curGroup.length){paraGroups.push({multi:false,lines:curGroup});curGroup=[]}
  };

  for(let i=0;i<parsedLines.length;i++){
    const pl=parsedLines[i];
    if(pl.segs.length>=2){
      flushGroup();
      paraGroups.push({multi:true,lines:[pl]});
      continue;
    }
    if(!curGroup.length){
      curGroup.push(pl);
      continue;
    }
    const prev=curGroup[curGroup.length-1];
    const gapY=pl.y-prev.y;
    const maxSz=Math.max(pl.size,prev.size);
    const sizeDiff=Math.abs(pl.size-prev.size)/maxSz>0.18;
    const isList=/^([•●▪◦·*»›-]|(\d{1,3})[.)])\s+/.test(pl.fullText);

    const prevCenter=Math.abs((prev.leftX+prev.rightX)/2-vp.width/2)<25&&(prev.rightX-prev.leftX)<vp.width*0.72;
    const curCenter=Math.abs((pl.leftX+pl.rightX)/2-vp.width/2)<25&&(pl.rightX-pl.leftX)<vp.width*0.72;

    if(gapY>maxSz*1.65||sizeDiff||isList||prevCenter||curCenter){
      flushGroup();
    }
    curGroup.push(pl);
  }
  flushGroup();

  const pWidth=vp.width;

  for(const grp of paraGroups){
    if(grp.multi){
      const pl=grp.lines[0];
      const firstIndentDxa=Math.max(0,Math.round((pl.segs[0].x-marginLeftPt)*20));
      const tabsXml=pl.segs.slice(1).map(s=>{
        const pos=Math.max(200,Math.round((s.x-marginLeftPt)*20));
        return`<w:tab w:val="left" w:pos="${pos}"/>`;
      }).join('');
      const indXml=firstIndentDxa>120?`<w:ind w:left="${firstIndentDxa}"/>`:'';
      const segRuns=pl.segs.map((s,idx)=>{
        const rXml=s.runs.map(rn=>renderRunXml(rn,10)).join('');
        return idx===0?rXml:`<w:r><w:tab/></w:r>${rXml}`;
      }).join('');
      const pPr=`<w:pPr><w:tabs>${tabsXml}</w:tabs>${indXml}<w:spacing w:before="20" w:after="30" w:line="230" w:lineRule="auto"/></w:pPr>`;
      paraBlocks.push({y:pl.y,xml:`<w:p>${pPr}${segRuns}</w:p>`});
      continue;
    }

    const pLines=grp.lines;
    const firstL=pLines[0];
    const leftX=Math.min(...pLines.map(l=>l.leftX));
    const rightX=Math.max(...pLines.map(l=>l.rightX));
    const centerX=(leftX+rightX)/2;
    const spanW=rightX-leftX;

    let jc='left';
    if(Math.abs(centerX-pWidth/2)<25&&spanW<pWidth*0.78){
      jc='center';
    }else if(leftX>pWidth*0.48&&(pWidth-rightX)<95){
      jc='right';
    }else if(pLines.length>=2&&spanW>pWidth*0.72){
      jc='both';
    }

    let indXml='';
    if(jc==='left'||jc==='both'){
      const leftInd=Math.max(0,Math.round((leftX-marginLeftPt)*20));
      const firstLineDelta=Math.round((firstL.leftX-leftX)*20);
      if(leftInd>160&&leftInd<pWidth*10){
        indXml=firstLineDelta>140?`<w:ind w:left="${leftInd}" w:firstLine="${firstLineDelta}"/>`:`<w:ind w:left="${leftInd}"/>`;
      }else if(firstLineDelta>140&&pLines.length>=2){
        indXml=`<w:ind w:firstLine="${firstLineDelta}"/>`;
      }
    }

    const bMatch=firstL.fullText.match(/^[•●▪◦·*»›-]\s+(.*)/);
    const nMatch=firstL.fullText.match(/^(\d{1,3})[.)]\s+(.*)/);
    let pStyle='Normal',numPr='',before=30,after=50;
    if(bMatch){
      pStyle='ListParagraph';
      numPr='<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>';
    }else if(nMatch){
      pStyle='ListParagraph';
      numPr='<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>';
    }else if(jc==='center'){
      before=20;after=30;
    }

    let runsXml='';
    for(let li=0;li<pLines.length;li++){
      const pl=pLines[li];
      const runs=pl.segs.flatMap(s=>s.runs);
      for(let ri=0;ri<runs.length;ri++){
        const rn={...runs[ri]};
        if(li===0&&ri===0){
          if(bMatch)rn.text=rn.text.replace(/^[•●▪◦·*»›-]\s+/,'');
          else if(nMatch)rn.text=rn.text.replace(/^(\d{1,3})[.)]\s+/,'');
        }else if(ri===0&&li>0&&!/^\s/.test(rn.text)){
          rn.text=' '+rn.text;
        }
        runsXml+=renderRunXml(rn,10);
      }
    }

    const jcXml=jc!=='left'?`<w:jc w:val="${jc}"/>`:'';
    const spcXml=`<w:spacing w:before="${before}" w:after="${after}" w:line="240" w:lineRule="auto"/>`;
    const pPr=`<w:pPr><w:pStyle w:val="${pStyle}"/>${jcXml}${numPr}${indXml}${spcXml}</w:pPr>`;
    paraBlocks.push({y:firstL.y,xml:`<w:p>${pPr}${runsXml}</w:p>`});
  }

  return paraBlocks;
}

let wordImgSeq=0;
async function extractEmbeddedImagesXml(pg,vp,imageBoxes,items,tables){
  if(!imageBoxes||!imageBoxes.length)return{imgBlocks:[],media:[]};
  const validBoxes=imageBoxes.filter(ib=>{
    const hasTextOverlap=items.some(it=>
      it.text.trim().length>0&&
      Math.min(ib.x+ib.w,it.x+it.w)-Math.max(ib.x,it.x)>4&&
      Math.min(ib.y+ib.h,it.y)-Math.max(ib.y,it.y-it.size)>4
    );
    return!hasTextOverlap;
  });
  if(!validBoxes.length)return{imgBlocks:[],media:[]};

  const sc=2;
  const rVp=pg.getViewport({scale:sc});
  const canvas=mkCanvas(rVp.width,rVp.height);
  await pg.render({canvasContext:canvas.getContext('2d'),viewport:rVp}).promise;

  const imgBlocks=[],media=[];
  for(const ib of validBoxes){
    const sx=Math.max(0,Math.round(ib.x*sc)),sy=Math.max(0,Math.round(ib.y*sc));
    const sw=Math.min(canvas.width-sx,Math.round(ib.w*sc)),sh=Math.min(canvas.height-sy,Math.round(ib.h*sc));
    if(sw<12||sh<12)continue;

    const sub=mkCanvas(sw,sh);
    sub.getContext('2d').drawImage(canvas,sx,sy,sw,sh,0,0,sw,sh);
    const blob=await new Promise(r=>sub.toBlob(r,'image/png'));
    if(!blob)continue;

    const idx=++wordImgSeq;
    const rId='rIdImg'+idx,name='pdf_img_'+idx+'.png';
    media.push({id:rId,name,data:await blob.arrayBuffer()});

    const cx=Math.round(ib.w*12700),cy=Math.round(ib.h*12700);
    const centerX=ib.x+ib.w/2;
    const jc=Math.abs(centerX-vp.width/2)<35?'center':ib.x>vp.width*0.55?'right':'left';
    const jcXml=jc!=='left'?`<w:jc w:val="${jc}"/>`:'';
    const xml=`<w:p><w:pPr>${jcXml}<w:spacing w:before="30" w:after="30"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${idx}" name="Resim ${idx}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${idx}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    imgBlocks.push({y:ib.y,xml});
  }
  return{imgBlocks,media};
}

async function convertPageToWordXml(p){
  if(p.fi<0){
    return{xml:'<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>',pw:11906,ph:16838,marginDxa:720};
  }
  const f=files[p.fi];

  if(f.img){
    if(typeof f.md==='string'&&f.md.trim()){
      const docxData=mdToDocx(f.md);
      return{xml:docxData.body,pw:11906,ph:16838,marginDxa:1134};
    }
    const ocrLang=$('#mLang')?$('#mLang').value:'tur+eng';
    const cachedOcr=ocrCache[ocrKey(p,ocrLang)];
    if(cachedOcr){
      const docxData=mdToDocx(cachedOcr);
      return{xml:docxData.body,pw:11906,ph:16838,marginDxa:1134};
    }
    const bDoc=await pagesDocx([p]);
    return{xml:bDoc.body,pw:11906,ph:16838,media:bDoc.media,marginDxa:567};
  }

  const pg=await f.doc.getPage(p.pn);
  const vp=pg.getViewport({scale:1});
  const pwDxa=Math.round(vp.width*20);
  const phDxa=Math.round(vp.height*20);
  const U=pdfjsLib.Util;

  const graphics=await extractPageGraphics(pg,vp);
  const tc=await pg.getTextContent();
  const styles=tc.styles||{};

  const c=p.crop||{l:0,t:0,r:0,b:0};
  const xMin=c.l*vp.width,xMax=vp.width*(1-c.r);
  const yMin=c.t*vp.height,yMax=vp.height*(1-c.b);

  const items=[];
  for(const it of tc.items){
    if(it.str===undefined||it.str===null||it.str==='')continue;
    const t=U.transform(vp.transform,it.transform);
    const x=t[4],y=t[5];
    if(x<xMin-2||x>xMax+2||y<yMin-2||y>yMax+2)continue;
    const size=Math.hypot(t[2],t[3])||Math.hypot(t[0],t[1])||it.height||10;
    const st=getItemStyle(it,styles,pg);

    let itemColor=null,synthBold=false;
    for(const ts of graphics.textStylings){
      if(Math.abs(ts.y-y)<=3.5&&Math.abs(ts.x-x)<=Math.max(12,it.width||12)){
        if(ts.color)itemColor=ts.color;
        if(ts.synthBold)synthBold=true;
        break;
      }
    }

    items.push({
      text:it.str,
      x,
      y,
      w:it.width!=null?it.width:(it.str.length*size*0.5),
      size,
      bold:st.bold||synthBold,
      italic:st.italic,
      underline:false,
      strike:false,
      color:itemColor,
      highlight:null,
      font:st.font,
      used:false
    });
  }

  const realTextItems=items.filter(it=>it.text.trim().length>0);
  if(realTextItems.length<3){
    const ocrLang=$('#mLang')?$('#mLang').value:'tur+eng';
    let ocrText=ocrCache[ocrKey(p,ocrLang)];
    if(!ocrText){
      try{
        const w=await ocrWorker(ocrLang);
        const r=await w.recognize(await pageBlob(p,250,'image/png'));
        ocrText=ocrToMd(r.data.text||'');
        ocrCache[ocrKey(p,ocrLang)]=ocrText;
      }catch(e){console.warn('OCR fallback error:',e)}
    }
    if(ocrText&&ocrText.trim()){
      const docxData=mdToDocx(ocrText);
      return{xml:docxData.body,pw:pwDxa,ph:phDxa,marginDxa:1134};
    }
  }

  const{tables,freeHLines}=detectPageTables(graphics.hLines,graphics.vLines,graphics.shadedRects,vp);

  for(const hl of freeHLines){
    let matchedText=false;
    for(const it of realTextItems){
      const ovX=Math.min(hl.x2,it.x+it.w)-Math.max(hl.x1,it.x);
      if(ovX>=Math.min(8,it.w*0.5)){
        if(hl.y>=it.y-1.5&&hl.y<=it.y+4){
          it.underline=true;matchedText=true;
        }else if(hl.y>=it.y-it.size*0.55&&hl.y<=it.y-it.size*0.18){
          it.strike=true;matchedText=true;
        }
      }
    }
    if(matchedText)hl.usedAsDeco=true;
  }

  const nonTableShaded=graphics.shadedRects.filter(sr=>!tables.some(tb=>
    sr.x>=tb.xMin-6&&sr.x+sr.w<=tb.xMax+6&&sr.y>=tb.yMin-6&&sr.y+sr.h<=tb.yMax+6
  ));
  for(const sr of nonTableShaded){
    for(const it of realTextItems){
      const yMid=it.y-it.size*0.35,xMid=it.x+it.w*0.5;
      if(xMid>=sr.x-2&&xMid<=sr.x+sr.w+2&&yMid>=sr.y-2&&yMid<=sr.y+sr.h+2){
        it.highlight=sr.color;
      }
    }
  }

  let minContentX=vp.width*0.1;
  for(const tb of tables)minContentX=Math.min(minContentX,tb.xMin);
  for(const it of realTextItems)minContentX=Math.min(minContentX,it.x);
  const marginLeftPt=Math.max(18,Math.min(54,minContentX));
  const marginDxa=Math.round(marginLeftPt*20);
  const maxTableW=Math.max(4500,pwDxa-marginDxa*2);

  const blocks=[];
  for(const tb of tables){
    const tblXml=buildWordTableXml(tb,items,maxTableW);
    blocks.push({y:tb.yMin,xml:tblXml});
  }

  const paraBlocks=buildWordParagraphsXml(items,vp,marginLeftPt,freeHLines);
  blocks.push(...paraBlocks);

  const{imgBlocks,media}=await extractEmbeddedImagesXml(pg,vp,graphics.imageBoxes,realTextItems,tables);
  blocks.push(...imgBlocks);

  blocks.sort((a,b)=>a.y-b.y);

  return{
    xml:blocks.map(b=>b.xml).join(''),
    pw:pwDxa,
    ph:phDxa,
    marginDxa,
    media
  };
}

async function exportWord(ids){
  if(!pages.length){
    alert('Lütfen önce bir dosya ekleyin.');
    return;
  }
  const targetIds=ids&&ids.length?ids:(sel.size?[...sel]:pages.map(p=>p.id));
  const targetPages=pages.filter(p=>targetIds.includes(p.id));
  if(!targetPages.length)return;

  await run('Word dosyası hazırlanıyor…',async()=>{
    const total=targetPages.length;
    const bodyXmlParts=[];
    const allMedia=[];
    let pageW=11906,pageH=16838,minMargin=1134;

    for(let i=0;i<total;i++){
      busy(`Word dosyası hazırlanıyor… Sayfa ${i+1}/${total}`);
      const p=targetPages[i];
      const pageRes=await convertPageToWordXml(p);
      if(pageRes.pw)pageW=pageRes.pw;
      if(pageRes.ph)pageH=pageRes.ph;
      if(pageRes.marginDxa)minMargin=Math.min(minMargin,pageRes.marginDxa);
      if(pageRes.media)allMedia.push(...pageRes.media);
      bodyXmlParts.push(pageRes.xml);
      if(i<total-1){
        bodyXmlParts.push('<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>');
      }
    }

    busy('Word belgesi (.docx) kaydediliyor…');
    const docData={
      body:bodyXmlParts.join(''),
      rels:[],
      nums:[1,2],
      media:allMedia,
      margin:minMargin,
      marginTop:Math.max(480,minMargin),
      marginBottom:Math.max(480,minMargin),
      marginLeft:minMargin,
      marginRight:minMargin,
      pw:pageW,
      ph:pageH
    };

    const blob=await docxBlob(docData);
    await save(baseName()+'.docx',blob);
  });
}

/* Word dışa aktarma bağlama */
async function pagesDocx(list){
  const media=[],body=[],BW=10772,BH=15704;
  for(let i=0;i<list.length;i++){
    mdProg('Sayfa görüntüsü hazırlanıyor '+(i+1)+'/'+list.length,null);
    const blob=await pageBlob(list[i],150,'image/jpeg'),u=URL.createObjectURL(blob),im=await loadImg(u);URL.revokeObjectURL(u);
    const k=Math.min(BW/im.naturalWidth,BH/im.naturalHeight),cx=Math.round(im.naturalWidth*k*635),cy=Math.round(im.naturalHeight*k*635),n=i+1,id='rIdM'+n;
    media.push({name:'img'+n+'.jpeg',data:await blob.arrayBuffer(),id});
    body.push('<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr>'+(i?'<w:r><w:br w:type="page"/></w:r>':'')+'<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="'+cx+'" cy="'+cy+'"/><wp:docPr id="'+n+'" name="Sayfa '+n+'"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="'+n+'" name="img'+n+'.jpeg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="'+id+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>');
  }
  return{body:body.join(''),rels:[],nums:[],media,margin:567};
}
const baseName=()=>((files.find(f=>f.name)||{}).name||'belge').replace(/\.[^.]+$/,'');
$('#bWord').onclick=()=>exportWord(sel.size?[...sel]:pages.map(p=>p.id));
$('#mW').onclick=()=>mdWork(async()=>{
  if(mdInitialText&&$('#mTxt').value!==mdInitialText){
    mdProg('Word dosyası hazırlanıyor…',null);
    await save(baseName()+'.docx',await docxBlob(mdToDocx($('#mTxt').value)));
  }else{
    $('#md').close();
    await exportWord(mdIds.length?mdIds:pages.map(p=>p.id));
  }
});
$('#mWi').onclick=()=>mdWork(async()=>{await save(baseName()+'-sayfalar.docx',await docxBlob(await pagesDocx(mdList)))});
render();
