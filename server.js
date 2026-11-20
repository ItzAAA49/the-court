import http from "node:http";
import {readFile,stat} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),"public");
const port=process.env.PORT||3000;
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".svg":"image/svg+xml",".webp":"image/webp",".png":"image/png"};
const send=(res,status,obj)=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(obj));};
const body=req=>new Promise((resolve,reject)=>{let s="";req.on("data",c=>{s+=c;if(s.length>1e6)reject(Error("too large"));});req.on("end",()=>{try{resolve(JSON.parse(s||"{}"));}catch{reject(Error("invalid JSON"));}});});
let cache=null,cacheTime=0;
function cat(n){if(/刑法|刑事|少年|犯罪|警察|刑務所|麻薬|道路交通/.test(n))return"刑事";if(/民法|商法|会社法|民事|借地|借家|不動産登記|家事/.test(n))return"民事";if(/憲法|行政|地方自治|国家賠償|情報公開|公務員/.test(n))return"憲法";if(/労働|雇用|年金|保険|社会福祉|児童|介護/.test(n))return"労働";if(/金融|銀行|税|関税|独占禁止|消費者|産業|知的財産|特許/.test(n))return"経済";if(/環境|廃棄物|自然|建築|都市計画|水質|大気/.test(n))return"環境";return"その他";}
async function lawList(){if(cache&&Date.now()-cacheTime<3600000)return cache;const r=await fetch("https://laws.e-gov.go.jp/api/1/lawlists/1");if(!r.ok)throw Error("e-Gov API error");const x=await r.text();cache=[...x.matchAll(/<LawNameListInfo>([\s\S]*?)<\/LawNameListInfo>/g)].map(m=>{const g=t=>m[1].match(new RegExp("<"+t+">(.*?)</"+t+">"))?.[1]||"";const name=g("LawName").replace(/&amp;/g,"&");return{id:g("LawId"),name,number:g("LawNo"),category:cat(name)};}).filter(v=>v.id&&v.name);cacheTime=Date.now();return cache;}
const srv=http.createServer(async(req,res)=>{try{const u=new URL(req.url,"http://local");if(u.pathname==="/api/health")return send(res,200,{ok:true,aiConfigured:!!process.env.OPENAI_API_KEY});
if(u.pathname==="/api/ask"&&req.method==="POST"){
  if(!process.env.OPENAI_API_KEY)return send(res,503,{error:"OpenAI APIキーが未設定です。Renderの環境変数 OPENAI_API_KEY を設定してください。"});
  const b=await body(req),c=b.case||{},target=String(b.target||"general");
  const targetName=({defendant:"被告人",witness:"証人",prosecution:"検察官",defense:"弁護人"})[target]||"THE COURT AI";
  const context={事件名:c.name,起訴内容:c.summary,事件状況:c.detail,被告人:c.defendant,証人:c.witnessName,検察官:c.prosecutor,弁護人:c.defense,被害者:c.victim||c.victimName,動機:c.motive,事件の内部設定:c.hiddenTwist,証拠:(c.evidence||[]).map(e=>({名称:e.title,内容:e.detail,調査済み:!!e.revealed,出所:e.source}))};
  const system=target==="general"||target==="assistant"
    ?"あなたはTHE COURTの自由対話型AIアシスタントです。ユーザーは裁判の進め方、事件記録、証拠、法律、人物の心理、判決理由、ゲームの操作、創作、一般的な話題など何でも質問できます。質問の主題に合わせて自然な日本語で直接答え、必要なら整理・比較・提案を行ってください。事件記録にある事実、推測、未確認事項を明確に区別し、証拠にない事実を断定しないでください。事件の内部設定はユーザーが真相やネタバレを求めた場合に限り説明してください。法律は一般的な情報として説明し、現実の個別事件への結論を断定せず、必要に応じて専門家への相談を案内してください。質問を裁判に関係する内容だけに限定しないでください。"
    :"あなたは日本の刑事裁判シミュレーションの登場人物を演じます。対象者："+targetName+"。事件記録と矛盾しない範囲で本人の立場・知識に応じて自然に答えてください。知らないことは知らない、曖昧な記憶は曖昧と答え、事実を捏造しないでください。日本語で質問に直接答えてください。架空ゲームであり法律相談ではありません。";
  const history=Array.isArray(b.history)?b.history.slice(-12).filter(m=>m&&(m.role==="user"||m.role==="assistant")&&typeof m.content==="string").map(m=>({role:m.role,content:m.content.slice(0,1800)})):[];
  const messages=[{role:"system",content:system+"\n\n現在の事件記録：\n"+JSON.stringify(context)}];
  for(const m of history)messages.push(m);
  messages.push({role:"user",content:"質問："+String(b.question||"").slice(0,3000)+"\n\n関連する法廷記録："+JSON.stringify((b.transcript||c.log||[]).slice(-16))});
  const r=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:"Bearer "+process.env.OPENAI_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-4.1-mini",temperature:.65,max_tokens:900,messages})});
  const d=await r.json();
  if(!r.ok)return send(res,502,{error:d.error?.message||"OpenAI API error"});
  return send(res,200,{answer:d.choices?.[0]?.message?.content||"回答を生成できませんでした。"});
}if(u.pathname==="/api/laws"){const q=(u.searchParams.get("q")||"").toLowerCase(),c=u.searchParams.get("category")||"all",all=await lawList(),found=all.filter(v=>(c==="all"||v.category===c)&&(!q||(v.name+" "+v.number).toLowerCase().includes(q))).slice(0,100);return send(res,200,{total:found.length,laws:found});}
let p=decodeURIComponent(u.pathname);if(p==="/")p="/index.html";if(p.includes(".."))return send(res,403,{error:"forbidden"});const f=path.join(root,p),st=await stat(f).catch(()=>null);if(!st?.isFile())return send(res,404,{error:"not found"});let data=await readFile(f);
if(p==="/assets/js/game.js"){
  let source=data.toString("utf8");
  source=source.replaceAll("state.case.actions<=0","false");
  source=source.replaceAll("c.actions<=0||c.day>=c.days","false");
  source=source.replaceAll("c.actions<=0","false");
  source=source.replaceAll("c.actions--;","");
  source=source.replaceAll("c.actions=2;","c.actions=999;");
  source=source.replaceAll("質問には本日の行動回数を1回消費します。","質問回数に制限はありません。");
  data=Buffer.from(source);
}
if(p==="/index.html"){
  let html=data.toString();
  html=html.replace("</head>","<link rel=\"stylesheet\" href=\"/court-enhance.css?v=3\"></head>");
  html=html.replace("</body>","<script src=\"/court-enhance.js?v=3\"></script></body>");
  data=Buffer.from(html);
}res.writeHead(200,{"content-type":mime[path.extname(f)]||"application/octet-stream","cache-control":"no-cache"});res.end(data);
}catch(e){send(res,500,{error:e.message||"server error"});}});
srv.listen(port,"0.0.0.0",()=>console.log("THE COURT server "+port));
