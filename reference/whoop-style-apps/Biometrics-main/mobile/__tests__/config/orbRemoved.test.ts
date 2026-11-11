import fs from 'fs';
import path from 'path';

// The orb was replaced by the companion characters (spec §1 Clean-up). This
// keeps it from creeping back through a stray import or dependency.
const root = path.join(__dirname, '..', '..');
const REMOVED = [
  'src/components/orb',
  'src/components/ui/still-orb.tsx',
  'src/lib/hubOrb.ts',
  'src/screens/dev/OrbGalleryScreen.tsx',
  'jest-mocks/ThinkingOrb.js',
];
const ORB_REFERENCE = /thinking-orbs|components\/orb\b|still-orb|hubOrb|OrbGalleryScreen|EXPO_PUBLIC_ORB_GALLERY/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js)$/.test(entry.name) ? [full] : [];
  });
}

describe('the orb is gone', () => {
  it('no longer depends on thinking-orbs', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.dependencies['thinking-orbs']).toBeUndefined();
  });

  it('has none of the orb files left', () => {
    expect(REMOVED.filter((p) => fs.existsSync(path.join(root, p)))).toEqual([]);
  });

  it('has no source that still refers to the orb', () => {
    const files = [...sourceFiles(path.join(root, 'src')), path.join(root, 'App.tsx'), path.join(root, 'jest-setup.js')];
    const offenders = files.filter((file) => ORB_REFERENCE.test(fs.readFileSync(file, 'utf8'))).map((file) => path.relative(root, file));
    expect(offenders).toEqual([]);
  });
});
