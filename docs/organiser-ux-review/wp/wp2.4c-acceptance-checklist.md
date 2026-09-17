# WP2.4c — operator acceptance checklist (HT-a)

Preview: `________________________________________` (paste it here before you start)

**Where to find that address.** Open the pull request directly:
<https://github.com/R3v3ill3/OffshoreAlliance/pull/49> ("fix(oux-wp2.4c): nesting within a group on the groups_v2 wall
chart", branch `feat/oux-wp2.4c-nested-units`). Scroll to the Vercel comment near the top of the conversation and click
**Visit Preview** — or, at the bottom of the page, the **Preview** link beside the Vercel check. The address looks like
`https://offshore-alliance-git-feat-oux-wp24c-…-reveille-strategy.vercel.app`. It is the **dev** database (the normal
dev project), the same data WP2.4's checklist used; nothing here touches production. If the Vercel comment has not
appeared yet, give it a couple of minutes after the last push and reload the page.

Plan: `wp/wp2.4c.md` §4.6 steps 0–12 (written out here as steps 0–14). The orchestrator records your results in §9.2 as the acceptance evidence for
this package. Each numbered item ends with the one sentence you should be able to say is true. If an item does not
match, write down what you saw (the campaign, the worker's name, the unit names) and carry on with the next one.

---

> ### ⚠️ Read this before you press Delete on anything
>
> **Delete… on a unit card deletes everything underneath that unit.** If you delete a worksite card, its shifts (and
> any other unit sitting under it) are deleted with it, and every worker's assignment to them is lost. The
> confirmation now says so: it reads "**<unit> is a group with N sub-units. Deleting it also removes those sub-units
> and their assignment rules.**" and the red button reads "**Delete group + N sub-units**".
>
> **Read that sentence and check the number N before you confirm.** If N is larger than you expect, press **Cancel**.
> In this checklist you only ever delete the two shift sub-units you create in step 1. Neither has anything under it,
> so each shows the ordinary "Delete organising unit?" dialog (or asks where to move the workers still on it) and
> never the "Delete group + N sub-units" one. You never delete the worksite itself.

---

Two accounts are used, exactly as in `wp/wp2.4-acceptance-checklist.md`: the **dev admin** (to turn the preview flag
on) and the **e2e user** (who then sees the new chart). "The wall chart" below means Campaigns → open a campaign →
**Workforce** tab → **Wall chart**.

## Step 0 — Setup: turn the preview on and open the chart

1. Open the preview address and sign in as the **dev admin**.
2. In the left sidebar open **Administration**, then **Users**. Find the e2e user's row and click **Edit**.
3. In the Workspace box tick **Groups v2 (wall chart preview)** and save.
   *Expected: the dialog closes without an error and the row saves.*
4. Sign out (your name at the bottom of the sidebar → Sign out) and sign in as the **e2e user**.
5. Open **Campaigns**, open campaign **1**, click the **Workforce** tab, and make sure **Wall chart** (not List) is
   selected at the top of the board.
   *Expected: the header row starts with a control labelled **Group** — that is the new chart. (If each unit card
   carries View / Badges / Sort / Filter controls instead, the flag did not save or you are signed in as the wrong
   user; repeat 0.1–0.4.)*
6. Open the **Group** control and choose **Worksite**. Write down the groups it lists — you will check this list
   again in step 2.
   *Expected: the cards below are the campaign's worksites, with a card titled **Unassigned in Worksite** last.*
7. If Worksite has no unit at all: click **Units (n)** in the header row → **New unit**, choose type **Worksite**,
   name it `Test site`, save; then choose Worksite in the Group control again.
   *Expected: a card named "Test site" is on the board.*
8. Pick the worksite card with **at least three workers** on it and write its name down — this checklist calls it
   **A**. Write down the names of three workers on it; call them **W1**, **W2** and **W3**. Pick a **second**
   worksite card with at least one worker and call it **B**, and that worker **W4**.
   *Expected: you have A, B and four worker names written down.*

## Step 1 — Build the shape: split A into two shifts

This is what campaign 42 looks like on production, built here by hand. Dev has no such shape until you make it.

1. On card **A**, click the **⋯** button (its tooltip reads "Unit actions") and choose **Split…**.
   *Expected: a dialog opens titled **Split "A" into sub-units**, showing four steps: Dimension, Sub-units, Assign
   workers, Review.*
2. Choose **Custom (define your own)** and click **Continue**.
   *Expected: the Sub-units step shows one empty row with a **Sub-unit name** box and a **Type** list.*
3. In that row type the name `Day` and set **Type** to **Shift**. Click **Add sub-unit**, and in the new row type
   `Night` with **Type** set to **Shift**. Click **Continue**.
   *Expected: two rows, "Day" and "Night", both of type Shift, and the Continue button is enabled.*
4. On **Assign workers**: tick **W1** in the member list on the left, then click **Assign** on the "Day" row; tick
   **W2** and click **Assign** on the "Night" row. Click **Continue**.
   *Expected: the Day row reads "Shift · 1 member" and the Night row reads "Shift · 1 member".*
5. On **Review**, look at the switch labelled **Keep workers in "A" too**.
   *Expected: the switch is **on** (this is the setting that keeps W1 and W2 on the worksite as well as on their
   shift). Leave it on.*
6. Click **Create 2 sub-units**.
   *Expected: the dialog closes and card **A** now contains two smaller cards, **Day** and **Night**, under the
   caption **Units in A**; W1 is inside Day and W2 inside Night; the rest of A's workers (including W3) are in A's
   own area above those two cards.*

## Step 2 — The Shift group is not offered as a view of its own

1. Open the **Group** control.
   *Expected: the list is the same as the one you wrote down in step 0.6 — **Shift is not listed**, even though two
   shift units now exist.*
   *Note (2026-09-17): the same rule applies to a **sector campaign** whose vessels or worksites are nested under Employer
   units (campaign 64): its Worksite group is sub-unit-only and is absent from this list. That is expected under SG-a,
   not a bug (`PROGRESS.md` incidental findings 2026-09-17; plan §5.5 addendum).*
2. Close the list (press Escape) and look down the whole board.
   *Expected: there is no card anywhere titled "Unassigned in Shift"; the only Unassigned card is "Unassigned in
   Worksite".*

## Step 3 — What card A now says about itself

1. Look at A's header, under its name.
   *Expected: it reads "**<n> in unit · <m> not yet in a sub-unit**" — the first number counts everyone in A
   including the two on shifts, the second counts only those in A's own area.*
2. Look at the badges beside A's name.
   *Expected: a grey badge reads "**2 sub-units**".*
3. Hover over (or click into) the "<n> in unit · <m> not yet in a sub-unit" text.
   *Expected: its tooltip reads "Select all in **A's own area** (…)" — clicking it selects only the tiles in A's own
   area, never the ones inside Day or Night.*

## Step 4 — Drag from A's own area into a sub-unit

1. Drag **W3**'s tile from A's own area onto the **Day** card inside A.
   *Expected: W3's tile is now inside Day, and A's header count "<n> in unit" has not changed (only the "not yet in a
   sub-unit" number went down by one).*
2. Click W3's name to open their sheet, and open its **Units** tab. Then close the sheet (Escape).
   *Expected: it lists two lines — "**Worksite › A**" and "**Shift › Day**".*

## Step 5 — Drag from one sub-unit to the other

1. Drag **W3**'s tile from **Day** onto **Night**.
   *Expected: the tile is now inside Night and Day no longer shows it.*
2. Open W3's sheet → **Units** tab. Close the sheet.
   *Expected: it lists "**Worksite › A**" and "**Shift › Night**" — the worksite line is unchanged.*

## Step 6 — Drag back out of the sub-units into A's own area

1. Drag **W3**'s tile from **Night** onto **A's own name/header area** at the top of A's card — not onto Day or
   Night.
   *Expected: the tile is back in A's own area, and neither Day nor Night shows it.*
2. Open W3's sheet → **Units** tab. Close the sheet.
   *Expected: it lists **only** "**Worksite › A**" — the shift line is gone (leaving a worksite's shifts means leaving
   the shift).*

## Step 7 — Drag a worker in from another worksite

1. Drag **W4**'s tile from card **B**'s own area onto the **Day** card inside A.
   *Expected: the tile is inside Day, and B no longer shows W4 anywhere.*
2. Open W4's sheet → **Units** tab. Close the sheet.
   *Expected: it lists "**Worksite › A**" and "**Shift › Day**", and **B is not listed** — one drag moved both the
   worksite and the shift.*

## Step 8 — Drag out of the group altogether

1. Drag **W4**'s tile from **Day** onto the **Unassigned in Worksite** card at the bottom.
   *Expected: the tile is in the Unassigned card and appears nowhere inside A.*
2. Open W4's sheet → **Units** tab. Close the sheet.
   *Expected: it lists **neither** a Worksite line **nor** a Shift line (the shift went with the worksite).*
3. Choose **Not in any group** in the Group control, then switch back to **Worksite**.
   *Expected: W4 is listed in the "Not in any group" card.*

## Step 9 — "Remove from Worksite" clears the shift too

1. With **Worksite** selected, hold **Ctrl** (**⌘** on a Mac) and click **W1**'s tile inside **Day** so it is
   selected; a bar appears above the chart. Click **Remove from Worksite** and confirm **Remove**.
   *Expected: W1's tile moves to **Unassigned in Worksite**, and it is no longer inside Day.*
2. Open W1's sheet → **Units** tab. Close the sheet.
   *Expected: it lists neither "Worksite › A" nor "Shift › Day" — removing someone from the worksite also took them
   off the worksite's shift.*

## Step 10 — Filters and roll-ups

1. Click **Filter** in the header row and tick a **Cumulative rating** that the worker inside **Night** (that is W2)
   does **not** have, then click away.
   *Expected: with **Show empty units** off, the Night card disappears from inside A, and a line under the cards reads
   "N empty units hidden — turn on Show empty units to see them" (N counts Night and any other card the filter
   emptied).*
2. Look at A's header count while the filter is on.
   *Expected: the "<n> in unit" number still counts the worker inside Night — a roll-up counts everyone underneath,
   filtered or not.*
3. Click the × on the filter chip under the controls to clear the filter.
   *Expected: Night's card is back inside A.*

## Step 11 — The Units list and Find worker

1. Click **Units (n)** in the header row.
   *Expected: **Day** and **Night** are listed underneath **A**, indented, and the note reads "Hidden units are
   remembered for you on every device. Ordering is saved for everyone."*
2. Untick **Night** and click away.
   *Expected: the Night card is gone from inside A, but A's "<n> in unit" count has **not** changed — a hidden
   sub-unit's workers still count in the parent's roll-up.*
3. Leave Night unticked. Click **Find worker**, type **W2**'s name and choose them.
   *Expected: the search item reads "**A › Night**"; choosing it brings the Night card back inside A with a
   highlight ring and opens W2's sheet.* Close the sheet.

## Step 12 — What the ⋯ menus offer

1. Click **⋯** on the **Night** card (the small one inside A).
   *Expected: the menu lists Rename…, Set estimate…, Assign people…, Merge…, Delete… — and **no Split…** (a shift
   cannot be split again).*
2. Press Escape, then click **⋯** on card **A**.
   *Expected: the same menu **with** Split… in it.*
3. Still on A, choose **Delete…** — **do not confirm**.
   *Expected: the dialog reads "A is a group with 2 sub-units. Deleting it also removes those sub-units…" and the red
   button reads "Delete group + 2 sub-units".* Click **Cancel**.
4. Click **⋯** on **Day** → **Assign people…**. The **Add worker** dialog opens on its **From database** tab; type a
   name in "Search the worker database", pick someone who is **not** already in this campaign (their row says so),
   and click **Add to campaign**. Write their name down as **W5**.
   *Expected: the dialog closes and W5's tile appears inside **Day**; W5's sheet → Units tab lists both "Worksite › A"
   and "Shift › Day" — adding someone to a shift also puts them on the worksite.*

## Step 13 — The old chart is unchanged (optional, do it before the clean-up)

1. Sign in as the **dev admin** — an account without the preview flag (if the admin has it, untick **Groups v2 (wall
   chart preview)** for them first in Administration → Users) — and open campaign 1's wall chart.
   *Expected: the old chart renders A with Day and Night as before this package — unit cards with View / Badges /
   Sort / Filter controls and "Unassigned workers" at the top; nothing you did above changed it.*

## Step 14 — Clean up

Do all of this; it leaves campaign 1 as you found it apart from campaign membership for W5.

1. As the e2e user with the flag on, open campaign 1's wall chart with **Worksite** selected. For each of **W1**,
   **W2**, **W3**, **W4** and **W5**, drag their tile back to where step 0 found them (or Ctrl/⌘-click the tile and
   use **Move to unit…**, which lists targets as "A › Day" for a sub-unit).
   *Expected: each worker's sheet → Units tab shows the same lines it showed before you started.*
2. Click **⋯** on the **Night** card → **Delete…**.
   *Expected: the dialog is titled "Delete organising unit?" and says nothing about sub-units. If Night still has
   workers it asks where to move them instead — choose **Unassigned (remove from this unit only)**, which takes them
   off the shift and leaves them on the worksite. Confirm.*
3. Do the same on the **Day** card.
   *Expected: A has no "Units in A" section any more, no "2 sub-units" badge, and its header count is back to
   "<n> named".*
4. If you created "Test site" in step 0.7, delete it the same way.
   *Expected: the board is back to the worksites it had at step 0.*
5. Optionally, as the dev admin, untick **Groups v2 (wall chart preview)** for the e2e user.

## What to send back

For each numbered item: **pass**, or what you saw instead. Please also send the names you used for **A**, **B**,
**W1–W5**, and say whether anything was left behind at step 14. The orchestrator records the result in
`wp/wp2.4c.md` §9.2.
