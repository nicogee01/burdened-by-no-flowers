"""A second league (Official Sunday Footy League): standings, remaining schedule, and D/ST matchups.

Its playoff rules live in the site code: top 5 by record advance (top 2 get byes), and the 6th seed is
the highest scorer outside the top 5.
"""
import statistics


def build(get, get_url, league_id, me):
    L = get(f"league/{league_id}")
    lagging = False
    if L.get("status") == "in_season":
        sch = get_url(f"https://api.sleeper.com/schedule/nfl/regular/{L['season']}") or []
        final = max((w for w in {g["week"] for g in sch} if all(g.get("status") == "complete" for g in sch if g["week"] <= w)), default=0)
        reg_end_ = L["settings"].get("playoff_week_start", 15) - 1
        if final > (L["settings"].get("last_scored_leg") or 0):
            lagging = True  # Sleeper hasn't processed the week yet: rebuild records from the scores
            L["settings"]["last_scored_leg"] = min(final, reg_end_)
            L["settings"]["leg"] = min(final, reg_end_) + 1
    st = L["settings"]
    season = L["season"]
    reg_end = st.get("playoff_week_start", 15) - 1
    scored = min(st.get("last_scored_leg", 0) or 0, reg_end)
    current = st.get("leg") or scored + 1
    users = {u["user_id"]: u for u in get(f"league/{league_id}/users")}
    teams = []
    for r in get(f"league/{league_id}/rosters"):
        u = users.get(r["owner_id"] or "", {})
        s = r["settings"]
        teams.append({
            "rid": r["roster_id"], "mine": r["owner_id"] == me, "user": u.get("display_name"),
            "name": ((u.get("metadata") or {}).get("team_name") or u.get("display_name") or f"Team {r['roster_id']}").strip(),
            "avatar": (u.get("metadata") or {}).get("avatar") or (f"https://sleepercdn.com/avatars/{u['avatar']}" if u.get("avatar") else None),
            "w": s.get("wins", 0), "l": s.get("losses", 0), "t": s.get("ties", 0),
            "pf": round(s.get("fpts", 0) + s.get("fpts_decimal", 0) / 100, 2), "scores": [], "pa": 0.0, "results": [],
        })
    by_rid = {t["rid"]: t for t in teams}
    schedule, live = [], {}
    for w in range(1, reg_end + 1):
        ms = get(f"league/{league_id}/matchups/{w}") or []
        pairs = {}
        for m in ms:
            if m.get("matchup_id"):
                pairs.setdefault(m["matchup_id"], []).append(m["roster_id"])
            if w <= scored and m["roster_id"] in by_rid:
                by_rid[m["roster_id"]]["scores"].append(round(m.get("points") or 0, 2))
            if w == current:
                live[str(m["roster_id"])] = round(m.get("points") or 0, 2)
        if w >= current:
            schedule.append({"week": w, "pairs": [p for p in pairs.values() if len(p) == 2]})
    # points against and week-by-week results
    for w in range(1, scored + 1):
        pairs = {}
        for m in get(f"league/{league_id}/matchups/{w}") or []:
            if m.get("matchup_id"):
                pairs.setdefault(m["matchup_id"], []).append(m)
        for v in pairs.values():
            if len(v) != 2:
                continue
            for x, y in ((v[0], v[1]), (v[1], v[0])):
                t = by_rid.get(x["roster_id"])
                if not t:
                    continue
                px, py = x.get("points") or 0, y.get("points") or 0
                t["pa"] = round(t["pa"] + py, 2)
                t["results"].append("W" if px > py else "L" if py > px else "T")
    if lagging:
        for t in teams:
            t["w"] = t["l"] = t["t"] = 0
            t["pf"] = round(sum(t["scores"]), 2)
        for w in range(1, scored + 1):
            pairs = {}
            for m in get(f"league/{league_id}/matchups/{w}") or []:
                if m.get("matchup_id"):
                    pairs.setdefault(m["matchup_id"], []).append(m)
            for v in pairs.values():
                if len(v) != 2:
                    continue
                a_, b_ = v
                pa, pb = a_.get("points") or 0, b_.get("points") or 0
                ta, tb = by_rid.get(a_["roster_id"]), by_rid.get(b_["roster_id"])
                if not ta or not tb:
                    continue
                if pa > pb: ta["w"] += 1; tb["l"] += 1
                elif pb > pa: tb["w"] += 1; ta["l"] += 1
                else: ta["t"] += 1; tb["t"] += 1
    for t in teams:
        t["avg"] = round(statistics.mean(t["scores"]), 2) if t["scores"] else 0

    # D/ST matchups in this league's scoring
    sc = L["scoring_settings"]
    sched = get_url(f"https://api.sleeper.com/schedule/nfl/regular/{season}") or []
    nfl_done = max((w for w in {g["week"] for g in sched} if all(g.get("status") == "complete" for g in sched if g["week"] <= w)), default=0)  # every game final
    opp = {}
    for g in sched:
        opp[(g["week"], g["home"])] = (g["away"], True)
        opp[(g["week"], g["away"])] = (g["home"], False)
    dst = {}
    for w in range(1, nfl_done + 1):
        for e in get_url(f"https://api.sleeper.com/stats/nfl/{season}/{w}?season_type=regular") or []:
            pid = str(e.get("player_id") or "")
            if pid.isalpha() and e.get("stats"):
                dst.setdefault(pid, {})[w] = round(sum(v * sc.get(k, 0) for k, v in e["stats"].items() if isinstance(v, (int, float))), 2)
    nfl = sorted({t for (_, t) in opp})
    own, vs = {}, {}
    for t in nfl:
        vals = list(dst.get(t, {}).values())
        own[t] = round(statistics.mean(vals), 2) if vals else 0
        against = [dst[opp[(w, t)][0]][w] for w in range(1, nfl_done + 1) if (w, t) in opp and w in dst.get(opp[(w, t)][0], {})]
        vs[t] = round(statistics.mean(against), 2) if against else 0
    rank = {t: i + 1 for i, t in enumerate(sorted(nfl, key=lambda t: -vs[t]))}
    owner = {}
    for r in get(f"league/{league_id}/rosters"):
        for pid in r.get("players") or []:
            if str(pid).isalpha():
                owner[pid] = r["roster_id"]
    last_fantasy = reg_end + 3
    defs = []
    for t in nfl:
        games = []
        for w in range(nfl_done + 1, last_fantasy + 1):
            o = opp.get((w, t))
            games.append({"week": w, "bye": True} if not o else {"week": w, "opp": o[0], "home": o[1]})
        defs.append({"team": t, "ppg": own[t], "g": len(dst.get(t, {})), "owner": owner.get(t), "games": games})

    return {"leagueId": league_id, "name": L["name"], "season": season, "regEnd": reg_end, "scored": scored,
            "current": current, "playoffTeams": st.get("playoff_teams", 6), "teams": teams,
            "schedule": schedule, "live": live, "nflDone": nfl_done,
            "dst": {"vs": vs, "rank": rank, "defs": defs, "playoffStart": reg_end + 1}}
