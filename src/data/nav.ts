export interface NavItem {
  label: string;
  href: string;
  sectionId: string;
  isAI?: boolean;
}

export const navItems: readonly NavItem[] = Object.freeze([
  { label: "Home", href: "#hero", sectionId: "hero" },
  { label: "Work", href: "#work", sectionId: "work" },
  { label: "Services", href: "#services", sectionId: "services" },
  { label: "Blog", href: "#blog", sectionId: "blog" },
  { label: "Reviews", href: "/reviews", sectionId: "reviews" },
  // Games is a full route now (not an in-page anchor), so this opens
  // /games directly instead of scrolling to the embedded game on the home
  // page. sectionId is kept so the scroll-spy still highlights the embedded
  // section while you scroll past it.
  { label: "Games", href: "/games", sectionId: "game" },
  { label: "Amin AI", href: "/ai", sectionId: "ai", isAI: true },
]);

export const BOOKING_URL = "https://app.trycaly.com/amin/15min";

export const socialLinks = Object.freeze([
  {
    name: "GitHub",
    icon: "github",
    url: "https://github.com/AminDhouib",
  },
  {
    name: "LinkedIn",
    icon: "linkedin",
    url: "https://linkedin.com/in/amin-dhouib",
  },
  {
    name: "Contra",
    icon: "contra",
    url: "https://contra.com/amin",
  },
  {
    name: "YouTube",
    icon: "youtube",
    url: "https://youtube.com/@amin_dhou",
  },
  {
    name: "Instagram",
    icon: "instagram",
    url: "https://instagram.com/amin-dhou",
  },
]);
