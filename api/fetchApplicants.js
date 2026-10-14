import { load } from "cheerio";

const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://visatracker.waleedingermany.com/";
const MAX_PAGES = 200;        // hard safety stop
const PAGE_CONCURRENCY = 6;   // pages fetched in parallel per batch

const MONTH_MAP = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04",
  May: "05", Jun: "06", Jul: "07", Aug: "08",
  Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

// "22-Dec-2025" -> "2025-12-22"
function toIsoDate(ddMmmYyyy) {
  if (!ddMmmYyyy) return "";
  const parts = ddMmmYyyy.trim().split("-");
  if (parts.length !== 3) return "";
  const [dd, mmm, yyyy] = parts;
  const mm = MONTH_MAP[mmm];
  if (!mm || !/^\d{4}$/.test(yyyy) || !/^\d{1,2}$/.test(dd)) return "";
  return `${yyyy}-${mm}-${dd.padStart(2, "0")}`;
}

// Very small in-memory cache. Only helps on a warm serverless instance
// (repeat requests hitting the same running lambda) — harmless otherwise.
let cache = { data: null, timestamp: 0 };
const CACHE_MS = 60 * 1000;

function findApplicantTable($) {
  let table = null;
  $("table").each((_, el) => {
    const text = $(el).text();
    if (text.includes("Visa Status") && text.includes("Joining Date")) {
      table = el;
    }
  });
  if (!table) table = $("table").first().get(0);
  return table;
}

// Highest ?page=N number found in pagination links (null if none).
function detectLastPage($) {
  let max = 0;
  $("a[href*='page=']").each((_, el) => {
    const m = /[?&]page=(\d+)/.exec($(el).attr("href") || "");
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return max || null;
}

function parseDashboardHtml(html, { required = true } = {}) {
  const $ = load(html);
  const table = findApplicantTable($);
  if (!table) {
    if (!required) return [];
    throw new Error(
      "Applicant table not found in dashboard HTML — the site's markup may have changed."
    );
  }

  const $table = $(table);
  const rows = $table.find("tbody tr").length
    ? $table.find("tbody tr")
    : $table.find("tr");

  const records = [];
  let currentGroup = "";

  rows.each((_, row) => {
    const $row = $(row);
    const cells = $row.find("td");

    // Date-group header rows span the whole table (single cell, often
    // with a colspan) and read like "Monday, 22 December 2025 · 1 applicant"
    if (cells.length <= 1) {
      const text = $row.text().replace(/\s+/g, " ").trim();
      if (/applicants?/i.test(text)) {
        currentGroup = text.split("·")[0].trim();
      }
      return;
    }

    const vals = cells.toArray().map((c) => $(c).text().replace(/\s+/g, " ").trim());
    // Expected column order:
    // #, Name, University, Joining Date, Got Submission, Submitted On,
    // Correction Date, Appointment Date, Consulate, Visa Status
    const [
      , fullName, university, joiningDate, gotSubmission,
      submittedOn, correctionDate, appointmentDate, consulate, visaStatus,
    ] = vals;

    if (!fullName) return;

    const isoDate = toIsoDate(joiningDate);

    records.push({
      fullName,
      university: university || "",
      joinDate: isoDate || joiningDate || "",
      joinTime: "", // assigned after all pages are combined
      consulate: consulate || "",
      visaStatus: visaStatus || "",
      hasGotSlot: Boolean(gotSubmission),
      hasSubmitted: Boolean(submittedOn),
      hasCorrection: Boolean(correctionDate),
      hasAppointment: Boolean(appointmentDate),
      dateGroup: currentGroup,
    });
  });

  return records;
}

async function fetchPageHtml(pageNum) {
  const url = pageNum === 1 ? DASHBOARD_URL : `${DASHBOARD_URL}?page=${pageNum}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ISLVisaTracker/2.0; +https://github.com/muntazirmahdi-de/isl-visa-tracker)",
      },
    });
    if (!res.ok) {
      throw new Error(`Dashboard page ${pageNum} failed with status ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

const signature = (rows) => rows.map((r) => `${r.fullName}|${r.joinDate}`).join("~");

export async function fetchApplicants({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && cache.data && now - cache.timestamp < CACHE_MS) {
    return cache.data;
  }

  // Page 1 (also tells us how many pages the site advertises)
  const firstHtml = await fetchPageHtml(1);
  const firstRows = parseDashboardHtml(firstHtml);
  const knownLast = detectLastPage(load(firstHtml));

  const pages = [firstRows];
  let lastSig = signature(firstRows);
  let next = 2;
  let done = firstRows.length === 0;

  while (!done && next <= MAX_PAGES) {
    // Fetch advertised pages in parallel batches; once past the last
    // advertised page, step one page at a time to confirm the end.
    const batchEnd = knownLast && next <= knownLast
      ? Math.min(next + PAGE_CONCURRENCY - 1, knownLast, MAX_PAGES)
      : next;
    const nums = [];
    for (let n = next; n <= batchEnd; n++) nums.push(n);

    const batch = await Promise.all(
      nums.map(async (n) => parseDashboardHtml(await fetchPageHtml(n), { required: false }))
    );

    for (const rows of batch) {
      const sig = signature(rows);
      // Empty page, or the site repeating the previous page => no more data
      if (rows.length === 0 || sig === lastSig) { done = true; break; }
      pages.push(rows);
      lastSig = sig;
    }
    next = batchEnd + 1;
  }

  // Combine in page order, then assign a stable, site-wide order index
  const records = pages.flat();
  let group = "";
  records.forEach((r, i) => {
    r.joinTime = String(i + 1).padStart(5, "0");
    if (r.dateGroup) group = r.dateGroup; else r.dateGroup = group;
  });

  cache = { data: records, timestamp: now };
  return records;
}
