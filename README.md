# Jev Tab Grouper

A Chrome extension that organizes all your open tabs, across every window, into tab groups and windows:

- **Group by domain** — gathers every tab from all windows, puts them in one group per site, and gives each group its own window (`mail.google.com` and `docs.google.com` both go to `google.com`; `bbc.co.uk` is handled as one domain). Sites with a single tab stay ungrouped in the current window.
- **Group by category (Jev)** — asks [TypeSafe](https://typesafe.ai)'s **Jev** model to classify every tab in all windows by its title and URL into one of: Dev, AI, Cloud & Admin, Communication, Docs & Work, Learning, News & Reading, Social, Video & Music, Shopping, Finance, Travel & Maps, Other. Each category gets its own group, color, and window.
- **Ungroup all** — removes every tab group in every window; tabs stay where they are.
- **Split groups into windows** — moves each existing tab group, in any window, into its own new window, keeping its title and color. Ungrouped and pinned tabs stay put.
- **Merge all windows here** — moves every tab from your other normal windows into the current one, keeping groups intact and pinned tabs pinned.

The group buttons replace any existing groups and never group pinned tabs; pinned tabs are gathered into the current window. If a window has nothing but groups, one group stays in it so the window isn't closed. Incognito and regular windows are never mixed.

In category mode every tab is classified before anything moves, so if the Jev API call fails your windows are left as they were.

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

Each unpinned tab (from all windows) is sent as its own small request to `POST https://api.typesafe.ai/v1/systemone` with a single Jev `choice` question:

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

In category mode, the title and URL of each unpinned tab in all windows are sent to the TypeSafe API. Domain mode makes no network requests.

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
