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
  planet_type: string;
  planet_size: number;
  stability: number;
  crime: number;
  amenities: number;
  "precinct houses": number | "";
  "medical center": 1 | "";
  "holo-theatres": number | "";
  "luxury residences": number | "";
  "clone vats": 1 | "";
  "robot assembly plant": 1 | "";
  "augmentation center": 1 | "";
  total_population: number;
  citizens: number;
  slaves: number;
  robots: number;
  citizen_workers: number;
  mitron_workers: number;
  kelsiote_workers: number;
  robot_workers: number;
  jobless: number;
  civilians: number;
  ruler_jobs: number;
  free_ruler_jobs: number;
  specialist_jobs: number;
  free_specialist_jobs: number;
  worker_jobs: number;
  free_worker_jobs: number;
  researcher_jobs: number;
  free_researcher_jobs: number;
  unity_jobs: number;
  free_unity_jobs: number;
  cgds_jobs: number;
  free_cgds_jobs: number;
  alloy_jobs: number;
  free_alloy_jobs: number;
  enforcer_jobs: number;
  free_enforcer_jobs: number;
  medical_worker_jobs: number;
  free_medical_worker_jobs: number;
  entertainer_jobs: number;
  free_entertainer_jobs: number;
  roboticist_jobs: number;
  free_roboticist_jobs: number;
  soldier_jobs: number;
  free_soldier_jobs: number;
  augmentor_jobs: number;
  free_augmentor_jobs: number;
  technician_jobs: number;
  free_technician_jobs: number;
  miner_jobs: number;
  free_miner_jobs: number;
  farmer_jobs: number;
  free_farmer_jobs: number;
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
  "planet_type",
  "planet_size",
  "stability",
  "crime",
  "amenities",
  "precinct houses",
  "medical center",
  "holo-theatres",
  "luxury residences",
  "clone vats",
  "robot assembly plant",
  "augmentation center",
  "total_population",
  "citizens",
  "slaves",
  "robots",
  "citizen_workers",
  "mitron_workers",
  "kelsiote_workers",
  "robot_workers",
  "jobless",
  "civilians",
  "ruler_jobs",
  "free_ruler_jobs",
  "specialist_jobs",
  "free_specialist_jobs",
  "worker_jobs",
  "free_worker_jobs",
  "researcher_jobs",
  "free_researcher_jobs",
  "unity_jobs",
  "free_unity_jobs",
  "cgds_jobs",
  "free_cgds_jobs",
  "alloy_jobs",
  "free_alloy_jobs",
  "enforcer_jobs",
  "free_enforcer_jobs",
  "medical_worker_jobs",
  "free_medical_worker_jobs",
  "entertainer_jobs",
  "free_entertainer_jobs",
  "roboticist_jobs",
  "free_roboticist_jobs",
  "soldier_jobs",
  "free_soldier_jobs",
  "augmentor_jobs",
  "free_augmentor_jobs",
  "technician_jobs",
  "free_technician_jobs",
  "miner_jobs",
  "free_miner_jobs",
  "farmer_jobs",
  "free_farmer_jobs",
] as const;

const NO_OWNER = new Set(["", "4294967295", "-1"]);

const MEDICAL_CENTER_BUILDINGS = new Set([
  "building_medical_1",
  "building_medical_2",
  "building_clinic",
  "building_hospital",
  "building_gene_clinic",
  "building_cyto_revitalization_center",
  "building_medical_center",
]);

const CLONE_VATS_BUILDINGS = new Set([
  "building_clone_vats",
]);

const ROBOT_ASSEMBLY_BUILDINGS = new Set([
  "building_robot_assembly_plant",
  "building_machine_assembly_plant",
  "building_machine_assembly_complex",
  "building_robotics_assembly_plant",
]);

const AUGMENTATION_CENTER_BUILDINGS = new Set([
  "building_augmentation_center",
]);

const HOLO_THEATRE_BUILDINGS = new Set([
  "building_holo_theatres",
  "building_hyper_entertainment_forum",
]);

const LUXURY_RESIDENCE_BUILDINGS = new Set([
  "building_luxury_residence",
  "building_luxury_residences",
  "building_paradise_dome",
]);

const PRECINCT_HOUSE_BUILDINGS = new Set([
  "building_precinct_house",
  "building_precinct_houses",
  "building_hall_judgment",
]);

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
  const popJobOccupancyByPlanet = aggregatePopJobOccupancyByPlanet(root);
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
    const popJobOccupancy = popJobOccupancyByPlanet.get(planetId);
    const planetClass = getString(planet, "planet_class") ?? "";
    const buildings = planetBuildings(planet, root);

    rows.push({
      planet_name: resolveName(getFirst(planet, "name")),
      sector_name: sectorName,
      planet_type: humanizePlanetClass(planetClass),
      planet_size: numberFromField(planet, "planet_size"),
      stability: round(numberFromField(planet, "stability"), 2),
      crime: round(numberFromField(planet, "crime"), 2),
      amenities: round(planetAmenities(planet), 1),
      "precinct houses": countBuildings(buildings, PRECINCT_HOUSE_BUILDINGS),
      "medical center": hasBuilding(buildings, MEDICAL_CENTER_BUILDINGS) ? 1 : "",
      "holo-theatres": countBuildings(buildings, HOLO_THEATRE_BUILDINGS),
      "luxury residences": countBuildings(buildings, LUXURY_RESIDENCE_BUILDINGS),
      "clone vats": hasBuilding(buildings, CLONE_VATS_BUILDINGS) ? 1 : "",
      "robot assembly plant": hasBuilding(buildings, ROBOT_ASSEMBLY_BUILDINGS) ? 1 : "",
      "augmentation center": hasBuilding(buildings, AUGMENTATION_CENTER_BUILDINGS) ? 1 : "",
      total_population: planetPopulation(planet),
      citizens: pops?.citizens ?? 0,
      slaves: pops?.slaves ?? 0,
      robots: pops?.robots ?? 0,
      citizen_workers: popJobOccupancy?.citizenWorkers ?? 0,
      mitron_workers: popJobOccupancy?.mitronWorkers ?? 0,
      kelsiote_workers: popJobOccupancy?.kelsioteWorkers ?? 0,
      robot_workers: popJobOccupancy?.robotWorkers ?? 0,
      jobless: popJobOccupancy?.jobless ?? 0,
      civilians: popJobOccupancy?.civilians ?? 0,
      ruler_jobs: popJobOccupancy?.rulerJobs ?? 0,
      free_ruler_jobs: jobs?.ruler ?? 0,
      specialist_jobs: popJobOccupancy?.specialistJobs ?? 0,
      free_specialist_jobs: jobs?.specialist ?? 0,
      worker_jobs: popJobOccupancy?.workerJobs ?? 0,
      free_worker_jobs: jobs?.worker ?? 0,
      researcher_jobs: popJobOccupancy?.researcherJobs ?? 0,
      free_researcher_jobs: jobs?.researcher ?? 0,
      unity_jobs: popJobOccupancy?.unityJobs ?? 0,
      free_unity_jobs: jobs?.unity ?? 0,
      cgds_jobs: popJobOccupancy?.cgdsJobs ?? 0,
      free_cgds_jobs: jobs?.cgds ?? 0,
      alloy_jobs: popJobOccupancy?.alloyJobs ?? 0,
      free_alloy_jobs: jobs?.alloys ?? 0,
      enforcer_jobs: popJobOccupancy?.enforcerJobs ?? 0,
      free_enforcer_jobs: jobs?.enforcer ?? 0,
      medical_worker_jobs: popJobOccupancy?.medicalWorkerJobs ?? 0,
      free_medical_worker_jobs: jobs?.medicalWorker ?? 0,
      entertainer_jobs: popJobOccupancy?.entertainerJobs ?? 0,
      free_entertainer_jobs: jobs?.entertainer ?? 0,
      roboticist_jobs: popJobOccupancy?.roboticistJobs ?? 0,
      free_roboticist_jobs: jobs?.roboticist ?? 0,
      soldier_jobs: popJobOccupancy?.soldierJobs ?? 0,
      free_soldier_jobs: jobs?.soldier ?? 0,
      augmentor_jobs: popJobOccupancy?.augmentorJobs ?? 0,
      free_augmentor_jobs: jobs?.augmentor ?? 0,
      technician_jobs: popJobOccupancy?.technicianJobs ?? 0,
      free_technician_jobs: jobs?.technician ?? 0,
      miner_jobs: popJobOccupancy?.minerJobs ?? 0,
      free_miner_jobs: jobs?.miner ?? 0,
      farmer_jobs: popJobOccupancy?.farmerJobs ?? 0,
      free_farmer_jobs: jobs?.farmer ?? 0,
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
    citizens: 0,
    slaves: 0,
    robots: 0,
  };
}

interface PopJobOccupancyCounts {
  jobless: number;
  civilians: number;
  rulerJobs: number;
  specialistJobs: number;
  workerJobs: number;
  citizenWorkers: number;
  mitronWorkers: number;
  kelsioteWorkers: number;
  robotWorkers: number;
  researcherJobs: number;
  unityJobs: number;
  cgdsJobs: number;
  alloyJobs: number;
  enforcerJobs: number;
  medicalWorkerJobs: number;
  entertainerJobs: number;
  roboticistJobs: number;
  soldierJobs: number;
  augmentorJobs: number;
  technicianJobs: number;
  minerJobs: number;
  farmerJobs: number;
}

interface PopGroupInfo {
  category: string;
  isRobot: boolean;
  speciesNames: readonly string[];
}

interface OccupiedPopAssignment {
  popGroupId: string;
  amount: number;
}

function aggregatePopJobOccupancyByPlanet(root: PdxObject): Map<string, PopJobOccupancyCounts> {
  const result = new Map<string, PopJobOccupancyCounts>();
  const popJobs = getObject(root, "pop_jobs");

  if (!popJobs) {
    return result;
  }

  const popGroupsById = buildPopGroupInfoById(root);

  for (const assignment of popJobs.assignments) {
    if (!isPdxObject(assignment.value)) {
      continue;
    }

    const job = assignment.value;
    const planetId = getString(job, "planet");

    if (!planetId) {
      continue;
    }

    const type = getString(job, "type") ?? "";
    const amount = occupiedPopAmount(job);

    if (amount <= 0) {
      continue;
    }

    const counts = result.get(planetId) ?? emptyPopJobOccupancyCounts();
    const isJobless = isJoblessPopCategory(type);
    const jobTier = jobCategory(type);

    if (type === "civilian") {
      counts.civilians += amount;
    } else if (isJobless) {
      counts.jobless += amount;
    }

    if (isJobless || type === "civilian") {
      result.set(planetId, counts);
      continue;
    }

    if (jobTier === "ruler") {
      counts.rulerJobs += amount;
    } else if (jobTier === "specialist") {
      counts.specialistJobs += amount;
    } else if (jobTier === "worker") {
      counts.workerJobs += amount;
      addWorkerBreakdown(counts, occupiedPopAssignments(job), popGroupsById);
    }

    addSpecificJobOccupancy(counts, type, amount);

    if (CGDS_JOB_TYPES.has(type)) {
      counts.cgdsJobs += amount;
    }

    if (ALLOY_JOB_TYPES.has(type)) {
      counts.alloyJobs += amount;
    }

    result.set(planetId, counts);
  }

  return result;
}

function emptyPopJobOccupancyCounts(): PopJobOccupancyCounts {
  return {
    jobless: 0,
    civilians: 0,
    rulerJobs: 0,
    specialistJobs: 0,
    workerJobs: 0,
    citizenWorkers: 0,
    mitronWorkers: 0,
    kelsioteWorkers: 0,
    robotWorkers: 0,
    researcherJobs: 0,
    unityJobs: 0,
    cgdsJobs: 0,
    alloyJobs: 0,
    enforcerJobs: 0,
    medicalWorkerJobs: 0,
    entertainerJobs: 0,
    roboticistJobs: 0,
    soldierJobs: 0,
    augmentorJobs: 0,
    technicianJobs: 0,
    minerJobs: 0,
    farmerJobs: 0,
  };
}

function addSpecificJobOccupancy(counts: PopJobOccupancyCounts, type: string, amount: number): void {
  if (RESEARCHER_JOB_TYPES.has(type)) {
    counts.researcherJobs += amount;
  }

  if (UNITY_JOB_TYPES.has(type)) {
    counts.unityJobs += amount;
  }

  if (ENFORCER_JOB_TYPES.has(type)) {
    counts.enforcerJobs += amount;
  }

  if (MEDICAL_WORKER_JOB_TYPES.has(type)) {
    counts.medicalWorkerJobs += amount;
  }

  if (ENTERTAINER_JOB_TYPES.has(type)) {
    counts.entertainerJobs += amount;
  }

  if (ROBOTICIST_JOB_TYPES.has(type)) {
    counts.roboticistJobs += amount;
  }

  if (SOLDIER_JOB_TYPES.has(type)) {
    counts.soldierJobs += amount;
  }

  if (AUGMENTOR_JOB_TYPES.has(type)) {
    counts.augmentorJobs += amount;
  }

  if (TECHNICIAN_JOB_TYPES.has(type)) {
    counts.technicianJobs += amount;
  }

  if (MINER_JOB_TYPES.has(type)) {
    counts.minerJobs += amount;
  }

  if (FARMER_JOB_TYPES.has(type)) {
    counts.farmerJobs += amount;
  }
}

function buildPopGroupInfoById(root: PdxObject): Map<string, PopGroupInfo> {
  const result = new Map<string, PopGroupInfo>();
  const popGroups = getObject(root, "pop_groups");

  if (!popGroups) {
    return result;
  }

  const mechanicalSpecies = mechanicalSpeciesIds(root);
  const speciesNames = speciesNamesById(root);

  for (const assignment of popGroups.assignments) {
    if (!isPdxObject(assignment.value)) {
      continue;
    }

    const key = getObject(assignment.value, "key");
    const category = getString(key, "category") ?? "";
    const speciesId = getString(key, "species") ?? "";

    result.set(assignment.key, {
      category,
      isRobot: isMechanicalPop(category, speciesId, mechanicalSpecies),
      speciesNames: speciesNames.get(speciesId) ?? [],
    });
  }

  return result;
}

function speciesNamesById(root: PdxObject): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const speciesDb = getObject(root, "species_db");

  if (!speciesDb) {
    return result;
  }

  for (const assignment of speciesDb.assignments) {
    if (!isPdxObject(assignment.value)) {
      continue;
    }

    const species = assignment.value;
    const names = [
      resolveName(getFirst(species, "name")),
      resolveName(getFirst(species, "plural")),
      resolveName(getFirst(species, "adjective")),
      getString(species, "name_data") ?? "",
    ].filter((name) => name.length > 0);

    result.set(assignment.key, names);
  }

  return result;
}

function addWorkerBreakdown(
  counts: PopJobOccupancyCounts,
  assignments: readonly OccupiedPopAssignment[],
  popGroupsById: ReadonlyMap<string, PopGroupInfo>,
): void {
  for (const assignment of assignments) {
    const popGroup = popGroupsById.get(assignment.popGroupId);

    if (!popGroup) {
      continue;
    }

    if (popGroup.isRobot) {
      counts.robotWorkers += assignment.amount;
    } else if (isCitizenPopCategory(popGroup.category)) {
      counts.citizenWorkers += assignment.amount;
    }

    if (matchesSpeciesName(popGroup.speciesNames, "mitron")) {
      counts.mitronWorkers += assignment.amount;
    }

    if (matchesSpeciesName(popGroup.speciesNames, "kelsiote")) {
      counts.kelsioteWorkers += assignment.amount;
    }
  }
}

function occupiedPopAssignments(job: PdxObject): OccupiedPopAssignment[] {
  const popGroups = getObject(job, "pop_groups");
  const result: OccupiedPopAssignment[] = [];

  for (const value of popGroups?.values ?? []) {
    if (!isPdxObject(value)) {
      continue;
    }

    const amount = numberFromField(value, "amount");

    if (amount > 0) {
      result.push({
        popGroupId: getString(value, "pop_group") ?? "",
        amount,
      });
    }
  }

  return result;
}

function occupiedPopAmount(job: PdxObject): number {
  const amount = occupiedPopAssignments(job).reduce((total, assignment) => total + assignment.amount, 0);

  if (amount > 0) {
    return amount;
  }

  return Math.max(0, Math.round(numberFromField(job, "workforce")));
}

function matchesSpeciesName(names: readonly string[], expected: string): boolean {
  const normalizedExpected = expected.toLocaleLowerCase();
  return names.some((name) => name.toLocaleLowerCase().includes(normalizedExpected));
}

interface JobCounts {
  ruler: number;
  specialist: number;
  worker: number;
  researcher: number;
  unity: number;
  cgds: number;
  alloys: number;
  enforcer: number;
  medicalWorker: number;
  entertainer: number;
  roboticist: number;
  soldier: number;
  augmentor: number;
  technician: number;
  miner: number;
  farmer: number;
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

    const open = openJobSlots(job);

    if (open <= 0) {
      continue;
    }

    const counts = result.get(planetId) ?? emptyJobCounts();
    const type = getString(job, "type") ?? "";
    const category = jobCategory(type);

    if (category === "ruler") {
      counts.ruler += open;
    } else if (category === "specialist") {
      counts.specialist += open;
    } else if (category === "worker") {
      counts.worker += open;
    }

    addSpecificOpenJobs(counts, type, open);

    if (CGDS_JOB_TYPES.has(type)) {
      counts.cgds += open;
    }

    if (ALLOY_JOB_TYPES.has(type)) {
      counts.alloys += open;
    }

    result.set(planetId, counts);
  }

  return result;
}

function emptyJobCounts(): JobCounts {
  return {
    ruler: 0,
    specialist: 0,
    worker: 0,
    researcher: 0,
    unity: 0,
    cgds: 0,
    alloys: 0,
    enforcer: 0,
    medicalWorker: 0,
    entertainer: 0,
    roboticist: 0,
    soldier: 0,
    augmentor: 0,
    technician: 0,
    miner: 0,
    farmer: 0,
  };
}

function addSpecificOpenJobs(counts: JobCounts, type: string, open: number): void {
  if (RESEARCHER_JOB_TYPES.has(type)) {
    counts.researcher += open;
  }

  if (UNITY_JOB_TYPES.has(type)) {
    counts.unity += open;
  }

  if (ENFORCER_JOB_TYPES.has(type)) {
    counts.enforcer += open;
  }

  if (MEDICAL_WORKER_JOB_TYPES.has(type)) {
    counts.medicalWorker += open;
  }

  if (ENTERTAINER_JOB_TYPES.has(type)) {
    counts.entertainer += open;
  }

  if (ROBOTICIST_JOB_TYPES.has(type)) {
    counts.roboticist += open;
  }

  if (SOLDIER_JOB_TYPES.has(type)) {
    counts.soldier += open;
  }

  if (AUGMENTOR_JOB_TYPES.has(type)) {
    counts.augmentor += open;
  }

  if (TECHNICIAN_JOB_TYPES.has(type)) {
    counts.technician += open;
  }

  if (MINER_JOB_TYPES.has(type)) {
    counts.miner += open;
  }

  if (FARMER_JOB_TYPES.has(type)) {
    counts.farmer += open;
  }
}

function openJobSlots(job: PdxObject): number {
  const workforce = numberFromField(job, "workforce");

  if (workforce < 0) {
    return 0;
  }

  const maxWorkforce = numberFromField(job, "max_workforce");

  if (maxWorkforce <= 0) {
    return 0;
  }

  return Math.max(0, Math.round(maxWorkforce - workforce));
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
  "operator",
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
  "archaeoengineers",
  "archaeo_engineer",
  "augmentor",
  "augmentation_drone",
  "numistic_priest",
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

const CGDS_JOB_TYPES = new Set<string>([
  "artisan",
]);

const ALLOY_JOB_TYPES = new Set<string>([
  "fabricator",
  "foundry",
  "manufactorium_specialist",
  "metallurgist",
  "operator",
]);

const RESEARCHER_JOB_TYPES = new Set<string>([
  "researcher",
  "physicist",
  "biologist",
  "engineer",
  "archaeoengineers",
  "archaeo_engineer",
  "calculator_physicist",
  "calculator_biologist",
  "calculator_engineer",
  "primitive_researcher",
]);

const UNITY_JOB_TYPES = new Set<string>([
  "bureaucrat",
  "numistic_priest",
]);

const ENFORCER_JOB_TYPES = new Set<string>([
  "enforcer",
]);

const MEDICAL_WORKER_JOB_TYPES = new Set<string>([
  "healthcare",
  "doctor",
]);

const ENTERTAINER_JOB_TYPES = new Set<string>([
  "entertainer",
]);

const ROBOTICIST_JOB_TYPES = new Set<string>([
  "roboticist",
  "replicator",
]);

const SOLDIER_JOB_TYPES = new Set<string>([
  "soldier",
  "warrior_drone",
]);

const AUGMENTOR_JOB_TYPES = new Set<string>([
  "augmentor",
  "augmentation_drone",
  "identity_designer",
]);

const TECHNICIAN_JOB_TYPES = new Set<string>([
  "technician",
  "technician_drone",
  "primitive_technician",
]);

const MINER_JOB_TYPES = new Set<string>([
  "miner",
  "mining_drone",
  "primitive_miner",
  "primitive_hive_miner",
]);

const FARMER_JOB_TYPES = new Set<string>([
  "farmer",
  "agri_drone",
  "hive_basic_agri_drone",
  "hive_basic_agri_drone_lithoid",
  "primitive_farmer",
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

function planetBuildings(planet: PdxObject, root: PdxObject): string[] {
  const result: string[] = [];

  for (const building of getAssignments(planet, "building")) {
    addBuildingValue(result, building);
  }

  for (const building of getAssignments(planet, "building_construction")) {
    addBuildingValue(result, building);
  }

  const buildings = getObject(planet, "buildings");

  if (buildings) {
    for (const value of buildings.values) {
      addBuildingValue(result, value);
    }

    for (const assignment of buildings.assignments) {
      addBuildingValue(result, assignment.value);
    }
  }

  const globalBuildings = getObject(root, "buildings");
  const buildingsCache = getObject(planet, "buildings_cache");

  if (globalBuildings && buildingsCache) {
    for (const value of buildingsCache.values) {
      if (typeof value !== "string") {
        continue;
      }

      addBuildingValue(result, getObject(globalBuildings, value));
    }
  }

  return result;
}

function addBuildingValue(result: string[], value: PdxValue | undefined): void {
  if (typeof value === "string") {
    result.push(value);
    return;
  }

  if (!isPdxObject(value)) {
    return;
  }

  const type = getString(value, "type") ?? getString(value, "building");

  if (type) {
    result.push(type);
  }
}

function hasBuilding(buildings: readonly string[], expected: ReadonlySet<string>): boolean {
  return buildings.some((building) => expected.has(building));
}

function countBuildings(buildings: readonly string[], expected: ReadonlySet<string>): number | "" {
  const count = buildings.reduce((total, building) => total + (expected.has(building) ? 1 : 0), 0);
  return count > 0 ? count : "";
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
