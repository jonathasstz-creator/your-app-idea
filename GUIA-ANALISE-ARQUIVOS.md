# 🔍 Guia de Análise de Arquivos Não Utilizados

## Visão Geral

Este guia explica como usar as ferramentas de análise estática para identificar arquivos que não estão sendo usados no projeto Piano Trainer.

## Ferramentas Disponíveis

### 1. 🐍 Script Python: `analyze-unused-files.py`

**O que faz:**
- Analisa todos os arquivos `.py` do projeto
- Constrói um grafo de dependências baseado em imports
- Identifica arquivos não alcançáveis a partir dos entry points

**Como usar:**
```bash
python3 analyze-unused-files.py
```

**Entry points detectados:**
- `main.py` (desktop app)
- `backend/app/main.py` (API)
- `run_legacy_temp.py` (se existir)

**Saída esperada:**
```
🔍 Análise de Arquivos Python Não Utilizados
==================================================

1️⃣  Encontrando arquivos Python...
   Encontrados: 87 arquivos

2️⃣  Identificando entry points...
   Entry points:
   - main.py
   - backend/app/main.py

3️⃣  Construindo grafo de dependências...
   Módulos no grafo: 45

4️⃣  Encontrando módulos alcançáveis...
   Módulos alcançáveis: 42

5️⃣  Identificando arquivos NÃO utilizados...

❌ Encontrados 3 arquivos possivelmente não utilizados:

  📁 utils/
     - old_helper.py
  📁 legacy/
     - trainer_gui.py
```

---

### 2. 🟦 Script Node.js: `analyze-unused-frontend.js`

**O que faz:**
- Analisa todos os arquivos `.ts`, `.tsx`, `.js`, `.jsx` do viewer
- Constrói grafo de dependências baseado em imports ES6, require, dynamic imports
- Identifica arquivos não alcançáveis a partir dos entry points

**Como usar:**
```bash
node analyze-unused-frontend.js
```

**Entry points detectados:**
- `viewer/index.tsx`
- `viewer/index.html`

**Saída esperada:**
```
🔍 Análise de Arquivos TypeScript/JavaScript Não Utilizados
============================================================

1️⃣  Encontrando arquivos TypeScript/JavaScript...
   Encontrados: 34 arquivos

2️⃣  Identificando entry points...
   - index.tsx

3️⃣  Construindo grafo de dependências...
   Arquivos no grafo: 34

4️⃣  Encontrando arquivos alcançáveis...
   Arquivos alcançáveis: 31

5️⃣  Identificando arquivos NÃO utilizados...

❌ Encontrados 3 arquivos possivelmente não utilizados:

  📁 .
     - index-antigo.tsx
     - test.tsx
     - transport-client.ts
```

---

### 3. 🚀 Script Mestre: `check-unused.sh`

**O que faz:**
- Executa os dois scripts acima automaticamente
- Detecta ferramentas extras instaladas
- Gera relatório consolidado (opcional)

**Como usar:**

```bash
# Execução normal
bash check-unused.sh

# Gerar relatório em arquivo
bash check-unused.sh --report
```

**O script verifica automaticamente:**
- ✅ Python 3 instalado
- ✅ Node.js instalado
- ✅ Ferramentas extras (vulture, ts-prune, depcheck)

---

## Ferramentas Extras (Opcionais)

### vulture (Python)

**O que faz:** Detecta código morto (funções, classes, variáveis não usadas)

**Instalar:**
```bash
pip install vulture
```

**Usar:**
```bash
vulture . --exclude .venv,node_modules,dist
```

**Saída:**
```
core/old_module.py:15: unused function 'old_function' (60% confidence)
utils/helper.py:42: unused variable 'UNUSED_CONST' (100% confidence)
```

---

### ts-prune (TypeScript)

**O que faz:** Detecta exports não usados em TypeScript

**Instalar:**
```bash
npm install -g ts-prune
```

**Usar:**
```bash
cd viewer
ts-prune
```

**Saída:**
```
utils.ts:42 - oldHelper (used in module)
types.ts:15 - UnusedType
```

---

### depcheck (Node.js)

**O que faz:** Detecta dependências não usadas no package.json

**Instalar:**
```bash
npm install -g depcheck
```

**Usar:**
```bash
cd viewer
depcheck
```

**Saída:**
```
Unused dependencies
* old-package
* unused-library

Missing dependencies
* @types/react
```

---

## Workflow Recomendado

### 1. Backup
```bash
git add -A
git commit -m "backup: antes da limpeza de arquivos"
```

### 2. Executar Análises
```bash
# Opção 1: Script mestre (recomendado)
bash check-unused.sh --report

# Opção 2: Scripts individuais
python3 analyze-unused-files.py
node analyze-unused-frontend.js

# Opção 3: Ferramentas extras
vulture . --exclude .venv,node_modules
cd viewer && ts-prune && cd ..
cd viewer && depcheck && cd ..
```

### 3. Revisar Resultados

**Priorize arquivos com nomes suspeitos:**
- `*-antigo.*`
- `*-old.*`
- `*-backup.*`
- `*-1.*`, `*-2.*`
- `*-temp.*`
- `test-*.* ` (se não for teste real)

**Cuidado com falsos positivos:**
- Arquivos usados dinamicamente (`importlib`, `require()` dinâmico)
- Scripts standalone (podem não estar no grafo)
- Arquivos de config/setup que são executados diretamente
- Entry points alternativos

### 4. Verificação Manual

Antes de deletar, verifique:

```bash
# Buscar referências no código
grep -r "nome_do_arquivo" . --exclude-dir={.venv,node_modules,.git}

# Verificar imports
grep -r "from.*nome_modulo" . --exclude-dir={.venv,node_modules}
grep -r "import.*nome_modulo" . --exclude-dir={.venv,node_modules}
```

### 5. Deletar (com cuidado)

```bash
# Deletar arquivo individual
rm caminho/para/arquivo.py

# Ou usar o script de limpeza automático
bash cleanup-legacy.sh --dry-run  # Teste primeiro
bash cleanup-legacy.sh             # Execução real
```

### 6. Testar

```bash
# Reinstalar dependências
make install

# Testar backend
make backend  # Terminal 1

# Testar desktop
make desktop  # Terminal 2

# Testar frontend (se aplicável)
cd viewer && npm run dev
```

### 7. Commit

```bash
git add -A
git commit -m "chore: remove unused files

- Removed legacy/old files: index-antigo.tsx, transport-client.ts
- Verified with static analysis tools
- All tests passing"
```

---

## Casos Especiais

### Arquivos de Teste

**Problema:** Testes podem não aparecer no grafo se não forem importados.

**Solução:**
- Manter arquivos com padrão `test_*.py` ou `*.test.ts`
- Não deletar se estiverem em pastas `tests/` ou `__tests__/`

### Scripts Standalone

**Problema:** Scripts executados diretamente podem não ter imports.

**Solução:**
- Verificar se tem shebang (`#!/usr/bin/env python3`)
- Verificar se está referenciado em Makefile, package.json ou docs

### Imports Dinâmicos

**Problema:** `importlib.import_module()` ou `require()` dinâmico não são detectados.

**Solução:**
- Buscar por `importlib` ou `__import__` no código
- Manter arquivos suspeitos até confirmar manualmente

---

## Interpretação dos Resultados

### Alta Confiança (Pode Deletar)

✅ Arquivo listado como não usado E tem nome suspeito:
- `index-antigo.tsx`
- `helper-old.py`
- `backup_service.ts`
- Arquivos com `-1`, `-2` no nome

### Média Confiança (Revisar)

⚠️ Arquivo listado como não usado mas nome normal:
- `service.py` (pode ser importado dinamicamente)
- `utils.ts` (pode ser usado em build/config)

### Baixa Confiança (Não Deletar)

🚫 Arquivo em pasta crítica:
- `backend/app/main.py` (entry point)
- `core/config.py` (pode ser usado em runtime)
- Scripts em `/scripts` (podem ser standalone)

---

## FAQ

### Q: O script diz que um arquivo usado não está sendo usado. Por quê?

**A:** Provavelmente é usado dinamicamente ou é um entry point não detectado. Revise manualmente.

### Q: Posso confiar 100% nos resultados?

**A:** Não. Análise estática tem limitações. Sempre revise manualmente e teste depois.

### Q: Como adicionar novos entry points?

**Python:** Edite `find_entry_points()` em `analyze-unused-files.py`  
**TypeScript:** Edite `ENTRY_POINTS` em `analyze-unused-frontend.js`

### Q: E se eu deletar algo importante?

**A:** Por isso fazemos backup com git antes! Use `git revert` ou `git checkout` para recuperar.

---

## Resumo dos Comandos

```bash
# 1. Backup
git commit -am "backup antes da limpeza"

# 2. Análise completa
bash check-unused.sh --report

# 3. Ferramentas extras (opcional)
vulture . --exclude .venv,node_modules
cd viewer && ts-prune && depcheck && cd ..

# 4. Limpeza
bash cleanup-legacy.sh --dry-run
bash cleanup-legacy.sh

# 5. Teste
make install && make backend

# 6. Commit
git commit -am "chore: remove unused files"
```

---

## Recursos Adicionais

- **Vulture docs:** https://github.com/jendrikseipp/vulture
- **ts-prune docs:** https://github.com/nadeesha/ts-prune
- **depcheck docs:** https://github.com/depcheck/depcheck
- **Análise de arquivos legados:** `ANALISE-ARQUIVOS-LEGADOS.md`

---

Última atualização: 04/02/2026
