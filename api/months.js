import { fetchApplicants } from "../lib/fetchApplicants.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const records = await fetchApplicants();

    const monthSet = new Set(
      records
        .map((r) => (r.joinDate || "").slice(0, 7))
        .filter((v) => /^\d{4}-\d{2}$/.test(v))
    );

    const months = Array.from(monthSet)
      .sort()
      .map((value) => ({ value }));

    return res.status(200).json({ months });
  } catch (err) {
    const isAbort = err.name === "AbortError";
    return res.status(isAbort ? 504 : 500).json({
      error: isAbort ? "Upstream request timed out" : err.message,
    });
  }
}
