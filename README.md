# Burdened by No Flowers

A site for one team in the Fugazi Comeback Sleeper league: luck metrics, playoff/bye odds, and a trade desk that traces traded picks to the players they became.

- `scripts/build.py` pulls every season from the Sleeper API and writes `data/site-data.js`.
- `.github/workflows/refresh.yml` reruns it every Tuesday and Friday, plus on demand from the Actions tab.
- The playoff simulation runs in the browser (`js/app.js`).

Rebuild locally: `python scripts/build.py`
