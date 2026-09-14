# Segurança

## Modelo

O Exam Liner é uma página estática. O PDF é lido pelo pdf.js dentro do navegador
(num Web Worker), o parser roda no cliente e nada é enviado a servidor algum:
não há backend, banco, telemetria própria nem upload. A política de segurança de
conteúdo (CSP) da página bloqueia qualquer script ou conexão fora da própria
origem (exceto o beacon opcional do Cloudflare Web Analytics).

## Reportando uma vulnerabilidade

Abra um *security advisory* privado em
https://github.com/igordrnobrega/exam-pdf-liner/security/advisories/new
descrevendo o problema e, se possível, um PDF de exemplo **sem dados reais de
paciente**. Resposta em até 7 dias.

## Dados de paciente

Nunca commite laudos reais, nem "só para teste". As fixtures em
`src/__fixtures__/` são geradas por `scripts/make-fixture.ts`, que anonimiza
nome, documentos, médico, convênio, unidade e assinaturas; revise o JSON antes
de abrir o PR.
