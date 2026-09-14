import { describe, expect, it } from 'vitest';
import { parseLabelValue } from './labelValue';
import { parseReport } from './index';
import { DASA, SABIN } from './layouts';
import { buildLine } from '../format/line';

const sabinHeader = [
  'Nome :MARIA DA SILVA',
  'DN :04/02/1938 Sexo: Feminino',
  'RG :172227 SSP/DF Código da OS : 577-67816-7055',
  'Médico :FULANO Atendimento : 03/09/2026 - 08:25:0',
  'Responsável Técnico: Fulano - CRM-DF 15802',
  '_______________________________________________',
];

function sabinPage(page: number, body: string[]) {
  return {
    page,
    lines: [...sabinHeader, ...body, 'Coleta: 04/09/2026 - 12:00:00 Liberação: 05/09/2026 - 08:23:54'],
  };
}

describe('parseLabelValue (Sabin layout)', () => {
  it('reads patient, collection date and hemogram rows', () => {
    const report = parseLabelValue(
      [
        sabinPage(1, [
          'HEMOGRAMA COMPLETO',
          'Método : Citometria',
          'Material: SANGUE',
          'Eritrograma Valores de Referência',
          'HEMOGLOBINA 11,3 g/dL 13,0 a 16,5 12,0 a 15,8',
          'HEMATÓCRITO 33,7 % 36,0 a 54,0',
          'Leucograma Valores de Referência',
          'LEUCÓCITOS 3.660 100 3.600 a 11.000',
          'SEGMENTADOS 56 2.049 40-70 1.480 a 7.700',
          'Série Plaquetária Valores de Referência',
          'PLAQUETAS 85 x 10³/mm3 130 a 450 x 10³/mm3',
          'OBSERVAÇÃO: PLAQUETOPENIA',
        ]),
      ],
      SABIN,
    );
    expect(report.patient).toBe('MARIA DA SILVA');
    expect(report.collectedAt).toBe('04/09/2026');
    expect(report.items.map((i) => [i.label, i.values])).toEqual([
      ['HEMOGLOBINA', [{ value: '11,3', unit: 'g/dl' }, { value: '13,0' }]],
      ['HEMATÓCRITO', [{ value: '33,7', unit: '%' }, { value: '36,0' }]],
      ['LEUCÓCITOS', [{ value: '3.660' }, { value: '100' }, { value: '3.600' }]],
      ['SEGMENTADOS', [{ value: '56' }, { value: '2.049' }]],
      // "85 x 10³/mm3" is rescaled at parse time into the canonical per-volume unit.
      ['PLAQUETAS', [{ value: '85.000', unit: '/mm3' }, { value: '130' }]],
    ]);
    expect(buildLine(report)).toBe(
      'MARIA DA SILVA – 04/09/2026: Hb 11,3 Ht 33,7 Leuc 3.660 N 2.049 Plaq 85.000.',
    );
  });

  it('handles RESULTADO rows, dotted labels and skips reference tables and charts', () => {
    const report = parseLabelValue(
      [
        sabinPage(1, [
          'CREATININA',
          'Método : Enzimático',
          'Material: SANGUE',
          'RESULTADO: 0,97 mg/dL',
          'Valor de Referência:',
          'Adultos (mulheres)... 0,51 a 0,95 mg/dL',
          '6',
          '2 1,10 1,08 1,11',
          '20/10/23 30/05/24',
          'LIPIDOGRAMA',
          'Método : Colorimétrico Horas de Jejum: Conforme orientação médica',
          'COLESTEROL TOTAL..:144 mg/dL',
          'COLESTEROL HDL....:30 mg/dL',
          'Colesterol Total < 190 mg/dL < 190 mg/dL',
          'HDL-c > 40 mg/dL > 40 mg/dL',
          'GASOMETRIA VENOSA',
          'Método : Sensor',
          'pH...............:7,400',
          'B.E..............:-6,2 mmol/L',
          'O2 SATURAÇÃO.....:75,0 %',
          'VITAMINA B12',
          'Método : Eletroquimioluminescência',
          'RESULTADO: > 2.000 pg/mL',
        ]),
        sabinPage(2, ['LAUDO COMPARATIVO', 'HEMOGLOBINA 11,3 10,3 11,5 -- -- --']),
      ],
      SABIN,
    );
    expect(report.items.map((i) => `${i.exam}|${i.label}|${i.values[0].value}`)).toEqual([
      'CREATININA|RESULTADO|0,97',
      'LIPIDOGRAMA|COLESTEROL TOTAL|144',
      'LIPIDOGRAMA|COLESTEROL HDL|30',
      'GASOMETRIA VENOSA|pH|7,400',
      'GASOMETRIA VENOSA|B.E|-6,2',
      'GASOMETRIA VENOSA|O2 SATURAÇÃO|75,0',
      'VITAMINA B12|RESULTADO|>2.000',
    ]);
    expect(buildLine(report)).toBe(
      'MARIA DA SILVA – 04/09/2026: Vitamina B12 >2.000 CT 144 HDL 30 Cr 0,97 GSV pH 7,400 BE -6,2 SatO2 75,0%.',
    );
  });

  it('keeps unknown items out of the default line and appends them in document order when asked', () => {
    const report = parseLabelValue(
      [sabinPage(1, ['EXAME NOVO', 'Método : X', 'RESULTADO: 12 mg/dL', 'CREATININA', 'Método : Y', 'RESULTADO: 0,9 mg/dL'])],
      SABIN,
    );
    expect(buildLine(report)).toBe('MARIA DA SILVA – 04/09/2026: Cr 0,9.');
    expect(buildLine(report, { includeUnknown: true })).toBe('MARIA DA SILVA – 04/09/2026: Cr 0,9 Exame Novo 12.');
  });
});

describe('parseLabelValue (DASA layout)', () => {
  it('reads mixed-case rows with % and absolute counts in either order and ignores prose', () => {
    const report = parseLabelValue(
      [
        {
          page: 1,
          lines: [
            'Orlando Silva CPF: 000.000.000-00 FAP: 974200689981',
            'DATA COLETA/RECEBIMENTO: 28/08/2026 11:40',
            'Hemograma com Contagem de Plaquetas',
            'Hemoglobina 7,4 g/dL 13,0 a 17,0 g/dL',
            'Média VGM 87,9 fL 83,0 a 101,0 fL',
            'Leucócitos 100 2.120 100 % 4.000 a 10.000 /μL',
            'Segmentados 13,0 276 40,0 a 80,0 % 1.800 a 7.800 /μL',
            'Leucócitos 100 % 4.430 /μL 100 % 4.000 a 10.000 /μL',
            'Neutrófilos 43,5 % 1.927 /μL 40,0 a 80,0 % 1.800 a 7.800 /μL',
            'Eritroblastos em 100 Leucócitos 1',
            'Contagem de Plaquetas 21.000 /μL 150.000 a 450.000 /μL',
            'Creatinina 1,22 mg/dL 0,70 a 1,20 mg/dL',
            '*eGFR 58 mL/min/1,73m² Superior a 90 mL/min/1,73m²',
            'Histórico Creatinina',
            'Data 31/08/2026 01/09/2026',
            'Resultado 1,20 mg/dL 1,25 mg/dL',
            'Esta equação é válida para pacientes acima de 18 anos.',
            'Intervalo de referência estabelecido com base na análise de 31.490 indivíduos adultos.',
            'Dr Sandro Melim CRM-DF 12388 - PG 1 de 5',
          ],
        },
      ],
      DASA,
    );
    expect(report.patient).toBe('Orlando Silva');
    expect(report.collectedAt).toBe('28/08/2026');
    expect(report.items.map((i) => i.label)).toEqual([
      'Hemoglobina',
      'Média VGM',
      'Leucócitos',
      'Segmentados',
      'Leucócitos',
      'Neutrófilos',
      'Contagem de Plaquetas',
      'Creatinina',
      '*eGFR',
    ]);
    // Second Leucócitos/Neutrófilos rows are duplicates: first occurrence wins.
    expect(buildLine(report)).toBe(
      'Orlando Silva – 28/08/2026: Hb 7,4 VCM 87,9 Leuc 2.120 N 276 Plaq 21.000 Cr 1,22 TFG 58.',
    );
  });

  it('uses DASA titles for exams whose rows are not self-describing', () => {
    const report = parseLabelValue(
      [
        {
          page: 1,
          lines: [
            'Gasometria Arterial',
            '(Material: Sangue Arterial)',
            'pH 7,38 7,35 a 7,45',
            'pCO2 42 mmHg 35 a 45 mmHg',
            'HCO3 24 mmol/L 22 a 26 mmol/L',
            'Assinado eletronicamente por: X (01/01/2026 00:00 BRT)',
            'Lactato Desidrogenase 250 U/L 120 a 246 U/L',
            'Blastos 2,0 % 0,0 a 0,0 %',
          ],
        },
      ],
      DASA,
    );
    // Blastos has only a percentage: dropped rather than printing the reference bound as a count.
    expect(buildLine(report, { full: true })).toBe('DHL 250 GSA pH 7,38 pCO2 42 HCO3 24.');
  });
});

describe('gasometria groups', () => {
  it('prints arterial and venous gases as two contiguous groups, neither treated as a duplicate', () => {
    const report = parseLabelValue(
      [
        sabinPage(1, [
          'GASOMETRIA ARTERIAL',
          'Método : Sensor',
          'pH...............:7,300',
          'PCO2.............:50,0 mmHg',
          'HCO3.............:24,0 mmol/L',
          'GASOMETRIA VENOSA',
          'Método : Sensor',
          'pH...............:7,400',
          'PCO2.............:30,0 mmHg',
          'HCO3.............:18,6 mmol/L',
        ]),
      ],
      SABIN,
    );
    expect(buildLine(report)).toBe(
      'MARIA DA SILVA – 04/09/2026: GSA pH 7,300 pCO2 50,0 HCO3 24,0 GSV pH 7,400 pCO2 30,0 HCO3 18,6.',
    );
  });
});

describe('layout detection', () => {
  it('does not mistake an unrelated "Adasa" for the DASA layout', () => {
    const lines = ['Convênio: Adasa Saúde', 'CREATININA', 'Método : X', 'RESULTADO: 0,9 mg/dL'];
    expect(parseReport([{ page: 1, lines }]).lab).toBe('Desconhecido');
    expect(parseReport([{ page: 1, lines: [...lines, 'Local de execução: - DASA - Rua X'] }]).lab).toBe('DASA');
  });
});

describe('units and scaling', () => {
  it('accepts a glued unit or a flag after the number', () => {
    const report = rows(['RESULTADO: 92mg/dL', 'SÓDIO', 'Método : Y', 'RESULTADO: 128* mEq/L']);
    expect(report.items.map((i) => i.values[0])).toEqual([
      { value: '92', unit: 'mg/dl' },
      { value: '128', unit: 'meq/l' },
    ]);
  });

  const rows = (lines: string[]) => parseLabelValue([sabinPage(1, ['HEMOGRAMA COMPLETO', 'Método : X', ...lines])], SABIN);

  it('rescales thousands-per-volume units into absolute counts, keeping < and >', () => {
    const report = rows([
      'PLAQUETAS < 10 x 10³/mm³ 130 a 450',
      'RETICULÓCITOS',
      'Método : Y',
      'VALOR ABSOLUTO..............: 54 x 10³/mm3',
      'Na+..............:140 mmol/L',
      'SEGMENTADOS 56 -- 40-70 1.480 a 7.700',
    ]);
    expect(report.items.map((i) => [i.label, i.values[0]])).toEqual([
      ['PLAQUETAS', { value: '<10.000', unit: '/mm3' }],
      ['VALOR ABSOLUTO', { value: '54.000', unit: '/mm3' }],
      ['Na+', { value: '140', unit: 'mmol/l' }],
      ['SEGMENTADOS', { value: '56' }],
    ]);
    // SEGMENTADOS has no absolute count: dropped, not printed as "N 56".
    expect(buildLine(report, { full: true })).toBe('MARIA DA SILVA – 04/09/2026: Plaq <10.000 Retic abs 54.000 Na 140.');
  });

  it('closes an exam on its Coleta line so a missed title cannot inherit it', () => {
    const report = parseLabelValue(
      [
        sabinPage(1, [
          'CREATININA',
          'Método : X',
          'RESULTADO: 0,97 mg/dL',
          'Coleta: 04/09/2026 - 12:00:00',
          'UREIA',
          'Nota: three lines of notes',
          'Nota: before the method line',
          'Nota: so the title is missed',
          'Método : Y',
          'RESULTADO: 50 mg/dL',
        ]),
      ],
      SABIN,
    );
    expect(buildLine(report)).toBe('MARIA DA SILVA – 04/09/2026: Cr 0,97.');
    expect(buildLine(report, { includeUnknown: true })).toBe('MARIA DA SILVA – 04/09/2026: Cr 0,97 Resultado 50.');
  });
});
