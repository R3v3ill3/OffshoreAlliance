# DA1.1 — Employers round (adjudication analyst's preparation)

2026-09-24 · production `gteygwfgjvczanmrwgbr`, read-only (decision D0) · Australian Business Register lookups at abr.business.gov.au (public) · no personal data: organisation names, worksite names, agreement names, ids and counts only

This file is the analyst's step of the work-package protocol ("Adjudicate", `ORCHESTRATION_PROMPT.md:89`): the pack re-run, the worksheet's proposal columns refreshed, the merge and coverage plan per row, and the question list for the 60–90 minute session. **Nothing here is decided.** The operator's answers go into the decision columns of `worksheets/employers_adjudication_2026-09-24.csv` and, for structural answers, into plan §6. The Fable planner then writes the plan sections of this file (files, scripts, acceptance evidence) from the answers.

Files written by this step: `docs/data-architecture/worksheets/employers_adjudication_2026-09-24.csv` (the 22 Sep file is untouched) and this file.

## 1. Specification

### 1.1 Plan §5, row DA1.1 (`OA_UNIVERSE_ALIGNMENT_PLAN.md:389`), verbatim

> | DA1.1 | Employers round: adjudicate the 187-row worksheet with the owner; execute merges through the existing merge route (or its SQL equivalent) with aliases; merge `IAS Group` (827) into UGL and `Rigforce Pty Ltd` (798) into Programmed with their names as aliases, delete the `MMA` → Monadelphous alias and merge `MMA` (699) and `Mermaid Marine` (745) into Cyan Renewables (D12); apply the legal-entity rule to the lineage-A rows, writing `agreement_worksites` and `agreement_scopes` for every moved agreement (D2); restore the Monadelphous and Programmed agreement-holding subsidiaries as children (D3); set `organisation_kind` and `is_agreement_entity`; add ABNs from the ABR for the top 60 by workers | decisions Q-E1…Q-E23; scripts `10_employers_*.sql` | 0 clusters in `05_candidate_clusters.sql` without a recorded decision; every OA Universe contractor and marine key client has exactly one root row (new rows for Allseas, Subsea7, DeepOcean / Shelf Subsea, Van Oord, Vantris, Boskalis, Condex, Heerema, Weststar-GAP, GGC at low confidence, and a Transocean root above Sedco Forex) |

### 1.2 Orchestration paragraph (`ORCHESTRATION_PROMPT.md:185`), verbatim

> **DA1.1 Employers round.** Analyst prepares the round from the employer worksheet (46 rows already decided; the survivor choices in plan §8 item 2 and every `(not in OA Universe)` row still open); Fable planner and implementer at `max` for the merge and coverage scripts (legal-entity rule per §3.1: merge lineage-A workgroup rows into the legal employer and write `agreement_worksites` and `agreement_scopes` for each moved agreement; restore the Monadelphous and Programmed subsidiaries as children; the D12 merges of 827 → 33, 798 → 28, 699 and 745 → 705 and the `MMA` alias deletion; `organisation_kind` and `is_agreement_entity`; new rows for the missing marine contractors); Sonnet verifier with per-campaign checksums; Fable reviewer. Run in at most three production rounds (operators, contractors, the long tail) so each run sheet stays reviewable. Depends on DA0.3 (aliases must be read before merges create them) and on the refreshed clone.

### 1.3 Decisions and rules consumed

- **§3.1 legal-entity rule** (plan:247–251): an employer row is a legal entity; a lineage-A workgroup row that is not a legal entity merges into the legal employer, its name kept as an alias, and its facility and scope move onto the agreement (`agreement_worksites`, `agreement_scopes`). `organisation_kind` vocabulary: `operator_tier1`, `operator_tier2`, `facility_operator`, `prime_contractor`, `contractor`, `crew_provider`, `labour_hire`, `union_staff`, `out_of_universe`, `placeholder`.
- **D2** (Q-S1) lineage-A workgroups merge into the legal employer; **D3** (Q-S2) restore Monadelphous ×4 and Programmed ×4 as `is_agreement_entity` children, others case by case; **D11** (Q-S8) Wandoo and Qube in, Alkimos out, other out-of-sector rows determined by an admin row by row; **D12** 827 → 33, 798 → 28, 699 and 745 → 705, delete the `MMA` → Monadelphous alias.
- **Plan §7** (plan:466, 474): a merge re-keys any campaign universe keyed on a victim; the AND rule with the campaign's worksites keeps membership unchanged where the facility is in the universe; a worksite-less campaign gets its facility before the merge.
- **Plan §8 item 2** (plan:483): the survivor choices still open (S1–S9 below).
- **Q-S3**: placeholders retire in DA4.3 (null employer with a `placement_status` reason).

## 2. The worksheet: columns and how the proposal columns are written

Header of `employers_adjudication_2026-09-22.csv` (and, unchanged, of the 24 Sep copy):

`employer_id, employer_name, employer_category, parent_employer_id, created, active_workers, worksite_roles, agreements, aliases, lineage, oa_universe_entity, proposed_canonical, proposed_relationship, proposed_action, open_question, decision, decided_by, decided_on`

| Group | Columns | In the 24 Sep copy |
|---|---|---|
| Evidence (measured) | `employer_id` … `lineage`, `oa_universe_entity` | `active_workers`, `worksite_roles`, `agreements`, `aliases` re-measured on production 24 Sep (only change: 741 AWU WA Branch 3 → 4 active workers, worker 1536 re-pointed by DA0.2 per D16). Names, category, parent, created, lineage and `oa_universe_entity` copied as they were. |
| **Proposal (analyst's)** | `proposed_canonical`, `proposed_relationship`, `proposed_action`, `open_question` | Refreshed for all 179 remaining rows. |
| **Decision (operator's)** | `decision`, `decided_by`, `decided_on` | Copied byte for byte (46 decided rows; verified by script). Never written by the analyst. |

Encoding, because the column set is fixed:

- `proposed_canonical` — `<surviving id> <legal name>` (for a victim, the survivor it merges into).
- `proposed_relationship` — one of `keep` · `same_entity → merge into <id>` · `workgroup → merge into legal employer <id> + coverage onto agreement` · `subsidiary → child of <id>` · `out_of_universe` · `not_an_employer → retire in DA4.3` · `removed by DA0.2 (on production 2026-09-24)` (synthetic rows 787–794).
- `proposed_action` — `kind=<organisation_kind>; agreement_entity=<true|false>; legal_name=…; abn=… (source=abr, 2026-09-24); aliases+=[…]; <merge pre-steps, coverage rows, campaign effect>; round=R1|R2|R3`.
- `open_question` — the Q-E id where one exists, and the session question number (S1…S30) from §12.

Four rows carry a proposal that **differs from their recorded decision** because the re-measure or the ABR found something the 22 Sep worksheet did not: 57 (decided child of 28 → ABR says it is the same legal entity as 28), 18 (decided merge into 710 → ABR says it is a legal entity), 798 and 827 (D12 says merge → both are, or were, distinct legal entities holding their own agreement, and 798's merge widens campaign 64). Each is a session question (S11, S14, S12); **the recorded decision stands unless the operator reopens it.**

### 2.1 Proposal counts (179 remaining rows)

| Proposed relationship | Rows | Ids |
|---|---:|---|
| `workgroup → merge into legal employer + coverage` (D2) | 10 | 2, 3, 4 → 691 · 5 → 690 · 10 → 688 · 6, 7 → 693 · 12, 14 → 13 · 52 → 723 |
| `same_entity → merge` | 14 | 689 → 13 · 695 → 693 · 703 → 93 · 699, 745 → 705 · 826 → 33 · 57 → 28 · 47 → 717 · 831 → 799 · 736 → 73 · 779 → 733 · 749 → 97 · 816 → 815 · 755 → 35 |
| `subsidiary → child of` | 11 | 9 → 692 · 27 → 26 · 18 → 710 · 798 → 28 · 827 → 33 · 71 → 73 · 72 → 702 · 75 → new Transocean root · 780 → 29 · 720 → 733 · 17 → 706 |
| `keep` | 131 | survivors and roots (renamed to the legal name where the ABR confirms it), contractors, crew providers, labour hire, the in-universe long tail, union rows |
| `out_of_universe` | 11 | decided: 762, 772 (not an employer), 784, 785, 786 · proposed: 714, 751, 752, 773, 782, 829 |
| `not_an_employer → retire in DA4.3` | 2 | 800 Unknown, 813 Unemployed |
| **New rows** (§8) | 18 firm + 5 conditional | 11 from the §5 row + Technip Energies + 6 D3 children; conditional: Rigforce Contracting (if 798 merges), Eris Projects, McDermott Crewing, Tidewater Marine Australia, DEME |

If the operator keeps the recorded decisions for 18, 798 and 827 and rejects the 57 reopen, the counts become: merge 16 (+798, +827), workgroup merge 11 (+18), child 9 (−18, −798, −827, +57).

`organisation_kind` proposed across the 179: operator_tier1 4 (13, 691, 690, 688) · operator_tier2 7 (692, 9, 693, 93, 1, 694, 719) · facility_operator 4 (15, 737, 11, 706) · prime_contractor 6 (68, 40, 726, 778, 700, 801) · crew_provider 7 (19, 28, 37, 43, 46, 48, 765) · labour_hire 5 (746, 753, 781, 770, 98) · union_staff 2 (741, 795) · placeholder 2 (800, 813) · out_of_universe 11 · contractor the rest; victims take the survivor's kind.

## 3. Re-measured evidence (production, 2026-09-24, read-only)

Headline (one `SELECT`): employers **179** (synthetic 787–794: 0 left), active workers **5,085**, campaigns **22**, agreements 136, `agreement_worksites` 54, `agreement_scopes` **0**, `employer_name_aliases` 39, `name_match_reviews` 0, alias CHECK `source IN ('merge','manual','import','oa_universe','fwc')`. Phase 0 is reproduced.

### 3.1 `01_profile_employers.sql` — one row per employer

Run statement for statement, adding `campaign_universes` (rows in `campaign_employers`) and all-status worker counts. The per-row values are in the worksheet's evidence columns; against the 22 Sep worksheet the only change among the 179 is **741** (3 → 4 active workers, D16). Rows with a campaign universe: 7 (1), 19 (1), 26 (3), 28 (3), 33 (3), 37, 38, 39 (2), 40 (2), 41, 43, 46, 48, 58, 68, 83 (2), 84 (2), 702, 705, 710, 711 (2), 713, 716, 717, 721, 728, 741, 767, 795, 797, 798, 799, 800, 801, 813.

Aliases (39 rows, all `source = merge`, all 31 Mar 2026): 6 JADESTONE ENERGRY MONTARA VENTURE · 17 DBP/APA · 19 ERIS, KUIPER AUSTRALIA PTYLTD, KUIPER AUSTRALIA PTYLTD -, KUIPER ENERGY, KUIPER ENERGY SOLUTIONS PTY LTD · 21 LEGENEERING SERVICES PTY LTD · 26 M MAINTENANCE SERVICES PTY LTD, M&ISS PTY LTD, MEA, MEA PTY LTD, **MMA**, Monadelphous · 28 PROGRAMMED MARINE PTY LTD, PROGRAMMED OFFSHORE PTY LTD, RFM OFFSHORE PTY LTD, RFM OS PTY LTD, RIGFORCE, RIGFORCE CONTRACTING PTY LTD · 29 R.E.C., RIDGEBAY HOLDINGS KARRATHA, RIDGEBAY HOLDINGS PTY LTD, SPECIALIST PEOPLE, SPECIALIST PEOPLE – · 33 IAS GROUP, UGL OPERATIONS AND · 37 AOS CONTRACT DREDGING, AOS PTY LTD, AUSTRALIAN OFFSHORE SOLUTIONS (AOS) PTY LTD · 39 DOF SUBSEA AUSTRALIA PTY LTD · 40 FUGRO AUSTRALIA MARINE PTY LTD · 43 OSM · 54 PHI INTERNATIONAL AUSTRALIA KIMBERLEY ENGINEERING AND RAMP STAFF, PHI INTERNATIONAL AUSTRALIA PTY LTD · 58 COMPASS GROUP - ESS · 68 MCDERMOTT AUSTRALIA (CREWING SERVICES) PTY LTD · 78 APPLUS+ PLY LTD · 93 MODEC MANAGEMENT SERVICES PTE.

`employer_merge_events`: 23 rows, all 31 Mar 2026, `workers_updated` 0 on every row (unchanged). Two findings the 22 Sep worksheet did not record:

- **Aliases lost by the merge function.** Merges 3 and 4 wrote `COMPASS GROUP ESS` and `COMPASS GROUP-` onto employer 59; merge 23 then merged 59 into 58 and the two aliases were deleted with 59 (`employer_name_aliases.employer_id` is `ON DELETE CASCADE`, baseline:24096, and `merge_employers` does not carry a victim's existing aliases). Survivor names that were later renamed were never kept either: `KUIPER AUSTRALIA PTY LTD` (19, canonical at merges 10 and 12), `REC – ALTRAD` (29, merges 18–19), `PHI INTERNATIONAL AUSTRALIA GASCOYNE ENGINEERING AND RAMP STAFF` (54, merge 17). Row 19 carries its own name `ERIS` as an alias. Proposal: restore the five strings (S28).
- `IAS GROUP` → 33 and `RIGFORCE`, `RIGFORCE CONTRACTING PTY LTD` → 28 are the aliases the September sync and June import did not read (D12); the four mobilisation watch-contractor strings `Subsea 7`, `Shelf Subsea`, `Sapura`, `Technip` are still absent (DA0.5 finding).

### 3.2 `05_candidate_clusters.sql` — employer clusters (pasted raw)

```
key | n | members
chevron   | 4 | 2:CHEVRON GORGON OPERATIONS || 3:CHEVRON WHEATSTONE DOWNSTREAM OPERATIONS || 4:CHEVRON WHEATSTONE PLATFORM || 691:Chevron
jadestone | 4 | 6:JADESTONE ENERGY MONTARA VENTURE || 7:JADESTONE ENERGY STAG CPF || 693:Jadestone || 695:JADESTONE ENERGY 
woodside  | 4 | 12:WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO || 13:WOODSIDE ENERGY LTD || 14:WOODSIDE ENERGY MACEDON GAS PLANT || 689:Woodside
atc       | 2 | 815:ATC Offshore || 816:ATC
auriga    | 2 | 52:AURIGA AVIATION HELICOPTER ENGINEERS || 723:Auriga Aviation
downer    | 2 | 18:DOWNER EDI ENGINEERING ELECTRICAL LNG FACILITY SERVICES || 710:Downer EDI Group
inpex     | 2 | 5:INPEX - ICHTHYS OPERATIONS || 690:Inpex
modec     | 2 | 93:MODEC Management Services || 703:Modec
noble     | 2 | 73:NOBLE || 736:Noble Corporation
saipem    | 2 | 726:Saipem || 778:Saipem Leighton Consortium
santos    | 2 | 9:SANTOS WA ENERGY LIMITED VARANUS ISLAND HUB || 692:Santos
shell     | 2 | 10:SHELL PRELUDE || 688:Shell
solstad   | 2 | 47:SOLSTAD AUSTRALIA PTY LTD || 717:Solstad Offshore ASA
toll      | 2 | 713:Toll Energy || 782:Toll West
trace     | 2 | 97:TRACE || 749:Trace JV
ugl       | 2 | 33:UGL RESOURCES (CONTRACTING) PTY LTD || 826:ugl
```

Exact duplicates after case and space folding (employers): **0 rows**. The `test` cluster is gone (DA0.2).

Disposition per cluster (the acceptance criterion is "0 clusters without a recorded decision"):

| Cluster | Recorded decision (22 Sep) | Still needed |
|---|---|---|
| chevron | 2, 3, 4 → 691 (D2) | none |
| jadestone | 6, 7 → surviving Jadestone | survivor 693 vs 695 (S2) |
| woodside | 12, 14 → surviving Woodside | survivor 13 vs 689 (S1) |
| atc | — | 816 → 815 (S19) |
| auriga | 52 → 723 (D2) | none |
| downer | 18 → 710 (D2) | reopen? (S14) |
| inpex | 5 → 690 (D2) | none |
| modec | one row | survivor 93 vs 703 (S3) |
| noble | — | 736 → 73, 71 child (S21) |
| saipem | — | 778 separate JV (S27) |
| santos | 9 child of 692 | none |
| shell | 10 → 688 (D2) | none |
| solstad | — | survivor 47 vs 717 (S4) |
| toll | — | 782 (S25) |
| trace | — | 749 → 97 (S19) |
| ugl | 826 → 33 (D12) | timing (S13) |

Duplicates the first-token heuristic cannot see (so `05` will show 0 clusters for them even though they are open): 699 / 745 / 705 (MMA / Mermaid / Cyan), 798 / 28 (Rigforce), 827 / 33 (IAS), 831 / 799 (Siem / Sea1), 779 / 733 (SLB / Schlumberger), 57 / 28 (Atlas Programmed Marine), 814 / 17 (APA / DBNGP), 755 / 35 (Broadspectrum / Ventia), 720 / 733 (Cameron / SLB), 88 / 704 (ISOLOGICS / KAEFER), 66 (DURATEC / WPF Duratec).

### 3.3 `06_oa_universe_crossmatch.sql` — company cross-match (pasted raw, category column omitted)

```
company | db_employers
Allseas | — NO MATCH —
Altrad | 29:ALTRAD
Altrad Sparrows | 780:Sparrows Group
AOS | 37:AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD
Applus+ | 78:APPLUS+ PTY LTD
Atlas Professionals | 57:ATLAS PROGRAMMED MARINE (AUSTRALIA) PTY LTD
Auriga Aviation | 52:AURIGA AVIATION HELICOPTER ENGINEERS | 723:Auriga Aviation
Baker Hughes | 70:BAKER HUGHES SERVICES AUSTRALIA PTY LTD
Bechtel | 700:Bechtel Australia
Bhagwan Marine | 38:BHAGWAN MARINE LTD
Boskalis | — NO MATCH —
BW Offshore | 1:BW
C2O | — NO MATCH —
CHC | 53:CHC HELICOPTER (AUSTRALIA) AIRCRAFT ENGINEERS
Chevron | 2:CHEVRON GORGON OPERATIONS | 3:CHEVRON WHEATSTONE DOWNSTREAM OPERATIONS | 4:CHEVRON WHEATSTONE PLATFORM | 691:Chevron
Cleanaway | 709:Cleanaway Waste Management
Condex | — NO MATCH —
Cyan Renewables | 705:Cyan Renewables
DeepOcean / Shelf Subsea | — NO MATCH —
Diamond Offshore | 71:DIAMOND | 748:Steel Diamond
DOF | 39:DOF MANAGEMENT AUSTRALIA PTY LTD
Downer | 18:DOWNER EDI ENGINEERING ELECTRICAL LNG FACILITY SERVICES | 710:Downer EDI Group
EnerMech | 712:EnerMech
Ensco | 72:ENSCO AUSTRALIA PTY LIMITED
Entier | 62:ENTIER AUSTRALIA PTY LTD
Eris | 19:ERIS
Ertech | 698:Vertech | 701:Powertech Pty Ltd
ESS / Compass | 58:COMPASS GROUP –
Esso/ExxonMobil | — NO MATCH —
Fugro | 40:FUGRO AUSTRALIA PTY LTD
GGC | — NO MATCH —
Go Offshore | 797:GO OFFSHORE
GR Production Services | 765:GR Production Services
Heerema | — NO MATCH —
Helix | 721:Helix Robotic Solutions
IAS | 827:IAS Group
Inpex | 5:INPEX - ICHTHYS OPERATIONS | 690:Inpex
Isologics | 88:ISOLOGICS
Jadestone | 6:JADESTONE ENERGY MONTARA VENTURE | 7:JADESTONE ENERGY STAG CPF | 693:Jadestone | 695:JADESTONE ENERGY 
Kaefer | 704:Kaefer Integrated Services Pty Ltd
KBSS | 725:KBSS Engineering
Kuiper | — NO MATCH —
Legeneering | 21:LEGENEERING (AUST.) PTY LTD
LifeFlight | 730:LifeFlight
McDermott | 68:MCDERMOTT AUSTRALIA PTY LTD
MMA Offshore | 699:MMA
MODEC | 93:MODEC Management Services | 703:Modec
Monadelphous | 26:MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD
MWOG | 27:MWOG PTY LTD
NES Fircroft | 746:NES Fircroft
Noble | 73:NOBLE | 736:Noble Corporation
Oceaneering | 83:OCEANEERING AUSTRALIA PTY LTD
OSA | 707:Offshore Services Australasia
OSM | 43:OSM Australia Pty Ltd
Parabellum | 711:Parabellum International
Petrofac | 737:Petrofac
PHI | 54:PHI INTERNATIONAL AUSTRALIA 
Powertech | 701:Powertech Pty Ltd
Programmed | 28:PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | 57:ATLAS PROGRAMMED MARINE (AUSTRALIA) PTY LTD
Reach Subsea | 716:Reach Subsea
Saipem | 726:Saipem | 778:Saipem Leighton Consortium
Santos | 9:SANTOS WA ENERGY LIMITED VARANUS ISLAND HUB | 692:Santos
Sapura | — NO MATCH —
Sea1 | 799:Sea1 Offshore
Sedco Forex | 75:SEDCO FOREX INTERNATIONAL INC
SGS | 65:SGS PRELUDE CHEMISTS
Shell | 10:SHELL PRELUDE | 688:Shell
Siem | 831:Siem Offshore
Siera | 46:SIERA MARINE MANAGEMENT PTY LTD
Sodexo | 64:SODEXO REMOTE SITE
Solstad | 47:SOLSTAD AUSTRALIA PTY LTD | 717:Solstad Offshore ASA
Subsea7 | 716:Reach Subsea
Technip | 728:Technip
Tidewater | 48:TIDEWATER SHIP MANAGEMENT (AUSTRALIA) PTY LTD
TMT | 84:TOTAL MARINE TECHNOLOGY PTY LTD
Transocean | — NO MATCH —
UGL | 33:UGL RESOURCES (CONTRACTING) PTY LTD | 826:ugl
UPS | 11:UPSTREAM PRODUCTION SOLUTIONS PTY LTD
Valaris | 702:Valaris Marine
Van Oord | — NO MATCH —
Vantris / Sapura | — NO MATCH —
Ventia | 35:VENTIA AUSTRALIA PTY LTD
Vermilion | 694:Vermilion
Vertech | 698:Vertech
Weststar | — NO MATCH —
Wood | 12:WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO | 13:WOODSIDE ENERGY LTD | 14:WOODSIDE ENERGY MACEDON GAS PLANT | 34:WOOD | 689:Woodside
Woodside | 12:WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO | 13:WOODSIDE ENERGY LTD | 14:WOODSIDE ENERGY MACEDON GAS PLANT | 689:Woodside
WPF Duratec | 66:DURATEC
```

Reading: 11 NO MATCH are the §5 row's missing roots (Allseas, Boskalis, Condex, DeepOcean / Shelf Subsea, GGC, Heerema, Sapura / Vantris, Transocean, Van Oord, Weststar) plus C2O and Esso (not on the §5 list; Esso's Bass Strait is Woodside-operated since 1 Jul 2026). **Subsea7 → 716 Reach Subsea is a false positive** (pattern `%subsea%`): Subsea7 has no row. `Kuiper` misses because the Kuiper names are aliases on 19. `Wood` → Woodside rows and `Diamond` → 748 Steel Diamond and `Ertech` → Vertech / Powertech are pattern artefacts.

### 3.4 Campaign universes keyed on employers (22 campaigns; names and counts only)

| Campaign | Status | Sector-wide | `campaign_employers` | `campaign_worksites` | Members |
|---|---|---|---|---|---:|
| 21 Toll Energy | active | no | 713 | 1 Gorgon LNG | 67 |
| 23 Mono's Inpex Coordinators and Supervisors | active | no | 26 | 140 Darwin ILNG, 146 Explorer CPF, 160 Inpex Venturer FPSO | 48 |
| 26 Decom sector | active | **yes (OR)** | 19, 68 | 150 DLV2000, 166 MMA Pinnacle, 195 Not Currently Deployed, 201 Sapura Constructor | 216 |
| 27 Mono's Woodside | active | no | 26 | 136 Karratha Gas Plant, 137 Pluto LNG, 200 KBSB | 382 |
| 41 ESS Woodside | active | no | 58 | 137 Pluto LNG, 143 Goodwyn, 144 Rankin North, 145 Scarborough FPU | 61 |
| 42 EDI Downer Chevron | active | no | 710 | 1 Gorgon LNG, 139 Wheatstone LNG | 144 |
| 47 UGL Varanus | active | no | 33 | 14 Varanus Island | 223 |
| 48 UGL WA Oil | active | no | 33 | **none** | 219 |
| 49 OA Membership Outreach | active | no | none | none | 0 |
| 50 Offshore Alliance internal | active | yes (sector row) | 741, 795 | sector-wide | 11 |
| 55 AOS catering | active | no | none | none | 11 |
| 57 Deck officer and Engineers 2026 | active | no | 28, 37, 38, 39, 41, 43, 46, 48, 702, 705, 717, 767, 797, **798**, 799, 800, 801, 813 | 85 worksites (vessels, rigs, NWS, Prelude, Crux, Wheatstone Platform, Darwin ILNG, WA/NT Offshore (General), …) | 639 |
| 58 Jadestone Stag | active | no | **7** | 16 Stag CPF | 28 |
| 59 Mono's Shell Crux | active | no | 26 | 6 Crux Gas Field | 196 |
| 60 UGL CO2 | active | no | 33 | 421 Barrow Island CO2 | 224 |
| 61 Fugro | active | no | 40 | 221 Fugro Etive, 422 Fugro Workshop, 423 Fugro unmanned remote | 52 |
| 62 programmed ROV | active | no | 28 | 155 Transocean Endurance, 177 Subsea 7 Pegasus, 415 Seven Sisters | 64 |
| 64 ROV sector wide | active | **no (AND, employers only)** | 28, 39, 40, 83, 84, 716, 721, 728 | **none** | 363 |
| 65 Parrabellum | planning | no | 711 | 139 Wheatstone LNG, 421 Barrow Island CO2 | 15 |
| 66 Parabellum Barrow | planning | no | 711 | 1 Gorgon LNG | 14 |
| 68 Oceaneering EB A | active | no | 83 | none | 39 |
| 69 TMT Bargaining 2026 | active | no | 84 | none | 56 |

Membership counts are `campaign_worker_membership` rows (sync-on-open; they can lag the AND rule — e.g. campaign 58 has 28 members while 3 active workers of employer 7 sit at Stag CPF and 22 have no worksite).

### 3.5 What else points at a merge victim (side tables `merge_employers` does not handle)

| Victim | Table (FK behaviour) | Rows | Consequence without a pre-step |
|---|---|---:|---|
| 689 Woodside | `programs.principal_employer_id` (no action, baseline:24496) | 2 | **merge fails** (FK violation at `DELETE FROM employers`, baseline:4367) |
| 689 Woodside | `upcoming_project_employers.employer_id` (SET NULL, baseline:25056) | 10 | NOPSEMA project links silently lost |
| 5 INPEX workgroup | `upcoming_project_employers` | 2 | lost |
| 10 SHELL PRELUDE | `upcoming_project_employers` / `mobilisation_signals` / `mobilisation_alerts` (SET NULL) | 1 / 2 / 2 | lost |
| 2 CHEVRON GORGON | `mobilisation_signals` / `mobilisation_alerts` | 1 / 1 | lost |
| 93 MODEC (only if it were the victim) | `mobilisation_signals` / `mobilisation_alerts` | 1 / 1 | lost — one reason 93 is the proposed survivor |
| 798 Rigforce (only if merged) | `campaign_employers` (57, 798) with (57, 28) present — UNIQUE (campaign_id, employer_id), baseline:18997; the function updates without dedupe (baseline:4216) | 1 | **merge fails** |
| 798 Rigforce (only if merged) | `campaign_organising_units.unit_basis->employer_id` | 7 (campaign 57) | units keep a dead employer id; 4 collide with 28's units on the same worksite key: (28,155), (28,158), (28,413), (28,no worksite) |
| 717 Solstad (only if victim) | `unit_basis` | 7 (campaign 57) | dead ids (no collision) — why 717 is the proposed survivor |
| 6 Jadestone Montara | `employer_name_aliases` (CASCADE) | 1 | alias `JADESTONE ENERGRY MONTARA VENTURE` lost |
| 17 DBNGP (only if victim) | `employer_name_aliases` | 1 | alias lost |
| every victim | `name_match_reviews.resolved_employer_id` (SET NULL, DA0.3) | 0 today | re-check at run time: the weekly batch may create review rows before the round runs |

`worksite_contracts`, `worker_*_options`, `documents`, `project_employers`, `employer_tags`, `employer_sectors` hold 0 rows for every victim today. `worksite_scopes` rows exist only on 26 (4), 29 (1), 78 (2), 698 (2), 713 (1) — none is a proposed victim — so the DA1.3 finding (the function dedupes `worksite_scopes` by employer and worksite only, `PROGRESS.md` incidental findings) does not bite in this round; the ledger's DA2.1 finding on the same function (programs 3 rows, vessels, watch contractors, upcoming projects) agrees with this table.

## 4. What `merge_employers` does (baseline `20260908050000_baseline_schema.sql:3981–4394`)

The API route `apps/organising-db/src/app/api/employers/merge/route.ts:53` is a thin wrapper over the RPC. The function:

- validates survivor and victims and refuses a victim on the survivor's parent chain (ancestor guard, :4052); optional `expected_survivor_updated_at` stale check;
- re-points: a survivor parent that is a victim (:4135), other employers' `parent_employer_id`, `worksites.operator_id` and `principal_employer_id` (:4151, :4156), `agreements.employer_id` (:4161), `workers.employer_id` (:4167), `documents`, `worksite_scopes`, `employer_scopes`, `agreement_employers`, `employer_worksite_roles` (after deleting victim roles that would collide on (employer, worksite, role_type), :4200), `employer_sectors`, `employer_tags`, `project_employers`, `campaign_employers` (:4216), then de-duplicates several of these on the survivor;
- fills the survivor's null scalars (trading name, ABN, category, parent_company, contact fields) from the victims in ascending id (:4320); renames the survivor to `canonical_employer_name` when given;
- writes aliases with `source = 'merge'` (:4358): the explicit `alias_names` list if one is passed, otherwise every merged row's name and trading name that differs from the canonical — **including the survivor's old name when it is renamed** — plus `extra_aliases`; duplicates on (employer, lower(trim(alias))) are skipped;
- deletes the victims (:4367) and writes `employer_merge_events(survivor, victims, performed_by, payload{canonical_employer_name, alias_names, workers_updated})` (:4369). The RPC also returns `agreement_rows_updated` and `aliases_inserted`, but the audit row does not keep them.

It does **not**: re-point `programs.principal_employer_id` (FK without action → the merge fails), `upcoming_project_employers`, the mobilisation tables, `name_match_reviews`, `worker_*_options` (SET NULL → silently lost), `worksite_contracts` (no action → fails; 0 rows today); carry a victim's **own aliases** (cascade-deleted); de-duplicate `campaign_employers` (a campaign naming both survivor and victim fails the merge); rewrite `campaign_organising_units.unit_basis`; touch `campaign_worker_membership` (membership is re-derived by the universe sync on open); write `agreement_worksites` / `agreement_scopes`; know `organisation_kind` or `is_agreement_entity` (DA2.1 columns). Each DA1.1 merge script therefore needs, in the same transaction: the pre-steps of §3.5, an explicit `alias_names` list (victim names + victim aliases + the survivor's old name), the coverage rows (D2), the `unit_basis` rewrite (WP2.1 C1/F1 approach), and a per-campaign membership checksum before and after.

## 5. Merge and coverage plan per row

Columns: survivor ← victims · what moves (active workers / agreements / roles / worksite refs / campaign universes / OUs) · aliases written (survivor gets them) · coverage rows (D2) · campaign-universe effect (AND rule).

Scopes use the DA1.3 codes (`wp/da1.3.md` §2.3 (c)); `production_operations` exists only if the operator answers DA1.3 Q1 (a) — otherwise the operators' EAs take `maintenance_brownfield` via leaf 4 Operations. `agreement_scopes` has no provenance columns; `agreement_worksites` rows written here take `mapping_confidence` (H where the row exists today or the EA title names the facility, M where the evidence is worker placement) and, once DA2.1 lands, `source = worksheet` with the decision date. Every coverage row is superseded by the FWC read in DA6.1 where they differ (queued, never overwritten).

### 5.1 Round R1 — operators (D2 workgroups and the operator roots)

| # | Survivor ← victims | Moves | Aliases written | Coverage (agreement → worksite; scope) | Campaign effect |
|---|---|---|---|---|---|
| M1 | **691** Chevron Australia Pty Ltd ← 2, 3, 4 | 405 workers (224 + 148 + 33); EAs 2, 3, 4; 7 roles; 4 worksite `operator_id` (from 2); pre-step: 1 `mobilisation_signals` + 1 `mobilisation_alerts` (2 → 691) | CHEVRON GORGON OPERATIONS; CHEVRON WHEATSTONE DOWNSTREAM OPERATIONS; CHEVRON WHEATSTONE PLATFORM; Chevron (old name) | EA 2 → 1 Gorgon LNG (exists); EA 3 → 2 Wheatstone LNG (Downstream) (exists) **+ 139 Wheatstone LNG** (36 of the 148 workers are placed there; DA1.2 merges the pair); EA 4 → 3 Wheatstone Platform (exists); scope `production_operations` on EAs 2, 3, 4 | none keyed on 2/3/4 or 691 → **none** |
| M2 | **690** INPEX Operations Australia Pty Ltd ← 5 | 215 workers; EA 5; 2 roles; 2 worksite `operator_id`; pre-step 2 `upcoming_project_employers` | INPEX - ICHTHYS OPERATIONS; Inpex | EA 5 → 7 Ichthys LNG (exists) **+ 146 Explorer CPF + 160 Inpex Venturer FPSO** (105 + 70 workers placed there; DA1.2 settles the Ichthys family, S30); scope `production_operations` | **none** |
| M3 | **688** Shell Australia Pty Ltd ← 10 | 210 workers; EA 10; 2 roles; 2 worksite `operator_id`; pre-step 1 upcoming-project, 2 signals, 2 alerts | SHELL PRELUDE; Shell | EA 10 → 5 Prelude FLNG (exists); scope `production_operations` | **none** |
| M4 | **13** Woodside Energy Ltd. ← 689, 12, 14 | 0 workers from victims (13 keeps its 217); EAs 12, 14; 6 roles; 13 worksites `principal_employer_id` (689) + 5 `operator_id` (12); pre-step: **2 `programs` (689 → 13, else the merge fails)** and 10 `upcoming_project_employers` | Woodside; WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO; WOODSIDE ENERGY MACEDON GAS PLANT; WOODSIDE ENERGY LTD (old name) | EA 12 → 11 Ngujima-Yin FPSO + 12 Okha FPSO (exist); EA 14 → 10 Macedon Gas Plant (exists); EA 13 (13's own NWS platforms EA) → 9, 143, 144 (exist); scope `production_operations` on 12, 13, 14 | **none** |
| M5 | **693** Jadestone Energy (Australia) Pty Ltd ← 695, 6, 7 | 65 workers (39 + 26); EAs 6, 121, 7; 3 roles; 2 worksite `operator_id` (6); pre-step: re-point alias JADESTONE ENERGRY MONTARA VENTURE (6 → 693) | JADESTONE ENERGY; JADESTONE ENERGY MONTARA VENTURE; JADESTONE ENERGRY MONTARA VENTURE; JADESTONE ENERGY STAG CPF; Jadestone | EA 6 → 15 Montara Venture FPSO (exists); **EA 121 → 15 (new row)**; EA 7 → 16 Stag CPF (exists); scope `production_operations` | **58 Jadestone Stag re-keyed 7 → 693.** AND with 16 Stag CPF; victim workers at Stag CPF from 6 / 693 / 695: **0** → membership unchanged (28). No worksite to add. |
| M6 | **93** MODEC Management Services Pte. Ltd. ← 703 | 25 workers (20 Pyrenees Venture FPSO, 5 Montara Venture FPSO) | Modec; MODEC Management Services (old name) | none (93's EAs 8 → 18 Pyrenees Venture exists; 128, 129 expired: add 18 at M) | **none** |
| — | 9 Santos WA Energy Limited (child of 692, no merge) | rename only | SANTOS WA ENERGY LIMITED VARANUS ISLAND HUB | EA 9 → 14 Varanus Island (exists); scope `production_operations` | none |
| — | Roots renamed to legal names (no merge): 692 Santos Limited, 1 BW Offshore, 694 Vermilion, 15 Teekay, 719 Mitsui E&P | — | old names | — | none |

### 5.2 Round R2 — contractors (D12, D3, the renames and the marine roots)

| # | Survivor ← victims | Moves | Aliases written / deleted | Coverage | Campaign effect |
|---|---|---|---|---|---|
| M7 | **705** Cyan Vessel Operations Pty Ltd ← 699, 745 (D12) | 2 workers; EAs 43, 53; 2 roles; 1 worksite principal; **pre-step: DELETE alias `MMA` → 26** | MMA; Mermaid Marine; MMA Offshore; MMA Offshore Vessel Operations Pty Ltd; Cyan Renewables (old name) | none (vessel EAs; FWC in DA6.1) | 57 names 705 already; 699's worker has no worksite (0 added); **745's worker is on 175 MMA Inscription (in 57's worksite list) → 57 +1**. Predicted, not a stop condition if accepted (S15). |
| M8 | **33** UGL Resources (Contracting) Pty Ltd ← 826 (D12) | 6 workers, all on 15 Montara Venture FPSO | ugl | none | 47 Varanus (14) +0; 60 CO2 (421) +0; **48 UGL WA Oil has no worksite → +6.** The facility the plan wants added (Barrow Island oil / WA Oil) does not exist as a worksite (DA1.2 missing asset), and adding any worksite to 48 drops its 211 UGL members who have none. S13. |
| M9 | 33 ← 827 (**only under D12 as written**, S12 a) | 5 workers, all on 18 Pyrenees Venture FPSO; EA 119 already on 33 | IAS Group | none | 48 **+5** more. Option b (child) → 0. |
| M10 | 28 ← 798 (**only under D12 as written**, S12 a) | 15 workers, 5 roles, 7 OUs; **pre-step: delete `campaign_employers` (57, 798)**; unit_basis rewrite with 4 collisions in 57 | Rigforce Pty Ltd | none | 57: both keyed → membership unchanged; 62: 1 matching worker already a member → unchanged; **64 ROV sector wide (employers-only AND) +15 active / +18 all** Rigforce drilling workers (Noble Deliverer 5, Maersk Deliverer 5, Transocean 2, …). 64 has no worksite to restrict it. Option b (child) → 0 everywhere. |
| M11 | **28** Programmed Offshore (Australia) Pty Ltd ← 57 (ABR same entity, S11) | 0 workers; EAs 64, 84, 112, 113 | ATLAS PROGRAMMED MARINE (AUSTRALIA) PTY LTD; Atlas Professionals | none | none |
| M12 | **717** Solstad Australia Pty Ltd ← 47 (S4) | 0 workers; EAs 48, 58 | Solstad Offshore ASA (717's old name; foreign parent) | none | 57 keyed on 717 → unchanged (id survives; 7 OUs untouched). If 47 survives instead: re-key (57, 717 → 47), rewrite 7 OUs, membership still unchanged. |
| M13 | **799** Sea1 Offshore Australia Pty Ltd ← 831 | 1 worker on 212 Siem symphony | Siem Offshore; Siem Offshore Australia Pty Ltd | none | **57 +1** (212 is in 57's list; 831 is not keyed). S16. |
| M14 | **73** Noble Corporation plc ← 736 | 1 worker (Noble Deliverer) | Noble Corporation | none | none (73 not keyed) |
| M15 | **733** SLB ← 779 | 0 active (1 inactive) worker | SLB | none | none |
| M16 | **723** Auriga Aviation Pty Ltd ← 52 (D2) | EA 59 | AURIGA AVIATION HELICOPTER ENGINEERS | EA 59 → no worksite known (DA6.1); scope `helicopters` (helicopter engineers) | none |
| M17 | 710 ← 18 (**only if the D2 decision stands**, S14) | 2 workers (Gorgon LNG); EA 18 | DOWNER EDI ENGINEERING ELECTRICAL LNG FACILITY SERVICES | EA 18 → **1 Gorgon LNG (new, M)**; scope `maintenance_brownfield` (electrical — LNG facility services) | 42 keyed on 710: the 2 workers are already members → unchanged |
| — | Renames carrying D2 scope, no merge: **53** CHC Helicopter Australia Pty Ltd (EA 60 → scope `helicopters`, aircraft engineers; coverage via DA6.1); **65** SGS Australia Pty Ltd (EA 77 → 5 Prelude FLNG exists; scope `other`, chemists); **18** under S14 b (EA 18 as above) | — | old names | as stated | none |

### 5.3 Round R3 — long tail

| # | Survivor ← victims | Moves | Aliases | Campaign effect |
|---|---|---|---|---|
| M18 | 97 Trace Offshore ← 749 | 1 worker (Inpex Endeavour CPF) | Trace JV | none |
| M19 | 815 ATC Offshore ← 816 | 0 workers | ATC | none |
| M20 | 35 Ventia Australia Pty Ltd ← 755 (S19) | 1 worker (Prelude FLNG) | Broadspectrum Ltd/Transfield; Broadspectrum; Transfield Services | none |
| M21 | 33 ← 826 if deferred from R2 (S13) | as M8 | as M8 | as M8 |

### 5.4 D3 — agreement-holding subsidiaries restored as children

Workers stay on the root in DA1.1 (attribution is S10); only agreements, aliases and parent links move, so campaigns 23, 27, 59 (keyed on 26) and 57, 62, 64 (keyed on 28) are unchanged.

**Monadelphous** (26 renamed Monadelphous Group Limited, ABN 28 008 988 547; its current name and ABN go to the new MEA child):

| Child | ABN (abr) | Agreements it holds | Aliases moved to it |
|---|---|---|---|
| NEW Monadelphous Engineering Associates Pty Limited (MEA) | 52 008 861 836 | 24 MEA PTY LTD OFFSHORE AGREEMENT 2024 (current); 26 MEA (WOODSIDE) ONSHORE EA 2022 (current; coverage 13 Woodside Onshore Facilities); 82 MEA OFFSHORE DECOMMISSIONING EA 2022 (expired) | MEA; MEA PTY LTD; MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD |
| NEW M&ISS Pty Ltd | 90 600 471 341 | 23 M&ISS OFFSHORE MAINTENANCE EA 2025 (current); 126 (2021, expired) | M&ISS PTY LTD |
| NEW M Maintenance Services Pty Ltd | 82 605 643 678 | 22 M MAINTENANCE SERVICES INPEX OFFSHORE MAINTENANCE EA 2023 (current; coverage 7 Ichthys LNG); 125 (2019, expired) | M MAINTENANCE SERVICES PTY LTD |
| 27 MWOG Pty Ltd (existing row; set parent 26) | 67 614 889 351 | 27 MWOG OFFSHORE MAINTENANCE EA 2021 (expired; coverage 136, 143) | — |
| alias `MMA` | — | — | **deleted** (D12) |

**Programmed** (28 Programmed Offshore (Australia) Pty Ltd, ABN 44 109 339 433, root). ABR evidence rewrites the D3 picture (S11): Atlas Programmed Marine (Australia) Pty Ltd *is* 28 (renamed 2024); Programmed Marine Pty Ltd *is* Programmed Offshore Pty Ltd (35 009 231 476, a different company); RFM OS Pty Ltd and Rigforce Pty Ltd are two historic names of one company (63 142 037 198, now "ACN 142 037 198 Pty Ltd"); Rigforce Contracting Pty Ltd is 22 637 150 746 (now "ACN 637 150 746 Pty Ltd"); RFM Offshore Pty Ltd (86 658 648 072) is cancelled; and since May 2025 "Rigforce" and "RFM Offshore (Rigforce)" are business names of Programmed Maintenance Services Limited (61 054 742 264, the PERSOL-owned trading company).

| Child | ABN (abr) | Agreements it holds | Aliases moved to it |
|---|---|---|---|
| 28 itself (root) | 44 109 339 433 | 28 HUC greenfields 2024; + 64, 84, 112, 113 from 57 (S11) | ATLAS PROGRAMMED MARINE (AUSTRALIA) PTY LTD; Atlas Professionals; Programmed |
| NEW Programmed Offshore Pty Ltd (ex-Programmed Marine Pty Ltd) | 35 009 231 476 | 45 PROGRAMMED MARINE DECK OFFICERS 2023; 55 PROGRAMMED OFFSHORE PTY LTD AIMPE 2023; 75 WA & NT construction catering 2024 (coverage 26 WA/NT Offshore (General)); 104 WA&NT construction projects 2024 | PROGRAMMED MARINE PTY LTD; PROGRAMMED OFFSHORE PTY LTD |
| NEW RFM Offshore Pty Ltd (cancelled; historical) | 86 658 648 072 | 46 RFM OFFSHORE & AWU DECK OFFICERS 2023 | RFM OFFSHORE PTY LTD |
| NEW RFM OS Pty Ltd (a.k.a. Rigforce Pty Ltd) | 63 142 037 198 | 56 RFM OS AIMPE 2023; 89 RFM OS & MUA 2023; 114 AWU AND RIGFORCE DRILLING 2019 (expired) | RFM OS PTY LTD; RIGFORCE |
| 798 renamed Rigforce Contracting Pty Ltd (S12 b) — or NEW if 798 merges | 22 637 150 746 | 90 RIGFORCE CONTRACTING DRILLING EA 2023 | RIGFORCE CONTRACTING PTY LTD; Rigforce Pty Ltd (the import string, stays where the workers are) |

**Other groups, case by case (S17):** Eris Projects Pty Ltd (29 647 685 292, ex-Kuiper Energy Solutions Pty Ltd) holding EAs 20 and 79 under 19 Eris Energy Pty Ltd (15 150 058 807, ex-Kuiper Australia Pty Ltd); McDermott Australia (Crewing Services) Pty Ltd (69 676 309 603) holding EAs 101, 102 under 68; Legeneering Services Pty Ltd (47 642 438 533, EA 124 expired) under 21; Altrad's Ridgebay / Specialist People / REC EAs under 29.

## 6. Campaign-universe effect (plan §7), all merges together

| Campaign (members today) | Keyed on a victim? | Effect under the recommended options | Effect under the alternatives | Facility to add before the merge |
|---|---|---|---|---|
| 58 Jadestone Stag (28) | yes: 7 → 693 | re-keyed; AND with 16 Stag CPF; **unchanged** | same | none (Stag CPF present) |
| 57 Deck officer and Engineers 2026 (639) | 798 (and 717 if 47 survives) | **+1** (745 on MMA Inscription) **+1** (831 on Siem symphony); 798 and 717 untouched | S12 a: (57, 798) must be deleted first, 7 OUs rewritten (4 collisions), membership unchanged; S4 with survivor 47: re-key + 7 OUs, unchanged | none |
| 48 UGL WA Oil (219) | no (keyed on survivor 33) | **+6** (826's workers, Montara Venture) when M8 runs — deferred pending S13 | S12 a adds **+5** (827's workers, Pyrenees Venture) | Barrow Island oil / WA Oil is not a worksite (DA1.2 creates it); adding it would drop 211 UGL members without a worksite — organiser decision (S13) |
| 64 ROV sector wide (363) | no (keyed on survivor 28) | **unchanged** (798 stays a child) | S12 a: **+15 active / +18 all** | none possible (employer-only universe) |
| 62 programmed ROV (64) | no | unchanged | S12 a: unchanged (the 1 matching Rigforce worker is already a member) | — |
| 47 UGL Varanus (223), 60 UGL CO2 (224) | no | unchanged (0 victim workers at 14 / 421) | same | — |
| 42 EDI Downer Chevron (144) | no | unchanged | S14 a: unchanged (both 18 workers already members) | — |
| 23, 27, 59 (Monadelphous) | no | unchanged (workers stay on 26) | if workers are attributed to children later: add the child to the campaign first (S10) | — |
| 21, 26, 41, 50, 55, 61, 65, 66, 68, 69, 49 | no | unchanged | — | — |

**Predicted membership deltas that the rehearsal must reproduce exactly** (any other delta stops the package): 57 **+2**; 48 **+6** only if M8 runs this phase. Everything else 0.

## 7. Placeholders and non-employers meanwhile (Q-S3, D9)

| Row | Workers (active / all) | Campaigns | Proposal until DA4.3 |
|---|---|---|---|
| 800 Unknown | 4 / 4 | 57 (2 OUs) | kind `placeholder`, hidden from organising views, no merge; DA4.3 sets employer NULL with `placement_status = unknown` and deletes (57, 800); the organiser of 57 re-places the members first or accepts the −N |
| 813 Unemployed | 2 / 3 | 57 (3 OUs) | kind `placeholder`; DA4.3 → `placement_status = not_employed` |
| 772 Nopsema | 1 / 1 | none | decided `out_of_universe` (not an employer); DA4.3 gives the worker a placement status |
| 795 MUA, 741 AWU WA Branch | 3 / 3, 4 / 4 | 50 | kind `union_staff`; keep (internal campaign 50, D16 test identity on 741) |

## 8. New rows

All at `source = oa_universe_research` unless stated; confidence is the map's for the relationship and "H identity" where the ABR confirms the entity. No existing row or alias covers any of them (06 NO MATCH; the one hit, Subsea7 → 716 Reach Subsea, is a false positive).

| # | Proposed row (legal name) | organisation_kind | ABN (source = abr) | Confidence | Aliases to write | Also |
|---|---|---|---|---|---|---|
| N1 | Allseas Marine Contractors Australia Pty Ltd (group Allseas Group S.A.) | prime_contractor | 81 158 534 582 | H identity / H links (Barossa GEP) | Allseas; All Seas | watch contractor 2; worksites All Seas, Fortitude, Felicity PSV exist (DA1.2 fleet) |
| N2 | Subsea 7 Australia Contracting Pty Ltd | prime_contractor | 36 005 288 406 | H | Subsea7; **Subsea 7** (watch alias) | watch 3; worksites Seven Oceanic Subsea 7, Subsea 7 Pegasus, Seven Sisters |
| N3 | DeepOcean Pty Ltd (ex-Shelf Subsea Australia Pty Ltd) | prime_contractor | 13 618 938 757 | H | DeepOcean; **Shelf Subsea**; Shelf Subsea Australia Pty Ltd | watch 6 |
| N4 | Van Oord Australia Pty Ltd | prime_contractor | 63 100 142 292 | H | Van Oord | watch 7; DEME/Van Oord JV entity 71 236 908 436 exists |
| N5 | Vantris (ex-Sapura Energy) — Australian entity Sapura Australia Pty Ltd | prime_contractor | 29 153 658 532 (M: several Sapura entities, incl. Sapura Australia (Holdings) 38 153 397 374, Sapura Constructor Pte Ltd 49 642 597 458) | H identity / M entity | Vantris; **Sapura**; Sapura Energy | watch 8; worksite Sapura Constructor |
| N6 | Boskalis Australia Pty Limited | prime_contractor | 83 099 738 333 | H | Boskalis | watch 12 (inactive) |
| N7 | Condex Services Pty Ltd | contractor (hazardous-area E&I) | 64 622 385 871 | H | Condex | Bass Strait (Sale VIC) |
| N8 | Heerema Marine Contractors Australia Pty Ltd | prime_contractor | 31 009 384 570 | H (Ichthys) / M (decom) | Heerema | watch 11 (inactive) |
| N9 | Weststar-GAP (Weststar Aviation Services, Malaysia) | contractor (helicopters) | none on ABR | M | Weststar; Weststar-GAP | Bayu-Undan (H), Barossa (L) |
| N10 | GGC Industries | contractor (cranes, rigging, scaffolding) | business name 88 163 765 151 (VIC) | **L** (identity itself uncertain) | GGC | on the owner's decommissioning list |
| N11 | Transocean Ltd (group root above 75) | contractor (drilling) | none (foreign; ABR has only Sedco Forex International Limited, other name "Transocean Sedco Forex") | H | Transocean | set 75.parent = N11; pending Transocean–Valaris merger — do not link 702 |
| N12 | Technip Energies (if S6) | prime_contractor (Crux HUC principal) | none found on ABR | M | Technip Energies | 728 becomes TechnipFMC |
| N13–N15 | Monadelphous Engineering Associates Pty Limited; M&ISS Pty Ltd; M Maintenance Services Pty Ltd | contractor, `is_agreement_entity`, parent 26 | 52 008 861 836; 90 600 471 341; 82 605 643 678 | H | §5.4 | D3 |
| N16–N18 | Programmed Offshore Pty Ltd; RFM Offshore Pty Ltd (cancelled); RFM OS Pty Ltd | crew_provider, `is_agreement_entity`, parent 28 | 35 009 231 476; 86 658 648 072; 63 142 037 198 | H | §5.4 | D3, S11 |
| conditional | Rigforce Contracting Pty Ltd (only if 798 merges, S12 a) · Eris Projects Pty Ltd · McDermott Australia (Crewing Services) Pty Ltd (S17) · Tidewater Marine Australia Pty Ltd 49 000 567 395 (S18) · DEME (watch 13, inactive; Van Oord JV partner) | | | | | |

After N1–N11 every OA Universe contractor on the linkages tab and every marine key client has exactly one root row (Saipem 726, McDermott 68, Fugro 40 exist).

## 9. Rounds and ordering

**Before any round:** DA2.1's migration on production (the `organisation_kind`, `is_agreement_entity`, `legal_name`, `abn`, `confidence`, `source`, `verified_*` columns this round fills; dependency summary `ORCHESTRATION_PROMPT.md:243`); DA1.3's migration if the coverage scripts write the new scope codes (otherwise write leaf ids and let DA1.3's crosswalk re-parent); the D17 fresh clone `plbldfctqhnbyrsypuri` for the rehearsal once its pack comparison with production is recorded (the 12 Sep clone lacks the lineage-C rows 814–831 and the 17–21 Sep workers). Re-run §3.5's side-table counts on the day (the weekly batch may add `name_match_reviews` rows pointing at victims).

| Round | Content | Size | Order inside the run sheet |
|---|---|---|---|
| **R1 operators** | M1–M6 (4 D2 families + MODEC), roots renamed with legal names and ABNs (691, 690, 688, 13, 693, 93, 692, 9, 1, 694, 15, 719), kinds for operators | 6 merge calls, 10 victims, ~920 workers re-pointed, 9 EAs, ~14 coverage rows | 1 aliases (victim names, victim aliases, old survivor names) → 2 pre-steps (programs, upcoming projects, mobilisation refs) → 3 per-family: `merge_employers` + `agreement_worksites` + `agreement_scopes` in the same transaction → 4 renames / kinds / ABNs → 5 checksum (58 re-keyed, 0 delta) |
| **R2 contractors** | D12 (delete `MMA` alias first; M7; M8 after S13); D3 children N13–N18 and alias re-points; S11 (M11), S12 (798/827 as children or M9/M10), S14 (18); M12–M17; renames 53, 65, 728, 48, 58, 54, 29, 19; lost aliases restored; N1–N12 created; watch-contractor strings as aliases on N2, N3, N5, 728 | ~9 merge calls, 6–7 new children, 12 new roots | 1 new rows (roots and children) → 2 alias deletes (`MMA`) and re-points (26 → children, 28 → children) → 3 EA moves to children → 4 merges with explicit `alias_names` → 5 unit_basis rewrite only if S12 a → 6 checksum (57 +2, 64 0, 48 0 or +6) |
| **R3 long tail** | M18–M21, `organisation_kind` for the ~70 long-tail rows (S22), `out_of_universe` flags (S23), placeholders' kind (S24), 17/814/706 per S9, 767 per S21, 720/780 parents, Toll | 3–4 merge calls, ~90 kind updates | aliases → merges → kinds → checksum |

Constraints: aliases before merges (DA0.3's resolver must already find each victim name before the victim disappears; the victim's own aliases must be copied because the merge cascades them); coverage rows in the same script (and transaction) as the workgroup merge that moves the agreement; `MMA` deleted before M7 so the name never resolves to two rows; the MEA child exists before 26 is renamed; each round's rehearsal on the fresh clone forward → back → forward with per-campaign membership and placement digests; DA1.4's unique normalised alias index comes after all three rounds (it would reject the transitional duplicates).

## 10. ABR lookups (abr.business.gov.au reachable; 24 Sep 2026)

Every ABN below passed the ABN mod-89 checksum locally; the loader re-verifies on the day. Recorded with `source = abr`. "Historic" = the ABR's historical entity name for that ABN.

| Row(s) | Legal entity (ABR) | ABN | Note |
|---|---|---|---|
| 26 | Monadelphous Group Limited | 28 008 988 547 | root; MEA 52 008 861 836, M&ISS 90 600 471 341, M Maintenance Services 82 605 643 678, MWOG 67 614 889 351 |
| 33 | UGL Resources (Contracting) Pty Ltd | 59 121 122 969 | group UGL Pty Limited 85 009 180 287; IAS = Innovative Asset Solutions Pty Ltd 24 125 677 054 (active) |
| 19 | Eris Energy Pty Ltd | 15 150 058 807 | historic Kuiper Australia Pty Ltd; Eris Projects Pty Ltd 29 647 685 292 = historic Kuiper Energy Solutions Pty Ltd |
| 13 | Woodside Energy Ltd. | 63 005 482 986 | |
| 691 | Chevron Australia Pty Ltd | 29 086 197 757 | other name "as operator of Gorgon" |
| 690 | INPEX Operations Australia Pty Ltd | 48 150 217 262 | |
| 700 | Bechtel Australia Proprietary Limited | 42 006 334 505 | M: Bechtel Construction (Australia) 64 137 316 539 also active |
| 688 | Shell Australia Pty Ltd | 14 009 663 576 | Shell Australia FLNG Pty Ltd 32 008 551 068 also active |
| 710 / 18 | Downer EDI Limited / Downer EDI Engineering Electrical Pty Ltd | 97 003 872 848 / 76 007 102 516 | S14 |
| 58 | Compass Group (Australia) Pty Ltd | 41 000 683 125 | trading ESS |
| 39 | DOF Management Australia Pty Ltd | 29 147 653 629 | |
| 68 | McDermott Australia Pty. Ltd. | 99 002 736 352 | Crewing Services 69 676 309 603 |
| 29 | Altrad Services Pty Ltd | 41 009 120 021 | |
| 43 | OSM Australia Pty Ltd | 38 165 549 879 | |
| 21 | Legeneering (Aust) Pty Ltd | 45 112 645 468 | Legeneering Services 47 642 438 533 |
| 78 | Applus Pty Ltd | 55 008 946 969 | |
| 37 | Australian Offshore Solutions Pty Ltd | 50 131 213 477 | |
| 713 | Toll Energy and Marine Logistics Pty Ltd | 53 009 129 060 | other name Toll Energy Logistics |
| 1 | BW Offshore Australia Management Pty Ltd | 24 649 667 345 | M (EA holder unconfirmed) |
| 40 | Fugro Australia Pty Ltd | 62 119 991 025 | Fugro Australia Marine Pty Ltd not found active |
| 28 / 57 | Programmed Offshore (Australia) Pty Ltd | 44 109 339 433 | historic Atlas Programmed Marine (Australia) Pty Ltd |
| (child) | Programmed Offshore Pty Ltd | 35 009 231 476 | historic Programmed Marine Pty Ltd, Atlas Programmed Marine Pty Ltd |
| (child) | RFM OS Pty Ltd = Rigforce Pty Ltd (now ACN 142 037 198 Pty Ltd) | 63 142 037 198 | |
| 798 | Rigforce Contracting Pty Ltd (now ACN 637 150 746 Pty Ltd) | 22 637 150 746 | |
| (child) | RFM Offshore Pty Ltd | 86 658 648 072 | cancelled |
| (group) | Programmed Maintenance Services Limited | 61 054 742 264 | business names Rigforce, RFM Offshore (Rigforce), Persol, Programmed (2025) |
| 84 | Total Marine Technology Pty Ltd | 70 086 117 660 | |
| 698 | Vertech Group Pty Ltd | 53 132 745 665 | |
| 64 | Sodexo Remote Sites Australia Pty. Limited | 47 009 105 980 | |
| 705 | Cyan Vessel Operations Pty Ltd | 34 009 200 686 | historic MMA Offshore Vessel Operations; trading Mermaid Marine Vessel Operations; parent Cyan Offshore Pty Ltd 21 083 185 693 (historic MMA Offshore Limited / Mermaid Marine Australia Ltd) |
| 54 | PHI International Australia Pty Ltd | 26 008 932 189 | |
| 692 / 9 | Santos Limited / Santos WA Energy Limited | 80 007 550 923 / 39 009 301 964 | |
| 83 | Oceaneering Australia Pty. Limited | 53 005 031 685 | |
| 53 | CHC Helicopter Australia Pty Ltd | 75 007 970 934 | |
| 72 | Ensco Australia Pty Limited | 79 100 601 634 | |
| 797 | GO Offshore Pty Ltd | 51 128 026 148 | |
| 16 | Contract Resources Pty. Ltd. | 63 113 182 504 | M (SA-registered; confirm) |
| 75 | Sedco Forex International Limited | 44 188 717 522 | other name Transocean Sedco Forex |
| 35 | Ventia Australia Pty Ltd | 11 093 114 553 | |
| 693 | Jadestone Energy (Australia) Pty Ltd | 48 613 671 819 | |
| 93 | MODEC Management Services Pte. Ltd. | 18 109 283 810 | |
| 717 / 47 | Solstad Australia Pty Ltd | 40 105 011 989 | |
| 711 | Parabellum International Pty Ltd | 61 147 457 305 | |
| 34 | Wood Australia Pty Ltd | 79 118 514 444 | M (Wood Group Australia 51 101 049 076) |
| 66 | WPF Duratec Pty Ltd / Duratec Limited | 87 082 800 397 / 94 141 614 075 | S8 |
| 88 | Isologics Pty Ltd | 93 614 949 898 | no KAEFER link |
| 704 | KAEFER Integrated Services Pty Ltd | 83 009 046 191 | |
| 707 | Offshore Services Australasia Pty Ltd | 58 141 024 606 | |
| 71 | Diamond Offshore (Australia) L.L.C. | 62 109 588 632 | M |
| 709 | Cleanaway Waste Management Limited | 74 101 155 220 | M |
| 70 | Baker Hughes Services Australia Pty Ltd | 65 009 080 951 | |
| 17 | DBNGP (WA) Nominees Pty Limited | 78 081 609 289 | business names DBNGP, DBP, Dampier Bunbury Pipeline |
| 706 | Australian Gas Infrastructure Group (business name) | 54 871 588 515 | M |
| 48 | TSM Offshore Pty Ltd | 79 059 646 981 | historic Tidewater Ship Management (Australia) Pty Ltd; Tidewater Marine Australia Pty Ltd 49 000 567 395 |
| 46 | Siera Marine Management Pty Ltd | 13 677 058 623 | |
| 712 | EnerMech Pty Limited | 32 136 435 062 | |
| 715 | Qube Ports Pty Ltd | 46 123 021 492 | M |
| 719 | Mitsui E&P Australia Pty Ltd | 45 108 437 529 | |
| 38 | Bhagwan Marine Limited | 81 009 154 349 | |
| 799 / 831 | Sea1 Offshore Australia Pty Ltd | 57 166 123 726 | historic Siem Offshore Australia Pty Ltd |
| 694 | Vermilion Oil & Gas Australia Pty Ltd | 29 113 023 591 | |
| 15 | Teekay Shipping (Australia) Pty Ltd | 35 079 641 580 | |
| 65 | SGS Australia Pty Ltd | 44 000 964 278 | |
| 728 | TechnipFMC Australia Pty Ltd | 43 062 878 719 | no Technip Energies Australian entity found |
| new | see §8 N1–N10 | | |

Top-60-by-workers rows **not** resolved by lookup, for the operator: 702 Valaris (only VALARIS PTY LTD 95 696 512 740 — relation unknown), 714 Acciona (proposed out of universe), 716 Reach Subsea (foreign), 726 Saipem (Australian entity not searched), 733 Schlumberger / SLB (not searched), 723 Auriga Aviation (not searched), 737 Petrofac (foreign), 765 GR Production Services (not searched). The lineage-A workgroup rows (2–7, 10, 12, 14) take their legal employer's ABN.

## 11. Questions for the session (60–90 minutes)

Suggested running order: S1–S9 (plan §8 item 2, ~25 min) · S10–S16 (D3 / D12 mechanics and the rows the ABR reopens, ~25 min) · S17–S21 (~10 min) · S22–S30 batch approvals (~15 min). Each answer goes into the worksheet's decision columns for the rows named; S11, S12 and S14 amend recorded decisions and, if reopened, D3 / D12 in plan §6.

**S1 — Woodside survivor (Q-E2; rows 13, 689, 12, 14).** Evidence: 13 has 217 active workers, EA 13 (NWS platforms, coverage 9, 143, 144), 3 roles, 1 upcoming-project link; 689 has 0 workers but is principal of 13 worksites, of 2 programs and of 10 upcoming-project links. Options: (a) survivor 13; (b) survivor 689. Either way programs and upcoming-project links need a pre-step (the function fails on programs, and nulls upcoming-project links). **Recommend (a) 13**, renamed Woodside Energy Ltd. (ABN 63 005 482 986): fewer rows re-pointed (25 vs ~230) and it already carries the legal name and the EA.

**S2 — Jadestone survivor (Q-E4; 693, 695, 6, 7).** 693: 0 workers, principal of 2 worksites, 1 upcoming-project link; 695: 0 workers, parent of 6 and 7 only. **Recommend 693**, renamed Jadestone Energy (Australia) Pty Ltd (ABN 48 613 671 819); 695, 6, 7 merge in one call; campaign 58 re-keyed with no membership change.

**S3 — MODEC survivor (Q-E6; 93, 703).** 93: 3 EAs (Pyrenees), 1 alias, 1 worksite operator link, 1 mobilisation signal + alert; 703: 25 workers, no campaign or unit references. **Recommend 93**, renamed MODEC Management Services Pte. Ltd. (ABN 18 109 283 810); kind `operator_tier2` (owner's Tier 2 list) with its facility-operator role recorded on Pyrenees in DA1.2.

**S4 — Solstad survivor (Q-E11; 47, 717).** 47 Solstad Australia Pty Ltd: 2 EAs, 0 workers; 717 "Solstad Offshore ASA": 13 workers, 7 roles, 4 worksites, 7 OUs and a universe key in campaign 57. **Recommend survivor id 717 renamed to Solstad Australia Pty Ltd (ABN 40 105 011 989)**, 47 merged in: only 2 agreements move and no `unit_basis` rewrite; "Solstad Offshore ASA" becomes an alias (the Norwegian parent is not an Australian employer). Alternative: survivor 47 with a campaign 57 re-key and 7 OU rewrites (membership unchanged).

**S5 — Transocean root (Q-E14; 75).** ABR has no Australian Transocean entity; Sedco Forex International Limited (44 188 717 522) carries the other name "Transocean Sedco Forex". Options: (a) new root "Transocean Ltd" (foreign, no ABN) with 75 as its `is_agreement_entity` child; (b) keep 75 alone with alias "Transocean". **Recommend (a)** (§5 acceptance: "a Transocean root above Sedco Forex"); do not link Valaris until the pending merger completes.

**S6 — Technip Energies vs TechnipFMC (Q-E18; 728).** 728 has 4 active / 5 workers: 2 on Deep Orient (a TechnipFMC subsea vessel), 1 barge catering, 1 WA/NT Offshore, 1 none; it is keyed in campaign 64 ROV sector wide; the mobilisation watch contractor 10 is canonically "TechnipFMC" with alias "Technip". **Recommend: 728 = TechnipFMC Australia Pty Ltd (43 062 878 719)**, alias "Technip" here, link watch contractor 10 to 728; create **Technip Energies** as a new `prime_contractor` row (Crux HUC principal) with no alias "Technip". Campaign 64 unchanged.

**S7 — ISOLOGICS / KAEFER (Q-E15; 88, 704).** ABR: Isologics Pty Ltd (93 614 949 898) is an active company in its own name; nothing links it to KAEFER. 88 has 0 workers and 1 EA (120). **Recommend: keep 88 as its own root, confidence L, no parent**; the map's "Kaefer (ISOLOGIC)" note stays a research hypothesis until the FWC read (DA6.1).

**S8 — DURATEC = WPF Duratec? (Q-E17; 66).** ABR: WPF Duratec Pty Ltd (87 082 800 397) and its ASX parent Duratec Limited (94 141 614 075). The EA title is "DURATEC ENTERPRISE AGREEMENT 2025"; workers sit at Varanus Island 8, Wandoo B 6, others 1 each. **Recommend: one row 66, legal name taken from the EA (DA6.1); aliases WPF (Duratech), WPF Duratec, Wilson's Pipe Fabrication now**; split into parent and child only if the FWC shows the holder is Duratec Limited.

**S9 — APA vs DBNGP, and gas transmission in the universe (Q-E22; 17, 814, 706).** New evidence: ABR shows DBNGP (WA) Nominees Pty Limited (78 081 609 289) holding the business names DBNGP, DBP and Dampier Bunbury Pipeline; DBP is part of Australian Gas Infrastructure Group (research, M), not APA; row 706 AGIG exists (16 workers: Perth office, Tubridgi gas storage, AGIG control room). 814 APA Group: 1 worker, created by the September sync. Options: (a) as 22 Sep: merge 814 into 17 or make 17 an APA child; (b) **17 renamed to its legal entity, child of 706; 814 separate; alias "DBP/APA" replaced by "DBP"**; (c) all three `out_of_universe` (onshore gas transmission). **Recommend (b)**, and ask the admin to rule D11 for 706, 17 and 814 together (default in: 17 holds an OA-listed EA).

**S10 — Monadelphous root and worker attribution (Q-E7 follow-on; 26 and new MEA, M&ISS, M Maintenance Services).** Decided: 26 = group root with three children. Two points: (i) row 26's current name and ABR identity are MEA's (52 008 861 836), so the rename to Monadelphous Group Limited must hand that name and ABN to the new MEA child — confirm; (ii) 941 active workers sit on 26. By worksite they fall into: Ichthys family (Explorer CPF 142, Venturer 96, Ichthys FPSO 13, Ichthys 3, Endeavour CPF 2 → M Maintenance Services, EA 22); Woodside onshore (Karratha Gas Plant 54, Pluto LNG 59, Pluto 2 8, KBSB 2 → MEA, EA 26); Woodside offshore (Goodwyn 112, Rankin North 83, Scarborough FPU 11, others → M&ISS, EA 23, or MWOG); Prelude 114 and Crux 17 (holder not known); no worksite 193. Options: (a) workers stay on the root in DA1.1 (recommended); (b) attribute by worksite in R2, adding each child to campaigns 23, 27, 59 before re-pointing so membership is unchanged. **Recommend (a)**; revisit after DA6.1 reads the four coverage clauses.

**S11 — Programmed structure (D3; 28, 57, new children).** New ABR evidence (§5.4): 57 Atlas Programmed Marine (Australia) Pty Ltd is **the same company** as 28 (ABN 44 109 339 433, renamed 2024); "Programmed Marine Pty Ltd" is today's Programmed Offshore Pty Ltd (35 009 231 476); RFM OS Pty Ltd and Rigforce Pty Ltd are one company (63 142 037 198); RFM Offshore Pty Ltd is cancelled; "Rigforce" is now a business name of Programmed Maintenance Services Limited. Options: (a) keep the 22 Sep decision (57 a child of 28) and create Programmed Marine and RFM Offshore children as named; (b) **merge 57 into 28 (same entity), create children Programmed Offshore Pty Ltd (EAs 45, 55, 75, 104), RFM Offshore Pty Ltd (46, historical), RFM OS Pty Ltd (56, 89, 114)**, Rigforce Contracting per S12. **Recommend (b)** — it is the legal-entity rule applied to the ABR facts. Workers stay on 28 (campaigns 57, 62, 64 unchanged).

**S12 — 798 Rigforce and 827 IAS: merge (D12 as written) or child (D3)?** D12 says "merged in with their names as aliases"; D3 and §3.1 say agreement-holding subsidiaries that are legal entities stay as children. Evidence: Rigforce Contracting Pty Ltd (22 637 150 746) holds EA 90; Innovative Asset Solutions Pty Ltd (24 125 677 054) is active and holds EA 119 (now on 33). Effects of merging: 798 → 28 widens **campaign 64 ROV sector wide by +15 active / +18 all** Rigforce drilling workers, needs the (57, 798) universe row deleted first (else the merge fails) and 7 OUs rewritten with 4 collisions in campaign 57; 827 → 33 widens **campaign 48 by +5**. Option b (children: 798 renamed Rigforce Contracting Pty Ltd, parent 28, EA 90; 827 renamed Innovative Asset Solutions Pty Ltd, parent 33, EA 119; the aliases as D12 intended) changes no campaign. **Recommend (b)** — it keeps D12's substance (both belong to their acquirer's group; their names resolve to the group) without an unpredicted widening. The operator decides whether D12 is amended.

**S13 — 826 "ugl" and campaign 48 UGL WA Oil (D12 timing).** 826's 6 workers are all on Montara Venture FPSO; campaign 48 has no worksite, so the merge adds all 6. Plan §7 says to add the facility first, but the WA Oil / Barrow Island oil worksite does not exist and 211 of 48's members have no worksite at all. Options: (a) merge in R2 and accept +6 (they are UGL maintenance workers, arguably in 48's universe only if they work WA Oil); (b) write the alias now, merge in R3 after DA1.2 creates WA Oil and the organiser places 48's members; (c) merge and ask the organiser to prune. **Recommend (b)**.

**S14 — 18 Downer: merge (decided D2) or child?** ABR lists Downer EDI Engineering Electrical Pty Ltd (76 007 102 516) as a legal entity; the row's name is entity + scope, the CHC pattern. 2 workers (Gorgon LNG), already members of campaign 42. Options: (a) decided merge into 710 with scope onto EA 18; (b) **rename 18 to the entity, child of 710 (Downer EDI Limited 97 003 872 848), EA 18 scope "electrical — LNG facility services", coverage Gorgon LNG (M)**. **Recommend (b)**; no campaign change either way.

**S15 — Cyan legal entity and campaign 57 (+1).** ABR: 705's employing entity is Cyan Vessel Operations Pty Ltd (34 009 200 686, historic MMA Offshore Vessel Operations — the holder named in EAs 43, 53 that come from 699). Merging 745 adds its one worker (MMA Inscription) to campaign 57. **Recommend: legal name Cyan Vessel Operations Pty Ltd, trading "Cyan Renewables"; accept 57 +1 as predicted.**

**S16 — 831 Siem Offshore → 799 Sea1 (+1 in campaign 57).** ABR confirms Siem Offshore Australia Pty Ltd = Sea1 Offshore Australia Pty Ltd (57 166 123 726). **Recommend merge, accept +1.**

**S17 — D3 "others case by case".** Candidates with distinct ABNs holding current EAs: Eris Projects Pty Ltd (ex-Kuiper Energy Solutions; EAs 20, 79) under 19; McDermott Australia (Crewing Services) Pty Ltd (EAs 101, 102, current) under 68. Lower value: Legeneering Services (EA 124 expired) under 21; Altrad's Ridgebay / Specialist People / REC under 29; Compass ESS. **Recommend: create Eris Projects and McDermott Crewing as children now; defer the rest to DA6.1.**

**S18 — Tidewater (48).** ABR: 48's EA entity Tidewater Ship Management (Australia) Pty Ltd is today TSM Offshore Pty Ltd (79 059 646 981, the OSM Thome crewing side); the vessel owner Tidewater Marine Australia Pty Ltd (49 000 567 395) has no row (the 22 Sep sheet named it as 48's canonical). **Recommend: 48 renamed TSM Offshore Pty Ltd, kind `crew_provider`; create Tidewater Marine Australia as a new `contractor` root (vessel operator) in DA1.2's fleet work.**

**S19 — Simple duplicates (no decision recorded).** 749 Trace JV → 97 Trace Offshore; 816 ATC → 815 ATC Offshore; 755 Broadspectrum Ltd/Transfield → 35 Ventia (Ventia acquired Broadspectrum in 2020; research, M). All 0–1 workers, no campaigns. **Recommend merge all three (R3).**

**S20 — SLB and Cameron.** 779 SLB → 733 Schlumberger (merge); 720 Cameron Services International as a child of 733 (SLB acquired Cameron in 2016; M). **Recommend both.**

**S21 — Noble, Diamond, Maersk (Q-E10; 73, 736, 71, 767).** 736 → 73 merge; 71 Diamond Offshore (Australia) L.L.C. (62 109 588 632) as child of 73 holding EAs 86, 118 (18 workers stay). 767 "Maersk" (1 worker, 2 rig roles, keyed in campaign 57): if it is Maersk Drilling (combined with Noble in 2022), merging into 73 drops its worker from 57 unless 73 is added to 57 first; if Maersk Supply Service, keep. **Recommend 736 merge and 71 child now; 767 kept until the organiser identifies it.**

**S22 — The long tail: `(not in OA Universe)` and lineage-C rows (Q-E23 superseded by D5).** 47 rows (listed in the worksheet with `open_question = S22`), 0–5 active workers each, placed on in-universe facilities (Explorer CPF, Prelude, Gorgon, Wheatstone, Wandoo, vessels) or unplaced. **Recommend batch approval: `keep`, kind `contractor`, `confidence = L`, `source = worker_records`**, with universe-edge flags on 730 LifeFlight, 777 Royal Flying Doctor Service, 757 Ensign (land drilling), 830 Primero (0 workers).

**S23 — Out-of-universe determinations (D11 row by row).** Proposed: 714 Acciona (all 9 workers on Alkimos desalination sites — follows "Alkimos out"), 751 Wirringulla Workforce (Alkimos / Acciona jack-up), 752 Acrow (Perdaman urea), 773 North Kimberley Airport, 829 MER Solutions: Port Hedland (0 workers), 782 Toll West (0 workers). Already decided: 762, 772, 784, 785, 786. **Recommend all six out; the admin confirms each.**

**S24 — Placeholders and union rows meanwhile (Q-S3, Q-E20).** 800 Unknown (4) and 813 Unemployed (2 / 3) are in campaign 57's universe (5 OUs). **Recommend: kind `placeholder`, hidden from organising views, no merge, no deletion in DA1.1**; DA4.3 nulls the employer with a `placement_status` and first asks 57's organiser to re-place or release those members. 741 AWU and 795 MUA: `union_staff`, kept for campaign 50; rename 795 to Maritime Union of Australia with alias MUA.

**S25 — Toll (Q-E13; 713, 782).** 713: Toll Energy and Marine Logistics Pty Ltd (53 009 129 060), 66 workers at Gorgon, campaign 21. 782 Toll West: 0 workers, regional freight. **Recommend 713 renamed; 782 `out_of_universe` (S23); no Toll group root.**

**S26 — Operator kinds for Vermilion and Mitsui (694, 719).** Both are titleholders/operators outside the owner's Tier 1 / Tier 2 list: Vermilion (Wandoo, in universe by D11; 3 workers at Wandoo B), Mitsui E&P Australia (Waitsia; 11 workers, 6 at Karratha Gas Plant). **Recommend `operator_tier2` for both**, owner to confirm the tier.

**S27 — Saipem Leighton Consortium (Q-E12; 778).** 1 worker, no worksite. **Recommend keep as a separate historical JV, `prime_contractor`, no parent.**

**S28 — Aliases the merge function lost, and the `abr` source.** Restore: COMPASS GROUP ESS and COMPASS GROUP- (58), KUIPER AUSTRALIA PTY LTD (19), REC – ALTRAD (29), PHI INTERNATIONAL AUSTRALIA GASCOYNE ENGINEERING AND RAMP STAFF (54); remove 19's self-alias ERIS; write the watch-contractor strings Subsea 7, Shelf Subsea, Sapura, Technip onto N2, N3, N5 and 728. ABR historic names (e.g. MMA Offshore Vessel Operations Pty Ltd, Kuiper Energy Solutions Pty Ltd, Siem Offshore Australia Pty Ltd) are good aliases but the alias CHECK admits `merge | manual | import | oa_universe | fwc` only. Options: (a) write them as `manual`; (b) add `abr` to the CHECK in DA2.1's migration. **Recommend (b).**

**S29 — New rows (§8).** Approve N1–N12 with the kinds, confidences and aliases shown, GGC at L; DEME optional. **Recommend approve; DEME deferred (inactive watch entry, not on the §5 list).**

**S30 — Rounds and dependencies (§9).** Approve the R1 / R2 / R3 split and ordering; confirm that DA1.3's Q1 (a `production_operations` scope root) is answered before R1's coverage script, or that R1 writes leaf 4 Operations; confirm that the Ichthys coverage rows (EA 5 → Explorer CPF and Venturer FPSO beside worksite 7) may be written before DA1.2 settles the Ichthys family. **Recommend approve; answer DA1.3 Q1 in the same session.**

Numbers: **30 questions**; 9 are the plan §8 item 2 survivor choices (S1–S9); 6 raise evidence the 22 Sep worksheet did not have (S9, S11, S12, S14, S18, S28).

## 12. Findings for the ledger (incidental)

| Found | Finding | For |
|---|---|---|
| DA1.1 prep (2026-09-24) | `merge_employers` (baseline:3981) does not re-point `programs.principal_employer_id` (FK without action → a merge with 689 as victim fails), nulls `upcoming_project_employers` / mobilisation / `name_match_reviews` / `worker_*_options` links, cascades away a victim's own aliases, does not de-duplicate `campaign_employers` (fails when a campaign names both rows), and does not touch `unit_basis`. The audit payload keeps `workers_updated` but not agreements, roles or campaign rows. DA1.1 scripts must pre-step all of these; a later migration may fix the function. | DA1.1 planner; DA1.4 |
| DA1.1 prep | Aliases lost by past merges and renames (§3.1): 5 strings. | DA1.1 R2 (S28) |
| DA1.1 prep | `06_oa_universe_crossmatch.sql` maps Subsea7 to 716 Reach Subsea (`%subsea%`); tighten to `%subsea 7%` / `%subsea7%`. | pack maintenance |
| DA1.1 prep | Campaign 58 Jadestone Stag: 22 of employer 7's 26 active workers have no worksite; 28 members vs 3 at Stag CPF. Campaign 48 UGL WA Oil has no worksite and 211 of UGL's workers have none. | organiser / DA1.2 |
| DA1.1 prep | ABR shows several agreement holders renamed or deregistered (Programmed family, Rigforce, MMA → Cyan, Kuiper → Eris, Tidewater Ship Management → TSM Offshore, Siem → Sea1): the FWC read (DA6.1) should record the holder's ABN, not just its name. | DA6.1 |
