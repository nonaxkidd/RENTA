/** The 62 barangays of Calapan City, plus San Rafael from the city barangay list. */
export const CALAPAN_BARANGAYS = [
  "Balingayan",
  "Balite",
  "Baruyan",
  "Batino",
  "Bayanan I",
  "Bayanan II",
  "Biga",
  "Bondoc",
  "Bucayao",
  "Buhuan",
  "Bulusan",
  "Calero",
  "Camansihan",
  "Camilmil",
  "Canubing I",
  "Canubing II",
  "Comunal",
  "Guinobatan",
  "Gulod",
  "Gutad",
  "Ibaba East",
  "Ibaba West",
  "Ilaya",
  "Lalud",
  "Lazareto",
  "Libis",
  "Lumangbayan",
  "Mahal Na Pangalan",
  "Maidlang",
  "Malad",
  "Malamig",
  "Managpi",
  "Masipit",
  "Nag-Iba I",
  "Nag-Iba II",
  "Navotas",
  "Pachoca",
  "Palhi",
  "Panggalaan",
  "Parang",
  "Patas",
  "Personas",
  "Puting Tubig",
  "Salong",
  "San Antonio",
  "San Rafael",
  "San Vicente Central",
  "San Vicente East",
  "San Vicente North",
  "San Vicente South",
  "San Vicente West",
  "Sapul",
  "Silonay",
  "Sta. Cruz",
  "Sta. Isabel",
  "Sta. Maria Village",
  "Sta. Rita",
  "Sto. Niño",
  "Suqui",
  "Tawagan",
  "Tawiran",
  "Tibag",
  "Wawa",
] as const;

/** OpenStreetMap bounding box for Calapan City. */
const LAT_MIN = 13.274538;
const LAT_MAX = 13.439555;
const LNG_MIN = 121.096809;
const LNG_MAX = 121.275097;

export function canonicalBarangay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().toLowerCase();
  return CALAPAN_BARANGAYS.find((name) => name.toLowerCase() === cleaned) ?? null;
}

export function isInsideCalapan(lat: number, lng: number): boolean {
  return lat >= LAT_MIN && lat <= LAT_MAX && lng >= LNG_MIN && lng <= LNG_MAX;
}
