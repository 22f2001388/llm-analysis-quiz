
import Fastify from "fastify";
import { parseArgs } from "util";
import type { FastifyInstance } from "fastify";

const args = parseArgs({
  args: process.argv.slice(2),
  options: {
    type: { type: 'string' },
    port: { type: 'string' }
  }
});

const serverType = args.values.type || 'quiz';
const port = parseInt(args.values.port || '4545');

if (isNaN(port) || port < 1 || port > 65535) {
  console.error('Error: Invalid port number');
  process.exit(1);
}

if (!['quiz', 'page'].includes(serverType)) {
  console.error('Error: Server type must be "quiz" or "page"');
  process.exit(1);
}

async function startQuizServer(port: number): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const csv = "value\n1\n2\n3\n4\n5\n";

  app.get("/", async () => `
    <html><body>
      <div id="result">
        Page 34. Download <a href="/data.csv">file</a>.
      What is sum of "value" column?

<pre>
{
  "email": "your-email",
  "secret": "your secret",
  "url": "http://localhost:${port}/",
  "answer": 15
}
</pre>
      </div>
    </body></html>
  `);

  app.get("/data.csv", async (_, reply) => {
    reply.type("text/csv").send(csv);
  });

  app.post("/submit", async (req, reply) => {
    const body = req.body as any;
    const correct = body?.answer === 15;
    reply.send({
      correct,
      reason: correct ? "All good" : "Try again",
      url: correct ? `http://localhost:${port}/done` : undefined
    });
  });

  app.get("/done", async () => `
    <html><body>
      <div id="result">Chain complete</div>
    </body></html>
  `);

  return app;
}

async function startPageServer(port: number): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const html = "<!DOCTYPE html>\n" +
    "<html>\n" +
    "<head>\n" +
    "  <title>Quiz Page</title>\n" +
    "</head>\n" +
    "<body>\n" +
    "  <div id=\"result\"></div>\n" +
    "\n" +
    "  <script>\n" +
    "    document.querySelector(\"#result\").innerHTML = atob(`UTgzNC4gRG93bmxvYWQgPGEgaHJlZj0iaHR0cHM6Ly9leGFtcGxlLmNvbS9kYXRhLXE4MzQucGRmIj5maWxlPC9hPi4KV2hhdCBpcyB0aGUgc3VtIG9mIHRoZSAidmFsdWUiIGNvbHVtbiBpbiB0aGUgdGFibGUgb24gcGFnZSAyPwoKUG9zdCB5b3VyIGFuc3dlciB0byBodHRwczovL2V4YW1wbGUuY29tL3N1Ym1pdHdpdGggdGhpcyBKU09OIHBheWxvYWQ6Cgo8cHJlPgp7CiAgImVtYWlsIjogInlvdXItZW1haWwiLAogICJzZWNyZXQiOiAieW91ciBzZWNyZXQiLAogICJ1cmwiOiAiaHR0cHM6Ly9leGFtcGxlLmNvbS9xdWl6LTgzNCIsCiAgImFuc3dlciI6IDEyMzQ1CiAgfQo8L3ByZT4K`);\n" +
    "  </script>\n" +
    "</body>\n" +
    "</html>";

  app.get("/", async () => html);

  return app;
}

async function main() {
  try {
    const app = serverType === 'quiz'
      ? await startQuizServer(port)
      : await startPageServer(port);

    if (serverType === 'quiz') {
      console.log(`Quiz mock server running on http://localhost:${port}`);
      console.log(`Quiz page: http://localhost:${port}/`);
      console.log(`CSV data: http://localhost:${port}/data.csv`);
      console.log(`Submit endpoint: POST http://localhost:${port}/submit`);
    } else {
      console.log(`Quiz page server running on http://localhost:${port}`);
      console.log(`Quiz page: http://localhost:${port}/`);
    }

    await app.listen({ port, host: "127.0.0.1" });

  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  process.exit(0);
});

main();