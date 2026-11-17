const server = Bun.serve({
  hostname: "0.0.0.0",
  port: 8080,
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return Response.json({ ok: true, service: "freebuff-sandbox" });
    }
    return Response.json({ error: "not_found" }, { status: 404 });
  }
});

console.info(`sandbox health server listening on ${server.url}`);
