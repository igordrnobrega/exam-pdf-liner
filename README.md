# Exam Liner

Página web que lê o PDF de um laudo laboratorial brasileiro e resume todos os resultados
em uma única linha, pronta para colar no prontuário:

```
NOME DO PACIENTE – 04/09/2026: Hb 11,3 Ht 33,7 VCM 88,2 RDW 14,2 Leuc 3.660 N 2.049 Plaq 85.000 Ferro 53 Ferritina 94 ... Cr 0,97 Na 141 K 4,3.
```

Tudo roda no navegador (pdf.js + TypeScript). O PDF nunca sai da máquina.

## Rodando

Com Node 24 instalado:

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # gera dist/ estático (pode ser servido de qualquer CDN)
npm test
```

Ou via Docker Compose (sem Node local):

```bash
docker compose run --rm node npm install
docker compose up            # http://localhost:5173
```

## Deploy (Raspberry Pi)

Cada push na `main` roda os testes e publica a imagem multi-arch
`ghcr.io/igordrnobrega/exam-pdf-liner:latest` (`.github/workflows/ci.yml`). No Pi:

```bash
git clone git@github.com:igordrnobrega/exam-pdf-liner.git ~/code/exam-pdf-liner
cd ~/code/exam-pdf-liner
docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d
```

O container `exam-liner` escuta só em `127.0.0.1:8090`; a exposição pública é pelo
Cloudflare Tunnel (`/etc/cloudflared/config.yml`, `service: http://127.0.0.1:8090`)
e o nome local pelo Caddy (`exames.lan { reverse_proxy 127.0.0.1:8090 }`).
Atualizar = repetir o `pull && up -d`.

## Depurando um PDF

```bash
npm run dump -- pdfs/laudo.pdf lines   # linhas reconstruídas pelo pdf.js
npm run dump -- pdfs/laudo.pdf items   # itens extraídos + regra aplicada
npm run dump -- pdfs/laudo.pdf line    # linha final
npm run dump -- pdfs/laudo.pdf full    # linha com itens opcionais e não reconhecidos
```

A pasta `pdfs/` está no `.gitignore`: laudos contêm dados de pacientes e não devem ser
versionados.

## Estrutura

| Caminho | Papel |
| --- | --- |
| `src/pdf/extract.ts` | pdf.js → linhas de texto por página (agrupa por coordenada y). |
| `src/parser/labelValue.ts` | Parser genérico de linhas `rótulo + número(s) [unidade]`: títulos de exame, `RESULTADO:`, tabelas do hemograma, pares %/absoluto. |
| `src/parser/layouts.ts` | O que muda por laboratório (Sabin, DASA): detecção, regex do paciente, linhas/páginas a ignorar, `accepts` (o que é resultado) e `isTitle`. |
| `src/parser/index.ts` | Escolhe o layout e roda o parser. |
| `src/format/rules.ts` | Dicionário exame/rótulo → abreviação. A posição no array é a ordem na linha. |
| `src/format/line.ts` | Monta a linha final. |
| `src/main.ts` | UI: drag-and-drop, textarea editável, copiar, tabela de conferência. |
| `src/__fixtures__/` | Laudos reais anonimizados (linhas + saída esperada) usados como teste de regressão. |

## Adicionando um laboratório

1. `npm run dump -- laudo.pdf lines` para ver como o texto chega.
2. Se o layout for `RÓTULO: valor`, provavelmente basta ajustar `SKIP_LINE` e as regras em `src/format/rules.ts`.
3. Se for muito diferente, criar `src/parser/<lab>.ts` devolvendo `ParsedReport` e despachar em `src/parser/index.ts`.
4. Gerar fixture: `npx tsx scripts/make-fixture.ts laudo.pdf <nome>`, revisar o JSON (sem dados de paciente) e commitar.
