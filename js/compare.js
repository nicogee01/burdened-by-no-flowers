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

  const ROLES = ["QB", "RB1", "RB2", "RB3", "WR1", "WR2", "WR3", "WR4", "TE1", "TE2", "K", "DEF"];
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

    // lineup roles
    const roles = ROLES.filter((r) => (a.roles[r] && a.roles[r].used >= 2) || (b.roles[r] && b.roles[r].used >= 2));
    const maxD = Math.max(3, ...roles.map((r) => Math.abs((a.roles[r]?.avg || 0) - (b.roles[r]?.avg || 0))));
    const cell = (t, r) => { const x = t.roles[r]; return x ? `<b>${f1(x.avg)}</b><small>#${x.rank} of ${T.filter((y) => y.season === t.season).length} that year${x.used < t.weeks ? ` · used ${x.used}/${t.weeks} wks` : ""}</small>` : `<b>–</b>`; };
    $("#cmpRoles").innerHTML = `<table class="cmp-table"><thead><tr><th>Slot</th><th class="n">${esc(a.name)} '${a.season.slice(2)}</th><th class="cmp-diffh">Edge</th><th>${esc(b.name)} '${b.season.slice(2)}</th></tr></thead><tbody>${roles.map((r) => {
      const va = a.roles[r]?.avg || 0, vb = b.roles[r]?.avg || 0, d = vb - va, w = (Math.abs(d) / maxD) * 50;
      return `<tr><th scope="row">${r}</th><td class="n">${cell(a, r)}</td><td class="cmp-diff"><span class="cmp-bar"><i class="${d >= 0 ? "b" : "a"}" style="width:${w}%"></i></span><small>${Math.abs(d) < 0.05 ? "even" : `${d > 0 ? "B" : "A"} +${f1(Math.abs(d))}`}</small></td><td>${cell(b, r)}</td></tr>`;
    }).join("")}
      <tr class="cmp-total"><th scope="row">Total</th><td class="n"><b>${f1(a.ppg)}</b></td><td class="cmp-diff"><small>${a.ppg === b.ppg ? "even" : `${b.ppg > a.ppg ? "B" : "A"} +${f1(Math.abs(b.ppg - a.ppg))}`}</small></td><td><b>${f1(b.ppg)}</b></td></tr></tbody></table>
      <p class="howto">Each week the starters are sorted by points within each position: the higher-scoring RB that week counts as RB1, the other as RB2, and an RB in a flex spot as RB3. Averages are per week played (a week without that slot counts as zero). "#1 of 10" is the slot's rank among that season's teams.</p>`;

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
