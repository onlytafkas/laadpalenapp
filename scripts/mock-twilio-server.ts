import http from "node:http";

const port = Number(process.env.MOCK_TWILIO_PORT ?? "4010");

function readBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (request.method === "POST" && request.url?.match(/^\/2010-04-01\/Accounts\/[^/]+\/Messages\.json$/)) {
    const body = await readBody(request);
    const params = new URLSearchParams(body);

    if (!request.headers.authorization?.startsWith("Basic ")) {
      response.writeHead(401, { "Content-Type": "text/plain" });
      response.end("Missing authorization header");
      return;
    }

    if (!params.get("To") || !params.get("From") || !params.get("Body")) {
      response.writeHead(400, { "Content-Type": "text/plain" });
      response.end("Missing Twilio message fields");
      return;
    }

    response.writeHead(201, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        sid: "SM_E2E_TEST_MESSAGE",
        status: "queued",
        to: params.get("To"),
        from: params.get("From"),
      })
    );
    return;
  }

  response.writeHead(404, { "Content-Type": "text/plain" });
  response.end("Not Found");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Mock Twilio server listening on http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}