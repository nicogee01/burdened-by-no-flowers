/* Keeper Lab: renders D.keepers (built by scripts/keepers.py). */
(() => {
  "use strict";
  const B = window.BBNF;
  if (!B || !B.D.keepers) return;
  const { D, $, esc, f1, sgn, ord, tm, tname, cur } = B;
  const K = D.keepers;
  const ME = String(cur.myRid);
  const EV = Object.fromEntries(K.curve.map((c) => [c.round, c.ev]));
  const ev = (r) => EV[Math.min(Math.max(r, 1), K.rounds)] ?? 0;
  const wpp = K.wpp.model;
  const f2 = (n) => (Math.round(n * 100) / 100).toFixed(2);
  const w2 = (n) => `${n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}`;
  const team = (rid) => tm(cur, rid);
  const posCls = (p) => `pos-${esc(p)}`;
  const lastName = (n) => n.split(" ").slice(-1)[0];

  // replacement level per position: average over completed seasons (partial seasons run low early on)
  const done = K.complete.length ? K.complete : [K.season];
  const REPL = Object.fromEntries(["QB", "RB", "WR", "TE"].map((p) => [p, done.reduce((a, y) => a + K.position[y].repl[p], 0) / done.length]));
  const lastFull = done[done.length - 1];

  // keepers can't share a round: a collision pushes the later one back a round
  function pickThree(rows) {
    const chosen = [], used = new Set();
    for (const r of rows.filter((x) => x.surplus > 0)) {
      if (chosen.length >= K.maxKeepers) break;
      let c = r.cost;
      while (used.has(c) && c < K.rounds) c++;
      used.add(c);
      chosen.push({ ...r, slot: c, slotEv: ev(c), slotSurplus: r.proj - ev(c) });
    }
    return chosen;
  }

  // =============== findings ===============
  const myBoard = K.boards[ME] || [];
  const myThree = pickThree(myBoard);
  const hist = K.history.filter((h) => ["QB", "RB", "WR", "TE"].includes(h.pos));
  const studs = hist.filter((h) => h.round <= 3), steals = hist.filter((h) => h.round >= 8);
  const avg = (a, k = "surplus") => (a.length ? a.reduce((s, x) => s + x[k], 0) / a.length : 0);
  const cook = K.keeperTrades.find((t) => t.player === "James Cook");
  const stab = (p) => { const s = K.stability[p] || []; return s.length ? s.reduce((a, x) => a + x.r, 0) / s.length : null; };
  const stabWord = () => { const d = stab("WR") - stab("RB"); return Math.abs(d) < 0.05 ? "about equally predictable from one year to the next" : d > 0 ? "a bit more predictable from one year to the next" : "a bit less predictable from one year to the next"; };
  const fullS = hist.filter((h) => !h.partial && h.round <= 3), fullV = hist.filter((h) => !h.partial && h.round >= 8);

  function findings() {
    const items = [
      ["gold", "Your 2027 keepers, per the model", myThree.map((r) => r.name).join(" · ") || "None clear the bar",
        myThree.length ? `Together about ${f1(myThree.reduce((a, r) => a + r.slotSurplus, 0))} wins more than the picks they cost. Details in section 01.` : ""],
      ["", "What a pick is worth", `1st ≈ ${f2(ev(1))} · 6th ≈ ${f2(ev(6))} · 12th ≈ ${f2(ev(12))} wins`,
        `Measured from your league's own drafts. Past round 10, a pick is worth almost nothing, so any useful player kept there is nearly pure profit.`],
      ["red", "Studs vs. steals", `${w2(avg(studs))} vs. ${w2(avg(steals))} wins per keeper slot`,
        `Keepers costing rounds 1–3 beat their pick by ${w2(avg(studs))} wins on average (n=${studs.length}); round 8 or later by ${w2(avg(steals))} (n=${steals.length}). Full seasons only: ${w2(avg(fullS))} vs. ${w2(avg(fullV))}. You only get ${K.maxKeepers} slots, so ${avg(studs) >= avg(steals) ? "a stud who clearly beats his round has been the better use of one. Cheap keepers win only when they actually break out" : "cheap keepers have been the better use of a slot"}. Small samples, so lean on the board, not the average.`],
      ["", "RB vs. WR", `Replacement: RB ${f1(REPL.RB)} · WR ${f1(REPL.WR)} pts/gm`,
        `With two flex spots, both positions run deep. Season-to-season stability: RB r=${f2(stab("RB"))}, WR r=${f2(stab("WR"))}, so receivers are ${stabWord()}. Elite RBs clear replacement by more, which is why early RB picks returned more.`],
    ];
    if (cook) {
      const expBuyer = cook.projBefore - cook.evKeep - cook.paid.reduce((a, p) => a + p.ev, 0);
      items.push(["red", "The James Cook trade", `${team(cook.to).name} paid a ${ord(cook.paid[0]?.round || 0)}`,
        `Before the draft, the model valued keeping Cook in round ${cook.keepRound} at ${w2(cook.projBefore - cook.evKeep)} wins over the pick. Paying a ${ord(cook.paid[0]?.round || 0)} on top made it ${w2(expBuyer)} for them. You were right: too high a price. Full breakdown in section 06.`]);
    }
    items.push(["", "How much to trust this", `Backtest r = ${f2(K.backtest.r)}`,
      `Projected keeper value lined up moderately with what happened (n=${K.backtest.n}; typical miss ${f2(K.backtest.mae)} wins). Treat small gaps between players as ties.`]);
    $("#labFindings").innerHTML = items.map(([c, k, v, t]) => `<article class="card ${c ? "card--" + c : ""} reveal"><p class="card__k">${k}</p><p class="finding__v">${esc(v)}</p><p class="card__t">${esc(t)}</p></article>`).join("");
    $("#labSub").textContent = `Built from ${Object.keys(K.position).length} seasons of drafts, keepers and weekly scoring in ${cur.name}. Every number is in wins above replacement (WAR): how many wins a player adds over someone you could pick up for free.`;
  }

  // =============== board ===============
  function board(rid) {
    const rows = K.boards[rid] || [];
    const three = pickThree(rows), ids = new Set(three.map((r) => r.id));
    const isMe = rid === ME;
    const t = team(rid);
    $("#boardLede").innerHTML = `${isMe ? "Your" : esc(t.name) + "'s"} roster, priced for the ${K.next} draft. <b>Cost</b> is the round you'd give up: one round earlier than this year's draft slot, round 1 stays round 1, and players picked up off waivers cost round ${K.rounds}. <b>Surplus</b> is projected WAR minus the value of that pick. Up to ${K.maxKeepers} keepers; if two land in the same round, one slides back.`;
    $("#boardTop").innerHTML = three.length ? three.map((r, i) => `
      <article class="keep reveal">
        <span class="keep__n">${i + 1}</span>
        <p class="keep__name">${esc(r.name)} <span class="${posCls(r.pos)}">${esc(r.pos)}</span></p>
        <p class="keep__cost">Round ${r.slot}${r.slot !== r.cost ? ` <small>(slides from ${r.cost})</small>` : ""}</p>
        <dl class="keep__stats"><div><dt>Proj. WAR</dt><dd>${f2(r.proj)}</dd></div><div><dt>Pick worth</dt><dd>${f2(r.slotEv)}</dd></div><div><dt>Surplus</dt><dd class="up">${sgn(r.slotSurplus, 2)}</dd></div></dl>
        <p class="keep__note">Plays like a round-${r.valueRound > K.rounds ? `${K.rounds}+` : r.valueRound} pick, costs a round-${r.slot}.</p>
      </article>`).join("") : `<p class="lede">Nobody on this roster projects to beat the pick he'd cost.</p>`;
    const max = Math.max(0.5, ...rows.map((r) => Math.abs(r.surplus)));
    $("#boardTable").innerHTML = `<table class="sortable"><thead><tr><th>Player</th><th>Acquired</th><th class="n">${K.next} cost</th><th class="n">${K.season} pts/gm</th><th class="n">Proj. WAR</th><th class="n">Pick worth</th><th>Surplus</th></tr></thead><tbody>${rows.map((r) => `
      <tr class="${ids.has(r.id) ? "is-keep" : ""}">
        <td><b>${esc(r.name)}</b> <span class="asset__pos ${posCls(r.pos)}">${esc(r.pos)} · ${esc(r.team)}${r.age ? " · " + r.age : ""}</span>${ids.has(r.id) ? ` <span class="pt-tag pt-keeper">Keep</span>` : ""}</td>
        <td>${r.via === "free agent" ? "Waivers" : r.wasKeeper ? `Kept, rd ${r.draftRound}` : `Drafted rd ${r.draftRound}`}</td>
        <td class="n">Rd ${r.cost}</td>
        <td class="n">${r.cur.g ? f1(r.cur.ppg) : "–"}<small class="muted"> ${r.cur.g}g</small></td>
        <td class="n">${f2(r.proj)}</td>
        <td class="n">${f2(r.ev)}</td>
        <td class="sbar"><span class="sbar__track"><i class="${r.surplus >= 0 ? "pos" : "neg"}" style="width:${(Math.abs(r.surplus) / max) * 50}%"></i></span><span class="sbar__v">${sgn(r.surplus, 2)}</span></td>
      </tr>`).join("")}</tbody></table>`;
    sortable($("#boardTable table"));
  }
  function boardSelect() {
    const sel = $("#boardTeam");
    sel.innerHTML = cur.teams.map((t) => `<option value="${t.rid}" ${String(t.rid) === ME ? "selected" : ""}>${esc(t.name)}${String(t.rid) === ME ? " (you)" : ""}</option>`).join("");
    sel.addEventListener("change", () => { board(sel.value); B.observe(); });
    board(ME);
  }

  // =============== calculator ===============
  function calc() {
    const pool = myBoard.filter((r) => r.pos !== "QB" || true);
    if (!pool.length) { $("#k-calc").hidden = true; return; }
    const def = pool.find((r) => r.name === "Carnell Tate") || pool.find((r) => r.via === "free agent" && r.age && r.age <= 23) || pool[pool.length - 1];
    const tops = K.position[lastFull].tops;
    const tier = (pos, n) => (tops[pos] && tops[pos][n - 1]) || null;
    $("#calc").innerHTML = `
      <div class="calc__in panel">
        <label class="field"><span>Player</span><select id="cPlayer">${pool.map((r) => `<option value="${esc(r.id)}" ${r.id === def.id ? "selected" : ""}>${esc(r.name)} · ${esc(r.pos)} · rd ${r.cost}</option>`).join("")}</select></label>
        <label class="field"><span>Points per game next year <output id="cPpgOut"></output></span><input type="range" id="cPpg" min="4" max="30" step="0.5"></label>
        <label class="field"><span>Games played <output id="cGOut"></output></span><input type="range" id="cG" min="4" max="${cur.regEnd - 1}" step="1" value="${Math.min(12, cur.regEnd - 1)}"></label>
        <div class="tiers" id="cTiers"></div>
      </div>
      <div class="calc__out" id="cOut" aria-live="polite"></div>`;
    const sel = $("#cPlayer"), ppg = $("#cPpg"), g = $("#cG");
    const setDefaultPpg = () => { const r = pool.find((x) => x.id === sel.value); ppg.value = Math.max(4, Math.round((r.cur.g ? r.cur.ppg : REPL[r.pos]) * 2) / 2); };
    function render() {
      const r = pool.find((x) => x.id === sel.value);
      const p = +ppg.value, games = +g.value;
      $("#cPpgOut").textContent = f1(p); $("#cGOut").textContent = games;
      const war = Math.max(0, (p - REPL[r.pos]) * games * wpp);
      const cost = ev(r.cost), surplus = war - cost;
      const others = pickThree(myBoard.filter((x) => x.id !== r.id));
      const bar = others.length >= K.maxKeepers ? others[K.maxKeepers - 1] : null;
      const barS = bar ? bar.slotSurplus : 0;
      const breakeven = REPL[r.pos] + (barS + cost) / (games * wpp);
      const beats = surplus > barS;
      $("#cTiers").innerHTML = `<p class="bw__k">${lastFull} ${esc(r.pos)} benchmarks (pts/gm)</p>` + [[1, "1"], [6, "6"], [12, "12"], [24, "24"]].map(([n, l]) => { const v = tier(r.pos, n); return v ? `<button type="button" class="chip-btn" data-ppg="${v}">${esc(r.pos)}${l} · ${f1(v)}</button>` : ""; }).join("");
      $("#cOut").innerHTML = `
        <div class="calc__big ${beats ? "good" : "bad"}"><span class="k">Surplus at round ${r.cost}</span><span class="v">${sgn(surplus, 2)}</span><span class="d">wins above the pick he costs</span></div>
        <div class="calc__row"><span>Projected WAR</span><b>${f2(war)}</b></div>
        <div class="calc__row"><span>Round-${r.cost} pick is worth</span><b>${f2(cost)}</b></div>
        <div class="calc__row"><span>Bar to beat${bar ? `: ${esc(bar.name)} (keeper #${K.maxKeepers})` : ""}</span><b>${sgn(barS, 2)}</b></div>
        <div class="calc__row calc__row--hl"><span>Break-even</span><b>${f1(breakeven)} pts/gm</b></div>
        <p class="calc__verdict">${beats
          ? `At ${f1(p)} points a game, ${esc(r.name)} is a better keep than ${bar ? esc(bar.name) : "your third option"}.`
          : `${esc(r.name)} needs about <b>${f1(breakeven)}</b> points a game over ${games} games to beat ${bar ? esc(bar.name) : "your third option"}. That's roughly a ${esc(r.pos)}${rankOf(r.pos, breakeven)} season.`}</p>`;
    }
    function rankOf(pos, v) { const list = tops[pos] || []; const i = list.findIndex((x) => x < v); return i === -1 ? `${list.length}+` : String(Math.max(i, 1)); }
    sel.addEventListener("change", () => { setDefaultPpg(); render(); });
    ppg.addEventListener("input", render); g.addEventListener("input", render);
    $("#cTiers").addEventListener("click", (e) => { const b = e.target.closest("[data-ppg]"); if (b) { ppg.value = b.dataset.ppg; render(); } });
    setDefaultPpg(); render();
  }

  // =============== pick value curve ===============
  function curve() {
    const W = 520, H = 280, pad = { l: 40, r: 10, t: 14, b: 34 };
    const max = Math.ceil(Math.max(...K.curve.map((c) => Math.max(c.raw, c.ev))) * 10) / 10 || 1;
    const x = (r) => pad.l + ((r - 0.5) / K.rounds) * (W - pad.l - pad.r), bw = (W - pad.l - pad.r) / K.rounds * 0.62;
    const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Expected wins above replacement by draft round: about ${f2(ev(1))} in round 1, falling to ${f2(ev(K.rounds))} by round ${K.rounds}.">`;
    for (let v = 0; v <= max + 1e-9; v += 0.2) s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(11,31,58,${v ? 0.08 : 0.35})"/><text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#5b6577">${v.toFixed(1)}</text>`;
    K.curve.forEach((c) => {
      s += `<rect x="${x(c.round) - bw / 2}" y="${y(c.raw)}" width="${bw}" height="${y(0) - y(c.raw)}" rx="2" fill="#c4b48f" tabindex="0" data-tip="${esc(`<b>Round ${c.round}</b><br>Raw average ${f2(c.raw)} WAR · median ${f2(c.median)}<br>Smoothed price ${f2(c.ev)}<br>${c.n} picks${c.round === K.rounds ? ` (includes rounds ${K.rounds}+ of 20-round drafts)` : ""}`)}" aria-label="Round ${c.round}: ${f2(c.ev)} wins"/>`;
      if (c.round % 2 === 1 || c.round === K.rounds) s += `<text x="${x(c.round)}" y="${H - pad.b + 16}" text-anchor="middle" font-size="12" fill="#3c4a60">${c.round}</text>`;
    });
    s += `<polyline fill="none" stroke="#0b1f3a" stroke-width="3" stroke-linejoin="round" points="${K.curve.map((c) => `${x(c.round)},${y(c.ev)}`).join(" ")}"/>`;
    K.curve.forEach((c) => (s += `<circle cx="${x(c.round)}" cy="${y(c.ev)}" r="3.5" fill="#0b1f3a"/>`));
    s += `<text x="${(W + pad.l) / 2}" y="${H - 4}" text-anchor="middle" font-size="12" fill="#5b6577">Draft round</text></svg>`;
    $("#curveChart").innerHTML = s;
    const half = K.curve.find((c) => c.ev <= ev(1) / 2), tenth = K.curve.find((c) => c.ev <= 0.1);
    $("#curveLede").textContent = `A pick's value is the average wins above replacement of the players taken in that round in completed seasons (keepers excluded). A 1st-round pick is worth about ${f2(ev(1))} wins. Value halves by round ${half ? half.round : "?"} and falls under a tenth of a win by round ${tenth ? tenth.round : "?"}. Keeping a player costs exactly this.`;
    // hit rate
    const H2 = 280, maxH = Math.max(0.1, ...K.curve.map((c) => c.hit));
    const y2 = (v) => pad.t + (H2 - pad.t - pad.b) * (1 - v / maxH);
    let h = `<svg viewBox="0 0 ${W} ${H2}" role="img" aria-label="Share of picks in each round that produced at least ${K.hitLine} wins above replacement.">`;
    [0, 0.25, 0.5].filter((v) => v <= maxH + 0.01).forEach((v) => (h += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y2(v)}" y2="${y2(v)}" stroke="rgba(11,31,58,${v ? 0.08 : 0.35})"/><text x="${pad.l - 6}" y="${y2(v) + 4}" text-anchor="end" font-size="11" fill="#5b6577">${Math.round(v * 100)}%</text>`));
    K.curve.forEach((c) => {
      h += `<rect x="${x(c.round) - bw / 2}" y="${y2(c.hit)}" width="${bw}" height="${y2(0) - y2(c.hit)}" rx="2" fill="${c.hit ? "#0b1f3a" : "#c4b48f"}" tabindex="0" data-tip="${esc(`<b>Round ${c.round}</b><br>${Math.round(c.hit * 100)}% hits (${Math.round(c.hit * c.n)} of ${c.n})`)}"/>`;
      if (c.hit) h += `<text x="${x(c.round)}" y="${y2(c.hit) - 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#0b1f3a">${Math.round(c.hit * 100)}</text>`;
      if (c.round % 2 === 1 || c.round === K.rounds) h += `<text x="${x(c.round)}" y="${H2 - pad.b + 16}" text-anchor="middle" font-size="12" fill="#3c4a60">${c.round}</text>`;
    });
    h += `<text x="${(W + pad.l) / 2}" y="${H2 - 4}" text-anchor="middle" font-size="12" fill="#5b6577">Draft round</text></svg>`;
    $("#hitChart").innerHTML = h;
    const lastHit = [...K.curve].reverse().find((c) => c.hit > 0);
    $("#hitSub").textContent = `Share of picks that produced ${K.hitLine}+ WAR, about a top-12 RB or WR season. Last round with any hit: ${lastHit ? lastHit.round : "none"}.`;
  }

  // =============== keeper history ===============
  function history() {
    const W = 760, H = 380, pad = { l: 44, r: 16, t: 16, b: 40 };
    const ys = hist.map((h) => h.war), maxY = Math.max(1, ...ys), minY = Math.min(0, ...ys);
    const x = (r) => pad.l + ((r - 0.5) / K.rounds) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - (v - minY) / (maxY - minY));
    const label = new Set([...hist].sort((a, b) => b.surplus - a.surplus).slice(0, 6).map((h) => h.season + h.pid).concat(hist.filter((h) => String(h.rid) === ME).map((h) => h.season + h.pid)));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Scatter plot of every keeper's wins above replacement against the round he cost, with the value of a pick in that round as a reference line.">`;
    for (let v = Math.ceil(minY * 2) / 2; v <= maxY; v += 0.5) s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(11,31,58,${v ? 0.08 : 0.35})"/><text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#5b6577">${v.toFixed(1)}</text>`;
    for (let r = 1; r <= K.rounds; r++) if (r % 2 === 1 || r === K.rounds) s += `<text x="${x(r)}" y="${H - pad.b + 16}" text-anchor="middle" font-size="12" fill="#3c4a60">${r}</text>`;
    // reference step line: value of the pick
    s += `<polyline fill="none" stroke="#8a6a24" stroke-width="3" points="${K.curve.map((c) => `${x(c.round - 0.5)},${y(c.ev)} ${x(c.round + 0.5)},${y(c.ev)}`).join(" ")}"/>`;
    const seen = {};
    hist.forEach((h) => {
      const r = Math.min(h.round, K.rounds), k = r + ":" + Math.round(h.war * 4);
      const j = (seen[k] = (seen[k] || 0) + 1) - 1;
      const cx = x(r) + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * 7, cy = y(h.war);
      const mine = String(h.rid) === ME, t = team(h.rid);
      const tip = `<b>${esc(h.name)}</b> · ${esc(h.pos)}<br>${esc(t ? t.name : "")} · ${h.season}${h.partial ? " (on pace)" : ""}<br>Kept in round ${h.round} · ${f2(h.war)} WAR<br>Pick was worth ${f2(h.ev)} → surplus ${sgn(h.surplus, 2)}`;
      s += `<circle cx="${cx}" cy="${cy}" r="${mine ? 7 : 5.5}" fill="${h.partial ? "#fbf7ee" : h.surplus >= 0 ? "#0b1f3a" : "#c8102e"}" stroke="${h.surplus >= 0 ? "#0b1f3a" : "#c8102e"}" stroke-width="${h.partial ? 2.5 : 1}" ${mine ? 'stroke-dasharray="0"' : ""} tabindex="0" data-tip="${esc(tip)}" aria-label="${esc(`${h.name}, ${h.season}, kept round ${h.round}, ${f2(h.war)} wins above replacement`)}"/>`;
      if (label.has(h.season + h.pid)) s += `<text x="${cx + 9}" y="${cy + 4}" font-size="12" font-weight="${mine ? 700 : 600}" fill="${mine ? "#c8102e" : "#0b1f3a"}">${esc(lastName(h.name))} '${h.season.slice(2)}</text>`;
    });
    s += `<text x="${(W + pad.l) / 2}" y="${H - 4}" text-anchor="middle" font-size="12" fill="#5b6577">Round the keeper cost</text><text x="12" y="${pad.t + 8}" font-size="12" fill="#5b6577" transform="rotate(-90 12 ${pad.t + 60})">WAR</text></svg>`;
    $("#histChart").innerHTML = s;

    const best = [...hist].sort((a, b) => b.surplus - a.surplus)[0];
    const full = hist.filter((h) => !h.partial);
    const fullStuds = full.filter((h) => h.round <= 3), fullSteals = full.filter((h) => h.round >= 8);
    $("#histLede").textContent = `Every keeper in ${[...new Set(hist.map((h) => h.season))].join(" and ")}, scored the same way: wins above replacement minus the value of the pick he used up. ${K.season} numbers are on pace from ${K.position[K.season].weeks} weeks, so they'll move.`;
    $("#histCards").innerHTML = [
      ["", "Stud keepers (rounds 1–3)", w2(avg(studs)), `average surplus · n=${studs.length} · full seasons only: ${w2(avg(fullStuds))} (n=${fullStuds.length})`],
      ["gold", "Value keepers (round 8+)", w2(avg(steals)), `average surplus · n=${steals.length} · full seasons only: ${w2(avg(fullSteals))} (n=${fullSteals.length})`],
      ["", "Best keeper so far", `${lastName(best.name)} '${best.season.slice(2)}`, `${esc(best.name)} kept in round ${best.round} by ${esc(team(best.rid).name)}: ${sgn(best.surplus, 2)} wins over the pick${best.partial ? " (on pace)" : ""}.`],
    ].map(([c, k, v, t]) => `<article class="card ${c ? "card--" + c : ""} reveal"><p class="card__k">${k}</p><p class="card__v" style="font-size:44px">${v}</p><p class="card__t">${t}</p></article>`).join("");

    // manager table
    const by = {};
    hist.forEach((h) => { const r = (by[h.rid] = by[h.rid] || { n: 0, s: 0, studs: 0 }); r.n++; r.s += h.surplus; if (h.round <= 3) r.studs++; });
    const rows = Object.entries(by).sort((a, b) => b[1].s - a[1].s), mx = Math.max(...rows.map(([, r]) => Math.abs(r.s)));
    $("#mgrTable").innerHTML = `<div class="luck">${rows.map(([rid, r]) => `<div class="luck__row ${rid === ME ? "is-me" : ""}">${tname(team(rid))}<div class="luck__track"><div class="luck__bar ${r.s < 0 ? "neg" : "pos pos--ink"}" style="width:${(Math.abs(r.s) / mx) * 50}%"></div></div><span class="luck__v">${sgn(r.s, 1)}</span></div>`).join("")}</div><p class="panel__note">${rows.map(([rid, r]) => r).reduce((a, r) => a + r.n, 0)} keepers. Bars right of center beat the picks they cost.</p>`;

    // Green Goblin case study
    const gg = cur.teams.find((t) => t.name === "Green Goblin");
    const ggRows = gg ? hist.filter((h) => h.rid === gg.rid) : [];
    const nab = ggRows.filter((h) => h.name === "Malik Nabers");
    const wat = K.alt && K.alt.watson2026;
    if (gg && nab.length && wat) {
      const nab26 = nab.find((h) => h.season === K.season);
      $("#goblinCase").innerHTML = `<header class="panel__head"><p class="eyebrow" style="margin:0 0 4px">Case study</p><h3>Green Goblin: Nabers in round ${nab26 ? nab26.round : "?"}, or Watson for free?</h3></header>
        <p class="panel__sub" style="margin-bottom:12px">Green Goblin picked Christian Watson up off waivers in ${+K.season - 1}, so he could have kept him for a round-${wat.cost} pick in ${K.season}. He kept Malik Nabers instead.</p>
        <table><thead><tr><th>Option</th><th class="n">Cost</th><th class="n">Model said before</th><th class="n">Surplus (on pace)</th></tr></thead><tbody>
          ${nab.map((h) => `<tr><td>Keep Nabers, ${h.season}</td><td class="n">Rd ${h.round}</td><td class="n">${h.projBefore != null ? sgn(h.projBefore - h.ev, 2) : "–"}</td><td class="n"><b>${sgn(h.surplus, 2)}</b>${h.partial ? "*" : ""}</td></tr>`).join("")}
          <tr class="is-me"><td>Keep Watson, ${wat.season}</td><td class="n">Rd ${wat.cost}</td><td class="n">${sgn(wat.projBefore - wat.ev, 2)}</td><td class="n"><b>${sgn(wat.surplus, 2)}</b>*</td></tr>
        </tbody></table>
        <p class="panel__note"><b>Verdict:</b> In hindsight, Watson for a ${ord(wat.cost)} would have been worth about ${f1(wat.surplus - (nab26 ? nab26.surplus : 0))} more wins this season, and it would have freed the round-${nab26 ? nab26.round : 2} pick for someone else. Before the season the model wouldn't have flagged it, though: Watson had only played a handful of games, so his projection was tiny. Keeping studs at their price isn't a mistake. It's just low margin, because a ${ord(nab26 ? nab26.round : 2)}-round pick is already worth ${f2(ev(nab26 ? nab26.round : 2))} wins. The bigger edge is spotting the cheap keeper before he breaks out. That pick became Watson for you, via the James Cook trade. *On pace.</p>`;
    } else $("#goblinCase").hidden = true;

    // full table
    $("#histTable").innerHTML = `<table class="sortable"><thead><tr><th>Season</th><th>Player</th><th>Team</th><th class="n">Kept rd</th><th class="n">WAR</th><th class="n">Pick worth</th><th class="n">Surplus</th><th class="n">Model before</th></tr></thead><tbody>${[...hist].sort((a, b) => b.surplus - a.surplus).map((h) => `<tr class="${String(h.rid) === ME ? "is-me" : ""}"><td>${h.season}${h.partial ? "*" : ""}</td><td><b>${esc(h.name)}</b> <span class="asset__pos ${posCls(h.pos)}">${esc(h.pos)}</span></td><td>${esc(team(h.rid)?.name || "")}</td><td class="n">${h.round}</td><td class="n">${f2(h.war)}</td><td class="n">${f2(h.ev)}</td><td class="n"><b>${sgn(h.surplus, 2)}</b></td><td class="n">${h.projBefore != null ? f2(h.projBefore) : "–"}</td></tr>`).join("")}</tbody></table><p class="panel__note" style="padding:0 16px 16px">* on pace. "Model before" is the projected WAR the model would have given before that season.</p>`;
    sortable($("#histTable table"));
  }

  // =============== positions ===============
  function positions() {
    const yrs = Object.keys(K.position);
    const y = lastFull, tops = K.position[y].tops, repl = K.position[y].repl;
    const W = 520, H = 300, pad = { l: 40, r: 12, t: 14, b: 34 }, N = 30;
    const max = Math.ceil(Math.max(...tops.RB.slice(0, N), ...tops.WR.slice(0, N)) / 5) * 5, min = Math.floor(Math.min(repl.RB, repl.WR, ...tops.RB.slice(0, N), ...tops.WR.slice(0, N)) / 5) * 5;
    const x = (i) => pad.l + (i / (N - 1)) * (W - pad.l - pad.r), yy = (v) => pad.t + (H - pad.t - pad.b) * (1 - (v - min) / (max - min));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Points per game for the top ${N} running backs and receivers in ${y}.">`;
    for (let v = min; v <= max; v += 5) s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yy(v)}" y2="${yy(v)}" stroke="rgba(11,31,58,0.08)"/><text x="${pad.l - 6}" y="${yy(v) + 4}" text-anchor="end" font-size="11" fill="#5b6577">${v}</text>`;
    [["RB", "#1f7a4d", "0"], ["WR", "#1f4e8c", "6 4"]].forEach(([p, col, dash]) => {
      s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yy(repl[p])}" y2="${yy(repl[p])}" stroke="${col}" stroke-width="1.5" stroke-dasharray="2 4"/>`;
      s += `<polyline fill="none" stroke="${col}" stroke-width="3" stroke-dasharray="${dash}" points="${tops[p].slice(0, N).map((v, i) => `${x(i)},${yy(v)}`).join(" ")}"/>`;
      tops[p].slice(0, N).forEach((v, i) => (s += `<circle cx="${x(i)}" cy="${yy(v)}" r="5" fill="transparent" tabindex="-1" data-tip="${esc(`<b>${p}${i + 1}</b> · ${f1(v)} pts/gm`)}"/>`));
      s += `<text x="${W - pad.r}" y="${yy(repl[p]) - 5}" text-anchor="end" font-size="11" font-weight="700" fill="${col}">${p} replacement ${f1(repl[p])}</text>`;
    });
    [1, 10, 20, 30].forEach((i) => (s += `<text x="${x(i - 1)}" y="${H - pad.b + 16}" text-anchor="middle" font-size="12" fill="#3c4a60">${i}</text>`));
    s += `<text x="${(W + pad.l) / 2}" y="${H - 4}" text-anchor="middle" font-size="12" fill="#5b6577">Positional rank (${y})</text></svg>`;
    $("#dropChart").innerHTML = s;
    const gap = (p, n) => tops[p][n - 1] - repl[p];
    $("#dropSub").textContent = `${y}, players with enough games. The RB1 cleared replacement by ${f1(gap("RB", 1))} points a game, the WR1 by ${f1(gap("WR", 1))}. At rank 12: RB ${f1(gap("RB", 12))}, WR ${f1(gap("WR", 12))}.`;
    $("#posTable").innerHTML = `<table><thead><tr><th>Pos</th>${yrs.map((yr) => `<th class="n">Repl. ${yr}${K.position[yr].partial ? "*" : ""}</th>`).join("")}<th class="n">Stability r</th><th class="n">Starters / team</th></tr></thead><tbody>${["QB", "RB", "WR", "TE"].map((p) => `<tr><td><b class="${posCls(p)}">${p}</b></td>${yrs.map((yr) => `<td class="n">${f1(K.position[yr].repl[p])}</td>`).join("")}<td class="n">${(K.stability[p] || []).map((s) => `<span data-tip="${esc(`${s.from}→${s.to}, n=${s.n}`)}">${f2(s.r)}</span>`).join(" · ") || "–"}</td><td class="n">${{ QB: "1", RB: "2 + flex", WR: "2 + flex", TE: "1 + flex" }[p]}</td></tr>`).join("")}</tbody></table><p class="panel__note">* ${K.season} after ${K.position[K.season].weeks} weeks; early-season replacement levels run low. Stability pairs: ${yrs.slice(0, -1).map((a, i) => `${a}→${yrs[i + 1]}`).join(", ")}.</p>`;
    const bands = [...new Set(K.bands.map((b) => b.band))];
    $("#bandTable").innerHTML = `<div class="table-wrap"><table><thead><tr><th>Pos</th>${bands.map((b) => `<th class="n">Rounds ${b}</th>`).join("")}</tr></thead><tbody>${["QB", "RB", "WR", "TE"].map((p) => `<tr><td><b class="${posCls(p)}">${p}</b></td>${bands.map((b) => { const r = K.bands.find((x) => x.pos === p && x.band === b); return `<td class="n">${r && r.n ? `${f2(r.mean)} <small class="muted">· ${Math.round(r.hit * 100)}% hit · n=${r.n}</small>` : "–"}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div>`;
    const rb = K.bands.find((b) => b.pos === "RB" && b.band === bands[0]), wr = K.bands.find((b) => b.pos === "WR" && b.band === bands[0]);
    const rb2 = K.bands.find((b) => b.pos === "RB" && b.band === bands[1]), wr2 = K.bands.find((b) => b.pos === "WR" && b.band === bands[1]);
    $("#posLede").textContent = `Two flex spots mean each team starts up to four RBs or four WRs, so replacement level is deep at both. In your drafts, early RBs returned ${f2(rb.mean)} WAR per pick vs. ${f2(wr.mean)} for early WRs (rounds ${bands[0]}), and ${f2(rb2.mean)} vs. ${f2(wr2.mean)} in rounds ${bands[1]}. Elite RBs win more, and receivers are ${stabWord()} (r ${f2(stab("WR"))} vs. ${f2(stab("RB"))} for RBs). Bottom line for a keeper: the position matters less than the gap between a player's projection and the price of his round. Age is the RB tiebreaker: the model trims RBs 28 and older.`;
  }

  // =============== keeper trades ===============
  function keeperTrades() {
    const fair = (s) => { if (s <= ev(K.rounds)) return null; const c = K.curve.find((c) => c.ev <= s); return c ? c.round : 1; };
    const pickFate = (seller, buyer, season, round) => {
      for (const t of D.trades) for (const sd of t.sides) if (sd.rid === seller) for (const p of sd.picks) if (p.season === season && p.round === round && p.orig === buyer && p.status === "used") return p.became.player.name + ` (${f1(p.pts)} pts for ${esc(team(seller).name)})`;
      return null;
    };
    const rows = [...K.keeperTrades].sort((a, b) => (team(b.from)?.owner === D.me) - (team(a.from)?.owner === D.me) || b.season.localeCompare(a.season));
    $("#keeperTrades").innerHTML = rows.map((t) => {
      const paid = t.paid.reduce((a, p) => a + p.ev, 0), back = t.picksBack.reduce((a, p) => a + p.ev, 0);
      const expS = t.projBefore - t.evKeep, actS = t.war - t.evKeep;
      const buyerExp = expS - paid + back, buyerAct = actS - paid + back;
      const f = fair(expS);
      const mine = String(t.from) === ME || String(t.to) === ME;
      const fates = t.paid.map((p) => pickFate(t.from, t.to, p.season, p.round)).filter(Boolean);
      return `<article class="ktrade ${mine ? "is-mine" : ""} reveal">
        <header><span class="trade__when">${t.season} preseason${mine ? " · your trade" : ""}</span><h3>${esc(t.player)} <span class="${posCls(t.pos)}">${esc(t.pos)}</span></h3>
        <p>${esc(team(t.from).name)} → ${esc(team(t.to).name)}, who kept him in round ${t.keepRound}. Paid: ${t.paid.length ? t.paid.map((p) => `${p.season} rd ${p.round}`).join(" + ") : "no picks"}${t.picksBack.length ? `; got back ${t.picksBack.map((p) => `rd ${p.round}`).join(" + ")}` : ""}${t.playersBack.length ? `; players also moved: ${t.playersBack.map(esc).join(", ")}` : ""}.</p></header>
        <div class="ktrade__grid">
          <div><span class="k">Keeper surplus, expected</span><b>${sgn(expS, 2)}</b><small>model before: ${f2(t.projBefore)} WAR vs. a round-${t.keepRound} pick (${f2(t.evKeep)})</small></div>
          <div><span class="k">Picks paid</span><b>${paid ? "−" + f2(paid) : "0.00"}</b><small>${back ? `+${f2(back)} back` : "expected value of the picks"}</small></div>
          <div class="${buyerExp >= 0 ? "good" : "bad"}"><span class="k">Buyer, expected</span><b>${sgn(buyerExp, 2)}</b><small>${f ? `fair price ≈ a round-${f} pick` : "keeping him wasn't worth more than the pick"}</small></div>
          <div class="${buyerAct >= 0 ? "good" : "bad"}"><span class="k">Buyer, ${t.partial ? "on pace" : "actual"}</span><b>${sgn(buyerAct, 2)}</b><small>${f2(t.war)} WAR ${t.partial ? "on pace" : ""}</small></div>
        </div>
        ${fates.length ? `<p class="ktrade__note">Seller's return: that pick became <b>${fates.join(", ")}</b>.</p>` : ""}
        ${t.player === "James Cook" ? `<p class="ktrade__note"><b>Your answer:</b> You weren't keeping Cook, so to you he was worth nothing at the deadline, and you turned him into a pick worth ${f2(paid)} wins on average. For ${esc(team(t.to).name)}, the model said Cook in round ${t.keepRound} was only ${w2(expS)} wins better than a normal round-${t.keepRound} pick. A fair price was ${f ? `about a round-${f} pick` : "next to nothing"}, not a 6th. So yes, a 6th was too high. Cook has outplayed that projection so far (${f2(t.war)} WAR on pace), which gets them back to ${sgn(buyerAct, 2)}. Meanwhile your pick became Christian Watson, so you've won it either way.</p>` : ""}
      </article>`;
    }).join("") || `<p class="lede">No pick-for-keeper trades found.</p>`;
  }

  // =============== method ===============
  function method() {
    const sig = Object.entries(K.wpp.sigma).map(([y, s]) => `${y}: ${s}`).join(", ");
    const rows = [
      ["Wins above replacement", `Every rostered QB, RB, WR and TE's weekly points come from Sleeper, regular season only. Replacement level per position is the average of the three best players just outside the league's starting pool (10 teams × QB, 2 RB, 2 WR, TE, plus 2 flex filled by the best leftover RB/WR/TE). Each game a player plays adds (points − replacement); missed games add zero, because someone from waivers would have played.`],
      ["Points to wins", `Weekly team scores spread with a standard deviation of about ${Object.values(K.wpp.sigma).slice(-1)[0]} points (${sig}). If both scores are roughly normal, one extra point of expected margin adds φ(0)/(σ√2) ≈ ${K.wpp.model} wins, so about ${Math.round(1 / K.wpp.model)} points = 1 win. Cross-check: regressing actual wins on points for across ${K.wpp.n} team-seasons gives ${K.wpp.empirical} wins per point (r = ${K.wpp.r}), about ${Math.round(1 / K.wpp.empirical)} points per win. The model uses the more conservative number, so WAR is, if anything, understated.`],
      ["Price of a pick", `For every non-keeper QB/RB/WR/TE pick in completed seasons (${K.complete.join(", ")}), take the player's WAR that season (negative counts as zero, since you'd bench him). Average by round, then smooth so value can't rise in a later round (weighted isotonic regression). Rounds beyond ${K.rounds} in older 20-round drafts are pooled into round ${K.rounds}. Kickers and defenses are left out.`],
      ["Projection", `Next-season WAR = (2 × this season's points above replacement + last season's) ÷ (2 × games + last season's games + 3), times expected games, times wins per point. The "+3" pulls small samples toward replacement. Age: RBs 28+ ×0.85, WRs/TEs 31+ ×0.9, QBs 36+ ×0.9. Expected games come from each player's own availability, blended with an 85% league norm.`],
      ["Keeper cost", `As observed in your drafts: one round earlier than the player's most recent draft slot; round 1 stays round 1; waiver pickups (or players dropped and re-added) cost round ${K.rounds}. Two keepers in the same round: one slides a round later. A few past keepers don't fit these rules exactly (likely commissioner calls), so check edge cases with the league.`],
      ["Backtest", `For keepers since 2025 with a full season, the model's preseason projection correlated r = ${K.backtest.r} with what they produced (n = ${K.backtest.n}, mean absolute error ${K.backtest.mae} wins). That's useful for sorting, not for splitting hairs. Treat gaps under about 0.3 wins as a coin flip.`],
      ["What it doesn't know", `NFL draft capital, depth charts, coaching changes, contract years, or injuries that haven't happened yet. Rookies with only a few games project near zero; use the upside calculator for them. Current-season numbers are on pace from ${K.position[K.season].weeks} weeks and will change. Sample sizes are small: ${K.complete.length} completed drafts and ${hist.length} keepers.`],
    ];
    $("#method").innerHTML = rows.map(([k, t], i) => `<article class="method__row reveal"><span class="method__n">${String(i + 1).padStart(2, "0")}</span><div><h3>${k}</h3><p>${t}</p></div></article>`).join("");
  }

  // =============== sortable tables ===============
  function sortable(table) {
    if (!table) return;
    table.querySelectorAll("th").forEach((th, i) => {
      th.tabIndex = 0; th.setAttribute("role", "columnheader"); th.classList.add("sortable__th");
      const go = () => {
        const dir = th.getAttribute("aria-sort") === "descending" ? "ascending" : "descending";
        table.querySelectorAll("th").forEach((x) => x.removeAttribute("aria-sort"));
        th.setAttribute("aria-sort", dir);
        const body = table.tBodies[0], rows = [...body.rows];
        const val = (r) => { const t = r.cells[i].textContent.trim().replace("−", "-").replace(/^Rd\s*/, ""); const n = parseFloat(t.replace(/[^0-9.\-]/g, "")); return isNaN(n) ? t : n; };
        rows.sort((a, b) => { const x = val(a), y = val(b); const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y)); return dir === "ascending" ? c : -c; });
        rows.forEach((r) => body.appendChild(r));
      };
      th.addEventListener("click", go);
      th.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
  }

  // keyboard tooltips for chart marks
  const tip = $("#tip");
  document.addEventListener("focusin", (e) => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (!el) return;
    const r = el.getBoundingClientRect();
    tip.innerHTML = el.getAttribute("data-tip"); tip.hidden = false;
    tip.style.left = Math.min(r.right + 8, innerWidth - tip.offsetWidth - 8) + "px";
    tip.style.top = Math.min(r.top, innerHeight - tip.offsetHeight - 8) + "px";
  });
  document.addEventListener("focusout", () => (tip.hidden = true));

  findings(); boardSelect(); calc(); curve(); history(); positions(); keeperTrades(); method();
  B.observe();
  // content above an anchor just grew, so land on it again
  const anchor = location.hash.split("/")[2];
  if (anchor && document.getElementById(anchor)) document.getElementById(anchor).scrollIntoView({ block: "start" });
})();
