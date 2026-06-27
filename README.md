# LinkedIn Connect All — Chrome Extension

A small Chrome extension that adds a **Connect All** button on LinkedIn company **People** pages, so you can send multiple connection requests without clicking each profile one by one.

---

## Background

I am looking for a job switch. When I find an opening on LinkedIn, I go to that company’s page → **People** section → search for people in my target roles (e.g. data engineer, backend developer) → and connect with them to grow my network and ask for referrals.

Doing this manually meant clicking **Connect** on every profile, waiting for the invite popup, and clicking **Send** again and again. That got slow and repetitive fast.

So I built this extension to automate the **clicking** part — one button connects with everyone visible in the “People you may know” card on that page.

This is step one. The longer-term goal is to automate more of the referral workflow on LinkedIn (connection → follow-up → referral message). For now, this extension handles bulk connects on company people pages.

---

## What it does

- Runs on **linkedin.com**
- Activates only on URLs like:  
  `https://www.linkedin.com/company/{company}/people`  
  (anything after `/people` is allowed — search params, trailing paths, etc.)
- Finds the target card on the page
- Injects a **Connect All** button next to the section heading
- Clicks every **Connect** button in that card (skips **Message** / **Follow**)
- Auto-clicks **Send** / **Send without a note** on LinkedIn’s invite modal
- Re-injects the button after search or partial page reload (URL watcher + DOM observer)

---

## Project structure

```
chrome-ext/
├── manifest.json   # Extension config (Manifest V3)
├── content.js      # URL checks, button injection, connect logic
├── content.css     # Button styling
└── README.md
```

---

## Install

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this `chrome-ext` folder
5. Open a LinkedIn company people page, e.g.  
   `https://www.linkedin.com/company/lenovo/people/`
6. Search for your target role — the **Connect All** button should appear in the people card

---

## How it works

```
Every 500ms (and on URL change):
  ├── Are we on linkedin.com?
  ├── Does URL match /company/{name}/people?
  │     ├── No  → remove button
  │     └── Yes → find target card in DOM → inject Connect All
  └── On click → click all Connect buttons in that card, handle invite modal
```

**Target card selector:**

```css
div.artdeco-card.org-people-profile-card__card-spacing.org-people__card-margin-bottom
```

**URL pattern:**

```js
/^https:\/\/www\.linkedin\.com\/company\/[^/?#]+\/people/i
```

---

## Typical workflow

1. See a job posting on LinkedIn
2. Open the company page → **People**
3. Search keywords for your target role (e.g. `data engineer`)
4. Click **Connect All** in the people section
5. Repeat for other companies / searches

---

## Roadmap

- [x] Bulk connect on company people pages
- [ ] Custom connection note template
- [ ] Track who was already contacted
- [ ] Automate referral / follow-up messages
- [ ] Filters (e.g. 2nd degree only, skip already pending)

---

## Notes

- Use responsibly. Bulk connecting may trigger LinkedIn rate limits or account restrictions.
- This is a personal automation tool, not affiliated with LinkedIn.
- LinkedIn’s UI changes often — if the button stops appearing, the card selector or heading text may need updating.

---

## Reload after changes

After editing code:

1. Go to `chrome://extensions`
2. Click **Reload** on this extension
3. Refresh the LinkedIn tab
