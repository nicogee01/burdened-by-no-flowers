"""Pull the Fugazi Comeback league from Sleeper and write data/site-data.js.

Usage: python scripts/build.py [--players path/to/players.json]
Runs weekly from .github/workflows/refresh.yml.
"""
import json, os, statistics, sys, time, urllib.request

LEAGUE_ID = "1367213857868627968"
ME = "1169397187500027904"  # nicog01
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get(path):
    for attempt in range(4):
        try:
            req = urllib.request.Request("https://api.sleeper.app/v1/" + path, headers={"User-Agent": "bbnf-site"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2)


def load_players():
    if "--players" in sys.argv:
        return json.load(open(sys.argv[sys.argv.index("--players") + 1], encoding="utf-8"))
    return get("players/nfl")


def fetch_seasons():
    seasons, lid = [], LEAGUE_ID
    while lid and lid != "0":
        L = get(f"league/{lid}")
        s = {
            "league": L,
            "users": get(f"league/{lid}/users"),
            "rosters": get(f"league/{lid}/rosters"),
            "matchups": {w: get(f"league/{lid}/matchups/{w}") or [] for w in range(1, 18)},
            "transactions": [t for w in range(1, 19) for t in (get(f"league/{lid}/transactions/{w}") or [])],
            "drafts": get(f"league/{lid}/drafts") or [],
            "winners": get(f"league/{lid}/winners_bracket") or [],
        }
        for dr in s["drafts"]:
            dr["picks"] = get(f"draft/{dr['draft_id']}/picks") or []
        seasons.append(s)
        lid = L.get("previous_league_id")
    return sorted(seasons, key=lambda s: s["league"]["season"])


def main():
    players = load_players()
    seasons = fetch_seasons()

    def pinfo(pid):
        p = players.get(str(pid), {})
        if p.get("position") == "DEF" or str(pid).isalpha():
            return {"id": pid, "name": f"{p.get('team') or pid} D/ST", "pos": "DEF", "team": p.get("team") or pid}
        name = p.get("full_name") or f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or f"Player {pid}"
        return {"id": pid, "name": name, "pos": p.get("position") or "", "team": p.get("team") or "FA"}

    out = {"generated": int(time.time() * 1000), "me": ME, "seasons": [], "trades": []}
    # starter points by (season, roster_id, player_id, week)
    starter_pts = {}

    for s in seasons:
        L = s["league"]
        yr = L["season"]
        st = L["settings"]
        reg_end = st.get("playoff_week_start", 15) - 1
        done = reg_end if L["status"] == "complete" else min(st.get("last_scored_leg", 0), reg_end)
        divnames = {1: (L.get("metadata") or {}).get("division_1", "Division 1"),
                    2: (L.get("metadata") or {}).get("division_2", "Division 2")}
        users = {u["user_id"]: u for u in s["users"]}
        teams = {}
        for r in s["rosters"]:
            u = users.get(r["owner_id"] or "", {})
            teams[r["roster_id"]] = {
                "rid": r["roster_id"],
                "owner": r["owner_id"],
                "user": u.get("display_name", "Vacant"),
                "name": ((u.get("metadata") or {}).get("team_name") or u.get("display_name") or f"Team {r['roster_id']}").strip(),
                "avatar": (u.get("metadata") or {}).get("avatar") or (f"https://sleepercdn.com/avatars/{u['avatar']}" if u.get("avatar") else None),
                "div": r["settings"].get("division", 1),
                "ppts": round(r["settings"].get("ppts", 0) + r["settings"].get("ppts_decimal", 0) / 100, 2),
            }
        my_rid = next((t["rid"] for t in teams.values() if t["owner"] == ME), None)

        weeks = []  # [{rid: {pts, opp}}]
        schedule = []  # all regular weeks incl. future: list of pairs
        for w in range(1, 18):
            ms = s["matchups"].get(w) or []
            by_mid = {}
            for m in ms:
                by_mid.setdefault(m.get("matchup_id"), []).append(m)
                scored_thru = 17 if L["status"] == "complete" else st.get("last_scored_leg", 0)
                for pid, pts in zip(m.get("starters") or [], m.get("starters_points") or []) if w <= scored_thru else []:
                    if pid and pid != "0":
                        starter_pts[(yr, m["roster_id"], str(pid), w)] = pts or 0
            if w > reg_end:
                continue
            pairs = [[a["roster_id"], b["roster_id"]] for mid, (a, b) in
                     ((k, v) for k, v in by_mid.items() if k and len(v) == 2)]
            schedule.append({"week": w, "pairs": pairs})
            if w <= done:
                wk = {}
                for mid, grp in by_mid.items():
                    if not mid or len(grp) != 2:
                        continue
                    a, b = grp
                    wk[a["roster_id"]] = {"pts": round(a["points"] or 0, 2), "opp": b["roster_id"]}
                    wk[b["roster_id"]] = {"pts": round(b["points"] or 0, 2), "opp": a["roster_id"]}
                weeks.append(wk)

        # standings + all-play
        for t in teams.values():
            t.update(w=0, l=0, t=0, pf=0.0, pa=0.0, apw=0, apl=0, medw=0, scores=[])
        for wk in weeks:
            pts = sorted(v["pts"] for v in wk.values())
            for rid, v in wk.items():
                t = teams[rid]
                opp = wk[v["opp"]]["pts"]
                t["pf"] += v["pts"]; t["pa"] += opp; t["scores"].append(v["pts"])
                if v["pts"] > opp: t["w"] += 1
                elif v["pts"] < opp: t["l"] += 1
                else: t["t"] += 1
                t["apw"] += sum(1 for p in pts if p < v["pts"])
                t["apl"] += sum(1 for p in pts if p > v["pts"])
        n = len(weeks)
        for t in teams.values():
            games = t["apw"] + t["apl"]
            t["xw"] = round(t["apw"] / games * n, 2) if games else 0
            t["luck"] = round(t["w"] - t["xw"], 2)
            t["pf"] = round(t["pf"], 2); t["pa"] = round(t["pa"], 2)
            t["avg"] = round(statistics.mean(t["scores"]), 2) if t["scores"] else 0
            t["sd"] = round(statistics.pstdev(t["scores"]), 2) if len(t["scores"]) > 1 else 0

        # schedule swap: row team A playing column team B's schedule
        swap = {}
        for a in teams:
            swap[a] = {}
            for b in teams:
                w_ = l_ = 0
                for wk in weeks:
                    if a not in wk or b not in wk: continue
                    o = wk[b]["opp"]
                    if o == a: o = b
                    if wk[a]["pts"] > wk[o]["pts"]: w_ += 1
                    elif wk[a]["pts"] < wk[o]["pts"]: l_ += 1
                swap[a][b] = [w_, l_]

        # my weekly log
        mylog = []
        if my_rid:
            for i, wk in enumerate(weeks):
                if my_rid not in wk: continue
                me, opp = wk[my_rid], wk[wk[my_rid]["opp"]]
                pts = [v["pts"] for v in wk.values()]
                o_scores = [x for j, x in enumerate(teams[me["opp"]]["scores"]) if j != i]
                mylog.append({
                    "week": i + 1, "pts": me["pts"], "opp": me["opp"], "oppPts": opp["pts"],
                    "median": round(statistics.median(pts), 2),
                    "rank": 1 + sum(1 for p in pts if p > me["pts"]),
                    "oppRank": 1 + sum(1 for p in pts if p > opp["pts"]),
                    "beat": sum(1 for p in pts if p < me["pts"]),
                    "oppAvgElse": round(statistics.mean(o_scores), 2) if o_scores else None,
                })

        # playoff result
        finish = {}
        for m in s["winners"]:
            if m.get("p"):
                finish[m["w"]] = m["p"]; finish[m["l"]] = m["p"] + 1
        bracket = s["winners"]
        my_playoffs = []
        for m in bracket:
            if my_rid not in (m.get("t1"), m.get("t2")) or not m.get("w"): continue
            wk = reg_end + m["r"]
            pts = {x["roster_id"]: round(x["points"] or 0, 2) for x in s["matchups"].get(wk) or []}
            opp = m["t2"] if m["t1"] == my_rid else m["t1"]
            label = {1: "Championship", 3: "3rd-place game", 5: "5th-place game"}.get(m.get("p"), f"Round {m['r']}")
            my_playoffs.append({"week": wk, "round": m["r"], "label": label, "opp": opp,
                                "pts": pts.get(my_rid), "oppPts": pts.get(opp), "won": m["w"] == my_rid})

        out["seasons"].append({
            "season": yr, "leagueId": L["league_id"], "name": L["name"], "status": L["status"],
            "regEnd": reg_end, "weeksDone": n, "playoffTeams": st.get("playoff_teams", 6),
            "divisions": divnames, "myRid": my_rid,
            "teams": [{k: v for k, v in t.items()} for t in teams.values()],
            "weeks": [{str(k): v for k, v in wk.items()} for wk in weeks],
            "schedule": schedule, "swap": {str(k): {str(b): v for b, v in row.items()} for k, row in swap.items()},
            "myLog": mylog, "finish": {str(k): v for k, v in finish.items()}, "myPlayoffs": my_playoffs,
        })

    # ---------- drafts: who did each pick become ----------
    pick_lookup = {}  # (season, round, original rid) -> pick
    draft_rounds = {}
    by_season = {s["league"]["season"]: s for s in seasons}
    for s in seasons:
        yr = s["league"]["season"]
        rid_by_owner = {r["owner_id"]: r["roster_id"] for r in s["rosters"]}
        for dr in s["drafts"]:
            if dr.get("status") != "complete": continue
            draft_rounds[yr] = dr["settings"].get("rounds")
            slot_to_rid = {slot: rid_by_owner.get(uid) for uid, slot in (dr.get("draft_order") or {}).items()}
            for p in dr["picks"]:
                orig = slot_to_rid.get(p["draft_slot"])
                pick_lookup[(yr, p["round"], orig)] = {
                    "pickNo": p["pick_no"], "round": p["round"], "slot": p["draft_slot"],
                    "player": pinfo(p["player_id"]), "keeper": bool(p.get("is_keeper")), "by": p["roster_id"],
                }

    def starter_total(rid, pid, from_season, from_week):
        tot, games = 0.0, 0
        for (yr, r, p, w), pts in starter_pts.items():
            if r != rid or p != str(pid): continue
            if (yr, w) < (from_season, from_week): continue
            tot += pts; games += 1
        return round(tot, 2), games

    # ---------- trades ----------
    for s in seasons:
        yr = s["league"]["season"]
        names = {t["rid"]: t["name"] for t in next(x for x in out["seasons"] if x["season"] == yr)["teams"]}
        for t in s["transactions"]:
            if t["type"] != "trade" or t["status"] != "complete": continue
            leg = max(t.get("leg") or 1, 1)
            sides = {rid: {"rid": rid, "name": names.get(rid), "players": [], "picks": [], "faab": 0, "value": 0.0}
                     for rid in t["roster_ids"]}
            for pid, rid in (t.get("adds") or {}).items():
                pts, g = starter_total(rid, pid, yr, leg)
                sides[rid]["players"].append({**pinfo(pid), "pts": pts, "games": g})
                sides[rid]["value"] += pts
            for dp in t.get("draft_picks") or []:
                rid = dp["owner_id"]
                orig = dp["roster_id"]
                res = pick_lookup.get((dp["season"], dp["round"], orig))
                pick = {"season": dp["season"], "round": dp["round"], "orig": orig, "origName": names.get(orig), "from": dp["previous_owner_id"]}
                if res:
                    pts, g = starter_total(res["by"], res["player"]["id"], dp["season"], 1)
                    pick.update(became=res, pts=pts, games=g, status="used")
                    sides[rid]["value"] += pts
                elif dp["season"] in draft_rounds and dp["round"] > (draft_rounds[dp["season"]] or 99):
                    pick["status"] = "vanished"
                else:
                    pick["status"] = "pending"
                sides.setdefault(rid, {"rid": rid, "name": names.get(rid), "players": [], "picks": [], "faab": 0, "value": 0.0})["picks"].append(pick)
            for wb in t.get("waiver_budget") or []:
                sides[wb["receiver"]]["faab"] += wb["amount"]
            for sd in sides.values():
                sd["value"] = round(sd["value"], 2)
            out["trades"].append({
                "id": t["transaction_id"], "season": yr, "week": leg, "created": t["status_updated"] or t["created"],
                "mine": any(teams_owner == ME for teams_owner in
                            [r["owner_id"] for r in s["rosters"] if r["roster_id"] in t["roster_ids"]]),
                "sides": list(sides.values()),
            })
    out["trades"].sort(key=lambda t: t["created"], reverse=True)

    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    with open(os.path.join(ROOT, "data", "site-data.js"), "w", encoding="utf-8") as f:
        f.write("window.SITE_DATA = " + json.dumps(out, separators=(",", ":")) + ";\n")
    print("wrote data/site-data.js:", len(out["seasons"]), "seasons,", len(out["trades"]), "trades")


if __name__ == "__main__":
    main()
