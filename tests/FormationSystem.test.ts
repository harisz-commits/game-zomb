import { describe, expect, it } from 'vitest';
import { FormationLayout } from '../src/army/FormationSystem';
import { MOVEMENT, DISPLAY_CAPS } from '../src/config/gameBalance';

describe('FormationLayout', () => {
  it('produces exactly one slot per soldier', () => {
    const layout = new FormationLayout();
    for (const count of [0, 1, 7, 60, DISPLAY_CAPS.alliesHard]) {
      expect(layout.update(count)).toHaveLength(count);
    }
  });

  it('keeps the whole formation on the road at every size', () => {
    const layout = new FormationLayout();
    for (let count = 1; count <= DISPLAY_CAPS.alliesHard; count += 1) {
      for (const slot of layout.update(count)) {
        expect(Math.abs(slot.x)).toBeLessThanOrEqual(MOVEMENT.laneHalfWidth);
      }
    }
  });

  it('grows backwards once it can no longer grow sideways', () => {
    const layout = new FormationLayout();
    layout.update(20);
    const narrow = { width: layout.halfWidth, depth: layout.depth };
    layout.update(140);
    // Die Truppe darf breiter werden, aber die Tiefe muss deutlich stärker
    // zulegen — sonst quillt sie über die Fahrbahn.
    expect(layout.depth / narrow.depth).toBeGreaterThan(layout.halfWidth / narrow.width);
  });

  it('never stacks two soldiers on the same spot', () => {
    const layout = new FormationLayout();
    const slots = layout.update(120);
    let minDistance = Infinity;
    for (let i = 0; i < slots.length; i += 1) {
      for (let j = i + 1; j < slots.length; j += 1) {
        const a = slots[i]!;
        const b = slots[j]!;
        minDistance = Math.min(minDistance, Math.hypot(a.x - b.x, a.z - b.z));
      }
    }
    expect(minDistance).toBeGreaterThan(0.2);
  });

  it('is stable: the same count always yields the same layout', () => {
    const first = new FormationLayout().update(45).map((s) => ({ ...s }));
    const second = new FormationLayout().update(45);
    expect(second).toEqual(first);
  });

  it('does not reshuffle existing soldiers when one joins', () => {
    const layout = new FormationLayout();
    const before = layout.update(30).map((s) => ({ ...s }));
    const after = layout.update(31);
    // Wachstum muss sich anfügen, nicht neu mischen: sonst springt bei jedem
    // Rekruten die ganze Truppe.
    for (let i = 0; i < before.length; i += 1) {
      expect(after[i]!.x).toBeCloseTo(before[i]!.x, 5);
      expect(after[i]!.z).toBeCloseTo(before[i]!.z, 5);
    }
  });

  it('gives each soldier its own walk phase', () => {
    const phases = new FormationLayout().update(40).map((slot) => slot.phase);
    expect(new Set(phases.map((p) => p.toFixed(3))).size).toBeGreaterThan(30);
  });
});
