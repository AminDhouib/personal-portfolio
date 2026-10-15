import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { Experience } from "../experience";
import { COMBINED_USERS_TOKEN } from "@/data/experience";

function serverText(html: string): string {
  return html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

describe("Experience", () => {
  it("fills the combined-users placeholder with the figure it is given", () => {
    const text = serverText(renderToString(<Experience combinedUsers="130K+" />));
    expect(text).toContain("reaching 130K+ combined monthly active users");
    expect(text).not.toContain(COMBINED_USERS_TOKEN);
  });
});
