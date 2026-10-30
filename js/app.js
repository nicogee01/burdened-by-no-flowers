(() => {
  "use strict";
  const D = window.SITE_DATA;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const f0 = (n) => Math.round(n).toLocaleString();
  const sgn = (n, d = 1) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(d);
  const pct = (p) => (p >= 0.995 && p < 1 ? ">99" : p > 0 && p < 0.005 ? "<1" : Math.round(p * 100)) + "%";
  const ord = (n) => n + (["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");

  const mine = D.seasons.filter((s) => s.myRid);
  const cur = D.seasons[D.seasons.length - 1];
  const tm = (s, rid) => s.teams.find((t) => t.rid === +rid);
  const me = (s) => tm(s, s.myRid);
  const avatar = (t) => (t && t.avatar ? `<img class="av" src="${esc(t.avatar)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'av'}))">` : `<span class="av"></span>`);
  const tname = (t) => `<span class="tname">${avatar(t)}<span>${esc(t ? t.name : "?")}</span></span>`;
  const rankBy = (s, key, rid, desc = true) => 1 + s.teams.filter((t) => (desc ? t[key] > tm(s, rid)[key] : t[key] < tm(s, rid)[key])).length;

  // ---------- reveal ----------
  const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" }) : null;
  function observe() { document.querySelectorAll(".reveal:not(.in)").forEach((el) => (io ? io.observe(el) : el.classList.add("in"))); }

  // ---------- tooltip ----------
  const tip = $("#tip");
  function showTip(html, e) {
    tip.innerHTML = html; tip.hidden = false;
    const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    const y = Math.min(e.clientY + 14, window.innerHeight - tip.offsetHeight - 8);
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  document.addEventListener("pointermove", (e) => {
    const el = e.target.closest("[data-tip]");
    if (el) showTip(el.getAttribute("data-tip"), e); else tip.hidden = true;
  });

  // ---------- nav ----------
  const nav = $("#nav");
  let page = "home";
  const onScroll = () => nav.classList.toggle("is-solid", page !== "home" || window.scrollY > 40);
  window.addEventListener("scroll", onScroll, { passive: true });

  // ---------- tabs: #/page or #/page/anchor ----------
  const PAGES = ["home", "luck", "race", "trades", "keepers"];
  const LEGACY = { case: "luck", weeks: "luck", pace: "luck", road: "race", byes: "race", trades: "trades", top: "home" };
  let lastSub = null;
  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    let [p, anchor] = h.split("/");
    if (LEGACY[p]) { anchor = p; p = LEGACY[p]; }
    if (!PAGES.includes(p)) p = "home";
    const changed = p !== page;
    page = p;
    document.querySelectorAll(".page").forEach((el) => (el.hidden = el.dataset.page !== p));
    document.querySelectorAll("#navLinks a").forEach((a) => (a.dataset.tab === p ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    document.title = p === "home" ? "Burdened by No Flowers" : `${document.querySelector(`#navLinks a[data-tab="${p}"]`).firstChild.textContent.trim()} · Burdened by No Flowers`;
    onScroll();
    // sub-tabs: #/page/sub, or #/page/element-id (shows the sub-tab that holds it)
    const pageEl = document.querySelector(`.page[data-page="${p}"]`);
    const subs = [...pageEl.querySelectorAll(":scope > .sub")];
    let target = null, subKey = null;
    if (subs.length) {
      if (anchor && subs.some((x) => x.dataset.sub === anchor)) subKey = anchor;
      else if (anchor && document.getElementById(anchor)) { target = document.getElementById(anchor); subKey = target.closest(".sub")?.dataset.sub; }
      subKey = subKey || subs[0].dataset.sub;
      subs.forEach((x) => (x.hidden = x.dataset.sub !== subKey));
      pageEl.querySelectorAll(".subnav a").forEach((a) => (a.dataset.sub === subKey ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    } else if (anchor) target = document.getElementById(anchor);
    const subChanged = subKey !== lastSub; lastSub = subKey;
    const nav2 = pageEl.querySelector(".subnav");
    if (target) requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    else if (changed) window.scrollTo(0, 0);
    else if (subChanged && nav2 && nav2.getBoundingClientRect().top < 0) requestAnimationFrame(() => nav2.scrollIntoView({ block: "start" }));
    if (changed) { const h1 = document.querySelector(`.page[data-page="${p}"] h1`); if (h1) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); } }
    document.dispatchEvent(new CustomEvent("pagechange", { detail: p }));
    requestAnimationFrame(() => observe());
  }
  window.addEventListener("hashchange", route);

  // ---------- derived luck stats ----------
  function seasonStats(s) {
    const m = me(s), log = s.myLog;
    const losses = log.filter((g) => g.pts < g.oppPts);
    return {
      m, log, losses,
      pfRank: rankBy(s, "pf", s.myRid), paRank: rankBy(s, "pa", s.myRid),
      apw: m.apw, apl: m.apl,
      aboveMedLosses: losses.filter((g) => g.pts > g.median).length,
      topOppWeeks: log.filter((g) => g.oppRank === 1).length,
      heat: log.reduce((a, g) => a + (g.oppPts - (g.oppAvgElse ?? g.oppPts)), 0) / (log.length || 1),
      heatTotal: log.reduce((a, g) => a + (g.oppPts - (g.oppAvgElse ?? g.oppPts)), 0),
      swapBetter: Object.entries(s.swap[s.myRid]).filter(([rid, r]) => +rid !== s.myRid && r[0] > m.w).length,
      bestSwap: Math.max(...Object.entries(s.swap[s.myRid]).filter(([rid]) => +rid !== s.myRid).map(([, r]) => r[0])),
      luckRank: 1 + s.teams.filter((t) => t.luck < m.luck).length,
    };
  }
  const S = Object.fromEntries(mine.map((s) => [s.season, seasonStats(s)]));
  const C = S[cur.season];
  const allLog = mine.flatMap((s) => s.myLog.map((g) => ({ ...g, season: s.season })));
  const totW = mine.reduce((a, s) => a + me(s).w, 0), totL = mine.reduce((a, s) => a + me(s).l, 0);
  const totXW = mine.reduce((a, s) => a + me(s).xw, 0);
  const totAPW = mine.reduce((a, s) => a + me(s).apw, 0), totAPL = mine.reduce((a, s) => a + me(s).apl, 0);

  // ---------- hero ----------
  (function hero() {
    const m = C.m;
    $("#heroEyebrow").textContent = `${cur.name} · ${cur.divisions[m.div]} · ${cur.season} week ${cur.weeksDone}`;
    $("#heroTitle").innerHTML = `<span class="line"><span>${m.w}&ndash;${m.l}.</span></span><span class="line"><span><em>No flowers.</em></span></span>`;
    $("#heroSub").textContent = `${m.name} has scored ${f0(m.pf)} points in ${cur.season}, ${C.pfRank === 1 ? "the most in the league" : `${ord(C.pfRank)} in the league`}, and has had ${f0(m.pa)} scored against it, ${C.paRank === 1 ? (C.pfRank === 1 ? "also the most in the league" : "the most in the league") : `${ord(C.paRank)}-most in the league`}. This site exists so its manager can prove they are not going insane.`;
    $("#sbSeason").textContent = `${cur.season} season · through week ${cur.weeksDone}`;
    $("#sbGrid").innerHTML = [
      ["Record", `${m.w}–${m.l}`, "bad"],
      ["All-play", `${m.apw}–${m.apl}`, "good"],
      ["Points for", `${f1(m.pf)}<small>${ord(C.pfRank)}</small>`, "good"],
      ["Points against", `${f1(m.pa)}<small>${ord(C.paRank)}</small>`, "bad"],
      ["Expected wins", `${f1(m.xw)}`, ""],
      ["Wins stolen", `${f1(-m.luck)}`, "bad"],
    ].map(([k, v, c]) => `<div><dt>${k}</dt><dd class="${c}">${v}</dd></div>`).join("");
    $("#sbFoot").textContent = `Across two seasons: ${totW}–${totL} actual, ${totAPW}–${totAPL} against the whole league.`;
  })();

  // ---------- ticker ----------
  (function ticker() {
    const facts = [];
    mine.forEach((s) => {
      s.myLog.forEach((g) => {
        const o = tm(s, g.opp);
        if (g.pts < g.oppPts && g.beat >= 7) facts.push(`${s.season} wk ${g.week}: scored ${f1(g.pts)}, beat ${g.beat} of 9 teams, lost to ${o.name} (${f1(g.oppPts)})`);
        if (g.oppAvgElse && g.oppPts - g.oppAvgElse > 30) facts.push(`${s.season} wk ${g.week}: ${o.name} went ${sgn(g.oppPts - g.oppAvgElse)} over their average against you`);
      });
    });
    facts.push(`All-time all-play: ${totAPW}–${totAPL}. Actual: ${totW}–${totL}.`);
    facts.push(`${C.swapBetter} of 9 other teams' schedules would give you a better ${cur.season} record`);
    const html = facts.map((f) => `<span>${esc(f)}</span>`).join("");
    $("#ticker").innerHTML = html + html;
  })();

  // ---------- case file ----------
  (function caseFile() {
    const m = C.m;
    const lossesTop3 = C.losses.filter((g) => g.rank <= 3).length;
    const hero = `<article class="card card--hero">
      <div><p class="card__k">${cur.season} record</p><p class="card__v bad">${m.w}–${m.l}</p><p class="card__t">The scoreboard says this.</p></div>
      <div><p class="card__k">${cur.season} expected record</p><p class="card__v good">${f1(m.xw)}–${f1(cur.weeksDone - m.xw)}</p><p class="card__t">Your scores against the whole league say this.</p></div>
      <div><p class="card__k">Luck rank</p><p class="card__v ${C.luckRank === 1 ? "bad" : ""}">${ord(C.luckRank)}<small>of 10</small></p><p class="card__t">${C.luckRank === 1 ? "Unluckiest team in the league." : `${C.luckRank - 1} team${C.luckRank === 2 ? " is" : "s are"} unluckier.`} ${f1(-m.luck)} wins below expectation.</p></div>
    </article>`;
    const cards = [
      ["red", "Losses while outscoring most of the league", `${C.aboveMedLosses}<small>of ${C.losses.length} losses</small>`,
        `In ${cur.season} you've lost ${C.losses.length} times. In ${C.aboveMedLosses} of them you scored above the league median${lossesTop3 ? `, and ${lossesTop3} came with a top-3 weekly score` : ""}.`],
      ["red", "Opponents who had the week's top score", `${C.topOppWeeks}<small>of ${cur.weeksDone} weeks</small>`,
        `The highest score in the whole league has come against you ${C.topOppWeeks} time${C.topOppWeeks === 1 ? "" : "s"} this season. With 9 possible opponents, you'd expect about ${f1(cur.weeksDone / 9)}.`],
      ["red", "The heater effect", `${sgn(C.heat)}<small>pts / game</small>`,
        `On average, opponents score ${f1(C.heat)} more against you than they do in their other games. That's ${f0(C.heatTotal)} extra points this season.`],
      ["", "Better on someone else's schedule", `${C.swapBetter}<small>of 9 schedules</small>`,
        `Give your exact scores to any of ${C.swapBetter} other teams' schedules and your record improves, as high as ${C.bestSwap}–${cur.weeksDone - C.bestSwap}.`],
      ["gold", "Two-season all-play", `${totAPW}–${totAPL}<small>${f1((totAPW / (totAPW + totAPL)) * 100)}%</small>`,
        `Against every team, every week, you've been a ${f1((totAPW / (totAPW + totAPL)) * 100)}% team. Your actual record is ${totW}–${totL} (${f1((totW / (totW + totL)) * 100)}%). Expected: ${f1(totXW)} wins.`],
    ];
    const last = mine.find((s) => s.season !== cur.season);
    if (last) {
      const ls = S[last.season], lm = ls.m, fin = last.finish[last.myRid];
      const semis = last.myPlayoffs.find((g) => !g.won);
      cards.push(["gold", `${last.season}: ${lm.name.trim()}`, `${lm.w}–${lm.l}<small>${ord(ls.pfRank)} in PF</small>`,
        `Scored the ${ord(ls.pfRank)}-most points and finished .500. ${fin ? `Still clawed to a ${ord(fin)}-place finish` : ""}${semis ? `, after a ${f1(semis.pts)}–${f1(semis.oppPts)} loss to ${tm(last, semis.opp).name.trim()} in the ${semis.label.toLowerCase().startsWith("round") ? "semifinal" : semis.label}` : ""}.`]);
    }
    $("#caseCards").innerHTML = hero + cards.map(([c, k, v, t]) => `<article class="card ${c ? "card--" + c : ""} reveal"><p class="card__k">${k}</p><p class="card__v">${v}</p><p class="card__t">${esc(t)}</p></article>`).join("");
  })();

  // ---------- points-against pace ----------
  (function pace() {
    const live = cur.status !== "complete" && cur.weeksDone > 0 && cur.weeksDone < cur.regEnd;
    const rows = D.seasons.filter((s) => s.weeksDone).flatMap((s) => s.teams.map((t) => {
      const partial = s.weeksDone < s.regEnd;
      return { s, t, pa: partial ? (t.pa / s.weeksDone) * s.regEnd : t.pa, partial, mine: t.owner === D.me };
    }));
    const complete = rows.filter((r) => !r.partial).sort((a, b) => b.pa - a.pa);
    const rec = complete[0];
    const myCur = rows.find((r) => r.s === cur && r.mine);
    if (!rec || !myCur) { $("#pace").hidden = true; return; }
    const perG = myCur.t.pa / cur.weeksDone, recPerG = rec.pa / rec.s.regEnd;
    const over = myCur.pa - rec.pa;
    $("#paceTitle").textContent = live
      ? (over > 0 ? `On pace to break the league record by ${f0(over)}` : `On pace for ${f0(myCur.pa)} points against`)
      : `${f0(myCur.pa)} points against`;
    $("#paceStats").innerHTML = [
      ["Against you so far", f1(myCur.t.pa), `${cur.weeksDone} games · ${ord(rankBy(cur, "pa", cur.myRid))} in the league`, "bad"],
      ["Per game", f1(perG), `record pace is ${f1(recPerG)}/game`, "bad"],
      [live ? "On pace for" : "Final", f0(myCur.pa), live ? `over ${cur.regEnd} weeks` : "regular season", "bad"],
      ["League record", f0(rec.pa), `${esc(rec.t.name)}, ${rec.s.season}`, "good"],
    ].map(([k, v, d, c]) => `<div><dt>${k}</dt><dd class="${c}">${v}</dd><p>${d}</p></div>`).join("");

    // leaderboard: top 10 completed seasons, plus your pace and any other pace above the record
    const board = [...complete.slice(0, 10), ...rows.filter((r) => r.partial && (r.mine || r.pa >= rec.pa))].sort((a, b) => b.pa - a.pa);
    const max = board[0].pa;
    $("#paceChart").innerHTML = `<ol class="paceboard">${board.map((r, i) => {
      const cls = r.partial && r.mine ? "is-me" : r === rec ? "is-rec" : r.partial ? "is-pace" : "";
      return `<li class="${cls}" data-tip="${esc(`<b>${r.t.name}</b><br>${r.s.season} · ${r.partial ? `on pace (${f1(r.t.pa)} through ${r.s.weeksDone} weeks)` : "final regular season"}<br>${f1(r.pa / r.s.regEnd)} per game`)}">
        <span class="paceboard__n">${i + 1}</span>
        <span class="paceboard__name">${esc(r.t.name)} <small>${r.s.season}${r.partial ? " · pace" : ""}${r === rec ? " · record" : ""}</small></span>
        <span class="paceboard__bar"><i style="width:${(r.pa / max) * 100}%"></i></span>
        <span class="paceboard__v">${f0(r.pa)}</span></li>`;
    }).join("")}</ol>`;

    // biggest single games against, regular season
    const games = D.seasons.flatMap((s) => s.weeks.flatMap((wk, i) => Object.entries(wk).map(([rid, v]) => ({ s, week: i + 1, victim: tm(s, rid), scorer: tm(s, v.opp), pts: wk[v.opp].pts, won: v.pts > wk[v.opp].pts }))))
      .sort((a, b) => b.pts - a.pts).slice(0, 8);
    $("#paceGames").innerHTML = `<ol class="paceboard paceboard--games">${games.map((g, i) => `<li class="${g.victim.owner === D.me ? "is-me" : ""}">
        <span class="paceboard__n">${i + 1}</span>
        <span class="paceboard__name">${esc(g.scorer.name)} <small>vs ${esc(g.victim.name)} · ${g.s.season} wk ${g.week}${g.won ? " · still lost" : ""}</small></span>
        <span class="paceboard__v">${f1(g.pts)}</span></li>`).join("")}</ol>
      <p class="panel__note">${games.filter((g) => g.victim.owner === D.me).length ? `<b>${games.filter((g) => g.victim.owner === D.me).length} of the top ${games.length}</b> were scored against you.` : "None of these were against you. Small mercies."}</p>`;
  })();

  // ---------- points-for pace ----------
  (function pfPace() {
    const live = cur.status !== "complete" && cur.weeksDone > 0 && cur.weeksDone < cur.regEnd;
    const rows = D.seasons.filter((s) => s.weeksDone).flatMap((s) => s.teams.map((t) => {
      const partial = s.weeksDone < s.regEnd;
      return { s, t, pf: partial ? (t.pf / s.weeksDone) * s.regEnd : t.pf, partial, mine: t.owner === D.me };
    }));
    const complete = rows.filter((r) => !r.partial).sort((a, b) => b.pf - a.pf);
    const rec = complete[0];
    const myCur = rows.find((r) => r.s === cur && r.mine);
    if (!rec || !myCur) { $("#pfPace").hidden = true; return; }
    const perG = myCur.t.pf / cur.weeksDone, recPerG = rec.pf / rec.s.regEnd;
    const over = myCur.pf - rec.pf;
    const leader = rows.filter((r) => r.s === cur).sort((a, b) => b.pf - a.pf)[0];
    $("#pfTitle").textContent = live
      ? (over > 0 ? `On pace to break the league record by ${f0(over)}` : `On pace for ${f0(myCur.pf)} points, ${f0(-over)} short of the record`)
      : `${f0(myCur.pf)} points scored`;
    $("#pfStats").innerHTML = [
      ["Scored so far", f1(myCur.t.pf), `${cur.weeksDone} games · ${ord(rankBy(cur, "pf", cur.myRid))} in the league`, "good"],
      ["Per game", f1(perG), `record pace is ${f1(recPerG)}/game`, perG >= recPerG ? "good" : ""],
      [live ? "On pace for" : "Final", f0(myCur.pf), live ? `over ${cur.regEnd} weeks` : "regular season", over > 0 ? "good" : ""],
      ["League record", f0(rec.pf), `${esc(rec.t.name)}, ${rec.s.season} (${rec.t.w}–${rec.t.l})`, "good"],
    ].map(([k, v, d, c]) => `<div><dt>${k}</dt><dd class="${c}">${v}</dd><p>${d}</p></div>`).join("");

    const board = [...complete.slice(0, 10), ...rows.filter((r) => r.partial && (r.mine || r.pf >= rec.pf))].sort((a, b) => b.pf - a.pf);
    const max = board[0].pf;
    $("#pfChart").innerHTML = `<ol class="paceboard">${board.map((r, i) => {
      const cls = r.partial && r.mine ? "is-me" : r === rec ? "is-rec" : r.partial ? "is-pace" : "";
      const rec_ = r.partial ? (r.t.w + r.t.l ? `${r.t.w}–${r.t.l} so far` : "") : `went ${r.t.w}–${r.t.l}`;
      return `<li class="${cls}" data-tip="${esc(`<b>${r.t.name}</b><br>${r.s.season} · ${r.partial ? `on pace (${f1(r.t.pf)} through ${r.s.weeksDone} weeks)` : "final regular season"}<br>${f1(r.pf / r.s.regEnd)} per game · ${rec_}`)}">
        <span class="paceboard__n">${i + 1}</span>
        <span class="paceboard__name">${esc(r.t.name)} <small>${r.s.season}${r.partial ? " · pace" : ""}${r === rec ? " · record" : ""} · ${rec_}</small></span>
        <span class="paceboard__bar"><i style="width:${(r.pf / max) * 100}%"></i></span>
        <span class="paceboard__v">${f0(r.pf)}</span></li>`;
    }).join("")}</ol>`;

    // biggest single-game scores, regular season, with whether the scorer still lost
    const games = D.seasons.flatMap((s) => s.weeks.flatMap((wk, i) => Object.entries(wk).map(([rid, v]) => ({ s, week: i + 1, scorer: tm(s, rid), opp: tm(s, v.opp), pts: v.pts, oppPts: wk[v.opp].pts }))))
      .sort((a, b) => b.pts - a.pts).slice(0, 8);
    const mineTop = games.filter((g) => g.scorer.owner === D.me);
    $("#pfGames").innerHTML = `<ol class="paceboard paceboard--games">${games.map((g, i) => `<li class="${g.scorer.owner === D.me ? "is-me" : ""}">
        <span class="paceboard__n">${i + 1}</span>
        <span class="paceboard__name">${esc(g.scorer.name)} <small>vs ${esc(g.opp.name)} · ${g.s.season} wk ${g.week}${g.pts < g.oppPts ? " · and lost" : ""}</small></span>
        <span class="paceboard__v">${f1(g.pts)}</span></li>`).join("")}</ol>
      <p class="panel__note">${mineTop.length ? `<b>${mineTop.length} of the top ${games.length}</b> are yours.` : "None of these are yours yet."}</p>`;

    // the punchline: both records at once
    const paMine = (myCur.t.pa / cur.weeksDone) * cur.regEnd;
    const paRec = Math.max(...rows.filter((r) => !r.partial).map((r) => r.t.pa));
    const both = live && over > 0 && paMine > paRec;
    $("#pfNote").innerHTML = live
      ? `${myCur.t.name} is ${ord(rankBy(cur, "pf", cur.myRid))} in points this season${leader.t.rid !== myCur.t.rid ? ` (${esc(leader.t.name)} leads, on pace for ${f0(leader.pf)})` : ""} and ${myCur.t.w}–${myCur.t.l}. ${both ? "<b>On pace to set the league record for points scored and points allowed in the same season.</b>" : over > 0 ? "On pace for the scoring record while losing anyway." : `Needs ${f1((rec.pf - myCur.t.pf) / Math.max(cur.regEnd - cur.weeksDone, 1))} a game the rest of the way to break the record.`}`
      : "";
  })();

  // ---------- week chart ----------
  let chartSeason = cur.season;
  function weekChart() {
    const s = mine.find((x) => x.season === chartSeason), log = s.myLog;
    const W = Math.max(560, log.length * 68 + 60), H = 330, pad = { l: 40, r: 12, t: 16, b: 64 };
    const max = Math.ceil(Math.max(...log.flatMap((g) => [g.pts, g.oppPts])) / 25) * 25;
    const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
    const step = (W - pad.l - pad.r) / log.length, bw = Math.min(22, step * 0.32);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly scores for ${s.season}">`;
    for (let v = 0; v <= max; v += 25) {
      svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(11,31,58,${v ? 0.08 : 0.4})"/>`;
      if (v % 50 === 0) svg += `<text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="#5b6577">${v}</text>`;
    }
    log.forEach((g, i) => {
      const cx = pad.l + step * i + step / 2, won = g.pts > g.oppPts, o = tm(s, g.opp);
      const t = `<b>Week ${g.week} · ${won ? "Win" : "Loss"}</b><br>You ${f1(g.pts)} (${ord(g.rank)} of 10)<br>${esc(o.name)} ${f1(g.oppPts)} (${ord(g.oppRank)})<br>League median ${f1(g.median)}<br>You'd have beaten ${g.beat} of 9 teams`;
      if (!won && g.pts > g.median) svg += `<rect x="${cx - step / 2 + 3}" y="${pad.t}" width="${step - 6}" height="${H - pad.t - pad.b}" fill="rgba(200,16,46,0.07)" rx="6"/>`;
      svg += `<rect x="${cx - bw - 1}" y="${y(g.pts)}" width="${bw}" height="${y(0) - y(g.pts)}" fill="#0b1f3a" rx="3"/>`;
      svg += `<rect x="${cx + 1}" y="${y(g.oppPts)}" width="${bw}" height="${y(0) - y(g.oppPts)}" fill="${won ? "#c4b48f" : "#c8102e"}" rx="3"/>`;
      svg += `<line x1="${cx - bw - 6}" x2="${cx + bw + 6}" y1="${y(g.median)}" y2="${y(g.median)}" stroke="#8a6a24" stroke-width="3" stroke-linecap="round"/>`;
      svg += `<text x="${cx}" y="${H - pad.b + 20}" text-anchor="middle" font-size="13" font-weight="700" fill="#0b1f3a">WK ${g.week}</text>`;
      svg += `<rect x="${cx - 14}" y="${H - pad.b + 28}" width="28" height="18" rx="4" fill="${won ? "#0b1f3a" : "#c8102e"}"/><text x="${cx}" y="${H - pad.b + 41}" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">${won ? "W" : "L"}</text>`;
      svg += `<rect class="bar-hit" x="${cx - step / 2}" y="${pad.t}" width="${step}" height="${H - pad.t}" fill="transparent" data-tip="${esc(t)}"/>`;
    });
    svg += `</svg>`;
    $("#weekChart").innerHTML = svg;
    const st = S[s.season];
    $("#weekNote").innerHTML = `Shaded weeks are losses where you still scored above the league median: <b>${st.aboveMedLosses}</b> in ${s.season}. You lost ${st.losses.length} games while beating an average of <b>${f1(st.losses.reduce((a, g) => a + g.beat, 0) / (st.losses.length || 1))} of 9</b> teams in them.`;
    heatChart(s); swap(s); luckTable(s);
  }

  function heatChart(s) {
    const rows = s.myLog.filter((g) => g.oppAvgElse != null).map((g) => ({ g, d: g.oppPts - g.oppAvgElse }));
    const W = 460, rh = 46, H = rows.length * rh + 24, mid = 230, max = Math.max(20, ...rows.map((r) => Math.abs(r.d)));
    const sc = (v) => (v / max) * 170;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Opponent scoring versus their average">`;
    svg += `<line x1="${mid}" x2="${mid}" y1="0" y2="${H - 18}" stroke="#0b1f3a" stroke-width="2"/>`;
    rows.forEach(({ g, d }, i) => {
      const yy = i * rh + 4, o = tm(s, g.opp), w = Math.abs(sc(d));
      const t = `<b>Week ${g.week}</b><br>${esc(o.name)} scored ${f1(g.oppPts)} vs you<br>Their average otherwise: ${f1(g.oppAvgElse)}`;
      svg += `<text x="0" y="${yy + 12}" font-size="14" fill="#3c4a60"><tspan font-weight="700">WK ${g.week}</tspan> · ${esc(o.name.slice(0, 16))}</text>`;
      svg += `<rect x="${d >= 0 ? mid : mid - w}" y="${yy + 19}" width="${w}" height="18" rx="3" fill="${d >= 0 ? "#c8102e" : "#9aa6b8"}" data-tip="${esc(t)}"/>`;
      svg += `<text x="${d >= 0 ? mid + w + 6 : mid - w - 6}" y="${yy + 33}" font-size="15" font-weight="700" text-anchor="${d >= 0 ? "start" : "end"}" fill="${d >= 0 ? "#c8102e" : "#5b6577"}">${sgn(d)}</text>`;
    });
    svg += `<text x="${mid + 4}" y="${H - 2}" font-size="13" fill="#5b6577">their average →</text></svg>`;
    $("#heatChart").innerHTML = svg;
    const st = S[s.season], hot = rows.filter((r) => r.d > 0).length;
    $("#heatNote").innerHTML = `<b>${hot} of ${rows.length}</b> opponents beat their own average against you in ${s.season}, by <b>${sgn(st.heat)}</b> points per game overall.`;
  }

  function swap(s) {
    const m = me(s), row = s.swap[s.myRid];
    const items = Object.entries(row).map(([rid, r]) => ({ t: tm(s, rid), r })).sort((a, b) => b.r[0] - a.r[0] || a.r[1] - b.r[1]);
    $("#swap").innerHTML = items.map(({ t, r }) => {
      const isMe = t.rid === s.myRid, d = r[0] - m.w;
      return `<li class="${isMe ? "is-me" : ""}">${tname(t)}<span class="rec">${r[0]}–${r[1]}</span><span class="delta ${d > 0 ? "up" : ""}">${isMe ? "Your actual" : d > 0 ? `+${d} win${d > 1 ? "s" : ""}` : d < 0 ? `${d} win${d < -1 ? "s" : ""}` : "same"}</span></li>`;
    }).join("");
    const st = S[s.season];
    $("#swapNote").innerHTML = `<b>${st.swapBetter} of 9</b> other schedules would give you a better record than the one you got.`;

    // reverse: every team playing MY schedule (swap[a][me] = team a with my schedule)
    const rev = s.teams.map((t) => ({ t, r: s.swap[t.rid][s.myRid] })).sort((a, b) => b.r[0] - a.r[0] || a.r[1] - b.r[1]);
    $("#swapRev").innerHTML = rev.map(({ t, r }) => {
      const isMe = t.rid === s.myRid, d = r[0] - t.w;
      return `<li class="${isMe ? "is-me" : ""}">${tname(t)}<span class="rec">${r[0]}–${r[1]}</span><span class="delta">${isMe ? "Your actual" : `real ${t.w}–${t.l}${d ? ` · ${d > 0 ? "+" : "−"}${Math.abs(d)}` : ""}`}</span></li>`;
    }).join("");
    const others = rev.filter((x) => x.t.rid !== s.myRid), worse = others.filter((x) => x.r[0] < x.t.w).length;
    const avgW = others.reduce((a, x) => a + x.r[0], 0) / others.length, avgReal = others.reduce((a, x) => a + x.t.w, 0) / others.length;
    $("#swapRevNote").innerHTML = `With your schedule, <b>${worse} of 9</b> teams would have fewer wins than they actually have. On average they'd win <b>${f1(avgW)}</b> games instead of ${f1(avgReal)}.`;
  }

  function luckTable(s) {
    const rows = [...s.teams].sort((a, b) => a.luck - b.luck), max = Math.max(1, ...rows.map((t) => Math.abs(t.luck)));
    $("#luckTable").innerHTML = `<div class="luck">${rows.map((t) => {
      const w = (Math.abs(t.luck) / max) * 50;
      return `<div class="luck__row ${t.rid === s.myRid ? "is-me" : ""}" data-tip="${esc(`<b>${t.name}</b><br>Actual ${t.w}–${t.l}<br>All-play ${t.apw}–${t.apl}<br>Expected wins ${f1(t.xw)}`)}">${tname(t)}<div class="luck__track"><div class="luck__bar ${t.luck < 0 ? "neg" : "pos"}" style="width:${w}%"></div></div><span class="luck__v">${sgn(t.luck)}</span></div>`;
    }).join("")}</div>`;
  }

  function tabs(el, values, curVal, onPick) {
    el.innerHTML = values.map((v) => `<button role="tab" aria-selected="${v === curVal}" data-v="${v}">${v}</button>`).join("");
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", x === b));
      onPick(b.dataset.v);
    });
  }
  tabs($("#seasonTabs"), mine.map((s) => s.season), chartSeason, (v) => { chartSeason = v; weekChart(); });
  weekChart();

  // ---------- simulation ----------
  const done = cur.weeksDone;
  const remaining = cur.schedule.filter((w) => w.week > done);
  const allScores = cur.teams.flatMap((t) => t.scores);
  const lgMean = allScores.reduce((a, b) => a + b, 0) / allScores.length;
  const lgSd = Math.sqrt(allScores.reduce((a, b) => a + (b - lgMean) ** 2, 0) / allScores.length) || 25;
  const K = 4; // weeks of league-average "prior" blended into each team's mean
  const model = Object.fromEntries(cur.teams.map((t) => [t.rid, (t.scores.length * t.avg + K * lgMean) / (t.scores.length + K)]));
  const sd = Math.max(lgSd, 22);
  const myRid = cur.myRid, myDiv = me(cur).div;
  const myGames = remaining.map((w) => {
    const p = w.pairs.find((x) => x.includes(myRid));
    return p ? { week: w.week, opp: p[0] === myRid ? p[1] : p[0] } : null;
  }).filter(Boolean);
  const calls = Object.fromEntries(myGames.map((g) => [g.week, "S"]));

  // ---------- bye-week engine ----------
  const B = D.byes && D.byes.season === cur.season ? D.byes : null;
  const FLEX_OK = { FLEX: ["RB", "WR", "TE"], SUPER_FLEX: ["QB", "RB", "WR", "TE"], REC_FLEX: ["WR", "TE"], WRRB_FLEX: ["RB", "WR"] };
  // greedy best lineup by points per game: fixed slots first, then flex slots
  function bestLineup(players) {
    const pool = players.filter((p) => !p.ir).sort((a, b) => b.ppg - a.ppg), used = new Set();
    let total = 0;
    const take = (ok) => { const p = pool.find((x) => !used.has(x.id) && ok.includes(x.pos)); if (p) { used.add(p.id); total += p.ppg; } };
    B.slots.filter((s) => !FLEX_OK[s] && !SKIP.includes(s)).forEach((s) => take([s]));
    B.slots.filter((s) => FLEX_OK[s]).forEach((s) => take(FLEX_OK[s]));
    return { total, used };
  }
  const SKIP = ["K", "DEF"]; // kickers and defenses are streamed, so leave them out of bye analysis
  const roster = (rid) => (B ? (B.rosters[rid] || []).filter((p) => !SKIP.includes(p.pos)) : []);
  const fullLineup = B ? Object.fromEntries(cur.teams.map((t) => [t.rid, bestLineup(roster(t.rid))])) : {};
  const byeHit = (rid, wk) => {
    if (!B) return 0;
    const out = roster(rid).filter((p) => p.bye === wk);
    if (!out.length) return 0;
    return fullLineup[rid].total - bestLineup(roster(rid).filter((p) => p.bye !== wk)).total;
  };
  const HIT = Object.fromEntries(cur.teams.map((t) => [t.rid, Object.fromEntries(remaining.map((w) => [w.week, byeHit(t.rid, w.week)]))]));
  const proj = (rid, wk) => model[rid] - (HIT[rid][wk] || 0);

  function randn() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  function simulate(N, forced) {
    const ids = cur.teams.map((t) => t.rid);
    const acc = Object.fromEntries(ids.map((r) => [r, { po: 0, bye: 0, div: 0, w: 0, seed: Array(7).fill(0) }]));
    const divGames = myGames.filter((g) => tm(cur, g.opp).div === myDiv);
    const ladder = Array(divGames.length + 1).fill(0).map(() => [0, 0]);
    const swing = Object.fromEntries(myGames.map((g) => [g.week, { w: [0, 0], l: [0, 0] }]));
    for (let n = 0; n < N; n++) {
      const W = {}, PF = {};
      cur.teams.forEach((t) => { W[t.rid] = t.w; PF[t.rid] = t.pf; });
      const myRes = {};
      for (const wk of remaining) {
        for (const [a, b] of wk.pairs) {
          let pa = proj(a, wk.week) + randn() * sd, pb = proj(b, wk.week) + randn() * sd;
          if (a === myRid || b === myRid) {
            const c = forced[wk.week];
            const mineA = a === myRid;
            if (c === "W" || c === "L") {
              const myP = mineA ? pa : pb, opP = mineA ? pb : pa;
              const ok = c === "W" ? myP > opP : myP < opP;
              if (!ok) { const t = pa; pa = pb; pb = t; }
            }
            myRes[wk.week] = mineA ? pa > pb : pb > pa;
          }
          PF[a] += pa; PF[b] += pb;
          if (pa > pb) W[a]++; else W[b]++;
        }
      }
      const cmp = (x, y) => W[y] - W[x] || PF[y] - PF[x];
      const divW = [1, 2].map((d) => ids.filter((r) => tm(cur, r).div === d).sort(cmp)[0]);
      const top2 = [...divW].sort(cmp);
      const rest = ids.filter((r) => !divW.includes(r)).sort(cmp).slice(0, cur.playoffTeams - 2);
      const seeds = [...top2, ...rest];
      seeds.forEach((r, i) => { acc[r].po++; acc[r].seed[i + 1]++; if (i < 2) acc[r].bye++; });
      divW.forEach((r) => acc[r].div++);
      ids.forEach((r) => (acc[r].w += W[r]));
      const myBye = top2.includes(myRid) ? 1 : 0;
      const dWins = divGames.filter((g) => myRes[g.week]).length;
      ladder[dWins][0] += myBye; ladder[dWins][1]++;
      myGames.forEach((g) => { const s = swing[g.week][myRes[g.week] ? "w" : "l"]; s[0] += myBye; s[1]++; });
    }
    ids.forEach((r) => { const a = acc[r]; a.po /= N; a.bye /= N; a.div /= N; a.w /= N; });
    return { acc, ladder, swing, divGames, N };
  }

  const base = simulate(10000, {});
  let lastRun = base;

  function renderSim() {
    const forced = Object.fromEntries(Object.entries(calls).filter(([, v]) => v !== "S"));
    const anyForced = Object.keys(forced).length > 0;
    const r = anyForced ? simulate(8000, forced) : base;
    lastRun = r;
    const a = r.acc[myRid], b = base.acc[myRid];
    const delta = (x, y) => (anyForced ? `<span class="${x >= y ? "up" : "down"}">${sgn((x - y) * 100, 0)} pts</span> vs. baseline` : "Baseline, no calls made");
    $("#odds").innerHTML = [
      ["Make the playoffs", pct(a.po), delta(a.po, b.po), ""],
      ["Win the division (bye)", pct(a.div), delta(a.div, b.div), "gold"],
      ["Projected wins", f1(a.w), `currently ${me(cur).w}–${me(cur).l}`, ""],
      ["Division games left", `${r.divGames.length}<small style="font-size:.4em"> of ${myGames.length}</small>`, `${r.divGames.map((g) => "wk " + g.week).join(", ")}`, ""],
    ].map(([k, v, d, c]) => `<div><div class="k">${k}</div><div class="v ${c}">${v}</div><div class="d">${d}</div></div>`).join("");

    // games list
    $("#games").innerHTML = myGames.map((g) => {
      const o = tm(cur, g.opp), isDiv = o.div === myDiv, sw = base.swing[g.week];
      const pw = sw.w[1] ? sw.w[0] / sw.w[1] : 0, pl = sw.l[1] ? sw.l[0] / sw.l[1] : 0;
      const winP = (() => { const z = (proj(myRid, g.week) - proj(g.opp, g.week)) / (sd * Math.SQRT2); return 0.5 * (1 + erf(z)); })();
      return `<li class="game ${isDiv ? "is-div" : ""}">
        <span class="game__wk">Wk ${g.week}</span>
        <div class="game__opp">${tname(o)}<div class="game__meta">${isDiv ? `<span class="tag">Division</span>` : ""}${o.w}–${o.l} · win chance ${pct(winP)} · bye odds ${pct(pw)} with a W, ${pct(pl)} with an L${HIT[myRid][g.week] || HIT[g.opp][g.week] ? ` · bye hit: you ${sgn(-HIT[myRid][g.week])}, them ${sgn(-HIT[g.opp][g.week])}` : ""}</div></div>
        <div class="pick3" role="group" aria-label="Week ${g.week} result">${["W", "S", "L"].map((v) => `<button type="button" data-wk="${g.week}" data-v="${v}" aria-pressed="${calls[g.week] === v}">${v === "S" ? "Sim" : v}</button>`).join("")}</div>
      </li>`;
    }).join("");

    // division table
    $("#divTitle").textContent = `${cur.divisions[myDiv]} standings`;
    const divTeams = cur.teams.filter((t) => t.div === myDiv).sort((x, y) => y.w - x.w || y.pf - x.pf);
    $("#divTable").innerHTML = `<div class="table-wrap"><table><thead><tr><th>Team</th><th class="n">W–L</th><th class="n">PF</th><th class="n">Div title</th><th class="n">Playoffs</th></tr></thead><tbody>${divTeams.map((t) => {
      const o = r.acc[t.rid];
      return `<tr class="${t.rid === myRid ? "is-me" : ""}"><td>${tname(t)}</td><td class="n">${t.w}–${t.l}</td><td class="n">${f1(t.pf)}</td><td class="n"><span class="pct">${pct(o.div)}</span><span class="pbar pbar--gold"><i style="width:${o.div * 100}%"></i></span></td><td class="n"><span class="pct">${pct(o.po)}</span></td></tr>`;
    }).join("")}</tbody></table></div>`;

    // ladder
    $("#ladder").innerHTML = `<div class="ladder">${r.ladder.map(([b, n], k) => {
      const p = n ? b / n : 0;
      return `<div class="ladder__row"><span>${k} of ${r.divGames.length} div wins<br><span class="ladder__share">${pct(n / r.N)} of sims</span></span><div class="ladder__track"><i style="width:${p * 100}%"></i></div><span class="ladder__pct">${n ? pct(p) : "–"}</span></div>`;
    }).join("")}</div>`;

    // whole league
    const lg = [...cur.teams].sort((x, y) => r.acc[y.rid].po - r.acc[x.rid].po || r.acc[y.rid].w - r.acc[x.rid].w);
    $("#leagueOdds").innerHTML = `<div class="table-wrap"><table><thead><tr><th>Team</th><th>Div</th><th class="n">Now</th><th class="n">Proj. W</th><th class="n">Model pts/wk</th><th class="n">Bye</th><th class="n">Playoffs</th></tr></thead><tbody>${lg.map((t, i) => {
      const o = r.acc[t.rid];
      return `<tr class="${t.rid === myRid ? "is-me" : ""} ${i === cur.playoffTeams - 1 ? "cut" : ""}"><td>${tname(t)}</td><td>${esc(cur.divisions[t.div])}</td><td class="n">${t.w}–${t.l}</td><td class="n">${f1(o.w)}</td><td class="n">${f1(model[t.rid])}</td><td class="n"><span class="pct">${pct(o.bye)}</span><span class="pbar pbar--gold"><i style="width:${o.bye * 100}%"></i></span></td><td class="n"><span class="pct">${pct(o.po)}</span><span class="pbar"><i style="width:${o.po * 100}%"></i></span></td></tr>`;
    }).join("")}</tbody></table></div>`;
  }
  function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); }

  $("#games").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-wk]"); if (!b) return;
    calls[b.dataset.wk] = b.dataset.v; renderSim();
  });
  $("#resetCalls").addEventListener("click", () => { Object.keys(calls).forEach((k) => (calls[k] = "S")); renderSim(); });
  if (myGames.length) {
    $("#roadLede").textContent += ` Your division games are marked in red: they count double, because every one you win is also a loss for a team you're chasing for the bye.`;
    renderSim();
  } else {
    $("#road").querySelector(".lede").textContent = "The regular season is over.";
  }

  // ---------- bye-week watch ----------
  (function byeWatch() {
    if (!B || !myGames.length) { $("#byes").hidden = true; return; }
    const mineR = roster(myRid), myBest = fullLineup[myRid].used;
    const chip = (p, best) => `<span class="pchip ${best.has(p.id) ? "is-core" : ""}" data-tip="${esc(`<b>${p.name}</b><br>${p.pos} · ${p.team} · bye wk ${p.bye}<br>${f1(p.ppg)} pts/game${best.has(p.id) ? "<br>In best lineup" : "<br>Bench depth"}`)}"><span class="pos-${esc(p.pos)}">${esc(p.pos)}</span> ${esc(p.name)} <small>${f1(p.ppg)}</small></span>`;
    const outOf = (rid, wk) => roster(rid).filter((p) => p.bye === wk && !p.ir).sort((a, b) => b.ppg - a.ppg);

    // summary cards
    const worst = myGames.reduce((a, g) => (HIT[myRid][g.week] > HIT[myRid][a.week] ? g : a), myGames[0]);
    const myTotal = myGames.reduce((a, g) => a + HIT[myRid][g.week], 0);
    const oppTotal = myGames.reduce((a, g) => a + HIT[g.opp][g.week], 0);
    const divTotal = myGames.filter((g) => tm(cur, g.opp).div === myDiv).reduce((a, g) => a + HIT[myRid][g.week], 0);
    const stacks = Object.entries(mineR.filter((p) => p.bye > done && !p.ir).reduce((m, p) => ((m[p.bye] = m[p.bye] || []).push(p), m), {}))
      .filter(([, ps]) => ps.length >= 3).sort((a, b) => b[1].length - a[1].length);
    const wo = tm(cur, worst.opp), wOut = outOf(myRid, worst.week);
    $("#byeCards").innerHTML = [
      ["red", "Your worst bye week", `Wk ${worst.week}<small>${sgn(-HIT[myRid][worst.week])} pts</small>`,
        `${wOut.length} players out: ${wOut.map((p) => p.name).join(", ")}. Opponent: ${wo.name}${wo.div === myDiv ? " (division)" : ""}, whose own byes cost them ${f1(HIT[worst.opp][worst.week])}.`],
      [myTotal > oppTotal ? "red" : "gold", "Bye points, you vs. your opponents", `${f0(myTotal)}<small>vs ${f0(oppTotal)}</small>`,
        `Across your remaining games, byes take about ${f1(myTotal)} points from your best lineup, and ${f1(oppTotal)} from your opponents' in the weeks they play you.`],
      ["", "Bye damage in division games", `${f1(divTotal)}<small>pts</small>`,
        `Of your bye losses, ${f1(divTotal)} land in division games, the ones that decide the bye.`],
      stacks.length ? ["red", "Bye stack", `${stacks[0][1].length} on wk ${stacks[0][0]}`,
        `${stacks[0][1].map((p) => `${p.name} (${p.team})`).join(", ")} all sit the same week. Moving one of them is the cheapest fix.`] : null,
    ].filter(Boolean).map(([c, k, v, t]) => `<article class="card ${c ? "card--" + c : ""}"><p class="card__k">${k}</p><p class="card__v">${v}</p><p class="card__t">${esc(t)}</p></article>`).join("");

    // week rows
    $("#byeWeeks").innerHTML = myGames.map((g) => {
      const o = tm(cur, g.opp), isDiv = o.div === myDiv, mo = outOf(myRid, g.week), oo = outOf(g.opp, g.week);
      const mh = HIT[myRid][g.week], oh = HIT[g.opp][g.week], net = oh - mh;
      const verdict = !mo.length && !oo.length ? `<span class="bw__v">No byes</span>` : Math.abs(net) < 2 ? `<span class="bw__v">Even</span>` : net > 0 ? `<span class="bw__v up">Edge: you ${sgn(net)}</span>` : `<span class="bw__v down">Edge: them ${sgn(-net)}</span>`;
      const col = (label, ps, hit, best) => `<div class="bw__col"><p class="bw__k">${label} <b>${hit ? sgn(-hit) : "±0"}</b></p>${ps.length ? ps.map((p) => chip(p, best)).join("") : `<span class="bw__none">Nobody out</span>`}</div>`;
      return `<div class="bw ${isDiv ? "is-div" : ""} ${!mo.length && !oo.length ? "is-quiet" : ""}">
        <div class="bw__head"><span class="game__wk">Wk ${g.week}</span>${tname(o)}${isDiv ? `<span class="tag">Division</span>` : ""}${verdict}</div>
        ${mo.length || oo.length ? `<div class="bw__body">${col("You", mo, mh, myBest)}${col(esc(o.name), oo, oh, fullLineup[g.opp].used)}</div>` : ""}
      </div>`;
    }).join("");

    // sell candidates: cost of losing just this player in his bye week
    const sells = mineR.filter((p) => p.bye > done && p.bye <= cur.regEnd && !p.ir && myBest.has(p.id)).map((p) => {
      const solo = fullLineup[myRid].total - bestLineup(mineR.filter((x) => x.id !== p.id)).total;
      const g = myGames.find((x) => x.week === p.bye);
      return { p, solo, g };
    }).sort((a, b) => b.solo - a.solo);
    $("#sellList").innerHTML = sells.length ? `<div class="table-wrap"><table><thead><tr><th>Player</th><th class="n">Bye</th><th>That week</th><th class="n">Pts/gm</th><th class="n">Bye cost</th></tr></thead><tbody>${sells.map(({ p, solo, g }) => {
      const o = g && tm(cur, g.opp);
      return `<tr><td><b>${esc(p.name)}</b> <span class="asset__pos pos-${esc(p.pos)}">${esc(p.pos)} · ${esc(p.team)}</span></td><td class="n">Wk ${p.bye}</td><td>${o ? `${o.div === myDiv ? `<span class="tag">Div</span>` : ""}vs ${esc(o.name)}` : "–"}${g && HIT[myRid][g.week] > solo + 1 ? `<br><small class="muted">stacked: whole week ${sgn(-HIT[myRid][g.week])}</small>` : ""}</td><td class="n">${f1(p.ppg)}</td><td class="n"><b>${sgn(-solo)}</b></td></tr>`;
    }).join("")}</tbody></table></div><p class="panel__note">Bye cost is what your best lineup loses in that one week after your bench fills in. Bigger number, bigger reason to move him.</p>` : `<p class="panel__note">None of your lineup players have a bye left.</p>`;

    // buy targets: bye already used
    const myFloor = {};
    mineR.filter((p) => myBest.has(p.id)).forEach((p) => { myFloor[p.pos] = Math.min(myFloor[p.pos] ?? Infinity, p.ppg); });
    const targets = cur.teams.filter((t) => t.rid !== myRid).flatMap((t) => roster(t.rid).filter((p) => p.bye && p.bye <= done && p.ppg > 0 && !p.ir && ["QB", "RB", "WR", "TE"].includes(p.pos)).map((p) => ({ p, t })))
      .sort((a, b) => b.p.ppg - a.p.ppg);
    const showBuy = (pos) => {
      const rows = targets.filter((x) => pos === "All" || x.p.pos === pos).slice(0, 12);
      $("#buyList").innerHTML = `<div class="table-wrap"><table><thead><tr><th>Player</th><th>Owner</th><th class="n">Bye</th><th class="n">Pts/gm</th></tr></thead><tbody>${rows.map(({ p, t }) => {
        const up = p.ppg > (myFloor[p.pos] ?? 0);
        return `<tr><td><b>${esc(p.name)}</b> <span class="asset__pos pos-${esc(p.pos)}">${esc(p.pos)} · ${esc(p.team)}</span>${up ? ` <span class="pt-tag pt-keeper">Upgrade</span>` : ""}</td><td>${esc(t.name)}${t.div === myDiv ? ` <span class="tag tag--ink">Div</span>` : ""}</td><td class="n">Wk ${p.bye} ✓</td><td class="n">${f1(p.ppg)}</td></tr>`;
      }).join("") || `<tr><td colspan="4">Nobody fits.</td></tr>`}</tbody></table></div><p class="panel__note">"Upgrade" means he averages more than your weakest starter at that position. Trading with a division rival also weakens a team you're chasing.</p>`;
    };
    tabs($("#buyTabs"), ["All", "QB", "RB", "WR", "TE"], "All", showBuy); showBuy("All");
    $("#byesLede").textContent += ` Byes are from the ${B.season} NFL schedule; rosters are as of the last data refresh.`;
  })();

  // ---------- trades ----------
  const seasonOf = (yr) => D.seasons.find((s) => s.season === yr);
  function pickLabel(p) { return `${p.season} Rd ${p.round}`; }
  function assetHtml(a, yr, side) {
    const s = seasonOf(yr);
    if (a.round) {
      const orig = a.orig !== side.rid ? ` <span class="asset__pos">(${esc(a.origName || tm(s, a.orig)?.name)}'s)</span>` : "";
      let body = "", tag = "";
      if (a.status === "used") {
        const b = a.became, pl = b.player;
        tag = b.keeper ? `<span class="pt-tag pt-keeper">Keeper slot</span>` : `<span class="pt-tag pt-used">Pick ${b.round}.${String(b.slot).padStart(2, "0")}</span>`;
        body = `<span class="asset__note">${b.keeper ? "Spent to keep" : "Became"} <b>${esc(pl.name)}</b> <span class="asset__pos pos-${esc(pl.pos)}">${esc(pl.pos)} · ${esc(pl.team)}</span>${b.by !== side.rid ? ` (selected by ${esc(tm(seasonOf(a.season) || s, b.by)?.name || "another team")})` : ""}</span>`;
      } else if (a.status === "vanished") {
        tag = `<span class="pt-tag pt-vanished">Vanished</span>`;
        body = `<span class="asset__note">The ${a.season} draft only ran ${a.season === "2026" ? 16 : "fewer"} rounds. This pick never existed.</span>`;
      } else {
        tag = `<span class="pt-tag pt-pending">Pending</span>`;
        body = `<span class="asset__note">The ${a.season} draft hasn't happened yet.</span>`;
      }
      return `<li class="asset asset--pick"><span><span class="asset__name">${pickLabel(a)}</span>${orig} ${tag}</span><span class="asset__pts">${a.status === "used" ? f1(a.pts) + " pts" : "–"}</span>${body}</li>`;
    }
    return `<li class="asset"><span><span class="asset__name">${esc(a.name)}</span><span class="asset__pos pos-${esc(a.pos)}">${esc(a.pos)} · ${esc(a.team)}</span></span><span class="asset__pts">${f1(a.pts)} pts</span><span class="asset__note">${a.games} start${a.games === 1 ? "" : "s"} for the new team</span></li>`;
  }
  function tradeHtml(t, focusRid) {
    const s = seasonOf(t.season);
    const sides = [...t.sides].sort((a, b) => (a.rid === focusRid ? -1 : b.rid === focusRid ? 1 : 0));
    const best = sides.reduce((a, b) => (b.value > a.value ? b : a));
    const margin = best.value - Math.min(...sides.map((x) => x.value));
    const verdict = margin < 10 ? "Too close to call" : `${esc(best.name)} by ${f1(margin)}`;
    const date = new Date(t.created).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    const sideHtml = (sd) => `<div class="trade__side ${sd === best && margin >= 10 ? "won" : ""}">
        <div class="trade__team">${avatar(tm(s, sd.rid))}<span>${esc(sd.name)}<br><small>received</small></span><span class="trade__total">${f0(sd.value)}<small>pts</small></span></div>
        <ul class="assets">${[...sd.players, ...sd.picks].map((a) => assetHtml(a, t.season, sd)).join("") || `<li class="asset"><span class="asset__note">Nothing but vibes</span></li>`}${sd.faab ? `<li class="asset"><span class="asset__name">$${sd.faab} FAAB</span></li>` : ""}</ul>
      </div>`;
    return `<article class="trade reveal">
      <header class="trade__head"><span class="trade__when">${t.season} · ${t.week <= 1 ? "Preseason / week 1" : "Week " + t.week} · ${date}</span><span class="trade__verdict">${margin < 10 ? verdict : "Won: " + verdict}</span></header>
      <div class="trade__body">${sides.length === 2 ? sideHtml(sides[0]) + `<div class="trade__swap" aria-hidden="true">⇄</div>` + sideHtml(sides[1]) : sides.map(sideHtml).join("")}</div>
    </article>`;
  }

  (function trades() {
    const my = D.trades.filter((t) => t.mine);
    const myRidIn = (t) => t.sides.find((sd) => tm(seasonOf(t.season), sd.rid)?.owner === D.me)?.rid;
    let got = 0, gave = 0, wins = 0, picksOut = 0, picksIn = 0;
    my.forEach((t) => {
      const r = myRidIn(t);
      t.sides.forEach((sd) => {
        if (sd.rid === r) { got += sd.value; picksIn += sd.picks.length; } else { gave += sd.value; picksOut += sd.picks.length; }
      });
      const mineSide = t.sides.find((sd) => sd.rid === r), other = Math.max(...t.sides.filter((sd) => sd.rid !== r).map((sd) => sd.value));
      if (mineSide.value > other) wins++;
    });
    $("#tradeStats").innerHTML = [
      ["", "Your trades", `${my.length}`, `${D.trades.length} in the league since 2024`],
      ["gold", "Trades won", `${wins}<small>of ${my.length}</small>`, "By starter points produced afterward"],
      ["", "Net points", `${sgn(got - gave, 0)}`, `${f0(got)} received vs ${f0(gave)} sent`],
      ["red", "Picks moved", `${picksOut} out · ${picksIn} in`, "Future picks you sent and received"],
    ].map(([c, k, v, t]) => `<article class="card ${c ? "card--" + c : ""}"><p class="card__k">${k}</p><p class="card__v" style="font-size:40px">${v}</p><p class="card__t">${t}</p></article>`).join("");
    $("#myTrades").innerHTML = my.map((t) => tradeHtml(t, myRidIn(t))).join("") || `<p class="lede">No trades yet.</p>`;

    // pick tracker
    const rows = D.trades.flatMap((t) => t.sides.flatMap((sd) => sd.picks.map((p) => ({ t, sd, p }))))
      .sort((a, b) => a.p.season.localeCompare(b.p.season) || a.p.round - b.p.round);
    $("#pickTracker").innerHTML = `<table><thead><tr><th>Pick</th><th>Original team</th><th>Traded to</th><th>Traded</th><th>Became</th><th class="n">Pts for owner</th></tr></thead><tbody>${rows.map(({ t, sd, p }) => {
      const s = seasonOf(t.season), isMe = tm(s, sd.rid)?.owner === D.me || tm(s, p.from)?.owner === D.me;
      let became = `<span class="pt-tag pt-pending">Pending</span>`;
      if (p.status === "used") became = `${p.became.keeper ? `<span class="pt-tag pt-keeper">Keeper</span> ` : `<span class="pt-tag pt-used">${p.became.round}.${String(p.became.slot).padStart(2, "0")}</span> `}<b>${esc(p.became.player.name)}</b> <span class="asset__pos pos-${esc(p.became.player.pos)}">${esc(p.became.player.pos)}</span>`;
      if (p.status === "vanished") became = `<span class="pt-tag pt-vanished">Vanished</span> round never held`;
      return `<tr class="${isMe ? "is-me" : ""}"><td><b>${pickLabel(p)}</b></td><td>${esc(p.origName || "")}</td><td>${esc(sd.name)}</td><td>${t.season} wk ${t.week}</td><td>${became}</td><td class="n">${p.status === "used" ? f1(p.pts) : "–"}</td></tr>`;
    }).join("")}</tbody></table>`;

    // league trades
    const yrs = [...new Set(D.trades.map((t) => t.season))].sort().reverse();
    const show = (yr) => { $("#leagueTrades").innerHTML = D.trades.filter((t) => t.season === yr && !t.mine).map((t) => tradeHtml(t)).join("") || `<p class="lede">No other trades that season.</p>`; observe(); };
    tabs($("#tradeTabs"), yrs, yrs[0], show); show(yrs[0]);
  })();

  $("#footMeta").textContent = `Data from the Sleeper API, last refreshed ${new Date(D.generated).toLocaleString()}. League ${cur.leagueId}.`;

  // ---------- home tiles ----------
  (function homeTiles() {
    const K = D.keepers, b = K && K.boards[String(cur.myRid)];
    const a = typeof base !== "undefined" ? base.acc[cur.myRid] : null;
    const top = b ? b.filter((r) => r.surplus > 0).slice(0, 3).map((r) => r.name.split(" ").slice(-1)[0]).join(", ") : "";
    const tiles = [
      ["luck", "01", "Bad luck", `${C.m.w}–${C.m.l} vs. ${f1(C.m.xw)} expected wins`, "All-play, the heater effect, schedule swaps and the scoring-record chase."],
      ["race", "02", "Playoff race", a ? `${pct(a.po)} playoffs · ${pct(a.div)} bye` : "Season complete", "Odds from 10,000 simulations, your what-if calls, and bye weeks."],
      ["trades", "03", "Trades", `${D.trades.filter((t) => t.mine).length} deals traced`, "Every deal scored, every traded pick traced to the player it became."],
      ["keepers", "04", "Keepers", "Who to keep in 2027", "One verdict per player, your plan for next year, and who should have been kept before."],
    ];
    $("#homeTiles").innerHTML = tiles.map(([p, n, t, stat, d]) => `<a class="tile reveal" href="#/${p}"><span class="tile__n">${n}</span><span class="tile__t">${t}</span><span class="tile__stat">${esc(stat)}</span><span class="tile__d">${d}</span><span class="tile__go" aria-hidden="true">→</span></a>`).join("");
  })();

  window.BBNF = { D, $, esc, f1, f0, sgn, pct, ord, tm, tname, avatar, tabs, observe, cur, odds: typeof base !== "undefined" ? base.acc : null };
  route();
  observe();
})();
