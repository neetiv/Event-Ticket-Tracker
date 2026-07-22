# Branding

Colors and fonts used in the dashboard ([src/dashboard.ts](src/dashboard.ts)). This is the only styled surface in the app — everything is inline in one `<style>` block and a handful of inline `style=` attributes in the generated HTML, plus a few Chart.js color options.

## Fonts

Loaded via Google Fonts ([src/dashboard.ts:51](src/dashboard.ts#L51)).

| Family | Role | Used in |
|---|---|---|
| **Playfair Display** (serif, italic variants) | Display/heading font — titles, tab labels, accordion titles | `h1`, `h2`, `.tab`, `.modal h3`, `.accordion-title`, `.hero h1` |
| **Inter** (sans-serif) | Body font — everything else | `body` (default for all UI text, labels, inputs, cards) |

## Purple family (primary/brand)

| Hex | Role | Used in |
|---|---|---|
| `#5a3d7a` | Headings, active-state text | `h1`, `h2`, `.tab:hover`, `.modal h3` |
| `#3a2d4f` | Primary body text | `body`, `.card-value`, `.si-name`, `.accordion-title`, `.modal p` |
| `#9b72b0` | Primary action color — buttons, active tab, links, focus ring | `.tab.active`, `.btn-primary`, `a`, `input:focus`/`select:focus`, past-event warning text |
| `#8a5fa0` | Primary hover state | `.tab.active:hover`, `.btn-primary:hover` |
| `#7a5694` | Link hover | `a:hover`, `.si-genre` text |
| `#8a7699` | Secondary/muted text — labels, subtitles, timestamps | `.subtitle`, `.card-label`, `.card-sub`, `.tab`, `.form-group label`, `.si-detail`, chart axis ticks & legend |
| `#7a4d9e` | Chart target-line color; hero title gradient start | Target line `borderColor` ([src/dashboard.ts:504](src/dashboard.ts#L504), [:603](src/dashboard.ts#L603)), `.hero h1 .grad` gradient |
| `#a090b8` | Past/expired event title (deemphasized) | past-event accordion title |
| `#c47a9e` | Hero title gradient end | `.hero h1 .grad` |

## Pink family (accent)

| Hex | Role | Used in |
|---|---|---|
| `#ff94d8` | Bright accent — "Buy Tickets" button, Resale Get-In chart line | `.btn-pink`, chart `colors['get-in']` |
| `#f07cc4` | Pink hover | `.btn-pink:hover` |
| `#f5d5e0` | Danger button background | `.btn-danger` |
| `#f0c0cf` | Danger button hover | `.btn-danger:hover` |
| `#8b3a4a` | Danger button text | `.btn-danger` |
| `#c45c6e` | "Scraper blocked" warning text | scrapeBlocked banner ([src/dashboard.ts:369](src/dashboard.ts#L369)) |

## Status colors (current-price card values)

Thresholds relative to max price, see [src/dashboard.ts:333](src/dashboard.ts#L333).

| Hex | Meaning | Class |
|---|---|---|
| `#6a9e6f` | Well under target (≤85% of max) / search result price | `.card-value.green`, `.si-price` |
| `#c9a050` | Near/at target (≤100% of max) | `.card-value.amber` |
| `#b8674a` | Modestly over target (≤115% of max) | `.card-value.auburn` |
| `#a13d4c` | Significantly over target (>115% of max) | `.card-value.red` |
| `#c4b5cc` | No data available | `.card-value.na`, `.empty`, paused-watch text |
| `#b6e0c1` | Alerts-on badge / mint button | `.badge-on`, `.btn-mint` |
| `#9ed4ab` | Mint hover | `.btn-mint:hover` |

## Neutrals / surfaces

| Hex | Role | Used in |
|---|---|---|
| `#e4dae9` | Page background | `body` |
| `#e6dced` | Borders — cards, panels, inputs, tabs | `.card`, `.panel`, `input`/`select`, `.tabs` border |
| `#efe6f5` | Hover backgrounds, chart gridlines, genre badge bg | `.tab:hover`, `.accordion-header:hover`, chart `grid.color` |
| `#f8f4fb` | Input background, watch-item row background | `input`/`select`, `.watch-item` |
| `#fff` | Modal background, button text on colored buttons | `.modal`, `.btn-primary`/`.btn-mint`/`.btn-pink` text |

## Chart-specific (Chart.js options, [src/dashboard.ts:481-515](src/dashboard.ts#L481-L515))

| Hex | Role |
|---|---|
| `#ff94d8` | Resale Get-In price line + its own fill (`+'20'` alpha suffix) |
| `#7a4d9e` | Target line, dashed, with `#7a4d9e26` shaded fill down to the x-axis |
| `#efe6f5` | Axis gridlines |
| `#8a7699` | Axis ticks, legend labels |
| `#c9a88c` | Fallback line color in the unused legacy `renderChart()` function — inconsistent with the live chart's `#9b72b0` fallback; noted here rather than fixed since that function isn't currently reachable from the UI |

