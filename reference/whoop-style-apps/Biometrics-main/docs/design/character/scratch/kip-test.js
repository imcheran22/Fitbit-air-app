const K = require('/Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/social-tab/.superpowers/character-canvas/scratch/kip-engine.js');
const which = process.argv[2] || 'skins';
function ascii(v) {
  const skin = K.SKINS[v.skin]; const p = K.ramp(v.body || skin.body);
  const inv = {}; Object.entries(p).forEach(([k, c]) => { if (!inv[c]) inv[c] = k; });
  return K.build(v).map(r => r.map(c => !c ? '.' : (inv[c] || '*')).join(''));
}
let sets = [];
if (which === 'skins') sets = K.SKIN_ORDER.map(s => ascii({ skin: s }));
if (which === 'poses') ['bear', 'owl', 'sheep'].forEach(s => ['rest', 'wave', 'cheer', 'bottle', 'coffee', 'stretch'].forEach(p => sets.push(ascii({ skin: s, pose: p }))));
if (which === 'moods') ['idle', 'curious', 'sleepy', 'proud', 'startled', 'glance', 'determined', 'breathe', 'blink'].forEach(m => sets.push(ascii({ skin: 'bear', mood: m })));
if (which === 'outfits') [['bear'], ['sheep'], ['capy'], ['snail'], ['cloud'], ['frog']].forEach(([s]) => [['hat.beanie', 'neck.scarf'], ['hat.cap', 'back.pack', 'held.coffee'], ['hat.crown', 'back.cape']].forEach(c => sets.push(ascii({ skin: s, cosmetics: c }))));
for (let i = 0; i < sets.length; i += 6) { for (let y = 0; y < 16; y++) console.log(sets.slice(i, i + 6).map(s => s[y]).join('  ')); console.log(); }
