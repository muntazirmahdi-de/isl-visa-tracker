export default async function handler(req, res) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const upstream = await fetch("https://isl-waiting-list.waleedashraf9t.com/api/months", {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const rawText = await upstream.text();

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.status(502).json({
        error: "Upstream returned non-JSON response",
        upstreamStatus: upstream.status,
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
    });
  }
}
