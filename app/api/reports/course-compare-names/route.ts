import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { readFile } from 'fs/promises';
import path from 'path';

// Parse CSV and extract unique names
function parseCSVForNames(content: string): string[] {
  const names = new Set<string>();

  // Remove BOM if present and normalize line endings
  const cleanContent = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const lines = cleanContent.split('\n');

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Skip summary rows
    if (line.includes('Overall Requirement Summary')) continue;

    // Parse CSV with quoted fields - extract just the name (second field)
    let current = '';
    let inQuotes = false;
    let fieldIndex = 0;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        if (fieldIndex === 1) {
          // This is the Associate field
          const name = current.trim().replace(/"/g, '');
          if (name) names.add(name);
          break;
        }
        fieldIndex++;
        current = '';
      } else {
        current += char;
      }
    }

    // Handle case where name is last field we reach
    if (fieldIndex === 1) {
      const name = current.trim().replace(/"/g, '');
      if (name) names.add(name);
    }
  }

  return Array.from(names).sort();
}

export async function GET() {
  try {
    // Check authentication
    const cookieStore = await cookies();
    const authCookie = cookieStore.get('auth');

    if (!authCookie || authCookie.value !== 'authenticated') {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Read CSV file
    const csvPath = path.join(process.cwd(), 'course_compare.csv');
    const csvContent = await readFile(csvPath, 'utf-8');
    const names = parseCSVForNames(csvContent);

    return NextResponse.json({
      success: true,
      names,
      count: names.length
    });

  } catch (error) {
    console.error('Error reading names:', error);
    return NextResponse.json(
      { error: 'Failed to read names', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
