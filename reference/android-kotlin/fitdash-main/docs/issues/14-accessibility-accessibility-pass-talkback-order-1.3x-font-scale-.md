# Accessibility pass: TalkBack order, 1.3x font scale, reduce motion by system setting

Labels: good-to-have, accessibility

fitdash now has 48 dp targets and an 11 sp floor; the remaining work is a full pass.

**What to build**
- TalkBack: a sensible reading order on every page, every chart with a text alternative (the heart-rate card reads "min 51, average 81, max 150").
- Every page checked at 1.3x and 1.5x font scale; gauges and tiles must not clip.
- Honour the system "remove animations" setting as well as the in-app Reduce motion switch.
