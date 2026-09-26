importScripts("config.js");

const API_URL = "https://api.typesafe.ai/v1/systemone";
const CONCURRENCY = 8;

// Category -> [Jev criteria description, tab group color]. Order = group order in the tab strip.
const CATEGORIES = {
  "Dev": ["Software development: code hosting, pull requests, CI, programming docs, API references, localhost, developer tools", "blue"],
  "AI": ["AI assistants and AI tools: chatbots, LLM consoles, AI model playgrounds and dashboards", "purple"],
  "Cloud & Admin": ["Cloud consoles, hosting, servers, DNS, domains, admin panels, monitoring dashboards", "cyan"],
  "Communication": ["Email, chat, messaging, video calls, calendars", "green"],
  "Docs & Work": ["Documents, spreadsheets, notes, project management, task trackers, wikis", "yellow"],
  "Learning": ["Tutorials, courses, research papers, reference articles, Q&A sites", "orange"],
  "News & Reading": ["News sites, blogs, newsletters, long-form articles", "grey"],
  "Social": ["Social networks and forums: Facebook, X/Twitter, Instagram, Reddit, LinkedIn, Threads", "pink"],
  "Video & Music": ["Video streaming, music, podcasts, entertainment", "red"],
  "Shopping": ["Online stores, product pages, carts, deals, orders", "orange"],
  "Finance": ["Banking, payments, investing, crypto, invoices, accounting, taxes", "green"],
  "Travel & Maps": ["Maps, flights, hotels, bookings, travel planning", "cyan"],
  "Other": ["Does not clearly fit any other category, or a blank/new tab", "grey"],
};
const COLORS = ["blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange", "grey"];

const tabUrl = (tab) => tab.url || tab.pendingUrl || "";

// "mail.google.com" -> "google.com", "www.bbc.co.uk" -> "bbc.co.uk"
function domainOf(tab) {
  let url;
  try { url = new URL(tabUrl(tab)); } catch { return "other"; }
  if (!url.protocol.startsWith("http")) return url.protocol.replace(":", "");
  const host = url.hostname.replace(/^www\./, "");
  if (/^[\d.]+$/.test(host) || !host.includes(".")) return host; // IP or localhost
  const parts = host.split(".");
  // Second-level public suffixes like co.uk, com.hk keep three labels.
  const keep = parts.length > 2 && parts[parts.length - 2].length <= 3 && parts[parts.length - 1].length === 2 ? 3 : 2;
  return parts.slice(-keep).join(".");
}

function colorFor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

async function classify(tab) {
  const body = JSON.stringify({
    model: "jev-latest",
    state: { tab_title: tab.title || "", tab_url: tabUrl(tab) },
    questions: {
      category: {
        type: "choice",
        instructions: "Which category best describes the browser tab described by `tab_title` and `tab_url`?",
        criteria: Object.fromEntries(Object.entries(CATEGORIES).map(([k, [desc]]) => [k, desc])),
      },
    },
  });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${TYPESAFE_API_KEY}`, "Content-Type": "application/json" },
      body,
    });
    if (res.ok) return (await res.json()).answers.category.choice;
    if ((res.status === 429 || res.status === 529) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    throw new Error(`Jev API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

async function mapPool(items, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return out;
}

// Normal windows with the same incognito state as windowId (including it), with tabs.
async function sameProfileWindows(windowId) {
  const target = await chrome.windows.get(windowId);
  return (await chrome.windows.getAll({ windowTypes: ["normal"], populate: true }))
    .filter((w) => w.incognito === target.incognito);
}

// Group every unpinned tab in all windows, then give each group its own window.
// Tabs are classified before anything moves, so a Jev failure leaves windows untouched.
async function groupAllWindows(windowId, mode) {
  const tabs = (await sameProfileWindows(windowId)).flatMap((w) => w.tabs).filter((t) => !t.pinned);
  const keys = mode === "category" ? await mapPool(tabs, classify) : tabs.map(domainOf);
  const keyById = new Map(tabs.map((t, i) => [t.id, keys[i]]));
  await mergeWindows(windowId);
  const summary = await regroup(windowId, mode, keyById);
  await splitGroups(windowId);
  return summary + ", one window each";
}

async function ungroupAll() {
  const grouped = (await chrome.tabs.query({})).filter((t) => t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE).map((t) => t.id);
  if (grouped.length) await chrome.tabs.ungroup(grouped);
  return `Ungrouped ${grouped.length} tabs`;
}

async function regroup(windowId, mode, keyById) {
  const all = await chrome.tabs.query({ windowId });
  const pinnedCount = all.filter((t) => t.pinned).length;
  const tabs = all.filter((t) => !t.pinned);
  const grouped = tabs.filter((t) => t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE).map((t) => t.id);
  if (grouped.length) await chrome.tabs.ungroup(grouped);

  // Tabs opened after classification started fall back to Other / their domain.
  const keys = tabs.map((t) => keyById.get(t.id) ?? (mode === "category" ? "Other" : domainOf(t)));
  const buckets = new Map();
  tabs.forEach((t, i) => (buckets.get(keys[i]) || buckets.set(keys[i], []).get(keys[i])).push(t));

  const order = Object.keys(CATEGORIES);
  const names = [...buckets.keys()].sort((a, b) =>
    mode === "category" ? order.indexOf(a) - order.indexOf(b) : a.localeCompare(b));
  // Domains with a single tab stay ungrouped, sorted after the groups.
  const minSize = mode === "category" ? 1 : 2;
  const groupNames = names.filter((n) => buckets.get(n).length >= minSize);
  const loose = names.filter((n) => buckets.get(n).length < minSize);

  const ordered = [...groupNames, ...loose].flatMap((n) => buckets.get(n).map((t) => t.id));
  await chrome.tabs.move(ordered, { index: pinnedCount });
  for (const name of groupNames) {
    const groupId = await chrome.tabs.group({ tabIds: buckets.get(name).map((t) => t.id), createProperties: { windowId } });
    const color = mode === "category" ? CATEGORIES[name][1] : colorFor(name);
    await chrome.tabGroups.update(groupId, { title: name, color });
  }
  return `${tabs.length} tabs → ${groupNames.length} groups` + (loose.length ? `, ${loose.length} ungrouped` : "");
}

// Move each tab group into its own new window. Ungrouped and pinned tabs stay put.
async function splitGroups(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const groupIds = [...new Set(tabs.map((t) => t.groupId).filter((g) => g !== chrome.tabGroups.TAB_GROUP_ID_NONE))];
  if (!groupIds.length) return 0;
  // Keep one group here rather than emptying (and closing) the window.
  if (!tabs.some((t) => t.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE)) groupIds.shift();
  for (const groupId of groupIds) {
    const win = await chrome.windows.create({ focused: false });
    const [blank] = await chrome.tabs.query({ windowId: win.id });
    await chrome.tabGroups.move(groupId, { windowId: win.id, index: -1 });
    await chrome.tabs.remove(blank.id);
  }
  return groupIds.length;
}

async function splitAllWindows(windowId) {
  let moved = 0;
  for (const win of await sameProfileWindows(windowId)) moved += await splitGroups(win.id);
  return moved ? `Moved ${moved} groups to their own windows` : "No groups to split";
}

// Move every tab from other normal windows into this one, keeping groups intact.
async function mergeWindows(windowId) {
  const others = (await sameProfileWindows(windowId)).filter((w) => w.id !== windowId);
  let moved = 0;
  for (const win of others) {
    const movedGroups = new Set();
    for (const tab of win.tabs) {
      if (tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
        await chrome.tabs.move(tab.id, { windowId, index: -1 });
        if (tab.pinned) await chrome.tabs.update(tab.id, { pinned: true });
      } else if (!movedGroups.has(tab.groupId)) {
        movedGroups.add(tab.groupId);
        await chrome.tabGroups.move(tab.groupId, { windowId, index: -1 });
      }
      moved++;
    }
  }
  return others.length ? `Merged ${moved} tabs from ${others.length} windows` : "Only one window open";
}

const ACTIONS = {
  domain: (id) => groupAllWindows(id, "domain"),
  category: (id) => groupAllWindows(id, "category"),
  ungroup: ungroupAll,
  split: splitAllWindows,
  merge: mergeWindows,
};

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  ACTIONS[msg.mode](msg.windowId)
    .then((summary) => reply({ summary }))
    .catch((e) => reply({ error: e.message }));
  return true;
});
