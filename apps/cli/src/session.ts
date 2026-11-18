import {
  CliSessionProvider,
  HttpSessionResolver,
  type CliCredentialStore,
} from "../../../packages/auth/src/index";

/** The CLI uses the shared server-session resolver and OS credential-store adapter. */
export function createCliSessionProvider(
  credentials: CliCredentialStore,
  apiOrigin: URL,
  fetcher: typeof fetch = fetch,
): CliSessionProvider {
  return new CliSessionProvider(credentials, new HttpSessionResolver(apiOrigin, fetcher));
}

export { CliSessionProvider };
export type { CliCredentialStore, CliSession } from "../../../packages/auth/src/index";
