# Glow — honest status, checked against the actual code (13 Nov 2026)

Every item below was verified by reading the real code in the three repos, **not** the
status column. Three products:
- **Family Office dashboard** (the GlowVentures repo)
- **Glow Central Research** (news / alerts / AI Insights) + **Glow Stocks** (the deep per-company research report)
- **Screener** — a *separate* product, not connected here, so not checked.

Key: ✅ built & working · 🟡 partly built (one piece missing) · 🔴 not built · ⏳ waiting on a person (data/decision, not code).

---

## 1) FAMILY OFFICE DASHBOARD

### ✅ Built & verified
- #310 Private-market Watchlist tab (just shipped)
- #318 "Net equity" tile removed
- #319 Inherited properties (acquisition type; blank cost; appreciation shows "—")
- #320 Indexed cost of acquisition (CII table) — shown in the tax popup
- #321 Earmarked / to-be-gifted + recipient + filter
- #323 Real-estate family-member selector
- #325 Real-estate Excel template download + upload
- #341 Never annualise returns under 1 year
- #342 Exited HDFC/ICICI/Axis Bank removed from Direct Equity
- #343 Latest Motilal statement used (gaps named, not shown stale)
- #344 "Invested on" date on the Returns view
- #345 Which demat holds a fund/ETF in the drill-down
- #347 Editable capital commitment / undrawn per fund (Gaurav can type it in)
- #348 Portfolio Library (built; exact scope still to confirm with Yamini)
- #368 "Book vs Benchmark" chart defaults to Book + Nifty 500, chips add the rest
- #369 Portfolio Monitor "vs Benchmark" column (benchmark on the same dated money)
- #370 Each holding mapped to its own benchmark, flagged "from document" vs "best guess"
- #372 Franklin Credit AIF classified as Debt
- #400 Returns table: benchmark return replaces the look-alike "Market return"
- #401 A shown return never sits next to a "no buy dates" remark
- #405 Sector "Unclassified" cut from ~₹43 Cr to ₹0.76 Cr
- #406 Sector rows drill into holdings; Financials splits into sub-industries
- #407 Debt inside PMS/funds separated out of the equity sectors
- #409 Realised losses shown on their own line (realised gain is net)
- #410 **CRITICAL — fresh money is no longer counted as "gain"** (returns are money-weighted / XIRR). This was the big one Yamini flagged; the code is correct.
- #412 Confusing "Market performance" panel removed
- #414 Fund history over time (each call/distribution, valuation, trajectory)
- #417 Weight columns' denominator follows the Companies/Funds filter
- #427 Glowterra/Glowsphere (Nzuri) shown under Real Estate
- #433 Each tranche/round held as its own dated row
- #439 Family-office report carries the private capital fields (committed/called/undrawn/distributions)

### 🟡 Partly built — one piece missing
- #322 Joint ownership — splits by share, but shares aren't forced to total 100%
- #374 Classification reconciliation — exists as an automatic *test*, but isn't shown on a Data-Audit panel, and the Category axis isn't in the tie-out
- #375 Clean equity names — names are clean, but the default sort isn't shown on the header
- #377 Master transaction ledger — has filters + Excel, **but** it's the recent window, not since-inception, and has no member / source-document columns
- #378 AIF cash flows — distribution trail exists, **but** interest isn't its own type and redemption→reinvestment isn't linked
- #402 HPR absolute/CAGR — the measure is named, **but** the Absolute|CAGR toggle was removed (CAGR only via the measure picker)
- #408 Month-on-month table — done with Excel, **but no PDF export**
- #411 One return standard — every screen uses one method and it's written down & family-approved, **but** only internally (no client sign-off note packaged)
- #413 Returns-tab redesign — tiles compressed, **but** the coverage line is still a count ("N of M accounts") on the face
- #415 Private-market IRR over a chosen period — works per single fund/company, **but** not for bands/total, and narrower windows need quarterly NAVs we don't have yet
- #418 Private-market "Generate report" — PDF works (just shipped), **but no Excel and no pick-a-subset** yet
- #426 Full "every transaction since day one" Excel — exists, **but only in the admin view**; a normal user can only export the recent window

### 🔴 Not built
- #434 Private share counts from CAS / MGT-7 (demat) or manual entry
- #440 Auto-send the report on a schedule (recipients, monthly/quarterly)
- #441 Weekly funding **+ M&A** deal-sourcing list (a market-wide universe to shortlist from)
- #442 Date-range filter on the funding table
- #443 Deal funnel filters (sector → sub-sector → date → stage → sort by size)
- #444 Theme filter (space tech, quantum)
- #445 Company card business description (the funding rounds + sources are done; the 2–3 line description isn't) — *partial*
- #446 Founder profiles (LinkedIn / email / connect)
- #447 Extra funding sources (ET / TOI / YourStory) merged per deal — *partial (Inc42 only today)*
- #448 Written source-hierarchy/conflict rule shown on screen — *partial (tiering exists, not written out)*
- #451 Investor-name parsing — ✅ actually DONE and tested (incl. the Bharat Jaisinghani round)

### ⏳ Waiting on people (data / decisions — not code)
- #326 Glow to enter its 3–4 properties → then #437 (rent/appreciation) fills in
- #329–#339 **Motilal + the PMS managers to send purchase prices & dates** (the main ~20% data gap)
- #371 Yamini to name the benchmark for the "best guess" holdings → finishes #370
- #373 Yamini to decide gold/silver ETF asset class (today it's Alternate by her own earlier call)
- #376 / #403 / #404 fresh missing-data list + PMS since-inception statements
- #379 / #380 Tally integration + Glow's accounts hire
- #382 / #416 / #419 / #421 / #422 / #423 / #424 / #435 / #436 Gaurav's reconciled private-market sheet, valuations, documents & OneDrive links
- #420 "Open OneDrive folder" link per investment (needs Gaurav's folders + access)
- #425 Yamini to give access to the two statement mailboxes
- #432 invoice · #466 book the next call

---

## 2) GLOW CENTRAL RESEARCH + GLOW STOCKS

### ✅ Built & verified
- #311 Smart cross-company news flags **without keywords** (but only 3 curated themes today: GLP-1, artillery shells, data centres)
- #350 "Ask Research" answers questions instead of refusing
- #353 Filter AI Alerts by how a company is held (Direct Equity / PMS / MF / AIF / Watchlist)
- #354 Compact alert row (company | CMP | market cap | ≤60 words | link)
- #355 RSI / trading-signal items removed
- #356 Scheduled-event notices (own date, marked upcoming, ranked below)
- #357 "Sold X shares" vs "diluted, shares unchanged" (by share count)
- #361 Duplicate items across sources removed
- #362 Consolidated broker view per company
- #367 Filing follow-ups (ESOP allottee/dilution) — via the Announcement AI Read
- #385 Which mutual funds hold a company (+ disclosure month, AMCs not covered)
- #392 Flag the beneficiaries of a development (curated themes, ≤60 words)

### 🟡 Partly built
- #313 Global peer/theme news capture · #315 full event→impact→gain/lose chain (direction not graded today) · #317 smart flags on the private book (direct-name only, no peer/theme) · #351 AI Recommendations (no tab; curated themes, not a universe recommender)
- #358 shareholding alert materiality (flat thresholds, not scaled to size) · #360 re-rank from Pratik's marked examples (threshold-based today, not learned) · #363 impact arithmetic (generic AI read, no revenue/EBITDA math) · #364 ESOP template (no allottees / performance link) · #365 category templates (only ESOP built)
- #386 AI-Insights "Intelligence" card (only 6 companies; carries a Buy/Watch/Avoid verdict, which conflicts with "analysis only") · #387 5-min idea + detailed report (the 5-min idea is in Research; the *detailed* report is the separate Glow Stocks app — not one flow) · #388 per-company document library (code exists but isn't live on a tab) · #430 run on every company (6 done, no batch) · #431 lead with latest results (leads with the verdict instead) · #455 move valuation to its own section (still also in like/dislike) · #456 remove price/volume commentary (bits remain) · #459 run across all sectors (gaps: no pharma/banks/real-estate cards)
- #389 sector prompts + red flags (KPIs exist, prompts & red-flags don't) · #391 sector KPIs on the front end (names only, not values/period/source)
- #396 on-demand AI impact (full read, not a 2-line EBITDA/EPS) · #397 category-specific impact prompts (one generic prompt)

### 🔴 Not built
- #312 editable per-company peer/competitor list
- #314 auto-derived per-company keywords
- #394 read forwarded broker **emails** + open the report PDF (today Telegram only; PDFs never read)
- #452 fair value — named broker estimates block
- #453 fair value — internal DCF
- #454 fair value — reverse DCF
- #457 show which KPI + which documents each point rests on
- #458 save every AI-Insights run and share it to the whole desk (today it's per-device only)
- #461 signal scorecard pilot (auto components) · #462 basket macro signals · #463 stock-specific weights · #464 15–20-yr back-test

### ⏳ Waiting on Pratik / Yamini
- #316 scenarios list · #352 review Recs/Capital-Raises tabs · #359 mark which alerts are relevant · #366 announcement categories + formats · #390 the 5-min stock-idea template · #393 set up broker-email auto-forward (blocks #394) · #395 WhatsApp/Telegram group access · #398 desired outputs per category · #428 review sector-KPI mapping · #429 approve the AI-Insights format (blocks running it on every company) · #460 any further AI-Insights additions · #465 scorecard holding period & ranking frequency

---

## 3) SCREENER
A separate product — not connected to this session, so **not audited**. Connect its repo and I'll run the same code-check.

---

## The honest bottom line
- **Family Office dashboard:** the heavy lifting is done, including the critical returns-maths fix. What's genuinely left to *build* is small and clear: the private-market **deal-sourcing universe** (#441–#448, mostly not built), report polish (**Excel + subset + PDF + auto-send**: #418/#408/#440), and a few finishing touches (#322, #374, #402, #434). Everything else is **waiting on data/decisions from the family** (Motilal prices, Gaurav's private sheet, Yamini's benchmark & gold calls).
- **Glow Central Research / Glow Stocks:** the news/alerts/Ask-Research base is solid. The big unbuilt block is the **AI-Insights valuation + signal-scorecard** work (#452–#454, #457, #458, #461–#464) and the **cross-company peer/theme depth** (#312–#315). Much of the rest is **waiting on Pratik** to send templates and approvals.
</content>
