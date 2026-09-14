/** One number as printed, with the unit that followed it, if any ("11,3" + "g/dL"). */
export interface Measurement {
  value: string;
  unit?: string;
}

export interface ExamItem {
  /** Exam title the row belongs to ("HEMOGRAMA COMPLETO"); the label itself when the layout has no titles. */
  exam: string;
  /** Raw label as printed ("HEMOGLOBINA", "RESULTADO", "Contagem de Plaquetas"). */
  label: string;
  /** Leading measurements of the row. Leucogram rows carry % and absolute; reference bounds may follow. */
  values: Measurement[];
  page: number;
}

export interface ParsedReport {
  lab: string;
  patient?: string;
  /** Collection date as printed, dd/mm/yyyy. */
  collectedAt?: string;
  items: ExamItem[];
  /** Set when the layout was a guess rather than a match. */
  warning?: string;
}
