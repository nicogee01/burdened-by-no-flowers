"""Research hub data: matchups by position, defense projections, player form, remaining NFL schedule.

Every fantasy number uses this league's own scoring settings.
"""
import statistics

POS = ("QB", "RB", "WR", "TE", "K")


def build(get_url, league, rosters, users, players, me):
    season = league["season"]
    sc = league["scoring_settings"]
    sched = get_url(f"https://api.sleeper.com/schedule/nfl/regular/{season}") or []
    if not sched:
        return None
    done = max((g["week"] for g in sched if g.get("status") == "complete"), default=0)
    last_week = max(g["week"] for g in sched)

    def score(stats):
        return sum(v * sc.get(k, 0) for k, v in stats.items() if isinstance(v, (int, float)))

    # weekly fantasy points for every player and defense
    weekly = {}        # pid -> {week: pts}
    meta = {}          # pid -> {team, pos}
    snaps = {}         # pid -> [share]
    allowed = {}       # defense team -> pos -> {week: pts}
    dst = {}           # defense team -> {week: pts}
    for w in range(1, done + 1):
        for e in get_url(f"https://api.sleeper.com/stats/nfl/{season}/{w}?season_type=regular") or []:
            pid = str(e.get("player_id") or "")
            s = e.get("stats") or {}
            if not pid or not s:
                continue
            if pid.isalpha():
                dst.setdefault(pid, {})[w] = round(score(s), 2)
                continue
            pos = (e.get("player") or {}).get("position")
            if pos not in POS or not s.get("gp"):
                continue
            pts = round(score(s), 2)
            weekly.setdefault(pid, {})[w] = pts
            meta[pid] = {"team": e.get("team"), "pos": pos}
            if s.get("off_snp") and s.get("tm_off_snp"):
                snaps.setdefault(pid, []).append(s["off_snp"] / s["tm_off_snp"])
            opp = e.get("opponent")
            if opp:
                a = allowed.setdefault(opp, {}).setdefault(pos, {})
                a[w] = a.get(w, 0) + pts

    # opponent per team per week
    opp_of = {}
    for g in sched:
        opp_of[(g["week"], g["home"])] = {"opp": g["away"], "home": True, "date": g["date"]}
        opp_of[(g["week"], g["away"])] = {"opp": g["home"], "home": False, "date": g["date"]}
    teams = sorted({t for (_, t) in opp_of})

    # fantasy points each defense gives up per game, by position (and to opposing defenses)
    vs = {}
    for t in teams:
        games = [w for w in range(1, done + 1) if (w, t) in opp_of]
        row = {}
        for pos in POS:
            vals = [allowed.get(t, {}).get(pos, {}).get(w, 0) for w in games]
            row[pos] = round(statistics.mean(vals), 2) if vals else 0
        # what defenses score against this team's offense
        dvals = [dst[opp_of[(w, t)]["opp"]][w] for w in games if w in dst.get(opp_of[(w, t)]["opp"], {})]
        row["DEF"] = round(statistics.mean(dvals), 2) if dvals else 0
        vs[t] = row
    ranks = {}
    for pos in list(POS) + ["DEF"]:
        order = sorted(teams, key=lambda t: -vs[t][pos])
        for i, t in enumerate(order):
            ranks.setdefault(t, {})[pos] = i + 1  # 1 = gives up the most = best matchup

    # remaining schedule per NFL team
    remaining = {t: [] for t in teams}
    for w in range(done + 1, last_week + 1):
        for t in teams:
            o = opp_of.get((w, t))
            remaining[t].append({"week": w, **o} if o else {"week": w, "bye": True})

    # who owns what in the league
    uname = {u["user_id"]: ((u.get("metadata") or {}).get("team_name") or u.get("display_name") or "").strip() for u in users}
    owner = {}
    for r in rosters:
        for pid in r.get("players") or []:
            owner[pid] = {"rid": r["roster_id"], "team": uname.get(r["owner_id"], f"Team {r['roster_id']}"), "mine": r["owner_id"] == me}

    def info(pid):
        p = players.get(pid) or {}
        return (p.get("full_name") or f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or pid), p.get("team"), p.get("position")

    # players: everyone rostered, plus the best free agents at each position
    out_players = []
    fa_by_pos = {}
    for pid, wk in weekly.items():
        name, team, pos = info(pid)
        pos = pos or meta[pid]["pos"]
        if pos not in POS:
            continue
        vals = [wk[w] for w in sorted(wk)]
        row = {"id": pid, "name": name, "pos": pos, "team": team or meta[pid]["team"],
               "g": len(vals), "ppg": round(statistics.mean(vals), 2) if vals else 0,
               "last3": round(statistics.mean(vals[-3:]), 2) if vals else 0,
               "snap": round(statistics.mean(snaps[pid]), 3) if snaps.get(pid) else None,
               "weeks": {str(w): wk[w] for w in sorted(wk)},
               "owner": owner.get(pid)}
        if row["owner"]:
            out_players.append(row)
        elif row["g"] >= 2:
            fa_by_pos.setdefault(pos, []).append(row)
    for pos, rows in fa_by_pos.items():
        out_players += sorted(rows, key=lambda r: -r["ppg"])[: (12 if pos in ("QB", "TE", "K") else 30)]

    # defenses: all 32 with owner
    defenses = []
    for t in teams:
        vals = [dst.get(t, {}).get(w) for w in range(1, done + 1) if dst.get(t, {}).get(w) is not None]
        defenses.append({"team": t, "g": len(vals), "ppg": round(statistics.mean(vals), 2) if vals else 0,
                         "weeks": {str(w): v for w, v in sorted(dst.get(t, {}).items())},
                         "owner": owner.get(t)})

    return {"season": season, "done": done, "lastWeek": last_week,
            "playoffStart": league["settings"].get("playoff_week_start", 15),
            "vs": vs, "ranks": ranks, "remaining": remaining,
            "players": out_players, "defenses": defenses}
