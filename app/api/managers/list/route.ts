import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET() {
  try {
    // Read the Managers.txt file
    const filePath = path.join(process.cwd(), 'Managers.txt');
    const fileContent = await readFile(filePath, 'utf-8');

    // Parse the file - skip first 4 lines (header), then extract names
    const lines = fileContent.split('\n');
    const managers: string[] = [];

    for (let i = 4; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        // Extract the name part before the email (tab-separated)
        const parts = line.split('\t');
        if (parts.length > 0) {
          // Remove the "(Divested, USA)" or similar suffix
          const name = parts[0].replace(/\s*\([^)]*\)\s*$/, '').trim();
          if (name) {
            managers.push(name);
          }
        }
      }
    }

    return NextResponse.json({ managers });
  } catch (error) {
    console.error('Error reading managers file:', error);
    return NextResponse.json({ error: 'Failed to load managers' }, { status: 500 });
  }
}
