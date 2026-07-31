import { load } from "cheerio";

const DASHBOARD_URL = "https://visatracker.waleedingermany.com/";

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

function parseDashboardHtml(html) {
  const $ = load(html);
  const table = findApplicantTable($);
  if (!table) {
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
  let runningIndex = 0;

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

    runningIndex += 1;
    const isoDate = toIsoDate(joiningDate);

    records.push({
      fullName,
      university: university || "",
      joinDate: isoDate || joiningDate || "",
      joinTime: String(runningIndex).padStart(5, "0"), // stable tie-breaker for same-day sorting
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

export async function fetchApplicants({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && cache.data && now - cache.timestamp < CACHE_MS) {
    return cache.data;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  let html;
  try {
    const res = await fetch(DASHBOARD_URL, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ISLVisaTracker/2.0; +https://github.com/muntazirmahdi-de/isl-visa-tracker)",
      },
    });
    if (!res.ok) {
      throw new Error(`Dashboard fetch failed with status ${res.status}`);
    }
    html = await res.text();
  } finally {
    clearTimeout(timeout);
  }

  const records = parseDashboardHtml(html);
  cache = { data: records, timestamp: now };
  return records;
}
