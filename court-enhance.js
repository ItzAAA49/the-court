(function(){
"use strict";
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const SAVE_KEY="the-court-save-v1";
let chatBusy=false;

function savedState(){
  try{return JSON.parse(localStorage.getItem(SAVE_KEY)||"{}")||{};}catch(e){return {};}
}
function currentCase(){const s=savedState();return s.case||{};}
function caseKey(){const c=currentCase();return String(c.id||c.name||"current").replace(/[^a-zA-Z0-9_-]/g,"_");}
function chatKey(){return "the-court-ai-chat-v2-"+caseKey();}
function memoKey(){return "the-court-judge-memo-v2-"+caseKey();}
function readChat(){try{return JSON.parse(localStorage.getItem(chatKey())||"[]").slice(-40);}catch(e){return [];}}
function storeChat(a){localStorage.setItem(chatKey(),JSON.stringify(a.slice(-40)));}
function appendMessage(role,text){
  const list=$("#courtAiMessages");if(!list)return;
  const item=document.createElement("div");
  item.className="court-chat-message "+(role==="user"?"is-user":"is-ai");
  const who=document.createElement("b");who.textContent=role==="user"?"あなた":"THE COURT AI";
  const body=document.createElement("div");body.className="court-chat-text";body.textContent=text;
  item.append(who,body);list.appendChild(item);list.scrollTop=list.scrollHeight;
}
function showChatHistory(){
  const list=$("#courtAiMessages");if(!list)return;
  list.innerHTML="";
  const history=readChat();
  if(!history.length){const intro=document.createElement("div");intro.className="court-ai-welcome";intro.textContent="裁判のことでも、法律のことでも、ゲームの操作でも、自由に質問してください。裁判と関係のない話題も質問できます。";list.appendChild(intro);}
  history.forEach(m=>appendMessage(m.role,m.content));
}
function getCaseContext(){
  const s=savedState(),c=s.case||{};
  return {case:c,transcript:(s.log||c.log||s.transcript||[]).slice(-20)};
}
function switchTool(name){
  const panel=$("#tabContent");if(!panel)return;
  document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
  document.querySelectorAll(".court-tool-btn").forEach(b=>b.classList.toggle("active",b.dataset.tool===name));
  renderTool(name);
}
function openNativeTab(name){
  const btn=$('.tab-btn[data-tab="'+name+'"]');
  if(btn){btn.click();document.querySelectorAll(".court-tool-btn").forEach(b=>b.classList.remove("active"));}
}
function renderTool(name){
  const root=$("#tabContent");if(!root)return;
  const c=currentCase();
  if(name==="ai"){
    root.innerHTML='<section class="court-tool-view court-ai-shell"><div class="court-tool-heading"><div><span class="court-eyebrow">OPEN CONVERSATION</span><h3>AIに自由に質問</h3><p>質問内容は自由です。事件の整理、法律の説明、人物の心情、判決理由、ゲームの相談、一般的な話題まで対応します。</p></div><button type="button" class="court-light-button" id="courtAiClear">会話を消去</button></div><div class="court-ai-messages" id="courtAiMessages" aria-live="polite"></div><div class="court-ai-suggestions"><button type="button" data-ai-prompt="この事件の争点を整理して">争点を整理</button><button type="button" data-ai-prompt="今までの証拠から考えられる別の見方は？">証拠を分析</button><button type="button" data-ai-prompt="刑事裁判の流れをわかりやすく説明して">裁判の流れ</button><button type="button" data-ai-prompt="このゲームの自由度を上げるアイデアを出して">アイデア</button></div><form id="courtAiForm" class="court-ai-compose"><textarea id="courtAiInput" rows="3" maxlength="3000" placeholder="聞きたいことを自由に入力してください。例：この証拠だけで有罪と判断してよい？"></textarea><div class="court-ai-compose-footer"><span>最大3,000文字・会話履歴はこのブラウザに保存</span><button type="submit" id="courtAiSend">送信する　↗</button></div></form></section>';
    showChatHistory();
    return;
  }
  if(name==="memo"){
    root.innerHTML='<section class="court-tool-view"><span class="court-eyebrow">JUDGE NOTES</span><h3>裁判官メモ</h3><p>気づいた点、追加で確認したいこと、評議の考えなどを自由に記録できます。自動保存されます。</p><textarea class="court-memo" id="courtJudgeMemo" rows="12" placeholder="ここに自由にメモを入力…"></textarea><div class="court-tool-footer"><span id="courtMemoStatus">この事件専用のメモです</span><button id="courtMemoSave" type="button">保存</button></div></section>';
    $("#courtJudgeMemo").value=localStorage.getItem(memoKey())||"";
    return;
  }
  if(name==="people"){
    const people=[["裁判官","あなた（裁判官）"],["被告人",c.defendant],["検察官",c.prosecutor],["弁護人",c.defense],["証人",c.witnessName],["被害者",c.victim||c.victimName]];
    root.innerHTML='<section class="court-tool-view"><span class="court-eyebrow">CASE PARTICIPANTS</span><h3>関係者一覧</h3><p>事件記録に登録されている人物を確認できます。</p><div class="court-people-grid">'+people.filter(x=>x[1]).map(x=>'<div class="court-person"><small>'+esc(x[0])+'</small><b>'+esc(x[1])+'</b></div>').join("")+'</div></section>';
    return;
  }
  if(name==="timeline"){
    const day=Math.max(1,Number(c.day||1)),days=Math.max(day,Number(c.days||5));
    const steps=[["第1回","人定質問・起訴状朗読・黙秘権告知・罪状認否"],["第2回","冒頭陳述・審理計画"],["中盤","証拠調べ・証人尋問・被告人質問"],["終盤","論告・求刑・最終弁論"],["最終回","被告人の最終陳述・判決宣告"]];
    root.innerHTML='<section class="court-tool-view"><span class="court-eyebrow">TRIAL TIMELINE</span><h3>審理の進行表</h3><p>現在の進行状況を確認できます。行動回数の制限はありません。日付の進行は「次の日へ進む」で行います。</p><div class="court-progress"><div><b>DAY '+day+' / '+days+'</b><span>審理進行</span></div><div class="court-progress-track"><i style="width:'+Math.min(100,day/days*100)+'%"></i></div></div><div class="court-timeline">'+steps.map((s,i)=>'<div class="court-timeline-step '+(i<=Math.min(4,Math.floor((day-1)/Math.max(1,Math.ceil(days/5))))?"is-current":"")+'"><b>'+esc(s[0])+'</b><span>'+esc(s[1])+'</span></div>').join("")+'</div><button class="court-primary-button" type="button" id="courtNextDay">次の日へ進む　→</button></section>';
    return;
  }
  if(name==="law"){
    root.innerHTML='<section class="court-tool-view"><span class="court-eyebrow">JAPANESE LAW DATABASE</span><h3>法律・法令検索</h3><p>分野を選んで現行法令を検索できます。結果はe-Gov公式法令ページで確認できます。</p><div class="court-law-form"><select id="courtLawCat"><option value="all">すべての分野</option><option value="刑事">刑事・刑事手続</option><option value="民事">民事・商事</option><option value="憲法">憲法・行政</option><option value="労働">労働・社会保障</option><option value="経済">経済・産業</option><option value="環境">環境・建築</option><option value="その他">その他</option></select><input id="courtLawQuery" placeholder="法律名・キーワード（例：刑法）"><button type="button" id="courtLawSearch">検索</button></div><div id="courtLawResults" class="court-law-results"></div></section>';
    return;
  }
}
function addToolbar(){
  const bar=$(".tabbar"),aside=$(".right-panel");
  if(!bar||!aside||$("#courtQuickToolbar"))return;
  const shell=document.createElement("section");shell.id="courtQuickToolbar";shell.className="court-quickbar";
  shell.innerHTML='<div class="court-quickbar-head"><b>裁判官ツール</b><span>いつでも自由に操作できます</span></div><div class="court-quickbar-grid"><button type="button" class="court-tool-btn" data-tool="ai">✦ AI相談</button><button type="button" class="court-tool-btn" data-tool="memo">✎ メモ</button><button type="button" class="court-tool-btn" data-tool="people">♙ 人物一覧</button><button type="button" class="court-tool-btn" data-tool="timeline">▤ 進行表</button><button type="button" class="court-tool-btn" data-tool="law">§ 法律検索</button><button type="button" class="court-tool-btn" data-tab-open="record">▣ 事件記録</button><button type="button" class="court-tool-btn" data-tab-open="evidence">▧ 証拠品</button><button type="button" class="court-tool-btn" data-tab-open="question">☷ 尋問・質問</button><button type="button" class="court-tool-btn" data-tab-open="prosecution">検察官</button><button type="button" class="court-tool-btn" data-tab-open="defense">弁護人</button><button type="button" class="court-tool-btn" data-tab-open="witness">証人</button><button type="button" class="court-tool-btn" data-tab-open="analysis">心証</button><button type="button" class="court-tool-btn" data-tab-open="verdict">判決</button></div>';
  bar.after(shell);
}
function markStanding(){
  const speeches=$("#speeches");if(!speeches)return;
  [...speeches.querySelectorAll(".speech")].slice(0,2).forEach(el=>el.classList.add("standing"));
}
async function sendAiQuestion(q){
  if(chatBusy)return;
  const history=readChat();
  const prior=history.slice(-12).map(m=>({role:m.role,content:m.content}));
  history.push({role:"user",content:q});
  storeChat(history);appendMessage("user",q);
  const input=$("#courtAiInput"),button=$("#courtAiSend");
  if(input)input.value="";
  chatBusy=true;if(button){button.disabled=true;button.textContent="回答中…";}
  appendMessage("assistant","考えています…");
  const messages=$("#courtAiMessages");
  try{
    const ctx=getCaseContext();
    const response=await fetch("/api/ask",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({target:"general",question:q,case:ctx.case,transcript:ctx.transcript,history:prior})});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"AIから回答を取得できませんでした。");
    const answer=String(data.answer||"回答を取得できませんでした。");
    const all=readChat();all.push({role:"assistant",content:answer});storeChat(all);
    const last=messages?.lastElementChild;if(last&&last.classList.contains("is-ai"))last.remove();
    appendMessage("assistant",answer);
  }catch(e){
    const last=messages?.lastElementChild;if(last&&last.classList.contains("is-ai"))last.remove();
    appendMessage("assistant","エラー："+(e.message||"AIサーバーへ接続できません。"));
  }finally{
    chatBusy=false;if(button){button.disabled=false;button.textContent="送信する　↗";}
    $("#courtAiInput")?.focus();
  }
}
async function searchLaws(query,category,resultRoot){
  resultRoot.textContent="法令を検索しています…";
  try{
    const r=await fetch("/api/laws?q="+encodeURIComponent(query||"")+"&category="+encodeURIComponent(category||"all"));
    const d=await r.json();if(!r.ok)throw new Error(d.error||"検索に失敗しました。");
    resultRoot.innerHTML="";
    if(!d.laws||!d.laws.length){resultRoot.textContent="該当する法令がありません。";return;}
    const summary=document.createElement("p");summary.className="court-law-count";summary.textContent="検索結果："+d.laws.length+"件（表示上限100件）";resultRoot.appendChild(summary);
    d.laws.forEach(x=>{
      const a=document.createElement("a");a.className="court-law-result";a.href="https://laws.e-gov.go.jp/law/"+encodeURIComponent(x.id);a.target="_blank";a.rel="noopener";
      const b=document.createElement("b");b.textContent=x.name;
      const s=document.createElement("small");s.textContent=[x.number,x.category].filter(Boolean).join(" ・ ");
      a.append(b,s);resultRoot.appendChild(a);
    });
  }catch(e){resultRoot.textContent=e.message||"法令検索に失敗しました。";}
}
function addVerdictPicker(){
  const modal=$("#modalRoot"),body=modal?.querySelector(".modal-body");
  if(!body||!modal.innerText.includes("判決")||body.querySelector("#courtVerdictLaw"))return;
  const box=document.createElement("section");box.id="courtVerdictLaw";box.className="court-tool-view court-verdict-picker";
  box.innerHTML='<span class="court-eyebrow">LEGAL BASIS</span><h3>適用法令を確認</h3><p>判決理由で参照する法令を探せます。選んだ法令名はこの判決画面に表示されます。</p><div class="court-law-form"><select id="courtVerdictCat"><option value="all">すべての分野</option><option value="刑事">刑事</option><option value="民事">民事</option><option value="憲法">憲法・行政</option><option value="労働">労働</option><option value="経済">経済</option><option value="環境">環境</option><option value="その他">その他</option></select><input id="courtVerdictQuery" placeholder="法令名・キーワード"><button type="button" id="courtVerdictSearch">検索</button></div><div id="courtVerdictResults" class="court-law-results"></div><div id="courtSelectedLaw" class="court-selected-law">選択中の法令：未選択</div>';
  body.prepend(box);
}
async function searchVerdictLaws(){
  const root=$("#courtVerdictResults");if(!root)return;
  root.textContent="法令を検索しています…";
  try{
    const r=await fetch("/api/laws?q="+encodeURIComponent($("#courtVerdictQuery")?.value||"")+"&category="+encodeURIComponent($("#courtVerdictCat")?.value||"all"));
    const d=await r.json();if(!r.ok)throw new Error(d.error||"検索に失敗しました。");
    root.innerHTML="";
    if(!d.laws||!d.laws.length){root.textContent="該当する法令がありません。";return;}
    d.laws.forEach(x=>{
      const b=document.createElement("button");b.type="button";b.className="court-law-result court-law-choice";b.dataset.lawChoice=x.name;b.dataset.lawId=x.id;
      const title=document.createElement("b");title.textContent=x.name;
      const detail=document.createElement("small");detail.textContent=[x.number,x.category].filter(Boolean).join(" ・ ");
      b.append(title,detail);root.appendChild(b);
    });
  }catch(e){root.textContent=e.message||"法令検索に失敗しました。";}
}
function init(){
  addToolbar();markStanding();addVerdictPicker();
  if(!window.__courtEnhanceObserver){
    const observer=new MutationObserver(()=>{addToolbar();markStanding();addVerdictPicker();});
    observer.observe(document.body,{childList:true,subtree:true});
    window.__courtEnhanceObserver=observer;
  }
}
document.addEventListener("click",e=>{
  const tool=e.target.closest("[data-tool]");
  if(tool){switchTool(tool.dataset.tool);return;}
  const tab=e.target.closest("[data-tab-open]");
  if(tab){openNativeTab(tab.dataset.tabOpen);return;}
  const prompt=e.target.closest("[data-ai-prompt]");
  if(prompt){if(!$("#courtAiMessages"))switchTool("ai");const input=$("#courtAiInput");if(input){input.value=prompt.dataset.aiPrompt;input.focus();}return;}
  if(e.target.closest("#courtAiClear")){
    if(confirm("この事件のAI会話履歴を消去しますか？")){localStorage.removeItem(chatKey());showChatHistory();}
    return;
  }
  if(e.target.closest("#courtLawSearch")){
    searchLaws($("#courtLawQuery")?.value||"",$("#courtLawCat")?.value||"all",$("#courtLawResults"));return;
  }
  if(e.target.closest("#courtVerdictSearch")){searchVerdictLaws();return;}
  const lawChoice=e.target.closest("[data-law-choice]");
  if(lawChoice){
    const label=$("#courtSelectedLaw");
    if(label)label.textContent="選択中の法令："+lawChoice.dataset.lawChoice;
    localStorage.setItem("the-court-selected-law-"+caseKey(),JSON.stringify({name:lawChoice.dataset.lawChoice,id:lawChoice.dataset.lawId||""}));
    return;
  }
  if(e.target.closest("#courtMemoSave")){
    localStorage.setItem(memoKey(),$("#courtJudgeMemo")?.value||"");
    if($("#courtMemoStatus"))$("#courtMemoStatus").textContent="保存しました";
    return;
  }
  if(e.target.closest("#courtNextDay")){
    const next=$('.action-btn[data-action="next"]');if(next)next.click();else alert("この事件は最終日です。");
    return;
  }
});
document.addEventListener("submit",e=>{
  if(e.target.id==="courtAiForm"){
    e.preventDefault();const q=$("#courtAiInput")?.value.trim();if(q)sendAiQuestion(q);
  }
});
document.addEventListener("input",e=>{
  if(e.target.id==="courtJudgeMemo"){
    localStorage.setItem(memoKey(),e.target.value);
    if($("#courtMemoStatus"))$("#courtMemoStatus").textContent="自動保存済み";
  }
});
document.addEventListener("keydown",e=>{
  if(e.altKey&&!e.ctrlKey&&!e.metaKey){
    const map={a:"ai",m:"memo",p:"people",t:"timeline",l:"law"};
    const name=map[e.key.toLowerCase()];if(name){e.preventDefault();switchTool(name);}
  }
});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();