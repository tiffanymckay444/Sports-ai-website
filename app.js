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
  return [o.external_id,o.externalId,o.GameID,o.gameId,o.EventID,o.eventId,o.Id,o.id,o.game_id,o.gameID,o.predictionGameId].filter(v=>v!=null&&v!=="").map(String);
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

function directTeam(p,side){
  const keys=side==="home"
    ? ["homeTeam","HomeTeam","home_team","Home","home","homeTeamName","HomeTeamName","home_name","HomeName"]
    : ["awayTeam","AwayTeam","away_team","Away","away","awayTeamName","AwayTeamName","away_name","AwayName"];
  for(const k of keys){const n=objName(p?.[k]);if(n)return n}
  const g=p?.game||p?.Game||p?.match||p?.Match||p?.event||p?.Event;
  if(g)for(const k of keys){const n=objName(g[k]);if(n)return n}
  return null;
}

function gameTeams(g){
  if(!g||typeof g!=="object")return null;
  let home=directTeam(g,"home"), away=directTeam(g,"away");
  if(home&&away)return {home,away};
  const m=matchupNames(g);
  return m?{home:m.home,away:m.away}:null;
}

function findGameForPrediction(p){
  const pid=ids(p);
  for(const g of gamesCache){
    const gid=ids(g);
    if(pid.some(x=>gid.includes(x)||x===`v24-${g.external_id}`))return g;
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
  // V24 stores the canonical matchup as "AWAY @ HOME".
  const m=matchupNames(p);
  if(m)return side==="home"?m.home:m.away;
  const g=findGameForPrediction(p), gt=gameTeams(g);
  if(gt)return side==="home"?gt.home:gt.away;
  const direct=directTeam(p,side);
  if(direct)return direct;
  return side==="home"?"Home Team":"Away Team";
}

function gameMeta(p){
  const raw=val(p,["starts_at","startsAt","startTime","StartTime","DateTime","dateTime"],null);
  const g=p?.game||p?.Game||p?.match||p?.Match||p?.event||p?.Event||{};
  const date=raw||val(g,["starts_at","startsAt","DateTime","dateTime","Date","date","StartTime","startTime"],null);
  if(!date)return null;
  const d=new Date(date);if(Number.isNaN(d.getTime()))return null;
  return d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
}

function reasons(p){
  if(Array.isArray(p.reasons)&&p.reasons.length)return p.reasons.slice(0,3).join(" • ");
  if(typeof p.reasons==="string")return p.reasons;
  if(p.features&&typeof p.features==="object"){
    if(Array.isArray(p.features.reasons)&&p.features.reasons.length)return p.features.reasons.slice(0,3).join(" • ");
    let a=[];for(const [k,v] of Object.entries(p.features)){if(v!=null&&typeof v!=="object")a.push(`${k.replace(/_/g," ")}: ${v}`);if(a.length>=2)break}if(a.length)return a.join(" • ");
  }
  return "Signal generated from available performance, form, availability and data-quality factors.";
}

function render(s="ALL"){
  let a=s==="ALL"?all:all.filter(p=>String(val(p,["sport","Sport"],"")).toUpperCase()===s);
  if(!a.length){grid.innerHTML='<div class="empty">No predictions available for this sport right now.</div>';return}
  grid.innerHTML=a.map(p=>{
    let c=Number(val(p,["confidence","Confidence"],0));c=c<=1?Math.round(c*100):Math.round(c);
    let home=team(p,"home"),away=team(p,"away"),pick=val(p,["pick","Pick","prediction","Prediction","selection","Selection"],"Pending");
    return `<article class="card"><div class="cardtop"><span class="sport">${esc(String(val(p,["sport","Sport"],"SPORT")).toUpperCase())}</span><span class="status">${esc(val(p,["status","Status"],"PENDING"))}</span></div><div class="game">${esc(home)} <span>vs</span> ${esc(away)}</div>${gameMeta(p)?`<div class="meta">${esc(gameMeta(p))}</div>`:""}<div class="pickrow"><strong>${esc(pick)}</strong><span class="conf">${c}% confidence</span></div><div class="bar"><i style="width:${Math.max(0,Math.min(100,c))}%"></i></div><div class="why">${esc(reasons(p))}</div><div class="tags"><span class="tag">V24 PRO INTELLIGENCE</span><span class="tag">EXPLAINABLE</span></div></article>`
  }).join("")
}

async function json(url){const r=await fetch(url);if(!r.ok)throw new Error(`${r.status}`);return r.json()}

async function loadAll(){
  connection.textContent="Updating live data…";
  try{
    const [s,p,d,g]=await Promise.all([
      json(API+"/api/v24/status"),
      json(API+"/api/v24/predictions"),
      json(API+"/api/v24/dashboard"),
      json(API+"/api/v24/games")
    ]);
    gamesCache=unwrapRows(g,["games"]);
    games.textContent=val(s,["games"]);
    preds.textContent=val(s,["predictions"]);
    teams.textContent=val(s,["intelligenceTeams","teamsProfiled"]);
    all=unwrapRows(p,["predictions"]);
    render();
    record.textContent=`${val(d,["wins"],0)}-${val(d,["losses"],0)}-${val(d,["pushes"],0)}`;
    wins.textContent=val(d,["wins"],0);losses.textContent=val(d,["losses"],0);pushes.textContent=val(d,["pushes"],0);
    connection.textContent=`Live • ${all.length} predictions loaded`;
  }catch(e){
    console.error("SPORTS AI V2.2 load error",e);
    connection.textContent="Backend unavailable";
    grid.innerHTML='<div class="empty">The dashboard is online, but the live prediction service is temporarily unavailable.</div>';
  }
}

document.querySelectorAll("#filters button").forEach(b=>b.onclick=()=>{document.querySelectorAll("#filters button").forEach(x=>x.classList.remove("active"));b.classList.add("active");render(b.dataset.sport)});
date.textContent=new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});
function showPro(){modal.classList.add("show")}
function hidePro(){modal.classList.remove("show")}
function join(){const e=document.getElementById("email").value;if(e.includes("@"))msg.textContent="You're on the PRO waitlist."}
loadAll();
