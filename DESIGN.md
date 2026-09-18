---
name: 我们的小日常
description: A warm, unified household control center connecting daily life to physical home devices.
colors:
  paper: "#fbf8f1"
  paper-soft: "#f6f1e3"
  ink: "#2f2a23"
  ink-soft: "#6b6258"
  coral: "#c46e4b"
  coral-soft: "#d89172"
  sage: "#7c9473"
  sage-deep: "#61735b"
  amber: "#b8895e"
  line: "rgba(47, 42, 35, 0.18)"
typography:
  display:
    fontFamily: "Georgia, Times New Roman, serif"
    fontSize: "34pt"
    fontWeight: 700
    lineHeight: 1.0
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "SF Pro Display, -apple-system, sans-serif"
    fontSize: "22pt"
    fontWeight: 700
    lineHeight: 1.15
  body:
    fontFamily: "SF Pro Text, -apple-system, sans-serif"
    fontSize: "17pt"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "SF Pro Text, -apple-system, sans-serif"
    fontSize: "13pt"
    fontWeight: 600
    lineHeight: 1.2
rounded:
  sm: "8pt"
  md: "14pt"
  lg: "20pt"
spacing:
  sm: "8pt"
  md: "16pt"
  lg: "24pt"
  xl: "32pt"
components:
  button-primary:
    backgroundColor: "{colors.sage-deep}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "12pt 16pt"
  surface-card:
    backgroundColor: "{colors.paper-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16pt"
  status-alert:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "12pt 16pt"
---

# Design System: 我们的小日常

## Overview

**Creative North Star: “一间会呼吸的家庭控制室”**

The app should feel like one calm household environment rather than a collection of utility pages. The underlying structure is native iOS and trustworthy; the brand layer adds warmth through paper, handwriting, Ghost, and the physicality of letters and printed output.

Ghost and paper are brand points, not a replacement for hierarchy. The system must remain scanable when the home is healthy and become unmistakably urgent when safety or device problems appear. Native iOS navigation, sheets, lists, controls, Dynamic Type, and system colors carry the interaction grammar.

**Key Characteristics:**

- Unified household system, not isolated tab pages.
- Warm paper and ink surfaces with restrained coral, sage, and amber signals.
- Ghost appears as a companion and state cue, never as decoration that hides information.
- Physical outputs—printed letters and E-ink content—are shown as meaningful artifacts.
- Calm by default; urgent only when the home needs attention.

## Colors

The palette comes from the existing PWA and should be translated into semantic iOS roles rather than used as raw decoration. Paper and ink create the base world; sage supports healthy/connected states; coral marks human warmth and primary action; amber marks attention and risk.

### Primary

- **Deep Sage** (`#61735b`): primary action and healthy system confirmation.
- **Coral Ink** (`#c46e4b`): human action, unread emphasis, and selected brand moments.

### Secondary

- **Sage** (`#7c9473`): connected/healthy state and quiet environmental accents.
- **Soft Coral** (`#d89172`): supportive emphasis, never a large warning field.

### Tertiary

- **Warm Amber** (`#b8895e`): attention, device degradation, and safety-adjacent states that are not yet confirmed emergencies.

### Neutral

- **Paper** (`#fbf8f1`): primary background and reading surface.
- **Soft Paper** (`#f6f1e3`): grouped surfaces, cards, and printed-artifact framing.
- **Ink** (`#2f2a23`): primary text and structural marks.
- **Soft Ink** (`#6b6258`): secondary text and supporting metadata.
- **Line** (`rgba(47, 42, 35, 0.18)`): separators and quiet structure.

### Named Rules

**The Calm-Until-Needed Rule.** Healthy states should not compete for attention. Saturated or high-contrast color is reserved for action, unread state, attention, and confirmed safety problems.

**The Semantic-Color Rule.** Every status must also have text, iconography, or shape; color alone never communicates safety or device health.

## Typography

**Display Font:** Georgia or another approved serif for rare brand/display moments.

**Body Font:** SF Pro Text / SF Pro Display through native iOS system text styles.

**Label/Mono Font:** SF Pro Text; use a monospaced system style only for technical values such as IP addresses, readings, or revisions.

**Character:** The interface is human and warm in its display moments, but native and trustworthy in its controls and reading flow. Handwritten or serif character belongs to Ghost, paper artifacts, and occasional headings—not to dense body copy or system controls.

### Hierarchy

- **Display:** Large Title or a restrained serif display moment for the household overview.
- **Headline:** Title/Headline system styles for section names and important states.
- **Title:** Headline/Title styles for cards, devices, events, and letters.
- **Body:** Body system style, readable at Dynamic Type sizes, for schedules, descriptions, and messages.
- **Label:** Callout/Caption system styles for metadata, timestamps, state labels, and technical values.

### Named Rules

**The Native-First Type Rule.** The system font carries the app. Brand typography may add character, but it must never make a control, warning, or long-form message harder to read.

## Layout

The main composition is a household overview followed by progressive detail. The top-level app uses standard iOS navigation and a TabView for 2–5 sections; the tabs are wayfinding, not separate visual worlds. Every section shares the same semantic status language, surface treatment, spacing rhythm, and action placement.

The overview is dynamically ordered by relevance: safety and system problems first, then today’s routine, unread inbox, recent events, current E-ink content, and environmental detail. In a healthy state, this produces a calm summary; when a high-severity event occurs, the affected state moves to the top without changing the rest of the app’s grammar.

Use safe-area-aware layouts, grouped/inset native lists, large titles on top-level pages, inline titles in detail pages, standard sheets for focused editing, and native edge-swipe back navigation. Do not recreate the browser’s centered phone frame.

## Elevation & Depth

Depth is primarily tonal: paper against soft paper, ink rules, light borders, and occasional artifact framing. Avoid heavy shadows and generic glassmorphism. System materials may be used behind native bars and sheets when iOS provides them. A card should feel like a piece of the household system, not a floating dashboard tile.

### Named Rules

**The Tactile-But-Quiet Rule.** Borders, paper tones, and printed-artifact framing may suggest physicality; depth must never reduce scanability or compete with an urgent state.

## Shapes

Use softly rounded native surfaces with a restrained radius scale. Cards and sheets may use medium-to-large rounding; controls should follow native iOS control shapes. Hand-drawn irregularity is reserved for Ghost and physical artifact previews, never for essential navigation or safety controls.

## Components

### Buttons

- **Shape:** Native bordered, filled, and toolbar buttons; medium rounding for custom primary actions.
- **Primary:** Deep Sage with Paper text, used for the next meaningful action.
- **Secondary:** Native bordered or tinted controls for secondary actions.
- **Destructive:** Native destructive role and system red semantics; do not replace it with decorative coral.
- **Focus / accessibility:** 44pt minimum hit target, VoiceOver label, and visible focus/pressed state.

### Chips / Status Indicators

- **Style:** Compact, readable status labels with icon and text.
- **State:** Healthy, attention, offline, printing, queued, and resolved must remain distinguishable without color.

### Cards / Containers

- **Corner Style:** Medium rounding with consistent internal padding.
- **Background:** Paper for primary reading surfaces; Soft Paper for grouped or artifact surfaces.
- **Border:** Quiet ink/line border where a group needs definition.
- **Shadow Strategy:** Minimal; rely on tonal layering and native sheets.

### Inputs / Fields

- **Style:** Native TextField, TextEditor, DatePicker, Toggle, Stepper, and Picker controls wherever possible.
- **Focus:** Native focus treatment; no web-style fake outlines.
- **Error:** Inline explanation plus a recoverable action; never rely on a color change alone.

### Navigation

- **Top level:** Standard iOS TabView with shared product identity across sections.
- **Hierarchy:** NavigationStack for details and editing flows.
- **Focused tasks:** Sheets for writing, E-ink configuration, device operations, and event handling.
- **Settings:** Access from the appropriate toolbar or device/app settings destination, not as a disconnected visual universe.

### Ghost

Ghost is the signature brand component. It may reflect household state, acknowledge completion, or guide attention to a letter/event. It should be small enough that content remains primary, and it must have an accessible text description for its current state.

### Physical Artifact Preview

Letters and E-ink content should be previewed as meaningful physical outputs. The preview supports understanding and confidence before printing or publishing; it is not an excuse to make the surrounding app behave like a web canvas.

## Do's and Don'ts

### Do:

- **Do** make the household overview the product’s visual and conceptual anchor.
- **Do** reuse one status vocabulary across devices, inbox events, notifications, and environmental sensors.
- **Do** let Ghost and paper express the brand while native iOS components carry trust and usability.
- **Do** treat printed letters and E-ink screens as first-class outputs with clear preview and result states.
- **Do** support Dynamic Type, Dark Mode, Reduce Motion, VoiceOver, and high-contrast states from the beginning.

### Don't:

- **Don't** build five visually unrelated mini-websites inside a tab bar.
- **Don't** use a fake phone frame, browser-shaped controls, or hover-dependent interactions.
- **Don't** let decoration outrank a safety problem, device failure, or required household action.
- **Don't** make the inbox synonymous with printed letters; it is the household event history.
- **Don't** invent sensor values, safety thresholds, or automation behavior that the backend and hardware cannot prove.
