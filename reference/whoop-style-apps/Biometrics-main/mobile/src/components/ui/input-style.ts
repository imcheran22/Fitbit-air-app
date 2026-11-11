import type { TextStyle } from 'react-native';
import { FONTS } from '../../theme';

// Every TextInput's text (spec §3): Geist at the text-body size. A TextInput
// does not go through ui/text, so without this it (and its placeholder, which
// iOS draws in the input's font) falls back to the system font. No lineHeight:
// on iOS a single-line input with one draws its text low. Spread it first, then
// the input's own layout and colour: style={[inputTextStyle, { … }]}.
export const inputTextStyle: TextStyle = { fontFamily: FONTS.sans, fontSize: 15 };

// A number field (the habit amount): the same size in semibold tabular figures.
export const inputNumberStyle: TextStyle = { fontFamily: FONTS.sansSemibold, fontSize: 15, fontVariant: ['tabular-nums'] };
