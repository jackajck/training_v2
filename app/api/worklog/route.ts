import { NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import path from 'path';

interface WorklogEntry {
  date: string;
  title: string;
  description: string;
  type: 'feature' | 'fix' | 'improvement';
}

function parseMarkdown(content: string, filename: string): WorklogEntry[] {
  const entries: WorklogEntry[] = [];
  const date = filename.replace('.md', '');

  // Split by ## headers (entries)
  const sections = content.split(/^## /m).filter(s => s.trim());

  for (const section of sections) {
    // Skip the main header (# Worklog - ...)
    if (section.startsWith('# ') || section.startsWith('Worklog')) continue;

    const lines = section.trim().split('\n');
    const title = lines[0]?.trim() || '';

    if (!title) continue;

    // Find type
    let type: 'feature' | 'fix' | 'improvement' = 'feature';
    const typeMatch = section.match(/\*\*Type:\*\*\s*(Feature|Bug Fix|Improvement|Fix)/i);
    if (typeMatch) {
      const typeStr = typeMatch[1].toLowerCase();
      if (typeStr === 'bug fix' || typeStr === 'fix') type = 'fix';
      else if (typeStr === 'improvement') type = 'improvement';
      else type = 'feature';
    }

    // Get description - first paragraph after the type line
    let description = '';
    let foundType = false;
    for (const line of lines.slice(1)) {
      if (line.includes('**Type:**')) {
        foundType = true;
        continue;
      }
      if (foundType && line.trim() && !line.startsWith('#') && !line.startsWith('---') && !line.startsWith('-')) {
        description = line.trim();
        break;
      }
    }

    if (title && description) {
      entries.push({ date, title, description, type });
    }
  }

  return entries;
}

export async function GET() {
  try {
    const worklogDir = path.join(process.cwd(), 'docs', 'worklog');
    const files = await readdir(worklogDir);

    const mdFiles = files
      .filter(f => f.endsWith('.md'))
      .sort((a, b) => b.localeCompare(a)); // Sort newest first

    const allEntries: WorklogEntry[] = [];

    for (const file of mdFiles) {
      const content = await readFile(path.join(worklogDir, file), 'utf-8');
      const entries = parseMarkdown(content, file);
      allEntries.push(...entries);
    }

    return NextResponse.json({ entries: allEntries });
  } catch (error) {
    console.error('Error reading worklog:', error);
    return NextResponse.json({ entries: [], error: 'Failed to load worklog' }, { status: 500 });
  }
}
