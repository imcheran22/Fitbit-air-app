# Buttons

`button.tsx` is the app's one button. It is shadcn/ui's Base Button ([docs](https://ui.shadcn.com/docs/components/base/button), the base-vega style) ported to React Native and NativeWind: the same variants, sizes and classes, with hover replaced by the pressed state.

Every button uses it. Do not hand-roll a button from `Pressable`, `PressableScale`, `TouchableOpacity` or `Text`. The same goes for text links. `__tests__/conventions/buttons.test.ts` fails if a file under `src` gives one of those the `button` or `link` role, or a computed role (`accessibilityRole={role}`). A scene colour, like the indigo of Say goodnight, goes on the standard Button through `className`, `style` or `textClassName`. It never justifies a bespoke component.

```tsx
import { Button } from '../components/ui/button';

<Button onPress={save}>Save</Button>
<Button variant="outline" onPress={cancel}>Cancel</Button>
```

## Variants: pick by role, not by look

| Role | Variant | Looks like |
|---|---|---|
| The main action on a screen, card or sheet | `default` | Neutral fill: near-black on light, white on dark |
| A secondary action beside the main one | `outline` | Hairline border on the card colour |
| A lone utility action (Try again, See more) | `secondary` | Soft grey fill |
| A utility action in dense UI, toolbars, headers | `ghost` | No fill until pressed |
| Delete, remove, unpair, block | `destructive` | Red text on a red tint |
| Inline navigation text (See all, Open Settings, Why this score), or a quiet inline text action (Edit, Undo, Reset) | `link` | Underlined text, no height or side padding |

Teal is not a button colour. It stays for accents.

A `link` gets `accessibilityRole="link"` by default, every other variant `button`. A `link` that acts in place instead of navigating (Edit, Undo, Reset, sync now) passes `accessibilityRole="button"`.

### Try again

One rule for every retry:

- **A full-screen error state** (the screen has nothing else to show): `variant="secondary"` at the default size, centred with the message.
- **Everywhere else** (inside a Card, a sheet, a section or a column): `variant="secondary" size="sm"`, hugging its label. Never stretch it to full width: add `self-start` in a left-aligned card or column; a card that centres its content (`items-center`) centres it already.

```tsx
// Full-screen error
<View className="flex-1 items-center justify-center gap-4 px-8">
  <Text className="text-center text-muted-foreground">Patterns are unavailable right now.</Text>
  <Button variant="secondary" onPress={retry}>Try again</Button>
</View>

// In a card
<Card className="gap-3">
  <Text className="text-caption text-muted-foreground">Your recaps could not be loaded.</Text>
  <Button variant="secondary" size="sm" className="self-start" onPress={retry}>Try again</Button>
</Card>
```

The story viewers are the exception: their retry sits on the story's own colour and follows the scene's buttons.

## Sizes

| Size | Height | Label | Use |
|---|---|---|---|
| `xs` | 24 | `text-fine` (11) | Chips and tiny inline actions |
| `sm` | 32 | `text-caption` (13) | Card actions, links next to titles |
| `default` | 36 | `text-body` (15) | Most buttons |
| `lg` | 40 | `text-body` (15) | Full-width CTAs: `size="lg" className="w-full"` |
| `icon-xs` / `icon-sm` / `icon` / `icon-lg` | 24 / 32 / 36 / 40, square | — | Icon-only buttons |

Labels are Geist 500 on the type scale (docs/superpowers/specs/2026-10-08-type-system-design.md). Do not resize a label with `textClassName`: pick the button size.

All sizes are `rounded-lg` (8 px), and so is every button and selectable option in the app: no `rounded-full` pills, not for chips, not over a scene, not for the Chats button. A selectable chip is a Button too, `default` when selected and `outline` when not, with `accessibilityState={{ selected }}`. The guard in `__tests__/conventions/buttons.test.ts` fails on a pill.

Do not fight the size. Drop `py-*`, `h-*`, `min-h-[44px]`, `px-0` and a second `opacity-*`. Keep layout classes such as `flex-1`, `w-full`, `self-*` and margins.

**Icon-only buttons need an `accessibilityLabel`.** The types require it for every `icon*` size. Use `ghost` in dense toolbars and sheet or story chrome (month arrows, Close), `outline` when the button stands alone or needs to read as a control on a bare header: the Coach header's menu and new-chat buttons are `outline icon-lg`. Steppers (− / +) are `outline icon-sm`.

```tsx
<Button size="icon-sm" variant="ghost" accessibilityLabel="Next month" onPress={next}>
  <Ionicons name="chevron-forward" size={buttonIconSize('icon-sm')} color={colors.foreground} />
</Button>
```

## Icons, loading and labels

- **`iconStart` / `iconEnd`**: an icon before or after the label. This is shadcn's `data-icon="inline-start|end"`, so the icon side gets the tighter padding. Size icons with `buttonIconSize(size)`: 12 px on the xs sizes, 16 px elsewhere.
- **`loading`**: shows a spinner in the icon-start slot, disables the button and marks it busy. The spinner takes the label colour, including a colour from `textClassName`; pass `spinnerColor` when a `style` override sets the colour.
- **`disabled`**: dims to 50% and sets `accessibilityState.disabled`. Do not add your own opacity. Where a busy control must stay readable, such as the sync status line, override it with `className="opacity-100"`.
- **Labels**: a string child becomes a `Text` with the variant's label classes. `textClassName` adds to it and `labelTestID` tags it. Any other child renders as-is.
- **`numberOfLines`**: a string label is one line by default and truncates. Pass `numberOfLines={0}` to let it wrap, with `h-auto` and exact-px vertical padding so the button grows with it (the coach's follow-up chips: `h-auto min-h-[32px] py-[6px]`).
- Everything else (`testID`, `onPress`, `style`, `hitSlop`, other `Pressable` props) passes through. `className` is merged last, so it wins.

## Touch target

Every button stays at its exact shadcn size and gets an invisible `hitSlop` that grows the tappable area to at least 44 × 44 pt (`hitSlopFor`). It uses the measured layout once there is one. A `hitSlop` prop overrides it. So never pad a button to make it tappable.

## ButtonGroup

A row of joined buttons: inner corners go square and borders overlap by 1 px, so `outline` buttons share one hairline. Pass `separator` to draw a 1-px line between filled variants, which have no border to share.

```tsx
<ButtonGroup>
  <Button variant="outline" size="sm">Day</Button>
  <Button variant="outline" size="sm">Week</Button>
</ButtonGroup>

<ButtonGroup separator>
  <Button variant="secondary" size="sm">Copy</Button>
  <Button variant="secondary" size="icon-sm" accessibilityLabel="More">…</Button>
</ButtonGroup>
```

For a choice between options, use `segmented-control`, not a ButtonGroup.

## Buttons in the Campfire panel

`CampPanel` forces the dark tokens, but `dark:` classes follow the app's scheme, so in a light app an `outline` or `destructive` Button would take its light look on the dark panel. On the panel:

- `secondary` and `default` need nothing. They use tokens only.
- `ghost` draws the same at rest, but its pressed fill follows the app's scheme (`active:bg-muted` in a light app, `active:bg-muted/50` in a dark one). Add `active:bg-muted/50` if it must match exactly. There is no ghost on the panel today.
- For `outline`, add `PANEL_OUTLINE` to `className`. For `destructive`, add `PANEL_DESTRUCTIVE`. Both come from `components/social/CampPanel`.

```tsx
<Button variant="outline" size="xs" className={PANEL_OUTLINE}>{chip}</Button>
```

Over the scene itself (outside the panel), a floating button keeps its dark-glass `style` on a `secondary` Button, like the back button.

## What is not a Button

These stay as `Pressable` / `PressableScale` and are listed in the guard test's allowlist, each with a reason:

- List and settings rows (`settings-list`, BuddyListRow, the command menu)
- Cards and tiles that navigate (home tiles, recap cards, metric cards, the camp banner)
- Tabs (the tab bar, page tabs) and the segmented control
- The check-in day cells (a weekday initial over an `icon-sm`-sized, 8-px-cornered box)
- Story rings and avatars, Campfire coach seats
- Backdrops, tap zones and handles (the sheet backdrop, story prev/next zones)
- An inline span inside a sentence (a metric word in the coach's Today sentence), which is a link in running text, not a standalone link

One documented custom exception: AskCoachBar (components/coach/AskCoachBar.tsx), used by Sleep and Recovery, a GlassSurface CTA with the coach character, drawn with the same 8-px corners.

One sanctioned size override: StickerButton's tall tile (an icon over a label) is an `outline` Button with `h-auto flex-col gap-[4px] py-[12px]`. Everywhere else, do not fight the size.

If you add another, it must not be a button or a link in the design sense. Add it to the allowlist with its key (its testID, or `Component:testID` when the testID is passed in from props), how many times it occurs, and a one-line reason.
