import type { Measurement } from './types';

/** A line that parsed as "label [:] number(s)" and still has to be accepted by the layout. */
export interface RowCandidate {
  label: string;
  /** A colon separated label and value ("RESULTADO: 53"). */
  colon: boolean;
  values: Measurement[];
}

/**
 * Everything specific to how one laboratory prints its report. The parser in
 * labelValue.ts is mechanical: it only knows about lines, rows and titles, and
 * asks the layout every question that depends on the lab.
 */
export interface Layout {
  lab: string;
  /** Tested against the whole document text. */
  detect: RegExp;
  /** Surfaced on the report when this layout is a guess rather than a match. */
  warning?: string;
  /** Tried in order on every line; the first capture group is the patient name. */
  patient: RegExp[];
  /** Header, footer and history lines that must never become results. */
  skip: RegExp[];
  /** Pages dropped entirely (e.g. a comparative table that repeats every value). */
  skipPage?: RegExp;
  /** Whether a parsed row is a result rather than a reference bound or prose. */
  accepts: (row: RowCandidate) => boolean;
  /** Whether a non-row line starts a new exam, given the line that follows it. */
  isTitle: (line: string, next: string) => boolean;
  /** A line that closes the current exam, so later rows are not attributed to it. */
  endsExam?: RegExp;
}

function isUpperDominant(s: string): boolean {
  const upper = (s.match(/[A-ZÀ-Ú]/g) ?? []).length;
  const lower = (s.match(/[a-zà-ÿ]/g) ?? []).length;
  return upper > 0 && upper >= lower;
}

// Sabin prints an uppercase exam title, then "Método:"/"Material:" lines, then
// either "RESULTADO: valor" or an uppercase table (hemograma), then reference
// values on separate mixed-case lines, and closes with "Coleta: ... Liberação: ...".
// Accent-insensitive: some fonts come out of pdf.js as "Metodo".
const SABIN_META = /^(M[eé]todo|Material)\s*:/i;

export const SABIN: Layout = {
  lab: 'Sabin',
  // The patient header block: "Nome :" with "Código da OS" within the next few
  // lines. Anchored to the block so a partner-lab footer elsewhere in another
  // lab's report cannot trigger it.
  detect: /^Nome\s*:[^\n]*\n(?:[^\n]*\n){0,3}[^\n]*Código da OS/im,
  patient: [/^Nome\s*:\s*(.+?)\s*$/i],
  skipPage: /LAUDO COMPARATIVO/i,
  endsExam: /^Coleta\s*:/i,
  skip: [
    /^(Nome|DN|RG|CPF|Médico|Convênio|Unidade|Sexo)\s*:/i,
    /^(Responsável Técnico|Endereço da Unidade|Laborat[oó]rio registrado)/i,
    /Código da OS|Qnt de exames|Página\s*:|Atendimento\s*:/i,
    /^(Coleta|Liberação)\s*:/i,
    /LIBERADO ELETRONICAMENTE|ESTE EXAME FOI REALIZADO|CNES do respons|ASSINATURA DIGITAL/i,
    /^\*?COLETA DE MATERIAL/i,
    /^_{10,}$/,
    /^(Atenção|Nota|Fonte|Observação|OBS)\b/i,
    /^Valor(es)? (de )?[Rr]efer/i,
    /^Resultados? não apresentad/i,
    /^Horas de Jejum/i,
    SABIN_META,
    /^(Eritrograma|Leucograma|Série Plaquetária|Serie Plaquetaria)\b/i,
  ],
  // "RÓTULO: valor" may include lowercase (pH, RET-HE); bare table rows must be
  // strictly uppercase so a reference row like "Colesterol Total < 190" is ignored.
  accepts: ({ label, colon }) => (colon ? isUpperDominant(label) : !/[a-zà-ÿ]/.test(label)),
  isTitle: (line, next) =>
    line.length >= 3 &&
    !line.includes(':') &&
    isUpperDominant(line) &&
    (SABIN_META.test(next) || /^RESULTADO\s*:/.test(next)),
};

// DASA (Exame, Lavoisier, ...) prints a Title Case exam name, then "(Material: ...)"
// or a "RESULTADO INTERVALO DE REFERÊNCIA" header, then self-describing rows with
// the reference on the same line ("Creatinina 1,22 mg/dL 0,70 a 1,20 mg/dL"), and
// closes each exam with "Assinado eletronicamente por ...".
const DASA_AFTER_TITLE = /^\((Material|Método)\s*:|RESULTADO INTERVALO|^Série (Vermelha|Branca)/i;

export const DASA: Layout = {
  lab: 'DASA',
  // Word-bounded so an unrelated "Adasa"/"Cadasa" cannot select this layout.
  detect: /\bDASA\b|dasa\.com\.br/i,
  patient: [/^Cliente:\s*(.+?)\s*Prescrição/i, /^(.+?)\s+CPF\s*:/],
  endsExam: /^Assinado eletronicamente/i,
  skip: [
    /^(Cliente|Data de Nascimento|Médico|Solicitante|Prontuário|Atendimento|Local|Exame Resultado|Gênero)\b/i,
    /CPF:|FAP:|Token:/,
    /^Resultado\s/, // history rows: "Resultado 1,20 mg/dL 1,25 mg/dL ..."
    /^Data\s/, // history dates and "Data da Geração"
    /^(Assinado|Responsável|Hash|Pág\.|Fontes|Histórico|Nota|Referência|Observação|Legenda|Confirmado)\b/i,
    /^(Dentro do intervalo|Laborat[oó]rio registrado|Locais? de [Ee]xecução|- DASA|Sob a responsabilidade)/i,
  ],
  // Prose also ends in numbers ("acima de 18 anos"), so demand a real unit or a
  // %/absolute pair, and a label short enough not to be a sentence.
  accepts: ({ label, values }) => label.length <= 40 && (values.some((v) => v.unit) || values.length >= 2),
  // Titles matter for exams whose rows are not self-describing (gasometria: "pH").
  isTitle: (line, next) => line.length >= 3 && line.length <= 60 && !/\d|:/.test(line) && DASA_AFTER_TITLE.test(next),
};

export const LAYOUTS = [SABIN, DASA];

/** Best effort for a report nobody recognised: Sabin's rules are the most generic. */
export const UNKNOWN: Layout = {
  ...SABIN,
  lab: 'Desconhecido',
  warning: 'Laboratório não reconhecido; confira os itens extraídos.',
};
