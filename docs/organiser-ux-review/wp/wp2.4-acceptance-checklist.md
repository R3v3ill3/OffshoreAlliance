# WP2.4 — operator acceptance checklist (E2-b)

Preview: https://offshore-alliance-git-feat-oux-wp24-gr-ee1a8f-reveille-strategy.vercel.app (dev data — the normal dev
project, nothing here touches production). Plan: `wp/wp2.4.md` §4.5 steps 1–5; the orchestrator records your results
in §9.2 as the acceptance evidence for flows two and three. Each step ends with the one sentence you should be able
to say is true. If a step does not match, note what you saw (and the campaign / worker / unit names) and carry on.

Two accounts are used: the **dev admin** (to turn the preview flag on for one user) and the **e2e user** (who then sees
the new chart). "The wall chart" below means Campaigns → open a campaign → Workforce tab → Wall chart.

## Setup — turn the preview on for the e2e user

1. Open the preview URL and sign in as the **dev admin**.
2. In the left sidebar open **Administration**, then the **Users** section. Find the e2e user's row and click **Edit**.
3. In the Workspace box tick **Groups v2 (wall chart preview)** and save.
   *Expected: the dialog closes without an error and the row saves.*
4. Sign out (your name / menu at the bottom of the sidebar → Sign out). Sign in as the **e2e user**.
5. Open **Campaigns** and open campaign **1** (the deterministic dev campaign, 95 members / 4 units). Click the
   **Workforce** tab; make sure **Wall chart** (not List) is selected at the top of the board.
   *Expected: the chart's header row starts with a control labelled **Group** — that is the new chart. (If you still see
   the old chart with a "View" control on each unit card, the flag did not save or you are not signed in as the e2e
   user; repeat steps 1–4.)*

## Step 1 — flow two: the Group selector, `?group=` in the URL, per-group Unassigned

1. Look at the **Group** control. Open it.
   *Expected: it lists the campaign's groups (for example Employer, Worksite) in order, then **Not in any group** as the
   last entry.*
2. Choose a group, then look at the browser's address bar.
   *Expected: the address now contains `group=<a number>` (or `group=none` for Not in any group), and the cards
   below are the units of that group, with a card titled **Unassigned in <that group>** last.*
3. Press the browser's **reload** button, then remove `&group=…` from the address bar and press Enter (so the address has
   no `group=` at all).
   *Expected: the chart re-opens on the group you last chose (it is remembered for you on the server, not in the
   browser), and `group=<that number>` is written back into the address.*
4. Pick a worker who sits in a unit of the current group (say their name aloud; you will use them again). Switch to a
   **different** group with the Group control.
   *Expected: if the worker is not placed in any unit of the new group, their tile is now inside **Unassigned in
   <new group>**; the units of the old group are not on screen.*
5. Drag that worker's tile from the Unassigned card onto one of the new group's unit cards.
   *Expected: the tile moves into that card, and switching back to the first group shows the worker still in their
   original unit there (a placement in one group never changes another group).*
6. Click the worker's name to open their sheet and open its **Units** tab.
   *Expected: it lists one line per placement, each prefixed with its group, e.g. "Worksite › KGP" and
   "Employer › Acme", one per group.*

## Step 2 — flow three: drag to Unassigned, Remove from a group, Not in any group

1. With the second group still selected, drag the same worker's tile from the unit card onto **Unassigned in <group>**.
   *Expected: the tile lands in the Unassigned card; the sheet's Units tab now lists only the first group's placement.*
2. Switch to the first group. Hold **Ctrl** (⌘ on a Mac) and click the worker's tile so it is selected; a bar appears
   above the chart. Click **Remove from <group>** and confirm **Remove**.
   *Expected: the worker's tile moves to **Unassigned in <first group>**; the bar has no "Copy to unit…" button.*
3. Choose **Not in any group** in the Group control.
   *Expected: one card titled **Not in any group** lists everyone who has no unit in any group, including this worker.*
4. Put the worker back: select them (Ctrl/⌘-click), click **Move to unit…**, choose "<group> › <their original unit>",
   click **Move**.
   *Expected: the dialog lists units as "Group › Unit"; after Move, the worker is back in their original unit when you
   choose that group.*

## Step 3 — Colour by and Filter persist (server-side preferences)

1. In the header row change **Colour by** from Cumulative to any assessment.
   *Expected: every tile and every card's "Assessing:" line changes at once; a sentence under the controls names the
   assessment.*
2. Click **Filter**, tick one option under **Cumulative rating** (for example Unrated), and click away.
   *Expected: every card shows only matching tiles; the Filter button reads "Filter (1)"; a chip with a × appears
   under the controls; units left empty by the filter disappear and a line reads "N empty units hidden".*
3. Turn on the **Show empty units** switch.
   *Expected: the emptied unit cards reappear, empty.*
4. Reload the page.
   *Expected: Colour by, the filter chip and the Show empty units switch are exactly as you left them.*
5. Click the chip's × and turn Show empty units off again.
   *Expected: every tile is back; there is no per-unit View, Badges, Sort or Filter control on any unit card — each
   card carries only its rating buttons, its count and one **⋯** menu.*

## Step 4 — hidden units, Rename and Set estimate from the card menu

1. Click **Units (n)** in the header row.
   *Expected: the popover lists only the selected group's units and says "Hidden units are remembered for you on
   every device. Ordering is saved for everyone."*
2. Untick one unit and click away, then reload the page.
   *Expected: that unit's card is gone and stays gone after the reload; the button reads "Units (n−1/n)".*
3. Click **Find worker**, type the name of a worker in the hidden unit and pick them.
   *Expected: the hidden unit's card reappears with a highlight ring, and the worker's sheet opens.*
4. On any unit card open the **⋯** menu and choose **Rename…**; change the name and Save.
   *Expected: the card's title changes; the menu offered Rename…, Set estimate…, Assign people…, Split…, Merge…,
   Delete… and nothing else.*
5. Open **⋯ → Set estimate…**, enter a number larger than the unit's named count, Save.
   *Expected: the header reads "N named / M est." and grey placeholder cells appear for the unfilled slots. Set it back
   afterwards if you like.*

## Step 5 — the K1 message, the sync-on-open notice, and the legacy chart

1. Open a worker's sheet (click their name), go to the **Units** tab, click **Add to another unit**, open the target
   list.
   *Expected: units are listed as "Group › Unit"; a unit in a group where the worker already holds a unit is greyed
   out and marked "Already in this group — use Move."; the line "Already in this group — use Move." is shown under
   the list.*
2. The **sync-on-open notice**. Opening any campaign's Workforce board runs a universe sync. To make it change
   something: as the dev admin (or any writer), open a campaign whose **Who's in** (employers / worksites) you can edit,
   add an employer or worksite that has workers not yet in the campaign, then open that campaign's **Workforce** tab.
   *Expected: a bar above the chart reads "Sync on open: N workers added to this campaign, M placed in units, K already
   placed." (only the clauses with a non-zero count), with a × that dismisses it. Opening the tab again straight
   away shows no notice (nothing changed the second time). If no campaign's universe can be changed on dev, record
   "step 5.2 accepted on the jsdom board test" — the plan allows it (§4.5 step 5).*
3. As the dev admin, untick **Groups v2 (wall chart preview)** for the e2e user (Setup steps 1–3), sign in as the e2e
   user again and open the wall chart of campaign 1.
   *Expected: the old chart is back exactly as before the preview — unit cards each carry View / Badges / Sort / Filter
   controls, "Unassigned workers" is at the top, and nothing you changed above (hidden unit, filter, Colour by) is
   applied to it.*
4. Tick the flag on again only if you want to keep using the preview.

## What to send back

For each numbered item: **pass**, or what you saw instead. Please add the campaign id, the worker's name and the unit
names you used in steps 1–2, and, for step 5.2, which campaign's universe you changed (or that you accepted the jsdom
evidence). The orchestrator records the result in `wp/wp2.4.md` §9.2.
