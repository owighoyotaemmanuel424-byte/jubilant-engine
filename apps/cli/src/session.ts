import {
  CliSessionProvider,
  type CliCredentialStore,
  type SessionResolver,
} from "../../../packages/auth/src/index";

/** The CLI uses the shared server-session resolver and OS credential-store adapter. */
export function createCliSessionProvider(
  credentials: CliCredentialStore,
  resolver: SessionResolver,
): CliSessionProvider {
  return new CliSessionProvider(credentials, resolver);
}

export { CliSessionProvider };
export type { CliCredentialStore, CliSession } from "../../../packages/auth/src/index";
