"""Keeper Lab: wins above replacement (WAR), draft-round value curve, keeper surplus.

Model, in plain terms
---------------------
1. Weekly points for every rostered QB/RB/WR/TE come from Sleeper matchups (regular season only).
2. Replacement level per position = average points/game of the 3 best players just outside the
   league's starting pool (10 teams x QB1, RB2, WR2, TE1, plus 2 FLEX filled by the best leftover RB/WR/TE).
3. Points above replacement (PAR) = sum over games played of (points - replacement). Missed games count 0,
   because a replacement-level player would have filled in.
4. Wins per point: with weekly team scores ~ Normal(mu, sigma), adding one point to your expected margin
   raises win probability by phi(0) / (sigma * sqrt 2) = 0.2821 / sigma. WAR = PAR x that.
5. Draft value curve: mean max(WAR, 0) of non-keeper QB/RB/WR/TE picks by round, in completed seasons,
   forced to decrease by round (pool-adjacent-violators). A keeper costs you the pick in its round.
6. Keeper surplus = projected next-season WAR - expected WAR of the pick you give up.
"""
import math
import statistics

POS = ("QB", "RB", "WR", "TE")
STARTERS = {"QB": 1, "RB": 2, "WR": 2, "TE": 1}
FLEX = 2
WPP_CONST = 0.3989422804 / math.sqrt(2)  # phi(0)/sqrt(2)
HIT = 0.5  # a "hit" season: half a win above replacement, roughly a top-12 RB/WR


def season_tables(s):
    """Per-player weekly points, per-season replacement levels, wins-per-point."""
    L = s["league"]
    st = L["settings"]
    reg_end = st.get("playoff_week_start", 15) - 1
    done = reg_end if L["status"] == "complete" else min(st.get("last_scored_leg", 0), reg_end)
    weekly = {}  # pid -> {week: pts}
    owner = {}   # pid -> roster_id on the last week we saw them
    team_scores = []
    for w in range(1, done + 1):
        for m in s["matchups"].get(w) or s["matchups"].get(str(w)) or []:
            team_scores.append(m.get("points") or 0)
            for pid, pts in (m.get("players_points") or {}).items():
                weekly.setdefault(pid, {})[w] = pts or 0
                owner[pid] = m["roster_id"]
    sigma = statistics.pstdev(team_scores) if len(team_scores) > 2 else 28.0
    return {"season": L["season"], "weeks": done, "regEnd": reg_end, "weekly": weekly, "owner": owner,
            "sigma": sigma, "wpp": WPP_CONST / sigma, "teamMean": statistics.mean(team_scores) if team_scores else 0}


def replacement(tab, pos_of, teams=10):
    weeks = max(tab["weeks"], 1)
    min_g = max(2, math.ceil(0.4 * weeks))
    rows = []
    for pid, wk in tab["weekly"].items():
        pos = pos_of(pid)
        if pos not in POS:
            continue
        played = [p for p in wk.values() if p != 0]
        if len(played) < min_g:
            continue
        rows.append((statistics.mean(played), pos, pid))
    rows.sort(reverse=True)
    taken, counts = set(), {p: 0 for p in POS}
    for ppg, pos, pid in rows:
        if counts[pos] < STARTERS[pos] * teams:
            counts[pos] += 1; taken.add(pid)
    flex_left = FLEX * teams
    for ppg, pos, pid in rows:
        if flex_left and pid not in taken and pos in ("RB", "WR", "TE"):
            taken.add(pid); flex_left -= 1
    repl, pools = {}, {}
    for pos in POS:
        left = [r[0] for r in rows if r[1] == pos and r[2] not in taken][:3]
        repl[pos] = statistics.mean(left) if left else 0
        pools[pos] = [r[0] for r in rows if r[1] == pos]
    return repl, pools


def place(cost, owned, used, last):
    """League rule: if you no longer own the pick in a keeper's round, he moves up to the nearest earlier
    round you own; if two keepers collide, the later one slides back a round."""
    c = cost
    if c not in owned:
        earlier = [r for r in owned if r < cost]
        later = [r for r in owned if r > cost]
        c = max(earlier) if earlier else (min(later) if later else cost)
    while c in used and c < last:
        c += 1
        while c not in owned and c < last:
            c += 1
    return c


def pava_decreasing(xs, ws):
    """Weighted isotonic regression, non-increasing."""
    blocks = [[x, w, 1] for x, w in zip(xs, ws)]
    i = 0
    while i < len(blocks) - 1:
        if blocks[i][0] < blocks[i + 1][0]:
            a, b = blocks[i], blocks[i + 1]
            w = a[1] + b[1]
            blocks[i] = [(a[0] * a[1] + b[0] * b[1]) / w if w else 0, w, a[2] + b[2]]
            del blocks[i + 1]
            i = max(i - 1, 0)
        else:
            i += 1
    out = []
    for v, w, n in blocks:
        out += [v] * n
    return out


def build(seasons, players, me, pinfo):
    def pos_of(pid):
        return (players.get(str(pid)) or {}).get("position")

    tabs = {}
    for s in seasons:
        t = season_tables(s)
        t["repl"], t["pools"] = replacement(t, pos_of)
        tabs[t["season"]] = t
    years = sorted(tabs)
    complete = [y for y in years if tabs[y]["weeks"] >= tabs[y]["regEnd"]]
    cur = years[-1]
    nxt = str(int(cur) + 1)

    def war(y, pid):
        t = tabs[y]
        pos = pos_of(pid)
        wk = t["weekly"].get(str(pid), {})
        played = [p for p in wk.values() if p != 0]
        if pos not in POS or not played:
            return {"war": 0.0, "par": 0.0, "g": 0, "ppg": 0.0}
        par = sum(p - t["repl"][pos] for p in played)
        return {"war": par * t["wpp"], "par": par, "g": len(played), "ppg": statistics.mean(played)}

    def war_pace(y, pid):
        """Full-season WAR (regular-season length), scaling a partial season."""
        r = war(y, pid)
        t = tabs[y]
        k = t["regEnd"] / t["weeks"] if t["weeks"] else 0
        return {**r, "warPace": r["war"] * k}

    # ---------- draft picks + value curve ----------
    drafts = {}
    for s in seasons:
        y = s["league"]["season"]
        for dr in s["drafts"]:
            if dr.get("status") == "complete":
                drafts[y] = {"rounds": dr["settings"]["rounds"], "picks": dr["picks"]}
    cur_rounds = drafts.get(cur, {}).get("rounds", 16)
    by_round = {}
    pick_rows = []
    for y in years:
        if y not in drafts:
            continue
        for p in drafts[y]["picks"]:
            pos = pos_of(p["player_id"])
            if pos not in POS:
                continue
            r = war_pace(y, p["player_id"])
            row = {"season": y, "round": p["round"], "pick": p["pick_no"], "rid": p["roster_id"],
                   "pid": p["player_id"], "name": pinfo(p["player_id"])["name"], "pos": pos,
                   "keeper": bool(p.get("is_keeper")), "war": round(r["warPace"], 2), "g": r["g"],
                   "ppg": round(r["ppg"], 2), "partial": y not in complete}
            pick_rows.append(row)
            if y in complete and not row["keeper"]:
                rr = min(p["round"], cur_rounds)  # rounds past the current draft length pool into the last round
                by_round.setdefault(rr, []).append(max(row["war"], 0))
    rounds = list(range(1, cur_rounds + 1))
    raw = [statistics.mean(by_round[r]) if by_round.get(r) else 0 for r in rounds]
    cnt = [len(by_round.get(r, [])) for r in rounds]
    smooth = pava_decreasing(raw, cnt)
    curve = [{"round": r, "raw": round(raw[i], 3), "ev": round(smooth[i], 3), "n": cnt[i],
              "median": round(statistics.median(by_round[r]), 3) if by_round.get(r) else 0,
              "hit": round(sum(1 for v in by_round.get(r, []) if v >= HIT) / cnt[i], 3) if cnt[i] else 0}
             for i, r in enumerate(rounds)]
    ev = {c["round"]: c["ev"] for c in curve}

    teams = len(next(x for x in seasons if x["league"]["season"] == cur)["rosters"])
    n_picks = cur_rounds * teams
    by_pick = {}
    for row in pick_rows:
        if row["partial"] or row["keeper"]:
            continue
        by_pick.setdefault(min(row["pick"], n_picks), []).append(max(row["war"], 0))
    raw_p = [statistics.mean(by_pick[i]) if by_pick.get(i) else None for i in range(1, n_picks + 1)]
    half = 6  # +/- 6 picks: about a round's worth of neighbours
    sm = []
    for i in range(n_picks):
        vals, wts = [], []
        for j in range(max(0, i - half), min(n_picks, i + half + 1)):
            for v in by_pick.get(j + 1, []):
                vals.append(v)
        sm.append(statistics.mean(vals) if vals else 0)
    cnt_p = [max(len(by_pick.get(i + 1, [])), 1) for i in range(n_picks)]
    pick_curve = [round(v, 3) for v in pava_decreasing(sm, cnt_p)]

    # draft surplus by position: did players at each position beat the value of the pick used on them?
    pos_draft = []
    for pos in POS:
        for lo, hi in [(1, 3), (4, 6), (7, 10), (11, 16)]:
            v = [max(r["war"], 0) - pick_curve[min(r["pick"], n_picks) - 1] for r in pick_rows
                 if r["pos"] == pos and not r["partial"] and not r["keeper"] and lo <= min(r["round"], cur_rounds) <= hi]
            pos_draft.append({"pos": pos, "band": f"{lo}-{hi}", "n": len(v), "surplus": round(statistics.mean(v), 3) if v else None})
    share = {}
    for pos in POS:
        early = [r for r in pick_rows if not r["keeper"] and r["round"] <= 3]
        share[pos] = round(sum(1 for r in early if r["pos"] == pos) / len(early), 3) if early else 0

    # draft order history: slot by roster per season
    slots = {}
    for s_ in seasons:
        y = s_["league"]["season"]
        rid_by_owner = {r["owner_id"]: r["roster_id"] for r in s_["rosters"]}
        for dr in s_["drafts"]:
            if dr.get("draft_order"):
                slots[y] = {str(rid_by_owner.get(u)): sl for u, sl in dr["draft_order"].items() if rid_by_owner.get(u)}

    def value_round(w):
        for c in curve:
            if c["ev"] <= w:
                return c["round"]
        return cur_rounds + 1

    # ---------- empirical check of wins-per-point ----------
    check = []
    for y in complete:
        s = next(x for x in seasons if x["league"]["season"] == y)
        n = len(s["rosters"])
        pf = {r["roster_id"]: r["settings"].get("fpts", 0) + r["settings"].get("fpts_decimal", 0) / 100 for r in s["rosters"]}
        wins = {r["roster_id"]: r["settings"].get("wins", 0) for r in s["rosters"]}
        mu = statistics.mean(pf.values())
        for rid in pf:
            check.append((pf[rid] - mu, wins[rid] - tabs[y]["regEnd"] / 2))
    if len(check) > 2:
        xs, ys = zip(*check)
        slope = sum(x * y for x, y in zip(xs, ys)) / sum(x * x for x in xs)
        corr = statistics.correlation(xs, ys)
    else:
        slope, corr = 0, 0
    model_wpp = statistics.mean(tabs[y]["wpp"] for y in complete) if complete else tabs[cur]["wpp"]

    # ---------- keeper history ----------
    def cost_note(prev_round):
        return max(prev_round - 1, 1)

    history = []
    for y in years:
        if y not in drafts:
            continue
        for p in drafts[y]["picks"]:
            if not p.get("is_keeper"):
                continue
            pos = pos_of(p["player_id"])
            r = war_pace(y, p["player_id"]) if pos in POS else {"warPace": 0, "g": 0, "ppg": 0}
            cr = min(p["round"], cur_rounds)
            history.append({"season": y, "rid": p["roster_id"], "pid": p["player_id"], "name": pinfo(p["player_id"])["name"],
                            "pos": pos, "round": p["round"], "war": round(r["warPace"], 2), "ev": ev.get(cr, 0),
                            "surplus": round(r["warPace"] - ev.get(cr, 0), 2), "partial": y not in complete,
                            "ppg": round(r.get("ppg", 0), 2)})

    # ---------- next-year keeper board for every current roster ----------
    cur_s = next(x for x in seasons if x["league"]["season"] == cur)
    owner_of = {(rnd, r["roster_id"]): r["roster_id"] for r in cur_s["rosters"] for rnd in range(1, cur_rounds + 1)}
    for tp in cur_s.get("traded_picks") or []:
        if str(tp.get("season")) == nxt and (tp["round"], tp["roster_id"]) in owner_of:
            owner_of[(tp["round"], tp["roster_id"])] = tp["owner_id"]
    owned_next = {}
    for (rnd, _orig), own in owner_of.items():
        owned_next.setdefault(str(own), set()).add(rnd)
    owned_next = {k: sorted(v) for k, v in owned_next.items()}
    drafted_round = {p["player_id"]: p for p in drafts.get(cur, {}).get("picks", [])}
    dropped = set()
    for t in cur_s["transactions"]:
        if t.get("status") == "complete" and t["type"] in ("free_agent", "waiver"):
            dropped.update((t.get("drops") or {}).keys())
    prev_y = years[-2] if len(years) > 1 else None

    def project_at(pid, y1, y0):
        """Marcel-style: season y1 weighted 2x, season y0 1x, plus 3 replacement-level games of regression."""
        pos = pos_of(pid)
        a = war(y1, pid)
        b = war(y0, pid) if y0 else {"par": 0, "g": 0}
        den = 2 * a["g"] + b["g"] + 3
        rate = (2 * a["par"] + b["par"]) / den if den else 0  # PAR per game
        info = players.get(str(pid)) or {}
        age = info.get("age")
        if age and y1 != cur:  # ages in the player DB are current; roll them back for backtests
            age -= int(cur) - int(y1)
        adj = 1.0
        if age:
            if pos == "RB" and age >= 28: adj = 0.85
            elif pos in ("WR", "TE") and age >= 31: adj = 0.9
            elif pos == "QB" and age >= 36: adj = 0.9
        weeks_avail = (tabs[y1]["weeks"] - 1) + ((tabs[y0]["regEnd"] - 1) if y0 and b["g"] else 0)
        avail = (a["g"] + b["g"] + 0.85 * 4) / (max(weeks_avail, 0) + 4)
        games = (tabs[y1]["regEnd"] - 1) * min(avail, 1)
        proj = max(rate * adj * games * model_wpp, 0)
        return {"proj": round(proj, 2), "rate": round(rate, 2), "games": round(games, 1), "age": age, "ageAdj": adj}

    def project(pid):
        return {**project_at(pid, cur, prev_y),
                "cur": {k: round(v, 2) for k, v in war_pace(cur, pid).items()},
                "prev": {k: round(v, 2) for k, v in war(prev_y, pid).items()} if prev_y else None}

    # backtest: what the model would have said before each keeper season, vs what happened
    for h in history:
        i = years.index(h["season"])
        if i == 0: continue
        y1 = years[i - 1]; y0 = years[i - 2] if i >= 2 else None
        h["projBefore"] = project_at(h["pid"], y1, y0)["proj"] if h["pos"] in POS else 0
    bt = [(h["projBefore"], h["war"]) for h in history if "projBefore" in h and not h["partial"]]
    backtest = {"n": len(bt), "r": round(statistics.correlation(*zip(*bt)), 3) if len(bt) > 2 else None,
                "mae": round(statistics.mean(abs(a - b) for a, b in bt), 2) if bt else None}

    # keeper trades: preseason trades where the receiving team then kept the player it got
    kept = {(h["season"], h["rid"], str(h["pid"])): h for h in history}
    keeper_trades = []
    for s in seasons:
        y = s["league"]["season"]
        i = years.index(y)
        for t in s["transactions"]:
            if t["type"] != "trade" or t["status"] != "complete": continue
            for pid, rid in (t.get("adds") or {}).items():
                h = kept.get((y, rid, str(pid)))
                if not h: continue
                sender = next((r for r in t["roster_ids"] if r != rid), None)
                paid = [{"season": d["season"], "round": d["round"], "ev": ev.get(min(d["round"], cur_rounds), 0)}
                        for d in (t.get("draft_picks") or []) if d["owner_id"] == sender and d["previous_owner_id"] == rid]
                got_back = [str(p) for p, r in (t.get("adds") or {}).items() if r == sender]
                picks_back = [{"season": d["season"], "round": d["round"], "ev": ev.get(min(d["round"], cur_rounds), 0)}
                              for d in (t.get("draft_picks") or []) if d["owner_id"] == rid and d["previous_owner_id"] == sender]
                before = project_at(pid, years[i - 1], years[i - 2] if i >= 2 else None)["proj"] if i else 0
                keeper_trades.append({"season": y, "player": h["name"], "pid": pid, "pos": h["pos"], "to": rid, "from": sender,
                                      "keepRound": h["round"], "evKeep": h["ev"], "projBefore": before, "war": h["war"],
                                      "partial": h["partial"], "paid": paid, "picksBack": picks_back, "playersBack": [pinfo(p)["name"] for p in got_back]})

    boards = {}
    for r in cur_s["rosters"]:
        rows = []
        for pid in r.get("players") or []:
            pos = pos_of(pid)
            if pos not in POS:
                continue
            dp = drafted_round.get(pid)
            via = "draft"
            if dp and dp["roster_id"] == r["roster_id"] and pid not in dropped:
                cost = cost_note(dp["round"])
            elif dp and pid not in dropped:
                cost = cost_note(dp["round"]); via = "trade"
            else:
                cost = cur_rounds; via = "free agent"
            pr = project(pid)
            info = players.get(str(pid)) or {}
            rows.append({**pinfo(pid), "pos": pos, "cost": cost, "via": via,
                         "lastPick": dp["pick_no"] if dp and not dp.get("is_keeper") else None,
                         "exp": info.get("years_exp"), "depth": info.get("depth_chart_order"),
                         "injury": info.get("injury_status"),
                         "draftRound": dp["round"] if dp else None, "wasKeeper": bool(dp and dp.get("is_keeper")),
                         **pr, "ev": ev.get(cost, 0), "surplus": round(pr["proj"] - ev.get(cost, 0), 2),
                         "valueRound": value_round(pr["proj"])})
        boards[str(r["roster_id"])] = sorted(rows, key=lambda x: -x["surplus"])

    # ---------- position study ----------
    position = {}
    for y in years:
        t = tabs[y]
        position[y] = {"repl": {p: round(v, 2) for p, v in t["repl"].items()},
                       "tops": {p: [round(v, 2) for v in t["pools"][p][:30]] for p in POS},
                       "partial": y not in complete, "weeks": t["weeks"]}
    # season-to-season stability of PAR per game, by position
    stab = {}
    for a, b in zip(years, years[1:]):
        for pos in POS:
            pairs = []
            for pid in tabs[a]["weekly"]:
                if pos_of(pid) != pos: continue
                x, z = war(a, pid), war(b, pid)
                if x["g"] >= 6 and z["g"] >= max(3, tabs[b]["weeks"] // 2):
                    pairs.append((x["par"] / x["g"], z["par"] / z["g"]))
            if len(pairs) >= 5:
                stab.setdefault(pos, []).append({"from": a, "to": b, "n": len(pairs),
                                                 "r": round(statistics.correlation(*zip(*pairs)), 3)})
    # WAR by position and draft round band (completed seasons, non-keepers)
    bands = [(1, 3), (4, 6), (7, 10), (11, 16)]
    band_rows = []
    for pos in POS:
        for lo, hi in bands:
            v = [max(p["war"], 0) for p in pick_rows if p["pos"] == pos and not p["partial"] and not p["keeper"] and lo <= min(p["round"], cur_rounds) <= hi]
            band_rows.append({"pos": pos, "band": f"{lo}-{hi}", "n": len(v), "mean": round(statistics.mean(v), 2) if v else None,
                              "hit": round(sum(1 for x in v if x >= HIT) / len(v), 2) if v else None})

    # ---------- hindsight: the best three each team could have kept, knowing how the season went ----------
    by_year = {x["league"]["season"]: x for x in seasons}
    hindsight = []
    for i, y in enumerate(years):
        if i == 0 or y not in drafts:
            continue
        py = years[i - 1]
        prev = by_year[py]
        rounds_y = drafts[y]["rounds"]
        prev_round = {p["player_id"]: p for p in drafts.get(py, {}).get("picks", [])}
        prev_dropped = set()
        for t in prev["transactions"]:
            if t.get("status") == "complete" and t["type"] in ("free_agent", "waiver"):
                prev_dropped.update((t.get("drops") or {}).keys())
        actual_by_rid = {}
        for h in history:
            if h["season"] == y:
                actual_by_rid.setdefault(h["rid"], []).append(h)
        for r in prev["rosters"]:
            rid = r["roster_id"]
            cands = []
            for pid in r.get("players") or []:
                pos = pos_of(pid)
                if pos not in POS:
                    continue
                dp = prev_round.get(pid)
                cost = max(dp["round"] - 1, 1) if dp and pid not in prev_dropped else rounds_y
                w = war_pace(y, pid)["warPace"]
                cr = min(cost, cur_rounds)
                cands.append({"pid": pid, "name": pinfo(pid)["name"], "pos": pos, "cost": cost,
                              "war": round(w, 2), "ev": ev.get(cr, 0), "surplus": round(w - ev.get(cr, 0), 2)})
            cands.sort(key=lambda c: -c["surplus"])
            owned = {p["round"] for p in drafts[y]["picks"] if p["roster_id"] == rid} or set(range(1, rounds_y + 1))
            # league ADP: where each player actually went in that draft (keepers excluded)
            went = {p["player_id"]: p["pick_no"] for p in drafts[y]["picks"] if not p.get("is_keeper")}
            team_pick = {}
            for p in drafts[y]["picks"]:
                if p["roster_id"] == rid:
                    team_pick[p["round"]] = min(team_pick.get(p["round"], 10 ** 6), p["pick_no"])
            best, used, redraft = [], set(), []
            for c in cands:
                if len(best) >= 3 or c["surplus"] <= 0:
                    break
                cost = place(c["cost"], owned, used, rounds_y)
                mine_pick, adp = team_pick.get(cost), went.get(str(c["pid"]))
                if mine_pick and adp and adp > mine_pick:
                    # he was still on the board when this team picked in that round: no point keeping him
                    redraft.append({**c, "cost": cost, "adp": adp, "teamPick": mine_pick})
                    continue
                used.add(cost)
                e = ev.get(min(cost, cur_rounds), 0)
                best.append({**c, "cost": cost, "ruleCost": c["cost"], "ev": e, "surplus": round(c["war"] - e, 2), "adp": adp})
            actual = [{"pid": h["pid"], "name": h["name"], "pos": h["pos"], "cost": h["round"], "war": h["war"],
                       "ev": h["ev"], "surplus": h["surplus"]} for h in actual_by_rid.get(rid, [])]
            a_tot = round(sum(x["surplus"] for x in actual), 2)
            b_tot = round(sum(x["surplus"] for x in best), 2)
            kept_ids = {str(x["pid"]) for x in actual}
            missed = [b for b in best if str(b["pid"]) not in kept_ids]
            hindsight.append({"season": y, "rid": rid, "partial": y not in complete, "actual": actual, "best": best,
                              "actualTotal": a_tot, "bestTotal": b_tot, "gap": round(b_tot - a_tot, 2),
                              "missed": missed[:1], "pool": len(cands), "redraft": redraft[:3]})

    def alt(pid, y, cost):
        i = years.index(y)
        before = project_at(pid, years[i - 1], years[i - 2] if i >= 2 else None)["proj"] if i else 0
        w = war_pace(y, pid)["warPace"]
        return {"pid": pid, "name": pinfo(pid)["name"], "pos": pos_of(pid), "season": y, "cost": cost,
                "projBefore": before, "war": round(w, 2), "ev": ev.get(cost, 0), "surplus": round(w - ev.get(cost, 0), 2)}

    return {
        "season": cur, "next": nxt, "rounds": cur_rounds, "complete": complete, "maxKeepers": cur_s["league"]["settings"].get("max_keepers", 3),
        "wpp": {"model": round(model_wpp, 4), "empirical": round(slope, 4), "r": round(corr, 3), "n": len(check),
                "sigma": {y: round(tabs[y]["sigma"], 1) for y in years}},
        "curve": curve, "picks": pick_rows, "history": history, "boards": boards,
        "position": position, "stability": stab, "bands": band_rows,
        "backtest": backtest, "keeperTrades": keeper_trades, "hitLine": HIT,
        "teams": teams, "pickCurve": pick_curve, "posDraft": pos_draft, "earlyShare": share, "slots": slots,
        "repl": {pos: round(statistics.mean(tabs[y]["repl"][pos] for y in complete), 2) if complete else 0 for pos in POS},
        "hindsight": hindsight, "ownedNext": owned_next,
        "alt": {"watson2026": alt("8167", cur, cur_rounds) if "8167" in players else None},
    }
