-- ============================================================
-- Migration 20260519130000: Phase 2 Ambition Options
-- Bargaining to Win (Stages 7-11) Ambition Templates
-- ============================================================

-- ============================================================
-- Stage 7: Bargaining Commences - Ambition Options
-- ============================================================

-- Industrial Outcomes
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(7, 'industrial_outcomes', 'Nominate {N}% of delegates trained on bargaining table rights', TRUE, 'Percentage', 'percentage'),
(7, 'industrial_outcomes', 'Issue Log of Claims to employer by {target_date}', TRUE, 'Target date', 'date'),
(7, 'industrial_outcomes', 'Achieve {N}% member endorsement of union bargaining strategy', TRUE, 'Percentage', 'percentage'),
(7, 'industrial_outcomes', 'Ensure {N}% of eligible workers receive Log of Claims summary document', TRUE, 'Percentage', 'percentage'),
(7, 'industrial_outcomes', 'Complete pre-bargaining employer research dossier with {N} key vulnerabilities identified', TRUE, 'Number', 'number'),
(7, 'industrial_outcomes', 'Confirm FWC conciliation date within {N} weeks', TRUE, 'Weeks', 'number');

-- Activism
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(7, 'activism', 'Establish or activate WOCs on {N}% of target platforms', TRUE, 'Percentage', 'percentage'),
(7, 'activism', 'Train {N} members in bargaining briefing and delegate mentoring', TRUE, 'Number', 'number'),
(7, 'activism', 'Conduct Log of Claims bargaining conversations with {N}% of members', TRUE, 'Percentage', 'percentage'),
(7, 'activism', 'Recruit {N} volunteer activists for bargaining phase roles', TRUE, 'Number', 'number'),
(7, 'activism', 'Run {N} bargaining readiness information sessions onsite or virtual', TRUE, 'Number', 'number');

-- Member Leaders
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(7, 'member_leaders', 'Nominate {{N}} bargaining delegates across platforms', TRUE, 'Number', 'number'),
(7, 'member_leaders', 'Brief {{N}}% of identified delegates on bargaining strategy and Fair Work rights', TRUE, 'Percentage', 'percentage'),
(7, 'member_leaders', 'Establish strike committee skeleton team with {{N}} members', TRUE, 'Number', 'number'),
(7, 'member_leaders', 'Identify {{N}} potential picket marshals and volunteer coordinators', TRUE, 'Number', 'number');

-- Membership
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(7, 'membership', 'Maintain {{N}}% membership density through bargaining commencement', TRUE, 'Percentage', 'percentage'),
(7, 'membership', 'Achieve {{N}}% engagement rate (opened, read or discussed Log of Claims)', TRUE, 'Percentage', 'percentage'),
(7, 'membership', 'Respond to {{N}}% of member questions about bargaining on first contact', TRUE, 'Percentage', 'percentage');

-- ============================================================
-- Stage 8: Testing the Employer - Ambition Options
-- ============================================================

-- Industrial Outcomes
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(8, 'industrial_outcomes', 'Complete {N} bargaining rounds by target date', TRUE, 'Number', 'number'),
(8, 'industrial_outcomes', 'Analyse {N} employer counter-proposals and brief members within 48 hours', TRUE, 'Number', 'number'),
(8, 'industrial_outcomes', 'Identify {N} intractable claims early (likely blocker to settlement)', TRUE, 'Number', 'number'),
(8, 'industrial_outcomes', 'Identify {N} claims where employer has signalled flexibility or movement', TRUE, 'Number', 'number'),
(8, 'industrial_outcomes', 'Test settlement scenario: if deal reached on current offers, {N}% of members would accept', TRUE, 'Percentage', 'percentage'),
(8, 'industrial_outcomes', 'Assess employer willingness: {N}% confidence employer willing to move to acceptable settlement', TRUE, 'Percentage', 'percentage');

-- Activism
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(8, 'activism', 'Conduct {N} member consultation forums on employer offers', TRUE, 'Number', 'number'),
(8, 'activism', 'Mobilise {N}% of members to submit written feedback on employer counter-proposals', TRUE, 'Percentage', 'percentage'),
(8, 'activism', 'Hold {{N}} WOC meetings exclusively focused on employer response mapping', TRUE, 'Number', 'number'),
(8, 'activism', 'Brief {{N}}% of swing-roster crews on employer moves via crew conversations', TRUE, 'Percentage', 'percentage');

-- Member Leaders
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(8, 'member_leaders', 'Confirm {{N}}% of delegates remain actively engaged in bargaining process', TRUE, 'Percentage', 'percentage'),
(8, 'member_leaders', 'Identify and mentor {{N}} emerging leaders for potential strike committee roles', TRUE, 'Number', 'number'),
(8, 'member_leaders', 'Ensure {{N}}% of WOC members can articulate union position on intractable claims', TRUE, 'Percentage', 'percentage');

-- Membership
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(8, 'membership', 'Maintain {{N}}% of members actively engaged (attendance at WOC or consultation)', TRUE, 'Percentage', 'percentage'),
(8, 'membership', 'Achieve {{N}}% member satisfaction with union transparency on employer moves', TRUE, 'Percentage', 'percentage'),
(8, 'membership', 'Reach {{N}}% of members with employer counter-proposal briefing within 72 hours', TRUE, 'Percentage', 'percentage');

-- ============================================================
-- Stage 9: Strength Assessment & Member Mobilisation - Ambition Options
-- ============================================================

-- Industrial Outcomes
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(9, 'industrial_outcomes', '{N}% of workers declare strike-readiness in formal assessment', TRUE, 'Percentage', 'percentage'),
(9, 'industrial_outcomes', 'Assess hardship impact: {N}% of members can sustain strike of 2+ weeks', TRUE, 'Percentage', 'percentage'),
(9, 'industrial_outcomes', 'Identify {N} swing-roster scheduling innovations to enable strike participation', TRUE, 'Number', 'number'),
(9, 'industrial_outcomes', 'Secure hardship fund pledges totalling {N}% of estimated 2-week strike cost', TRUE, 'Percentage', 'percentage'),
(9, 'industrial_outcomes', 'Complete family impact briefing with {N}% of member families', TRUE, 'Percentage', 'percentage'),
(9, 'industrial_outcomes', 'Confirm {N} activated volunteers for strike action roles (marshal, comms, logistics)', TRUE, 'Number', 'number');

-- Activism
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(9, 'activism', 'Run {{N}} family briefing events (onsite and/or virtual)', TRUE, 'Number', 'number'),
(9, 'activism', 'Conduct {{N}}% of workers through formal strike readiness conversation', TRUE, 'Percentage', 'percentage'),
(9, 'activism', 'Identify and resolve {{N}} specific barriers to strike participation per member', TRUE, 'Number', 'number'),
(9, 'activism', 'Recruit and train {{N}} strike action volunteers (marshals, observers, comms)', TRUE, 'Number', 'number'),
(9, 'activism', 'Establish {{N}} hardship support networks or care-sharing for strike period', TRUE, 'Number', 'number');

-- Member Leaders
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(9, 'member_leaders', 'Convene strike committee with {{N}} members representing each platform', TRUE, 'Number', 'number'),
(9, 'member_leaders', 'Confirm {{N}}% of delegates publicly commit to strike action support', TRUE, 'Percentage', 'percentage'),
(9, 'member_leaders', 'Train {{N}} platform-level strike action coordinators on picket logistics', TRUE, 'Number', 'number'),
(9, 'member_leaders', 'Brief {{N}}% of key opinion leaders (HSRs, shift supervisors) on strike rationale', TRUE, 'Percentage', 'percentage');

-- Membership
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(9, 'membership', 'Achieve {{N}}% membership strike-readiness score in final assessment', TRUE, 'Percentage', 'percentage'),
(9, 'membership', 'Ensure {{N}}% of members have discussed strike impact with family', TRUE, 'Percentage', 'percentage'),
(9, 'membership', 'Build {{N}}% confidence among members in union ability to win through bargaining', TRUE, 'Percentage', 'percentage'),
(9, 'membership', 'Retain {{N}}% of members in union during peak mobilisation phase', TRUE, 'Percentage', 'percentage');

-- ============================================================
-- Stage 10: Protected Action Ballot (PABO) - Ambition Options
-- ============================================================

-- Industrial Outcomes
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(10, 'industrial_outcomes', 'Achieve {{N}}% endorsement of PABO at ballot (yes vote threshold met)', TRUE, 'Percentage', 'percentage'),
(10, 'industrial_outcomes', 'Initiate protected action within {target_date} of PABO approval', TRUE, 'Target date', 'date'),
(10, 'industrial_outcomes', 'Achieve {{N}}% participation in initial 4-hour work stoppage', TRUE, 'Percentage', 'percentage'),
(10, 'industrial_outcomes', 'Achieve {{N}}% participation in 24-hour work stoppage', TRUE, 'Percentage', 'percentage'),
(10, 'industrial_outcomes', 'Maintain swing-roster stoppage participation {{N}} consecutive swing cycles', TRUE, 'Number', 'number'),
(10, 'industrial_outcomes', 'Maintain helideck ban for {{N}} consecutive days', TRUE, 'Number', 'number'),
(10, 'industrial_outcomes', 'Achieve settlement agreement within {{N}} days of first action', TRUE, 'Number', 'number'),
(10, 'industrial_outcomes', 'Limit legal incidents (arrests, injunctions, etc.) to {{N}} or fewer', TRUE, 'Number', 'number'),
(10, 'industrial_outcomes', 'Complete all PABO legal requirements (notice, ballot, certification) by {{target_date}}', TRUE, 'Target date', 'date');

-- Activism
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(10, 'activism', 'Mobilise {{N}}% of eligible members to vote in PABO ballot', TRUE, 'Percentage', 'percentage'),
(10, 'activism', 'Coordinate {{N}} daily picket actions across all target platforms', TRUE, 'Number', 'number'),
(10, 'activism', 'Maintain picket presence with {{N}} average volunteers per platform daily', TRUE, 'Number', 'number'),
(10, 'activism', 'Run {{N}} media outreach actions (press releases, interviews, social campaigns)', TRUE, 'Number', 'number'),
(10, 'activism', 'Organise {{N}} solidarity actions with other unions or community groups', TRUE, 'Number', 'number'),
(10, 'activism', 'Train {{N}}% of strike participants on legal rights and picket conduct', TRUE, 'Percentage', 'percentage');

-- Member Leaders
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(10, 'member_leaders', 'Deploy {{N}} picket marshals across all action sites', TRUE, 'Number', 'number'),
(10, 'member_leaders', 'Maintain {{N}}% attendance by key delegates at daily coordination meetings', TRUE, 'Percentage', 'percentage'),
(10, 'member_leaders', 'Confirm {{N}} volunteer activists remain active throughout action period', TRUE, 'Number', 'number'),
(10, 'member_leaders', 'Enable {{N}} platform-based strike coordinators to function independently', TRUE, 'Number', 'number');

-- Membership
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(10, 'membership', 'Maintain {{N}}% morale and confidence in membership through action period', TRUE, 'Percentage', 'percentage'),
(10, 'membership', 'Distribute hardship fund to {{N}}% of eligible striking workers within 5 business days', TRUE, 'Percentage', 'percentage'),
(10, 'membership', 'Reach {{N}}% of members with daily strike updates and logistics comms', TRUE, 'Percentage', 'percentage'),
(10, 'membership', 'Retain {{N}}% membership throughout protected action period', TRUE, 'Percentage', 'percentage'),
(10, 'membership', 'Achieve {{N}}% satisfaction with strike-phase union communication and support', TRUE, 'Percentage', 'percentage');

-- ============================================================
-- Stage 11: Settlement & Post-EBA - Ambition Options
-- ============================================================

-- Industrial Outcomes
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(11, 'industrial_outcomes', 'Achieve settlement agreement by {{target_date}}', TRUE, 'Target date', 'date'),
(11, 'industrial_outcomes', 'Achieve {{N}}% YES vote on final settlement in ratification ballot', TRUE, 'Percentage', 'percentage'),
(11, 'industrial_outcomes', 'Achieve {{N}}% of eligible voters participating in ratification ballot', TRUE, 'Percentage', 'percentage'),
(11, 'industrial_outcomes', 'Secure CPI+ wage increase in final agreement', FALSE, NULL, NULL),
(11, 'industrial_outcomes', 'Close gap to industry benchmark by {{N}}% in final agreement', TRUE, 'Percentage', 'percentage'),
(11, 'industrial_outcomes', 'Notify {{N}}% of workforce of EBA outcome within 48 hours of settlement', TRUE, 'Percentage', 'percentage'),
(11, 'industrial_outcomes', 'Complete post-EBA transition checklist (training, systems, grievance setup) by {{target_date}}', TRUE, 'Target date', 'date');

-- Activism
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(11, 'activism', 'Brief {{N}}% of members on settlement terms within 24 hours', TRUE, 'Percentage', 'percentage'),
(11, 'activism', 'Run {{N}} member information sessions explaining settlement rationale', TRUE, 'Number', 'number'),
(11, 'activism', 'Mobilise {{N}}% of members to vote in ratification ballot', TRUE, 'Percentage', 'percentage'),
(11, 'activism', 'Host {{N}} celebration and thank-you events for activists and community', TRUE, 'Number', 'number'),
(11, 'activism', 'Conduct {{N}} post-campaign debrief and lessons-learned sessions', TRUE, 'Number', 'number');

-- Member Leaders
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(11, 'member_leaders', 'Train {{N}}% of delegates on new EBA terms and procedures by {{target_date}}', TRUE, 'Percentage', 'percentage'),
(11, 'member_leaders', 'Brief {{N}} strike action volunteers on transition to normal operations', TRUE, 'Number', 'number'),
(11, 'member_leaders', 'Confirm {{N}}% of WOC members actively involved in post-EBA compliance role', TRUE, 'Percentage', 'percentage'),
(11, 'member_leaders', 'Establish {{N}} new delegates trained on grievance procedures', TRUE, 'Number', 'number');

-- Membership
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(11, 'membership', 'Achieve {{N}}% member satisfaction with settlement outcome', TRUE, 'Percentage', 'percentage'),
(11, 'membership', 'Retain {{N}}% membership post-settlement', TRUE, 'Percentage', 'percentage'),
(11, 'membership', 'Increase {{N}}% of members reporting understanding of new EBA terms', TRUE, 'Percentage', 'percentage'),
(11, 'membership', 'Achieve {{N}}% increase in membership density through EBA implementation', TRUE, 'Percentage', 'percentage'),
(11, 'membership', 'Build {{N}}% confidence in membership that OA "delivers wins"', TRUE, 'Percentage', 'percentage');

-- ============================================================
-- Cross-Stage Ambition Options (All Bargaining Stages 7-11)
-- ============================================================

-- Communication and Information Sharing (all stages)
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(7, 'activism', 'Achieve {{N}}% open rate on weekly bargaining update emails', TRUE, 'Percentage', 'percentage'),
(8, 'activism', 'Reach {{N}}% of members with post-round employer offer briefing', TRUE, 'Percentage', 'percentage'),
(9, 'activism', 'Achieve {{N}}% engagement rate on strike readiness campaign messages', TRUE, 'Percentage', 'percentage'),
(10, 'activism', 'Deliver daily strike briefings to {{N}}% of active participants', TRUE, 'Percentage', 'percentage'),
(11, 'activism', 'Reach {{N}}% of members with settlement announcement message', TRUE, 'Percentage', 'percentage');

-- Delegate Engagement (all stages)
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(7, 'member_leaders', 'Achieve {{N}}% attendance by delegates at weekly briefings', TRUE, 'Percentage', 'percentage'),
(8, 'member_leaders', 'Achieve {{N}}% delegate attendance at urgent consultation meetings', TRUE, 'Percentage', 'percentage'),
(9, 'member_leaders', 'Recruit {{N}}% of WOC members into strike action volunteer roles', TRUE, 'Percentage', 'percentage'),
(10, 'member_leaders', 'Maintain {{N}}% delegate engagement through peak action period', TRUE, 'Percentage', 'percentage'),
(11, 'member_leaders', 'Achieve {{N}}% delegate attendance at post-EBA transition training', TRUE, 'Percentage', 'percentage');

-- Membership Density and Retention (all stages)
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(7, 'membership', 'Recruit {{N}} new members during bargaining commencement', TRUE, 'Number', 'number'),
(8, 'membership', 'Maintain or grow membership by {{N}}% despite employer counter-campaign', TRUE, 'Percentage', 'percentage'),
(9, 'membership', 'Prevent {{N}}% or more of membership loss during strike mobilisation', TRUE, 'Percentage', 'percentage'),
(10, 'membership', 'Recruit {{N}} sympathetic workers to union during protected action', TRUE, 'Number', 'number'),
(11, 'membership', 'Achieve {{N}} net new members post-EBA from non-members during campaign', TRUE, 'Number', 'number');
