// node clean.js <src.pdf> <spec.json> <out.pdf> <slots.json>
// spec: [{page, run, text, occ?, key, align}] - removes those glyphs from the run (keeping every other
// glyph exactly where it was) and records each removed value's slot (font, size, left/right x, baseline, px).
const {PDFDocument,PDFName,PDFRawStream,PDFDict,decodePDFRawStream}=require('pdf-lib');const fk=require('@pdf-lib/fontkit');const fs=require('fs');
(async()=>{const [src,specF,outF,slotsF]=process.argv.slice(2);const spec=JSON.parse(fs.readFileSync(specF,'utf8'));
const doc=await PDFDocument.load(fs.readFileSync(src));const slots={};
for(const [pi,page] of doc.getPages().entries()){
 const want=spec.filter(s=>s.page===pi+1);if(!want.length)continue;
 const fdict=page.node.Resources().lookup(PDFName.of('Font'),PDFDict);const fonts={};
 for(const [k,ref] of fdict.entries()){const f=doc.context.lookup(ref);const desc=f.lookup(PDFName.of('DescendantFonts')).lookup(0);const ff=desc.lookup(PDFName.of('FontDescriptor')).lookup(PDFName.of('FontFile2'));
  const font=fk.create(Buffer.from(decodePDFRawStream(ff).decode()));const rev={};for(const cp of [...font.characterSet].sort((a,b)=>a-b)){const id=font.glyphForCodePoint(cp).id;if(!(id in rev))rev[id]=String.fromCodePoint(cp);}fonts[k.asString().slice(1)]={font,rev};}
 let c=page.node.get(PDFName.of('Contents'));let refs=[c];const a=doc.context.lookup(c);if(a&&a.asArray)refs=a.asArray();
 let target=null,s=null;for(const r of refs){const st=doc.context.lookup(r);if(!(st instanceof PDFRawStream))continue;const t=Buffer.from(decodePDFRawStream(st).decode()).toString('latin1');if(t.includes(' TJ')){target=r;s=t;}}
 // locate runs in the same order as runs.js
 const re=/((?:[\d.-]+ [\d.-]+ m\n[\d.-]+ [\d.-]+ l\n[\d.-]+ [\d.-]+ l\n[\d.-]+ [\d.-]+ l\nh\nW\* n\n)?)(?:[\d. ]+rg\n)?BT\n([\s\S]*?)\nET/g;
 const runs=[];let m;while((m=re.exec(s)))runs.push({start:m.index+m[0].indexOf('BT\n')+3,body:m[2]});
 const edits=[];
 for(const w of want){const r=runs[w.run];const body=r.body;const tf=body.match(/\/(F\d+) ([\d.]+) Tf/);const tm=body.match(/1 0 [\d.-]+ -1 ([\d.-]+) ([\d.-]+) Tm/);
  const {font,rev}=fonts[tf[1]];const size=+tf[2];
  const tjm=body.match(/\[(.*)\] TJ/s);const tjStart=body.indexOf(tjm[0])+1;
  const toks=[...tjm[1].matchAll(/<([0-9A-F]{4})>(-?[\d.]+)?/g)];
  let x=+tm[1];const glyphs=toks.map(t=>{const gid=parseInt(t[1],16);const adv=font.getGlyph(gid).advanceWidth/font.unitsPerEm*1000;const adj=+(t[2]||0);const g={ch:rev[gid]??'?',x,adv,adj,tok:t};x+=(adv-adj)/1000*size;return g;});
  const text=glyphs.map(g=>g.ch).join('');let idx=-1,from=0;for(let o=0;o<=(w.occ||0);o++){idx=text.indexOf(w.text,from);from=idx+1;}
  if(idx<0)throw new Error(`p${pi+1} run${w.run}: "${w.text}" not in "${text}"`);
  const seg=glyphs.slice(idx,idx+[...w.text].length);
  const left=seg[0].x,right=seg[seg.length-1].x+seg[seg.length-1].adv/1000*size;
  slots[w.key]=slots[w.key]||[];slots[w.key].push({page:pi+1,font:font.fullName,size:+size.toFixed(4),left:+left.toFixed(3),right:+right.toFixed(3),y:+(+tm[2]).toFixed(3),align:w.align,orig:w.text});
  for(const g of seg)edits.push({pos:r.start+body.indexOf(tjm[0])+1+g.tok.index,len:g.tok[0].length,rep:(g.adj-g.adv).toFixed(6)});
 }
 edits.sort((a,b)=>b.pos-a.pos);for(const e of edits)s=s.slice(0,e.pos)+' '+e.rep+' '+s.slice(e.pos+e.len);
 doc.context.assign(target,doc.context.flateStream(Buffer.from(s,'latin1')));
}
fs.writeFileSync(outF,await doc.save());fs.writeFileSync(slotsF,JSON.stringify(slots,null,1));console.log('slots',Object.keys(slots).length);})();
