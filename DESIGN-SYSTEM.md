# Design system — tipografia, paleta, KPIs e botões

Referência visual do painel `baixar_caged` (inspirada em material institucional SET/IDT e na linguagem de dados verde/laranja/azul).

Fonte CSS: `web/static/css/style.css`  
Fonte tipográfica: [Montserrat (Google Fonts)](https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap)

---

## 1. Paleta de cores

| Token | Hex | Uso |
|-------|-----|-----|
| `--green` | `#39B54A` | Primária: números de destaque, cabeçalhos de KPI, botão principal, aba ativa |
| `--green-dark` | `#2F9A3D` | Hover do botão; texto em chips verdes |
| `--green-soft` | `#E8F7EA` | Fundo de chips / badges suaves |
| `--orange` | `#F15A24` | Acento: ícones, chip secundário, segmento da barra |
| `--orange-soft` | `#FFF0EA` | Fundo de chips laranja |
| `--blue` | `#0071BC` | Apoio: segmento da barra de progresso / faixa inferior |
| `--bg` | `#F2F2F2` | Fundo da página |
| `--white` | `#FFFFFF` | Cards, barra institucional, painéis |
| `--ink` | `#4D4D4D` | Texto principal |
| `--ink-soft` | `#6D6E71` | Texto secundário / descrições |
| `--line` | `#D1D3D4` | Bordas e divisórias |
| Título institucional | `#7A7A7A` | Títulos uppercase da barra superior |

### Variáveis CSS (copiar)

```css
:root {
  --green: #39b54a;
  --green-dark: #2f9a3d;
  --green-soft: #e8f7ea;
  --orange: #f15a24;
  --orange-soft: #fff0ea;
  --blue: #0071bc;
  --bg: #f2f2f2;
  --white: #ffffff;
  --ink: #4d4d4d;
  --ink-soft: #6d6e71;
  --line: #d1d3d4;
  --shadow: 0 10px 28px rgba(77, 77, 77, 0.08);
  --radius: 10px;
  --font: "Montserrat", system-ui, sans-serif;
}
```

### Faixa / barra segmentada (rodapé e progresso)

Proporção sugerida: **verde 1,5 · azul 1 · laranja 0,7**

```css
.footer-strip {
  display: grid;
  grid-template-columns: 1.5fr 1fr 0.7fr;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
}
.strip-green  { background: var(--green); }
.strip-blue   { background: var(--blue); }
.strip-orange { background: var(--orange); }
```

Barra de progresso (preenchimento):

```css
background: linear-gradient(90deg, var(--green), #5fc86d 55%, var(--blue));
```

---

## 2. Tipografia

**Família:** `Montserrat` (fallback: `system-ui, sans-serif`)

| Papel | Peso | Tamanho | Cor | Extras |
|-------|------|---------|-----|--------|
| Eyebrow / selo | 600 | `0.72rem` | `--ink-soft` | uppercase, `letter-spacing: 0.12em` |
| Título de barra | 700 | `clamp(0.78rem, 1.7vw, 1.05rem)` | `#7A7A7A` | uppercase, `letter-spacing: 0.06em` |
| Hero / KPI grande | **800** | `clamp(2.2rem, 5vw, 3.4rem)` | `--green` | `letter-spacing: -0.02em`, line-height ~1.05 |
| Valor no card KPI | **800** | `1.15rem` | `--green` | line-height 1.2 |
| Cabeçalho do card | 700 | `0.72rem` | branco | uppercase, `letter-spacing: 0.05em`, fundo `--green` |
| Descrição do card | 500 | `0.78rem` | `--ink-soft` | line-height 1.4 |
| Status do card | 700 | `0.72rem` | `--ink` | uppercase, `letter-spacing: 0.04em` |
| Corpo / parágrafo | 500 | `0.95rem` | `--ink` | line-height 1.45 |
| Botão | 700 | `0.92rem` | branco | `letter-spacing: 0.02em` |
| Aba | 700 | `clamp(0.72rem, 1.6vw, 0.88rem)` | `--ink-soft` / branco (ativa) | — |
| STATUS % | **800** | `0.85rem` | `--green` | uppercase |

### Import Google Fonts

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
```

---

## 3. Modelo de KPI (card)

Estrutura visual fixa:

1. **Cabeçalho verde** — título curto em branco, uppercase  
2. **Valor** — número/dado em verde extra-bold  
3. **Texto de apoio** — cinza médio, 1–2 linhas  
4. **Status** — linha superior + rótulo em uppercase (ex.: `COLUNAS: 7`, `FONTE: POWER BI`)

```
┌─────────────────────────┐
│       VOLUME            │  ← fundo #39B54A, texto branco
├─────────────────────────┤
│  ~8 mil                 │  ← #39B54A, weight 800
│  Detalhamento mensal ·  │  ← #6D6E71
│  recorte Ceará.         │
│  ─────────────────────  │
│  COLUNAS: 7             │  ← #4D4D4D, weight 700
└─────────────────────────┘
```

### HTML

```html
<article class="card">
  <div class="card-head">Volume</div>
  <div class="card-body">
    <p class="card-value">~8 mil</p>
    <p class="card-text">Detalhamento mensal · recorte Ceará.</p>
    <div class="card-status">COLUNAS: 7</div>
  </div>
</article>
```

### CSS

```css
.cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

.card {
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  background: var(--white);
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.card-head {
  background: var(--green);
  color: var(--white);
  padding: 10px 12px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  text-align: center;
}

.card-body {
  padding: 14px 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.card-value {
  margin: 0;
  color: var(--green);
  font-size: 1.15rem;
  font-weight: 800;
  line-height: 1.2;
}

.card-text {
  margin: 0;
  color: var(--ink-soft);
  font-size: 0.78rem;
  font-weight: 500;
  line-height: 1.4;
}

.card-status {
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--line);
  color: var(--ink);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}
```

### Grid responsivo

- Desktop: 4 colunas  
- ≤900px: 2 colunas  
- ≤560px: 1 coluna  

---

## 4. Botões

### Botão primário (ação — “Executar”)

```html
<button class="btn-run" type="button">
  <span class="btn-icon">▶</span>
  Executar extração
</button>
```

```css
.btn-run {
  appearance: none;
  border: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 14px 22px;
  border-radius: 8px;
  background: var(--green);
  color: var(--white);
  font-family: inherit;
  font-size: 0.92rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  box-shadow: 0 8px 18px rgba(57, 181, 74, 0.28);
  transition: background 0.15s, transform 0.15s, opacity 0.15s;
}

.btn-run:hover:not(:disabled) {
  background: var(--green-dark);
  transform: translateY(-1px);
}

.btn-run:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}

.btn-icon {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  font-size: 0.7rem;
}
```

### Abas (botões de navegação)

| Estado | Fundo | Texto |
|--------|-------|-------|
| Inativa | `#E4E4E4` | `--ink-soft` |
| Hover | `#D8D8D8` | `--ink-soft` |
| Ativa | `--green` (`#39B54A`) | branco |

```css
.tab {
  flex: 1;
  padding: 12px 10px;
  border: 0;
  border-radius: 8px 8px 0 0;
  background: #e4e4e4;
  color: var(--ink-soft);
  font-weight: 700;
  cursor: pointer;
}

.tab.is-active {
  background: var(--green);
  color: var(--white);
}
```

### Chips / badges

```css
.chip {
  display: inline-flex;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--green-soft);
  color: var(--green-dark);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.chip-orange {
  background: var(--orange-soft);
  color: var(--orange);
}
```

### Link de ação secundária (ex.: “Baixar”)

- Cor: `--green`  
- Hover: `--green-dark`  
- Peso 700, uppercase, `letter-spacing: 0.04em`, ~`0.78rem`

---

## 5. Superfície e layout

| Item | Valor |
|------|--------|
| Largura máxima do conteúdo | `1100px` |
| Raio padrão | `10px` (cards/abas ~`8px`) |
| Sombra de painel | `0 10px 28px rgba(77, 77, 77, 0.08)` |
| Fundo da página | `#F2F2F2` + leves radiais verde/laranja |

```css
background:
  radial-gradient(circle at 12% 0%, rgba(57, 181, 74, 0.08), transparent 42%),
  radial-gradient(circle at 88% 8%, rgba(241, 90, 36, 0.07), transparent 36%),
  var(--bg);
```

---

## 6. Checklist rápido para outro projeto

1. Importar **Montserrat** 400–800  
2. Colar as variáveis `:root`  
3. Números-herói / valores de KPI → verde `#39B54A`, peso **800**  
4. Cards KPI → cabeçalho verde + valor verde + status uppercase  
5. CTA → botão verde sólido com sombra suave e hover `#2F9A3D`  
6. Aba ativa / chip de sucesso → mesma família verde  
7. Acentos pontuais (ícone, chip secundário) → laranja `#F15A24`  
8. Faixa decorativa ou progresso → verde + azul + laranja  

---

*Documento gerado a partir do frontend em `baixar_caged/web/`.*
