// three r183 deprecated THREE.Clock, and @react-three/fiber v9 (the latest
// stable line) still constructs one internally on every <Canvas> mount,
// flooding the dev console with:
//
//   THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.
//
// R3F v10 replaces Clock with THREE.Timer but is still canary-only. Until we
// can upgrade, route three's logging through its official
// setConsoleFunction() hook and drop ONLY that exact message — every other
// log/warn/error (including TSL stack traces) passes through untouched.
//
// REMOVAL CONDITION: delete this file and its import in hero-canvas-3d.tsx
// once @react-three/fiber v10 stable is installed. Verify with:
//   grep -rn "new THREE.Clock" node_modules/@react-three/fiber/dist

import * as THREE from "three";

const CLOCK_DEPRECATION =
  "THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.";

// HMR can re-evaluate this module with fresh module state; the flag on
// window survives it so the filter is never installed on top of itself.
declare global {
  interface Window {
    __jamNoteClockWarningFiltered?: boolean;
  }
}

export function silenceR3fClockDeprecation(): void {
  if (typeof window === "undefined" || window.__jamNoteClockWarningFiltered) {
    return;
  }
  window.__jamNoteClockWarningFiltered = true;

  const original = THREE.getConsoleFunction();

  THREE.setConsoleFunction((type, message, ...params) => {
    if (type === "warn" && message === CLOCK_DEPRECATION) return;
    if (original) {
      original(type, message, ...params);
      return;
    }
    if (type === "error") console.error(message, ...params);
    else if (type === "warn") console.warn(message, ...params);
    else console.log(message, ...params);
  });
}
