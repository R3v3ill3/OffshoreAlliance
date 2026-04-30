-- ============================================================
-- Migration 20260519120000: Phase 2 Management System Options
-- Bargaining to Win (Stages 7-11) Management System Options
-- ============================================================

-- ============================================================
-- Stage 7: Bargaining Commences - Management Systems
-- ============================================================

INSERT INTO management_system_options (stage_number, category, option_text, description, default_frequency) VALUES
(7, 'meeting_rhythms', 'Bargaining delegate briefing meetings',
 'Weekly briefings for nominated bargaining representatives on table progress', 'weekly'),
(7, 'meeting_rhythms', 'Workplace organising committee meetings',
 'Regular WOC meetings to report on bargaining and maintain member engagement', 'weekly'),
(7, 'meeting_rhythms', 'Internal union bargaining team debriefs',
 'Post-round debriefs: analyse employer moves, plan responses, test member priorities', 'as_needed'),
(7, 'meeting_rhythms', 'Lead organiser coordination meeting',
 'Weekly check-in on campaign progress, issues, and strategy', 'weekly'),
(7, 'reporting_tools', 'Bargaining update newsletter',
 'Weekly bulletin to all members on table progress, claims status, next steps', 'weekly'),
(7, 'reporting_tools', 'Claims log tracking spreadsheet',
 'Live document: each claim, employer response, member priority, union position', 'daily'),
(7, 'reporting_tools', 'Bargaining timeline tracker',
 'Calendar showing bargaining round dates, expected timelines, gate milestones', 'weekly'),
(7, 'reporting_tools', 'Delegate engagement report',
 'Tracking delegate attendance, engagement, feedback, platform representation gaps', 'weekly'),
(7, 'tracking_systems', 'Delegate contact and accessibility log',
 'Updated list of all delegates, phone/email, swing rotation pattern', 'daily'),
(7, 'tracking_systems', 'Bargaining round agenda and notes',
 'Record of table discussions, employer positions, union responses, agreements', 'as_needed'),
(7, 'tracking_systems', 'Member communication sentiment tracker',
 'Log of member feedback: positive, concerns, requests, by platform', 'weekly'),
(7, 'accountability', 'Bargaining strategy task allocation',
 'Register: who is preparing what, by when (counter-proposals, member briefings)', 'weekly'),
(7, 'accountability', 'WOC effectiveness checklist',
 'Quality assurance: Are WOCs happening? Are updates reaching all platforms?', 'fortnightly')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Stage 8: Testing the Employer - Management Systems
-- ============================================================

INSERT INTO management_system_options (stage_number, category, option_text, description, default_frequency) VALUES
(8, 'meeting_rhythms', 'Post-round bargaining analysis meeting',
 'Rapid debrief after each round: what moved, risks, strategy implications', 'as_needed'),
(8, 'meeting_rhythms', 'Member consultation on employer offers',
 'Urgent consultations with WOCs, delegates, sample members on each new proposal', 'as_needed'),
(8, 'reporting_tools', 'Employer proposal tracking log',
 'Live record: each proposal date, claims covered, gaps, member verdict', 'daily'),
(8, 'reporting_tools', 'Intractable trap dashboard',
 'Calendar countdown: weeks elapsed, FWC conciliation progress, 9-month risk flag', 'weekly'),
(8, 'reporting_tools', 'Counter-offer analysis memo',
 'Plain-language breakdown of union response to each employer move', 'as_needed'),
(8, 'reporting_tools', 'Employer response pattern analysis',
 'Summary: which claims moving, which stalling, employer priorities appearing', 'weekly'),
(8, 'tracking_systems', 'Scenario mapping spreadsheet',
 'Modelled outcomes: if deal reached on these terms, what do members win/lose?', 'as_needed'),
(8, 'tracking_systems', 'Member feedback on proposals log',
 'Recording: what did members say about employer offer? Details per platform', 'daily'),
(8, 'accountability', 'Counter-proposal drafting task list',
 'Allocations: who is drafting response to claims 1-5, 6-10, etc.?', 'as_needed'),
(8, 'accountability', 'Timeline compliance tracker',
 'Are we on track for settlement by target date? Blockages or opportunities?', 'weekly')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Stage 9: Strength Assessment & Member Mobilisation - Management Systems
-- ============================================================

INSERT INTO management_system_options (stage_number, category, option_text, description, default_frequency) VALUES
(9, 'meeting_rhythms', 'Strike readiness assessment group discussions',
 'Small group conversations on platforms exploring IA appetite and barriers', 'weekly'),
(9, 'meeting_rhythms', 'Family briefing sessions (onsite/virtual)',
 'Information sessions for worker families on strike impact and support', 'as_needed'),
(9, 'meeting_rhythms', 'Strike committee formation meetings',
 'Election and briefing of strike action committee members', 'as_needed'),
(9, 'meeting_rhythms', 'Hardship fund review and approvals meeting',
 'Weekly review of hardship fund applications and approval decisions', 'weekly'),
(9, 'reporting_tools', 'Strike readiness survey results and platform breakdown',
 'Data dashboard: % ready to strike by platform, barriers, confidence levels', 'weekly'),
(9, 'reporting_tools', 'Member strike readiness tracker by worksite',
 'Detailed spreadsheet: which workers committed, unsure, or resistant?', 'daily'),
(9, 'reporting_tools', 'Hardship fund application log',
 'Intake, approvals, payment schedule, compliance tracking', 'daily'),
(9, 'reporting_tools', 'Family briefing attendance and feedback tracker',
 'Record who attended, feedback, remaining outreach needs', 'weekly'),
(9, 'reporting_tools', 'Bargaining update on intractability risk',
 'Alert if approaching 9-month limit or employer shows bad-faith stalling', 'weekly'),
(9, 'tracking_systems', 'Strike action legal and compliance checklist',
 'Preparation: have we briefed on rights? Secured legal support? Insurance?', 'weekly'),
(9, 'tracking_systems', 'Volunteer activist recruitment log',
 'Who has signed up for picket marshal, comms, logistics, legal observer roles?', 'daily'),
(9, 'accountability', 'Strike readiness improvement task list',
 'Actions to address barriers: more family briefings? Hardship fund publicity?', 'weekly'),
(9, 'accountability', 'Daily strike-readiness check',
 'Quick pulse: any members signaling change of heart? Any new barriers emerging?', 'daily')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Stage 10: Protected Action Ballot (PABO) - Management Systems
-- ============================================================

INSERT INTO management_system_options (stage_number, category, option_text, description, default_frequency) VALUES
(10, 'meeting_rhythms', 'Daily PABO and strike action coordination meeting',
 'Morning briefing: FWC updates, legal status, picket schedule, logistics', 'daily'),
(10, 'meeting_rhythms', 'Strike committee and organiser debriefs',
 'End-of-day review: picket turnout, incidents, tomorrow priorities, media', 'daily'),
(10, 'meeting_rhythms', 'Helicopter-day coordination call',
 'Real-time coordination for crew-change days: picket presence, safety, comms', 'as_needed'),
(10, 'meeting_rhythms', 'Legal and compliance review meetings',
 'Check against FWC orders, safety requirements, contract obligations daily', 'daily'),
(10, 'reporting_tools', 'PIA notice tracker and compliance dashboard',
 'Tracking against all FWC notice periods, protected action deadlines', 'daily'),
(10, 'reporting_tools', 'PABO ballot results and reconciliation',
 'Vote tally, reconciliation of ballot rolls, certification of outcome', 'as_needed'),
(10, 'reporting_tools', 'Daily picket-line participation and attendance log',
 'Tracking participation rates, no-shows, platform-by-platform numbers', 'daily'),
(10, 'reporting_tools', 'Strike action daily briefing bulletin',
 'Summary: picket activity, legal status, media coverage, logistics update', 'daily'),
(10, 'reporting_tools', 'Intractable bargaining trap escalation alert',
 'If still in dispute: risk of EFCA claim or further escalation', 'weekly'),
(10, 'reporting_tools', 'Hardship fund disbursement tracking',
 'Weekly payouts, balance remaining, eligibility verification', 'weekly'),
(10, 'reporting_tools', 'Media and social media activity log',
 'Daily record: media mentions, social posts, journalist contacts, sentiment', 'daily'),
(10, 'tracking_systems', 'Picket line marshals duty roster',
 'Scheduled assignments: who marshaling which platform, which shifts', 'daily'),
(10, 'tracking_systems', 'Legal incident log',
 'Record of arrests, police contact, workplace incidents, safety issues', 'daily'),
(10, 'tracking_systems', 'Activist volunteer task completion log',
 'Tracking: who is assigned what role, completion of tasks, handover notes', 'daily'),
(10, 'tracking_systems', 'FWC and legal correspondence log',
 'All letters, notices, orders from FWC, employer, safety regulator', 'daily'),
(10, 'accountability', 'Daily organiser activity assignment',
 'Who is managing pickets, media, legal, hardship fund, helicopter comms today?', 'daily'),
(10, 'accountability', 'Rolling roster cover tracking',
 'Safety-critical staffing: do we have contingency for emergency ops coverage?', 'daily'),
(10, 'accountability', 'Strike fund manager role and spending authority',
 'Hardship fund disbursements documented and authorised daily', 'daily')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Stage 11: Settlement & Post-EBA - Management Systems
-- ============================================================

INSERT INTO management_system_options (stage_number, category, option_text, description, default_frequency) VALUES
(11, 'meeting_rhythms', 'Legal review and settlement advice meeting',
 'Lawyer briefing: final EBA terms, legal obligations, advice to members', 'as_needed'),
(11, 'meeting_rhythms', 'Ratification vote planning meeting',
 'Ballot logistics: timing, voting method, polling locations/online, counting', 'as_needed'),
(11, 'meeting_rhythms', 'Post-EBA implementation planning meeting',
 'Delegate training, new claims tracking system, compliance monitoring plan', 'as_needed'),
(11, 'meeting_rhythms', 'Campaign lessons-learned debrief',
 'Retrospective on entire bargaining campaign: wins, challenges, member feedback', 'as_needed'),
(11, 'reporting_tools', 'Settlement agreement summary report',
 'Plain-language summary: what won, what lost, net outcome vs. demands', 'as_needed'),
(11, 'reporting_tools', 'Ratification vote results and reconciliation',
 'Vote tally, reconciliation against ballot roll, certification', 'as_needed'),
(11, 'reporting_tools', 'Settlement communications campaign results',
 'Tracking effectiveness of final messaging in driving YES vote', 'as_needed'),
(11, 'reporting_tools', 'Campaign impact assessment',
 'Tracking: did we achieve ambitions? What impact on density, engagement, ratings?', 'as_needed'),
(11, 'reporting_tools', 'Lessons-learned summary document',
 'Key successes, challenges, improvements for next campaign', 'as_needed'),
(11, 'tracking_systems', 'Post-EBA implementation checklist',
 'Tracking: delegate training completion, new contact procedures, issues log setup', 'weekly'),
(11, 'tracking_systems', 'EBA new terms quick-reference guide',
 'Reference doc for delegates on changed provisions, new processes', 'as_needed'),
(11, 'tracking_systems', 'Grievance and disputes log',
 'Employer compliance with EBA, member grievances, resolution tracking', 'weekly'),
(11, 'accountability', 'Delegate training completion tracker',
 'Ensuring all delegates briefed on new agreement terms and procedures', 'weekly'),
(11, 'accountability', 'Post-EBA organiser task allocation',
 'Ongoing monitoring: who is tracking compliance, handling grievances?', 'weekly')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Cross-Stage Management Systems (All Bargaining Stages 7-11)
-- ============================================================

INSERT INTO management_system_options (stage_number, category, option_text, description, default_frequency) VALUES
(7, 'communication_schedules', 'Bargaining update newsletter cadence',
 'Scheduled weekly or biweekly email/SMS to all members on bargaining status', 'weekly'),
(7, 'meeting_rhythms', 'Weekly delegate cycle',
 'Standing weekly meeting with all delegates for updates and engagement', 'weekly'),
(7, 'reporting_tools', 'Gate readiness report against settlement milestones',
 'Tracking progress: are we on track for PABO and settlement timing?', 'weekly'),
(8, 'communication_schedules', 'Employer response update communications',
 'Post-round emails/SMS explaining employer counter-offer to all members', 'as_needed'),
(8, 'meeting_rhythms', 'Weekly organiser planning meeting',
 'Internal debrief and strategy session between organiser and coordinator', 'weekly'),
(9, 'communication_schedules', 'Strike readiness campaign emails and SMS',
 'Messaging series building readiness and addressing barriers', 'weekly'),
(9, 'meeting_rhythms', 'Weekly activist coordination meeting',
 'Briefing emerging activists and strike committee on next steps', 'weekly'),
(10, 'communication_schedules', 'Picket-line daily briefing and updates',
 'Morning picket briefing, end-of-day debriefs, helicopter-day alerts', 'daily'),
(10, 'meeting_rhythms', 'Action solidarity coordination with other campaigns',
 'Cross-campaign coordination if other OA campaigns active simultaneously', 'as_needed'),
(11, 'communication_schedules', 'Post-EBA outcome announcement and celebration',
 'Launch message, settlement summary, ratification vote campaign launch', 'as_needed'),
(11, 'meeting_rhythms', 'Celebration and thank-you event',
 'Member gathering to celebrate outcome and thank activists', 'as_needed')
ON CONFLICT DO NOTHING;
