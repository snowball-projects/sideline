export const TEAMS = [
  "ARI",
  "ATL",
  "BAL",
  "BUF",
  "CAR",
  "CHI",
  "CIN",
  "CLE",
  "DAL",
  "DEN",
  "DET",
  "GB",
  "HOU",
  "IND",
  "JAX",
  "KC",
  "LAC",
  "LAR",
  "LV",
  "MIA",
  "MIN",
  "NE",
  "NO",
  "NYG",
  "NYJ",
  "PHI",
  "PIT",
  "SEA",
  "SF",
  "TB",
  "TEN",
  "WAS",
];
export const POSITIONS = [
  "QB",
  "RB",
  "FB",
  "WR",
  "TE",
  "C",
  "G",
  "T",
  "OL",
  "OT",
  "OG",
  "LS",
  "K",
  "P",
  "NT",
  "DT",
  "DI",
  "DE",
  "DL",
  "EDGE",
  "OLB",
  "ILB",
  "MLB",
  "LB",
  "CB",
  "DB",
  "FS",
  "SS",
  "S",
  "ATH",
  "UNK",
];
export function safeUrl(value) {
  if (typeof value !== "string" || value.length > 2000 || /\s/u.test(value))
    return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
