# Stellaris Save Analyzer

TypeScript CLI for reading a Stellaris `.sav` file and exporting an Excel-ready CSV summary of the player empire's colonies.

Stellaris saves are zip archives. This tool opens a single `.sav`, reads the `gamestate` entry, parses Paradox script syntax, identifies the human player's empire, and writes one CSV row per colonized planet that the player owns.

## Install

```bash
npm install
npm run build
```

## Usage

The tool analyzes exactly one save at a time:

```bash
npm start -- "C:\Users\spawa\OneDrive\Documents\Paradox Interactive\Stellaris\save games\imperiumofman2_1094588472\2273.06.16.sav" -o stellaris.csv
```

After building, the compiled CLI can also be run directly:

```bash
node dist/src/cli.js "C:\Users\spawa\OneDrive\Documents\Paradox Interactive\Stellaris\save games\imperiumofman2_1094588472\2273.06.16.sav" -o stellaris.csv
```

If no `--output` is given, the CSV is written next to the working directory using the save's base name (e.g. `2273.06.16.csv`).

## Options

```text
-o, --output <file>          CSV file to write. Defaults to <save-name>.csv.
--no-bom                     Do not prefix the CSV with a UTF-8 BOM for Excel.
-h, --help                   Show help.
```

The CSV uses commas, CRLF line endings, quoted fields where needed, and a UTF-8 BOM by default so Excel opens names and localized text more reliably.

## CSV columns

Each row is a planet owned by the player's empire. The capital is sorted first, then planets are grouped by sector name.

| Column | Description |
| --- | --- |
| `planet_name` | Planet name (localized when literal, otherwise the localization key) |
| `sector_name` | Sector the planet's system belongs to, or empty |
| `planet_size` | Planet size in tiles |
| `planet_type` | Planet class without the `pc_` prefix, capitalized (e.g. `Continental`, `Gaia`) |
| `total_population` | Number of sapient pops on the planet |
| `jobless` | Pops assigned to unemployment jobs |
| `civilians` | Pops assigned to the civilian job |
| `citizens` | Non-mechanical, non-slave pops in citizen categories |
| `slaves` | Pops in the slave category |
| `robots` | Mechanical pops, based on robot categories or mechanical species |
| `rulers` | Pops currently assigned to ruler-tier jobs |
| `specialists` | Pops currently assigned to specialist-tier jobs |
| `workers` | Pops currently assigned to worker-tier jobs |
| `citizen_workers` | Non-mechanical citizen pops currently assigned to worker-tier jobs |
| `mitron_workers` | Mitron pops currently assigned to worker-tier jobs |
| `kelsiote_workers` | Kelsiote pops currently assigned to worker-tier jobs |
| `robot_workers` | Mechanical pops currently assigned to worker-tier jobs |
| `stability` | Planet stability (0-100) |
| `crime` | Planet crime (0-100) |
| `amenities` | Net free amenities (supply minus usage) |
| `consumer_good_jobs` | Pops currently assigned to artisan jobs |
| `free_consumer_goods_jobs` | Unfilled workforce for artisan jobs |
| `alloy_jobs` | Pops currently assigned to alloy-producing jobs |
| `free_alloy_jobs` | Unfilled workforce for alloy-producing jobs |
| `free_ruler_jobs` | Unfilled workforce for ruler-tier jobs |
| `free_specialist_jobs` | Unfilled workforce for specialist-tier jobs |
| `free_worker_jobs` | Unfilled workforce for worker-tier jobs |

## Development

```bash
npm test
```
