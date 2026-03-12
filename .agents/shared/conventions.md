---
name: conventions
description: Padrão canônico de frontmatter, regras globais e referência rápida para todos os agentes.
domain: shared
---

# Convenções Globais do Sistema de Agentes

## Padrão de Frontmatter YAML

```yaml
---
name: kebab-case-sem-sufixo
description: Uma frase. Sem ponto final
domain: orchestration | viewer-engine | catalog | quality | architecture | security | docs | platform | data
triggers:
  - situação concreta que ativa este agente
capabilities:
  - ação concreta que este agente executa
restricted_files:
  - caminho de arquivo que este agente NÃO deve tocar
requires_review_from:
  - nome-do-agente-revisor
---
```

## Referência Rápida — Projeto Piano Trainer

### Pastas canônicas vs legado
| Pasta | Status |
|-------|--------|
| `src/viewer/` | ✅ Canônico — toda implementação vive aqui |
| `viewer/` (raiz) | ❌ Legado — nunca editar |
| `assets/` | ✅ Fonte de verdade do currículo |
| `src/integrations/supabase/` | 🔒 Auto-gerado — nunca editar |

### Módulos críticos (testes obrigatórios ao modificar)
- `src/viewer/lesson-engine.ts`
- `src/viewer/services/lesson-transposer.ts`
- `src/viewer/beat-to-x-mapping.ts`
- `src/viewer/auth-storage.ts`
- `src/viewer/analytics-client.ts`
- `src/viewer/catalog-service.ts`
- `src/viewer/services/taskCompletion.ts`

### Invariantes invioláveis
1. Fire-and-forget nunca bloqueia UI
2. Auth é non-blocking
3. Catálogo funciona offline
4. Imutabilidade em engine/transposer
5. PARTIAL_HIT ≠ HIT
6. Endscreen aparece mesmo sem rede
7. V2 step só avança com todas as notas satisfeitas
8. Guard `completeSent` impede duplicidade
9. Beat-to-X mapping preserva monotonicidade
10. Feature nova = feature flag

### Schemas
- **V1:** Monofônico. `LessonNote` com `midi: number`. 1 nota por step.
- **V2:** Polifônico. `LessonStepV2` com `notes: number[]`. Acordes.

### Modos
- **WAIT:** Tempo para até o aluno acertar.
- **FILM:** Tempo real, notas descem continuamente.

### Config
```
window.__APP_CONFIG__ → /config.json → import.meta.env
```
Nunca ler `import.meta.env` fora de `app-config.ts`.
