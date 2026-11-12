"""Team-season comparison data: what each lineup role averaged, and who filled it.

Roles are assigned week by week from the starters: the best-scoring RB that week is RB1, the next RB2,
and a third RB (in a flex) is RB3. Same for WR and TE. QB, K and DEF are single roles.
"""
import statistics

ROLE_POS = ("QB", "RB", "WR", "TE", "K", "DEF")


def build(seasons, players, me):
    def pos_of(pid):
        if str(pid).isalpha():
            return "DEF"
        return (players.get(str(pid)) or {}).get("position")

    def name_of(pid):
        if str(pid).isalpha():
            return f"{pid} D/ST"
        p = players.get(str(pid)) or {}
        return p.get("full_name") or f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or str(pid)

    teams_out = []
    for s in seasons:
        L = s["league"]
        y = L["season"]
        st = L["settings"]
        reg_end = st.get("playoff_week_start", 15) - 1
        done = reg_end if L["status"] == "complete" else min(st.get("last_scored_leg", 0), reg_end)
        if not done:
            continue
        users = {u["user_id"]: u for u in s["users"]}

        # league-wide positional finish: points per game for every rostered player (2+ games)
        tot, gp = {}, {}
        for w in range(1, done + 1):
            for m in s["matchups"].get(w) or s["matchups"].get(str(w)) or []:
                for pid, pts in (m.get("players_points") or {}).items():
                    if pts:
                        tot[pid] = tot.get(pid, 0) + pts
                        gp[pid] = gp.get(pid, 0) + 1
        finish = {}
        for pos in ROLE_POS:
            ppg = sorted(((tot[p] / gp[p], p) for p in tot if pos_of(p) == pos and gp[p] >= max(2, done // 3)), reverse=True)
            for i, (_, p) in enumerate(ppg):
                finish[p] = {"rank": i + 1, "ppg": round(tot[p] / gp[p], 2)}

        rows = {}
        for r in s["rosters"]:
            u = users.get(r["owner_id"] or "", {})
            rows[r["roster_id"]] = {
                "season": y, "rid": r["roster_id"], "partial": done < reg_end, "weeks": done,
                "name": ((u.get("metadata") or {}).get("team_name") or u.get("display_name") or f"Team {r['roster_id']}").strip(),
                "user": u.get("display_name"), "mine": r["owner_id"] == me,
                "w": r["settings"].get("wins", 0), "l": r["settings"].get("losses", 0),
                "roles": {}, "groups": {}, "scores": [],
            }
        role_vals, role_who, group_vals = {}, {}, {}
        for w in range(1, done + 1):
            for m in s["matchups"].get(w) or s["matchups"].get(str(w)) or []:
                rid = m["roster_id"]
                if rid not in rows:
                    continue
                rows[rid]["scores"].append(m.get("points") or 0)
                by_pos = {}
                for pid, pts in zip(m.get("starters") or [], m.get("starters_points") or []):
                    if not pid or pid == "0":
                        continue
                    pos = pos_of(pid)
                    if pos in ROLE_POS:
                        by_pos.setdefault(pos, []).append((pts or 0, pid))
                for pos, lst in by_pos.items():
                    lst.sort(reverse=True)
                    group_vals.setdefault((rid, pos), []).append(sum(p for p, _ in lst))
                    for i, (pts, pid) in enumerate(lst):
                        role = pos if pos in ("QB", "K", "DEF") and i == 0 else f"{pos}{i + 1}"
                        role_vals.setdefault((rid, role), []).append(pts)
                        role_who.setdefault((rid, role), {}).setdefault(pid, []).append(pts)
        for (rid, role), vals in role_vals.items():
            who = sorted(role_who[(rid, role)].items(), key=lambda kv: (-len(kv[1]), -sum(kv[1])))
            rows[rid]["roles"][role] = {
                "avg": round(sum(vals) / done, 2),  # per week, empty weeks count as zero
                "used": len(vals),
                "who": [{"id": pid, "name": name_of(pid), "starts": len(v), "avg": round(statistics.mean(v), 2),
                         "finish": finish.get(pid)} for pid, v in who[:3]],
            }
        for (rid, pos), vals in group_vals.items():
            rows[rid]["groups"][pos] = round(sum(vals) / done, 2)
        # season depth chart: players ranked by points scored as a starter at their position
        starter_tot = {}
        for (rid, role), who in role_who.items():
            pos = "".join(ch for ch in role if ch.isalpha())
            for pid, v in who.items():
                d = starter_tot.setdefault((rid, pos), {}).setdefault(pid, [])
                d.extend(v)
        for (rid, pos), plist in starter_tot.items():
            ranked = sorted(plist.items(), key=lambda kv: -sum(kv[1]))
            rows[rid].setdefault("depth", {})[pos] = [
                {"id": pid, "name": name_of(pid), "starts": len(v), "total": round(sum(v), 1), "avg": round(statistics.mean(v), 2), "finish": finish.get(pid)}
                for pid, v in ranked[:5]]
        for row in rows.values():
            sc = row.pop("scores")
            row["ppg"] = round(statistics.mean(sc), 2) if sc else 0
            row["pf"] = round(sum(sc), 2)
        # league rank of each role and group within the season
        for role in {k for r in rows.values() for k in r["roles"]}:
            order = sorted(rows.values(), key=lambda r: -(r["roles"].get(role, {}).get("avg", 0)))
            for i, r in enumerate(order):
                if role in r["roles"]:
                    r["roles"][role]["rank"] = i + 1
        for pos in ROLE_POS:
            order = sorted(rows.values(), key=lambda r: -r["groups"].get(pos, 0))
            for i, r in enumerate(order):
                r.setdefault("groupRank", {})[pos] = i + 1
        order = sorted(rows.values(), key=lambda r: -r["ppg"])
        for i, r in enumerate(order):
            r["rank"] = i + 1
        finish_place = {}
        for m in s.get("winners") or []:
            if m.get("p"):
                finish_place[m["w"]] = m["p"]
                finish_place[m["l"]] = m["p"] + 1
        for r in rows.values():
            r["place"] = finish_place.get(r["rid"])
        teams_out += list(rows.values())
    return {"teams": teams_out}
