# Exam Liner

Página web que lê o PDF de um laudo laboratorial brasileiro e resume todos os resultados
em uma única linha, pronta para colar no prontuário:

```
NOME DO PACIENTE – 04/09/2026: Hb 11,3 Ht 33,7 VCM 88,2 RDW 14,2 Leuc 3.660 N 2.049 Plaq 85.000 Ferro 53 Ferritina 94 ... Cr 0,97 Na 141 K 4,3.
```

Tudo roda no navegador (pdf.js + TypeScript). O PDF nunca sai da máquina.

**Use online:** https://igordrnobrega.github.io/exam-pdf-liner/ (GitHub Pages, publicado a cada
push na `main`).

Laboratórios reconhecidos: Sabin e DASA (Exame, Lavoisier...). Outros layouts
`RÓTULO: valor unidade` costumam funcionar com a extração genérica; ver
[Adicionando um laboratório](#adicionando-um-laboratório).

> **Aviso.** O Exam Liner é uma ferramenta de apoio à digitação. Não é dispositivo
> médico, não interpreta resultados e pode errar ou omitir valores (layouts novos,
> unidades não reconhecidas, PDFs escaneados). Confira sempre a linha gerada com o
> laudo original antes de registrá-la; a responsabilidade pelo que vai ao prontuário
> é do profissional que o assina.

## Privacidade

- O processamento é 100% local: não há servidor, upload, banco ou telemetria própria.
  O servidor que hospeda a página entrega arquivos estáticos e nada mais.
- A política de segurança de conteúdo (CSP) bloqueia scripts e conexões fora da
  própria origem.
- As fixtures de teste em `src/__fixtures__/` são laudos reais anonimizados por
  `scripts/make-fixture.ts` (nome, documentos, médico, convênio, unidade e assinaturas
  substituídos). **Nunca commite um laudo real**; a pasta `pdfs/` está no `.gitignore`.

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

## Deploy

Cada push na `main` roda os testes e publica a imagem multi-arch (amd64 + arm64)
`ghcr.io/igordrnobrega/exam-pdf-liner:latest` (`.github/workflows/ci.yml`): nginx
servindo o `dist/`. Em qualquer host com Docker (um Raspberry Pi serve):

```bash
git clone https://github.com/igordrnobrega/exam-pdf-liner.git
cd exam-pdf-liner
docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d
```

O container escuta só em `127.0.0.1:8090` (`APP_PORT` muda a porta); exponha por um
reverse proxy ou túnel (Caddy, nginx, Cloudflare Tunnel) apontando para essa porta.
Atualizar = repetir o `pull && up -d`. Como é um site estático, `dist/` também pode ir
para qualquer hospedagem de arquivos (GitHub Pages, Cloudflare Pages, S3).

## Depurando um PDF

```bash
npm run dump -- pdfs/laudo.pdf lines   # linhas reconstruídas pelo pdf.js
npm run dump -- pdfs/laudo.pdf items   # itens extraídos + regra aplicada
npm run dump -- pdfs/laudo.pdf line    # linha final
npm run dump -- pdfs/laudo.pdf full    # linha com itens opcionais e não reconhecidos
```

## Estrutura

| Caminho | Papel |
| --- | --- |
| `src/pdf/extract.ts` | pdf.js → linhas de texto por página (agrupa por coordenada y). |
| `src/parser/labelValue.ts` | Parser genérico de linhas `rótulo + número(s) [unidade]`: títulos de exame, `RESULTADO:`, tabelas do hemograma, pares %/absoluto, unidades e escala (`x 10³/mm3` → `/mm3`). |
| `src/parser/layouts.ts` | O que muda por laboratório (Sabin, DASA): detecção, regex do paciente, linhas/páginas a ignorar, `accepts` (o que é resultado), `isTitle` e `endsExam`. |
| `src/parser/index.ts` | Escolhe o layout e roda o parser. |
| `src/format/rules.ts` | Dicionário exame/rótulo → abreviação. A posição no array é a ordem na linha. |
| `src/format/line.ts` | Monta a linha final (primeira ocorrência por analito; itens sem valor utilizável são descartados). |
| `src/main.ts` | UI: drag-and-drop, textarea editável, copiar, tabela de conferência. |
| `src/__fixtures__/` | Laudos reais anonimizados (linhas + saída esperada) usados como teste de regressão. |

## Adicionando um laboratório

1. `npm run dump -- laudo.pdf lines` para ver como o texto chega.
2. Se o layout for `RÓTULO: valor`, provavelmente basta um novo `Layout` em
   `src/parser/layouts.ts` (detecção, linhas a ignorar, `accepts`) e regras novas em
   `src/format/rules.ts`.
3. Se for muito diferente, criar `src/parser/<lab>.ts` devolvendo `ParsedReport` e
   despachar em `src/parser/index.ts`.
4. Gerar fixture: `npx tsx scripts/make-fixture.ts laudo.pdf <nome>`, revisar o JSON
   (sem dados de paciente) e abrir o PR.

## Licença

[Apache-2.0](LICENSE). Inclui o [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0).
