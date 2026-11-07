// A small slice of Philippine geography for the location pickers (blueprint §4.4, §5.2 B).
// Codes follow the PSGC pattern; the real API loads the full PSGC dataset.

export interface GeoNode {
  id: string;
  code: string;
  name: string;
  parent_id: string | null;
  level: "country" | "region" | "province" | "city" | "barangay";
  /** Rough centre, used to sort "near you" when a player has no GPS. */
  lat?: number;
  lng?: number;
}

const nodes: GeoNode[] = [];
const add = (n: GeoNode) => (nodes.push(n), n);

add({ id: "ph", code: "PH", name: "Philippines", parent_id: null, level: "country" });

const tree: Array<{
  region: [string, string];
  provinces: Array<{
    p: [string, string];
    cities: Array<{ c: [string, string]; at: [number, number]; brgys: string[] }>;
  }>;
}> = [
  {
    region: ["040000000", "CALABARZON (Region IV-A)"],
    provinces: [
      {
        p: ["045600000", "Quezon"],
        cities: [
          {
            c: ["045627000", "Mauban"],
            at: [14.1906, 121.7311],
            brgys: ["Daungan", "Rizaliana", "Cagbalete I", "Polo", "Lual", "Sadsaran"],
          },
          {
            c: ["045624000", "Lucena City"],
            at: [13.9373, 121.617],
            brgys: ["Ibabang Dupay", "Barangay 4", "Gulang-Gulang", "Isabang", "Market View", "Cotta"],
          },
          {
            c: ["045647000", "Tayabas City"],
            at: [14.0263, 121.5928],
            brgys: ["Poblacion", "Lalo", "Isabang", "Mateuna"],
          },
          { c: ["045644000", "Sampaloc"], at: [14.1631, 121.6395], brgys: ["Poblacion", "Banot", "Caldong"] },
          {
            c: ["045622000", "Lucban"],
            at: [14.1133, 121.5562],
            brgys: ["Kulapi", "Ayuti", "Tinamnan", "Barangay 1"],
          },
        ],
      },
      {
        p: ["043400000", "Laguna"],
        cities: [
          {
            c: ["043404000", "Calamba City"],
            at: [14.2117, 121.1653],
            brgys: ["Real", "Parian", "Halang", "Bucal"],
          },
          {
            c: ["043428000", "Santa Rosa City"],
            at: [14.3122, 121.1114],
            brgys: ["Balibago", "Tagapo", "Dita"],
          },
        ],
      },
    ],
  },
  {
    region: ["130000000", "National Capital Region (NCR)"],
    provinces: [
      {
        p: ["137400000", "Metro Manila"],
        cities: [
          {
            c: ["137404000", "Quezon City"],
            at: [14.676, 121.0437],
            brgys: ["Teachers Village East", "Diliman", "Loyola Heights", "Kamuning", "Bagong Pag-asa"],
          },
          {
            c: ["137403000", "Pasig City"],
            at: [14.5764, 121.0851],
            brgys: ["Kapitolyo", "San Antonio", "Ugong", "Rosario"],
          },
          {
            c: ["137602000", "Makati City"],
            at: [14.5547, 121.0244],
            brgys: ["Poblacion", "Bel-Air", "San Lorenzo", "Bangkal"],
          },
          {
            c: ["137607000", "Taguig City"],
            at: [14.5176, 121.0509],
            brgys: ["Fort Bonifacio", "Ususan", "Western Bicutan"],
          },
        ],
      },
    ],
  },
  {
    region: ["070000000", "Central Visayas (Region VII)"],
    provinces: [
      {
        p: ["072200000", "Cebu"],
        cities: [
          {
            c: ["072217000", "Cebu City"],
            at: [10.3157, 123.8854],
            brgys: ["Lahug", "Banilad", "Mabolo", "Talamban"],
          },
          {
            c: ["072250000", "Talisay City"],
            at: [10.2447, 123.8494],
            brgys: ["Tabunok", "Lagtang", "Bulacao"],
          },
        ],
      },
    ],
  },
];

for (const r of tree) {
  const region = add({
    id: `r-${r.region[0]}`,
    code: r.region[0],
    name: r.region[1],
    parent_id: "ph",
    level: "region",
  });
  for (const p of r.provinces) {
    const province = add({
      id: `p-${p.p[0]}`,
      code: p.p[0],
      name: p.p[1],
      parent_id: region.id,
      level: "province",
    });
    for (const c of p.cities) {
      const city = add({
        id: `c-${c.c[0]}`,
        code: c.c[0],
        name: c.c[1],
        parent_id: province.id,
        level: "city",
        lat: c.at[0],
        lng: c.at[1],
      });
      c.brgys.forEach((b, i) =>
        add({
          id: `b-${c.c[0].slice(0, 6)}${String(i + 1).padStart(3, "0")}`,
          code: `${c.c[0].slice(0, 6)}${String(i + 1).padStart(3, "0")}`,
          name: b,
          parent_id: city.id,
          level: "barangay",
        }),
      );
    }
  }
}

export const geo = nodes;
export const geoById = (id: string | null | undefined) => nodes.find((n) => n.id === id);
export const geoChildren = (parentId: string) =>
  nodes.filter((n) => n.parent_id === parentId).sort((a, b) => a.name.localeCompare(b.name));

/** The chain from barangay up to country, or null when the barangay doesn't exist. */
export function geoChain(barangayId: string) {
  const barangay = geoById(barangayId);
  if (!barangay || barangay.level !== "barangay") return null;
  const city = geoById(barangay.parent_id)!;
  const province = geoById(city.parent_id)!;
  const region = geoById(province.parent_id)!;
  const country = geoById(region.parent_id)!;
  return { country, region, province, city, barangay };
}

/** Find a city by name (for seed data written by hand). */
export const cityByName = (name: string) => nodes.find((n) => n.level === "city" && n.name.startsWith(name));

/** Straight-line distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
