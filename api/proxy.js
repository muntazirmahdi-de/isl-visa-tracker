export default async function handler(req, res) {
  try {
    const { month, page, pageSize } = req.query;
    const params = new URLSearchParams({
      month: month || "",
      page: page || "1",
      pageSize: pageSize || "100",
    });
    const upstream = await fetch(
      `https://isl-waiting-list.waleedashraf9t.com/api/proxy?${params.toString()}`
    );
    const data = await upstream.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
