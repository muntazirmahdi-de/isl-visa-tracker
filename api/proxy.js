export default async function handler(req, res) {
  const { month, page, pageSize } = req.query;
  const params = new URLSearchParams({
    month: month || "",
    page: page || "1",
    pageSize: pageSize || "100",
  });

  const upstreamUrl = `https://isl-waiting-list.waleedashraf9t.com/api/proxy?${params.toString()}`;

  // Abort if upstream hangs — prevents one slow month from stalling the page.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const upstream = await fetch(upstreamUrl, { signal: controller.signal });
    clearTimeout(timeout);

    const rawText = await upstream.text();

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      // Upstream didn't return JSON (error page, empty body, etc.)
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.status(502).json({
        error: "Upstream returned non-JSON response",
        upstreamStatus: upstream.status,
        month: month || null,
        bodyPreview: rawText.slice(0, 300),
      });
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(upstream.status).json(data);

  } catch (err) {
    clearTimeout(timeout);
    res.setHeader("Access-Control-Allow-Origin", "*");
    const isAbort = err.name === "AbortError";
    return res.status(isAbort ? 504 : 500).json({
      error: isAbort ? "Upstream request timed out" : err.message,
      month: month || null,
    });
  }
}
