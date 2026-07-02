import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import electron from "electron";

const port = 19_000 + Math.floor(Math.random() * 1_000);
const userData = await mkdtemp(path.join(tmpdir(), "soundgrid-smoke-"));
const output = [];
const child = spawn(
  electron,
  [".", `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`],
  {
    cwd: process.cwd(),
    env: { ...process.env, SOUNDGRID_TEST_UPDATE_VERSION: "9.9.9" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
child.stdout.on("data", (chunk) => output.push(chunk.toString()));
child.stderr.on("data", (chunk) => output.push(chunk.toString()));

try {
  const page = await waitForPage(port);
  const expressions = [
    "typeof window.soundgrid",
    "Boolean(document.querySelector('.app'))",
    "document.querySelector('.topbar-update')?.innerText",
    "document.querySelector('.topbar-update')?.hidden",
    "document.body.innerText",
  ];
  let values = [];
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    values = await evaluate(page.webSocketDebuggerUrl, expressions);
    if (
      values[0] === "object" &&
      values[1] === true &&
      values[2] === "Update 9.9.9" &&
      values[3] === false
    ) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (
    values[0] !== "object" ||
    values[1] !== true ||
    values[2] !== "Update 9.9.9" ||
    values[3] !== false
  ) {
    throw new Error(
      `Renderer smoke test failed: ${JSON.stringify(values)}\n${output.join("")}`,
    );
  }
  const compact = await evaluate(
    page.webSocketDebuggerUrl,
    [
      "document.documentElement.scrollWidth === innerWidth",
      "document.querySelector('.topbar')?.scrollWidth <= document.querySelector('.topbar')?.clientWidth",
      "document.querySelector('.topbar-buses')?.scrollWidth <= document.querySelector('.topbar-buses')?.clientWidth",
      "document.querySelector('.body')?.scrollWidth <= document.querySelector('.body')?.clientWidth",
    ],
    { width: 640, height: 480 },
  );
  if (compact.some((value) => value !== true)) {
    throw new Error(
      `Compact-layout smoke test failed: ${JSON.stringify(compact)}\n${output.join("")}`,
    );
  }
  console.log(
    "Electron smoke test passed: preload bridge, update UI, and compact layout loaded.",
  );
} finally {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    });
  } else {
    child.kill();
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  await rm(userData, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 150,
  });
}

async function waitForPage(debugPort) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const pages = await response.json();
      const page = pages.find((candidate) => candidate.type === "page");
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // Electron has not opened the debugging endpoint yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `Electron did not expose a renderer page.\n${output.join("")}`,
  );
}

async function evaluate(webSocketUrl, expressions, viewport) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  let nextId = 0;
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const resolve = pending.get(message.id);
    if (resolve) {
      pending.delete(message.id);
      resolve(message);
    }
  });
  const call = (method, params) =>
    new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });
  if (viewport) {
    await call("Emulation.setDeviceMetricsOverride", {
      ...viewport,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  const values = [];
  for (const expression of expressions) {
    const response = await call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    values.push(response.result.result.value);
  }
  socket.close();
  return values;
}
