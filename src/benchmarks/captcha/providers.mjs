import { randomUUID } from "node:crypto";

// CAPTCHA presets deliberately differ from lifecycle presets: native solvers and proxies, no SDK retries.
// Anchor session states that mean the session no longer runs (`GET /v1/sessions/{id}`).
export const ANCHOR_ENDED_STATUSES = new Set(["completed", "failed", "terminated", "stopped", "expired"]);

export function createProviders(load, env = process.env, request = fetch) {
  async function api(url, method, headers, body, signal = AbortSignal.timeout(60_000)) {
    const response = await request(url, { method, headers: { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body), signal });
    if (!response.ok) {
      const error = new Error(`Provider request failed: HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  return async function create(provider) {
    if (provider === "browserbase") {
      const { Browserbase } = load("@browserbasehq/sdk");
      const client = new Browserbase({ apiKey: env.BROWSERBASE_API_KEY, maxRetries: 0, timeout: 60_000 });
      const data = await client.sessions.create({ projectId: env.BROWSERBASE_PROJECT_ID, region: "us-east-1",
        proxies: true, timeout: 300, browserSettings: { solveCaptchas: true, blockAds: false } });
      return { id: data.id, cdpUrl: data.connectUrl,
        configuration: { solveCaptchas: true, proxy: true, region: "us-east-1" },
        release: () => client.sessions.update(data.id, { status: "REQUEST_RELEASE", projectId: env.BROWSERBASE_PROJECT_ID }, { maxRetries: 0, timeout: 30_000 }) };
    }
    if (provider === "steel") {
      const { default: Steel } = load("steel-sdk");
      const client = new Steel({ steelAPIKey: env.STEEL_API_KEY, maxRetries: 0, timeout: 60_000 });
      const data = await client.sessions.create({ solveCaptcha: true, useProxy: true, sessionTimeout: 300_000 });
      return { id: data.id, cdpUrl: data.websocketUrl ? `${data.websocketUrl}&apiKey=${env.STEEL_API_KEY}` : undefined,
        configuration: { solveCaptcha: true, proxy: true },
        release: () => client.sessions.release(data.id, {}, { maxRetries: 0, timeout: 30_000 }),
        diagnostics: () => client.sessions.captchas.status(data.id, { maxRetries: 0, timeout: 15_000 }) };
    }
    if (provider === "kernel") {
      const { default: Kernel } = load("@onkernel/sdk");
      const client = new Kernel({ apiKey: env.KERNEL_API_KEY, maxRetries: 0, timeout: 60_000 });
      const data = await client.browsers.create({ stealth: true, headless: true, timeout_seconds: 300 });
      return { id: data.session_id, cdpUrl: data.cdp_ws_url,
        configuration: { stealth: true, headless: true, proxy: "stealth ISP default" },
        release: () => client.browsers.deleteByID(data.session_id, { maxRetries: 0, timeout: 30_000 }) };
    }
    if (provider === "browser-use") {
      const base = "https://api.browser-use.com/api/v4/browsers";
      const headers = { "X-Browser-Use-API-Key": env.BROWSER_USE_API_KEY };
      const data = await api(base, "POST", headers, { proxyCountryCode: "us", timeout: 5, enableRecording: false });
      return { id: data.id, cdpUrl: data.cdpUrl?.replace("https://", "wss://"),
        configuration: { solver: "provider default", proxy: "US", api: "v4" },
        release: () => api(`${base}/${data.id}`, "PATCH", headers, { action: "stop" }, AbortSignal.timeout(30_000)) };
    }
    if (provider === "notte") {
      const base = "https://api.notte.cc";
      const headers = { Authorization: `Bearer ${env.NOTTE_API_KEY}` };
      const data = await api(`${base}/sessions/start`, "POST", headers, {
        browser_type: "chrome", headless: true, proxies: [{ type: "notte", country: "us" }],
        solve_captchas: true, max_duration_minutes: 5, block_ads: false,
      });
      return { id: data.session_id, cdpUrl: data.cdp_url,
        configuration: { browser_type: "chrome", headless: true, solve_captchas: true, proxy: "US", block_ads: false, api: base },
        release: () => api(`${base}/sessions/${data.session_id}/stop`, "DELETE", headers, undefined, AbortSignal.timeout(30_000)) };
    }
    if (provider === "hyperbrowser") {
      const { Hyperbrowser } = load("@hyperbrowser/sdk");
      // The SDK retries GET requests only; create and stop are single POST and PUT calls.
      const client = new Hyperbrowser({ apiKey: env.HYPERBROWSER_API_KEY, timeout: 60_000 });
      const data = await client.sessions.create({ solveCaptchas: true, useProxy: true, proxyCountry: "US",
        region: "us-east", adblock: false, timeoutMinutes: 5 });
      const releaser = new Hyperbrowser({ apiKey: env.HYPERBROWSER_API_KEY, timeout: 30_000 });
      return { id: data.id, cdpUrl: data.wsEndpoint,
        configuration: { solveCaptchas: true, proxy: "US", region: "us-east", adblock: false },
        release: () => releaser.sessions.stop(data.id) };
    }
    if (provider === "anchorbrowser") {
      const base = "https://api.anchorbrowser.io/v1/sessions";
      const headers = { "anchor-api-key": env.ANCHORBROWSER_API_KEY };
      // The solver requires Anchor's proxy. Ad and popup blocking stay off, as for the other presets.
      const response = await api(base, "POST", headers, {
        browser: { captcha_solver: { active: true }, adblock: { active: false }, popup_blocker: { active: false } },
        session: { proxy: { active: true, type: "anchor_proxy", country_code: "us" }, timeout: { max_duration: 5 } },
      }, AbortSignal.timeout(90_000));
      const data = response?.data ?? {};
      return { id: data.id, cdpUrl: data.cdp_url,
        configuration: { captcha_solver: true, proxy: "US", adblock: false, popup_blocker: false },
        release: () => api(`${base}/${encodeURIComponent(data.id)}`, "DELETE", headers, undefined, AbortSignal.timeout(30_000)),
        ended: async () => {
          const state = await api(`${base}/${encodeURIComponent(data.id)}`, "GET", headers, undefined, AbortSignal.timeout(15_000));
          return ANCHOR_ENDED_STATUSES.has(state?.data?.status);
        } };
    }
    if (provider === "browserless") {
      // No session API: connecting starts the browser and disconnecting ends it. The ID is
      // local, so the campaign can track ownership; cleanup is the harness's browser.close().
      const url = new URL("wss://production-sfo.browserless.io/stealth");
      url.search = new URLSearchParams({ token: env.BROWSERLESS_API_KEY, proxy: "residential", proxyCountry: "us",
        solveCaptchas: "true", timeout: "300000" }).toString();
      return { id: `browserless-${randomUUID()}`, cdpUrl: url.toString(),
        configuration: { route: "stealth", solveCaptchas: true, proxy: "residential US", region: "sfo" },
        release: async () => {} };
    }
    if (provider === "tilion") {
      const base = (env.TILION_BASE_URL || "https://api.tilion.dev").replace(/\/+$/, "");
      const headers = { Authorization: `Bearer ${env.TILION_API_KEY}` };
      // cdp_observe (Tilion's default) is the automatic challenge recovery for CDP clients.
      const data = await api(`${base}/v1/session`, "POST", headers,
        { residential: true, region: "us", cdp_observe: true, ttl: 300 }, AbortSignal.timeout(60_000));
      let cdpUrl = data?.connect_url;
      if (base.startsWith("https://") && cdpUrl?.startsWith("ws://")) cdpUrl = `wss://${cdpUrl.slice(5)}`;
      const release = async () => {
        try { await api(`${base}/v1/session/${encodeURIComponent(data.session_id)}`, "DELETE", headers, undefined, AbortSignal.timeout(30_000)); }
        catch (error) { if (!/HTTP 404$/.test(error.message)) throw error; }
      };
      // A wrong-region session is still ours: return it as rejected so the runner
      // records the error and releases it, instead of losing its ID and halting.
      const rejected = data?.session_id && data.region !== "us"
        ? `Tilion returned region ${data.region ?? "unknown"} instead of us` : undefined;
      return { id: data?.session_id, cdpUrl,
        configuration: { automatic_recovery: true, residential: true, region: "us" },
        release, ...(rejected && { rejected }) };
    }
    const lexmountMode = provider === "lexmount-light" ? "light" : provider === "lexmount-normal" ? "normal" : null;
    if (lexmountMode) {
      const base = (env.LEXMOUNT_BASE_URL || "https://api.lexmount.com").replace(/\/+$/, "");
      const headers = { "x-api-key": env.LEXMOUNT_API_KEY, "x-project-id": env.LEXMOUNT_PROJECT_ID };
      const created = await api(`${base}/instance/v2`, "POST", headers, {
        browser_mode: lexmountMode,
        ...(lexmountMode === "light" ? { enable_lightmount_layout: true, enable_lightmount_resource: true } : {}),
        enable_captcha: true,
        downloads: { enabled: false },
        recording: { persistent: false },
        ...(env.LEXMOUNT_REGION ? { region_id: env.LEXMOUNT_REGION } : {}),
      }, AbortSignal.timeout(60_000));
      const id = typeof created?.session_id === "string" ? created.session_id : "";
      if (!id) throw new Error("lexmount: session_id missing from create response");
      const release = async () => {
        try {
          await api(`${base}/instance`, "DELETE", headers, { session_id: id }, AbortSignal.timeout(30_000));
        } catch (error) {
          if (error?.status !== 404) throw error;
        }
      };
      const ended = async () => {
        try {
          const state = await api(`${base}/instance/session`, "POST", headers, { session_id: id }, AbortSignal.timeout(15_000));
          return state?.status === "closed";
        } catch (error) {
          if (error?.status === 404) return true;
          throw error;
        }
      };
      const configuration = { browserMode: lexmountMode, enableCaptcha: true, proxy: "default",
        ...(lexmountMode === "light" ? { lightmountLayout: true, lightmountResource: true } : {}) };
      const rejected = reason => ({ id, cdpUrl: "", configuration, release, ended, rejected: reason });
      const deadline = Date.now() + 60_000;
      let info = null;
      while (Date.now() < deadline) {
        info = await api(`${base}/instance/session`, "POST", headers, { session_id: id }, AbortSignal.timeout(30_000));
        if (info?.status === "active") break;
        if (info?.status === "create_failed" || info?.status === "closed")
          return rejected(`lexmount: session ${info.status} before activation`);
        await new Promise(resolve => setTimeout(resolve, 1_000));
      }
      if (info?.status !== "active") return rejected("lexmount: session did not become active within 60s");
      let cdpUrl = typeof info.ws === "string" ? info.ws : "";
      if (!/^wss?:\/\//.test(cdpUrl)) {
        const target = await api(`${base}/json/version?session_id=${encodeURIComponent(id)}`, "GET", headers, undefined, AbortSignal.timeout(15_000));
        cdpUrl = target?.webSocketDebuggerUrlTransformed || target?.webSocketDebuggerUrl || "";
      }
      if (!/^wss?:\/\//.test(cdpUrl)) return rejected("lexmount: active session has no CDP URL");
      return { id, cdpUrl, configuration: { ...configuration, ...(info.region_id ? { region: info.region_id } : {}) }, release, ended };
    }
    throw new Error(`Unsupported provider: ${provider}`);
  };
}

export const REQUIRED_ENV = {
  kernel: ["KERNEL_API_KEY"], browserbase: ["BROWSERBASE_API_KEY", "BROWSERBASE_PROJECT_ID"],
  "browser-use": ["BROWSER_USE_API_KEY"], steel: ["STEEL_API_KEY"], notte: ["NOTTE_API_KEY"],
  hyperbrowser: ["HYPERBROWSER_API_KEY"], anchorbrowser: ["ANCHORBROWSER_API_KEY"],
  browserless: ["BROWSERLESS_API_KEY"], tilion: ["TILION_API_KEY"],
  "lexmount-light": ["LEXMOUNT_API_KEY", "LEXMOUNT_PROJECT_ID"],
  "lexmount-normal": ["LEXMOUNT_API_KEY", "LEXMOUNT_PROJECT_ID"],
};
