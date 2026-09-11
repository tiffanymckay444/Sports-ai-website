const API="https://sports-ai-backend-1-qh65.onrender.com";
let all=[];
let gamesCache=[];

const esc=x=>String(x??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const val=(o,ks,d="—")=>{for(const k of ks)if(o&&o[k]!=null&&o[k]!=="")return o[k];return d};

function objName(v){
  if(v==null)return null;
  if(typeof v==="string")return v;
  if(typeof v!=="object")return null;
  return v.Name||v.name||v.TeamName||v.teamName||v.Abbreviation||v.abbreviation||v.DisplayName||v.displayName||v.ShortName||v.shortName||v.Code||v.code||v.Key||v.key||null;
}
function norm(v){return String(v??"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");}
function ids(o){
  if(!o||typeof o!=="object")return [];
  return [o.external_id,o.externalId,o.GameID,o.gameId,o.GameKey,o.gameKey,o.GlobalGameID,o.globalGameId,o.EventID,o.eventId,o.Id,o.id,o.game_id,o.gameID,o.predictionGameId].filter(v=>v!=null&&v!=="").map(String);
}
function unwrapRows(payload,preferred=[]){
  if(Array.isArray(payload))return payload;
  if(!payload||typeof payload!=="object")return [];
  for(const k of [...preferred,"predictions","games","data","items","results","rows"]){if(Array.isArray(payload[k]))return payload[k]}
  return [];
}
function matchupNames(p){
  const m=val(p,["matchup","Matchup","match_up"],null);
  if(typeof m==="string"){
    const parts=m.split(/\s+@\s+|\s+vs\.?\s+/i).map(x=>x.trim()).filter(Boolean);
    if(parts.length>=2)return {away:parts[0],home:parts.slice(1).join(" vs ")};
  }
  return null;
}
function nestedGame(p){return p?.game||p?.Game||p?.match||p?.Match||p?.event||p?.Event||null}
function directTeam(p,side){
  const keys=side==="home"
    ?["homeTeam","HomeTeam","home_team","Home","home","homeTeamName","HomeTeamName","home_name","HomeName"]
    :["awayTeam","AwayTeam","away_team","Away","away","awayTeamName","AwayTeamName","away_name","AwayName"];
  for(const k of keys){const n=objName(p?.[k]);if(n)return n}
  const g=nestedGame(p); if(g)for(const k of keys){const n=objName(g[k]);if(n)return n}
  return null;
}
function gameTeams(g){
  if(!g||typeof g!=="object")return null;
  let home=objName(val(g,["HomeTeam","homeTeam","home_team","Home","home","HomeTeamName","homeTeamName"],null));
  let away=objName(val(g,["AwayTeam","awayTeam","away_team","Away","away","AwayTeamName","awayTeamName"],null));
  if(home&&away)return {home,away};
  home=directTeam(g,"home"); away=directTeam(g,"away");
  if(home&&away)return {home,away};
  const m=matchupNames(g); return m?{home:m.home,away:m.away}:null;
}
function findGameForPrediction(p,index){
  const pid=ids(p);
  for(const g of gamesCache){
    const gid=ids(g);
    if(pid.some(x=>gid.includes(x)||x===`v24-${g.external_id}`))return g;
  }
  if(Number.isInteger(index)&&index>=0&&index<gamesCache.length){
    const c=gamesCache[index]; if(gameTeams(c))return c;
  }
  const m=matchupNames(p);
  if(m){
    const a=norm(m.away),h=norm(m.home);
    const hit=gamesCache.find(g=>{const t=gameTeams(g);return t&&((norm(t.away)===a&&norm(t.home)===h)||(norm(t.home)===a&&norm(t.away)===h))});
    if(hit)return hit;
  }
  return null;
}
function team(p,side){
  const m=matchupNames(p); if(m)return side==="home"?m.home:m.away;
  const g=findGameForPrediction(p,p.__index),gt=gameTeams(g); if(gt)return side==="home"?gt.home:gt.away;
  const direct=directTeam(p,side); if(direct)return direct;
  return side==="home"?"Home Team":"Away Team";
}
function gameMeta(p){
  const raw=val(p,["starts_at","startsAt","startTime","StartTime","DateTime","dateTime"],null);
  const g=nestedGame(p)||{};
  const date=raw||val(g,["starts_at","startsAt","DateTime","dateTime","Date","date","StartTime","startTime"],null);
  if(!date)return null; const d=new Date(date); if(Number.isNaN(d.getTime()))return null;
  return d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
}
function reasons(p){
  if(Array.isArray(p.reasons)&&p.reasons.length)return p.reasons.slice(0,4);
  if(typeof p.reasons==="string")return [p.reasons];
  if(p.features&&typeof p.features==="object"){
    if(Array.isArray(p.features.reasons)&&p.features.reasons.length)return p.features.reasons.slice(0,4);
    let a=[];for(const[k,v]of Object.entries(p.features)){if(v!=null&&typeof v!=="object")a.push(`${k.replace(/_/g," ")}: ${v}`);if(a.length>=4)break}
    if(a.length)return a;
  }
  return ["Signal generated from available performance, form, availability and data-quality factors."];
}
function percent(v){
  const n=Number(v); if(!Number.isFinite(n))return null; return n<=1?Math.round(n*100):Math.round(n);
}
function getStats(p,side){
  const g=findGameForPrediction(p,p.__index);
  const source=side==="home"?(p.homeTeam||p.HomeTeam||g?.HomeTeam||g?.homeTeam):(p.awayTeam||p.AwayTeam||g?.AwayTeam||g?.awayTeam);
  const o=typeof source==="object"?source:{};
  const f=p.features||{};
  const candidates=side==="home"?["homeWinPct","HomeWinPct","home_win_pct","homeWins","home_win_percentage"]:["awayWinPct","AwayWinPct","away_win_pct","awayWins","away_win_percentage"];
  let win=candidates.map(k=>val(p,[k],null)).find(x=>x!=null);
  if(win==null) win=candidates.map(k=>val(f,[k],null)).find(x=>x!=null);
  if(win==null) win=val(o,["WinPct","winPct","WinPercentage","winPercentage"],null);
  return {
    record: val(o,["WinsLosses","Record","record"], val(p,side==="home"?["homeRecord","HomeRecord"]:["awayRecord","AwayRecord"],"—")),
    winPct: percent(win),
    pointsFor: val(o,["PointsPerGame","pointsPerGame","RunsPerGame","GoalsPerGame","PointsFor"],null),
    pointsAgainst: val(o,["PointsAgainstPerGame","pointsAgainstPerGame","RunsAllowedPerGame","GoalsAgainstPerGame","PointsAgainst"],null)
  };
}
function quality(p){
  const f=p.features||{};
  return val(p,["data_quality","dataQuality","quality"],val(f,["data_quality","dataQuality","quality"],null));
}
function impact(p){
  const f=p.features||{};
  return val(p,["injury_impact","injuryImpact"],val(f,["injury_impact","injuryImpact"],null));
}

const TRACK_KEY="sports_ai_prediction_tracking_v26";
function loadTracked(){
  try{return JSON.parse(localStorage.getItem(TRACK_KEY)||"{}")}catch{return {}}
}
function saveTracked(x){localStorage.setItem(TRACK_KEY,JSON.stringify(x))}
function trackId(p){
  return String(val(p,["external_id","externalId","prediction_id","predictionId","GameID","gameId","id","Id"],`${val(p,["sport","Sport"],"sport")}-${team(p,"away")}-${team(p,"home")}-${gameMeta(p)||p.__index}`))
}
function outcome(p){
  const raw=val(p,["evaluation","result","outcome","status","Status"],null);
  if(raw&&typeof raw==="object") return String(val(raw,["result","outcome","status"],"")).toUpperCase();
  const s=String(raw||"").toUpperCase();
  if(["WIN","LOSS","PUSH"].includes(s)) return s;
  const ev=p.evaluation||p.Evaluation;
  if(ev&&typeof ev==="object"){
    const x=String(val(ev,["result","outcome","status"],"")).toUpperCase();
    if(["WIN","LOSS","PUSH"].includes(x)) return x;
  }
  return "";
}
function localOutcome(p){
  const t=loadTracked()[trackId(p)];
  return t?.result||outcome(p)||"PENDING";
}
function toggleTrack(index){
  const p=all[index]; if(!p)return;
  const id=trackId(p), db=loadTracked();
  if(db[id]) delete db[id];
  else db[id]={result: outcome(p)||"PENDING", addedAt:new Date().toISOString(), sport:val(p,["sport","Sport"],"SPORT"), matchup:`${team(p,"away")} @ ${team(p,"home")}`, pick:val(p,["pick","Pick","prediction","Prediction","selection","Selection"],"Pending")};
  saveTracked(db); render(); updateTracking();
}


function confidenceFor(p){return percent(val(p,["confidence","Confidence"],0))||0}
function historyRows(){
  const db=loadTracked();
  return all.filter(p=>db[trackId(p)]).map(p=>({
    p, result:localOutcome(p), confidence:confidenceFor(p),
    sport:String(val(p,["sport","Sport"],"SPORT")).toUpperCase(),
    matchup:`${team(p,"away")} @ ${team(p,"home")}`,
    pick:val(p,["pick","Pick","prediction","Prediction","selection","Selection"],"—"),
    date:gameMeta(p)||"—"
  }));
}

function updateAccuracyDashboard(){
  const rows=historyRows();
  const decided=rows.filter(x=>["WIN","LOSS","PUSH"].includes(x.result));
  const winsN=decided.filter(x=>x.result==="WIN").length;
  const lossesN=decided.filter(x=>x.result==="LOSS").length;
  const pushesN=decided.filter(x=>x.result==="PUSH").length;
  const winPct=decided.length?Math.round(winsN/decided.length*100):0;
  // Simple 1-unit flat-stake performance indicator: +1 win, -1 loss, 0 push.
  const units=winsN-lossesN;
  const roi=decided.length?((units/decided.length)*100):0;

  accTracked.textContent=rows.length;
  accDecided.textContent=decided.length;
  accWins.textContent=winsN;
  accLosses.textContent=lossesN;
  accWinPct.textContent=decided.length?winPct+"%":"—";
  accPushes.textContent=pushesN;
  accUnits.textContent=(units>0?"+":"")+units.toFixed(0);
  accRoi.textContent=decided.length?`${roi>=0?"+":""}${roi.toFixed(0)}%`:"—";

  const sports=["NBA","MLB","NHL","NFL","SOCCER"];
  accSports.innerHTML=sports.map(s=>{
    const sr=rows.filter(x=>x.sport===s), sd=sr.filter(x=>["WIN","LOSS","PUSH"].includes(x.result));
    const sw=sd.filter(x=>x.result==="WIN").length, sl=sd.filter(x=>x.result==="LOSS").length;
    const pct=sd.length?Math.round(sw/sd.length*100):null;
    return `<div class="accuracySport"><div><b>${s}</b><span>${sd.length} decided</span></div><strong>${pct==null?"—":pct+"%"}</strong><div class="accuracyMini"><i style="width:${pct||0}%"></i></div><small>${sw}W • ${sl}L • ${sd.filter(x=>x.result==="PUSH").length}P</small></div>`;
  }).join("");

  accHistory.innerHTML=rows.length?rows.slice().reverse().map(x=>
    `<div class="historyRow">
      <div class="historyDate">${esc(x.date)}</div>
      <div class="historyMain"><b>${esc(x.matchup)}</b><span>${esc(x.sport)} • Pick ${esc(x.pick)} • ${x.confidence}% confidence</span></div>
      <span class="result ${x.result.toLowerCase()}">${esc(x.result)}</span>
    </div>`
  ).join(""):`<div class="empty small">Track predictions to build your performance history.</div>`;

  accMessage.textContent=decided.length
    ? `Based on ${decided.length} decided tracked prediction${decided.length===1?"":"s"}. Flat 1-unit indicator: ${units>=0?"+":""}${units} units.`
    : "Your tracked predictions will build this record automatically as V24 evaluates completed games.";
}

function updateTracking(){
  const db=loadTracked(), entries=Object.entries(db);
  trackedCount.textContent=entries.length;
  const winsN=entries.filter(([,x])=>x.result==="WIN").length;
  const lossesN=entries.filter(([,x])=>x.result==="LOSS").length;
  const pushesN=entries.filter(([,x])=>x.result==="PUSH").length;
  trackedWins.textContent=winsN; trackedLosses.textContent=lossesN; trackedPushes.textContent=pushesN;
  const decided=winsN+lossesN+pushesN;
  trackedPct.textContent=decided?Math.round((winsN/decided)*100)+"%":"—";
  const list=all.filter(p=>db[trackId(p)]);
  trackedList.innerHTML=list.length?list.map(p=>{
    const r=localOutcome(p);
    return `<div class="trackrow"><div><b>${esc(team(p,"away"))} @ ${esc(team(p,"home"))}</b><small>${esc(String(val(p,["sport","Sport"],"SPORT")).toUpperCase())} • Pick ${esc(val(p,["pick","Pick","prediction","Prediction"],"—"))}</small></div><span class="result ${r.toLowerCase()}">${esc(r)}</span><button type="button" onclick="toggleTrack(${p.__index})">×</button></div>`
  }).join(""):`<div class="empty small">No saved predictions yet. Tap “TRACK” on any prediction.</div>`;
  updateAccuracyDashboard();
}

function render(s="ALL"){
  let a=s==="ALL"?all:all.filter(p=>String(val(p,["sport","Sport"],"")).toUpperCase()===s);
  if(!a.length){grid.innerHTML='<div class="empty">No predictions available for this sport right now.</div>';return}
  grid.innerHTML=a.map((p,i)=>{
    let c=percent(val(p,["confidence","Confidence"],0))||0;
    let home=team(p,"home"),away=team(p,"away");
    let pick=val(p,["pick","Pick","prediction","Prediction","selection","Selection"],"Pending");
    const reasonsText=reasons(p).slice(0,2).join(" • ");
    return `<article class="card clickable">
      <div class="cardtop"><span class="sport">${esc(String(val(p,["sport","Sport"],"SPORT")).toUpperCase())}</span><span class="status">${esc(val(p,["status","Status"],"PENDING"))}</span></div>
      <div class="game">${esc(home)} <span>vs</span> ${esc(away)}</div>
      ${gameMeta(p)?`<div class="meta">${esc(gameMeta(p))}</div>`:""}
      <div class="pickrow"><strong>${esc(pick)}</strong><span class="conf">${c}% confidence</span></div>
      <div class="bar"><i style="width:${Math.max(0,Math.min(100,c))}%"></i></div>
      <div class="why">${esc(reasonsText)}</div>
      <div class="tags cleanTags"><span class="tag">V24 PRO INTELLIGENCE</span><span class="tag">EXPLAINABLE</span></div>
      <div class="v28actions">
        <button class="v28analysis" type="button" onclick="event.stopPropagation();showDetail(${p.__index})">VIEW AI ANALYSIS</button>
        <button class="v28track ${loadTracked()[trackId(p)]?'isTracked':''}" type="button" onclick="event.stopPropagation();toggleTrack(${p.__index})">${loadTracked()[trackId(p)]?'✓ TRACKED':'＋ TRACK'}</button>
      </div>
    </article>`
  }).join("")
}
function detailStat(label,value){return `<div class="dstat"><small>${esc(label)}</small><b>${esc(value==null?"—":value)}</b></div>`}
function showDetail(index){
  const p=all[index]; if(!p)return;
  const sport=String(val(p,["sport","Sport"],"SPORT")).toUpperCase();
  const home=team(p,"home"),away=team(p,"away");
  const pick=val(p,["pick","Pick","prediction","Prediction","selection","Selection"],"Pending");
  const c=percent(val(p,["confidence","Confidence"],0))||0;
  const h=getStats(p,"home"),a=getStats(p,"away");
  const q=quality(p),inj=impact(p);
  const edge=val(p,["edge","Edge"],val(p.features||{},["edge","Edge"],null));
  const homeAdv=val(p,["home_advantage","homeAdvantage"],val(p.features||{},["home_advantage","homeAdvantage"],null));
  const form=val(p,["recent_form","recentForm","form"],val(p.features||{},["recent_form","recentForm","form"],null));
  const rs=reasons(p);
  detailContent.innerHTML=`
    <div class="detailhead"><div><div class="eyebrow">${esc(sport)} • AI ANALYSIS</div><h2>${esc(home)} <span>vs</span> ${esc(away)}</h2>${gameMeta(p)?`<p>${esc(gameMeta(p))}</p>`:""}</div><div class="bigconf"><b>${c}%</b><small>CONFIDENCE</small></div></div>
    <div class="pickhero"><small>SPORTS AI PICK</small><strong>${esc(pick)}</strong><div class="detailbar"><i style="width:${c}%"></i></div>
      <button class="detailTrackBtn ${loadTracked()[trackId(p)]?'tracked':''}" type="button" onclick="toggleTrack(${p.__index});showDetail(${p.__index})">${loadTracked()[trackId(p)]?'✓ TRACKED — REMOVE':'＋ TRACK THIS PREDICTION'}</button>
    </div>
    <h3>Team intelligence</h3>
    <div class="teamgrid">
      <div class="teambox"><span>HOME</span><h4>${esc(home)}</h4><div class="stats">${detailStat("Record",h.record)}${detailStat("Win %",h.winPct==null?"—":h.winPct+"%")}${detailStat("Scoring",h.pointsFor??"—")}</div></div>
      <div class="teambox"><span>AWAY</span><h4>${esc(away)}</h4><div class="stats">${detailStat("Record",a.record)}${detailStat("Win %",a.winPct==null?"—":a.winPct+"%")}${detailStat("Scoring",a.pointsFor??"—")}</div></div>
    </div>
    <h3>Why the model picked ${esc(pick)}</h3>
    <div class="reasonlist">${rs.map((r,i)=>`<div><b>${i+1}</b><span>${esc(r)}</span></div>`).join("")}</div>
    <div class="signalgrid">${detailStat("Edge",edge)}${detailStat("Data quality",q)}${detailStat("Home advantage",homeAdv)}${detailStat("Recent form",form)}${detailStat("Availability impact",inj)}</div>
    <div class="detailnote">Statistical estimate only. Confidence can change as new games, injuries, lineups and other data arrive.</div>`;
  detailModal.classList.add("show"); detailModal.setAttribute("aria-hidden","false");
}
function hideDetail(){detailModal.classList.remove("show");detailModal.setAttribute("aria-hidden","true")}
async function json(url){const r=await fetch(url);if(!r.ok)throw new Error(`${r.status}`);return r.json()}

function updateHomeDashboard(){
  homeGames.textContent=gamesCache.length;
  homePicks.textContent=all.length;
  const confs=all.map(confidenceFor).filter(x=>Number.isFinite(x));
  homeTopConfidence.textContent=confs.length?Math.max(...confs)+"%":"—";
  const tracked=all.map(p=>localOutcome(p)).filter(x=>["WIN","LOSS","PUSH"].includes(x));
  const wins=tracked.filter(x=>x==="WIN").length;
  homeWinRate.textContent=tracked.length?Math.round(wins/tracked.length*100)+"%":"—";
  homeConnection.textContent=`LIVE • ${all.length} PICKS`;
  const top=all.slice().sort((a,b)=>confidenceFor(b)-confidenceFor(a)).slice(0,3);
  topPicks.innerHTML=top.length?top.map(p=>{
    const c=confidenceFor(p), pick=val(p,["pick","Pick","prediction","Prediction","selection","Selection"],"Pending");
    return `<button class="topPick" type="button" onclick="showDetail(${p.__index})">
      <div><span>${esc(String(val(p,["sport","Sport"],"SPORT")).toUpperCase())}</span><b>${esc(team(p,"away"))} @ ${esc(team(p,"home"))}</b></div>
      <div class="topPickRight"><strong>${esc(pick)}</strong><small>${c}%</small><i><em style="width:${c}%"></em></i></div>
    </button>`
  }).join(""):`<div class="empty small">No predictions available yet.</div>`;
}

async function loadAll(){
  connection.textContent="Updating live data…";
  try{
    const [s,p,d,g]=await Promise.all([json(API+"/api/v24/status"),json(API+"/api/v24/predictions"),json(API+"/api/v24/dashboard"),json(API+"/api/v24/games")]);
    gamesCache=unwrapRows(g,["games"]); games.textContent=val(s,["games"]); preds.textContent=val(s,["predictions"]); teams.textContent=val(s,["intelligenceTeams","teamsProfiled"]);
    all=unwrapRows(p,["predictions"]).map((x,i)=>({...x,__index:i})); render(); updateHomeDashboard();
    record.textContent=`${val(d,["wins"],0)}-${val(d,["losses"],0)}-${val(d,["pushes"],0)}`;
    wins.textContent=val(d,["wins"],0);losses.textContent=val(d,["losses"],0);pushes.textContent=val(d,["pushes"],0);
    connection.textContent=`Live • ${all.length} predictions loaded`; updateTracking();
  }catch(e){console.error("SPORTS AI V2.4 load error",e);connection.textContent="Backend unavailable";grid.innerHTML='<div class="empty">The dashboard is online, but the live prediction service is temporarily unavailable.</div>'}
}
document.querySelectorAll("#filters button").forEach(b=>b.onclick=()=>{document.querySelectorAll("#filters button").forEach(x=>x.classList.remove("active"));b.classList.add("active");render(b.dataset.sport)});
date.textContent=new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});
function showPro(){modal.classList.add("show")}
function hidePro(){modal.classList.remove("show")}
function join(){const e=document.getElementById("email").value;if(e.includes("@"))msg.textContent="You're on the PRO waitlist."}
window.addEventListener("keydown",e=>{if(e.key==="Escape"){hideDetail();hidePro()}})
loadAll();

document.addEventListener("click", function(e){
  const card=e.target.closest(".card.clickable");
  if(card && !e.target.closest("button") && !e.target.closest("a")){
    const cards=[...document.querySelectorAll(".card.clickable")];
    const idx=cards.indexOf(card);
    if(idx>=0){
      const visibleSport=document.querySelector("#filters button.active")?.dataset.sport||"ALL";
      const visible=visibleSport==="ALL"?all:all.filter(p=>String(val(p,["sport","Sport"],"")).toUpperCase()===visibleSport);
      if(visible[idx]) showDetail(visible[idx].__index);
    }
  }
});

updateTracking();


function openPro(e){if(e)e.preventDefault();document.getElementById("proModal").classList.add("open");}
function closePro(){document.getElementById("proModal").classList.remove("open");}
function showProNotice(){alert("SPORTS AI PRO checkout is ready for the production payment connection.");}
document.addEventListener("click",function(e){const b=e.target.closest("button,a");if(b&&b.textContent.trim()==="SPORTS AI PRO")openPro(e);});
