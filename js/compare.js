/* Compare teams: any two team-seasons, lineup role by role, plus a league-history leaderboard. */
(() => {
  "use strict";
  const B = window.BBNF;
  const C = B && B.D.compare;
  if (!C || !document.getElementById("r-compare")) return;
  const { $, esc, f1, ord } = B;
  const T = C.teams;
  const key = (t) => `${t.season}:${t.rid}`;
  const byKey = Object.fromEntries(T.map((t) => [key(t), t]));
  const store = { get(k, d) { try { const v = localStorage.getItem("bbnf:" + k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem("bbnf:" + k, JSON.stringify(v)); } catch { /* private mode */ } } };
  const done = T.filter((t) => !t.partial);
  const rec = (done.length ? done : T).reduce((a, t) => (t.pf > a.pf ? t : a));
  const meNow = T.filter((t) => t.mine).sort((a, b) => b.season.localeCompare(a.season))[0];
  let A = store.get("cmpA", key(rec)), Bk = store.get("cmpB", meNow ? key(meNow) : key(T[0]));
  if (!byKey[A]) A = key(rec);
  if (!byKey[Bk]) Bk = meNow ? key(meNow) : key(T[0]);

    const GROUPS = ["QB", "RB", "WR", "TE", "K", "DEF"];
  const label = (t) => `${t.season} · ${t.name} (${t.w}–${t.l})${t.partial ? " · in progress" : ""}`;
  const fin = (f, pos) => (f ? `${pos === "DEF" ? "DST" : pos}${f.rank}` : "–");
  const placeTxt = (t) => (t.partial ? `in progress (${t.weeks} wks)` : t.place ? `finished ${ord(t.place)}` : "missed playoffs");

  function options() {
    const seasons = [...new Set(T.map((t) => t.season))].sort().reverse();
    return seasons.map((s) => `<optgroup label="${s}">${T.filter((t) => t.season === s).sort((a, b) => b.ppg - a.ppg).map((t) => `<option value="${key(t)}">${esc(t.name)} (${t.w}–${t.l}) · ${f1(t.ppg)}/wk</option>`).join("")}</optgroup>`).join("");
  }

  function head(t, side) {
    return `<article class="cmp-team cmp-team--${side}">
      <p class="cmp-team__k">${side === "a" ? "Team A" : "Team B"} · ${t.season}${t.mine ? " · you" : ""}</p>
      <h3>${esc(t.name)}</h3>
      <dl><div><dt>Record</dt><dd>${t.w}–${t.l}</dd></div><div><dt>Pts / week</dt><dd>${f1(t.ppg)}</dd></div><div><dt>League rank</dt><dd>${ord(t.rank)}</dd></div><div><dt>Result</dt><dd class="small">${placeTxt(t)}</dd></div></dl>
    </article>`;
  }

  function render() {
    const a = byKey[A], b = byKey[Bk];
    $("#cmpA").value = A; $("#cmpB").value = Bk;
    $("#cmpHeads").innerHTML = head(a, "a") + `<div class="cmp-vs" aria-hidden="true">vs</div>` + head(b, "b");

    // season lineup: each slot is one player, the team's best at that position over the season
    const slotsOf = (t) => (t.lineup || []).map((x) => x.slot);
    const roles = [...new Set([...slotsOf(a), ...slotsOf(b)])];
    const pick = (t, r) => ((t.lineup || []).find((x) => x.slot === r) || {}).player;
    const maxD = Math.max(3, ...roles.map((r) => Math.abs((pick(a, r)?.avg || 0) - (pick(b, r)?.avg || 0))));
    const posLbl = (p) => (p.pos === "DEF" ? "DST" : p.pos);
    const cell = (t, r) => {
      const p = pick(t, r);
      if (!p) return "<b>–</b><small>nobody</small>";
      return `<span class="cmp-name">${esc(p.name)}</span><b>${f1(p.avg)}</b><small>${p.finish ? `finished <strong>${posLbl(p)}${p.finish.rank}</strong> in the league` : "not enough games to rank"} · ${p.starts} start${p.starts === 1 ? "" : "s"}</small>`;
    };
    const total = (t) => roles.reduce((s, r) => s + (pick(t, r)?.avg || 0), 0);
    const ta = total(a), tb = total(b);
    $("#cmpRoles").innerHTML = `<table class="cmp-table"><thead><tr><th>Slot</th><th class="n">${esc(a.name)} '${a.season.slice(2)}</th><th class="cmp-diffh">Edge</th><th>${esc(b.name)} '${b.season.slice(2)}</th></tr></thead><tbody>${roles.map((r) => {
      const va = pick(a, r)?.avg || 0, vb = pick(b, r)?.avg || 0, d = vb - va, w = (Math.abs(d) / maxD) * 50;
      return `<tr><th scope="row">${r === "DEF" ? "D/ST" : r}</th><td class="n">${cell(a, r)}</td><td class="cmp-diff"><span class="cmp-bar"><i class="${d >= 0 ? "b" : "a"}" style="width:${w}%"></i></span><small>${Math.abs(d) < 0.05 ? "even" : `${d > 0 ? "B" : "A"} +${f1(Math.abs(d))}`}</small></td><td>${cell(b, r)}</td></tr>`;
    }).join("")}
      <tr class="cmp-total"><th scope="row">Lineup</th><td class="n"><b>${f1(ta)}</b><small>actual: ${f1(a.ppg)} pts/wk</small></td><td class="cmp-diff"><small>${Math.abs(tb - ta) < 0.05 ? "even" : `${tb > ta ? "B" : "A"} +${f1(Math.abs(tb - ta))}`}</small></td><td><b>${f1(tb)}</b><small>actual: ${f1(b.ppg)} pts/wk</small></td></tr></tbody></table>
      <p class="howto">Your league's lineup: QB, RB, RB, WR, WR, TE, FLEX, FLEX, K, D/ST. Each slot is one player for the whole season: the team's best player at that position, by points scored as a starter <i>for that team</i>. WR1 is their top receiver, WR2 the next, and the flex spots go to the best RB/WR/TE left over. The number is his points per game as a starter. "Finished WR3" is where he ranked among every receiver in the league that year by points per game. "Lineup" adds up those per-game numbers, a full-strength week; "actual" is what the team really averaged with injuries, byes and lineup choices.</p>`;

    // depth charts
    const depth = (t) => GROUPS.map((pos) => {
      const list = (t.depth && t.depth[pos]) || [];
      return `<div class="cmp-pos"><p class="bw__k">${pos === "DEF" ? "D/ST" : pos} <span class="muted">· ${f1(t.groups[pos] || 0)}/wk, ${ord(t.groupRank?.[pos] || 0)}</span></p><ol>${list.slice(0, pos === "QB" || pos === "K" || pos === "DEF" ? 2 : pos === "TE" ? 2 : 4).map((p, i) => `<li><span class="cmp-role">${pos === "DEF" ? "DST" : pos}${i + 1}</span><b>${esc(p.name)}</b><small>${p.starts} start${p.starts === 1 ? "" : "s"} · ${f1(p.avg)}/gm as a starter · finished ${fin(p.finish, pos)}${p.finish ? ` (${f1(p.finish.ppg)}/gm)` : ""}</small></li>`).join("") || "<li class='muted'>–</li>"}</ol></div>`;
    }).join("");
    $("#cmpDepth").innerHTML = `<article class="panel"><header class="panel__head"><h3>${esc(a.name)} · ${a.season}</h3></header>${depth(a)}</article><article class="panel"><header class="panel__head"><h3>${esc(b.name)} · ${b.season}</h3></header>${depth(b)}</article>`;

    // leaderboard
    const rows = [...T].sort((x, y) => y.ppg - x.ppg);
    $("#cmpBoard").innerHTML = `<table><thead><tr><th class="n">#</th><th>Team</th><th>Season</th><th class="n">Record</th><th class="n">Pts/wk</th><th>Result</th><th>Compare</th></tr></thead><tbody>${rows.map((t, i) => `<tr class="${t.mine ? "is-me" : ""}"><td class="n">${i + 1}</td><td><b>${esc(t.name)}</b></td><td>${t.season}</td><td class="n">${t.w}–${t.l}</td><td class="n">${f1(t.ppg)}</td><td>${placeTxt(t)}</td><td><button type="button" class="dchip ${key(t) === A ? "on" : ""}" data-set="a" data-k="${key(t)}">A</button> <button type="button" class="dchip ${key(t) === Bk ? "on" : ""}" data-set="b" data-k="${key(t)}">B</button></td></tr>`).join("")}</tbody></table>`;
  }

  $("#cmpControls").innerHTML = `
    <label class="select"><span>Team A</span><select id="cmpA">${options()}</select></label>
    <button type="button" class="btn-ghost" id="cmpSwap" aria-label="Swap teams">⇄ Swap</button>
    <label class="select"><span>Team B</span><select id="cmpB">${options()}</select></label>
    <button type="button" class="btn-ghost" id="cmpRec">Record holder vs. me</button>`;
  const set = (side, k) => { if (side === "a") A = k; else Bk = k; store.set("cmpA", A); store.set("cmpB", Bk); render(); };
  $("#cmpA").addEventListener("change", (e) => set("a", e.target.value));
  $("#cmpB").addEventListener("change", (e) => set("b", e.target.value));
  $("#cmpSwap").addEventListener("click", () => { [A, Bk] = [Bk, A]; set("a", A); });
  $("#cmpRec").addEventListener("click", () => { A = key(rec); Bk = meNow ? key(meNow) : Bk; set("a", A); });
  $("#cmpBoard").addEventListener("click", (e) => { const b = e.target.closest("[data-set]"); if (b) { set(b.dataset.set, b.dataset.k); document.getElementById("cmpHeads").scrollIntoView({ block: "start" }); } });
  render();
})();
