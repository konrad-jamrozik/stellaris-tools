import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";
import { findNewestSaveFile } from "../src/cli.js";
import { CSV_COLUMNS, analyzeGamestate, analyzeSaveFile, rowsToCsv } from "../src/saveAnalyzer.js";

const README_COLUMNS = [
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

const GAMESTATE = `
date="2273.06.16"
player={
  {
    name="player_one"
    country=0
  }
}
country={
  0={
    name={
      key="Imperium of Man"
      literal=yes
    }
    capital=10
    owned_planets={ 10 11 99 }
  }
  1={
    name={ key="Other Empire" literal=yes }
  }
}
sectors={
  5={
    name={ key="Core Sector" literal=yes }
    owner=0
  }
}
galactic_object={
  100={
    sector=5
    planet=10
    planet=11
    planet=99
  }
}
planets={
  planet={
    10={
      name={ key="Earth" literal=yes }
      planet_class="pc_continental"
      planet_size=18
      owner=0
      pop_groups={ 1001 1002 1003 1004 1005 1008 }
      num_sapient_pops=200
      stability=72.5
      crime=4
      amenities=500
      amenities_usage=400
      free_amenities=100
      buildings_cache={ 2001 2002 2003 2004 2005 2006 2007 2008 2009 }
    }
    11={
      name={ key="Mars" literal=yes }
      planet_class="pc_gaia"
      planet_size=12
      owner=0
      pop_groups={ 1006 }
      num_sapient_pops=50
      stability=55
      crime=2
      free_amenities=20
    }
    99={
      name={ key="Empty Moon" literal=yes }
      planet_class="pc_barren_cold"
      planet_size=8
      owner=0
    }
    50={
      name={ key="Foreign World" literal=yes }
      planet_class="pc_arid"
      planet_size=15
      owner=1
      pop_groups={ 1007 }
      num_sapient_pops=80
      stability=60
      free_amenities=10
    }
  }
}
species_db={
  1={
    class="HUM"
    traits={ trait="trait_organic" }
  }
  2={
    name={ key="SPEC_Mitron" }
    class="MAM"
    traits={ trait="trait_organic" }
  }
  3={
    class="ROBOT"
    traits={ trait="trait_mechanical" }
  }
  4={
    name={ key="SPEC_kelsiote" }
    class="MAM"
    traits={ trait="trait_organic" }
  }
}
pop_groups={
  1001={ planet=10 size=70 key={ species=1 category="specialist" } }
  1002={ planet=10 size=40 key={ species=2 category="slave" } }
  1003={ planet=10 size=30 key={ species=1 category="civilian" } }
  1004={ planet=10 size=30 key={ species=4 category="slave" } }
  1005={ planet=10 size=10 key={ species=3 category="worker" } }
  1006={ planet=11 size=50 key={ species=3 category="robot_servant" } }
  1007={ planet=50 size=80 key={ species=2 category="worker" } }
  1008={ planet=10 size=20 key={ species=1 category="worker" } }
}
buildings={
  2001={ type="building_medical_1" position=1 }
  2002={ type="building_clone_vats" position=2 }
  2003={ type="building_machine_assembly_complex" position=3 }
  2004={ type="building_augmentation_center" position=4 }
  2005={ type="building_luxury_residence" position=5 }
  2006={ type="building_paradise_dome" position=6 }
  2007={ type="building_hall_judgment" position=7 }
  2008={ type="building_holo_theatres" position=8 }
  2009={ type="building_hyper_entertainment_forum" position=9 }
}
pop_jobs={
  1={ type="farmer" planet=10 workforce=80 max_workforce=100 bonus_workforce=10 workforce_limit=100 pop_groups={ { pop_group=1008 amount=20 } { pop_group=1002 amount=40 } { pop_group=1004 amount=10 } { pop_group=1005 amount=10 } } }
  2={ type="researcher" planet=10 workforce=20 max_workforce=30 bonus_workforce=1 workforce_limit=30 pop_groups={ { pop_group=1001 amount=20 } } }
  3={ type="bureaucrat" planet=10 workforce=10 max_workforce=10 bonus_workforce=1 workforce_limit=10 pop_groups={ { pop_group=1001 amount=10 } } }
  4={ type="civilian" planet=10 workforce=29 max_workforce=-1 bonus_workforce=1 workforce_limit=-1 pop_groups={ { pop_group=1003 amount=30 } } }
  5={ type="miner" planet=11 workforce=15 max_workforce=20 bonus_workforce=1 workforce_limit=20 }
  6={ type="entertainer" planet=11 workforce=5 max_workforce=12 bonus_workforce=1 workforce_limit=12 }
  7={ type="farmer" planet=50 workforce=10 max_workforce=15 bonus_workforce=1 workforce_limit=15 }
  8={ type="politician" planet=10 workforce=2 max_workforce=5 bonus_workforce=1 workforce_limit=5 pop_groups={ { pop_group=1001 amount=2 } } }
  9={ type="worker_unemployment" planet=10 workforce=19 max_workforce=-1 bonus_workforce=1 workforce_limit=-1 pop_groups={ { pop_group=1004 amount=20 } } }
  10={ type="artisan" planet=10 workforce=12 max_workforce=20 bonus_workforce=1 workforce_limit=20 pop_groups={ { pop_group=1001 amount=12 } } }
  11={ type="foundry" planet=10 workforce=7 max_workforce=10 bonus_workforce=1 workforce_limit=10 pop_groups={ { pop_group=1001 amount=7 } } }
  12={ type="manufactorium_specialist" planet=10 workforce=3 max_workforce=5 bonus_workforce=1 workforce_limit=5 pop_groups={ { pop_group=1001 amount=3 } } }
  13={ type="enforcer" planet=10 workforce=4 max_workforce=6 bonus_workforce=1 workforce_limit=6 pop_groups={ { pop_group=1001 amount=4 } } }
  14={ type="healthcare" planet=10 workforce=5 max_workforce=8 bonus_workforce=1 workforce_limit=8 pop_groups={ { pop_group=1001 amount=5 } } }
  15={ type="roboticist" planet=10 workforce=6 max_workforce=9 bonus_workforce=1 workforce_limit=9 pop_groups={ { pop_group=1001 amount=6 } } }
  16={ type="soldier" planet=10 workforce=8 max_workforce=10 bonus_workforce=1 workforce_limit=10 pop_groups={ { pop_group=1008 amount=8 } } }
  17={ type="augmentor" planet=10 workforce=9 max_workforce=11 bonus_workforce=1 workforce_limit=11 pop_groups={ { pop_group=1001 amount=9 } } }
  18={ type="technician" planet=10 workforce=14 max_workforce=20 bonus_workforce=1 workforce_limit=20 pop_groups={ { pop_group=1008 amount=14 } } }
}
`;

test("emits one row per inhabited planet owned by the player", () => {
  const analysis = analyzeGamestate(GAMESTATE, "2273.06.16.sav");

  assert.equal(analysis.empire_name, "Imperium of Man");
  assert.equal(analysis.player_country_id, "0");
  assert.equal(analysis.game_date, "2273.06.16");
  assert.equal(analysis.rows.length, 2);
});

test("places the capital first and excludes uninhabited or foreign planets", () => {
  const analysis = analyzeGamestate(GAMESTATE, "2273.06.16.sav");

  assert.equal(analysis.rows[0]?.planet_name, "Earth");
  assert.equal(analysis.rows[1]?.planet_name, "Mars");
  assert.ok(!analysis.rows.some((row) => row.planet_name === "Empty Moon"));
  assert.ok(!analysis.rows.some((row) => row.planet_name === "Foreign World"));
});

test("computes per-planet stats correctly", () => {
  const analysis = analyzeGamestate(GAMESTATE, "2273.06.16.sav");
  const earth = analysis.rows.find((row) => row.planet_name === "Earth");

  assert.ok(earth);
  assert.equal(earth.sector_name, "Core Sector");
  assert.equal(earth.planet_size, 18);
  assert.equal(earth.planet_type, "Continental");
  assert.equal(earth.total_population, 200);
  assert.equal(earth.stability, 72.5);
  assert.equal(earth.crime, 4);
  assert.equal(earth.amenities, 100);
  assert.equal(earth["medical center"], 1);
  assert.equal(earth["clone vats"], 1);
  assert.equal(earth["robot assembly plant"], 1);
  assert.equal(earth["augmentation center"], 1);
  assert.equal(earth["holo-theatres"], 2);
  assert.equal(earth["luxury residences"], 2);
  assert.equal(earth["precinct houses"], 1);
  assert.equal(earth.jobless, 20);
  assert.equal(earth.civilians, 30);
  assert.equal(earth.citizens, 120);
  assert.equal(earth.slaves, 70);
  assert.equal(earth.robots, 10);
  assert.equal(earth.ruler_jobs, 2);
  assert.equal(earth.specialist_jobs, 76);
  assert.equal(earth.worker_jobs, 102);
  assert.equal(earth.citizen_workers, 42);
  assert.equal(earth.mitron_workers, 40);
  assert.equal(earth.kelsiote_workers, 10);
  assert.equal(earth.robot_workers, 10);
  assert.equal(earth.researcher_jobs, 20);
  assert.equal(earth.free_researcher_jobs, 10);
  assert.equal(earth.unity_jobs, 10);
  assert.equal(earth.free_unity_jobs, 0);
  assert.equal(earth.cgds_jobs, 12);
  assert.equal(earth.free_cgds_jobs, 8);
  assert.equal(earth.alloy_jobs, 10);
  assert.equal(earth.free_alloy_jobs, 5);
  assert.equal(earth.enforcer_jobs, 4);
  assert.equal(earth.free_enforcer_jobs, 2);
  assert.equal(earth.medical_worker_jobs, 5);
  assert.equal(earth.free_medical_worker_jobs, 3);
  assert.equal(earth.roboticist_jobs, 6);
  assert.equal(earth.free_roboticist_jobs, 3);
  assert.equal(earth.soldier_jobs, 8);
  assert.equal(earth.free_soldier_jobs, 2);
  assert.equal(earth.augmentor_jobs, 9);
  assert.equal(earth.free_augmentor_jobs, 2);
  assert.equal(earth.technician_jobs, 14);
  assert.equal(earth.free_technician_jobs, 6);
  assert.equal(earth.farmer_jobs, 80);
  assert.equal(earth.free_farmer_jobs, 20);
  // Free jobs are based on max workforce minus current workforce for each tier.
  assert.equal(earth.free_ruler_jobs, 3);
  assert.equal(earth.free_specialist_jobs, 33);
  assert.equal(earth.free_worker_jobs, 28);
});

test("leaves missing building columns empty", () => {
  const analysis = analyzeGamestate(GAMESTATE, "2273.06.16.sav");
  const mars = analysis.rows.find((row) => row.planet_name === "Mars");

  assert.ok(mars);
  assert.equal(mars["precinct houses"], "");
  assert.equal(mars["medical center"], "");
  assert.equal(mars["holo-theatres"], "");
  assert.equal(mars["luxury residences"], "");
  assert.equal(mars["clone vats"], "");
  assert.equal(mars["robot assembly plant"], "");
  assert.equal(mars["augmentation center"], "");
});

test("renders a CSV with the expected header and number of rows", () => {
  const analysis = analyzeGamestate(GAMESTATE, "2273.06.16.sav");
  const csv = rowsToCsv(analysis.rows);
  const lines = csv.replace(/^\uFEFF/, "").trim().split("\r\n");

  assert.deepEqual(CSV_COLUMNS, README_COLUMNS);
  assert.equal(lines[0], README_COLUMNS.join(","));
  assert.equal(lines.length, 1 + analysis.rows.length);
  assert.match(csv, /Earth/);
});

test("analyzeSaveFile reads a zipped gamestate", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stellaris-save-analyzer-"));

  try {
    const campaignDirectory = path.join(directory, "imperiumofman2_1094588472");
    const savePath = path.join(campaignDirectory, "2273.06.16.sav");
    const zip = new JSZip();

    await mkdir(campaignDirectory);
    zip.file("gamestate", GAMESTATE);
    await writeFile(savePath, await zip.generateAsync({ type: "nodebuffer" }));

    const analysis = await analyzeSaveFile(savePath);

    assert.equal(analysis.rows.length, 2);
    assert.equal(analysis.empire_name, "Imperium of Man");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("findNewestSaveFile returns the newest nested .sav", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stellaris-save-games-"));

  try {
    const olderCampaign = path.join(directory, "older_campaign");
    const newerCampaign = path.join(directory, "newer_campaign");
    const olderSave = path.join(olderCampaign, "2273.06.16.sav");
    const newerSave = path.join(newerCampaign, "2273.06.17.sav");
    const ignoredText = path.join(newerCampaign, "notes.txt");

    await mkdir(olderCampaign);
    await mkdir(newerCampaign);
    await writeFile(olderSave, "older");
    await writeFile(newerSave, "newer");
    await writeFile(ignoredText, "not a save");

    await utimes(olderSave, new Date("2024-01-01T00:00:00Z"), new Date("2024-01-01T00:00:00Z"));
    await utimes(newerSave, new Date("2024-01-02T00:00:00Z"), new Date("2024-01-02T00:00:00Z"));

    assert.equal(await findNewestSaveFile(directory), newerSave);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("analyzeSaveFile rejects directories", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stellaris-save-analyzer-dir-"));

  try {
    await assert.rejects(() => analyzeSaveFile(directory), /single \.sav file/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
