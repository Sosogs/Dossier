/* ===== Ko-fi link (change if your page ever moves) ===== */
const KOFI_URL = "https://ko-fi.com/thedossier";

/* ===== translations ===== */
const T = {
  en: {
    navRecord: "The record", navCategories: "Categories", navSources: "Sources", navAbout: "About",
    support: "Support Dossier",
    eyebrow: "NON-PARTISAN GOVERNMENT RECORD",
    heroH1: 'Every move,<br><span class="grad">on the record.</span>',
    lede: "A neutral, searchable log of what the federal government actually does — bills, regulations, orders, spending, appointments and announcements — each written in plain language and linked to its source. Not opinion. Not a scorecard. The actions themselves.",
    mActionsL: "Actions logged", mAreasL: "Policy areas", mSourcesL: "Sources tracked", mCadenceL: "Refresh cadence", cadenceVal: "Every 6h",
    searchPh: "Search the record…", allTypes: "All action types", officialOnly: "Official only", allCats: "All",
    badgeOfficial: "Official · summary", badgeNews: "News · excerpt", sourceLink: "Source ↗",
    empty: "No actions match these filters. Clear the search or pick a different category.",
    footMethod: "<b>How this works.</b> Official records (Parliament, the Canada Gazette, orders-in-council, departmental releases, PBO and Library of Parliament reports) are summarized in plain language and linked. Journalism appears as headline + short excerpt + a link out to the original, never the full article. Items are logged as <b>actions</b>, not as promises kept or broken, and categorized by policy area. Neutrality lives in the wording: summaries describe what was done, not whether it was good.",
    supportH: "Independent & reader-supported",
    supportP: "Dossier takes no advertising and no party money. If it's useful to you, you can help keep it running — and free for everyone.",
    tagline: "Dossier · an independent, non-partisan public record",
    aboutKicker: "Why this exists", aboutH2: "A record, so you don't have to remember.",
    aboutBody: '<p class="lead">We carry a feeling about a government long after we\u2019ve forgotten what built it. Decisions and headlines arrive every single day; the impression settles in, but the specifics slip away. By the time it matters most \u2014 the next time you vote \u2014 you remember the mood, not the record.</p><p>Dossier is a data keeper. It gathers, in one place and in plain language, the actual moves a government makes \u2014 the bills, regulations, appointments, spending and announcements \u2014 each one filed by topic and linked to its source, so you can look back at the evidence instead of relying on memory.</p><p>Because democracy isn\u2019t only choosing a party and then stepping back to let them lead. It\u2019s watching what they do in between \u2014 steadily, on the record \u2014 so that the next choice you make is a genuinely informed one.</p><p>Life is full, and the demands on your attention are real. No one has time to track every decision. This is meant to carry that weight for you: a tool to help you gauge, not a test of what you can recall.</p>',
    aboutSign: "It takes no side. It keeps the record.",
    navAhead: "What\u2019s ahead",
    aheadKicker: "Dossier 2.0 \u00b7 in development",
    aheadH2: 'From record <span class="grad">to readout.</span>',
    aheadBody: '<p class="lead">Today, Dossier is a record: every federal action since March 14, 2025, logged in plain language and linked to its source. The next version adds the view from above.</p><p>Dossier 2.0 will turn thousands of individual entries into patterns you can take in at a glance \u2014 live charts that evolve as new actions arrive, tables you can sort and compare, and indicators that sum up where the government is putting its effort. Among the measures we\u2019re exploring:</p><ul class="ahead-list"><li><b>Focus over time</b> \u2014 how activity shifts between policy areas, month by month.</li><li><b>Platform alignment</b> \u2014 how the government\u2019s actions line up with the commitments in the governing party\u2019s 2025 election platform.</li><li><b>Policy spectrum</b> \u2014 where actions sit on the left\u2013centre\u2013right axis, updated as new entries arrive and measured with a published method.</li><li><b>Global benchmarks</b> \u2014 indicators modelled on those used to assess governments around the world.</li></ul><p>The principles don\u2019t change. Every figure will trace back to the entries behind it, every method will be published in full, and there will be no verdicts. We show the pattern; you draw the conclusion.</p>',
    aheadSign: "Same record. A wider lens."
  },
  fr: {
    navRecord: "Le registre", navCategories: "Catégories", navSources: "Sources", navAbout: "À propos",
    support: "Soutenir Dossier",
    eyebrow: "REGISTRE GOUVERNEMENTAL NON PARTISAN",
    heroH1: 'Chaque geste,<br><span class="grad">au dossier.</span>',
    lede: "Un registre neutre et consultable de ce que le gouvernement fédéral fait réellement — projets de loi, règlements, décrets, dépenses, nominations et annonces — chacun rédigé en langage clair et lié à sa source. Pas d'opinion. Pas de palmarès. Les actions elles-mêmes.",
    mActionsL: "Actions consignées", mAreasL: "Domaines", mSourcesL: "Sources suivies", mCadenceL: "Fréquence", cadenceVal: "Toutes les 6 h",
    searchPh: "Rechercher dans le registre…", allTypes: "Tous les types", officialOnly: "Officiel seulement", allCats: "Tout",
    badgeOfficial: "Officiel · résumé", badgeNews: "Nouvelles · extrait", sourceLink: "Source ↗",
    empty: "Aucune action ne correspond à ces filtres. Effacez la recherche ou choisissez une autre catégorie.",
    footMethod: "<b>Comment ça marche.</b> Les documents officiels (Parlement, Gazette du Canada, décrets, communiqués ministériels, rapports du DPB et de la Bibliothèque du Parlement) sont résumés en langage clair et liés. Le journalisme apparaît sous forme de titre + court extrait + lien vers l'original, jamais l'article complet. Les éléments sont consignés comme des <b>actions</b>, non comme des promesses tenues ou rompues, et classés par domaine. La neutralité tient à la formulation : les résumés décrivent ce qui a été fait, pas si c'était bien.",
    supportH: "Indépendant, financé par les lecteurs",
    supportP: "Dossier n'accepte ni publicité ni argent de parti. Si le site vous est utile, vous pouvez aider à le maintenir — et à le garder gratuit pour tous.",
    tagline: "Dossier · un registre public indépendant et non partisan",
    aboutKicker: "Pourquoi ce site existe", aboutH2: "Un registre, pour ne pas avoir à tout retenir.",
    aboutBody: '<p class="lead">On garde une impression d\u2019un gouvernement bien après avoir oublié ce qui l\u2019a façonnée. Les décisions et les manchettes arrivent chaque jour; l\u2019impression s\u2019installe, mais les détails s\u2019effacent. Au moment qui compte le plus \u2014 la prochaine fois que vous votez \u2014 vous vous souvenez de l\u2019humeur, pas du registre.</p><p>Dossier est un gardien de données. Il rassemble, en un seul endroit et en langage clair, les gestes concrets d\u2019un gouvernement \u2014 projets de loi, règlements, nominations, dépenses et annonces \u2014 chacun classé par thème et lié à sa source, pour que vous puissiez revoir les faits au lieu de vous fier à votre mémoire.</p><p>Parce que la démocratie ne consiste pas seulement à élire un parti puis à le laisser gouverner. C\u2019est observer ce qu\u2019il fait entre-temps \u2014 de façon constante, au registre \u2014 pour que votre prochain choix soit véritablement éclairé.</p><p>La vie est bien remplie et les sollicitations sont réelles. Personne n\u2019a le temps de suivre chaque décision. Ce site porte ce poids à votre place : un outil pour vous aider à juger, pas un test de ce dont vous vous souvenez.</p>',
    aboutSign: "Aucun parti pris. Seulement le registre.",
    navAhead: "\u00c0 venir",
    aheadKicker: "Dossier 2.0 \u00b7 en pr\u00e9paration",
    aheadH2: 'Du registre <span class="grad">\u00e0 la vue d\u2019ensemble.</span>',
    aheadBody: '<p class="lead">Aujourd\u2019hui, Dossier est un registre : chaque action f\u00e9d\u00e9rale depuis le 14 mars 2025, consign\u00e9e en langage clair et li\u00e9e \u00e0 sa source. La prochaine version y ajoute la vue d\u2019en haut.</p><p>Dossier 2.0 transformera des milliers d\u2019entr\u00e9es individuelles en tendances lisibles d\u2019un coup d\u2019\u0153il \u2014 des graphiques en direct qui \u00e9voluent au fil des nouvelles actions, des tableaux \u00e0 trier et \u00e0 comparer, et des indicateurs qui r\u00e9sument o\u00f9 le gouvernement concentre ses efforts. Parmi les mesures \u00e0 l\u2019\u00e9tude :</p><ul class="ahead-list"><li><b>Priorit\u00e9s dans le temps</b> \u2014 comment l\u2019activit\u00e9 se d\u00e9place d\u2019un domaine \u00e0 l\u2019autre, mois apr\u00e8s mois.</li><li><b>Concordance avec la plateforme</b> \u2014 dans quelle mesure les actions du gouvernement correspondent aux engagements de la plateforme \u00e9lectorale 2025 du parti au pouvoir.</li><li><b>Spectre politique</b> \u2014 o\u00f9 se situent les actions sur l\u2019axe gauche\u2013centre\u2013droite, mis \u00e0 jour au fil des nouvelles entr\u00e9es et mesur\u00e9 selon une m\u00e9thode publi\u00e9e.</li><li><b>Rep\u00e8res internationaux</b> \u2014 des indicateurs inspir\u00e9s de ceux qui servent \u00e0 \u00e9valuer les gouvernements partout dans le monde.</li></ul><p>Les principes, eux, ne changent pas. Chaque chiffre renverra aux entr\u00e9es qui le fondent, chaque m\u00e9thode sera publi\u00e9e int\u00e9gralement, et il n\u2019y aura pas de verdict. Nous montrons la tendance; \u00e0 vous d\u2019en tirer les conclusions.</p>',
    aheadSign: "Le m\u00eame registre. Un regard plus large."
  }
};

/* ===== taxonomy (fallback; real labels come from categories.json) ===== */
const DEFAULT_TAX = {
  categories: [
    {en:"Foreign affairs",fr:"Affaires étrangères"},{en:"National defence",fr:"Défense nationale"},
    {en:"Culture & heritage",fr:"Culture et patrimoine"},{en:"Economy",fr:"Économie"},
    {en:"Intergovernmental affairs",fr:"Affaires intergouvernementales"},{en:"Healthcare",fr:"Santé"},
    {en:"Education",fr:"Éducation"},{en:"Sustainable development",fr:"Développement durable"},
    {en:"Infrastructure",fr:"Infrastructure"},{en:"Housing",fr:"Logement"},
    {en:"Natural resources",fr:"Ressources naturelles"},{en:"Wildlife",fr:"Faune"},
    {en:"Animal welfare",fr:"Bien-être animal"},{en:"Transportation",fr:"Transports"},
    {en:"Indigenous services",fr:"Services aux Autochtones"},{en:"Justice",fr:"Justice"},
    {en:"Finance",fr:"Finances"},{en:"Innovation, science & industry",fr:"Innovation, sciences et industrie"},
    {en:"Public safety",fr:"Sécurité publique"}
  ],
  types: [
    {en:"Bill",fr:"Projet de loi"},{en:"Regulation",fr:"Règlement"},{en:"Order in council",fr:"Décret"},
    {en:"Spending",fr:"Dépenses"},{en:"Appointment",fr:"Nomination"},{en:"International agreement",fr:"Accord international"},
    {en:"Commons vote",fr:"Vote aux Communes"},{en:"Report",fr:"Rapport"},{en:"Announcement",fr:"Annonce"}
  ]
};
let CATEGORIES = DEFAULT_TAX.categories.slice();
let TYPES = DEFAULT_TAX.types.slice();
let CAT_HUE = {};
function computeHues(){ CAT_HUE = Object.fromEntries(CATEGORIES.map((c,i)=>[c.en, Math.round((i*360/Math.max(CATEGORIES.length,1)+12)%360)])); }
const catColor = n => `hsl(${CAT_HUE[n] ?? 230} 72% 64%)`;
function catLabel(en){ const c = CATEGORIES.find(x=>x.en===en); return c ? (c[LANG]||c.en) : en; }
function typeLabel(en){ const t = TYPES.find(x=>x.en===en); return t ? (t[LANG]||t.en) : en; }

/* ===== language ===== */
function detectLang(){
  try { const s = localStorage.getItem("dossier-lang"); if (s==="en"||s==="fr") return s; } catch(e){}
  return (navigator.language || "en").toLowerCase().startsWith("fr") ? "fr" : "en";
}
let LANG = detectLang();
function applyLang(){
  const t = T[LANG];
  document.documentElement.lang = LANG;
  document.querySelectorAll("[data-i18n]").forEach(el=>{ const k=el.dataset.i18n; if(t[k]!==undefined) el.textContent=t[k]; });
  document.querySelectorAll("[data-i18n-ph]").forEach(el=>{ const k=el.dataset.i18nPh; if(t[k]!==undefined) el.placeholder=t[k]; });
  document.querySelectorAll("[data-i18n-html]").forEach(el=>{ const k=el.dataset.i18nHtml; if(t[k]!==undefined) el.innerHTML=t[k]; });
  document.querySelectorAll(".lang-toggle span").forEach(s=>s.classList.toggle("on", s.dataset.l===LANG));
}
function switchLang(l){ if(l===LANG) return; LANG=l; try{ localStorage.setItem("dossier-lang",l);}catch(e){} shown = PAGE_SIZE; applyLang(); buildChips(); buildTypes(); render(); }

/* ===== state ===== */
let MOVES = [];
let TOTALS = null;
let archiveLoaded = false, archiveLoading = false;
let activeCat = "All", activeType = "All", officialOnly = false, query = "";
const PAGE_SIZE = 60;
let shown = PAGE_SIZE;

const $ = s => document.querySelector(s);
const grid = () => $("#grid"), countEl = () => $("#count");
function esc(s){ return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])); }
function safeUrl(u){ const s=String(u||"").trim(); return /^https?:\/\//i.test(s) ? s : "#"; }
function fmtDate(d){ try{ return new Date(d+"T12:00:00").toLocaleDateString(LANG==="fr"?"fr-CA":"en-CA",{month:"short",day:"numeric"}); }catch(e){ return d; } }

function buildChips(){
  const t = T[LANG];
  const chips = $("#chips");
  const all = [{en:"All"}, ...CATEGORIES];
  chips.innerHTML = all.map(c=>{
    const name = c.en;
    const label = name==="All" ? t.allCats : catLabel(name);
    const dot = name==="All" ? "" : `<span class="cd" style="background:${catColor(name)}"></span>`;
    return `<button class="chip${name===activeCat?' active':''}" data-cat="${esc(name)}">${dot}${esc(label)}</button>`;
  }).join("");
  chips.querySelectorAll(".chip").forEach(el=>el.onclick=()=>{
    activeCat = (el.dataset.cat===activeCat && activeCat!=="All") ? "All" : el.dataset.cat; shown = PAGE_SIZE; ensureArchive();
    buildChips(); render();
  });
}
function buildTypes(){
  const t = T[LANG];
  const sel = $("#typeSel");
  sel.innerHTML = [{en:"All"}, ...TYPES].map(o=>`<option value="${esc(o.en)}">${o.en==="All"?esc(t.allTypes):esc(typeLabel(o.en))}</option>`).join("");
  sel.value = activeType;
  sel.onchange = ()=>{ activeType = sel.value; shown = PAGE_SIZE; ensureArchive(); render(); };
}

function card(m){
  const t = T[LANG];
  const c = catColor(m.cat);
  const body = m.kind==="news" ? `<p class="excerpt">${esc(m.excerpt)}</p>` : `<p>${esc(m.sum)}</p>`;
  const badge = m.kind==="news" ? `<span class="badge news">${esc(t.badgeNews)}</span>` : `<span class="badge official">${esc(t.badgeOfficial)}</span>`;
  return `<article class="card">
    <div class="rec"><span class="type">${esc(typeLabel(m.type))}</span><span class="sep">·</span><span>${fmtDate(m.date)}</span></div>
    <span class="cat" style="color:${c};background:hsla(${CAT_HUE[m.cat] ?? 230} 72% 64% / .12)"><span class="cd" style="background:${c}"></span>${esc(catLabel(m.cat))}</span>
    <h3>${esc(m.title)}</h3>
    ${body}
    <div class="src"><span class="from">${badge} · ${esc(m.src)}</span><a href="${esc(safeUrl(m.url))}" target="_blank" rel="noopener noreferrer">${esc(t.sourceLink)}</a></div>
  </article>`;
}

function render(){
  const t = T[LANG];
  const q = query.trim().toLowerCase();
  const langItems = MOVES.filter(m => (m.lang||"en")===LANG);
  const rows = langItems.filter(m=>{
    if(activeCat!=="All" && m.cat!==activeCat) return false;
    if(activeType!=="All" && m.type!==activeType) return false;
    if(officialOnly && m.kind!=="official") return false;
    if(q){
      const hay = (m.title+" "+(m.sum||"")+" "+(m.excerpt||"")+" "+m.src+" "+catLabel(m.cat)).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  }).sort((a,b)=> (b.date||"").localeCompare(a.date||""));

  countEl().textContent = `${rows.length} action${rows.length===1?"":"s"}` + (archiveLoading ? (LANG==="fr" ? " · chargement du registre complet…" : " · loading full record…") : "");
  const page = rows.slice(0, shown);
  grid().innerHTML = page.length ? page.map(card).join("") : `<div class="empty">${esc(t.empty)}</div>`;
  const lm = $("#loadMore");
  if (rows.length > shown) { lm.hidden = false; lm.textContent = (LANG==="fr" ? "Afficher plus" : "Load more") + ` (${(rows.length - shown).toLocaleString(LANG==="fr"?"fr-CA":"en-CA")})`; }
  else { lm.hidden = true; }

  const loc = LANG==="fr" ? "fr-CA" : "en-CA";
  const tl = TOTALS && TOTALS[LANG];
  $("#m-actions").textContent = (tl ? tl.actions : langItems.length).toLocaleString(loc);
  $("#m-cats").textContent = CATEGORIES.length;
  $("#m-sources").textContent = (tl ? tl.sources : new Set(langItems.map(m=>m.src)).size) || "—";
}

/* ===== init ===== */
computeHues(); applyLang(); buildChips(); buildTypes(); render();

$("#q").oninput = e=>{ query = e.target.value; shown = PAGE_SIZE; ensureArchive(); render(); };
$("#ooBtn").onclick = ()=>{ officialOnly = !officialOnly; $("#ooBtn").classList.toggle("active", officialOnly); shown = PAGE_SIZE; ensureArchive(); render(); };
$("#loadMore").onclick = ()=>{ shown += PAGE_SIZE; ensureArchive(); render(); };
document.querySelectorAll(".lang-toggle span").forEach(s=> s.onclick = ()=> switchLang(s.dataset.l));

const aboutModal = $("#aboutModal");
$("#aboutBtn").onclick = ()=> aboutModal.showModal();
$("#aboutClose").onclick = ()=> aboutModal.close();
aboutModal.addEventListener("click", e=>{ if(e.target===aboutModal) aboutModal.close(); });
const aheadModal = $("#aheadModal");
$("#aheadBtn").onclick = ()=> aheadModal.showModal();
$("#aheadClose").onclick = ()=> aheadModal.close();
aheadModal.addEventListener("click", e=>{ if(e.target===aheadModal) aheadModal.close(); });
document.querySelectorAll(".kofi-link").forEach(a=> a.href = KOFI_URL);

async function ensureArchive(){
  if (archiveLoaded || archiveLoading) return;
  archiveLoading = true; render();
  try{
    const r = await fetch("data.json", { cache:"no-store" });
    const d = await r.json();
    if (Array.isArray(d.items)){
      const have = new Set(MOVES.map(m=>m.id));
      for (const it of d.items) if (!have.has(it.id)) MOVES.push(it);
    }
    archiveLoaded = true;
  }catch(e){ /* archive stays unloaded; recent still works */ }
  archiveLoading = false; render();
}

async function boot(){
  try{
    const r = await fetch("categories.json", { cache:"no-store" });
    const c = await r.json();
    const norm = x => typeof x==="string" ? {en:x, fr:x} : x;
    if(Array.isArray(c.categories) && c.categories.length) CATEGORIES = c.categories.map(norm);
    if(Array.isArray(c.types) && c.types.length) TYPES = c.types.map(norm);
  }catch(e){}
  computeHues();
  try{
    const r = await fetch("recent.json", { cache:"no-store" });
    const d = await r.json();
    if(Array.isArray(d.items)) MOVES = d.items;
    if(d.totals) TOTALS = d.totals;
  }catch(e){
    try{ const r = await fetch("data.json", { cache:"no-store" }); const d = await r.json(); if(Array.isArray(d.items)) MOVES = d.items; archiveLoaded = true; }catch(e2){}
  }
  applyLang(); buildChips(); buildTypes(); render();
}
boot();
