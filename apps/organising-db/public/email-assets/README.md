# Email wrapper assets

Images referenced by the platform email wrappers (`/email/wrappers`).
Anything in this folder is served publicly at
`https://oa.uconstruct.app/email-assets/<filename>` — email clients load
them from there, so the files must be committed and deployed before the
wrapper renders correctly in recipients' inboxes.

Expected files (referenced by the "OA Standard" wrapper):

| File | Content | Guidance |
| --- | --- | --- |
| `oa-banner.png` | OA logo banner ("OFFSHORE ALLIANCE — Your Oil & Gas Union") | ~1200px wide (renders at 600px for retina), PNG or JPG, < 200 KB |
| `oa-fight.png` | "IF YOU DON'T FIGHT, YOU LOSE!" campaign image | ~560px wide (renders at 280px), < 300 KB |
| `oa-qr.png` | QR code (join link) | square, ~180px (renders at 90px), < 50 KB |

To add/update: drop the files into this folder with those exact names,
commit, push to `main`, and wait for the Vercel deploy. No wrapper edit is
needed unless the filenames change.
