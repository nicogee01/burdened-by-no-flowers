/* Research hub: records at a glance, defense lab, player matchups, this week's matchup board. */
(() => {
  "use strict";
  const B = window.BBNF;
  if (!B || !B.D.research) { const r = document.querySelector('[data-page="research"]'); if (r) r.querySelector(".sub").innerHTML = '<p class="howto" style="padding:24px">Research data will appear after the next refresh.</p>'; return; }
  const { D, $, esc, f1, f0, pct, ord, cur } = B;
  const R = D.research;
  const POS = ["QB", "RB", "WR", "TE", "K"];
  // the fantasy season ends three weeks into the playoffs (week 17 here), even though the NFL plays 18
  const lastFantasy = Math.min(R.lastWeek, R.playoffStart + 2);
  const weeks = Array.from({ length: Math.max(lastFantasy - R.done, 0) }, (_, i) => R.done + 1 + i);
  const thisWeek = R.done + 1;
  const isPlayoff = (w) => w >= R.playoffStart;
  const avgVs = Object.fromEntries([...POS, "DEF"].map((p) => [p, Object.values(R.vs).reduce((a, t) => a + t[p], 0) / Object.keys(R.vs).length]));
  const store = { get(k, d) { try { const v = localStorage.getItem("bbnf:" + k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem("bbnf:" + k, JSON.stringify(v)); } catch { /* private mode */ } } };

  const grade = (rank) => (rank <= 8 ? ["Great", "g1"] : rank <= 16 ? ["Good", "g2"] : rank <= 24 ? ["Tough", "g3"] : ["Avoid", "g4"]);
  const gameOf = (team, w) => (R.remaining[team] || []).find((g) => g.week === w);
  const oppLabel = (g) => (!g ? "–" : g.bye ? "BYE" : `${g.home ? "vs" : "@"} ${g.opp}`);
  const ownerTag = (o) => (!o ? `<span class="own own--fa">Free agent</span>` : o.mine ? `<span class="own own--me">Yours</span>` : `<span class="own">${esc(o.team)}</span>`);

  // ================= defenses =================
  const DEFS = Object.fromEntries(R.defenses.map((d) => [d.team, d]));
  // projection: half the defense's own average, half what its opponent's offense gives up to defenses
  const defProj = (t, w) => { const g = gameOf(t, w); if (!g || g.bye) return null; return 0.5 * DEFS[t].ppg + 0.5 * R.vs[g.opp].DEF; };

  let dlBye = store.get("dlBye", false), dlPool = store.get("dlPool", "avail"), dlPick = store.get("dlPick", null);
  function defenseLab() {
    const wts = Object.fromEntries(weeks.map((w) => [w, dlBye && w === R.playoffStart ? 0 : isPlayoff(w) ? 1.5 : 1]));
    const pool = R.defenses.filter((d) => dlPool === "all" || !d.owner || d.owner.mine).map((d) => d.team);
    const pairs = [];
    for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i], b = pool[j];
      let s = 0; for (const w of weeks) s += wts[w] * Math.max(defProj(a, w) ?? 0, defProj(b, w) ?? 0);
      pairs.push({ a, b, s });
    }
    pairs.sort((x, y) => y.s - x.s);
    const mine = R.defenses.filter((d) => d.owner && d.owner.mine).map((d) => d.team);
    const minePair = mine.length >= 2 ? pairs.find((p) => [p.a, p.b].sort().join() === mine.slice(0, 2).sort().join()) : null;
    if (!dlPick || !dlPick.every((t) => DEFS[t])) dlPick = pairs.length ? [pairs[0].a, pairs[0].b] : mine;

    $("#dlControls").innerHTML = `
      <label class="toggle"><input type="checkbox" id="dlBye" ${dlBye ? "checked" : ""}> I'll have a first-round playoff bye (skip week ${R.playoffStart})</label>
      <div class="seg seg--sm" role="tablist" aria-label="Which defenses">${[["avail", "Free agents + mine"], ["all", "All 32"]].map(([v, l]) => `<button role="tab" aria-selected="${dlPool === v}" data-pool="${v}">${l}</button>`).join("")}</div>`;
    $("#dlPairs").innerHTML = `<ol class="pairs">${pairs.slice(0, 8).map((p, i) => `<li><button type="button" class="pairbtn ${dlPick.includes(p.a) && dlPick.includes(p.b) && dlPick.length === 2 ? "on" : ""}" data-pair="${p.a},${p.b}"><span class="pairbtn__n">${i + 1}</span><b>${p.a} + ${p.b}</b><span class="pairbtn__s">${f1(p.s)}</span>${ownerTag(DEFS[p.a].owner)}${ownerTag(DEFS[p.b].owner)}</button></li>`).join("")}</ol>
      ${minePair ? `<p class="howto">Your current pair (${mine.join(" + ")}) scores ${f1(minePair.s)}, rank ${1 + pairs.indexOf(minePair)} of ${pairs.length}.</p>` : ""}
      <p class="howto">Score = the better of the two defenses each week, added up through week ${lastFantasy}. Playoff weeks count 1.5×${dlBye ? `, and week ${R.playoffStart} is skipped` : ""}.</p>`;

    // compare grid
    $("#dlChips").innerHTML = R.defenses.slice().sort((x, y) => x.team.localeCompare(y.team)).map((d) => `<button type="button" class="dchip ${dlPick.includes(d.team) ? "on" : ""} ${d.owner && !d.owner.mine ? "taken" : ""}" data-def="${d.team}" aria-pressed="${dlPick.includes(d.team)}">${d.team}</button>`).join("");
    const cols = dlPick.slice(0, 4);
    $("#dlTable").innerHTML = cols.length ? `<table class="dgrid"><thead><tr><th>Week</th>${cols.map((t) => `<th>${t}<small>${f1(DEFS[t].ppg)}/gm · ${DEFS[t].owner ? (DEFS[t].owner.mine ? "yours" : esc(DEFS[t].owner.team)) : "free agent"}</small></th>`).join("")}<th>Start</th></tr></thead><tbody>${weeks.map((w) => {
      const vals = cols.map((t) => defProj(t, w));
      const best = Math.max(...vals.map((v) => v ?? -1));
      const skip = dlBye && w === R.playoffStart;
      return `<tr class="${skip ? "skip" : ""}"><td><b>${w}</b>${isPlayoff(w) ? ' <span class="tag tag--gold">Playoffs</span>' : ""}</td>${cols.map((t, i) => {
        const g = gameOf(t, w), v = vals[i];
        if (!g || g.bye) return `<td class="bye">BYE</td>`;
        const [gl, gc] = grade(R.ranks[g.opp].DEF);
        return `<td class="${v === best && !skip ? "best" : ""}"><span class="dg ${gc}">${oppLabel(g)}</span><b>${f1(v)}</b><small>${gl} · #${R.ranks[g.opp].DEF}</small></td>`;
      }).join("")}<td>${skip ? "<small>Bye week</small>" : best >= 0 ? `<b>${cols[vals.indexOf(best)]}</b>` : "–"}</td></tr>`;
    }).join("")}</tbody></table>` : `<p class="howto">Pick up to four defenses above.</p>`;
  }
  function defenseEvents() {
    $("#r-def").addEventListener("click", (e) => {
      const pool = e.target.closest("[data-pool]"), pair = e.target.closest("[data-pair]"), chip = e.target.closest("[data-def]");
      if (pool) { dlPool = pool.dataset.pool; store.set("dlPool", dlPool); dlPick = null; }
      else if (pair) dlPick = pair.dataset.pair.split(",");
      else if (chip) { const t = chip.dataset.def; dlPick = dlPick.includes(t) ? dlPick.filter((x) => x !== t) : [...dlPick, t].slice(-4); }
      else return;
      store.set("dlPick", dlPick); defenseLab();
    });
    $("#r-def").addEventListener("change", (e) => { if (e.target.id === "dlBye") { dlBye = e.target.checked; store.set("dlBye", dlBye); defenseLab(); } });
  }

  // ================= player matchups =================
  const PL = R.players;
  const byId = Object.fromEntries(PL.map((p) => [p.id, p]));
  let pmId = store.get("pmId", null);
  const myPlayers = PL.filter((p) => p.owner && p.owner.mine).sort((a, b) => b.ppg - a.ppg);
  // matchup factor: how much more (or less) this opponent gives up to the position than average
  const factor = (pos, opp) => (avgVs[pos] ? R.vs[opp][pos] / avgVs[pos] : 1);
  function players() {
    const p = byId[pmId] || myPlayers[0] || PL[0];
    if (!p) return;
    pmId = p.id;
    $("#pmList").innerHTML = PL.map((x) => `<option value="${esc(x.name)} · ${x.pos} · ${x.team || "FA"}"></option>`).join("");
    $("#pmMine").innerHTML = myPlayers.map((x) => `<button type="button" class="dchip ${x.id === p.id ? "on" : ""}" data-pid="${x.id}">${esc(x.name.split(" ").slice(-1)[0])} <small>${x.pos}</small></button>`).join("");
    const wk = Object.entries(p.weeks).map(([w, v]) => [+w, v]);
    const maxV = Math.max(10, ...wk.map(([, v]) => v));
    const sched = weeks.map((w) => {
      const g = gameOf(p.team, w);
      if (!g || g.bye) return { w, bye: true };
      const rank = R.ranks[g.opp][p.pos], fx = factor(p.pos, g.opp);
      return { w, g, rank, fx, proj: p.ppg * fx };
    });
    const po = sched.filter((s) => isPlayoff(s.w) && !s.bye);
    const poAvg = po.length ? po.reduce((a, s) => a + s.rank, 0) / po.length : null;
    $("#pmCard").innerHTML = `
      <div class="pm-head">
        <div><h3>${esc(p.name)}</h3><p>${p.pos} · ${p.team || "FA"} · ${ownerTag(p.owner)}</p></div>
        <dl class="pm-stats">
          <div><dt>Pts/game</dt><dd>${f1(p.ppg)}</dd></div>
          <div><dt>Last 3</dt><dd class="${p.last3 > p.ppg * 1.1 ? "up" : p.last3 < p.ppg * 0.9 ? "down" : ""}">${f1(p.last3)}</dd></div>
          <div><dt>Snap share</dt><dd>${p.snap != null ? Math.round(p.snap * 100) + "%" : "–"}</dd></div>
          <div><dt>Games</dt><dd>${p.g}</dd></div>
        </dl>
      </div>
      <div class="pm-spark" aria-label="Points by week">${wk.map(([w, v]) => `<span title="Week ${w}: ${f1(v)}"><i style="height:${Math.max(4, (v / maxV) * 100)}%"></i><small>${w}</small></span>`).join("")}</div>`;
    $("#pmSched").innerHTML = `<table class="dgrid"><thead><tr><th>Week</th><th>Opponent</th><th>vs ${p.pos}s</th><th>Matchup</th><th class="n">Projection</th></tr></thead><tbody>${sched.map((s) => s.bye ? `<tr><td><b>${s.w}</b></td><td class="bye" colspan="4">BYE</td></tr>` : (() => {
      const [gl, gc] = grade(s.rank);
      return `<tr><td><b>${s.w}</b>${isPlayoff(s.w) ? ' <span class="tag tag--gold">Playoffs</span>' : ""}</td><td>${oppLabel(s.g)}</td><td>${f1(R.vs[s.g.opp][p.pos])} pts/gm <small class="muted">#${s.rank} of 32</small></td><td><span class="dg ${gc}">${gl}</span> <small class="muted">${s.fx >= 1 ? "+" : "−"}${Math.abs(Math.round((s.fx - 1) * 100))}% vs avg</small></td><td class="n"><b>${f1(s.proj)}</b></td></tr>`;
    })()).join("")}</tbody></table>
      <p class="howto">${poAvg ? `Fantasy playoff schedule (weeks ${R.playoffStart}–${lastFantasy}): average opponent rank <b>#${Math.round(poAvg)}</b> against ${p.pos}s, which is <b>${grade(Math.round(poAvg))[0].toLowerCase()}</b>. ` : ""}Rank 1 = the defense that gives up the most fantasy points to ${p.pos}s. Projection = his points per game × how generous that defense is compared with average.</p>`;
  }
  function playerEvents() {
    $("#pmSearch").addEventListener("change", (e) => {
      const v = e.target.value.trim().toLowerCase();
      const hit = PL.find((x) => `${x.name} · ${x.pos} · ${x.team || "FA"}`.toLowerCase() === v) || PL.find((x) => x.name.toLowerCase().includes(v.split(" · ")[0]));
      if (hit) { pmId = hit.id; store.set("pmId", pmId); players(); e.target.value = ""; }
    });
    $("#pmMine").addEventListener("click", (e) => { const b = e.target.closest("[data-pid]"); if (b) { pmId = b.dataset.pid; store.set("pmId", pmId); players(); } });
  }

  // ================= this week =================
  function weekBoard() {
    $("#wkTitle").textContent = `Week ${thisWeek} matchup board`;
    const nflTeams = Object.keys(R.remaining);
    const col = (pos) => {
      const rows = nflTeams.map((t) => ({ t, g: gameOf(t, thisWeek) })).filter((x) => x.g && !x.g.bye).map((x) => ({ ...x, rank: R.ranks[x.g.opp][pos], v: R.vs[x.g.opp][pos] })).sort((a, b) => a.rank - b.rank);
      const li = (x) => `<li><b>${x.t}</b> ${oppLabel(x.g)} <span class="dg ${grade(x.rank)[1]}">#${x.rank}</span></li>`;
      return `<article class="panel wk-col"><h3>${pos === "DEF" ? "Defenses" : pos + "s"}</h3><p class="bw__k">Best matchups</p><ol>${rows.slice(0, 5).map(li).join("")}</ol><p class="bw__k">Toughest</p><ol>${rows.slice(-4).reverse().map(li).join("")}</ol></article>`;
    };
    $("#wkBoard").innerHTML = ["QB", "RB", "WR", "TE", "DEF"].map(col).join("");
    const mine = myPlayers.map((p) => { const g = gameOf(p.team, thisWeek); return { p, g, rank: g && !g.bye ? R.ranks[g.opp][p.pos] : null }; });
    $("#wkMine").innerHTML = `<table class="dgrid"><thead><tr><th>Your player</th><th>Opponent</th><th>Matchup</th><th class="n">Pts/gm</th><th class="n">This week</th></tr></thead><tbody>${mine.map(({ p, g, rank }) => `<tr><td><b>${esc(p.name)}</b> <small class="muted">${p.pos} · ${p.team || "FA"}</small></td><td>${oppLabel(g)}</td><td>${rank ? `<span class="dg ${grade(rank)[1]}">${grade(rank)[0]}</span> <small class="muted">#${rank}</small>` : "–"}</td><td class="n">${f1(p.ppg)}</td><td class="n"><b>${rank ? f1(p.ppg * factor(p.pos, g.opp)) : "–"}</b></td></tr>`).join("")}</tbody></table>`;
  }

  // ================= hub =================
  function hub() {
    const meT = cur.teams.find((t) => t.rid === cur.myRid);
    const pace = (k) => (meT[k] / cur.weeksDone) * cur.regEnd;
    const recOf = (k) => Math.max(...D.seasons.filter((s) => s.weeksDone >= s.regEnd).flatMap((s) => s.teams.map((t) => t[k])));
    const pf = pace("pf"), pa = pace("pa"), rpf = recOf("pf"), rpa = recOf("pa");
    const next = cur.schedule.find((w) => w.week === cur.weeksDone + 1);
    const pair = next && next.pairs.find((x) => x.includes(cur.myRid));
    const oppT = pair && cur.teams.find((t) => t.rid === (pair[0] === cur.myRid ? pair[1] : pair[0]));
    const o = B.odds && B.odds[cur.myRid];
    const bestDef = R.defenses.filter((d) => !d.owner || d.owner.mine).map((d) => ({ d, v: defProj(d.team, thisWeek) })).filter((x) => x.v != null).sort((a, b) => b.v - a.v)[0];
    const hot = PL.filter((p) => !p.owner && p.g >= 3 && ["RB", "WR", "TE"].includes(p.pos)).sort((a, b) => b.last3 - a.last3).slice(0, 3);
    const cards = [
      ["#/luck/records", "Records", pf > rpf ? `On pace to break the scoring record` : `Scoring pace: ${f0(pf)}`, `Points for: ${f0(pf)} pace vs. ${f0(rpf)} record. Points against: ${f0(pa)} vs. ${f0(rpa)}.`, pf > rpf || pa > rpa ? "gold" : ""],
      ["#/race/odds", "Playoff race", o ? `${pct(o.po)} playoffs · ${pct(o.div)} bye` : "Season complete", `You're ${meT.w}–${meT.l}.${oppT ? ` Next: ${esc(oppT.name)} (${oppT.w}–${oppT.l}).` : ""}`, ""],
      ["#/research/defense", "Defense lab", bestDef ? `Best available this week: ${bestDef.d.team}` : "Compare defenses", bestDef ? `${oppLabel(gameOf(bestDef.d.team, thisWeek))} · projects ${f1(bestDef.v)}. ${bestDef.d.owner ? "Already yours." : "On waivers."}` : "", ""],
      ["#/research/players", "Player matchups", "Schedules for any player", hot.length ? `Hot on waivers: ${hot.map((p) => `${esc(p.name)} (${f1(p.last3)} last 3)`).join(", ")}.` : "", ""],
      ["#/research/week", `Week ${thisWeek} board`, "Best and worst matchups", "By position, plus every one of your players.", ""],
      ["#/keepers/mine", "Keepers", "Plan 2027", "Your three keepers, one verdict per player, and who should have been kept before.", ""],
    ];
    $("#hubGrid").innerHTML = cards.map(([href, k, v, t, c]) => `<a class="hubcard ${c ? "hubcard--" + c : ""}" href="${href}"><span class="hubcard__k">${k}</span><span class="hubcard__v">${v}</span><span class="hubcard__t">${t}</span><span class="tile__go" aria-hidden="true">→</span></a>`).join("");
  }

  hub(); defenseLab(); defenseEvents(); players(); playerEvents(); weekBoard();
  $("#rSub").textContent = `Through week ${R.done} of ${R.season}. Every number uses your league's scoring.`;
})();
