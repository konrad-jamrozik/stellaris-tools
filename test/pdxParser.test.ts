import assert from "node:assert/strict";
import test from "node:test";
import { getAssignments, getObject, getString, parsePdx } from "../src/pdxParser.js";

test("parses assignments, arrays, comments, and repeated keys", () => {
  const root = parsePdx(`
    # Stellaris saves use Paradox script syntax.
    date="2273.06.16"
    country={
      0={
        name="Imperium of Man"
        owned_planets={ 10 11 }
        pop={ species=1 }
        pop={ species=2 }
      }
    }
  `);

  assert.equal(getString(root, "date"), "2273.06.16");

  const countries = getObject(root, "country");
  const country = getObject(countries, "0");

  assert.equal(getString(country, "name"), "Imperium of Man");
  assert.deepEqual(getObject(country, "owned_planets")?.values, ["10", "11"]);
  assert.equal(getAssignments(country, "pop").length, 2);
});
