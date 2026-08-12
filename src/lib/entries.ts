const STORAGE_KEY = "utilization-dashboard-entries";

export type UtilizationResultRow = {
  engineerName: string;
  projectCode: string;
  projectName: string;
  /** Keyed by YYYY-MM, then week number → cell value */
  weekValuesByMonth: Record<string, Record<string, string>>;
};

export type UtilizationEntry = UtilizationResultRow & {
  id: string;
};

const EXCEL_PROJECT_SEED_JSON =
  "[{\"engineerName\":\"zain.abideen\",\"projectCode\":\"RMS24002\",\"projectName\":\"Richard Bard Elementary School HVAC, Electrical & Fire Alarm\"},{\"engineerName\":\"zain.abideen\",\"projectCode\":\"ATS25006\",\"projectName\":\"RHCA Headquarters Renovation\"},{\"engineerName\":\"zain.abideen\",\"projectCode\":\"SBE25009\",\"projectName\":\"Hot Water Phase 2 - Greenhouses\"},{\"engineerName\":\"zain.abideen\",\"projectCode\":\"NC25001\",\"projectName\":\"CTE Building Modernization - Umatilla\"},{\"engineerName\":\"zain.abideen\",\"projectCode\":\"PRE25003\",\"projectName\":\"325 Eastlake\"},{\"engineerName\":\"zain.abideen\",\"projectCode\":\"CESC25003\",\"projectName\":\"Catlin Gabel School\"},{\"engineerName\":\"zain.abideen\",\"projectCode\":\"ATS25009\",\"projectName\":\"Seton Medical Center Austin Electrical Infrastructure\"},{\"engineerName\":\"zain.abideen\",\"projectCode\":\"CESC25005\",\"projectName\":\"Warm Springs Commissary\"},{\"engineerName\":\"zain.abideen\",\"projectCode\":\"CEI25002\",\"projectName\":\"WHARF 2 Generator Site Work-Concord\"},{\"engineerName\":\"zain.abideen\",\"projectCode\":\"EPS25007\",\"projectName\":\"Hall of Records\"},{\"engineerName\":\"zain.abideen\",\"projectCode\":\"EPS25008\",\"projectName\":\"Reedly College AF Study\"},{\"engineerName\":\"zain.abideen\",\"projectCode\":\"ATS25011\",\"projectName\":\"Boiler Replacement at John.B Conally Middle School\"},{\"engineerName\":\"zain.abideen\",\"projectCode\":\"NE26004\",\"projectName\":\"Marin County Veterans Memorial Auditorium Building Systems Upgrade\"},{\"engineerName\":\"zain.abideen\",\"projectCode\":\"ATS26015\",\"projectName\":\"TxDPS Law Academy & Training Facility Project\"},{\"engineerName\":\"zain.abideen\",\"projectCode\":\"GPS26005\",\"projectName\":\"Elder - Turquoise Units\"},{\"engineerName\":\"zain.abideen\",\"projectCode\":\"ATS26017\",\"projectName\":\"Smithson Valley HS Interior Renovation - Comal I.S.D\"},{\"engineerName\":\"zain.abideen\",\"projectCode\":\"PRE26006\",\"projectName\":\"Skywalker Complete Facility\"},{\"engineerName\":\"zain.abideen\",\"projectCode\":\"GPS22001\",\"projectName\":\"La Verna (Miguel Barroso)\"},{\"engineerName\":\"zain.abideen\",\"projectCode\":\"CESC25004\",\"projectName\":\"Vancouver Affordable Housing\"},{\"engineerName\":\"m.sulaiman\",\"projectCode\":\"PBS25005\",\"projectName\":\"COH - Helford Special Procedure Room\"},{\"engineerName\":\"m.sulaiman\",\"projectCode\":\"CE25001\",\"projectName\":\"ECY - EV Infrastructure\"},{\"engineerName\":\"m.sulaiman\",\"projectCode\":\"AET25001\",\"projectName\":\"Issaquah Transportation Bus Charging\"},{\"engineerName\":\"m.sulaiman\",\"projectCode\":\"AG25001\",\"projectName\":\"Yermo School's New Gym\"},{\"engineerName\":\"m.sulaiman\",\"projectCode\":\"SECO25001\",\"projectName\":\"City of Burlingtom - WWTP Influent & Effluent PS Upgrades\"},{\"engineerName\":\"m.sulaiman\",\"projectCode\":\"SBE25010\",\"projectName\":\"UCD Campus Outdoor Security\"},{\"engineerName\":\"m.sulaiman\",\"projectCode\":\"BVE25002\",\"projectName\":\"Al Tahoe/Bayview Well Rehab & Emergency Power\"},{\"engineerName\":\"m.sulaiman\",\"projectCode\":\"BVE25003\",\"projectName\":\"UC Davis Electrical Panel Replacement\"},{\"engineerName\":\"m.sulaiman\",\"projectCode\":\"PBS25005.1\",\"projectName\":\"City of Hope - Helford Special Procedure Room CO#1\"},{\"engineerName\":\"m.sulaiman\",\"projectCode\":\"MESC25002\",\"projectName\":\"PR Distribution Project\"},{\"engineerName\":\"m.sulaiman\",\"projectCode\":\"BDE25004\",\"projectName\":\"PSS Longview ISD Multi Purpose Facility\"},{\"engineerName\":\"m.sulaiman\",\"projectCode\":\"MESC25002.1\",\"projectName\":\"PR Distribution Project Model Conversion ETAP TO SKM CO#1\"},{\"engineerName\":\"m.sulaiman\",\"projectCode\":\"MESC25002.3\",\"projectName\":\"PR Distribution Project CO#3\"},{\"engineerName\":\"m.sulaiman\",\"projectCode\":\"ERE26001\",\"projectName\":\"Fire Station 52 - Comal County ESD 3\"},{\"engineerName\":\"m.sulaiman\",\"projectCode\":\"MESC25001\",\"projectName\":\"Texas Medical Center (TMC) Transit Center Opportunity\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"FES25001\",\"projectName\":\"Crest Pump Station\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"CPE25004\",\"projectName\":\"OCH Catheterization Lab\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"CJFE25001\",\"projectName\":\"Modesto Library Tenant Improvements\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"ME25001\",\"projectName\":\"City of Anacortes - Pump Station 16\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"CESC25001\",\"projectName\":\"Eddyville Fire Station Gear\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"BE25001\",\"projectName\":\"SH 6 Pump Station Standby Generator\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"SCCE24001.1\",\"projectName\":\"Bayshore, Ravenwood MS, Roseville Galleria Bus Charging & Los Robles\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"CPE25004.1\",\"projectName\":\"OCH Catheterization Lab  CO#1\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"CSEC25001\",\"projectName\":\"Industrial Wastewater Treatment Facility\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"CDI25001\",\"projectName\":\"Canadian Solar Project\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"AE25001\",\"projectName\":\"Judy Water Treatment Plant W1 pump station replacement\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"NUE25001\",\"projectName\":\"DNR Electrical Upgrades -Meridian\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"HE25003.1\",\"projectName\":\"EED Schick Schadel SCCAF Study CO#1\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"CDI25001.1\",\"projectName\":\"Canadian Solar Project CO#1\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"APB26001\",\"projectName\":\"Island Transit Coupville Base\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"MBE26005\",\"projectName\":\"Dom 4 Lift Station MCC and CP Replacement Project\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"SEC26002\",\"projectName\":\"Corporate Tenant Improvement - Phase 3\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"SEC26003\",\"projectName\":\"O'Neill Building West Wing, Lab 18 & Lab 19\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"CPE25004.2\",\"projectName\":\"OCH Catheterization Lab  CO#2\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"SCCE26005\",\"projectName\":\"City of Palo Alto - UCC Generator Replacement\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"PRE26004\",\"projectName\":\"Skywalker Phase 3.4A\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"APB26004\",\"projectName\":\"Oak Harbor Storage CTE Building\"},{\"engineerName\":\"irsa.sarfaraz\",\"projectCode\":\"HE26003.2\",\"projectName\":\"EED Schick Schadel SCCAF Study CO#2\"},{\"engineerName\":\"Wareesha Azwar\",\"projectCode\":\"PCLIS24001\",\"projectName\":\"PHX 72 Neher McGrath Study for MV Duct Banks + LV\"},{\"engineerName\":\"Wareesha Azwar\",\"projectCode\":\"HBH24003\",\"projectName\":\"DOW SCO\"},{\"engineerName\":\"Wareesha Azwar\",\"projectCode\":\"OEI25001\",\"projectName\":\"Sapporo Teriyaki\"},{\"engineerName\":\"Wareesha Azwar\",\"projectCode\":\"TKE25001\",\"projectName\":\"Tierra Blanca WWTP\"},{\"engineerName\":\"Wareesha Azwar\",\"projectCode\":\"BIE25001\",\"projectName\":\"Oroville WWTP Upgrade\"},{\"engineerName\":\"Wareesha Azwar\",\"projectCode\":\"JEC25001\",\"projectName\":\"Woodbine Development Project\"},{\"engineerName\":\"Wareesha Azwar\",\"projectCode\":\"SEC25001\",\"projectName\":\"Sumner Station\"},{\"engineerName\":\"Wareesha Azwar\",\"projectCode\":\"ATS25007\",\"projectName\":\"Old Settlers Park - 3 Sites\"},{\"engineerName\":\"Wareesha Azwar\",\"projectCode\":\"ATS25008\",\"projectName\":\"AMD Building D\"},{\"engineerName\":\"Wareesha Azwar\",\"projectCode\":\"OEMA25001\",\"projectName\":\"Fairlife Neher McGrath Study\"},{\"engineerName\":\"Wareesha Azwar\",\"projectCode\":\"PDI25001\",\"projectName\":\"10MW ALBQ Data Center Neher McGrath Study\"},{\"engineerName\":\"Wareesha Azwar\",\"projectCode\":\"ATS25012\",\"projectName\":\"DELL-PC1 SCCAF Studies\"},{\"engineerName\":\"Wareesha Azwar\",\"projectCode\":\"ATS25008.4\",\"projectName\":\"AMD Building D CO#4\"},{\"engineerName\":\"Wareesha Azwar\",\"projectCode\":\"GWE25001.1\",\"projectName\":\"Snubber Nucor Gallatin Facility CO#1\"},{\"engineerName\":\"Wareesha Azwar\",\"projectCode\":\"GPS26006\",\"projectName\":\"Domiguez Water Pump Coordination Study\"},{\"engineerName\":\"Wareesha Azwar\",\"projectCode\":\"SJE26001\",\"projectName\":\"Sewage Pump Station Improvement - North Tahoe PUD\"},{\"engineerName\":\"Wareesha Azwar\",\"projectCode\":\"SEC25001.1\",\"projectName\":\"Sumner Station CO#2\"},{\"engineerName\":\"mustafa.abdullah\",\"projectCode\":\"MBE24002\",\"projectName\":\"Richmond WWTP Sludge Thickner\"},{\"engineerName\":\"mustafa.abdullah\",\"projectCode\":\"VEG25003\",\"projectName\":\"Country Place PFAS Treatment - lake Wood Water Disrtict\"},{\"engineerName\":\"mustafa.abdullah\",\"projectCode\":\"BDE25003\",\"projectName\":\"Grayson College - Residence Hall\"},{\"engineerName\":\"mustafa.abdullah\",\"projectCode\":\"SMEP25001\",\"projectName\":\"Haley Canopy ZEV Infrastructure Improvements Power system Studies\"},{\"engineerName\":\"mustafa.abdullah\",\"projectCode\":\"FEI25005\",\"projectName\":\"Folsom Heights Development Water Booster Pump Station\"},{\"engineerName\":\"mustafa.abdullah\",\"projectCode\":\"DE25002\",\"projectName\":\"Well 4 Electrical Improvements - City of Auburn\"},{\"engineerName\":\"mustafa.abdullah\",\"projectCode\":\"CEC25002\",\"projectName\":\"Zone 3 Booster Pump Improvements - City of Cle Elum\"},{\"engineerName\":\"mustafa.abdullah\",\"projectCode\":\"CSEC26002\",\"projectName\":\"Heatherwood & Heather Gardens PS Rehabilitation\"},{\"engineerName\":\"mustafa.abdullah\",\"projectCode\":\"CVE26001\",\"projectName\":\"Supplemental Well No 3 Improvements - Watsonville\"},{\"engineerName\":\"mustafa.abdullah\",\"projectCode\":\"CDI26002\",\"projectName\":\"Canadian Solar Dallas\"},{\"engineerName\":\"mustafa.abdullah\",\"projectCode\":\"SIS26001\",\"projectName\":\"Project LAYLA\"},{\"engineerName\":\"mustafa.abdullah\",\"projectCode\":\"VEG25003.1\",\"projectName\":\"Country Place PFAS Treatment Project CO#1 - Lakewood Water District\"},{\"engineerName\":\"zahir.hussain\",\"projectCode\":\"BES25003\",\"projectName\":\"City of Lacey - Lift Station 23 Improvements\"},{\"engineerName\":\"zahir.hussain\",\"projectCode\":\"NC25004\",\"projectName\":\"Umatilla Oregon - Power City and Brownell Water & Sewer\"},{\"engineerName\":\"zahir.hussain\",\"projectCode\":\"BES25004\",\"projectName\":\"Steilacoom - Dock Lift Station and Parking Lot Improvement\"},{\"engineerName\":\"zahir.hussain\",\"projectCode\":\"SECO26002\",\"projectName\":\"Combined Sewer Overflow PS - City of Anacortes\"},{\"engineerName\":\"zahir.hussain\",\"projectCode\":\"APB26002\",\"projectName\":\"Sudden Valley Lift Station 22\"},{\"engineerName\":\"zahir.hussain\",\"projectCode\":\"CEDTC26001\",\"projectName\":\"Umatila Police Station\"},{\"engineerName\":\"zahir.hussain\",\"projectCode\":\"CLE26001\",\"projectName\":\"Battery Electric Bus Charging Infrastructure Phase 1 - El Monte Station (Div. 9)\"},{\"engineerName\":\"zahir.hussain\",\"projectCode\":\"CEDTC26002\",\"projectName\":\"Multicare Endoscopy Center - Yakima\"},{\"engineerName\":\"zahir.hussain\",\"projectCode\":\"SEC26005\",\"projectName\":\"Amazon Warehouse - ABQ1 OBD-A\"},{\"engineerName\":\"zahir.hussain\",\"projectCode\":\"CJFE26002\",\"projectName\":\"Arnold WWTF Phase I Improvements Project\"},{\"engineerName\":\"zahir.hussain\",\"projectCode\":\"RPL26001\",\"projectName\":\"NMSU Computer Center\"},{\"engineerName\":\"zahir.hussain\",\"projectCode\":\"CESC26006\",\"projectName\":\"Fujimi CMP2\"},{\"engineerName\":\"zahir.hussain\",\"projectCode\":\"MBE26008\",\"projectName\":\"West Portal Elementary School Modernization Phase 2\"},{\"engineerName\":\"zahir.hussain\",\"projectCode\":\"SEC26006\",\"projectName\":\"PSS DWS5 Phase 1E - Everett, WA\"},{\"engineerName\":\"zahir.hussain\",\"projectCode\":\"SM26001\",\"projectName\":\"New Electrical Service at HESD Central Kitchen\"},{\"engineerName\":\"nawab.naveed\",\"projectCode\":\"VEG25002\",\"projectName\":\"City of Lacey - LS 3 Replacement\"},{\"engineerName\":\"nawab.naveed\",\"projectCode\":\"EPS25009\",\"projectName\":\"City of Clovis Pump Station E AF Study\"},{\"engineerName\":\"nawab.naveed\",\"projectCode\":\"CME26001\",\"projectName\":\"Eagle and Magnolia Park Electrical Equipment Replacement\"},{\"engineerName\":\"nawab.naveed\",\"projectCode\":\"SEC26004\",\"projectName\":\"Optum Madison Center Project\"},{\"engineerName\":\"nawab.naveed\",\"projectCode\":\"MBE26007\",\"projectName\":\"Brookside Mental Health Rehab Richmond\"},{\"engineerName\":\"nawab.naveed\",\"projectCode\":\"APE26001\",\"projectName\":\"High Island ISD Construction of New K-12th School & Gym\"},{\"engineerName\":\"nawab.naveed\",\"projectCode\":\"NC26005\",\"projectName\":\"LIGO - CEBEX Laboratory\"},{\"engineerName\":\"nawab.naveed\",\"projectCode\":\"PRE26005\",\"projectName\":\"West Coast Grocery Co - IRGRA\"},{\"engineerName\":\"nawab.naveed\",\"projectCode\":\"FEI26006\",\"projectName\":\"Moccasin WTFS Project\"},{\"engineerName\":\"nawab.naveed\",\"projectCode\":\"ATS26016\",\"projectName\":\"Wesco Generator\"},{\"engineerName\":\"nawab.naveed\",\"projectCode\":\"BEI26001\",\"projectName\":\"Cart Wash Replacement - CCRMC\"},{\"engineerName\":\"nawab.naveed\",\"projectCode\":\"CECI26001\",\"projectName\":\"White Oaks Elementary School HVAC Upgrades - San Carlos\"},{\"engineerName\":\"nawab.naveed\",\"projectCode\":\"SCCE26007\",\"projectName\":\"Walnut Grove Elementary School TK Building - PUSD\"}]";

const EXCEL_PROJECT_SEED = [
  ...(JSON.parse(EXCEL_PROJECT_SEED_JSON) as Array<{
    engineerName: string;
    projectCode: string;
    projectName: string;
  }>),
  // Areeb — imported one-by-one from Utilization Sheet (projects only, no hours)
  {
    engineerName: "Areeb",
    projectCode: "AIOE26001",
    projectName: "Telemark Recycled and Potable Water Booster Pump Station - SCVWA",
  },
  {
    engineerName: "Areeb",
    projectCode: "MBE26006",
    projectName: "2025 Treatment Plant Improvement - NAPA Sanitation District",
  },
  {
    engineerName: "Areeb",
    projectCode: "DOE26001",
    projectName: "Murrieta Childrens Library Expansion Project",
  },
  {
    engineerName: "Areeb",
    projectCode: "APB26003",
    projectName: "Oak Harbor Fire Station # 82",
  },
  {
    engineerName: "Areeb",
    projectCode: "HE26003",
    projectName: "Makr Furniture Project",
  },
  {
    engineerName: "Areeb",
    projectCode: "STE26001",
    projectName: "Entegris Project",
  },
  {
    engineerName: "Areeb",
    projectCode: "GPS26007",
    projectName: "Irvine Valley College - Arts Promenade and Coffee Structure",
  },
  {
    engineerName: "Areeb",
    projectCode: "SBE26007.1",
    projectName: "UCD Segundo Dining Commons CO#1",
  },
  {
    engineerName: "Areeb",
    projectCode: "PRE26007",
    projectName: "Maintenance Facilities - City of Issaquah",
  },
  {
    engineerName: "Areeb",
    projectCode: "SCCE26006",
    projectName: "John Muir ES New TKK - AUSD",
  },
  {
    engineerName: "Areeb",
    projectCode: "BES26005",
    projectName: "Rainier HS Main Service Switchboard Replacement",
  },
  // m.suleyman — Excel name is m.sulaiman (projects only, no hours)
  {
    engineerName: "m.suleyman",
    projectCode: "PBS25005",
    projectName: "COH - Helford Special Procedure Room",
  },
  {
    engineerName: "m.suleyman",
    projectCode: "CE25001",
    projectName: "ECY - EV Infrastructure",
  },
  {
    engineerName: "m.suleyman",
    projectCode: "AET25001",
    projectName: "Issaquah Transportation Bus Charging",
  },
  {
    engineerName: "m.suleyman",
    projectCode: "AG25001",
    projectName: "Yermo School's New Gym",
  },
  {
    engineerName: "m.suleyman",
    projectCode: "SECO25001",
    projectName: "City of Burlingtom - WWTP Influent & Effluent PS Upgrades",
  },
  {
    engineerName: "m.suleyman",
    projectCode: "SBE25010",
    projectName: "UCD Campus Outdoor Security",
  },
  {
    engineerName: "m.suleyman",
    projectCode: "BVE25002",
    projectName: "Al Tahoe/Bayview Well Rehab & Emergency Power",
  },
  {
    engineerName: "m.suleyman",
    projectCode: "BVE25003",
    projectName: "UC Davis Electrical Panel Replacement",
  },
  {
    engineerName: "m.suleyman",
    projectCode: "PBS25005.1",
    projectName: "City of Hope - Helford Special Procedure Room CO#1",
  },
  {
    engineerName: "m.suleyman",
    projectCode: "MESC25002",
    projectName: "PR Distribution Project",
  },
  {
    engineerName: "m.suleyman",
    projectCode: "BDE25004",
    projectName: "PSS Longview ISD Multi Purpose Facility",
  },
  {
    engineerName: "m.suleyman",
    projectCode: "MESC25002.1",
    projectName: "PR Distribution Project Model Conversion ETAP TO SKM CO#1",
  },
  {
    engineerName: "m.suleyman",
    projectCode: "MESC25002.3",
    projectName: "PR Distribution Project CO#3",
  },
  {
    engineerName: "m.suleyman",
    projectCode: "ERE26001",
    projectName: "Fire Station 52 - Comal County ESD 3",
  },
  {
    engineerName: "m.suleyman",
    projectCode: "MESC25001",
    projectName: "Texas Medical Center (TMC) Transit Center Opportunity",
  },
  // Wareesha Azwar — imported one-by-one from Utilization Sheet (projects only, no hours)
  {
    engineerName: "Wareesha Azwar",
    projectCode: "PCLIS24001",
    projectName: "PHX 72 Neher McGrath Study for MV Duct Banks + LV",
  },
  {
    engineerName: "Wareesha Azwar",
    projectCode: "HBH24003",
    projectName: "DOW SCO",
  },
  {
    engineerName: "Wareesha Azwar",
    projectCode: "OEI25001",
    projectName: "Sapporo Teriyaki",
  },
  {
    engineerName: "Wareesha Azwar",
    projectCode: "TKE25001",
    projectName: "Tierra Blanca WWTP",
  },
  {
    engineerName: "Wareesha Azwar",
    projectCode: "BIE25001",
    projectName: "Oroville WWTP Upgrade",
  },
  {
    engineerName: "Wareesha Azwar",
    projectCode: "JEC25001",
    projectName: "Woodbine Development Project",
  },
  {
    engineerName: "Wareesha Azwar",
    projectCode: "SEC25001",
    projectName: "Sumner Station",
  },
  {
    engineerName: "Wareesha Azwar",
    projectCode: "ATS25007",
    projectName: "Old Settlers Park - 3 Sites",
  },
  {
    engineerName: "Wareesha Azwar",
    projectCode: "ATS25008",
    projectName: "AMD Building D",
  },
  {
    engineerName: "Wareesha Azwar",
    projectCode: "OEMA25001",
    projectName: "Fairlife Neher McGrath Study",
  },
  {
    engineerName: "Wareesha Azwar",
    projectCode: "PDI25001",
    projectName: "10MW ALBQ Data Center Neher McGrath Study",
  },
  {
    engineerName: "Wareesha Azwar",
    projectCode: "ATS25012",
    projectName: "DELL-PC1 SCCAF Studies",
  },
  {
    engineerName: "Wareesha Azwar",
    projectCode: "ATS25008.4",
    projectName: "AMD Building D CO#4",
  },
  {
    engineerName: "Wareesha Azwar",
    projectCode: "GWE25001.1",
    projectName: "Snubber Nucor Gallatin Facility CO#1",
  },
  {
    engineerName: "Wareesha Azwar",
    projectCode: "GPS26006",
    projectName: "Domiguez Water Pump Coordination Study",
  },
  {
    engineerName: "Wareesha Azwar",
    projectCode: "SJE26001",
    projectName: "Sewage Pump Station Improvement - North Tahoe PUD",
  },
  {
    engineerName: "Wareesha Azwar",
    projectCode: "SEC25001.1",
    projectName: "Sumner Station CO#2",
  },
];

function canonicalEngineerName(name: string): string {
  if (name.toLowerCase() === "m.sulaiman") {
    return "m.suleyman";
  }
  return name;
}

export { canonicalEngineerName };


function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createUtilizationEntry(
  input: Omit<UtilizationResultRow, "weekValuesByMonth"> & {
    weekValuesByMonth?: UtilizationResultRow["weekValuesByMonth"];
  },
): UtilizationEntry {
  return {
    id: createId(),
    engineerName: input.engineerName,
    projectCode: input.projectCode,
    projectName: input.projectName,
    weekValuesByMonth: input.weekValuesByMonth ?? {},
  };
}

export function loadUtilizationEntries(): UtilizationEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
      .map((item) => ({
        id: typeof item.id === "string" ? item.id : createId(),
        engineerName: String(item.engineerName ?? ""),
        projectCode: String(item.projectCode ?? ""),
        projectName: String(item.projectName ?? ""),
        weekValuesByMonth:
          item.weekValuesByMonth && typeof item.weekValuesByMonth === "object"
            ? (item.weekValuesByMonth as UtilizationResultRow["weekValuesByMonth"])
            : {},
      }))
      .filter(
        (item) => item.engineerName && item.projectCode && item.projectName,
      );
  } catch {
    return [];
  }
}

export function saveUtilizationEntries(entries: UtilizationEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function mergeIrsaExcelEntries(entries: UtilizationEntry[]): UtilizationEntry[] {
  const existingKeys = new Set(
    entries.map(
      (entry) =>
        `${canonicalEngineerName(entry.engineerName).toLowerCase()}::${entry.projectCode.toLowerCase()}`,
    ),
  );

  const additions = EXCEL_PROJECT_SEED.filter(
    (seed) =>
      !existingKeys.has(
        `${canonicalEngineerName(seed.engineerName).toLowerCase()}::${seed.projectCode.toLowerCase()}`,
      ),
  ).map((seed) =>
    createUtilizationEntry({
      engineerName: canonicalEngineerName(seed.engineerName),
      projectCode: seed.projectCode,
      projectName: seed.projectName,
      weekValuesByMonth: {},
    }),
  );

  if (additions.length === 0) {
    return entries;
  }

  return [...entries, ...additions];
}
