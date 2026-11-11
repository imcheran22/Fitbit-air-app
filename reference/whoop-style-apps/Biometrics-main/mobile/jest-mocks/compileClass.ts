// Compiles classes the way NativeWind does on device (tailwind with the project
// config, then react-native-css-interop at a given inlineRem; 14 on native) so a
// test can check the native styles. Class-string tests can't catch a rem-based
// class drawing 12.5% small, or a colour class that also sets a border width.
// Shared by the compiled-class tests (ButtonCompiled, typeTokens).
import * as fs from 'fs';
import * as path from 'path';

process.env.NATIVEWIND_OS = 'ios';
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const { cssToReactNativeRuntime } = require('react-native-css-interop/dist/css-to-rn');
const projectConfig = require('../tailwind.config.js');

export type Rules = Map<string, any>;

export async function compile(classes: string[], inlineRem: number): Promise<Rules> {
  const css = fs.readFileSync(path.join(__dirname, '../global.css'), 'utf8');
  const result = await postcss([tailwind({ ...projectConfig, content: [{ raw: classes.join(' ') }] })]).process(css, { from: undefined });
  const out = cssToReactNativeRuntime(result.css, { inlineRem });
  return out.rules instanceof Map ? out.rules : new Map(Array.isArray(out.rules) ? out.rules : Object.entries(out.rules ?? {}));
}

// A class's declarations, each either [{ height: 36 }] (static) or [value, 'prop'] (runtime, e.g. a CSS var).
export function declarations(rules: Rules, cls: string): any[][] {
  const rule = rules.get(cls);
  if (!rule) throw new Error(`${cls} did not compile`);
  return rule.n.flatMap((n: any) => n.d);
}

const isStatic = (d: any[]) => d.length === 1 && d[0] && typeof d[0] === 'object' && !Array.isArray(d[0]);

export function staticStyle(rules: Rules, cls: string): Record<string, unknown> {
  return Object.assign({}, ...declarations(rules, cls).filter(isStatic).map((d) => d[0]));
}

export function setsProperty(rules: Rules, cls: string, prop: string): boolean {
  return declarations(rules, cls).some((d) => (isStatic(d) ? prop in d[0] : d[1] === prop));
}
