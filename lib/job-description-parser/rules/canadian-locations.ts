export type CanadianLocation = {
  city: string;
  province: string;
  provinceCode: string;
  aliases: string[];
};

/**
 * Deliberately small and Canada-focused. Grown from real postings rather than
 * bulk-imported, so every entry here is one that actually appeared.
 */
export const CANADIAN_LOCATIONS: CanadianLocation[] = [
  {
    city: "Ottawa",
    province: "Ontario",
    provinceCode: "ON",
    aliases: ["ottawa", "national capital region", "kanata", "ottawa-gatineau"],
  },
  {
    city: "Toronto",
    province: "Ontario",
    provinceCode: "ON",
    aliases: ["toronto", "greater toronto area", "gta", "north york", "scarborough", "etobicoke"],
  },
  {
    city: "Mississauga",
    province: "Ontario",
    provinceCode: "ON",
    aliases: ["mississauga"],
  },
  { city: "Waterloo", province: "Ontario", provinceCode: "ON", aliases: ["waterloo"] },
  { city: "Kitchener", province: "Ontario", provinceCode: "ON", aliases: ["kitchener"] },
  { city: "Hamilton", province: "Ontario", provinceCode: "ON", aliases: ["hamilton"] },
  { city: "London", province: "Ontario", provinceCode: "ON", aliases: ["london, on", "london, ontario"] },
  { city: "Markham", province: "Ontario", provinceCode: "ON", aliases: ["markham"] },
  { city: "Brampton", province: "Ontario", provinceCode: "ON", aliases: ["brampton"] },
  { city: "Kingston", province: "Ontario", provinceCode: "ON", aliases: ["kingston"] },
  {
    city: "Montreal",
    province: "Quebec",
    provinceCode: "QC",
    aliases: ["montreal", "montréal", "greater montreal"],
  },
  {
    city: "Quebec City",
    province: "Quebec",
    provinceCode: "QC",
    aliases: ["quebec city", "ville de québec", "québec city"],
  },
  { city: "Gatineau", province: "Quebec", provinceCode: "QC", aliases: ["gatineau", "hull"] },
  { city: "Laval", province: "Quebec", provinceCode: "QC", aliases: ["laval"] },
  {
    city: "Vancouver",
    province: "British Columbia",
    provinceCode: "BC",
    aliases: ["vancouver", "greater vancouver", "metro vancouver"],
  },
  { city: "Burnaby", province: "British Columbia", provinceCode: "BC", aliases: ["burnaby"] },
  { city: "Victoria", province: "British Columbia", provinceCode: "BC", aliases: ["victoria"] },
  { city: "Surrey", province: "British Columbia", provinceCode: "BC", aliases: ["surrey"] },
  { city: "Calgary", province: "Alberta", provinceCode: "AB", aliases: ["calgary"] },
  { city: "Edmonton", province: "Alberta", provinceCode: "AB", aliases: ["edmonton"] },
  { city: "Winnipeg", province: "Manitoba", provinceCode: "MB", aliases: ["winnipeg"] },
  { city: "Saskatoon", province: "Saskatchewan", provinceCode: "SK", aliases: ["saskatoon"] },
  { city: "Regina", province: "Saskatchewan", provinceCode: "SK", aliases: ["regina"] },
  { city: "Halifax", province: "Nova Scotia", provinceCode: "NS", aliases: ["halifax"] },
  { city: "Moncton", province: "New Brunswick", provinceCode: "NB", aliases: ["moncton"] },
  { city: "Fredericton", province: "New Brunswick", provinceCode: "NB", aliases: ["fredericton"] },
  { city: "St. John's", province: "Newfoundland and Labrador", provinceCode: "NL", aliases: ["st. john's", "st johns"] },
  { city: "Charlottetown", province: "Prince Edward Island", provinceCode: "PE", aliases: ["charlottetown"] },
];

export const PROVINCE_CODES = new Map<string, string>([
  ["on", "ON"],
  ["ontario", "ON"],
  ["qc", "QC"],
  ["quebec", "QC"],
  ["québec", "QC"],
  ["bc", "BC"],
  ["british columbia", "BC"],
  ["ab", "AB"],
  ["alberta", "AB"],
  ["mb", "MB"],
  ["manitoba", "MB"],
  ["sk", "SK"],
  ["saskatchewan", "SK"],
  ["ns", "NS"],
  ["nova scotia", "NS"],
  ["nb", "NB"],
  ["new brunswick", "NB"],
  ["nl", "NL"],
  ["newfoundland and labrador", "NL"],
  ["pe", "PE"],
  ["pei", "PE"],
  ["prince edward island", "PE"],
  ["yt", "YT"],
  ["yukon", "YT"],
  ["nt", "NT"],
  ["northwest territories", "NT"],
  ["nu", "NU"],
  ["nunavut", "NU"],
]);

/** Formats to the app's display convention, matching the form placeholder. */
export function formatLocation(location: CanadianLocation): string {
  return `${location.city}, ${location.provinceCode}`;
}
