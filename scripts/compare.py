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
        # The real lineup: QB, RB, RB, WR, WR, TE, FLEX, FLEX, K, DEF (from this season's settings).
        # Each week the best RBs fill the RB slots (RB1 = the better one), the best WRs the WR slots, and the
        # next-best RB/WR/TE the flex spots, so where a manager happened to slot a player doesn't matter.
        lineup = [x for x in L.get("roster_positions") or [] if x not in ("BN", "IR", "TAXI")]
        kinds = list(dict.fromkeys(lineup))
        count = {k: lineup.count(k) for k in kinds}
        slot_names = [k if count[k] == 1 else f"{k}{i + 1}" for k in kinds for i in range(count[k])]
        FLEX_KINDS = {"FLEX": ("RB", "WR", "TE"), "WRRB_FLEX": ("RB", "WR"), "REC_FLEX": ("WR", "TE"), "SUPER_FLEX": ("QB", "RB", "WR", "TE")}
        role_vals, role_who, group_vals, pos_who = {}, {}, {}, {}
        for w in range(1, done + 1):
            for m in s["matchups"].get(w) or s["matchups"].get(str(w)) or []:
                rid = m["roster_id"]
                if rid not in rows:
                    continue
                rows[rid]["scores"].append(m.get("points") or 0)
                by_kind, by_pos, pool = {}, {}, []
                for pid, pts in zip(m.get("starters") or [], m.get("starters_points") or []):
                    if not pid or pid == "0":
                        continue
                    pts = pts or 0
                    pos = pos_of(pid)
                    if pos in ROLE_POS:
                        by_pos.setdefault(pos, []).append(pts)
                        pos_who.setdefault((rid, pos), {}).setdefault(pid, []).append(pts)
                        pool.append((pts, pid, pos))
                # normalised lineup: each position's best starters fill its own slots, the rest fill the flex
                pool.sort(key=lambda x: -x[0])
                used = set()
                for kind in kinds:
                    if kind in FLEX_KINDS:
                        continue
                    picks = [x for x in pool if x[2] == kind and x[1] not in used][: count[kind]]
                    used.update(x[1] for x in picks)
                    by_kind[kind] = [(x[0], x[1]) for x in picks] + [(0, None)] * (count[kind] - len(picks))
                for kind in kinds:
                    if kind not in FLEX_KINDS:
                        continue
                    ok = FLEX_KINDS[kind]
                    picks = [x for x in pool if x[2] in ok and x[1] not in used][: count[kind]]
                    used.update(x[1] for x in picks)
                    by_kind[kind] = [(x[0], x[1]) for x in picks] + [(0, None)] * (count[kind] - len(picks))
                for pos, lst in by_pos.items():
                    group_vals.setdefault((rid, pos), []).append(sum(lst))
                for kind, lst in by_kind.items():
                    lst.sort(key=lambda x: -x[0])
                    for i, (pts, pid) in enumerate(lst):
                        role = kind if count[kind] == 1 else f"{kind}{i + 1}"
                        role_vals.setdefault((rid, role), []).append(pts)
                        if pid:
                            role_who.setdefault((rid, role), {}).setdefault(pid, []).append(pts)

        # where a slot's weekly average would rank among every player at that position this season
        def pool_ppg(kind):
            allowed = FLEX_KINDS.get(kind, (kind,))
            return sorted((tot[p] / gp[p] for p in tot if pos_of(p) in allowed and gp[p] >= max(2, done // 3)), reverse=True)
        pools = {k: pool_ppg(k) for k in kinds}
        for (rid, role), vals in role_vals.items():
            kind = role.rstrip("0123456789")
            avg = sum(vals) / done
            who = sorted(role_who.get((rid, role), {}).items(), key=lambda kv: (-len(kv[1]), -sum(kv[1])))
            rows[rid]["roles"][role] = {
                "avg": round(avg, 2), "kind": kind,
                "equiv": 1 + sum(1 for v in pools.get(kind, []) if v > avg),  # "plays like the RB14"
                "poolSize": len(pools.get(kind, [])),
                "who": [{"id": pid, "name": name_of(pid), "pos": pos_of(pid), "starts": len(v), "avg": round(statistics.mean(v), 2),
                         "finish": finish.get(pid)} for pid, v in who[:3]],
            }
        for row in rows.values():
            row["slots"] = slot_names
        # Season lineup: each slot belongs to one player, the team's best at that position over the whole
        # season (most points scored as a starter for this team). WR1 = their top receiver, and so on;
        # the flex spots go to the best RB/WR/TE left over.
        for rid, row in rows.items():
            cands = []
            for pos in ROLE_POS:
                for pid, v in (pos_who.get((rid, pos)) or {}).items():
                    cands.append({"id": pid, "name": name_of(pid), "pos": pos, "starts": len(v), "total": round(sum(v), 1),
                                  "avg": round(statistics.mean(v), 2), "finish": finish.get(pid)})
            cands.sort(key=lambda c: -c["total"])
            used, lineup_out = set(), []
            for kind in kinds:
                ok = FLEX_KINDS.get(kind, (kind,))
                picks = [c for c in cands if c["pos"] in ok and c["id"] not in used][: count[kind]]
                for i in range(count[kind]):
                    slot = kind if count[kind] == 1 else f"{kind}{i + 1}"
                    c = picks[i] if i < len(picks) else None
                    if c:
                        used.add(c["id"])
                    lineup_out.append({"slot": slot, "kind": kind, "player": c})
            row["lineup"] = lineup_out
        for (rid, pos), vals in group_vals.items():
            rows[rid]["groups"][pos] = round(sum(vals) / done, 2)
        # season depth chart: players ranked by points scored as a starter at their position
        starter_tot = pos_who
        for (rid, pos), plist in starter_tot.items():
            ranked = sorted(plist.items(), key=lambda kv: -sum(kv[1]))
            rows[rid].setdefault("depth", {})[pos] = [
                {"id": pid, "name": name_of(pid), "starts": len(v), "total": round(sum(v), 1), "avg": round(statistics.mean(v), 2), "finish": finish.get(pid)}
                for pid, v in ranked[:5]]
        for row in rows.values():
            sc = row.pop("scores")
            row["ppg"] = round(statistics.mean(sc), 2) if sc else 0
            row["pf"] = round(sum(sc), 2)
        # league rank of each position group within the season
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
