-- ============================================================
-- Migration 20260519100000: Phase 2 WTP Options & Categories
-- Bargaining to Win (Stages 7-11) Where to Play Options
-- ============================================================

-- ============================================================
-- Insert WTP Categories for Stages 7-11
-- ============================================================

INSERT INTO wtp_categories (category_name, description, applies_to_stages, sort_order) VALUES
('Bargaining table tactics', 'Strategies and tactics at the formal bargaining table', ARRAY[7,8,9,10,11], 1),
('Workplace floor mobilisation', 'Actions on the platform floor and swing cycles', ARRAY[7,8,9,10,11], 2),
('Regulator & maritime authority interface', 'Engagement with AMSA, NOPSEMA, FWC, Fair Work Ombudsman', ARRAY[8,9,10,11], 3),
('Public & political leverage', 'Media, parliamentary, peak body and community engagement', ARRAY[9,10,11], 4),
('Investor pressure campaigns', 'Shareholder, ESG reporting and institutional leverage', ARRAY[9,10,11], 5),
('Coalition & community support', 'Cross-union solidarity, CFMEU/AWU coordination, industry pattern', ARRAY[7,8,9,10,11], 6)
ON CONFLICT DO NOTHING;

-- ============================================================
-- WTP Options: Category 1 - Bargaining Table Tactics (Stages 7-11)
-- ============================================================

INSERT INTO wtp_options (category_id, option_text, description) VALUES
-- Stage 7-11 (all bargaining stages)
((SELECT category_id FROM wtp_categories WHERE category_name = 'Bargaining table tactics'),
 'Direct negotiation with employer delegates at formal bargaining table',
 'Core bargaining table conduct with nominated employer representatives'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Bargaining table tactics'),
 'Maintain living log of all claims prioritisation and movement',
 'Systematic tracking of each claim: status, employer response, worker priority ranking'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Bargaining table tactics'),
 'Develop counter-proposal strategy for employer offers',
 'Prepared responses to each employer counter-offer, member-tested rationale'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Bargaining table tactics'),
 'Reference protected action threat during negotiations',
 'Strategic use of PABO pathway awareness as negotiation leverage'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Bargaining table tactics'),
 'Deploy precedent-setting arguments from prior OA campaigns',
 'Reference historical EBA outcomes and industry benchmarks to support claims'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Bargaining table tactics'),
 'Nominate industry expert(s) to advise bargaining reps',
 'External legal, technical or industrial relations expertise at the table'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Bargaining table tactics'),
 'Respond to employer claims of intractability with data',
 'Evidence-based counter-arguments to employer claims of unfeasibility'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Bargaining table tactics'),
 'Test settlement offers against key worker priorities',
 'Member consultation and ratification-readiness testing of possible deals'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Bargaining table tactics'),
 'Use FWC conciliation process strategically',
 'Initiate or defer conciliation to apply time pressure on employer'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Bargaining table tactics'),
 'Document all employer proposals in plain language for member communication',
 'Accessible summary of each employer move for rank-and-file briefing')
ON CONFLICT DO NOTHING;

-- ============================================================
-- WTP Options: Category 2 - Workplace Floor (Stages 7-11)
-- ============================================================

INSERT INTO wtp_options (category_id, option_text, description) VALUES
-- Workplace floor mobilisation
((SELECT category_id FROM wtp_categories WHERE category_name = 'Workplace floor mobilisation'),
 'Mobilise delegates to organise conversations during swing cycles',
 'Delegate-led outreach on assigned platforms during swing rotations'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Workplace floor mobilisation'),
 'Secure helideck and platform access for union representatives',
 'Negotiated or assertive access for union officials during crew changes'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Workplace floor mobilisation'),
 'Align workplace organising committee cycle with swing rosters',
 'Synchronise WOC meetings to platform day cycles and crew rotation windows'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Workplace floor mobilisation'),
 'Use bulletin board and display space on platforms for bargaining updates',
 'Posted notices, daily updates and campaign materials in POB and common areas'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Workplace floor mobilisation'),
 'Secure toolbox talk access for bargaining briefings',
 'Integration of bargaining updates into pre-shift toolbox meetings'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Workplace floor mobilisation'),
 'Recruit swing-roster coordinators on each platform',
 'Nominated contact person per swing cycle for cross-rotation continuity'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Workplace floor mobilisation'),
 'Establish platform-specific bargaining bulletin or email list',
 'Regular communications dedicated to bargaining progress per worksite'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Workplace floor mobilisation'),
 'Conduct hand-over briefings for incoming and outgoing shifts',
 'Structured briefing at shift changeover on bargaining developments'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Workplace floor mobilisation'),
 'Enable platform-floor discussion of test ballots before PABO',
 'Pre-strike action polling and discussion in workplace meetings')
ON CONFLICT DO NOTHING;

-- ============================================================
-- WTP Options: Category 3 - Regulator & Maritime Authority (Stages 8-11)
-- ============================================================

INSERT INTO wtp_options (category_id, option_text, description) VALUES
-- Regulator interface
((SELECT category_id FROM wtp_categories WHERE category_name = 'Regulator & maritime authority interface'),
 'File AMSA maritime incident reports for employer breaches',
 'Report safety or maritime law breaches to Australian Maritime Safety Authority'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Regulator & maritime authority interface'),
 'Notify NOPSEMA of operational impacts from industrial action',
 'Formal notification to offshore safety regulator of strike impact on platforms'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Regulator & maritime authority interface'),
 'Appear before FWC in conciliation or arbitration proceedings',
 'Use federal tribunal pathway for dispute resolution'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Regulator & maritime authority interface'),
 'Lodge Fair Work Ombudsman complaints for alleged breaches',
 'Report potential contraventions of Fair Work Act or Agreement'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Regulator & maritime authority interface'),
 'Request FWC declaration on dispute about claims reasonableness',
 'Formal application for federal arbitration on claims scope'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Regulator & maritime authority interface'),
 'Coordinate with ASIC on employer health and safety reporting',
 'Leverage ASX disclosure obligations for offshore safety breaches')
ON CONFLICT DO NOTHING;

-- ============================================================
-- WTP Options: Category 4 - Public & Political Leverage (Stages 9-11)
-- ============================================================

INSERT INTO wtp_options (category_id, option_text, description) VALUES
-- Public and political leverage
((SELECT category_id FROM wtp_categories WHERE category_name = 'Public & political leverage'),
 'Execute coordinated media strategy with news releases and media appearances',
 'Planned media engagements highlighting member demands and employer intransigence'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Public & political leverage'),
 'Brief WA State parliament members and shadow ministers on dispute',
 'In-parliament awareness and advocacy for offshore workers'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Public & political leverage'),
 'Engage resources sector peak bodies (CMEWA, Australian Petroleum)',
 'Formal communication with industry associations on industry pattern precedent'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Public & political leverage'),
 'Organise community solidarity events and worker rallies',
 'Public-facing events in Perth, Karratha or other onshore hubs'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Public & political leverage'),
 'Activate family networks for spouse/partner visibility campaigns',
 'Family members in community advocacy, online, and media'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Public & political leverage'),
 'Prepare detailed media backgrounders on FIFO hardship and offshore risks',
 'Factsheets and briefings on working conditions, fatigue, family impact'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Public & political leverage'),
 'Coordinate op-ed pieces and letters to editor from workers',
 'Worker testimonials in major news outlets'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Public & political leverage'),
 'Partner with CSOs on environmental and safety advocacy',
 'Joint campaigns with environmental or community safety groups')
ON CONFLICT DO NOTHING;

-- ============================================================
-- WTP Options: Category 5 - Investor Pressure (Stages 9-11)
-- ============================================================

INSERT INTO wtp_options (category_id, option_text, description) VALUES
-- Investor pressure
((SELECT category_id FROM wtp_categories WHERE category_name = 'Investor pressure campaigns'),
 'Engage sovereign wealth funds on ESG and labour standards',
 'Direct investor relations outreach on worker treatment and dispute'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Investor pressure campaigns'),
 'Leverage ASX ESG reporting obligations in shareholder engagement',
 'Formal investor letters citing ESG reporting requirements'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Investor pressure campaigns'),
 'Brief institutional shareholders on dispute and union demands',
 'Investor roadshow or email campaign to major shareholders'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Investor pressure campaigns'),
 'Coordinate with international labour and investor networks',
 'Global solidarity messaging from international unions or ethical investment groups'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Investor pressure campaigns'),
 'Monitor and report on operator ESG commitments vs. actual practice',
 'Public accountability messaging on greenwashing or labour standard breaches')
ON CONFLICT DO NOTHING;

-- ============================================================
-- WTP Options: Category 6 - Coalition & Community Support (Stages 7-11)
-- ============================================================

INSERT INTO wtp_options (category_id, option_text, description) VALUES
-- Coalition and community support
((SELECT category_id FROM wtp_categories WHERE category_name = 'Coalition & community support'),
 'Activate mutual aid protocols with other offshore union campaigns',
 'Coordination and solidarity with concurrent OA campaigns in other vessels/platforms'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Coalition & community support'),
 'Coordinate bargaining strategy with CFMEU and AWU affiliates',
 'Unified approach to industry-wide pattern bargaining'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Coalition & community support'),
 'Establish industry-wide pattern bargaining coalition',
 'Multi-employer, multi-union coordination for comparable outcomes'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Coalition & community support'),
 'Engage community unions network for mutual support actions',
 'Cross-union solidarity e.g., secondary picket support or joint media'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Coalition & community support'),
 'Mobilise community support networks in Perth and Karratha',
 'Local community groups and church-based support'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Coalition & community support'),
 'Coordinate with international maritime unions for global solidarity',
 'ITF or other international maritime union statements and support'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Coalition & community support'),
 'Recruit family-support volunteers for picket line sustainability',
 'Community members providing meals, logistics, morale support'),
((SELECT category_id FROM wtp_categories WHERE category_name = 'Coalition & community support'),
 'Partner with worker advocacy and support services (legal, financial)',
 'Pro-bono legal advice, hardship fund administration, union lawyers')
ON CONFLICT DO NOTHING;
