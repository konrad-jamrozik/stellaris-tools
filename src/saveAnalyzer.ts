import { promises as fs } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import {
  getAssignments,
  getFirst,
  getObject,
  getString,
  isPdxObject,
  numericValue,
  parsePdx,
  type PdxObject,
  type PdxValue,
} from "./pdxParser.js";

export interface AnalyzerOptions {
  recursive?: boolean;
  includeAllCountries?: boolean;
  includeBom?: boolean;
}

export interface AnalyzeInputResult {
  rows: AnalysisRow[];
  analyzedFiles: string[];
  warnings: string[];
}

export type AnalysisRow = Record<string, string | number | boolean>;

const RESOURCE_NAMES = [
  "energy",
  "minerals",
  "food",
  "alloys",
  "consumer_goods",
  "unity",
  "influence",
  "minor_artifacts",
  "volatile_motes",
  "exotic_gases",
  "rare_crystals",
  "dark_matter",
  "living_metal",
  "zro",
  "nanites",
] as const;

export const CSV_COLUMNS = [
  "save_file",
  "save_name",
  "game_date",
  "country_id",
  "empire_name",
  "country_type",
  "authority",
  "government",
  "capital_id",
  "colonies",
  "owned_systems",
  "pops",
  "fleets",
  "fleet_power",
  ...RESOURCE_NAMES,
];

export async function analyzeInput(inputPath: string, options: AnalyzerOptions = {}): Promise<AnalyzeInputResult> {
  const stat = await fs.stat(inputPath);
  const saveFiles = stat.isDirectory()
    ? await collectSaveFiles(inputPath, options.recursive ?? true)
    : [inputPath];

  if (saveFiles.length === 0) {
    throw new Error(`No .sav files found in ${inputPath}`);
  }

  const rows: AnalysisRow[] = [];
  const analyzedFiles: string[] = [];
  const warnings: string[] = [];

  for (const saveFile of saveFiles) {
    try {
      rows.push(...(await analyzeSaveFile(saveFile, options)));
      analyzedFiles.push(saveFile);
    } catch (error) {
      warnings.push(`${saveFile}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (rows.length === 0 && warnings.length > 0) {
    throw new Error(`No rows produced. First error: ${warnings[0]}`);
  }

  return { rows, analyzedFiles, warnings };
}

export async function analyzeSaveFile(saveFile: string, options: AnalyzerOptions = {}): Promise<AnalysisRow[]> {
  const gamestate = await readGamestate(saveFile);
  return analyzeGamestate(gamestate, saveFile, options);
}

export function analyzeGamestate(
  gamestate: string,
  saveFile: string,
  options: AnalyzerOptions = {},
): AnalysisRow[] {
  const root = parsePdx(gamestate);
  const saveName = path.basename(saveFile);
  const gameDate = getString(root, "date") ?? dateFromFilename(saveName);
  const countries = getObject(root, "country") ?? getObject(root, "countries");

  if (!countries) {
    throw new Error("Could not find top-level country or countries object in gamestate");
  }

  const planetStats = extractPlanetStats(root);
  const fleetStats = extractFleetStats(root);
  const systemStats = extractSystemStats(root);
  const rows: AnalysisRow[] = [];

  for (const assignment of countries.assignments) {
    if (!isPdxObject(assignment.value)) {
      continue;
    }

    const country = assignment.value;
    const countryId = assignment.key;
    const empireName = displayValue(getFirst(country, "name")) ?? "";
    const countryType = getString(country, "type") ?? getString(country, "country_type") ?? "";
    const directColonies = countCollection(getFirst(country, "owned_planets"));
    const directSystems = countCollection(getFirst(country, "owned_systems"));
    const directFleets = countCollection(getFirst(country, "owned_fleets"));
    const popCount = Math.max(countCollection(getFirst(country, "owned_pops")), planetStats.popsByOwner.get(countryId) ?? 0);
    const colonies = Math.max(directColonies, planetStats.planetsByOwner.get(countryId) ?? 0);
    const systems = Math.max(directSystems, systemStats.systemsByOwner.get(countryId) ?? 0);
    const fleets = Math.max(directFleets, fleetStats.fleetsByOwner.get(countryId) ?? 0);
    const fleetPower = fleetStats.powerByOwner.get(countryId) ?? firstNumber(country, ["fleet_power", "military_power"]) ?? 0;

    if (!options.includeAllCountries && !isInterestingCountry(country, empireName, colonies, systems, fleets, popCount)) {
      continue;
    }

    const row: AnalysisRow = {
      save_file: saveFile,
      save_name: saveName,
      game_date: gameDate,
      country_id: countryId,
      empire_name: empireName,
      country_type: countryType,
      authority: getString(country, "authority") ?? "",
      government: getString(country, "government") ?? "",
      capital_id: getString(country, "capital") ?? getString(country, "capital_scope") ?? "",
      colonies,
      owned_systems: systems,
      pops: popCount,
      fleets,
      fleet_power: round(fleetPower),
    };

    for (const resourceName of RESOURCE_NAMES) {
      row[resourceName] = round(extractResource(country, resourceName) ?? 0);
    }

    rows.push(row);
  }

  rows.sort((left, right) => {
    const bySave = String(left.save_file).localeCompare(String(right.save_file));
    if (bySave !== 0) {
      return bySave;
    }

    return String(left.country_id).localeCompare(String(right.country_id), undefined, { numeric: true });
  });

  return rows;
}

export function rowsToCsv(rows: AnalysisRow[], columns = CSV_COLUMNS, includeBom = true): string {
  const csv = [
    columns.map(csvCell).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column] ?? "")).join(",")),
  ].join("\r\n");

  return `${includeBom ? "\uFEFF" : ""}${csv}\r\n`;
}

async function readGamestate(saveFile: string): Promise<string> {
  const data = await fs.readFile(saveFile);
  const zip = await JSZip.loadAsync(data);
  const gamestate = zip.file("gamestate") ?? zip.file(/(^|\/)gamestate$/)[0];

  if (!gamestate) {
    throw new Error("Save archive does not contain a gamestate entry");
  }

  return gamestate.async("string");
}

async function collectSaveFiles(directory: string, recursive: boolean): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const saveFiles: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory() && recursive) {
      saveFiles.push(...(await collectSaveFiles(entryPath, recursive)));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".sav")) {
      saveFiles.push(entryPath);
    }
  }

  return saveFiles.sort();
}

function extractPlanetStats(root: PdxObject): {
  planetsByOwner: Map<string, number>;
  popsByOwner: Map<string, number>;
} {
  const stats = {
    planetsByOwner: new Map<string, number>(),
    popsByOwner: new Map<string, number>(),
  };

  for (const planets of [getObject(root, "planets"), getObject(root, "planet")]) {
    if (!planets) {
      continue;
    }

    for (const planet of childObjects(planets)) {
      const owner = getString(planet, "owner") ?? getString(planet, "controller");

      if (!owner || owner === "4294967295" || owner === "-1") {
        continue;
      }

      increment(stats.planetsByOwner, owner, 1);
      increment(stats.popsByOwner, owner, countPlanetPops(planet));
    }
  }

  return stats;
}

function extractFleetStats(root: PdxObject): {
  fleetsByOwner: Map<string, number>;
  powerByOwner: Map<string, number>;
} {
  const stats = {
    fleetsByOwner: new Map<string, number>(),
    powerByOwner: new Map<string, number>(),
  };

  for (const containerName of ["fleet", "fleets"]) {
    const fleetContainer = getObject(root, containerName);

    if (!fleetContainer) {
      continue;
    }

    for (const fleet of childObjects(fleetContainer)) {
      const owner = getString(fleet, "owner");

      if (!owner || owner === "4294967295" || owner === "-1") {
        continue;
      }

      increment(stats.fleetsByOwner, owner, 1);
      increment(stats.powerByOwner, owner, firstNumber(fleet, ["military_power", "fleet_power", "power"]) ?? 0);
    }
  }

  return stats;
}

function extractSystemStats(root: PdxObject): { systemsByOwner: Map<string, number> } {
  const systemsByOwner = new Map<string, number>();

  for (const containerName of ["galactic_object", "galactic_objects", "starbase_mgr"]) {
    const systemContainer = getObject(root, containerName);

    if (!systemContainer) {
      continue;
    }

    for (const system of childObjects(systemContainer)) {
      const owner = getString(system, "owner");
      const starbase = getObject(system, "starbase");
      const starbaseOwner = owner ?? getString(starbase, "owner");

      if (!starbaseOwner || starbaseOwner === "4294967295" || starbaseOwner === "-1") {
        continue;
      }

      increment(systemsByOwner, starbaseOwner, 1);
    }
  }

  return { systemsByOwner };
}

function childObjects(object: PdxObject): PdxObject[] {
  const children: PdxObject[] = [];

  for (const assignment of object.assignments) {
    if (isPdxObject(assignment.value)) {
      children.push(assignment.value);
    }
  }

  for (const value of object.values) {
    if (isPdxObject(value)) {
      children.push(value);
    }
  }

  return children;
}

function countPlanetPops(planet: PdxObject): number {
  let count = 0;

  count += getAssignments(planet, "pop").filter(isPdxObject).length;
  count += countCollection(getFirst(planet, "pops"));

  return count;
}

function countCollection(value: PdxValue | undefined): number {
  if (value === undefined) {
    return 0;
  }

  if (typeof value === "string") {
    return value.length > 0 ? 1 : 0;
  }

  return value.values.length + value.assignments.length;
}

function extractResource(country: PdxObject, resourceName: string): number | undefined {
  for (const containerName of ["resources", "resource_stockpile", "stockpile"]) {
    const container = getObject(country, containerName);
    const resource = getFirst(container, resourceName);
    const amount = extractAmount(resource);

    if (amount !== undefined) {
      return amount;
    }
  }

  return extractAmount(getFirst(country, resourceName));
}

function extractAmount(value: PdxValue | undefined): number | undefined {
  const direct = numericValue(value);

  if (direct !== undefined) {
    return direct;
  }

  if (!isPdxObject(value)) {
    return undefined;
  }

  return firstNumber(value, ["amount", "value", "current", "stored"]);
}

function firstNumber(object: PdxObject | undefined, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = numericValue(getFirst(object, key));

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function displayValue(value: PdxValue | undefined): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (!value) {
    return undefined;
  }

  for (const key of ["name", "text", "key", "value"]) {
    const candidate = getString(value, key);

    if (candidate) {
      return candidate;
    }
  }

  const primitiveValues = value.values.filter((item): item is string => typeof item === "string");
  return primitiveValues.length > 0 ? primitiveValues.join(" ") : undefined;
}

function isInterestingCountry(
  country: PdxObject,
  empireName: string,
  colonies: number,
  systems: number,
  fleets: number,
  pops: number,
): boolean {
  if (empireName || colonies > 0 || systems > 0 || fleets > 0 || pops > 0) {
    return true;
  }

  return getObject(country, "resources") !== undefined || getObject(country, "owned_planets") !== undefined;
}

function dateFromFilename(fileName: string): string {
  const match = /(\d{4}\.\d{2}\.\d{2})/.exec(fileName);
  return match?.[1] ?? "";
}

function increment(map: Map<string, number>, key: string, amount: number): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function csvCell(value: string | number | boolean): string {
  const text = String(value);

  if (!/[",\r\n]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll("\"", "\"\"")}"`;
}
