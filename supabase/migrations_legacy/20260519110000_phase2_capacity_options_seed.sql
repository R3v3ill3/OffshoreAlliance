-- ============================================================
-- Migration 20260519110000: Phase 2 Capacity Options
-- Bargaining to Win (Stages 7-11) Capacity & Resource Options
-- ============================================================

-- ============================================================
-- Stage 7: Bargaining Commences - Capacity Options
-- ============================================================

INSERT INTO capacity_options (stage_number, category, option_text, description, linked_wtp_categories) VALUES
(7, 'organiser_skills', 'Bargaining process knowledge and Fair Work Act',
 'Organisers trained in formal bargaining procedures and legal framework', ARRAY[1]),
(7, 'organiser_skills', 'Structured organising conversation training for bargaining context',
 'SOC methodology adapted for pre-bargaining claim framing and member testing', ARRAY[1,2]),
(7, 'organiser_skills', 'Delegate briefing and mentoring capability',
 'Ability to train and coach nominated bargaining representatives', ARRAY[1,2]),
(7, 'materials', 'Bargaining delegate briefing pack',
 'Comprehensive guide: claims, rationale, strategy, table protocol, employer background', ARRAY[1]),
(7, 'materials', 'Log of Claims summary document for members',
 'Plain language summary of all claims for rank-and-file distribution', ARRAY[1,2]),
(7, 'materials', 'Bargaining FAQ and FAQ update templates',
 'FAQ addressing common member questions; templated updates for changes', ARRAY[1,2]),
(7, 'comms_tools', 'Bargaining update newsletter system',
 'Platform for regular bargaining bulletins: email, SMS, poster templates', ARRAY[1,2]),
(7, 'comms_tools', 'Secure comms channel for sensitive bargaining info',
 'Signal, encrypted email or similar for confidential table updates to WOCs', ARRAY[1]),
(7, 'data_systems', 'Bargaining delegate tracking system',
 'Database: delegate names, worksites, contact details, rotation schedule', ARRAY[1,2]),
(7, 'data_systems', 'Claims log and movement tracker',
 'Spreadsheet/system tracking each claim status, employer response, priority ranking', ARRAY[1]),
(7, 'materials', 'Employer background research dossier',
 'Company financials, past EBA comparisons, operational vulnerabilities', ARRAY[1]),
(7, 'time', 'Lead organiser time for pre-bargaining coordination',
 'Dedicated hours for delegate training, WOC briefings, table preparation', NULL),
(7, 'time', 'Administrative support for delegate coordination',
 'Support staff for scheduling, notes, comms distribution', NULL)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Stage 8: Testing the Employer - Capacity Options
-- ============================================================

INSERT INTO capacity_options (stage_number, category, option_text, description, linked_wtp_categories) VALUES
(8, 'organiser_skills', 'Counter-offer analysis and scenario mapping',
 'Ability to rapidly analyse employer proposals and model win/loss scenarios', ARRAY[1]),
(8, 'organiser_skills', 'Worker input on counter-offer acceptability',
 'Process for real-time member consultation on employer movement', ARRAY[1,2]),
(8, 'materials', 'Employer proposal tracking log',
 'Live document of each employer proposal: date, claims addressed, gaps, member verdict', ARRAY[1]),
(8, 'materials', 'Union counter-proposal templates',
 'Pre-prepared counter-offers for rapid iteration during bargaining', ARRAY[1]),
(8, 'data_systems', 'Intractable trap mapping spreadsheet',
 'Dashboard tracking time elapsed, claims gap, risk of 9-month limit', ARRAY[1]),
(8, 'comms_tools', 'Rapid response comms for bargaining rounds',
 'Template system for fast post-round member briefings', ARRAY[2]),
(8, 'time', 'Internal bargaining team debriefs',
 'Organiser time for post-round analysis and strategy revision', NULL)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Stage 9: Strength Assessment & Member Mobilisation - Capacity Options
-- ============================================================

INSERT INTO capacity_options (stage_number, category, option_text, description, linked_wtp_categories) VALUES
(9, 'organiser_skills', 'Strike readiness assessment methodology',
 'Training in assessing member willingness and identifying barriers to action', ARRAY[2]),
(9, 'organiser_skills', 'Family briefing and hardship consultation',
 'Ability to conduct sensitive conversations about strike impact and support', ARRAY[2,4]),
(9, 'organiser_skills', 'Strike action training and safety protocols',
 'Legal, safety, and conduct guidance for picket lines and work stoppages', ARRAY[2]),
(9, 'organiser_skills', 'Hardship fund administration',
 'Financial management and disbursement of member strike support funds', NULL),
(9, 'materials', 'Strike readiness survey instrument',
 'Online/paper survey: member appetite for industrial action by platform', ARRAY[2]),
(9, 'materials', 'Family briefing pack on strike preparation',
 'Guide for members explaining strike impact, timing, family support, finances', ARRAY[2,4]),
(9, 'materials', 'Strike action FAQ and member guides',
 'Q&A on legal protections, picket protocols, hardship fund access', ARRAY[2]),
(9, 'materials', 'Hardship fund policy and application templates',
 'Clear criteria, application form, payment schedule', NULL),
(9, 'data_systems', 'Strike readiness tracker by platform',
 'Spreadsheet tracking member willingness, confidence levels by worksite', ARRAY[2]),
(9, 'data_systems', 'Hardship fund recipient tracking',
 'Admin system for applications, approvals, payments', NULL),
(9, 'comms_tools', 'SMS alert system for rapid membership notifications',
 'Platform for 1000+ SMS delivery on short notice (e.g., "Action tomorrow")', ARRAY[2]),
(9, 'comms_tools', 'WhatsApp group setup and moderation',
 'Moderated groups for platform/shift-level rapid updates', ARRAY[2]),
(9, 'time', 'Organiser time for family briefing sessions',
 'Hours for onsite or virtual family information sessions', NULL),
(9, 'time', 'Paid-leave or hardship fund administration',
 'Staff time for fund management, approvals, disbursements', NULL)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Stage 10: Protected Action Ballot (PABO) - Capacity Options
-- ============================================================

INSERT INTO capacity_options (stage_number, category, option_text, description, linked_wtp_categories) VALUES
(10, 'organiser_skills', 'PABO application and legal compliance',
 'Expert knowledge of PABO process, AEC liaison, legal notice requirements', NULL),
(10, 'organiser_skills', 'Picket line coordination and safety management',
 'Training in picket protocols, police liaison, conflict de-escalation', ARRAY[2]),
(10, 'organiser_skills', 'Activist task list management',
 'Coordination of volunteer roles: picket marshals, comms, logistics', ARRAY[2]),
(10, 'organiser_skills', 'Offshore-specific strike action logistics',
 'Planning for strike impact on FIFO rosters, helicopter operations, emergency cover', ARRAY[2]),
(10, 'materials', 'PABO notice and legal documentation',
 'AEC-compliant PABO notice, ballot papers, AEC liaison file', NULL),
(10, 'materials', 'PIA notice and protected action declaration',
 'Notice of protected industrial action to employer and FWC', NULL),
(10, 'materials', 'Picket-line accountability roster',
 'Sign-in sheets, picket marshal assignment list, duty rotations', ARRAY[2]),
(10, 'materials', 'Activist task lists and volunteer briefings',
 'Role descriptions: marshal, comms, legal observer, logistics, welfare', ARRAY[2]),
(10, 'materials', 'Strike action legal guide for members',
 'Plain-language guide to legal protections, rights, and obligations', ARRAY[2]),
(10, 'materials', 'Daily strike briefing templates and signage',
 'Picket-line messaging, media statements, social media content', ARRAY[2]),
(10, 'data_systems', 'PABO ballot tracking and vote recording',
 'System for recording ballot outcomes, vote count, member lists', NULL),
(10, 'data_systems', 'PIA notice tracker and compliance dashboard',
 'Tracking against FWC timelines, notice periods, legal milestones', NULL),
(10, 'data_systems', 'Picket-line attendance and participation log',
 'Daily records of picket participation rates by platform', ARRAY[2]),
(10, 'comms_tools', 'Picket-line communications cadence (hourly/daily)',
 'Real-time updates: picketing schedule, legal news, logistics, morale', ARRAY[2]),
(10, 'comms_tools', 'Helicopter-day strike alert and coordination system',
 'Real-time comms for crew-change days to coordinate picket presence', ARRAY[2]),
(10, 'comms_tools', 'Social media rapid-response during action',
 'Managed accounts for strike updates, media engagement, solidarity posts', ARRAY[2,4]),
(10, 'comms_tools', 'Media liaison and press release distribution',
 'Dedicated comms person for journalist contact and daily releases', ARRAY[2,4]),
(10, 'member_platforms', 'Paid-leave and hardship fund during strike',
 'Confirmed hardship fund for losing income during unpaid work stoppages', NULL),
(10, 'member_platforms', 'Rolling roster cover and replacement protocols',
 'Coordination to avoid platform staffing shortfalls (safety critical ops)', ARRAY[2]),
(10, 'time', 'Full-time PABO coordinator and strike manager',
 'Dedicated staff managing ballots, logistics, legal compliance, daily ops', NULL),
(10, 'time', 'Picket line supervisors and site marshals',
 'Trained volunteers for multi-site picket coordination', NULL),
(10, 'time', 'Legal support and FWC liaison',
 'Lawyer time for AEC/FWC notifications, dispute resolution', NULL),
(10, 'time', 'Media and comms management during action',
 'Full-time comms staff for press, social, member updates', NULL)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Stage 11: Settlement & Post-EBA - Capacity Options
-- ============================================================

INSERT INTO capacity_options (stage_number, category, option_text, description, linked_wtp_categories) VALUES
(11, 'organiser_skills', 'Settlement agreement review and legal verification',
 'Ability to review final EBA terms against claims and advise members', NULL),
(11, 'organiser_skills', 'Ratification vote administration and counting',
 'Training in running secret ballots, vote counting, dispute resolution', NULL),
(11, 'organiser_skills', 'Post-EBA transition and implementation planning',
 'Organising for compliance monitoring, delegate training on new terms', NULL),
(11, 'materials', 'Settlement agreement summary document',
 'Plain-language summary of final EBA: what won, what lost, net outcome', NULL),
(11, 'materials', 'Ratification vote information pack',
 'Arguments for/against settlement, YES/NO ballot paper, voting instructions', NULL),
(11, 'materials', 'Post-EBA transition checklist',
 'Implementation plan: delegate training, claim tracking, grievance procedures', NULL),
(11, 'materials', 'Settlement ratification communications campaign',
 'Email, SMS, poster templates for final push before ratification vote', NULL),
(11, 'materials', 'Lessons-learned debrief template',
 'Post-campaign review: wins, lessons, member feedback on process', NULL),
(11, 'data_systems', 'Ratification vote administration system',
 'Ballot roll, voting records, dispute log, final tally', NULL),
(11, 'data_systems', 'Post-EBA implementation tracking',
 'Dashboard: delegate contact details, grievances logged, compliance issues', NULL),
(11, 'comms_tools', 'Post-EBA ratification communications',
 'Rapid deployment updates on outcome, next steps, celebration messaging', NULL),
(11, 'time', 'Legal review of final settlement',
 'Lawyer time to verify all terms and advise union', NULL),
(11, 'time', 'Ratification vote administration and counting',
 'Organiser time for ballot setup, voting, counting, dispute resolution', NULL),
(11, 'time', 'Post-EBA delegate training and transition',
 'Training on new agreement terms, grievance procedures, member communication', NULL)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Cross-Stage Capacity Options (All Bargaining Stages 7-11)
-- ============================================================

INSERT INTO capacity_options (stage_number, category, option_text, description, linked_wtp_categories) VALUES
(7, 'comms_tools', 'Email template library for bargaining updates',
 'Pre-designed email templates for different bargaining announcements', ARRAY[1,2]),
(7, 'comms_tools', 'Poster and printed materials for platforms',
 'Printed bargaining updates, claims summary, delegate contact info for POB', ARRAY[1,2]),
(7, 'comms_tools', 'Phone script for bargaining waves',
 'Script for organiser phone calls to update members on table progress', ARRAY[1,2]),
(8, 'comms_tools', 'Email template library for counter-offer analysis',
 'Plain-language breakdowns of employer proposals for member distribution', ARRAY[1]),
(8, 'comms_tools', 'Phone script for employer response briefings',
 'Script for 1-on-1 calls explaining employer movement and asking input', ARRAY[1,2]),
(9, 'comms_tools', 'Email campaign for family outreach',
 'Templates for separate messaging to worker families on strike planning', ARRAY[2,4]),
(9, 'comms_tools', 'Phone script for family hardship conversations',
 'Script for sensitively discussing financial impact and support options', ARRAY[2]),
(9, 'member_platforms', 'Structured organising conversation toolkit for bargaining',
 'SOC templates adapted for strike readiness conversations on platforms', ARRAY[2]),
(10, 'comms_tools', 'SMS alert templates during picket action',
 'Pre-written alert texts: "Picket active 6am-2pm", "Helicopter day alert", etc.', ARRAY[2]),
(10, 'member_platforms', 'Activist volunteer task list and briefing templates',
 'Role description sheets for marshal, legal observer, comms, welfare roles', ARRAY[2]),
(11, 'comms_tools', 'Email campaign for ratification voting push',
 'Sequence of emails building to vote, highlighting key wins from settlement', NULL)
ON CONFLICT DO NOTHING;
