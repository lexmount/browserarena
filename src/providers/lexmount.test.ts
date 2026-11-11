import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import test, { afterEach, beforeEach, type TestContext } from "node:test";
import { Lexmount } from "lexmount";
import { SessionCreationError } from "../types.js";
import { getMissingEnvVarsForProvider, getRequiredEnvVarsForProvider, resolveProvider } from "./index.js";
import { LexmountLightProvider, LexmountNormalProvider } from "./lexmount.js";

const originalApiKey = process.env.LEXMOUNT_API_KEY;
const originalProjectId = process.env.LEXMOUNT_PROJECT_ID;

beforeEach(() => {
  process.env.LEXMOUNT_API_KEY = "lm-test-key";
  process.env.LEXMOUNT_PROJECT_ID = "project-1";
});

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.LEXMOUNT_API_KEY;
  else process.env.LEXMOUNT_API_KEY = originalApiKey;
  if (originalProjectId === undefined) delete process.env.LEXMOUNT_PROJECT_ID;
  else process.env.LEXMOUNT_PROJECT_ID = originalProjectId;
});

type CapturedRequest = {
  method: string;
  path: string;
  body: unknown;
  key?: string;
  project?: string;
};

async function fixture(t: TestContext, provider: LexmountLightProvider | LexmountNormalProvider) {
  const requests: CapturedRequest[] = [];
  let ws = "wss://browser.example/cdp?token=fixture";
  let deleteStatus = 200;

  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    requests.push({
      method: req.method!,
      path: req.url!,
      body: body ? JSON.parse(body) : null,
      key: req.headers["x-api-key"] as string | undefined,
      project: req.headers["x-project-id"] as string | undefined,
    });
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/regions/catalog") {
      res.end(JSON.stringify({ regions: [] }));
      return;
    }
    if (req.method === "POST" && req.url === "/instance/v2") {
      res.end(JSON.stringify({ session_id: "lm-1" }));
      return;
    }
    if (req.method === "POST" && req.url === "/instance/session") {
      res.end(JSON.stringify({ session_id: "lm-1", status: "active", ws, region_id: "hk-1" }));
      return;
    }
    if (req.method === "GET" && req.url?.startsWith("/json/version")) {
      res.end("{}");
      return;
    }
    if (req.method === "DELETE" && req.url === "/instance") {
      res.statusCode = deleteStatus;
      res.end(JSON.stringify(deleteStatus < 400 ? { status: "deleted" } : { error: "fixture failure" }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));

  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  Object.assign(provider, {
    _client: new Lexmount({ apiKey: "lm-test-key", projectId: "project-1", baseUrl }),
  });
  return {
    provider,
    requests,
    setWs: (value: string) => { ws = value; },
    setDeleteStatus: (value: number) => { deleteStatus = value; },
  };
}

test("registers both Lexmount variants and checks credentials before creating a session", async () => {
  assert.ok(resolveProvider("lexmount-light") instanceof LexmountLightProvider);
  assert.ok(resolveProvider("lexmount-normal") instanceof LexmountNormalProvider);
  for (const key of ["lexmount-light", "lexmount-normal"]) {
    assert.deepEqual(getRequiredEnvVarsForProvider(key), ["LEXMOUNT_API_KEY", "LEXMOUNT_PROJECT_ID"]);
    assert.deepEqual(getMissingEnvVarsForProvider(key), []);
  }

  delete process.env.LEXMOUNT_API_KEY;
  assert.deepEqual(getMissingEnvVarsForProvider("lexmount-normal"), ["LEXMOUNT_API_KEY"]);
  await assert.rejects(() => new LexmountNormalProvider().create(), /LEXMOUNT_API_KEY/);

  process.env.LEXMOUNT_API_KEY = "lm-test-key";
  delete process.env.LEXMOUNT_PROJECT_ID;
  assert.deepEqual(getMissingEnvVarsForProvider("lexmount-light"), ["LEXMOUNT_PROJECT_ID"]);
  await assert.rejects(() => new LexmountLightProvider().create(), /LEXMOUNT_PROJECT_ID/);
});

test("creates an isolated Chromium session and preserves its CDP URL", async t => {
  const f = await fixture(t, new LexmountNormalProvider());
  assert.deepEqual(await f.provider.create(), {
    id: "lm-1",
    cdpUrl: "wss://browser.example/cdp?token=fixture",
    configuration: {
      browserMode: "normal",
      downloads: false,
      persistentReplay: false,
      region: "hk-1",
    },
  });

  const create = f.requests.find(request => request.path === "/instance/v2")!;
  assert.equal(create.method, "POST");
  assert.equal(create.key, "lm-test-key");
  assert.equal(create.project, "project-1");
  assert.deepEqual(create.body, {
    browser_mode: "normal",
    enable_lightmount_layout: true,
    enable_captcha: false,
    downloads: { enabled: false },
    recording: { persistent: false },
  });
  assert.deepEqual(
    f.requests.find(request => request.path === "/instance/session")!.body,
    { session_id: "lm-1" }
  );
});

test("creates an isolated Moli session with the LightMount integrations", async t => {
  const f = await fixture(t, new LexmountLightProvider());
  assert.deepEqual(await f.provider.create(), {
    id: "lm-1",
    cdpUrl: "wss://browser.example/cdp?token=fixture",
    configuration: {
      browserMode: "light",
      lightmountLayout: true,
      lightmountResource: true,
      downloads: false,
      persistentReplay: false,
      region: "hk-1",
    },
  });

  assert.deepEqual(f.requests.find(request => request.path === "/instance/v2")!.body, {
    browser_mode: "light",
    enable_lightmount_layout: true,
    enable_lightmount_resource: true,
    enable_captcha: false,
    downloads: { enabled: false },
    recording: { persistent: false },
  });
});

test("releases the paid session when the CDP URL is missing or unusable", async t => {
  for (const ws of ["", "https://browser.example/cdp"]) {
    const f = await fixture(t, new LexmountNormalProvider());
    f.setWs(ws);
    await assert.rejects(() => f.provider.create(), (error: unknown) => {
      assert.ok(error instanceof SessionCreationError);
      assert.equal(error.sessionId, "lm-1");
      assert.equal(error.cleanupError, null);
      assert.ok(error.releaseMs !== null);
      assert.match(error.message, /missing or invalid CDP URL/);
      return true;
    });
    assert.ok(f.requests.some(request => request.method === "DELETE" && request.path === "/instance"));
  }
});

test("reports failed cleanup alongside an invalid CDP URL", async t => {
  const f = await fixture(t, new LexmountNormalProvider());
  f.setWs("");
  f.setDeleteStatus(503);
  await assert.rejects(() => f.provider.create(), (error: unknown) => {
    assert.ok(error instanceof SessionCreationError);
    assert.equal(error.sessionId, "lm-1");
    assert.match(error.cleanupError!, /Failed to delete session/);
    assert.equal(error.releaseMs, null);
    return true;
  });
});

test("deletes sessions explicitly and surfaces termination failures", async t => {
  const f = await fixture(t, new LexmountNormalProvider());
  await f.provider.release("lm/1");
  assert.deepEqual(f.requests.at(-1), {
    method: "DELETE",
    path: "/instance",
    body: { session_id: "lm/1" },
    key: "lm-test-key",
    project: "project-1",
  });

  f.setDeleteStatus(503);
  await assert.rejects(() => f.provider.release("lm-1"), /Failed to delete session/);
});

test("verifies US proxy measurements through the official proxy", async t => {
  const f = await fixture(t, new LexmountNormalProvider());
  const session = await f.provider.create({ proxyCountry: "US" });
  assert.deepEqual(session.configuration, {
    browserMode: "normal",
    officialProxy: true,
    proxyCountry: "US",
    downloads: false,
    persistentReplay: false,
    region: "hk-1",
  });
  assert.deepEqual(f.requests.find(request => request.path === "/instance/v2")!.body, {
    browser_mode: "normal",
    official_proxy: true,
    enable_lightmount_layout: true,
    enable_captcha: false,
    downloads: { enabled: false },
    recording: { persistent: false },
  });
});

test("rejects proxy countries and engines without a verified exit", async t => {
  const normal = await fixture(t, new LexmountNormalProvider());
  await assert.rejects(() => normal.provider.create({ proxyCountry: "FR" }), /default egress is verified/);
  assert.deepEqual(normal.requests, []);

  const light = await fixture(t, new LexmountLightProvider());
  await assert.rejects(() => light.provider.create({ proxyCountry: "US" }), /default egress is verified/);
  assert.deepEqual(light.requests, []);
});

test("estimates unrounded browser time at $0.12/hour for both engines", () => {
  for (const provider of [new LexmountLightProvider(), new LexmountNormalProvider()]) {
    assert.equal(provider.computeCost(0), 0);
    assert.equal(provider.computeCost(30), 0.001);
    assert.equal(provider.computeCost(60), 0.002);
    assert.equal(provider.computeCost(90), 0.003);
    assert.equal(provider.computeCost(3600), 0.12);
  }
});
