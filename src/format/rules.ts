import type { ExamItem, Measurement } from '../parser/types';

export interface Rule {
  /** Short name the doctor pastes into the report ("Hb", "Cr"). Position in RULES is the output order. */
  abbr: string;
  /** Matched against the normalised name (label, or exam title for "RESULTADO" rows) and exam. */
  match: (name: string, exam: string) => boolean;
  /** Hidden unless the user asks for the full line. */
  optional?: boolean;
  /** Which measurement of the row to print; defaults to the first. Returning undefined drops the item. */
  pick?: (values: Measurement[]) => Measurement | undefined;
  /** Appended to the value ("%" for percentages). */
  suffix?: string;
  /** Group prefix emitted once before the first item of the group ("GSV"). */
  group?: (item: ExamItem) => string;
}

/** Uppercase, strip accents, dots and duplicate spaces. */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[.:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Name of an item: its label, or the exam title when the label is just "RESULTADO". */
export function itemName(item: ExamItem): string {
  return /^RESULTADO$/i.test(item.label) ? item.exam : item.label;
}

/** Matches the name, optionally only inside exams whose title matches `examPattern`. */
const name = (pattern: string, examPattern?: string) => {
  const re = new RegExp(pattern, 'i');
  const ex = examPattern ? new RegExp(examPattern, 'i') : undefined;
  return (n: string, exam: string) => re.test(n) && (!ex || ex.test(exam));
};

const any =
  (...matchers: Rule['match'][]): Rule['match'] =>
  (n, exam) =>
    matchers.some((m) => m(n, exam));

// --- measurement pickers -----------------------------------------------------
// Units are canonical here (labelValue.ts rescales "x 10³/mm3" into "/mm3").

const PER_VOLUME = /^\/(µl|mm3)$/;
const perVolume = (values: Measurement[]) => values.find((v) => v.unit && PER_VOLUME.test(v.unit));

/**
 * Absolute count from a leucogram row. Layouts print either "% abs" with no
 * units (Sabin, DASA-DF) or "% /µL" pairs (DASA-SP). A row with only the
 * percentage yields undefined so the item is dropped instead of printing a %
 * (or the reference bound that follows it) as a count.
 */
const absolute = (values: Measurement[]): Measurement | undefined => {
  const tagged = perVolume(values);
  if (tagged) return tagged;
  const [pct, abs] = values;
  if (!pct || pct.unit || !abs || abs.unit) return undefined;
  return abs;
};

/** Total leucocytes: the value tagged /µL, else whichever of the first two is not the "100" %. */
const leukocytes = (values: Measurement[]) =>
  perVolume(values) ?? values.slice(0, 2).find((v) => !/^100(,0+)?$/.test(v.value)) ?? values[0];

/** Gasometria group label depends on the sample: GSA (arterial) or GSV (venosa). */
const gasometria = (item: ExamItem) => (/ARTERIAL/i.test(item.exam) ? 'GSA' : 'GSV');

// --- rules -------------------------------------------------------------------

export const RULES: Rule[] = [
  // Hemograma
  { abbr: 'Hm', optional: true, match: name('^(HEMACIAS|ERITROCITOS)$') },
  { abbr: 'Hb', match: name('^HEMOGLOBINA$') },
  { abbr: 'Ht', match: name('^HEMATOCRITO$') },
  { abbr: 'VCM', match: name('^(MEDIA )?(VCM|VGM)$') },
  { abbr: 'HCM', optional: true, match: name('^(MEDIA )?(HCM|HGM)$') },
  { abbr: 'CHCM', optional: true, match: name('^(MEDIA )?(CHCM|CHGM)$') },
  { abbr: 'RDW', match: name('^(MEDIA )?RDW') },
  { abbr: 'Leuc', pick: leukocytes, match: name('^LEUCOCITOS$') },
  { abbr: 'Bast', optional: true, pick: absolute, match: name('^BASTONETES$') },
  { abbr: 'N', pick: absolute, match: name('^(SEGMENTADOS|NEUTROFILOS)$') },
  { abbr: 'Eos', optional: true, pick: absolute, match: name('^EOSINOFILOS$') },
  { abbr: 'Baso', optional: true, pick: absolute, match: name('^BASOFILOS$') },
  { abbr: 'Linf', optional: true, pick: absolute, match: name('^LINFOCITOS') },
  { abbr: 'Mono', optional: true, pick: absolute, match: name('^MONOCITOS$') },
  { abbr: 'Blastos', optional: true, pick: absolute, match: name('^BLASTOS$') },
  { abbr: 'Plaq', match: name('^(CONTAGEM DE )?PLAQUETAS$') },
  { abbr: 'VPM', optional: true, match: name('^(VMP|VPM)$') },
  { abbr: 'Retic', suffix: '%', match: any(name('^VALOR PERCENTUAL$', 'RETICUL'), name('^RETICULOCITOS$')) },
  { abbr: 'Retic abs', optional: true, match: name('^VALOR ABSOLUTO$', 'RETICUL') },
  { abbr: 'IRF', optional: true, suffix: '%', match: name('^IRF', 'RETICUL') },
  { abbr: 'Ret-He', optional: true, match: name('^RET-?HE', 'RETICUL') },

  // Ferro / vitaminas
  { abbr: 'Ferro', match: name('^FERRO( SERICO)?$') },
  { abbr: 'Ferritina', match: name('^FERRITINA') },
  { abbr: 'CLLF', match: name('CAPACIDADE LATENTE') },
  { abbr: 'CTLF', match: name('CAPACIDADE TOTAL') },
  { abbr: 'IST', suffix: '%', match: name('SATURACAO DE TRANSFERRINA') },
  { abbr: 'Transferrina', match: name('^TRANSFERRINA') },
  { abbr: 'Homocisteína', match: name('HOMOCISTEINA') },
  { abbr: 'Vitamina B12', match: name('VITAMINA B12|COBALAMINA') },
  { abbr: 'Ácido fólico', match: name('ACIDO FOLICO|FOLATO') },

  // Hormônios
  { abbr: 'LH', match: name('^LH\\b|LUTEINIZANTE') },
  { abbr: 'FSH', match: name('^FSH\\b|FOLICULO ?ESTIMULANTE') },
  { abbr: 'Estradiol', match: name('ESTRADIOL') },
  { abbr: 'Testosterona total', match: name('TESTOSTERONA TOTAL') },
  { abbr: 'Testosterona livre', match: name('TESTOSTERONA LIVRE') },
  { abbr: 'SHBG', match: name('SHBG|GLOBULINA LIGADORA') },
  { abbr: 'Cortisol', match: name('^CORTISOL') },
  { abbr: 'Prolactina', match: name('PROLACTINA') },
  { abbr: 'TSH', match: name('^TSH') },
  { abbr: 'T4L', match: name('^T4 LIVRE') },
  { abbr: 'T3', match: name('^T3\\b') },
  { abbr: 'PTH', match: name('^PTH|PARATORMONIO') },
  { abbr: 'Vitamina D', match: name('VITAMINA D') },
  { abbr: 'PSA total', match: name('^PSA TOTAL|ANTIGENO PROSTATICO ESPECIFICO TOTAL') },
  { abbr: 'PSA livre', match: name('^PSA LIVRE') },
  { abbr: 'relação PSA livre/total', suffix: '%', match: name('RELACAO.*PSA|PSA.*RELACAO') },

  // Glicose
  { abbr: 'Glicemia', match: name('^GLICOSE|^GLICEMIA( DE JEJUM)?$') },
  { abbr: 'HbA1c', suffix: '%', match: name('HEMOGLOBINA GLICADA|HBA1C') },
  { abbr: 'Glicemia média estimada', optional: true, match: name('GLICEMIA MEDIA ESTIMADA') },
  { abbr: 'Insulina', match: name('^INSULINA') },

  // Lipídios
  { abbr: 'CT', match: name('^COLESTEROL TOTAL') },
  { abbr: 'TG', match: name('^TRIGLIC') },
  { abbr: 'HDL', match: name('^COLESTEROL HDL|^HDL') },
  { abbr: 'LDL', match: name('^COLESTEROL LDL|^LDL') },
  { abbr: 'não-HDL', optional: true, match: name('NAO HDL') },
  { abbr: 'VLDL', optional: true, match: name('VLDL') },

  // Função renal / eletrólitos
  { abbr: 'Ur', match: name('^UREIA') },
  { abbr: 'Cr', match: name('^CREATININA') },
  { abbr: 'TFG', match: name('FILTRACAO GLOMERULAR|^\\*?E?TFG|^\\*?EGFR') },
  { abbr: 'AU', match: name('ACIDO URICO') },
  { abbr: 'Na', match: name('^SODIO|^NA\\+$') },
  { abbr: 'K', match: name('^POTASSIO|^K\\+$') },
  { abbr: 'Cl', match: name('^CLORO|^CL-?$') },
  { abbr: 'Mg', match: name('^MAGNESIO') },
  { abbr: 'Cai', match: name('CALCIO IONICO|CALCIO IONIZADO|^CA\\+\\+') },
  { abbr: 'Ca', match: name('^CALCIO( TOTAL)?$') },
  { abbr: 'P', match: name('^FOSFORO') },

  // Fígado / enzimas
  { abbr: 'TGO', match: name('TGO|OXALACETICA|\\bAST\\b') },
  { abbr: 'TGP', match: name('TGP|PIRUVICA|\\bALT\\b') },
  { abbr: 'FA', match: name('FOSFATASE ALCALINA') },
  { abbr: 'GGT', match: name('GAMA[ -]?GLUTAMIL|\\bGGT\\b') },
  { abbr: 'BT', match: name('^BILIRRUBINA TOTAL') },
  { abbr: 'BD', match: name('^BILIRRUBINA DIRETA') },
  { abbr: 'BI', match: name('^BILIRRUBINA INDIRETA') },
  { abbr: 'Alb', match: name('^ALBUMINA') },
  { abbr: 'PT', match: name('^PROTEINAS TOTAIS') },
  { abbr: 'Amilase', match: name('^AMILASE') },
  { abbr: 'Lipase', match: name('^LIPASE') },
  { abbr: 'DHL', match: name('DESIDROGENASE LA[CT]?TICA|LACTATO DESIDROGENASE|\\bDHL\\b|\\bLDH\\b') },
  { abbr: 'CPK', match: name('CREATINO ?FOSFOQUINASE|\\bCPK\\b|\\bCK\\b') },

  // Inflamação
  { abbr: 'PCR', match: name('PROTEINA C REATIVA|^PCR') },
  { abbr: 'VHS', match: name('^VHS') },
  { abbr: 'Procalcitonina', match: name('PROCALCITONINA') },

  // Coagulação
  { abbr: 'TAP', match: name('^PROTROMBINA \\(PACIENTE\\)|^TEMPO DE PROTROMBINA') },
  { abbr: 'AP', suffix: '%', match: name('^ATIVIDADE DE PROTROMBINA') },
  { abbr: 'INR', match: name('\\bINR\\b|\\bRNI\\b') },
  { abbr: 'TTPA', match: name('^PLASMA PACIENTE|^TEMPO DE TROMBOPLASTINA') },
  { abbr: 'R', match: name('^RELACAO PACIENTE/CONTROLE') },
  { abbr: 'Fibrinogênio', match: name('^FIBRINOGENIO') },
  { abbr: 'D-dímero', match: name('DIMERO') },

  // Cardíaco
  { abbr: 'NT-proBNP', match: name('NT-?PROBNP') },
  { abbr: 'BNP', match: name('^BNP') },
  { abbr: 'Troponina', match: name('TROPONINA') },
  { abbr: 'CK-MB', match: name('CK-?MB') },
  { abbr: 'Lactato', match: name('^(ACIDO )?LA[CT]?TICO|^LACTATO$') },

  // Gasometria
  { abbr: 'pH', group: gasometria, match: name('^PH$', 'GASOMETRIA') },
  { abbr: 'pCO2', group: gasometria, match: name('^PCO2$', 'GASOMETRIA') },
  { abbr: 'pO2', group: gasometria, match: name('^PO2$', 'GASOMETRIA') },
  { abbr: 'HCO3', group: gasometria, match: name('^HCO3', 'GASOMETRIA') },
  { abbr: 'BE', group: gasometria, match: name('^B ?E$|^BE$|BASE EXCESS|EXCESSO DE BASE', 'GASOMETRIA') },
  { abbr: 'SatO2', group: gasometria, suffix: '%', match: name('^O2 SATURACAO|^SATURACAO|^SAT O2', 'GASOMETRIA') },
];

/** Rows that parse as results but are calibration controls, standards or indices nobody pastes. */
const IGNORED = /^PROTROMBINA \(PADRAO\)|^PLASMA CONTROLE|^SENSIBILIDADE INTERNACIONAL|RELACAO PACIENTE\/PADRAO/i;

export function isIgnored(item: ExamItem): boolean {
  return IGNORED.test(norm(itemName(item)));
}

/** Index of the first matching rule, or -1. */
export function findRuleIndex(item: ExamItem): number {
  const n = norm(itemName(item));
  const exam = norm(item.exam);
  return RULES.findIndex((r) => r.match(n, exam));
}

/** Rule for an item nothing matched: printed under its own label, percentages kept. */
export function fallbackRule(item: ExamItem): Rule {
  return {
    abbr: titleCase(itemName(item).replace(/\s*\(.*?\)\s*/g, ' ').trim()),
    suffix: item.values[0].unit === '%' ? '%' : undefined,
    match: () => true,
  };
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i === 0 || w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}
