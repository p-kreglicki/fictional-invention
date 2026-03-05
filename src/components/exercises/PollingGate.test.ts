import { describe, expect, it } from 'vitest';
import { createPollingGate } from './PollingGate';

describe('createPollingGate', () => {
  it('allows first poll cycle', () => {
    const gate = createPollingGate();

    expect(gate.tryEnter()).toBe(true);
  });

  it('blocks overlapping cycle while in flight', () => {
    const gate = createPollingGate();

    expect(gate.tryEnter()).toBe(true);
    expect(gate.tryEnter()).toBe(false);
  });

  it('allows next cycle after leaving', () => {
    const gate = createPollingGate();

    expect(gate.tryEnter()).toBe(true);

    gate.leave();

    expect(gate.tryEnter()).toBe(true);
  });
});
