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

export interface PlanetRow {
  planet_name: string;
  sector_name: string;
  planet_size: number;
  planet_type: string;
  total_population: number;
  jobless: number;
  civilians: number;
  citizens: number;
  slaves: number;
  robots: number;
  stability: number;
  crime: number;
  amenities: number;
  free_ruler_jobs: number;
  free_specialist_jobs: number;
  free_worker_jobs: number;
}

export interface SaveAnalysis {
  save_file: string;
  save_name: string;
  game_date: string;
  player_country_id: string;
  empire_name: string;
  rows: PlanetRow[];
}

export const CSV_COLUMNS: readonly (keyof PlanetRow)[] = [
  "planet_name",
  "sector_name",
  "planet_size",
  "planet_type",
  "total_population",
  "jobless",
  "civilians",
  "citizens",
  "slaves",
  "robots",
  "stability",
  "crime",
  "amenities",
  "free_ruler_jobs",
  "free_specialist_jobs",
  "free_worker_jobs",
] as const;

const NO_OWNER = new Set(["", "4294967295", "-1"]);

export async function analyzeSaveFile(saveFile: string): Promise<SaveAnalysis> {
  const stat = await fs.stat(saveFile);

  if (!stat.isFile()) {
    throw new Error(`${saveFile} is not a file. This tool only analyzes a single .sav file at a time.`);
  }

  const gamestate = await readGamestate(saveFile);
  return analyzeGamestate(gamestate, saveFile);
}

export function analyzeGamestate(gamestate: string, saveFile: string): SaveAnalysis {
  const root = parsePdx(gamestate);
  const saveName = path.basename(saveFile);
  const gameDate = getString(root, "date") ?? dateFromFilename(saveName);

  const playerCountryId = findPlayerCountryId(root);

  if (!playerCountryId) {
    throw new Error("Could not determine the player's country from the save file");
  }

  const countries = getObject(root, "country") ?? getObject(root, "countries");
  const playerCountry = countries ? getObject(countries, playerCountryId) : undefined;

  if (!playerCountry) {
    throw new Error(`Player country ${playerCountryId} not found in gamestate`);
  }

  const empireName = resolveName(getFirst(playerCountry, "name"));
  const capitalId = getString(playerCountry, "capital") ?? getString(playerCountry, "capital_scope") ?? "";

  const planetToSector = buildPlanetToSectorMap(root);
  const sectorsContainer = getObject(root, "sectors");
  const popsByPlanet = aggregatePopsByPlanet(root);
  const jobsByPlanet = aggregateJobsByPlanet(root);
  const planetEntries = collectPlanetEntries(root);

  const rows: PlanetRow[] = [];

  for (const entry of planetEntries) {
    const planet = entry.planet;
    const owner = getString(planet, "owner");

    if (!owner || owner !== playerCountryId) {
      continue;
    }

    if (!isInhabitedPlanet(planet)) {
      continue;
    }

    const planetId = entry.id;
    const sectorId = planetToSector.get(planetId);
    const sectorName = sectorId !== undefined
      ? resolveName(getFirst(getObject(sectorsContainer, sectorId), "name"))
      : "";

    const jobs = jobsByPlanet.get(planetId);
    const pops = popsByPlanet.get(planetId);
    const planetClass = getString(planet, "planet_class") ?? "";

    rows.push({
      planet_name: resolveName(getFirst(planet, "name")),
      sector_name: sectorName,
      planet_size: numberFromField(planet, "planet_size"),
      planet_type: humanizePlanetClass(planetClass),
      total_population: planetPopulation(planet),
      jobless: pops?.jobless ?? 0,
      civilians: pops?.civilians ?? 0,
      citizens: pops?.citizens ?? 0,
      slaves: pops?.slaves ?? 0,
      robots: pops?.robots ?? 0,
      stability: round(numberFromField(planet, "stability"), 2),
      crime: round(numberFromField(planet, "crime"), 2),
      amenities: round(planetAmenities(planet), 1),
      free_ruler_jobs: jobs?.ruler ?? 0,
      free_specialist_jobs: jobs?.specialist ?? 0,
      free_worker_jobs: jobs?.worker ?? 0,
    });
  }

  const capitalName = capitalPlanetName(planetEntries, capitalId);

  rows.sort((left, right) => {
    if (capitalName) {
      if (left.planet_name === capitalName && right.planet_name !== capitalName) {
        return -1;
      }

      if (right.planet_name === capitalName && left.planet_name !== capitalName) {
        return 1;
      }
    }

    const bySector = left.sector_name.localeCompare(right.sector_name);

    if (bySector !== 0) {
      return bySector;
    }

    return left.planet_name.localeCompare(right.planet_name);
  });

  return {
    save_file: saveFile,
    save_name: saveName,
    game_date: gameDate,
    player_country_id: playerCountryId,
    empire_name: empireName,
    rows,
  };
}

export function rowsToCsv(
  rows: readonly PlanetRow[],
  columns: readonly (keyof PlanetRow)[] = CSV_COLUMNS,
  includeBom = true,
): string {
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

interface PlanetEntry {
  id: string;
  planet: PdxObject;
}

function collectPlanetEntries(root: PdxObject): PlanetEntry[] {
  const entries: PlanetEntry[] = [];
  const planetsRoot = getObject(root, "planets") ?? getObject(root, "planet");

  if (!planetsRoot) {
    return entries;
  }

  const containers: PdxObject[] = [];
  const innerPlanetContainer = getObject(planetsRoot, "planet");

  if (innerPlanetContainer) {
    containers.push(innerPlanetContainer);
  } else {
    containers.push(planetsRoot);
  }

  for (const container of containers) {
    for (const assignment of container.assignments) {
      if (isPdxObject(assignment.value)) {
        entries.push({ id: assignment.key, planet: assignment.value });
      }
    }
  }

  return entries;
}

function findPlayerCountryId(root: PdxObject): string | undefined {
  const players = getObject(root, "player") ?? getObject(root, "players");

  if (!players) {
    return undefined;
  }

  for (const assignment of players.assignments) {
    if (assignment.key === "country" && typeof assignment.value === "string") {
      return assignment.value;
    }

    if (isPdxObject(assignment.value)) {
      const fromChild = getString(assignment.value, "country");

      if (fromChild) {
        return fromChild;
      }
    }
  }

  for (const value of players.values) {
    if (isPdxObject(value)) {
      const fromChild = getString(value, "country");

      if (fromChild) {
        return fromChild;
      }
    }
  }

  return undefined;
}

function buildPlanetToSectorMap(root: PdxObject): Map<string, string> {
  const planetToSector = new Map<string, string>();
  const systemsContainer = getObject(root, "galactic_object") ?? getObject(root, "galactic_objects");

  if (!systemsContainer) {
    return planetToSector;
  }

  for (const assignment of systemsContainer.assignments) {
    if (!isPdxObject(assignment.value)) {
      continue;
    }

    const system = assignment.value;
    const sectorId = getString(system, "sector");

    if (!sectorId || NO_OWNER.has(sectorId)) {
      continue;
    }

    for (const planetAssignment of system.assignments) {
      if (planetAssignment.key === "planet" && typeof planetAssignment.value === "string") {
        planetToSector.set(planetAssignment.value, sectorId);
      }
    }
  }

  return planetToSector;
}

interface PopCounts {
  jobless: number;
  civilians: number;
  citizens: number;
  slaves: number;
  robots: number;
}

function aggregatePopsByPlanet(root: PdxObject): Map<string, PopCounts> {
  const result = new Map<string, PopCounts>();
  const popGroups = getObject(root, "pop_groups");

  if (!popGroups) {
    return result;
  }

  const mechanicalSpecies = mechanicalSpeciesIds(root);

  for (const assignment of popGroups.assignments) {
    if (!isPdxObject(assignment.value)) {
      continue;
    }

    const popGroup = assignment.value;
    const planetId = getString(popGroup, "planet");

    if (!planetId) {
      continue;
    }

    const size = numberFromField(popGroup, "size");

    if (size <= 0) {
      continue;
    }

    const key = getObject(popGroup, "key");
    const category = getString(key, "category") ?? "";
    const speciesId = getString(key, "species") ?? "";
    const isRobot = isMechanicalPop(category, speciesId, mechanicalSpecies);
    const counts = result.get(planetId) ?? emptyPopCounts();

    if (isJoblessPopCategory(category)) {
      counts.jobless += size;
    }

    if (category === "civilian") {
      counts.civilians += size;
    }

    if (category === "slave") {
      counts.slaves += size;
    }

    if (isRobot) {
      counts.robots += size;
    } else if (isCitizenPopCategory(category)) {
      counts.citizens += size;
    }

    result.set(planetId, counts);
  }

  return result;
}

function emptyPopCounts(): PopCounts {
  return {
    jobless: 0,
    civilians: 0,
    citizens: 0,
    slaves: 0,
    robots: 0,
  };
}

interface JobCounts {
  ruler: number;
  specialist: number;
  worker: number;
}

function aggregateJobsByPlanet(root: PdxObject): Map<string, JobCounts> {
  const result = new Map<string, JobCounts>();
  const popJobs = getObject(root, "pop_jobs");

  if (!popJobs) {
    return result;
  }

  for (const assignment of popJobs.assignments) {
    if (!isPdxObject(assignment.value)) {
      continue;
    }

    const job = assignment.value;
    const planetId = getString(job, "planet");

    if (!planetId) {
      continue;
    }

    const workforce = numberFromField(job, "workforce");

    if (workforce < 0) {
      continue;
    }

    const maxWorkforce = numberFromField(job, "max_workforce");

    if (maxWorkforce <= 0) {
      continue;
    }

    const open = Math.max(0, Math.round(maxWorkforce - workforce));

    if (open <= 0) {
      continue;
    }

    const counts = result.get(planetId) ?? { ruler: 0, specialist: 0, worker: 0 };
    const category = jobCategory(getString(job, "type") ?? "");

    if (category === "ruler") {
      counts.ruler += open;
    } else if (category === "specialist") {
      counts.specialist += open;
    } else if (category === "worker") {
      counts.worker += open;
    }

    result.set(planetId, counts);
  }

  return result;
}

type JobCategory = "ruler" | "specialist" | "worker" | "other";

const RULER_JOB_TYPES = new Set<string>([
  "politician",
  "colonist",
  "ruler_unemployment",
  "primitive_noble",
  "noble",
  "high_priest",
  "manager",
  "executive",
  "death_priest",
]);

const SPECIALIST_JOB_TYPES = new Set<string>([
  "artisan",
  "foundry",
  "fabricator",
  "healthcare",
  "entertainer",
  "bureaucrat",
  "enforcer",
  "biologist",
  "physicist",
  "engineer",
  "manufactorium_specialist",
  "roboticist",
  "replicator",
  "identity_designer",
  "trader",
  "coordinator",
  "logistics_drone",
  "spawning_drone",
  "bath_attendant",
  "squire",
  "calculator_biologist",
  "calculator_engineer",
  "calculator_physicist",
  "primitive_researcher",
  "primitive_bureaucrat",
  "primitive_priest",
  "primitive_hive_synapse_drone",
  "primitive_hive_spawning_drone",
  "primitive_hive_cerebellum_drone",
  "fe_acolyte_artisan",
  "fe_hedonist",
  "specialist_unemployment",
  "complex_drone_unemployment",
  "neural_chip",
  "priest",
  "doctor",
  "scholar",
  "telepath",
  "psi_corps",
  "researcher",
  "metallurgist",
  "culture_worker",
  "merchant",
  "manager_drone",
]);

const WORKER_JOB_TYPES = new Set<string>([
  "farmer",
  "miner",
  "technician",
  "clerk",
  "soldier",
  "peasant",
  "peasant_lithoid",
  "hunter_gatherer",
  "hunter_gatherer_lithoid",
  "agri_drone",
  "mining_drone",
  "technician_drone",
  "hive_sustenance_drone",
  "hive_sustenance_drone_lithoid",
  "hive_basic_agri_drone",
  "hive_basic_agri_drone_lithoid",
  "warrior_drone",
  "patrol_drone",
  "maintenance_drone",
  "slave_toiler",
  "slave_orderly",
  "criminal",
  "livestock",
  "livestock_lithoid",
  "livestock_infernal",
  "organic_battery",
  "organic_exhibit",
  "bio_trophy",
  "fe_maintenance_bot",
  "fe_guardian_bot",
  "primitive_farmer",
  "primitive_miner",
  "primitive_warrior",
  "primitive_laborer",
  "primitive_technician",
  "primitive_hive_factory_drone",
  "primitive_hive_miner",
  "primitive_hive_warrior",
  "worker_unemployment",
  "simple_drone_unemployment",
  "wilderness_maintenance_drone",
  "pre_sapient",
  "pre_sapient_nascent",
  "xeno_zoo_animal",
  "xeno_zoo_animal_nascent",
  "xeno_zoo_animal_lithoid",
  "xeno_zoo_animal_lithoid_nascent",
  "xeno_zoo_beast",
  "xeno_zoo_beast_nascent",
  "xeno_zoo_beast_lithoid",
  "xeno_zoo_beast_lithoid_nascent",
  "menial_drone",
]);

const CITIZEN_POP_CATEGORIES = new Set<string>([
  "ruler",
  "specialist",
  "worker",
  "civilian",
  "criminal",
  "precursor",
  "ruler_unemployment",
  "specialist_unemployment",
  "worker_unemployment",
]);

const MECHANICAL_SPECIES_CLASSES = new Set<string>([
  "MACHINE",
  "ROBOT",
]);

const MECHANICAL_SPECIES_TRAITS = new Set<string>([
  "trait_machine_unit",
  "trait_mechanical",
]);

function jobCategory(type: string): JobCategory {
  if (RULER_JOB_TYPES.has(type)) {
    return "ruler";
  }

  if (SPECIALIST_JOB_TYPES.has(type)) {
    return "specialist";
  }

  if (WORKER_JOB_TYPES.has(type)) {
    return "worker";
  }

  return "other";
}

function mechanicalSpeciesIds(root: PdxObject): Set<string> {
  const result = new Set<string>();
  const speciesDb = getObject(root, "species_db");

  if (!speciesDb) {
    return result;
  }

  for (const assignment of speciesDb.assignments) {
    if (!isPdxObject(assignment.value)) {
      continue;
    }

    if (isMechanicalSpecies(assignment.value)) {
      result.add(assignment.key);
    }
  }

  return result;
}

function isMechanicalSpecies(species: PdxObject): boolean {
  const speciesClass = getString(species, "class") ?? "";

  if (MECHANICAL_SPECIES_CLASSES.has(speciesClass)) {
    return true;
  }

  return getAssignments(getObject(species, "traits"), "trait")
    .some((trait) => typeof trait === "string" && MECHANICAL_SPECIES_TRAITS.has(trait));
}

function isMechanicalPop(category: string, speciesId: string, mechanicalSpecies: ReadonlySet<string>): boolean {
  return category.startsWith("robot") || (speciesId !== "" && mechanicalSpecies.has(speciesId));
}

function isJoblessPopCategory(category: string): boolean {
  return category === "unemployment" || category.endsWith("_unemployment");
}

function isCitizenPopCategory(category: string): boolean {
  return CITIZEN_POP_CATEGORIES.has(category);
}

function isInhabitedPlanet(planet: PdxObject): boolean {
  const popGroups = getFirst(planet, "pop_groups");

  if (isPdxObject(popGroups) && popGroups.values.length > 0) {
    return true;
  }

  if (numberFromField(planet, "num_sapient_pops") > 0) {
    return true;
  }

  if (getAssignments(planet, "pop").length > 0) {
    return true;
  }

  return false;
}

function planetPopulation(planet: PdxObject): number {
  const sapient = numberFromField(planet, "num_sapient_pops");

  if (sapient > 0) {
    return sapient;
  }

  const employable = numberFromField(planet, "employable_pops");

  if (employable > 0) {
    return employable;
  }

  const popGroups = getFirst(planet, "pop_groups");

  if (isPdxObject(popGroups)) {
    return popGroups.values.length + popGroups.assignments.length;
  }

  return getAssignments(planet, "pop").length;
}

function planetAmenities(planet: PdxObject): number {
  const free = numericValue(getFirst(planet, "free_amenities"));

  if (free !== undefined) {
    return free;
  }

  const total = numericValue(getFirst(planet, "amenities")) ?? 0;
  const usage = numericValue(getFirst(planet, "amenities_usage")) ?? 0;
  return total - usage;
}

function resolveName(value: PdxValue | undefined): string {
  if (value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  const key = getString(value, "key");

  if (!key) {
    return "";
  }

  if (key === "PLANET_NAME_FORMAT" || key === "SUBPLANET_NAME_FORMAT") {
    const variables = getObject(value, "variables");
    const parts = variables ? extractFormatVariableParts(variables) : [];

    if (parts.length > 0) {
      return parts.join(" ");
    }
  }

  return key;
}

function extractFormatVariableParts(variables: PdxObject): string[] {
  const parts: string[] = [];

  for (const value of variables.values) {
    if (!isPdxObject(value)) {
      continue;
    }

    const valueRef = getFirst(value, "value");
    const resolved = resolveName(valueRef);

    if (resolved) {
      parts.push(resolved);
    }
  }

  return parts;
}

function humanizePlanetClass(className: string): string {
  if (!className) {
    return "";
  }

  const trimmed = className.startsWith("pc_") ? className.slice(3) : className;

  return trimmed
    .split("_")
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function numberFromField(object: PdxObject | undefined, key: string): number {
  const value = numericValue(getFirst(object, key));
  return value ?? 0;
}

function capitalPlanetName(
  planetEntries: readonly PlanetEntry[],
  capitalId: string,
): string | undefined {
  if (!capitalId) {
    return undefined;
  }

  for (const entry of planetEntries) {
    if (entry.id === capitalId) {
      return resolveName(getFirst(entry.planet, "name"));
    }
  }

  return undefined;
}

function dateFromFilename(fileName: string): string {
  const match = /(\d{4}\.\d{2}\.\d{2})/.exec(fileName);
  return match?.[1] ?? "";
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function csvCell(value: string | number | boolean): string {
  const text = String(value);

  if (!/[",\r\n]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll("\"", "\"\"")}"`;
}
