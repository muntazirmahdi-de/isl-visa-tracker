export default async function handler(req, res) {
  try {
    const upstream = await fetch("https://isl-waiting-list.waleedashraf9t.com/api/months");
    const data = await upstream.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
