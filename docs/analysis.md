# ARoAI -- Anbeeld's Revision of AI

## Technical Documentation

**Version:** 1.3.5 | **Target game:** Victoria 3 patch 1.3.6 | **License:** MIT

---

## Table of Contents

1. [What ARoAI Does](#1-what-aroai-does)
2. [Why It Exists](#2-why-it-exists)
3. [High-Level Architecture](#3-high-level-architecture)
4. [The Main Loop](#4-the-main-loop)
5. [Phase 1 -- Preparation](#5-phase-1----preparation)
6. [Phase 2 -- Evaluation](#6-phase-2----evaluation)
7. [Phase 3 -- Construction](#7-phase-3----construction)
8. [The Weekly Loop](#8-the-weekly-loop)
9. [Budget Management System](#9-budget-management-system)
10. [Building Downsizing System](#10-building-downsizing-system)
11. [Military Threat Assessment](#11-military-threat-assessment)
12. [Technology Guidance System](#12-technology-guidance-system)
13. [Stalemate War Resolution](#13-stalemate-war-resolution)
14. [Power Level & Difficulty Scaling](#14-power-level--difficulty-scaling)
15. [Accelerated Construction Modifiers](#15-accelerated-construction-modifiers)
16. [Production Method Overrides](#16-production-method-overrides)
17. [Vanilla Strike Event Override](#17-vanilla-strike-event-override)
18. [Player Autobuild Feature](#18-player-autobuild-feature)
19. [Static Data & Why It's Needed](#19-static-data--why-its-needed)
20. [Building Database & Classification](#20-building-database--classification)
21. [Data Packing Scheme](#21-data-packing-scheme)
22. [Code Generation Toolchain](#22-code-generation-toolchain)
23. [Compatibility Patch System](#23-compatibility-patch-system)
24. [Vanilla AI Overrides (Defines)](#24-vanilla-ai-overrides-defines)
25. [Game Rules](#25-game-rules)
26. [Global History Initialization](#26-global-history-initialization)
27. [Mod Metadata](#27-mod-metadata)
28. [Localization](#28-localization)
29. [File Map](#29-file-map)
30. [Design Principles](#30-design-principles)
31. [Design Analysis](#31-design-analysis)

---

## 1. What ARoAI Does

ARoAI replaces Victoria 3's built-in AI for **economic construction** and **budget management** with fully custom Paradox scripting. The vanilla AI's building construction, tax level adjustments, and money spending logic are disabled via defines. In their place, ARoAI runs a time-distributed event loop that:

- Collects economic, population, military, and infrastructure data for every AI country
- Evaluates which buildings to construct based on market supply/demand, government needs, military threats, and budget health
- Queues constructions across states using a priority and aptitude scoring system
- Manages tax levels and wage settings dynamically based on budget surplus/deficit
- Downsizes unprofitable or excessive buildings
- Guides AI technology research toward critical techs (railways, industrialization)
- Resolves AI-vs-AI wars stuck in stalemate
- Overrides vanilla strike events with AI-friendly behavior
- Provides players with an optional "Autobuild" feature using the same algorithms

**Design goal:** AI countries should achieve higher GDP and Standard of Living compared to vanilla. The custom scripts make more targeted construction and fiscal decisions than the built-in AI — for example, ARoAI's evaluation system checks market supply/demand before queuing production buildings, whereas the vanilla AI does not. Outcomes vary with starting country, game rules, and mod configuration.

---

## 2. Why It Exists

Victoria 3's vanilla AI makes suboptimal economic decisions: it overbuilds sectors like government administration and military infrastructure (leaving construction starved), builds production buildings without checking whether the market already has surplus supply, and leaves tax levels unchanged for decades at a time. The Paradox scripting language was designed for content (events, journal entries), not heavy algorithmic work, so the vanilla AI relies on C++ code that modders cannot change.

ARoAI works around this by:
- Disabling the C++ AI for construction/budgeting via `NAI` defines
- Reimplementing the entire decision pipeline in Paradox script
- Distributing computation across game days to avoid performance spikes
- Encoding complex multi-field data into packed integer variables (since Paradox script has no structs or arrays)

---

## 3. High-Level Architecture

```
on_monthly_pulse_country
        |
        v
aroai_framework_events.1  (daily dispatcher, runs once per game day)
        |
        |--- For each country whose iteration date has arrived:
        |        |
        |        v
        |    PREPARATION (Day 1)
        |        |-- Collect critical data (population, GDP, workforce, infrastructure)
        |        |-- Run weekly loop iteration #1 (budget costs, construction tracking)
        |        |-- Adjust tax levels and wage settings
        |        |-- Downsize excessive/unprofitable buildings
        |        |-- Choose technology for innovation redirection
        |        v
        |    EVALUATION (Day 2)
        |        |-- Evaluate priority for every building type
        |        |-- Government buildings: formula-based (bureaucracy, innovation, convoys, military targets)
        |        |-- Production buildings: market supply/demand + weighting
        |        v
        |    CONSTRUCTION (Days 3--14)
        |        |-- Each day: pick highest-priority building type
        |        |-- Select optimal states via aptitude scoring
        |        |-- Queue construction levels
        |        |-- Repeat until out of construction points, building types, or days
        |        v
        |    CLEANUP (Day 14+)
        |        |-- Clear all iteration variables
        |        |-- Wait for next iteration (day 15--28 unused)
        |
        |--- Weekly loop (every 7 days, in sync with main loop):
                 |-- Track construction progress
                 |-- Recalculate budget surplus
                 |-- Update construction point usage
                 |-- Track investment pool transfers
```

### Timing Guarantees

- The framework event fires on `on_monthly_pulse_country` but self-limits to once per game day using a global date variable
- Each country's iteration start date is distributed on game start to prevent all countries computing on the same day. Distribution uses a 5-tier system:
  - **Tier 1:** 14 largest countries (by state count) on odd days (1, 3, 5, ..., 27)
  - **Tier 2:** Next 14 largest countries on even days (2, 4, 6, ..., 28)
  - **Tier 3:** Players + countries with rank > 2 (minor power+), distributed across days 1--28
  - **Tier 4:** Countries with rank > 1 (great powers, not yet assigned), distributed across days 29--56
  - **Tier 5:** All remaining countries, distributed across days 57--84
  Each country's default iteration date is also reduced by up to 6 days from the full iteration length to prevent overlap if a previous iteration was interrupted early.
- Default iteration length: **4 weeks (28 days)** (minimum configurable: 14 days)
- Construction phase: first half (14 days max)
- Weekly loop: 4 iterations per main loop, starting day 1
- Budget cooldown: iteration + 7 days (**35 days**), preventing oscillation in tax/wage adjustments
- Building evaluation cooldown: **70 days**, preventing the same building type from being re-evaluated at lower priorities too soon after a recent construction

---

## 4. The Main Loop

**File:** `src/events/aroai_framework_events.txt`

Entry point: `aroai_framework_events.1`, hooked to `on_monthly_pulse_country` via `src/common/on_actions/aroai_on_actions.txt`.

### Per-game-day operations (via `random_country` scope on all countries):

1. **One-time initialization** (first day of game):
   - Set `aroai_next_iteration_date` for all countries (5-tier distribution system, see Timing Guarantees)
   - Check agriculture resources in all state regions

2. **Daily maintenance:**
   - Refresh compatibility patch list (daily)
   - Apply accelerated construction modifiers to states (monthly)
   - Track stalemate wars between AI countries (every 30 days)
   - Check agriculture resources (yearly)

3. **Per-country iteration trigger:**
   - If `game_date >= aroai_next_iteration_date` for a country: fire `aroai_preparation_events.1`
   - Set next iteration date to `current_date + days_in_iteration`

### Design choice: daily framework event

The `on_monthly_pulse_country` fires for a random country each month. ARoAI re-fires itself daily to ensure the framework runs for every country. This is necessary because the vanilla monthly pulse only triggers once per country per month, but ARoAI needs daily resolution for construction scheduling. The self-firing is done via `trigger_event` with `days = 1` from inside `random_country`, so there will always be at least one country triggering a re-fire tomorrow.

---

## 5. Phase 1 -- Preparation

**File:** `src/events/aroai_preparation_events.txt`

Runs on **Day 1** of each country's iteration. This is the heaviest data-collection phase.

### Sequence:

1. **Technology redirection:** Calls `aroai_choose_technology_for_innovation_redirection` to guide AI research
2. **Weekly loop kickoff:** Runs `aroai_perform_iteration_of_weekly_loop` with `day_1_of_main_loop = yes` to collect all building expenses and construction data
3. **Military expense check:** Sets flag if country is at war, in diplomatic play, or has mobilized formations
4. **Tax/wage management:** Calls `aroai_manage_tax_and_wage_level` to adjust fiscal policy
5. **Permission checks:** Determines if downsizing and construction are allowed this iteration
   - Downsizing: allowed if AI country, no revolution, not revolutionary, budget surplus variable exists
   - Construction: allowed if no revolution, not revolutionary, budget surplus exists, AND (day 1 of iteration OR regular construction allowed with free points OR critical construction allowed). Regular construction requires `scaled_debt < 0.45` (or having no construction sectors) for AI countries; player countries require the autobuild game rule to be allowed and the `aroai_autobuild` variable to be set. Critical construction is allowed regardless of debt.
   - Production downsizing: additionally blocked if the country has laissez-faire law

### If downsizing or construction is allowed, collects:

- **Population data:** Incorporated/unincorporated population, GDP, GDP per capita, unemployment rates
- **Military threat:** Calculates average and maximum army/navy power projection from top 6 countries worldwide
- **Government building totals:** Levels of government administration, university, construction sector, port, barracks, naval base across all states
- **Construction sector data:** Free construction points, expenses per point, construction queue sizes
- **Infrastructure:** Balance of infrastructure vs usage per state, railway levels and production methods
- **Tax capacity:** Balance and lost taxes due to insufficient capacity
- **Profitability metrics:** Median building profitability and productivity across all buildings
- **Spending data:** Current spending on each building category vs targets
- **Coastline data:** Tracks which states have overseas connections for port construction
- **Roleplay priorities:** If "Roleplay" game rule is active, adjusts building weights based on country laws and characteristics

### If downsizing is allowed:
- Runs `aroai_downsize_excessive_buildings` (see Section 10)

### If construction is allowed:
- Schedules `aroai_evaluation_events.1` for the next day

---

## 6. Phase 2 -- Evaluation

**File:** `src/events/aroai_evaluation_events.txt`

Runs on **Day 2**. Evaluates every building type and assigns a **priority level** (lower = more urgent, 0 = do not build). Government buildings typically get priorities in the 1--12 range from formula-based evaluation. Production buildings get `supply_vs_demand_level + weight`, ranging from 2 (extreme shortage of a critical good) to 99+ (oversupply).

### Quick reference: evaluation → construction decision flow

1. **Priority** is computed per building type (lower = more urgent, 0 = skip).
   - Government buildings: formula-based, typically 1--12.
   - Production buildings: `supply_vs_demand_level + weight` per good; lowest across goods wins.
2. **Priority decides what gets built first.** On each construction day the building type(s) with the lowest non-zero priority are selected.
3. **Order breaks ties.** When multiple building types share the same priority, the `order` attribute (from the static data table, see §10) decides: **lower order = built first**. This encodes dependency chains (construction sector order=1, tools order=4, mines order=5, etc.) so upstream buildings are preferred.
4. **Weight vs order:** Weight is the dominant factor — it shifts the priority number itself, so a weight-1 good in moderate shortage (priority ~6) will always beat a weight-5 good in the same shortage (priority ~10). Order only matters when priorities are numerically equal.
5. **Offset gates expansion.** Once a building type wins priority selection, `offset` (added to supply/demand level) determines the productivity requirement: how profitable existing buildings must be before expansion or new construction is allowed.

### Government buildings (formula-based evaluation):

Each government building has a **consider** trigger (gate that decides whether to evaluate at all) and an **evaluate** trigger (assigns a specific priority level). The evaluate trigger iterates priority levels 1→12; the first level whose conditions match becomes the building's priority. Each building also has a **cooldown** variable that suppresses re-evaluation on lower priorities after a recent construction, preventing oscillation.

**Government Administration** (priority range 1--10):
- **Consider gate:** requires `tech_bureaucracy`, bureaucracy < ceiling, spending < target, expected spending < excess. Budget health >= -1 (or <= -1 when military expenses are unusually high) gates entry.
- **Evaluate:** Priority 1 = bureaucracy < threshold_1 (extreme shortage). Priorities 2--8 = bureaucracy < threshold OR lost_taxes > threshold (increasingly relaxed). Priorities 9--10 = bureaucracy-only check (most relaxed).
- **Spending share:** 20% of active income, plus up to 5% bonus based on `aroai_country_lost_taxes` (lost taxes / 12.5% threshold, clamped 0--1, multiplied by 0.05).
- **Allocation:** 4 aptitude levels based on tax capacity balance -- aptitude 1 places admin in states losing the most tax revenue (top 10%), aptitude 4 is fallback for incorporated states with adequate tax capacity or unincorporated states.

**University** (priority range 5--12):
- **Consider gate:** requires `academia`, innovation < target AND building count < target (both must be below target for priorities 5--7; only one needed for 8+), spending < target, expected spending < excess.
- **Evaluate:** Priorities 5--7 = innovation < threshold OR building count < threshold (either condition). Priorities 8--12 = both innovation AND building count must be below their thresholds (stricter). Building count ceiling stops increasing after priority 8 (uses `building_university_10` for priorities 8--12).
- **Spending share:** 10% of active income.
- **Allocation:** 1 aptitude level × 4 branches (branching=1, so states are sorted by incorporation/infrastructure/workforce but not by aptitude tier).

**Construction Sector** (priority range 1--8):
- **Consider gate:** requires `urbanization`, previous construction point utilization >= 70%, spending < target, expected spending < excess. When investment pool exceeds its transfer threshold, budget health >= -1 is required; otherwise >= 0.
- **Evaluate:** Each priority level checks spending < a progressively higher threshold (`spending_1` through `spending_8`). Higher priority = more construction spending needed before the AI considers more.
- **Spending share:** dynamic residual after government + military + university + port, plus investment pool.
- **Allocation:** 1 aptitude level × 4 branches (same as University).

**Railway** (priority levels 1, 5, 9, 16 only -- not sequential):
- **Consider gate:** requires `railways`, budget health >= -2.
- **Evaluate:** Only 4 specific priorities, not a continuous range:
  - Priority 1: any state has infrastructure balance < threshold_4 (critical deficit)
  - Priority 5: any state has infrastructure balance < threshold_5 (moderate deficit)
  - Priority 9: market transportation supply_vs_demand_level >= 5 (surplus-based check)
  - Priority 16: market transportation supply_vs_demand_level >= 9 (large surplus)
- **Sanction:** state must have infrastructure deficit < threshold_5 (for priorities 1/5) or the building priority must be >= 9/16 (market-driven).
- **Allocation:** 7 aptitude levels based on infrastructure balance (aptitude 1 = severe deficit, 7 = slight surplus).
- Infrastructure per railway level depends on production method (15, 20, 25, 30, 35, 40), checked via `aroai_check_production_methods_of_building_type` in a separate system.

**Port** (priority range 1--12):
- **Consider gate:** requires `navigation`, must have at least one coastal state. No budget health gate at the consider level (port building at priority 1 is emergency-level, always allowed).
- **Evaluate:** Complex multi-tier structure:
  - Priority 1 (emergency): market capital coastline has no ports but overseas connections are required, OR an isolated state has no port. No budget/spending gate.
  - Priority 2: market capital coastline has ports but count < `aroai_ports_on_market_capital_coastline` target. Budget health >= -1, spending and convoy caps checked.
  - Priority 3: another country in the same market has coastal states with infrastructure headroom but market_access < 1 despite having ports.
  - Priority 4: any state has infrastructure balance < threshold_5 (infrastructure-driven port need).
  - Priorities 5--12: convoy count < threshold (convoy_5 through convoy_12). Budget health >= 0, spending < target.
- **Isolationist law:** multiplier (0.10) is applied to the convoy *target* calculation (`aroai_convoys_target`), not to priority directly.
- **Sanction:** state must be coastal AND port level < state port limit.
- **Allocation:** 5 aptitude levels:
  - Aptitude 1: priority=1, market capital coastline state, no existing ports, overseas connections required. Prefers market capital itself (or handles edge cases where capital is inland/unowned).
  - Aptitude 2: priority=1, state is isolated from market.
  - Aptitude 3: priority=2, state is on market capital coastline. Same capital preference as aptitude 1.
  - Aptitude 4: priority >= 3, infrastructure deficit, state must NOT have a port already using anchorage PM.
  - Aptitude 5: priority >= 3, infrastructure balance >= threshold_5, same anchorage exclusion.

**Barracks** (priority range 2--10):
- **Consider gate:** requires `standing_army`, budget health >= -1, battalion count < floor OR (spending < target AND expected < excess).
- **Evaluate:** Each priority level checks battalion count < a progressively higher threshold (`battalion_1` through `battalion_9`). Priority starts at 2 (not 1), so production buildings with priority 2 can tie with barracks.
- **Spending share:** 30% of active income (base). Country-specific spending ceiling multipliers apply before 1870, multiplying both the excess AND ceiling thresholds (not just the ceiling):
   - Egypt: 2.5x before 1850, declining from 2.5x to 1.0x by 1870 (formula: `1.0 + (1870 - year) × 0.075`)
   - Turkey: 1.5x before 1850, declining from 1.5x to 1.0x by 1870 (formula: `1.0 + (1870 - year) × 0.025`)
   - Prussia: 1.5x before 1850, declining from 1.5x to 1.0x by 1870 (formula: `1.0 + (1870 - year) × 0.025`)
   These multipliers allow these countries to tolerate higher military spending before the AI considers barracks/naval base capacity excessive.
- **Allocation:** 2 aptitude levels: aptitude 1 = states with non-discriminated homelanders (preferred), aptitude 2 = states without.

**Naval Base** (priority range 2--10):
- **Consider gate:** requires `admiralty`, budget health >= -1, must have coastal states, navy_size < floor OR (spending < target AND expected < excess).
- **Evaluate:** Each priority level checks `navy_size` < a progressively higher threshold (`flotilla_1` through `flotilla_9`). Same structure as barracks.
- Same country-specific spending multipliers as barracks (Egypt, Turkey, Prussia).
- **Sanction:** state must be coastal AND naval base level < state limit.
- **Allocation:** 2 aptitude levels: same homelander preference as barracks.

### Production buildings (market-based evaluation):

Each production building evaluates **one or more goods** it produces. For each good, `aroai_evaluate_production_building` queries the market and calculates a priority. When a building produces multiple goods (e.g., logging camp produces wood and hardwood, tea plantation produces tea, coffee, and wine), each good is evaluated independently and the **lowest (most urgent) priority wins** as the building's final priority.

#### Step 1: Supply vs demand level (1--22 scale, with 99 as special case)

The market good's supply/demand ratio is mapped to a level using this formula:

| Level | Condition | Price signal |
|-------|-----------|--------------|
| **1** | No sell orders (sell_orders ≤ 0) | Extreme shortage, no supply at all |
| **2--11** | buy_orders > sell_orders | Shortage of varying severity |
| **12--21** | sell_orders > buy_orders | Surplus of varying severity |
| **22** | Residual after clamping | Near-balance or extreme surplus |
| **99** | No buy orders (buy_orders ≤ 0) | Complete oversupply, zero demand |

For shortages (buy > sell): `level = 22 − clamp(ceil(buy/sell / (BUY_SELL_DIFF_AT_MAX_FACTOR − 1) × 10), 11, 21)`
For surplus (sell > buy): `level = 22 − (20 − clamp(floor(sell/buy / (BUY_SELL_DIFF_AT_MAX_FACTOR − 1) × 10), 10, 20))`

Using the default price formula this maps to: level 1 = shortage >75%, levels 2--11 = +75% to 0% shortage, levels 12--21 = 0% to −75% surplus, level 22 = surplus <−75%.

#### Step 2: Weight and offset -- two separate levers per good

Each good of a building has two parameters that serve **different purposes**:

- **Weight** → affects **priority** (which building gets built first). Added to supply/demand level to produce the priority number. Lower weight = the AI treats shortages of this good more urgently.
- **Offset** → affects **productivity requirement** (how productive existing buildings must be before expanding). Added to supply/demand level to produce the productivity requirement level. Higher offset = stricter productivity bar for expansion.

These are independent: weight controls *whether* this building gets picked over other buildings, offset controls *how easily* it can expand once picked.

**Priority** = `supply_vs_demand_level + weight`. Since minimum weight is 1 and minimum supply level is 1, the minimum possible priority is 2. Priority 1 is soft-reserved for critical government buildings.

**Productivity requirement level** = `supply_vs_demand_level + offset`. This feeds into the productivity table (Step 4). Since supply/demand ranges 1--22 and offsets range 0--6, this can reach up to 28 in practice. The table extends to 41 levels to cover theoretical edge cases, but values above ~28 are rarely reached.

**Where weight and offset values come from:** Each building's per-good evaluation call is hardcoded in `aroai_static_data_effects.txt` (e.g., `aroai_evaluate_building_logging_camp` passes `weight = aroai_resource_weight_1` and `offset = 0` for wood). The weight values themselves are script values defined in `aroai_evaluation_values.txt` (e.g., `aroai_resource_weight_1` = base value 1 + optional `aroai_resource_weight_factor` variable, floored at 1). There are separate weight families per class: `aroai_resource_weight_N`, `aroai_agriculture_weight_N`, `aroai_industry_weight_N`, each with its own optional factor variable.

The `_factor` variables are set by the **Roleplay** game rule via `aroai_determine_roleplay_building_priorities` when enabled (the default). Under the default Roleplay mode, weight factors adjust based on country laws and economic status:

| Condition | Resource factor | Agriculture factor | Industry factor | Effect |
|-----------|----------------|-------------------|-----------------|--------|
| Subject/junior market partner (GDP/capita < 2.50) | -1 | -1 | +2 | Weak subjects prioritize agriculture and resources over industry |
| Subject/junior market partner (GDP/capita >= 2.50) | 0 | 0 | +2 | Stronger subjects still de-prioritize industry |
| Traditionalism law (or rank ≤ 3 + GDP/capita < 5.00) | +1 | -1 | +2 | Traditional economies favor agriculture over industry |
| Agrarianism law (or rank ≤ 3 + GDP/capita < 5.00 / rank ≤ 5 + GDP/capita < 2.50) | 0 | -1 | +1 | Agrarian economies slightly favor agriculture, slightly deprioritize industry |

When the **Uniform** game rule is selected, no weight factors are set and weights equal their base numbers.

#### Why the distinction matters -- primary vs secondary goods:

Buildings that produce multiple goods use weight and offset together to differentiate **primary goods** (the building's core purpose) from **secondary goods** (byproducts or luxury variants):

- **Primary goods** get **low weight** (1--4) and **offset = 0**: the AI responds urgently to shortages AND the productivity bar is set purely by the market signal.
- **Secondary goods** get **high weight** (5--11) and **offset = 4--6**: the AI mostly ignores their shortages for priority purposes (high weight pushes them down the build queue), AND even when they do win, the productivity bar is raised (offset shifts the requirement higher), meaning only already-efficient buildings expand for secondary goods.

Example: Tea Plantation evaluates tea (weight 5, offset 0) and coffee (weight 9, offset 4). If both goods have supply level 5:
- Tea priority = 5 + 5 = 10, productivity level = 5 + 0 = 5 (need 74% of median earnings)
- Coffee priority = 5 + 9 = 14, productivity level = 5 + 4 = 9 (need 92% of median earnings)
- Tea wins priority (10 < 14), so the building is built for tea. But if tea were in surplus (level 18) and coffee in shortage (level 3): tea priority = 23, coffee priority = 12 → coffee wins, and its productivity level = 3 + 4 = 7 (84% of median).

#### Step 3: Multi-good evaluation and saving

When a building has multiple goods, `aroai_evaluate_production_building` is called for each. Each call only overwrites the saved result if:
- The good's construction is **crucial** (supply_vs_demand ≤ building's crucial threshold) OR the country has **suitable states** for this building
- AND the new priority is **lower (more urgent)** than any previously saved priority

This means the most-shortage good drives the building's priority, and the winning good's offset determines the productivity requirement.

Additionally, some secondary goods are only evaluated conditionally:
- **Logging camp:** Hardwood only if building already exists and allows new buildings (cell 4 ≥ 1)
- **Food industry:** Liquor/tobacco/opium only if building already exists
- **Glassworks:** Porcelain only if building already exists (cell 4 ≥ 1)
- **Shipyards:** PM-dependent evaluation — clippers (primary) and man-o-wars (conditional on military) are evaluated when cell 4 = 1 or 3+; steamers (primary) and ironclads (conditional on military) are evaluated when cell 4 = 2 or 3+. Man-o-wars and ironclads are only evaluated when not actively using military forces (or when their supply level is below the wartime threshold)
- **Arms industry:** Artillery (secondary) only when `has_technology_researched = artillery` AND (not using military forces OR supply level ≤ wartime threshold)
- **Munition plants:** Ammunition only evaluated when (not using military forces OR supply level ≤ 6)
- **War machine industry:** Tanks (secondary) only when `has_technology_researched = mobile_armor` AND (not using military forces OR supply level ≤ wartime threshold)
- **Oil rig:** Has special early-game override — if the state has `has_potential_resource = bg_oil_extraction` but the building has no collected data (oil not yet discovered), forces priority to 2, supply_vs_demand_level to 1, and productivity requirement to 1 regardless of market conditions
- **Power plant:** Has similar early-game override — if no collected data exists (`aroai_building_type_44_collected_data` is absent), forces priority to 2, supply_vs_demand_level to 1, and productivity requirement to 1. Once data exists, evaluates normally with electricity (weight 1, offset 0)

#### Step 4: Productivity requirement (gate for expansion and new construction)

The productivity requirement level from Step 2 determines how productive existing buildings must be before the AI will expand them or build new ones.

Victoria 3's `earnings` trigger returns a building's **annual earnings per employee** (£/year/employee). ARoAI computes the **country-wide median** of `earnings` across all profitable private-sector buildings (each contributing once per 4 occupied levels, excluding government-funded, subsistence, trade, service, and monument buildings). A building can expand only if its earnings meet a minimum fraction of this median:

| Productivity level | Min earnings as % of median | When this level typically occurs |
|--------------------|----------------------------|----------------------------------|
| 1 | 42% | Extreme shortage, offset 0 |
| 2--3 | 54--62% | Severe shortage, offset 0 |
| 4--6 | 68--79% | Significant shortage, or moderate shortage + small offset |
| 7--10 | 84--96% | Mild shortage, or slight shortage + offset 4 |
| 11--12 | 100--103% | Near-balance, or mild shortage + offset 6 |
| 13--18 | 106--119% | Slight surplus, or balance + offset 4--6 |
| 19--26 | 121--130% | Moderate surplus + any offset |
| 27--41+ | 131--145% | Heavy surplus; only highly productive buildings expand |

**Crucial building discount:** The average of supply_vs_demand_level and productivity_requirement_level is compared against the building's crucial threshold. If `half_of_average <= crucial`, the productivity requirement is divided by **1.30** (very crucial). If `average <= crucial`, divided by **1.15** (moderately crucial). Higher crucial values make this easier to trigger — a building with crucial=11 gets discounts in far more situations than one with crucial=5.

**How it gates construction at two levels:**

1. **Country-level (cell 4):** If the country's existing buildings of this type collectively meet the requirement AND are profitable, cell 4 is set to 1, allowing new construction in states that don't have this building yet. Otherwise, only expansion of existing instances is permitted.
2. **State-level (sanction check):** Each existing building instance in a state is individually checked: its `earnings` must meet the threshold above. Only instances that pass are eligible for expansion in that state.

#### Per-building weight and offset assignments:

See Step 2 above for where these values come from and how the weight families work.

| Building | Primary good | Wt | Ofs | Secondary goods | Wt | Ofs |
|----------|-------------|-----|-----|-----------------|-----|-----|
| **Resource** | | | | | | |
| Logging Camp | wood | 1 | 0 | hardwood | 3 | 0 |
| Fishing Wharf | fish | 4 | 0 | grain | 8 | 4 |
| Whaling Station | oil | 1 | 0 | meat | 10 | 6 |
| Rubber Plantation | rubber | 2 | 0 | — | | |
| Oil Rig | oil | 1 | 0 | — | | |
| Coal Mine | coal | 1 | 0 | — | | |
| Iron Mine | iron | 1 | 0 | — | | |
| Lead Mine | lead | 1 | 0 | — | | |
| Sulfur Mine | sulfur | 2 | 0 | — | | |
| Gold Mine | gold | —† | — | — | | |
| **Agriculture** | | | | | | |
| Rye Farm | grain | 2 | 0 | liquor | 10 | 6 |
| Wheat Farm | grain | 2 | 0 | wine | 11 | 6 |
| Rice Farm | grain | 2 | 0 | — | | |
| Maize Farm | grain | 2 | 0 | wine | 11 | 6 |
| Millet Farm | grain | 2 | 0 | — | | |
| Livestock Ranch | fabric | 1 | 0 | meat | 4 | 0 |
| Cotton Plantation | fabric | 1 | 0 | — | | |
| Dye Plantation | dye | 3 | 0 | — | | |
| Silk Plantation | silk | 5 | 0 | — | | |
| Banana Plantation | fruit | 4 | 0 | grain | 8 | 4 |
| Sugar Plantation | sugar | 4 | 0 | — | | |
| Tea Plantation | tea | 5 | 0 | coffee, wine | 9, 9 | 4, 4 |
| Coffee Plantation | coffee | 5 | 0 | tea, wine | 9, 9 | 4, 4 |
| Tobacco Plantation | tobacco | 4 | 0 | liquor, opium | 8, 8 | 4, 4 |
| Opium Plantation | opium | 3 | 0 | liquor, tobacco | 7, 7 | 4, 4 |
| **Industry** | | | | | | |
| Food Industry | groceries | 4 | 0 | liquor, tobacco, opium | 4, 8, 8 | 0, 4, 4 |
| Textile Mills | clothes | 3 | 0 | luxury_clothes | 5 | 0 |
| Furniture Manufactories | furniture | 3 | 0 | luxury_furniture | 5 | 0 |
| Glassworks | glass | 3 | 0 | porcelain | 5 | 0 |
| Tooling Workshops | tools | 1 | 0 | — | | |
| Paper Mills | paper | 1 | 0 | — | | |
| Chemical Plants | fertilizer | 2 | 0 | explosives | 3 | 0 |
| Synthetics Plants | dye | 3 | 0 | silk | 5 | 0 |
| Steel Mills | steel | 1 | 0 | — | | |
| Motor Industry | engines | 1 | 0 | automobiles | 4 | 0 |
| Shipyards | clippers* | 3 | 0 | man-o-wars*, steamers*, ironclads* | 3, 3, 3 | 0, 0, 0 |
| Power Plant | electricity | 1 | 0 | — | | |
| Electrics Industry | telephones | 3 | 0 | radios | 3 | 0 |
| Arms Industry | small_arms | 3 | 0 | artillery* | 3 | 0 |
| Munition Plants | ammunition* | 3 | 0 | — | | |
| War Machine Industry | aeroplanes | 3 | 0 | tanks* | 3 | 0 |
| Arts Academy | fine_art | 5 | 0 | — | | |

**Pattern:** All primary goods have offset 0. Secondary goods with high weights (7+) also get offset 4--6, creating a double barrier — they rarely win on priority, and when they do, the productivity bar is raised. Secondary goods with moderate weights (3--5, like luxury_clothes or explosives) have offset 0, meaning they compete more freely if they happen to have a worse shortage than the primary good.

**Gold Mine** (†): Does not use the weight/offset system at all. Instead, it hardcodes `priority=6`, `supply_vs_demand_level=5`, and `productivity_requirement_level=5` directly, bypassing the `aroai_evaluate_production_building` mechanism entirely.

**Arms Industry** (*): Secondary good `artillery` is only evaluated when `has_technology_researched = artillery`. Conditional military evaluation also applies.

**Munition Plants** (*): Primary good is `ammunition`, not `artillery`. Evaluated only when not using military forces, or when `ammunition` supply_vs_demand_level ≤ 6.

**War Machine Industry** (*): Primary good is `aeroplanes`. Secondary good `tanks` is only evaluated when `has_technology_researched = mobile_armor`. Conditional military evaluation also applies.

**Shipyards** (*): PM-dependent evaluation. Two branches based on `cell_4` (production method group): clippers + man-o-wars are evaluated when cell 4 = 1 or ≥3 (sail PM); steamers + ironclads are evaluated when cell 4 = 2 or ≥3 (steam PM). Man-o-wars and ironclads are conditional on military status.

#### Priority 0 assignment (do not build):

After evaluation, priority is set to 0 if:
- **No allocation lists could be formed** -- no state passed both sanction and aptitude checks
- **Construction counter exceeds limit** -- too many of this building type already queued this iteration

### Priority levels in practice:

| Priority range | Typical meaning | How it arises |
|----------------|----------------|---------------|
| **1** | Soft-reserved for critical government buildings | Government eval levels; production buildings can only reach 2+ |
| **2--3** | Extreme shortage of a low-weight good | supply_level 1 (no supply) + weight 1--2 (tools, steel, coal, iron, fabric) |
| **4--8** | Significant shortage | supply_level 1--3 + weight 2--5 |
| **9--15** | Moderate shortage | supply_level 5--10 + weight 3--5 |
| **16--22** | Mild shortage to balanced | supply_level 10--17 + weight 3--5 |
| **23--30** | Slight surplus, high-weight goods | supply_level 12--20 + weight 8--11 |
| **30+** | Clear surplus | Only triggers construction of truly critical crucial buildings |
| **0** | Do not build | No valid states or counter exceeded |

Lower numbers = higher urgency. During construction (Days 3--14), the building type with the **lowest non-zero priority** across all types is built first each day.

### Investment pool multiplier:

The `aroai_target_multiplier_with_investment_pool` value scales non-construction spending shares upward when the investment pool funds a significant portion of construction. It starts at 1.0 and adds up to 1.20 based on the ratio of `aroai_investment_pool_expected` to `aroai_country_active_income`, normalized by dividing by 0.30 (then clamped to 0--1). This means the full 1.20 addition is reached when investment pool expected >= 30% of active income. The total maximum multiplier is 2.20 (1.00 base + 1.20 addition). When the investment pool covers 30%+ of active income, non-construction shares effectively double.

Additionally, `aroai_target_multiplier_with_high_government_spending` reduces university, port, and military shares (but not government administration) when government spending is high. The formula subtracts up to 0.75 from the multiplier based on how much government admin spending exceeds its target: `1 - clamp((admin_spending / (admin_target × 1.20)) - 1, 0, 0.75)`. When admin spending is at its target, the multiplier is 1.0 (no reduction); when spending reaches 1.95× the target, the multiplier drops to 0.375; the minimum is 0.25. Note that this is a **reduction** factor despite its name — when government admin is over budget, all other shares are *decreased*, not increased.

Construction sector spending has a separate `aroai_building_construction_sector_spending_factor` that adjusts its target. For AI countries, the target is further modified by workforce utilization: `0.900 + 0.325 × (1 - unutilized_workforce_percent_multiplier)`, ranging from 0.900 (fully utilized workforce → AI spends less on construction) to 1.225 (highly underutilized workforce → AI spends more on construction to absorb unemployment).

---

## 7. Phase 3 -- Construction

**File:** `src/events/aroai_construction_events.txt`

Runs on **Days 3--14** (first half of iteration). One building type is constructed per day.

### Daily construction cycle:

1. **Select building type:** Find building(s) with highest priority across all types. If tied, use `order` attribute (lower order = built first; resolves dependencies like construction sector before tooling workshops before mines)
2. **Verify limits:** Check that the building's construction counter hasn't exceeded its per-iteration limit
3. **Select states:** For the chosen building type:
   a. Set `aroai_building_type_occupied_levels` in each state (current levels of this building)
   b. Filter states using the building's `sanction` trigger (technology requirements, resource availability, profitability, workforce)
   c. Sort remaining states by **aptitude level** (1--10):
      - Aptitude 1: best states (critical need, best conditions)
      - Aptitude 10: worst acceptable states
   d. For each aptitude level, apply **branching** (if enabled): further filter by incorporated status, infrastructure, etc.
4. **Queue construction:** For each valid state (best first), queue one level of the building
5. **Track progress:** Add to `aroai_ongoing_constructions` list with packed data (building type, points remaining, status)
6. **Recurse or stop:**
   - If construction points remain and building types remain: try next building type tomorrow
   - If out of points or days (day >= 14): clear variables, end construction phase

### Special buildings (monuments and canals):

When the highest remaining building priority is exactly 6 (meaning priorities 1--5 have been exhausted -- only mild shortages or balanced markets remain), and `aroai_tried_special_buildings` has not been set yet, the system attempts to construct **special buildings** before falling back to general construction. These are one-time monument/canal constructions that the vanilla AI often neglects:

| Building | Requirements | State |
|----------|-------------|-------|
| Suez Canal | `colonization` tech, owns treaty port in Sinai, `suez_survey_complete` | STATE_SINAI |
| Panama Canal | `civilizing_mission` tech, owns treaty port in Panama, `panama_survey_complete` | STATE_PANAMA |
| Big Ben | Owns Home Counties, not already built | STATE_HOME_COUNTIES |
| Eiffel Tower | `steel_frame_buildings` tech, owns Île-de-France, not already built | STATE_ILE_DE_FRANCE |
| Statue of Liberty | `steel_frame_buildings` tech, owns New York, not already built | STATE_NEW_YORK |
| Mosque of Djenne | Owns Eastern Mali, not already built | STATE_EASTERN_MALI |
| Skyscraper | State has `skyscraper_site` modifier, not already built | Any qualifying state |

After special buildings, the compatibility patch system's `aroai_construct_special_buildings_compatibility` is called, allowing modded special buildings from compatibility patches. Only one special building is constructed per day (they set `aroai_started_building_construction` to skip the normal building queue for that day).

### Construction limits:

Each building type has a `limit` attribute (1--9, default 5) that controls how many levels can be queued per iteration. The actual limit is calculated from a 9x11 grid:
- 9 limit levels (from building importance)
- 11 data quality levels (from collected data average)
- Formula: `simultaneous_constructions * multiplier + 1`, where multiplier = `0.12 * ((11-level)^2 * 0.01 + (11-level) * 0.15 + 1) * (1 + (factor-5) * 0.125)`
- This creates a quadratic decay that allows more simultaneous constructions for higher-priority buildings with better data quality

### State sanction triggers (per-class eligibility gates):

Before aptitude scoring, each state must pass a **sanction trigger** that determines basic eligibility. Sanction triggers have a `$conditions$` parameter controlling three modes:
- **Mode 0:** New construction OR expansion of existing buildings
- **Mode 1:** New construction only (building doesn't exist in state yet)
- **Mode 2:** Expansion only (building must already exist in state)

**Resource buildings** (`aroai_sanction_resource`):
- State region must have remaining undepleted resource deposits
- For new buildings: state must have potential for the resource AND (profitability not required OR allowed by cell 4)
- For expansion: existing building must pass `aroai_building_can_be_expanded` AND meet productivity threshold (cell 3)

`aroai_building_can_be_expanded` requires: `can_queue_building_levels = 1` AND either the building has level 0 (doesn't exist yet), OR (level >= 1 AND occupancy >= `aroai_sufficient_occupancy` AND (no goods shortage) AND (building is profitable)). The `aroai_sufficient_occupancy` threshold is dynamic: `(level - (1 + 0.1 × level)) / level`, which simplifies to `0.9 − 1/level` -- for level 1 it's 0%, for level 5 it's 70%, for level 10 it's 80%, asymptotically approaching 90%.

**Agriculture buildings** (`aroai_sanction_agriculture`):
- `free_arable_land > 0` (hard requirement)
- Either enough free land exceeds construction limit OR no other agriculture building is currently under construction in this state (prevents competition for arable land)
- State must have potential for the specific crop (checked via cipher-encoded agriculture resource data)
- Same new/expansion logic as resource buildings

**Industry buildings** (`aroai_sanction_industry`):
- No resource or arable land requirements
- Same new/expansion logic based on conditions mode
- New buildings require cell 4 = 1 (profitability approved)
- Expansion requires existing building to pass expansion checks + productivity threshold

### State aptitude scoring (per-class):

States that pass sanction are assigned to **aptitude levels** (1 = best, higher = worse). States are tested sequentially from aptitude 1 upward; the **first level that matches** is used (never tested further). The number of aptitude levels varies by building class.

#### Government Administration (4 aptitude levels):

| Aptitude | Condition | Meaning |
|----------|-----------|---------|
| 1 | Incorporated AND `tax_capacity_balance < 1` AND state has < 10% of country's worst tax losses | Incorporated state with most severe tax capacity shortage |
| 2 | Incorporated AND `tax_capacity_balance < 1` AND state has < 50% of country's worst tax losses | Incorporated state with severe tax shortage |
| 3 | Incorporated AND `tax_capacity_balance < 1` AND state has ≥ 50% of country's worst tax losses | Incorporated state with moderate tax shortage |
| 4 | Unincorporated OR `tax_capacity_balance >= 1` | No tax shortage, or not incorporated |

#### Railway (7 aptitude levels):

| Aptitude | Condition | Meaning |
|----------|-----------|---------|
| 1 | `infrastructure_balance < 0.60` | Critically low infrastructure |
| 2 | `infrastructure_balance < 0.70` | Very low infrastructure |
| 3 | `infrastructure_balance < 0.80` | Low infrastructure |
| 4 | `infrastructure_balance < 0.90` | Below target |
| 5 | `infrastructure_balance < 1.00` | Slightly below optimal |
| 6 | `0.90 ≤ infrastructure_balance < 1.10` | Near-optimal |
| 7 | `infrastructure_balance >= 1.10` | Excess infrastructure |

Where `infrastructure_balance = infrastructure / max(infrastructure_usage, 1)`.

#### Barracks (2 aptitude levels):

| Aptitude | Condition | Meaning |
|----------|-----------|---------|
| 1 | `aroai_has_non_discriminated_homelanders = yes` | State has non-discriminated native population (better recruits) |
| 2 | `aroai_has_non_discriminated_homelanders = no` | No non-discriminated natives (worse recruits) |

#### Resource buildings (2 aptitude levels):

| Aptitude | Condition | Meaning |
|----------|-----------|---------|
| 1 | Good is one of: rubber, oil, coal, iron, sulfur, gold; OR the state has NO potential for any of these critical resources | State produces a critical resource, OR state has no critical resources at all (so building a non-critical resource here won't compete with future critical resource construction) |
| 2 | Good is NOT critical AND state HAS potential for a critical resource | State has potential for critical resources -- building a non-critical resource here would "waste" the state's strategic potential |

#### Agriculture buildings (2 aptitude levels):

| Aptitude | Condition | Meaning |
|----------|-----------|---------|
| 1 | Good is one of: tea, coffee, dye, tobacco, opium, sugar, silk; OR the state has NO potential for any of these luxury crops | State grows a luxury crop, OR state has no luxury crop potential (so using arable land here won't compete with future luxury plantations) |
| 2 | Good is NOT luxury AND state HAS potential for a luxury crop | State could grow luxury crops -- using arable land for basic crops wastes strategic potential |

#### Industry buildings (1 aptitude level):

| Aptitude | Condition |
|----------|-----------|
| 1 | Always true (all sanctioned states are equally suitable) |

Industry buildings have no aptitude differentiation. All states that pass the sanction check are treated identically.

### Branching (secondary sort within aptitude levels):

After aptitude assignment, states with **branching enabled** (the `branching` attribute in the building database) are further sorted into **4 branches** per aptitude level. Each state is assigned to its best-matching branch via sequential if/else:

**Branching coverage:** 44 of 49 buildings have branching=1 (all production buildings: resource, agriculture, industry, plus University and Construction Sector). 5 buildings have branching=0 and skip branch sorting entirely: Government Administration, Railway, Port, Barracks, Naval Base.

| Branch | Condition | Meaning |
|--------|-----------|---------|
| 1 | `is_incorporated = yes` AND `has_enough_infrastructure` AND `has_enough_workforce` | Ideal: incorporated with good infrastructure and workforce |
| 2 | `has_enough_infrastructure` AND `has_enough_workforce` | Good infrastructure/workforce, but not incorporated |
| 3 | (`is_incorporated = yes` AND `has_enough_workforce`) OR `has_enough_infrastructure` | Has one of: incorporation+workforce, or infrastructure alone |
| 4 | Everything else | Fallback: state passed sanction but lacks infrastructure and workforce |

**Processing order:** Branches are interleaved across aptitude levels: **A1B1, A2B1, A1B2, A2B2, A1B3, A2B3, A1B4, A2B4** (where A = aptitude, B = branch). This means **branch takes priority over aptitude** -- an aptitude-2 state with ideal conditions (branch 1) is built before an aptitude-1 state with poor conditions (branch 4). But within the same branch group, aptitude order is preserved.

### Final state eligibility check:

Before a state from any allocation list is used for construction, it must pass `aroai_requirements_for_construction_in_state`:
- State is owned by the constructing country
- Workforce check: either workforce checking is disabled for this building type (`workforce = 0`), OR supply_vs_demand_level ≤ crucial (shortage severe enough to override workforce requirements), OR the state has `available_workforce >= 5000`
- Agriculture check: if the building is an agriculture type, the state must still have `free_arable_land > 0` and not exceed the agriculture queue limit

---

## 8. The Weekly Loop

**File:** `src/events/aroai_weekly_loop_events.txt`

Runs every 7 days, always synchronized with Day 1 of the main loop (4 iterations per main loop cycle).

### Operations per iteration:

1. **Track construction progress** (`aroai_add_progress_to_ongoing_constructions`):
   - For each state's `aroai_ongoing_constructions` list:
     - Active constructions (status=1): subtract construction points from remaining
     - Expected finished (status=2): track weeks since expected completion
     - Finished (status=3): remove after 5+ weeks
   - Data format: packed 4-cell variable per construction (building type, points/weeks, status, count)

2. **Collect building expenses** (`aroai_weekly_check_of_building_data`):
   - Sum weekly profit for each government/military building type
   - Ensure railways are subsidized for AI
   - On Day 1 only: collect total levels, shortage percentages, ongoing construction counters

3. **Calculate investment pool transfer** (`aroai_calculate_investment_pool_transfer`):
   - Budget surplus calculated as: `current_treasury - previous_treasury - max(weekly_net_fixed_income, previous_weekly_net_fixed_income)` (falls back to `weekly_net_fixed_income` if treasury data unavailable or at credit limit)
   - Investment pool transfer formula: `max(0, construction_sector_expenses × share_of_goods_in_expenses + budget_surplus - weekly_net_fixed_income)`
   - Zero if autonomous investment pool has no private queued levels
   - Day 1: compute 15-element rolling average as `aroai_investment_pool_expected`

4. **Calculate construction point usage** (`aroai_calculate_usage_of_construction_points`):
   - Ratio of queued levels to available construction capacity
   - Used to throttle new construction when utilization is low

5. **Schedule next iteration** (`aroai_count_and_schedule_iterations_of_weekly_loop`):
   - Track average construction point usage
   - If iterations remaining: schedule `aroai_weekly_loop_events.1` in 7 days

6. **Calculate cost per construction point** (`aroai_calculate_building_construction_sector_expenses_per_point`):
   - Combines goods cost (90% of expenses, adjusted by usage ratio) + wages (10%, adjusted by wage multiplier)
   - Stored as 4-element array variable

7. **Calculate budget surplus** (`aroai_calculate_budget_surplus`):
   - Refined surplus assuming 100% construction sector utilization
   - Formula: `previous_budget_surplus + (previous_sector_expenses - previous_sector_spending)`, falling back to current values if previous data unavailable
   - The formula essentially adds back actual construction expenses and subtracts theoretical full-utilization spending, computing what the surplus would be if construction sectors were running at full capacity
   - Stored as array variable with `aroai_weeks_in_iteration_minus_1` elements (3 weeks) for historical tracking
   - Saves current treasury, sector expenses, sector spending value, and weekly net fixed income for next week's calculation

---

## 9. Budget Management System

**Files:** `src/common/scripted_effects/aroai_budgeting_effects.txt`, `src/common/script_values/aroai_budgeting_values.txt`, `src/common/scripted_triggers/aroai_budgeting_triggers.txt`

### Budget health score (levels -3 to +3):

The system calculates a **budget health** score based on four inputs:
- **Scaled debt** (0.0 to 1.0): how close the country is to its debt ceiling
- **Budget surplus percent**: surplus as a fraction of fixed income
- **Gold reserves percent**: gold reserves as a fraction of gold reserves limit
- **Weeks of reserves**: gold reserves divided by the greater of (1) the actual negative surplus and (2) a proportional floor derived from `(budget_surplus_percent - 0.10, max -0.05 × fixed_income)`; capped at 9000, 0 if surplus >= 0 or reserves = 0. The floor prevents absurdly high week counts from tiny deficits

The trigger `aroai_budget_health_is_equal_or_higher` checks whether a country meets a given health level. The thresholds are **not fixed values** -- they are dynamic curves where the surplus requirement varies with debt level (and vice versa), creating a 2D threshold surface rather than simple cutoffs.

#### Negative health levels (-3, -2, -1):

All negative levels require `weeks_of_reserves < 156` as a gate. A country with 3+ years of reserves cannot be in negative health regardless of debt or surplus -- the reserves provide a safety buffer.

Within that gate, the country must meet **either** a surplus threshold **or** a debt threshold (OR logic):

| Health | Surplus threshold | Debt threshold | Interpretation |
|--------|-------------------|----------------|----------------|
| -3 | `surplus% >= 0.11 × ((debt - 0.75) / 0.25)` | `debt < 0.75 − 0.25 × (surplus% / 0.1875)` | At 75% debt, surplus alone suffices (threshold = 0); at 100% debt, need 11% surplus |
| -2 | `surplus% >= 0.22 × ((debt - 0.50) / 0.50)` | `debt < 0.50 − 0.25 × (surplus% / 0.1875)` | At 50% debt, surplus alone suffices; at 100% debt, need 22% surplus |
| -1 | `surplus% >= 0.33 × ((debt - 0.25) / 0.75)` | `debt < 0.25 − 0.25 × (surplus% / 0.1875)` | At 25% debt, surplus alone suffices; at 100% debt, need 33% surplus |

This means health level worsens progressively: a country at 60% debt with 5% surplus might be health -2, but the same 5% surplus at 90% debt would only achieve health -3. The interplay of debt and surplus creates smooth degradation rather than cliff edges. The constant `aroai_country_budget_surplus_critical = 0.1875` (18.75%) defines the deficit level where debt thresholds reach their most restrictive: at -18.75% surplus (relative to fixed income), the debt thresholds are at their absolute minimums. Note: the debt threshold divisor is `aroai_country_budget_surplus_critical = 0.1875`, not 0.15.

#### Neutral and positive health levels (0, 1, 2, 3):

These use OR logic between **surplus** and **weeks of reserves**:

| Health | Surplus threshold (with debt) | Surplus threshold (debt-free) | Weeks of reserves alternative |
|--------|-------------------------------|-------------------------------|-------------------------------|
| 0 | `surplus% >= 0.44 × debt` | N/A (same formula, debt=0 → threshold=0) | >= 156 weeks (~3 years) |
| +1 | `surplus% >= 0.625 × ((debt + 0.25) / 1.25)` | `surplus% >= 0.11 × ((0.50 - reserves%) / 0.50)` | >= 208 weeks (~4 years) |
| +2 | `surplus% >= 0.75 × ((debt + 0.50) / 1.50)` | `surplus% >= 0.22 × ((0.75 - reserves%) / 0.75)` | >= 260 weeks (~5 years) |
| +3 | `surplus% >= 0.875 × ((debt + 0.75) / 1.75)` | `surplus% >= 0.33 × ((1.00 - reserves%) / 1.00)` | >= 312 weeks (~6 years) |

For health levels +1 through +3, debt-free countries have a separate, easier surplus threshold that decreases as gold reserves fill up. A debt-free country with 75% full reserves needs 0% surplus for health +2 (the reserves themselves demonstrate fiscal health), while a country with debt at any level needs surplus to prove it can service that debt. This creates a natural reward for paying off debt entirely.

#### Summary of the scoring design:

- **Two-dimensional thresholds** (debt × surplus) instead of simple fixed cutoffs
- **Reserves as override** -- enough weeks of reserves can qualify for any positive health level regardless of surplus
- **Reserves as gate** -- negative health levels are blocked if reserves exceed 156 weeks
- **Debt-free bonus** -- zero-debt countries qualify for higher health levels with less surplus, scaling with how full their gold reserves are
- **Smooth curves** -- all thresholds use linear interpolation with clamping, avoiding hard jumps between levels

### Tax/wage adjustment logic:

Runs on Day 1 of each iteration. Two modes:

**When budget is neutral or positive (health >= 0):**
1. If taxes are very high (level 5), lower them immediately -- taxation above medium is considered harmful
2. Raise government wages from very low up to medium (only if taxes <= high)
3. Raise military wages from very low up to medium (only if taxes <= high)
4. If health >= +1 AND taxes <= medium: raise wages further (medium -> high, high -> very high)
5. If no wage change was made: lower taxes progressively (very high -> high -> medium -> low -> very low) based on health level

**When budget is negative (health < 0):**
1. If taxes are very low, raise to low immediately
2. If government or military wages are very high, lower both to high
3. Else if wages are high, lower both to medium
4. If budget >= -2 AND taxes >= high: **raise** government and military wages from very low to low (counterintuitively, even during negative budgets, very low wages harm IG approval and pop sol, so the AI raises them to low if it can afford the taxes)
5. If budget < -2 AND taxes >= high: cut government wages to very low (if IG approval allows), cut military wages to very low (if military not in use and IG approval allows)
6. If military forces are in use: force military wages to medium
7. If no wage change made: raise taxes progressively (low -> medium -> high -> very high)

### Wage cut constraints:

The system checks interest group approval before cutting wages. A wage cut is allowed if the budget is already at health -3 (emergency override — IG concerns are ignored in fiscal crisis), OR if the relevant interest group approves:
- Government wages: requires **both** Intelligentsia AND Petty Bourgeoisie approval (each IG: in government with approval > -3, outside government with approval > -8, or marginal)
- Military wages: requires `aroai_is_using_military_forces = no` AND Armed Forces approval (same approval thresholds as above)

### Spending shares:

Total active income is allocated as shares. `aroai_country_fixed_income` = income minus investment pool transfer, multiplied by tax level factors (very low: 1.5x, low: 1.2x, high: 0.835x, very high: 0.67x). `aroai_country_active_income` = (budget surplus + building expenses - investment pool transfer, falling back to fixed income) multiplied by tax level factors (same as above, normalizing income to what it would be at medium tax), then multiplied by power level, then multiplied by the lower of the China/India power levels, then floored at 1. The tax level normalization ensures spending targets remain consistent regardless of tax rate — a country at very low tax has its income scaled up 1.5x to reflect what it would earn at medium tax rates, while a country at very high tax is scaled down to 0.67x.
- Government Administration: 20% base (adjusted by investment pool multiplier, plus up to 5% bonus from lost taxes due to insufficient tax capacity, calculated as `0.05 × clamp(lost_taxes / 0.125, 0, 1)` where `lost_taxes` is a discrete variable representing the fraction of tax revenue lost to insufficient tax capacity, with breakpoints at 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875)
- University: 10% base (adjusted by investment pool multiplier, plus up to 2.5% bonus based on innovation deficit: `0.025 × clamp(10 × (1.10 − current/target), 0, 1)`, adjusted by high government spending multiplier). The innovation bonus adds up to 2.5 percentage points when innovation is far below target (≤0% of target), decreasing as innovation approaches 110% of target, where it reaches 0%.
- Port: 10% (adjusted by investment pool multiplier, adjusted by high government spending multiplier)
- Military: 30% base (split dynamically between barracks and naval base based on respective battalion/flotilla targets, each sub-share scaled by a progress factor capped at 5/3x; the barracks share itself is hard-capped at 80% of the total military share). Note: the base is 30%, not 35% — the effective share can scale higher through the progress factor and country-specific multipliers
- Construction Sector: residual after above shares + investment pool. The sector target is further modified by a workforce utilization factor (0.900 to 1.225 range for AI countries: 0.900 + 0.325 × (1 − unutilized_workforce_percent_multiplier), where the multiplier is 0 if workforce is fully utilized and 1 if above 12.5% unutilized)

Each share has floor/paucity/excess/ceiling multipliers (0.60x to 1.40x of target) used by the evaluation system to determine priority.

---

## 10. Building Downsizing System

**Files:** `src/common/scripted_effects/aroai_downsizing_effects.txt`, `src/common/scripted_triggers/aroai_downsizing_triggers.txt`

Runs on Day 1, after data collection, before construction scheduling.

### Conditions for downsizing to be allowed:
- Country is AI (not player-controlled)
- No ongoing revolution or revolutionary government
- Has budget surplus variable (system is initialized)

### Global gate:
All government building downsizing (items 1--6 below) requires `aroai_bureaucracy_load >= 0.75`. If bureaucracy load is below 75%, no government buildings are downsized regardless of other conditions. Additionally, each building type has a **minimum tax level** gate: government administration, university, and construction sector require tax level >= 2 (medium), while port, barracks, and naval base require tax level >= 3 (high). Downsizing government infrastructure while taxes are too low would be counterproductive.

### Downsizing order:

Each government building uses a **graduated health-tier system**: progressively more aggressive downsizing at worse budget health levels, with different threshold variables (ceiling → excess → target → paucity → floor) at each tier. The pattern is:

- **Health < 1** (positive but declining): only downsizes if capacity exceeds *ceiling* thresholds
- **Health < 0** (negative): downsizes at *excess* thresholds
- **Health < -1**: downsizes at *target* thresholds
- **Health < -2**: downsizes at *paucity* thresholds, often gated on `aroai_are_military_expenses_higher_than_usual = no`
- **Health < -3**: downsizes at *floor* thresholds, often with `aroai_in_default = yes` as an additional OR condition

1. **Government Administration** (tax level >= 2):
   - Health < 1: spending >= spending_ceiling AND bureaucracy >= bureaucracy_excess, OR bureaucracy >= bureaucracy_ceiling
   - Health < 0: spending >= spending_excess AND bureaucracy >= bureaucracy_target, OR bureaucracy >= bureaucracy_excess
   - Health < -1: bureaucracy >= bureaucracy_target

2. **University** (tax level >= 2):
   - Each health tier checks three OR conditions: innovation >= threshold, building count >= threshold, OR spending >= threshold
   - Health < -2 and < -3 also require `aroai_are_military_expenses_higher_than_usual = no`
   - Health < -3 adds `aroai_in_default = yes` as an additional OR option

3. **Construction Sector** (tax level >= 2):
   - Health < 1: spending > spending_ceiling (OR high unemployment via `aroai_unutilized_workforce_percent < total_threshold`)
   - Health < 0: spending > spending_excess (OR halved unemployment threshold)
   - Health < -1 through < -3: progressively lower spending thresholds, gated on `aroai_are_military_expenses_higher_than_usual = no`
   - Health < -3 adds `aroai_in_default = yes` OR condition
   - After downsizing, rechecks whether construction is still possible and clears the `aroai_construction_is_allowed` flag if not

4. **Port** (tax level >= 3):
   - Each health tier checks: convoys >= convoy threshold OR spending >= spending threshold
   - Health < -2 and < -3 also require `aroai_are_military_expenses_higher_than_usual = no`
   - Health < -3 adds `aroai_in_default = yes` OR condition
   - **State-level port downsizing trigger** (`aroai_downsize_port`) has complex rules:
     - Port level must be <= downsizing threshold (OR country is in default)
     - Must satisfy one of: overseas connections not required, OR state is on market capital coastline with surplus ports (more port states than `aroai_ports_on_market_capital_coastline`), OR state is in the `aroai_safe_to_delete_ports_in_overseas_lands` list
     - Prefers downsizing the smallest port: won't downsize if another state has a smaller port that also passes the same conditions

5. **Barracks** (tax level >= 3, `aroai_is_using_military_forces = no`):
   - Health < 0: battalion count >= ceiling OR spending >= ceiling
   - Health < -1: battalion count >= excess OR spending >= excess
   - Health < -2: battalion count >= target OR spending >= target
   - Health < -3: requires `aroai_in_default = yes` AND battalion count >= floor

6. **Naval Base** (tax level >= 3, `aroai_is_using_military_forces = no`):
   - Same tiered structure as Barracks, using `navy_size` vs flotilla thresholds and naval base spending thresholds

7. **Production buildings** (separate from the bureaucracy gate):
   - Gated on `aroai_is_production_downsizing_allowed`, which requires:
     - `NOT { has_law = law_laissez_faire }` (production downsizing is entirely blocked under laissez-faire)
     - `aroai_downsizing_is_allowed` local variable is set
     - Either construction is also allowed, OR enough iterations have passed since last production downsizing (`aroai_iterations_since_production_downsizing >= aroai_max_iterations_since_production_downsizing`)
     - `aroai_unutilized_workforce_percent < aroai_unutilized_workforce_percent_total_threshold`
   - Via `aroai_perform_for_every_building_type` -- checks for "abandoned" buildings (occupancy < 40% for 6+ iterations, with the abandoned variable persisting for 147 days = `iteration_days × 5 + 7`)
   - Abandonment tracking: when a building's occupancy first drops below 40%, a state-scoped variable stores its occupied levels. If occupied levels do not increase sufficiently over subsequent checks (the margin is `level × HIRING_RATE × (0.5 × iterations_since_production_downsizing + 1)`), the iteration counter increments. After 6 iterations of observed abandonment, a country-scoped flag triggers actual downsizing

### Selection logic:
For each building type, randomly picks from states meeting the downsize criteria, preferring states with the lowest occupied levels.

---

## 11. Military Threat Assessment

**File:** `src/common/scripted_effects/aroai_framework_effects.txt`

Calculates military targets by comparing against the global landscape.

### Algorithm:

1. Find top 6 countries by **army power projection** (from the engine's `country_army_power_projection_add` modifier, adjusted for conscription via `aroai_army_power_projection_with_conscription`)
2. Average them to get `aroai_army_size_equal_to_average_threat`
3. Find the single highest other country's army power projection -> `aroai_army_size_equal_to_biggest_threat`
4. Repeat for **navy power projection** (from `aroai_navy_power_projection`)
5. Convert power projections to required building counts by dividing by **power per building** (calculated as the country's own power projection / building count):
   - Army: threat power / (aroai_army_power_projection / aroai_building_barracks_total) = required barracks (conscription power projection is subtracted before division to account for conscription-based power that doesn't require barracks)
   - Navy: threat power / (aroai_navy_power_projection / navy_size) = required naval bases

### Square root calculation:
Used for military scaling. Since Paradox script has no `sqrt()`, ARoAI implements Newton's method iteratively:
- Supports integer, 0.1, and 0.01 precision
- Used for population-to-military-strength curves

---

## 12. Technology Guidance System

**File:** `src/common/scripted_effects/aroai_technology_effects.txt`

### Three modes (game rule):

**Default (Assisted):**
- Guides AI toward specific technologies via conditional innovation redirection, chosen based on country situation and tech progress:
  - Nationalism (USA after 1840, Italian states after 1846, German states after 1850)
  - Railways (after 7 of 11 tier-3 production techs)
  - Nitroglycerin (after Intensive Agriculture, then requires 9 of 11 techs)
  - Breech-loading Artillery (prerequisites: Shell Gun/Percussion Cap/Rifling)
  - Ironclads (prerequisite: Screw Frigate)
  - Improved Fertilizer, Steel Frame Buildings, Dynamite, Rubber Mastication, Rotary Valve Engine, Monitor, Pumpjacks, Threshing Machine, Electrical Generation, Electrical Capacitors, Steam Turbine, Electric Railway, Conveyors, Trench Works, Wargaming, Nitrogen Fixation
- Allows flexibility in research choices
- Adds innovation progress toward preferred techs

**Railroaded:**
- Forces strict tech path: Rationalism → Academia → prerequisites (Enclosure → Manufacturies → Shaft Mining → Steelworking → Cotton Gin → Lathe → Mechanical Tools → Atmospheric Engine) → Railways
- Also includes guidance for: Nationalism (USA, Italian states, German states), Nitroglycerin, Breech-loading artillery, Ironclads
- Uses `aroai_innovation_redirection` modifier (-100% innovation multiplier) while redirecting innovation to specific technologies
- Each tech receives `innovation x iteration_weeks` research progress per iteration

**Disabled:**
- No intervention in AI research

### Innovation redirection modifier:
```
aroai_innovation_redirection = {
    country_weekly_innovation_mult = -1  # Cancels all natural innovation
}
```
Innovation is then manually added to the target technology via scripted effect. The `aroai_perform_innovation_redirection` effect first checks that the country is NOT already researching the target technology (to avoid wasting progress). The `aroai_add_progress_to_technology` effect uses a generated switch statement supporting 1--999 innovation levels, each adding `innovation * 4` (weeks per iteration) progress to the chosen tech. If accumulated progress reaches 100% during redirection, the technology is immediately researched via `add_technology_researched`.

---

## 13. Stalemate War Resolution

**File:** `src/common/scripted_effects/aroai_diplomacy_effects.txt`

### Problem solved:
AI-vs-AI wars where both sides have 0 war support can persist indefinitely, tying up armies and ruining economies.

### Solution:
Every 30 days, the system checks all ongoing wars. For each war where both warleaders are AI with war support of 0 or -10 (the -10 accounts for the game's surrender signaling mechanic where war support can dip below 0):
- A **stalemate counter** advances through 24 levels (one level per 30-day check = ~2 years)
- At level 24, the war is forcefully resolved:
  - **Secessionist wars:** Secessionists win (annexation)
  - **Revolutionary wars:** Higher population side wins
  - **Other wars:** White peace

### Implementation:
- Wars are tracked in numbered lists (`aroai_stalemate_wars_1` through `aroai_stalemate_wars_24`)
- Ended wars are garbage-collected from lists each cycle
- Uses `aroai_ongoing_wars` list for cross-referencing
- Resolution happens via finding the diplomatic play containing all war participants and resolving it

---

## 14. Power Level & Difficulty Scaling

**File:** `src/common/script_values/aroai_framework_values.txt`

Power level is a 0.0--1.0 multiplier applied to AI income calculations, which cascades into all spending targets and construction decisions.

### Configuration (game rules, 10% increments):

| Rule | Default | Effect |
|------|---------|--------|
| Power Level of AI Countries | 100% | Scales income for AI countries not in a player's market |
| Power Level of Player Subjects | Same | Separate scaling for AI countries that are subjects/junior partners of players |
| Power Level of AI China | 100% | Additional multiplier for AI China (50M+ pop, 50%+ Chinese) -- stacks multiplicatively |
| Power Level of AI India | 100% | Additional multiplier for AI India (50M+ pop, 50%+ Indian) -- stacks multiplicatively |

### China/India special handling:
- Identified by: population >= 50M AND >= 50% of that culture
- Population scaling: the power level acts as a *reduction* that phases in linearly from 50M (no reduction, multiplier = 1.0) to 100M (full reduction to game rule value). Formula: `1.00 - (1.00 - game_rule_value) × (population - 50M) / 50M`, clamped to [0, 1]. At 100M population, the result equals the game rule value exactly. This means a partially-unified China/India at 50M population is NOT penalized — the full game rule multiplier applies. As population grows to 100M, the penalty gradually increases to match the configured game rule.
- Non-customs-union subject recovery: if the country `is_non_customs_union_subject`, power level is multiplied by 1.25 (capped at 1.00, not at the game rule value — the cap prevents subjects from exceeding 100% even with the recovery boost). This partially compensates for the economic penalty of being a regular subject
- China and India power levels are computed independently; each applies only to its respective country

### Construction scaling (separate from power level):

| Rule | Default | Range | Effect |
|------|---------|-------|--------|
| Construction of AI Countries | 100% | 0--200% | Scales construction point targets |
| Construction of Player Subjects | Same | 0--200% | Separate scaling for player's subjects |

Values over 100% apply `aroai_X_percent_accelerated_construction` state modifiers, which directly boost `state_construction_mult`. This is noted as "no longer fair play" in the UI.

---

## 15. Accelerated Construction Modifiers

**File:** `src/common/modifiers/aroai_economy_modifiers.txt`

Ten tiers of construction speed bonuses:

| Modifier | `state_construction_mult` |
|----------|--------------------------|
| aroai_10_percent_accelerated_construction | +0.10 |
| aroai_20_percent_accelerated_construction | +0.20 |
| ... | ... |
| aroai_100_percent_accelerated_construction | +1.00 |

Applied monthly to states of AI countries when construction game rule exceeds 100%. These are visible timed modifiers that appear in the state tooltip.

---

## 16. Production Method Overrides

**Files:** `src/common/production_methods/aroai_government.txt`, `aroai_industry.txt`, `aroai_urban_center.txt`

ARoAI fully redefines several production methods. Because Paradox modding requires replacing the entire PM definition to change any part of it, each file contains the complete PM with all vanilla values preserved plus ARoAI's changes. The files use the Victoria 3 1.3.6 `building_input_*`/`building_output_*` modifier syntax (replacing the older `goods_input_*`/`goods_output_*`).

### What actually changes vs vanilla:

All production method overrides preserve vanilla gameplay values (inputs, outputs, employment, convoys, infrastructure, etc.) exactly. The only changes are **ai_value additions**.

**Port production methods** -- ai_value added:

| PM | ai_value (added) |
|----|------------------|
| Anchorage | 0 |
| Basic Port | 50000 |
| Industrial Port | 100000 |
| Modern Port | 100000 |

Anchorage gets ai_value = 0 to ensure the AI never picks it over a proper port. Note that Industrial Port and Modern Port share the same ai_value (100,000) -- the AI differentiates them by technology requirements alone (Modern Port requires `concrete_dockyards`), not by preference weight.

**Administration production methods** -- ai_value only:

| PM | ai_value (added) |
|----|------------------|
| Simple Organization | 50000 |
| Horizontal Drawer Cabinets | 100000 |
| Vertical Filing Cabinets | 200000 |
| Switch Boards | 400000 |

All gameplay values (bureaucracy, tax capacity, paper/telephone inputs, employment) remain identical to vanilla. The progressive ai_value ensures the AI upgrades to higher-tier methods as they become available.

**Education production methods** -- ai_value only:

| PM | ai_value (added) |
|----|------------------|
| Scholastic Education | 50000 |
| Philosophy Department | 100000 |
| Analytical Philosophy Department | 200000 |

All gameplay values (innovation, qualifications, paper input, employment) remain identical to vanilla.

**Glassworks production methods** -- ai_value only:

| PM | ai_value (added) |
|----|------------------|
| Forest Glass | 50000 |
| Leaded Glass | 100000 |
| Crystal Glass | 200000 |
| Houseware Plastics | 0 |

All gameplay values (inputs, outputs, employment, pollution) remain identical to vanilla. Houseware Plastics gets ai_value = 0 because its oil dependency is risky for AI -- if oil supply is insufficient, the entire glassworks chain stalls.

**Urban Center production methods** -- ai_value only:

| PM | ai_value (added) |
|----|------------------|
| No Street Lighting | 50000 |
| Gas Streetlights | 100000 |
| Electric Streetlights | 0 |

All gameplay values (coal/electricity inputs, services output, infrastructure, employment) remain identical to vanilla. Electric Streetlights gets ai_value = 0 because its electricity dependency can cause issues if power supply is insufficient.

### Design choices:

1. **ai_value as the only lever.** Vanilla PMs have no `ai_value` set, so the engine uses defaults. ARoAI adds explicit values with clear progression (50k -> 100k -> 200k -> 400k) to guide the AI toward upgrading. Problematic top-tier methods (Houseware Plastics, Electric Streetlights) get ai_value = 0 to prevent the AI from adopting them.

2. **No gameplay changes.** All vanilla values (inputs, outputs, employment, convoys, infrastructure, etc.) are preserved exactly. The mod only adds AI guidance through ai_value.

3. **Full PM redefinition is a technical necessity.** Even to add just `ai_value`, the entire PM must be redefined in the mod file because Paradox modding replaces whole blocks, not individual fields.

---

## 17. Vanilla Strike Event Override

**File:** `src/events/strike_events.txt` (767 lines)

ARoAI includes a complete override of the vanilla strike event chain (9 events in the `strike` namespace). This is NOT part of the AI construction/budgeting system -- it is a separate vanilla gameplay fix.

### Events:

| Event | Name | Purpose |
|-------|------|---------|
| strike.1 | Strike! | Initial strike event triggered by `je_strike_start` journal entry. Player chooses to negotiate or break the strike. AI always picks "break" (ai_chance: negotiate=0, break=10) |
| strike.2 | Strike Negotiation | If negotiating: choose from promises (pensions, wage subsidies, regulatory bodies, worker protections, workplace safety institution). Each sets a tracking variable. |
| strike.3 | General Strike | Escalation if strike timer >= 60 days and no general strike yet. Spreads strike modifiers to all incorporated states. |
| strike.4 | Anti-Strike Measures | If breaking: choose police crackdown (requires national guard/militarized police) or hire strikebreakers. Adds suppression modifiers to trade unions and industrialists. |
| strike.5 | Union Popularity | Fires when promises are being implemented (law being enacted or institution expanded). Boosts trade union support. |
| strike.6 | Police Brutality | Fires during police crackdown. Creates loyalists among laborers/machinists, polarizes interest groups. |
| strike.7 | Anti-Union Press | Fires during strikebreaking. Industrialists gain anti-union modifier, trade unions lose attraction. |
| strike.8 | Strikers Appeased | Conclusion for negotiated resolution. Trade unions get success modifier, laborers/machinists become loyalists. |
| strike.9 | Strikers Crushed | Conclusion for broken strikes. Industrialists get success modifier, optional anti-union bonus. |

### Why it's in the mod:
The AI behavior is hardcoded into the events via `ai_chance` values. AI countries always choose to break strikes rather than negotiate in the initial event (negotiate ai_chance = 0, break ai_chance = 10). However, subsequent events have more nuanced AI preferences: in strike.4 (anti-strike measures), police crackdown has ai_chance 60 versus strikebreakers at 10; in strike.8 (strikers appeased), "celebrate" has ai_chance 10 versus "keep negotiating" at 0; in strike.9 (strikers crushed), the first option has ai_chance 10 versus the second at 0. This prevents AI from making economic promises it might not follow through on, which could leave lingering negative modifiers.

### Strike types:
The system handles three strike types based on the triggering pop's employment:
- **Industrial strike** (bg_manufacturing)
- **Mining strike** (bg_mining)
- **Railway strike** (bg_private_infrastructure)

---

## 18. Player Autobuild Feature

**Files:** `src/common/decisions/aroai_decisions.txt`, `src/events/aroai_autobuild_events.txt`

### How it works:
1. Player clicks "Open Autobuild Settings" decision (visible when game rule allows it)
2. A popup event (`aroai_autobuild_events.1`) appears with toggle options
3. Player can enable/disable autobuild globally and per building category:
   - Government Administration
   - University
   - Construction Sector
   - Railway
   - Port
   - Barracks
   - Naval Base
4. Each toggle sets/clears a country variable (e.g., `aroai_autobuild_government_administration`)
5. The main ARoAI loop treats the player country like an AI for enabled building types
6. Settings persist for 93 days before the decision becomes available to reopen

### Design choice:
The autobuild reuses the exact same evaluation, priority, and construction logic as the AI. This means players get the same quality of decisions. The per-category toggles let players retain manual control over areas they care about (e.g., military) while automating infrastructure.

---

## 19. Static Data & Why It's Needed

**Files:** `src/common/scripted_effects/aroai_static_data_effects.txt`, `src/common/scripted_triggers/aroai_static_data_triggers.txt`

### The problem:
Paradox scripting language cannot dynamically query:
- What goods a building type produces or consumes
- What technology is required to construct a building
- What resources a building type uses
- Building input/output ratios

### The solution:
All this information is **hardcoded** as scripted triggers and effects. For each of the 49 vanilla building types, ARoAI defines:

- **`aroai_consider_building_X`** -- Can this building be constructed? (technology requirements, budget conditions, existence checks)
- **`aroai_evaluate_building_X`** -- For government buildings: multi-level priority evaluation with formulas. For production buildings: delegates to market evaluation
- **`aroai_sanction_X`** -- State-level permission check (technology, resources, workforce, profitability)
- **`aroai_allocate_X`** -- State aptitude scoring (which states are best for this building)

This is why **modded buildings require compatibility patches** -- ARoAI has no way to discover a building's properties at runtime, so anything not explicitly coded is invisible to the evaluation system.

### Generated code at end of files:
Both static data files end with auto-generated code blocks (produced by `vanilla_building_types.js`):
- `aroai_static_data_effects.txt` ends with 200 placeholder effects (`aroai_perform_for_every_building_type_1` through `_200`) -- all empty stubs (`always = no`) awaiting population by compatibility patches
- `aroai_static_data_triggers.txt` ends with 200 placeholder triggers (`aroai_is_true_for_any_building_type_1` through `_200`) -- same pattern

---

## 20. Building Database & Classification

**File:** `tools/vanilla_building_types.js`

Central database of all **49 vanilla building types**. Each building has 11 attributes:

| # | Attribute | Description |
|---|-----------|-------------|
| 0 | key | Game identifier (e.g., `building_food_industry`) |
| 1 | ID | Unique numeric ID (1--49) |
| 2 | class | 1=government, 2=infrastructure, 3=military, 4=resource, 5=agriculture, 6=industry. Classes 1--3 use the government evaluation path (formula-based with priority iteration 1→12). Classes 4--6 use the production evaluation path (market supply/demand + weight/offset) |
| 3 | counter | Shared construction counter (usually = ID, but shared for related buildings like wheat/rice farms). Prevents over-queuing of functionally similar buildings by counting them against a single cap |
| 4 | order | Tiebreaker when multiple building types share the same priority. Lower order = built first. Encodes dependency chains (construction sector 1 → tools 4 → mines 5 → industry 6+) |
| 5 | limit | Controls max simultaneous constructions of this building type per iteration. Values 1--9 select a limit formula: `aroai_simultaneous_constructions × multiplier + 1`, where the multiplier depends on both the limit value and the building's urgency (average of priority and supply level). Higher limit = more constructions allowed. Actual values in data: 3--8 |
| 6 | crucial | Leniency threshold; higher = more lenient. Government buildings (classes 1--3): evaluated without suitable states when crucial >= priority. Production buildings (classes 4--6): treated as crucial when supply_vs_demand_level <= crucial, which bypasses suitable-state requirements, relaxes workforce checks, and enables productivity discounts (÷1.30 or ÷1.15) |
| 7 | workforce | 0/1 flag. When 0, the building bypasses workforce availability checks entirely (state doesn't need `available_workforce >= 5000`). All government/infrastructure/military buildings have workforce=0; all production buildings have workforce=1 (except Oil Rig which has workforce=0) |
| 8 | allocate | Max number of aptitude levels used during state selection (1--10). States are tested against `aroai_allocate_$key$` trigger with aptitude 1 first; the first matching aptitude determines the state's allocation list. Higher allocate = more tiers of state quality differentiation. Actual values: 1 (university, construction, industry), 2 (barracks, naval base, resource, agriculture), 4 (gov admin), 5 (port), 7 (railway) |
| 9 | branching | 0/1 flag. When 1, states from allocation lists are further sorted into 4 branches per aptitude level: branch 1 = incorporated + infrastructure + workforce, branch 2 = infrastructure + workforce (not incorporated), branch 3 = (incorporated + workforce) OR infrastructure, branch 4 = fallback. Branches are interleaved across aptitude levels so branch quality takes priority over aptitude quality. When 0, allocation lists are processed sequentially without branch sorting |
| 10 | scaling | 0/1 flag. When 1 (economy of scale), construction prefers states where this building type already has the most levels — concentrating development. When 0, construction prefers states with the fewest levels — spreading out. The scaling threshold is `sqrt(construction_points) / 20 + 1` concurrent states |

### Building classes:

**Class 1 -- Government (2 buildings):**
Government Administration, University

**Class 2 -- Infrastructure (3 buildings):**
Construction Sector, Railway, Port

**Class 3 -- Military (2 buildings):**
Barracks, Naval Base

**Class 4 -- Resource (10 buildings):**
Logging Camp, Fishing Wharf, Whaling Station, Rubber Plantation, Oil Rig, Coal Mine, Iron Mine, Lead Mine, Sulfur Mine, Gold Mine

**Class 5 -- Agriculture (15 buildings):**
Rye Farm, Wheat Farm, Rice Farm, Maize Farm, Millet Farm, Livestock Ranch, Cotton Plantation, Dye Plantation, Silk Plantation, Banana Plantation, Sugar Plantation, Tea Plantation, Coffee Plantation, Tobacco Plantation, Opium Plantation

**Class 6 -- Industry (17 buildings):**
Food Industry, Textile Mills, Furniture Manufactories, Glassworks, Tooling Workshops, Paper Mills, Chemical Plants, Synthetics Plants, Steel Mills, Motor Industry, Shipyards, Power Plant, Electrics Industry, Arms Industry, Munition Plants, War Machine Industry, Arts Academy

Note: Class assignments in the code differ from vanilla building groups. Government Administration is class 1, while Construction Sector/Railway/Port are class 2 (infrastructure). Barracks/Naval Base are class 3 (military). This grouping reflects how ARoAI evaluates each category rather than the vanilla building group hierarchy.

### Shared counters:
Some buildings share a construction counter to prevent over-queuing of functionally similar buildings:
- Wheat/Rice/Maize/Millet Farms all share counter 18 (Rye Farm's ID) -- prevents queueing too many grain farms
- Cotton Plantation shares counter 23 (Livestock Ranch's ID) -- both produce basic agricultural goods
- Synthetics Plants shares counter 25 (Dye Plantation's ID) -- both supply dye-related goods

### Build order (key design decision):
The `order` attribute creates implicit dependency chains. Lower numbers are built first when priorities tie:

```
Order  Buildings
  1    Construction Sector
  2    Government Administration
  3    Railway, Port
  4    Oil Rig, Tooling Workshops, Power Plant
  5    Logging Camp, Whaling Station, Coal Mine, Iron Mine, Sulfur Mine, Livestock Ranch, Cotton Plantation
  6    Lead Mine, Rubber Plantation, Paper Mills, Chemical Plants, Steel Mills
  7    Glassworks, Motor Industry, Arms Industry, Munition Plants
  8    Electrics Industry, War Machine Industry, Shipyards
  9    University, Barracks, Naval Base
 10    Wheat/Rye/Rice/Maize/Millet Farms
 11    Gold Mine, Dye Plantation, Opium Plantation, Silk Plantation
 12    Textile Mills, Furniture Manufactories, Synthetics Plants
 13    Fishing Wharf, Banana Plantation, Sugar Plantation
 14    Tobacco Plantation, Food Industry
 15    Tea Plantation, Coffee Plantation, Arts Academy
```

This ensures the economy bootstraps correctly: construction capacity -> administration -> infrastructure -> tools/power -> raw materials -> heavy industry -> consumer industry -> luxury goods.

### Notable attribute values:

| Building | Limit | Crucial | Notes |
|----------|-------|---------|-------|
| Government Administration | 4 | 10 | Crucial=10: evaluates priorities 1--10 without suitable states. High crucial = almost always builds when needed |
| University | 8 | 8 | Crucial=8: evaluates priorities 1--8 without suitable states |
| Railway | 5 | 99 | Crucial=99: always evaluates without suitable states (99 >= any priority). Effectively "always eligible" |
| Port | 3 | 99 | Same as Railway: always evaluates without suitable states. Low limit = conservative queuing per iteration |
| Construction Sector | 5 | 5 | Crucial=5: default threshold, only treated as crucial during significant shortages (supply level ≤ 5) |
| Barracks | 8 | 8 | Crucial=8: evaluates priorities 1--8 without suitable states. High limit allows aggressive military buildup |
| Naval Base | 5 | 8 | Crucial=8: evaluates priorities 1--8 without suitable states |
| Rubber Plantation | 5 | 11 | Crucial=11: treated as crucial for supply levels 1--11 (most shortages and even moderate supply). Bypasses state and profitability checks in severe shortage |
| Oil Rig | 5 | 11 | Same as Rubber: crucial for supply levels 1--11. Strategic resource always prioritized. Also has an early-game override that bypasses market evaluation entirely |
| Gold Mine | 5 | 5 | Crucial=5: only treated as crucial during significant shortages (supply level ≤ 5). Note: Gold Mine bypasses the standard weight/offset evaluation entirely, hardcoding priority=6, supply_vs_demand=5, productivity=5 directly |

All other production buildings (resource, agriculture, industry) use crucial=5, the default threshold.

---

## 21. Data Packing Scheme

Paradox script has no arrays, structs, or multi-field variables. Packing multiple values into digit positions of a single integer is how ARoAI tracks five data fields per building type in one variable.

### `aroai_building_type_{id}_collected_data` format:

A single integer encodes multiple data cells by position in the number:

| Cell | Extraction Method | Content |
|------|-------------------|---------|
| 1 | Decimal portion (ones/tens) | Priority level |
| 2 | Hundreds portion | Supply vs demand level |
| 3 | Ten-thousands to millions | Productivity requirement |
| 4 | Hundred-millions+ | Production method level (used for railway infrastructure-per-level lookup and shipyard PM-dependent evaluation) |
| 5 | Rounded to millions | Construction counter |
| avg | Average of cells 1 and 2 | Used for construction limit lookup |

### Extraction (generated by `aroai_building_type_X_collected_data_X.js`):

For each of 500 building IDs (49 vanilla + up to 451 modded), 6 extraction script values are generated:
```
aroai_building_type_{id}_collected_data_1 = decimal portion
aroai_building_type_{id}_collected_data_2 = hundreds portion
aroai_building_type_{id}_collected_data_3 = ten-thousands to millions
aroai_building_type_{id}_collected_data_4 = hundred-millions+
aroai_building_type_{id}_collected_data_5 = rounded to millions
aroai_building_type_{id}_collected_data_average_of_1_and_2 = average of first two
```

Total: **3,000 generated script values** (500 buildings x 6 values each).

### `aroai_ongoing_constructions` list elements:

Each element packs: building type ID, points remaining (or weeks since finish), construction status (1=active, 2=expected-finished, 3=finished), and count.

### Why packing:
Every Paradox variable consumes memory and save file space. With 49+ building types x multiple countries x multiple states, keeping data compact is critical for performance.

---

## 22. Code Generation Toolchain

**Directory:** `tools/`

Several JavaScript files generate repetitive Paradox script code. Run in any JS environment (browser console, Node.js).

### `vanilla_building_types.js` -- Master generator

Generates four critical code blocks from the building table:

1. **`aroai_construct_special_buildings_compatibility`**: Switch statement for 200 compatibility patch slots, delegating to `aroai_construct_special_buildings_X` for each patch
2. **`aroai_perform_for_every_building_type`**: Iterates over all 49 buildings with a parameterized `$effect$` (e.g., evaluate, construct, downsize). This is the core dispatch mechanism. If compatibility patches are active, also calls `aroai_perform_for_every_building_type_compatibility`.
3. **`aroai_perform_for_every_building_type_compatibility`**: Iterates global list of patch IDs, dispatching to `aroai_perform_for_every_building_type_X` for each
4. **`aroai_is_true_for_any_building_type`**: Trigger version that checks any building against a parameterized `$trigger$`, including compatibility patches

### `compatibility_patches.js` -- Patch generator

Takes a modded building table and generates three things:
1. `aroai_add_to_list_of_compatibility_patches_X` -- effect to register the patch
2. `aroai_perform_for_every_building_type_X` -- effect to iterate the patch's buildings
3. `aroai_is_true_for_any_building_type_X` -- trigger to check the patch's buildings

### Other generators:

| File | Generates | Output Scale |
|------|-----------|--------------|
| `aroai_add_progress_to_technology.js` | Switch for 1--999 innovation levels -> tech progress (innovation x 4 weeks) | 999 cases |
| `aroai_building_type_X_collected_data_X.js` | Data extraction script values (digit unpacking) | 3,000 values (500 x 6) |
| `aroai_check_if_counter_is_within_limit.js` | Construction limit checking trigger with 11-level switch | 11 cases |
| `aroai_construction_limit_X_X.js` | Construction limit grid values | 99 values (9 x 11) |
| `aroai_filter_and_sort_states_from_allocation_lists.js` | State filtering with up to 10 aptitude levels x 4 branches | 40 branch calls |
| `aroai_refresh_list_of_compatibility_patches.js` | Clears and repopulates compatibility patch global list | 200 stub effects |
| `aroai_fix_error_log_complaining_about_variables.js` | Initializes all 500 building data variables to suppress error log | 500 variable sets |

### Why code generation:
Paradox script requires explicit enumeration -- there are no loops over variable ranges, no dynamic variable names, no computed gotos. A function that handles "for each building type, do X" must literally list all 49+ building types. Code generation avoids human error and enables the 200-slot compatibility patch system.

---

## 23. Compatibility Patch System

**Docs:** `docs/compatibility_patches/`

### Problem:
ARoAI cannot dynamically discover modded buildings. All building data is hardcoded.

### Solution:
A compatibility patch system with 200 reserved slots:

1. **Register** a patch ID at GitHub issue #4
2. **Register** building IDs at GitHub issue #5
3. **Create** a building table (same 11-attribute format as vanilla)
4. **Run** `compatibility_patches.js` with your building table to generate effect/trigger code
5. **Write** custom `evaluate`, `consider`, `sanction`, and `allocate` triggers/effects (manually, following examples)
6. **Package** as a mod that loads after ARoAI

### File naming convention:
```
zzz_aroai_compatibility_X_effects.txt
zzz_aroai_compatibility_X_triggers.txt
```
The `zzz_` prefix ensures load order (after ARoAI's files).

### Limitations:
- Agriculture buildings cannot be patched (complex arable land interaction)
- Most government buildings cannot be patched
- Resource and industry buildings work well

### Example compatibility patch:

The repo includes a complete example at `docs/compatibility_patches/example_file_structure/`:

**Effects file** (`zzz_aroai_compatibility_1_effects.txt`, 133 lines):
- Example `aroai_evaluate_building_synthetic_oil_plants` and `aroai_evaluate_building_synthetic_rubber_plants` effects demonstrating market-based evaluation
- Example `aroai_construct_special_buildings_1` showing how to handle special/unique buildings (uses Eiffel Tower as example)
- Auto-generated `aroai_perform_for_every_building_type_1` dispatch effect

**Triggers file** (`zzz_aroai_compatibility_1_triggers.txt`, 81 lines):
- Example `aroai_consider_building_synthetic_oil_plants` / `_rubber_plants` with technology/budget checks
- Example `aroai_sanction_building_synthetic_oil_plants` / `_rubber_plants` with profitability/state checks
- Example `aroai_allocate_building_synthetic_oil_plants` / `_rubber_plants` with aptitude level conditions
- Auto-generated `aroai_is_true_for_any_building_type_1` dispatch trigger

### Total conversion mods:

`docs/compatibility_patches/total_conversion_mods.txt` provides guidance for total conversion mods that should overwrite vanilla ARoAI files entirely instead of using the compatibility patch system:
- Do not register IDs -- create your own building table using `tools/vanilla_building_types.js`
- Overwrite the generated vanilla static data with your own script execution results
- Create effects and triggers following the same patterns as ARoAI's files

### Runtime detection:
ARoAI checks for active compatibility patches via `aroai_refresh_list_of_compatibility_patches` (daily), which populates a global list. The main building iteration loop checks this list and includes patched buildings in evaluation/construction.

---

## 24. Vanilla AI Overrides (Defines)

**File:** `src/common/defines/aroai_defines.txt`

ARoAI disables these vanilla AI systems:

| Define | Value | What it disables |
|--------|-------|------------------|
| `GOVERNMENT_MONEY_SPENDING_ENABLED` | no | AI budget allocation for government buildings |
| `TAX_LEVEL_CHANGES_ENABLED` | no | AI tax level adjustments |
| `PRODUCTION_BUILDING_CONSTRUCTION_ENABLED` | no | AI production building construction |

### Kept but tweaked:

| Define | Value | Purpose |
|--------|-------|---------|
| `CONSTRUCTION_DEBT_RESUME` | 6.66 | Resume construction at this debt ratio (effectively disabled -- 6.66 is unreachable) |
| `CONSTRUCTION_DEBT_PAUSE` | 7.77 | Pause construction at this debt ratio (effectively disabled) |
| `CONSTRUCTION_DEBT_RESUME_CRITICAL_CONSTRUCTION` | 6.66 | Same for critical constructions (effectively disabled) |
| `CONSTRUCTION_DEBT_PAUSE_CRITICAL_CONSTRUCTION` | 7.77 | Same for critical constructions (effectively disabled) |
| `PROMOTION_BASE_VALUE` | 0 | Disable interest group promotion AI |
| `SUPPRESSION_BASE_VALUE` | 0 | Disable interest group suppression AI |
| `CONSUMPTION_TAX_LOW_INCOME_THRESHOLD` | 3.0 | When consumption taxes become must-have |
| `CONSUMPTION_TAX_HIGH_INCOME_THRESHOLD` | 5.0 | When consumption taxes should be removed |
| `CONSUMPTION_TAX_MAX_NUM_TAXED_GOODS_BASE` | 6 | Max goods AI wants to consumption-tax |

### Commented out (kept vanilla):

| Define | Reason |
|--------|--------|
| `GOVERNMENT_AUTHORITY_SPENDING_ENABLED` | ARoAI doesn't replace authority spending |
| `AUTONOMOUS_INVESTMENT_CONSTRUCTION_ENABLED` | ARoAI accounts for private queue but doesn't control it |
| `CONSUMPTION_TAX_INCOME_VALUE`, `CONSUMPTION_TAX_STAPLE_MULT`, `CONSUMPTION_TAX_LUXURY_MULT` | Left at vanilla values |
| `CONSUMPTION_TAX_MAX_NUM_TAXED_GOODS_PER_MISSING_TAX_TYPE` | Left at vanilla |

### Design choice:
The vanilla debt pause/resume thresholds are set to impossible values (6.66/7.77) because ARoAI manages construction pausing itself based on its own budget health system. All four debt thresholds (normal and critical) are set to unreachable values so ARoAI has full control. Some vanilla systems (consumption taxes, autonomous investment) are left partially active since ARoAI doesn't fully replace them.

---

## 25. Game Rules

**File:** `src/common/game_rules/aroai_game_rules.txt`

Ten configurable game rules:

| Rule | Options | Default | Purpose |
|------|---------|---------|---------|
| Power Level of AI Countries | 0--100% (10% steps) | 100% | Scale AI country income |
| Power Level of Player Subjects | 0--100% / Same | Same | Separate scaling for player's AI subjects |
| Power Level of AI China | 0--100% | 100% | China-specific nerf (multiplicative with base) |
| Power Level of AI India | 0--100% | 100% | India-specific nerf (multiplicative with base) |
| Construction of AI Countries | 0--200% (10% steps) | 100% | Scale AI construction targets; >100% adds modifier |
| Construction of Player Subjects | 0--200% / Same | Same | Separate construction scaling for player's subjects |
| Building Priorities | Roleplay / Uniform | Roleplay | Whether AI building weights vary by country character |
| Research Assistance for AI | Default / Railroaded / Disabled | Default | How much the mod guides AI tech choices |
| Autobuild for Players | Allowed / Prohibited | Allowed | Whether players can use the autobuild decision |
| Stalemate War Prevention | Enabled / Disabled | Enabled | Whether stuck AI wars get forcefully resolved |

---

## 26. Global History Initialization

**File:** `src/common/history/global/aroai_global.txt`

On game start, two global flags are set:

```
GLOBAL = {
    aroai_set_date_of_next_iteration_for_all_countries = yes
    aroai_check_agriculture_resources_in_state_regions = yes
}
```

- `aroai_set_date_of_next_iteration_for_all_countries`: Consumed by the framework event on day 1 to randomize all countries' iteration start dates
- `aroai_check_agriculture_resources_in_state_regions`: Consumed by the framework event on day 1 to pre-scan all state regions for available agriculture resources (dye, silk, sugar, tea, coffee, tobacco, opium)

Both flags are checked and cleared by the framework, so they only trigger once.

---

## 27. Mod Metadata

**File:** `src/.metadata/metadata.json`

```json
{
  "name" : "Anbeeld's Revision of AI",
  "id" : "",
  "version" : "",
  "supported_game_version" : "",
  "short_description" : "",
  "tags" : [],
  "relationships" : [],
  "game_custom_data" : {
    "multiplayer_synchronized" : true
  }
}
```

This is a template -- the actual ID, version, and game version fields are populated during release/distribution. The `multiplayer_synchronized: true` flag means all players in a multiplayer game must have this mod enabled (its scripted effects alter game state).

---

## 28. Localization

**Directory:** `src/localization/`

Full localization for **11 languages**: Brazilian Portuguese, English, French, German, Japanese, Korean, Polish, Russian, Simplified Chinese, Spanish, Turkish.

Each language has 4 files:
- `ARoAI_decisions_l_{lang}.yml` -- Decision button text ("Open Autobuild Settings")
- `ARoAI_events_l_{lang}.yml` -- Autobuild event UI text (toggle labels)
- `ARoAI_game_rules_l_{lang}.yml` -- Game rule names and descriptions (all 10 rules)
- `ARoAI_modifiers_l_{lang}.yml` -- Modifier display names ("Innovation Redirection", "Accelerated Construction")

---

## 29. File Map

```
src/
├── .metadata/metadata.json                          Mod metadata template (multiplayer_synchronized: true)
├── common/
│   ├── decisions/aroai_decisions.txt                 "Open Autobuild Settings" decision
│   ├── defines/aroai_defines.txt                     Vanilla AI overrides (NAI block)
│   ├── game_rules/aroai_game_rules.txt               10 configurable rules
│   ├── history/global/aroai_global.txt               Game-start initialization flags
│   ├── modifiers/
│   │   ├── aroai_economy_modifiers.txt               10 tiers of construction speed boost (10%--100%)
│   │   └── aroai_research_modifiers.txt              Innovation redirection modifier (-100% mult)
│   ├── on_actions/aroai_on_actions.txt               Hook: on_monthly_pulse_country -> framework
│   ├── production_methods/
│   │   ├── aroai_government.txt                      PM ai_value for ports + admin + education
│   │   ├── aroai_industry.txt                        PM ai_value for glassworks
│   │   └── aroai_urban_center.txt                    PM ai_value for street lighting
│   ├── script_values/
│   │   ├── aroai_budgeting_values.txt                Treasury, surplus, income, expenses, health
│   │   ├── aroai_construction_values.txt             Simultaneous constructions, limits, point extraction
│   │   ├── aroai_evaluation_values.txt               Supply/demand, gov building targets, spending shares
│   │   ├── aroai_framework_values.txt                Timing, power levels, China/India scaling
│   │   ├── aroai_preparation_values.txt              Population, GDP, military, infrastructure, spending
│   │   ├── aroai_technology_values.txt               Innovation ceiling
│   │   └── aroai_weekly_loop_values.txt              Day tracking, construction points
│   ├── scripted_effects/
│   │   ├── aroai_budgeting_effects.txt               Tax/wage adjustment, military expense tracking
│   │   ├── aroai_construction_effects.txt            Building selection, state allocation, queue management
│   │   ├── aroai_diplomacy_effects.txt               Stalemate war tracking and resolution
│   │   ├── aroai_downsizing_effects.txt              Building removal logic
│   │   ├── aroai_evaluation_effects.txt              Priority calculation per building type
│   │   ├── aroai_framework_effects.txt               Square root, military threat, framework init
│   │   ├── aroai_preparation_effects.txt             Data collection, military/economic initialization
│   │   ├── aroai_static_data_effects.txt             Per-building evaluation + 200 compat patch stubs
│   │   ├── aroai_technology_effects.txt              Innovation redirection across all techs
│   │   └── aroai_weekly_loop_effects.txt             Budget cycle, construction tracking, surplus calc
│   └── scripted_triggers/
│       ├── aroai_budgeting_triggers.txt              Wage/tax level checks, military status, budget health
│       ├── aroai_construction_triggers.txt            State requirements, agriculture checks, counter limits
│       ├── aroai_downsizing_triggers.txt              Per-building downsize conditions
│       ├── aroai_evaluation_triggers.txt              Building allowed/can expand/sanction/allocate
│       ├── aroai_framework_triggers.txt               Country alive, variable list helpers, building existence
│       ├── aroai_preparation_triggers.txt             Construction/downsizing permission, workforce, infra
│       └── aroai_static_data_triggers.txt             Per-building consider/sanction/allocate + 200 stubs
├── events/
│   ├── aroai_autobuild_events.txt                    Player autobuild settings UI (8 toggles)
│   ├── aroai_construction_events.txt                 Day 3+ construction dispatcher
│   ├── aroai_evaluation_events.txt                   Day 2 evaluation dispatcher
│   ├── aroai_framework_events.txt                    Main daily loop orchestrator
│   ├── aroai_preparation_events.txt                  Day 1 data collection + budget management
│   ├── aroai_weekly_loop_events.txt                  Weekly budget/construction tracking
│   └── strike_events.txt                             Vanilla strike event override (9 events)
├── localization/{11 languages}/                      4 files per language (44 total)
└── thumbnail.png                                     Steam Workshop thumbnail

tools/
├── vanilla_building_types.js                         Master building DB (49 buildings) + code generator
├── compatibility_patches.js                          Compat patch code generator
└── common/
    ├── script_values/
    │   ├── aroai_building_type_X_collected_data_X.js  Data unpacking generator (3000 values)
    │   └── aroai_construction_limit_X_X.js            Limit grid generator (99 values)
    ├── scripted_effects/
    │   ├── aroai_add_progress_to_technology.js         Tech progress switch generator (999 cases)
    │   ├── aroai_filter_and_sort_states_from_allocation_lists.js  State sorting generator
    │   ├── aroai_fix_error_log_complaining_about_variables.js     Variable init generator (500 vars)
    │   └── aroai_refresh_list_of_compatibility_patches.js         Patch list generator (200 stubs)
    └── scripted_triggers/
        └── aroai_check_if_counter_is_within_limit.js  Counter limit trigger generator (11 cases)

docs/
├── how_does_it_work.txt                              Architecture overview (author's words)
├── analysis.md                                        This file
└── compatibility_patches/
    ├── compatibility_patches.txt                     Step-by-step patch creation guide (9 steps)
    ├── total_conversion_mods.txt                     Notes for total conversions (overwrite, don't patch)
    └── example_file_structure/
        └── common/
            ├── scripted_effects/
            │   └── zzz_aroai_compatibility_1_effects.txt    Example evaluate effects + special buildings
            └── scripted_triggers/
                └── zzz_aroai_compatibility_1_triggers.txt   Example consider/sanction/allocate triggers
```

---

## 30. Design Principles

- **Performance above all:** Time distribution across 14+ days, country staggering, a weekly loop for frequent data, packed integers, selective collection, and idle days 15–28 all reduce per-tick cost.
- **Static over dynamic:** Every building's properties are hardcoded because the script engine cannot introspect building definitions. Production buildings compensate by querying live market signals; government buildings use predefined formulas.
- **Targeted PM changes:** Only `ai_value` weights are added to production methods. All vanilla gameplay values (inputs, outputs, convoys, employment) are preserved. Full PM redefinition is a Paradox modding requirement, not a design choice.
- **Minimal vanilla disruption:** Construction AI and tax/wage AI are fully replaced. Strike events are overridden. Consumption tax AI, authority spending AI, and autonomous investment AI are left intact.
- **Fairness by default:** Default game rules (100% power, 100% construction) give AI no numerical advantage. Construction bonuses above 100% are flagged in the UI as "no longer fair play."
- **Extensibility via compatibility patches:** 200 reserved stub slots, JavaScript code generators, full example patches, a GitHub ID tracker, and guidance for total conversion mods.

---

## 31. Design Analysis

The principles above are local responses to specific constraints. This section traces how those responses connect — and where the connections create tensions, unresolved interactions, and trade-offs that a component-by-component reading would miss.

A packed integer like `302050100` in `aroai_building_type_{id}_collected_data` is not an error — it encodes priority (2), supply/demand (5), productivity (30), PM level (2), and construction counter (0) across five digit positions. The JS toolchain generates 3,000 extraction script values to decompose these integers back into components. This packing exists because Paradox script has no structs: five logical fields become digit ranges of one variable. The scheme is precise but fragile. If any cell overflows its allocated digit range, adjacent cells are silently corrupted. The guarantee that this will not happen is implicit — the author's testing has not produced overflow values, but there is no runtime validation, no debug logging for packed values, and no way to inspect `aroai_ongoing_constructions` list elements beyond the packing scheme that defines them.

The absence of structs also means building properties cannot be stored in aggregate. ARoAI cannot ask "what goods does this building type produce?" at runtime. All 49 vanilla buildings have their inputs, outputs, technology requirements, and evaluation logic hardcoded as scripted triggers and effects (§19). The same constraint appears in `aroai_add_progress_to_technology`, a 999-case switch statement that exists because there is no way to compute `innovation × 4` dynamically. Modded buildings need compatibility patches (§23) because a new building type is invisible without hand-written consider/evaluate/sanction/allocate blocks. Two hundred reserved stub slots, a JavaScript code generator, and the GitHub ID registration system automate the mechanical parts, but the per-building evaluation logic must be authored manually. One language gap produced the data packing scheme, the compatibility patch system, the stub slot reservation, and the building database.

The script engine can query market supply and demand for any good. It cannot introspect what a building produces, consumes, or requires. The evaluation system splits along this fault line. Production buildings use market signals: `supply_vs_demand_level + weight` gives a priority number, and `supply_vs_demand_level + offset` gates expansion through a productivity requirement. Weight decides what gets built, offset decides whether expansion is justified, and order breaks ties through a static dependency chain (construction sector at order=1, tools at 4, mines at 5, industries at 6+). The three levers are independent: changing weight never affects offset, changing offset never changes order.

Government buildings have no traded goods to query. Bureaucracy, convoys, battalions, and innovation are not market commodities, so they use formula-based evaluation with spending share targets and tiered thresholds (priority 1 through 12, each with its own numeric floor). Government buildings get no offset parameter because there is no productivity signal to offset against. The crucial rating partially bridges this gap: production buildings with `supply_vs_demand_level <= crucial` bypass state requirements, government buildings with `crucial >= priority` evaluate even without suitable states. Railway and Port, at crucial=99, always evaluate.

The weight system is organized into families (`aroai_resource_weight_N`, `aroai_agriculture_weight_N`, `aroai_industry_weight_N`) with optional `_factor` variables adjusted by the Roleplay game rule. This lets compatibility patches or future rules shift entire categories of goods without touching individual building evaluations. For multi-good buildings, weight and offset together differentiate primary from secondary goods: primary goods get low weight (1–4) and zero offset; secondary goods get high weight (5–11) and offset 4–6. Secondary goods only win construction priority when the market genuinely needs them and existing buildings are profitable enough. But weight values are per-good, not per-building: every building producing iron uses the same `aroai_resource_weight_1`, regardless of whether iron is that building's core output or a minor byproduct.

A country researching Steel will not start building iron mines early. By the time those mines finish 52 weeks later, the steel shortage has already been handled by whatever the previous iteration queued. Neither evaluation strategy accounts for construction time: a building that takes 52 weeks to complete gets the same priority as one that takes 4 weeks. Supply/demand is a lagging indicator, and there is no forward-looking mechanism. The `order` attribute front-loads upstream buildings as a static compensation (construction sector at order=1, tools at 4, mines at 5, industries at 6+), but it is fixed at compile time and not adaptive to what a specific game's economy already has in surplus. This is one of the trade-offs of the 28-day evaluation cycle described above: priorities are frozen for the full iteration regardless of what changed on day 3.

Paradox script was designed for event chains and journal entries, not algorithmic work across 50+ countries. Every timing decision in the architecture is a response to the overhead of script execution. The 28-day iteration cycle spreads evaluation and construction across 14 days per country. Country iteration starts are staggered through five tiers so not all countries compute simultaneously. The weekly loop provides a lightweight budget-tracking alternative to re-running the full evaluation. Days 15–28 are deliberately idle. The author reports that removing this distribution produced visible frame drops under the combined evaluation load.

The distribution has real costs. Building priorities are fixed for the full 28 days; a market crash or war declaration mid-cycle changes nothing until the next preparation phase. Construction throughput is capped at one building type per day, so at most 12 types per iteration. Construction tracking processes each element in `aroai_ongoing_constructions` individually via `every_in_list`, making it O(states × constructions) per weekly iteration. For large countries late in a campaign, this contributes to the very performance pressure the staggering was designed to avoid. The packed-integer construction list that makes this tracking possible (each element encoding building type, remaining points, status, and count in digit positions) also makes it opaque: there is no way to inspect or debug the queue except by decoding the integers against the packing scheme described in §21.

Because there is no inter-country communication, each AI country evaluates its economy independently, querying only its own market. Two countries sharing a customs union can both identify the same shortage and both queue construction. By the time buildings complete months later, the result is oversupply. Stalemate war resolution (§13) works around the absence of diplomatic query APIs by tracking wars in hardcoded numbered lists, escalating through 24 levels over roughly two years, then forcefully resolving. The resolution does not consider war goals or territorial control: a country occupying 90% of its target gets the same white peace as one that made no progress.

The budget health score (−3 to +3) uses two-dimensional curves (debt × surplus) with linear interpolation, creating smooth fiscal degradation instead of cliff edges. Reserves serve as both gate (negative health blocked above 156 weeks) and alternative path (positive health achievable through reserves alone, no surplus required). Building reserves creates freedom; accumulating debt constrains options. Tax and wage adjustments follow asymmetric logic: taxes rise fast, wages cut slow, and wage cuts require interest group approval — but even during fiscal crisis (health ≥ -2), very low wages are raised to low rather than cut further, reflecting that rock-bottom wages harm IG approval and pop sol more than the marginal savings help. The cooldown of `iteration_days + 7` (35 days) prevents oscillation but leaves a window where the AI cannot respond to rapidly deteriorating finances.

Several of these algorithmic choices have unresolved interactions. The military downsizing gate (`aroai_is_using_military_forces = no`) means a country at health −3 with mobilized formations cannot downsize barracks: it can only raise taxes, the one remaining lever. Production building downsizing uses an abandoned-building heuristic (occupancy below 40% for 6+ iterations), which catches buildings that have genuinely failed but misses chronically unprofitable buildings that stay fully staffed. The budget surplus calculation has a `# TODO proper fallback` that may produce incorrect estimates when construction sector data is unavailable; when `aroai_country_budget_surplus` or `aroai_total_building_expenses` are missing or zero, the active income falls back to `aroai_country_fixed_income` alone, which doesn't account for spending patterns. Two other unresolved TODOs affect budgeting: a data dependency ordering problem in `aroai_budgeting_effects.txt` (a condition on construction sector spending is commented out because sector spending data isn't available at the point where tax/wage decisions are made), and hardcoded day offsets in `aroai_framework_effects.txt` that should reference `aroai_days_in_the_iteration`. Consumption tax revenue is not integrated into budget calculations.

The technology guidance system guides AI research toward critical techs through conditional innovation redirection, including a 999-case switch for adding research progress. The author's own TODO asks whether native 1.2.3 tech weights make the entire system redundant. The innovation redirection modifier (`country_weekly_innovation_mult = -1`) zeroes out natural innovation and manually adds it to the target technology; if the scripted effect fails to fire for any reason, the country silently loses all innovation for that iteration. If native weights work, the 999-case switch, the Railroaded mode, and the redirection modifier could be removed.

Hardcoded constants — workforce thresholds of 5,000 and 20,000, government spending shares of 20%/10%/10%/30%, the 28-day iteration length — were tuned through testing but may not scale across the full game timeline. In early-game states with small populations, 20,000 may be unreachable; in late-game states where populations have ballooned, 5,000 is a trivial gate. The tax level normalization (very_low: 1.5x, low: 1.2x, high: 0.835x, very_high: 0.67x) ensures spending targets are consistent across tax levels, but the factors themselves are hardcoded assumptions about the relationship between tax settings and effective income.

The architecture succeeds because it is disciplined about what the language allows. The reactive orientation — responding to current market conditions, not anticipating future needs — is the deepest limitation, but it also keeps the system honest about what the scripting layer can actually deliver. A forward-looking system that predicted demand from in-progress research or anticipated market shifts would be fragile in a language with no data structures, no inter-country communication, and script execution expensive enough to require time distribution. Within those constraints, the three-layer decision hierarchy, the two-dimensional budget curves, and the generated-code toolchain represent consistent trade-offs: static data over fragile workarounds, hardcoded accuracy over dynamic generality. Some problems — inter-country coordination, anticipatory building, profitability-based downsizing — sit beyond what the scripting layer can reliably express. The most practical improvements are the ones the author already flagged: verify whether native tech weights work and remove the redirection system if they do, implement the budget surplus fallback properly, and resolve the hardcoded day offsets that the `aroai_framework_effects.txt` TODO already identifies.
