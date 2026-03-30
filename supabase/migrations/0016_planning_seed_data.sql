-- ============================================================
-- Seed Data: WTP Categories
-- ============================================================

INSERT INTO wtp_categories (category_name, description, applies_to_stages, sort_order) VALUES
('Potential Contacts', 'Who to focus organising contact efforts on', ARRAY[1,2,3,4,5], 1),
('Geographic / Worksite Focus', 'Which locations and worksites to prioritise', ARRAY[1,2,3,4,5], 2),
('Employer Focus', 'Which employers to focus on within the campaign scope', ARRAY[1,2,3,4,5], 3),
('Work Group / Sector Focus', 'Which trade, sector or work group to prioritise', ARRAY[1,2,3,4,5], 4),
('Narrative & Tone', 'What messaging approach and tone to use in communications', ARRAY[1,2,3,4,5,6], 5),
('Communication Platforms', 'Which channels to use for member and contact communications', ARRAY[1,2,3,4,5,6], 6),
('Contact Method Priority', 'How to make initial and ongoing contact with workers', ARRAY[1,2], 7),
('Education Content Focus', 'What workers need to learn and understand', ARRAY[2,3], 8),
('Engagement Intensity', 'How intensively to engage with different contact groups', ARRAY[2,3,4], 9),
('Mobilisation Tactics', 'Specific tactics to mobilise members into action', ARRAY[3,4,5,6], 10);

-- ============================================================
-- Seed Data: WTP Options
-- ============================================================

-- Category 1: Potential Contacts
INSERT INTO wtp_options (category_id, option_text, description) VALUES
(1, 'Existing members (current financial members)', 'Current financial AWU/MUA members covered by the agreement'),
(1, 'Members of other unions (AWU members on MUA site or vice versa)', 'Offshore Alliance cross-union members'),
(1, 'Lapsed members (resigned within last 2 years)', 'Former members who may be re-engaged'),
(1, 'Non-members — known contacts', 'Workers with existing contact details but not yet members'),
(1, 'Non-members — unknown (identified through mapping)', 'Workers identified through workplace mapping with no prior contact'),
(1, 'All workers on agreement scope', 'Full universe of workers covered by the enterprise agreement'),
(1, 'All marine workers', 'Marine deck officers and engineers'),
(1, 'All catering workers', 'Catering and hospitality workers on offshore sites'),
(1, 'Bargaining representatives', 'Formally nominated bargaining reps'),
(1, 'HSRs (Health & Safety Representatives)', 'Elected HSRs as key informal leaders'),
(1, 'Delegates', 'Union delegates and workplace contacts');

-- Category 5: Narrative & Tone
INSERT INTO wtp_options (category_id, option_text, description) VALUES
(5, 'Informative — explain the process, build understanding', 'Focus on educating workers about EBA process and timeline'),
(5, 'Urgency — agreement expiry approaching, time to act', 'Highlight the approaching expiry date as a call to action'),
(5, 'Shared responsibility — "your agreement, your fight"', 'Emphasise member ownership and collective responsibility'),
(5, 'Success story — reference previous wins', 'Use past OA campaign outcomes to build confidence'),
(5, 'Solidarity — collective power messaging', 'Emphasise strength in numbers and collective action'),
(5, 'Fairness — same job same pay, no blacklists', 'Focus on fairness and equity themes'),
(5, 'Worker voice — expanded delegate rights', 'Highlight rights to representation and participation'),
(5, 'Job security — no visa workers, no blacklists', 'Focus on job security and conditions protections');

-- Category 6: Communication Platforms
INSERT INTO wtp_options (category_id, option_text, description) VALUES
(6, 'Email (Action Network)', 'Mass email communications via Action Network'),
(6, 'SMS (Yabbr)', 'SMS messaging via Yabbr platform'),
(6, 'Phone calls (1-on-1)', 'Individual phone conversations with workers'),
(6, 'Face-to-face onsite visits', 'In-person visits during crew changes or onsite'),
(6, 'Group chat (WhatsApp)', 'WhatsApp group messaging for quick updates'),
(6, 'Workplace noticeboard', 'Physical notices posted in common areas'),
(6, 'Online meetings / webinars', 'Zoom or Teams sessions for member briefings'),
(6, 'Structured Organising Conversations (SOC)', 'Formal structured 1-on-1 organising conversations'),
(6, 'WOC (Workplace Organising Committee) meetings', 'Regular WOC meetings for member leadership');

-- Category 7: Contact Method Priority
INSERT INTO wtp_options (category_id, option_text, description) VALUES
(7, 'Cold outreach — email first, then SMS, then call', 'Sequential outreach starting with least intrusive channel'),
(7, 'Warm referral — existing member introduces organiser', 'Leverage existing member relationships for introductions'),
(7, 'Peer-to-peer — member-to-member contact', 'Members contact other workers directly'),
(7, 'Onsite visit — face-to-face during crew change', 'Direct contact during crew change periods'),
(7, 'Delegate/HSR introduction pathway', 'Use existing delegate or HSR to open conversations');

-- Category 8: Education Content Focus
INSERT INTO wtp_options (category_id, option_text, description) VALUES
(8, 'EBA process overview — what happens and when', 'Step-by-step explanation of the bargaining process'),
(8, 'Rights at work — right to organise, right to information', 'Legal rights under the Fair Work Act'),
(8, 'Shared responsibility framework — "want more, do more"', 'The OA model of member engagement and agency'),
(8, 'History of previous EBA outcomes', 'What the union has achieved in past campaigns'),
(8, 'Current agreement conditions vs industry benchmarks', 'Gap analysis between current and benchmark conditions'),
(8, 'Industrial action rights and PABO process', 'How protected action works and when it becomes available'),
(8, 'Role of bargaining reps and delegates', 'How to get involved in the bargaining process');

-- Category 9: Engagement Intensity
INSERT INTO wtp_options (category_id, option_text, description) VALUES
(9, 'High touch — multiple 1-on-1s, onsite presence every swing', 'Maximum engagement: onsite every rotation, individual conversations'),
(9, 'Medium touch — regular comms + targeted 1-on-1s with key contacts', 'Regular communications with deeper engagement for key contacts'),
(9, 'Low touch — broadcast comms with targeted follow-up for non-responders', 'Mass communications with follow-up only for key segments');

-- Category 10: Mobilisation Tactics
INSERT INTO wtp_options (category_id, option_text, description) VALUES
(10, 'Petition / open letter to employer', 'Collect signatures on a formal petition or open letter'),
(10, 'Worksite meetings (shift-by-shift)', 'Meetings with workers during shift changeovers'),
(10, 'Online survey / consultation', 'Digital survey to gauge member views and priorities'),
(10, 'Member-to-member phone tree', 'Coordinated network of members calling each other'),
(10, 'Delegate-led crew conversations', 'Structured conversations led by trained delegates'),
(10, 'Social media campaign', 'Public social media advocacy alongside member communications'),
(10, 'Community / media engagement', 'Media releases and community stakeholder engagement'),
(10, 'Solidarity actions with other OA campaigns', 'Coordination with other active OA campaigns for mutual support');

-- ============================================================
-- Seed Data: Ambition Options — Stage 1: Contact ID & Mapping
-- ============================================================

INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(1, 'contact_targets', 'Identify {target_value} potential contacts on site', TRUE, 'Number of contacts', 'number'),
(1, 'contact_targets', 'Contact {target_value}% of known members on site', TRUE, 'Percentage', 'percentage'),
(1, 'contact_targets', 'Obtain verified name, phone and email for {target_value}% of identified contacts', TRUE, 'Percentage', 'percentage'),
(1, 'membership_growth', 'Identify {target_value} non-members for recruitment conversations', TRUE, 'Number', 'number'),
(1, 'mapping', 'Complete workplace map for {target_value} worksites/vessels', TRUE, 'Number', 'number'),
(1, 'mapping', 'Map all crew rotations and swing patterns for target worksite', FALSE, NULL, NULL),
(1, 'mapping', 'Identify key informal leaders in {target_value} work groups', TRUE, 'Number', 'number'),
(1, 'engagement', 'Achieve {target_value}% response rate to initial contact communication', TRUE, 'Percentage', 'percentage'),
(1, 'engagement', 'Conduct 1-on-1 structured conversations with {target_value}% of identified contacts', TRUE, 'Percentage', 'percentage'),
(1, 'timeline', 'Complete Stage 1 within {target_value} weeks', TRUE, 'Weeks', 'number');

-- ============================================================
-- Ambition Options — Stage 2: Intro Comms & Education
-- ============================================================

INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(2, 'engagement', 'Achieve {target_value}% open rate on intro comms', TRUE, 'Percentage', 'percentage'),
(2, 'engagement', 'Conduct education sessions with {target_value}% of contacts', TRUE, 'Percentage', 'percentage'),
(2, 'engagement', 'Get {target_value}% of contacts to confirm shared responsibility commitment', TRUE, 'Percentage', 'percentage'),
(2, 'recruitment', 'Recruit {target_value} new members from non-member contacts', TRUE, 'Number', 'number'),
(2, 'education', 'Run {target_value} online or onsite information sessions', TRUE, 'Number', 'number'),
(2, 'education', 'Brief {target_value}% of contacts on EBA process and timeline', TRUE, 'Percentage', 'percentage'),
(2, 'structure', 'Identify {target_value} potential WOC/delegate candidates', TRUE, 'Number', 'number'),
(2, 'structure', 'Establish WOC on {target_value} worksites', TRUE, 'Number', 'number'),
(2, 'timeline', 'Complete Stage 2 within {target_value} weeks', TRUE, 'Weeks', 'number');

-- ============================================================
-- Ambition Options — Stage 3: Member Mobilisation
-- ============================================================

INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(3, 'mobilisation', 'Achieve {target_value}% participation in Log of Claims survey', TRUE, 'Percentage', 'percentage'),
(3, 'mobilisation', 'Get {target_value}% of members to complete a specific action/task', TRUE, 'Percentage', 'percentage'),
(3, 'leadership', 'Establish {target_value} active WOCs across worksites', TRUE, 'Number', 'number'),
(3, 'leadership', 'Train {target_value} members in structured organising conversations', TRUE, 'Number', 'number'),
(3, 'action_readiness', '{target_value}% of members indicate willingness to take industrial action', TRUE, 'Percentage', 'percentage'),
(3, 'recruitment', 'Achieve {target_value}% membership density on target agreement scope', TRUE, 'Percentage', 'percentage'),
(3, 'timeline', 'Complete Stage 3 within {target_value} weeks', TRUE, 'Weeks', 'number');

-- ============================================================
-- Ambition Options — Stage 4: Develop Claims / MSD
-- ============================================================

INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(4, 'claims', 'Develop and endorse Log of Claims with {target_value}% member participation', TRUE, 'Percentage', 'percentage'),
(4, 'claims', 'Achieve {target_value}% member endorsement of final claims', TRUE, 'Percentage', 'percentage'),
(4, 'msd', 'Achieve MSD with {target_value}%+ support (HARD GATE: minimum 50%)', TRUE, 'Percentage', 'percentage'),
(4, 'bargaining_prep', 'Nominate {target_value} bargaining representatives', TRUE, 'Number', 'number'),
(4, 'bargaining_prep', 'Brief all bargaining reps on claims, strategy and process', FALSE, NULL, NULL),
(4, 'action_readiness', 'Achieve strike-ready assessment score of {target_value}%', TRUE, 'Percentage', 'percentage'),
(4, 'timeline', 'Complete Stage 4 within {target_value} weeks', TRUE, 'Weeks', 'number');

-- ============================================================
-- Ambition Options — Stage 5: Endorsement & Commence Bargaining
-- ============================================================

INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(5, 'bargaining', 'Commence formal bargaining within {target_value} weeks of Gate 4', TRUE, 'Weeks', 'number'),
(5, 'bargaining', 'Issue NERR (Notice of Employee Representational Rights) by {target_value}', TRUE, 'Target date', 'date'),
(5, 'engagement', 'Maintain {target_value}% member engagement through bargaining commencement', TRUE, 'Percentage', 'percentage'),
(5, 'action_readiness', 'Confirm strike readiness at {target_value}%', TRUE, 'Percentage', 'percentage'),
(5, 'timeline', 'Complete Stage 5 within {target_value} weeks', TRUE, 'Weeks', 'number');

-- ============================================================
-- Ambition Options — Stage 6: Bargaining to Win
-- ============================================================

INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(6, 'outcome', 'Achieve agreement with CPI+ wage increase', FALSE, NULL, NULL),
(6, 'outcome', 'Achieve benchmark pay conditions for this agreement', FALSE, NULL, NULL),
(6, 'outcome', 'Close gap to benchmark EBA to within {target_value}%', TRUE, 'Percentage', 'percentage'),
(6, 'action', 'Maintain strike readiness at {target_value}% throughout bargaining', TRUE, 'Percentage', 'percentage'),
(6, 'action', 'Complete PABO application within {target_value} days of No vote', TRUE, 'Days', 'number'),
(6, 'engagement', 'Maintain {target_value}% member engagement through full bargaining period', TRUE, 'Percentage', 'percentage'),
(6, 'protection', 'Avoid intractable bargaining trap (9-month limit awareness)', FALSE, NULL, NULL),
(6, 'timeline', 'Target agreement settlement within {target_value} weeks of commencing bargaining', TRUE, 'Weeks', 'number');

-- ============================================================
-- Seed Data: Capacity Options — Stage 1
-- ============================================================

INSERT INTO capacity_options (stage_number, category, option_text, description, linked_wtp_categories) VALUES
(1, 'data_systems', 'Membership database access', 'Access to AWU/MUA membership database', ARRAY[1]),
(1, 'data_systems', 'Contact tracking spreadsheet/system', 'System for tracking contact attempts and outcomes', ARRAY[1]),
(1, 'data_systems', 'Workplace mapping template', 'Template for recording worksite structure and key contacts', ARRAY[2]),
(1, 'comms_tools', 'Action Network (email) account & templates', 'Action Network account set up with email templates ready', ARRAY[6]),
(1, 'comms_tools', 'Yabbr (SMS) account & templates', 'Yabbr account set up with SMS templates ready', ARRAY[6]),
(1, 'comms_tools', 'Phone/call capacity', 'Organiser phone credit and time for individual calls', ARRAY[6]),
(1, 'organiser_skills', 'Structured Organising Conversation training', 'Organiser trained in SOC methodology', ARRAY[7]),
(1, 'organiser_skills', 'Workplace mapping skills', 'Organiser trained in workplace mapping techniques', ARRAY[2]),
(1, 'organiser_skills', '1-on-1 conversation skills', 'Training in individual worker engagement conversations', ARRAY[1]),
(1, 'materials', 'First contact email template', 'Professionally designed first contact email', ARRAY[6]),
(1, 'materials', 'Initial information pack / FAQ', 'Member-ready information pack about the campaign', ARRAY[5]),
(1, 'materials', 'Crew rotation schedules', 'Access to swing and rotation schedules for target worksites', ARRAY[2]),
(1, 'time', 'Organiser hours available per week', 'Confirmed organiser time allocation for this campaign', NULL),
(1, 'time', 'Estimated time for onsite visits', 'Travel and onsite time budgeted for site visits', ARRAY[2]);

-- Stages 2-6 capacity options (common)
INSERT INTO capacity_options (stage_number, category, option_text, description, linked_wtp_categories) VALUES
(2, 'data_systems', 'Education session registration system', 'System to track who attended information sessions', ARRAY[8]),
(2, 'comms_tools', 'Video conferencing platform (Zoom/Teams)', 'Platform for online member meetings and webinars', ARRAY[6]),
(2, 'materials', 'Education presentation deck', 'Slide deck for member information sessions', ARRAY[8]),
(2, 'materials', 'Rights at work factsheet', 'One-page summary of key worker rights', ARRAY[8]),
(2, 'organiser_skills', 'Group facilitation skills', 'Ability to run effective member meetings', ARRAY[9]),
(3, 'data_systems', 'Online survey tool (Survey Monkey / Typeform)', 'Survey platform for Log of Claims consultation', ARRAY[10]),
(3, 'materials', 'Log of Claims survey', 'Member survey to identify bargaining priorities', ARRAY[10]),
(3, 'organiser_skills', 'WOC facilitation training', 'Skills to establish and run WOC meetings', ARRAY[9]),
(3, 'member_platforms', 'WOC meeting structure/agenda template', 'Template for running effective WOC meetings', ARRAY[10]),
(4, 'data_systems', 'MSD eligibility tracking', 'System to track and verify MSD-eligible members', NULL),
(4, 'materials', 'Log of Claims document', 'Formal Log of Claims document', NULL),
(4, 'organiser_skills', 'MSD application skills', 'Knowledge of how to prepare and file MSD application', NULL),
(5, 'comms_tools', 'Bargaining communications system', 'Secure channel for bargaining updates to members', ARRAY[6]),
(5, 'materials', 'NERR template', 'Notice of Employee Representational Rights template', NULL),
(5, 'organiser_skills', 'Bargaining process knowledge', 'Understanding of formal bargaining procedures', NULL),
(6, 'materials', 'Strike action materials', 'Picket line materials, strike FAQ, member guides', ARRAY[10]),
(6, 'organiser_skills', 'PABO application knowledge', 'Knowledge of Protected Action Ballot Order process', NULL),
(6, 'data_systems', 'Member voting/ballot system', 'Secure system for member ballots on IA and agreements', NULL);

-- ============================================================
-- Seed Data: Management System Options
-- ============================================================

INSERT INTO management_system_options (stage_number, category, option_text, description, default_frequency) VALUES
(1, 'meeting_rhythms', 'Team check-in meeting', 'Regular team meeting to review progress and plan work', 'weekly'),
(1, 'meeting_rhythms', 'Lead organiser review', 'One-on-one review with lead organiser', 'fortnightly'),
(1, 'meeting_rhythms', 'Coordinator campaign review', 'Campaign review meeting with coordinator', 'monthly'),
(1, 'reporting_tools', 'Contact tracking report', 'Report on contact attempts and outcomes this period', 'weekly'),
(1, 'reporting_tools', 'Mapping progress report', 'Update on workplace mapping completion', 'weekly'),
(1, 'reporting_tools', 'Gate 1 readiness dashboard', 'Current status against Gate 1 criteria', 'weekly'),
(1, 'tracking_systems', 'Conversation log/report', 'Log of all organising conversations conducted', 'daily'),
(1, 'tracking_systems', 'New contact register', 'Register of new contacts identified', 'daily'),
(1, 'communication_schedules', 'Member update/bulletin', 'Regular update email or SMS to all known contacts', 'fortnightly'),
(1, 'accountability', 'Task allocation register (WOC-style)', 'Register of who is doing what by when', 'weekly'),
(1, 'accountability', 'Organiser activity log', 'Individual organiser activity record', 'daily'),
(2, 'meeting_rhythms', 'Education session debrief', 'Post-session review of education session outcomes', 'as_needed'),
(2, 'meeting_rhythms', 'WOC establishment review', 'Review of progress establishing WOCs on key sites', 'fortnightly'),
(2, 'reporting_tools', 'Education participation tracker', 'Tracking of who has attended education sessions', 'weekly'),
(2, 'reporting_tools', 'Shared responsibility commitment tracker', 'Tracking of member commitments made', 'weekly'),
(3, 'meeting_rhythms', 'WOC meeting schedule', 'Regular WOC meetings across all key worksites', 'weekly'),
(3, 'reporting_tools', 'Mobilisation action tracker', 'Tracking of member actions completed', 'weekly'),
(3, 'reporting_tools', 'Survey participation tracker', 'Log of Claims survey completion rates', 'weekly'),
(3, 'tracking_systems', 'Strike readiness indicator', 'Running indicator of member IA willingness', 'weekly'),
(4, 'meeting_rhythms', 'Bargaining rep meetings', 'Regular meetings with nominated bargaining reps', 'weekly'),
(4, 'reporting_tools', 'MSD progress report', 'Status of MSD signatures/support', 'daily'),
(4, 'reporting_tools', 'Claims endorsement tracker', 'Tracking of Log of Claims endorsement rates', 'weekly'),
(5, 'meeting_rhythms', 'Pre-bargaining briefing sessions', 'Member briefings ahead of first bargaining meeting', 'as_needed'),
(5, 'reporting_tools', 'Bargaining update communications', 'Regular updates to all members on bargaining progress', 'weekly'),
(6, 'meeting_rhythms', 'Post-round debrief', 'Internal debrief after each bargaining round', 'as_needed'),
(6, 'reporting_tools', 'Member strike readiness check', 'Ongoing check of member readiness for IA', 'weekly'),
(6, 'communication_schedules', 'Bargaining bulletin', 'Regular member update on bargaining status', 'weekly'),
(6, 'accountability', 'PABO timeline tracker', 'Tracking against PABO application deadlines', 'daily');
