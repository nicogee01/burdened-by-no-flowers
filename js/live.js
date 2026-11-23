/* Live week: before the site renders, pull this week's scores, projections and game status straight from
   Sleeper, and turn them into a projected final score and win chance for every matchup in both leagues.
   Everything else on the site reads window.LIVE. If Sleeper is slow or down, the site loads without it. */
(() => {
  "use strict";
  const D = window.SITE_DATA;
  const me = document.currentScript;
  const v = me ? me.dataset.v : "";
  const scripts = ["js/app.js", "js/keepers.js", "js/research.js", "js/compare.js", "js/footy.js"];
  const get = (u) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))));
  const phi = (z) => { const s = Math.sign(z); const x = Math.abs(z) / Math.SQRT2; const t = 1 / (1 + 0.3275911 * x); const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return 0.5 * (1 + s * y); };
  const scoreStats = (stats, sc) => { let p = 0; for (const k in stats) if (typeof stats[k] === "number" && sc[k]) p += stats[k] * sc[k]; return p; };

  async function live() {
    const st = await get("https://api.sleeper.app/v1/state/nfl");
    if (st.season_type !== "regular") return null;
    const week = st.week, season = st.season;
    const [proj, sched] = await Promise.all([
      get(`https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular`),
      get(`https://api.sleeper.com/schedule/nfl/regular/${season}`),
    ]);
    const status = {};
    sched.filter((g) => g.week === week).forEach((g) => { status[g.home] = g.status; status[g.away] = g.status; });
    const pm = {};
    for (const e of proj) pm[String(e.player_id)] = e;

    function league(ms, sc) {
      const teams = {};
      for (const m of ms) {
        let final = 0, vr = 0, left = 0, done = 0;
        const pts = m.players_points || {};
        for (const pid of m.starters || []) {
          if (!pid || pid === "0") continue;
          const actual = pts[pid] || 0, e = pm[pid];
          const team = (e && e.team) || (/^[A-Z]+$/.test(pid) ? pid : null);
          const gs = team ? status[team] : null;
          let p = e ? scoreStats(e.stats || {}, sc) : 0;
          if (e && p <= 0 && e.stats && e.stats.pts_ppr) p = e.stats.pts_ppr; // e.g. defenses with bucketed scoring
          if (!gs || gs === "complete") { final += actual; done++; }
          else if (gs === "pre_game") { final += p; vr += Math.pow(0.45 * p + 2, 2); left++; }
          else { const rem = Math.max(0, p - actual) * 0.5; final += actual + rem; vr += Math.pow(0.5 * rem + 2, 2); left++; }
        }
        teams[m.roster_id] = { now: m.points || 0, proj: final, sd: Math.sqrt(vr), left, done, mid: m.matchup_id };
      }
      const games = [];
      const byMid = {};
      for (const [rid, t] of Object.entries(teams)) if (t.mid) (byMid[t.mid] = byMid[t.mid] || []).push(+rid);
      for (const [a, b] of Object.values(byMid).filter((p) => p.length === 2)) {
        const A = teams[a], B = teams[b], s = Math.sqrt(A.sd ** 2 + B.sd ** 2);
        const pA = s < 1e-6 ? (A.proj > B.proj ? 1 : A.proj < B.proj ? 0 : 0.5) : phi((A.proj - B.proj) / s);
        games.push({ a, b, pA });
      }
      return { teams, games };
    }
    const out = { week, at: Date.now(), anyLive: Object.values(status).some((s) => s && s !== "pre_game") };
    const jobs = [["fugazi", D.leagueId, D.scoring], ["footy", D.footy && D.footy.leagueId, D.footy && D.footy.scoring]];
    await Promise.all(jobs.map(async ([k, lid, sc]) => {
      if (!lid || !sc) return;
      try { out[k] = league(await get(`https://api.sleeper.app/v1/league/${lid}/matchups/${week}`), sc); } catch { /* skip this league */ }
    }));
    return out;
  }

  function boot() {
    for (const src of scripts) {
      const s = document.createElement("script");
      s.src = `${src}?v=${v}`; s.async = false;
      document.body.appendChild(s);
    }
  }
  Promise.race([live(), new Promise((r) => setTimeout(() => r(null), 5000))])
    .then((l) => { window.LIVE = l || null; })
    .catch(() => { window.LIVE = null; })
    .finally(boot);
})();
