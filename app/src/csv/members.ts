import type { AppData, Gender, Member } from "../models";
import { newId } from "../models";

export interface MemberCsvRow {
  rowNumber: number;
  name: string;
  gender: Gender | null;
  genderRaw: string;
  existingMemberId: string | null;
  duplicateInFile: boolean;
  errors: string[];
}

export interface MemberCsvParseResult {
  rows: MemberCsvRow[];
  errors: string[];
}

export interface MemberCsvImportResult {
  created: number;
  updated: number;
  skipped: number;
}

export function decodeCsvBytes(bytes: Uint8Array): string {
  const body =
    bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
      ? bytes.slice(3)
      : bytes;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return new TextDecoder("shift_jis").decode(body);
  }
}

export function parseMemberCsv(text: string, data: AppData): MemberCsvParseResult {
  const records = parseCsvRecords(text);
  if (records.length === 0) return { rows: [], errors: ["CSVに行がありません"] };

  const header = records[0].map(normalizeHeader);
  const nameIndex = header.indexOf("氏名");
  const genderIndex = header.indexOf("性別");
  const errors: string[] = [];
  if (nameIndex < 0) errors.push("ヘッダーに「氏名」列がありません");
  if (genderIndex < 0) errors.push("ヘッダーに「性別」列がありません");
  if (errors.length > 0) return { rows: [], errors };

  const seenNames = new Set<string>();
  const rows = records.slice(1).flatMap((record, i): MemberCsvRow[] => {
    const rowNumber = i + 2;
    const name = (record[nameIndex] ?? "").trim();
    const genderRaw = (record[genderIndex] ?? "").trim();
    if (!name && !genderRaw && record.every((cell) => !cell.trim())) return [];

    const rowErrors: string[] = [];
    if (!name) rowErrors.push("氏名が空です");
    const gender = parseGender(genderRaw);
    if (!gender) rowErrors.push("性別は「男」または「女」で入力してください");

    const duplicateInFile = name ? seenNames.has(name) : false;
    if (duplicateInFile) rowErrors.push("CSV内で氏名が重複しています");
    if (name) seenNames.add(name);

    return [{
      rowNumber,
      name,
      gender,
      genderRaw,
      existingMemberId: data.members.find((m) => m.name === name)?.id ?? null,
      duplicateInFile,
      errors: rowErrors,
    }];
  });

  return { rows, errors };
}

export function importMemberCsvRows(
  data: AppData,
  rows: MemberCsvRow[]
): MemberCsvImportResult {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.errors.length > 0 || !row.gender || !row.name) {
      skipped++;
      continue;
    }

    const existing = data.members.find((m) => m.name === row.name);
    if (existing) {
      existing.gender = row.gender;
      existing.status = "active";
      updated++;
      continue;
    }

    const member: Member = {
      id: newId("m"),
      name: row.name,
      gender: row.gender,
      status: "active",
      roleIds: [],
      roleGroupIds: [],
    };
    data.members.push(member);
    created++;
  }

  return { created, updated, skipped };
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").trim();
}

function parseGender(value: string): Gender | null {
  const v = value.trim().toLowerCase();
  if (v === "男" || v === "男性" || v === "m" || v === "male") return "M";
  if (v === "女" || v === "女性" || v === "f" || v === "female") return "F";
  return null;
}

function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === "\"") {
        if (text[i + 1] === "\"") {
          cell += "\"";
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === "\"") {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  row.push(cell);
  if (row.length > 1 || row[0].trim()) rows.push(row);
  return rows;
}
