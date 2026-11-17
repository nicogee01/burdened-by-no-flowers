/* Official Sunday Footy League: pick 'em with score entry, playoff rules, and D/ST matchups. */
(() => {
  "use strict";
  const B = window.BBNF;
  const F = B && B.D.footy;
  const page = document.querySelector('[data-page="footy"]');
  if (!page) return;
  if (!F) { page.querySelector(".sub").innerHTML = '<p class="howto" style="padding:24px">This league\'s data will appear after the next refresh.</p>'; return; }
  const { $, esc, f1, pct, ord, avatar } = B;
  const clean = (s) => String(s || "").replace(/�/g, "“").replace(/“([^“]*)“/, "“$1”");
  F.teams.forEach((t) => (t.name = clean(t.name)));
  const T = Object.fromEntries(F.teams.map((t) => [t.rid, t]));
  const ids = F.teams.map((t) => t.rid);
  const me = F.teams.find((t) => t.mine);
  const SEEDS = F.playoffTeams || 6, BYES = 2, BY_RECORD = SEEDS - 1;
  const store = { get(k, d) { try { const v = localStorage.getItem("bbnf:" + k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem("bbnf:" + k, JSON.stringify(v)); } catch { /* private mode */ } } };

  // ---------- model: each team's average, pulled toward the league average ----------
  const all = F.teams.flatMap((t) => t.scores);
  const lg = all.reduce((a, b) => a + b, 0) / all.length;
  const sd = Math.max(Math.sqrt(all.reduce((a, b) => a + (b - lg) ** 2, 0) / all.length), 22);
  const mean = Object.fromEntries(F.teams.map((t) => [t.rid, (t.scores.length * t.avg + 4 * lg) / (t.scores.length + 4)]));
  const randn = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const erf = (x) => { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); };
  const winP = (a, b) => 0.5 * (1 + erf((mean[a] - mean[b]) / (sd * Math.SQRT2)));

  // ---------- picks: a typed score beats a winner pick beats a simulation ----------
  const key = (w, a, b) => `${F.season}:${w}:${Math.min(a, b)}-${Math.max(a, b)}`;
  let picks = store.get("footyPicks", {});
  const save = () => store.set("footyPicks", picks);
  const games = F.schedule.flatMap((wk) => wk.pairs.map(([a, b]) => ({ w: wk.week, a, b, k: key(wk.week, a, b) })));
  const scoreOf = (g, rid) => { const p = picks[g.k]; const v = p && p.s && p.s[rid]; return v === "" || v == null ? null : +v; };
  const decided = (g) => { const sa = scoreOf(g, g.a), sb = scoreOf(g, g.b); return sa != null && sb != null; };

  // Seeding: top 5 by record (wins, then points), top 2 get byes; 6th = most points among the rest.
  function seed(W, PF) {
    const order = [...ids].sort((x, y) => W[y] - W[x] || PF[y] - PF[x]);
    const top = order.slice(0, BY_RECORD);
    const rest = order.slice(BY_RECORD).sort((x, y) => PF[y] - PF[x]);
    return { top, sixth: rest[0], order };
  }

  function run(N) {
    const acc = Object.fromEntries(ids.map((r) => [r, { po: 0, bye: 0, top5: 0, sixth: 0, w: 0, pf: 0 }]));
    for (let n = 0; n < N; n++) {
      const W = {}, PF = {};
      F.teams.forEach((t) => { W[t.rid] = t.w + t.t * 0.5; PF[t.rid] = t.pf; });
      for (const g of games) {
        let pa = scoreOf(g, g.a), pb = scoreOf(g, g.b);
        if (pa == null || pb == null) {
          const ra = pa == null, rb = pb == null;
          if (ra) pa = mean[g.a] + randn() * sd;
          if (rb) pb = mean[g.b] + randn() * sd;
          const pick = picks[g.k] && picks[g.k].w;
          if (pick && (pick === g.a) !== (pa > pb) && ra && rb) { const t = pa; pa = pb; pb = t; }
        }
        PF[g.a] += pa; PF[g.b] += pb;
        if (pa > pb) W[g.a]++; else if (pb > pa) W[g.b]++; else { W[g.a] += 0.5; W[g.b] += 0.5; }
      }
      const s = seed(W, PF);
      s.top.forEach((r, i) => { acc[r].po++; acc[r].top5++; if (i < BYES) acc[r].bye++; });
      acc[s.sixth].po++; acc[s.sixth].sixth++;
      ids.forEach((r) => { acc[r].w += W[r]; acc[r].pf += PF[r]; });
    }
    ids.forEach((r) => { const a = acc[r]; for (const k in a) a[k] /= N; });
    return acc;
  }

  // ---------- render: games ----------
  function renderGames() {
    $("#ftGames").innerHTML = F.schedule.map((wk) => `
      <article class="pk-week">
        <header><b>Week ${wk.week}</b><small>${wk.week === F.current ? "this week" : ""}</small></header>
        ${wk.pairs.map(([a, b]) => {
          const g = { w: wk.week, a, b, k: key(wk.week, a, b) }, p = picks[g.k] || {}, pa = winP(a, b);
          const mine = T[a].mine || T[b].mine, dec = decided(g);
          const side = (rid, chance) => {
            const t = T[rid], live = wk.week === F.current && F.live[rid] ? F.live[rid] : null;
            const on = dec ? scoreOf(g, rid) > scoreOf(g, rid === a ? b : a) : p.w === rid;
            return `<div class="ft-side ${on ? "on" : ""}">
              <button type="button" class="pk-team ${on ? "on" : ""}" data-k="${g.k}" data-w="${rid}" aria-pressed="${on}">${avatar(t)}<span class="pk-name">${esc(t.name)}<small>${t.w}–${t.l}${t.t ? "–" + t.t : ""} · ${Math.round(chance * 100)}%${live != null ? ` · ${f1(live)} so far` : ""}</small></span></button>
              <input class="ft-score" type="number" inputmode="decimal" step="0.1" min="0" data-k="${g.k}" data-r="${rid}" value="${p.s && p.s[rid] != null ? p.s[rid] : ""}" placeholder="${f1(mean[rid])}" aria-label="${esc(t.name)} score, week ${wk.week}">
            </div>`;
          };
          return `<div class="ft-game ${mine ? "is-mine" : ""}">${side(a, pa)}<span class="ft-vs">vs</span>${side(b, 1 - pa)}</div>`;
        }).join("")}
      </article>`).join("");
  }

  // ---------- render: standings ----------
  function renderStand() {
    const acc = run(5000);
    const lock = Object.fromEntries(ids.map((r) => [r, { w: T[r].w, l: T[r].l, pf: T[r].pf, open: 0 }]));
    for (const g of games) {
      if (decided(g)) {
        const sa = scoreOf(g, g.a), sb = scoreOf(g, g.b);
        lock[g.a].pf += sa; lock[g.b].pf += sb;
        if (sa > sb) { lock[g.a].w++; lock[g.b].l++; } else if (sb > sa) { lock[g.b].w++; lock[g.a].l++; }
      } else if (picks[g.k] && picks[g.k].w) { const wn = picks[g.k].w; lock[wn].w++; lock[wn === g.a ? g.b : g.a].l++; lock[g.a].open++; lock[g.b].open++; }
      else { lock[g.a].open++; lock[g.b].open++; }
    }
    const order = [...ids].sort((x, y) => acc[y].po - acc[x].po || acc[y].w - acc[x].w);
    $("#ftStand").innerHTML = `<table><thead><tr><th>Team</th><th class="n">Record</th><th class="n">Bye</th><th class="n">Top 5</th><th class="n">6th (points)</th><th class="n">Playoffs</th></tr></thead><tbody>${order.map((r, i) => {
      const t = T[r], L = lock[r], a = acc[r];
      return `<tr class="${t.mine ? "is-me" : ""} ${i === SEEDS - 1 ? "cut" : ""}"><td>${avatar(t)} ${esc(t.name)}</td><td class="n">${L.w}–${L.l}${L.open ? `<small class="muted"> +${L.open}</small>` : ""}<br><small class="muted">${f1(a.pf)} pts proj.</small></td><td class="n">${pct(a.bye)}</td><td class="n">${pct(a.top5)}</td><td class="n">${pct(a.sixth)}</td><td class="n"><b>${pct(a.po)}</b><span class="pbar"><i style="width:${a.po * 100}%"></i></span></td></tr>`;
    }).join("")}</tbody></table>`;

    // if it ended today
    const W = {}, PF = {};
    F.teams.forEach((t) => { W[t.rid] = t.w + t.t * 0.5; PF[t.rid] = t.pf; });
    const s = seed(W, PF);
    $("#ftToday").innerHTML = `<ol class="ft-today">${s.top.map((r, i) => `<li class="${T[r].mine ? "is-me" : ""}"><b>${i + 1}</b> ${esc(T[r].name)} <small>${T[r].w}–${T[r].l} · ${f1(T[r].pf)}${i < BYES ? " · bye" : ""}</small></li>`).join("")}<li class="${T[s.sixth].mine ? "is-me" : ""}"><b>6</b> ${esc(T[s.sixth].name)} <small>${T[s.sixth].w}–${T[s.sixth].l} · ${f1(T[s.sixth].pf)} · most points outside the top 5</small></li></ol>`;

    if (me) {
      const a = acc[me.rid], g = games.find((x) => x.w === F.current && (x.a === me.rid || x.b === me.rid));
      const oppId = g ? (g.a === me.rid ? g.b : g.a) : null;
      $("#ftMe").innerHTML = `<div><span class="k">Your playoff odds</span><b>${pct(a.po)}</b></div><div><span class="k">Bye</span><b>${pct(a.bye)}</b></div><div><span class="k">Top 5 on record</span><b>${pct(a.top5)}</b></div><div><span class="k">In on points (6th)</span><b>${pct(a.sixth)}</b></div>${oppId ? `<div class="wide"><span class="k">This week</span><b class="small">vs ${esc(T[oppId].name)} (${T[oppId].w}–${T[oppId].l})</b><small>Model win chance ${pct(winP(me.rid, oppId))}. Pick or type a score to see how it moves your odds.</small></div>` : ""}`;
    }
  }

  function renderAll() { renderGames(); renderStand(); }
  $("#ftLede").innerHTML = `Pick a winner or type the final scores. Typed scores count toward points for, which decides both the tiebreakers and the 6th seed. The grey number in each box is the projection (each team's average, pulled a little toward the league's ${f1(lg)}). Leave a game blank to simulate it. Data through week ${F.scored}${F.live && Object.values(F.live).some((v) => v) ? `; "so far" shows week ${F.current} points as of the last refresh` : ""}.`;
  page.addEventListener("click", (e) => {
    const b = e.target.closest(".pk-team[data-k]");
    if (b) { const p = (picks[b.dataset.k] = picks[b.dataset.k] || {}); const w = +b.dataset.w; p.w = p.w === w ? undefined : w; if (p.s) delete p.s; save(); renderAll(); return; }
    if (e.target.id === "ftReset") { picks = {}; save(); renderAll(); }
    if (e.target.id === "ftMine" && me) { for (const g of games) if (g.a === me.rid || g.b === me.rid) picks[g.k] = { w: me.rid }; save(); renderAll(); }
  });
  page.addEventListener("change", (e) => {
    const i = e.target.closest(".ft-score"); if (!i) return;
    const p = (picks[i.dataset.k] = picks[i.dataset.k] || {}); p.s = p.s || {};
    if (i.value === "") delete p.s[i.dataset.r]; else p.s[i.dataset.r] = Math.max(0, +i.value);
    delete p.w; save(); renderAll();
  });
  renderAll();

  // ---------- current standings ----------
  (function standings() {
    const Wn = (t) => t.w + t.t * 0.5;
    const order = [...F.teams].sort((x, y) => Wn(y) - Wn(x) || y.pf - x.pf);
    const top = order.slice(0, BY_RECORD), rest = order.slice(BY_RECORD).sort((x, y) => y.pf - x.pf);
    const sixth = rest[0];
    const seeded = [...top, sixth, ...order.slice(BY_RECORD).filter((t) => t !== sixth)];
    const fifth = top[top.length - 1];
    const streak = (r) => { if (!r || !r.length) return "–"; const last = r[r.length - 1]; let n = 0; for (let i = r.length - 1; i >= 0 && r[i] === last; i--) n++; return last + n; };
    const chips = (r) => (r || []).slice(-5).map((x) => `<i class="rc rc--${x}">${x}</i>`).join("");
    const status = (i, t) => (i < BYES ? `<span class="pt-tag pt-keeper">Bye</span>` : i < BY_RECORD ? `<span class="pt-tag pt-used">In</span>` : t === sixth ? `<span class="pt-tag pt-used">In (points)</span>` : `<span class="pt-tag pt-pending">Out</span>`);
    $("#ftStLede").innerHTML = `Through week ${F.scored}. Seeds as if the season ended today: the top ${BY_RECORD} by record (points for breaks ties), the top ${BYES} get byes, and the ${ord(SEEDS)} seed is the highest scorer outside the top ${BY_RECORD}. "GB" is games behind the ${ord(BY_RECORD)} seed; "Pts back" is how far behind the points leader outside the top ${BY_RECORD} a team is.`;
    $("#ftStTable").innerHTML = `<table class="sttable"><thead><tr><th class="n">Seed</th><th>Team</th><th class="n">W–L</th><th class="n">PF</th><th class="n">PA</th><th class="n">GB</th><th class="n">Pts back</th><th>Last 5</th><th class="n">Streak</th><th></th></tr></thead><tbody>${seeded.map((t, i) => {
      const gb = Wn(fifth) - Wn(t), ptsBack = i >= BY_RECORD && t !== sixth ? sixth.pf - t.pf : null;
      return `<tr class="${t.mine ? "is-me" : ""} ${i === SEEDS - 1 ? "cut" : ""}"><td class="n"><b>${i + 1}</b></td><td>${avatar(t)} ${esc(t.name)}</td><td class="n"><b>${t.w}–${t.l}${t.t ? "–" + t.t : ""}</b></td><td class="n">${f1(t.pf)}</td><td class="n">${t.pa != null ? f1(t.pa) : "–"}</td><td class="n">${gb > 0 ? gb : "–"}</td><td class="n">${ptsBack != null ? f1(ptsBack) : "–"}</td><td><span class="rcs">${chips(t.results)}</span></td><td class="n">${streak(t.results)}</td><td>${status(i, t)}</td></tr>`;
    }).join("")}</tbody></table>`;
  })();

  // ---------- D/ST matchups in this league's scoring ----------
  const DS = F.dst;
  const weeks = [...new Set(DS.defs.flatMap((d) => d.games.map((g) => g.week)))].sort((a, b) => a - b);
  let dw = weeks.includes(F.current) ? F.current : weeks[0];
  const tag = (o) => (!o ? `<span class="own own--fa">Free agent</span>` : T[o]?.mine ? `<span class="own own--me">Yours</span>` : `<span class="own">${esc(T[o]?.name || "Taken")}</span>`);
  const grade = (rank) => (rank <= 8 ? ["Great", "g1"] : rank <= 16 ? ["Good", "g2"] : rank <= 24 ? ["Tough", "g3"] : ["Avoid", "g4"]);
  function dstTable() {
    const rows = DS.defs.map((d) => {
      const g = d.games.find((x) => x.week === dw);
      if (!g || g.bye) return { d, bye: true, proj: -1 };
      return { d, g, allow: DS.vs[g.opp], rank: DS.rank[g.opp], proj: 0.5 * d.ppg + 0.5 * DS.vs[g.opp] };
    }).sort((a, b) => b.proj - a.proj);
    $("#ftDst").innerHTML = `<table class="dgrid"><thead><tr><th>D/ST</th><th>Opponent</th><th>Defenses vs. that offense</th><th class="n">D/ST avg</th><th class="n">Projection</th><th>Status</th></tr></thead><tbody>${rows.map((x, i) => x.bye ? `<tr class="skip"><td><b>${x.d.team}</b></td><td colspan="4" class="bye">BYE</td><td>${tag(x.d.owner)}</td></tr>` : `<tr class="${!x.d.owner ? "is-fa" : T[x.d.owner]?.mine ? "is-me" : ""}"><td><b>${x.d.team}</b> <small class="muted">#${i + 1}</small></td><td>${x.g.home ? "vs" : "@"} ${x.g.opp}</td><td><span class="dg ${grade(x.rank)[1]}">${grade(x.rank)[0]}</span> ${f1(x.allow)} pts/gm <small class="muted">#${x.rank} of 32</small></td><td class="n">${f1(x.d.ppg)}</td><td class="n"><b>${f1(x.proj)}</b></td><td>${tag(x.d.owner)}</td></tr>`).join("")}</tbody></table>`;
  }
  B.tabs($("#ftDstWeeks"), weeks.map(String), String(dw), (v) => { dw = +v; dstTable(); });
  $("#ftDstWeeks").querySelectorAll("button").forEach((b) => { if (+b.dataset.v >= DS.playoffStart) b.textContent += " 🏆"; });
  dstTable();
})();
