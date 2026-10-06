import { describe, it, expect } from "vitest";
import { assertArcadeItUrl } from "@/test/arcade-it-guard";

describe("assertArcadeItUrl", () => {
  it.each([
    "postgresql://postgres:s3cret@localhost:5432/arcade_it",
    "postgres://u@127.0.0.1/arcade_it",
    "postgresql://u:p@localhost/arcade_it",
    "postgresql://u:p@localhost:55432/arcade_it",
  ])("accepts %s", (url) => {
    expect(() => assertArcadeItUrl(url)).not.toThrow();
  });

  it.each([
    ["a remote host", "postgresql://u:s3cret@db:5432/arcade_it"],
    ["a lookalike host", "postgresql://u:s3cret@localhost.evil.com:5432/arcade_it"],
    ["userinfo that spoofs the host", "postgresql://localhost@evil.com/arcade_it"],
    ["an upper-case host", "postgresql://u:s3cret@LOCALHOST:5432/arcade_it"],
    ["an IPv6 host", "postgresql://u:s3cret@[::1]:5432/arcade_it"],
    ["no host (a socket URL)", "postgresql:///arcade_it"],
    ["the app database", "postgresql://u:s3cret@localhost:5432/portfolio"],
    ["a longer database name", "postgresql://u:s3cret@localhost:5432/arcade_it2"],
    ["a different-case database name", "postgresql://u:s3cret@localhost:5432/Arcade_it"],
    ["a trailing slash", "postgresql://u:s3cret@localhost:5432/arcade_it/"],
    [
      "a host override in the query string",
      "postgresql://u:s3cret@localhost:5432/arcade_it?host=evil",
    ],
    ["a fragment", "postgresql://u:s3cret@localhost:5432/arcade_it#frag"],
    ["a non-postgres protocol", "http://localhost/arcade_it"],
    ["an unparseable string", "not a url"],
    ["an empty string", ""],
  ])("refuses %s", (_name, url) => {
    expect(() => assertArcadeItUrl(url)).toThrow(/ARCADE_IT_DATABASE_URL refused/);
  });

  it("never puts the connection string or password in the error", () => {
    let message = "";
    try {
      assertArcadeItUrl("postgresql://u:s3cret@db.internal:5432/portfolio");
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).not.toBe("");
    expect(message).not.toContain("s3cret");
    expect(message).not.toContain("db.internal");
  });
});
