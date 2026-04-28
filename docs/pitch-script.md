# van-der-view — 5-Minute Pitch Script & Slide Blueprint

> **Tagline / Hero phrase**
> **van-der-view — see the forces you were only allowed to imagine.**
> (Sub-line: *"From van der Waals to van der View — drug discovery you can grab with your hands."*)

---

## Color Palette (designer must follow literally)

| Role | Hex | Usage |
|---|---|---|
| Background base | `#05070E` | Page background, slide canvas |
| Surface elevated | `#0E1426` | Cards, panels, inset SVG frames |
| Primary accent — VR cyan | `#22D3EE` | Ligand glow, active strokes, CTAs |
| Secondary accent — bond magenta | `#F472B6` | H-bond dotted lines, "insight" highlights |
| Tertiary accent — orbital violet | `#8B5CF6` | Spoke lines, gradient stops |
| Ink high | `#F8FAFC` | Headings |
| Ink mid | `#94A3B8` | Body copy, captions |
| Grid / hairline | `#1E293B` | Dividers, axis lines |

Typography: `Inter` for UI, `JetBrains Mono` for callouts/captions, large display sizes (clamp 3rem–6rem) on hero lines.

---

## Pitch Script — 5 minutes (~750 words at 150 wpm)

### ACT 1 — THE PAST (0:00 – 1:20, ~200 words)

> Pick up a chemistry textbook from any decade — 1960, 1990, 2024 — and you will see the same picture: a flat, hexagonal scribble of a molecule, drawn in two dimensions on white paper. That picture is a **lie of convenience**. Real molecules do not live on paper. They live in three-dimensional space, twisting, rotating, fitting into pockets the way a key fits a lock — except the key is floppy, the lock is breathing, and both are negotiating a dozen weak forces at once.
>
> For sixty years, professors have stood at chalkboards waving their hands, trying to mime what a binding pocket "feels like." Students nod politely. Then they go to the exam, draw a flat ring, and never once intuit why one mirror-image molecule cures a disease while its twin causes birth defects. Chirality, induced fit, hydrogen-bond geometry — the entire grammar of drug action — is taught in a language that **physically cannot express it**.
>
> This is not a tooling gap. This is an **epistemic gap**. We are training the next generation of drug hunters to reason about a 3D problem with 2D tools. (1:20)

### ACT 2 — TWO INVENTIONS (1:20 – 3:40, ~340 words)

> van-der-view closes that gap with two inventions, not one.
>
> **The first is infrastructure.** Building anything serious in 3D — physics, rendering, biology, pedagogy, validation — exceeds what one engineer or one AI agent can hold in their head. So we built a coordination layer: a **central dispatching agent** that aligns multiple specialist sub-teams on a single shared canvas. Frontend agents own the VR scene. Biology agents own the protein and ligand semantics. Docking agents own the physics. Education agents own the lesson arc. Validation agents check every PR. They report back. They stay in sync. They do not collide. This is the substrate that lets a small team ship the work of a large one — and it is **reusable far beyond chemistry**. Hold that thought.
>
> **The second invention is the experience itself.** Put on a headset. In front of you, a real protein — a real binding pocket, atom-resolved, breathing. In your hand, a candidate ligand. You **reach in**. You feel the pocket reject the wrong rotamer. You twist the molecule. A hydrogen bond snaps into place and **glows magenta**. You flip the chirality and watch the entire fit collapse. In sixty seconds, a student internalizes what a semester of organic chemistry only gestured at. A medicinal chemist sees a steric clash that no 2D viewer would have surfaced.
>
> We are not building a prettier viewer. We are building the **first interface where the geometry teaches you back**. (3:40)

### ACT 3 — THE FUTURE (3:40 – 5:00, ~210 words)

> From here, we grow on two axes.
>
> **Vertical — go deeper into drug discovery.** Every VR session is a labelled dataset: which pockets confused humans, which contacts mattered, which rotations unlocked a fit. We feed that topology intuition back into rational candidate iteration. Pocket → insight → new candidate → re-dock → repeat. The VR loop becomes a **learning loop** for both the chemist and the model.
>
> **Horizontal — port the substrate sideways.** The same agent-coordination layer plus 3D scene engine generalizes to any domain where humans need to reason about complex spatial assemblies. A mechanical engineer puts on the headset and inspects a turbine — no disassembly, no downtime, every subcomponent floating, annotated, diagnosable. A robotics team debugs a kinematic chain in mid-air. Think **JARVIS**, but for any field where the hardware is too expensive, too dangerous, or too small to take apart.
>
> Plot us on a 2D map: vertical depth in drug discovery, horizontal reach into engineering. We sit at the origin today. Every quarter, we extend along both axes.
>
> **van der Waals taught us that matter holds itself together with forces you cannot see. van-der-view lets you finally see them — and reach in and move them.**
>
> Thank you. (5:00)

---

## Slide-by-Slide Outline (7 slides, scroll-snap full-viewport)

Each slide = one `<section>` with `min-height: 100vh; scroll-snap-align: start;`. SVGs inline, no external assets.

---

### SLIDE 1 — HERO

- **Heading:** `van-der-view`
- **Sub-headline:** See the forces you were only allowed to imagine.
- **Body bullets:**
  - A VR-native platform for drug discovery research and teaching
  - Built on an agent-coordination substrate that scales across domains
  - For chemists, students, and any team that thinks in 3D
- **VISUAL SPEC:**
  - Full-bleed dark background `#05070E` with a subtle radial gradient from `#0E1426` (center) outward.
  - Centered, very large (≈420×420 px) inline SVG: a stylized **protein ribbon coil** rendered as a cyan (`#22D3EE`) helical path drawn with `stroke-dasharray` to suggest motion, with a small magenta (`#F472B6`) **ligand glyph** (a hex+tail shape) hovering inside a concave "pocket" formed by overlapping translucent violet (`#8B5CF6`) blobs.
  - Around the ribbon, three faint dotted radial lines suggesting van der Waals contact spheres (use `stroke-dasharray="2 6"`, opacity 0.35).
  - Bottom-right corner: tiny mono caption `v0.1 — research preview`.
  - Title typography: `clamp(4rem, 9vw, 7rem)`, weight 700, ink-high. Sub-line below in mono, ink-mid, letter-spaced.

---

### SLIDE 2 — ACT 1, PROBLEM

- **Heading:** Sixty years of teaching chemistry on paper.
- **Sub-headline:** A 3D science taught with 2D tools is an epistemic bug, not a tooling one.
- **Body bullets:**
  - Chirality, induced fit, H-bond directionality — invisible on a chalkboard
  - Students draw flat rings on exams; they never *intuit* binding
  - Med-chem teams burn cycles on candidates a 3D inspection would have killed
  - The gap is not knowledge — it is **embodiment**
- **VISUAL SPEC — the split-panel hero of Act 1:**
  - One wide SVG, viewBox `0 0 1200 600`, divided exactly down the middle by a 2px hairline `#1E293B` with a vertical label.
  - **LEFT PANEL (`x: 0–600`):** muted/grayscale.
    - Stylized **professor figure** in SVG line art: simple stick-figure with a round head, glasses (two small circles), one arm raised pointing at a chalkboard. Stroke `#94A3B8`, `stroke-width: 2.5`, no fill.
    - Behind the figure, a tilted **chalkboard rectangle** (`fill: #1E293B`, slight rotation) containing a flat 2D molecule diagram: a hexagon with two substituent lines and two letters `OH` and `NH₂`. Drawn in faint white chalk style (`stroke: #F8FAFC`, opacity 0.6, hand-drawn jitter).
    - Tiny caption below: *"what they teach"* in mono `#94A3B8`.
  - **RIGHT PANEL (`x: 600–1200`):** vivid, full color.
    - Three overlapping organic **blob/ribbon shapes** in violet `#8B5CF6` and cyan `#22D3EE` with low opacity layered to form a concave **binding pocket**. Use `<path>` with smooth Bézier curves.
    - A small **ligand** docked in the middle: a 6-atom ball-and-stick assembly (circles + lines), atoms colored cyan with one magenta atom for chirality emphasis. Add a soft glow via SVG filter (`feGaussianBlur stdDeviation="6"`).
    - Three magenta `#F472B6` **dotted contact lines** from ligand atoms to pocket walls (`stroke-dasharray="3 4"`).
    - Tiny caption below: *"what actually happens"* in mono `#22D3EE`.
  - **Center divider label:** vertical text along the divider — `vs.` in display weight, ink-high.

---

### SLIDE 3 — ACT 2A, INFRASTRUCTURE

- **Heading:** A coordination substrate for serious 3D work.
- **Sub-headline:** One dispatcher. Many specialist agent teams. One shared canvas.
- **Body bullets:**
  - Central dispatcher routes subtasks to domain-owned agent teams
  - Each sub-team is autonomous, reports back, stays in sync on the shared scene
  - Built once for chemistry; reusable for any 3D domain
  - This is what lets a small team ship the work of a large one
- **VISUAL SPEC — hub & spoke:**
  - Single SVG, viewBox `0 0 900 700`, centered.
  - **Central node:** a circle radius 70, fill radial-gradient cyan `#22D3EE` → violet `#8B5CF6`, with a soft outer glow (SVG filter blur). Inside, the label `Dispatcher` in mono, ink-high, centered.
  - **Six spoke nodes** evenly placed at radius 280 from center, each a circle radius 44 with `fill: #0E1426`, `stroke: #22D3EE`, `stroke-width: 1.5`. Labels inside in mono ink-high, 12px:
    1. `Frontend / VR`
    2. `Biology`
    3. `Docking`
    4. `Education`
    5. `Validation`
    6. `Infra`
  - **Spokes:** straight lines from center to each node, `stroke: #8B5CF6`, `stroke-width: 1.5`, `stroke-dasharray="6 4"`. Add an animated `<animate>` on `stroke-dashoffset` to create a **pulse traveling outward** along each spoke (duration 2s, indefinite, staggered begin per spoke).
  - Optional: small magenta `#F472B6` dot riding each spoke, animated via `<animateMotion>` along the line — a "packet in flight."
  - Bottom caption in mono ink-mid: `agents on a shared canvas — never colliding, always in sync`.

---

### SLIDE 4 — ACT 2B, THE EXPERIENCE

- **Heading:** Reach into the pocket. Feel the chemistry push back.
- **Sub-headline:** The first interface where the geometry teaches you back.
- **Body bullets:**
  - Atom-resolved protein, breathing in real-time
  - Grab a ligand, twist it, watch H-bonds snap into place
  - Flip chirality — watch the fit collapse
  - 60 seconds in VR > one semester of 2D diagrams
- **VISUAL SPEC — hand into pocket:**
  - SVG viewBox `0 0 1100 650`.
  - Left side: a **wireframe gloved hand** in cyan `#22D3EE` line art, fingers extended toward the right. Drawn as a series of polylines representing finger segments (5 fingers, 3 segments each), no fill, `stroke-width: 2`. Subtle grid lattice overlaid on the palm to suggest VR mesh (`stroke: #22D3EE`, opacity 0.4, 4mm spacing).
  - The thumb and index finger pinch a small **ligand glyph**: 5-atom ball-and-stick assembly with atoms as circles (radius 8), bonds as 2px lines. One central atom in magenta `#F472B6` with a small wedge-bond stub indicating chirality.
  - Right side: a **pocket cavity** — a large concave shape rendered as a layered set of three translucent violet `#8B5CF6` paths (opacity 0.25, 0.4, 0.6) creating depth. The cavity opens leftward toward the incoming hand.
  - Between ligand atoms and pocket interior walls: **four glowing dotted lines** in magenta `#F472B6`, `stroke-dasharray="2 5"`, with SVG `filter` glow. Each line ends in a small magenta dot at the contact point. Caption labels (mono, 10px, ink-mid) on two of the lines: `H-bond 2.8 Å`, `vdW contact`.
  - Bottom caption in display weight, ink-high: **`feel the pocket`** — centered, with the word `feel` underlined in cyan.

---

### SLIDE 5 — ACT 3, HORIZONTAL FUTURE

- **Heading:** The substrate generalizes.
- **Sub-headline:** Same coordination layer + 3D scene engine — now pointed at engineering.
- **Body bullets:**
  - Inspect a turbine without taking it apart
  - Diagnose a kinematic chain mid-flight
  - JARVIS-style assistant for any spatially complex hardware
  - Drug discovery is a wedge — the platform is the moat
- **VISUAL SPEC — exploded engine HUD:**
  - SVG viewBox `0 0 1100 650`. Background subtly darker.
  - Centered: a stylized **exploded-view machine assembly** — a small jet engine or gearbox abstraction. Drawn in cyan `#22D3EE` line art with `stroke-width: 1.5`, no fill. Components include: outer cylindrical housing (two arcs), inner shaft (long thin rectangle), three offset gears (toothed circles), a fan blade ring at one end (radial spokes).
  - Components are spatially separated along an implied diagonal axis — each shifted by 30–60px to suggest "exploded out."
  - **One component is highlighted** (e.g., the middle gear): rendered with a magenta `#F472B6` stroke, slight glow, and **floats further out** (offset 90px) above the assembly.
  - **HUD-style annotations** around the highlighted component:
    - Two thin angled callout lines in cyan with terminal squares
    - Mono labels: `PART-7B / BEARING`, `WEAR INDEX 0.42`, `INSPECT`
    - A tiny crosshair (`+`) at the part's center, cyan
  - Corner overlay (top-right): four mono lines styled like a heads-up display: `SYS NOMINAL`, `MODE: INSPECT`, `LATENCY 11ms`, `OBSERVERS 1`. Use ink-mid, 10px, monospace.
  - Caption bottom: *"any field where the hardware is too expensive, too dangerous, or too small to take apart."* in ink-mid, italic.

---

### SLIDE 6 — ACT 3, VERTICAL FUTURE

- **Heading:** Every VR session feeds the next molecule.
- **Sub-headline:** Topology intuition becomes a labelled dataset for rational design.
- **Body bullets:**
  - Captured: which pockets confused, which contacts mattered, which fits worked
  - Fed back into candidate iteration models
  - Each session sharpens both the chemist and the model
  - The viewer becomes a learning loop
- **VISUAL SPEC — feedback loop:**
  - SVG viewBox `0 0 900 700`. Four nodes arranged in a circle (12, 3, 6, 9 o'clock positions), connected by thick **circular arrows** flowing clockwise.
  - **Nodes** (circles radius 60, fill `#0E1426`, stroke `#22D3EE` width 2). Labels in mono ink-high inside each:
    - 12 o'clock: `Pocket` — small icon: a concave arc inside
    - 3 o'clock: `Insight` — small icon: a magenta `#F472B6` lightbulb glyph (simple bulb shape)
    - 6 o'clock: `Candidate` — small icon: a 4-atom molecule sketch
    - 9 o'clock: `Dock` — small icon: ligand inside pocket
  - **Arrows** between nodes: thick curved paths along the implicit circle, `stroke: #8B5CF6`, `stroke-width: 3`, with arrowhead markers in magenta. Add `stroke-dasharray` and animate `stroke-dashoffset` for a continuous **flowing motion** clockwise.
  - **Center label:** large display text `rational iteration`, ink-high, with a small mono sub-label below: `loop closes in days, not months`.
  - Faint cyan glow ring at the perimeter to suggest the loop is "live."

---

### SLIDE 7 — CLOSING / 2D MAP

- **Heading:** Two axes. One origin. Yours to fund.
- **Sub-headline:** van der Waals taught us forces you cannot see. van-der-view lets you finally reach in.
- **Body bullets:**
  - Vertical: deeper into drug discovery (research + teaching + design)
  - Horizontal: across spatial-reasoning verticals (engineering, robotics, manufacturing)
  - We sit at the origin today — every quarter, we extend along both
  - **Ask:** partners in pharma, education pilots, and seed-stage capital
- **VISUAL SPEC — the 2D growth plot (closing visual):**
  - SVG viewBox `0 0 1000 750`. Centered on a clean dark canvas.
  - Draw a **2D coordinate plot**:
    - **X-axis** (horizontal, drawn at y=600, from x=100 to x=900): label at right end in mono ink-mid: `→ HORIZONTAL: spatial-reasoning verticals`. Tick marks at 25%/50%/75% with mini-labels: `Robotics`, `Mech-Eng`, `Manufacturing`.
    - **Y-axis** (vertical, drawn at x=200, from y=600 up to y=100): label at top in mono ink-mid (rotated -90°): `↑ VERTICAL: drug discovery depth`. Tick marks with mini-labels: `Teaching`, `Research`, `Design`.
    - Axes drawn in `#1E293B`, `stroke-width: 1.5`. Tick marks small, ink-mid.
  - At the **origin** (x=200, y=600): a **glowing node** — circle radius 18, fill cyan `#22D3EE` with strong outer glow (SVG filter blur radius 10). Label below in mono ink-high: `van-der-view, today`.
  - **Two thick arrows** emanating from the origin:
    - One along the X-axis to (x=880, y=600), color violet `#8B5CF6`, stroke-width 4, with arrowhead. Mid-arrow label in mono: `JARVIS for hardware`.
    - One along the Y-axis up to (x=200, y=120), color magenta `#F472B6`, stroke-width 4, with arrowhead. Mid-arrow label in mono: `closed-loop rational design`.
  - **Diagonal field of dotted projection lines** between the two arrows (faint, `#22D3EE` opacity 0.15, dashed) to suggest the expanding "addressable space" between the two axes — like a fan opening outward.
  - At the upper-right corner of the fan, a translucent label: `addressable surface area, 5-yr horizon`.
  - Below the plot, a single line in display weight, ink-high, centered:
    > **van-der-view — see the forces. reach in. move them.**
  - Below that, a final mono caption with three crisp asks:
    `pharma partners · education pilots · seed capital → hello@van-der-view`

---

## Designer Build Notes

- **Layout:** single HTML file, `<main>` containing 7 `<section>` blocks. Use `scroll-snap-type: y mandatory` on `<main>` and `scroll-snap-align: start` on each section.
- **All SVGs inline** — no `<img>`, no external files. Use `<defs>` for the glow filter and gradients (define once, reuse across slides).
- **Animations:** SMIL or CSS — pulses on slide 3 spokes, flow on slide 6 arrows, gentle breathing scale on slide 1 ribbon (1.0 → 1.02 → 1.0, 4s ease-in-out infinite).
- **Responsive floor:** SVGs use `viewBox` + `preserveAspectRatio="xMidYMid meet"` so they scale to viewport. Body type uses `clamp()` for fluid sizing.
- **Accessibility:** every SVG has `<title>` and `<desc>`; section headings are real `<h1>`/`<h2>`; reduced-motion media query disables all animations.
- **No emojis.** No external fonts beyond Inter + JetBrains Mono (load via `<link rel="preconnect">` to Google Fonts).
- **Footer (outside scroll-snap, after slide 7):** one line, mono, ink-mid: `built with the van-der-view agent substrate · 2026`.
