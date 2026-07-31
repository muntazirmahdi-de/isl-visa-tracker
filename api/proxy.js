import { fetchApplicants } from "../lib/fetchApplicants.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { month, page, pageSize } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.max(1, parseInt(pageSize, 10) || 100);

  try {
    const all = await fetchApplicants();

    const filtered = month
      ? all.filter((r) => (r.joinDate || "").startsWith(month))
      : all;

    const totalPages = Math.max(1, Math.ceil(filtered.length / size));
    const start = (pageNum - 1) * size;
    const data = filtered.slice(start, start + size);

    return res.status(200).json({
      data,
      totalPages,
      page: pageNum,
      month: month || null,
      sheet: month || null,
    });
  } catch (err) {
    const isAbort = err.name === "AbortError";
    return res.status(isAbort ? 504 : 500).json({
      error: isAbort ? "Upstream request timed out" : err.message,
      month: month || null,
    });
  }
}
