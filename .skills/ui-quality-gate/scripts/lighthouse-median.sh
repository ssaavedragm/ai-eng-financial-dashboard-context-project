#!/usr/bin/env bash
# Three Lighthouse runs against a URL; prints the median of each metric.
# Usage: lighthouse-median.sh <url> <label> <output-dir>
set -euo pipefail
URL=$1; LABEL=$2; OUT=$3
mkdir -p "$OUT"
for i in 1 2 3; do
  npx -y lighthouse@12.8.2 "$URL" \
    --only-categories=performance,accessibility,best-practices,seo \
    --output=json --output-path="$OUT/lh-$LABEL-$i.json" \
    --chrome-flags="--headless=new" --quiet >/dev/null 2>&1 || true
done
python3 - "$OUT" "$LABEL" <<'PY'
import json, statistics as st, sys
out, label = sys.argv[1:]
runs = [json.load(open(f"{out}/lh-{label}-{i}.json")) for i in (1, 2, 3)]
med = lambda f: st.median(f(r) for r in runs)
cat = lambda k: med(lambda r: r["categories"][k]["score"] * 100)
obs = lambda k: med(lambda r: r["audits"]["metrics"]["details"]["items"][0][k])
aud = lambda k: med(lambda r: r["audits"][k]["numericValue"])
print(f"{label}: perf {cat('performance'):.0f} | a11y {cat('accessibility'):.0f} | "
      f"best-practices {cat('best-practices'):.0f} | seo {cat('seo'):.0f}")
print(f"  CLS {aud('cumulative-layout-shift'):.3f} | TBT {aud('total-blocking-time'):.0f} ms")
print(f"  LCP simulated {aud('largest-contentful-paint'):.0f} ms | observed {obs('observedLargestContentfulPaint'):.0f} ms")
print(f"  FCP simulated {aud('first-contentful-paint'):.0f} ms | observed {obs('observedFirstContentfulPaint'):.0f} ms")
failing = sorted({k for r in runs for k, a in r["audits"].items()
                  if a.get("score") == 0 and a.get("scoreDisplayMode") == "binary"})
print("  failing binary audits:", failing or "none")
PY
