import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";
import { CSV_COLUMNS, analyzeGamestate, analyzeSaveFile, rowsToCsv } from "../src/saveAnalyzer.js";

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
      pop_groups={ 1001 1002 }
      num_sapient_pops=200
      stability=72.5
      crime=4
      amenities=500
      amenities_usage=400
      free_amenities=100
    }
    11={
      name={ key="Mars" literal=yes }
      planet_class="pc_gaia"
      planet_size=12
      owner=0
      pop_groups={ 1003 }
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
      pop_groups={ 1004 }
      num_sapient_pops=80
      stability=60
      free_amenities=10
    }
  }
}
pop_groups={
  1001={ planet=10 size=120 happiness=0.8 }
  1002={ planet=10 size=80 happiness=0.6 }
  1003={ planet=11 size=50 happiness=0.9 }
  1004={ planet=50 size=80 happiness=0.5 }
}
pop_jobs={
  1={ type="farmer" planet=10 workforce=80 max_workforce=100 bonus_workforce=10 workforce_limit=100 }
  2={ type="researcher" planet=10 workforce=20 max_workforce=30 bonus_workforce=1 workforce_limit=30 }
  3={ type="bureaucrat" planet=10 workforce=10 max_workforce=10 bonus_workforce=1 workforce_limit=10 }
  4={ type="civilian" planet=10 workforce=-1 max_workforce=-1 bonus_workforce=1 workforce_limit=-1 }
  5={ type="miner" planet=11 workforce=15 max_workforce=20 bonus_workforce=1 workforce_limit=20 }
  6={ type="entertainer" planet=11 workforce=5 max_workforce=12 bonus_workforce=1 workforce_limit=12 }
  7={ type="farmer" planet=50 workforce=10 max_workforce=15 bonus_workforce=1 workforce_limit=15 }
  8={ type="politician" planet=10 workforce=2 max_workforce=5 bonus_workforce=1 workforce_limit=5 }
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
  // weighted happiness = (120 * 0.8 + 80 * 0.6) / 200 = 0.72 -> 72
  assert.equal(earth.happiness, 72);
  assert.equal(earth.amenities, 100);
  // Ruler jobs: politician 5-2=3; specialist/worker unchanged
  assert.equal(earth.available_ruler_jobs, 3);
  assert.equal(earth.available_specialist_jobs, 10);
  assert.equal(earth.available_worker_jobs, 20);
});

test("renders a CSV with the expected header and number of rows", () => {
  const analysis = analyzeGamestate(GAMESTATE, "2273.06.16.sav");
  const csv = rowsToCsv(analysis.rows);
  const lines = csv.replace(/^\uFEFF/, "").trim().split("\r\n");

  assert.equal(lines[0], CSV_COLUMNS.join(","));
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

test("analyzeSaveFile rejects directories", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stellaris-save-analyzer-dir-"));

  try {
    await assert.rejects(() => analyzeSaveFile(directory), /single \.sav file/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
