import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";

const KUGOU_HOME = "https://www.kugou.com/";
const OUTPUT_DIR = path.resolve("output");
const STORAGE_DIR = path.resolve(".playwright");
const USER_DATA_DIR = path.join(STORAGE_DIR, "kugou-user-data");

function cleanText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function uniqueBy(items, getKey) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

async function waitForUser(message) {
  const rl = readline.createInterface({ input, output });
  try {
    await rl.question(`${message}\nPress Enter to continue...`);
  } finally {
    rl.close();
  }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function main() {
  await ensureDir(OUTPUT_DIR);
  await ensureDir(STORAGE_DIR);

  const browserContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1440, height: 960 }
  });

  const page = browserContext.pages()[0] || await browserContext.newPage();
  await page.goto(KUGOU_HOME, { waitUntil: "domcontentloaded" });

  console.log("Browser opened.");
  console.log("1. Log in to Kugou manually.");
  console.log("2. Open your 'Liked' songs page manually.");
  console.log("3. When the song list is visible, come back here and continue.");

  await waitForUser("Start scraping when ready.");

  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);

  const scrapeResult = await page.evaluate(() => {
    const clean = (value) => (value || "").replace(/\s+/g, " ").trim();

    const candidateRowSelectors = [
      "[data-index]",
      "[class*='song'][class*='item']",
      "[class*='Song'][class*='Item']",
      "[class*='music'][class*='item']",
      "[class*='list'][class*='item']",
      "tr",
      "li"
    ];

    const rows = [];
    for (const selector of candidateRowSelectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }
        const text = clean(node.innerText);
        if (!text || text.length < 4) {
          continue;
        }
        rows.push(node);
      }
    }

    const visibleRows = rows.filter((row) => {
      const style = window.getComputedStyle(row);
      const rect = row.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    });

    const parsed = visibleRows.map((row, index) => {
      const rowText = clean(row.innerText);
      const tokens = rowText
        .split(/\n+/)
        .map((item) => clean(item))
        .filter(Boolean);

      const linkTexts = Array.from(row.querySelectorAll("a"))
        .map((a) => clean(a.textContent || ""))
        .filter(Boolean);

      const songName =
        linkTexts[0] ||
        tokens[0] ||
        "";

      const artist =
        linkTexts[1] ||
        tokens.find((item, tokenIndex) => tokenIndex > 0 && item !== songName) ||
        "";

      const albumCandidates = tokens.filter(
        (item) => item !== songName && item !== artist
      );

      const album = albumCandidates[0] || "";

      return {
        index,
        songName,
        artist,
        album,
        rawText: rowText,
        linkTexts,
        tokens
      };
    });

    const filtered = parsed.filter((item) => {
      if (!item.songName || item.songName.length < 1) {
        return false;
      }

      const meaningless = [
        "Login",
        "Register",
        "Download",
        "More",
        "Play All",
        "Kugou Music",
        "Charts",
        "Recommend"
      ];

      return !meaningless.includes(item.songName);
    });

    const deduped = [];
    const seen = new Set();
    for (const item of filtered) {
      const key = [item.songName, item.artist, item.album, item.rawText].join("||");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(item);
    }

    return {
      title: document.title,
      url: location.href,
      totalCandidates: rows.length,
      items: deduped
    };
  });

  const normalizedItems = uniqueBy(
    scrapeResult.items
      .map((item) => ({
        songName: cleanText(item.songName),
        artist: cleanText(item.artist),
        album: cleanText(item.album),
        rawText: cleanText(item.rawText),
        linkTexts: Array.isArray(item.linkTexts) ? item.linkTexts.map(cleanText) : [],
        tokens: Array.isArray(item.tokens) ? item.tokens.map(cleanText) : []
      }))
      .filter((item) => item.songName || item.rawText),
    (item) => `${item.songName}__${item.artist}__${item.album}__${item.rawText}`
  );

  const payload = {
    exportedAt: new Date().toISOString(),
    pageTitle: scrapeResult.title,
    pageUrl: scrapeResult.url,
    count: normalizedItems.length,
    items: normalizedItems
  };

  const outputFile = path.join(
    OUTPUT_DIR,
    `kugou-liked-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );

  await fs.writeFile(outputFile, JSON.stringify(payload, null, 2), "utf8");

  console.log(`Scraping finished. Exported ${payload.count} records.`);
  console.log(`JSON file: ${outputFile}`);

  await waitForUser("Review the browser result if needed, then close it.");
  await browserContext.close();
}

main().catch(async (error) => {
  console.error("Run failed:", error);
  process.exitCode = 1;
});
