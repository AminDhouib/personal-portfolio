import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ArcadeBoardTabs } from "../arcade-board-tabs";

const ACTIVE = "tab-active-test";
const INACTIVE = "tab-inactive-test";

function setup(period: "daily" | "weekly" | "all-time" = "all-time", className?: string) {
  const onChange = vi.fn();
  render(
    <ArcadeBoardTabs
      period={period}
      onChange={onChange}
      label="Leaderboard period"
      activeClassName={ACTIVE}
      inactiveClassName={INACTIVE}
      className={className}
    />,
  );
  return onChange;
}

describe("ArcadeBoardTabs", () => {
  it("renders Today, This week and All time in that order inside a labelled group", () => {
    setup();
    expect(screen.getByRole("group", { name: "Leaderboard period" })).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Today",
      "This week",
      "All time",
    ]);
  });

  it("marks only the active period as pressed", () => {
    setup("weekly");
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "This week" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "All time" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it.each([
    ["Today", "daily"],
    ["This week", "weekly"],
    ["All time", "all-time"],
  ])("clicking %s asks for %s when it is not the active tab", (label, period) => {
    const onChange = setup(period === "daily" ? "weekly" : "daily");
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(period);
  });

  it("does not call onChange for the tab that is already active", () => {
    const onChange = setup("weekly");
    fireEvent.click(screen.getByRole("button", { name: "This week" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("applies the active classes to the active tab and the inactive classes to the others", () => {
    setup("daily");
    const today = screen.getByRole("button", { name: "Today" });
    const week = screen.getByRole("button", { name: "This week" });
    expect(today).toHaveClass(ACTIVE);
    expect(today).not.toHaveClass(INACTIVE);
    expect(week).toHaveClass(INACTIVE);
    expect(week).not.toHaveClass(ACTIVE);
  });

  it("keeps a 44px minimum touch target on every tab", () => {
    setup();
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveClass("min-h-11");
    }
  });

  it("adds a caller class to the group", () => {
    setup("all-time", "mb-2");
    expect(screen.getByRole("group")).toHaveClass("mb-2");
  });

  it("never submits a surrounding form", () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <ArcadeBoardTabs
          period="all-time"
          onChange={() => {}}
          label="Leaderboard period"
          activeClassName={ACTIVE}
          inactiveClassName={INACTIVE}
        />
      </form>,
    );
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("type", "button");
      fireEvent.click(button);
    }
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
