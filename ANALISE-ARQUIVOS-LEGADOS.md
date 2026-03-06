# Análise de Arquivos Legados e Não Utilizados

**Data:** 04/02/2026  
**Objetivo:** Identificar arquivos órfãos, legados e não utilizados no projeto Piano Trainer

---

## 🚨 Arquivos Legados Identificados

### 1. **Arquivos na Raiz (Não Utilizados)**

#### `/index.tsx` e `/index-1.tsx`
- **Status:** ❌ VAZIOS - Não contêm código
- **Problema:** Arquivos duplicados na raiz, provavelmente criados por erro
- **Ação:** DELETAR ambos
- **Arquivo correto:** `/viewer/index.tsx` (ativo e em uso)

#### `/json`
- **Status:** ⚠️ Arquivo sem extensão na raiz
- **Problema:** Nome suspeito, provavelmente arquivo temporário
- **Ação:** VERIFICAR conteúdo e deletar se não for necessário

#### `/metadata.json` e `/metadata-1.json`
- **Status:** ⚠️ Duplicados na raiz
- **Problema:** Pode ser legado do viewer (que tem seu próprio metadata.json)
- **Ação:** VERIFICAR se são usados por algum script ou mover para pasta correta

### 2. **Arquivos Legados no Viewer**

#### `/viewer/index-antigo.tsx`
- **Status:** ❌ LEGADO - Versão antiga do index.tsx
- **Tamanho:** ~86KB (código duplicado)
- **Problema:** Mantém código idêntico à versão atual, mas com menos features
- **Diferenças:** 
  - Não tem suporte a `v1ChordShim`
  - Não tem validação com `validateLessonContent`
  - Não tem suporte completo a `schema_version` e `steps_json`
- **Ação:** DELETAR - está completamente substituído

#### `/viewer/test.tsx`
- **Status:** ⚠️ VERIFICAR
- **Problema:** Pode ser arquivo de teste ou componente temporário
- **Ação:** VERIFICAR conteúdo e uso

#### `/viewer/transport-client.ts`
- **Status:** ⚠️ POSSIVELMENTE OBSOLETO
- **Problema:** Sistema migrou para `local-transport-driver.ts`
- **Nota:** Segundo arquitetura.md, está sendo substituído pelo LocalTransportDriver
- **Ação:** VERIFICAR se ainda é importado; se não, DELETAR

#### `/viewer/transport-client.test.ts`
- **Status:** ⚠️ Teste do arquivo acima
- **Ação:** Se `transport-client.ts` for removido, este também deve ser

### 3. **Script Legado**

#### `/run_legacy_temp.py`
- **Status:** ❌ TEMPORÁRIO - Script para rodar versão legada
- **Problema:** Desativa proteção de código legado temporariamente
- **Nota:** Referencia `legacy/trainer_gui.py` que não existe na estrutura atual
- **Ação:** DELETAR - não há pasta `/legacy` acessível

### 4. **Arquivos de Configuração Duplicados**

#### Vários arquivos `.env`
- `.env` (raiz)
- `.env.local` (raiz)
- `backend/.env`
- `backend/.env.example`
- `viewer/env.example`

**Status:** ⚠️ CONFUSÃO DE CONFIGURAÇÃO
**Problema:** Múltiplos arquivos .env podem causar conflitos
**Recomendação:** 
- Manter apenas `backend/.env` e `backend/.env.example`
- Documentar claramente qual arquivo usar
- Remover `.env` e `.env.local` da raiz se não forem usados

### 5. **Arquivos de Documentação Temporários**

#### `/pr010.diff`
- **Status:** ⚠️ Arquivo de diff de PR
- **Problema:** Arquivo de controle de versão que não deveria estar commitado
- **Ação:** DELETAR ou adicionar ao .gitignore

#### `/bugfix-2026-01-23.md`
- **Status:** ✅ OK - Documentação útil
- **Recomendação:** Mover para `/docs/bugfixes/` para melhor organização

---

## ✅ Estrutura Atual de Arquivos Ativos

### **Entrada da Aplicação**

| Arquivo | Status | Uso |
|---------|--------|-----|
| `/main.py` | ✅ ATIVO | Entry point desktop app (Pygame + MIDI) |
| `/viewer/index.tsx` | ✅ ATIVO | Entry point frontend (React) |
| `/backend/app/main.py` | ✅ ATIVO | Entry point API FastAPI |
| `/Makefile` | ✅ ATIVO | Comandos de build/run |
| `/vite.config.ts` | ✅ ATIVO | Config do Vite (frontend) |

### **Core do Viewer (Frontend)**

**Ativos e Necessários:**
- `lesson-orchestrator.ts` - Orquestrador de carregamento
- `osmd-controller.ts` - Controller da partitura
- `piano-roll-controller.ts` - Falling notes
- `local-transport-driver.ts` - Clock local ⭐ NOVO
- `lesson-engine.ts` - Engine cliente ⭐ NOVO
- `mapping-engine.ts` - Mapeamento de notas
- `analytics-client.ts` - Cliente de analytics
- `webmidi-service.ts` - Serviço Web MIDI

**Possivelmente Obsoletos:**
- `transport-client.ts` - Substituído por local-transport-driver? ⚠️
- `lesson-clock.ts` - Verificar se ainda é usado ⚠️

### **Backend**

Estrutura parece limpa, sem arquivos legados óbvios na pasta `/backend`.

---

## 🔍 Problemas Arquiteturais Identificados

### 1. **Migração Incompleta**
- Sistema está migrando de "Server-Driven" para "Client-Driven"
- Arquivos antigos (transport-client.ts) ainda presentes
- Duplicação de lógica entre cliente e servidor

### 2. **Desorganização de Arquivos de Config**
- Múltiplos .env sem documentação clara
- Arquivos na raiz que deveriam estar em subpastas
- Metadatas duplicados

### 3. **Arquivos de Teste na Raiz**
- `index-1.tsx`, `json`, arquivos de diff
- Deveriam estar em .gitignore ou pastas apropriadas

---

## 📋 Checklist de Limpeza

### Prioridade ALTA (Deletar Imediatamente)

- [ ] `/index.tsx` (vazio)
- [ ] `/index-1.tsx` (vazio)
- [ ] `/viewer/index-antigo.tsx` (legado completo)
- [ ] `/run_legacy_temp.py` (referencia pasta inexistente)

### Prioridade MÉDIA (Verificar e Decidir)

- [ ] `/json` - Verificar conteúdo
- [ ] `/metadata.json` e `/metadata-1.json` - Verificar uso
- [ ] `/pr010.diff` - Remover ou gitignore
- [ ] `/viewer/test.tsx` - Verificar se é usado
- [ ] `/viewer/transport-client.ts` - Verificar importações
- [ ] `/viewer/transport-client.test.ts` - Depende do acima
- [ ] `/viewer/lesson-clock.ts` - Verificar se ainda é necessário

### Prioridade BAIXA (Organização)

- [ ] Consolidar arquivos .env (mover para /backend apenas)
- [ ] Mover `/bugfix-2026-01-23.md` para `/docs/bugfixes/`
- [ ] Documentar no README qual .env usar
- [ ] Criar .gitignore para arquivos temporários (*.diff, *-1.*, etc)

---

## 🎯 Recomendações

### 1. **Limpeza Imediata**
```bash
# Deletar arquivos vazios/legados
rm index.tsx index-1.tsx
rm viewer/index-antigo.tsx
rm run_legacy_temp.py

# Mover documentação
mkdir -p docs/bugfixes
mv bugfix-2026-01-23.md docs/bugfixes/
```

### 2. **Verificação de Importações**
Rodar um grep para verificar se algum arquivo importa os "possivelmente obsoletos":
```bash
grep -r "transport-client" viewer/ --exclude-dir=node_modules
grep -r "lesson-clock" viewer/ --exclude-dir=node_modules
```

### 3. **Consolidação de Configuração**
- Manter apenas `backend/.env` e `backend/.env.example`
- Adicionar no README qual arquivo usar
- Adicionar no .gitignore: `.env*` na raiz

### 4. **Padrão de Nomenclatura**
Evitar arquivos com sufixos como `-1`, `-antigo`, `-temp`:
- Usar branches git para versões antigas
- Deletar arquivos obsoletos
- Usar .gitignore para temporários

---

## 📊 Resumo Executivo

| Categoria | Quantidade | Ação |
|-----------|------------|------|
| Arquivos vazios | 2 | Deletar |
| Arquivos legados | 2 | Deletar |
| Scripts temporários | 1 | Deletar |
| Possivelmente obsoletos | 4 | Verificar |
| Desorganização config | 5 arquivos .env | Consolidar |
| Total para revisão | **14 arquivos** | |

**Ganho estimado:** 
- Redução de ~100KB de código duplicado
- Clareza na estrutura do projeto
- Evitar confusão entre versões
- Build mais rápido (menos arquivos)

---

## 🚀 Próximos Passos Recomendados

1. ✅ **Backup:** Fazer commit antes de deletar (git commit atual)
2. 🗑️ **Deletar:** Arquivos de prioridade ALTA
3. 🔍 **Verificar:** Rodar grep para imports dos arquivos de prioridade MÉDIA
4. 🧪 **Testar:** Rodar `make install && make backend && make desktop`
5. 📝 **Documentar:** Atualizar README com estrutura limpa
6. ✨ **Git:** Commitar limpeza com mensagem clara

**Comando para teste após limpeza:**
```bash
make install
make backend  # Terminal 1
make desktop  # Terminal 2 (ou usar scripts/dev.sh)
```
