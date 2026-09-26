# Jev Tab Grouper

A Chrome extension that organizes your tabs into tab groups and windows:

- **Group by domain** — one group per site (`mail.google.com` and `docs.google.com` both go to `google.com`; `bbc.co.uk` is handled as one domain). Groups are sorted alphabetically; sites with a single tab stay ungrouped after the groups.
- **Group by category (Jev)** — asks [TypeSafe](https://typesafe.ai)'s **Jev** model to classify each tab by its title and URL into one of: Dev, AI, Cloud & Admin, Communication, Docs & Work, Learning, News & Reading, Social, Video & Music, Shopping, Finance, Travel & Maps, Other. Each category gets its own group and color.
- **Ungroup all**
- **Split groups into windows** — moves each tab group in the current window into its own new window, keeping its title and color. Ungrouped and pinned tabs stay put; if every tab is grouped, the first group stays so the window isn't emptied.
- **Merge all windows here** — moves every tab from your other normal windows into the current one, keeping groups intact and pinned tabs pinned. Incognito and regular windows are never mixed.

The grouping buttons act on the current window only and never touch pinned tabs. Both group modes ungroup existing groups first.

## Setup

1. Get a TypeSafe API key and export it:

   ```sh
   export TYPESAFE_API_KEY=your-key
   ```

2. Generate `config.js` (gitignored) from the environment variable:

   ```sh
   ./setup.sh
   ```

3. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select this folder.

Click the toolbar icon to use it. After rotating your key, re-run `./setup.sh` and reload the extension.

Domain grouping works without a key, but `config.js` must exist for the extension to load. If you only want domain grouping, run `TYPESAFE_API_KEY=none ./setup.sh`.

## How the category mode works

Each unpinned tab is sent as its own small request to `POST https://api.typesafe.ai/v1/systemone` with a single Jev `choice` question:

```json
{
  "model": "jev-latest",
  "state": { "tab_title": "Pull requests · owner/repo", "tab_url": "https://github.com/owner/repo/pulls" },
  "questions": {
    "category": {
      "type": "choice",
      "instructions": "Which category best describes the browser tab described by `tab_title` and `tab_url`?",
      "criteria": { "Dev": "Software development: ...", "AI": "...", "...": "..." }
    }
  }
}
```

Requests run 8 at a time and retry with backoff on `429`/`529`. A window of ~10 tabs is classified in about half a second. Results are not cached — each click re-classifies.

To change the categories or their colors, edit `CATEGORIES` at the top of [`background.js`](background.js).

## Privacy

In category mode, the title and URL of each unpinned tab in the current window are sent to the TypeSafe API. Domain mode makes no network requests.

Your API key is stored in plain text in `config.js` inside the unpacked extension. Don't share a copy of the folder that includes it.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest (`tabs`, `tabGroups`, host access to `api.typesafe.ai`) |
| `background.js` | Grouping logic and Jev classification (service worker) |
| `popup.html`, `popup.js` | Toolbar popup with the buttons |
| `setup.sh` | Writes `config.js` from `$TYPESAFE_API_KEY` |

## License

[MIT](LICENSE)
