import { describe, it, expect } from "vitest";
import { SENTRY_DATA_COLLECTION, SENTRY_TRACE_LIFECYCLE } from "@/lib/sentry-options";

// The init tests compare each init's options to these exports, so they cannot catch a change to
// the values themselves. This file spells the privacy defaults out literally: loosening one has
// to change a line here, in review. The values are the v10 default from the Sentry v11 migration
// guide ("If you want to keep the v10 default behavior").
const DENY = ["forwarded", "-ip", "remote-", "via", "-user"];

describe("sentry-options", () => {
  it("collects no user info, cookies, bodies, queries, queues or GenAI payloads", () => {
    expect(SENTRY_DATA_COLLECTION).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { deny: DENY },
        response: { deny: DENY },
      },
      httpBodies: [],
      urlQueryParams: { deny: DENY },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
    });
  });

  it("keeps tracing on the static (v10 transaction) lifecycle", () => {
    expect(SENTRY_TRACE_LIFECYCLE).toBe("static");
  });
});
