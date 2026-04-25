# Prompt: 3D Test Tube Score Readout UI

## Overview

Generate a 3D test-tube score indicator for a VR/WebXR protein-viewing application. The tube sits in the player's pocket area. Score (0–1) maps to liquid level inside the tube; displayed as 1–100. Liquid colour shifts from **red** (low) through **yellow** (mid) to **green** (high). A cartoon-style score number is shown beside the tube. At full score (≥98/100) a pulsing **"Successful!"** banner appears above the rim.

---

## Visual Specification

### Test Tube Shape

A classic round-bottom laboratory test tube, built with `LatheGeometry` from a 2D profile revolved around the Y axis.

**Shared coordinate origin**: Y = 0 at the very bottom tip of the tube. Both the outer (glass) profile and inner (liquid) profile use the same Y coordinates so they align perfectly.

**Outer profile** (glass wall):

| Section | Description | Key Dimensions |
|---------|-------------|----------------|
| Bulb | Bottom hemisphere, center at (0, BULB_OR), radius BULB_OR | BULB_OR = 0.042 (outer) |
| Neck | Smoothstep transition from bulb equator to cylinder | NECK_H = 0.025 |
| Cylinder | Straight body | TUBE_R = 0.028, CYL_H = 0.32 |
| Rim | Slight outward flare at top | RIM_R = TUBE_R × 1.14, RIM_H = 0.005 |

Total height ≈ 0.39 m (VR-scale).

**Inner profile** (liquid cavity):

Same structure as outer but with reduced radii:
- Inner bulb radius: BULB_IR = BULB_OR − WALL (WALL = 0.004)
- Inner cylinder radius: TUBE_IR = 0.024
- Liquid fills from Y=0 up to BODY_START + score × LIQUID_MAX_H

**LatheGeometry**: 36 radial segments, 10 steps for hemisphere, 5 steps for neck smoothstep.

### Glass Material

```javascript
new THREE.MeshPhysicalMaterial({
  color: 0xeef4ff,
  transparent: true,
  opacity: 0.18,
  roughness: 0.02,
  metalness: 0.0,
  transmission: 0.9,
  thickness: WALL * 2,
  ior: 1.52,
  side: THREE.DoubleSide,
  depthWrite: false,
  envMapIntensity: 1.5,
});
```

### Liquid Material

```javascript
new THREE.MeshStandardMaterial({
  transparent: true,
  opacity: 0.85,
  roughness: 0.15,
  metalness: 0.15,
  emissive: <scoreColor>,
  emissiveIntensity: 0.3,
  side: THREE.DoubleSide,
});
```

Animated properties at runtime:
- `color` / `emissive` → `scoreColor(t)`
- `emissiveIntensity` → 0.25 + t × 0.4
- `metalness` → 0.1 + t × 0.25

### Meniscus (Liquid Top Cap)

`CircleGeometry` at TUBE_IR radius, rotated 90° to face up. Semi-transparent white, inherits score colour. Tracks the top of the liquid column in the cylinder section.

### Colour Ramp: Red → Yellow → Green

Uses HSL colour space. Score `t` (0–1) maps to hue 0°–120°:

```javascript
function scoreColor(t) {
  const hue = Math.max(0, Math.min(1, t)) * 120;  // degrees
  return new THREE.Color().setHSL(hue / 360, 0.85, 0.5);
}

function scoreColorBright(t) {
  const hue = Math.max(0, Math.min(1, t)) * 120;
  return new THREE.Color().setHSL(hue / 360, 0.9, 0.6);
}
```

| Score | Hue | Colour |
|-------|-----|--------|
| 0/100 | 0° | Red |
| 25/100 | 30° | Orange |
| 50/100 | 60° | Yellow |
| 75/100 | 90° | Yellow-green |
| 100/100 | 120° | Green |

`scoreColorBright` (lightness 0.6) is used for text/labels to avoid dark unreadable shades.

### Liquid Level Animation

The liquid mesh uses Y-axis scaling. The bulb+neck portion is always at full scale; only the cylinder portion stretches:

```javascript
const profileH = BODY_START + LIQUID_MAX_H;
const bulbFrac = BODY_START / profileH;
liquid.scale.y = bulbFrac + (1 - bulbFrac) * Math.max(0.001, score);
```

The score eases toward its target each frame:
```javascript
currentScore += (target - currentScore) * 0.10;
```

### Score Label (1–100)

Canvas-drawn texture on a `PlaneGeometry`, positioned beside the tube.

- Large cartoon number: `bold 110px "Comic Sans MS", "Segoe Print", "Chalkboard SE", cursive`
- Black outline stroke (lineWidth 10, lineJoin round) then coloured fill
- Fill colour: `scoreColorBright(t)`
- Below the number: "/ 100" in smaller font (22px)
- Plane scale: 0.18 × 0.18 m

### Graduation Marks

5 tick marks along the cylinder, each with a number label (Sprite):

- Small plane geometry tick on the outer wall
- Number sprite further out (TUBE_R × 2.0 offset)
- Font: `bold 18px "Comic Sans MS", "Segoe Print", cursive`
- Colour: `#99aacc`

### Glow Ring

`RingGeometry` at the meniscus height, pulsing opacity:

```javascript
opacity = score > 0.05 ? 0.18 + Math.sin(time * 0.005) * 0.07 : 0;
```

Colour matches `scoreColor(t)`.

### "Successful!" Banner

Canvas texture on a plane above the tube rim. Appears when score ≥ 98, disappears below 95.

- Pulsing green background: `rgba(0, 200, 80, 0.2 × pulse)`
- Green border: `rgba(0, 220, 100, 0.8 × pulse)`
- Text: `bold 56px "Comic Sans MS"`, outlined black, filled `#22dd66`
- Pulse: `0.9 + Math.sin(time * 0.006) × 0.1`

---

## File Structure

| File | Purpose |
|------|---------|
| `src/ui/score-readout.js` | Module: `buildReadout({ pocketCenter, camera })` → `{ group, update, showBadge }` |
| `demo-test-tube.html` | Standalone demo page for browser testing (no VR required) |

### `buildReadout` API

```javascript
import { buildReadout } from './ui/score-readout.js';

const readout = buildReadout({
  pocketCenter: new THREE.Vector3(-0.25, 0.8, -0.35),
  camera: camera,
});

scene.add(readout.group);

// In animation loop:
readout.update({ total: normalizedScore });  // 0–1
readout.showBadge();  // Force-show "Successful!" (e.g. on level complete)
```

The `group` auto-billboards toward the camera each frame.

---

## Key Constants

```javascript
const TUBE_R       = 0.028;    // outer cylinder radius
const TUBE_IR      = 0.024;    // inner cylinder radius
const WALL         = 0.004;    // glass wall thickness
const BULB_OR      = 0.042;    // outer bulb radius
const BULB_IR      = 0.038;    // inner bulb radius
const CYL_H        = 0.32;    // cylinder section height
const NECK_H       = 0.025;   // neck transition height
const BULB_H       = 0.042;   // bulb hemisphere height (= radius)
const BODY_START   = 0.067;   // Y where cylinder begins
const TOTAL_H      = 0.387;   // Y at top of cylinder
const LIQUID_MAX_H = 0.308;   // max liquid height in cylinder
const RIM_R        = 0.032;   // rim flare radius
const RIM_H        = 0.005;   // rim height
const SEG          = 36;      // lathe radial segments
const GRADS        = 5;       // graduation marks
```

---

## Profile Construction (Pseudocode)

### Outer Profile (Glass)

```
Y = 0 is tube bottom tip

1. Bulb hemisphere (10 steps)
   for i = 0..10:
     angle = i/10 × π/2
     x = sin(angle) × BULB_OR
     y = BULB_OR − cos(angle) × BULB_OR     // 0 → BULB_OR

2. Neck smoothstep (5 steps)
   for i = 1..5:
     f = i/5
     s = f² × (3 − 2f)                       // smoothstep
     x = BULB_OR + (TUBE_R − BULB_OR) × s
     y = BULB_H + f × NECK_H

3. Straight cylinder
   point(TUBE_R, BODY_START)
   point(TUBE_R, TOTAL_H)

4. Rim flare
   point(RIM_R, TOTAL_H)
   point(RIM_R, TOTAL_H + RIM_H)
   point(TUBE_R, TOTAL_H + RIM_H)
```

### Liquid Profile

Identical structure with inner radii (BULB_IR, TUBE_IR). Cylinder extends to `BODY_START + LIQUID_MAX_H` instead of TOTAL_H.

---

## Dependencies

- Three.js r169+ (MeshPhysicalMaterial with transmission, CanvasTexture, LatheGeometry)
- No external fonts required (uses system fonts: Comic Sans MS / Segoe Print / Chalkboard SE / cursive fallback)
- No post-processing required (emissive + glow ring provides visual feedback)

---

## Testing

Open `demo-test-tube.html` in a browser. Controls:
- **Space** — toggle auto-play (sinusoidal 0→100→0 loop)
- **Left/Right arrows** — manual score control
- **OrbitControls** — rotate/zoom the camera around the tube
