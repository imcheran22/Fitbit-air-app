import { MOCKUP_OFFSET, MOCKUP_SEGMENTS, seg } from '../../jest-mocks/sleepNightFixture';
import { layoutStageLanes } from '../../src/lib/stageLanes';

// 250 px wide, 2 px padding each side: 246 px for the 462-minute night.
const PX = 246 / 462;
const x = (minute: number) => 2 + minute * PX;

describe('layoutStageLanes (the mockup night)', () => {
  const layout = layoutStageLanes(MOCKUP_SEGMENTS, 250, MOCKUP_OFFSET);

  it('stacks four lanes of 44 px: awake, REM, light, deep', () => {
    expect(layout.height).toBe(176);
    const top = (type: string) => layout.blocks.find((b) => b.type === type)!.top;
    expect([top('AWAKE'), top('REM'), top('LIGHT'), top('DEEP')]).toEqual([8, 52, 96, 140]);
  });

  it('places blocks by time, one pixel short of the next, with small corners', () => {
    // 19 blocks: 20 segments, one of which is a wake marker.
    expect(layout.blocks).toHaveLength(19);
    const [awake, light, deep] = layout.blocks;
    expect(awake).toMatchObject({ type: 'AWAKE', left: 2, height: 28 });
    expect(awake!.width).toBeCloseTo(8 * PX - 1);
    expect(awake!.radius).toBeCloseTo((8 * PX - 1) / 2);
    expect(light!.left).toBeCloseTo(x(8));
    expect(light!.width).toBeCloseTo(17 * PX - 1);
    expect(deep!.left).toBeCloseTo(x(25));
    expect(deep!.width).toBeCloseTo(45 * PX - 1);
    expect(deep!.radius).toBe(6);
    // The final 7 min awake is narrower than the 3 px minimum.
    const last = layout.blocks[layout.blocks.length - 1]!;
    expect(last).toMatchObject({ type: 'AWAKE', width: 3, radius: 1.5 });
    expect(last.left).toBeCloseTo(x(455));
  });

  it('records each block\'s position through the night for the entrance stagger', () => {
    expect(layout.blocks[0]!.at).toBe(0);
    expect(layout.blocks[layout.blocks.length - 1]!.at).toBeCloseTo(455 / 462);
  });

  it('draws the brief 3:35 am wake as a marker on the awake lane', () => {
    expect(layout.markers).toHaveLength(1);
    expect(layout.markers[0]!.x).toBeCloseTo(x(266.5));
    expect(layout.markers[0]!.y).toBe(22);
    expect(layout.markers[0]!.start).toBe(seg('AWAKE', 265, 265).start);
  });

  it('links every touching pair from the edge of one block to the edge of the next', () => {
    expect(layout.links).toHaveLength(19);
    // Awake (top lane) down to light: from awake's bottom edge to light's top edge.
    expect(layout.links[0]!.x).toBeCloseTo(x(8));
    expect(layout.links[0]).toMatchObject({ y1: 36, y2: 96 });
    // Deep up to light: from deep's top edge to light's bottom edge.
    expect(layout.links[2]).toMatchObject({ y1: 140, y2: 124 });
  });

  it('puts a guide on each whole local hour inside the night', () => {
    // Bed at 23:10 local: midnight is 50 min in, then every hour to 6 am.
    expect(layout.hourGuides).toHaveLength(7);
    expect(layout.hourGuides[0]).toBeCloseTo(x(50));
    expect(layout.hourGuides[6]).toBeCloseTo(x(410));
  });

  it('lays a numbered pill under each sleep cycle', () => {
    expect(layout.cyclePills.map((p) => p.n)).toEqual([1, 2, 3, 4, 5]);
    expect(layout.cyclePills[0]!.left).toBeCloseTo(x(8) + 1.5);
    expect(layout.cyclePills[0]!.width).toBeCloseTo(92 * PX - 3);
  });

  it('totals whole minutes per stage for the lane labels', () => {
    expect(layout.minutes).toEqual({ AWAKE: 18, REM: 123, LIGHT: 231, DEEP: 90 });
  });
});

describe('layoutStageLanes rules', () => {
  it('draws a mid-night wake under 10 min as a marker and one of 10 min as a block', () => {
    const nine = layoutStageLanes([seg('LIGHT', 0, 60), seg('AWAKE', 60, 69), seg('LIGHT', 69, 120)], 300, 0);
    expect(nine.markers).toHaveLength(1);
    expect(nine.blocks.filter((b) => b.type === 'AWAKE')).toHaveLength(0);

    const ten = layoutStageLanes([seg('LIGHT', 0, 60), seg('AWAKE', 60, 70), seg('LIGHT', 70, 120)], 300, 0);
    expect(ten.markers).toHaveLength(0);
    expect(ten.blocks.filter((b) => b.type === 'AWAKE')).toHaveLength(1);
  });

  it('keeps short leading and trailing wakes as blocks', () => {
    const layout = layoutStageLanes([seg('AWAKE', 0, 3), seg('LIGHT', 3, 60), seg('AWAKE', 60, 62)], 300, 0);
    expect(layout.markers).toHaveLength(0);
    expect(layout.blocks.filter((b) => b.type === 'AWAKE')).toHaveLength(2);
  });

  it('links stages up to a minute apart but not across a gap in the data', () => {
    expect(layoutStageLanes([seg('LIGHT', 0, 30), seg('DEEP', 31, 60)], 300, 0).links).toHaveLength(1);
    expect(layoutStageLanes([seg('LIGHT', 0, 30), seg('DEEP', 35, 60)], 300, 0).links).toHaveLength(0);
  });

  it('has nothing to draw without segments or width', () => {
    expect(layoutStageLanes([], 300, 0).blocks).toEqual([]);
    expect(layoutStageLanes(MOCKUP_SEGMENTS, 0, 0).blocks).toEqual([]);
  });

  it('draws nothing for a wake in the night that rounds to 0 min, and no links to it', () => {
    const layout = layoutStageLanes([seg('LIGHT', 0, 60), seg('AWAKE', 60, 60.4), seg('DEEP', 60.4, 120)], 300, 0);
    expect(layout.markers).toHaveLength(0);
    expect(layout.blocks.map((b) => b.type)).toEqual(['LIGHT', 'DEEP']);
    expect(layout.links).toHaveLength(0);
  });

  it('spans the night to the latest end, so an overlapping earlier segment stays inside the width', () => {
    const layout = layoutStageLanes([seg('LIGHT', 0, 120), seg('REM', 50, 60)], 300, 0);
    for (const b of layout.blocks) expect(b.left + b.width).toBeLessThanOrEqual(298);
    expect(layout.blocks[0]!.width).toBeCloseTo(296 - 1);
  });
});
