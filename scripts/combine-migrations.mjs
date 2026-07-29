import fs from 'fs';
import path from 'path';

const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
const outputFile = path.join(process.cwd(), 'supabase', 'full_schema.sql');

const files = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

let combinedSql = `-- ========================================================\n`;
combinedSql += `-- WA DEPORTEX - Master Database Schema Migration Script\n`;
combinedSql += `-- Generated for Supabase deployment\n`;
combinedSql += `-- Total Migrations: ${files.length}\n`;
combinedSql += `-- ========================================================\n\n`;

for (const file of files) {
  const filePath = path.join(migrationsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  combinedSql += `-- --------------------------------------------------------\n`;
  combinedSql += `-- MIGRATION: ${file}\n`;
  combinedSql += `-- --------------------------------------------------------\n\n`;
  combinedSql += content.trim() + `\n\n`;
}

fs.writeFileSync(outputFile, combinedSql, 'utf8');
console.log(`Successfully generated ${outputFile} with ${files.length} migration files.`);
