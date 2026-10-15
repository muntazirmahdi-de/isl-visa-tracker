import { load } from "cheerio";

const BASE_URL = process.env.DASHBOARD_URL || "https://visatracker.waleedingermany.com/";
const CONSULATE = "islamabad_consulate";   // this tracker is Islamabad-only
const MAX_PAGES = 100;                     // hard safety stop
const PAGE_CONCURRENCY = 9;                // pages fetched in parallel per batch
const CACHE_MS = 2 * 60 * 1000;

// The site is a Next.js app. Each page embeds its full data as JSON inside
// <script>self.__next_f.push([1,"..."])</script> chunks. Join the chunks,
// then pull out the {"applicants":[...],"pagination":{...}} object.
function extractPayload(html) {
  const $ = load(html);
  const prefix = "self.__next_f.push(";
  let flight = "";

  $("script").each((_, el) => {
    const text = ($(el).html() || "").trim();
    if (!text.startsWith(prefix) || !text.endsWith(")")) return;
    try {
      const arr = JSON.parse(text.slice(prefix.length, -1));
      if (arr[0] === 1 && typeof arr[1] === "string") flight += arr[1];
    } catch {
      /* ignore chunks that aren't plain JSON */
    }
  });

  const start = flight.indexOf('{"applicants":[');
  if (start === -1) {
    throw new Error(
      "Applicant data not found in page — the site's structure may have changed again."
    );
  }

  // Balanced-brace scan (string-aware) to find the end of the object
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < flight.length; i++) {
    const c = flight[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return JSON.parse(flight.slice(start, i + 1));
    }
  }
  throw new Error("Applicant data in page was cut off or malformed.");
}

async function fetchPage(pageNum, attempt = 1) {
  const url = `${BASE_URL}?consulate=${CONSULATE}&page=${pageNum}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ISLVisaTracker/3.0; +https://github.com/muntazirmahdi-de/isl-visa-tracker)",
      },
    });
    if (!res.ok) throw new Error(`Dashboard page ${pageNum} failed with status ${res.status}`);
    const payload = extractPayload(await res.text());
    if (payload.pagination && payload.pagination.page !== pageNum) {
      console.warn(`Requested page ${pageNum} but site returned page ${payload.pagination.page}`);
    }
    return payload;
  } catch (err) {
    if (attempt < 2) return fetchPage(pageNum, attempt + 1); // one retry
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// Map the site's record to the shape the frontend already understands.
function toRecord(a, number) {
  const status = a.application_status;
  const hasSubmitted = status === "got_submission" && Boolean(a.submission_date);
  return {
    id: a.id,
    fullName: (a.name || "").trim() || "Unnamed",
    university: a.university_name || "",
    joinDate: (a.joining_date || "").slice(0, 10),        // "2026-01-10"
    joinTime: String(number).padStart(5, "0"),            // site queue number: stable same-day order
    consulate: a.consulate || "",
    applicationStatus: status || "",
    hasGotSlot: status === "got_submission",
    hasSubmitted,                                         // site labels this "Submitted"
    hasCorrection: status === "under_correction",
    hasAppointment: status === "got_appointment",
  };
}

async function scrapeAll() {
  const first = await fetchPage(1);
  const pageCount = Math.min(first.pagination?.pageCount || 1, MAX_PAGES);
  const payloads = [first];

  for (let start = 2; start <= pageCount; start += PAGE_CONCURRENCY) {
    const nums = [];
    for (let n = start; n < start + PAGE_CONCURRENCY && n <= pageCount; n++) nums.push(n);
    payloads.push(...(await Promise.all(nums.map((n) => fetchPage(n)))));
  }

  const byId = new Map();
  for (const p of payloads) {
    const offset = p.pagination?.from ?? ((p.pagination?.page || 1) - 1) * (p.applicants.length || 50);
    p.applicants.forEach((a, i) => {
      if (byId.has(a.id)) return;
      byId.set(a.id, toRecord(a, offset + i + 1));
    });
  }

  const expected = first.pagination?.total;
  if (expected && byId.size !== expected) {
    console.warn(`Expected ${expected} applicants from site but collected ${byId.size}`);
  }

  return [...byId.values()]
    .filter((r) => r.consulate === CONSULATE)             // safety net if the URL filter is ignored
    .filter((r) => r.applicationStatus !== "withdrawn")   // withdrawn applicants are not in the queue
    .sort((a, b) => a.joinTime.localeCompare(b.joinTime));
}

let cache = { data: null, timestamp: 0 };
let inflight = null; // share one scrape between simultaneous requests

export async function fetchApplicants({ forceRefresh = false } = {}) {
  if (!forceRefresh && cache.data && Date.now() - cache.timestamp < CACHE_MS) {
    return cache.data;
  }
  if (!inflight) {
    inflight = scrapeAll()
      .then((data) => { cache = { data, timestamp: Date.now() }; return data; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}
