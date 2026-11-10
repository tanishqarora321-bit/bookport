// Lists every text run (BT..ET) of each page: index, font, size, Tm x/y (device px), clip rect, decoded text.
const {PDFDocument,PDFName,PDFRawStream,PDFDict,decodePDFRawStream}=require('pdf-lib');const fk=require('@pdf-lib/fontkit');const fs=require('fs');
(async()=>{const doc=await PDFDocument.load(fs.readFileSync(process.argv[2]));
const out=[];
for(const [pi,page] of doc.getPages().entries()){
 const res=page.node.Resources();const fdict=res.lookup(PDFName.of('Font'),PDFDict);
 const fonts={};
 for(const [k,ref] of fdict.entries()){const f=doc.context.lookup(ref);const desc=f.lookup(PDFName.of('DescendantFonts')).lookup(0);const fd=desc.lookup(PDFName.of('FontDescriptor'));const ff=fd.lookup(PDFName.of('FontFile2'));
  const bytes=decodePDFRawStream(ff).decode();const font=fk.create(Buffer.from(bytes));const rev={};for(const cp of font.characterSet){rev[font.glyphForCodePoint(cp).id]=String.fromCodePoint(cp);}
  fonts[k.asString().slice(1)]={name:font.fullName,rev,font};}
 let contents=page.node.get(PDFName.of('Contents'));let refs=[contents];const arr=doc.context.lookup(contents);if(arr&&arr.asArray)refs=arr.asArray();
 let s='';for(const r of refs){const st=doc.context.lookup(r);if(st instanceof PDFRawStream)s+=Buffer.from(decodePDFRawStream(st).decode()).toString('latin1')+'\n';}
 const re=/((?:[\d.-]+ [\d.-]+ m\n[\d.-]+ [\d.-]+ l\n[\d.-]+ [\d.-]+ l\n[\d.-]+ [\d.-]+ l\nh\nW\* n\n)?)(?:[\d. ]+rg\n)?BT\n([\s\S]*?)\nET/g;let m,i=0;
 while((m=re.exec(s))){const body=m[2];const tf=body.match(/\/(F\d+) ([\d.]+) Tf/);const tm=body.match(/1 0 [\d.-]+ -1 ([\d.-]+) ([\d.-]+) Tm/);
  const f=fonts[tf[1]];let txt='';for(const g of body.matchAll(/<([0-9A-F]{4})>/g)){txt+=f.rev[parseInt(g[1],16)]??'?';}
  const clip=m[1]?m[1].match(/[\d.-]+/g).slice(0,8).map(Number):null;const cr=clip?[clip[0],clip[1],clip[4],clip[5]].map(v=>v.toFixed(1)).join(','):'';
  console.log(`p${pi+1} #${i} ${tf[1]}(${f.name}) ${(+tf[2]).toFixed(2)} x=${tm[1]} y=${tm[2]} clip=[${cr}] ${JSON.stringify(txt)}`);i++;}
}})();
