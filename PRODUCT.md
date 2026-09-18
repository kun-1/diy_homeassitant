# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

## Stack

SwiftUI native iOS app. The existing React/Vite PWA remains a functional reference and migration aid; the Mac mini backend, ESP32 firmware, printer, E-ink display, and UPS remain separate system components.

## Users

Family members using a shared household app. They open it during normal daily life to understand the state of the home, review schedules and tasks, print content, and investigate device problems.

## Product Purpose

This is a private, customizable household control center. It combines family routines, calendar, tasks, printable letters, E-ink content, and the health of the connected home system in one place. Success means that a family member can quickly understand how the home is doing, find what needs attention, and act without switching between unrelated tools.

## Positioning

The product is not only a smart-home dashboard, a calendar, or a printer remote. Its distinctive mechanism is the connection between everyday family life and physical household outputs: the Mac mini, ESP32, printer, E-ink display, and UPS turn digital household information into visible, printable, and actionable artifacts.

## Operating Context

- The household currently runs a Mac mini service that coordinates the backend, printing, E-ink rendering, and device state.
- ESP32 connects the E-ink display, printer, and UPS hardware.
- The phone is a shared control and observation surface, typically reaching the home through the local network or Tailscale.
- The current PWA is the functional baseline for the first native iOS release.
- Shared household data is intentionally visible to all family members; a personal permission model is not required for the first version.

## Capabilities and Constraints

- The first native release must include the completed capabilities currently represented in the PWA: today overview, calendar, tasks, printable letters, print preview and queue, E-ink content configuration and preview, shared dates/countdowns/wishes, and device status.
- The app should support direct editing and actions, not read-only monitoring: edit calendar events, complete tasks, write and print letters, modify E-ink content, manage shared dates and wishes, and operate or restart supported devices where the backend allows it.
- The first screen is a household overview with dynamic priority. Safety and system problems rise above routine information when present.
- Short-lived notifications and persistent inbox items are separate concepts. A notification may disappear after being shown; an inbox item remains available for review, categorization, archiving, or future Agent handling.
- Printed letters are one inbox category, not the definition of the inbox.
- Future household capabilities include bedroom air quality, kitchen air quality and gas/toxic-gas detection, cameras or other monitoring, and Agent-assisted event investigation. These must extend the same household model rather than create disconnected mini-apps.
- The app must follow iOS conventions: safe areas, native navigation, standard sheets and controls, Dynamic Type, semantic colors, Dark Mode, and 44pt minimum touch targets.

## Brand Commitments

- Preserve the current product's warm, personal household character.
- Keep Ghost as a recognizable assistant/brand presence, used with restraint across the system.
- Keep paper, handwriting, letters, and printed artifacts as supporting brand material.
- The native app should feel like one coherent household system, not five independent web pages placed in tabs.

## Evidence on Hand

- Current PWA implementation: `pwa/src/main.tsx`, `pwa/src/calendar-page.tsx`, `pwa/src/letters-page.tsx`, `pwa/src/eink-content-page.tsx`, and `pwa/src/styles.css`.
- Current API contracts: `pwa/src/api.ts` and `backend/src/app.ts`.
- Current device/printing/E-ink hardware context: `firmware/README.md`, `backend/README.md`, and the ESP32/vendor sources.
- Existing visual assets include Ghost states, device icons, paper-like surfaces, and E-ink previews in `pwa/public/assets` and `pwa/src/open-design-assets.ts`.
- Do not invent sensor readings, safety thresholds, device capabilities, or household data that are not supplied by the backend or hardware.

## Product Principles

- **See the home as a system.** The overview explains the relationship between family routines, physical devices, and recent events.
- **Surface what matters now.** The most important item is determined by severity and relevance, not by a fixed decorative layout.
- **Act in the same place you notice.** Important overview items lead directly to the appropriate edit, control, or resolution flow.
- **Keep history usable.** Events and messages that require human attention remain in the inbox until resolved or archived.
- **Grow by adding household capabilities.** Future sensors, monitoring, and Agents extend the same model of overview, event, detail, and action.

## Accessibility & Inclusion

The native app must follow iOS Human Interface Guidelines and support Dynamic Type, VoiceOver labels for device and event states, semantic color roles that remain legible in Dark Mode and increased contrast, Reduce Motion, and touch targets of at least 44pt. Safety-related states must never rely on color alone.
