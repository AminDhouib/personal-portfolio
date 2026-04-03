export interface Review {
  name: string;
  position?: string;
  company?: string;
  companyLogo?: string;
  profileImage?: string;
  rating: number;
  comment: string;
  companyLink?: string;
  isFeatured?: boolean;
  source: "Google" | "Upwork" | "Contra";
  link?: string;
}

const googleReviewsLink =
  "https://www.google.com/search?q=devino+solutions#lrd=0x61d982d544ce5eb3:0xa7a66037b29c5f50,1,,,,";
const linkedinRecommendations =
  "https://www.linkedin.com/in/amin-dhouib/details/recommendations/";

export const reviews: Review[] = [
  {
    name: "Allison Gaddy",
    position: "Founding Partner & CEO",
    company: "Expert Partners",
    companyLink: "https://expertpartners.com",
    companyLogo: "/reviews/companies/ep.webp",
    profileImage: "/reviews/profiles/allison.png",
    rating: 5,
    comment:
      "Amin was an exceptional developer who was able to complete this critical emergency project within the tight 24-hour deadline. I'm extremely impressed by his skill and professionalism.",
    isFeatured: true,
    source: "Google",
    link: googleReviewsLink,
  },
  {
    name: "Tristan McIntire",
    profileImage: "/reviews/profiles/tristan.png",
    position: "Co-Founder & Product Manager",
    company: "Qreates",
    companyLink: "https://qreates.com",
    companyLogo: "/reviews/companies/qreates.png",
    rating: 5,
    comment:
      "Amin is the bomb. I originally tried hiring him for a specific task but in our intro call he quickly analyzed exactly what my needs were, suggested an alternative solution and helped guide me in a new direction. He is extremely knowledgable would definitely recommend!",
    isFeatured: true,
    source: "Google",
    link: googleReviewsLink,
  },
  {
    name: "Zarrah",
    position: "Founder & CEO",
    company: "Syncara",
    companyLink: "https://syncara.ca",
    profileImage: "/reviews/profiles/zarrah.png",
    companyLogo: "/reviews/companies/syncara.png",
    rating: 5,
    comment:
      "Amin & his team are different - they're collaborative, strategic, and actually care about the long-term. If you need someone to help build AND grow, I highly recommend this team!",
    isFeatured: true,
    source: "Google",
  },
  {
    name: "Samira Ismail",
    position: "Mechanical Engineer",
    profileImage: "/reviews/profiles/samira.png",
    company: "New Motion Labs",
    companyLogo: "/reviews/companies/nml.png",
    rating: 5,
    comment:
      "Devino was great to work with throughout our project. They have great attention to detail when it comes to both the frontend design and UI/UX and the backend functionality. They're highly recommended for projects where time is of the essence.",
    companyLink: "https://www.newmotionlabs.com",
    isFeatured: true,
    source: "Google",
    link: googleReviewsLink,
  },
  {
    name: "Thibeau Maerevoet",
    position: "CEO & Founder",
    company: "Proxyscrape",
    companyLink: "https://proxyscrape.com",
    companyLogo: "/reviews/companies/proxyscrape.png",
    profileImage: "/reviews/profiles/thibeau.png",
    rating: 5,
    comment:
      "Amin was fantastic to work. He delivered professional, high-quality work with our ELK Stack. Highly recommend!",
    isFeatured: true,
    source: "Google",
  },
  {
    name: "Matt Ross",
    position: "Director, Applied Research, AI and UGC",
    company: "Scribd",
    companyLink: "https://www.scribd.com/",
    companyLogo: "/reviews/companies/scribd.png",
    profileImage: "/reviews/profiles/matt.png",
    rating: 5,
    comment:
      "Amin was incredible to work with. He paid particular attention to my actual business needs. Investigating the larger context as to why this was needed so that he delivered the right solution to us. Would hire again 100%!",
    isFeatured: true,
    source: "Google",
  },
  {
    name: "Ali Asif",
    position: "Product Advisor & Angel Investor",
    company: "Various Startups",
    profileImage: "/reviews/profiles/ali.png",
    rating: 5,
    comment:
      "Amin & team are a skilled and professional group. Updates were communicated promptly and any adjustments needed to milestones were explained thoroughly. Overall, Amin was a delight to work with.",
    isFeatured: false,
    source: "Google",
  },
  {
    name: "Kaleb Dortono",
    position: "CEO & Founder",
    company: "KickAds Marketing",
    companyLink: "https://explicitadvisory.com/",
    profileImage: "/reviews/profiles/kaleb.png",
    rating: 5,
    comment:
      "From web development, applications, automations, and dashboards - Amin has been able to help us out in so many areas, and help push our agency forward!",
    isFeatured: false,
    source: "Google",
  },
  {
    name: "Jeremy Thiesen",
    position: "CEO & Founder",
    company: "Math Anex",
    companyLink: "https://mathanex.com",
    companyLogo: "/reviews/companies/mathanex.png",
    profileImage: "/reviews/profiles/jeremy.png",
    rating: 5,
    comment:
      "The first thing you'll notice about Amin is his positive energy! He is excited and ready to jump in and get things done. He is willing to put in the time and effort to get up to speed.",
    source: "Google",
    link: linkedinRecommendations,
  },
  {
    name: "Trevor Arashiro",
    profileImage: "/reviews/profiles/trevor.png",
    position: "CTO/Founder",
    company: "Plutos App",
    companyLink: "https://apps.apple.com/in/app/plutos-data",
    companyLogo: "/reviews/companies/plutos.png",
    rating: 5,
    comment:
      "Great quality work, good communication, very clever SWE and is capable of handling complex tasks with minimal directive.",
    isFeatured: false,
    source: "Google",
  },
  {
    name: "Will Evers",
    position: "VP of Engineering",
    company: "RentCheck",
    companyLink: "https://getrentcheck.com",
    companyLogo: "/reviews/companies/rentcheck.png",
    profileImage: "/reviews/profiles/will.png",
    rating: 5,
    comment:
      "Amin was hired for backend projects on our AWS API Gateway/Lambda applications, however, he demonstrated that he was knowledgeable and comfortable with front end development, automated testing, & several other skill domains. A wonderful person whose positivity is remarkable.",
    source: "Google",
    link: linkedinRecommendations,
  },
];
