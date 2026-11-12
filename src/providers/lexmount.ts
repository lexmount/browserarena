import { Lexmount } from "lexmount";
import type { ProviderClient, ProviderName, ProviderSession, ProxyCountry, SessionOptions } from "../types.js";
import { SessionCreationError } from "../types.js";
import { requireEnv } from "../utils/env.js";
import { msSince, nowNs } from "../utils/time.js";

type LexmountBrowserMode = "light" | "normal";

// Lexmount is registered twice: Moli (`light`) and Chromium (`normal`). Both
// share the same SDK lifecycle; only the requested engine and the LightMount
// integrations differ. The SDK creates sessions asynchronously and polls until
// they are active, so session_creation_ms includes activation. Persistent
// replay and stored downloads stay off: the benchmark measures the minimal
// browser lifecycle and does not consume either artifact.
abstract class LexmountProviderBase implements ProviderClient {
  abstract readonly name: ProviderName;
  abstract readonly browserMode: LexmountBrowserMode;
  // The official proxy has no country parameter. The US entry verifies the
  // pool's default egress; other countries stay unsupported until Lexmount
  // exposes targeting.
  readonly proxyCountries: readonly ProxyCountry[] | undefined = undefined;
  readonly proxyUnsupportedReason =
    "Lexmount's official proxy has no country parameter; only the default egress is verified";
  private _client: Lexmount | null = null;

  // Pro, Pro+, and Enterprise include browser hours at $0.12/hour, and the
  // usage API meters browser_ms, so no minimum or rounding applies.
  computeCost(seconds: number): number {
    return Math.round((seconds / 3600) * 0.12 * 1e8) / 1e8;
  }

  private client(): Lexmount {
    if (!this._client) {
      this._client = new Lexmount({
        apiKey: requireEnv("LEXMOUNT_API_KEY"),
        projectId: requireEnv("LEXMOUNT_PROJECT_ID"),
        ...(process.env.LEXMOUNT_BASE_URL ? { baseUrl: process.env.LEXMOUNT_BASE_URL } : {}),
        ...(process.env.LEXMOUNT_REGION ? { region: process.env.LEXMOUNT_REGION } : {}),
      });
    }
    return this._client;
  }

  async create(opts?: SessionOptions): Promise<ProviderSession> {
    const proxyCountry = opts?.proxyCountry;
    if (proxyCountry && !this.proxyCountries?.includes(proxyCountry))
      throw new Error(this.proxyUnsupportedReason);
    const mode = this.browserMode;
    const officialProxy = Boolean(proxyCountry) || process.env.LEXMOUNT_OFFICIAL_PROXY === "1";
    const session = await this.client().sessions.create({
      browserMode: mode,
      ...(officialProxy ? { officialProxy: true } : {}),
      // Moli needs the layout/resource integrations for screenshots and
      // coordinate clicks; Chromium does not.
      ...(mode === "light"
        ? { enableLightmountLayout: true, enableLightmountResource: true }
        : {}),
      downloads: { enabled: false },
      recording: { persistent: false },
    });
    if (!session.id) throw new Error("Invalid Lexmount session response: missing session id");
    const cdpUrl = session.connectUrl;
    const protocol = URL.canParse(cdpUrl) ? new URL(cdpUrl).protocol : null;
    if (protocol !== "ws:" && protocol !== "wss:") {
      const reason = `Invalid Lexmount session ${session.id}: missing or invalid CDP URL`;
      const started = nowNs();
      try {
        await this.release(session.id);
      } catch (error) {
        throw new SessionCreationError(
          reason,
          session.id,
          error instanceof Error ? error.message : String(error),
          null
        );
      }
      throw new SessionCreationError(reason, session.id, null, msSince(started));
    }
    return {
      id: session.id,
      cdpUrl,
      configuration: {
        browserMode: mode,
        ...(officialProxy ? { officialProxy: true } : {}),
        ...(proxyCountry ? { proxyCountry } : {}),
        ...(mode === "light"
          ? { lightmountLayout: true, lightmountResource: true }
          : {}),
        downloads: false,
        persistentReplay: false,
        ...(session.regionId ? { region: session.regionId } : {}),
      },
    };
  }

  async release(id: string): Promise<void> {
    // sessions.delete() throws on failure; SessionInfo.close() would swallow it.
    await this.client().sessions.delete({ sessionId: id });
  }
}

export class LexmountLightProvider extends LexmountProviderBase {
  readonly name = "LEXMOUNT_LIGHT";
  readonly browserMode = "light";
  // Moli reaches the same official proxy pool; the default (and only
  // verified) egress is US, just like Chromium.
  readonly proxyCountries = ["US"] as const;
}

export class LexmountNormalProvider extends LexmountProviderBase {
  readonly name = "LEXMOUNT_NORMAL";
  readonly browserMode = "normal";
  // Verified by the official proxy's default egress, not by a country selector.
  readonly proxyCountries = ["US"] as const;
}
