# KAYA design notes (saved 2026-11-04)

Two designs are recorded here: the **current design** (saved in this folder, so you can go
back to it) and the **photo redesign** that was being built when this was saved.

---

## 1. Current design (the files in this folder)

**Look and feel**
- Colors: navy `#0b1b3f`, royal blue `#2554e8`, orange accent `#ff9f1c`, light background `#f5f7fc`, white cards.
- Fonts: Poppins for headings, Inter for body text.
- Glass-style cards (white, slightly see-through, soft shadows), rounded corners (18 px).

**Pictures**
- No photos. Every page uses drawn, animated scenes (made in code, `js/shared/scenes.js`):
  plumber at a dripping faucet, electrician on a ladder with a glowing bulb, cleaner with
  sparkles, laundry with bubbles, carpenter with a saw, gardener with swaying plants.
- Home page: a cross-fading carousel of these scenes behind a dark overlay, with a slow zoom
  ("Ken Burns" effect), floating cards and a scrolling strip of service names.
- Login and sign-up pages: the same scene carousel behind the form, with a dark overlay.
- Services page: a card per service with its scene on top, icon, price and filter buttons.

**Logged-in areas** (customer, worker, admin): clean dashboard style, white cards, KPI
tiles, status badges, no large pictures.

---

## 2. Photo redesign (in progress)

**Goal:** realistic photos of Filipino workers on the public pages only (Home, Services,
How It Works, Book a Service, Log In, Create Account, Register as a Worker). Logged-in
Customer, Worker and Admin pages keep their current clean design. No functions change.

**New colors (KAYA palette)**
| Name | Hex | Use |
|---|---|---|
| Trust Blue | `#123B63` | headers, overlays, dark sections |
| Electric Blue | `#2274A5` | buttons, links |
| Warm Orange | `#F28C28` | highlights, call-to-action buttons |
| Soft Cream | `#F7F4EF` | page background on public pages |
| Charcoal | `#1F2933` | body text |

**Photo ideas**
- Home hero: a friendly Filipino worker helping a customer inside a home, with a dark blue
  see-through overlay so the text stays readable; slow cross-fade carousel.
- Service cards: one photo per service, dark gradient at the bottom, gentle zoom on hover,
  fade-in as you scroll, clear icon and label.
- Login / sign-up pages: photo carousel behind the form with the blue overlay.

**Photos made so far (AI-generated with Canva)**
Small previews are in `photos-ai-previews/`. Full-size originals are in your Canva account:
| Photo | What it shows | Canva link |
|---|---|---|
| hero | worker in blue uniform explaining an aircon unit to a homeowner | https://www.canva.com/M/MAHZ4HWWs30 |
| plumbing | plumber fixing the pipe under a sink | https://www.canva.com/M/MAHZ4KXB6Bk |
| electrical | electrician installing a ceiling light | https://www.canva.com/M/MAHZ4AsO_oc |
| cleaning | cleaner arranging sofa cushions in a living room | https://www.canva.com/M/MAHZ4LawRBU |
| laundry | laundry worker in uniform folding towels | https://www.canva.com/M/MAHZ4K6lnyY |
| carpentry | carpenter fixing a wooden shelf to the wall with a drill | https://www.canva.com/M/MAHZ4NycHzY |
| gardening | gardener in a green cap tending plants in a front garden | https://www.canva.com/M/MAHZ4LYJAEg |

Prompts used (same style for the missing three):
"Filipino ___ ___. Use realistic people with natural facial expressions, proper uniforms,
believable tools, and authentic Filipino home environments."
