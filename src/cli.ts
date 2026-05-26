#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { analyzeInput, rowsToCsv, type AnalyzerOptions } from "./saveAnalyzer.js";

interface CliOptions extends AnalyzerOptions {
  inputPath?: string;
  outputPath?: string;
  help?: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help || !options.inputPath) {
    printUsage();
    process.exit(options.help ? 0 : 1);
  }

  const outputPath = options.outputPath ?? (await defaultOutputPath(options.inputPath));
  const result = await analyzeInput(options.inputPath, options);
  const csv = rowsToCsv(result.rows, undefined, options.includeBom ?? true);

  await fs.writeFile(outputPath, csv, "utf8");

  for (const warning of result.warnings) {
    console.warn(`Warning: ${warning}`);
  }

  console.log(`Analyzed ${result.analyzedFiles.length} save file(s).`);
  console.log(`Wrote ${result.rows.length} row(s) to ${outputPath}.`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    recursive: true,
    includeAllCountries: false,
    includeBom: true,
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
      case "--recursive":
        options.recursive = true;
        break;
      case "--no-recursive":
        options.recursive = false;
        break;
      case "--include-all-countries":
        options.includeAllCountries = true;
        break;
      case "--no-bom":
        options.includeBom = false;
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option ${arg}`);
        }

        if (options.inputPath) {
          throw new Error(`Unexpected extra argument ${arg}`);
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

async function defaultOutputPath(inputPath: string): Promise<string> {
  const stat = await fs.stat(inputPath);

  if (stat.isFile()) {
    return `${path.basename(inputPath, path.extname(inputPath))}.csv`;
  }

  return "stellaris-save-analysis.csv";
}

function printUsage(): void {
  console.log(`Stellaris Save Analyzer

Usage:
  stellaris-save-analyzer <save-file-or-directory> [options]

Options:
  -o, --output <file>          CSV file to write. Defaults to the current directory.
  --recursive                 Search directories recursively for .sav files (default).
  --no-recursive              Only read .sav files directly inside the input directory.
  --include-all-countries     Include event/internal countries that would otherwise be skipped.
  --no-bom                    Do not prefix the CSV with a UTF-8 BOM for Excel.
  -h, --help                  Show this help.

Examples:
  stellaris-save-analyzer "C:\\Users\\spawa\\OneDrive\\Documents\\Paradox Interactive\\Stellaris\\save games" -o stellaris.csv
  stellaris-save-analyzer "C:\\Users\\spawa\\OneDrive\\Documents\\Paradox Interactive\\Stellaris\\save games\\imperiumofman2_1094588472\\2273.06.16.sav"
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
