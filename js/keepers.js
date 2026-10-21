/* Keeper Lab: renders D.keepers (built by scripts/keepers.py). */
(() => {
  "use strict";
  const B = window.BBNF;
  if (!B || !B.D.keepers) return;
  const { D, $, esc, f1, sgn, ord, tm, tname, cur } = B;
  const K = D.keepers;
  const ME = String(cur.myRid);
  const T = K.teams, R = K.rounds, NP = T * R;
  const wpp = K.wpp.model;
  const REPL = K.repl;
  const POS4 = ["QB", "RB", "WR", "TE"];
  const f2 = (n) => (Math.round(n * 100) / 100).toFixed(2);
  const w2 = (n) => `${n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}`;
  const team = (rid) => tm(cur, rid);
  const posCls = (p) => `pos-${esc(p)}`;
  const lastName = (n) => n.split(" ").slice(-1)[0];
  const info = (t) => `<button class="info" type="button" aria-label="What does this mean?" data-tip="${esc(t)}">i</button>`;
  const store = {
    get(k, d) { try { const v = localStorage.getItem("bbnf:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("bbnf:" + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  // ---------------- pick pricing ----------------
  const pickNo = (r, s) => (r - 1) * T + (r % 2 ? s : T + 1 - s);
  const evAt = (r, s) => K.pickCurve[Math.min(pickNo(Math.min(Math.max(r, 1), R), s), NP) - 1] || 0;
  const evRound = (r) => { let a = 0; for (let s = 1; s <= T; s++) a += evAt(r, s); return a / T; };
  const odds = B.odds && B.odds[cur.myRid];
  let slot = store.get("slot", odds && odds.po >= 0.5 ? 7 : 3);
  const evFor = (rid, r) => (String(rid) === ME ? evAt(r, slot) : evRound(r));
  const roundFor = (value, rid) => { // earliest round whose pick is worth no more than `value`
    for (let r = 1; r <= R; r++) if (evFor(rid, r) <= value + 1e-9) return r;
    return null;
  };

  // ---------------- projections (with your overrides) ----------------
  let overrides = store.get("ppg", {});
  const implied = (r) => (r.proj > 0 && r.games ? REPL[r.pos] + r.proj / (r.games * wpp) : r.cur.g ? r.cur.ppg : REPL[r.pos] - 2);
  const projOf = (r) => (overrides[r.id] != null ? Math.max(0, (overrides[r.id] - REPL[r.pos]) * (r.games || 12) * wpp) : r.proj);
  const rowsFor = (rid) => (K.boards[rid] || []).map((r) => { const P = projOf(r), E = evFor(rid, r.cost); return { ...r, P, E, S: P - E, ov: overrides[r.id] != null }; });

  // keepers can't share a round: a collision pushes the later one back a round
  function slotted(list, rid) {
    const used = new Set();
    return list.map((r) => { let c = r.cost; while (used.has(c) && c < R) c++; used.add(c); const E = evFor(rid, c); return { ...r, slotR: c, E2: E, S2: r.P - E }; });
  }
  const bestThree = (rid) => slotted(rowsFor(rid).filter((r) => r.S > 0).sort((a, b) => b.S - a.S).slice(0, K.maxKeepers), rid);
  let myKeep = new Set(store.get("keep", null) || bestThree(ME).map((r) => r.id));

  function keptSets() {
    const out = {};
    for (const t of cur.teams) {
      const rid = String(t.rid);
      out[rid] = rid === ME ? slotted(rowsFor(ME).filter((r) => myKeep.has(r.id)).sort((a, b) => a.cost - b.cost), ME) : bestThree(rid);
    }
    return out;
  }
  function pool(kept) {
    const keptIds = new Set(Object.values(kept).flat().map((r) => r.id));
    return cur.teams.flatMap((t) => rowsFor(String(t.rid)).filter((r) => !keptIds.has(r.id) && r.P > 0).map((r) => ({ ...r, rid: String(t.rid) })))
      .sort((a, b) => b.P - a.P);
  }
  // pool players taken before your pick in round r: every pick ahead of yours, minus picks used by keepers
  function poolPicksBefore(r, kept) {
    const mine = pickNo(r, slot);
    let keepersAhead = 0;
    for (const [rid, list] of Object.entries(kept)) for (const k of list) {
      if (rid === ME) { if (pickNo(k.slotR, slot) < mine) keepersAhead++; }
      else if (k.slotR < r) keepersAhead++;
      else if (k.slotR === r) keepersAhead += (r % 2 ? slot - 1 : T - slot) / (T - 1);
    }
    return Math.max(0, mine - 1 - keepersAhead);
  }

  // ---------------- shared data ----------------
  const hist = K.history.filter((h) => POS4.includes(h.pos));
  const avg = (a, k = "surplus") => (a.length ? a.reduce((s, x) => s + x[k], 0) / a.length : 0);
  const stab = (p) => { const s = K.stability[p] || []; return s.length ? s.reduce((a, x) => a + x.r, 0) / s.length : null; };
  const stabWord = () => { const d = stab("WR") - stab("RB"); return Math.abs(d) < 0.05 ? "about equally predictable" : d > 0 ? "a bit more predictable" : "a bit less predictable"; };
  const pd = (pos, band) => K.posDraft.find((x) => x.pos === pos && x.band === band) || {};

  // ================= glossary =================
  function glossary() {
    const g = [
      ["Wins above replacement (WAR)", `How many extra wins a player adds over a free waiver-wire player at his position. 1.0 WAR is one extra win per season. In this league about ${Math.round(1 / wpp)} extra points over a season adds up to one win.`],
      ["Replacement level", `What you can pick up for free. Each week a player who scores more than that adds value; less, and you'd rather have the waiver guy. Current levels: RB ${f1(REPL.RB)}, WR ${f1(REPL.WR)}, TE ${f1(REPL.TE)}, QB ${f1(REPL.QB)} points per game.`],
      ["Pick worth (the price)", `What the draft pick you give up to keep a player usually turns into, in WAR, measured from this league's own drafts. Keeping someone in round 5 costs you a round-5 pick, worth about ${f2(evRound(5))} WAR.`],
      ["Surplus", `Projected WAR minus pick worth. It's the profit from keeping him instead of making the pick. +0.50 means he should add half a win more than whoever you'd draft there.`],
      ["Projection", `Next year's WAR, guessed from this season (counted twice) and last season (once), pulled slightly toward replacement when there are few games, with an age penalty for older RBs. You can replace it with your own guess.`],
      ["Redraft check", `If a player would still be on the board at your pick in the round he'd cost, keeping him gains nothing: you could draft him back with the same pick and save the keeper slot.`],
      ["On pace", `${K.season} numbers projected to a full ${cur.regEnd}-week season from the ${K.position[K.season].weeks} weeks played. They'll move as the season goes.`],
      ["n, hit %, r", `n is the sample size (how many players). Hit % is the share who produced half a win or more, about a top-12 RB/WR season. r is a correlation from 0 (no link) to 1 (perfect).`],
    ];
    $("#glossary").innerHTML = g.map(([k, t]) => `<article class="gloss__item reveal"><h3>${k}</h3><p>${t}</p></article>`).join("");
  }

  // ================= board =================
  let viewRid = ME;
  function slotUI() {
    const sel = $("#slotSel");
    sel.innerHTML = Array.from({ length: T }, (_, i) => `<option value="${i + 1}" ${i + 1 === slot ? "selected" : ""}>Pick ${i + 1}${i + 1 <= 4 ? " (missed playoffs)" : ""}</option>`).join("");
    sel.addEventListener("change", () => { slot = +sel.value; store.set("slot", slot); renderAll(); });
    const s26 = K.slots[K.season] || {};
    $("#slotNote").innerHTML = `<b>Why your draft slot matters:</b> in this league, teams that miss the playoffs get picks 1–4 (not strictly worst-first: the 1–13 team picked 4th in ${K.season}) and playoff teams get 5–10 in reverse order of finish. You picked ${ord(s26[ME] || 0)} in ${K.season}. ${odds ? `Right now you have a ${Math.round(odds.po * 100)}% chance of making the playoffs, so the default is pick ${odds.po >= 0.5 ? 7 : 3}.` : ""} Your slot changes which exact pick a keeper costs, and whether a player would still be there for you to redraft.`;
  }
  function board() {
    const kept = keptSets(), P = pool(kept);
    const isMe = viewRid === ME, t = team(viewRid);
    const rows = rowsFor(viewRid).sort((a, b) => b.S - a.S);
    const three = isMe ? kept[ME] : bestThree(viewRid);
    const ids = new Set(three.map((r) => r.id));
    $("#boardLede").innerHTML = `${isMe ? "Your" : esc(t.name) + "'s"} roster, priced for the ${K.next} draft. <b>Cost</b> is the pick you give up: one round earlier than where he was drafted this year, round 1 stays round 1, and waiver pickups cost round ${R}. <b>Surplus</b> is how many wins he should add over that pick. Up to ${K.maxKeepers} keepers; if two land in the same round, one slides back a round.`;
    $("#boardTop").innerHTML = three.length ? three.map((r, i) => `
      <article class="keep reveal">
        <span class="keep__n" aria-hidden="true">${i + 1}</span>
        <p class="keep__name">${esc(r.name)} <span class="${posCls(r.pos)}">${esc(r.pos)}</span></p>
        <p class="keep__cost">Round ${r.slotR}${isMe ? ` · pick ${pickNo(r.slotR, slot)}` : ""}${r.slotR !== r.cost ? ` <small>(slides from ${r.cost})</small>` : ""}</p>
        <dl class="keep__stats"><div><dt>Proj. WAR ${info("Projected wins above replacement next season.")}</dt><dd>${f2(r.P)}</dd></div><div><dt>Pick worth ${info("What that pick usually turns into, in WAR.")}</dt><dd>${f2(r.E2)}</dd></div><div><dt>Surplus</dt><dd class="${r.S2 >= 0 ? "up" : "down"}">${sgn(r.S2, 2)}</dd></div></dl>
        <p class="keep__note">${isMe ? "Your pick" : "Model's pick"} #${i + 1}${r.ov ? " · using your projection" : ""}</p>
      </article>`).join("") : `<p class="lede">Nobody on this roster projects to beat the pick he'd cost.</p>`;

    const max = Math.max(0.5, ...rows.map((r) => Math.abs(r.S)));
    $("#boardTable").innerHTML = `<table class="sortable board"><thead><tr>
      ${isMe ? `<th>Keep</th>` : ""}<th>Player</th><th>Acquired</th><th class="n">${K.next} cost</th><th class="n">${K.season} pts/gm</th>
      <th class="n">${isMe ? "Your pts/gm" : "Proj. pts/gm"} ${info(isMe ? "The points per game the projection assumes. Type your own number to override it; everything on the page updates." : "The points per game the projection assumes.")}</th>
      <th class="n">Proj. WAR</th><th class="n">Pick worth</th><th>Surplus</th>${isMe ? `<th>Redraft check ${info("If he weren't kept, where would he rank among available players, and would he still be there at your pick in that round?")}</th>` : ""}</tr></thead><tbody>${rows.map((r) => {
      let redraft = "";
      if (isMe) {
        const keptNow = myKeep.has(r.id);
        const rank = keptNow || r.P <= 0 ? (r.P > 0 ? 1 + P.filter((p) => p.P > r.P).length : null) : 1 + P.findIndex((p) => p.id === r.id);
        const before = poolPicksBefore(r.cost, kept);
        if (!rank) redraft = `<span class="muted">Not draftable value</span>`;
        else if (rank > before) redraft = `<span class="flag flag--warn">Likely still there at pick ${pickNo(r.cost, slot)}</span><small>pool #${rank}; about ${Math.round(before)} taken before your pick. Keeping him gains little.</small>`;
        else redraft = `<span class="flag flag--ok">Gone before your pick</span><small>pool #${rank}; about ${Math.round(before)} taken before pick ${pickNo(r.cost, slot)}</small>`;
      }
      const notes = [r.exp != null && r.exp <= 1 ? `${r.exp === 0 ? "Rookie" : "2nd-year"}: model can't see growth` : "", r.pos === "RB" && r.depth > 1 ? "Backup on depth chart" : "", r.injury ? `Injury: ${r.injury}` : "", r.age && r.pos === "RB" && r.age >= 28 ? "Age 28+: trimmed 15%" : ""].filter(Boolean);
      return `<tr class="${ids.has(r.id) ? "is-keep" : ""}">
        ${isMe ? `<td><input type="checkbox" class="keepbox" data-id="${esc(r.id)}" ${myKeep.has(r.id) ? "checked" : ""} aria-label="Keep ${esc(r.name)}"></td>` : ""}
        <td><b>${esc(r.name)}</b> <span class="asset__pos ${posCls(r.pos)}">${esc(r.pos)} · ${esc(r.team)}${r.age ? " · age " + r.age : ""}</span>${notes.length ? `<br><small class="note">${notes.map(esc).join(" · ")}</small>` : ""}</td>
        <td>${r.via === "free agent" ? "Waivers" : r.wasKeeper ? `Kept, rd ${r.draftRound}` : `Drafted rd ${r.draftRound}`}</td>
        <td class="n">Rd ${r.cost}${isMe ? `<br><small class="muted">pick ${pickNo(r.cost, slot)}</small>` : ""}</td>
        <td class="n">${r.cur.g ? f1(r.cur.ppg) : "–"}<small class="muted"> ${r.cur.g}g</small></td>
        <td class="n">${isMe ? `<input class="ppg" type="number" inputmode="decimal" step="0.5" min="0" max="40" data-id="${esc(r.id)}" value="${f1(overrides[r.id] ?? implied(r))}" aria-label="Your points per game for ${esc(r.name)}">${r.ov ? `<button class="reset" type="button" data-reset="${esc(r.id)}" aria-label="Reset ${esc(r.name)} to the model">↺</button>` : ""}` : f1(implied(r))}</td>
        <td class="n">${f2(r.P)}</td>
        <td class="n">${f2(r.E)}</td>
        <td class="sbar"><span class="sbar__track"><i class="${r.S >= 0 ? "pos" : "neg"}" style="width:${(Math.abs(r.S) / max) * 50}%"></i></span><span class="sbar__v">${sgn(r.S, 2)}</span></td>
        ${isMe ? `<td class="redraft">${redraft}</td>` : ""}
      </tr>`; }).join("")}</tbody></table>`;
    $("#boardHow").innerHTML = `<p><b>How to read a row:</b> a player who'd score at "Proj. pts/gm" next year adds "Proj. WAR" wins over a waiver pickup. "Pick worth" is what you'd usually get with the pick he costs. The surplus bar is the difference: gold means keeping him beats making the pick; red means you'd do better to draft.</p>${isMe ? `<p><b>Make it yours:</b> tick up to ${K.maxKeepers} boxes to choose keepers, and type a points-per-game number to override the model (your inputs are saved in this browser).</p>` : ""}`;
    if (isMe) {
      $("#boardTable").querySelectorAll(".keepbox").forEach((b) => b.addEventListener("change", () => {
        if (b.checked && myKeep.size >= K.maxKeepers) { b.checked = false; b.closest("td").classList.add("shake"); setTimeout(() => b.closest("td").classList.remove("shake"), 400); return; }
        b.checked ? myKeep.add(b.dataset.id) : myKeep.delete(b.dataset.id);
        store.set("keep", [...myKeep]); renderAll(false);
      }));
      $("#boardTable").querySelectorAll(".ppg").forEach((inp) => inp.addEventListener("change", () => {
        const v = parseFloat(inp.value);
        if (isNaN(v)) delete overrides[inp.dataset.id]; else overrides[inp.dataset.id] = v;
        store.set("ppg", overrides); renderAll(false);
      }));
      $("#boardTable").querySelectorAll("[data-reset]").forEach((b) => b.addEventListener("click", () => { delete overrides[b.dataset.reset]; store.set("ppg", overrides); renderAll(false); }));
    }
    sortable($("#boardTable table"));
  }

  // ================= build your three =================
  function build() {
    const all = rowsFor(ME);
    const byName = (n) => all.find((r) => r.name === n);
    const model = bestThree(ME).map((r) => r.id);
    const studs = [...all].sort((a, b) => b.P - a.P).slice(0, K.maxKeepers).map((r) => r.id);
    const cheap = all.filter((r) => r.cost >= 5).sort((a, b) => b.S - a.S).slice(0, K.maxKeepers).map((r) => r.id);
    // model's best, skipping anyone you could redraft with the same pick (checked with none of your players kept)
    const others = keptSets(); others[ME] = [];
    const P0 = pool(others), claimed = new Set();
    const redraftable = new Set();
    [...all].sort((a, b) => b.P - a.P).forEach((r) => {
      const rank = 1 + P0.findIndex((p) => p.id === r.id);
      if (rank > 0 && rank > poolPicksBefore(r.cost, others) && !claimed.has(r.cost)) { redraftable.add(r.id); claimed.add(r.cost); }
    });
    const smart = slotted(all.filter((r) => r.S > 0 && !redraftable.has(r.id)).sort((a, b) => b.S - a.S).slice(0, K.maxKeepers), ME).map((r) => r.id);
    const presets = [["Model's best", model], ["Model, skipping who I can redraft", smart], ["Biggest names", studs], ["No early picks (round 5+)", cheap]];
    const yours = ["Matthew Golden", "Javonte Williams", "Christian Watson"].map(byName);
    if (yours.every(Boolean)) presets.splice(1, 0, ["Golden · Williams · Watson", yours.map((r) => r.id)]);
    $("#presets").innerHTML = presets.map(([n], i) => `<button type="button" class="chip-btn" data-preset="${i}">${esc(n)}</button>`).join("");
    $("#presets").onclick = (e) => { const b = e.target.closest("[data-preset]"); if (!b) return; myKeep = new Set(presets[+b.dataset.preset][1]); store.set("keep", [...myKeep]); renderAll(false); };

    const kept = keptSets(), mine = kept[ME], P = pool(kept);
    const sum = (a, k) => a.reduce((s, r) => s + r[k], 0);
    const mset = slotted(all.filter((r) => model.includes(r.id)).sort((a, b) => a.cost - b.cost), ME);
    const diff = sum(mine, "S2") - sum(mset, "S2");
    const adj = (set) => set.reduce((a, r) => a + (redraftable.has(r.id) ? 0 : r.S2), 0);
    const adjMine = adj(mine), adjModel = adj(mset);
    const usedR = new Set(mine.map((r) => r.slotR));
    const free = Array.from({ length: R }, (_, i) => i + 1).filter((r) => !usedR.has(r));
    const firstFree = free[0];
    const wasted = mine.filter((r) => { const rank = 1 + P.filter((p) => p.P > r.P).length; return rank > poolPicksBefore(r.slotR, kept); });
    const bestAt = (r) => { const n = Math.round(poolPicksBefore(r, kept)); return P[n] ? `${P[n].name} (${P[n].pos}, ${f2(P[n].P)} WAR)` : "–"; };
    const top = P.slice(0, 3).map((p) => `${p.name} (${p.pos})`).join(", ");
    $("#build").innerHTML = `
      <div class="build__set">${mine.length ? mine.map((r) => `<div class="build__k"><span class="${posCls(r.pos)}">${esc(r.pos)}</span><b>${esc(r.name)}</b><small>Round ${r.slotR} · pick ${pickNo(r.slotR, slot)}</small><span class="build__s ${r.S2 >= 0 ? "up" : "down"}">${sgn(r.S2, 2)}</span></div>`).join("") : `<p class="muted">No keepers ticked yet.</p>`}</div>
      <div class="build__sum">
        <div><span class="k">Keepers' projected WAR</span><b>${f2(sum(mine, "P"))}</b></div>
        <div><span class="k">Value of picks given up</span><b>${f2(sum(mine, "E2"))}</b></div>
        <div class="${diff >= -0.005 ? "good" : "bad"}"><span class="k">Net surplus</span><b>${sgn(sum(mine, "S2"), 2)}</b><small>${Math.abs(diff) < 0.005 ? "same as the model's set" : `${sgn(diff, 2)} vs. the model's set`}</small></div>
        <div class="build__adj ${adjMine >= adjModel - 0.005 ? "good" : "bad"}"><span class="k">Redraft-adjusted ${info("Same total, but a keeper you could have drafted back with that same pick counts as zero, because keeping him gained nothing. This is the fairer comparison when you pick early.")}</span><b>${sgn(adjMine, 2)}</b><small>model's set: ${sgn(adjModel, 2)}${redraftable.size ? ` · redraftable: ${[...redraftable].map((id) => lastName(all.find((r) => r.id === id).name)).join(", ")}` : ""}</small></div>
      </div>
      <div class="build__notes">
        <p><b>Picks you keep:</b> rounds ${free.slice(0, 8).join(", ")}${free.length > 8 ? "…" : ""}. Your first selection is pick ${pickNo(firstFree, slot)} (round ${firstFree}). If nobody else's keepers surprise you, the best player left there should be about <b>${esc(bestAt(firstFree))}</b>.</p>
        ${wasted.length ? `<p class="warn"><b>Redraft warning:</b> ${wasted.map((r) => esc(r.name)).join(", ")} would probably still be on the board at your round-${wasted[0].slotR} pick. Keeping ${wasted.length > 1 ? "them" : "him"} uses a slot you could spend on someone you'd otherwise lose.</p>` : ""}
        <p>The pool's best players if this is how everyone keeps: ${esc(top)}. Full list below.</p>
        <p class="muted">The math: net surplus = what your keepers produce minus what those picks usually produce. The picks you <i>don't</i> spend are already counted, because the pick values are the baseline for everyone. A higher net surplus means more wins next year from the same draft.</p>
      </div>`;
  }

  // ================= pool + market =================
  let poolPos = "All";
  function poolAndMarket() {
    const kept = keptSets(), P = pool(kept);
    const rows = P.filter((p) => poolPos === "All" || p.pos === poolPos).slice(0, 20);
    const firstPick = poolPicksBefore(1, kept);
    $("#poolSub").textContent = `About ${Math.round(firstPick)} pool players go before your first-round pick (#${slot}). Those above the dashed line are likely gone.`;
    $("#poolTable").innerHTML = `<div class="table-wrap"><table><thead><tr><th class="n">#</th><th>Player</th><th>2026 team</th><th class="n">Proj. WAR</th></tr></thead><tbody>${rows.map((p) => { const rank = 1 + P.indexOf(p); return `<tr class="${p.rid === ME ? "is-me" : ""} ${rank === Math.round(firstPick) ? "cut" : ""}"><td class="n">${rank}</td><td><b>${esc(p.name)}</b> <span class="asset__pos ${posCls(p.pos)}">${esc(p.pos)} · ${esc(p.team)}${p.age ? " · " + p.age : ""}</span></td><td>${esc(team(p.rid).name)}</td><td class="n">${f2(p.P)}</td></tr>`; }).join("")}</tbody></table></div>`;
    const market = cur.teams.filter((t) => String(t.rid) !== ME).flatMap((t) => {
      const rid = String(t.rid), ids = new Set(kept[rid].map((r) => r.id));
      return rowsFor(rid).filter((r) => r.S > 0 && !ids.has(r.id)).map((r) => {
        const toMe = r.P - evAt(r.cost, slot);
        return { ...r, rid, toMe, upTo: roundFor(toMe, ME) };
      });
    }).filter((r) => r.toMe > 0).sort((a, b) => b.toMe - a.toMe).slice(0, 12);
    $("#marketTable").innerHTML = market.length ? `<div class="table-wrap"><table><thead><tr><th>Player</th><th>Team</th><th class="n">Keeper cost</th><th class="n">Worth to you ${info("His surplus if you kept him at his cost round with your draft slot.")}</th><th class="n">Offer up to ${info("The earliest pick you could give up and still come out ahead.")}</th></tr></thead><tbody>${market.map((r) => `<tr><td><b>${esc(r.name)}</b> <span class="asset__pos ${posCls(r.pos)}">${esc(r.pos)}${r.age ? " · " + r.age : ""}</span></td><td>${esc(team(r.rid).name)}</td><td class="n">Rd ${r.cost}</td><td class="n">${sgn(r.toMe, 2)}</td><td class="n"><b>${r.upTo ? "Rd " + r.upTo : "Rd " + R}</b></td></tr>`).join("")}</tbody></table></div><p class="howto">These teams already have three better keepers, so to them these players are worth nothing unless they trade them. Any pick is a gain for the seller. "Offer up to" is your ceiling, not your opening bid.</p>` : `<p class="muted">No obvious surplus keepers on other rosters right now.</p>`;
  }

  // ================= trade price guide =================
  function priceGuide() {
    const kept = keptSets();
    const opts = cur.teams.map((t) => `<optgroup label="${esc(t.name)}">${rowsFor(String(t.rid)).filter((r) => r.P > 0).map((r) => `<option value="${t.rid}|${esc(r.id)}">${esc(r.name)} · ${esc(r.pos)} · rd ${r.cost}</option>`).join("")}</optgroup>`).join("");
    const prev = $("#pgPlayer") && $("#pgPlayer").value;
    $("#priceGuide").innerHTML = `
      <div class="panel price__in">
        <label class="field"><span>Player</span><select id="pgPlayer">${opts}</select></label>
        <div id="pgOut" aria-live="polite"></div>
      </div>
      <div class="panel price__cook" id="pgCook"></div>`;
    const sel = $("#pgPlayer");
    const exists = (v) => [...sel.options].some((o) => o.value === v);
    if (prev && exists(prev)) sel.value = prev;
    else { const m = cur.teams.filter((t) => String(t.rid) !== ME).flatMap((t) => rowsFor(String(t.rid)).filter((r) => r.S > 0 && !kept[String(t.rid)].some((k) => k.id === r.id)).map((r) => `${t.rid}|${r.id}`)); if (m[0] && exists(m[0])) sel.value = m[0]; }
    const go = () => {
      if (!sel.value) return;
      const [rid, id] = sel.value.split("|");
      const r = rowsFor(rid).find((x) => x.id === id), owner = team(rid), isMine = rid === ME;
      const buyerVal = r.P - (isMine ? evRound(r.cost) : evAt(r.cost, slot));
      const ids = kept[rid].map((k) => k.id), inTop = ids.includes(id);
      const next = rowsFor(rid).filter((x) => !ids.includes(x.id) && x.S > 0).sort((a, b) => b.S - a.S)[0];
      const sellerLoss = inTop ? Math.max(0, r.S - (next ? next.S : 0)) : 0;
      const maxR = roundFor(buyerVal, isMine ? "x" : ME), minR = sellerLoss > 0 ? roundFor(sellerLoss, rid) : null;
      const zone = buyerVal <= 0 ? `No deal makes sense: he isn't worth more than the round-${r.cost} pick he'd cost a buyer.`
        : sellerLoss <= 0 ? `${esc(owner.name)}${isMine ? " (you)" : ""} isn't projected to keep him, so any pick is a gain for the seller. The buyer shouldn't give up anything better than a <b>round-${maxR || R}</b> pick.`
        : minR && maxR && minR < maxR ? `The seller should want at least a round-${minR} pick and the buyer shouldn't pay more than a round-${maxR}: no overlap, so a fair deal is unlikely.`
        : `Deal zone: between a <b>round-${maxR || R}</b> pick (the buyer's limit) and a <b>round-${minR || R}</b> pick (the seller's minimum).`;
      $("#pgOut").innerHTML = `
        <div class="pg">
          <div><span class="k">Worth to a buyer ${info(isMine ? "His surplus for a buyer with an average draft slot." : "His surplus if you kept him at his cost round, with your draft slot.")}</span><b>${sgn(buyerVal, 2)}</b><small>${f2(r.P)} WAR vs. a round-${r.cost} pick</small></div>
          <div><span class="k">Buyer's max price</span><b>${buyerVal > 0 ? "Rd " + (maxR || R) : "–"}</b><small>earliest pick still worth it</small></div>
          <div><span class="k">Seller gives up ${info("If he'd be one of the seller's three keepers, trading him costs the seller his surplus minus their next-best keeper option. Otherwise it costs nothing.")}</span><b>${f2(sellerLoss)}</b><small>${inTop ? `he's in ${esc(owner.name)}'s top 3` : "not in their top 3"}</small></div>
        </div>
        <p class="pg__zone">${zone}</p>`;
    };
    sel.addEventListener("change", go); go();

    const c = K.keeperTrades.find((t) => t.player === "James Cook");
    if (c) {
      const exp = c.projBefore - c.evKeep, maxR = roundFor(exp, "x");
      $("#pgCook").innerHTML = `<p class="eyebrow" style="margin:0 0 6px">Your question</p><h3>What should you have taken for James Cook?</h3>
        <ul class="pg__list">
          <li><b>Your side:</b> you weren't keeping him, so to you he was worth zero. Any pick at all was profit. Your floor was a round-${R}.</li>
          <li><b>Their side:</b> before the draft, the model valued Cook kept in round ${c.keepRound} at ${sgn(exp, 2)} wins over a normal round-${c.keepRound} pick. The most it made sense for them to pay was about a <b>round-${maxR || R}</b> pick (worth ${f2(evRound(maxR || R))}).</li>
          <li><b>What happened:</b> you got a round-6 (worth ${f2(evRound(6))}), more than the model's limit. So you didn't undersell. They valued Cook more than the model did, and so far he's played like it (${f2(c.war)} WAR on pace).</li>
          <li><b>Rule of thumb for next time:</b> when you're selling someone you won't keep, open around the buyer's limit (here, a round ${Math.max(1, (maxR || R) - 3)}–${maxR || R} pick). Anything from that range down to a late pick is still a win for you, so don't let a round or two kill the deal.</li>
        </ul>`;
    } else $("#pgCook").hidden = true;
  }

  // ================= past keeper trades =================
  function keeperTrades() {
    const pickFate = (seller, buyer, season, round) => {
      for (const t of D.trades) for (const sd of t.sides) if (sd.rid === seller) for (const p of sd.picks) if (p.season === season && p.round === round && p.orig === buyer && p.status === "used") return `${p.became.player.name} (${f1(p.pts)} pts for ${team(seller).name})`;
      return null;
    };
    const rows = [...K.keeperTrades].sort((a, b) => (String(b.from) === ME || String(b.to) === ME) - (String(a.from) === ME || String(a.to) === ME) || b.season.localeCompare(a.season));
    $("#keeperTrades").innerHTML = rows.map((t) => {
      const paid = t.paid.reduce((a, p) => a + p.ev, 0), back = t.picksBack.reduce((a, p) => a + p.ev, 0);
      const expS = t.projBefore - t.evKeep, actS = t.war - t.evKeep;
      const buyerExp = expS - paid + back, buyerAct = actS - paid + back;
      const mine = String(t.from) === ME || String(t.to) === ME;
      const fates = t.paid.map((p) => pickFate(t.from, t.to, p.season, p.round)).filter(Boolean);
      const fair = expS > 0 ? roundFor(expS, "x") : null;
      return `<article class="ktrade ${mine ? "is-mine" : ""} reveal">
        <header><span class="trade__when">${t.season} preseason${mine ? " · your trade" : ""}</span><h3>${esc(t.player)} <span class="${posCls(t.pos)}">${esc(t.pos)}</span></h3>
        <p>${esc(team(t.from).name)} → ${esc(team(t.to).name)}, who kept him in round ${t.keepRound}. Buyer paid: ${t.paid.length ? t.paid.map((p) => `${p.season} round ${p.round}`).join(" + ") : "no picks"}${t.picksBack.length ? `; got back round ${t.picksBack.map((p) => p.round).join(" + ")}` : ""}${t.playersBack.length ? `; players also moved: ${t.playersBack.map(esc).join(", ")}` : ""}.</p></header>
        <div class="ktrade__grid">
          <div><span class="k">Keeper value, expected ${info("Before the season: the model's projected WAR minus the value of the pick he was kept with.")}</span><b>${sgn(expS, 2)}</b><small>${f2(t.projBefore)} WAR vs. a round-${t.keepRound} pick (${f2(t.evKeep)})</small></div>
          <div><span class="k">Picks paid ${info("The usual WAR of the picks the buyer sent, minus any picks they got back.")}</span><b>${paid ? "−" + f2(paid) : "0.00"}</b><small>${back ? `+${f2(back)} back` : fair ? `fair price ≈ round ${fair}` : "keeping him wasn't worth more than the pick"}</small></div>
          <div class="${buyerExp >= 0 ? "good" : "bad"}"><span class="k">Buyer, expected</span><b>${sgn(buyerExp, 2)}</b><small>before the season</small></div>
          <div class="${buyerAct >= 0 ? "good" : "bad"}"><span class="k">Buyer, ${t.partial ? "on pace" : "actual"}</span><b>${sgn(buyerAct, 2)}</b><small>${f2(t.war)} WAR ${t.partial ? "on pace" : ""}</small></div>
        </div>
        ${fates.length ? `<p class="ktrade__note">Seller's pick became <b>${esc(fates.join(", "))}</b>.</p>` : ""}
      </article>`;
    }).join("") || `<p class="lede">No pick-for-keeper trades found.</p>`;
  }

  // ================= calculator =================
  function calc() {
    const pool0 = rowsFor(ME);
    if (!pool0.length) { $("#k-calc").hidden = true; return; }
    const prev = $("#cPlayer") && $("#cPlayer").value;
    const def = pool0.find((r) => r.id === prev) || pool0.find((r) => r.name === "Matthew Golden") || pool0.find((r) => r.name === "Carnell Tate") || pool0[0];
    const tops = K.position[K.complete[K.complete.length - 1]].tops;
    $("#calc").innerHTML = `
      <div class="calc__in panel">
        <label class="field"><span>Player</span><select id="cPlayer">${pool0.map((r) => `<option value="${esc(r.id)}" ${r.id === def.id ? "selected" : ""}>${esc(r.name)} · ${esc(r.pos)} · round ${r.cost}</option>`).join("")}</select></label>
        <label class="field"><span>Points per game next year <output id="cPpgOut"></output></span><input type="range" id="cPpg" min="4" max="30" step="0.5"></label>
        <label class="field"><span>Games played <output id="cGOut"></output></span><input type="range" id="cG" min="4" max="${cur.regEnd - 1}" step="1" value="${Math.min(12, cur.regEnd - 1)}"></label>
        <div class="tiers" id="cTiers"></div>
        <p class="howto" style="margin:0">Benchmarks are last full season's points per game for the 1st, 6th, 12th and 24th best player at his position. Tap one to try it.</p>
      </div>
      <div class="calc__out" id="cOut" aria-live="polite"></div>`;
    const sel = $("#cPlayer"), ppg = $("#cPpg"), g = $("#cG");
    const setDefault = () => { const r = pool0.find((x) => x.id === sel.value); ppg.value = Math.max(4, Math.round((overrides[r.id] ?? (r.cur.g ? r.cur.ppg : REPL[r.pos])) * 2) / 2); };
    const rankOf = (pos, v) => { const list = tops[pos] || []; const i = list.findIndex((x) => x < v); return i === -1 ? `${list.length}+` : String(Math.max(i, 1)); };
    function render() {
      const r = pool0.find((x) => x.id === sel.value);
      const p = +ppg.value, games = +g.value;
      $("#cPpgOut").textContent = f1(p); $("#cGOut").textContent = games;
      const war = Math.max(0, (p - REPL[r.pos]) * games * wpp), cost = evAt(r.cost, slot), surplus = war - cost;
      const all3 = slotted(rowsFor(ME).filter((x) => x.id !== r.id && x.S > 0).sort((a, b) => b.S - a.S).slice(0, K.maxKeepers), ME);
      const bar = all3.length >= K.maxKeepers ? all3[K.maxKeepers - 1] : null, barS = bar ? bar.S2 : 0;
      const breakeven = REPL[r.pos] + (barS + cost) / (games * wpp);
      const beats = surplus > barS;
      $("#cTiers").innerHTML = `<p class="bw__k">${esc(r.pos)} benchmarks (pts/gm)</p>` + [1, 6, 12, 24].map((n) => { const v = tops[r.pos] && tops[r.pos][n - 1]; return v ? `<button type="button" class="chip-btn" data-ppg="${v}">${esc(r.pos)}${n} · ${f1(v)}</button>` : ""; }).join("");
      $("#cOut").innerHTML = `
        <div class="calc__big ${beats ? "good" : "bad"}"><span class="k">Surplus at round ${r.cost} (pick ${pickNo(r.cost, slot)})</span><span class="v">${sgn(surplus, 2)}</span><span class="d">wins above the pick he costs</span></div>
        <div class="calc__row"><span>Projected WAR at ${f1(p)} pts/gm</span><b>${f2(war)}</b></div>
        <div class="calc__row"><span>Pick ${pickNo(r.cost, slot)} is usually worth</span><b>${f2(cost)}</b></div>
        <div class="calc__row"><span>Bar to beat${bar ? `: ${esc(bar.name)}, your #${K.maxKeepers} otherwise` : ""}</span><b>${sgn(barS, 2)}</b></div>
        <div class="calc__row calc__row--hl"><span>Break-even</span><b>${f1(breakeven)} pts/gm</b></div>
        <p class="calc__verdict">${beats ? `At ${f1(p)} points a game, ${esc(r.name)} is a better keep than ${bar ? esc(bar.name) : "your third option"}.` : `${esc(r.name)} needs about <b>${f1(breakeven)}</b> points a game over ${games} games to beat ${bar ? esc(bar.name) : "your third option"}, roughly a ${esc(r.pos)}${rankOf(r.pos, breakeven)} season.`}</p>
        <button type="button" class="btn-gold" id="cApply">Use ${f1(p)} pts/gm on the board</button>`;
      $("#cApply").onclick = () => { overrides[r.id] = p; store.set("ppg", overrides); renderAll(false); location.hash = "#/keepers/k-board"; };
    }
    sel.addEventListener("change", () => { setDefault(); render(); });
    ppg.addEventListener("input", render); g.addEventListener("input", render);
    $("#cTiers").addEventListener("click", (e) => { const b = e.target.closest("[data-ppg]"); if (b) { ppg.value = b.dataset.ppg; render(); } });
    setDefault(); render();
  }

  // ================= pick value curve =================
  function curve() {
    const W = 560, H = 300, pad = { l: 44, r: 10, t: 14, b: 40 };
    const max = Math.ceil(Math.max(...K.curve.map((c) => Math.max(c.raw, c.ev))) * 10) / 10 || 1;
    const x = (r) => pad.l + ((r - 0.5) / R) * (W - pad.l - pad.r), bw = ((W - pad.l - pad.r) / R) * 0.62;
    const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Wins above replacement per pick by round: about ${f2(evRound(1))} in round 1, falling to ${f2(evRound(R))} by round ${R}.">`;
    for (let v = 0; v <= max + 1e-9; v += 0.2) s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(11,31,58,${v ? 0.08 : 0.35})"/><text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="#5b6577">${v.toFixed(1)}</text>`;
    K.curve.forEach((c) => {
      s += `<rect x="${x(c.round) - bw / 2}" y="${y(c.raw)}" width="${bw}" height="${y(0) - y(c.raw)}" rx="2" fill="#c4b48f" tabindex="0" data-tip="${esc(`<b>Round ${c.round}</b><br>Average ${f2(c.raw)} WAR (median ${f2(c.median)})<br>Price used: ${f2(c.ev)}<br>Based on ${c.n} picks`)}" aria-label="Round ${c.round}: ${f2(c.ev)} wins"/>`;
      if (c.round % 2 === 1 || c.round === R) s += `<text x="${x(c.round)}" y="${H - pad.b + 16}" text-anchor="middle" font-size="12" fill="#3c4a60">${c.round}</text>`;
    });
    s += `<polyline fill="none" stroke="#0b1f3a" stroke-width="3" stroke-linejoin="round" points="${K.curve.map((c) => `${x(c.round)},${y(c.ev)}`).join(" ")}"/>`;
    K.curve.forEach((c) => (s += `<circle cx="${x(c.round)}" cy="${y(c.ev)}" r="3.5" fill="#0b1f3a"/>`));
    s += `<text x="${(W + pad.l) / 2}" y="${H - 6}" text-anchor="middle" font-size="12" fill="#5b6577">Draft round</text><text x="14" y="${H / 2}" text-anchor="middle" font-size="12" fill="#5b6577" transform="rotate(-90 14 ${H / 2})">Wins above replacement</text></svg>`;
    $("#curveChart").innerHTML = s;
    const half = K.curve.find((c) => c.ev <= evRound(1) / 2), tenth = K.curve.find((c) => c.ev <= 0.1);
    $("#curveLede").textContent = `This is the price list for keepers. A pick is worth whatever the players taken there usually produce, measured from your league's ${K.complete.join(" and ")} drafts (keepers excluded). A 1st-round pick averages about ${f2(evRound(1))} WAR. Value halves by round ${half ? half.round : "?"} and drops under a tenth of a win by round ${tenth ? tenth.round : "?"}, so a useful player kept in the double-digit rounds is almost pure profit. Pick-by-pick, the 1st and 10th overall picks have produced about the same in this league, so in round 1 your slot matters less than whether the player you want would still be there.`;
    const H2 = 300, maxH = Math.max(0.1, ...K.curve.map((c) => c.hit));
    const y2 = (v) => pad.t + (H2 - pad.t - pad.b) * (1 - v / maxH);
    let h = `<svg viewBox="0 0 ${W} ${H2}" role="img" aria-label="Share of picks in each round that produced at least ${K.hitLine} wins above replacement.">`;
    [0, 0.25, 0.5].filter((v) => v <= maxH + 0.01).forEach((v) => (h += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y2(v)}" y2="${y2(v)}" stroke="rgba(11,31,58,${v ? 0.08 : 0.35})"/><text x="${pad.l - 6}" y="${y2(v) + 4}" text-anchor="end" font-size="12" fill="#5b6577">${Math.round(v * 100)}%</text>`));
    K.curve.forEach((c) => {
      h += `<rect x="${x(c.round) - bw / 2}" y="${y2(c.hit)}" width="${bw}" height="${y2(0) - y2(c.hit)}" rx="2" fill="${c.hit ? "#0b1f3a" : "#c4b48f"}" tabindex="0" data-tip="${esc(`<b>Round ${c.round}</b><br>${Math.round(c.hit * 100)}% hit (${Math.round(c.hit * c.n)} of ${c.n} players)`)}"/>`;
      if (c.hit) h += `<text x="${x(c.round)}" y="${y2(c.hit) - 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#0b1f3a">${Math.round(c.hit * 100)}</text>`;
      if (c.round % 2 === 1 || c.round === R) h += `<text x="${x(c.round)}" y="${H2 - pad.b + 16}" text-anchor="middle" font-size="12" fill="#3c4a60">${c.round}</text>`;
    });
    h += `<text x="${(W + pad.l) / 2}" y="${H2 - 6}" text-anchor="middle" font-size="12" fill="#5b6577">Draft round</text></svg>`;
    $("#hitChart").innerHTML = h;
    const lastHit = [...K.curve].reverse().find((c) => c.hit > 0);
    $("#hitSub").textContent = `Share of picks that produced ${K.hitLine}+ WAR (about a top-12 RB or WR season). Last round with any hit: ${lastHit ? lastHit.round : "none"}.`;
  }

  // ================= keeper report card =================
  let histRid = "all";
  function history() {
    const sel = $("#histTeam");
    if (!sel.options.length) {
      sel.innerHTML = `<option value="all">All teams</option>` + cur.teams.map((t) => `<option value="${t.rid}">${esc(t.name)}${String(t.rid) === ME ? " (you)" : ""}</option>`).join("");
      sel.addEventListener("change", () => { histRid = sel.value; history(); B.observe(); });
    }
    const focus = histRid === "all" ? null : histRid;
    const W = 860, H = 420, pad = { l: 52, r: 16, t: 16, b: 44 };
    const ys = hist.map((h) => h.war), maxY = Math.max(1, ...ys), minY = Math.min(0, ...ys);
    const x = (r) => pad.l + ((r - 0.5) / R) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - (v - minY) / (maxY - minY));
    const top = new Set([...hist].sort((a, b) => b.surplus - a.surplus).slice(0, 6).map((h) => h.season + h.pid));
    const labelled = (h) => (focus ? String(h.rid) === focus : top.has(h.season + h.pid) || String(h.rid) === ME);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Scatter plot: each keeper's wins above replacement against the round he cost, with the value of that round's pick as a reference line.">`;
    for (let v = Math.ceil(minY * 2) / 2; v <= maxY; v += 0.5) s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(11,31,58,${v ? 0.08 : 0.35})"/><text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="#5b6577">${v.toFixed(1)}</text>`;
    for (let r = 1; r <= R; r++) s += `<text x="${x(r)}" y="${H - pad.b + 18}" text-anchor="middle" font-size="12" fill="#3c4a60">${r}</text>`;
    s += `<polyline fill="none" stroke="#8a6a24" stroke-width="3" points="${K.curve.map((c) => `${x(c.round - 0.5)},${y(c.ev)} ${x(c.round + 0.5)},${y(c.ev)}`).join(" ")}"/>`;
    s += `<text x="${x(R) + 6}" y="${y(K.curve[R - 1].ev) - 8}" text-anchor="end" font-size="11" font-weight="700" fill="#8a6a24">pick value</text>`;
    const seen = {};
    const order = [...hist].sort((a, b) => (focus ? (String(a.rid) === focus) - (String(b.rid) === focus) : 0));
    order.forEach((h) => {
      const r = Math.min(h.round, R), k = r + ":" + Math.round(h.war * 4);
      const j = (seen[k] = (seen[k] || 0) + 1) - 1;
      const cx = x(r) + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * 8, cy = y(h.war);
      const isF = focus ? String(h.rid) === focus : true, mine = String(h.rid) === ME, t = team(h.rid);
      const good = h.surplus >= 0, col = good ? "#0b1f3a" : "#c8102e";
      const tip = `<b>${esc(h.name)}</b> · ${esc(h.pos)}<br>${esc(t ? t.name : "")} · ${h.season}${h.partial ? " (on pace)" : ""}<br>Cost: round ${h.round} pick, worth ${f2(h.ev)} WAR<br>Produced: ${f2(h.war)} WAR<br>Surplus: ${sgn(h.surplus, 2)}`;
      s += `<circle cx="${cx}" cy="${cy}" r="${isF && focus ? 8 : mine && !focus ? 7 : 6}" fill="${h.partial ? "#fbf7ee" : col}" stroke="${col}" stroke-width="${h.partial ? 2.5 : 1}" opacity="${isF ? 1 : 0.18}" tabindex="${isF ? 0 : -1}" data-tip="${esc(tip)}" aria-label="${esc(`${h.name}, ${h.season}, kept round ${h.round}, ${f2(h.war)} WAR, surplus ${f2(h.surplus)}`)}"/>`;
      if (isF && labelled(h)) s += `<text x="${cx + 10}" y="${cy + 4}" font-size="12" font-weight="${mine ? 700 : 600}" fill="${mine ? "#c8102e" : "#0b1f3a"}">${esc(lastName(h.name))} '${h.season.slice(2)}</text>`;
    });
    s += `<text x="${(W + pad.l) / 2}" y="${H - 6}" text-anchor="middle" font-size="13" fill="#5b6577">Round he cost (what was given up) →</text><text x="16" y="${H / 2}" text-anchor="middle" font-size="13" fill="#5b6577" transform="rotate(-90 16 ${H / 2})">What he produced (WAR) →</text></svg>`;
    $("#histChart").innerHTML = s;

    const rows = focus ? hist.filter((h) => String(h.rid) === focus) : hist;
    const studs = rows.filter((h) => h.round <= 3), steals = rows.filter((h) => h.round >= 8);
    const best = [...rows].sort((a, b) => b.surplus - a.surplus)[0], worst = [...rows].sort((a, b) => a.surplus - b.surplus)[0];
    const tot = rows.reduce((a, h) => a + h.surplus, 0);
    $("#histLede").textContent = `Every keeper in ${[...new Set(hist.map((h) => h.season))].join(" and ")}, graded the same way: what he produced (WAR) minus what his pick would have produced. ${K.season} numbers are on pace from ${K.position[K.season].weeks} weeks. Pick a team to see its record.`;
    $("#histCards").innerHTML = (rows.length ? [
      ["", focus ? `${team(focus).name}: keepers` : "Keepers graded", `${rows.length}`, `total surplus ${sgn(tot, 2)} wins, ${w2(tot / rows.length)} per keeper`],
      ["", "Stud keepers (rounds 1–3)", studs.length ? w2(avg(studs)) : "–", studs.length ? `average surplus, n=${studs.length}. They have to out-produce an expensive pick.` : "none"],
      ["gold", "Value keepers (round 8+)", steals.length ? w2(avg(steals)) : "–", steals.length ? `average surplus, n=${steals.length}. Cheap, but only worth it if they produce.` : "none"],
      ["", "Best keep", best ? `${lastName(best.name)} '${best.season.slice(2)}` : "–", best ? `${esc(best.name)}, round ${best.round}: ${sgn(best.surplus, 2)}${best.partial ? " on pace" : ""}` : ""],
      ["red", "Worst keep", worst ? `${lastName(worst.name)} '${worst.season.slice(2)}` : "–", worst ? `${esc(worst.name)}, round ${worst.round}: ${sgn(worst.surplus, 2)}${worst.partial ? " on pace" : ""}` : ""],
    ] : [["", "No keepers", "–", "This team hasn't kept anyone yet."]]).map(([c, k, v, t]) => `<article class="card ${c ? "card--" + c : ""}"><p class="card__k">${esc(k)}</p><p class="card__v" style="font-size:40px">${esc(v)}</p><p class="card__t">${t}</p></article>`).join("");

    const by = {};
    hist.forEach((h) => { const r = (by[h.rid] = by[h.rid] || { n: 0, s: 0 }); r.n++; r.s += h.surplus; });
    const mrows = Object.entries(by).sort((a, b) => b[1].s - a[1].s), mx = Math.max(...mrows.map(([, r]) => Math.abs(r.s)));
    $("#mgrTable").innerHTML = `<div class="luck">${mrows.map(([rid, r]) => `<button type="button" class="luck__row luck__row--btn ${rid === ME ? "is-me" : ""} ${focus === rid ? "is-on" : ""}" data-rid="${rid}" aria-pressed="${focus === rid}">${tname(team(rid))}<div class="luck__track"><div class="luck__bar ${r.s < 0 ? "neg" : "pos pos--ink"}" style="width:${(Math.abs(r.s) / mx) * 50}%"></div></div><span class="luck__v">${sgn(r.s, 1)}</span></button>`).join("")}</div><p class="howto">${mrows.reduce((a, [, r]) => a + r.n, 0)} keepers. A bar to the right means that manager's keepers beat the picks they cost. Tap a team to filter everything in this section.</p>`;
    $("#mgrTable").querySelectorAll("[data-rid]").forEach((b) => b.addEventListener("click", () => { histRid = histRid === b.dataset.rid ? "all" : b.dataset.rid; sel.value = histRid; history(); B.observe(); }));

    $("#histTableTitle").textContent = focus ? `${team(focus).name}: every keeper` : "Every keeper";
    $("#histTable").innerHTML = `<table class="sortable"><thead><tr><th>Season</th><th>Player</th><th>Team</th><th class="n">Kept in round</th><th class="n">Produced (WAR)</th><th class="n">Pick worth</th><th class="n">Surplus</th><th class="n">Model before</th></tr></thead><tbody>${[...rows].sort((a, b) => b.surplus - a.surplus).map((h) => `<tr class="${String(h.rid) === ME ? "is-me" : ""}"><td>${h.season}${h.partial ? "*" : ""}</td><td><b>${esc(h.name)}</b> <span class="asset__pos ${posCls(h.pos)}">${esc(h.pos)}</span></td><td>${esc(team(h.rid)?.name || "")}</td><td class="n">${h.round}</td><td class="n">${f2(h.war)}</td><td class="n">${f2(h.ev)}</td><td class="n"><b>${sgn(h.surplus, 2)}</b></td><td class="n">${h.projBefore != null ? f2(h.projBefore) : "–"}</td></tr>`).join("")}</tbody></table><p class="howto" style="padding:0 20px 20px">* on pace. "Produced" is what he actually added; "Pick worth" is what that round's pick usually adds; "Surplus" is the difference.</p>`;
    sortable($("#histTable table"));

    // Green Goblin case study
    const gg = cur.teams.find((t) => t.name === "Green Goblin");
    const nab = gg ? hist.filter((h) => h.rid === gg.rid && h.name === "Malik Nabers") : [];
    const wat = K.alt && K.alt.watson2026;
    if (gg && nab.length && wat) {
      const n26 = nab.find((h) => h.season === K.season);
      $("#goblinCase").innerHTML = `<header class="panel__head"><p class="eyebrow" style="margin:0 0 4px">Case study</p><h3>Green Goblin: Nabers in round ${n26 ? n26.round : "?"}, or Watson for a ${ord(wat.cost)}?</h3></header>
        <p class="panel__sub" style="margin-bottom:12px">Green Goblin picked Christian Watson up off waivers in ${+K.season - 1}, so Watson would have cost a round-${wat.cost} pick to keep in ${K.season}. He kept Malik Nabers instead.</p>
        <table><thead><tr><th>Option</th><th class="n">Cost</th><th class="n">Model said before</th><th class="n">What happened</th></tr></thead><tbody>
          ${nab.map((h) => `<tr><td>Keep Nabers, ${h.season}</td><td class="n">Rd ${h.round}</td><td class="n">${h.projBefore != null ? sgn(h.projBefore - h.ev, 2) : "–"}</td><td class="n"><b>${sgn(h.surplus, 2)}</b>${h.partial ? "*" : ""}</td></tr>`).join("")}
          <tr class="is-me"><td>Keep Watson, ${wat.season}</td><td class="n">Rd ${wat.cost}</td><td class="n">${sgn(wat.projBefore - wat.ev, 2)}</td><td class="n"><b>${sgn(wat.surplus, 2)}</b>*</td></tr>
        </tbody></table>
        <p class="howto"><b>Verdict:</b> in hindsight, Watson for a ${ord(wat.cost)} is worth about ${f1(wat.surplus - (n26 ? n26.surplus : 0))} more wins this season, and it would have freed the round-${n26 ? n26.round : 2} pick. Before the season, though, nothing flagged it: Watson had played only a handful of games, so any model, this one included, projected him near zero. Keeping a stud at his price isn't wrong. It's just low margin, because an early pick is already worth ${f2(evRound(n26 ? n26.round : 2))} wins. The edge is spotting the cheap keeper before he breaks out. That same pick became Watson for you, via the James Cook trade. *On pace.</p>`;
    } else $("#goblinCase").hidden = true;
  }

  // ================= hindsight keepers =================
  const HS = K.hindsight || [];
  let hindYear = HS.length ? HS[HS.length - 1].season : null;
  function hindsight() {
    if (!HS.length) { $("#k-hind").hidden = true; return; }
    const tabsEl = $("#hindTabs");
    if (!tabsEl.children.length) B.tabs(tabsEl, [...new Set(HS.map((h) => h.season))], hindYear, (v) => { hindYear = v; hindsight(); B.observe(); });
    const rows = HS.filter((h) => h.season === hindYear).sort((a, b) => a.gap - b.gap);
    const partial = rows[0] && rows[0].partial;
    const avgGap = rows.reduce((a, h) => a + h.gap, 0) / rows.length;
    const mine = rows.find((h) => String(h.rid) === ME);
    $("#hindLede").innerHTML = `Using what actually happened in ${hindYear}${partial ? ` (on pace after ${K.position[hindYear].weeks} weeks, so this will keep moving)` : ""}, here are the three keepers each team <i>should</i> have kept from its roster at the end of ${+hindYear - 1}, priced with the league's keeper rules, next to the three it did keep. The average team left <b>${f2(avgGap)} wins</b> on the table.${mine ? ` You left <b>${f2(mine.gap)}</b>.` : ""} Players added in preseason trades aren't counted, because they weren't on the roster yet.`;
    $("#hindSub").textContent = `${hindYear}: best possible keeper surplus minus actual. Sorted from best keeper to worst.`;
    const mx = Math.max(0.5, ...rows.map((h) => h.gap));
    $("#hindBoard").innerHTML = `<div class="luck">${rows.map((h) => `<div class="luck__row ${String(h.rid) === ME ? "is-me" : ""}">${tname(team(h.rid))}<div class="luck__track luck__track--left"><div class="luck__bar neg" style="width:${(h.gap / mx) * 100}%;left:0;right:auto"></div></div><span class="luck__v">${f2(h.gap)}</span></div>`).join("")}</div><p class="howto">Shorter bar = closer to the perfect three. Nobody can see the future, so the useful lesson is the kind of player teams missed: cheap late-round and waiver players who broke out.</p>`;
    const line = (x, kept) => `<li class="${kept ? "is-kept" : ""}"><span class="${posCls(x.pos)}">${esc(x.pos)}</span><b>${esc(x.name)}</b><small>rd ${x.cost} · ${f2(x.war)} WAR</small><span class="hind__s ${x.surplus >= 0 ? "up" : "down"}">${sgn(x.surplus, 2)}</span></li>`;
    const order = [...rows].sort((a, b) => (String(b.rid) === ME) - (String(a.rid) === ME) || b.gap - a.gap);
    $("#hindCards").innerHTML = order.map((h) => {
      const keptIds = new Set(h.actual.map((x) => String(x.pid))), bestIds = new Set(h.best.map((x) => String(x.pid)));
      const miss = h.missed[0];
      return `<article class="hindcard ${String(h.rid) === ME ? "is-me" : ""} reveal">
        <header>${tname(team(h.rid))}<span class="hindcard__gap">${h.gap < 0.05 ? "Nailed it" : `−${f2(h.gap)} wins`}</span></header>
        <div class="hindcard__cols">
          <div><p class="bw__k">Actually kept · ${sgn(h.actualTotal, 2)}</p><ol>${h.actual.length ? h.actual.map((x) => line(x, bestIds.has(String(x.pid)))).join("") : `<li class="muted">Nobody</li>`}</ol></div>
          <div><p class="bw__k">Hindsight best · ${sgn(h.bestTotal, 2)}</p><ol>${h.best.length ? h.best.map((x) => line(x, keptIds.has(String(x.pid)))).join("") : `<li class="muted">Nobody beat his pick</li>`}</ol></div>
        </div>
        ${miss ? `<p class="hindcard__note">Biggest miss: <b>${esc(miss.name)}</b>, available for a round-${miss.cost} pick and worth ${sgn(miss.surplus, 2)} wins over it${h.partial ? " on pace" : ""}.</p>` : ""}
      </article>`;
    }).join("");
  }

  // ================= positions =================
  let dropYear = K.complete[K.complete.length - 1];
  function positions() {
    const yrs = Object.keys(K.position);
    const tabsEl = $("#dropTabs");
    if (!tabsEl.children.length) B.tabs(tabsEl, yrs, dropYear, (v) => { dropYear = v; positions(); });
    const tops = K.position[dropYear].tops, repl = K.position[dropYear].repl;
    const W = 960, H = 420, pad = { l: 48, r: 20, t: 20, b: 46 }, N = 30;
    const vals = [...tops.RB.slice(0, N), ...tops.WR.slice(0, N), repl.RB, repl.WR];
    const max = Math.ceil(Math.max(...vals) / 5) * 5, min = Math.floor(Math.min(...vals) / 5) * 5;
    const x = (i) => pad.l + (i / (N - 1)) * (W - pad.l - pad.r), yy = (v) => pad.t + (H - pad.t - pad.b) * (1 - (v - min) / (max - min));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Points per game for the top ${N} running backs and receivers in ${dropYear}, with replacement levels.">`;
    for (let v = min; v <= max; v += 5) s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yy(v)}" y2="${yy(v)}" stroke="rgba(11,31,58,0.08)"/><text x="${pad.l - 8}" y="${yy(v) + 4}" text-anchor="end" font-size="13" fill="#5b6577">${v}</text>`;
    [["RB", "#1f7a4d", "0"], ["WR", "#1f4e8c", "8 5"]].forEach(([p, col, dash], k) => {
      s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yy(repl[p])}" y2="${yy(repl[p])}" stroke="${col}" stroke-width="1.5" stroke-dasharray="2 4"/>`;
      s += `<polyline fill="none" stroke="${col}" stroke-width="3.5" stroke-dasharray="${dash}" points="${tops[p].slice(0, N).map((v, i) => `${x(i)},${yy(v)}`).join(" ")}"/>`;
      tops[p].slice(0, N).forEach((v, i) => { const key = i % 6 === 0 || i === 11 || i === 23; s += `<circle cx="${x(i)}" cy="${yy(v)}" r="${key ? 4.5 : 3}" fill="${col}" tabindex="${key ? 0 : -1}" data-tip="${esc(`<b>${p}${i + 1}</b> · ${f1(v)} pts/gm<br>${f1(v - repl[p])} above replacement`)}"/>`; });
      s += `<text x="${W - pad.r}" y="${yy(repl[p]) + (k ? 16 : -8)}" text-anchor="end" font-size="13" font-weight="700" fill="${col}">${p} replacement · ${f1(repl[p])}</text>`;
      s += `<text x="${x(0) + 8}" y="${yy(tops[p][0]) + (k ? 18 : -8)}" font-size="13" font-weight="700" fill="${col}">${p}1 · ${f1(tops[p][0])}</text>`;
    });
    [1, 6, 12, 18, 24, 30].forEach((i) => (s += `<text x="${x(i - 1)}" y="${H - pad.b + 20}" text-anchor="middle" font-size="13" fill="#3c4a60">${i}</text>`));
    s += `<text x="${(W + pad.l) / 2}" y="${H - 6}" text-anchor="middle" font-size="13" fill="#5b6577">Positional rank in ${dropYear}${K.position[dropYear].partial ? " (season in progress)" : ""}</text><text x="16" y="${H / 2}" text-anchor="middle" font-size="13" fill="#5b6577" transform="rotate(-90 16 ${H / 2})">Points per game</text></svg>`;
    $("#dropChart").innerHTML = s;
    const gap = (p, n) => (tops[p][n - 1] ?? repl[p]) - repl[p];
    $("#dropSub").textContent = `${dropYear}: the RB1 beat a waiver-wire RB by ${f1(gap("RB", 1))} points a game and the WR1 beat a waiver WR by ${f1(gap("WR", 1))}. By rank 12 the gaps are ${f1(gap("RB", 12))} (RB) and ${f1(gap("WR", 12))} (WR); by rank 24, ${f1(gap("RB", 24))} and ${f1(gap("WR", 24))}.`;

    $("#posTable").innerHTML = `<div class="table-wrap"><table class="postable"><thead><tr><th>Position</th>${yrs.map((yr) => `<th class="n">Replacement ${yr}${K.position[yr].partial ? "*" : ""}</th>`).join("")}<th class="n">Stability r ${info("0 = this year tells you nothing about next year; 1 = exactly the same next year.")}</th><th>What it means</th><th class="n">Starters per team</th></tr></thead><tbody>${POS4.map((p) => { const r = stab(p); const word = r == null ? "–" : r >= 0.6 ? "Fairly predictable" : r >= 0.4 ? "About half carries over" : "Mostly noise year to year"; return `<tr><td><b class="${posCls(p)}">${p}</b></td>${yrs.map((yr) => `<td class="n">${f1(K.position[yr].repl[p])} <small class="muted">pts/gm</small></td>`).join("")}<td class="n"><b>${r == null ? "–" : f2(r)}</b><br><small class="muted">${(K.stability[p] || []).map((s) => `${s.from.slice(2)}→${s.to.slice(2)}: ${f2(s.r)} (n=${s.n})`).join(" · ")}</small></td><td>${word}</td><td class="n">${{ QB: "1", RB: "2 + flex", WR: "2 + flex", TE: "1 + flex" }[p]}</td></tr>`; }).join("")}</tbody></table></div><p class="howto" style="margin-top:8px">* ${K.season} after ${K.position[K.season].weeks} weeks; early-season replacement levels run low because bye weeks and injuries haven't thinned the waiver wire yet.</p>`;

    const bands = [...new Set(K.bands.map((b) => b.band))];
    $("#bandTable").innerHTML = `<div class="table-wrap"><table><thead><tr><th>Pos</th>${bands.map((b) => `<th class="n">Rounds ${b}</th>`).join("")}</tr></thead><tbody>${POS4.map((p) => `<tr><td><b class="${posCls(p)}">${p}</b></td>${bands.map((b) => { const r = K.bands.find((x) => x.pos === p && x.band === b); return `<td class="n">${r && r.n ? `<b>${f2(r.mean)}</b> WAR<br><small class="muted">${Math.round(r.hit * 100)}% hit · n=${r.n}${r.n < 10 ? " · small sample" : ""}</small>` : "–"}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div>`;

    // RB premium chart
    const pos2 = ["RB", "WR"], Wc = 520, Hc = 280, pd2 = { l: 52, r: 10, t: 24, b: 44 };
    const vals2 = K.posDraft.filter((v) => pos2.includes(v.pos) && v.surplus != null).map((v) => v.surplus);
    const mx2 = Math.max(0.1, ...vals2.map(Math.abs));
    const yc = (v) => pd2.t + (Hc - pd2.t - pd2.b) * (1 - (v + mx2) / (2 * mx2));
    const gw = (Wc - pd2.l - pd2.r) / bands.length;
    let c = `<svg viewBox="0 0 ${Wc} ${Hc}" role="img" aria-label="Average draft surplus by position and round band for running backs and receivers.">`;
    [-mx2, 0, mx2].forEach((v) => (c += `<line x1="${pd2.l}" x2="${Wc - pd2.r}" y1="${yc(v)}" y2="${yc(v)}" stroke="rgba(11,31,58,${v ? 0.08 : 0.5})"/><text x="${pd2.l - 6}" y="${yc(v) + 4}" text-anchor="end" font-size="12" fill="#5b6577">${sgn(v, 2)}</text>`));
    bands.forEach((b, i) => {
      pos2.forEach((p, k) => {
        const r = pd(p, b); if (r.surplus == null) return;
        const bx = pd2.l + gw * i + gw * 0.18 + k * gw * 0.32, y0 = yc(0), y1 = yc(r.surplus);
        c += `<rect x="${bx}" y="${Math.min(y0, y1)}" width="${gw * 0.3}" height="${Math.max(1, Math.abs(y1 - y0))}" rx="2" fill="${p === "RB" ? "#1f7a4d" : "#1f4e8c"}" tabindex="0" data-tip="${esc(`<b>${p}, rounds ${b}</b><br>${sgn(r.surplus, 2)} WAR vs. the pick<br>n=${r.n}`)}"/>`;
        c += `<text x="${bx + gw * 0.15}" y="${r.surplus >= 0 ? y1 - 5 : y1 + 14}" text-anchor="middle" font-size="11" font-weight="700" fill="#0b1f3a">${p}</text>`;
      });
      c += `<text x="${pd2.l + gw * i + gw / 2}" y="${Hc - pd2.b + 20}" text-anchor="middle" font-size="12" fill="#3c4a60">Rounds ${b}</text>`;
    });
    c += `<text x="${pd2.l + 4}" y="${pd2.t - 8}" font-size="11" fill="#5b6577">↑ beat the pick (underpriced) · ↓ fell short (overpriced)</text></svg>`;
    const e = pd("RB", "1-3"), f = pd("WR", "1-3");
    const jw = (K.boards[ME] || []).find((r) => r.name === "Javonte Williams");
    $("#rbPremium").innerHTML = c + `<p class="howto">In rounds 1–3, RBs took ${Math.round(K.earlyShare.RB * 100)}% of the picks and returned ${sgn(e.surplus || 0, 2)} WAR more than the pick's usual value (n=${e.n}). WRs took ${Math.round(K.earlyShare.WR * 100)}% and returned ${sgn(f.surplus || 0, 2)} (n=${f.n}). So in ${K.complete.join(" and ")}, early RBs were, if anything, <b>under</b>priced in this league, not overpriced. Your 2026 plan (load up on WRs, add an RB cheaply) worked because Javonte Williams hit${jw ? `: ${f2(jw.cur.warPace)} WAR on pace from a round-9 keep` : ""}. The lesson isn't "RBs are overrated here." It's that cheap RBs who win a starting job are gold, because starting RBs clear replacement by more. Small samples: treat this as a lean, not a law.</p>`;

    $("#posLede").textContent = `With two flex spots, each team can start up to four RBs or four WRs, so the waiver wire is thin at both: replacement is about ${f1(REPL.RB)} points a game for RBs and ${f1(REPL.WR)} for WRs. The best RBs clear that bar by more than the best WRs, and early RBs have returned more per pick here. Receivers are ${stabWord()} from one season to the next (r ${f2(stab("WR"))} vs. ${f2(stab("RB"))}). For keepers, the position matters less than the gap between a player's projection and his price.`;
  }

  // ================= findings =================
  function findings() {
    const kept = keptSets(), mine = kept[ME], model = bestThree(ME);
    const sum = (a) => a.reduce((s, r) => s + r.S2, 0);
    const c = K.keeperTrades.find((t) => t.player === "James Cook");
    const e = pd("RB", "1-3"), f = pd("WR", "1-3");
    const items = [
      ["gold", "Your keepers (as set on the board)", mine.map((r) => r.name).join(" · ") || "None picked", mine.length ? `${sgn(sum(mine), 2)} wins over the picks they cost, at draft slot ${slot}. The model's best set: ${model.map((r) => lastName(r.name)).join(", ")} (${sgn(sum(model), 2)}). Change either in sections 01–02.` : ""],
      ["", "What a pick is worth", `1st ≈ ${f2(evRound(1))} · 6th ≈ ${f2(evRound(6))} · 12th ≈ ${f2(evRound(12))} wins`, `Measured from this league's drafts. Past round 10 a pick is worth almost nothing, so any useful keeper there is nearly pure profit. That's the case for Golden.`],
      ["red", "Don't keep who you can redraft", "Round-1 keepers only pay if he'd be gone", `If you pick early and the player would still be there at your round-1 pick, keeping him wastes a slot. The board's Redraft check flags this for your slot.`],
      ["", "Studs vs. steals", `${w2(avg(hist.filter((h) => h.round <= 3)))} vs. ${w2(avg(hist.filter((h) => h.round >= 8)))} wins per keeper`, `Rounds 1–3 vs. round 8+, all keepers since 2025. Studs have earned more per slot when they truly beat their round. Cheap keepers win when they hit, and they cost almost nothing when they don't.`],
      ["", "Does the league overrate RBs?", `Early RBs ${sgn(e.surplus || 0, 2)} · early WRs ${sgn(f.surplus || 0, 2)}`, `What rounds 1–3 picks produced versus the pick's usual value. Early RBs have been fairly priced to cheap here. Your late-RB plan worked through Javonte, not because RBs are overdrafted.`],
    ];
    if (c) items.push(["red", "What Cook was worth", `Model's limit: about a round-${roundFor(c.projBefore - c.evKeep, "x") || R} pick`, `You got a 6th for a player you weren't keeping, more than the model would have paid. The price guide (section 04) gives a range like this for any player.`]);
    items.push(["", "How much to trust this", `Backtest r = ${f2(K.backtest.r)}`, `Past keeper projections lined up moderately with results (n=${K.backtest.n}, typical miss ${f2(K.backtest.mae)} wins). Treat gaps under about 0.3 wins as a coin flip, and use your own judgment for rookies and role changes.`]);
    $("#labFindings").innerHTML = items.map(([cl, k, v, t]) => `<article class="card ${cl ? "card--" + cl : ""} reveal in"><p class="card__k">${esc(k)}</p><p class="finding__v">${esc(v)}</p><p class="card__t">${esc(t)}</p></article>`).join("");
    $("#labSub").textContent = `Built from ${Object.keys(K.position).length} seasons of drafts, keepers and weekly scoring in ${cur.name}. Every number is in wins, so players and draft picks can be compared directly. New to this? Start with "How to read this".`;
  }

  // ================= method =================
  function method() {
    const sig = Object.entries(K.wpp.sigma).map(([y, s]) => `${y}: ${s}`).join(", ");
    const rows = [
      ["Wins above replacement", `Weekly points for every rostered QB, RB, WR and TE come from Sleeper (regular season only). Replacement level per position is the average of the three best players just outside the league's starting lineups (10 teams × QB, 2 RB, 2 WR, TE, plus 2 flex). Each game a player plays adds (his points − replacement). Missed games add zero, because a waiver player would have played.`],
      ["Points to wins", `Weekly team scores spread by about ${Object.values(K.wpp.sigma).slice(-1)[0]} points (standard deviation; ${sig}). If scores are roughly bell-shaped, one extra point of expected margin adds 0.282 ÷ σ ≈ ${K.wpp.model} wins, so about ${Math.round(1 / K.wpp.model)} points = 1 win. Check: across ${K.wpp.n} team-seasons, actual wins rose ${K.wpp.empirical} per point (r = ${K.wpp.r}), about ${Math.round(1 / K.wpp.empirical)} points per win. The model uses the more conservative figure.`],
      ["Price of a pick", `Every non-keeper QB/RB/WR/TE pick from completed seasons (${K.complete.join(", ")}) is scored by the WAR that player produced that season (below zero counts as zero, since you'd bench him). Averaged by round, and pick-by-pick with a ±6-pick window, then forced to never rise in later picks. Rounds past ${R} in older 20-round drafts are pooled into round ${R}.`],
      ["Your pick, not the average", `Your keeper cost uses the exact pick you'd give up at your chosen slot, in snake order (odd rounds go 1→${T}, even rounds ${T}→1). Other teams use the average pick in that round, since their slots aren't known.`],
      ["Projection", `Next season's WAR = (2 × this season's points above replacement + last season's) ÷ (2 × games + last season's games + 3), times expected games, times wins per point. The "+3" pulls small samples toward replacement. Age: RBs 28+ ×0.85, WRs/TEs 31+ ×0.9, QBs 36+ ×0.9. Expected games blend each player's availability with an 85% league norm. Your typed points per game replace this.`],
      ["Draft pool and redraft check", `Each other team is assumed to keep its three best by surplus; you keep what you tick. Everyone else is ranked by projected WAR. "Taken before your pick" = picks ahead of yours minus picks used on keepers. Real drafts follow names and needs, not this ranking, and 2027 rookies aren't in the pool, so treat it as a rough guide.`],
      ["Keeper cost rules", `As seen in this league's drafts: one round earlier than the player's most recent draft slot; round 1 stays round 1; waiver pickups (or players dropped and re-added) cost round ${R}; collisions slide back a round. A few past keepers don't fit (likely commissioner calls), so confirm edge cases.`],
      ["Backtest", `For keepers with a full season, the preseason projection correlated r = ${K.backtest.r} with what they produced (n = ${K.backtest.n}, average miss ${K.backtest.mae} wins). Good for sorting, not for splitting hairs.`],
      ["Blind spots", `NFL draft capital, depth-chart changes, coaching, injuries to teammates (a backup filling in, like Emanuel Wilson, looks like a starter), and second-year growth. That's what the "Your pts/gm" column and the upside calculator are for. Samples are small: ${K.complete.length} completed drafts and ${hist.length} keepers.`],
    ];
    $("#method").innerHTML = rows.map(([k, t], i) => `<article class="method__row reveal"><span class="method__n">${String(i + 1).padStart(2, "0")}</span><div><h3>${k}</h3><p>${t}</p></div></article>`).join("");
  }

  // ================= sortable tables =================
  function sortable(table) {
    if (!table) return;
    table.querySelectorAll("th").forEach((th, i) => {
      th.tabIndex = 0; th.classList.add("sortable__th");
      const go = (e) => {
        if (e && e.target.closest && e.target.closest(".info")) return;
        const dir = th.getAttribute("aria-sort") === "descending" ? "ascending" : "descending";
        table.querySelectorAll("th").forEach((x) => x.removeAttribute("aria-sort"));
        th.setAttribute("aria-sort", dir);
        const body = table.tBodies[0], rows = [...body.rows];
        const val = (r) => { const c = r.cells[i]; const inp = c.querySelector("input[type=number]"); const t = inp ? inp.value : c.textContent.trim().replace("−", "-").replace(/^Rd\s*/, ""); const n = parseFloat(String(t).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? t : n; };
        rows.sort((a, b) => { const x = val(a), y = val(b); const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y)); return dir === "ascending" ? c : -c; });
        rows.forEach((r) => body.appendChild(r));
      };
      th.addEventListener("click", go);
      th.addEventListener("keydown", (e) => { if (e.target === th && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); go(e); } });
    });
  }

  // tooltips for keyboard and touch
  const tip = $("#tip");
  const showFor = (el) => {
    const r = el.getBoundingClientRect();
    tip.innerHTML = el.getAttribute("data-tip"); tip.hidden = false;
    tip.style.left = Math.max(8, Math.min(r.left, innerWidth - tip.offsetWidth - 8)) + "px";
    tip.style.top = (r.bottom + 8 + tip.offsetHeight > innerHeight ? r.top - tip.offsetHeight - 8 : r.bottom + 8) + "px";
  };
  document.addEventListener("focusin", (e) => { const el = e.target.closest && e.target.closest("[data-tip]"); if (el) showFor(el); });
  document.addEventListener("focusout", () => (tip.hidden = true));
  document.addEventListener("click", (e) => { const el = e.target.closest && e.target.closest(".info"); if (el) { e.preventDefault(); e.stopPropagation(); showFor(el); } }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") tip.hidden = true; });

  // ================= render =================
  function renderAll(full = true) {
    findings(); board(); build(); poolAndMarket(); priceGuide(); calc();
    if (full) { keeperTrades(); curve(); history(); hindsight(); positions(); method(); glossary(); }
    B.observe();
  }
  const teamSel = $("#boardTeam");
  teamSel.innerHTML = cur.teams.map((t) => `<option value="${t.rid}" ${String(t.rid) === ME ? "selected" : ""}>${esc(t.name)}${String(t.rid) === ME ? " (you)" : ""}</option>`).join("");
  teamSel.addEventListener("change", () => { viewRid = teamSel.value; board(); B.observe(); });
  slotUI();
  B.tabs($("#poolTabs"), ["All", "RB", "WR", "TE", "QB"], "All", (v) => { poolPos = v; poolAndMarket(); });
  renderAll(true);

  // content above an anchor just grew, so land on it again
  const anchor = location.hash.split("/")[2];
  if (anchor && document.getElementById(anchor)) document.getElementById(anchor).scrollIntoView({ block: "start" });
})();
