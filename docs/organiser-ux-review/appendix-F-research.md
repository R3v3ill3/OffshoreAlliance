# Appendix F: UX research brief: redesigning the organiser experience of the offshore-organising app

Scope: evidence for (1) an organiser "campaign view" that hides non-campaign features by default, (2) guided campaign setup (standalone by default, strategic plan attachable later, self- or admin-setup), (3) a universe → groups → units architecture with a per-group "unassigned" unit and a single-group-by-default group selector on the wall chart and list, and (4) a wall-chart-centred workflow for a user running 2–6 campaigns.

Method and verification notes
- Every URL below was fetched during this session and returned HTTP 200 (or its content was read), except where flagged. Action Builder help-centre pages sit behind a Cloudflare JavaScript challenge for non-browser clients, so their text was read through Zendesk's public JSON endpoint (`/api/v2/help_center/en-us/articles/<id>.json`); the human-readable URLs are the ones cited. Zendesk resolves ID-only URLs to the slugged article.
- Dropped because they did not resolve from this environment: NationBuilder support-centre articles (403), the Medium case study on Augsburg University (403), theanalysis.news McAlevey interview (403), w3.org WCAG target-size pages (403 through the proxy), ACM/Taylor & Francis DOI pages for the UMUX-Lite and Findlater papers (403; open-access alternatives are cited instead), the Broadstripes marketing site (bot check; the help centre is cited instead), and the Atlassian Design System empty-state page (resolves but its content is JavaScript-only, so it is not quoted).
- Quotes are verbatim from the fetched text. "Applies here" lines are my inference for this product.

---

## A. Comparable products and organising methodology

1. **Action Builder makes the Wall Chart the default screen and lets most work happen from it.** "The Wall Chart is the default view for users, and it is where most users will spend the majority of their time. Action Builder has made it easy for you to accomplish most of your tasks straight from the Wall Chart." It lists individuals "with their full names, city and state, and a circle off to the side, indicating their assessment level", and "By tapping or clicking on the Actions link, you can quickly and easily add assessments, info and relationships without leaving the Wall Chart."
   Source: Action Builder help centre (vendor documentation; Action Network / AFL-CIO): https://actionbuilder.zendesk.com/hc/en-us/articles/22306100963092-Wall-Chart
   Applies here: make the wall chart the landing page of the organiser campaign view and put rating, leader-link and note entry inline on the tile, not on a separate record page.

2. **Action Builder scopes what organisers see per campaign, explicitly to fight clutter.** Its Getting Started Guide: "From the start, we heard from organizers again and again that online systems they've used were cumbersome, overwhelming, and filled with clutter - tags, fields, questions that weren't relevant to their work at hand. Our solution was making what organizers see ... 'campaign specific'." "You control the options organizers see in their campaign as well - so they don't get overwhelmed with clutter." "Most organizations start with just one campaign, and decide to create new campaigns to better give people access to only what they need to know." Configuration advice: "Fewer sections has generally been better", "fewer fields and more responses", "Start small! Stay focused!", and "you can hide fields, responses, entity types and connection types in 'Campaign Customization', where you turn on and off what's visible to organizers."
   Source: Action Builder Getting Started Guide (vendor PDF): https://actionnetwork.org/user_files/user_files/000/062/020/original/Action_Builder_Guide.pdf ; API definition "Campaigns are the basic organizing unit in Action Builder": https://www.actionbuilder.org/docs/v1/campaigns.html
   Applies here: the "organiser campaign view" is the same move Action Builder made — the campaign is the unit of visibility, and an admin/senior toggles what a campaign exposes.

3. **Assessments: one fixed, colour-coded numeric scale, visible everywhere, and "no assessment" is a first-class filter value.** "each instance can only have one assessment scale per entity type"; "The color-coded assessments in Action Builder facilitate this, providing an instant visual cue across all views of the Wall Chart." "Most Labor organizing campaigns use a 1-4 or 1-5 scale on Action Builder." In the Query Builder, "The ' — ' option will return anyone without an assessment", and "View Your Search Summary: At the top of the list, you'll find labels that describe the criteria you used." Trend View adds time: "While Chart View provides a snapshot of where things stand today, Trend View helps you understand how your campaign is progressing over days, weeks, or months."
   Sources: https://actionbuilder.zendesk.com/hc/en-us/articles/22266046855060 (Setting Up Your Assessments); https://actionbuilder.zendesk.com/hc/en-us/articles/22282364273300-Query-Builder-Criteria ; https://actionbuilder.zendesk.com/hc/en-us/articles/35138491276308 (Trend View)
   Applies here: keep one support scale across campaigns, always show it as colour plus number, treat "unrated" as a selectable state, and echo applied filters as chips above the wall chart.

4. **Workers whose unit/assignment is unknown are surfaced through explicit "none" filters.** Complex Filters include "Entities with No Assigned User — Under the In User's Assignment filter, you can find entities that are not assigned to any user", and "Search for entities that have ANY connections, or exclude entities with NO connections." Complex filters "can only be created by Leads and Admins, but can be used by all users", with a "Real-Time Count" as the query is built.
   Source: https://actionbuilder.zendesk.com/hc/en-us/articles/22268110161172-Complex-Filters
   Applies here: the per-group "Unassigned" unit is the visual equivalent of these "no value" filters; also copy the lead/admin-builds, everyone-uses split for saved views and the live count.

5. **Action Builder's data model: campaigns, entity types (people, worksites, contractors), connections, sections/fields/responses, tags.** "labor campaigns might want to create entities for Contractors, Subcontractors, Job Sites, or Businesses"; admins "Choose which campaigns can access the entity". "Connections represent a link between two people or entities." Info is "a global feature ... enabled or disabled for different campaigns through 'Campaign Customization'" organised as Section → Field → Response; a "Shift" field type stores "specific day & time data".
   Sources: https://actionbuilder.zendesk.com/hc/en-us/articles/22280516405908 (Creating Entity Types); https://actionbuilder.zendesk.com/hc/en-us/articles/22267423606036 (Sections, Fields and Responses); https://www.actionbuilder.org/docs/v1/connections.html ; https://www.actionbuilder.org/docs/v1/tags.html
   Applies here: employer/worksite/agreement data belongs in a global layer that campaigns opt into; shift/profession/worksite are attributes of the worker–employment link, which is exactly what your "group" dimensions should read from.

6. **Field evidence of adoption risk: organisers experience data tools as a chore until the tool shows them something back.** Minnesota Nurses Association ran a campaign across "14 hospitals" and "15,000 nurses"; "Action Builder was the central place where we tracked all of that." The initial reaction: the tool can "feel like a chore to organizers where they think, 'I just have to enter my data.'" Adoption improved once dashboards showed "top issue by department, connections and leaders".
   Source: Action Network blog case study (vendor case study): https://actionnetwork.blog/how-the-minnesota-nurses-association-scaled-organizing-with-action-builder/
   Applies here: the wall chart must pay organisers back immediately (per-unit strength, gaps, leader coverage), otherwise a simpler UI alone will not drive data entry.

7. **Broadstripes: 1–5 assessment codes with a project default, leader roles in a ranked hierarchy, and nested organisations (employer → department → sub-department).** "usually done using a numeric assessment scale, with 1 indicating strong support, and the highest number in the scale (usually 5) indicating hostility. The 5-point scale is useful because it gives you a neutral position (3) and two 'leaning' options (2 and 4)." Leader roles: "Labor organizing (internal or external) often uses 'Committee' and 'Key Leader'"; "The position number conveys where the role fits in the hierarchy of leadership." Organisations: "If the organization you are creating is, for instance, a department or section within a larger organization, you can link it to its parent organization"; a sub-department is added by naming "'Pediatrics' as the 'Parent Organization'". Employment subfields include Department, Classification (job title), Work location, Employee status.
   Sources (vendor documentation, Broadstripes): https://help.broadstripes.com/docs/admin-guides/data-tools/assessment-codes ; https://help.broadstripes.com/docs/admin-guides/data-tools/leadership-roles ; https://help.broadstripes.com/docs/admin-guides/data-tools/organizations ; https://help.broadstripes.com/help-articles/using-broadstripes/working-with-contact-records/add-a-shop-or-department/ ; https://help.broadstripes.com/docs/admin-guides/data-tools/employment-field-and-subfields
   Applies here: model worksite, profession (classification) and shift as employment attributes; give leader roles an explicit rank so leader/follower links can be summarised per unit.

8. **Broadstripes handles "switching grouping dimension" with Social Groups (cross-cutting sets) plus searches/layouts, and "unassigned" as an explicit state.** Social groups "let you group and view workers by anything they have in common ... even if they don't work in the same department"; "From any existing social group, it's just a few more clicks to create a leadership structure." Bulk set-assessment: "To clear the assessment from all selected contacts (leaving them unassessed), choose the Unassessed option at the top of the list"; the dialog "shows how many contacts you have selected"; assigning a leader to someone who already has one prompts "Assign (confirm) or Cancel". Leader reports "group the people by Leaders and separate these groups into pages for easy distribution of printed reports."
   Sources: https://help.broadstripes.com/docs/customize/create-social-groups ; https://help.broadstripes.com/docs/viewing-search-results-and-edit/bulk-actions/bulk-actions-set-assessment ; https://help.broadstripes.com/docs/viewing-search-results-and-edit/bulk-actions/bulk-actions-assign-leader-remove-leader ; https://help.broadstripes.com/docs/lists-reports/creating-basic-reports-for-leaders
   Applies here: a "group" in your architecture is one Broadstripes-style dimension (formal or social); "Unassigned" should be a real, selectable value; and bulk actions should confirm overwrites and show counts.

9. **Broadstripes' home, project switcher and role model are close analogues of your goals.** Home tab: "the default starting view for every user", with three quick-action cards ("Find people", "Find workplaces", "Log a conversation") and a "Getting started checklist ... tracks five key milestones". Project switcher: opens with Ctrl/Cmd-., lists projects "sorted by recency", and "If you belong to only one project, the project name appears as a plain label ... the project switcher does not open." Roles: Basic user vs Project admin, with optional per-user grants ("Download CSV / XLSX", "Perform data imports"); "If a basic user does not have one of these permissions, the corresponding feature is not available to them in their project." Recording data: "Recording information is always easiest if you aren't wading through unnecessary pages and fields just to get to the things that are pertinent to your work."
   Sources: https://help.broadstripes.com/docs/getting-started/use-the-homepage-tabs ; https://help.broadstripes.com/docs/getting-started/switch-projects ; https://help.broadstripes.com/docs/start-project/user-roles-and-permissions ; https://help.broadstripes.com/docs/getting-started/record-your-organizing-info ; project setup in three steps (customise → import → help users get started): https://help.broadstripes.com/help-articles/admin-tools/running-a-project-admin/set-up-a-project/
   Applies here: a recency-sorted campaign switcher with a keyboard shortcut, collapsed to a label when a user has one campaign; imports/exports as admin-granted capabilities that simply do not appear otherwise.

10. **Paper wall-chart practice (Labor Notes) defines the grouping rule and the "row for everyone" rule.** "Make a wall chart ... with all the names grouped by work area, job, and shift. Color-code it to show your organizing progress, so you can see at a glance where your union is weak and where it's strong." "Enter one row for each worker, even people you don't have much information about." "Keep it up to date. Charts are only as useful as they are accurate." The Contract Action Team model wants "one from every work area and shift" and treats every action as a test: "Each action is a test of your organizing network." Leader identification questions: "Who do people go to when there's a problem?"
   Sources: Labor Notes, Secrets of a Successful Organizer handouts (Part Two PDF): https://www.labornotes.org/sites/default/files/Secrets%20Handouts%20Part%20Two-%20Assembling%20Your%20Dream%20Team.pdf ; handouts index: https://labornotes.org/secrets/handouts ; "Organize the Organized": https://www.labornotes.org/2019/10/organize-organized
   Applies here: work area, job and shift are exactly your three default group dimensions; the wall chart must include workers with no unit (hence the unassigned unit), and coverage per unit/shift is the leader metric to show.

11. **McAlevey / Organizing for Power: charting, organic-leader identification and structure tests are the core skills; the chart's job is to measure majority participation per unit.** O4P participants "practiced such essential skills as organic (or 'natural') leadership identification, one-on-one conversations, and the development of structure tests", aiming at "high participation unions with super majorities of actively engaged workers"; the curriculum teaches "how to build disciplined majorities capable of winning measurable victories through well-planned campaigns." The DSA study guide to *No Shortcuts*: "Organic leaders are people who other people respect and trust and if asked might follow into action. They might not even be elected - they often do NOT have titles or positions"; structure tests "gauge how effectively and efficiently a worker identified as an organic leader can get a majority of their unit" to act.
   Sources: Rosa-Luxemburg-Stiftung O4P programme PDF: https://www.rosalux.de/fileadmin/rls_uploads/pdfs/O4P-FINAL-RLS.pdf ; https://www.rosalux.de/en/o4p ; DSA Fund discussion guide to *No Shortcuts* (secondary, but the book itself is behind paywalls; catalogue record: https://www.jstor.org/stable/j.ctt1f89t8r): https://dsafund.org/wp-content/uploads/2025/06/No-Shortcuts-Discussion-Guide-for-DSA-Fund-Website-1.pdf
   Applies here: structure-test participation should roll up as "% of unit" per unit and per leader's followers, because that is the number organisers act on.

12. **Canvassing tools (NGP VAN MiniVAN) show the field-logging pattern: cut lists into turf, log quickly, auto-sync.** Campaigns "easily cut turfs (geographic areas of targeted voters) and assign them to your volunteers"; volunteers "record responses and interactions directly in the app"; "MiniVAN data is automatically committed to your database to make sure you don't lose any data." Broadstripes similarly generates geographic "Turf Groups".
   Sources: https://www.ngpvan.com/blog/canvassing-with-minivan/ ; https://help.broadstripes.com/docs/maps/using-turf-groups
   Applies here: a unit (crew/shift) is the organiser's "turf"; a call list generated from a unit should be a first-class, resumable object with auto-saved outcomes.

---

## B. Progressive disclosure and role/mode-based simplification

1. **Progressive disclosure: show the few important options first, defer the rest, and never exceed two levels.** "Initially, show users only a few of the most important options"; "Offer a larger set of specialized options upon request"; use "frequency-of-use statistics" to decide the split; "designs that go beyond 2 disclosure levels typically have low usability." Staged disclosure (wizards) is the linear variant, suited to steps with little interaction.
   Source: Nielsen Norman Group: https://www.nngroup.com/articles/progressive-disclosure/
   Applies here: the campaign view is level 1 (wall chart, list, bulk actions); one "More"/admin layer is level 2; do not nest a third layer of settings.

2. **Hide what a user can never use; mute-and-explain what is only temporarily unavailable.** Jakob Nielsen: "features that are never available to a user should be hidden" (permissions, plan, role), while temporarily inactive commands should stay visible in "a muted color" with an explanation so the user knows the feature exists. He cites Microsoft Office's adaptive menus, which hid rarely used items and which users then believed were absent.
   Source: Jakob Nielsen, "Inactive GUI Controls: Show, Disable, or Hide?" (author of the 10 heuristics; NN/g co-founder): https://jakobnielsenphd.substack.com/p/inactive-buttons ; NN/g video on disabled buttons: https://www.nngroup.com/videos/why-disabled-buttons-hurt-ux-and-how-to-fix-them/
   Applies here: remove admin/import/employer-database navigation entirely for organisers without those rights; for features an admin has switched off for a campaign, show them muted with "Ask an admin to enable" rather than silently dropping them.

3. **Hiding navigation halves discoverability and slows tasks — so "hide by default" must mean "hide the rarely needed", not "hide behind a menu".** "Discoverability is cut almost in half by hiding a website's main navigation. Also, task time is longer and perceived task difficulty increases." "Navigation options hidden under a menu have decreased discoverability and findability."
   Sources: NN/g quantitative study (179 participants): https://www.nngroup.com/articles/hamburger-menus/ ; https://www.nngroup.com/articles/find-navigation-desktop-not-hamburger/
   Applies here: keep the 4–6 campaign-view items permanently visible; relocate non-campaign features to an explicitly labelled admin area rather than a collapsed hamburger.

4. **Adaptable beats adaptive: users prefer controlling the simplification themselves, and self-adapting menus are slowest.** Findlater & McGrenere (CHI 2004): "The static menu was found to be significantly faster than the adaptive menu, and the adaptable menu was found to be significantly faster than the adaptive menu under certain conditions. The majority of users preferred the adaptable menu overall." "most users prefer the control afforded by an adaptable approach to personalization rather than a system-controlled adaptive approach."
   Source: peer-reviewed, University of British Columbia archive: https://www.cs.ubc.ca/labs/imager/tr/2004/findlater04menus/ (PDF: https://www.cs.ubc.ca/labs/imager/tr/2004/findlater04menus/findlater04menus.pdf)
   Applies here: let admins/senior users configure the organiser view (adaptable); do not auto-hide features based on usage (adaptive), and keep the layout stable.

5. **Novice/expert: cater to both with accelerators that are additional, not required.** Heuristic 7: "shortcuts and accelerators — unseen by the novice user — which speed up the interaction for expert users"; "Novice users rely heavily on step-by-step wizards or clearly labeled menus". "Accelerators should be additional"; "you shouldn't aim to expose new users to every accelerator". Nielsen also floats "training wheels interfaces where the average site visitor gets a simplified design that is easy to learn and loyal users get an advanced design that is more powerful."
   Sources: https://www.nngroup.com/articles/flexibility-efficiency-heuristic/ ; https://www.nngroup.com/articles/ui-accelerators/ ; https://www.nngroup.com/articles/novice-vs-expert-users/
   Applies here: the organiser view is the "training wheels" design; keyboard rating (1–5 keys), multi-select and saved views are the accelerators for senior organisers.

6. **Modes cause errors; Tesler's law says complexity moves, it does not vanish.** Raskin: "A mode is a state in which the same user action produces a different result than it would in another state"; the fix is that "every user action always has the same meaning, regardless of system state"; quasimodes (held keys) are safe because they cannot be forgotten. Tesler: "For any system there is a certain amount of complexity which cannot be reduced" and "must be assumed by either the system or the user."
   Sources: Raskin Center for Humane Interfaces (Jef Raskin, *The Humane Interface*): https://raskincenter.org/rchi/core-principles/ ; Laws of UX (Tesler's Law): https://lawsofux.com/teslers-law/ ; NN/g video "Tesler's Law: Shift Complexity to Simplify UX": https://www.nngroup.com/videos/teslers-law/
   Applies here: "organiser view" vs "full view" must not change what the same controls do — it should only add or remove items. Move complexity (universe rules, agreements) into admin setup so organisers never carry it.

7. **Role-based personalisation works only with few, well-supported roles and an opt-out.** NN/g's six tips: "Assign roles carefully", "Restrict access sparingly", "Don't create more roles than you can support", "Personalize functionality as well as content", "Provide an out, as appropriate", "Review roles regularly." Audience/role-based navigation in general "increase[s] cognitive effort and user anxiety" because "Users don't know which group to choose."
   Sources: https://www.nngroup.com/articles/personalization/ ; https://www.nngroup.com/articles/audience-based-navigation/ ; definitions ("Customization gives control to the user ... Personalization gives control to the site"): https://www.nngroup.com/videos/personalization-customization/
   Applies here: two or three view profiles at most (organiser, senior/lead, admin), assigned by an admin — never a self-selected "which kind of user are you?" prompt — with a visible "show everything" out for senior users.

8. **Enterprise precedent: page/view assignment by app and profile (Salesforce), simplified self-managed projects (Jira), view-only seats (HubSpot), default teamspaces (Notion).** Salesforce: "You can also customize the page for different types of users and assign custom pages to different apps and app-and-profile combinations." Jira team-managed spaces are "Set up and maintained by anyone on the team" with "simpler space configuration", versus company-managed "greater complexity ... but also the ability to standardize"; choose team-managed when "Your team wants easier space configuration to get started quickly." HubSpot view-only seats "are free and unlimited" and can "View records, dashboards, customer data, and reports" but not "edit records, change settings, manage tools". Notion: "Most likely, you'll only need one default teamspace, and we'd recommend no more than three default, even for large workspaces"; "Each teamspace has its own membership, permissions, & security settings."
   Sources: Salesforce Trailhead: https://trailhead.salesforce.com/content/learn/modules/lightning_app_builder/lightning_app_builder_homepage ; Atlassian: https://support.atlassian.com/jira-software-cloud/docs/what-are-team-managed-and-company-managed-spaces/ ; HubSpot: https://knowledge.hubspot.com/account-management/manage-seats ; Notion: https://www.notion.com/help/intro-to-teamspaces
   Applies here: model "standalone campaign" on Jira team-managed (organiser-owned, self-contained defaults) and "campaign attached to a strategic plan" on company-managed (standardised, admin-owned); use profile-assigned home pages; consider a free view-only seat for delegates/stewards.

9. **Reduce clutter without reducing capability, and ease the primary/secondary transition.** NN/g's complex-application guidelines: "6. Reduce Clutter Without Reducing Capability" and "7. Ease Transition Between Primary and Secondary Information"; "Some information must be deferred to secondary levels; however, that secondary information is often necessary to contextualize and make decisions."
   Source: https://www.nngroup.com/articles/complex-application-design/
   Applies here: hide the employer database from the nav, but surface the relevant employer/agreement facts as a side panel from a unit or worker tile.

---

## C. Cognitive load and choice architecture for navigation

1. **Hick's law: more choices, slower decisions — but structure, not a magic count, is the remedy.** "the more choices you present to your users, the longer it takes them to reach a decision"; "combining Hick's Law with other design techniques can make long menus easy to use."
   Source: NN/g video: https://www.nngroup.com/videos/hicks-law-long-menus/
   Applies here: the primary nav for an organiser should be a handful of task-named items (Wall chart, List, Actions/Lists, Reports); everything else lives one level down under an admin label.

2. **Miller's 7±2 is misapplied to menus; working-memory capacity is more like 3–6 chunks, and visible options do not tax memory at all.** NN/g: "there are no usability gains to be made by limiting the number of menu items to seven"; "Don't ask your users to hold more than a few pieces of information in their short-term memory at once. And don't get hung up on the number seven"; "Other researchers have suggested that the right number could be anywhere from three to six." UX Myths: "On a webpage, however, the information is visually present, people don't have to memorize anything". NN/g on working memory: "offload items to external memory by showing them on the screen."
   Sources: https://www.nngroup.com/articles/chunking/ ; https://uxmyths.com/post/931925744/myth-23-choices-should-always-be-limited-to-seven ; https://www.nngroup.com/videos/working-memory-external-memory/
   Applies here: what matters is that the selected campaign, active group and applied filters are always visible on screen (external memory), not that menus are capped at seven.

3. **Minimise extraneous load: avoid clutter, build on existing mental models, offload tasks.** "designers should ... strive to eliminate, or at least minimize, extraneous cognitive load"; tips: "Avoid visual clutter", "Build on existing mental models", "Offload tasks".
   Source: https://www.nngroup.com/articles/minimize-cognitive-load/
   Applies here: the wall chart already matches organisers' paper mental model (names grouped by area/job/shift, colour-coded); let the app compute unit strength and leader coverage rather than making organisers count.

4. **Breadth beats depth for findability; depth disorients.** "the deeper a hierarchy becomes, the more likely visitors are to become disoriented"; the balance must be found by "usability testing, analytics, and search logs". Vertical left navigation "is a good fit for broad or growing IAs" and "Specific categories increase findability and decrease interaction cost"; the article opens with the common question "Is it okay to have more than 7-9 top-tier categories".
   Sources: https://www.nngroup.com/articles/flat-vs-deep-hierarchy/ ; https://www.nngroup.com/articles/vertical-nav/ ; on category counts and ordering ("If a list has fewer than 10 categories, there is probably not much benefit to alphabetizing them"): https://www.nngroup.com/articles/ia-questions-navigation-menus/
   Applies here: campaign → (wall chart | list | actions) is two levels; keep units and groups as in-page selectors, not nav levels, and order campaigns/groups by recency or importance rather than A–Z.

5. **Hub-and-spoke: one hub page with direct spokes and paths back.** NN/g proposes "a hub-and-spoke model ... showing which important pages should exist and the most effective hierarchical relationships between them" — hub pages "serve as catch-all links" with "lower-level granular links with direct paths back to hub pages."
   Source: https://www.nngroup.com/articles/customer-service-model/
   Applies here: the campaign wall chart is the hub; worker profile, unit detail, call list and message composer are spokes that always return to the chart with state intact.

6. **Tabs: few, one row, short labels, high-use first.** "When the number of tabs overflows the tab list, the tab bar often becomes a carousel. As a result, the hidden tabs become less discoverable"; "Use only one row"; "Tab labels should usually be 1-2 words"; place frequently accessed content in the default selected tab.
   Source: https://www.nngroup.com/articles/tabs-used-right/
   Applies here: the group selector should read as a single row of 1–2-word chips (Worksite, Shift, Profession, + Add), with the default group selected; never let it wrap or scroll.

7. **Spatial memory needs stable layouts.** "For users to be able to develop spatial memory, two things are necessary: Stable UIs where things don't move around (much); Repeated practice accessing the objects."
   Source: https://www.nngroup.com/articles/spatial-memory/
   Applies here: switching campaigns must not rearrange the chrome; units should keep a stable order on the wall chart between visits so organisers can find "their" crew by position.

8. **Count effort, not clicks.** "the 3-click rule is an arbitrary rule of thumb that is not backed by data"; interaction cost "is the sum of efforts — mental and physical — that users must deploy". Efficiency shortcuts that break expectations backfire: "IC = P + M (interaction cost = physical + mental effort)."
   Sources: https://www.nngroup.com/articles/3-click-rule/ ; https://www.nngroup.com/articles/interaction-cost-definition/ ; https://www.nngroup.com/articles/efficiency-vs-expectations/
   Applies here: a two-step "pick unit → rate worker" flow that matches the paper chart beats a one-click but unfamiliar gesture.

9. **Context switchers for a handful of contexts: always visible, reorderable, keyboard-driven, recency-sorted; "my work" as home.** Slack: "Click the workspace switcher icon or press ⌘+Shift+S ... to keep your workspaces visible in the sidebar"; "To reorder them, click and drag the workspace icons." Broadstripes' project switcher is "sorted by recency" with Ctrl/Cmd-. and collapses to a plain label for single-project users. Linear's My Issues is "a curated view that shows your most pertinent issues" where "Assigned issues are grouped in a focus order such as urgent work, SLA-bound work, blockers, cycle work"; Asana calls My Tasks "your home base"; Atlassian Home's "For you" page offers "Frequent places" and "What's next" ("your most recently viewed or worked on items").
   Sources: https://slack.com/help/articles/1500002200741-Switch-between-workspaces ; https://help.broadstripes.com/docs/getting-started/switch-projects ; https://linear.app/docs/my-issues ; https://asana.com/resources/asana-tips-my-tasks ; https://support.atlassian.com/platform-experiences/docs/what-is-atlassian-home/
   Applies here: a persistent 2–6-item campaign rail (icons + initials, drag to reorder, Ctrl/Cmd-number to jump) and a "My work" home that lists open call lists and due structure tests across campaigns before dropping into one wall chart.

10. **Focused sidebars: join only what you use, pin a handful of favourites.** Notion: "Only join teamspaces that are useful in your day to day work"; "Arrange your teamspaces according to what you use most"; keep favourites to "just a handful of pages".
    Source: https://www.notion.com/help/guides/structure-sidebar-focused-work-teamspaces
    Applies here: the organiser's campaign rail should show only campaigns they are assigned to, with archived/other campaigns behind "More".

---

## D. Faceted / multi-dimensional grouping and the "unassigned" bucket

1. **Facets are independent dimensions; each "group" in your model is a facet, not a tree level.** "Filter means anything that analyzes a set of content and excludes some items. Faceted navigation is composed of multiple filters that comprehensively describe a set of content"; ideally it "provides multiple filters, one for each different aspect of the content." Filter categories and values must be "appropriate, predictable, free of jargon, and prioritized."
   Sources: https://www.nngroup.com/articles/filters-vs-facets/ ; https://www.nngroup.com/articles/filter-categories-values/
   Applies here: Worksite, Shift, Profession (and crew) are facets over the same universe; the group selector chooses which facet partitions the chart, filters narrow within it.

2. **Forcing mutual exclusivity onto multi-parent items breeds artificial complexity.** "When an item fits in more than one category, your IA structure can include multiple parents for that item"; artificial mutually exclusive categories "can easily increase the complexity of taxonomies and make them inaccessible to lay people."
   Source: https://www.nngroup.com/articles/polyhierarchy/
   Applies here: a worker legitimately belongs to one unit per group (one worksite, one shift, one profession); do not try to build a single crew×shift×worksite tree.

3. **Single-dimension-by-default group-by with additive sub-grouping is the norm (Linear, Airtable, Notion).** Linear: "Group issues by properties such as status, assignee, project, priority, cycle, label ..."; "Board views default to grouping by Status, but you can change grouping"; sub-grouping lets you "lay them out as rows for your chosen dimension"; "Show empty groups: When toggled on, this setting shows groups with no issues." Airtable: "Groups will automatically be created based on the unique values in that field"; "Add subgroup ... maximum of 3 levels of grouping"; "Choose whether to show or hide groups with no records." Notion: "Board view groups your database pages by a specific property"; "you can add a second layer of groups, called sub-groups"; columns can be hidden with "Hide group".
   Sources: https://linear.app/docs/display-options ; https://linear.app/docs/board-layout ; https://support.airtable.com/docs/grouping-records-in-airtable ; https://www.notion.com/help/boards
   Applies here: default the wall chart to one group (the campaign's primary dimension); "Add group" nests a second dimension as rows (matrix) with a hard cap of two or three levels; offer "show empty units" as a toggle, off by default.

4. **Items lacking a value for the active dimension get an explicit lane the user can position.** Jira assignee swimlanes: "One assignee per swimlane, with unassigned work items appearing either above or below the swimlanes (your choice)." Action Builder's assessment filter has an explicit " — " value for "anyone without an assessment"; Broadstripes lists "Unassessed" as "the top of the list" option when bulk-setting codes.
   Sources: https://support.atlassian.com/jira-software-cloud/docs/configure-swimlanes/ ; https://actionbuilder.zendesk.com/hc/en-us/articles/22282364273300-Query-Builder-Criteria ; https://help.broadstripes.com/docs/viewing-search-results-and-edit/bulk-actions/bulk-actions-set-assessment
   Applies here: each group gets one "Unassigned" unit, pinned first (it is work to do) or last (configurable), always visible, and selectable as a filter value so organisers can bulk-assign from it.

5. **Every worker must appear even when data is missing.** Labor Notes: "Enter one row for each worker, even people you don't have much information about."
   Source: https://www.labornotes.org/sites/default/files/Secrets%20Handouts%20Part%20Two-%20Assembling%20Your%20Dream%20Team.pdf
   Applies here: the universe count on the chart must equal assigned + unassigned; never let the unassigned bucket be an off-chart list.

6. **Cross-cutting, informal groups are a legitimate dimension alongside formal ones.** Broadstripes Social Groups "let you group and view workers by anything they have in common ... even if they don't work in the same department" and can become "a leadership structure".
   Source: https://help.broadstripes.com/docs/customize/create-social-groups
   Applies here: allow a user-defined "custom" group dimension (e.g., crew rotation, helicopter roster) with the same unassigned semantics.

7. **Always show applied filters in an overview; keeping them in place and in a summary line is the best-performing combination.** Baymard: "28% of sites across our UX benchmarks don't display an overview at all"; without it users lack "a context for the product list" and "easily forget" which filters are active.
   Source: Baymard Institute (large-scale usability benchmarking): https://baymard.com/blog/how-to-design-applied-filters
   Applies here: chips above the chart ("Campaign X · Group: Shift · Filters: rating ≤ 2, no leader") with one-tap removal and a total count.

8. **Batch vs interactive filtering depends on intent and speed.** "Choosing between a batch and an interactive filter implementation will depend on both user intent (does the user plan to specify multiple filtering criteria or just one) and site speed."
   Source: https://www.nngroup.com/articles/applying-filters/
   Applies here: apply group/quick filters instantly; use an "Apply" step only for the multi-criteria query builder that feeds call lists.

9. **Default ordering: importance/frequency or logical order beats alphabetical for short lists.** "Ordinal sequences, logical structuring, time lines, or prioritization by importance or frequency are usually better than A-Z listings"; alphabetical only helps "If users know the name of the thing they want."
   Source: https://www.nngroup.com/articles/alphabetical-sorting-must-mostly-die/
   Applies here: order shift units by roster order and worksites by size or campaign priority; sort workers within a unit by rating then name, and remember the sort per view.

10. **View state should persist per user and be shareable/defaultable by leads.** Linear: "Your selections will persist even if you navigate away from the current view", with "Set as default" for the workspace. Trello: "The filter will stay in place until you dismiss it, even if you leave the board or go to a different view." Action Builder documents "Saving, Sharing, and Setting Default Queries" and Broadstripes lets users "Create and save searches and layouts (personal or shared)".
    Sources: https://linear.app/docs/display-options ; https://support.atlassian.com/trello/docs/filtering-for-cards-on-a-board/ ; https://actionbuilder.zendesk.com/hc/en-us/articles/22282447765268 ; https://help.broadstripes.com/docs/start-project/user-roles-and-permissions
    Applies here: persist group selection, filters and sort per user per campaign; let a senior user publish a campaign default view that new organisers inherit.

---

## E. Wizards and guided setup

1. **Wizards suit infrequent setup, not daily work; support exit-and-resume and reuse previous answers as defaults.** "Use wizards for novice users or infrequent processes (e.g., configuration or setup)"; "Communicate a clear mental model of the process by displaying a list or a diagram of the steps"; "Allow users to exit the wizard midway and save state"; "Wizard steps should be self-sufficient"; "Consider reusing the user's selections from previous use as the defaults for the next use of the wizard."
   Source: https://www.nngroup.com/articles/wizards/
   Applies here: campaign creation is a wizard (name → universe rules → primary group → invite), saving a draft campaign at every step; the second campaign an organiser creates should be pre-filled from the first.

2. **One thing per page for the setup wizard; group questions only for high-frequency internal users.** GOV.UK: "Asking just one question per question page helps users understand what you're asking them to do"; "sometimes it makes sense to group a number of related questions on the same page" when users "need to repeat tasks quickly (such as government staff in internal services)"; "Start by splitting the form across multiple pages with each page containing just one thing." For admin systems: "a user of an admin system might need to repeat and switch between tasks quickly ... This might mean it's not appropriate to apply a one thing per page approach on all pages."
   Sources: GOV.UK Design System: https://design-system.service.gov.uk/patterns/question-pages/ ; GOV.UK Service Manual: https://www.gov.uk/service-manual/design/form-structure ; https://www.gov.uk/service-manual/design/services-for-government-users
   Applies here: organiser self-setup gets one-decision-per-step; the admin bulk setup (many campaigns, universe rules) may use denser multi-field pages.

3. **Defaults decide outcomes; pre-populate the common value and optimise the default path.** "people tend to stick to the defaults"; "they rarely utilize fancy customization features, making it important to optimize the default user experience"; "pre-populate fields with the most common value if you can determine it in advance."
   Source: https://www.nngroup.com/articles/the-power-of-defaults/
   Applies here: default = standalone campaign, primary group = Worksite (or whatever your usage data shows), no strategic plan; every default labelled "You can change this later in campaign settings".

4. **Separate "create" from "configure": start small and adapt, with a minimum viable object.** Action Builder's own advice: "Don't feel a need to include every field & response at the start. Starting small and growing based on organizer feedback has been most successful." "Start small! Stay focused! No need to migrate all your data and track everything." "Only assessments are locked in once you set them." NN/g: "the usability of an MVP is just as important as its functionality." Broadstripes structures setup as three steps: customise, import your list, help users get started.
   Sources: https://actionnetwork.org/user_files/user_files/000/062/020/original/Action_Builder_Guide.pdf ; https://www.nngroup.com/articles/mvp-definition/ ; https://help.broadstripes.com/help-articles/admin-tools/running-a-project-admin/set-up-a-project/
   Applies here: a campaign is "created" with a name and a universe; groups, units, structure tests and the strategic plan are "configured" afterwards from the wall chart's empty states — and the strategic plan is attachable at any time.

5. **Empty states are the onboarding surface in complex apps.** NN/g: empty states "communicate system status, increase learnability of the system, and deliver direct pathways for key tasks"; "Especially in complex applications that have not been fully configured by the user, empty states are quite common during onboarding." Polaris: "The empty state composition turns these blank screens into opportunities by guiding merchants toward their first action. Include a clear explanation of what will appear here and a prominent call-to-action" — use cases include onboarding "to create their first item", "when search or filters return no results" and "feature activation or configuration." Material adds "starter content" and educational content that is dismissible ("Keep it brief").
   Sources: https://www.nngroup.com/articles/empty-state-interface-design/ ; Shopify Polaris: https://shopify.dev/docs/api/app-home/latest/patterns/compositions/empty-state ; Material Design: https://m1.material.io/patterns/empty-states.html
   Applies here: an empty "Unassigned" unit says "Everyone is placed"; an empty group says "Add units for this dimension"; a chart with no structure test says "Plan your first structure test" — each with one primary action.

6. **Setup checklists: 3–5 items, learn by doing, event-driven completion.** Appcues: "Keep it to 3–5 items. Checklists with more than five items see significantly lower completion rates"; "choose the option that gets the user doing the task rather than reading about it"; complete items on real events, not page views; separate checklists per persona. Broadstripes ships "a Getting started checklist ... five key milestones".
   Sources: https://docs.appcues.com/checklist-best-practices ; https://help.broadstripes.com/docs/getting-started/use-the-homepage-tabs
   Applies here: a per-campaign "Get this campaign working" checklist — universe loaded, primary group chosen, unassigned cleared below X%, first ratings entered, first list built — ticked off from data, not clicks.

7. **Tutorials and overlays do not improve performance; prefer contextual, pull-based help and learning by doing.** "Tutorials interrupt users, don't necessarily improve task performance, and are quickly forgotten. Contextual help signals can avoid these pitfalls." A 70-user study: "tutorials don't make users faster or more successful at completing tasks; on the contrary, they make them perceive the tasks as more difficult." Overlays "are often nice-to-have and not need-to-have"; "Skip Onboarding Whenever Possible." Complex apps: "users prefer to start using it immediately, undeterred by its level of complexity."
   Sources: https://www.nngroup.com/articles/onboarding-tutorials/ ; https://www.nngroup.com/articles/mobile-tutorials/ ; https://www.nngroup.com/articles/mobile-app-onboarding/ ; https://www.nngroup.com/articles/complex-application-design/
   Applies here: no product tour; put a first-use hint on the rating control and the group selector only, triggered on first encounter.

8. **Forms: eliminate optional fields, mark required ones, and reduce mental work.** "Limit the form to only 1 or 2 optional fields, and clearly label them as optional"; mark required fields with an asterisk; four principles "structure, transparency, clarity, and support" minimise cognitive load.
   Sources: https://www.nngroup.com/articles/web-form-design/ ; https://www.nngroup.com/articles/required-fields/ ; https://www.nngroup.com/articles/4-principles-reduce-cognitive-load/
   Applies here: campaign creation needs two required fields (name, universe rule); strategic-plan fields are a separate, optional, later form.

9. **Templates as starting points.** Atlassian maintains a library of pre-configured project templates so teams do not start from blank projects.
   Source: https://www.atlassian.com/software/jira/templates
   Applies here: offer "Offshore platform campaign" and "Contractor crew campaign" templates that pre-define groups (Worksite/Shift/Profession) and default units.

---

## F. Data-dense working screens and dashboards

1. **Overview first, zoom and filter, details on demand.** Shneiderman's Visual Information-Seeking Mantra: "overview first, zoom and filter, then details on demand", with seven tasks: "overview, Zoom, filter, details-on-demand, relate, history, and extracts".
   Source: Shneiderman, "The Eyes Have It" (IEEE Symposium on Visual Languages, 1996; peer-reviewed): https://www.cs.umd.edu/~ben/papers/Shneiderman1996eyes.pdf
   Applies here: campaign overview (units as rows with strength bars) → zoom into one group/unit → filter by rating/leader/test → tile tap for details; "relate" is the leader–follower link, "history" the rating trend, "extracts" the call list.

2. **Encode quantity with length/position; use colour and shape for categories, and never colour alone.** "use length and 2D position to communicate quantitative information quickly"; "color should not be used to communicate information about quantitative values or magnitude"; "up to 4.5% of the general population suffers from some form of color blindness"; colour and shape "can be used to convey categorical information — that is, which items in a visualization belong together." Users are "roughly 37% faster at finding items within a list ... when visual indicators vary both in color and icon compared to text alone"; icons still need text labels.
   Sources: https://www.nngroup.com/articles/dashboards-preattentive/ ; https://www.nngroup.com/articles/visual-indicators-differentiators/ ; https://www.nngroup.com/videos/icon-text-labels/
   Applies here: rating tiles = colour + numeral; unit strength = a bar (length) not a hue; leader = an icon, structure-test participation = a shape/tick, so the chart survives colour-blindness and grayscale printing.

3. **Tables must support four tasks; batch actions need selection checkboxes and an action bar.** "Table design should support four common user tasks: find records that fit specific criteria, compare data, view/edit/add a single row's data, and take actions on records." "Batch actions usually involve a mechanism for selecting records (e.g., a checkbox for each record) and then a series of action buttons or menus above or below the table"; a Select All shortcut when whole-set actions are common. NN/g's three bulk-action guidelines: provide a Select All option, use a contextual action bar, give clear feedback with the option to undo.
   Sources: https://www.nngroup.com/articles/data-tables/ ; https://www.nngroup.com/videos/bulk-actions-design-guidelines/
   Applies here: the list view is the table; selection on either chart or list feeds one shared action bar (Rate, Assign unit, Set leader, Call list, SMS, Email) with count, Select all in unit, and undo toast.

4. **Design-system selection patterns.** Polaris index tables "provide a scannable list with search, filtering, sorting, and bulk actions"; "Use checkboxes for bulk selection, reveal row actions on hover, and include pagination for large data sets." Material: "Item selection allows users to apply actions to selected items"; "To exit selection mode, deselect all items or perform an action on selected items using the toolbar"; entering multi-select via long-press on touch. Broadstripes' toolbar holds "a master checkbox beside the all and page buttons", four grouped menus "Actions, Communications, Reports and Maps", and "a selection count and a Clear selection link".
   Sources: https://shopify.dev/docs/api/app-home/latest/patterns/compositions/index-table ; https://m1.material.io/patterns/selection.html ; https://help.broadstripes.com/docs/viewing-search-results-and-edit/bulk-actions/bulk-actions
   Applies here: long-press a tile on mobile / checkbox on desktop enters selection; the top bar becomes the action bar; "Clear selection" always visible.

5. **Prevent and soften destructive bulk mistakes.** "Confirmatory and destructive actions should be far apart from each other"; "For particularly dangerous operations, require a nonstandard action from the user to confirm"; better still, provide resilience so "the user could in fact undo"; heuristic 3 requires a "clearly marked 'emergency exit'" and "Support undo and redo." Broadstripes asks to "Assign (confirm) or Cancel" when a bulk leader assignment would overwrite an existing leader.
   Sources: https://www.nngroup.com/articles/proximity-consequential-options/ ; https://www.nngroup.com/articles/confirmation-dialog/ ; https://www.nngroup.com/articles/user-control-and-freedom/ ; https://help.broadstripes.com/docs/viewing-search-results-and-edit/bulk-actions/bulk-actions-assign-leader-remove-leader
   Applies here: bulk re-rating or re-assigning across units gets an undo window; bulk SMS/email gets a summary confirmation showing recipient count and unit names, with "Send" separated from "Cancel".

6. **Filter bar: keep applied filters visible; instant single filters, batched compound queries.** Baymard's finding above (28% omit the overview; users forget active filters) and NN/g's batch-vs-interactive guidance; NN/g's mobile "tray" pattern keeps results visible while facets are open, avoiding "the placement of facet controls on a separate screen".
   Sources: https://baymard.com/blog/how-to-design-applied-filters ; https://www.nngroup.com/articles/applying-filters/ ; https://www.nngroup.com/articles/mobile-faceted-search/
   Applies here: chips row + "Filters" tray that slides over the chart; the chart updates live for rating/leader/test toggles.

7. **Card/board vs list: cards group, lists sort.** "List view allows for easy sorting and is space efficient, while card view is visually engaging and creates effective groupings." Kanban-style boards in Linear/Jira default to one grouping dimension with optional row sub-grouping and an option to hide empty columns (Section D).
   Sources: https://www.nngroup.com/videos/card-view-vs-list-view/ ; https://linear.app/docs/board-layout
   Applies here: wall chart (tiles in unit columns) for grouping and glanceable strength; list view for sorting, comparing and editing; both share group selector, filters and selection.

8. **Make important information salient; defer secondary detail without leaving the screen.** "8. Make Important Information Visually Salient"; "7. Ease Transition Between Primary and Secondary Information"; contextual menus should "group together actions that logically belong to the same object".
   Sources: https://www.nngroup.com/articles/complex-application-design/ ; https://www.nngroup.com/articles/contextual-menus-guidelines/
   Applies here: tile tap opens a side panel (rating history, leader, contact, notes, tests) over the chart; the per-tile "⋯" menu holds only worker-level actions.

9. **Persist per-user view state.** Linear display options "persist even if you navigate away"; Trello filters "stay in place until you dismiss"; Broadstripes saved searches and layouts are "personal or shared".
   Sources: https://linear.app/docs/display-options ; https://support.atlassian.com/trello/docs/filtering-for-cards-on-a-board/ ; https://help.broadstripes.com/docs/start-project/user-roles-and-permissions
   Applies here: returning to a campaign restores last group, filters, sort, scroll and selection; leads can share named views ("Night shift, unrated").

10. **Trend, not just snapshot.** Action Builder's Trend View shows assessment change over "days, weeks, or months", scoped to the units a user can see.
    Source: https://actionbuilder.zendesk.com/hc/en-us/articles/35138491276308
    Applies here: a small "since last structure test" delta per unit gives the campaign-level dashboard organisers actually asked for at MNA ("top issue by department, connections and leaders").

---

## G. Mobile and field use

1. **Touch targets: at least 1 cm × 1 cm, bigger when the user is moving; spacing matters as much as size.** "Interactive elements must be at least 1cm × 1cm (0.4in × 0.4in) to support adequate selection time and prevent fat-finger errors"; "if an app ... is to be used when the user is moving, targets will be harder to hit and thus should be bigger"; stacked thin buttons "too close to each other" cause mis-taps.
   Source: https://www.nngroup.com/articles/touch-target-size/
   Applies here: rating pickers and tiles on the mobile wall chart need ≥ 1 cm hit areas with gaps; a five-button rating row, not a dropdown.

2. **Plan for offline and dropped signal; save state; minimise typing; fix the workflow before mobilising it.** NN/g's enterprise-mobile report: "Plan for offline viewing because of connectivity outages ... Design sites and apps that store data, save state and remember what the user was doing when the signal dropped." "Create task flows that minimize data input whenever possible. Selecting from a list, searching a set list of options or auto-suggestions can all help." "If an offline or desktop-based workflow isn't streamlined or logical, a mobile design based on it won't be either ... redesign the process first, before taking it mobile." Supporting "people in the field" was the top driver (cited by "79.2%" of projects).
   Source: NN/g free research report, Mobile Intranets and Enterprise Apps: https://media.nngroup.com/media/reports/free/Mobile_Intranets_and_Enterprise_Apps.pdf (report page: https://www.nngroup.com/reports/enterprise-mobile-showcase/)
   Applies here: cache the active campaign's units and tiles; queue ratings, notes and call outcomes offline with a visible sync state; all field entry via taps and pick-lists.

3. **Field data-collection practice: offline-first, glove-friendly, skip logic, short forms.** "Reliability in the field depends on an app's ability to function without a data connection"; "Intuitive touch controls and layouts that minimize typing allow users to input data accurately with one hand, even when wearing gloves"; skip logic streamlines; "Trying to collect too much data leads people to abandon a survey midway." MiniVAN: "MiniVAN data is automatically committed to your database to make sure you don't lose any data", with turf lists and quick "Not Home" outcomes.
   Sources: Fulcrum (field data-collection vendor): https://www.fulcrumapp.com/blog/best-practices-for-creating-mobile-apps-for-data-collection/ ; NGP VAN: https://www.ngpvan.com/blog/canvassing-with-minivan/
   Applies here: a "log a conversation" quick action (who, outcome, rating, one-line note) and call-list outcomes as one-tap buttons; auto-commit every entry.

4. **Do not port the desktop chrome unchanged; but do not hide desktop navigation to match mobile either.** "Porting an unchanged UI to a different platform hurts UX"; "hiding navigation under a menu significantly decreases the use of the navigation".
   Source: https://www.nngroup.com/articles/mobile-first-not-mobile-only/
   Applies here: on phones the wall chart collapses to one unit at a time with a unit picker and a bottom action bar; on desktop keep the campaign rail and group chips visible.

5. **Gestures need visible cues.** "Swiping is still less discoverable than most other ways of manipulating mobile content, so we recommend including a visible cue when people can swipe."
   Source: https://www.nngroup.com/articles/mobile-usability-2nd-study/
   Applies here: if swiping moves between units, show peeking unit headers or dots; never make swipe the only path.

6. **Comparable tools are mobile-first for organisers and desktop-only for admin work.** Action Builder "was designed to provide a seamless mobile experience"; the Wall Chart shows "icons for emailing, calling, texting or pulling up a map" that open the device's apps; but "certain tools, such as the uploads tool, be used on a computer ... limited to organization admins." Broadstripes' texting sends "an SMS text to multiple workers at once, for instance, all the workers in a given shop or department" via virtual numbers so "organizers don't have to give out their real cell numbers".
   Sources: https://actionbuilder.zendesk.com/hc/en-us/articles/22284384113172 (Getting Started); https://actionbuilder.zendesk.com/hc/en-us/articles/22306100963092-Wall-Chart ; https://help.broadstripes.com/docs/communications/text-messaging
   Applies here: this maps directly to your split — organiser campaign view is phone-ready; imports, employer database and strategic planning are desktop/admin surfaces.

7. **Mobile facets in a tray keep results visible.** See the NN/g tray pattern (Section F.6): https://www.nngroup.com/articles/mobile-faceted-search/
   Applies here: group selector and filters open as a bottom sheet over the chart on mobile.

---

## H. Measuring success

1. **Qualitative formative testing: 5 users per round, many rounds; more when user groups differ.** "The best results come from testing no more than 5 users and running as many small tests as you can afford"; the first five find "85% of the usability problems"; "You need to test additional users when a website has several highly distinct groups of users."
   Source: https://www.nngroup.com/articles/why-you-only-need-to-test-with-5-users/ ; https://www.nngroup.com/articles/how-many-test-users/
   Applies here: test 5 organisers and 5 admins/senior users per iteration; three rounds (wireframe → clickable → build).

2. **Quantitative benchmarks need 20–40 participants.** "Quantitative studies (aiming at statistics, not insights): Test at least 20 users"; "40 participants is an appropriate number for most quantitative studies" (15% margin of error at 95% confidence); "Card sorting: Test at least 15 users per user group." Benchmark studies "measure one or more KPIs ... so that you can tell whether a redesign has measurably better (or worse) usability."
   Sources: https://www.nngroup.com/articles/summary-quant-sample-sizes/ ; https://www.nngroup.com/videos/benchmark-usability-testing/
   Applies here: with a small organiser population, run a pre/post benchmark on the whole population (likely 20–40) on the top tasks rather than sampling.

3. **Task success is the bottom line; report partial success levels and confidence intervals.** Success rate is "the percentage of users who were able to complete a task in a study"; "User success is the bottom line of usability"; grant partial credit by defined levels. Satisfaction only partly tracks performance: "users prefer the design with the highest usability metrics 70% of the time. But not 100%."
   Sources: https://www.nngroup.com/articles/success-rate-the-simplest-usability-metric/ ; https://www.nngroup.com/articles/satisfaction-vs-performance-metrics/
   Applies here: define top tasks (rate a worker, place an unassigned worker, build a night-shift call list, log a structure-test result, switch campaign and find a crew) and measure success, time and errors for each.

4. **Classify errors as slips vs mistakes to know what to fix.** "Slips occur when users intend to perform one action, but end up doing another"; "Mistakes occur when a user has developed a mental model of the interface that isn't correct."
   Sources: https://www.nngroup.com/articles/slips/ ; https://www.nngroup.com/articles/user-mistakes/
   Applies here: mis-rating a neighbouring tile is a slip (fix target size/spacing); putting a worker in the wrong group is a mistake (fix the universe→group→unit model or labels).

5. **Think-aloud is the first tool; field/context methods first for discovery.** "Simple usability tests where users think out loud are cheap, robust, flexible, and easy to learn." Context methods "involve studying users in their real-life environments ... environments, workflows, tools, pain points, and habits" (diary studies, field studies, contextual inquiry). Remote sessions can be moderated ("facilitator is watching the usability test remotely as it happens") or unmoderated.
   Sources: https://www.nngroup.com/articles/thinking-aloud-the-1-usability-tool/ ; https://www.nngroup.com/articles/context-methods-field-diary-studies/ ; https://www.nngroup.com/articles/field-studies/ ; https://www.nngroup.com/articles/remote-usability-tests/
   Applies here: a one-week diary study with organisers on swing (when do they open the app, on what device, what do they fail to record) before wireframing; remote moderated think-aloud for the wizard and wall chart.

6. **Card sorting generates the IA; tree testing evaluates it; keep card labels neutral.** "Card sorting is used to generate ideas for an IA while tree testing is used to evaluate IA options"; tree testing assesses "the findability of resources after you have created your proposed navigation hierarchy"; "Labels in a card sorting study must be neutral to prevent keyword matching."
   Sources: https://www.nngroup.com/articles/card-sorting-tree-testing-differences/ ; https://www.nngroup.com/articles/tree-testing/ ; https://www.nngroup.com/articles/card-sorting-terminology-matches/ ; https://www.nngroup.com/articles/card-sorting-definition/
   Applies here: card-sort the vocabulary (universe, group, unit, crew, structure test, plan) with organisers to check "group" and "unit" match their words; tree-test the two-level campaign/admin nav before building.

7. **Measure learnability with a learning curve; prioritise the plateau for daily users.** "Learnability is one of the five quality components of usability"; plot a learning curve, "Analyze the learning curve by looking at its slope and its plateau"; "Testing learnability is especially valuable for complex applications."
   Source: https://www.nngroup.com/articles/measure-learnability/
   Applies here: track time-to-rate-a-unit across an organiser's first five sessions; the redesign succeeds if the plateau (expert speed) is not worse than today's while the slope is steeper.

8. **Standardised questionnaires: SUS (10 items, 0–100, mean 68) and UMUX-Lite/UX-Lite (2 items) for a pulse.** Brooke: SUS "is a simple, ten-item scale giving a global view of subjective assessments of usability"; "SUS scores have a range of 0 to 100." MeasuringU: "The average SUS score to be a 68"; "SUS Scores are not percentages." UMUX-Lite items: "{System} is easy to use" and "{System}'s capabilities meet my requirements", from Lewis, Utesch & Maher (2013), with "excellent psychometric properties (reliability, concurrent validity, sensitivity)".
   Sources: Brooke, "SUS: A quick and dirty usability scale" (original paper): https://hell.meiert.org/core/pdf/sus.pdf ; MeasuringU: https://measuringu.com/10-things-sus/ ; https://measuringu.com/evolution-of-the-ux-lite/ ; https://measuringu.com/umux-lite/
   Applies here: SUS pre/post redesign for organisers (target: move from below to above 68); UMUX-Lite as a two-question in-app pulse after each release.

9. **Heuristic evaluation with several evaluators before user testing; top tasks as the shared yardstick.** Heuristic evaluation: "Evaluators judge the design against a set of guidelines"; steps are prepare, "Evaluate Independently", "Consolidate Identified Issues". Top Tasks: "a list of 10 or fewer activities that users should be able to achieve ... If people can't do these things, the design has failed."
   Sources: https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/ ; https://www.nngroup.com/videos/top-tasks-ux-design/ ; complex-app heuristics: https://www.nngroup.com/articles/usability-heuristics-complex-applications/
   Applies here: run a three-evaluator heuristic review of the prototype against Nielsen's 10 (especially 6, 7 and 8) and score every finding against the top-task list.

---

## Top 15 principles to apply (with best citation)

1. **The wall chart is the home and the workbench; most tasks complete from it.** Action Builder Wall Chart: https://actionbuilder.zendesk.com/hc/en-us/articles/22306100963092-Wall-Chart
2. **Scope visibility by campaign; admins switch features on per campaign to remove clutter.** Action Builder Getting Started Guide: https://actionnetwork.org/user_files/user_files/000/062/020/original/Action_Builder_Guide.pdf
3. **Two disclosure levels, split by frequency of use.** NN/g Progressive Disclosure: https://www.nngroup.com/articles/progressive-disclosure/
4. **Hide only what a user can never use; mute-and-explain the rest; never bury primary navigation.** Nielsen, Inactive GUI Controls: https://jakobnielsenphd.substack.com/p/inactive-buttons ; NN/g hidden-navigation study: https://www.nngroup.com/articles/hamburger-menus/
5. **Adaptable (admin/senior-configured), not adaptive (self-changing) simplification.** Findlater & McGrenere, CHI 2004: https://www.cs.ubc.ca/labs/imager/tr/2004/findlater04menus/
6. **Standalone-by-default, self-contained campaigns (team-managed) with an optional standardised, admin-owned mode (company-managed).** Atlassian: https://support.atlassian.com/jira-software-cloud/docs/what-are-team-managed-and-company-managed-spaces/
7. **Groups are facets over one universe: one dimension by default, additive sub-grouping capped at 2–3 levels, empty units hideable.** Linear display options: https://linear.app/docs/display-options ; Airtable grouping: https://support.airtable.com/docs/grouping-records-in-airtable
8. **"Unassigned" is a real, visible, positionable lane and a selectable filter value.** Jira swimlanes: https://support.atlassian.com/jira-software-cloud/docs/configure-swimlanes/ ; Labor Notes "one row for each worker": https://www.labornotes.org/sites/default/files/Secrets%20Handouts%20Part%20Two-%20Assembling%20Your%20Dream%20Team.pdf
9. **Always show applied filters and the active group as chips; persist view state per user.** Baymard: https://baymard.com/blog/how-to-design-applied-filters ; Linear persistence: https://linear.app/docs/display-options
10. **Overview → zoom/filter → details on demand; encode quantity with length, category with colour+shape+label.** Shneiderman: https://www.cs.umd.edu/~ben/papers/Shneiderman1996eyes.pdf ; NN/g dashboards: https://www.nngroup.com/articles/dashboards-preattentive/
11. **Selection + contextual action bar + count + Select all + undo for every bulk action.** NN/g data tables and bulk actions: https://www.nngroup.com/articles/data-tables/ ; https://www.nngroup.com/videos/bulk-actions-design-guidelines/
12. **Setup is a resumable wizard with one decision per step, strong defaults labelled "change later", and create separated from configure; the empty states do the rest.** NN/g Wizards: https://www.nngroup.com/articles/wizards/ ; GOV.UK question pages: https://design-system.service.gov.uk/patterns/question-pages/ ; NN/g empty states: https://www.nngroup.com/articles/empty-state-interface-design/
13. **No tours; a 3–5 item event-driven checklist and contextual first-use hints.** NN/g onboarding tutorials: https://www.nngroup.com/articles/onboarding-tutorials/ ; Appcues: https://docs.appcues.com/checklist-best-practices
14. **Mobile: ≥1 cm targets, offline queue with saved state, tap-not-type logging, redesign the workflow before mobilising it.** NN/g touch targets: https://www.nngroup.com/articles/touch-target-size/ ; NN/g enterprise-mobile report: https://media.nngroup.com/media/reports/free/Mobile_Intranets_and_Enterprise_Apps.pdf
15. **Measure with top-task success/time/errors, a learning curve, SUS pre/post and 5-user think-aloud rounds; card-sort the vocabulary and tree-test the nav first.** NN/g: https://www.nngroup.com/articles/success-rate-the-simplest-usability-metric/ ; https://www.nngroup.com/articles/why-you-only-need-to-test-with-5-users/ ; https://www.nngroup.com/articles/card-sorting-tree-testing-differences/ ; Brooke SUS: https://hell.meiert.org/core/pdf/sus.pdf
