# Design

Design mockups and the standards that came out of them. The older folders hold plain HTML files you can open in a
browser.

The canvas folders hold **design canvases**:
- each has a `project/canvas.json` index and one `*.dc.html` file per board;
- they render inside the Claude Design canvas they were published to, which serves the `support.js` runtime they need;
- they will not render as plain files.

The links below open the live canvases (private to the owner). The files here are the source, kept in git so the
designs are versioned.

| Folder | What it holds | Status |
|---|---|---|
| `coach-redesign/` | Coach page layout and answer-style explorations | Built |
| `companions/` | The buddy companion characters | Built (superseded by pixel coaches) |
| `pixel-coaches/` | The pixel coach cast, moods and thinking styles | Built |
| `buttons/` | The shadcn button standard, with no pills ([canvas](https://claude.ai/artifact/HigBcuphsKvfgXzmDSg18M)) | Built (PR #55, #57) |
| `type/` | Type system options; A4 picked: pixel page titles + Geist ([canvas](https://claude.ai/artifact/7ou763Rzm6Tbb9m8Pmrz8j)) | Built (PR #58) |
| `chats/` | Social S3 Chats mockups ([canvas](https://claude.ai/artifact/EvQZFuH1NJmDs8tdkwpZNz)) | Built (PR #56) |
| `campfire/` | Social S2 Campfire scene | Built (PR #54) |
| `recovery/` | 12 Recovery page directions, the chosen board (D weather + C calendar + bento), the weather art strip, and the deferred battery widget ([canvas](https://claude.ai/artifact/9v7waTGZ6abQfJQak2injD)) | Built (PR #59) |
| `sleep/` | The one Sleep page (draft 2) and the Home + Recaps shelf board ([canvas](https://claude.ai/artifact/XZsyFUXr7QTZK7h8SR37Tq)) | Built on `feature/sleep-page`; PR held |
| `character/` | The **KIP** mascot: rounds 1–9 and the final sheet (base + 22 skins). `scratch/kip-engine.js` is the drawing engine ([canvas](https://claude.ai/artifact/LY3oVnk2j3UipUuvX6BfdC)) | Design final; not built |
| `home/` | The Home redesign: A1–C3, D–F, the **approved F** with its weather states, Settings S1/S2 and their category pages, Activity A-1/A-2, and the Profile ID cards ([canvas](https://claude.ai/artifact/JtcyzBVmuyYgR6u3W7mVnb)) | Home F approved; Settings, Activity and ID card awaiting picks |

## Buttons

Every button in the app is the shadcn/ui Base Button port in `mobile/src/components/ui/button.tsx`. The standard
covers:
- variants by role, sizes, and labels on icon-only buttons;
- loading states and ButtonGroup;
- the 44-pt touch target and the Campfire panel buttons;
- what is not a button.

It is documented in [`mobile/src/components/ui/README.md`](../../mobile/src/components/ui/README.md), and
`mobile/__tests__/conventions/buttons.test.ts` enforces it.

## KIP at a glance

- **Base:** a 16×16 block with GROUNDED lighting (a shade side and a ground shadow). The whole ramp comes from one body
  colour.
- **Arms:** pose-only; they appear only in poses.
- **Version 1:** the default KIP in **coral #FB7185**. Users can switch to coral, cobalt #3B82F6, ink #2A2F3A,
  lemon #FDE047, lilac #C4B5FD, lime #A3E635, mint #6EE7B7, sky #7DD3FC, slate #64748B or snow #F1F5F9.
- **Later:** 22 animal skins, outfits, an idle loop and moods (see the final board).
