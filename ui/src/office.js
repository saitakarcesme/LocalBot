import {unzipSync, strFromU8} from '../vendor/fflate.mjs';

// Never execute document markup, relationships, macros or spreadsheet formulas.
export function readOffice(bytes, extension) {
 const files=unzipSync(bytes,{filter:f=>f.originalSize<8_000_000 && /^(word\/document\.xml|xl\/(sharedStrings|workbook)\.xml|xl\/worksheets\/sheet\d+\.xml)$/.test(f.name)});
 const xml=name=>{if(!files[name])return null;const doc=new DOMParser().parseFromString(strFromU8(files[name]),'application/xml');if(doc.querySelector('parsererror'))throw Error('Invalid Office document');return doc;};
 const nodes=(root,name)=>[...(root?.getElementsByTagNameNS('*',name)||[])];
 const text=root=>nodes(root,'t').map(n=>n.textContent).join('');
 if(extension==='docx') {const doc=xml('word/document.xml');if(!doc)throw Error('Missing document');return {paragraphs:nodes(doc,'p').slice(0,5000).map(text)};}
 const strings=nodes(xml('xl/sharedStrings.xml'),'si').map(text),names=nodes(xml('xl/workbook.xml'),'sheet').map(n=>n.getAttribute('name'));
 const sheets=Object.keys(files).filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).slice(0,30).map((name,i)=>({name:names[i]||`Sheet ${i+1}`,rows:nodes(xml(name),'row').slice(0,500).map(row=>{const cells=[];for(const c of nodes(row,'c')){const letters=(c.getAttribute('r')||'A').match(/^[A-Z]+/)?.[0]||'A';let col=0;for(const ch of letters)col=col*26+ch.charCodeAt(0)-64;if(col>100)continue;const value=nodes(c,'v')[0]?.textContent||'';cells[col-1]=c.getAttribute('t')==='s'?strings[Number(value)]||'':c.getAttribute('t')==='inlineStr'?text(c):value;}return Array.from({length:cells.length},(_,i)=>cells[i]||'');})}));
 if(!sheets.length)throw Error('Missing worksheets');return {sheets};
}
