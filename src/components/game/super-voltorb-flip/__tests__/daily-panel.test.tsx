import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DailyPanel } from "../daily-panel";

const base = {
  dayKey: "2026-10-07",
  outcome: null,
  score: 0,
  handle: "",
  submitted: false,
  submitState: "idle" as const,
  rank: null,
  streak: 0,
  entries: [],
  loading: false,
  readError: null,
  onPost: () => {},
};

describe("DailyPanel", () => {
  it("explains the board while it is being played", () => {
    render(<DailyPanel {...base} />);
    expect(screen.getByText(/same for everyone/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Post score" })).toBeNull();
  });

  it("offers the name form and posts the typed name after a banked board", () => {
    const onPost = vi.fn();
    render(<DailyPanel {...base} outcome="quit" score={24} handle="Ada" onPost={onPost} />);
    const input = screen.getByLabelText("Name for the board");
    expect(input).toHaveValue("Ada");
    fireEvent.change(input, { target: { value: "Grace" } });
    fireEvent.click(screen.getByRole("button", { name: "Post score" }));
    expect(onPost).toHaveBeenCalledWith("Grace");
  });

  it("has nothing to post after a loss or an empty quit", () => {
    render(<DailyPanel {...base} outcome="lost" score={0} />);
    expect(screen.queryByRole("button", { name: "Post score" })).toBeNull();
    expect(screen.getByText(/no score to post/i)).toBeInTheDocument();
  });

  it("says where a posted score landed", () => {
    render(
      <DailyPanel {...base} outcome="won" score={512} submitted submitState="sent" rank={3} />,
    );
    expect(screen.getByText(/posted/i)).toHaveTextContent("3");
    expect(screen.queryByRole("button", { name: "Post score" })).toBeNull();
  });

  it("reports each failed state in words", () => {
    const { rerender } = render(
      <DailyPanel {...base} outcome="won" score={512} submitState="failed" />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/try again/i);
    rerender(<DailyPanel {...base} outcome="won" score={512} submitState="closed" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/closed/i);
    rerender(<DailyPanel {...base} outcome="won" score={512} submitState="rejected" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/not accepted/i);
  });

  it("keeps the name form usable after a failed post, to try again", () => {
    const onPost = vi.fn();
    render(<DailyPanel {...base} outcome="won" score={512} submitState="failed" onPost={onPost} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/try again/i);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Post score" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Name for the board"), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Post score" }));
    expect(onPost).toHaveBeenCalledWith("Ada");
  });

  it("lists the board and marks the player's own row", () => {
    render(
      <DailyPanel
        {...base}
        entries={[
          { rank: 1, name: "Grace", score: 512, createdAt: "x", isYou: false },
          { rank: 2, name: "Ada", score: 256, createdAt: "x", isYou: true },
        ]}
      />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Grace");
    expect(rows[1]).toHaveTextContent("Ada");
    expect(rows[1]).toHaveAttribute("aria-current", "true");
  });

  it("says the board is empty or unavailable instead of showing nothing", () => {
    const { rerender } = render(<DailyPanel {...base} />);
    expect(screen.getByText(/no scores yet today/i)).toBeInTheDocument();
    rerender(<DailyPanel {...base} readError="failed to load leaderboard" />);
    expect(screen.getByText(/board unavailable/i)).toBeInTheDocument();
  });

  it("shows the streak", () => {
    render(<DailyPanel {...base} streak={4} />);
    expect(screen.getByText(/4-day streak/i)).toBeInTheDocument();
  });
});
