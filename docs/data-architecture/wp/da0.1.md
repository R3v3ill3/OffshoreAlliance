# DA0.1 — Baseline profile

2026-09-22 · production `gteygwfgjvczanmrwgbr` · clone `yqjkuobcawvigsfpgrcm` · read-only; every result below is pasted raw from the connector

## 1. Specification

> DA0.1 | Operator runs the profiling pack on production; agent runs it on a fresh production-shaped clone; both outputs pasted into `wp/da0.1.md` | baseline profile | every count in §1 reproduced or explained

(from `docs/data-architecture/OA_UNIVERSE_ALIGNMENT_PLAN.md` §5, row DA0.1.)

Per decision D0, the agent ran the profiling pack on production read-only (the operator did not separately run it for this work package). Per decision D17, no fresh production-shaped clone exists yet — the fresh clone is created after Phase 0's run sheets land on production. The clone used below is the **12 September clone** (`yqjkuobcawvigsfpgrcm`), the one D17 says Phase 0 rehearses on; it carries the synthetic TestCo rows and lacks the vessel-tracking tables and the 17–22 September membership-sync activity, so its counts differ from production by construction, not by error (except where noted in §5).

## 2. Production profile

### 00_profile_counts.sql

```
t | n
agreement_employers | 5
agreement_scopes | 0
agreement_worksites | 54
agreements | 136
campaign_employers | 48
campaign_groups | 25
campaign_organising_units | 253
campaign_worker_membership | 3456
campaign_worker_ou | 2506
campaign_worksites | 122
campaigns | 24
employer_merge_events | 23
employer_name_aliases | 39
employer_scopes | 28
employer_worksite_roles | 251
employers | 187
import_logs | 68
membership_update_batches | 1
occupation_aliases | 1488
occupations | 182
organiser_patch_assignments | 8
organiser_patches | 2
organisers | 11
program_worksites | 10
programs | 4
projects | 20
sectors | 16
upcoming_project_employers | 84
upcoming_projects | 84
work_scopes | 22
worker_agreements | 0
worker_assignments | 0
workers | 6564
workers_active | 5749
worksite_contracts | 0
worksite_name_aliases | 8
worksite_scopes | 49
worksites | 194
worksites_active | 188
worksites_with_parent | 1
```

### 01_profile_employers.sql

Statement 1 — one row per employer:

```
employer_id | employer_name | trading_name | employer_category | parent_employer_id | has_abn | is_active | created | active_workers | worksite_roles | agreements | aliases | campaign_universes
714 | Acciona Construction Australia |  | Subcontractor |  | False | True | 2026-04-01 | 8 | 0 | 0 | 0 | 0
752 | Acrow |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
792 | Aegis Offshore Maintenance Pty Ltd |  | Major_Contractor |  | False | True | 2026-04-16 | 108 | 0 | 0 | 0 | 0
706 | AGIG |  | Subcontractor |  | False | True | 2026-04-01 | 16 | 0 | 0 | 0 | 0
753 | Airswift |  | Specialist |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
790 | Alliance Site Services |  | Major_Contractor |  | False | True | 2026-04-09 | 95 | 1 | 0 | 0 | 0
29 | ALTRAD |  | Subcontractor |  | False | True | 2026-03-10 | 104 | 3 | 6 | 5 | 0
814 | APA Group |  | Subcontractor |  | False | True | 2026-09-17 | 1 | 0 | 0 | 0 | 0
78 | APPLUS+ PTY LTD |  |  |  | False | True | 2026-03-10 | 83 | 2 | 4 | 1 | 0
729 | Archer Well Company (Aust) Pl |  | Subcontractor |  | False | True | 2026-04-01 | 2 | 0 | 0 | 0 | 0
816 | ATC |  | Subcontractor |  | False | True | 2026-09-17 | 0 | 0 | 0 | 0 | 0
815 | ATC Offshore |  |  |  | False | True | 2026-09-17 | 1 | 0 | 0 | 0 | 0
57 | ATLAS PROGRAMMED MARINE (AUSTRALIA) PTY LTD |  |  |  | False | True | 2026-03-10 | 0 | 0 | 4 | 0 | 0
723 | Auriga Aviation |  | Specialist |  | False | True | 2026-04-01 | 6 | 0 | 0 | 0 | 0
52 | AURIGA AVIATION HELICOPTER ENGINEERS |  |  |  | False | True | 2026-03-10 | 0 | 0 | 1 | 0 | 0
817 | Australian Marine Services |  | Specialist |  | False | True | 2026-09-17 | 1 | 0 | 0 | 0 | 0
37 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | Subcontractor |  | False | True | 2026-03-10 | 70 | 30 | 6 | 3 | 1
741 | Australian Workers' Union WA Branch |  | Specialist |  | False | True | 2026-04-01 | 3 | 0 | 0 | 0 | 1
819 | Axess Offshore Australia |  |  |  | False | True | 2026-09-17 | 3 | 0 | 0 | 0 | 0
70 | BAKER HUGHES SERVICES AUSTRALIA PTY LTD |  |  |  | False | True | 2026-03-10 | 16 | 0 | 1 | 0 | 0
700 | Bechtel Australia |  | Major_Contractor |  | False | True | 2026-04-01 | 215 | 0 | 0 | 0 | 0
754 | Benthic |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
38 | BHAGWAN MARINE LTD |  | Specialist |  | False | True | 2026-03-10 | 9 | 5 | 2 | 0 | 1
755 | Broadspectrum Ltd/Transfield |  | Subcontractor |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
820 | Burgess BLA |  |  |  | False | True | 2026-09-17 | 1 | 0 | 0 | 0 | 0
1 | BW |  |  |  | False | True | 2026-03-10 | 61 | 1 | 1 | 0 | 0
742 | Cable Restoration Australia |  | Specialist |  | False | True | 2026-04-01 | 2 | 0 | 0 | 0 | 0
821 | Caledonia Group |  | Subcontractor |  | False | True | 2026-09-17 | 2 | 0 | 0 | 0 | 0
720 | Cameron Services International |  | Subcontractor |  | False | True | 2026-04-01 | 4 | 0 | 0 | 0 | 0
53 | CHC HELICOPTER (AUSTRALIA) AIRCRAFT ENGINEERS |  |  |  | False | True | 2026-03-10 | 36 | 0 | 1 | 0 | 0
691 | Chevron |  | Principal_Employer |  | False | True | 2026-03-13 | 7 | 0 | 0 | 0 | 0
2 | CHEVRON GORGON OPERATIONS |  |  | 691 | False | True | 2026-03-10 | 224 | 4 | 1 | 0 | 0
3 | CHEVRON WHEATSTONE DOWNSTREAM OPERATIONS |  |  | 691 | False | True | 2026-03-10 | 148 | 1 | 1 | 0 | 0
4 | CHEVRON WHEATSTONE PLATFORM |  |  | 691 | False | True | 2026-03-10 | 33 | 2 | 1 | 0 | 0
709 | Cleanaway Waste Management |  | Subcontractor |  | False | True | 2026-04-01 | 18 | 0 | 0 | 0 | 0
724 | Clough |  | Subcontractor |  | False | True | 2026-04-01 | 3 | 0 | 0 | 0 | 0
58 | COMPASS GROUP – |  | Major_Contractor |  | False | True | 2026-03-10 | 118 | 14 | 10 | 1 | 1
16 | CONTRACT RESOURCES PTY LTD |  |  |  | False | True | 2026-03-10 | 32 | 0 | 1 | 0 | 0
705 | Cyan Renewables |  | Specialist |  | False | True | 2026-04-01 | 49 | 16 | 0 | 0 | 1
17 | DAMPIER BUNBURY NATURAL GAS PIPELINE (DBNGP)  NATIONAL CONTROL CENTRE |  |  |  | False | True | 2026-03-10 | 5 | 2 | 1 | 1 | 0
71 | DIAMOND |  |  |  | False | True | 2026-03-10 | 18 | 0 | 2 | 0 | 0
39 | DOF MANAGEMENT AUSTRALIA PTY LTD |  |  |  | False | True | 2026-03-10 | 114 | 7 | 3 | 1 | 2
18 | DOWNER EDI ENGINEERING ELECTRICAL LNG FACILITY SERVICES |  |  |  | False | True | 2026-03-10 | 2 | 0 | 1 | 0 | 0
710 | Downer EDI Group |  |  |  | False | True | 2026-04-01 | 147 | 1 | 0 | 0 | 1
66 | DURATEC |  |  |  | False | True | 2026-03-10 | 20 | 0 | 1 | 0 | 0
822 | Eire Total Access |  | Subcontractor |  | False | True | 2026-09-17 | 0 | 0 | 0 | 0 | 0
712 | EnerMech |  | Subcontractor |  | False | True | 2026-04-01 | 11 | 0 | 0 | 0 | 0
756 | Enhanced Drilling |  | Subcontractor |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
72 | ENSCO AUSTRALIA PTY LIMITED |  |  |  | False | True | 2026-03-10 | 2 | 0 | 1 | 0 | 0
757 | Ensign Intn Energy Services |  |  |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
62 | ENTIER AUSTRALIA PTY LTD |  |  |  | False | True | 2026-03-10 | 3 | 1 | 1 | 0 | 0
758 | Epigroup |  | Subcontractor |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
19 | ERIS |  | Labour_Hire |  | False | True | 2026-03-10 | 263 | 4 | 6 | 5 | 1
823 | ESI Tech Services |  | Subcontractor |  | False | True | 2026-09-17 | 1 | 0 | 0 | 0 | 0
759 | Everllence |  | Subcontractor |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
760 | Expro Group Aust Pty Ltd |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
761 | Firesafe Group |  | Specialist |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
825 | Focus Offshore |  | Subcontractor |  | False | True | 2026-09-17 | 1 | 0 | 0 | 0 | 0
762 | Fortescue Metals Group |  | Producer |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
788 | Fortis Maintenance Services |  | Major_Contractor |  | False | True | 2026-04-09 | 120 | 1 | 0 | 0 | 0
40 | FUGRO AUSTRALIA PTY LTD |  |  |  | False | True | 2026-03-10 | 61 | 3 | 3 | 1 | 2
763 | Fuze Group |  | Subcontractor |  | False | True | 2026-04-01 | 2 | 0 | 0 | 0 | 0
764 | GFS NDT |  | Specialist |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
797 | GO OFFSHORE |  |  |  | False | True | 2026-06-10 | 34 | 10 | 0 | 0 | 1
765 | GR Production Services |  | Subcontractor |  | False | True | 2026-04-01 | 3 | 0 | 0 | 0 | 0
766 | Heat Tech Australia |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
721 | Helix Robotic Solutions |  | Specialist |  | False | True | 2026-04-01 | 6 | 0 | 0 | 0 | 1
827 | IAS Group |  | Subcontractor |  | False | True | 2026-09-17 | 5 | 0 | 0 | 0 | 0
690 | Inpex |  | Principal_Employer |  | False | True | 2026-03-13 | 9 | 0 | 0 | 0 | 0
5 | INPEX - ICHTHYS OPERATIONS |  |  |  | False | True | 2026-03-10 | 215 | 2 | 1 | 0 | 0
734 | Inverse Group |  | Subcontractor |  | False | True | 2026-04-01 | 3 | 0 | 0 | 0 | 0
743 | IQIP |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
88 | ISOLOGICS |  |  |  | False | True | 2026-03-10 | 0 | 0 | 1 | 0 | 0
693 | Jadestone |  | Principal_Employer |  | False | True | 2026-03-13 | 0 | 0 | 0 | 0 | 0
695 | JADESTONE ENERGY  |  |  |  | False | True | 2026-03-31 | 0 | 0 | 0 | 0 | 0
6 | JADESTONE ENERGY MONTARA VENTURE |  |  | 695 | False | True | 2026-03-10 | 39 | 2 | 2 | 1 | 0
7 | JADESTONE ENERGY STAG CPF |  |  | 695 | False | True | 2026-03-10 | 26 | 1 | 1 | 0 | 1
801 | Jan De Nul |  |  |  | False | True | 2026-06-10 | 3 | 1 | 0 | 0 | 1
41 | JETWAVE MARINE SERVICES PTY. LTD. |  |  |  | False | True | 2026-03-10 | 3 | 4 | 1 | 0 | 1
828 | Joyce Krane |  | Subcontractor |  | False | True | 2026-09-20 | 2 | 0 | 0 | 0 | 0
735 | JPS Management & Execution |  | Subcontractor |  | False | True | 2026-04-01 | 2 | 0 | 0 | 0 | 0
704 | Kaefer Integrated Services Pty Ltd |  | Subcontractor |  | False | True | 2026-04-01 | 20 | 0 | 0 | 0 | 0
725 | KBSS Engineering |  | Subcontractor |  | False | True | 2026-04-01 | 2 | 0 | 0 | 0 | 0
718 | Kent Offshore |  | Subcontractor |  | False | True | 2026-04-01 | 4 | 0 | 0 | 0 | 0
21 | LEGENEERING (AUST.) PTY LTD |  |  |  | False | True | 2026-03-10 | 83 | 0 | 3 | 1 | 0
730 | LifeFlight |  | Specialist |  | False | True | 2026-04-01 | 3 | 0 | 0 | 0 | 0
767 | Maersk |  | Subcontractor |  | False | True | 2026-04-01 | 1 | 2 | 0 | 0 | 1
768 | Maritime Constructions |  | Subcontractor |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
68 | MCDERMOTT AUSTRALIA PTY LTD |  |  |  | False | True | 2026-03-10 | 108 | 3 | 4 | 1 | 1
744 | Mechanical Project Services |  | Subcontractor |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
769 | Medical Rescue |  | Specialist |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
770 | MEGT Australia |  | Subcontractor |  | False | True | 2026-04-01 | 2 | 0 | 0 | 0 | 0
829 | MER Solutions: Port Hedland |  |  |  | False | True | 2026-09-20 | 0 | 0 | 0 | 0 | 0
745 | Mermaid Marine |  | Subcontractor |  | False | True | 2026-04-01 | 1 | 1 | 0 | 0 | 0
719 | Mitsui E&P Australia |  | Subcontractor |  | False | True | 2026-04-01 | 11 | 0 | 0 | 0 | 0
25 | MIZCO PTY LTD |  |  |  | False | True | 2026-03-10 | 0 | 1 | 1 | 0 | 0
699 | MMA |  | Specialist |  | False | True | 2026-03-31 | 1 | 1 | 2 | 0 | 0
771 | Mobilize |  | Subcontractor |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
703 | Modec |  | Subcontractor |  | False | True | 2026-04-01 | 25 | 0 | 0 | 0 | 0
93 | MODEC Management Services |  |  |  | False | True | 2026-03-10 | 0 | 1 | 3 | 1 | 0
26 | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD |  | Major_Contractor |  | False | True | 2026-03-10 | 941 | 9 | 7 | 6 | 3
731 | MSS Security |  | Subcontractor |  | False | True | 2026-04-01 | 5 | 0 | 0 | 0 | 0
795 | MUA |  |  |  | False | True | 2026-05-28 | 3 | 0 | 0 | 0 | 1
27 | MWOG PTY LTD |  |  |  | False | True | 2026-03-10 | 0 | 1 | 1 | 0 | 0
746 | NES Fircroft |  | Subcontractor |  | False | True | 2026-04-01 | 5 | 0 | 0 | 0 | 0
73 | NOBLE |  |  |  | False | True | 2026-03-10 | 0 | 0 | 1 | 0 | 0
736 | Noble Corporation |  | Subcontractor |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
772 | Nopsema |  | Subcontractor |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
773 | North Kimberley Airport |  | Specialist |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
793 | NorthStar Marine Coatings |  | Subcontractor |  | False | True | 2026-04-16 | 48 | 3 | 0 | 0 | 0
774 | O-Tech Services Pty Ltd |  | Subcontractor |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
83 | OCEANEERING AUSTRALIA PTY LTD |  |  |  | False | True | 2026-03-10 | 38 | 0 | 1 | 0 | 2
722 | Oceania Engineering Services |  | Specialist |  | False | True | 2026-04-01 | 3 | 0 | 0 | 0 | 0
794 | Offshore Crew Services Ltd |  | Major_Contractor |  | False | True | 2026-04-16 | 84 | 0 | 0 | 0 | 0
707 | Offshore Services Australasia |  | Subcontractor |  | False | True | 2026-04-01 | 19 | 0 | 0 | 0 | 0
43 | OSM Australia Pty Ltd |  |  |  | False | True | 2026-03-10 | 96 | 27 | 7 | 1 | 1
789 | Pacific Coatings & Insulation |  | Subcontractor |  | False | True | 2026-04-09 | 55 | 1 | 0 | 0 | 0
711 | Parabellum International |  | Subcontractor |  | False | True | 2026-04-01 | 21 | 0 | 0 | 0 | 2
737 | Petrofac |  | Subcontractor |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
54 | PHI INTERNATIONAL AUSTRALIA  |  | Specialist |  | False | True | 2026-03-10 | 46 | 6 | 3 | 2 | 0
701 | Powertech Pty Ltd |  | Subcontractor |  | False | True | 2026-04-01 | 2 | 0 | 0 | 0 | 0
732 | Pressure Dynamics |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
830 | Primero Group |  | Subcontractor |  | False | True | 2026-09-20 | 0 | 0 | 0 | 0 | 0
28 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD |  |  |  | False | True | 2026-03-10 | 58 | 17 | 10 | 6 | 3
775 | Qetra |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
715 | Qube Ports & Bulk |  | Specialist |  | False | True | 2026-04-01 | 11 | 0 | 0 | 0 | 0
738 | Radiation Professionals Australia |  | Specialist |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
776 | RCSS |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
716 | Reach Subsea |  | Specialist |  | False | True | 2026-04-01 | 8 | 0 | 0 | 0 | 1
798 | Rigforce Pty Ltd |  | Subcontractor |  | False | True | 2026-06-10 | 15 | 5 | 0 | 0 | 1
777 | Royal Flying Doctor Service |  | Specialist |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
739 | Safehouse Habitats Australia |  | Specialist |  | False | True | 2026-04-01 | 2 | 0 | 0 | 0 | 0
747 | Safety Direct Solutions |  | Specialist |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
726 | Saipem |  |  |  | False | True | 2026-04-01 | 3 | 0 | 0 | 0 | 0
778 | Saipem Leighton Consortium |  | Major_Contractor |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
692 | Santos |  | Principal_Employer |  | False | True | 2026-03-13 | 46 | 0 | 0 | 0 | 0
9 | SANTOS WA ENERGY LIMITED VARANUS ISLAND HUB |  |  | 692 | False | True | 2026-03-10 | 0 | 1 | 1 | 0 | 0
733 | SchlumbergerAustralia Pty Ltd |  | Subcontractor |  | False | True | 2026-04-01 | 3 | 0 | 0 | 0 | 0
740 | Score Group |  |  |  | False | True | 2026-04-01 | 4 | 0 | 0 | 0 | 0
799 | Sea1 Offshore |  |  |  | False | True | 2026-06-10 | 2 | 3 | 0 | 0 | 1
75 | SEDCO FOREX INTERNATIONAL INC |  |  |  | False | True | 2026-03-10 | 29 | 0 | 1 | 0 | 0
65 | SGS PRELUDE CHEMISTS |  |  |  | False | True | 2026-03-10 | 3 | 1 | 1 | 0 | 0
688 | Shell |  | Principal_Employer |  | False | True | 2026-03-13 | 20 | 0 | 0 | 0 | 0
10 | SHELL PRELUDE |  |  | 688 | False | True | 2026-03-10 | 210 | 2 | 1 | 0 | 0
831 | Siem Offshore |  | Specialist |  | False | True | 2026-09-21 | 1 | 0 | 0 | 0 | 0
46 | SIERA MARINE MANAGEMENT PTY LTD |  |  |  | False | True | 2026-03-10 | 12 | 4 | 2 | 0 | 1
727 | Sitemec Engineering |  | Subcontractor |  | False | True | 2026-04-01 | 3 | 0 | 0 | 0 | 0
779 | SLB |  |  |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
64 | SODEXO REMOTE SITE |  |  |  | False | True | 2026-03-10 | 51 | 1 | 1 | 0 | 0
47 | SOLSTAD AUSTRALIA PTY LTD |  |  |  | False | True | 2026-03-10 | 0 | 0 | 2 | 0 | 0
717 | Solstad Offshore ASA |  | Specialist |  | False | True | 2026-04-01 | 13 | 7 | 0 | 0 | 1
780 | Sparrows Group |  |  |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
748 | Steel Diamond |  | Subcontractor |  | False | True | 2026-04-01 | 2 | 0 | 0 | 0 | 0
728 | Technip |  | Subcontractor |  | False | True | 2026-04-01 | 4 | 0 | 0 | 0 | 1
15 | TEEKAY SHIPPING (AUSTRALIA) PTY LTD |  |  |  | False | True | 2026-03-10 | 3 | 1 | 2 | 0 | 0
791 | TestCo 2 |  | Producer |  | False | True | 2026-04-16 | 73 | 3 | 0 | 0 | 2
787 | TestCo Energy |  | Producer |  | False | True | 2026-04-09 | 80 | 1 | 0 | 0 | 0
48 | TIDEWATER SHIP MANAGEMENT (AUSTRALIA) PTY LTD |  |  |  | False | True | 2026-03-10 | 13 | 10 | 1 | 0 | 1
781 | Titan Recruitment |  |  |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
713 | Toll Energy |  | Specialist |  | False | True | 2026-04-01 | 66 | 1 | 0 | 0 | 1
782 | Toll West |  |  |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
84 | TOTAL MARINE TECHNOLOGY PTY LTD |  |  |  | False | True | 2026-03-10 | 55 | 0 | 2 | 0 | 2
97 | TRACE |  |  |  | False | True | 2026-03-10 | 0 | 0 | 1 | 0 | 0
749 | Trace JV |  | Subcontractor |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
826 | ugl |  | Subcontractor |  | False | True | 2026-09-17 | 6 | 0 | 0 | 0 | 0
33 | UGL RESOURCES (CONTRACTING) PTY LTD |  |  |  | False | True | 2026-03-10 | 295 | 3 | 3 | 2 | 3
813 | Unemployed |  | Specialist |  | False | True | 2026-06-10 | 2 | 2 | 0 | 0 | 1
800 | Unknown |  | Specialist |  | False | True | 2026-06-10 | 4 | 0 | 0 | 0 | 1
11 | UPSTREAM PRODUCTION SOLUTIONS PTY LTD |  |  |  | False | True | 2026-03-10 | 0 | 1 | 1 | 0 | 0
702 | Valaris Marine |  | Subcontractor |  | False | True | 2026-04-01 | 35 | 1 | 0 | 0 | 1
35 | VENTIA AUSTRALIA PTY LTD |  |  |  | False | True | 2026-03-10 | 28 | 2 | 1 | 0 | 0
750 | Veolia Environ Srvs |  | Specialist |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
694 | Vermilion |  | Principal_Employer |  | False | True | 2026-03-27 | 3 | 0 | 0 | 0 | 0
698 | Vertech |  | Specialist |  | False | True | 2026-03-31 | 52 | 1 | 0 | 0 | 0
783 | Viking Life-Saving Equipment |  |  |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
784 | Warrikal Mining |  |  |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
785 | Water Corporation WA |  |  |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
708 | Weatherford Australia |  | Subcontractor |  | False | True | 2026-04-01 | 5 | 0 | 0 | 0 | 0
751 | Wirringulla Workforce |  | Labour_Hire |  | False | True | 2026-04-01 | 2 | 0 | 0 | 0 | 0
34 | WOOD |  |  |  | False | True | 2026-03-10 | 20 | 0 | 2 | 0 | 0
689 | Woodside |  | Principal_Employer |  | False | True | 2026-03-13 | 0 | 0 | 0 | 0 | 0
13 | WOODSIDE ENERGY LTD |  |  |  | False | True | 2026-03-10 | 217 | 3 | 1 | 0 | 0
12 | WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO |  |  | 13 | False | True | 2026-03-10 | 0 | 5 | 1 | 0 | 0
14 | WOODSIDE ENERGY MACEDON GAS PLANT |  |  | 13 | False | True | 2026-03-10 | 0 | 1 | 1 | 0 | 0
98 | WORKFORCE LOGISTICS PTY LTD |  |  |  | False | True | 2026-03-10 | 0 | 0 | 1 | 0 | 0
36 | XELERATOR PTY LTD |  |  |  | False | True | 2026-03-10 | 0 | 1 | 1 | 0 | 0
786 | Zenith Energy |  |  |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
```

Statement 2 — aliases and the merges that created them:

```
alias_name | canonical | source | created_at
R.E.C. | ALTRAD | merge | 2026-03-31
RIDGEBAY HOLDINGS KARRATHA | ALTRAD | merge | 2026-03-31
RIDGEBAY HOLDINGS PTY LTD | ALTRAD | merge | 2026-03-31
SPECIALIST PEOPLE | ALTRAD | merge | 2026-03-31
SPECIALIST PEOPLE – | ALTRAD | merge | 2026-03-31
APPLUS+ PLY LTD | APPLUS+ PTY LTD | merge | 2026-03-31
AOS CONTRACT DREDGING | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | merge | 2026-03-31
AOS PTY LTD | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | merge | 2026-03-31
AUSTRALIAN OFFSHORE SOLUTIONS (AOS) PTY LTD | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | merge | 2026-03-31
COMPASS GROUP - ESS | COMPASS GROUP – | merge | 2026-03-31
DBP/APA | DAMPIER BUNBURY NATURAL GAS PIPELINE (DBNGP)  NATIONAL CONTROL CENTRE | merge | 2026-03-31
DOF SUBSEA AUSTRALIA PTY LTD | DOF MANAGEMENT AUSTRALIA PTY LTD | merge | 2026-03-31
ERIS | ERIS | merge | 2026-03-31
KUIPER AUSTRALIA PTYLTD | ERIS | merge | 2026-03-31
KUIPER AUSTRALIA PTYLTD - | ERIS | merge | 2026-03-31
KUIPER ENERGY | ERIS | merge | 2026-03-31
KUIPER ENERGY SOLUTIONS PTY LTD | ERIS | merge | 2026-03-31
FUGRO AUSTRALIA MARINE PTY LTD | FUGRO AUSTRALIA PTY LTD | merge | 2026-03-31
JADESTONE ENERGRY MONTARA VENTURE | JADESTONE ENERGY MONTARA VENTURE | merge | 2026-03-31
LEGENEERING SERVICES PTY LTD | LEGENEERING (AUST.) PTY LTD | merge | 2026-03-31
MCDERMOTT AUSTRALIA (CREWING SERVICES) PTY LTD | MCDERMOTT AUSTRALIA PTY LTD | merge | 2026-03-31
MODEC MANAGEMENT SERVICES PTE | MODEC Management Services | merge | 2026-03-31
M MAINTENANCE SERVICES PTY LTD | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | merge | 2026-03-31
M&ISS PTY LTD | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | merge | 2026-03-31
MEA | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | merge | 2026-03-31
MEA PTY LTD | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | merge | 2026-03-31
MMA | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | merge | 2026-03-31
Monadelphous | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | merge | 2026-03-31
OSM | OSM Australia Pty Ltd | merge | 2026-03-31
PHI INTERNATIONAL AUSTRALIA KIMBERLEY ENGINEERING AND RAMP STAFF | PHI INTERNATIONAL AUSTRALIA  | merge | 2026-03-31
PHI INTERNATIONAL AUSTRALIA PTY LTD | PHI INTERNATIONAL AUSTRALIA  | merge | 2026-03-31
PROGRAMMED MARINE PTY LTD | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | merge | 2026-03-31
PROGRAMMED OFFSHORE PTY LTD | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | merge | 2026-03-31
RFM OFFSHORE PTY LTD | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | merge | 2026-03-31
RFM OS PTY LTD | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | merge | 2026-03-31
RIGFORCE | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | merge | 2026-03-31
RIGFORCE CONTRACTING PTY LTD | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | merge | 2026-03-31
IAS GROUP | UGL RESOURCES (CONTRACTING) PTY LTD | merge | 2026-03-31
UGL OPERATIONS AND | UGL RESOURCES (CONTRACTING) PTY LTD | merge | 2026-03-31
```

Statement 3 — employer_merge_events:

```
id | survivor_employer_id | victim_employer_ids | created_at | payload_summary
1 | 78 | [79] | 2026-03-31 | {"alias_names": ["APPLUS+ PLY LTD"], "workers_updated": 0, "canonical_employer_name": "APPLUS+ PTY LTD"}
2 | 37 | [76, 77] | 2026-03-31 | {"alias_names": ["AOS CONTRACT DREDGING", "AUSTRALIAN OFFSHORE SOLUTIONS (AOS) PTY LTD"], "workers_updated": 0, "canonical_employer_name": "AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD"}
5 | 17 | [295] | 2026-03-31 | {"alias_names": ["DBP/APA"], "workers_updated": 0, "canonical_employer_name": "DAMPIER BUNBURY NATURAL GAS PIPELINE (DBNGP)\r\nNATIONAL CONTROL CENTRE"}
6 | 39 | [81] | 2026-03-31 | {"alias_names": ["DOF SUBSEA AUSTRALIA PTY LTD"], "workers_updated": 0, "canonical_employer_name": "DOF MANAGEMENT AUSTRALIA PTY LTD"}
7 | 33 | [32, 87] | 2026-03-31 | {"alias_names": ["IAS GROUP", "UGL OPERATIONS AND"], "workers_updated": 0, "canonical_employer_name": "UGL RESOURCES (CONTRACTING) PTY LTD"}
8 | 40 | [82] | 2026-03-31 | {"alias_names": ["FUGRO AUSTRALIA MARINE PTY LTD"], "workers_updated": 0, "canonical_employer_name": "FUGRO AUSTRALIA PTY LTD"}
9 | 6 | [89] | 2026-03-31 | {"alias_names": ["JADESTONE ENERGRY MONTARA VENTURE"], "workers_updated": 0, "canonical_employer_name": "JADESTONE ENERGY MONTARA VENTURE"}
10 | 19 | [20, 67, 90, 91] | 2026-03-31 | {"alias_names": ["KUIPER AUSTRALIA PTYLTD", "KUIPER AUSTRALIA PTYLTD -", "KUIPER ENERGY", "KUIPER ENERGY SOLUTIONS PTY LTD"], "workers_updated": 0, "canonical_employer_name": "KUIPER AUSTRALIA PTY LTD"}
11 | 43 | [49, 63] | 2026-03-31 | {"alias_names": ["OSM"], "workers_updated": 0, "canonical_employer_name": "OSM Australia Pty Ltd"}
12 | 19 | [696] | 2026-03-31 | {"alias_names": ["ERIS"], "workers_updated": 0, "canonical_employer_name": "KUIPER AUSTRALIA PTY LTD"}
13 | 21 | [92] | 2026-03-31 | {"alias_names": ["LEGENEERING SERVICES PTY LTD"], "workers_updated": 0, "canonical_employer_name": "LEGENEERING (AUST.) PTY LTD"}
14 | 68 | [80] | 2026-03-31 | {"alias_names": ["MCDERMOTT AUSTRALIA (CREWING SERVICES) PTY LTD"], "workers_updated": 0, "canonical_employer_name": "MCDERMOTT AUSTRALIA PTY LTD"}
15 | 26 | [22, 23, 24, 42, 69, 697] | 2026-03-31 | {"alias_names": ["M MAINTENANCE SERVICES PTY LTD", "M&ISS PTY LTD", "MEA", "MEA PTY LTD", "MMA", "Monadelphous"], "workers_updated": 0, "canonical_employer_name": "MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD"}
16 | 93 | [8] | 2026-03-31 | {"alias_names": ["MODEC MANAGEMENT SERVICES PTE"], "workers_updated": 0, "canonical_employer_name": "MODEC Management Services"}
17 | 54 | [55, 56] | 2026-03-31 | {"alias_names": ["PHI INTERNATIONAL AUSTRALIA KIMBERLEY ENGINEERING AND RAMP STAFF", "PHI INTERNATIONAL AUSTRALIA PTY LTD"], "workers_updated": 0, "canonical_employer_name": "PHI INTERNATIONAL AUSTRALIA GASCOYNE ENGINEERING AND RAMP STAFF"}
18 | 29 | [30, 31, 96] | 2026-03-31 | {"alias_names": ["RIDGEBAY HOLDINGS KARRATHA", "RIDGEBAY HOLDINGS PTY LTD", "SPECIALIST PEOPLE"], "workers_updated": 0, "canonical_employer_name": "REC – ALTRAD"}
19 | 29 | [94] | 2026-03-31 | {"alias_names": ["R.E.C."], "workers_updated": 0, "canonical_employer_name": "REC – ALTRAD"}
20 | 28 | [44, 45, 50, 51, 74, 86] | 2026-03-31 | {"alias_names": ["PROGRAMMED MARINE PTY LTD", "PROGRAMMED OFFSHORE PTY LTD", "RFM OFFSHORE PTY LTD", "RFM OS PTY LTD", "RIGFORCE", "RIGFORCE CONTRACTING PTY LTD"], "workers_updated": 0, "canonical_employer_name": "PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD"}
21 | 29 | [95] | 2026-03-31 | {"alias_names": ["SPECIALIST PEOPLE –"], "workers_updated": 0, "canonical_employer_name": "ALTRAD"}
22 | 37 | [85] | 2026-03-31 | {"alias_names": ["AOS PTY LTD"], "workers_updated": 0, "canonical_employer_name": "AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD"}
3 |  | [60] | 2026-03-31 | {"alias_names": ["COMPASS GROUP ESS"], "workers_updated": 0, "canonical_employer_name": "COMPASS GROUP - ESS"}
4 |  | [61] | 2026-03-31 | {"alias_names": ["COMPASS GROUP-"], "workers_updated": 0, "canonical_employer_name": "COMPASS GROUP - ESS"}
23 | 58 | [59] | 2026-03-31 | {"alias_names": ["COMPASS GROUP - ESS"], "workers_updated": 0, "canonical_employer_name": "COMPASS GROUP –"}
```

Statement 4 — category distribution:

```
category | count
(null) | 73
Subcontractor | 65
Specialist | 29
Major_Contractor | 8
Principal_Employer | 7
Producer | 3
Labour_Hire | 2
```

Statement 5 — naming-convention split by created month:

```
convention | created_month | count
mixed case | 2026-03 | 10
UPPERCASE | 2026-03 | 59
mixed case | 2026-04 | 90
UPPERCASE | 2026-04 | 5
UPPERCASE | 2026-05 | 1
mixed case | 2026-06 | 5
UPPERCASE | 2026-06 | 1
mixed case | 2026-09 | 15
UPPERCASE | 2026-09 | 1
```

### 02_profile_worksites.sql

Statement 1 — one row per worksite:

```
worksite_id | worksite_name | worksite_type | is_offshore | basin | is_active | parent_worksite_id | created | principal_employer | operator | has_coords | active_workers | employer_roles | agreement_links | campaign_universes | aliases
178 | Acciona Jackup barge | Other | True |  | True |  | 2026-04-01 |  |  | False | 2 | 0 | 0 | 0 | 0
184 | AGIG Control Roo | Other | True |  | True |  | 2026-04-01 |  |  | False | 1 | 0 | 0 | 0 | 0
170 | Alkimos | Other | True |  | True |  | 2026-04-01 |  |  | True | 5 | 0 | 0 | 0 | 0
181 | Alkimos marine works | Other | True |  | True |  | 2026-04-01 |  |  | True | 1 | 1 | 0 | 0 | 0
180 | Alkimos seawater alliance | Other | True |  | True |  | 2026-04-01 |  |  | True | 1 | 0 | 0 | 0 | 0
439 | All Seas | Vessel | False |  | True |  | 2026-09-20 |  |  | False | 0 | 0 | 0 | 0 | 0
264 | Anchor Handlers | Vessel | True |  | True |  | 2026-06-10 | Solstad Offshore ASA |  | False | 2 | 1 | 0 | 0 | 0
237 | Andreas Viking | Vessel | True |  | True |  | 2026-06-10 | Cyan Renewables |  | False | 2 | 2 | 0 | 1 | 0
157 | Angel Platform | Platform | True |  | True |  | 2026-04-01 |  |  | True | 5 | 1 | 0 | 0 | 0
179 | ASWA Beverly | Other | True |  | True |  | 2026-04-01 |  |  | False | 2 | 0 | 0 | 0 | 0
153 | Audacia | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 8 | 0 | 0 | 0 | 0
430 | Australian Submarine Corporation | Other | False |  | True |  | 2026-08-24 |  |  | False | 0 | 0 | 0 | 0 | 0
185 | AWU Head Office | Other | True |  | True |  | 2026-04-01 |  |  | False | 0 | 0 | 0 | 0 | 0
420 | Barge catering | Other | True |  | True |  | 2026-06-11 |  |  | False | 10 | 1 | 0 | 0 | 0
438 | Barossa Field | Gas_Field | False |  | True |  | 2026-09-20 |  |  | False | 4 | 0 | 0 | 0 | 0
421 | Barrow Island CO2 | Other | True |  | True |  | 2026-07-20 |  |  | False | 82 | 1 | 0 | 2 | 0
162 | Bayu Undan | Other | True |  | True |  | 2026-04-01 |  |  | True | 4 | 0 | 0 | 0 | 0
182 | Beverley jub alkimos | Other | True |  | True |  | 2026-04-01 |  |  | True | 1 | 0 | 0 | 0 | 0
241 | Bigroll Bering | Vessel | True |  | True |  | 2026-06-10 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD |  | False | 3 | 1 | 0 | 1 | 1
222 | Boka Centre | Other | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 1 | 1 | 0 | 1 | 0
8 | Brewster Drill Centre | Drill_Centre | True | Browse | True |  | 2026-03-10 | Inpex | INPEX - ICHTHYS OPERATIONS | True | 0 | 2 | 1 | 0 | 0
224 | Bridge | Other | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 1 | 1 | 0 | 1 | 0
163 | Broome Airport | Airfield | True |  | True |  | 2026-04-01 |  |  | True | 13 | 2 | 0 | 0 | 0
25 | BW Offshore FPSO | FPSO | True | Carnarvon | True |  | 2026-03-10 |  | BW | True | 69 | 1 | 1 | 0 | 0
441 | Bw Opal HUC | Other | False |  | True |  | 2026-09-20 |  |  | False | 12 | 0 | 0 | 0 | 0
223 | Castorone | Other | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 30 | 1 | 0 | 1 | 0
202 | CASUAL EMPLOYEES | Other | True |  | True |  | 2026-05-04 | COMPASS GROUP – |  | False | 6 | 2 | 0 | 1 | 0
4 | Chevron Facilities (General) | Onshore_Facilities | False | Carnarvon | False |  | 2026-03-10 | Chevron | CHEVRON GORGON OPERATIONS | True | 1 | 2 | 2 | 0 | 0
257 | CMV Athos | Vessel | True |  | True |  | 2026-06-10 | BHAGWAN MARINE LTD |  | False | 4 | 1 | 0 | 1 | 0
6 | Crux Gas Field | Gas_Field | True | Browse | True |  | 2026-03-10 | Shell | SHELL PRELUDE | True | 37 | 5 | 1 | 2 | 0
187 | Darwin Airport | Airfield | True |  | True |  | 2026-04-01 |  |  | True | 1 | 0 | 0 | 0 | 0
140 | Darwin ILNG | Onshore_LNG | False |  | True |  | 2026-03-27 | Inpex |  | True | 13 | 2 | 0 | 2 | 0
24 | DBNGP Pipeline | Pipeline | False | N/A | True |  | 2026-03-10 |  | DAMPIER BUNBURY NATURAL GAS PIPELINE (DBNGP)  NATIONAL CONTROL CENTRE | True | 4 | 3 | 1 | 0 | 0
151 | Deep Orient | Other | True |  | True |  | 2026-04-01 |  |  | False | 23 | 1 | 0 | 1 | 0
150 | DLV2000 | Other | True |  | True |  | 2026-04-01 |  |  | False | 92 | 3 | 0 | 2 | 0
253 | Dof Subsea | Vessel | True |  | True |  | 2026-06-10 | DOF MANAGEMENT AUSTRALIA PTY LTD |  | False | 1 | 1 | 0 | 0 | 0
215 | DOF Vessels | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 4 | 1 | 0 | 0 | 0
258 | DP2 Seamaster | Vessel | True |  | True |  | 2026-06-10 | BHAGWAN MARINE LTD |  | False | 2 | 1 | 0 | 1 | 0
156 | DPS1 | Other | True |  | True |  | 2026-04-01 |  |  | False | 2 | 1 | 0 | 0 | 0
259 | Dryden | Vessel | True |  | True |  | 2026-06-10 | BHAGWAN MARINE LTD |  | False | 2 | 1 | 0 | 1 | 0
449 | Equinox | Vessel | False |  | True |  | 2026-09-21 |  |  | False | 6 | 0 | 0 | 0 | 0
146 | Explorer CPF | CPF | True |  | True | 148 | 2026-03-27 | Inpex |  | True | 278 | 1 | 0 | 1 | 0
171 | Felicity PSV | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 0 | 2 | 0 | 1 | 0
261 | Floatel Triumph | Accommodation_Vessel | True |  | True |  | 2026-06-10 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD |  | False | 6 | 1 | 0 | 1 | 0
240 | Floatel triumph | Accommodation_Vessel | True |  | True |  | 2026-06-10 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD |  | False | 0 | 1 | 0 | 0 | 0
229 | Fortitude | Other | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 1 | 1 | 0 | 1 | 0
221 | Fugro Etive | Vessel | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 31 | 1 | 0 | 2 | 0
227 | Fugro Etive, Furgo Maali, Fugro Kwilena | Other | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 0 | 1 | 0 | 0 | 0
423 | Fugro unmanned remote | Other | True |  | True |  | 2026-08-11 |  |  | False | 0 | 1 | 0 | 1 | 0
422 | Fugro Workshop | Other | True |  | True |  | 2026-08-11 |  |  | False | 1 | 1 | 0 | 1 | 0
22 | Gascoyne Airfield | Airfield | False | N/A | True |  | 2026-03-10 |  | PHI INTERNATIONAL AUSTRALIA  | True | 0 | 2 | 1 | 0 | 0
226 | Gateway | Other | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 1 | 1 | 0 | 1 | 0
246 | Go Aurelia | Vessel | True |  | True |  | 2026-06-10 | GO OFFSHORE |  | False | 5 | 1 | 0 | 1 | 0
250 | Go Offshore | Vessel | True |  | True |  | 2026-06-10 | GO OFFSHORE |  | False | 20 | 2 | 0 | 1 | 0
245 | Go Provider | Vessel | True |  | True |  | 2026-06-10 | GO OFFSHORE |  | False | 8 | 1 | 0 | 1 | 1
247 | Go Sirius | Vessel | True |  | True |  | 2026-06-10 | GO OFFSHORE |  | False | 1 | 1 | 0 | 1 | 0
249 | Go Spica | Vessel | True |  | True |  | 2026-06-10 | GO OFFSHORE |  | False | 1 | 1 | 0 | 1 | 0
143 | Goodwyn | Platform | True |  | True |  | 2026-03-27 | Woodside |  | True | 194 | 4 | 2 | 1 | 0
1 | Gorgon LNG | Onshore_LNG | False | Carnarvon | True |  | 2026-03-10 | Chevron | CHEVRON GORGON OPERATIONS | True | 469 | 3 | 2 | 3 | 0
435 | Harriett | Other | False |  | True |  | 2026-09-17 |  |  | False | 4 | 0 | 0 | 0 | 0
148 | Ichthys | Other | True |  | False |  | 2026-03-27 | Inpex |  | True | 6 | 0 | 0 | 0 | 0
147 | Ichthys FPSO | FPSO | True |  | True |  | 2026-03-27 | Inpex |  | True | 18 | 0 | 0 | 0 | 0
7 | Ichthys LNG | FPSO | True | Browse | False |  | 2026-03-10 | Inpex | INPEX - ICHTHYS OPERATIONS | True | 0 | 4 | 4 | 0 | 0
443 | Inpex Endeavour CPF | Platform | False |  | True |  | 2026-09-21 |  |  | False | 6 | 0 | 0 | 0 | 0
160 | Inpex Venturer FPSO | FPSO | True |  | True |  | 2026-04-01 |  |  | True | 193 | 1 | 0 | 1 | 0
436 | Jansz FCS | Platform | False |  | True |  | 2026-09-20 |  |  | False | 7 | 0 | 0 | 0 | 0
262 | Jasmin | Vessel | True |  | True |  | 2026-06-10 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD |  | False | 1 | 1 | 0 | 1 | 0
244 | Jetwave Jasmin | Vessel | True |  | True |  | 2026-06-10 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD |  | False | 1 | 1 | 0 | 1 | 0
266 | Jetwave Lightning | Vessel | True |  | True |  | 2026-06-10 | JETWAVE MARINE SERVICES PTY. LTD. |  | False | 1 | 1 | 0 | 1 | 0
269 | JF J De Nul | Vessel | True |  | True |  | 2026-06-10 | Jan De Nul |  | False | 2 | 1 | 0 | 1 | 0
437 | JIC/Gorgon | Other | False |  | True |  | 2026-09-20 |  |  | False | 2 | 0 | 0 | 0 | 0
433 | Jsd6000 | Vessel | False |  | True |  | 2026-09-17 |  |  | False | 5 | 0 | 0 | 0 | 0
440 | Juan Sebastian de Elcano | Vessel_Other | False |  | True |  | 2026-09-20 |  |  | False | 0 | 0 | 0 | 0 | 0
20 | Karratha (Town/Industrial) | Other | False | N/A | True |  | 2026-03-10 |  |  | True | 41 | 2 | 2 | 0 | 0
159 | Karratha Airport | Airfield | True |  | True |  | 2026-04-01 |  |  | True | 9 | 0 | 0 | 0 | 0
136 | Karratha Gas Plant | Gas_Plant | False |  | True |  | 2026-03-27 | Woodside |  | True | 173 | 3 | 3 | 1 | 0
21 | Karratha MPT Heliport | Heliport | False | N/A | True |  | 2026-03-10 |  | PHI INTERNATIONAL AUSTRALIA  | True | 2 | 2 | 1 | 0 | 0
200 | KBSB | Onshore_Facilities | False |  | True |  | 2026-04-20 | Woodside | WOODSIDE ENERGY LTD | False | 2 | 1 | 0 | 1 | 0
23 | Kimberley Airfield | Airfield | False | N/A | True |  | 2026-03-10 |  | PHI INTERNATIONAL AUSTRALIA  | True | 0 | 2 | 1 | 0 | 0
444 | King Bay - Dampier port | Other | False |  | True |  | 2026-09-21 |  |  | False | 0 | 0 | 0 | 0 | 0
165 | Kwinana | Other | True |  | True |  | 2026-04-01 |  |  | True | 1 | 0 | 0 | 0 | 0
225 | LV108 | Other | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 5 | 1 | 0 | 1 | 0
10 | Macedon Gas Plant | Gas_Plant | False | Carnarvon | True |  | 2026-03-10 | Woodside | WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO | True | 3 | 2 | 1 | 0 | 0
158 | Maersk Deliverer | Other | True |  | True |  | 2026-04-01 |  |  | False | 7 | 2 | 0 | 1 | 0
217 | Manticore | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 1 | 1 | 0 | 1 | 0
416 | Mariner (field) | Gas_Field | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 1 | 1 | 0 | 1 | 0
425 | MEEF decommissioning | Other | True |  | True |  | 2026-08-20 |  |  | False | 0 | 0 | 0 | 0 | 0
236 | Mermaid Cove | Vessel | True |  | True |  | 2026-06-10 | Cyan Renewables |  | False | 3 | 1 | 0 | 1 | 0
235 | Mermaid Sound | Other | True |  | True |  | 2026-06-10 | Cyan Renewables |  | False | 0 | 1 | 0 | 1 | 0
173 | MMA Brewster | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 4 | 1 | 0 | 1 | 0
174 | Mma coral | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 2 | 1 | 0 | 1 | 0
233 | MMA Harmony | Vessel | True |  | True |  | 2026-06-10 | Cyan Renewables |  | False | 5 | 1 | 0 | 1 | 0
175 | MMA Inscription | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 12 | 2 | 0 | 1 | 0
238 | MMA LEEUWIN | Vessel | True |  | True |  | 2026-06-10 | Cyan Renewables |  | False | 2 | 1 | 0 | 1 | 0
234 | MMA Monarch | Vessel | True |  | True |  | 2026-06-10 | Cyan Renewables |  | False | 0 | 1 | 0 | 0 | 0
166 | MMA Pinnacle | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 46 | 3 | 0 | 2 | 0
167 | MMA Plover | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 4 | 1 | 0 | 1 | 0
270 | MMA vessel | Vessel | True |  | True |  | 2026-06-10 | MMA |  | False | 1 | 1 | 0 | 0 | 0
172 | MMA Vigilant | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 1 | 1 | 0 | 1 | 0
15 | Montara Venture FPSO | FPSO | True | Bonaparte | True |  | 2026-03-10 | Jadestone | JADESTONE ENERGY MONTARA VENTURE | True | 84 | 1 | 1 | 0 | 0
169 | MV Pride | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 0 | 0 | 0 | 0 | 0
11 | Ngujima-Yin FPSO | FPSO | True | Carnarvon | True |  | 2026-03-10 | Woodside | WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO | True | 44 | 2 | 2 | 0 | 0
17 | Ningaloo Vision FPSO | FPSO | True | Carnarvon | True |  | 2026-03-10 | Santos | TEEKAY SHIPPING (AUSTRALIA) PTY LTD | True | 7 | 1 | 1 | 0 | 0
242 | Noble Deliverer | Vessel | True |  | True |  | 2026-06-10 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD |  | False | 10 | 2 | 0 | 1 | 0
446 | Noble Tom Prosser | Vessel | False |  | True |  | 2026-09-21 |  |  | False | 1 | 0 | 0 | 0 | 0
265 | Normand Ranger | Other | True |  | True |  | 2026-06-10 | Solstad Offshore ASA |  | False | 1 | 1 | 0 | 1 | 0
263 | Normand Saracen | Vessel | True |  | True |  | 2026-06-10 | Solstad Offshore ASA |  | False | 5 | 1 | 0 | 1 | 0
418 | Normand Scorpion | Other | True |  | True |  | 2026-06-10 | Solstad Offshore ASA |  | False | 2 | 1 | 0 | 1 | 0
9 | North West Shelf (NWS) Platforms | Platform | True | Carnarvon | False |  | 2026-03-10 | Woodside | WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO | True | 29 | 6 | 2 | 1 | 0
19 | Northern Endeavour FPSO | FPSO | True | Bonaparte | False |  | 2026-03-10 |  |  | True | 15 | 2 | 2 | 0 | 0
195 | Not Currently Deployed | Other | False |  | True |  | 2026-04-04 |  |  | False | 8 | 4 | 0 | 1 | 0
154 | Ocean Apex | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 14 | 0 | 0 | 0 | 0
168 | Ocean Monarch | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 1 | 0 | 0 | 0 | 0
12 | Okha FPSO | FPSO | True | Carnarvon | True |  | 2026-03-10 | Woodside | WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO | True | 43 | 2 | 2 | 0 | 0
188 | Pacific Dilgence | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 0 | 0 | 0 | 0 | 0
447 | Pacific Dove | Vessel | False |  | True |  | 2026-09-21 |  |  | False | 0 | 0 | 0 | 0 | 0
216 | Pacific Grackle | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 3 | 2 | 0 | 1 | 0
206 | Pacific Guillemot | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 2 | 2 | 0 | 1 | 0
189 | Pacific Liberty | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 1 | 1 | 0 | 1 | 0
260 | Pacific Rapier | Vessel | True |  | True |  | 2026-06-10 | TIDEWATER SHIP MANAGEMENT (AUSTRALIA) PTY LTD |  | False | 1 | 1 | 0 | 1 | 0
214 | Pacific Valor | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 1 | 1 | 0 | 1 | 0
220 | Pacific Vulcan | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 1 | 1 | 0 | 1 | 0
208 | Pacifica Gannet | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 4 | 2 | 0 | 1 | 0
183 | perdaman | Other | True |  | True |  | 2026-04-01 |  |  | True | 0 | 0 | 0 | 0 | 0
164 | Perth Office | Other | True |  | True |  | 2026-04-01 |  |  | True | 27 | 0 | 0 | 0 | 0
138 | Pluto 2 | Onshore_LNG | False |  | True |  | 2026-03-27 | Woodside |  | True | 204 | 0 | 0 | 0 | 0
442 | Pluto Alpha Platform | Platform | False |  | True |  | 2026-09-21 |  |  | False | 4 | 0 | 0 | 0 | 0
137 | Pluto LNG | Onshore_LNG | False |  | True |  | 2026-03-27 | Woodside |  | True | 99 | 2 | 0 | 2 | 0
243 | Posh Teal | Vessel | True |  | True |  | 2026-06-10 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD |  | False | 1 | 1 | 0 | 1 | 0
5 | Prelude FLNG | FLNG | True | Browse | True |  | 2026-03-10 | Shell | SHELL PRELUDE | True | 452 | 4 | 3 | 1 | 0
18 | Pyrenees Venture FPSO | FPSO | True | Carnarvon | True |  | 2026-03-10 | Woodside | MODEC Management Services | True | 38 | 1 | 1 | 0 | 0
427 | Q7000 | Vessel | True |  | True |  | 2026-08-20 |  |  | False | 1 | 0 | 0 | 0 | 0
144 | Rankin North | Platform | True |  | True |  | 2026-03-27 | Woodside |  | True | 171 | 3 | 1 | 2 | 0
232 | Reach Subsea | Vessel | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 4 | 1 | 0 | 0 | 0
428 | Remote operation centre | Other | True |  | True |  | 2026-08-20 |  |  | False | 1 | 0 | 0 | 0 | 0
239 | Safe Boreas | Vessel | True |  | True |  | 2026-06-10 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD |  | False | 8 | 2 | 0 | 1 | 0
230 | SAIPEM CONSTELLATION | Vessel | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 21 | 1 | 0 | 1 | 0
161 | Sandpiper | Other | True |  | True |  | 2026-04-01 |  |  | False | 2 | 0 | 0 | 0 | 0
201 | Sapura Constructor | Other | True |  | True |  | 2026-04-22 |  | ERIS | False | 2 | 2 | 0 | 2 | 0
231 | Scandi Emerald | Vessel | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 1 | 1 | 0 | 0 | 1
145 | Scarborough FPU | FPU | True |  | True |  | 2026-03-27 | Woodside |  | True | 57 | 3 | 0 | 2 | 0
219 | SEA1 Anchor Handlers | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 0 | 1 | 0 | 0 | 0
204 | Sea1 Emerald | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 11 | 2 | 0 | 1 | 1
207 | Sea1 Sapphire | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 5 | 3 | 0 | 1 | 1
190 | Seeker Tide | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 0 | 3 | 0 | 0 | 0
429 | Seven Arctic | Vessel | True |  | True |  | 2026-08-21 |  |  | False | 3 | 0 | 0 | 0 | 0
176 | Seven Oceanic Subsea 7 | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 16 | 1 | 0 | 1 | 0
415 | Seven Sisters | Vessel | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 25 | 2 | 0 | 2 | 0
419 | Shell | Other | True |  | True |  | 2026-06-11 | GO OFFSHORE |  | False | 4 | 1 | 0 | 0 | 0
210 | Siem AHTS | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 0 | 1 | 0 | 0 | 0
218 | Siem Amethyst | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 1 | 1 | 0 | 1 | 0
205 | Siem Aquamarine | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 8 | 1 | 0 | 1 | 1
209 | Siem Pilot | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 2 | 1 | 0 | 1 | 0
212 | Siem symphony | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 10 | 1 | 0 | 1 | 1
203 | Siem Thiima | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 10 | 1 | 0 | 1 | 1
252 | Skandi Darwin | Vessel | True |  | True |  | 2026-06-10 | DOF MANAGEMENT AUSTRALIA PTY LTD |  | False | 4 | 1 | 0 | 1 | 0
228 | Skandi Hercules | Other | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 31 | 2 | 0 | 1 | 0
426 | skandi inventor | Vessel | True |  | True |  | 2026-08-20 |  |  | False | 4 | 0 | 0 | 0 | 0
255 | skandi peregrino | Vessel | True |  | True |  | 2026-06-10 | DOF MANAGEMENT AUSTRALIA PTY LTD |  | False | 1 | 1 | 0 | 1 | 0
256 | Skandi Singapore | Other | True |  | True |  | 2026-06-10 | DOF MANAGEMENT AUSTRALIA PTY LTD |  | False | 25 | 1 | 0 | 1 | 0
254 | Skandi Vessels | Vessel | True |  | True |  | 2026-06-10 | DOF MANAGEMENT AUSTRALIA PTY LTD |  | False | 0 | 1 | 0 | 0 | 0
16 | Stag CPF | CPF | True | Carnarvon | True |  | 2026-03-10 | Jadestone | JADESTONE ENERGY MONTARA VENTURE | True | 8 | 2 | 1 | 1 | 0
177 | Subsea 7 Pegasus | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 1 | 2 | 0 | 1 | 0
268 | Swan Tide | Other | True |  | True |  | 2026-06-10 | SIERA MARINE MANAGEMENT PTY LTD |  | False | 7 | 2 | 0 | 1 | 0
197 | TEST · TestCo 2 — Alpha FPSO | FPSO | True |  | True |  | 2026-04-16 | TestCo 2 |  | True | 107 | 2 | 0 | 2 | 0
198 | TEST · TestCo 2 — Bravo Platform | Platform | True |  | True |  | 2026-04-16 | TestCo 2 |  | True | 104 | 2 | 0 | 2 | 0
199 | TEST · TestCo 2 — Charlie FPU | FPU | True |  | True |  | 2026-04-16 | TestCo 2 |  | True | 104 | 2 | 0 | 2 | 0
196 | Test Onshore Gas Plant | Gas_Plant | False |  | True |  | 2026-04-09 | TestCo Energy |  | True | 350 | 4 | 0 | 0 | 0
448 | Tidewater | Vessel | False |  | True |  | 2026-09-21 |  |  | False | 0 | 0 | 0 | 0 | 0
211 | Tortuga Tide | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 3 | 2 | 0 | 1 | 0
191 | Transocean | Other | True |  | True |  | 2026-04-01 |  |  | False | 1 | 1 | 0 | 1 | 0
155 | Transocean Endurance | Platform | True |  | True |  | 2026-04-01 |  |  | True | 23 | 2 | 0 | 2 | 0
445 | Transocean Equinox | Vessel | False |  | True |  | 2026-09-21 |  |  | False | 6 | 0 | 0 | 0 | 0
431 | Tubridgi Gas Storage | Gas_Plant | False |  | True |  | 2026-09-17 |  |  | False | 2 | 0 | 0 | 0 | 0
432 | Tubridigi Gas Storage | Other | False |  | True |  | 2026-09-17 |  |  | False | 1 | 0 | 0 | 0 | 0
413 | Unspecified | Other | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 26 | 11 | 0 | 1 | 0
152 | Valaris 107 | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 37 | 2 | 0 | 1 | 0
193 | Valaris 247 | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 0 | 0 | 0 | 0 | 0
194 | Valaris DPS-1 | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 5 | 1 | 0 | 1 | 0
424 | Valaris MS-1 | Vessel | True |  | True |  | 2026-08-20 |  |  | False | 5 | 0 | 0 | 0 | 0
14 | Varanus Island | Gas_Plant | False | Carnarvon | True |  | 2026-03-10 | Santos | SANTOS WA ENERGY LIMITED VARANUS ISLAND HUB | True | 66 | 2 | 1 | 1 | 0
414 | VE Constructor | Vessel | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 2 | 1 | 0 | 1 | 0
26 | WA/NT Offshore (General) | Region | True | Multiple | True |  | 2026-03-10 |  |  | False | 39 | 11 | 7 | 1 | 0
192 | Waitisa Gas Plant | Gas_Plant | True |  | True |  | 2026-04-01 |  |  | True | 1 | 0 | 0 | 0 | 0
434 | Waitsia | Gas_Plant | False |  | True |  | 2026-09-17 |  |  | False | 2 | 0 | 0 | 0 | 0
142 | Wandoo A | Platform | True |  | True |  | 2026-03-27 | Vermilion |  | True | 2 | 0 | 0 | 0 | 0
141 | Wandoo B | Platform | True |  | True |  | 2026-03-27 | Vermilion |  | True | 15 | 0 | 0 | 0 | 0
186 | Watsia gas plant Dongara onshore | Gas_Plant | True |  | True |  | 2026-04-01 |  |  | True | 2 | 0 | 0 | 0 | 0
213 | WB400 | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 8 | 1 | 0 | 1 | 0
139 | Wheatstone LNG | Onshore_LNG | False |  | True |  | 2026-03-27 | Chevron |  | True | 107 | 2 | 0 | 2 | 0
2 | Wheatstone LNG (Downstream) | Onshore_LNG | False | Carnarvon | True |  | 2026-03-10 | Chevron | CHEVRON GORGON OPERATIONS | True | 127 | 3 | 2 | 0 | 0
3 | Wheatstone Platform | Platform | True | Carnarvon | True |  | 2026-03-10 | Chevron | CHEVRON GORGON OPERATIONS | True | 80 | 5 | 3 | 1 | 0
13 | Woodside Onshore Facilities | Onshore_Facilities | False | Carnarvon | False |  | 2026-03-10 | Woodside | WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO | True | 4 | 5 | 2 | 1 | 0
450 | Workshop | Onshore_Facilities | False |  | True |  | 2026-09-21 |  |  | False | 1 | 0 | 0 | 0 | 0
```

Statement 2 — worksite_type counts:

```
worksite_type | count
Vessel | 83
Other | 50
Platform | 12
FPSO | 11
Gas_Plant | 8
Onshore_LNG | 6
Airfield | 5
Onshore_Facilities | 4
Gas_Field | 3
CPF | 2
Accommodation_Vessel | 2
FPU | 2
Heliport | 1
FLNG | 1
Drill_Centre | 1
Vessel_Other | 1
Pipeline | 1
Region | 1
```

Statement 3 — basin counts:

```
basin | count
(null) | 168
Carnarvon | 14
N/A | 5
Browse | 4
Bonaparte | 2
Multiple | 1
```

Statement 4 — worksite aliases:

```
alias_name | canonical | source
Big Roll Bering | Bigroll Bering | import
MV Go Provider | Go Provider | import
Scandi Emerald; DLV2000 | Scandi Emerald | import
Sea 1 Emerald | Sea1 Emerald | import
Siem Sapphire | Sea1 Sapphire | import
Sea1 Aquamarine | Siem Aquamarine | import
Siwm symphony | Siem symphony | import
MV Siem Thiima | Siem Thiima | import
```

### 03_profile_workers_links.sql

Statement 1 — worker link coverage:

```
active | total | no_employer | no_worksite | neither | no_member_number | no_reference_id | no_canonical_occupation | no_union | no_membership_type | has_project | has_shift_area_or_panel
5749 | 6564 | 39 | 929 | 33 | 5445 | 1306 | 1357 | 5445 | 182 | 662 | 0
```

Statement 2 — created-month histogram (bulk-load signature):

```
created_month | count
2026-04 | 1146
2026-05 | 282
2026-06 | 607
2026-07 | 106
2026-08 | 266
2026-09 | 4157
```

Statement 3 — employer × worksite pairs implied by workers but missing from `employer_worksite_roles` (summary):

```
distinct_pairs | pairs_not_in_roles | workers_in_unrecorded_pairs
548 | 381 | 2393
```

Statement 4 — the unrecorded pairs themselves, largest first:

```
employer_name | worksite_name | workers
Bechtel Australia | Pluto 2 | 189
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Prelude FLNG | 114
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Goodwyn | 112
INPEX - ICHTHYS OPERATIONS | Explorer CPF | 105
Downer EDI Group | Gorgon LNG | 99
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Rankin North | 83
INPEX - ICHTHYS OPERATIONS | Inpex Venturer FPSO | 70
ALTRAD | Barrow Island CO2 | 41
Santos | Varanus Island | 40
CHEVRON WHEATSTONE DOWNSTREAM OPERATIONS | Wheatstone LNG | 36
SODEXO REMOTE SITE | Prelude FLNG | 36
Aegis Offshore Maintenance Pty Ltd | TEST · TestCo 2 — Charlie FPU | 36
Aegis Offshore Maintenance Pty Ltd | TEST · TestCo 2 — Bravo Platform | 36
Aegis Offshore Maintenance Pty Ltd | TEST · TestCo 2 — Alpha FPSO | 36
APPLUS+ PTY LTD | Karratha Gas Plant | 35
UGL RESOURCES (CONTRACTING) PTY LTD | Karratha Gas Plant | 31
Offshore Crew Services Ltd | TEST · TestCo 2 — Bravo Platform | 28
Offshore Crew Services Ltd | TEST · TestCo 2 — Alpha FPSO | 28
Offshore Crew Services Ltd | TEST · TestCo 2 — Charlie FPU | 28
LEGENEERING (AUST.) PTY LTD | Okha FPSO | 24
ERIS | Castorone | 24
ERIS | Prelude FLNG | 23
LEGENEERING (AUST.) PTY LTD | Ngujima-Yin FPSO | 22
Bechtel Australia | Pluto LNG | 22
FUGRO AUSTRALIA PTY LTD | Fugro Etive | 21
UGL RESOURCES (CONTRACTING) PTY LTD | Gorgon LNG | 21
Modec | Pyrenees Venture FPSO | 20
WOODSIDE ENERGY LTD | Ngujima-Yin FPSO | 20
WOOD | Prelude FLNG | 19
WOODSIDE ENERGY LTD | Okha FPSO | 18
ALTRAD | Wheatstone Platform | 17
ERIS | Deep Orient | 16
Shell | Crux Gas Field | 16
PHI INTERNATIONAL AUSTRALIA  | Karratha (Town/Industrial) | 15
Vertech | Barrow Island CO2 | 15
ERIS | Seven Oceanic Subsea 7 | 15
ERIS | SAIPEM CONSTELLATION | 15
LEGENEERING (AUST.) PTY LTD | Montara Venture FPSO | 14
SEDCO FOREX INTERNATIONAL INC | Transocean Endurance | 14
WOODSIDE ENERGY LTD | Karratha Gas Plant | 14
APPLUS+ PTY LTD | Prelude FLNG | 14
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Ichthys FPSO | 13
DIAMOND | Ocean Apex | 13
WOODSIDE ENERGY LTD | Scarborough FPU | 13
COMPASS GROUP – | Explorer CPF | 12
ERIS | Scarborough FPU | 12
Parabellum International | Wheatstone LNG | 12
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Scarborough FPU | 11
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Bw Opal HUC | 11
CHC HELICOPTER (AUSTRALIA) AIRCRAFT ENGINEERS | Broome Airport | 11
UGL RESOURCES (CONTRACTING) PTY LTD | Wheatstone Platform | 10
Vertech | Gorgon LNG | 10
AGIG | Perth Office | 10
CHC HELICOPTER (AUSTRALIA) AIRCRAFT ENGINEERS | Karratha (Town/Industrial) | 10
ALTRAD | Prelude FLNG | 9
DOF MANAGEMENT AUSTRALIA PTY LTD | WA/NT Offshore (General) | 9
ERIS | Audacia | 8
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Pluto 2 | 8
Kaefer Integrated Services Pty Ltd | Varanus Island | 8
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Northern Endeavour FPSO | 8
COMPASS GROUP – | Inpex Venturer FPSO | 8
DURATEC | Varanus Island | 8
MCDERMOTT AUSTRALIA PTY LTD | Not Currently Deployed | 8
BAKER HUGHES SERVICES AUSTRALIA PTY LTD | WA/NT Offshore (General) | 8
VENTIA AUSTRALIA PTY LTD | Explorer CPF | 7
FUGRO AUSTRALIA PTY LTD | Go Offshore | 7
Cleanaway Waste Management | Barrow Island CO2 | 7
UGL RESOURCES (CONTRACTING) PTY LTD | Wheatstone LNG | 7
ERIS | WA/NT Offshore (General) | 7
SEDCO FOREX INTERNATIONAL INC | Equinox | 6
Mitsui E&P Australia | Karratha Gas Plant | 6
Cleanaway Waste Management | Wheatstone LNG (Downstream) | 6
WOODSIDE ENERGY LTD | Pluto LNG | 6
ugl | Montara Venture FPSO | 6
EnerMech | Pyrenees Venture FPSO | 6
DURATEC | Wandoo B | 6
SEDCO FOREX INTERNATIONAL INC | Transocean Equinox | 6
Vertech | Inpex Venturer FPSO | 6
Offshore Services Australasia | Karratha (Town/Industrial) | 6
Qube Ports & Bulk | Wheatstone LNG | 5
IAS Group | Pyrenees Venture FPSO | 5
SODEXO REMOTE SITE | Montara Venture FPSO | 5
CONTRACT RESOURCES PTY LTD | Montara Venture FPSO | 5
CHC HELICOPTER (AUSTRALIA) AIRCRAFT ENGINEERS | Karratha Airport | 5
Vertech | Montara Venture FPSO | 5
ERIS | Jansz FCS | 5
SODEXO REMOTE SITE | Transocean Endurance | 5
Qube Ports & Bulk | Prelude FLNG | 5
Modec | Montara Venture FPSO | 5
LEGENEERING (AUST.) PTY LTD | Pyrenees Venture FPSO | 5
ALTRAD | Wandoo B | 5
APPLUS+ PTY LTD | Rankin North | 5
APPLUS+ PTY LTD | Barrow Island CO2 | 5
Rigforce Pty Ltd | Noble Deliverer | 5
MSS Security | Gorgon LNG | 4
DOF MANAGEMENT AUSTRALIA PTY LTD | skandi inventor | 4
ALTRAD | Wheatstone LNG (Downstream) | 4
ERIS | Barossa Field | 4
Chevron | Perth Office | 4
MCDERMOTT AUSTRALIA PTY LTD | LV108 | 4
DOF MANAGEMENT AUSTRALIA PTY LTD | DOF Vessels | 4
Kaefer Integrated Services Pty Ltd | BW Offshore FPSO | 4
Parabellum International | Gorgon LNG | 4
CONTRACT RESOURCES PTY LTD | Prelude FLNG | 4
Sitemec Engineering | Jsd6000 | 3
Vermilion | Wandoo B | 3
Parabellum International | Barrow Island CO2 | 3
ENTIER AUSTRALIA PTY LTD | Valaris 107 | 3
ERIS | Northern Endeavour FPSO | 3
APPLUS+ PTY LTD | Pluto LNG | 3
Shell | Prelude FLNG | 3
Cleanaway Waste Management | Gorgon LNG | 3
WOODSIDE ENERGY LTD | Macedon Gas Plant | 3
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Ichthys | 3
LEGENEERING (AUST.) PTY LTD | Ichthys FPSO | 3
CONTRACT RESOURCES PTY LTD | Barrow Island CO2 | 3
Australian Workers' Union WA Branch | Perth Office | 3
Score Group | Inpex Venturer FPSO | 3
WOODSIDE ENERGY LTD | Pluto Alpha Platform | 3
WOODSIDE ENERGY LTD | Pluto 2 | 3
Reach Subsea | Fugro Etive | 3
Offshore Services Australasia | Gorgon LNG | 3
PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Seven Arctic | 3
CONTRACT RESOURCES PTY LTD | Gorgon LNG | 3
Acciona Construction Australia | Alkimos | 3
Santos | Darwin ILNG | 3
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Gorgon LNG | 3
COMPASS GROUP – | Wheatstone LNG (Downstream) | 2
Downer EDI Group | Barrow Island CO2 | 2
Cable Restoration Australia | Explorer CPF | 2
UGL RESOURCES (CONTRACTING) PTY LTD | Pluto 2 | 2
Downer EDI Group | Wheatstone LNG (Downstream) | 2
TOTAL MARINE TECHNOLOGY PTY LTD | Normand Saracen | 2
Kaefer Integrated Services Pty Ltd | Castorone | 2
Inpex | Prelude FLNG | 2
Inverse Group | Montara Venture FPSO | 2
DOWNER EDI ENGINEERING ELECTRICAL LNG FACILITY SERVICES | Gorgon LNG | 2
APPLUS+ PTY LTD | Varanus Island | 2
LEGENEERING (AUST.) PTY LTD | Go Offshore | 2
Kaefer Integrated Services Pty Ltd | Ningaloo Vision FPSO | 2
CONTRACT RESOURCES PTY LTD | Karratha (Town/Industrial) | 2
UGL RESOURCES (CONTRACTING) PTY LTD | Darwin ILNG | 2
NES Fircroft | Gorgon LNG | 2
MCDERMOTT AUSTRALIA PTY LTD | Harriett | 2
WOODSIDE ENERGY LTD | Perth Office | 2
COMPASS GROUP – | Bayu Undan | 2
Mitsui E&P Australia | Watsia gas plant Dongara onshore | 2
AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | WA/NT Offshore (General) | 2
CHC HELICOPTER (AUSTRALIA) AIRCRAFT ENGINEERS | Karratha MPT Heliport | 2
Reach Subsea | Reach Subsea | 2
Inpex | Darwin ILNG | 2
Powertech Pty Ltd | Gorgon LNG | 2
Saipem | Castorone | 2
ERIS | Sandpiper | 2
ERIS | Seven Sisters | 2
ALTRAD | Gorgon LNG | 2
EnerMech | Montara Venture FPSO | 2
PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | SAIPEM CONSTELLATION | 2
AGIG | Tubridgi Gas Storage | 2
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Inpex Endeavour CPF | 2
ERIS | North West Shelf (NWS) Platforms | 2
APPLUS+ PTY LTD | Ngujima-Yin FPSO | 2
CHEVRON GORGON OPERATIONS | BW Offshore FPSO | 2
FUGRO AUSTRALIA PTY LTD | Perth Office | 2
Kent Offshore | Explorer CPF | 2
DIAMOND | Transocean Endurance | 2
Valaris Marine | DPS1 | 2
Cameron Services International | Explorer CPF | 2
Oceania Engineering Services | Prelude FLNG | 2
Cleanaway Waste Management | Wheatstone LNG | 2
INPEX - ICHTHYS OPERATIONS | BW Offshore FPSO | 2
Joyce Krane | Gorgon LNG | 2
TOTAL MARINE TECHNOLOGY PTY LTD | Valaris MS-1 | 2
MEGT Australia | Gorgon LNG | 2
Bechtel Australia | Karratha (Town/Industrial) | 2
Safehouse Habitats Australia | Inpex Venturer FPSO | 1
JPS Management & Execution | Perth Office | 1
PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Wheatstone Platform | 1
Kaefer Integrated Services Pty Ltd | Bw Opal HUC | 1
UGL RESOURCES (CONTRACTING) PTY LTD | Ningaloo Vision FPSO | 1
MSS Security | Wheatstone LNG | 1
Clough | Inpex Venturer FPSO | 1
APPLUS+ PTY LTD | Ningaloo Vision FPSO | 1
PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | North West Shelf (NWS) Platforms | 1
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Angel Platform | 1
Acciona Construction Australia | ASWA Beverly | 1
Helix Robotic Solutions | Q7000 | 1
VENTIA AUSTRALIA PTY LTD | Inpex Endeavour CPF | 1
UGL RESOURCES (CONTRACTING) PTY LTD | Prelude FLNG | 1
Qube Ports & Bulk | Gorgon LNG | 1
WOOD | Shell | 1
Offshore Services Australasia | Darwin ILNG | 1
Kaefer Integrated Services Pty Ltd | Valaris 107 | 1
PHI INTERNATIONAL AUSTRALIA  | North West Shelf (NWS) Platforms | 1
Safehouse Habitats Australia | Explorer CPF | 1
EnerMech | Northern Endeavour FPSO | 1
Mitsui E&P Australia | Wheatstone Platform | 1
Valaris Marine | Maersk Deliverer | 1
CHEVRON GORGON OPERATIONS | JIC/Gorgon | 1
Royal Flying Doctor Service | Inpex Venturer FPSO | 1
Auriga Aviation | Karratha Airport | 1
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | North West Shelf (NWS) Platforms | 1
ERIS | DBNGP Pipeline | 1
PHI INTERNATIONAL AUSTRALIA  | Karratha Airport | 1
Firesafe Group | Wheatstone Platform | 1
Santos | Bayu Undan | 1
Downer EDI Group | Wheatstone Platform | 1
UGL RESOURCES (CONTRACTING) PTY LTD | Stag CPF | 1
FUGRO AUSTRALIA PTY LTD | Deep Orient | 1
APPLUS+ PTY LTD | Angel Platform | 1
Acciona Construction Australia | Beverley jub alkimos | 1
Acciona Construction Australia | Alkimos seawater alliance | 1
TEEKAY SHIPPING (AUSTRALIA) PTY LTD | Go Offshore | 1
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | BW Offshore FPSO | 1
CHC HELICOPTER (AUSTRALIA) AIRCRAFT ENGINEERS | Go Offshore | 1
Technip | WA/NT Offshore (General) | 1
DIAMOND | Ocean Monarch | 1
WOODSIDE ENERGY LTD | Pyrenees Venture FPSO | 1
ENSCO AUSTRALIA PTY LIMITED | Valaris MS-1 | 1
Technip | Deep Orient | 1
Wirringulla Workforce | Acciona Jackup barge | 1
TOTAL MARINE TECHNOLOGY PTY LTD | North West Shelf (NWS) Platforms | 1
APPLUS+ PTY LTD | Woodside Onshore Facilities | 1
ERIS | Ningaloo Vision FPSO | 1
Noble Corporation | Noble Deliverer | 1
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Pluto Alpha Platform | 1
Score Group | Inpex Endeavour CPF | 1
DURATEC | Harriett | 1
CONTRACT RESOURCES PTY LTD | Inpex Venturer FPSO | 1
Kent Offshore | Wheatstone LNG (Downstream) | 1
SchlumbergerAustralia Pty Ltd | WA/NT Offshore (General) | 1
FUGRO AUSTRALIA PTY LTD | Barrow Island CO2 | 1
FUGRO AUSTRALIA PTY LTD | Remote operation centre | 1
Offshore Services Australasia | Karratha Airport | 1
Axess Offshore Australia | WA/NT Offshore (General) | 1
Valaris Marine | Valaris MS-1 | 1
LEGENEERING (AUST.) PTY LTD | Goodwyn | 1
ALTRAD | Varanus Island | 1
GR Production Services | Darwin ILNG | 1
ERIS | Jsd6000 | 1
MCDERMOTT AUSTRALIA PTY LTD | Shell | 1
LifeFlight | Broome Airport | 1
Mechanical Project Services | Wheatstone Platform | 1
Bechtel Australia | Karratha Gas Plant | 1
COMPASS GROUP – | Ichthys | 1
WOODSIDE ENERGY LTD | Angel Platform | 1
Epigroup | Pyrenees Venture FPSO | 1
DOF MANAGEMENT AUSTRALIA PTY LTD | Scandi Emerald | 1
Reach Subsea | WA/NT Offshore (General) | 1
Archer Well Company (Aust) Pl | WA/NT Offshore (General) | 1
AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | Jsd6000 | 1
DOF MANAGEMENT AUSTRALIA PTY LTD | Valaris DPS-1 | 1
APPLUS+ PTY LTD | Wheatstone LNG | 1
AGIG | AGIG Control Roo | 1
DOF MANAGEMENT AUSTRALIA PTY LTD | Go Offshore | 1
ENSCO AUSTRALIA PTY LIMITED | Valaris 107 | 1
MCDERMOTT AUSTRALIA PTY LTD | North West Shelf (NWS) Platforms | 1
Burgess BLA | Explorer CPF | 1
Clough | Waitsia | 1
NES Fircroft | Shell | 1
Inverse Group | BW Offshore FPSO | 1
FUGRO AUSTRALIA PTY LTD | North West Shelf (NWS) Platforms | 1
Cyan Renewables | Perth Office | 1
Vertech | Stag CPF | 1
Kent Offshore | Inpex Venturer FPSO | 1
Siem Offshore | Siem symphony | 1
Technip | Barge catering | 1
COMPASS GROUP – | Ocean Apex | 1
CONTRACT RESOURCES PTY LTD | Karratha Gas Plant | 1
CHC HELICOPTER (AUSTRALIA) AIRCRAFT ENGINEERS | Barrow Island CO2 | 1
SHELL PRELUDE | Go Offshore | 1
GO OFFSHORE | North West Shelf (NWS) Platforms | 1
APPLUS+ PTY LTD | Crux Gas Field | 1
Airswift | Barrow Island CO2 | 1
Vertech | Harriett | 1
Trace JV | Inpex Endeavour CPF | 1
AGIG | Kwinana | 1
LEGENEERING (AUST.) PTY LTD | WB400 | 1
VENTIA AUSTRALIA PTY LTD | Inpex Venturer FPSO | 1
DOF MANAGEMENT AUSTRALIA PTY LTD | Prelude FLNG | 1
Axess Offshore Australia | Wheatstone Platform | 1
DURATEC | SAIPEM CONSTELLATION | 1
SEDCO FOREX INTERNATIONAL INC | Transocean | 1
Mobilize | Wandoo A | 1
SODEXO REMOTE SITE | Valaris 107 | 1
Mitsui E&P Australia | Waitisa Gas Plant | 1
AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | MMA vessel | 1
DURATEC | Wandoo A | 1
PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Castorone | 1
Steel Diamond | Stag CPF | 1
BAKER HUGHES SERVICES AUSTRALIA PTY LTD | Prelude FLNG | 1
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Go Offshore | 1
Medical Rescue | Prelude FLNG | 1
DURATEC | Darwin ILNG | 1
EnerMech | Pluto 2 | 1
SODEXO REMOTE SITE | Stag CPF | 1
CONTRACT RESOURCES PTY LTD | WA/NT Offshore (General) | 1
LEGENEERING (AUST.) PTY LTD | BW Offshore FPSO | 1
BAKER HUGHES SERVICES AUSTRALIA PTY LTD | Inpex Venturer FPSO | 1
GO OFFSHORE | Anchor Handlers | 1
Oceania Engineering Services | WA/NT Offshore (General) | 1
Shell | Karratha Airport | 1
EnerMech | Inpex Venturer FPSO | 1
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | WA/NT Offshore (General) | 1
ERIS | Karratha (Town/Industrial) | 1
Vertech | Darwin ILNG | 1
Weatherford Australia | Workshop | 1
WOODSIDE ENERGY LTD | Karratha (Town/Industrial) | 1
COMPASS GROUP – | Varanus Island | 1
Caledonia Group | Pluto 2 | 1
Focus Offshore | Wandoo B | 1
OSM Australia Pty Ltd | Perth Office | 1
AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | ASWA Beverly | 1
Wirringulla Workforce | Alkimos | 1
Auriga Aviation | Karratha (Town/Industrial) | 1
Chevron | Wheatstone LNG | 1
COMPASS GROUP – | BW Offshore FPSO | 1
Caledonia Group | Pluto LNG | 1
Acciona Construction Australia | Alkimos marine works | 1
INPEX - ICHTHYS OPERATIONS | Montara Venture FPSO | 1
OCEANEERING AUSTRALIA PTY LTD | Prelude FLNG | 1
SchlumbergerAustralia Pty Ltd | Go Offshore | 1
BAKER HUGHES SERVICES AUSTRALIA PTY LTD | Chevron Facilities (General) | 1
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Wheatstone Platform | 1
Mitsui E&P Australia | Waitsia | 1
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Shell | 1
ERIS | Perth Office | 1
ERIS | JIC/Gorgon | 1
APPLUS+ PTY LTD | Gorgon LNG | 1
BAKER HUGHES SERVICES AUSTRALIA PTY LTD | Explorer CPF | 1
Vertech | Inpex Endeavour CPF | 1
JADESTONE ENERGY STAG CPF | Angel Platform | 1
Weatherford Australia | Perth Office | 1
Steel Diamond | Explorer CPF | 1
SGS PRELUDE CHEMISTS | Bayu Undan | 1
Saipem | Scarborough FPU | 1
Inpex | Ichthys | 1
Offshore Services Australasia | Darwin Airport | 1
DURATEC | Goodwyn | 1
Helix Robotic Solutions | North West Shelf (NWS) Platforms | 1
LEGENEERING (AUST.) PTY LTD | Woodside Onshore Facilities | 1
Inpex | Inpex Venturer FPSO | 1
BAKER HUGHES SERVICES AUSTRALIA PTY LTD | Noble Deliverer | 1
Broadspectrum Ltd/Transfield | Prelude FLNG | 1
SODEXO REMOTE SITE | Go Offshore | 1
INPEX - ICHTHYS OPERATIONS | Ichthys | 1
CONTRACT RESOURCES PTY LTD | Stag CPF | 1
Helix Robotic Solutions | MMA Pinnacle | 1
Santos | WA/NT Offshore (General) | 1
Acciona Construction Australia | Acciona Jackup barge | 1
APPLUS+ PTY LTD | North West Shelf (NWS) Platforms | 1
COMPASS GROUP – | Ichthys FPSO | 1
Rigforce Pty Ltd | Noble Tom Prosser | 1
ALTRAD | Pluto LNG | 1
LEGENEERING (AUST.) PTY LTD | Alkimos | 1
ERIS | Subsea 7 Pegasus | 1
Reach Subsea | Seven Sisters | 1
LEGENEERING (AUST.) PTY LTD | CASUAL EMPLOYEES | 1
Cameron Services International | Prelude FLNG | 1
MCDERMOTT AUSTRALIA PTY LTD | Scarborough FPU | 1
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Valaris MS-1 | 1
AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | Dof Subsea | 1
DOF MANAGEMENT AUSTRALIA PTY LTD | Deep Orient | 1
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Jansz FCS | 1
LEGENEERING (AUST.) PTY LTD | Prelude FLNG | 1
NES Fircroft | Prelude FLNG | 1
APPLUS+ PTY LTD | Okha FPSO | 1
Offshore Services Australasia | Barrow Island CO2 | 1
Veolia Environ Srvs | Inpex Venturer FPSO | 1
GR Production Services | Barrow Island CO2 | 1
ERIS | Angel Platform | 1
JPS Management & Execution | Wheatstone LNG | 1
PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Reach Subsea | 1
OSM Australia Pty Ltd | Explorer CPF | 1
Vertech | Explorer CPF | 1
Titan Recruitment | Karratha Gas Plant | 1
PHI INTERNATIONAL AUSTRALIA  | Broome Airport | 1
Chevron | Darwin ILNG | 1
AGIG | Tubridigi Gas Storage | 1
Vertech | Ichthys FPSO | 1
Chevron | Jansz FCS | 1
```

Statement 5 — occupation free text vs canonical (top 60 by worker count):

```
occupation | workers | with_canonical
 | 5087 | 4392
Storeperson | 27 | 0
Instrument Fitter | 22 | 0
INLEC Technician | 20 | 0
Galley Hand | 19 | 0
Chef | 19 | 0
Boilermaker | 18 | 0
Dogman | 18 | 0
Advanced Rigger | 18 | 0
Engineer | 16 | 0
Cleaner | 16 | 0
Process Operator | 15 | 0
Sheet Metal Worker | 15 | 0
Cook | 15 | 0
Service Attendant | 14 | 0
Production Technician | 14 | 0
Painter/Blaster | 14 | 0
Warehouse Officer | 14 | 0
Laboratory Analyst | 14 | 0
Scaffolder | 14 | 0
Mechanical Fitter | 14 | 0
Baker | 14 | 0
Pipefitter | 13 | 0
Driver | 13 | 0
Steward | 13 | 0
Camp Boss | 13 | 0
Production Specialist | 13 | 0
Crane Operator | 13 | 0
Electrician | 12 | 0
Admin | 12 | 0
Rigger | 12 | 0
Field Operator | 11 | 0
Welder | 11 | 0
Fireproofer | 11 | 0
Lagger/Cladder | 11 | 0
Insulator | 11 | 0
Turbine Technician | 11 | 0
Coatings Technician | 10 | 0
Electrical Technician | 10 | 0
Blaster | 10 | 0
Logistics Coordinator | 10 | 0
Painter | 10 | 0
Trade Assistant | 10 | 0
Valve Technician | 10 | 0
Materials Controller | 10 | 0
Process Technician | 9 | 0
Control Room Operator | 9 | 0
Operations Technician | 8 | 0
UHP Operator | 8 | 0
Scheduler/Planner | 7 | 0
Plant Operator | 6 | 0
Fitter and Turner | 5 | 0
```

Statement 6 — import history by type and month:

```
import_type | month | files | created | updated
employer_wizard | 2026-03 | 3 | 3 | 108
membership_new_joins | 2026-04 | 1 | 17 | 1
membership_recommencing | 2026-04 | 1 | 20 | 22
membership_resignations | 2026-04 | 1 | 6 | 0
workers_wizard | 2026-04 | 8 | 441 | 11
workers_wizard | 2026-05 | 6 | 258 | 20
campaign_lists | 2026-06 | 5 | 18 | 910
workers_wizard | 2026-06 | 7 | 294 | 74
workers_wizard | 2026-07 | 2 | 106 | 9
workers_wizard | 2026-08 | 8 | 255 | 138
membership_status_sync | 2026-09 | 23 | 4124 | 1001
membership_weekly_update | 2026-09 | 1 | 2 | 40
workers_wizard | 2026-09 | 2 | 42 | 46
```

### 04_profile_agreements.sql

Statement 1 — status:

```
status | count
Current | 86
Expired | 50
```

Statement 2 — agreement_scope:

```
agreement_scope | count
(null) | 136
```

Statement 3 — source_sheet:

```
source_sheet | count
Expired | 27
Maintenance | 22
Production | 15
Catering | 12
Marine-Deck Officers | 11
Marine-Engineers | 9
Drilling | 8
ROV | 6
Offshore Construction | 6
Decommissioning | 6
Aircraft Maint. | 5
Inspection | 4
Dredging | 2
Chemists | 1
Hydrographics | 1
(null) | 1
```

Statement 4 — worksite-link coverage:

```
coverage | count
no worksite link | 89
has worksite link | 47
```

Statement 5 — one row per agreement:

```
agreement_id | name | decision_no | holder | status | expiry_date | source_sheet | is_greenfield | has_fwc_link | worksites | extra_employers | work_scopes
133 | AGC | AG2018/6862 | ALTRAD | Expired | 2023-11-20 | Expired | False | True |  | 0 | 0
131 | R.E.C. MAINTENANCE & CONSTRUCTION AGREEMENT 2019 | AG2019/4604 | ALTRAD | Expired | 2024-01-29 | Expired | False | True |  | 0 | 0
30 | RIDGEBAY HOLDINGS KARRATHA ENTERPRISE AGREEMENT  2024 | AG2024/1247 | ALTRAD | Current | 2027-04-24 | Maintenance | False | True | Karratha (Town/Industrial) | 0 | 0
31 | RIDGEBAY HOLDINGS PTY LTD OFFSHORE ENTERPRISE AGREEMENT 2024 | AG2025/512 | ALTRAD | Current | 2028-06-01 | Maintenance | False | True |  | 0 | 0
29 | REC – ALTRAD CHEVRON FACILITIES ENTERPRISE AGREEMENT  2024 | AG2024/4794 | ALTRAD | Current | 2028-12-18 | Maintenance | False | True | Chevron Facilities (General) | 0 | 0
132 | SPECIALIST PEOPLE – ALTRAD CHEVRON FACILITIES ENTERPRISE AGREEMENT 2024 | AG2024/4796 | ALTRAD | Expired | 2028-12-18 | Expired | False | True | Chevron Facilities (General) | 0 | 0
95 | APPLUS+ PTY LTD OFFSHORE MAINTENANCE ENTERPRISE 2022-2025 | AG2022/1871 | APPLUS+ PTY LTD | Expired | 2025-06-24 | Inspection | False | True |  | 0 | 0
96 | APPLUS+ PTY LTD NDT ENTERPRISE AGREEMENT 2022-2025 | AG2022/4118 | APPLUS+ PTY LTD | Expired | 2025-06-30 | Inspection | False | True |  | 0 | 0
97 | APPLUS+ PLY LTD WOODSIDE NORTH WEST AGREEMENT 2021 - 2025 | AG2021/7288 | APPLUS+ PTY LTD | Expired | 2025-09-23 | Inspection | False | True | Wheatstone LNG (Downstream) | 0 | 0
98 | APPLUS+ PTY LTD MAINTENANCE AGREEMENT 2023 -2026 | AG2024/1344 | APPLUS+ PTY LTD | Current | 2027-05-14 | Inspection | False | True | Karratha Gas Plant | 0 | 0
112 | Atlas Drilling 2019 | AG2020/4180 | ATLAS PROGRAMMED MARINE (AUSTRALIA) PTY LTD | Expired | 2023-06-01 | Expired | False | True |  | 0 | 0
113 | Atlas Programmed (WA & NT) | AG2020/3758 | ATLAS PROGRAMMED MARINE (AUSTRALIA) PTY LTD | Expired | 2024-08-16 | Expired | True | True |  | 0 | 0
64 | ATLAS PROGRAMMED MARINE (AUSTRALIA) PTY LTD   CATERING ENTERPRISE AGREEMENT 2023 | AG2023/3031 | ATLAS PROGRAMMED MARINE (AUSTRALIA) PTY LTD | Current | 2027-09-11 | Catering | False | True |  | 0 | 0
84 | Atlas Drilling | AG2023/2914 | ATLAS PROGRAMMED MARINE (AUSTRALIA) PTY LTD | Current | 2027-09-18 | Drilling | False | True |  | 0 | 0
59 | AURIGA AVIATION HELICOPTER ENGINEERS ENTERPRISE AGREEMENT 2024 | AG2027/4703 | AURIGA AVIATION HELICOPTER ENGINEERS | Current | 2028-07-01 | Aircraft Maint. | False | True |  | 0 | 0
111 | AOS PTY LTD - WESTERN AUSTRALIA AND NORTHERN TERRITORY OFFSHORE CATERING GREENFIELDS AGREEMENT 2022 - 2024 | AG2022/791 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | Expired | 2024-08-16 | Expired | True | True |  | 0 | 0
105 | AUSTRALIAN OFFSHORE SOLUTIONS (AOS) PTY LTD ROV CASUAL GREENFIELDS AGREEMENT 2022 | AG2022/4734 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | Current | 2026-12-04 | ROV | True | True |  | 0 | 0
92 | AOS CONTRACT DREDGING (NON-PROPELLED DREDGES, AWU) GREENFIELDS AGREEMENT 2024 | AG2024/3917 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | Current | 2027-06-30 | Dredging | True | True |  | 0 | 0
38 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD MARITIME OFFSHORE OIL AND GAS INDUSTRY DECK OFFICERS  ENTERPRISE AGREEMENT 2023 | AG2023/3832 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | Current | 2027-11-09 | Marine-Deck Officers | False | True |  | 0 | 0
93 | AUSTRALIAN OFFSHORE SOLUTIONS (AOS) PTY LTD AND THE DECK OFFICERS PROPELLED DREDGING ENTERPRISE AGREEMENT 2024 | AG2024/2987 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | Current | 2027-11-30 | Dredging | False | True |  | 0 | 0
65 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD - WESTERN AUSTRALIA AND NORTHERN TERRITORY OFFSHORE CONSTRUCTION PROJECTS CATERING AGREEMENT 2024 | AG2024/4026 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | Current | 2028-11-11 | Offshore Construction | False | True |  | 0 | 0
85 | BAKER HUGHES SERVICES AUSTRALIA PTY LTD SUBSEA FIELD SERVICES ENTERPRISE AGREEMENT 2024 – 2028 | AG2025/115 | BAKER HUGHES SERVICES AUSTRALIA PTY LTD | Current | 2029-01-30 | Drilling | False | True |  | 0 | 0
39 | BHAGWAN MARINE LTD OFFSHORE VESSEL OPERATIONS DECK OFFICERS ENTERPRISE AGREEMENT 2024 | AG2024/3687 | BHAGWAN MARINE LTD | Current | 2028-01-08 | Marine-Deck Officers | False | True |  | 0 | 0
50 | BHAGWAN MARINE LTD OFFSHORE VESSEL OPERATIONS AND AIMPE ENGINEER OFFICERS ENTERPRISE AGREEMENT 2024 | AG2024/3999 | BHAGWAN MARINE LTD | Current | 2028-11-11 | Marine-Engineers | False | True |  | 0 | 0
1 | BW OFFSHORE GREENFIELDS AGREEMENT 2024 | AG2025/122 | BW | Current | 2029-03-07 | Production | True | True | BW Offshore FPSO | 0 | 0
60 | CHC HELICOPTER (AUSTRALIA) AIRCRAFT ENGINEERS ENTERPRISE AGREEMENT 2022 | AG2023/2945 | CHC HELICOPTER (AUSTRALIA) AIRCRAFT ENGINEERS | Current | 2027-06-30 | Aircraft Maint. | False | True |  | 0 | 0
2 | CHEVRON GORGON OPERATIONS ENTERPRISE AGREEMENT 2023 | AG2023/4223 | CHEVRON GORGON OPERATIONS | Current | 2027-11-22 | Production | False | True | Gorgon LNG | 0 | 0
3 | CHEVRON WHEATSTONE DOWNSTREAM OPERATIONS ENTERPRISE AGREEMENT 2023 | AG2023/4224 | CHEVRON WHEATSTONE DOWNSTREAM OPERATIONS | Current | 2027-11-22 | Production | False | True | Wheatstone LNG (Downstream) | 0 | 0
4 | CHEVRON WHEATSTONE PLATFORM ENTERPRISE AGREEMENT 2023 | AG2023/4226 | CHEVRON WHEATSTONE PLATFORM | Current | 2027-11-22 | Production | False | True | Wheatstone Platform | 0 | 0
116 | COMPASS GROUP - ESS OFFSHORE OIL & GAS (WHEATSTONE PLATFORM) ENTERPRISE AGREEMENT 2019 | AG2019/2725 | COMPASS GROUP – | Expired | 2022-08-07 | Expired | False | True |  | 0 | 0
117 | COMPASS GROUP - ESS OFFSHORE OIL & GAS (WOODSIDE PLATFORMS) ENTERPRISE AGREEMENT 2019 | AG2019/2979 | COMPASS GROUP – | Expired | 2022-12-31 | Expired | False | True |  | 0 | 0
115 | COMPASS GROUP – ESS OFFSHORE OIL & GAS (MODU) – ENTERPRISE AGREEMENT 2020 | AG2020/73 | COMPASS GROUP – | Expired | 2023-02-01 | Expired | False | True |  | 0 | 0
72 | COMPASS GROUP- WESTERN AUSTRALIA AND NORTHERN TERRITORY OFFSHORE CONSTRUCTION PROJECTS GREENFIELDS AGREEMENT 2023 – 2024 | AG2023/163 | COMPASS GROUP – | Expired | 2024-08-16 | Catering | True | True | WA/NT Offshore (General) | 0 | 0
71 | COMPASS GROUP ESS OFFSHORE OIL & GAS (NORTHERN ENDEAVOUR FPSO) ENTERPRISE AGREEMENT 2022 *See 2024 EBA Variation | AG2022/3646 | COMPASS GROUP – | Expired | 2024-09-11 | Catering | False | True | Northern Endeavour FPSO | 0 | 0
70 | COMPASS GROUP – ESS OFFSHORE OIL & GAS AND THE AUSTRALIAN WORKERS’ UNION (SHELL PRELUDE) GREENFIELDS AGREEMENT 2022 | AG2022/734 | COMPASS GROUP – | Expired | 2024-11-12 | Catering | True | True | Prelude FLNG | 0 | 0
66 | COMPASS GROUP – ESS OFFSHORE OIL & GAS (INPEX PRODUCTION) ENTERPRISE AGREEMENT 2021 | AG2021/4396 | COMPASS GROUP – | Expired | 2025-03-22 | Catering | False | True | Ichthys LNG | 0 | 0
68 | COMPASS GROUP – ESS OFFSHORE OIL & GAS (WHEATSTONE PLATFORM) ENTERPRISE AGREEMENT 2022 | AG2022/3096 | COMPASS GROUP – | Expired | 2025-08-16 | Catering | False | True | Wheatstone Platform | 0 | 0
67 | COMPASS GROUP – ESS OFFSHORE OIL & GAS (MODU) –  ENTERPRISE AGREEMENT 2023 | AG2023/3026 | COMPASS GROUP – | Expired | 2025-09-18 | Catering | False | True | WA/NT Offshore (General) | 0 | 0
69 | COMPASS GROUP - ESS OFFSHORE OIL & GAS (WOODSIDE PLATFORMS) ENTERPRISE AGREEMENT 2022 | AG2023/71 | COMPASS GROUP – | Expired | 2026-02-13 | Catering | False | True | Ngujima-Yin FPSO; North West Shelf (NWS) Platforms; Okha FPSO | 0 | 0
16 | CONTRACT RESOURCES PTY LTD NORTH WEST ENTERPRISE AGREEMENT 2022 | AG2023/1700 | CONTRACT RESOURCES PTY LTD | Current | 2027-06-30 | Maintenance | False | True |  | 0 | 0
17 | DAMPIER BUNBURY NATURAL GAS PIPELINE (DBNGP)  NATIONAL CONTROL CENTRE ENTERPRISE AGREEMENT 2024 | AG2024/4865 | DAMPIER BUNBURY NATURAL GAS PIPELINE (DBNGP)  NATIONAL CONTROL CENTRE | Current | 2028-12-24 | Maintenance | False | True | DBNGP Pipeline | 0 | 0
118 | DIAMOND OFFSHORE ENTERPRISE AGREEMENT 2019-2023 | AG2019/4516 | DIAMOND | Expired | 2024-01-20 | Expired | False | True |  | 0 | 0
86 | DIAMOND OFFSHORE ENTERPRISE AGREEMENT 2024 | AG2024/186 | DIAMOND | Current | 2028-02-21 | Drilling | False | True |  | 0 | 0
106 | DOF SUBSEA AUSTRALIA PTY LTD ROV CASUAL ENTERPRISE AGREEMENT 2021 | AG2021/9252 | DOF MANAGEMENT AUSTRALIA PTY LTD | Expired | 2025-08-09 | ROV | False | True |  | 0 | 0
51 | DOF MANAGEMENT AUSTRALIA PTY LTD & AIMPE MARINE ENGINEERS OFFSHORE OIL AND GAS ENTERPRISE AGREEMENT 2023 | AG2023/27/44 | DOF MANAGEMENT AUSTRALIA PTY LTD | Current | 2027-08-29 | Marine-Engineers | False | True |  | 0 | 0
40 | DOF MANAGEMENT AUSTRALIA PTY LTD DECK OFFICERS MARITIME OFFSHORE OIL AND GAS ENTERPRISE AGREEMENT 2023 | AG2023/3160 | DOF MANAGEMENT AUSTRALIA PTY LTD | Current | 2027-10-25 | Marine-Deck Officers | False | True |  | 0 | 0
18 | DOWNER EDI ENGINEERING ELECTRICAL LNG FACILITY SERVICES AGREEMENT 2022 | AG2022/2479 | DOWNER EDI ENGINEERING ELECTRICAL LNG FACILITY SERVICES | Current | 2026-08-08 | Maintenance | False | True |  | 0 | 0
78 | DURATEC ENTERPRISE AGREEMENT 2025 | AG2025/876 | DURATEC | Current | 2029-04-11 | Decommissioning | False | True |  | 0 | 0
87 | ENSCO AUSTRALIA PTY LIMITED ENTERPRISE AGREEMENT 2022 | AG2022/3824 | ENSCO AUSTRALIA PTY LIMITED | Current | 2026-09-26 | Drilling | False | True |  | 0 | 0
73 | ENTIER AUSTRALIA PTY LTD CATERING GREENFIELDS  AGREEMENT 2024 | AG2024/73 | ENTIER AUSTRALIA PTY LTD | Current | 2027-09-11 | Catering | True | True | WA/NT Offshore (General) | 0 | 0
122 | Kuiper (WA & NT) | AG2020/2206 | ERIS | Expired | 2024-08-16 | Expired | True | True |  | 0 | 0
123 | Kuiper WA & NT | AG2021/5647 | ERIS | Expired | 2025-07-02 | Expired | False | True |  | 0 | 0
79 | KUIPER ENERGY WESTERN AUSTRALIA AND NORTHERN  TERRITORY OFFSHORE DEMOLITION AND REMOVAL  GREENFIELD AGREEMENT 2025 | AG2025/1983 | ERIS | Expired | 2026-03-31 | Decommissioning | True | True |  | 2 | 0
20 | KUIPER ENERGY SOLUTIONS PTY LTD - OFFSHORE HOOK UP AND COMMISSIONING GREENFIELDS ENTERPRISE AGREEMENT 2025 | AG2025/615 | ERIS | Current | 2028-06-01 | Maintenance | True | True |  | 0 | 0
100 | KUIPER AUSTRALIA PTY LTD - WESTERN AUSTRALIA AND NORTHERN TERRITORY OFFSHORE CONSTRUCTION PROJECTS AGREEMENT 2024 | AG2024/3988 | ERIS | Current | 2028-11-12 | Offshore Construction | False | True |  | 0 | 0
19 | KUIPER AUSTRALIA PTY LTD WESTERN AUSTRALIA AND NORTHERN TERRITORY OFFSHORE MAINTENANCE WORK AGREEMENT 2025 | AG2025/2293 | ERIS | Current | 2029-07-31 | Maintenance | False | True |  | 0 | 0
107 | FUGRO AUSTRALIA MARINE PTY LTD ROV CASUAL ENTERPRISE AGREEMENT 2022 | AG2022/3163 | FUGRO AUSTRALIA PTY LTD | Current | 2026-08-11 | ROV | False | True |  | 0 | 0
41 | FUGRO AUSTRALIA PTY LTD MARITIME OFFSHORE OIL AND GAS INDUSTRY DECK OFFICERS ENTERPRISE AGREEMENT 2024 | AG2024/1702 | FUGRO AUSTRALIA PTY LTD | Current | 2028-06-13 | Marine-Deck Officers | False | True |  | 0 | 0
94 | FUGRO AUSTRALIA PTY LTD OFFSHORE OIL & GAS HYDROGRAPHIC SURVEY ENTERPRISE AGREEMENT 2024 | AG2024/4072 | FUGRO AUSTRALIA PTY LTD | Current | 2028-12-03 | Hydrographics | False | True | WA/NT Offshore (General) | 0 | 0
5 | INPEX - ICHTHYS OPERATIONS ENTERPRISE AGREEMENT 2022-2026 | AG2022/1124 | INPEX - ICHTHYS OPERATIONS | Current | 2026-05-09 | Production | False | True | Ichthys LNG | 0 | 0
120 | ISOLOGICS ENTERPRISE AGREEMENT 2022 - 2026 | AG2022/3657 | ISOLOGICS | Expired | 2026-10-10 | Expired | False | True |  | 0 | 0
121 | Jadestone  Montara Venture | AG2021/5117 | JADESTONE ENERGY MONTARA VENTURE | Expired | 2023-12-31 | Expired | False | True |  | 0 | 0
6 | JADESTONE ENERGY MONTARA VENTURE ENTERPRISE  AGREEMENT 2024 | AG2024/2629 | JADESTONE ENERGY MONTARA VENTURE | Current | 2028-07-25 | Production | False | True | Montara Venture FPSO | 0 | 0
7 | Jadestone Stag | AG2022/3581 | JADESTONE ENERGY STAG CPF | Current | 2026-09-12 | Production | False | True | Stag CPF | 0 | 0
42 | JETWAVE MARINE SERVICES PTY. LTD. MARITIME OFFSHORE OIL AND GAS INDUSTRY MASTERS, DECK OFFICERS, AND ENGINEERS ENTERPRISE AGREEMENT 2024 | AG2024/3696 | JETWAVE MARINE SERVICES PTY. LTD. | Current | 2027-06-30 | Marine-Engineers | False | True |  | 0 | 0
21 | Legeneering - Woodside Maint. | AG2021/6710 | LEGENEERING (AUST.) PTY LTD | Expired | 2025-08-02 | Maintenance | False | True |  | 0 | 0
124 | LEGENEERING SERVICES PTY LTD ENTERPRISE AGREEMENT 2021 | AG2021/7655 | LEGENEERING (AUST.) PTY LTD | Expired | 2025-10-08 | Expired | False | True |  | 0 | 0
80 | LEGENEERING (AUST.) PTY LTD OFFSHORE DECOMMISSIONING ENTERPRISE AGREEMENT 2024 | AG2024/2063 | LEGENEERING (AUST.) PTY LTD | Expired | 2026-03-22 | Decommissioning | False | True |  | 0 | 0
127 | MCDERMOTT AUSTRALIA PTY LTD WESTERN AUSTRALIA AND NORTHERN TERRITORY OFFSHORE CONSTRUCTION PROJECTS GREENFIELDS AGREEMENT 2020-2024 | AG2021/5392 | MCDERMOTT AUSTRALIA PTY LTD | Expired | 2024-08-16 | Expired | True | True |  | 0 | 0
81 | MCDERMOTT AUSTRALIA PTY LTD OFFSHORE DECOMMISSIONING GREENFIELDS EA 2023 | AG2023/3584 | MCDERMOTT AUSTRALIA PTY LTD | Expired | 2026-03-22 | Decommissioning | True | True |  | 2 | 0
101 | MCDERMOTT AUSTRALIA (CREWING SERVICES) PTY LTD – INPEX OPERATIONS AUSTRALIA PTY LTD BREWSTER DRILL CENTRE 1A CAMPAIGN AGREEMENT 2025 | AG2025/382 | MCDERMOTT AUSTRALIA PTY LTD | Current | 2028-11-12 | Offshore Construction | False | True | Brewster Drill Centre | 0 | 0
102 | MCDERMOTT AUSTRALIA (CREWING SERVICES) PTY LTD - SHELL AUSTRALIA PTY LTD CRUX PROJECT AGREEMENT 2025 | AG2025/366 | MCDERMOTT AUSTRALIA PTY LTD | Current | 2028-11-12 | Offshore Construction | False | True | Crux Gas Field | 0 | 0
25 | MIZCO PTY LTD INPEX OFFSHORE ENTERPRISE AGREEMENT 2021-2025 | AG2021/7547 | MIZCO PTY LTD | Expired | 2025-10-18 | Maintenance | False | True | Ichthys LNG | 0 | 0
53 | MMA OFFSHORE VESSEL OPERATIONS AIMPE ENGINEER   OFFICERS ENTERPRISE AGREEMENT 2023 | AG2023/4466 | MMA | Current | 2027-12-14 | Marine-Engineers | False | True |  | 0 | 0
43 | MMA OFFSHORE VESSEL OPERATIONS DECK OFFICERS  ENTERPRISE AGREEMENT 2023 | AG2023/5107 | MMA | Current | 2028-01-08 | Marine-Deck Officers | False | True |  | 0 | 0
129 | Pyrenees Venture 2018 | AG2018/2047 | MODEC Management Services | Expired | 2021-06-30 | Expired | False | True |  | 0 | 0
128 | Pyrenees Venture | AG2022/155 | MODEC Management Services | Expired | 2025-03-08 | Expired | False | True |  | 0 | 0
8 | MODEC MANAGEMENT SERVICES PTE LTD PYRENEES VENTURE  FPSO AMOU, AWU AND MUA AGREEMENT 2025 | AG2025/1795 | MODEC Management Services | Current | 2029-06-27 | Production | False | True | Pyrenees Venture FPSO | 0 | 0
125 | M Maintenance Inpex 2019 | AG2019/4438 | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Expired | 2023-06-30 | Expired | False | True |  | 0 | 0
126 | M&ISS | AG2021/4675 | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Expired | 2025-04-30 | Expired | False | True |  | 0 | 0
82 | MEA OFFSHORE DECOMMISSIONING ENTERPRISE AGREEMENT 2022 | AG2022/672 | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Expired | 2026-03-22 | Decommissioning | False | True |  | 0 | 0
26 | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD (WOODSIDE) ONSHORE ENTERPRISE AGREEMENT 2022 | AG2022/2442 | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Current | 2026-07-26 | Maintenance | False | True | Woodside Onshore Facilities | 1 | 0
22 | M Maintenance Inpex 2023 | AG2023/638 | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Current | 2027-03-23 | Maintenance | False | True | Ichthys LNG | 0 | 0
24 | MEA PTY LTD OFFSHORE AGREEMENT 2024 | AG2024/4818 | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Current | 2028-06-01 | Maintenance | False | True |  | 0 | 0
23 | M&ISS PTY LTD OFFSHORE MAINTENANCE ENTERPRISE AGREEMENT 2025 | AG2025/936 | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Current | 2029-04-15 | Maintenance | False | True |  | 0 | 0
27 | MWOG | AG2021/6315 | MWOG PTY LTD | Expired | 2025-08-16 | Maintenance | False | True | Goodwyn; Karratha Gas Plant | 0 | 0
88 | NOBLE DRILLING ENTERPRISE AGREEMENT 2023 | AG2023/3106 | NOBLE | Current | 2027-09-26 | Drilling | False | True |  | 0 | 0
108 | OCEANEERING AUSTRALIA PTY LTD ROV ENTERPRISE AGREEMENT 2019 (ENTERPRISE AGREEMENT) | AG2022/4551 | OCEANEERING AUSTRALIA PTY LTD | Current | 2026-11-29 | ROV | False | True |  | 0 | 0
130 | OSM (WA & NT) | AG2021/86 | OSM Australia Pty Ltd | Expired | 2024-08-16 | Expired | True | True |  | 0 | 0
83 | OSM OFFSHORE DECOMMISSIONING ENTERPRISE AGREEMENT  2022 | AG2022/4384 | OSM Australia Pty Ltd | Expired | 2026-03-22 | Decommissioning | False | True |  | 0 | 0
74 | OSM DECOMMISSIONING CATERING ENTERPRISE AGREEMENT  2023 | AG2023/3030 | OSM Australia Pty Ltd | Expired | 2026-03-22 | Catering | False | True | WA/NT Offshore (General) | 0 | 0
109 | OSM AUSTRALIA PTY LTD ROV CASUAL ENTERPRISE AGREEMENT 2022 | AG2022/4799 | OSM Australia Pty Ltd | Current | 2026-11-28 | ROV | False | True |  | 0 | 0
44 | OSM Australia Pty Ltd Maritime Offshore Oil and Gas Industry Masters and Deck Officers Enterprise Agreement 2024 | AG2024/225 | OSM Australia Pty Ltd | Current | 2027-10-01 | Marine-Deck Officers | False | True |  | 0 | 0
54 | OSM AUSTRALIA PTY LTD & AIMPE MARITIME OFFSHORE OIL AND GAS INDUSTRY ENGINEERS ENTERPRISE AGREEMENT 2024 | AG2024/696 | OSM Australia Pty Ltd | Current | 2028-04-17 | Marine-Engineers | False | True |  | 0 | 0
103 | OSM AUSTRALIA PTY LTD - WESTERN AUSTRALIA AND NORTHERN TERRITORY OFFSHORE CONSTRUCTION PROJECTS CATERING AGREEMENT 2025 | AG2025/913 | OSM Australia Pty Ltd | Current | 2028-11-11 | Offshore Construction | False | True |  | 0 | 0
62 | PHI INTERNATIONAL AUSTRALIA KIMBERLEY ENGINEERING AND RAMP STAFF ENTERPRISE AGREEMENT 2022 | AG2022/2101 | PHI INTERNATIONAL AUSTRALIA  | Current | 2026-08-03 | Aircraft Maint. | False | True | Kimberley Airfield | 0 | 0
61 | PHI INTERNATIONAL AUSTRALIA GASCOYNE ENGINEERING AND RAMP STAFF ENTERPRISE AGREEMENT 2022 | AG2022/4809 | PHI INTERNATIONAL AUSTRALIA  | Current | 2026-12-15 | Aircraft Maint. | False | True | Gascoyne Airfield | 0 | 0
63 | PHI INTERNATIONAL AUSTRALIA PTY LTD KARRATHA MPT HELICOPTER ENGINEERS ENTERPRISE AGREEMENT 2023 | AG2023/1555 | PHI INTERNATIONAL AUSTRALIA  | Current | 2027-02-07 | Aircraft Maint. | False | True | Karratha MPT Heliport | 0 | 0
114 | Rigforce Greenfields 2019 | AG2020/134 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Expired | 2023-02-01 | Expired | True | True |  | 0 | 0
89 | RFM OS PTY LTD AND MUA OFFSHORE OIL AND GAS ENTERPRISE AGREEMENT 2023 | AG2023/4619 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Current | 2027-08-01 | Drilling | False | True |  | 0 | 0
90 | RIGFORCE CONTRACTING PTY LTD DRILLING ENTERPRISE AGREEMENT 2023 | AG2023/2938 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Current | 2027-09-18 | Drilling | False | True |  | 0 | 0
46 | RFM OFFSHORE PTY LTD & AWU MARITIME OFFSHORE OIL AND   GAS INDUSTRY DECK OFFICERS GREENFIELDS AGREEMENT   2023 | AG2023/3884 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Current | 2027-11-03 | Marine-Deck Officers | True | True |  | 0 | 0
45 | PROGRAMMED MARINE PTY LTD MARITIME OFFSHORE OIL AND GAS INDUSTRY DECK OFFICERS ENTERPRISE AGREEMENT 2023 | AG2024/3338 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Current | 2027-11-09 | Marine-Deck Officers | False | True |  | 0 | 0
55 | PROGRAMMED OFFSHORE PTY LTD AND AIMPE MARINE ENGINEERS MARITIME OFFSHORE OIL AND GAS INDUSTRY ENTERPRISE AGREEMENT 2023 | AG2024/3977 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Current | 2027-12-08 | Marine-Engineers | False | True |  | 0 | 0
56 | RFM OS PTY LTD AND AIMPE MARINE ENGINEERS MARITIME OFFSHORE OIL AND GAS INDUSTRY ENTERPRISE AGREEMENT 2023 | AG2023/5223 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Current | 2028-01-12 | Marine-Engineers | False | True |  | 0 | 0
28 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD OFFSHORE MAINTENANCE HUC GREENFIELDS ENTERPRISE AGREEMENT 2024 | AG2025/191 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Current | 2028-02-01 | Maintenance | True | True |  | 0 | 0
75 | PROGRAMMED OFFSHORE PTY LTD WA & NT OFFSHORE CONSTRUCTION CATERING GREENFIELDS AGREEMENT 2024 | AG2025/7 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Current | 2028-11-11 | Catering | True | True | WA/NT Offshore (General) | 0 | 0
104 | PROGRAMMED OFFSHORE PTY LTD - WA&NT OFFSHORE CONSTRUCTION PROJECTS GREENFIELDS AGREEMENT 2024 | AG2025/6 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Current | 2028-11-12 | Offshore Construction | True | True |  | 0 | 0
9 | Santos Varanus Island | AG2023/113 | SANTOS WA ENERGY LIMITED VARANUS ISLAND HUB | Current | 2027-02-14 | Production | False | True | Varanus Island | 0 | 0
91 | SEDCO FOREX INTERNATIONAL INC ENTERPRISE AGREEMENT   2023 | AG2024/4965 | SEDCO FOREX INTERNATIONAL INC | Current | 2027-06-30 | Drilling | False | True |  | 0 | 0
77 | SGS PRELUDE CHEMISTS ENTERPRISE AGREEMENT 2024 | AG2024/3751 | SGS PRELUDE CHEMISTS | Current | 2028-07-31 | Chemists | False | True | Prelude FLNG | 0 | 0
10 | Shell Prelude | AG2022/3928 | SHELL PRELUDE | Current | 2026-10-25 | Production | False | True | Prelude FLNG | 0 | 0
57 | SIERA MARINE MANAGEMENT PTY LTD AND AWU MARINE  ENGINEERS MARITIME OFFSHORE OIL AND GAS INDUSTRY  ENTERPRISE AGREEMENT 2024 | AG2024/1906 | SIERA MARINE MANAGEMENT PTY LTD | Current | 2027-11-09 | Marine-Engineers | False | True |  | 0 | 0
47 | SIERA MARINE MANAGEMENT PTY LTD MARITIME OFFSHORE  OIL AND GAS INDUSTRY DECK OFFICERS AGREEMENT 2024 | AG2025/1438 | SIERA MARINE MANAGEMENT PTY LTD | Current | 2027-11-09 | Marine-Deck Officers | False | True |  | 0 | 0
76 | SODEXO REMOTE SITE OFFSHORE AND AWU ENTERPRISE AGREEMENT 2020 | AG2020/3199 | SODEXO REMOTE SITE | Expired | 2024-11-12 | Catering | False | True | WA/NT Offshore (General) | 0 | 0
48 | SOLSTAD AUSTRALIA PTY LTD AMOU OFFSHORE OIL AND GAS MASTERS AND DECK OFFICERS ENTERPRISE AGREEMENT 2023 | AG2023/4026 | SOLSTAD AUSTRALIA PTY LTD | Current | 2027-11-22 | Marine-Deck Officers | False | True |  | 0 | 0
58 | SOLSTAD AUSTRALIA PTY LTD AND AIMPE (MARINE ENGINEERS) OFFSHORE OIL AND GAS ENTERPRISE AGREEMENT 2023 | AG2024/2207 | SOLSTAD AUSTRALIA PTY LTD | Current | 2028-07-22 | Marine-Engineers | False | True |  | 0 | 0
134 | Ningaloo Vision | AG2023/907 | TEEKAY SHIPPING (AUSTRALIA) PTY LTD | Expired | 2025-02-11 | Expired | False | True |  | 0 | 0
15 | TEEKAY SHIPPING (AUSTRALIA) PTY LTD NINGALOO VISION FPSO AMOU AWU CFMEU AGREEMENT 2025 | AG2025/655 | TEEKAY SHIPPING (AUSTRALIA) PTY LTD | Current | 2027-02-11 | Production | False | True | Ningaloo Vision FPSO | 0 | 0
49 | TIDEWATER SHIP MANAGEMENT (AUSTRALIA) PTY LTD  MARITIME OFFSHORE OIL AND GAS INDUSTRY MASTERS AND  DECK OFFICERS ENTERPRISE AGREEMENT 2024 | AG2024/1577 | TIDEWATER SHIP MANAGEMENT (AUSTRALIA) PTY LTD | Current | 2027-11-30 | Marine-Deck Officers | False | True |  | 0 | 0
135 | TOTAL MARINE TECHNOLOGY PTY LTD ROV ENTERPRISE AGREEMENT 2021 | AG2021/5628 | TOTAL MARINE TECHNOLOGY PTY LTD | Expired | 2024-06-30 | Expired | False | True |  | 0 | 0
110 | TOTAL MARINE TECHNOLOGY PTY LTD ROV ENTERPRISE AGREEMENT 2024 | AG2024/4862 | TOTAL MARINE TECHNOLOGY PTY LTD | Current | 2026-12-18 | ROV | False | True |  | 0 | 0
272 | TRACE OFFSHORE ENTERPRISE AGREEMENT 2021 | AG2021/6291 | TRACE | Expired | 2025-07-27 | Expired | False | True |  | 0 | 0
119 | IAS GROUP ENTERPRISE AGREEMENT 2019-2023 | AG2019/533 | UGL RESOURCES (CONTRACTING) PTY LTD | Expired | 2023-07-02 | Expired | False | True |  | 0 | 0
32 | Varanus Island | AG2023/650 | UGL RESOURCES (CONTRACTING) PTY LTD | Expired | 2026-03-27 | Maintenance | False | True |  | 0 | 0
33 | UGL RESOURCES (CONTRACTING) PTY LTD KARRATHA   ENTERPRISE AGREEMENT 2023 | AG2023/1026 | UGL RESOURCES (CONTRACTING) PTY LTD | Current | 2026-05-19 | Maintenance | False | True | Karratha (Town/Industrial) | 0 | 0
11 | UPS - Northern Endeavour FPSO | AG2022/1302 | UPSTREAM PRODUCTION SOLUTIONS PTY LTD | Current | 2026-05-12 | Production | False | True | Northern Endeavour FPSO | 0 | 0
36 | VENTIA AUSTRALIA PTY LTD | AG2025/2335 | VENTIA AUSTRALIA PTY LTD | Current | 2029-08-14 | Maintenance | False | True | Gorgon LNG; Wheatstone Platform | 0 | 0
35 | WOOD OFFSHORE MAINTENANCE SERVICES GREENFIELDS AGREEMENT 2021 | AG2021/9037 | WOOD | Expired | 2026-01-14 | Maintenance | True | True |  | 0 | 0
34 | WOOD OFFSHORE BROWNFILEDS SERVICES (WESTERN AUSTRALIA)  GREENFILEDS AGREEMENT 2024 – 2028 | AG2024/1405 | WOOD | Current | 2028-05-18 | Maintenance | False | True |  | 0 | 0
13 | WOODSIDE ENERGY LTD NORTH WEST SHELF GAS PLATFORMS ENTERPRISE AGREEMENT 2023 | AG2023/3761 | WOODSIDE ENERGY LTD | Current | 2027-10-24 | Production | False | True | Goodwyn; North West Shelf (NWS) Platforms; Rankin North | 0 | 0
12 | WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO ENTERPRISE AGREEMENT 2024 | AG2024/1022 | WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO | Current | 2028-04-18 | Production | False | True | Ngujima-Yin FPSO; Okha FPSO | 0 | 0
14 | WOODSIDE ENERGY MACEDON GAS PLANT ENTERPRISE  AGREEMENT 2024 | AG2024/1594 | WOODSIDE ENERGY MACEDON GAS PLANT | Current | 2028-05-23 | Production | False | True | Macedon Gas Plant | 0 | 0
136 | AGC | AG2022/4202 | WORKFORCE LOGISTICS PTY LTD | Expired | 2026-10-26 | Expired | False | True |  | 0 | 0
37 | XELERATOR PTY LTD WOODSIDE ONSHORE ENTERPRISE AGREEMENT 2024 | AG2024/1031 | XELERATOR PTY LTD | Current | 2028-04-17 | Maintenance | False | True | Woodside Onshore Facilities | 0 | 0
1096 | Vertech WA & NT  | AE530815 |  | Current | 2029-10-28 |  | True | True | Karratha Gas Plant | 0 | 0
```

### 05_candidate_clusters.sql

Statement 1 — employer near-duplicate clusters:

```
key | n | members
chevron | 4 | 2:CHEVRON GORGON OPERATIONS || 3:CHEVRON WHEATSTONE DOWNSTREAM OPERATIONS || 4:CHEVRON WHEATSTONE PLATFORM || 691:Chevron
jadestone | 4 | 6:JADESTONE ENERGY MONTARA VENTURE || 7:JADESTONE ENERGY STAG CPF || 693:Jadestone || 695:JADESTONE ENERGY 
woodside | 4 | 12:WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO || 13:WOODSIDE ENERGY LTD || 14:WOODSIDE ENERGY MACEDON GAS PLANT || 689:Woodside
atc | 2 | 815:ATC Offshore || 816:ATC
auriga | 2 | 52:AURIGA AVIATION HELICOPTER ENGINEERS || 723:Auriga Aviation
downer | 2 | 18:DOWNER EDI ENGINEERING ELECTRICAL LNG FACILITY SERVICES || 710:Downer EDI Group
inpex | 2 | 5:INPEX - ICHTHYS OPERATIONS || 690:Inpex
modec | 2 | 93:MODEC Management Services || 703:Modec
noble | 2 | 73:NOBLE || 736:Noble Corporation
saipem | 2 | 726:Saipem || 778:Saipem Leighton Consortium
santos | 2 | 9:SANTOS WA ENERGY LIMITED VARANUS ISLAND HUB || 692:Santos
shell | 2 | 10:SHELL PRELUDE || 688:Shell
solstad | 2 | 47:SOLSTAD AUSTRALIA PTY LTD || 717:Solstad Offshore ASA
testco | 2 | 787:TestCo Energy || 791:TestCo 2
toll | 2 | 713:Toll Energy || 782:Toll West
trace | 2 | 97:TRACE || 749:Trace JV
ugl | 2 | 33:UGL RESOURCES (CONTRACTING) PTY LTD || 826:ugl
```

Statement 2 — worksite near-duplicate clusters:

```
key | n | members
mma | 10 | 166:MMA Pinnacle [Vessel] || 167:MMA Plover [Vessel] || 172:MMA Vigilant [Vessel] || 173:MMA Brewster [Vessel] || 174:Mma coral [Vessel] || 175:MMA Inscription [Vessel] || 233:MMA Harmony [Vessel] || 234:MMA Monarch [Vessel] || 238:MMA LEEUWIN [Vessel] || 270:MMA vessel [Vessel]
pacific | 8 | 188:Pacific Dilgence [Vessel] || 189:Pacific Liberty [Vessel] || 206:Pacific Guillemot [Vessel] || 214:Pacific Valor [Vessel] || 216:Pacific Grackle [Vessel] || 220:Pacific Vulcan [Vessel] || 260:Pacific Rapier [Vessel] || 447:Pacific Dove [Vessel]
siem | 6 | 203:Siem Thiima [Vessel] || 205:Siem Aquamarine [Vessel] || 209:Siem Pilot [Vessel] || 210:Siem AHTS [Vessel] || 212:Siem symphony [Vessel] || 218:Siem Amethyst [Vessel]
skandi | 6 | 228:Skandi Hercules [Other] || 252:Skandi Darwin [Vessel] || 254:Skandi Vessels [Vessel] || 255:skandi peregrino [Vessel] || 256:Skandi Singapore [Other] || 426:skandi inventor [Vessel]
fugro | 4 | 221:Fugro Etive [Vessel] || 227:Fugro Etive, Furgo Maali, Fugro Kwilena [Other] || 422:Fugro Workshop [Other] || 423:Fugro unmanned remote [Other]
karratha | 4 | 20:Karratha (Town/Industrial) [Other] || 21:Karratha MPT Heliport [Heliport] || 136:Karratha Gas Plant [Gas_Plant] || 159:Karratha Airport [Airfield]
test | 4 | 196:Test Onshore Gas Plant [Gas_Plant] || 197:TEST · TestCo 2 — Alpha FPSO [FPSO] || 198:TEST · TestCo 2 — Bravo Platform [Platform] || 199:TEST · TestCo 2 — Charlie FPU [FPU]
valaris | 4 | 152:Valaris 107 [Vessel] || 193:Valaris 247 [Vessel] || 194:Valaris DPS-1 [Vessel] || 424:Valaris MS-1 [Vessel]
alkimos | 3 | 170:Alkimos [Other] || 180:Alkimos seawater alliance [Other] || 181:Alkimos marine works [Other]
ichthys | 3 | 7:Ichthys LNG [FPSO] || 147:Ichthys FPSO [FPSO] || 148:Ichthys [Other]
normand | 3 | 263:Normand Saracen [Vessel] || 265:Normand Ranger [Other] || 418:Normand Scorpion [Other]
pluto | 3 | 137:Pluto LNG [Onshore_LNG] || 138:Pluto 2 [Onshore_LNG] || 442:Pluto Alpha Platform [Platform]
sea1 | 3 | 204:Sea1 Emerald [Vessel] || 207:Sea1 Sapphire [Vessel] || 219:SEA1 Anchor Handlers [Vessel]
seven | 3 | 176:Seven Oceanic Subsea 7 [Vessel] || 415:Seven Sisters [Vessel] || 429:Seven Arctic [Vessel]
transocean | 3 | 155:Transocean Endurance [Platform] || 191:Transocean [Other] || 445:Transocean Equinox [Vessel]
wheatstone | 3 | 2:Wheatstone LNG (Downstream) [Onshore_LNG] || 3:Wheatstone Platform [Platform] || 139:Wheatstone LNG [Onshore_LNG]
darwin | 2 | 140:Darwin ILNG [Onshore_LNG] || 187:Darwin Airport [Airfield]
dof | 2 | 215:DOF Vessels [Vessel] || 253:Dof Subsea [Vessel]
floatel | 2 | 240:Floatel triumph [Accommodation_Vessel] || 261:Floatel Triumph [Accommodation_Vessel]
inpex | 2 | 160:Inpex Venturer FPSO [FPSO] || 443:Inpex Endeavour CPF [Platform]
jetwave | 2 | 244:Jetwave Jasmin [Vessel] || 266:Jetwave Lightning [Vessel]
mermaid | 2 | 235:Mermaid Sound [Other] || 236:Mermaid Cove [Vessel]
noble | 2 | 242:Noble Deliverer [Vessel] || 446:Noble Tom Prosser [Vessel]
ocean | 2 | 154:Ocean Apex [Vessel] || 168:Ocean Monarch [Vessel]
wandoo | 2 | 141:Wandoo B [Platform] || 142:Wandoo A [Platform]
```

Statement 3 — exact worksite duplicates after case/space folding:

```
folded | count | string_agg
floatel triumph | 2 | 261,240
```

Statement 4 — exact employer duplicates after case/space folding:

```
(no rows)
```

### 06_oa_universe_crossmatch.sql

Statement 1 — OA Universe assets vs `worksites`:

```
asset | db_worksites
Angel | 157:Angel Platform [Platform,off]
Barossa | 438:Barossa Field [Gas_Field,on]
Barrow Island | 421:Barrow Island CO2 [Other,off]
Bass Strait platforms | — NO MATCH —
Bayu-Undan | 162:Bayu Undan [Other,off]
Browse | — NO MATCH —
Buffalo | — NO MATCH —
BW Opal | 441:Bw Opal HUC [Other,on]
Campbell platform | — NO MATCH —
Corvus | — NO MATCH —
Crux | 6:Crux Gas Field [Gas_Field,off]
Darwin / Bladin Point | 140:Darwin ILNG [Onshore_LNG,on] | 187:Darwin Airport [Airfield,off] | 252:Skandi Darwin [Vessel,off]
DLNG | — NO MATCH —
Dorado | — NO MATCH —
Elang/Kakatua | — NO MATCH —
Enfield | — NO MATCH —
Fletcher-Finucane | — NO MATCH —
Goodwyn A | 143:Goodwyn [Platform,off]
Gorgon / Jansz-Io subsea | 1:Gorgon LNG [Onshore_LNG,on] | 437:JIC/Gorgon [Other,on]
Greater Sunrise | — NO MATCH —
Griffin | — NO MATCH —
Halyard | — NO MATCH —
Harriet Alpha | 435:Harriett [Other,on]
Ichthys Explorer (CPF) | 7:Ichthys LNG [FPSO,off] | 147:Ichthys FPSO [FPSO,off] | 148:Ichthys [Other,off]
Ichthys Venturer (FPSO) | 160:Inpex Venturer FPSO [FPSO,off]
Jansz-Io Compression | 436:Jansz FCS [Platform,on]
John Brookes | — NO MATCH —
Julimar-Brunello | — NO MATCH —
Karratha Gas Plant | 20:Karratha (Town/Industrial) [Other,on] | 21:Karratha MPT Heliport [Heliport,on] | 136:Karratha Gas Plant [Gas_Plant,on] | 159:Karratha Airport [Airfield,off]
Macedon | 10:Macedon Gas Plant [Gas_Plant,on]
Minerva | — NO MATCH —
Montara | 15:Montara Venture FPSO [FPSO,off]
Mutineer-Exeter | — NO MATCH —
Ngujima-Yin FPSO | 11:Ngujima-Yin FPSO [FPSO,off]
Ningaloo Vision | 17:Ningaloo Vision FPSO [FPSO,off]
North Rankin Complex | 144:Rankin North [Platform,off]
Northern Endeavour | 19:Northern Endeavour FPSO [FPSO,off] | 443:Inpex Endeavour CPF [Platform,on]
NWS subsea tiebacks | 9:North West Shelf (NWS) Platforms [Platform,off]
Okha FPSO | 12:Okha FPSO [FPSO,off]
Onslow | — NO MATCH —
Pluto 2 | 138:Pluto 2 [Onshore_LNG,on]
Pluto A | 137:Pluto LNG [Onshore_LNG,on] | 138:Pluto 2 [Onshore_LNG,on] | 442:Pluto Alpha Platform [Platform,on]
Prelude FLNG | 5:Prelude FLNG [FLNG,off]
Pyrenees Venture FPSO | 18:Pyrenees Venture FPSO [FPSO,off]
Reindeer | — NO MATCH —
Scarborough FPU | 145:Scarborough FPU [FPU,off]
Spar / East Spar | — NO MATCH —
Spartan | — NO MATCH —
Stag | 16:Stag CPF [CPF,off]
Stybarrow | — NO MATCH —
Thevenard Island | — NO MATCH —
Varanus Island | 14:Varanus Island [Gas_Plant,on]
Waitsia | 434:Waitsia [Gas_Plant,on]
Wandoo | 141:Wandoo B [Platform,off] | 142:Wandoo A [Platform,off]
Wheatstone Platform | 2:Wheatstone LNG (Downstream) [Onshore_LNG,on] | 3:Wheatstone Platform [Platform,off] | 139:Wheatstone LNG [Onshore_LNG,on]
```

Statement 2 — OA Universe contractors vs `employers`:

```
company | db_employers
Allseas | — NO MATCH —
Altrad | 29:ALTRAD (Subcontractor)
Altrad Sparrows | 780:Sparrows Group (-)
AOS | 37:AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD (Subcontractor)
Applus+ | 78:APPLUS+ PTY LTD (-)
Atlas Professionals | 57:ATLAS PROGRAMMED MARINE (AUSTRALIA) PTY LTD (-)
Auriga Aviation | 52:AURIGA AVIATION HELICOPTER ENGINEERS (-) | 723:Auriga Aviation (Specialist)
Baker Hughes | 70:BAKER HUGHES SERVICES AUSTRALIA PTY LTD (-)
Bechtel | 700:Bechtel Australia (Major_Contractor)
Bhagwan Marine | 38:BHAGWAN MARINE LTD (Specialist)
Boskalis | — NO MATCH —
BW Offshore | 1:BW (-)
C2O | — NO MATCH —
CHC | 53:CHC HELICOPTER (AUSTRALIA) AIRCRAFT ENGINEERS (-)
Chevron | 2:CHEVRON GORGON OPERATIONS (-) | 3:CHEVRON WHEATSTONE DOWNSTREAM OPERATIONS (-) | 4:CHEVRON WHEATSTONE PLATFORM (-) | 691:Chevron (Principal_Employer)
Cleanaway | 709:Cleanaway Waste Management (Subcontractor)
Condex | — NO MATCH —
Cyan Renewables | 705:Cyan Renewables (Specialist)
DeepOcean / Shelf Subsea | — NO MATCH —
Diamond Offshore | 71:DIAMOND (-) | 748:Steel Diamond (Subcontractor)
DOF | 39:DOF MANAGEMENT AUSTRALIA PTY LTD (-)
Downer | 18:DOWNER EDI ENGINEERING ELECTRICAL LNG FACILITY SERVICES (-) | 710:Downer EDI Group (-)
EnerMech | 712:EnerMech (Subcontractor)
Ensco | 72:ENSCO AUSTRALIA PTY LIMITED (-)
Entier | 62:ENTIER AUSTRALIA PTY LTD (-)
Eris | 19:ERIS (Labour_Hire)
Ertech | 698:Vertech (Specialist) | 701:Powertech Pty Ltd (Subcontractor)
ESS / Compass | 58:COMPASS GROUP – (Major_Contractor)
Esso/ExxonMobil | — NO MATCH —
Fugro | 40:FUGRO AUSTRALIA PTY LTD (-)
GGC | — NO MATCH —
Go Offshore | 797:GO OFFSHORE (-)
GR Production Services | 765:GR Production Services (Subcontractor)
Heerema | — NO MATCH —
Helix | 721:Helix Robotic Solutions (Specialist)
IAS | 827:IAS Group (Subcontractor)
Inpex | 5:INPEX - ICHTHYS OPERATIONS (-) | 690:Inpex (Principal_Employer)
Isologics | 88:ISOLOGICS (-)
Jadestone | 6:JADESTONE ENERGY MONTARA VENTURE (-) | 7:JADESTONE ENERGY STAG CPF (-) | 693:Jadestone (Principal_Employer) | 695:JADESTONE ENERGY  (-)
Kaefer | 704:Kaefer Integrated Services Pty Ltd (Subcontractor)
KBSS | 725:KBSS Engineering (Subcontractor)
Kuiper | — NO MATCH —
Legeneering | 21:LEGENEERING (AUST.) PTY LTD (-)
LifeFlight | 730:LifeFlight (Specialist)
McDermott | 68:MCDERMOTT AUSTRALIA PTY LTD (-)
MMA Offshore | 699:MMA (Specialist)
MODEC | 93:MODEC Management Services (-) | 703:Modec (Subcontractor)
Monadelphous | 26:MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD (Major_Contractor)
MWOG | 27:MWOG PTY LTD (-)
NES Fircroft | 746:NES Fircroft (Subcontractor)
Noble | 73:NOBLE (-) | 736:Noble Corporation (Subcontractor)
Oceaneering | 83:OCEANEERING AUSTRALIA PTY LTD (-)
OSA | 707:Offshore Services Australasia (Subcontractor)
OSM | 43:OSM Australia Pty Ltd (-)
Parabellum | 711:Parabellum International (Subcontractor)
Petrofac | 737:Petrofac (Subcontractor)
PHI | 54:PHI INTERNATIONAL AUSTRALIA  (Specialist)
Powertech | 701:Powertech Pty Ltd (Subcontractor)
Programmed | 28:PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD (-) | 57:ATLAS PROGRAMMED MARINE (AUSTRALIA) PTY LTD (-)
Reach Subsea | 716:Reach Subsea (Specialist)
Saipem | 726:Saipem (-) | 778:Saipem Leighton Consortium (Major_Contractor)
Santos | 9:SANTOS WA ENERGY LIMITED VARANUS ISLAND HUB (-) | 692:Santos (Principal_Employer)
Sapura | — NO MATCH —
Sea1 | 799:Sea1 Offshore (-)
Sedco Forex | 75:SEDCO FOREX INTERNATIONAL INC (-)
SGS | 65:SGS PRELUDE CHEMISTS (-)
Shell | 10:SHELL PRELUDE (-) | 688:Shell (Principal_Employer)
Siem | 831:Siem Offshore (Specialist)
Siera | 46:SIERA MARINE MANAGEMENT PTY LTD (-)
Sodexo | 64:SODEXO REMOTE SITE (-)
Solstad | 47:SOLSTAD AUSTRALIA PTY LTD (-) | 717:Solstad Offshore ASA (Specialist)
Subsea7 | 716:Reach Subsea (Specialist)
Technip | 728:Technip (Subcontractor)
Tidewater | 48:TIDEWATER SHIP MANAGEMENT (AUSTRALIA) PTY LTD (-)
TMT | 84:TOTAL MARINE TECHNOLOGY PTY LTD (-)
Transocean | — NO MATCH —
UGL | 33:UGL RESOURCES (CONTRACTING) PTY LTD (-) | 826:ugl (Subcontractor)
UPS | 11:UPSTREAM PRODUCTION SOLUTIONS PTY LTD (-)
Valaris | 702:Valaris Marine (Subcontractor)
Van Oord | — NO MATCH —
Vantris / Sapura | — NO MATCH —
Ventia | 35:VENTIA AUSTRALIA PTY LTD (-)
Vermilion | 694:Vermilion (Principal_Employer)
Vertech | 698:Vertech (Specialist)
Weststar | — NO MATCH —
Wood | 12:WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO (-) | 13:WOODSIDE ENERGY LTD (-) | 14:WOODSIDE ENERGY MACEDON GAS PLANT (-) | 34:WOOD (-) | 689:Woodside (Principal_Employer)
Woodside | 12:WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO (-) | 13:WOODSIDE ENERGY LTD (-) | 14:WOODSIDE ENERGY MACEDON GAS PLANT (-) | 689:Woodside (Principal_Employer)
WPF Duratec | 66:DURATEC (-)
```

### 07_hierarchy_and_patches.sql

Statement 1 — campaign universe definitions:

```
campaign_id | name | campaign_type | status | sector_wide | is_standing | parent_campaign_id | universe_employers | universe_worksites | members | groups | units
15 | Test2 | bargaining | active | False | False |  | TestCo 2 | 3 | 72 |  | 0
21 | Toll Energy | bargaining | active | False | False |  | Toll Energy | 1 | 67 | work_area:Work area | 3
23 | Mono's Inpex Coordinators and Supervisors | bargaining | active | False | False |  | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | 3 | 48 | custom:Deployment | 4
26 | Decom sector | bargaining | active | True | False |  | ERIS; MCDERMOTT AUSTRALIA PTY LTD | 4 | 216 | employer:Employer, occupation:Occupation, custom:Custom | 15
27 | Mono's Woodside | bargaining | active | False | False |  | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | 3 | 382 | shift:Shift | 5
37 | testco | bargaining | active | False | False |  | TestCo 2 | 3 | 315 | worksite:Worksite | 3
41 | ESS Woodside | bargaining | active | False | False |  | COMPASS GROUP – | 4 | 61 | worksite:Worksite | 5
42 | EDI Downer Chevron | bargaining | active | False | False |  | Downer EDI Group | 2 | 140 | worksite:Worksite, shift:Shift, custom:Custom | 6
47 | UGL Varanus | bargaining | active | False | False |  | UGL RESOURCES (CONTRACTING) PTY LTD | 1 | 223 | work_area:Work area, custom:Union | 12
48 | UGL WA Oil | bargaining | active | False | False |  | UGL RESOURCES (CONTRACTING) PTY LTD | 0 | 219 | work_area:Work area | 3
49 | OA Membership Outreach | organising | active | False | True |  |  | 0 | 0 |  | 0
50 | Offshore Allliance internal | organising | active | False | False |  | Australian Workers' Union WA Branch; MUA | 1 | 11 |  | 0
55 | AOS catering | bargaining | active | False | False |  |  | 0 | 11 | worksite:Worksite | 1
57 | Deck officer and Engineers 2026 | bargaining | active | False | False |  | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD; BHAGWAN MARINE LTD; Cyan Renewables; DOF MANAGEMENT AUSTRALIA PTY LTD; GO OFFSHORE; Jan De Nul; JETWAVE MARINE SERVICES PTY. LTD.; Maersk; OSM Australia Pty Ltd; PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD; Rigforce Pty Ltd; Sea1 Offshore; SIERA MARINE MANAGEMENT PTY LTD; Solstad Offshore ASA; TIDEWATER SHIP MANAGEMENT (AUSTRALIA) PTY LTD; Unemployed; Unknown; Valaris Marine | 85 | 639 | worksite:Worksite, employer:Employer | 161
58 | Jadestone Stag | bargaining | active | False | False |  | JADESTONE ENERGY STAG CPF | 1 | 28 | work_area:Work area | 5
59 | Mono's Shell Crux | bargaining | active | False | False |  | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | 1 | 196 | work_area:Work area | 8
60 | UGL CO2 | organising | active | False | False |  | UGL RESOURCES (CONTRACTING) PTY LTD | 1 | 224 |  | 0
61 | Fugro | bargaining | active | False | False | 64 | FUGRO AUSTRALIA PTY LTD | 3 | 52 | worksite:Worksite, custom:Custom | 6
62 | programmed ROV | bargaining | active | False | False | 64 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | 3 | 64 | custom:Vessel | 3
64 | ROV sector wide | political | active | False | False |  | DOF MANAGEMENT AUSTRALIA PTY LTD; FUGRO AUSTRALIA PTY LTD; Helix Robotic Solutions; OCEANEERING AUSTRALIA PTY LTD; PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD; Reach Subsea; Technip; TOTAL MARINE TECHNOLOGY PTY LTD | 0 | 364 | employer:Employer, work_area:Work area | 10
65 | Parrabellum | bargaining | planning | False | False |  | Parabellum International | 2 | 15 |  | 0
66 | Parabellum Barrow | bargaining | planning | False | False |  | Parabellum International | 1 | 14 |  | 0
68 | Oceaneering EB A | bargaining | active | False | False |  | OCEANEERING AUSTRALIA PTY LTD | 0 | 39 |  | 0
69 | TMT Bargaining 2026 | bargaining | active | False | False | 64 | TOTAL MARINE TECHNOLOGY PTY LTD | 0 | 56 | work_area:Work area | 3
```

Statement 2 — organising unit bases:

```
ou_type | units | with_employer | with_worksite | custom
worksite | 156 | 143 | 135 | 0
work_area | 31 | 0 | 0 | 19
employer | 28 | 28 | 0 | 0
custom | 21 | 0 | 0 | 9
job_type | 9 | 0 | 0 | 0
shift | 8 | 0 | 0 | 3
```

Statement 3 — organiser patches:

```
patch_id | patch_name | organiser_name | entity_type | entity_id | entity
1 | Jason | Jason Lipscombe | agreement | 5 | INPEX - ICHTHYS OPERATIONS ENTERPRISE AGREEMENT 2022-2026
1 | Jason | Jason Lipscombe | agreement | 7 | Jadestone Stag
1 | Jason | Jason Lipscombe | agreement | 10 | Shell Prelude
1 | Jason | Jason Lipscombe | agreement | 63 | PHI INTERNATIONAL AUSTRALIA PTY LTD KARRATHA MPT HELICOPTER ENGINEERS ENTERPRISE AGREEMENT 2023
1 | Jason | Jason Lipscombe | agreement | 68 | COMPASS GROUP – ESS OFFSHORE OIL & GAS (WHEATSTONE PLATFORM) ENTERPRISE AGREEMENT 2022
1 | Jason | Jason Lipscombe | employer | 6 | JADESTONE ENERGY MONTARA VENTURE
1 | Jason | Jason Lipscombe | employer | 56 | 
1 | Jason | Jason Lipscombe | employer | 60 | 
2 | Jarred | Jarred Payne |  |  | 
```

## 3. Clone profile

### 00_profile_counts.sql

Statement (the single `SELECT ... UNION ALL ...` row-count query) errored:

```
ERROR:  42P01: relation "membership_update_batches" does not exist
LINE 40:   SELECT 'membership_update_batches', count(*) FROM membership_update_batches UNION ALL
                                                             ^
```

### 01_profile_employers.sql

Statement 1 — one row per employer:

```
employer_id | employer_name | trading_name | employer_category | parent_employer_id | has_abn | is_active | created | active_workers | worksite_roles | agreements | aliases | campaign_universes
714 | Acciona Construction Australia |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
752 | Acrow |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
792 | Aegis Offshore Maintenance Pty Ltd |  | Major_Contractor |  | False | True | 2026-04-16 | 108 | 0 | 0 | 0 | 0
706 | AGIG |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
753 | Airswift |  | Specialist |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
790 | Alliance Site Services |  | Major_Contractor |  | False | True | 2026-04-09 | 95 | 1 | 0 | 0 | 0
29 | ALTRAD |  | Subcontractor |  | False | True | 2026-03-10 | 0 | 3 | 6 | 5 | 0
78 | APPLUS+ PTY LTD |  |  |  | False | True | 2026-03-10 | 0 | 2 | 4 | 1 | 0
729 | Archer Well Company (Aust) Pl |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
57 | ATLAS PROGRAMMED MARINE (AUSTRALIA) PTY LTD |  |  |  | False | True | 2026-03-10 | 0 | 0 | 4 | 0 | 0
723 | Auriga Aviation |  | Specialist |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
52 | AURIGA AVIATION HELICOPTER ENGINEERS |  |  |  | False | True | 2026-03-10 | 0 | 0 | 1 | 0 | 0
37 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | Subcontractor |  | False | True | 2026-03-10 | 57 | 30 | 6 | 3 | 1
741 | Australian Workers' Union WA Branch |  | Specialist |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 1
70 | BAKER HUGHES SERVICES AUSTRALIA PTY LTD |  |  |  | False | True | 2026-03-10 | 3 | 0 | 1 | 0 | 0
700 | Bechtel Australia |  | Major_Contractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
754 | Benthic |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
38 | BHAGWAN MARINE LTD |  | Specialist |  | False | True | 2026-03-10 | 7 | 5 | 2 | 0 | 1
755 | Broadspectrum Ltd/Transfield |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
1 | BW |  |  |  | False | True | 2026-03-10 | 1 | 1 | 1 | 0 | 0
742 | Cable Restoration Australia |  | Specialist |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
720 | Cameron Services International |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
53 | CHC HELICOPTER (AUSTRALIA) AIRCRAFT ENGINEERS |  |  |  | False | True | 2026-03-10 | 0 | 0 | 1 | 0 | 0
691 | Chevron |  | Principal_Employer |  | False | True | 2026-03-13 | 1 | 0 | 0 | 0 | 0
2 | CHEVRON GORGON OPERATIONS |  |  | 691 | False | True | 2026-03-10 | 0 | 4 | 1 | 0 | 0
3 | CHEVRON WHEATSTONE DOWNSTREAM OPERATIONS |  |  | 691 | False | True | 2026-03-10 | 0 | 1 | 1 | 0 | 0
4 | CHEVRON WHEATSTONE PLATFORM |  |  | 691 | False | True | 2026-03-10 | 0 | 2 | 1 | 0 | 0
709 | Cleanaway Waste Management |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
724 | Clough |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
58 | COMPASS GROUP – |  | Major_Contractor |  | False | True | 2026-03-10 | 60 | 14 | 10 | 1 | 1
16 | CONTRACT RESOURCES PTY LTD |  |  |  | False | True | 2026-03-10 | 0 | 0 | 1 | 0 | 0
705 | Cyan Renewables |  | Specialist |  | False | True | 2026-04-01 | 37 | 16 | 0 | 0 | 1
17 | DAMPIER BUNBURY NATURAL GAS PIPELINE (DBNGP)  NATIONAL CONTROL CENTRE |  |  |  | False | True | 2026-03-10 | 0 | 2 | 1 | 1 | 0
71 | DIAMOND |  |  |  | False | True | 2026-03-10 | 0 | 0 | 2 | 0 | 0
39 | DOF MANAGEMENT AUSTRALIA PTY LTD |  |  |  | False | True | 2026-03-10 | 74 | 7 | 3 | 1 | 2
18 | DOWNER EDI ENGINEERING ELECTRICAL LNG FACILITY SERVICES |  |  |  | False | True | 2026-03-10 | 3 | 0 | 1 | 0 | 0
710 | Downer EDI Group |  |  |  | False | True | 2026-04-01 | 132 | 1 | 0 | 0 | 1
66 | DURATEC |  |  |  | False | True | 2026-03-10 | 0 | 0 | 1 | 0 | 0
712 | EnerMech |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
756 | Enhanced Drilling |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
72 | ENSCO AUSTRALIA PTY LIMITED |  |  |  | False | True | 2026-03-10 | 0 | 0 | 1 | 0 | 0
757 | Ensign Intn Energy Services |  |  |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
62 | ENTIER AUSTRALIA PTY LTD |  |  |  | False | True | 2026-03-10 | 0 | 1 | 1 | 0 | 0
758 | Epigroup |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
19 | ERIS |  | Labour_Hire |  | False | True | 2026-03-10 | 107 | 4 | 6 | 5 | 1
759 | Everllence |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
760 | Expro Group Aust Pty Ltd |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
761 | Firesafe Group |  | Specialist |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
762 | Fortescue Metals Group |  | Producer |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
788 | Fortis Maintenance Services |  | Major_Contractor |  | False | True | 2026-04-09 | 120 | 1 | 0 | 0 | 0
40 | FUGRO AUSTRALIA PTY LTD |  |  |  | False | True | 2026-03-10 | 39 | 3 | 3 | 1 | 2
763 | Fuze Group |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
764 | GFS NDT |  | Specialist |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
797 | GO OFFSHORE |  |  |  | False | True | 2026-06-10 | 21 | 10 | 0 | 0 | 1
765 | GR Production Services |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
766 | Heat Tech Australia |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
721 | Helix Robotic Solutions |  | Specialist |  | False | True | 2026-04-01 | 4 | 0 | 0 | 0 | 1
690 | Inpex |  | Principal_Employer |  | False | True | 2026-03-13 | 2 | 0 | 0 | 0 | 0
5 | INPEX - ICHTHYS OPERATIONS |  |  |  | False | True | 2026-03-10 | 0 | 2 | 1 | 0 | 0
734 | Inverse Group |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
743 | IQIP |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
88 | ISOLOGICS |  |  |  | False | True | 2026-03-10 | 0 | 0 | 1 | 0 | 0
693 | Jadestone |  | Principal_Employer |  | False | True | 2026-03-13 | 0 | 0 | 0 | 0 | 0
695 | JADESTONE ENERGY  |  |  |  | False | True | 2026-03-31 | 1 | 0 | 0 | 0 | 0
6 | JADESTONE ENERGY MONTARA VENTURE |  |  | 695 | False | True | 2026-03-10 | 0 | 2 | 2 | 1 | 0
7 | JADESTONE ENERGY STAG CPF |  |  | 695 | False | True | 2026-03-10 | 23 | 1 | 1 | 0 | 1
801 | Jan De Nul |  |  |  | False | True | 2026-06-10 | 2 | 1 | 0 | 0 | 1
41 | JETWAVE MARINE SERVICES PTY. LTD. |  |  |  | False | True | 2026-03-10 | 3 | 4 | 1 | 0 | 1
735 | JPS Management & Execution |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
704 | Kaefer Integrated Services Pty Ltd |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
725 | KBSS Engineering |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
718 | Kent Offshore |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
21 | LEGENEERING (AUST.) PTY LTD |  |  |  | False | True | 2026-03-10 | 2 | 0 | 3 | 1 | 0
730 | LifeFlight |  | Specialist |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
767 | Maersk |  | Subcontractor |  | False | True | 2026-04-01 | 1 | 2 | 0 | 0 | 1
768 | Maritime Constructions |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
68 | MCDERMOTT AUSTRALIA PTY LTD |  |  |  | False | True | 2026-03-10 | 90 | 3 | 4 | 1 | 1
744 | Mechanical Project Services |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
769 | Medical Rescue |  | Specialist |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
770 | MEGT Australia |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
745 | Mermaid Marine |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 1 | 0 | 0 | 0
719 | Mitsui E&P Australia |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
25 | MIZCO PTY LTD |  |  |  | False | True | 2026-03-10 | 0 | 1 | 1 | 0 | 0
699 | MMA |  | Specialist |  | False | True | 2026-03-31 | 2 | 1 | 2 | 0 | 0
771 | Mobilize |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
703 | Modec |  | Subcontractor |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
93 | MODEC Management Services |  |  |  | False | True | 2026-03-10 | 0 | 1 | 3 | 1 | 0
26 | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD |  | Major_Contractor |  | False | True | 2026-03-10 | 335 | 9 | 7 | 6 | 3
731 | MSS Security |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
795 | MUA |  |  |  | False | True | 2026-05-28 | 3 | 0 | 0 | 0 | 1
27 | MWOG PTY LTD |  |  |  | False | True | 2026-03-10 | 0 | 1 | 1 | 0 | 0
746 | NES Fircroft |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
73 | NOBLE |  |  |  | False | True | 2026-03-10 | 0 | 0 | 1 | 0 | 0
736 | Noble Corporation |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
772 | Nopsema |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
773 | North Kimberley Airport |  | Specialist |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
793 | NorthStar Marine Coatings |  | Subcontractor |  | False | True | 2026-04-16 | 48 | 3 | 0 | 0 | 0
774 | O-Tech Services Pty Ltd |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
83 | OCEANEERING AUSTRALIA PTY LTD |  |  |  | False | True | 2026-03-10 | 39 | 0 | 1 | 0 | 1
722 | Oceania Engineering Services |  | Specialist |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
794 | Offshore Crew Services Ltd |  | Major_Contractor |  | False | True | 2026-04-16 | 84 | 0 | 0 | 0 | 0
707 | Offshore Services Australasia |  | Subcontractor |  | False | True | 2026-04-01 | 1 | 0 | 0 | 0 | 0
43 | OSM Australia Pty Ltd |  |  |  | False | True | 2026-03-10 | 77 | 27 | 7 | 1 | 1
789 | Pacific Coatings & Insulation |  | Subcontractor |  | False | True | 2026-04-09 | 55 | 1 | 0 | 0 | 0
711 | Parabellum International |  | Subcontractor |  | False | True | 2026-04-01 | 14 | 0 | 0 | 0 | 2
737 | Petrofac |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
54 | PHI INTERNATIONAL AUSTRALIA  |  | Specialist |  | False | True | 2026-03-10 | 1 | 6 | 3 | 2 | 0
701 | Powertech Pty Ltd |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
732 | Pressure Dynamics |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
28 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD |  |  |  | False | True | 2026-03-10 | 58 | 17 | 10 | 6 | 3
775 | Qetra |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
715 | Qube Ports & Bulk |  | Specialist |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
738 | Radiation Professionals Australia |  | Specialist |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
776 | RCSS |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
716 | Reach Subsea |  | Specialist |  | False | True | 2026-04-01 | 8 | 0 | 0 | 0 | 1
798 | Rigforce Pty Ltd |  | Subcontractor |  | False | True | 2026-06-10 | 4 | 5 | 0 | 0 | 1
777 | Royal Flying Doctor Service |  | Specialist |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
739 | Safehouse Habitats Australia |  | Specialist |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
747 | Safety Direct Solutions |  | Specialist |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
726 | Saipem |  |  |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
778 | Saipem Leighton Consortium |  | Major_Contractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
692 | Santos |  | Principal_Employer |  | False | True | 2026-03-13 | 0 | 0 | 0 | 0 | 0
9 | SANTOS WA ENERGY LIMITED VARANUS ISLAND HUB |  |  | 692 | False | True | 2026-03-10 | 0 | 1 | 1 | 0 | 0
733 | SchlumbergerAustralia Pty Ltd |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
740 | Score Group |  |  |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
799 | Sea1 Offshore |  |  |  | False | True | 2026-06-10 | 2 | 3 | 0 | 0 | 1
75 | SEDCO FOREX INTERNATIONAL INC |  |  |  | False | True | 2026-03-10 | 0 | 0 | 1 | 0 | 0
65 | SGS PRELUDE CHEMISTS |  |  |  | False | True | 2026-03-10 | 0 | 1 | 1 | 0 | 0
688 | Shell |  | Principal_Employer |  | False | True | 2026-03-13 | 3 | 0 | 0 | 0 | 0
10 | SHELL PRELUDE |  |  | 688 | False | True | 2026-03-10 | 0 | 2 | 1 | 0 | 0
46 | SIERA MARINE MANAGEMENT PTY LTD |  |  |  | False | True | 2026-03-10 | 10 | 4 | 2 | 0 | 1
727 | Sitemec Engineering |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
779 | SLB |  |  |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
64 | SODEXO REMOTE SITE |  |  |  | False | True | 2026-03-10 | 0 | 1 | 1 | 0 | 0
47 | SOLSTAD AUSTRALIA PTY LTD |  |  |  | False | True | 2026-03-10 | 0 | 0 | 2 | 0 | 0
717 | Solstad Offshore ASA |  | Specialist |  | False | True | 2026-04-01 | 9 | 7 | 0 | 0 | 1
780 | Sparrows Group |  |  |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
748 | Steel Diamond |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
728 | Technip |  | Subcontractor |  | False | True | 2026-04-01 | 2 | 0 | 0 | 0 | 1
15 | TEEKAY SHIPPING (AUSTRALIA) PTY LTD |  |  |  | False | True | 2026-03-10 | 0 | 1 | 2 | 0 | 0
791 | TestCo 2 |  | Producer |  | False | True | 2026-04-16 | 73 | 3 | 0 | 0 | 2
787 | TestCo Energy |  | Producer |  | False | True | 2026-04-09 | 80 | 1 | 0 | 0 | 0
48 | TIDEWATER SHIP MANAGEMENT (AUSTRALIA) PTY LTD |  |  |  | False | True | 2026-03-10 | 12 | 10 | 1 | 0 | 1
781 | Titan Recruitment |  |  |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
713 | Toll Energy |  | Specialist |  | False | True | 2026-04-01 | 56 | 1 | 0 | 0 | 1
782 | Toll West |  |  |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
84 | TOTAL MARINE TECHNOLOGY PTY LTD |  |  |  | False | True | 2026-03-10 | 32 | 0 | 2 | 0 | 1
97 | TRACE |  |  |  | False | True | 2026-03-10 | 0 | 0 | 1 | 0 | 0
749 | Trace JV |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
33 | UGL RESOURCES (CONTRACTING) PTY LTD |  |  |  | False | True | 2026-03-10 | 219 | 3 | 3 | 2 | 3
813 | Unemployed |  | Specialist |  | False | True | 2026-06-10 | 3 | 2 | 0 | 0 | 1
800 | Unknown |  | Specialist |  | False | True | 2026-06-10 | 4 | 0 | 0 | 0 | 1
11 | UPSTREAM PRODUCTION SOLUTIONS PTY LTD |  |  |  | False | True | 2026-03-10 | 0 | 1 | 1 | 0 | 0
702 | Valaris Marine |  | Subcontractor |  | False | True | 2026-04-01 | 1 | 1 | 0 | 0 | 1
35 | VENTIA AUSTRALIA PTY LTD |  |  |  | False | True | 2026-03-10 | 0 | 2 | 1 | 0 | 0
750 | Veolia Environ Srvs |  | Specialist |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
694 | Vermilion |  | Principal_Employer |  | False | True | 2026-03-27 | 0 | 0 | 0 | 0 | 0
698 | Vertech |  | Specialist |  | False | True | 2026-03-31 | 0 | 1 | 0 | 0 | 0
783 | Viking Life-Saving Equipment |  |  |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
784 | Warrikal Mining |  |  |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
785 | Water Corporation WA |  |  |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
708 | Weatherford Australia |  | Subcontractor |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
751 | Wirringulla Workforce |  | Labour_Hire |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
34 | WOOD |  |  |  | False | True | 2026-03-10 | 0 | 0 | 2 | 0 | 0
689 | Woodside |  | Principal_Employer |  | False | True | 2026-03-13 | 0 | 0 | 0 | 0 | 0
13 | WOODSIDE ENERGY LTD |  |  |  | False | True | 2026-03-10 | 28 | 3 | 1 | 0 | 0
12 | WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO |  |  | 13 | False | True | 2026-03-10 | 0 | 5 | 1 | 0 | 0
14 | WOODSIDE ENERGY MACEDON GAS PLANT |  |  | 13 | False | True | 2026-03-10 | 0 | 1 | 1 | 0 | 0
98 | WORKFORCE LOGISTICS PTY LTD |  |  |  | False | True | 2026-03-10 | 0 | 0 | 1 | 0 | 0
36 | XELERATOR PTY LTD |  |  |  | False | True | 2026-03-10 | 0 | 1 | 1 | 0 | 0
786 | Zenith Energy |  |  |  | False | True | 2026-04-01 | 0 | 0 | 0 | 0 | 0
```

Statement 2 — aliases and the merges that created them:

```
alias_name | canonical | source | created_at
R.E.C. | ALTRAD | merge | 2026-03-31
RIDGEBAY HOLDINGS KARRATHA | ALTRAD | merge | 2026-03-31
RIDGEBAY HOLDINGS PTY LTD | ALTRAD | merge | 2026-03-31
SPECIALIST PEOPLE | ALTRAD | merge | 2026-03-31
SPECIALIST PEOPLE – | ALTRAD | merge | 2026-03-31
APPLUS+ PLY LTD | APPLUS+ PTY LTD | merge | 2026-03-31
AOS CONTRACT DREDGING | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | merge | 2026-03-31
AOS PTY LTD | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | merge | 2026-03-31
AUSTRALIAN OFFSHORE SOLUTIONS (AOS) PTY LTD | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | merge | 2026-03-31
COMPASS GROUP - ESS | COMPASS GROUP – | merge | 2026-03-31
DBP/APA | DAMPIER BUNBURY NATURAL GAS PIPELINE (DBNGP)  NATIONAL CONTROL CENTRE | merge | 2026-03-31
DOF SUBSEA AUSTRALIA PTY LTD | DOF MANAGEMENT AUSTRALIA PTY LTD | merge | 2026-03-31
ERIS | ERIS | merge | 2026-03-31
KUIPER AUSTRALIA PTYLTD | ERIS | merge | 2026-03-31
KUIPER AUSTRALIA PTYLTD - | ERIS | merge | 2026-03-31
KUIPER ENERGY | ERIS | merge | 2026-03-31
KUIPER ENERGY SOLUTIONS PTY LTD | ERIS | merge | 2026-03-31
FUGRO AUSTRALIA MARINE PTY LTD | FUGRO AUSTRALIA PTY LTD | merge | 2026-03-31
JADESTONE ENERGRY MONTARA VENTURE | JADESTONE ENERGY MONTARA VENTURE | merge | 2026-03-31
LEGENEERING SERVICES PTY LTD | LEGENEERING (AUST.) PTY LTD | merge | 2026-03-31
MCDERMOTT AUSTRALIA (CREWING SERVICES) PTY LTD | MCDERMOTT AUSTRALIA PTY LTD | merge | 2026-03-31
MODEC MANAGEMENT SERVICES PTE | MODEC Management Services | merge | 2026-03-31
M MAINTENANCE SERVICES PTY LTD | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | merge | 2026-03-31
M&ISS PTY LTD | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | merge | 2026-03-31
MEA | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | merge | 2026-03-31
MEA PTY LTD | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | merge | 2026-03-31
MMA | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | merge | 2026-03-31
Monadelphous | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | merge | 2026-03-31
OSM | OSM Australia Pty Ltd | merge | 2026-03-31
PHI INTERNATIONAL AUSTRALIA KIMBERLEY ENGINEERING AND RAMP STAFF | PHI INTERNATIONAL AUSTRALIA  | merge | 2026-03-31
PHI INTERNATIONAL AUSTRALIA PTY LTD | PHI INTERNATIONAL AUSTRALIA  | merge | 2026-03-31
PROGRAMMED MARINE PTY LTD | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | merge | 2026-03-31
PROGRAMMED OFFSHORE PTY LTD | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | merge | 2026-03-31
RFM OFFSHORE PTY LTD | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | merge | 2026-03-31
RFM OS PTY LTD | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | merge | 2026-03-31
RIGFORCE | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | merge | 2026-03-31
RIGFORCE CONTRACTING PTY LTD | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | merge | 2026-03-31
IAS GROUP | UGL RESOURCES (CONTRACTING) PTY LTD | merge | 2026-03-31
UGL OPERATIONS AND | UGL RESOURCES (CONTRACTING) PTY LTD | merge | 2026-03-31
```

Statement 3 — employer_merge_events:

```
id | survivor_employer_id | victim_employer_ids | created_at | payload_summary
1 | 78 | [79] | 2026-03-31 | {"alias_names": ["APPLUS+ PLY LTD"], "workers_updated": 0, "canonical_employer_name": "APPLUS+ PTY LTD"}
2 | 37 | [76, 77] | 2026-03-31 | {"alias_names": ["AOS CONTRACT DREDGING", "AUSTRALIAN OFFSHORE SOLUTIONS (AOS) PTY LTD"], "workers_updated": 0, "canonical_employer_name": "AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD"}
5 | 17 | [295] | 2026-03-31 | {"alias_names": ["DBP/APA"], "workers_updated": 0, "canonical_employer_name": "DAMPIER BUNBURY NATURAL GAS PIPELINE (DBNGP)\r\nNATIONAL CONTROL CENTRE"}
6 | 39 | [81] | 2026-03-31 | {"alias_names": ["DOF SUBSEA AUSTRALIA PTY LTD"], "workers_updated": 0, "canonical_employer_name": "DOF MANAGEMENT AUSTRALIA PTY LTD"}
7 | 33 | [32, 87] | 2026-03-31 | {"alias_names": ["IAS GROUP", "UGL OPERATIONS AND"], "workers_updated": 0, "canonical_employer_name": "UGL RESOURCES (CONTRACTING) PTY LTD"}
8 | 40 | [82] | 2026-03-31 | {"alias_names": ["FUGRO AUSTRALIA MARINE PTY LTD"], "workers_updated": 0, "canonical_employer_name": "FUGRO AUSTRALIA PTY LTD"}
9 | 6 | [89] | 2026-03-31 | {"alias_names": ["JADESTONE ENERGRY MONTARA VENTURE"], "workers_updated": 0, "canonical_employer_name": "JADESTONE ENERGY MONTARA VENTURE"}
10 | 19 | [20, 67, 90, 91] | 2026-03-31 | {"alias_names": ["KUIPER AUSTRALIA PTYLTD", "KUIPER AUSTRALIA PTYLTD -", "KUIPER ENERGY", "KUIPER ENERGY SOLUTIONS PTY LTD"], "workers_updated": 0, "canonical_employer_name": "KUIPER AUSTRALIA PTY LTD"}
11 | 43 | [49, 63] | 2026-03-31 | {"alias_names": ["OSM"], "workers_updated": 0, "canonical_employer_name": "OSM Australia Pty Ltd"}
12 | 19 | [696] | 2026-03-31 | {"alias_names": ["ERIS"], "workers_updated": 0, "canonical_employer_name": "KUIPER AUSTRALIA PTY LTD"}
13 | 21 | [92] | 2026-03-31 | {"alias_names": ["LEGENEERING SERVICES PTY LTD"], "workers_updated": 0, "canonical_employer_name": "LEGENEERING (AUST.) PTY LTD"}
14 | 68 | [80] | 2026-03-31 | {"alias_names": ["MCDERMOTT AUSTRALIA (CREWING SERVICES) PTY LTD"], "workers_updated": 0, "canonical_employer_name": "MCDERMOTT AUSTRALIA PTY LTD"}
15 | 26 | [22, 23, 24, 42, 69, 697] | 2026-03-31 | {"alias_names": ["M MAINTENANCE SERVICES PTY LTD", "M&ISS PTY LTD", "MEA", "MEA PTY LTD", "MMA", "Monadelphous"], "workers_updated": 0, "canonical_employer_name": "MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD"}
16 | 93 | [8] | 2026-03-31 | {"alias_names": ["MODEC MANAGEMENT SERVICES PTE"], "workers_updated": 0, "canonical_employer_name": "MODEC Management Services"}
17 | 54 | [55, 56] | 2026-03-31 | {"alias_names": ["PHI INTERNATIONAL AUSTRALIA KIMBERLEY ENGINEERING AND RAMP STAFF", "PHI INTERNATIONAL AUSTRALIA PTY LTD"], "workers_updated": 0, "canonical_employer_name": "PHI INTERNATIONAL AUSTRALIA GASCOYNE ENGINEERING AND RAMP STAFF"}
18 | 29 | [30, 31, 96] | 2026-03-31 | {"alias_names": ["RIDGEBAY HOLDINGS KARRATHA", "RIDGEBAY HOLDINGS PTY LTD", "SPECIALIST PEOPLE"], "workers_updated": 0, "canonical_employer_name": "REC – ALTRAD"}
19 | 29 | [94] | 2026-03-31 | {"alias_names": ["R.E.C."], "workers_updated": 0, "canonical_employer_name": "REC – ALTRAD"}
20 | 28 | [44, 45, 50, 51, 74, 86] | 2026-03-31 | {"alias_names": ["PROGRAMMED MARINE PTY LTD", "PROGRAMMED OFFSHORE PTY LTD", "RFM OFFSHORE PTY LTD", "RFM OS PTY LTD", "RIGFORCE", "RIGFORCE CONTRACTING PTY LTD"], "workers_updated": 0, "canonical_employer_name": "PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD"}
21 | 29 | [95] | 2026-03-31 | {"alias_names": ["SPECIALIST PEOPLE –"], "workers_updated": 0, "canonical_employer_name": "ALTRAD"}
22 | 37 | [85] | 2026-03-31 | {"alias_names": ["AOS PTY LTD"], "workers_updated": 0, "canonical_employer_name": "AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD"}
3 |  | [60] | 2026-03-31 | {"alias_names": ["COMPASS GROUP ESS"], "workers_updated": 0, "canonical_employer_name": "COMPASS GROUP - ESS"}
4 |  | [61] | 2026-03-31 | {"alias_names": ["COMPASS GROUP-"], "workers_updated": 0, "canonical_employer_name": "COMPASS GROUP - ESS"}
23 | 58 | [59] | 2026-03-31 | {"alias_names": ["COMPASS GROUP - ESS"], "workers_updated": 0, "canonical_employer_name": "COMPASS GROUP –"}
```

Statement 4 — category distribution:

```
category | count
(null) | 69
Subcontractor | 55
Specialist | 27
Major_Contractor | 8
Principal_Employer | 7
Producer | 3
Labour_Hire | 2
```

Statement 5 — naming-convention split by created month:

```
convention | created_month | count
mixed case | 2026-03 | 10
UPPERCASE | 2026-03 | 59
mixed case | 2026-04 | 90
UPPERCASE | 2026-04 | 5
UPPERCASE | 2026-05 | 1
mixed case | 2026-06 | 5
UPPERCASE | 2026-06 | 1
```

### 02_profile_worksites.sql

Statement 1 — one row per worksite:

```
worksite_id | worksite_name | worksite_type | is_offshore | basin | is_active | parent_worksite_id | created | principal_employer | operator | has_coords | active_workers | employer_roles | agreement_links | campaign_universes | aliases
178 | Acciona Jackup barge | Other | True |  | True |  | 2026-04-01 |  |  | False | 0 | 0 | 0 | 0 | 0
184 | AGIG Control Roo | Other | True |  | True |  | 2026-04-01 |  |  | False | 0 | 0 | 0 | 0 | 0
170 | Alkimos | Other | True |  | True |  | 2026-04-01 |  |  | True | 0 | 0 | 0 | 0 | 0
181 | Alkimos marine works | Other | True |  | True |  | 2026-04-01 |  |  | True | 0 | 1 | 0 | 0 | 0
180 | Alkimos seawater alliance | Other | True |  | True |  | 2026-04-01 |  |  | True | 0 | 0 | 0 | 0 | 0
264 | Anchor Handlers | Vessel | True |  | True |  | 2026-06-10 | Solstad Offshore ASA |  | False | 0 | 1 | 0 | 0 | 0
237 | Andreas Viking | Vessel | True |  | True |  | 2026-06-10 | Cyan Renewables |  | False | 2 | 2 | 0 | 1 | 0
157 | Angel Platform | Platform | True |  | True |  | 2026-04-01 |  |  | True | 0 | 1 | 0 | 0 | 0
179 | ASWA Beverly | Other | True |  | True |  | 2026-04-01 |  |  | False | 0 | 0 | 0 | 0 | 0
153 | Audacia | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 0 | 0 | 0 | 0 | 0
430 | Australian Submarine Corporation | Other | False |  | True |  | 2026-08-24 |  |  | False | 0 | 0 | 0 | 0 | 0
185 | AWU Head Office | Other | True |  | True |  | 2026-04-01 |  |  | False | 0 | 0 | 0 | 0 | 0
420 | Barge catering | Other | True |  | True |  | 2026-06-11 |  |  | False | 10 | 1 | 0 | 0 | 0
421 | Barrow Island CO2 | Other | True |  | True |  | 2026-07-20 |  |  | False | 2 | 1 | 0 | 2 | 0
162 | Bayu Undan | Other | True |  | True |  | 2026-04-01 |  |  | True | 0 | 0 | 0 | 0 | 0
182 | Beverley jub alkimos | Other | True |  | True |  | 2026-04-01 |  |  | True | 0 | 0 | 0 | 0 | 0
241 | Bigroll Bering | Vessel | True |  | True |  | 2026-06-10 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD |  | False | 3 | 1 | 0 | 1 | 1
222 | Boka Centre | Other | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 1 | 1 | 0 | 1 | 0
8 | Brewster Drill Centre | Drill_Centre | True | Browse | True |  | 2026-03-10 | Inpex | INPEX - ICHTHYS OPERATIONS | True | 0 | 2 | 1 | 0 | 0
224 | Bridge | Other | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 1 | 1 | 0 | 1 | 0
163 | Broome Airport | Airfield | True |  | True |  | 2026-04-01 |  |  | True | 0 | 2 | 0 | 0 | 0
25 | BW Offshore FPSO | FPSO | True | Carnarvon | True |  | 2026-03-10 |  | BW | True | 2 | 1 | 1 | 0 | 0
223 | Castorone | Other | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 2 | 1 | 0 | 1 | 0
202 | CASUAL EMPLOYEES | Other | True |  | True |  | 2026-05-04 | COMPASS GROUP – |  | False | 3 | 2 | 0 | 1 | 0
4 | Chevron Facilities (General) | Onshore_Facilities | False | Carnarvon | False |  | 2026-03-10 | Chevron | CHEVRON GORGON OPERATIONS | True | 0 | 2 | 2 | 0 | 0
257 | CMV Athos | Vessel | True |  | True |  | 2026-06-10 | BHAGWAN MARINE LTD |  | False | 4 | 1 | 0 | 1 | 0
6 | Crux Gas Field | Gas_Field | True | Browse | True |  | 2026-03-10 | Shell | SHELL PRELUDE | True | 2 | 5 | 1 | 2 | 0
187 | Darwin Airport | Airfield | True |  | True |  | 2026-04-01 |  |  | True | 0 | 0 | 0 | 0 | 0
140 | Darwin ILNG | Onshore_LNG | False |  | True |  | 2026-03-27 | Inpex |  | True | 1 | 2 | 0 | 2 | 0
24 | DBNGP Pipeline | Pipeline | False | N/A | True |  | 2026-03-10 |  | DAMPIER BUNBURY NATURAL GAS PIPELINE (DBNGP)  NATIONAL CONTROL CENTRE | True | 0 | 3 | 1 | 0 | 0
151 | Deep Orient | Other | True |  | True |  | 2026-04-01 |  |  | False | 9 | 1 | 0 | 1 | 0
150 | DLV2000 | Other | True |  | True |  | 2026-04-01 |  |  | False | 84 | 3 | 0 | 2 | 0
253 | Dof Subsea | Vessel | True |  | True |  | 2026-06-10 | DOF MANAGEMENT AUSTRALIA PTY LTD |  | False | 0 | 1 | 0 | 0 | 0
215 | DOF Vessels | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 3 | 1 | 0 | 0 | 0
258 | DP2 Seamaster | Vessel | True |  | True |  | 2026-06-10 | BHAGWAN MARINE LTD |  | False | 0 | 1 | 0 | 1 | 0
156 | DPS1 | Other | True |  | True |  | 2026-04-01 |  |  | False | 0 | 1 | 0 | 0 | 0
259 | Dryden | Vessel | True |  | True |  | 2026-06-10 | BHAGWAN MARINE LTD |  | False | 2 | 1 | 0 | 1 | 0
146 | Explorer CPF | CPF | True |  | True | 148 | 2026-03-27 | Inpex |  | True | 18 | 1 | 0 | 1 | 0
171 | Felicity PSV | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 0 | 2 | 0 | 1 | 0
240 | Floatel triumph | Accommodation_Vessel | True |  | True |  | 2026-06-10 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD |  | False | 0 | 1 | 0 | 0 | 0
261 | Floatel Triumph | Accommodation_Vessel | True |  | True |  | 2026-06-10 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD |  | False | 6 | 1 | 0 | 1 | 0
229 | Fortitude | Other | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 1 | 1 | 0 | 1 | 0
221 | Fugro Etive | Vessel | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 27 | 1 | 0 | 2 | 0
227 | Fugro Etive, Furgo Maali, Fugro Kwilena | Other | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 0 | 1 | 0 | 0 | 0
423 | Fugro unmanned remote | Other | True |  | True |  | 2026-08-11 |  |  | False | 0 | 1 | 0 | 1 | 0
422 | Fugro Workshop | Other | True |  | True |  | 2026-08-11 |  |  | False | 1 | 1 | 0 | 1 | 0
22 | Gascoyne Airfield | Airfield | False | N/A | True |  | 2026-03-10 |  | PHI INTERNATIONAL AUSTRALIA  | True | 0 | 2 | 1 | 0 | 0
226 | Gateway | Other | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 1 | 1 | 0 | 1 | 0
246 | Go Aurelia | Vessel | True |  | True |  | 2026-06-10 | GO OFFSHORE |  | False | 4 | 1 | 0 | 1 | 0
250 | Go Offshore | Vessel | True |  | True |  | 2026-06-10 | GO OFFSHORE |  | False | 1 | 2 | 0 | 1 | 0
245 | Go Provider | Vessel | True |  | True |  | 2026-06-10 | GO OFFSHORE |  | False | 5 | 1 | 0 | 1 | 1
247 | Go Sirius | Vessel | True |  | True |  | 2026-06-10 | GO OFFSHORE |  | False | 1 | 1 | 0 | 1 | 0
249 | Go Spica | Vessel | True |  | True |  | 2026-06-10 | GO OFFSHORE |  | False | 1 | 1 | 0 | 1 | 0
143 | Goodwyn | Platform | True |  | True |  | 2026-03-27 | Woodside |  | True | 28 | 4 | 2 | 1 | 0
1 | Gorgon LNG | Onshore_LNG | False | Carnarvon | True |  | 2026-03-10 | Chevron | CHEVRON GORGON OPERATIONS | True | 145 | 3 | 2 | 3 | 0
148 | Ichthys | Other | True |  | False |  | 2026-03-27 | Inpex |  | True | 0 | 0 | 0 | 0 | 0
147 | Ichthys FPSO | FPSO | True |  | True |  | 2026-03-27 | Inpex |  | True | 12 | 0 | 0 | 0 | 0
7 | Ichthys LNG | FPSO | True | Browse | False |  | 2026-03-10 | Inpex | INPEX - ICHTHYS OPERATIONS | True | 0 | 4 | 4 | 0 | 0
160 | Inpex Venturer FPSO | FPSO | True |  | True |  | 2026-04-01 |  |  | True | 32 | 1 | 0 | 1 | 0
262 | Jasmin | Vessel | True |  | True |  | 2026-06-10 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD |  | False | 1 | 1 | 0 | 1 | 0
244 | Jetwave Jasmin | Vessel | True |  | True |  | 2026-06-10 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD |  | False | 1 | 1 | 0 | 1 | 0
266 | Jetwave Lightning | Vessel | True |  | True |  | 2026-06-10 | JETWAVE MARINE SERVICES PTY. LTD. |  | False | 1 | 1 | 0 | 1 | 0
269 | JF J De Nul | Vessel | True |  | True |  | 2026-06-10 | Jan De Nul |  | False | 2 | 1 | 0 | 1 | 0
20 | Karratha (Town/Industrial) | Other | False | N/A | True |  | 2026-03-10 |  |  | True | 1 | 2 | 2 | 0 | 0
159 | Karratha Airport | Airfield | True |  | True |  | 2026-04-01 |  |  | True | 0 | 0 | 0 | 0 | 0
136 | Karratha Gas Plant | Gas_Plant | False |  | True |  | 2026-03-27 | Woodside |  | True | 36 | 3 | 3 | 1 | 0
21 | Karratha MPT Heliport | Heliport | False | N/A | True |  | 2026-03-10 |  | PHI INTERNATIONAL AUSTRALIA  | True | 0 | 2 | 1 | 0 | 0
200 | KBSB | Onshore_Facilities | False |  | True |  | 2026-04-20 | Woodside | WOODSIDE ENERGY LTD | False | 2 | 1 | 0 | 1 | 0
23 | Kimberley Airfield | Airfield | False | N/A | True |  | 2026-03-10 |  | PHI INTERNATIONAL AUSTRALIA  | True | 0 | 2 | 1 | 0 | 0
165 | Kwinana | Other | True |  | True |  | 2026-04-01 |  |  | True | 0 | 0 | 0 | 0 | 0
225 | LV108 | Other | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 1 | 1 | 0 | 1 | 0
10 | Macedon Gas Plant | Gas_Plant | False | Carnarvon | True |  | 2026-03-10 | Woodside | WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO | True | 0 | 2 | 1 | 0 | 0
158 | Maersk Deliverer | Other | True |  | True |  | 2026-04-01 |  |  | False | 4 | 2 | 0 | 1 | 0
217 | Manticore | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 1 | 1 | 0 | 1 | 0
416 | Mariner (field) | Gas_Field | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 1 | 1 | 0 | 1 | 0
425 | MEEF decommissioning | Other | True |  | True |  | 2026-08-20 |  |  | False | 3 | 0 | 0 | 0 | 0
236 | Mermaid Cove | Vessel | True |  | True |  | 2026-06-10 | Cyan Renewables |  | False | 2 | 1 | 0 | 1 | 0
235 | Mermaid Sound | Other | True |  | True |  | 2026-06-10 | Cyan Renewables |  | False | 0 | 1 | 0 | 1 | 0
173 | MMA Brewster | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 2 | 1 | 0 | 1 | 0
174 | Mma coral | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 2 | 1 | 0 | 1 | 0
233 | MMA Harmony | Vessel | True |  | True |  | 2026-06-10 | Cyan Renewables |  | False | 5 | 1 | 0 | 1 | 0
175 | MMA Inscription | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 8 | 2 | 0 | 1 | 0
238 | MMA LEEUWIN | Vessel | True |  | True |  | 2026-06-10 | Cyan Renewables |  | False | 1 | 1 | 0 | 1 | 0
234 | MMA Monarch | Vessel | True |  | True |  | 2026-06-10 | Cyan Renewables |  | False | 0 | 1 | 0 | 0 | 0
166 | MMA Pinnacle | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 45 | 3 | 0 | 2 | 0
167 | MMA Plover | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 4 | 1 | 0 | 1 | 0
270 | MMA vessel | Vessel | True |  | True |  | 2026-06-10 | MMA |  | False | 1 | 1 | 0 | 0 | 0
172 | MMA Vigilant | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 1 | 1 | 0 | 1 | 0
15 | Montara Venture FPSO | FPSO | True | Bonaparte | True |  | 2026-03-10 | Jadestone | JADESTONE ENERGY MONTARA VENTURE | True | 3 | 1 | 1 | 0 | 0
169 | MV Pride | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 0 | 0 | 0 | 0 | 0
11 | Ngujima-Yin FPSO | FPSO | True | Carnarvon | True |  | 2026-03-10 | Woodside | WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO | True | 0 | 2 | 2 | 0 | 0
17 | Ningaloo Vision FPSO | FPSO | True | Carnarvon | True |  | 2026-03-10 | Santos | TEEKAY SHIPPING (AUSTRALIA) PTY LTD | True | 0 | 1 | 1 | 0 | 0
242 | Noble Deliverer | Vessel | True |  | True |  | 2026-06-10 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD |  | False | 2 | 2 | 0 | 1 | 0
265 | Normand Ranger | Other | True |  | True |  | 2026-06-10 | Solstad Offshore ASA |  | False | 1 | 1 | 0 | 1 | 0
263 | Normand Saracen | Vessel | True |  | True |  | 2026-06-10 | Solstad Offshore ASA |  | False | 5 | 1 | 0 | 1 | 0
418 | Normand Scorpion | Other | True |  | True |  | 2026-06-10 | Solstad Offshore ASA |  | False | 1 | 1 | 0 | 1 | 0
9 | North West Shelf (NWS) Platforms | Platform | True | Carnarvon | False |  | 2026-03-10 | Woodside | WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO | True | 8 | 6 | 2 | 1 | 0
19 | Northern Endeavour FPSO | FPSO | True | Bonaparte | False |  | 2026-03-10 |  |  | True | 0 | 2 | 2 | 0 | 0
195 | Not Currently Deployed | Other | False |  | True |  | 2026-04-04 |  |  | False | 9 | 4 | 0 | 1 | 0
154 | Ocean Apex | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 0 | 0 | 0 | 0 | 0
168 | Ocean Monarch | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 0 | 0 | 0 | 0 | 0
12 | Okha FPSO | FPSO | True | Carnarvon | True |  | 2026-03-10 | Woodside | WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO | True | 0 | 2 | 2 | 0 | 0
188 | Pacific Dilgence | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 0 | 0 | 0 | 0 | 0
216 | Pacific Grackle | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 2 | 2 | 0 | 1 | 0
206 | Pacific Guillemot | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 2 | 2 | 0 | 1 | 0
189 | Pacific Liberty | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 1 | 1 | 0 | 1 | 0
260 | Pacific Rapier | Vessel | True |  | True |  | 2026-06-10 | TIDEWATER SHIP MANAGEMENT (AUSTRALIA) PTY LTD |  | False | 0 | 1 | 0 | 1 | 0
214 | Pacific Valor | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 1 | 1 | 0 | 1 | 0
220 | Pacific Vulcan | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 1 | 1 | 0 | 1 | 0
208 | Pacifica Gannet | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 3 | 2 | 0 | 1 | 0
183 | perdaman | Other | True |  | True |  | 2026-04-01 |  |  | True | 0 | 0 | 0 | 0 | 0
164 | Perth Office | Other | True |  | True |  | 2026-04-01 |  |  | True | 0 | 0 | 0 | 0 | 0
138 | Pluto 2 | Onshore_LNG | False |  | True |  | 2026-03-27 | Woodside |  | True | 0 | 0 | 0 | 0 | 0
137 | Pluto LNG | Onshore_LNG | False |  | True |  | 2026-03-27 | Woodside |  | True | 51 | 2 | 0 | 2 | 0
243 | Posh Teal | Vessel | True |  | True |  | 2026-06-10 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD |  | False | 1 | 1 | 0 | 1 | 0
5 | Prelude FLNG | FLNG | True | Browse | True |  | 2026-03-10 | Shell | SHELL PRELUDE | True | 6 | 4 | 3 | 1 | 0
18 | Pyrenees Venture FPSO | FPSO | True | Carnarvon | True |  | 2026-03-10 | Woodside | MODEC Management Services | True | 1 | 1 | 1 | 0 | 0
427 | Q7000 | Vessel | True |  | True |  | 2026-08-20 |  |  | False | 1 | 0 | 0 | 0 | 0
144 | Rankin North | Platform | True |  | True |  | 2026-03-27 | Woodside |  | True | 36 | 3 | 1 | 2 | 0
232 | Reach Subsea | Vessel | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 3 | 1 | 0 | 0 | 0
428 | Remote operation centre | Other | True |  | True |  | 2026-08-20 |  |  | False | 0 | 0 | 0 | 0 | 0
239 | Safe Boreas | Vessel | True |  | True |  | 2026-06-10 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD |  | False | 8 | 2 | 0 | 1 | 0
230 | SAIPEM CONSTELLATION | Vessel | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 4 | 1 | 0 | 1 | 0
161 | Sandpiper | Other | True |  | True |  | 2026-04-01 |  |  | False | 0 | 0 | 0 | 0 | 0
201 | Sapura Constructor | Other | True |  | True |  | 2026-04-22 |  | ERIS | False | 0 | 2 | 0 | 2 | 0
231 | Scandi Emerald | Vessel | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 0 | 1 | 0 | 0 | 1
145 | Scarborough FPU | FPU | True |  | True |  | 2026-03-27 | Woodside |  | True | 16 | 3 | 0 | 2 | 0
219 | SEA1 Anchor Handlers | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 0 | 1 | 0 | 0 | 0
204 | Sea1 Emerald | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 10 | 2 | 0 | 1 | 1
207 | Sea1 Sapphire | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 6 | 3 | 0 | 1 | 1
190 | Seeker Tide | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 0 | 3 | 0 | 0 | 0
429 | Seven Arctic | Vessel | True |  | True |  | 2026-08-21 |  |  | False | 3 | 0 | 0 | 0 | 0
176 | Seven Oceanic Subsea 7 | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 1 | 1 | 0 | 1 | 0
415 | Seven Sisters | Vessel | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 21 | 2 | 0 | 2 | 0
419 | Shell | Other | True |  | True |  | 2026-06-11 | GO OFFSHORE |  | False | 0 | 1 | 0 | 0 | 0
210 | Siem AHTS | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 0 | 1 | 0 | 0 | 0
218 | Siem Amethyst | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 1 | 1 | 0 | 1 | 0
205 | Siem Aquamarine | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 7 | 1 | 0 | 1 | 1
209 | Siem Pilot | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 2 | 1 | 0 | 1 | 0
212 | Siem symphony | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 5 | 1 | 0 | 1 | 1
203 | Siem Thiima | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 10 | 1 | 0 | 1 | 1
252 | Skandi Darwin | Vessel | True |  | True |  | 2026-06-10 | DOF MANAGEMENT AUSTRALIA PTY LTD |  | False | 2 | 1 | 0 | 1 | 0
228 | Skandi Hercules | Other | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 16 | 2 | 0 | 1 | 0
426 | skandi inventor | Vessel | True |  | True |  | 2026-08-20 |  |  | False | 4 | 0 | 0 | 0 | 0
255 | skandi peregrino | Vessel | True |  | True |  | 2026-06-10 | DOF MANAGEMENT AUSTRALIA PTY LTD |  | False | 1 | 1 | 0 | 1 | 0
256 | Skandi Singapore | Other | True |  | True |  | 2026-06-10 | DOF MANAGEMENT AUSTRALIA PTY LTD |  | False | 14 | 1 | 0 | 1 | 0
254 | Skandi Vessels | Vessel | True |  | True |  | 2026-06-10 | DOF MANAGEMENT AUSTRALIA PTY LTD |  | False | 0 | 1 | 0 | 0 | 0
16 | Stag CPF | CPF | True | Carnarvon | True |  | 2026-03-10 | Jadestone | JADESTONE ENERGY MONTARA VENTURE | True | 0 | 2 | 1 | 1 | 0
177 | Subsea 7 Pegasus | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 0 | 2 | 0 | 1 | 0
268 | Swan Tide | Other | True |  | True |  | 2026-06-10 | SIERA MARINE MANAGEMENT PTY LTD |  | False | 6 | 2 | 0 | 1 | 0
197 | TEST · TestCo 2 — Alpha FPSO | FPSO | True |  | True |  | 2026-04-16 | TestCo 2 |  | True | 107 | 2 | 0 | 2 | 0
198 | TEST · TestCo 2 — Bravo Platform | Platform | True |  | True |  | 2026-04-16 | TestCo 2 |  | True | 104 | 2 | 0 | 2 | 0
199 | TEST · TestCo 2 — Charlie FPU | FPU | True |  | True |  | 2026-04-16 | TestCo 2 |  | True | 104 | 2 | 0 | 2 | 0
196 | Test Onshore Gas Plant | Gas_Plant | False |  | True |  | 2026-04-09 | TestCo Energy |  | True | 350 | 4 | 0 | 0 | 0
211 | Tortuga Tide | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 1 | 2 | 0 | 1 | 0
191 | Transocean | Other | True |  | True |  | 2026-04-01 |  |  | False | 1 | 1 | 0 | 1 | 0
155 | Transocean Endurance | Platform | True |  | True |  | 2026-04-01 |  |  | True | 2 | 2 | 0 | 2 | 0
413 | Unspecified | Other | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 25 | 11 | 0 | 1 | 0
152 | Valaris 107 | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 2 | 2 | 0 | 1 | 0
193 | Valaris 247 | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 0 | 0 | 0 | 0 | 0
194 | Valaris DPS-1 | Vessel | True |  | True |  | 2026-04-01 |  |  | False | 5 | 1 | 0 | 1 | 0
424 | Valaris MS-1 | Vessel | True |  | True |  | 2026-08-20 |  |  | False | 7 | 0 | 0 | 0 | 0
14 | Varanus Island | Gas_Plant | False | Carnarvon | True |  | 2026-03-10 | Santos | SANTOS WA ENERGY LIMITED VARANUS ISLAND HUB | True | 5 | 2 | 1 | 1 | 0
414 | VE Constructor | Vessel | True |  | True |  | 2026-06-10 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD |  | False | 5 | 1 | 0 | 1 | 0
26 | WA/NT Offshore (General) | Region | True | Multiple | True |  | 2026-03-10 |  |  | False | 18 | 11 | 7 | 1 | 0
192 | Waitisa Gas Plant | Gas_Plant | True |  | True |  | 2026-04-01 |  |  | True | 0 | 0 | 0 | 0 | 0
142 | Wandoo A | Platform | True |  | True |  | 2026-03-27 | Vermilion |  | True | 0 | 0 | 0 | 0 | 0
141 | Wandoo B | Platform | True |  | True |  | 2026-03-27 | Vermilion |  | True | 1 | 0 | 0 | 0 | 0
186 | Watsia gas plant Dongara onshore | Gas_Plant | True |  | True |  | 2026-04-01 |  |  | True | 0 | 0 | 0 | 0 | 0
213 | WB400 | Vessel | True |  | True |  | 2026-06-10 | OSM Australia Pty Ltd |  | False | 0 | 1 | 0 | 1 | 0
139 | Wheatstone LNG | Onshore_LNG | False |  | True |  | 2026-03-27 | Chevron |  | True | 53 | 2 | 0 | 2 | 0
2 | Wheatstone LNG (Downstream) | Onshore_LNG | False | Carnarvon | True |  | 2026-03-10 | Chevron | CHEVRON GORGON OPERATIONS | True | 0 | 3 | 2 | 0 | 0
3 | Wheatstone Platform | Platform | True | Carnarvon | True |  | 2026-03-10 | Chevron | CHEVRON GORGON OPERATIONS | True | 2 | 5 | 3 | 1 | 0
13 | Woodside Onshore Facilities | Onshore_Facilities | False | Carnarvon | False |  | 2026-03-10 | Woodside | WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO | True | 2 | 5 | 2 | 1 | 0
```

Statement 2 — worksite_type counts:

```
worksite_type | count
Vessel | 76
Other | 45
FPSO | 11
Platform | 9
Onshore_LNG | 6
Gas_Plant | 6
Airfield | 5
Onshore_Facilities | 3
CPF | 2
Accommodation_Vessel | 2
Gas_Field | 2
FPU | 2
Pipeline | 1
Region | 1
FLNG | 1
Heliport | 1
Drill_Centre | 1
```

Statement 3 — basin counts:

```
basin | count
(null) | 148
Carnarvon | 14
N/A | 5
Browse | 4
Bonaparte | 2
Multiple | 1
```

Statement 4 — worksite aliases:

```
alias_name | canonical | source
Big Roll Bering | Bigroll Bering | import
MV Go Provider | Go Provider | import
Scandi Emerald; DLV2000 | Scandi Emerald | import
Sea 1 Emerald | Sea1 Emerald | import
Siem Sapphire | Sea1 Sapphire | import
Sea1 Aquamarine | Siem Aquamarine | import
Siwm symphony | Siem symphony | import
MV Siem Thiima | Siem Thiima | import
```

### 03_profile_workers_links.sql

Statement 1 — worker link coverage:

```
active | total | no_employer | no_worksite | neither | no_member_number | no_reference_id | no_canonical_occupation | no_union | no_membership_type | has_project | has_shift_area_or_panel
2293 | 2407 | 36 | 685 | 33 | 1989 | 1605 | 1337 | 1989 | 284 | 662 | 0
```

Statement 2 — created-month histogram (bulk-load signature):

```
created_month | count
2026-04 | 1146
2026-05 | 282
2026-06 | 607
2026-07 | 106
2026-08 | 266
```

Statement 3 — employer × worksite pairs implied by workers but missing from `employer_worksite_roles` (summary):

```
distinct_pairs | pairs_not_in_roles | workers_in_unrecorded_pairs
194 | 57 | 418
```

Statement 4 — the unrecorded pairs themselves, largest first:

```
employer_name | worksite_name | workers
Downer EDI Group | Gorgon LNG | 89
Aegis Offshore Maintenance Pty Ltd | TEST · TestCo 2 — Bravo Platform | 36
Aegis Offshore Maintenance Pty Ltd | TEST · TestCo 2 — Charlie FPU | 36
Aegis Offshore Maintenance Pty Ltd | TEST · TestCo 2 — Alpha FPSO | 36
Offshore Crew Services Ltd | TEST · TestCo 2 — Alpha FPSO | 28
Offshore Crew Services Ltd | TEST · TestCo 2 — Bravo Platform | 28
Offshore Crew Services Ltd | TEST · TestCo 2 — Charlie FPU | 28
FUGRO AUSTRALIA PTY LTD | Fugro Etive | 18
Parabellum International | Wheatstone LNG | 12
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Ichthys FPSO | 11
DOF MANAGEMENT AUSTRALIA PTY LTD | WA/NT Offshore (General) | 9
MCDERMOTT AUSTRALIA PTY LTD | Not Currently Deployed | 9
TOTAL MARINE TECHNOLOGY PTY LTD | Valaris MS-1 | 7
DOF MANAGEMENT AUSTRALIA PTY LTD | skandi inventor | 4
WOODSIDE ENERGY LTD | Scarborough FPU | 4
DOF MANAGEMENT AUSTRALIA PTY LTD | DOF Vessels | 3
TOTAL MARINE TECHNOLOGY PTY LTD | MEEF decommissioning | 3
Reach Subsea | Fugro Etive | 3
Shell | Prelude FLNG | 3
TOTAL MARINE TECHNOLOGY PTY LTD | VE Constructor | 3
PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Seven Arctic | 3
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Prelude FLNG | 2
LEGENEERING (AUST.) PTY LTD | Montara Venture FPSO | 2
Inpex | BW Offshore FPSO | 2
TOTAL MARINE TECHNOLOGY PTY LTD | Maersk Deliverer | 2
BAKER HUGHES SERVICES AUSTRALIA PTY LTD | Explorer CPF | 2
Reach Subsea | Reach Subsea | 2
PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | SAIPEM CONSTELLATION | 2
TOTAL MARINE TECHNOLOGY PTY LTD | Normand Saracen | 2
Parabellum International | Barrow Island CO2 | 2
Technip | Deep Orient | 1
MCDERMOTT AUSTRALIA PTY LTD | North West Shelf (NWS) Platforms | 1
Reach Subsea | Seven Sisters | 1
Offshore Services Australasia | Karratha (Town/Industrial) | 1
MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Scarborough FPU | 1
Helix Robotic Solutions | Q7000 | 1
UGL RESOURCES (CONTRACTING) PTY LTD | Karratha Gas Plant | 1
BW | Ichthys FPSO | 1
DOF MANAGEMENT AUSTRALIA PTY LTD | Deep Orient | 1
TOTAL MARINE TECHNOLOGY PTY LTD | WA/NT Offshore (General) | 1
Modec | Pyrenees Venture FPSO | 1
PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Reach Subsea | 1
FUGRO AUSTRALIA PTY LTD | North West Shelf (NWS) Platforms | 1
TOTAL MARINE TECHNOLOGY PTY LTD | North West Shelf (NWS) Platforms | 1
FUGRO AUSTRALIA PTY LTD | Deep Orient | 1
BAKER HUGHES SERVICES AUSTRALIA PTY LTD | Inpex Venturer FPSO | 1
Helix Robotic Solutions | North West Shelf (NWS) Platforms | 1
WOODSIDE ENERGY LTD | Pluto LNG | 1
Reach Subsea | WA/NT Offshore (General) | 1
AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | WA/NT Offshore (General) | 1
Chevron | Wheatstone Platform | 1
DOF MANAGEMENT AUSTRALIA PTY LTD | Valaris DPS-1 | 1
PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | North West Shelf (NWS) Platforms | 1
Technip | WA/NT Offshore (General) | 1
PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Castorone | 1
PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Wheatstone Platform | 1
JADESTONE ENERGY  | Montara Venture FPSO | 1
```

Statement 5 — occupation free text vs canonical (top 60 by worker count):

```
occupation | workers | with_canonical
 | 1631 | 956
Storeperson | 27 | 0
Instrument Fitter | 22 | 0
INLEC Technician | 20 | 0
Galley Hand | 19 | 0
Chef | 19 | 0
Boilermaker | 18 | 0
Dogman | 18 | 0
Advanced Rigger | 18 | 0
Engineer | 16 | 0
Cleaner | 16 | 0
Process Operator | 15 | 0
Sheet Metal Worker | 15 | 0
Cook | 15 | 0
Service Attendant | 14 | 0
Production Technician | 14 | 0
Painter/Blaster | 14 | 0
Warehouse Officer | 14 | 0
Laboratory Analyst | 14 | 0
Scaffolder | 14 | 0
Mechanical Fitter | 14 | 0
Baker | 14 | 0
Pipefitter | 13 | 0
Driver | 13 | 0
Steward | 13 | 0
Camp Boss | 13 | 0
Production Specialist | 13 | 0
Crane Operator | 13 | 0
Electrician | 12 | 0
Admin | 12 | 0
Rigger | 12 | 0
Field Operator | 11 | 0
Welder | 11 | 0
Fireproofer | 11 | 0
Lagger/Cladder | 11 | 0
Insulator | 11 | 0
Turbine Technician | 11 | 0
Coatings Technician | 10 | 0
Electrical Technician | 10 | 0
Blaster | 10 | 0
Logistics Coordinator | 10 | 0
Painter | 10 | 0
Trade Assistant | 10 | 0
Valve Technician | 10 | 0
Materials Controller | 10 | 0
Process Technician | 9 | 0
Control Room Operator | 9 | 0
Operations Technician | 8 | 0
UHP Operator | 8 | 0
Scheduler/Planner | 7 | 0
Plant Operator | 6 | 0
Fitter and Turner | 5 | 0
```

Statement 6 — import history by type and month:

```
import_type | month | files | created | updated
employer_wizard | 2026-03 | 3 | 3 | 108
membership_new_joins | 2026-04 | 1 | 17 | 1
membership_recommencing | 2026-04 | 1 | 20 | 22
membership_resignations | 2026-04 | 1 | 6 | 0
workers_wizard | 2026-04 | 8 | 441 | 11
workers_wizard | 2026-05 | 6 | 258 | 20
campaign_lists | 2026-06 | 5 | 18 | 910
workers_wizard | 2026-06 | 7 | 294 | 74
workers_wizard | 2026-07 | 2 | 106 | 9
workers_wizard | 2026-08 | 8 | 255 | 138
```

### 04_profile_agreements.sql

Statement 1 — status:

```
status | count
Current | 86
Expired | 50
```

Statement 2 — agreement_scope:

```
agreement_scope | count
(null) | 136
```

Statement 3 — source_sheet:

```
source_sheet | count
Expired | 27
Maintenance | 22
Production | 15
Catering | 12
Marine-Deck Officers | 11
Marine-Engineers | 9
Drilling | 8
ROV | 6
Offshore Construction | 6
Decommissioning | 6
Aircraft Maint. | 5
Inspection | 4
Dredging | 2
Chemists | 1
Hydrographics | 1
(null) | 1
```

Statement 4 — worksite-link coverage:

```
coverage | count
no worksite link | 89
has worksite link | 47
```

Statement 5 — one row per agreement:

```
agreement_id | name | decision_no | holder | status | expiry_date | source_sheet | is_greenfield | has_fwc_link | worksites | extra_employers | work_scopes
133 | AGC | AG2018/6862 | ALTRAD | Expired | 2023-11-20 | Expired | False | True |  | 0 | 0
131 | R.E.C. MAINTENANCE & CONSTRUCTION AGREEMENT 2019 | AG2019/4604 | ALTRAD | Expired | 2024-01-29 | Expired | False | True |  | 0 | 0
30 | RIDGEBAY HOLDINGS KARRATHA ENTERPRISE AGREEMENT  2024 | AG2024/1247 | ALTRAD | Current | 2027-04-24 | Maintenance | False | True | Karratha (Town/Industrial) | 0 | 0
31 | RIDGEBAY HOLDINGS PTY LTD OFFSHORE ENTERPRISE AGREEMENT 2024 | AG2025/512 | ALTRAD | Current | 2028-06-01 | Maintenance | False | True |  | 0 | 0
132 | SPECIALIST PEOPLE – ALTRAD CHEVRON FACILITIES ENTERPRISE AGREEMENT 2024 | AG2024/4796 | ALTRAD | Expired | 2028-12-18 | Expired | False | True | Chevron Facilities (General) | 0 | 0
29 | REC – ALTRAD CHEVRON FACILITIES ENTERPRISE AGREEMENT  2024 | AG2024/4794 | ALTRAD | Current | 2028-12-18 | Maintenance | False | True | Chevron Facilities (General) | 0 | 0
95 | APPLUS+ PTY LTD OFFSHORE MAINTENANCE ENTERPRISE 2022-2025 | AG2022/1871 | APPLUS+ PTY LTD | Expired | 2025-06-24 | Inspection | False | True |  | 0 | 0
96 | APPLUS+ PTY LTD NDT ENTERPRISE AGREEMENT 2022-2025 | AG2022/4118 | APPLUS+ PTY LTD | Expired | 2025-06-30 | Inspection | False | True |  | 0 | 0
97 | APPLUS+ PLY LTD WOODSIDE NORTH WEST AGREEMENT 2021 - 2025 | AG2021/7288 | APPLUS+ PTY LTD | Expired | 2025-09-23 | Inspection | False | True | Wheatstone LNG (Downstream) | 0 | 0
98 | APPLUS+ PTY LTD MAINTENANCE AGREEMENT 2023 -2026 | AG2024/1344 | APPLUS+ PTY LTD | Current | 2027-05-14 | Inspection | False | True | Karratha Gas Plant | 0 | 0
112 | Atlas Drilling 2019 | AG2020/4180 | ATLAS PROGRAMMED MARINE (AUSTRALIA) PTY LTD | Expired | 2023-06-01 | Expired | False | True |  | 0 | 0
113 | Atlas Programmed (WA & NT) | AG2020/3758 | ATLAS PROGRAMMED MARINE (AUSTRALIA) PTY LTD | Expired | 2024-08-16 | Expired | True | True |  | 0 | 0
64 | ATLAS PROGRAMMED MARINE (AUSTRALIA) PTY LTD   CATERING ENTERPRISE AGREEMENT 2023 | AG2023/3031 | ATLAS PROGRAMMED MARINE (AUSTRALIA) PTY LTD | Current | 2027-09-11 | Catering | False | True |  | 0 | 0
84 | Atlas Drilling | AG2023/2914 | ATLAS PROGRAMMED MARINE (AUSTRALIA) PTY LTD | Current | 2027-09-18 | Drilling | False | True |  | 0 | 0
59 | AURIGA AVIATION HELICOPTER ENGINEERS ENTERPRISE AGREEMENT 2024 | AG2027/4703 | AURIGA AVIATION HELICOPTER ENGINEERS | Current | 2028-07-01 | Aircraft Maint. | False | True |  | 0 | 0
111 | AOS PTY LTD - WESTERN AUSTRALIA AND NORTHERN TERRITORY OFFSHORE CATERING GREENFIELDS AGREEMENT 2022 - 2024 | AG2022/791 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | Expired | 2024-08-16 | Expired | True | True |  | 0 | 0
105 | AUSTRALIAN OFFSHORE SOLUTIONS (AOS) PTY LTD ROV CASUAL GREENFIELDS AGREEMENT 2022 | AG2022/4734 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | Current | 2026-12-04 | ROV | True | True |  | 0 | 0
92 | AOS CONTRACT DREDGING (NON-PROPELLED DREDGES, AWU) GREENFIELDS AGREEMENT 2024 | AG2024/3917 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | Current | 2027-06-30 | Dredging | True | True |  | 0 | 0
38 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD MARITIME OFFSHORE OIL AND GAS INDUSTRY DECK OFFICERS  ENTERPRISE AGREEMENT 2023 | AG2023/3832 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | Current | 2027-11-09 | Marine-Deck Officers | False | True |  | 0 | 0
93 | AUSTRALIAN OFFSHORE SOLUTIONS (AOS) PTY LTD AND THE DECK OFFICERS PROPELLED DREDGING ENTERPRISE AGREEMENT 2024 | AG2024/2987 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | Current | 2027-11-30 | Dredging | False | True |  | 0 | 0
65 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD - WESTERN AUSTRALIA AND NORTHERN TERRITORY OFFSHORE CONSTRUCTION PROJECTS CATERING AGREEMENT 2024 | AG2024/4026 | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD | Current | 2028-11-11 | Offshore Construction | False | True |  | 0 | 0
85 | BAKER HUGHES SERVICES AUSTRALIA PTY LTD SUBSEA FIELD SERVICES ENTERPRISE AGREEMENT 2024 – 2028 | AG2025/115 | BAKER HUGHES SERVICES AUSTRALIA PTY LTD | Current | 2029-01-30 | Drilling | False | True |  | 0 | 0
39 | BHAGWAN MARINE LTD OFFSHORE VESSEL OPERATIONS DECK OFFICERS ENTERPRISE AGREEMENT 2024 | AG2024/3687 | BHAGWAN MARINE LTD | Current | 2028-01-08 | Marine-Deck Officers | False | True |  | 0 | 0
50 | BHAGWAN MARINE LTD OFFSHORE VESSEL OPERATIONS AND AIMPE ENGINEER OFFICERS ENTERPRISE AGREEMENT 2024 | AG2024/3999 | BHAGWAN MARINE LTD | Current | 2028-11-11 | Marine-Engineers | False | True |  | 0 | 0
1 | BW OFFSHORE GREENFIELDS AGREEMENT 2024 | AG2025/122 | BW | Current | 2029-03-07 | Production | True | True | BW Offshore FPSO | 0 | 0
60 | CHC HELICOPTER (AUSTRALIA) AIRCRAFT ENGINEERS ENTERPRISE AGREEMENT 2022 | AG2023/2945 | CHC HELICOPTER (AUSTRALIA) AIRCRAFT ENGINEERS | Current | 2027-06-30 | Aircraft Maint. | False | True |  | 0 | 0
2 | CHEVRON GORGON OPERATIONS ENTERPRISE AGREEMENT 2023 | AG2023/4223 | CHEVRON GORGON OPERATIONS | Current | 2027-11-22 | Production | False | True | Gorgon LNG | 0 | 0
3 | CHEVRON WHEATSTONE DOWNSTREAM OPERATIONS ENTERPRISE AGREEMENT 2023 | AG2023/4224 | CHEVRON WHEATSTONE DOWNSTREAM OPERATIONS | Current | 2027-11-22 | Production | False | True | Wheatstone LNG (Downstream) | 0 | 0
4 | CHEVRON WHEATSTONE PLATFORM ENTERPRISE AGREEMENT 2023 | AG2023/4226 | CHEVRON WHEATSTONE PLATFORM | Current | 2027-11-22 | Production | False | True | Wheatstone Platform | 0 | 0
116 | COMPASS GROUP - ESS OFFSHORE OIL & GAS (WHEATSTONE PLATFORM) ENTERPRISE AGREEMENT 2019 | AG2019/2725 | COMPASS GROUP – | Expired | 2022-08-07 | Expired | False | True |  | 0 | 0
117 | COMPASS GROUP - ESS OFFSHORE OIL & GAS (WOODSIDE PLATFORMS) ENTERPRISE AGREEMENT 2019 | AG2019/2979 | COMPASS GROUP – | Expired | 2022-12-31 | Expired | False | True |  | 0 | 0
115 | COMPASS GROUP – ESS OFFSHORE OIL & GAS (MODU) – ENTERPRISE AGREEMENT 2020 | AG2020/73 | COMPASS GROUP – | Expired | 2023-02-01 | Expired | False | True |  | 0 | 0
72 | COMPASS GROUP- WESTERN AUSTRALIA AND NORTHERN TERRITORY OFFSHORE CONSTRUCTION PROJECTS GREENFIELDS AGREEMENT 2023 – 2024 | AG2023/163 | COMPASS GROUP – | Expired | 2024-08-16 | Catering | True | True | WA/NT Offshore (General) | 0 | 0
71 | COMPASS GROUP ESS OFFSHORE OIL & GAS (NORTHERN ENDEAVOUR FPSO) ENTERPRISE AGREEMENT 2022 *See 2024 EBA Variation | AG2022/3646 | COMPASS GROUP – | Expired | 2024-09-11 | Catering | False | True | Northern Endeavour FPSO | 0 | 0
70 | COMPASS GROUP – ESS OFFSHORE OIL & GAS AND THE AUSTRALIAN WORKERS’ UNION (SHELL PRELUDE) GREENFIELDS AGREEMENT 2022 | AG2022/734 | COMPASS GROUP – | Expired | 2024-11-12 | Catering | True | True | Prelude FLNG | 0 | 0
66 | COMPASS GROUP – ESS OFFSHORE OIL & GAS (INPEX PRODUCTION) ENTERPRISE AGREEMENT 2021 | AG2021/4396 | COMPASS GROUP – | Expired | 2025-03-22 | Catering | False | True | Ichthys LNG | 0 | 0
68 | COMPASS GROUP – ESS OFFSHORE OIL & GAS (WHEATSTONE PLATFORM) ENTERPRISE AGREEMENT 2022 | AG2022/3096 | COMPASS GROUP – | Expired | 2025-08-16 | Catering | False | True | Wheatstone Platform | 0 | 0
67 | COMPASS GROUP – ESS OFFSHORE OIL & GAS (MODU) –  ENTERPRISE AGREEMENT 2023 | AG2023/3026 | COMPASS GROUP – | Expired | 2025-09-18 | Catering | False | True | WA/NT Offshore (General) | 0 | 0
69 | COMPASS GROUP - ESS OFFSHORE OIL & GAS (WOODSIDE PLATFORMS) ENTERPRISE AGREEMENT 2022 | AG2023/71 | COMPASS GROUP – | Expired | 2026-02-13 | Catering | False | True | Ngujima-Yin FPSO; North West Shelf (NWS) Platforms; Okha FPSO | 0 | 0
16 | CONTRACT RESOURCES PTY LTD NORTH WEST ENTERPRISE AGREEMENT 2022 | AG2023/1700 | CONTRACT RESOURCES PTY LTD | Current | 2027-06-30 | Maintenance | False | True |  | 0 | 0
17 | DAMPIER BUNBURY NATURAL GAS PIPELINE (DBNGP)  NATIONAL CONTROL CENTRE ENTERPRISE AGREEMENT 2024 | AG2024/4865 | DAMPIER BUNBURY NATURAL GAS PIPELINE (DBNGP)  NATIONAL CONTROL CENTRE | Current | 2028-12-24 | Maintenance | False | True | DBNGP Pipeline | 0 | 0
118 | DIAMOND OFFSHORE ENTERPRISE AGREEMENT 2019-2023 | AG2019/4516 | DIAMOND | Expired | 2024-01-20 | Expired | False | True |  | 0 | 0
86 | DIAMOND OFFSHORE ENTERPRISE AGREEMENT 2024 | AG2024/186 | DIAMOND | Current | 2028-02-21 | Drilling | False | True |  | 0 | 0
106 | DOF SUBSEA AUSTRALIA PTY LTD ROV CASUAL ENTERPRISE AGREEMENT 2021 | AG2021/9252 | DOF MANAGEMENT AUSTRALIA PTY LTD | Expired | 2025-08-09 | ROV | False | True |  | 0 | 0
51 | DOF MANAGEMENT AUSTRALIA PTY LTD & AIMPE MARINE ENGINEERS OFFSHORE OIL AND GAS ENTERPRISE AGREEMENT 2023 | AG2023/27/44 | DOF MANAGEMENT AUSTRALIA PTY LTD | Current | 2027-08-29 | Marine-Engineers | False | True |  | 0 | 0
40 | DOF MANAGEMENT AUSTRALIA PTY LTD DECK OFFICERS MARITIME OFFSHORE OIL AND GAS ENTERPRISE AGREEMENT 2023 | AG2023/3160 | DOF MANAGEMENT AUSTRALIA PTY LTD | Current | 2027-10-25 | Marine-Deck Officers | False | True |  | 0 | 0
18 | DOWNER EDI ENGINEERING ELECTRICAL LNG FACILITY SERVICES AGREEMENT 2022 | AG2022/2479 | DOWNER EDI ENGINEERING ELECTRICAL LNG FACILITY SERVICES | Current | 2026-08-08 | Maintenance | False | True |  | 0 | 0
78 | DURATEC ENTERPRISE AGREEMENT 2025 | AG2025/876 | DURATEC | Current | 2029-04-11 | Decommissioning | False | True |  | 0 | 0
87 | ENSCO AUSTRALIA PTY LIMITED ENTERPRISE AGREEMENT 2022 | AG2022/3824 | ENSCO AUSTRALIA PTY LIMITED | Current | 2026-09-26 | Drilling | False | True |  | 0 | 0
73 | ENTIER AUSTRALIA PTY LTD CATERING GREENFIELDS  AGREEMENT 2024 | AG2024/73 | ENTIER AUSTRALIA PTY LTD | Current | 2027-09-11 | Catering | True | True | WA/NT Offshore (General) | 0 | 0
122 | Kuiper (WA & NT) | AG2020/2206 | ERIS | Expired | 2024-08-16 | Expired | True | True |  | 0 | 0
123 | Kuiper WA & NT | AG2021/5647 | ERIS | Expired | 2025-07-02 | Expired | False | True |  | 0 | 0
79 | KUIPER ENERGY WESTERN AUSTRALIA AND NORTHERN  TERRITORY OFFSHORE DEMOLITION AND REMOVAL  GREENFIELD AGREEMENT 2025 | AG2025/1983 | ERIS | Expired | 2026-03-31 | Decommissioning | True | True |  | 2 | 0
20 | KUIPER ENERGY SOLUTIONS PTY LTD - OFFSHORE HOOK UP AND COMMISSIONING GREENFIELDS ENTERPRISE AGREEMENT 2025 | AG2025/615 | ERIS | Current | 2028-06-01 | Maintenance | True | True |  | 0 | 0
100 | KUIPER AUSTRALIA PTY LTD - WESTERN AUSTRALIA AND NORTHERN TERRITORY OFFSHORE CONSTRUCTION PROJECTS AGREEMENT 2024 | AG2024/3988 | ERIS | Current | 2028-11-12 | Offshore Construction | False | True |  | 0 | 0
19 | KUIPER AUSTRALIA PTY LTD WESTERN AUSTRALIA AND NORTHERN TERRITORY OFFSHORE MAINTENANCE WORK AGREEMENT 2025 | AG2025/2293 | ERIS | Current | 2029-07-31 | Maintenance | False | True |  | 0 | 0
107 | FUGRO AUSTRALIA MARINE PTY LTD ROV CASUAL ENTERPRISE AGREEMENT 2022 | AG2022/3163 | FUGRO AUSTRALIA PTY LTD | Current | 2026-08-11 | ROV | False | True |  | 0 | 0
41 | FUGRO AUSTRALIA PTY LTD MARITIME OFFSHORE OIL AND GAS INDUSTRY DECK OFFICERS ENTERPRISE AGREEMENT 2024 | AG2024/1702 | FUGRO AUSTRALIA PTY LTD | Current | 2028-06-13 | Marine-Deck Officers | False | True |  | 0 | 0
94 | FUGRO AUSTRALIA PTY LTD OFFSHORE OIL & GAS HYDROGRAPHIC SURVEY ENTERPRISE AGREEMENT 2024 | AG2024/4072 | FUGRO AUSTRALIA PTY LTD | Current | 2028-12-03 | Hydrographics | False | True | WA/NT Offshore (General) | 0 | 0
5 | INPEX - ICHTHYS OPERATIONS ENTERPRISE AGREEMENT 2022-2026 | AG2022/1124 | INPEX - ICHTHYS OPERATIONS | Current | 2026-05-09 | Production | False | True | Ichthys LNG | 0 | 0
120 | ISOLOGICS ENTERPRISE AGREEMENT 2022 - 2026 | AG2022/3657 | ISOLOGICS | Expired | 2026-10-10 | Expired | False | True |  | 0 | 0
121 | Jadestone  Montara Venture | AG2021/5117 | JADESTONE ENERGY MONTARA VENTURE | Expired | 2023-12-31 | Expired | False | True |  | 0 | 0
6 | JADESTONE ENERGY MONTARA VENTURE ENTERPRISE  AGREEMENT 2024 | AG2024/2629 | JADESTONE ENERGY MONTARA VENTURE | Current | 2028-07-25 | Production | False | True | Montara Venture FPSO | 0 | 0
7 | Jadestone Stag | AG2022/3581 | JADESTONE ENERGY STAG CPF | Current | 2026-09-12 | Production | False | True | Stag CPF | 0 | 0
42 | JETWAVE MARINE SERVICES PTY. LTD. MARITIME OFFSHORE OIL AND GAS INDUSTRY MASTERS, DECK OFFICERS, AND ENGINEERS ENTERPRISE AGREEMENT 2024 | AG2024/3696 | JETWAVE MARINE SERVICES PTY. LTD. | Current | 2027-06-30 | Marine-Engineers | False | True |  | 0 | 0
21 | Legeneering - Woodside Maint. | AG2021/6710 | LEGENEERING (AUST.) PTY LTD | Expired | 2025-08-02 | Maintenance | False | True |  | 0 | 0
124 | LEGENEERING SERVICES PTY LTD ENTERPRISE AGREEMENT 2021 | AG2021/7655 | LEGENEERING (AUST.) PTY LTD | Expired | 2025-10-08 | Expired | False | True |  | 0 | 0
80 | LEGENEERING (AUST.) PTY LTD OFFSHORE DECOMMISSIONING ENTERPRISE AGREEMENT 2024 | AG2024/2063 | LEGENEERING (AUST.) PTY LTD | Expired | 2026-03-22 | Decommissioning | False | True |  | 0 | 0
127 | MCDERMOTT AUSTRALIA PTY LTD WESTERN AUSTRALIA AND NORTHERN TERRITORY OFFSHORE CONSTRUCTION PROJECTS GREENFIELDS AGREEMENT 2020-2024 | AG2021/5392 | MCDERMOTT AUSTRALIA PTY LTD | Expired | 2024-08-16 | Expired | True | True |  | 0 | 0
81 | MCDERMOTT AUSTRALIA PTY LTD OFFSHORE DECOMMISSIONING GREENFIELDS EA 2023 | AG2023/3584 | MCDERMOTT AUSTRALIA PTY LTD | Expired | 2026-03-22 | Decommissioning | True | True |  | 2 | 0
102 | MCDERMOTT AUSTRALIA (CREWING SERVICES) PTY LTD - SHELL AUSTRALIA PTY LTD CRUX PROJECT AGREEMENT 2025 | AG2025/366 | MCDERMOTT AUSTRALIA PTY LTD | Current | 2028-11-12 | Offshore Construction | False | True | Crux Gas Field | 0 | 0
101 | MCDERMOTT AUSTRALIA (CREWING SERVICES) PTY LTD – INPEX OPERATIONS AUSTRALIA PTY LTD BREWSTER DRILL CENTRE 1A CAMPAIGN AGREEMENT 2025 | AG2025/382 | MCDERMOTT AUSTRALIA PTY LTD | Current | 2028-11-12 | Offshore Construction | False | True | Brewster Drill Centre | 0 | 0
25 | MIZCO PTY LTD INPEX OFFSHORE ENTERPRISE AGREEMENT 2021-2025 | AG2021/7547 | MIZCO PTY LTD | Expired | 2025-10-18 | Maintenance | False | True | Ichthys LNG | 0 | 0
53 | MMA OFFSHORE VESSEL OPERATIONS AIMPE ENGINEER   OFFICERS ENTERPRISE AGREEMENT 2023 | AG2023/4466 | MMA | Current | 2027-12-14 | Marine-Engineers | False | True |  | 0 | 0
43 | MMA OFFSHORE VESSEL OPERATIONS DECK OFFICERS  ENTERPRISE AGREEMENT 2023 | AG2023/5107 | MMA | Current | 2028-01-08 | Marine-Deck Officers | False | True |  | 0 | 0
129 | Pyrenees Venture 2018 | AG2018/2047 | MODEC Management Services | Expired | 2021-06-30 | Expired | False | True |  | 0 | 0
128 | Pyrenees Venture | AG2022/155 | MODEC Management Services | Expired | 2025-03-08 | Expired | False | True |  | 0 | 0
8 | MODEC MANAGEMENT SERVICES PTE LTD PYRENEES VENTURE  FPSO AMOU, AWU AND MUA AGREEMENT 2025 | AG2025/1795 | MODEC Management Services | Current | 2029-06-27 | Production | False | True | Pyrenees Venture FPSO | 0 | 0
125 | M Maintenance Inpex 2019 | AG2019/4438 | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Expired | 2023-06-30 | Expired | False | True |  | 0 | 0
126 | M&ISS | AG2021/4675 | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Expired | 2025-04-30 | Expired | False | True |  | 0 | 0
82 | MEA OFFSHORE DECOMMISSIONING ENTERPRISE AGREEMENT 2022 | AG2022/672 | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Expired | 2026-03-22 | Decommissioning | False | True |  | 0 | 0
26 | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD (WOODSIDE) ONSHORE ENTERPRISE AGREEMENT 2022 | AG2022/2442 | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Current | 2026-07-26 | Maintenance | False | True | Woodside Onshore Facilities | 1 | 0
22 | M Maintenance Inpex 2023 | AG2023/638 | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Current | 2027-03-23 | Maintenance | False | True | Ichthys LNG | 0 | 0
24 | MEA PTY LTD OFFSHORE AGREEMENT 2024 | AG2024/4818 | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Current | 2028-06-01 | Maintenance | False | True |  | 0 | 0
23 | M&ISS PTY LTD OFFSHORE MAINTENANCE ENTERPRISE AGREEMENT 2025 | AG2025/936 | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | Current | 2029-04-15 | Maintenance | False | True |  | 0 | 0
27 | MWOG | AG2021/6315 | MWOG PTY LTD | Expired | 2025-08-16 | Maintenance | False | True | Goodwyn; Karratha Gas Plant | 0 | 0
88 | NOBLE DRILLING ENTERPRISE AGREEMENT 2023 | AG2023/3106 | NOBLE | Current | 2027-09-26 | Drilling | False | True |  | 0 | 0
108 | OCEANEERING AUSTRALIA PTY LTD ROV ENTERPRISE AGREEMENT 2019 (ENTERPRISE AGREEMENT) | AG2022/4551 | OCEANEERING AUSTRALIA PTY LTD | Current | 2026-11-29 | ROV | False | True |  | 0 | 0
130 | OSM (WA & NT) | AG2021/86 | OSM Australia Pty Ltd | Expired | 2024-08-16 | Expired | True | True |  | 0 | 0
83 | OSM OFFSHORE DECOMMISSIONING ENTERPRISE AGREEMENT  2022 | AG2022/4384 | OSM Australia Pty Ltd | Expired | 2026-03-22 | Decommissioning | False | True |  | 0 | 0
74 | OSM DECOMMISSIONING CATERING ENTERPRISE AGREEMENT  2023 | AG2023/3030 | OSM Australia Pty Ltd | Expired | 2026-03-22 | Catering | False | True | WA/NT Offshore (General) | 0 | 0
109 | OSM AUSTRALIA PTY LTD ROV CASUAL ENTERPRISE AGREEMENT 2022 | AG2022/4799 | OSM Australia Pty Ltd | Current | 2026-11-28 | ROV | False | True |  | 0 | 0
44 | OSM Australia Pty Ltd Maritime Offshore Oil and Gas Industry Masters and Deck Officers Enterprise Agreement 2024 | AG2024/225 | OSM Australia Pty Ltd | Current | 2027-10-01 | Marine-Deck Officers | False | True |  | 0 | 0
54 | OSM AUSTRALIA PTY LTD & AIMPE MARITIME OFFSHORE OIL AND GAS INDUSTRY ENGINEERS ENTERPRISE AGREEMENT 2024 | AG2024/696 | OSM Australia Pty Ltd | Current | 2028-04-17 | Marine-Engineers | False | True |  | 0 | 0
103 | OSM AUSTRALIA PTY LTD - WESTERN AUSTRALIA AND NORTHERN TERRITORY OFFSHORE CONSTRUCTION PROJECTS CATERING AGREEMENT 2025 | AG2025/913 | OSM Australia Pty Ltd | Current | 2028-11-11 | Offshore Construction | False | True |  | 0 | 0
62 | PHI INTERNATIONAL AUSTRALIA KIMBERLEY ENGINEERING AND RAMP STAFF ENTERPRISE AGREEMENT 2022 | AG2022/2101 | PHI INTERNATIONAL AUSTRALIA  | Current | 2026-08-03 | Aircraft Maint. | False | True | Kimberley Airfield | 0 | 0
61 | PHI INTERNATIONAL AUSTRALIA GASCOYNE ENGINEERING AND RAMP STAFF ENTERPRISE AGREEMENT 2022 | AG2022/4809 | PHI INTERNATIONAL AUSTRALIA  | Current | 2026-12-15 | Aircraft Maint. | False | True | Gascoyne Airfield | 0 | 0
63 | PHI INTERNATIONAL AUSTRALIA PTY LTD KARRATHA MPT HELICOPTER ENGINEERS ENTERPRISE AGREEMENT 2023 | AG2023/1555 | PHI INTERNATIONAL AUSTRALIA  | Current | 2027-02-07 | Aircraft Maint. | False | True | Karratha MPT Heliport | 0 | 0
114 | Rigforce Greenfields 2019 | AG2020/134 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Expired | 2023-02-01 | Expired | True | True |  | 0 | 0
89 | RFM OS PTY LTD AND MUA OFFSHORE OIL AND GAS ENTERPRISE AGREEMENT 2023 | AG2023/4619 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Current | 2027-08-01 | Drilling | False | True |  | 0 | 0
90 | RIGFORCE CONTRACTING PTY LTD DRILLING ENTERPRISE AGREEMENT 2023 | AG2023/2938 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Current | 2027-09-18 | Drilling | False | True |  | 0 | 0
46 | RFM OFFSHORE PTY LTD & AWU MARITIME OFFSHORE OIL AND   GAS INDUSTRY DECK OFFICERS GREENFIELDS AGREEMENT   2023 | AG2023/3884 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Current | 2027-11-03 | Marine-Deck Officers | True | True |  | 0 | 0
45 | PROGRAMMED MARINE PTY LTD MARITIME OFFSHORE OIL AND GAS INDUSTRY DECK OFFICERS ENTERPRISE AGREEMENT 2023 | AG2024/3338 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Current | 2027-11-09 | Marine-Deck Officers | False | True |  | 0 | 0
55 | PROGRAMMED OFFSHORE PTY LTD AND AIMPE MARINE ENGINEERS MARITIME OFFSHORE OIL AND GAS INDUSTRY ENTERPRISE AGREEMENT 2023 | AG2024/3977 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Current | 2027-12-08 | Marine-Engineers | False | True |  | 0 | 0
56 | RFM OS PTY LTD AND AIMPE MARINE ENGINEERS MARITIME OFFSHORE OIL AND GAS INDUSTRY ENTERPRISE AGREEMENT 2023 | AG2023/5223 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Current | 2028-01-12 | Marine-Engineers | False | True |  | 0 | 0
28 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD OFFSHORE MAINTENANCE HUC GREENFIELDS ENTERPRISE AGREEMENT 2024 | AG2025/191 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Current | 2028-02-01 | Maintenance | True | True |  | 0 | 0
75 | PROGRAMMED OFFSHORE PTY LTD WA & NT OFFSHORE CONSTRUCTION CATERING GREENFIELDS AGREEMENT 2024 | AG2025/7 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Current | 2028-11-11 | Catering | True | True | WA/NT Offshore (General) | 0 | 0
104 | PROGRAMMED OFFSHORE PTY LTD - WA&NT OFFSHORE CONSTRUCTION PROJECTS GREENFIELDS AGREEMENT 2024 | AG2025/6 | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | Current | 2028-11-12 | Offshore Construction | True | True |  | 0 | 0
9 | Santos Varanus Island | AG2023/113 | SANTOS WA ENERGY LIMITED VARANUS ISLAND HUB | Current | 2027-02-14 | Production | False | True | Varanus Island | 0 | 0
91 | SEDCO FOREX INTERNATIONAL INC ENTERPRISE AGREEMENT   2023 | AG2024/4965 | SEDCO FOREX INTERNATIONAL INC | Current | 2027-06-30 | Drilling | False | True |  | 0 | 0
77 | SGS PRELUDE CHEMISTS ENTERPRISE AGREEMENT 2024 | AG2024/3751 | SGS PRELUDE CHEMISTS | Current | 2028-07-31 | Chemists | False | True | Prelude FLNG | 0 | 0
10 | Shell Prelude | AG2022/3928 | SHELL PRELUDE | Current | 2026-10-25 | Production | False | True | Prelude FLNG | 0 | 0
57 | SIERA MARINE MANAGEMENT PTY LTD AND AWU MARINE  ENGINEERS MARITIME OFFSHORE OIL AND GAS INDUSTRY  ENTERPRISE AGREEMENT 2024 | AG2024/1906 | SIERA MARINE MANAGEMENT PTY LTD | Current | 2027-11-09 | Marine-Engineers | False | True |  | 0 | 0
47 | SIERA MARINE MANAGEMENT PTY LTD MARITIME OFFSHORE  OIL AND GAS INDUSTRY DECK OFFICERS AGREEMENT 2024 | AG2025/1438 | SIERA MARINE MANAGEMENT PTY LTD | Current | 2027-11-09 | Marine-Deck Officers | False | True |  | 0 | 0
76 | SODEXO REMOTE SITE OFFSHORE AND AWU ENTERPRISE AGREEMENT 2020 | AG2020/3199 | SODEXO REMOTE SITE | Expired | 2024-11-12 | Catering | False | True | WA/NT Offshore (General) | 0 | 0
48 | SOLSTAD AUSTRALIA PTY LTD AMOU OFFSHORE OIL AND GAS MASTERS AND DECK OFFICERS ENTERPRISE AGREEMENT 2023 | AG2023/4026 | SOLSTAD AUSTRALIA PTY LTD | Current | 2027-11-22 | Marine-Deck Officers | False | True |  | 0 | 0
58 | SOLSTAD AUSTRALIA PTY LTD AND AIMPE (MARINE ENGINEERS) OFFSHORE OIL AND GAS ENTERPRISE AGREEMENT 2023 | AG2024/2207 | SOLSTAD AUSTRALIA PTY LTD | Current | 2028-07-22 | Marine-Engineers | False | True |  | 0 | 0
134 | Ningaloo Vision | AG2023/907 | TEEKAY SHIPPING (AUSTRALIA) PTY LTD | Expired | 2025-02-11 | Expired | False | True |  | 0 | 0
15 | TEEKAY SHIPPING (AUSTRALIA) PTY LTD NINGALOO VISION FPSO AMOU AWU CFMEU AGREEMENT 2025 | AG2025/655 | TEEKAY SHIPPING (AUSTRALIA) PTY LTD | Current | 2027-02-11 | Production | False | True | Ningaloo Vision FPSO | 0 | 0
49 | TIDEWATER SHIP MANAGEMENT (AUSTRALIA) PTY LTD  MARITIME OFFSHORE OIL AND GAS INDUSTRY MASTERS AND  DECK OFFICERS ENTERPRISE AGREEMENT 2024 | AG2024/1577 | TIDEWATER SHIP MANAGEMENT (AUSTRALIA) PTY LTD | Current | 2027-11-30 | Marine-Deck Officers | False | True |  | 0 | 0
135 | TOTAL MARINE TECHNOLOGY PTY LTD ROV ENTERPRISE AGREEMENT 2021 | AG2021/5628 | TOTAL MARINE TECHNOLOGY PTY LTD | Expired | 2024-06-30 | Expired | False | True |  | 0 | 0
110 | TOTAL MARINE TECHNOLOGY PTY LTD ROV ENTERPRISE AGREEMENT 2024 | AG2024/4862 | TOTAL MARINE TECHNOLOGY PTY LTD | Current | 2026-12-18 | ROV | False | True |  | 0 | 0
272 | TRACE OFFSHORE ENTERPRISE AGREEMENT 2021 | AG2021/6291 | TRACE | Expired | 2025-07-27 | Expired | False | True |  | 0 | 0
119 | IAS GROUP ENTERPRISE AGREEMENT 2019-2023 | AG2019/533 | UGL RESOURCES (CONTRACTING) PTY LTD | Expired | 2023-07-02 | Expired | False | True |  | 0 | 0
32 | Varanus Island | AG2023/650 | UGL RESOURCES (CONTRACTING) PTY LTD | Expired | 2026-03-27 | Maintenance | False | True |  | 0 | 0
33 | UGL RESOURCES (CONTRACTING) PTY LTD KARRATHA   ENTERPRISE AGREEMENT 2023 | AG2023/1026 | UGL RESOURCES (CONTRACTING) PTY LTD | Current | 2026-05-19 | Maintenance | False | True | Karratha (Town/Industrial) | 0 | 0
11 | UPS - Northern Endeavour FPSO | AG2022/1302 | UPSTREAM PRODUCTION SOLUTIONS PTY LTD | Current | 2026-05-12 | Production | False | True | Northern Endeavour FPSO | 0 | 0
36 | VENTIA AUSTRALIA PTY LTD | AG2025/2335 | VENTIA AUSTRALIA PTY LTD | Current | 2029-08-14 | Maintenance | False | True | Gorgon LNG; Wheatstone Platform | 0 | 0
35 | WOOD OFFSHORE MAINTENANCE SERVICES GREENFIELDS AGREEMENT 2021 | AG2021/9037 | WOOD | Expired | 2026-01-14 | Maintenance | True | True |  | 0 | 0
34 | WOOD OFFSHORE BROWNFILEDS SERVICES (WESTERN AUSTRALIA)  GREENFILEDS AGREEMENT 2024 – 2028 | AG2024/1405 | WOOD | Current | 2028-05-18 | Maintenance | False | True |  | 0 | 0
13 | WOODSIDE ENERGY LTD NORTH WEST SHELF GAS PLATFORMS ENTERPRISE AGREEMENT 2023 | AG2023/3761 | WOODSIDE ENERGY LTD | Current | 2027-10-24 | Production | False | True | Goodwyn; North West Shelf (NWS) Platforms; Rankin North | 0 | 0
12 | WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO ENTERPRISE AGREEMENT 2024 | AG2024/1022 | WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO | Current | 2028-04-18 | Production | False | True | Ngujima-Yin FPSO; Okha FPSO | 0 | 0
14 | WOODSIDE ENERGY MACEDON GAS PLANT ENTERPRISE  AGREEMENT 2024 | AG2024/1594 | WOODSIDE ENERGY MACEDON GAS PLANT | Current | 2028-05-23 | Production | False | True | Macedon Gas Plant | 0 | 0
136 | AGC | AG2022/4202 | WORKFORCE LOGISTICS PTY LTD | Expired | 2026-10-26 | Expired | False | True |  | 0 | 0
37 | XELERATOR PTY LTD WOODSIDE ONSHORE ENTERPRISE AGREEMENT 2024 | AG2024/1031 | XELERATOR PTY LTD | Current | 2028-04-17 | Maintenance | False | True | Woodside Onshore Facilities | 0 | 0
1096 | Vertech WA & NT  | AE530815 |  | Current | 2029-10-28 |  | True | True | Karratha Gas Plant | 0 | 0
```

### 05_candidate_clusters.sql

Statement 1 — employer near-duplicate clusters:

```
key | n | members
chevron | 4 | 2:CHEVRON GORGON OPERATIONS || 3:CHEVRON WHEATSTONE DOWNSTREAM OPERATIONS || 4:CHEVRON WHEATSTONE PLATFORM || 691:Chevron
jadestone | 4 | 6:JADESTONE ENERGY MONTARA VENTURE || 7:JADESTONE ENERGY STAG CPF || 693:Jadestone || 695:JADESTONE ENERGY 
woodside | 4 | 12:WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO || 13:WOODSIDE ENERGY LTD || 14:WOODSIDE ENERGY MACEDON GAS PLANT || 689:Woodside
auriga | 2 | 52:AURIGA AVIATION HELICOPTER ENGINEERS || 723:Auriga Aviation
downer | 2 | 18:DOWNER EDI ENGINEERING ELECTRICAL LNG FACILITY SERVICES || 710:Downer EDI Group
inpex | 2 | 5:INPEX - ICHTHYS OPERATIONS || 690:Inpex
modec | 2 | 93:MODEC Management Services || 703:Modec
noble | 2 | 73:NOBLE || 736:Noble Corporation
saipem | 2 | 726:Saipem || 778:Saipem Leighton Consortium
santos | 2 | 9:SANTOS WA ENERGY LIMITED VARANUS ISLAND HUB || 692:Santos
shell | 2 | 10:SHELL PRELUDE || 688:Shell
solstad | 2 | 47:SOLSTAD AUSTRALIA PTY LTD || 717:Solstad Offshore ASA
testco | 2 | 787:TestCo Energy || 791:TestCo 2
toll | 2 | 713:Toll Energy || 782:Toll West
trace | 2 | 97:TRACE || 749:Trace JV
```

Statement 2 — worksite near-duplicate clusters:

```
key | n | members
mma | 10 | 166:MMA Pinnacle [Vessel] || 167:MMA Plover [Vessel] || 172:MMA Vigilant [Vessel] || 173:MMA Brewster [Vessel] || 174:Mma coral [Vessel] || 175:MMA Inscription [Vessel] || 233:MMA Harmony [Vessel] || 234:MMA Monarch [Vessel] || 238:MMA LEEUWIN [Vessel] || 270:MMA vessel [Vessel]
pacific | 7 | 188:Pacific Dilgence [Vessel] || 189:Pacific Liberty [Vessel] || 206:Pacific Guillemot [Vessel] || 214:Pacific Valor [Vessel] || 216:Pacific Grackle [Vessel] || 220:Pacific Vulcan [Vessel] || 260:Pacific Rapier [Vessel]
siem | 6 | 203:Siem Thiima [Vessel] || 205:Siem Aquamarine [Vessel] || 209:Siem Pilot [Vessel] || 210:Siem AHTS [Vessel] || 212:Siem symphony [Vessel] || 218:Siem Amethyst [Vessel]
skandi | 6 | 228:Skandi Hercules [Other] || 252:Skandi Darwin [Vessel] || 254:Skandi Vessels [Vessel] || 255:skandi peregrino [Vessel] || 256:Skandi Singapore [Other] || 426:skandi inventor [Vessel]
fugro | 4 | 221:Fugro Etive [Vessel] || 227:Fugro Etive, Furgo Maali, Fugro Kwilena [Other] || 422:Fugro Workshop [Other] || 423:Fugro unmanned remote [Other]
karratha | 4 | 20:Karratha (Town/Industrial) [Other] || 21:Karratha MPT Heliport [Heliport] || 136:Karratha Gas Plant [Gas_Plant] || 159:Karratha Airport [Airfield]
test | 4 | 196:Test Onshore Gas Plant [Gas_Plant] || 197:TEST · TestCo 2 — Alpha FPSO [FPSO] || 198:TEST · TestCo 2 — Bravo Platform [Platform] || 199:TEST · TestCo 2 — Charlie FPU [FPU]
valaris | 4 | 152:Valaris 107 [Vessel] || 193:Valaris 247 [Vessel] || 194:Valaris DPS-1 [Vessel] || 424:Valaris MS-1 [Vessel]
alkimos | 3 | 170:Alkimos [Other] || 180:Alkimos seawater alliance [Other] || 181:Alkimos marine works [Other]
ichthys | 3 | 7:Ichthys LNG [FPSO] || 147:Ichthys FPSO [FPSO] || 148:Ichthys [Other]
normand | 3 | 263:Normand Saracen [Vessel] || 265:Normand Ranger [Other] || 418:Normand Scorpion [Other]
sea1 | 3 | 204:Sea1 Emerald [Vessel] || 207:Sea1 Sapphire [Vessel] || 219:SEA1 Anchor Handlers [Vessel]
seven | 3 | 176:Seven Oceanic Subsea 7 [Vessel] || 415:Seven Sisters [Vessel] || 429:Seven Arctic [Vessel]
wheatstone | 3 | 2:Wheatstone LNG (Downstream) [Onshore_LNG] || 3:Wheatstone Platform [Platform] || 139:Wheatstone LNG [Onshore_LNG]
darwin | 2 | 140:Darwin ILNG [Onshore_LNG] || 187:Darwin Airport [Airfield]
dof | 2 | 215:DOF Vessels [Vessel] || 253:Dof Subsea [Vessel]
floatel | 2 | 240:Floatel triumph [Accommodation_Vessel] || 261:Floatel Triumph [Accommodation_Vessel]
jetwave | 2 | 244:Jetwave Jasmin [Vessel] || 266:Jetwave Lightning [Vessel]
mermaid | 2 | 235:Mermaid Sound [Other] || 236:Mermaid Cove [Vessel]
ocean | 2 | 154:Ocean Apex [Vessel] || 168:Ocean Monarch [Vessel]
pluto | 2 | 137:Pluto LNG [Onshore_LNG] || 138:Pluto 2 [Onshore_LNG]
transocean | 2 | 155:Transocean Endurance [Platform] || 191:Transocean [Other]
wandoo | 2 | 141:Wandoo B [Platform] || 142:Wandoo A [Platform]
```

Statement 3 — exact worksite duplicates after case/space folding:

```
folded | count | string_agg
floatel triumph | 2 | 261,240
```

Statement 4 — exact employer duplicates after case/space folding:

```
(no rows)
```

### 06_oa_universe_crossmatch.sql

Statement 1 — OA Universe assets vs `worksites`:

```
asset | db_worksites
Angel | 157:Angel Platform [Platform,off]
Barossa | — NO MATCH —
Barrow Island | 421:Barrow Island CO2 [Other,off]
Bass Strait platforms | — NO MATCH —
Bayu-Undan | 162:Bayu Undan [Other,off]
Browse | — NO MATCH —
Buffalo | — NO MATCH —
BW Opal | — NO MATCH —
Campbell platform | — NO MATCH —
Corvus | — NO MATCH —
Crux | 6:Crux Gas Field [Gas_Field,off]
Darwin / Bladin Point | 140:Darwin ILNG [Onshore_LNG,on] | 187:Darwin Airport [Airfield,off] | 252:Skandi Darwin [Vessel,off]
DLNG | — NO MATCH —
Dorado | — NO MATCH —
Elang/Kakatua | — NO MATCH —
Enfield | — NO MATCH —
Fletcher-Finucane | — NO MATCH —
Goodwyn A | 143:Goodwyn [Platform,off]
Gorgon / Jansz-Io subsea | 1:Gorgon LNG [Onshore_LNG,on]
Greater Sunrise | — NO MATCH —
Griffin | — NO MATCH —
Halyard | — NO MATCH —
Harriet Alpha | — NO MATCH —
Ichthys Explorer (CPF) | 7:Ichthys LNG [FPSO,off] | 147:Ichthys FPSO [FPSO,off] | 148:Ichthys [Other,off]
Ichthys Venturer (FPSO) | 160:Inpex Venturer FPSO [FPSO,off]
Jansz-Io Compression | — NO MATCH —
John Brookes | — NO MATCH —
Julimar-Brunello | — NO MATCH —
Karratha Gas Plant | 20:Karratha (Town/Industrial) [Other,on] | 21:Karratha MPT Heliport [Heliport,on] | 136:Karratha Gas Plant [Gas_Plant,on] | 159:Karratha Airport [Airfield,off]
Macedon | 10:Macedon Gas Plant [Gas_Plant,on]
Minerva | — NO MATCH —
Montara | 15:Montara Venture FPSO [FPSO,off]
Mutineer-Exeter | — NO MATCH —
Ngujima-Yin FPSO | 11:Ngujima-Yin FPSO [FPSO,off]
Ningaloo Vision | 17:Ningaloo Vision FPSO [FPSO,off]
North Rankin Complex | 144:Rankin North [Platform,off]
Northern Endeavour | 19:Northern Endeavour FPSO [FPSO,off]
NWS subsea tiebacks | 9:North West Shelf (NWS) Platforms [Platform,off]
Okha FPSO | 12:Okha FPSO [FPSO,off]
Onslow | — NO MATCH —
Pluto 2 | 138:Pluto 2 [Onshore_LNG,on]
Pluto A | 137:Pluto LNG [Onshore_LNG,on] | 138:Pluto 2 [Onshore_LNG,on]
Prelude FLNG | 5:Prelude FLNG [FLNG,off]
Pyrenees Venture FPSO | 18:Pyrenees Venture FPSO [FPSO,off]
Reindeer | — NO MATCH —
Scarborough FPU | 145:Scarborough FPU [FPU,off]
Spar / East Spar | — NO MATCH —
Spartan | — NO MATCH —
Stag | 16:Stag CPF [CPF,off]
Stybarrow | — NO MATCH —
Thevenard Island | — NO MATCH —
Varanus Island | 14:Varanus Island [Gas_Plant,on]
Waitsia | — NO MATCH —
Wandoo | 141:Wandoo B [Platform,off] | 142:Wandoo A [Platform,off]
Wheatstone Platform | 2:Wheatstone LNG (Downstream) [Onshore_LNG,on] | 3:Wheatstone Platform [Platform,off] | 139:Wheatstone LNG [Onshore_LNG,on]
```

Statement 2 — OA Universe contractors vs `employers`:

```
company | db_employers
Allseas | — NO MATCH —
Altrad | 29:ALTRAD (Subcontractor)
Altrad Sparrows | 780:Sparrows Group (-)
AOS | 37:AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD (Subcontractor)
Applus+ | 78:APPLUS+ PTY LTD (-)
Atlas Professionals | 57:ATLAS PROGRAMMED MARINE (AUSTRALIA) PTY LTD (-)
Auriga Aviation | 52:AURIGA AVIATION HELICOPTER ENGINEERS (-) | 723:Auriga Aviation (Specialist)
Baker Hughes | 70:BAKER HUGHES SERVICES AUSTRALIA PTY LTD (-)
Bechtel | 700:Bechtel Australia (Major_Contractor)
Bhagwan Marine | 38:BHAGWAN MARINE LTD (Specialist)
Boskalis | — NO MATCH —
BW Offshore | 1:BW (-)
C2O | — NO MATCH —
CHC | 53:CHC HELICOPTER (AUSTRALIA) AIRCRAFT ENGINEERS (-)
Chevron | 2:CHEVRON GORGON OPERATIONS (-) | 3:CHEVRON WHEATSTONE DOWNSTREAM OPERATIONS (-) | 4:CHEVRON WHEATSTONE PLATFORM (-) | 691:Chevron (Principal_Employer)
Cleanaway | 709:Cleanaway Waste Management (Subcontractor)
Condex | — NO MATCH —
Cyan Renewables | 705:Cyan Renewables (Specialist)
DeepOcean / Shelf Subsea | — NO MATCH —
Diamond Offshore | 71:DIAMOND (-) | 748:Steel Diamond (Subcontractor)
DOF | 39:DOF MANAGEMENT AUSTRALIA PTY LTD (-)
Downer | 18:DOWNER EDI ENGINEERING ELECTRICAL LNG FACILITY SERVICES (-) | 710:Downer EDI Group (-)
EnerMech | 712:EnerMech (Subcontractor)
Ensco | 72:ENSCO AUSTRALIA PTY LIMITED (-)
Entier | 62:ENTIER AUSTRALIA PTY LTD (-)
Eris | 19:ERIS (Labour_Hire)
Ertech | 698:Vertech (Specialist) | 701:Powertech Pty Ltd (Subcontractor)
ESS / Compass | 58:COMPASS GROUP – (Major_Contractor)
Esso/ExxonMobil | — NO MATCH —
Fugro | 40:FUGRO AUSTRALIA PTY LTD (-)
GGC | — NO MATCH —
Go Offshore | 797:GO OFFSHORE (-)
GR Production Services | 765:GR Production Services (Subcontractor)
Heerema | — NO MATCH —
Helix | 721:Helix Robotic Solutions (Specialist)
IAS | — NO MATCH —
Inpex | 5:INPEX - ICHTHYS OPERATIONS (-) | 690:Inpex (Principal_Employer)
Isologics | 88:ISOLOGICS (-)
Jadestone | 6:JADESTONE ENERGY MONTARA VENTURE (-) | 7:JADESTONE ENERGY STAG CPF (-) | 693:Jadestone (Principal_Employer) | 695:JADESTONE ENERGY  (-)
Kaefer | 704:Kaefer Integrated Services Pty Ltd (Subcontractor)
KBSS | 725:KBSS Engineering (Subcontractor)
Kuiper | — NO MATCH —
Legeneering | 21:LEGENEERING (AUST.) PTY LTD (-)
LifeFlight | 730:LifeFlight (Specialist)
McDermott | 68:MCDERMOTT AUSTRALIA PTY LTD (-)
MMA Offshore | 699:MMA (Specialist)
MODEC | 93:MODEC Management Services (-) | 703:Modec (Subcontractor)
Monadelphous | 26:MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD (Major_Contractor)
MWOG | 27:MWOG PTY LTD (-)
NES Fircroft | 746:NES Fircroft (Subcontractor)
Noble | 73:NOBLE (-) | 736:Noble Corporation (Subcontractor)
Oceaneering | 83:OCEANEERING AUSTRALIA PTY LTD (-)
OSA | 707:Offshore Services Australasia (Subcontractor)
OSM | 43:OSM Australia Pty Ltd (-)
Parabellum | 711:Parabellum International (Subcontractor)
Petrofac | 737:Petrofac (Subcontractor)
PHI | 54:PHI INTERNATIONAL AUSTRALIA  (Specialist)
Powertech | 701:Powertech Pty Ltd (Subcontractor)
Programmed | 28:PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD (-) | 57:ATLAS PROGRAMMED MARINE (AUSTRALIA) PTY LTD (-)
Reach Subsea | 716:Reach Subsea (Specialist)
Saipem | 726:Saipem (-) | 778:Saipem Leighton Consortium (Major_Contractor)
Santos | 9:SANTOS WA ENERGY LIMITED VARANUS ISLAND HUB (-) | 692:Santos (Principal_Employer)
Sapura | — NO MATCH —
Sea1 | 799:Sea1 Offshore (-)
Sedco Forex | 75:SEDCO FOREX INTERNATIONAL INC (-)
SGS | 65:SGS PRELUDE CHEMISTS (-)
Shell | 10:SHELL PRELUDE (-) | 688:Shell (Principal_Employer)
Siem | — NO MATCH —
Siera | 46:SIERA MARINE MANAGEMENT PTY LTD (-)
Sodexo | 64:SODEXO REMOTE SITE (-)
Solstad | 47:SOLSTAD AUSTRALIA PTY LTD (-) | 717:Solstad Offshore ASA (Specialist)
Subsea7 | 716:Reach Subsea (Specialist)
Technip | 728:Technip (Subcontractor)
Tidewater | 48:TIDEWATER SHIP MANAGEMENT (AUSTRALIA) PTY LTD (-)
TMT | 84:TOTAL MARINE TECHNOLOGY PTY LTD (-)
Transocean | — NO MATCH —
UGL | 33:UGL RESOURCES (CONTRACTING) PTY LTD (-)
UPS | 11:UPSTREAM PRODUCTION SOLUTIONS PTY LTD (-)
Valaris | 702:Valaris Marine (Subcontractor)
Van Oord | — NO MATCH —
Vantris / Sapura | — NO MATCH —
Ventia | 35:VENTIA AUSTRALIA PTY LTD (-)
Vermilion | 694:Vermilion (Principal_Employer)
Vertech | 698:Vertech (Specialist)
Weststar | — NO MATCH —
Wood | 12:WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO (-) | 13:WOODSIDE ENERGY LTD (-) | 14:WOODSIDE ENERGY MACEDON GAS PLANT (-) | 34:WOOD (-) | 689:Woodside (Principal_Employer)
Woodside | 12:WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO (-) | 13:WOODSIDE ENERGY LTD (-) | 14:WOODSIDE ENERGY MACEDON GAS PLANT (-) | 689:Woodside (Principal_Employer)
WPF Duratec | 66:DURATEC (-)
```

### 07_hierarchy_and_patches.sql

Statement 1 — campaign universe definitions:

```
campaign_id | name | campaign_type | status | sector_wide | is_standing | parent_campaign_id | universe_employers | universe_worksites | members | groups | units
15 | Test2 | bargaining | active | False | False |  | TestCo 2 | 3 | 72 |  | 0
21 | Toll Energy | bargaining | active | False | False |  | Toll Energy | 1 | 146 |  | 0
23 | Mono's Inpex Coordinators and Supervisors | bargaining | active | False | False |  | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | 3 | 48 | custom:Deployment | 4
26 | Decom sector | bargaining | active | True | False |  | ERIS; MCDERMOTT AUSTRALIA PTY LTD | 4 | 216 | employer:Employer, occupation:Occupation, custom:Custom | 15
27 | Mono's Woodside | bargaining | active | False | False |  | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | 3 | 80 | shift:Shift | 5
37 | testco | bargaining | active | False | False |  | TestCo 2 | 3 | 74 | worksite:Worksite | 3
41 | ESS Woodside | bargaining | active | False | False |  | COMPASS GROUP – | 4 | 61 | worksite:Worksite | 5
42 | EDI Downer Chevron | bargaining | active | False | False |  | Downer EDI Group | 2 | 212 | worksite:Worksite, custom:Custom | 3
47 | UGL Varanus | bargaining | active | False | False |  | UGL RESOURCES (CONTRACTING) PTY LTD | 1 | 223 | work_area:Work area, custom:Union | 12
48 | UGL WA Oil | bargaining | active | False | False |  | UGL RESOURCES (CONTRACTING) PTY LTD | 0 | 219 | work_area:Work area | 3
49 | OA Membership Outreach | organising | active | False | True |  |  | 0 | 0 |  | 0
50 | Offshore Allliance internal | organising | active | False | False |  | Australian Workers' Union WA Branch; MUA | 1 | 8 |  | 0
55 | AOS catering | bargaining | active | False | False |  |  | 0 | 11 | worksite:Worksite | 1
57 | Deck officer and Engineers 2026 | bargaining | active | False | False |  | AUSTRALIAN OFFSHORE SOLUTIONS PTY LTD; BHAGWAN MARINE LTD; Cyan Renewables; DOF MANAGEMENT AUSTRALIA PTY LTD; GO OFFSHORE; Jan De Nul; JETWAVE MARINE SERVICES PTY. LTD.; Maersk; OSM Australia Pty Ltd; PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD; Rigforce Pty Ltd; Sea1 Offshore; SIERA MARINE MANAGEMENT PTY LTD; Solstad Offshore ASA; TIDEWATER SHIP MANAGEMENT (AUSTRALIA) PTY LTD; Unemployed; Unknown; Valaris Marine | 85 | 305 | worksite:Worksite, employer:Employer | 161
58 | Jadestone Stag | bargaining | active | False | False |  | JADESTONE ENERGY STAG CPF | 1 | 28 | work_area:Work area | 5
59 | Mono's Shell Crux | bargaining | active | False | False |  | MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD | 1 | 196 | work_area:Work area | 8
60 | UGL CO2 | organising | active | False | False |  | UGL RESOURCES (CONTRACTING) PTY LTD | 1 | 224 |  | 0
61 | Fugro | bargaining | active | False | False |  | FUGRO AUSTRALIA PTY LTD | 3 | 48 | worksite:Worksite, custom:Custom | 6
62 | programmed ROV | bargaining | active | False | False |  | PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD | 3 | 64 |  | 0
64 | ROV sector wide | political | active | False | False |  | DOF MANAGEMENT AUSTRALIA PTY LTD; FUGRO AUSTRALIA PTY LTD; Helix Robotic Solutions; OCEANEERING AUSTRALIA PTY LTD; PROGRAMMED OFFSHORE (AUSTRALIA) PTY LTD; Reach Subsea; Technip; TOTAL MARINE TECHNOLOGY PTY LTD | 0 | 276 | employer:Employer | 8
65 | Parrabellum | bargaining | planning | False | False |  | Parabellum International | 2 | 55 |  | 0
66 | Parabellum Barrow | bargaining | planning | False | False |  | Parabellum International | 1 | 160 |  | 0
```

Statement 2 — organising unit bases:

```
ou_type | units | with_employer | with_worksite | custom
worksite | 156 | 143 | 135 | 0
employer | 28 | 28 | 0 | 0
work_area | 23 | 0 | 0 | 12
custom | 18 | 0 | 0 | 7
job_type | 9 | 0 | 0 | 0
shift | 5 | 0 | 0 | 0
```

Statement 3 — organiser patches:

```
patch_id | patch_name | organiser_name | entity_type | entity_id | entity
1 | Jason | Jason Lipscombe | agreement | 5 | INPEX - ICHTHYS OPERATIONS ENTERPRISE AGREEMENT 2022-2026
1 | Jason | Jason Lipscombe | agreement | 7 | Jadestone Stag
1 | Jason | Jason Lipscombe | agreement | 10 | Shell Prelude
1 | Jason | Jason Lipscombe | agreement | 63 | PHI INTERNATIONAL AUSTRALIA PTY LTD KARRATHA MPT HELICOPTER ENGINEERS ENTERPRISE AGREEMENT 2023
1 | Jason | Jason Lipscombe | agreement | 68 | COMPASS GROUP – ESS OFFSHORE OIL & GAS (WHEATSTONE PLATFORM) ENTERPRISE AGREEMENT 2022
1 | Jason | Jason Lipscombe | employer | 6 | JADESTONE ENERGY MONTARA VENTURE
1 | Jason | Jason Lipscombe | employer | 56 | 
1 | Jason | Jason Lipscombe | employer | 60 | 
2 | Jarred | Jarred Payne |  |  | 
```

## 4. Delta

### 4.1 `00_profile_counts.sql` — production vs clone

The verifier's first clone run of `00_profile_counts.sql` errored (§3, §5): `membership_update_batches` does not
exist on the clone (its ledger lacks `20260921030000_membership_updates`). The orchestrator therefore moved that
count into `00b_profile_supplementary.sql`, added `occupation_groups` to `00`, and re-ran the amended `00` on the
clone read-only (2026-09-22, orchestrator, one `execute_sql` call; production values are the verifier's run above,
plus `occupation_groups = 19` and `membership_update_batches = 1` measured by the orchestrator on production).

```
entity | production | clone | difference (prod - clone)
agreement_employers | 5 | 5 | 0
agreement_scopes | 0 | 0 | 0
agreement_worksites | 54 | 54 | 0
agreements | 136 | 136 | 0
campaign_employers | 48 | 46 | 2
campaign_groups | 25 | 20 | 5
campaign_organising_units | 253 | 239 | 14
campaign_worker_membership | 3456 | 2726 | 730
campaign_worker_ou | 2506 | 1921 | 585
campaign_worksites | 122 | 122 | 0
campaigns | 24 | 22 | 2
employer_merge_events | 23 | 23 | 0
employer_name_aliases | 39 | 39 | 0
employer_scopes | 28 | 28 | 0
employer_worksite_roles | 251 | 251 | 0
employers | 187 | 171 | 16
import_logs | 68 | 42 | 26
membership_update_batches | 1 | table absent (needs 20260921030000) | n/a
occupation_aliases | 1488 | 1484 | 4
occupation_groups | 19 | 19 | 0
occupations | 182 | 172 | 10
organiser_patch_assignments | 8 | 8 | 0
organiser_patches | 2 | 2 | 0
organisers | 11 | 11 | 0
program_worksites | 10 | 10 | 0
programs | 4 | 4 | 0
projects | 20 | 20 | 0
sectors | 16 | 16 | 0
upcoming_project_employers | 84 | 83 | 1
upcoming_projects | 84 | 83 | 1
work_scopes | 22 | 22 | 0
worker_agreements | 0 | 0 | 0
worker_assignments | 0 | 0 | 0
workers | 6564 | 2407 | 4157
workers_active | 5749 | 2293 | 3456
worksite_contracts | 0 | 0 | 0
worksite_name_aliases | 8 | 8 | 0
worksite_scopes | 49 | 49 | 0
worksites | 194 | 174 | 20
worksites_active | 188 | 168 | 20
worksites_with_parent | 1 | 1 | 0
```

Every difference is the September membership sync and the campaign work that followed it (the clone is the 12
September copy): +4,157 workers, +16 employers, +20 worksites, +2 campaigns (69 Total Marine Technology and one
more), +730 campaign memberships, +585 placements, +10 occupations and +4 occupation aliases, +26 import logs,
+1 upcoming project. Reference tables (agreements and their junctions, roles, scopes, programs, projects,
patches, sectors, aliases, merge events) are identical.

### 4.1a `00b_profile_supplementary.sql` (orchestrator, read-only, 2026-09-22)

```
role_type | production | clone
Operator | 183 | 183
Other | 51 | 51
Subcontractor | 13 | 13
Principal_Contractor | 3 | 3
Owner | 1 | 1
```

`membership_update_batches`: production 1; clone: relation does not exist (expected, see above).

### 4.2 Plan §1.1 volumes vs measured production

Plan §1.1 (`docs/data-architecture/OA_UNIVERSE_ALIGNMENT_PLAN.md`, lines 45–66) states the following volumes as at 22 Sep 2026, production. Reproduced against this run:

```
entity | plan §1.1 value | plan notes | measured production (this run) | reproduced? (yes / no: measured value)
workers | 6,564 (5,749 active) | 4,157 created Sep 2026 (membership sync); 1,146 on 1 Apr (worker import) | 6564 total, 5749 active (00; 03_2 shows 4157 in 2026-09, 1146 in 2026-04) | yes
employers | 187 | category null on 73; abn null on all 187; trading_name null on all | 187 (00); category null on 73 (01_4); need per-row abn/trading_name check | yes (count); abn/trading_name null-on-all matches 01_1 — all rows show has_abn=False and no trading_name value
employer_name_aliases / employer_merge_events | 39 / 23 | every alias came from a merge; none from import or research | 39 / 23 (00); 01_2 shows source='merge' on all 39 rows | yes
worksites | 194 (188 active) | 83 Vessel, 50 Other; basin null on 168; parent set on 1 | 194 total, 188 active (00); 83 Vessel / 50 Other (02_2); basin null on 168 (02_3); worksites_with_parent=1 (00) | yes
worksite_name_aliases | 8 | all import, all vessel spellings | 8 (00); 02_4 shows source='import' on all 8, all vessel names | yes
employer_worksite_roles | 251 | 183 Operator, 51 Other, 13 Subcontractor, 3 Principal_Contractor, 1 Owner | 251 (00); breakdown 183 / 51 / 13 / 3 / 1 (00b, §4.1a) | yes
worksite_scopes / employer_scopes / work_scopes | 49 / 28 / 22 | scope tree from docs/employer_mapping.docx | 49 / 28 / 22 (00) | yes
worksite_contracts / worker_assignments / worker_agreements | 0 / 0 / 0 | the designed contract layer is unused | 0 / 0 / 0 (00) | yes
agreements | 136 (86 Current, 50 Expired) | agreement_scope null on 136; 89 with no worksite; holder null on 1 | 136 (00); 86 Current / 50 Expired (04_1); agreement_scope null on 136 (04_2); 89 no-worksite-link (04_4); holder null on exactly 1 row confirmed in 04_5 (agreement_id 1096, 'Vertech WA & NT ', decision_no AE530815, holder blank) | yes
sectors | 16 | the tabs of the agreements spreadsheet | 16 (00) | yes
programs / program_worksites / projects | 4 / 10 / 20 |  | 4 / 10 / 20 (00) | yes
organiser_patches / organiser_patch_assignments | 2 / 8 | one organiser; entity types agreement (5) and employer (3) | 2 / 8 (00); 07_3 shows patch 1 (Jason) has 5 agreement rows + 3 employer rows = 8, patch 2 (Jarred) has 0 assignments (one null row from the LEFT JOIN) | yes
campaigns / campaign_groups / campaign_organising_units | 24 / 25 / 253 | groups exist since WP2.1; families since WP3.8 | 24 / 25 / 253 (00); 07_1 lists 24 non-episode campaigns | yes
campaign_employers / campaign_worksites / campaign_worker_membership | 48 / 122 / 3,415 | universe definition and its materialisation | 48 / 122 (00); campaign_worker_membership = 3456 (00), not 3,415 | explained: measured 3,456 against the plan's 3,415 (+41). Campaign membership is materialised by the universe sync that runs whenever a writer opens a wall chart (UX ledger incidental finding of 2026-09-14), so this total drifts with normal use between two reads on the same day; the plan's own §7 says before/after evidence compares checksums, not row totals
occupations / occupation_aliases / occupation_groups | 182 / 1,488 / 19 | 4,392 active workers carry a canonical occupation | 182 / 1488 (00); occupation_groups not selected by 00 (pack has no occupation_groups row) — not directly reproduced; 4392 with canonical occupation reproduced via 03_5 (null-occupation row: with_canonical=4392) | yes: 182 / 1488 (00), occupation_groups 19 (amended 00, §4.1), 4,392 with a canonical occupation (03_5)
upcoming_projects / upcoming_project_employers | 84 / 84 | NOPSEMA scraper with a match-review queue | 84 / 84 (00) | yes
```

### 4.3 `test` cluster in `05_candidate_clusters.sql` and `workers_active`

```
project | test cluster in 05_1 (employers) | test cluster in 05_2 (worksites) | workers_active (00 or cross-check)
production (gteygwfgjvczanmrwgbr) | no — 05_1 has no key='test' row | yes — key='test', n=4: 196 Test Onshore Gas Plant [Gas_Plant], 197 TEST · TestCo 2 — Alpha FPSO [FPSO], 198 TEST · TestCo 2 — Bravo Platform [Platform], 199 TEST · TestCo 2 — Charlie FPU [FPU] | 5749
clone (yqjkuobcawvigsfpgrcm) | no — 05_1 has no key='test' row | yes — key='test', n=4: identical 4 worksites (196–199) | 2293 (from 03_1; 00 errored on the clone, see §5)
```

## 5. Verifier notes

- `00_profile_counts.sql` errored on the clone (`yqjkuobcawvigsfpgrcm`): `relation "membership_update_batches" does not exist` (error 42P01). No other statement in the pack references this table, so this was the only error encountered across all 60 statement runs (30 per project). The clone's row count for `membership_update_batches` and the combined `00` result set could not be obtained; §4.1 gives cross-checked values recovered from other pack statements where possible.
- Every one of the 8 pack files holds more than one SQL statement; each file was split into its individual `SELECT` statements and each statement was run as its own `execute_sql` call, per file order, on both projects — 30 statements per project (00: 1, 01: 5, 02: 4, 03: 6, 04: 5, 05: 4, 06: 2, 07: 3).
- `05_candidate_clusters.sql` statement 4 (exact employer duplicates after case/space folding) returned zero rows on both production and the clone.
- Plan §1.1's `employer_worksite_roles` role breakdown (183 Operator / 51 Other / 13 Subcontractor / 3 Principal_Contractor / 1 Owner) and `occupation_groups` count (19) are not produced by any statement in the profiling pack; the row-count totals that the pack does cover (251 and 182/1488 respectively) were reproduced. This is a pack-coverage gap, not a data discrepancy.
- `campaign_worker_membership` measured 3,456 on production against the plan's stated 3,415 (+41). No other §1.1 row-count in the pack's `00_profile_counts.sql` statement differed from the plan's stated production volumes.
- The clone's `05_candidate_clusters.sql` employer-cluster statement (05_1) has 15 clusters vs production's 17: the clone is missing the `atc` cluster (employers 815/816, `ATC Offshore` and `ATC`) and the `ugl`/`ugl` lower-case cluster (employer 826, `ugl`) — both created by the 17–21 September membership sync, which the 12 September clone predates (consistent with the README and decision D17).
- The clone's `06_oa_universe_crossmatch.sql` asset cross-match (06_1) shows 3 fewer worksite matches than production (Barossa, BW Opal, Harriet Alpha, Jansz-Io Compression and Waitsia all `— NO MATCH —` on the clone but matched on production, while Northern Endeavour drops its second match); its company cross-match (06_2) shows Siem and IAS as `— NO MATCH —` on the clone (matched on production via employers 831 `Siem Offshore` and 827 `IAS Group`) — again consistent with the clone predating the September sync.
- All row counts for the per-row statements (01 statement 1: 187 employers; 02 statement 1: 194 worksites) match the `00_profile_counts.sql` totals on production; on the clone, 01 statement 1 and 02 statement 1 returned 171 and 174 data rows respectively (172 and 175 lines including the header, as rendered in §3), and those were used in §4.1 as cross-checks in place of the errored `00` totals.

## 6. Orchestrator's closure (2026-09-22)

- Every §1.1 count is reproduced or explained (§4.2): the one drift (`campaign_worker_membership` +41) is the
  sync-on-open materialisation, which is why the workstream's acceptance evidence is checksums per campaign, not
  row totals.
- Pack amendment recorded as DA0.1's one deviation: `membership_update_batches` moved from `00` to the new
  `00b_profile_supplementary.sql` (with the `employer_worksite_roles` breakdown), `occupation_groups` added to
  `00`, README updated. Reason: the pack must run unchanged on every project, and the 12 September clone lacks
  `20260921030000`.
- Baseline for Phase 0 acceptance: production `workers_active = 5749`; the DA0.2 target is 5,085. Clone
  `workers_active = 2293`; the clone's own target is set by DA0.2's preflight on the clone.
- The `test` worksite cluster (196–199) is present on both projects and is the DA0.2 acceptance marker in `05`.
