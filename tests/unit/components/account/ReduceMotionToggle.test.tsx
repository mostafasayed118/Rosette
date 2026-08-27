import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReduceMotionToggle } from "@/components/account/ReduceMotionToggle";

vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: () => ({
    from: () => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user" } }, error: null }),
    },
  }),
  createClient: () => ({
    from: () => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user" } }, error: null }),
    },
  }),
}));

const mockSetReduceMotion = vi.fn();

vi.mock("@/lib/motion/MotionPrefsContext", async () => {
  const actual = await vi.importActual<typeof import("@/lib/motion/MotionPrefsContext")>(
    "@/lib/motion/MotionPrefsContext"
  );
  return {
    ...actual,
    useMotionPrefs: () => ({ reduceMotion: false, setReduceMotion: mockSetReduceMotion }),
  };
});

describe("ReduceMotionToggle", () => {
  it("renders a checkbox with an accessible label", () => {
    render(<ReduceMotionToggle />);
    expect(screen.getByRole("checkbox", { name: /reduce motion/i })).toBeInTheDocument();
  });

  it("reflects the initial reduceMotion state", () => {
    mockSetReduceMotion.mockClear();
    render(<ReduceMotionToggle initialValue={true} />);
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("keeps the clicked value when seeded via initialValue", async () => {
    mockSetReduceMotion.mockClear();
    render(<ReduceMotionToggle initialValue={true} />);
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    await userEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
    expect(mockSetReduceMotion).toHaveBeenCalledWith(false);
  });

  it("calls setReduceMotion on change", async () => {
    mockSetReduceMotion.mockClear();
    render(<ReduceMotionToggle />);
    const checkbox = screen.getByRole("checkbox");
    await userEvent.click(checkbox);
    expect(mockSetReduceMotion).toHaveBeenCalledWith(true);
  });
});
