/* Scenarios: every remaining win/loss combination, counted exactly (no simulation, no scores).
   The week in progress finishes as projected (each game to its live favourite, points added at the
   projected final). Ties on record are broken by points for as they stand then; "no tiebreak needed"
   counts only combinations where the record alone does it. Works for both leagues, any team.
   Path explorer: pick a record, lock results, and see what every surviving combination needs. */
(() => {
  "use strict";
  const B = window.BBNF;
  if (!B) return;
  const { D, $, esc, pct, f1 } = B;
  const MAX_GAMES = 20;
  const phi = (z) => { const s = Math.sign(z), x = Math.abs(z), t = 1 / (1 + 0.3275911 * x); return 0.5 * (1 + s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x))); };

  function prepare(cfg) {
    const teams = cfg.teams.map((t) => ({ rid: t.rid, name: t.name, div: t.div, w2: 2 * t.w + (t.t || 0), l: t.l, t: t.t || 0, pf: t.pf, mine: t.rid === cfg.myRid }));
    const T = Object.fromEntries(teams.map((t) => [t.rid, t]));
    let from = cfg.done + 1, liveNote = "";
    const L = cfg.live;
    if (L && L.week === cfg.done + 1 && L.games && L.games.length) {
      L.games.forEach((g) => {
        const a = T[g.a], b = T[g.b];
        if (!a || !b) return;
        const aw = g.pA >= 0.5;
        (aw ? a : b).w2 += 2; (aw ? b : a).l += 1;
        a.pf += (L.teams[g.a] || {}).proj || 0; b.pf += (L.teams[g.b] || {}).proj || 0;
      });
      from = L.week + 1;
      liveNote = `Week ${L.week} is counted as finishing exactly on projection (each game goes to the team projected to win, and points for include the projected finals). `;
    }
    const games = cfg.schedule.filter((w) => w.week >= from && w.week <= cfg.regEnd).flatMap((w) => w.pairs.map(([a, b]) => ({ w: w.week, a, b })));
    const all = cfg.teams.flatMap((t) => t.scores || []);
    const lg = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 120;
    const sd = Math.max(all.length ? Math.sqrt(all.reduce((a, b) => a + (b - lg) ** 2, 0) / all.length) : 22, 22);
    const mean = Object.fromEntries(cfg.teams.map((t) => { const sc = t.scores || [], n = sc.length, avg = n ? sc.reduce((a, b) => a + b, 0) / n : lg; return [t.rid, (n * avg + 4 * lg) / (n + 4)]; }));
    games.forEach((g) => { g.pA = phi((mean[g.a] - mean[g.b]) / (sd * Math.SQRT2)); });
    return { teams, T, games, from, liveNote, mean };
  }

  // seeding for one combination. key[i] = record*1e5 + tiebreak; pfKey decides the Footy points seed.
  function seedFn(cfg, teams) {
    const n = teams.length;
    const divs = [...new Set(teams.map((t) => t.div))];
    const divIdx = divs.map((d) => teams.map((t, i) => (t.div === d ? i : -1)).filter((i) => i >= 0));
    return function seed(key, pfKey, po, bye) {
      po.fill(0); bye.fill(0);
      const order = [...Array(n).keys()].sort((x, y) => key[y] - key[x]);
      if (cfg.rule === "footy") {
        const byRecord = cfg.seeds - 1;
        for (let r = 0; r < n; r++) { const i = order[r]; if (r < byRecord) po[i] = 1; if (r < cfg.byes) bye[i] = 1; }
        let best = -Infinity, bi = -1;
        for (let r = byRecord; r < n; r++) { const i = order[r]; if (pfKey[i] > best) { best = pfKey[i]; bi = i; } }
        if (bi >= 0) po[bi] = 1;
      } else {
        const leaders = divIdx.map((mem) => mem.reduce((a, b) => (key[b] > key[a] ? b : a)));
        leaders.sort((x, y) => key[y] - key[x]);
        leaders.forEach((i, r) => { po[i] = 1; if (r < cfg.byes) bye[i] = 1; });
        let left = cfg.seeds - leaders.length;
        for (let r = 0; r < n && left > 0; r++) { const i = order[r]; if (!po[i]) { po[i] = 1; left--; } }
      }
    };
  }

  // one pass over every combination; per-combination results kept so paths can be filtered instantly
  function analyse(cfg, P, x) {
    const { teams, games } = P, n = teams.length, G = games.length, N = 2 ** G;
    const idx = Object.fromEntries(teams.map((t, i) => [t.rid, i]));
    const ga = games.map((g) => idx[g.a]), gb = games.map((g) => idx[g.b]);
    const seed = seedFn(cfg, teams);
    const base = teams.map((t) => t.w2), pf = teams.map((t) => t.pf);
    const W = new Int16Array(n), key = new Float64Array(n), pfK = new Float64Array(n);
    const po = new Uint8Array(n), bye = new Uint8Array(n);
    const myG = games.filter((g) => g.a === teams[x].rid || g.b === teams[x].rid).length;
    const Wt = new Float64Array(N), K = new Uint8Array(N), P1 = new Uint8Array(N), B1 = new Uint8Array(N), P2 = new Uint8Array(N), B2 = new Uint8Array(N), P3 = new Uint8Array(N);
    for (let c = 0; c < N; c++) {
      for (let i = 0; i < n; i++) W[i] = base[i];
      let k = 0, wt = 1;
      for (let g = 0; g < G; g++) {
        const bw = (c >> g) & 1, win = bw ? gb[g] : ga[g];
        wt *= bw ? 1 - games[g].pA : games[g].pA;
        W[win] += 2;
        if (win === x) k++;
      }
      K[c] = k; Wt[c] = wt;
      // 1) ties broken by points for as they stand
      for (let i = 0; i < n; i++) { key[i] = W[i] * 1e5 + pf[i]; pfK[i] = pf[i]; }
      seed(key, pfK, po, bye); P1[c] = po[x]; B1[c] = bye[x];
      // 2) no tiebreak needed: lose every tie, never take the points seed
      for (let i = 0; i < n; i++) { key[i] = W[i] * 1e5 + (i === x ? 0 : 1e4 + pf[i]); pfK[i] = i === x ? -1 : pf[i]; }
      seed(key, pfK, po, bye); P2[c] = po[x]; B2[c] = bye[x];
      // 3) best case: win every tie (and the points seed if needed)
      for (let i = 0; i < n; i++) { key[i] = W[i] * 1e5 + (i === x ? 9e4 : pf[i]); pfK[i] = i === x ? 1e9 : pf[i]; }
      seed(key, pfK, po, bye); P3[c] = po[x];
    }
    return { N, G, myG, Wt, K, P1, B1, P2, B2, P3 };
  }

  function mount(root, cfg) {
    if (!root) return;
    const P = prepare(cfg);
    const sel = root.querySelector("select"), out = root.querySelector(".scn-out");
    sel.innerHTML = [...P.teams].sort((a, b) => b.w2 - a.w2 || b.pf - a.pf).map((t) => `<option value="${t.rid}" ${t.mine ? "selected" : ""}>${esc(t.name)}${t.mine ? " (you)" : ""}</option>`).join("");
    const rec = (t) => `${t.w2 >> 1}–${t.l}${t.t ? "–" + t.t : ""}`;
    const nm = (r) => esc(P.T[r].name);
    const n0 = (v) => v.toLocaleString();
    const cell = (a, n) => `<span class="scn-c">${n0(a)}</span> <small class="muted">${n ? pct(a / n) : "–"}</small>`;
    const winnerOf = (g, side) => (side ? g.b : g.a);
    let done = false, R = null, rid = null, kSel = null, locks = {}, goal = "po";

    function compute() {
      rid = +sel.value; kSel = null; locks = {};
      const t = P.T[rid], x = P.teams.indexOf(t);
      if (!P.games.length) { out.innerHTML = '<p class="howto">The regular season is over, so there is nothing left to count.</p>'; return; }
      if (P.games.length > MAX_GAMES) { out.innerHTML = `<p class="howto">${P.games.length} games left is ${(2 ** P.games.length).toLocaleString()} combinations, too many to count in the browser. This fills in once fewer weeks remain.</p>`; return; }
      out.innerHTML = '<p class="howto">Counting…</p>';
      setTimeout(() => { R = analyse(cfg, P, x); render(); }, 10);
    }

    function render() {
      const t = P.T[rid], { N, G, myG, Wt, K, P1, B1, P2, B2, P3 } = R;
      const tot = { po: 0, bye: 0, poC: 0, byeC: 0, poB: 0, w: 0, wpo: 0, wbye: 0 };
      const rows = Array.from({ length: myG + 1 }, () => ({ n: 0, po: 0, bye: 0, poC: 0, byeC: 0, w: 0, wpo: 0, wbye: 0 }));
      for (let c = 0; c < N; c++) {
        const r = rows[K[c]], w = Wt[c]; r.n++; r.po += P1[c]; r.bye += B1[c]; r.poC += P2[c]; r.byeC += B2[c]; r.w += w; r.wpo += w * P1[c]; r.wbye += w * B1[c];
        tot.po += P1[c]; tot.bye += B1[c]; tot.poC += P2[c]; tot.byeC += B2[c]; tot.poB += P3[c]; tot.w += w; tot.wpo += w * P1[c]; tot.wbye += w * B1[c];
      }
      const odds = (a, b) => `<span class="scn-odds">${b ? pct(a / b) : "–"}</span>`;
      const status = tot.poC === N ? '<span class="tag tag--ink">Clinched</span>' : tot.poB === 0 ? '<span class="tag">Eliminated</span>' : "";
      const byeStatus = tot.byeC === N ? '<span class="tag tag--gold">Bye clinched</span>' : "";
      const weeks = `weeks ${P.from}–${cfg.regEnd}`;
      const recRows = rows.map((r, k) => ({ r, k })).reverse().map(({ r, k }) => `<tr class="scn-row ${kSel === k ? "is-me" : ""}" data-k="${k}" tabindex="0" role="button" aria-pressed="${kSel === k}"><td><b>${k}–${myG - k}</b> <small class="muted">→ ${(t.w2 >> 1) + k}–${t.l + myG - k}</small> <span class="scn-go">${kSel === k ? "Exploring ▾" : "Explore path →"}</span></td><td class="n">${n0(r.n)}</td><td class="n">${cell(r.po, r.n)}</td><td class="n">${cell(r.poC, r.n)}</td><td class="n">${odds(r.wpo, r.w)}</td><td class="n">${cell(r.bye, r.n)}</td><td class="n">${cell(r.byeC, r.n)}</td><td class="n">${odds(r.wbye, r.w)}</td><td class="n">${pct(r.w)}</td></tr>`).join("");

      // ----- path explorer: the chosen record plus any locked results -----
      const lockE = Object.entries(locks).map(([g, v]) => [+g, v]);
      const match = (c) => (kSel == null || K[c] === kSel) && lockE.every(([g, v]) => ((c >> g) & 1) === v);
      const G1 = goal === "bye" ? B1 : P1, G2 = goal === "bye" ? B2 : P2, goalTxt = goal === "bye" ? "gets a bye" : "makes the playoffs", goalIn = goal === "bye" ? "the bye" : "in";
      const split = P.games.map(() => [{ n: 0, po: 0, w: 0, wpo: 0 }, { n: 0, po: 0, w: 0, wpo: 0 }]);
      let M = 0, Mpo = 0, MpoC = 0, Mw = 0, Mwpo = 0;
      for (let c = 0; c < N; c++) {
        if (!match(c)) continue;
        const w = Wt[c], y = G1[c];
        M++; Mpo += y; MpoC += G2[c]; Mw += w; Mwpo += w * y;
        for (let g = 0; g < G; g++) { const s = split[g][(c >> g) & 1]; s.n++; s.po += y; s.w += w; s.wpo += w * y; }
      }
      let explorer;
      if (kSel != null || lockE.length) {
        const lockList = lockE.map(([g, v]) => { const gm = P.games[g]; return `<button type="button" class="scn-lock" data-unlock="${g}" title="Remove this result">Wk ${gm.w}: ${nm(winnerOf(gm, v))} beat ${nm(winnerOf(gm, 1 - v))} ✕</button>`; }).join("");
        const all = P.games.map((g, i) => ({ g, i, A: split[i][0], Bs: split[i][1] })).filter((s) => !(s.i in locks));
        const items = all.filter((s) => s.A.n && s.Bs.n);
        const fixed = all.filter((s) => !s.A.n || !s.Bs.n);
        const must = Mpo ? items.filter((s) => s.A.po === 0 || s.Bs.po === 0).map((s) => (s.A.po === 0 ? { ...s, w: s.g.b, l: s.g.a } : { ...s, w: s.g.a, l: s.g.b })) : [];
        const sorted = items.map((s) => ({ ...s, pa: s.A.po / s.A.n, pb: s.Bs.po / s.Bs.n })).map((s) => ({ ...s, sw: Math.abs(s.pa - s.pb) })).sort((a, b) => b.sw - a.sw || a.g.w - b.g.w);
        const verdict = (p) => (p === 1 ? '<span class="tag tag--ink">Guarantees it</span>' : p === 0 ? `<span class="tag">${goal === "bye" ? "No bye" : "Knocks them out"}</span>` : "");
        const side = (s, v) => { const st = v ? s.Bs : s.A, p = st.po / st.n, pw = v ? 1 - s.g.pA : s.g.pA; return `<button type="button" class="scn-pick ${p === 1 ? "is-good" : p === 0 ? "is-bad" : ""}" data-lock="${s.i}" data-v="${v}" title="Lock this result in"><span class="scn-pick__who">${nm(winnerOf(s.g, v))} win <small class="muted">${pct(pw)} likely</small></span><span class="scn-bar"><i style="width:${(p * 100).toFixed(1)}%"></i></span><span class="scn-pick__p">${pct(p)} <small>${n0(st.po)} of ${n0(st.n)} · model ${st.w ? pct(st.wpo / st.w) : "–"}</small></span>${verdict(p)}</button>`; };
        const own = (g) => g.a === rid || g.b === rid;
        explorer = `<article class="panel scn-path">
          <header class="panel__head scn-path__head"><div><h3>Path: ${kSel != null ? `${esc(t.name)} go ${kSel}–${myG - kSel}` : "any record"}</h3>
          <p class="panel__sub">${n0(M)} combinations on this path · ${goalTxt} in <b>${n0(Mpo)} (${M ? pct(Mpo / M) : "–"})</b>${MpoC !== Mpo ? ` · ${n0(MpoC)} with no tiebreak needed` : ""} · <b>${Mw ? pct(Mwpo / Mw) : "–"} model odds</b></p></div>
          <div class="scn-goal" role="group" aria-label="Goal"><button type="button" data-goal="po" aria-pressed="${goal === "po"}">Playoffs</button><button type="button" data-goal="bye" aria-pressed="${goal === "bye"}">Bye</button></div></header>
          ${lockList ? `<div class="scn-locks"><span class="muted">Locked in:</span> ${lockList}<button type="button" class="btn-ghost" data-clear>Clear</button></div>` : ""}
          ${!Mpo ? `<p class="scn-verdict is-bad"><b>No combination on this path gets ${esc(t.name)} ${goalIn}.</b>${lockE.length ? " Remove a locked result to back up." : ""}</p>`
            : Mpo === M ? `<p class="scn-verdict is-good"><b>Every combination on this path gets ${esc(t.name)} ${goalIn}.</b></p>`
            : must.length ? `<div class="scn-must"><b>Every way to ${goal === "bye" ? "the bye" : "the playoffs"} on this path needs all of these:</b><ol>${must.map((s) => `<li>Wk ${s.g.w}: <b>${nm(s.w)}</b> beat ${nm(s.l)}</li>`).join("")}</ol></div>`
            : `<p class="howto">No single result is required on this path: there is more than one way to ${goal === "bye" ? "the bye" : "the playoffs"}.</p>`}
          ${Mpo && Mpo < M ? `<p class="howto" style="margin-top:14px">Every game left on this path, biggest swing first. Bars show the share of this path's combinations that get ${esc(t.name)} ${goalIn}; "model" weights each combination by how likely its results are. Tap a result to lock it and follow that branch.</p>
          <div class="scn-games">${sorted.map((s) => `<div class="scn-game ${own(s.g) ? "is-own" : ""}"><div class="scn-game__h">Wk ${s.g.w}${own(s.g) ? " · their game" : ""}${s.sw < 0.0005 ? ' · <span class="muted">no effect</span>' : ""}</div>${side(s, 0)}${side(s, 1)}</div>`).join("")}</div>` : ""}
          ${fixed.length && kSel != null ? `<p class="howto" style="margin-top:10px"><small>Already set by this record: ${fixed.map((s) => { const w = s.A.n ? s.g.a : s.g.b; return `wk ${s.g.w} ${nm(w)} over ${nm(w === s.g.a ? s.g.b : s.g.a)}`; }).join(" · ")}</small></p>` : ""}
        </article>`;
      } else {
        explorer = `<p class="howto scn-hint">Tap a row above to explore that path: which results it needs, which ones guarantee a spot, and which ones end it.</p>`;
      }

      out.innerHTML = `
        <div class="scn-kpis">
          <div class="scn-kpi"><span>Combinations left</span><b>${n0(N)}</b><small>${G} games, ${weeks} · 2<sup>${G}</sup></small></div>
          <div class="scn-kpi"><span>Makes the playoffs ${status}</span><b>${n0(tot.po)}</b><small>${pct(tot.po / N)} with the points tiebreak · ${n0(tot.poC)} (${pct(tot.poC / N)}) with no tiebreak needed · <b>${pct(tot.wpo / tot.w)}</b> model odds</small></div>
          <div class="scn-kpi"><span>Gets a bye ${byeStatus}</span><b>${n0(tot.bye)}</b><small>${pct(tot.bye / N)} with the points tiebreak · ${n0(tot.byeC)} (${pct(tot.byeC / N)}) with no tiebreak needed · <b>${pct(tot.wbye / tot.w)}</b> model odds</small></div>
        </div>
        <p class="howto">${esc(t.name)} sit at <b>${rec(t)}</b> going into week ${P.from} with ${f1(t.pf)} points for. ${tot.poB === 0 ? "Even winning every tie, no combination gets them in." : tot.poC === N ? "They are in no matter what happens." : tot.poB === N ? "If they win every tiebreak, every combination gets them in." : `Winning every tiebreak, they'd make it in ${n0(tot.poB)} (${pct(tot.poB / N)}).`}</p>
        <article class="panel panel--flush"><div class="table-wrap"><table class="sttable scn-table">
          <thead><tr><th>Their record, ${weeks}</th><th class="n">Combos</th><th class="n">Playoffs</th><th class="n">Playoffs, no tiebreak needed</th><th class="n">Playoffs, model odds</th><th class="n">Bye</th><th class="n">Bye, no tiebreak needed</th><th class="n">Bye, model odds</th><th class="n">Chance of this record</th></tr></thead>
          <tbody>${recRows}</tbody>
          <tfoot><tr><td><b>Total</b></td><td class="n"><b>${n0(N)}</b></td><td class="n"><b>${cell(tot.po, N)}</b></td><td class="n">${cell(tot.poC, N)}</td><td class="n">${odds(tot.wpo, tot.w)}</td><td class="n"><b>${cell(tot.bye, N)}</b></td><td class="n">${cell(tot.byeC, N)}</td><td class="n">${odds(tot.wbye, tot.w)}</td><td class="n">100%</td></tr></tfoot>
        </table></div></article>
        <div class="scn-explorer">${explorer}</div>`;
    }

    out.addEventListener("click", (e) => {
      const row = e.target.closest(".scn-row"), lk = e.target.closest("[data-lock]"), ul = e.target.closest("[data-unlock]");
      if (row) { const k = +row.dataset.k; kSel = kSel === k ? null : k; locks = {}; render(); const ex = out.querySelector(".scn-explorer"); if (ex) ex.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
      else if (lk) { locks[+lk.dataset.lock] = +lk.dataset.v; render(); }
      else if (ul) { delete locks[+ul.dataset.unlock]; render(); }
      else if (e.target.closest("[data-clear]")) { locks = {}; render(); }
      else if (e.target.closest("[data-goal]")) { goal = e.target.closest("[data-goal]").dataset.goal; render(); }
    });
    out.addEventListener("keydown", (e) => { const row = e.target.closest(".scn-row"); if (row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); row.click(); } });
    sel.addEventListener("change", compute);
    root.querySelector(".scn-lede").innerHTML = `Every remaining game is either a win or a loss, so this counts every possible combination exactly. Scores are ignored. ${P.liveNote}${cfg.rulesNote} When teams tie on record, <b>Playoffs</b> and <b>Bye</b> break the tie by points for as they stand now; the <b>no tiebreak needed</b> columns count only the combinations where record alone gets the team in. <b>Model odds</b> weight every combination by how likely its results are (each team's scoring this season, pulled toward the league average) instead of treating every game as a coin flip.`;
    const sub = root.closest(".sub");
    const go = () => { if (done || (sub && sub.hidden)) return; done = true; compute(); };
    document.addEventListener("pagechange", () => setTimeout(go, 0));
    window.addEventListener("hashchange", () => setTimeout(go, 0));
    setTimeout(go, 0);
  }

  // ---------- Fugazi ----------
  const cur = D.seasons[D.seasons.length - 1];
  const LV = window.LIVE || null;
  mount($("#scnFugazi"), {
    rule: "div", seeds: cur.playoffTeams || 6, byes: 2, teams: cur.teams, schedule: cur.schedule, done: cur.weeksDone, regEnd: cur.regEnd, myRid: cur.myRid,
    live: LV && LV.fugazi ? { week: LV.week, ...LV.fugazi } : null,
    rulesNote: "Division winners get the two byes; four wild cards go to the best remaining records. ",
  });

  // ---------- Sunday Footy ----------
  const F = D.footy;
  if (F) mount($("#scnFooty"), {
    rule: "footy", seeds: F.playoffTeams || 6, byes: 2, teams: F.teams, schedule: F.schedule, done: F.scored, regEnd: F.regEnd, myRid: (F.teams.find((t) => t.mine) || {}).rid,
    live: LV && LV.footy ? { week: LV.week, ...LV.footy } : null,
    rulesNote: "Top 5 by record make it and the top 2 get byes. The 6th seed goes to the most points for outside the top 5, using points as they stand now (the no-tiebreak columns never give the team that seed). ",
  });
})();
