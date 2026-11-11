# KIP colour

Date: 2026-10-13 · Branch: `feature/home-f` (stacked on `feature/profile-activity`) · Status: design approved by the owner; revised after the spec review (§6); awaiting the owner's review

The first of two specs. Home F (`2026-10-13-home-f-design.md`) builds on this one.

Each user picks the colour of their KIP. Buddies see that colour, and every person in the app is drawn as a KIP in
their colour, with a pose that follows their mood. The AI coach keeps its own character.

Boards: "Profile · colour picker" (`docs/design/home/project/Picker.dc.html`) and the KIP colour page in "S2 pages ·
KIP colour, Sign-in & devices, Delete account" (`SC4.dc.html`).

## 1. The colours

The 10 colours of the KIP v1 scope (owner, 2026-10-10), already in `mobile/src/lib/kip/kipArt.ts` as `KIP_COLOURS`:
coral #FB7185 (the default), cobalt #3B82F6, ink #2A2F3A, lemon #FDE047, lilac #C4B5FD, lime #A3E635, mint #6EE7B7,
sky #7DD3FC, slate #64748B and snow #F1F5F9.

The colour is stored and sent by **name** (`'coral'`, `'cobalt'`, …), never by hex.

## 2. Backend

- **Schema:** `User.kipColour String @default("coral")`, with a migration. Existing users read as coral.
- **Validation:** one shared list of the 10 names in the backend (`backend/src/kip/colours.ts`). A stored value
  outside the list reads back as `'coral'`.
- **Save:** `PUT /me/kip-colour` with `{ colour }`.
  - It returns `{ kipColour }`.
  - A name outside the list is a 400 `{ error: 'invalid_colour' }`.
  - It requires auth, like every `/me` route.
- **Your own colour:** `GET /me/buddies/me` (the identity read the passport already uses) adds `kipColour`.
- **Everyone else's colour:**
  - **`Person`.** The shared `Person` record (`backend/src/buddies/people.ts`) adds `kipColour` next to `coachId`. It
    reaches the buddy list, requests, buddy week, stories, camp members, camp notes and chats.
    - Someone who isn't your buddy sees your colour only when you send them a request. That is fine (owner, 2026-10-13).
  - **The camp banner.** The Social home's `camp.faces` (`backend/src/social/home.ts`) is a list of coach IDs, not
    people. It gains `faceColours: string[]`, in the same order as `faces`: the colour of each buddy who checked in.
    `faces` stays as it is, so older apps keep working.
- **Never logged:** the colour is not health data, but it follows the logging rules anyway. No user IDs with values in logs.

## 3. Mobile

### Data

- `api/kip.ts`: `saveKipColour(colour)`.
- `Person` and `BuddyIdentity` gain `kipColour?: KipColour`. The Social home's `camp` gains `faceColours?: string[]`.
- `kipColourOf(value)` reads a missing or unknown name as coral. That covers an older server.
- **`lib/kip/myKipColour.ts`** is a small store with a `useMyKipColour()` hook:
  - **Loads** once per sign-in, from the identity read (`fetchIdentity`, `GET /me/buddies/me`). It is started by the signed-in app
    shell, so Home, Activity and Profile all read the same value without each fetching it.
  - **Defaults to coral** until the read lands, or if it fails. A failed read is retried on the next sign-in or the
    next save. It never blocks a screen.
  - **Updates** on a successful save.
  - **Clears** on sign-out and on account deletion, so the next account never sees the previous colour.

### The picker (Profile)

- **The card.** `ProfileCategory` gains `'kipColour'`. Its card comes **first** in the hub's settings grid, with a 10 × 10 pixel palette icon
  in `lib/profileArt.ts` (like the other cards) and the label "KIP colour". Its status line is the colour's name, for example "Coral".
- **The page.** The card opens `ProfileSection` with the `kipColour` section, laid out as on the Picker board:
  1. **Preview card:** the board's small scene with your KIP waving, large (scale 6).
     - In the top-left corner: the label "YOUR KIP" (`SectionLabel`), then the colour's name and hex, for example
       "Coral · #FB7185".
     - The preview is one image, labelled "Your KIP in Coral".
  2. **"Colour"** (`SectionLabel`), with the line "Buddies see this colour" under it.
  3. **Swatches:** a `View` with `accessibilityRole="radiogroup"`, labelled "KIP colour", holding 10 swatches in two
     rows of five.
     - Each swatch is a `Button` (`rounded-lg`, 56 points tall) holding only the colour square. The picked swatch is
       the `default` variant and the rest are `outline`.
     - Each has `accessibilityRole="radio"`, the colour's name as its label, and `accessibilityState={{ checked }}`.
     - The colour's name is shown under each swatch, in `text-fine`. It is bright when picked and muted otherwise.
  4. **Two buttons, side by side in two columns:**
     - **"Reset to coral"**, an outline `Button`. It only changes the selection.
     - **"Save colour"**, a default `Button`.
       - It is disabled while the picked colour equals the saved one.
       - While it saves, it shows the button's loading state.
       - On success, the store updates and the page stays open.
       - On failure, an inline error appears with "Try again", and the saved colour is unchanged.
- Nothing changes anywhere until Save succeeds.
- All strings go in `profileCopy.ts`.

### Your KIP in your colour

These use `useMyKipColour()` in place of the hard-coded coral:

- the Profile passport photo (`Passport.tsx`);
- the Activity header (`ActivityHeader.tsx`);
- Home: the scene and the Profile button (Home F spec).

### People as KIPs

#### `PersonKip`

`PersonKip` (`components/kip/PersonKip.tsx`) is **the one way to draw a person**, everywhere, including the Home scene.

- Props: `{ colour?: KipColour; state?: PersonState; size: number; testID? }`.
- `PersonState` is `'good' | 'ok' | 'low' | 'none' | 'asleep'`. The default is `'none'`. The same mood draws the
  same pose on every screen (owner, 2026-10-13):

| State | Pose | Mood |
| --- | --- | --- |
| `good` | cheer | proud |
| `ok` | wave | idle |
| `low` | rest | determined |
| `none` | rest | idle |
| `asleep` | rest | sleepy |

- **Size and cropping.** `size` is the box in points. `PersonKip` crops the engine's 16 × 16 grid to the cells this
  variant actually draws (its bounding box). The scale is then the largest whole number of points per cell that
  fits that box in `size`, with a minimum of 1. It is drawn centred in the box.
  - For example, at rest the KIP with its ground shadow is 10 × 10 cells, so a 26-point slot draws at 2 points
    per cell (20 × 20) instead of 1. That keeps the pixels crisp at small sizes, and centres the body in round avatars instead of leaving it low.
- It is decorative and hidden from screen readers; the row around it carries the name.

#### Where it replaces the coach character

`PersonKip` replaces `<Character characterId={…coachId…}>` **wherever the character stands for a person** (a buddy,
or you):

| Where | File | State |
| --- | --- | --- |
| Buddy list rows | `components/buddies/BuddyListRow.tsx` | the buddy's mood |
| Buddy week | `screens/BuddyWeekScreen.tsx` | the buddy's mood |
| Chat avatars | `components/chats/ChatAvatar.tsx` | `none` |
| Chat requests | `components/chats/RequestsList.tsx` | `none` |
| Stories row | `components/social/StoriesRow.tsx` | `none` |
| Story frames | `components/social/SocialStoryFrame.tsx` | `asleep` for a goodnight frame, else `none` |
| Camp note cards | `components/social/CampNoteCard.tsx` | `none` |
| Camp scene | `components/social/CampScene.tsx` | `asleep` when asleep, else `none` |
| Camp banner | `components/social/CampBanner.tsx` | `none`, with colour from `faceColours[i]` |
| Campfire screen | `screens/CampfireScreen.tsx` | `asleep` when asleep, else `none` |
| Pair up | `screens/PairUpScreen.tsx` | `none`, with **your** colour (the sprite is you today) |

- Each swap keeps the size the character had.
- Where the drawn person is you (your story, you at the camp, your camp note, Pair up), the colour is
  `useMyKipColour()`. Otherwise it is the person's `kipColour`.
- `BuddiesRow` is not swapped: Home F deletes it on this branch.
- **The freeze on `CampScene.tsx` and `CampBanner.tsx` is lifted for this change only** (owner, 2026-10-13). The
  sprite element, its import and the colour lookup change; nothing else in those files does.

#### Coach wording on people's surfaces

These lines named the buddy's coach, because the coach was their picture. They change:

- **Buddy week:**
  - The "@handle · Coach: X" line becomes "@handle".
  - "{coach}'s week" becomes "This week".
  - `stickerSentLine` is passed the buddy's display name instead of the coach's name.
- **Pair up:** "Buddies always see your coach's mood." becomes "Buddies always see your KIP's mood."
- **Camp note composer:** "Shows above your coach until 6 AM…" becomes "Shows above your KIP until 6 AM…".

The strings move into their screens' copy modules if they are inline today.

#### The AI coach keeps its character

The coach keeps its character everywhere it stands for the coach: the Coach tab, the coach tile, the digest card,
thinking rows, Your coach, Meet your coach, recaps, onboarding, the tab bar and celebrations.

## 4. Rules that apply

- Every button is `ui/button.tsx` with `rounded-lg`. Any raw pressable with a button or radio role needs a
  conventions entry. The swatches are `Button`s, so they need none.
- Only the A4 type tokens; no inline font sizes.
- Strings live in copy modules.
- TDD: run the touched tests and both typechecks before every commit.

## 5. Tests

- **Backend:**
  - `PUT /me/kip-colour` saves a valid name, rejects an unknown one with 400, and requires auth.
  - `GET /me/buddies/me` returns `kipColour`, and coral for a new user.
  - The `Person` record carries `kipColour` in the buddy list and in requests.
  - The Social home's `camp.faceColours` lines up with `faces`.
  - A stored value outside the list reads as coral.
- **Mobile:**
  - `kipColourOf` falls back to coral for a missing or unknown name.
  - The store loads once per sign-in, defaults to coral on a failed read, updates on save, and clears on sign-out.
  - `PersonKip`:
    - the body colour follows `colour`;
    - each state draws its pose and mood;
    - the crop and scale at 26, 28, 32 and 96 points;
    - it is hidden from screen readers.
  - The picker page:
    - the radiogroup and the radio states;
    - Save is disabled until the selection changes;
    - Save calls the API and updates the store;
    - a failed save shows the error and keeps the old colour;
    - Reset selects coral.
  - The hub shows the KIP colour card first, with the colour's name.
  - The passport and the Activity header draw your colour.
  - For each swapped surface, its existing tests are updated, and they assert that a `PersonKip` with the right
    colour and state is drawn where the coach character was. The new wording is covered on buddy week, Pair up and
    the camp note composer.

## 6. Spec review (2026-10-13)

A reviewer checked this spec against the code and the boards. Fixed here:

- the camp banner's coach-ID-only data (`faceColours`);
- one way to draw a person, with mood poses everywhere (owner);
- cropping so small slots stay crisp and centred;
- the coach wording on buddy surfaces;
- the picker matched to its board;
- the store's lifecycle;
- `BuddiesRow` dropped from the swaps.
