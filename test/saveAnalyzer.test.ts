import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";
import { analyzeGamestate, analyzeInput, rowsToCsv } from "../src/saveAnalyzer.js";

const GAMESTATE = `
date="2273.06.16"
country={
  0={
    name="Imperium of Man"
    type=default
    authority=auth_dictatorial
    government=gov_military_dictatorship
    resources={
      energy={ amount=123.456 }
      minerals=45
      alloys={ amount=7 }
    }
    owned_planets={ 10 11 }
    owned_systems={ 20 }
  }
}
planets={
  10={ owner=0 pop={ species=1 } pop={ species=2 } }
  11={ owner=0 pops={ 1 2 3 } }
}
fleet={
  100={ owner=0 military_power=1234.5 }
}
`;

test("analyzes empire rows from gamestate text", () => {
  const rows = analyzeGamestate(GAMESTATE, "2273.06.16.sav");

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.game_date, "2273.06.16");
  assert.equal(rows[0]?.empire_name, "Imperium of Man");
  assert.equal(rows[0]?.colonies, 2);
  assert.equal(rows[0]?.owned_systems, 1);
  assert.equal(rows[0]?.pops, 5);
  assert.equal(rows[0]?.fleets, 1);
  assert.equal(rows[0]?.fleet_power, 1234.5);
  assert.equal(rows[0]?.energy, 123.46);
  assert.equal(rows[0]?.minerals, 45);
});

test("reads zipped .sav files and emits Excel-friendly CSV", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stellaris-save-analyzer-"));

  try {
    const campaignDirectory = path.join(directory, "imperiumofman2_1094588472");
    const savePath = path.join(campaignDirectory, "2273.06.16.sav");
    const zip = new JSZip();

    await mkdir(campaignDirectory);
    zip.file("gamestate", GAMESTATE);
    await writeFile(savePath, await zip.generateAsync({ type: "nodebuffer" }));

    const result = await analyzeInput(directory);
    const csv = rowsToCsv(result.rows);

    assert.equal(result.analyzedFiles.length, 1);
    assert.equal(result.rows.length, 1);
    assert.ok(csv.startsWith("\uFEFFsave_file,save_name,game_date"));
    assert.match(csv, /Imperium of Man/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
