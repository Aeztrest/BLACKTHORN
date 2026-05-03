# Design System Specification: The Sentinel Protocol

## 1. Overview & Creative North Star: "The Cyber-Tactile Intelligence"
This design system is built to convey absolute authority and technical precision for Solana blockchain security. We are moving away from the "flat web" toward a **Cyber-Tactile Intelligence** aesthetic. 

Our Creative North Star focuses on **Environmental Depth**. Instead of treating the screen as a flat canvas, we treat it as a high-fidelity terminal where light originates from the data itself. We break the "template" look by using intentional asymmetry—heavy sidebar anchors contrasted with airy, wide-margin content areas—and by replacing structural lines with tonal shifts.

**Key Principles:**
*   **Atmospheric Depth:** Use layered surfaces to create a sense of looking "into" the blockchain.
*   **Luminous Interaction:** Light is used only to signal state, security, or focus (e.g., the glow of a "Safe" status).
*   **Editorial Data:** Technical data (JSON, Hex) is treated with the same typographic hierarchy as a high-end magazine.

---

## 2. Colors: Tonal Architecture
The palette is rooted in `surface` (#060e20), creating a vacuum of space where `primary` electric cyans can pop.

### The "No-Line" Rule
**Borders are a failure of hierarchy.** Designers are prohibited from using 1px solid lines to section off content. Boundaries must be defined solely through background color shifts. 
*   *Example:* A `surface-container-low` code block sitting on a `surface` background provides enough contrast to define a shape without "boxing" the user in.

### Surface Hierarchy & Nesting
Use the `surface-container` tiers to create a physical "stack" of intelligence:
1.  **Base Layer:** `surface` (#060e20) – The infinite background.
2.  **Navigation/Sidebar:** `surface-container-low` (#091328) – Recessed and foundational.
3.  **Content Cards:** `surface-container` (#0f1930) – The primary staging area.
4.  **Interactive Elements:** `surface-container-highest` (#192540) – Floating modals or active code snippets.

### The "Glass & Gradient" Rule
To achieve a premium, high-tech feel, use Glassmorphism for floating overlays. Apply `surface-variant` with a 60% opacity and a `20px` backdrop-blur. For primary CTAs, use a subtle linear gradient: `primary` (#8ff5ff) to `primary-container` (#00eefc) at a 135-degree angle.

---

## 3. Typography: Technical Authority
We pair the geometric precision of **Space Grotesk** with the utilitarian clarity of **Inter**.

*   **Display & Headlines:** Use **Space Grotesk**. Its slightly eccentric terminals suggest a "near-future" tech stack. Use `display-lg` for dashboard hero stats to make numbers feel like monumental achievements.
*   **Body & UI:** Use **Inter**. It is optimized for screen readability at small sizes.
*   **Code Elements:** (Implementation Note) Use a monospace font for JSON and API keys, but style it using the `label-md` or `body-sm` scale to ensure it doesn't feel like an afterthought.

**Hierarchy as Identity:** 
High contrast is mandatory. Pair a `headline-lg` title with a `label-sm` (all caps, tracked out 10%) description to create an editorial, high-end feel.

---

## 4. Elevation & Depth: Tonal Layering
Traditional shadows are often too "muddy" for a high-tech dark mode. We use light and tone.

### The Layering Principle
Achieve lift by "stacking." A `surface-container-lowest` card placed on a `surface-container-low` section creates a soft, natural "recessed" look.

### Ambient Shadows
For floating elements (modals, tooltips), use **Ambient Shadows**:
*   `box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), 0 0 15px rgba(143, 245, 255, 0.05);`
*   The hint of `primary` in the shadow mimics the glow of a high-end monitor reflecting off a dark surface.

### The "Ghost Border" Fallback
If a container requires a border for accessibility, use the **Ghost Border**: 
*   `outline-variant` (#40485d) at **15% opacity**. It should be felt, not seen.

---

## 5. Components: Precision Engineered

### Cards & Data Modules
*   **Style:** No borders. Use `surface-container` background. 
*   **Hover State:** Apply a `primary` (#8ff5ff) outer glow with a 2px blur and 0.5px `outline-variant` border to simulate "powering on."
*   **Spacing:** Use generous 32px padding to allow data to breathe.

### Status Indicators (The Security Pulse)
*   **Safe:** `primary` (#8ff5ff) with a soft radial glow.
*   **Risk:** `tertiary` (#9bddff) – using blue-slate tones for "caution" rather than alarming yellow.
*   **Danger:** `error` (#ff716c) – high-contrast "Red Alert."
*   *Note:* Use a subtle 2s "pulse" animation (opacity 1.0 to 0.6) on the status dot for "Analyzing" states.

### JSON & Code Blocks
*   **Background:** `surface-container-lowest` (#000000).
*   **Syntax Highlighting:** Use `primary` for keys, `secondary` for strings, and `tertiary` for booleans.
*   **Edge Treatment:** A 2px left-accent border of `primary_dim` to denote the "active code" area.

### Input Fields
*   **State:** Default state uses `surface-container-high` background.
*   **Focus:** The background shifts to `surface-bright` and the label (in `label-sm`) shifts to `primary` color.

---

## 6. Do's and Don'ts

### Do
*   **Do** use `letter-spacing: 0.05em` on all `label` styles to enhance the "technical" feel.
*   **Do** use asymmetrical layouts (e.g., a thin 240px sidebar next to a wide, expansive content area).
*   **Do** use "interconnected node" SVG backgrounds at 5% opacity to add depth to large empty states.

### Don't
*   **Don't** use pure white (#FFFFFF). Always use `on-surface` (#dee5ff) or `on-surface-variant` (#a3aac4).
*   **Don't** use 1px solid dividers between list items. Use 16px of vertical whitespace instead.
*   **Don't** use standard "drop shadows" that look like they belong on a light-mode paper interface. If it doesn't glow or shift tone, it doesn't belong.