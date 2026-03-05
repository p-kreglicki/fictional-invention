type PollingGate = {
  tryEnter: () => boolean;
  leave: () => void;
};

/**
 * Creates a lock to prevent overlapping async polling cycles.
 * @returns Gate functions that allow one in-flight cycle at a time.
 */
export function createPollingGate(): PollingGate {
  let inFlight = false;

  return {
    tryEnter() {
      if (inFlight) {
        return false;
      }

      inFlight = true;
      return true;
    },
    leave() {
      inFlight = false;
    },
  };
}
