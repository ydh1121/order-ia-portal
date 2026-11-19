/** Bounded OpenXML value reader. No formulas, macros or external relationships execute. */
export function createPriceWorkbookReader() {
  const fail=message=>{throw new Error(message);};
  const decoder=new TextDecoder();
  const nodes=(doc,tag)=>Array.from(doc.getElementsByTagNameNS('*',tag));
  const xml=text=>{if(/<!DOCTYPE|<!ENTITY/i.test(text))fail('지원하지 않는 XML 형식입니다.');const doc=new DOMParser().parseFromString(text,'application/xml');if(nodes(doc,'parsererror').length)fail('엑셀 파일의 XML을 읽을 수 없습니다.');return doc;};
  async function unzip(buffer){
    if(buffer.byteLength>8*1024*1024)fail('엑셀 파일은 8MB 이하로 올려 주세요.');
    const bytes=new Uint8Array(buffer),view=new DataView(buffer),files=new Map();let end=-1,total=0;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
    if(end<0)fail('올바른 .xlsx 파일이 아닙니다. .xls 파일은 .xlsx로 저장해 주세요.');
    const count=view.getUint16(end+10,true),offset=view.getUint32(end+16,true);
    if(count>1024||view.getUint16(end+4,true)||view.getUint16(end+6,true))fail('이 엑셀 파일의 크기나 압축 형식은 지원하지 않습니다.');
    let cursor=offset;
    for(let i=0;i<count;i++){
      if(cursor+46>bytes.length||view.getUint32(cursor,true)!==0x02014b50)fail('손상된 엑셀 파일입니다.');
      const flags=view.getUint16(cursor+8,true),method=view.getUint16(cursor+10,true),compressed=view.getUint32(cursor+20,true),expanded=view.getUint32(cursor+24,true),len=view.getUint16(cursor+28,true),extra=view.getUint16(cursor+30,true),comment=view.getUint16(cursor+32,true),local=view.getUint32(cursor+42,true);
      if(cursor+46+len+extra+comment>bytes.length)fail('손상된 엑셀 파일입니다.');
      const name=decoder.decode(bytes.subarray(cursor+46,cursor+46+len));cursor+=46+len+extra+comment;
      if(flags&1||!['0','8'].includes(String(method))||expanded>8*1024*1024||compressed>8*1024*1024||name.includes('..')||name.startsWith('/')||files.has(name))fail('지원하지 않는 엑셀 압축 형식입니다.');
      total+=expanded;if(total>24*1024*1024)fail('압축 해제한 엑셀 데이터가 너무 큽니다.');
      if(local+30>bytes.length||view.getUint32(local,true)!==0x04034b50)fail('손상된 엑셀 파일입니다.');
      const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
      if(start+compressed>bytes.length)fail('손상된 엑셀 파일입니다.');
      files.set(name,{method,expanded,bytes:bytes.subarray(start,start+compressed)});
    }
    async function read(name){
      const f=files.get(name);if(!f)return null;
      let data=f.bytes;
      if(f.method===8){
        let stream;try{stream=new DecompressionStream('deflate-raw');}catch{fail('이 브라우저에서는 엑셀 압축 해제를 지원하지 않습니다. 최신 브라우저를 사용해 주세요.');}
        const reader=new Blob([f.bytes]).stream().pipeThrough(stream).getReader(),chunks=[];let size=0;
        while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>f.expanded||size>8*1024*1024){await reader.cancel();fail('엑셀 압축 데이터 크기가 올바르지 않습니다.');}chunks.push(value);}
        data=new Uint8Array(size);let pos=0;for(const chunk of chunks){data.set(chunk,pos);pos+=chunk.length;}
      }
      if(data.length!==f.expanded)fail('엑셀 압축 데이터가 손상되었습니다.');
      return decoder.decode(data);
    }
    return {read,has:name=>files.has(name)};
  }
  function delimited(text){
    const separator=text.split('\n',1)[0].includes('\t')?'\t':',',rows=[];let row=[],cell='',quoted=false;
    text=text.replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&c===separator){row.push(cell);cell='';}else if(!quoted&&(c==='\n'||c==='\r')){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x!==''))rows.push(row);row=[];cell='';}else cell+=c;}
    if(quoted)fail('CSV 따옴표가 닫히지 않았습니다.');row.push(cell);if(row.some(x=>x!==''))rows.push(row);
    if(rows.length>3000||rows.some(r=>r.length>80||r.some(v=>v.length>1000)))fail('한 시트는 3,000행·80열까지 가져올 수 있습니다.');
    return {sheets:[{name:'개별 비용',rows}],warnings:[]};
  }
  async function read(buffer,name){
    if(/\.(csv|tsv)$/i.test(name))return delimited(decoder.decode(buffer));
    if(!/\.xlsx$/i.test(name))fail('.xlsx, .csv 또는 .tsv 파일을 선택해 주세요.');
    const archive=await unzip(buffer),book=await archive.read('xl/workbook.xml'),rels=await archive.read('xl/_rels/workbook.xml.rels');
    if(!book||!rels)fail('엑셀 통합 문서를 찾을 수 없습니다.');
    const relationships=new Map();for(const r of nodes(xml(rels),'Relationship')){
      if(r.getAttribute('TargetMode')==='External')continue;
      let target=r.getAttribute('Target')||'';if(target.startsWith('/'))target=target.slice(1);else target='xl/'+target;
      target=target.replace('/./','/');if(target.includes('..'))continue;relationships.set(r.getAttribute('Id'),target);
    }
    const sharedText=await archive.read('xl/sharedStrings.xml'),strings=sharedText?nodes(xml(sharedText),'si').map(s=>nodes(s,'t').map(t=>t.textContent).join('')):[];
    const bookXml=xml(book),epoch=['1','true'].includes(nodes(bookXml,'workbookPr')[0]?.getAttribute('date1904'))?Date.UTC(1904,0,1):Date.UTC(1899,11,30),styleText=await archive.read('xl/styles.xml');
    const dateStyles=[],percentStyles=[];if(styleText){const styles=xml(styleText),formats=new Map(nodes(styles,'numFmt').map(n=>[Number(n.getAttribute('numFmtId')),n.getAttribute('formatCode')]));for(const xf of nodes(styles,'cellXfs')[0]?.children||[]){const n=Number(xf.getAttribute('numFmtId')),format=(formats.get(n)||'').replace(/"[^"]*"|\[[^\]]*\]|\\./g,'');dateStyles.push(n>=14&&n<=22||n>=27&&n<=36||n>=50&&n<=58||/[yd]/i.test(format));percentStyles.push(n===9||n===10||format.includes('%'));}}
    const sheets=[],warnings=new Set(),descriptors=nodes(bookXml,'sheet');if(descriptors.length>20)fail('시트는 20개까지 가져올 수 있습니다.');
    for(const s of descriptors){
      const target=relationships.get(s.getAttribute('r:id')||s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'));
      if(!target)continue;const content=await archive.read(target);if(!content)continue;
      const rows=[];for(const row of nodes(xml(content),'row')){
        const ri=Number(row.getAttribute('r'))-1;if(!Number.isInteger(ri)||ri<0||ri>=3000)fail('한 시트는 3,000행까지 가져올 수 있습니다.');
        const values=[];for(const c of nodes(row,'c')){
          const ref=c.getAttribute('r')||'',letters=ref.match(/^[A-Z]+/i)?.[0];if(!letters)continue;
          let col=0;for(const letter of letters.toUpperCase())col=col*26+letter.charCodeAt(0)-64;col--;
          if(col<0||col>=80)fail('한 시트는 80열까지 가져올 수 있습니다.');
          const type=c.getAttribute('t'),v=nodes(c,'v')[0]?.textContent;
          let value=type==='inlineStr'?nodes(c,'t').map(t=>t.textContent).join(''):type==='s'?(strings[Number(v)]??''):type==='b'?(v==='1'?'TRUE':'FALSE'):v??'';
          if(nodes(c,'f').length&&!v)warnings.add('계산 결과가 없는 수식 셀은 비워 두었습니다. 엑셀에서 계산 후 저장하면 결과를 가져올 수 있습니다.');
          if(value.length>1000)fail('셀의 글자는 1,000자까지 가져올 수 있습니다.');
          if((!type||type==='n')&&value!==''&&Number.isFinite(Number(value))){value=Number(value);const style=Number(c.getAttribute('s'))||0;if(dateStyles[style]){const date=new Date(epoch+Math.round(value*86400000));if(Number.isFinite(date.valueOf()))value=date.toISOString().slice(0,10);}else if(percentStyles[style])value=String(Number((value*100).toFixed(8)))+'%';}
          values[col]=value;
        }
        rows[ri]=Array.from({length:values.length},(_,i)=>values[i]??'');
      }
      sheets.push({name:(s.getAttribute('name')||'시트').slice(0,100),rows:Array.from({length:rows.length},(_,i)=>rows[i]||[])});
    }
    if(!sheets.length)fail('표가 들어 있는 시트를 찾을 수 없습니다.');return {sheets,warnings:[...warnings]};
  }
  return {read,delimited};
}
