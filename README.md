# ConnectFlow

A Chrome extension that adds a **Connect All** button on LinkedIn company **People** pages — send multiple connection requests with one click instead of clicking every profile manually.

---

## Background

I am looking for a job switch. When I find an opening on LinkedIn, I go to that company’s page → **People** section → search for people in my target roles (e.g. data engineer, backend developer) → and connect with them to grow my network and ask for referrals.

Doing this manually meant clicking **Connect** on every profile, waiting for the invite popup, and clicking **Send** again and again. That got slow and repetitive fast.

So I built **ConnectFlow** to automate the **clicking** part — one button connects with everyone visible in the people card on that page.

This is step one. The longer-term goal is to automate more of the referral workflow on LinkedIn (connection → follow-up → referral message).

---

## Features

- **Connect All** — clicks every **Connect** button in the target card (skips **Message** / **Follow**)
- **Daily limit** — max **10 connects per company per day** (configurable via `DAILY_LIMIT`)
- **Live stats** — shows `3/10 sent today · 4 on page` next to the button
- **Auto-send** — polls for and clicks **Send** / **Send without a note** on LinkedIn’s invite modal
- **Fast storage** — in-memory reads with persistent saves to disk
- **SPA-aware** — works when navigating to `/people` without a full page reload (`background.js`)
- **Search-safe** — re-injects the button when the card reloads after keyword search (debounced)

---

## Typical workflow

1. See a job posting on LinkedIn
2. Open the company page → **People**
3. Search keywords for your target role (e.g. `data engineer`)
4. Check stats — e.g. `2/10 sent today · 5 on page`
5. Click **Connect All**
6. Move to the next company and repeat

---

## Install

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select this project folder
4. Open a LinkedIn company people page, e.g.  
   `https://www.linkedin.com/company/lenovo/people/`
5. The **Connect All** button and stats should appear in the people card

> After updating the extension, click **Reload** on ConnectFlow and close/reopen the LinkedIn tab.

---

## Project structure

```
connectflow/
├── manifest.json    # Extension config (Manifest V3)
├── background.js    # Detects LinkedIn SPA URL changes
├── content.js       # URL checks, storage, injection, connect logic
├── content.css      # Button + stats styling
└── README.md
```

---

## How it works

```
On URL change + every 400ms (+ background.js on SPA nav):
  ├── On linkedin.com?
  ├── URL matches /company/{name}/people?
  │     ├── No  → remove button
  │     └── Yes → find target card → inject Connect All + stats
  └── On Connect All click:
        ├── Load counts from memory (instant)
        ├── Stop if daily limit reached
        ├── Click first Connect button → poll modal → click Send
        ├── Increment count in memory → persist to disk
        └── Repeat until limit reached or no Connect buttons left
```

### Target page URL

```
https://www.linkedin.com/company/{company}/people
```

Anything after `/people` is allowed (query params, trailing paths, etc.).

```js
/^https:\/\/www\.linkedin\.com\/company\/[^/?#]+\/people/i
```

### Target card (DOM)

```css
div.artdeco-card.org-people-profile-card__card-spacing.org-people__card-margin-bottom
```

### Company name (for storage)

Extracted from the URL — not from the page DOM:

```js
// https://www.linkedin.com/company/lenovo/people → "lenovo"
url.match(/linkedin\.com\/company\/([^/?#]+)\/people/i)
```

| URL | Stored as |
|-----|-----------|
| `.../company/lenovo/people` | `lenovo` |
| `.../company/google/people?keywords=engineer` | `google` |
| `.../company/Tata-Consultancy-Services/people/` | `tata-consultancy-services` |

---

## Storage (fast + persistent)

ConnectFlow uses a **two-layer storage** pattern:

```
memoryStore (RAM)          ← instant reads/writes during session
       ↓ persist (debounced 300ms + flush on connect finish)
chrome.storage.local (disk) ← survives browser restart
```

| Action | Layer | Speed |
|--------|-------|-------|
| Read count | `memoryStore` | Instant |
| Increment on connect | `memoryStore` + disk | Instant UI, async save |
| Page load | Disk → memory (once) | One read per tab |
| Browser restart | Load from disk | Persistent |

**Storage key:** `connectFlowDaily`

**Format:**

```json
{
  "connectFlowDaily": {
    "date": "2026-06-27",
    "counts": {
      "lenovo": 3,
      "google": 10
    }
  }
}
```

| Field | Meaning |
|-------|---------|
| `date` | Today’s date (`YYYY-MM-DD`) — counts reset when this changes |
| `counts` | `{ company_slug: connect_count }` for today |

**Rules:**
- 10 connects max per company per day (default)
- Counts reset automatically at midnight (new date)
- Each company is tracked separately
- Storage is **never** read on every DOM mutation (prevents page freeze)

**Inspect storage:**  
`chrome://extensions` → ConnectFlow → Details → Extension storage,  
or DevTools → Application → Extension storage.

**Change daily limit** — edit `DAILY_LIMIT` in `content.js`:

```js
const DAILY_LIMIT = 10;
```

---

## Permissions

| Permission | Why |
|------------|-----|
| `webNavigation` | Detect SPA navigation to `/people` without full reload |
| `storage` | Persist daily connect counts per company |
| `host_permissions: linkedin.com/*` | Run content script on LinkedIn |

---

## Debug

1. Open LinkedIn people page → **F12** → **Console**
2. Reload extension + refresh tab after code changes
3. Find `content.js` under **Sources → Content scripts**
4. Check storage in Console:

```javascript
chrome.storage.local.get("connectFlowDaily", console.log)
```

---

## Roadmap

- [x] Bulk connect on company people pages
- [x] Daily per-company connect limit
- [x] Connect stats on current page
- [x] Fast in-memory storage with persistent disk backup
- [x] Invite modal polling (Send without a note)
- [ ] Custom connection note template
- [ ] Track who was already contacted
- [ ] Automate referral / follow-up messages
- [ ] Filters (e.g. 2nd degree only, skip already pending)

---

## Notes

- Use responsibly. Bulk connecting may trigger LinkedIn rate limits or account restrictions.
- ConnectFlow is a personal automation tool, not affiliated with LinkedIn.
- LinkedIn’s UI changes often — if the button stops appearing, the card selector or heading text may need updating.
- Required delays between connects (~1.2s) and modal polling (~5s max) are intentional to handle LinkedIn’s async UI.

---

## Credits

Built with [Cursor IDE](https://cursor.com) — AI-assisted development for iterating on selectors, SPA navigation fixes, storage logic, and extension architecture.

---

## Reload after changes

1. `chrome://extensions` → **Reload** ConnectFlow
2. Close and reopen the LinkedIn tab (or hard refresh)
