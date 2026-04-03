export interface NavItem {
  label: string;
  href: string;
  sectionId: string;
}

export const navItems: NavItem[] = [
  { label: "Home", href: "#hero", sectionId: "hero" },
  { label: "Work", href: "#work", sectionId: "work" },
  { label: "Services", href: "#services", sectionId: "services" },
  { label: "Blog", href: "#blog", sectionId: "blog" },
  { label: "Games", href: "#game", sectionId: "game" },
];

export const CALENDLY_URL = "https://calendly.com/amindhouib";

export const socialLinks = [
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
];
