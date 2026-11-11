# Starting the Fable build session

1. Open a Claude Code session with **`C:\Users\kutti\Downloads\fitbit air\Fitbit-air-app`** as the working
   directory and choose the Fable model.
2. Paste the whole of `docs/fable/APEX_FABLE_MASTER_PROMPT_V4.1.md` as the first message
   (v4.1 = the original v4.0 plus the Pulse design reference, the new navigation and this workspace layout).
3. Let it run M0 (audit + baseline) first. It will pick up `CLAUDE.md` automatically.

What is already prepared:
- Workspace organised: this repo, `reference/` (categorised third-party code, read-only), `../prompts/`.
- `:core:ui` theme foundation: Pulse-derived colour tokens (light + dark), Figtree/Barlow type roles with
  bundled OFL fonts, radii/spacing/dial/motion tokens, `ApexTheme`, contrast test.
- `docs/design/DESIGN_SYSTEM.md`: the design source of truth and the Pulse → Apex screen map.
- `docs/REFERENCES.md`: what each reference repo is good for, and licence limits.
- Local build environment verified (JDK 21 + Android SDK paths in `CLAUDE.md`; `local.properties` set).

Decisions the owner may still want to revisit before the long run (all recorded in prompt v4.1 §3):
- Navigation follows Pulse (Overview · Health · Journal · More + Coach button) instead of v4.0's five tabs.
- Strain stays 0-21 (engine scale) although Pulse displays a percent.
- Pulse-only features without an Apex engine (Pulse Age, Stress Monitor, Energy Bank, ...) are out of scope.
