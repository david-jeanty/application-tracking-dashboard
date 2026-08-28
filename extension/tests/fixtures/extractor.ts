export const posting = (value: Record<string, unknown>) => {
  const json = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    ...value,
  }).replace(/<\/script>/gi, "<\\/script>");
  return `<script type="application/ld+json">${json}</script>`;
};

export const CLEAN_POSTING = posting({
  title: "Business Technology Analyst Intern",
  hiringOrganization: { name: "IBM" },
  jobLocation: {
    "@type": "Place",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Ottawa",
      addressRegion: "ON",
    },
  },
  description: "Build useful systems with a small team.",
});

export const ARRAY_POSTING = `<script type="application/ld+json">${JSON.stringify([
  { "@type": "WebSite", name: "Careers" },
  { "@type": "JobPosting", title: "Data Intern", hiringOrganization: { name: "Nokia" } },
])}</script>`;

export const GRAPH_POSTING = `<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", name: "Example" },
    { "@type": "JobPosting", title: "Design Intern", hiringOrganization: { name: "Figma" } },
  ],
})}</script>`;

export const TYPE_ARRAY_POSTING = posting({
  "@type": ["Thing", "JobPosting"],
  title: "Finance Intern",
  hiringOrganization: { name: "RBC" },
});
