# Stellaris Save Analyzer

TypeScript CLI for reading a Stellaris `.sav` file and exporting an Excel-ready CSV summary of the player empire's colonies.

Stellaris saves are zip archives. This tool opens a single `.sav`, reads the `gamestate` entry, parses Paradox script syntax, identifies the human player's empire, and writes one CSV row per colonized planet that the player owns.

## Install

```bash
npm install
npm run build
```

## Usage

Analyze latest save in `C:\Users\spawa\OneDrive\Documents\Paradox Interactive\Stellaris\save games\` and write out the analysis to `./save_analysis_<save_file_name>.sav`:

```bash
node dist/src/cli.js
```

Explicit arguments:

```bash
node dist/src/cli.js "C:\Users\spawa\OneDrive\Documents\Paradox Interactive\Stellaris\save games\imperiumofman2_1094588472\2273.06.17.sav" -o save_analysis.csv
```


## Options

```text
-o, --output <file>          CSV file to write. Defaults to <save-name>.csv.
--no-bom                     Do not prefix the CSV with a UTF-8 BOM for Excel.
-h, --help                   Show help.
```

The CSV uses commas, CRLF line endings, quoted fields where needed, and a UTF-8 BOM by default so Excel opens names and localized text more reliably.

## CSV columns

Each row is a planet owned by the player's empire. The capital is sorted first, then planets are grouped by sector name. CSV header cells use the alias values below.

Base planet info:

| Column | Alias | Description |
| --- | --- | --- |
| `planet_name` | planet_name | Planet name (localized when literal, otherwise the localization key) |
| `sector_name` | sector_name | Sector the planet's system belongs to, or empty |
| `planet_type` | planet_type | Planet class without the `pc_` prefix, capitalized (e.g. `Continental`, `Gaia`) |
| `planet_size` | planet_size | Planet size in tiles |

Planet health stats:

| Column | Alias | Description |
| --- | --- | --- |
| `stability` | stability | Planet stability (0-100) |
| `crime` | crime | Planet crime (0-100) |
| `amenities` | amenities | Net free amenities (supply minus usage) |

Building stats:

| Column | Alias | Description |
| --- | --- | --- |
| `precinct houses` | precinct houses | Number of precinct houses, or any of their upgrades, on the planet |
| `medical center` | medical center | 1 if the planet has a medical center or any of its upgrades, empty otherwise |
| `holo-theatres` | holo-theatres | Number of holo-theatres, or any of their upgrades, on the planet |
| `luxury residences` | luxury residences | Number of luxury residences on the planet |
| `clone vats` | clone vats | 1 if the planet has clone vats or any of its upgrades, empty otherwise |
| `robot assembly plant` | robot assembly plant | 1 if the planet has a robot assembly plant or any of its upgrades, empty otherwise |
| `augmentation center` | augmentation center | 1 if the planet has an augmentation center or any of its upgrades, empty otherwise |

Pop stats:

| Column | Alias | Description |
| --- | --- | --- |
| `total_population` | total_population | Number of sapient pops on the planet |
| `citizens` | citizens | Non-mechanical, non-slave pops in citizen categories |
| `slaves` | slaves | Pops in the slave category |
| `robots` | robots | Mechanical pops, based on robot categories or mechanical species |
| `citizen_workers` | citizen_W | Non-mechanical citizen pops currently assigned to worker-tier jobs |
| `mitron_workers` | mitron_W | Mitron pops currently assigned to worker-tier jobs |
| `kelsiote_workers` | kelsiote_W | Kelsiote pops currently assigned to worker-tier jobs |
| `robot_workers` | robot_W | Mechanical pops currently assigned to worker-tier jobs |
| `jobless` | jobless | Pops assigned to unemployment jobs |
| `civilians` | civilians | Pops assigned to the civilian job |

Ruler job stats:

| Column | Alias | Description |
| --- | --- | --- |
| `ruler_jobs` | ruler_J | Pops currently assigned to ruler-tier jobs |
| `free_ruler_jobs` | ruler_FJ | Unfilled workforce for ruler-tier jobs |

Specialist job stats, producers:

| Column | Alias | Description |
| --- | --- | --- |
| `specialist_jobs` | specialist_J | Pops currently assigned to specialist-tier jobs |
| `free_specialist_jobs` | specialist_FJ | Unfilled workforce for specialist-tier jobs |
| `researcher_jobs` | researcher_J | Pops currently assigned to researcher jobs: physicists, biologists, engineers, archaeo-engineers  |
| `free_researcher_jobs` | researcher_FJ | Unfilled workforce for researcher jobs |
| `unity_jobs` | unity_J | Pops currently assigned to unity jobs: bureaucrats, numistic priests |
| `free_unity_jobs` | unity_FJ | Unfilled workforce for unity jobs |
| `cgds_jobs` | cgds_J | Pops currently assigned to artisan jobs |
| `free_cgds_jobs` | cgds_FJ | Unfilled workforce for artisan jobs |
| `alloy_jobs` | alloy_J | Pops currently assigned to alloy-producing jobs |
| `free_alloy_jobs` | alloy_FJ | Unfilled workforce for alloy-producing jobs |

Specialist job stats, supporting:

| Column | Alias | Description |
| --- | --- | --- |
| `enforcer_jobs` | enforcer_J | Pops currently assigned to enforcer jobs |
| `free_enforcer_jobs` | enforcer_FJ | Unfilled workforce for enforcer jobs |
| `medical_worker_jobs` | medical_worker_J | Pops currently assigned to medical worker jobs |
| `free_medical_worker_jobs` | medical_worker_FJ | Unfilled workforce for medical worker jobs |
| `entertainer_jobs` | entertainer_J | Pops currently assigned to entertainer jobs |
| `free_entertainer_jobs` | entertainer_FJ | Unfilled workforce for entertainer jobs |
| `roboticist_jobs` | roboticist_J | Pops currently assigned to roboticist jobs |
| `free_roboticist_jobs` | roboticist_FJ | Unfilled workforce for roboticist jobs |
| `soldier_jobs` | soldier_J | Pops currently assigned to soldier jobs |
| `free_soldier_jobs` | soldier_FJ | Unfilled workforce for soldier jobs |
| `augmentor_jobs` | augmentor_J | Pops currently assigned to augmentor jobs |
| `free_augmentor_jobs` | augmentor_FJ | Unfilled workforce for augmentor jobs |

Worker job stats:

| Column | Alias | Description |
| --- | --- | --- |
| `worker_jobs` | worker_J | Pops currently assigned to worker-tier jobs |
| `free_worker_jobs` | worker_FJ | Unfilled workforce for worker-tier jobs |
| `technician_jobs` | technician_J | Pops currently assigned to technician jobs |
| `free_technician_jobs` | technician_FJ | Unfilled workforce for technician jobs |
| `miner_jobs` | miner_J | Pops currently assigned to miner jobs |
| `free_miner_jobs` | miner_FJ | Unfilled workforce for miner jobs |
| `farmer_jobs` | farmer_J | Pops currently assigned to farmer jobs |
| `free_farmer_jobs` | farmer_FJ | Unfilled workforce for farmer jobs |


## Development


Run in dev mode (first builds with `tsx`):

```bash
npm start -- "C:\Users\spawa\OneDrive\Documents\Paradox Interactive\Stellaris\save games\imperiumofman2_1094588472\2273.06.16.sav" -o save_analysis.csv
```

```bash
npm test
```
