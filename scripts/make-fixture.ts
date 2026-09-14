/**
 * Builds an anonymised regression fixture from a real PDF.
 *
 *   npx tsx scripts/make-fixture.ts <file.pdf> <name>
 *
 * Writes src/__fixtures__/<name>.json with the reconstructed lines (patient,
 * doctors, document numbers and signatures replaced) plus the expected output
 * of the current pipeline. Review the JSON before committing it.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { readPdfLines } from './lib';
import type { PageLines } from '../src/pdf/extract';
import { LAYOUTS } from '../src/parser/layouts';
import { expectedFor, type Fixture } from '../src/fixtures';

// Applied in order to every line. Lines whose whole content is replaced, and inline substitutions.
const REPLACEMENTS: [RegExp, string][] = [
  [/^Nome\s*:.*/, 'Nome :PACIENTE ANONIMO'],
  [/^Cliente:.*?(?=Prescrição|$)/, 'Cliente: PACIENTE ANONIMO '],
  [/^.+?\s+CPF:.*?(?=FAP:|$)/, 'PACIENTE ANONIMO CPF: 000.000.000-00 '],
  [/^(Médico|Solicitante)\s*:.*?(?=\s+(Atendimento|Abertura)|$)/, '$1: MEDICO ANONIMO'],
  [/^DN\s*:\s*\d{2}\/\d{2}\/\d{4}/, 'DN :01/01/1950'],
  [/DN:\s*\d{2}\/\d{2}\/\d{4}\s*\|\s*\d+ anos e \d+ meses/, 'DN: 01/01/1950 | 70 anos e 0 meses'],
  [/^Data de Nascimento:\s*\S+/, 'Data de Nascimento: 01/01/1950'],
  [/RG\s*:\s*\d+(\s+SSP\/\w+)?/, 'RG :000000$1'],
  [/CPF\s*:\s*[\d.-]+/, 'CPF :000.000.000-00'],
  [/FAP:\s*[\d.]+/g, 'FAP: 0000.0000.0000'],
  [/\b\d{4}\.\d{4}\.\d{4}\b/g, '0000.0000.0000'],
  [/^Prontuário:.*/, 'Prontuário: 0000000 CIP: 0000000000'],
  [/^Atendimento:.*/, 'Atendimento: Sexo: X 000000000000'],
  [/Código da OS\s*:\s*[\d-]+/, 'Código da OS : 000-00000-0000'],
  [/^Convênio\s*:\s*[^:]*?(?=\s+Qnt|$)/, 'Convênio:CONVENIO ANONIMO'],
  [/^Unidade\s*:.*?(?=Página|$)/, 'Unidade :UNIDADE ANONIMA '],
  [/^Endereço da Unidade:.*/, 'Endereço da Unidade: ENDERECO ANONIMO'],
  [/^Responsável( Técnico)?:.*/, 'Responsável$1: RT ANONIMO - CRM-XX 00000'],
  [/LIBERADO ELETRONICAMENTE POR .*/, 'LIBERADO ELETRONICAMENTE POR DR. ANONIMO CRF 0000'],
  [/^Assinado eletronicamente por:?.*/, 'Assinado eletronicamente por: ANONIMO (01/01/2026 00:00 BRT)'],
  [/^Sob a responsabilidade.*/, 'Sob a responsabilidade do Dr. ANONIMO'],
  [/^.*CRM nº.*/, 'ANONIMO - CRM nº 000000 Token:XXXX'],
  [/^Dr .* CRM-\w+ \d+ - PG/, 'Dr ANONIMO CRM-XX 00000 - PG'],
  [/^Hash:.*/, 'Hash: 0'],
  [/^[0-9A-Fa-f]{40,}$/, '0'.repeat(64)],
  [/\b\d{3}-\d{5}(-\d+)?/g, '000-00000-0000'],
  [/^\d{5}(?=$|\s\d{2}\/\d{2}\/\d{4})/, '00000'], // OS tail wrapped onto the next line of the comparative table
  [/^\d{10}$/, '0000000000'],
];

const DOCTOR_LINE = /^(Médico|Solicitante)\s*:/;
const DOCTOR_NAME = /^(?:Médico|Solicitante)\s*:\s*(?:Dr\(a\)\s*)?([A-Za-zÀ-ÿ .'-]+?)(?=\s+-\s|\s+(?:Atendimento|Abertura)|$)/;

function collectNames(pages: PageLines[]): string[] {
  const patientRes = LAYOUTS.flatMap((l) => l.patient);
  const names = new Set<string>();
  for (const line of pages.flatMap((p) => p.lines)) {
    for (const re of [...patientRes, DOCTOR_NAME]) {
      const n = re.exec(line)?.[1]?.trim();
      if (n && n.length > 3) names.add(n);
    }
  }
  return [...names];
}

function anonymise(pages: PageLines[]): PageLines[] {
  const names = collectNames(pages);
  return pages.map((p) => {
    let afterDoctor = false;
    const lines = p.lines.map((line) => {
      // A doctor's surname wrapped onto its own line: no digits, a few words.
      let out = afterDoctor && !/\d/.test(line) && line.split(' ').length <= 4 ? 'ANONIMO' : line;
      afterDoctor = DOCTOR_LINE.test(line);
      for (const [re, rep] of REPLACEMENTS) out = out.replace(re, rep);
      for (const n of names) out = out.replace(new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), 'NOME ANONIMO');
      return out;
    });
    return { page: p.page, lines };
  });
}

async function main(file: string, name: string): Promise<void> {
  const pages = anonymise(await readPdfLines(file));
  const fixture: Fixture = { pages, expected: expectedFor(pages) };
  mkdirSync('src/__fixtures__', { recursive: true });
  const out = `src/__fixtures__/${name}.json`;
  writeFileSync(out, JSON.stringify(fixture, null, 1) + '\n');
  console.log(`wrote ${out}\n${fixture.expected.line}`);
}

const [, , file, name] = process.argv;
if (!file || !name || !/^[a-z0-9-]+$/.test(name)) {
  console.error('usage: make-fixture.ts <file.pdf> <name>   (name: lowercase letters, digits and dashes)');
  process.exit(1);
}
await main(file, name);
