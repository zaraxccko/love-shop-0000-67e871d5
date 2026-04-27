import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LocationTogglesState {
  /** Slugs (страны или города), которые временно отключены. */
  disabled: string[];
  isDisabled: (slug: string) => boolean;
  toggle: (slug: string) => void;
  setDisabled: (slug: string, value: boolean) => void;
}

export const useLocationToggles = create<LocationTogglesState>()(
  persist(
    (set, get) => ({
      disabled: [],
      isDisabled: (slug) => get().disabled.includes(slug),
      toggle: (slug) =>
        set((s) => ({
          disabled: s.disabled.includes(slug)
            ? s.disabled.filter((x) => x !== slug)
            : [...s.disabled, slug],
        })),
      setDisabled: (slug, value) =>
        set((s) => ({
          disabled: value
            ? Array.from(new Set([...s.disabled, slug]))
            : s.disabled.filter((x) => x !== slug),
        })),
    }),
    { name: "loveshop-location-toggles" }
  )
);
