#!/usr/bin/env node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeSaveFile, rowsToCsv } from "./saveAnalyzer.js";

export const DEFAULT_SAVE_GAMES_DIR = path.join(
  os.homedir(),
  "OneDrive",
  "Documents",
  "Paradox Interactive",
  "Stellaris",
  "save games",
);

interface CliOptions {
  inputPath?: string;
  outputPath?: string;
  includeBom: boolean;
  help: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  const inputPath = options.inputPath ?? await findNewestSaveFile(DEFAULT_SAVE_GAMES_DIR);
  const stat = await fs.stat(inputPath);

  if (stat.isDirectory()) {
    throw new Error(
      `${inputPath} is a directory. This tool only analyzes one .sav file at a time.`,
    );
  }

  const outputPath = options.outputPath ?? defaultOutputPath(inputPath);
  const analysis = await analyzeSaveFile(inputPath);
  const csv = rowsToCsv(analysis.rows, undefined, options.includeBom);

  await fs.writeFile(outputPath, csv, "utf8");

  console.log(`Save: ${analysis.save_name}`);
  console.log(`Date: ${analysis.game_date}`);
  console.log(`Player empire: ${analysis.empire_name || "(unnamed)"} (country ${analysis.player_country_id})`);
  console.log(`Wrote ${analysis.rows.length} planet row(s) to ${outputPath}.`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    includeBom: true,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;

    switch (arg) {
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "-o":
      case "--output":
        options.outputPath = requireValue(args, (index += 1), arg);
        break;
      case "--no-bom":
        options.includeBom = false;
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option ${arg}`);
        }

        if (options.inputPath) {
          throw new Error(`Unexpected extra argument ${arg}. Only one .sav file may be analyzed at a time.`);
        }

        options.inputPath = arg;
        break;
    }
  }

  return options;
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index];

  if (!value) {
    throw new Error(`${option} requires a value`);
  }

  return value;
}

function defaultOutputPath(inputPath: string): string {
  return `${path.basename(inputPath, path.extname(inputPath))}.csv`;
}

export async function findNewestSaveFile(saveGamesDirectory: string): Promise<string> {
  let newest: { path: string; mtimeMs: number } | undefined;

  async function visit(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }

      if (!entry.isFile() || path.extname(entry.name).toLocaleLowerCase() !== ".sav") {
        continue;
      }

      const stat = await fs.stat(entryPath);

      if (!newest || stat.mtimeMs > newest.mtimeMs) {
        newest = { path: entryPath, mtimeMs: stat.mtimeMs };
      }
    }
  }

  await visit(saveGamesDirectory);

  if (!newest) {
    throw new Error(`No .sav files found in ${saveGamesDirectory}`);
  }

  return newest.path;
}

function printUsage(): void {
  console.log(`Stellaris Save Analyzer

Usage:
  stellaris-save-analyzer [save-file] [options]

Analyzes a single Stellaris .sav file and writes one CSV row per colonized
planet owned by the player's empire. If no save file is provided, analyzes the
newest .sav under:
  ${DEFAULT_SAVE_GAMES_DIR}

Options:
  -o, --output <file>          CSV file to write. Defaults to <save-name>.csv.
  --no-bom                     Do not prefix the CSV with a UTF-8 BOM for Excel.
  -h, --help                   Show this help.

Example:
  stellaris-save-analyzer "C:\\Users\\spawa\\OneDrive\\Documents\\Paradox Interactive\\Stellaris\\save games\\imperiumofman2_1094588472\\2273.06.16.sav"
`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
