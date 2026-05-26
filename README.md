# Stellaris Save Analyzer

TypeScript CLI for reading Stellaris `.sav` files and exporting an Excel-ready CSV summary.

Stellaris saves are zip archives. This tool opens each `.sav`, reads the `gamestate` entry, parses Paradox script syntax, and writes one CSV row per country/empire with common analysis columns such as date, empire name, colonies, systems, pops, fleets, fleet power, and stockpiled resources.

## Install

```bash
npm install
npm run build
```

## Usage

Analyze a single save:

```bash
npm start -- "C:\Users\spawa\OneDrive\Documents\Paradox Interactive\Stellaris\save games\imperiumofman2_1094588472\2273.06.16.sav" -o stellaris.csv
```

Analyze all saves under Stellaris' save directory:

```bash
npm start -- "C:\Users\spawa\OneDrive\Documents\Paradox Interactive\Stellaris\save games" -o stellaris.csv
```

After building, the compiled CLI can also be run directly:

```bash
node dist/src/cli.js "C:\Users\spawa\OneDrive\Documents\Paradox Interactive\Stellaris\save games" -o stellaris.csv
```

The directory mode is recursive by default because Stellaris stores saves inside campaign subdirectories.

## Options

```text
-o, --output <file>          CSV file to write. Defaults to the current directory.
--recursive                 Search directories recursively for .sav files (default).
--no-recursive              Only read .sav files directly inside the input directory.
--include-all-countries     Include event/internal countries that would otherwise be skipped.
--no-bom                    Do not prefix the CSV with a UTF-8 BOM for Excel.
-h, --help                  Show help.
```

The CSV uses commas, CRLF line endings, quoted fields where needed, and a UTF-8 BOM by default so Excel opens names and localized text more reliably.

## CSV columns

- Save metadata: `save_file`, `save_name`, `game_date`
- Empire metadata: `country_id`, `empire_name`, `country_type`, `authority`, `government`, `capital_id`
- Counts: `colonies`, `owned_systems`, `pops`, `fleets`, `fleet_power`
- Resources: `energy`, `minerals`, `food`, `alloys`, `consumer_goods`, `unity`, `influence`, `minor_artifacts`, `volatile_motes`, `exotic_gases`, `rare_crystals`, `dark_matter`, `living_metal`, `zro`, `nanites`

## Development

```bash
npm test
```
