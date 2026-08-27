# AGORA Workshop — Auditoría final de cierre de Phase 0 y Phase 0.1

**Fecha de auditoría:** 2026-08-27  
**Instrumento auditado:** `agora-phase0@0.1.0`  
**Commit de código bajo prueba:** `af327f399fb8ffdb0bd0565242006681f88c1f2f`  
**Rama:** `agent/phase0-1-robustness`  
**Proveedor live de cierre:** NVIDIA vLLM en GPU 0 del nodo autorizado  
**Resultado:** **GO / READY para el siguiente experimento controlado**

## 1. Veredicto

La implementación y la evidencia operacional de Phase 0/0.1 están cerradas:

- Gates 1, 2 y 3: **PASS**.
- M1–M30 en la campaña live: **PASS**.
- `ready=true` y `phase0_validated=true` en el paquete final.
- 407 tests automatizados pasaron en 38 archivos.
- `npm run build` pasó.
- `npm audit --audit-level=high` pasó con 0 vulnerabilidades.
- `npm audit --omit=dev --audit-level=high` pasó con 0 vulnerabilidades.
- `git diff --check` pasó.
- El paquete live fue copiado al nodo y sus hashes de DB, manifest y preflight coinciden con los artefactos locales.

Este veredicto certifica el **aparato experimental**: routing, permisos, persistencia, trazabilidad, retries, recuperación, exportación, aislamiento de contexto, gateway de herramientas y adaptación a un proveedor live. No certifica todavía que los agentes exhiban deliberación, persuasión, coaliciones, convergencia, inteligencia colectiva o comportamiento humano. Esas son preguntas de Phase 1 y posteriores.

Existe una salvedad de gobernanza: el PDF de referencia sigue siendo un protocolo **Draft v0.9** y no contiene una Table 4 canónica de aceptación. El repositorio ahora contiene la matriz ejecutable M1–M30 en [`docs/phase0_acceptance_matrix.md`](../phase0_acceptance_matrix.md), pero la aprobación formal del protocolo y de este cierre todavía requiere el visto bueno del equipo/Simon si “oficial” significa aprobación institucional, no solo cierre técnico reproducible.

## 2. Qué significa “mock” en esta auditoría

Un mock es un proveedor controlado que simula la interfaz del modelo sin consultar un modelo externo. Sirve para probar la infraestructura con respuestas reproducibles y sin costo, pero **no** demuestra capacidad semántica ni comportamiento social.

Se usaron dos funciones distintas:

| Proveedor | Uso | Qué demuestra |
|---|---|---|
| `mock_deterministic` | routing, persistencia, retries y fault injection | que el orquestador clasifica, registra y recupera fallos de forma controlada |
| `mock_context_contract` | contexto, memoria y summaries | que el modelo recibe exactamente el contexto autorizado y que los resúmenes conservan procedencia, alcance e integridad extractiva |

La evidencia de comportamiento del modelo no se derivó del mock. Para cerrar M30 se usó el proveedor real NVIDIA vLLM.

## 3. Alcance y regla de aceptación

La auditoría cubrió:

1. Phase 0 original: M1–M18.
2. Fortalecimientos de revisión: M19–M22.
3. Phase 0.1: M23–M30.
4. Tests unitarios/integrales, build, dependencias y consistencia del bundle.
5. Preflight y campaña live contra NVIDIA vLLM.
6. Proveniencia, hashes, recuperación SQLite y replay.

La regla ejecutable es:

- Gates 1–3 deben estar en `PASS`.
- Una campaña mock debe demostrar M23–M29, pero M30 queda `NOT_EXERCISED` porque un mock no es un proveedor live.
- El cierre operacional live exige M23–M30 en `PASS`, paquete enlazado con baseline, réplica, fault run y moderador scripted, y todos los Gates 1–3 en `PASS`.

La campaña final cumple la regla completa.

## 4. Fuentes y proveniencia

### 4.1 Fuentes normativas y de diseño

- Protocolo entregado por el usuario: `AGORA Workshop Technical Architecture and Experimental Protocol v0.9 (1).pdf`.
- Diseño de robustez: `docs/superpowers/specs/2026-08-18-phase0-1-robustness-design.md`.
- Matriz canónica implementada: `docs/phase0_acceptance_matrix.md`.
- Código de aceptación: `src/acceptance/metrics.ts`, `src/acceptance/phase01.ts`, `src/acceptance/gates.ts`.
- Contrato del bundle: `src/export/bundleContract.ts`.
- Workflow de CI: `.github/workflows/phase0.yml`.

### 4.2 Evidencia mock

- Campaña: `phase0_1_mock_campaign_20260827_141432_7fad82ac`.
- DB temporal: `C:\Users\Pc\AppData\Local\Temp\agora_phase0_1_mock_20260827_141432_7fad82ac.sqlite`.
- Baseline mock: `run_1c6850ac-3e0a-4be5-9560-420f8fcef498`.
- Réplica mock: `run_39f3e2ea-045c-40df-8ef4-9af6ddc1dfc5`.
- Fault demo mock: `run_3b8bc808-4167-4477-9a98-26f7a0cbdcbc`.
- Hash baseline/context-contract: `sha256:8b7e7008c65eb004685d9f5dfdfcab97c161088be08fa3e5dcafa474658d8f22`.
- Hash fault demo: `sha256:bdc1df6f6136d364092f162dd1affceacefde6f22db2af0ec0c0b0de417a24ef`.

### 4.3 Evidencia live NVIDIA

- Campaña final: `phase0_1_nvidia_vllm_campaign_final_20260827_143300_718b956f`.
- DB temporal: `C:\Users\Pc\AppData\Local\Temp\agora_phase0_1_nvidia_vllm_0e7cb258-db3d-4345-83e3-4fbdf9ddb9f7.sqlite`.
- Preflight final: `phase0_1_nvidia_vllm_preflight_final_20260827_143240_b2382025`.
- Baseline: `run_0f4289a2-66fb-4c27-9e2e-6b3134e1a7e3`.
- Réplica exacta: `run_a0ae8302-0ba2-4b2a-8823-323043cdb480`.
- Fault run: `run_e639a713-7f38-4602-8861-8b9c82eb6f8a`.
- Moderador scripted enlazado: `run_54694454-374b-45f6-9114-f56325e52610`.
- Hash baseline/réplica: `sha256:4293a599a125e4fe009e23ffb8bb9443624d8e47e4c50874d33c993a1785c555`.
- Hash fault run: `sha256:7fd6015ffe8d62fb247752167c6d9441509bd2f44eb9c13b3cea99b953bb7e85`.
- Hash moderador scripted: `sha256:12538c902c920648dad344cb23b8b85b17ad80dcd9ce4aba93610e1225ed6caa`.
- Manifest local SHA-256: `ee99fab6057bc8145771296e29473e1907c0f835a02487bc8bf431630685349f`.
- DB local SHA-256: `36632d8b5504504ff0e46f42c1171ae5ad3cdc1b8e0b978056a7bc688becf412`.
- Preflight local SHA-256: `ff077c4509e982684524fe3bccc55c3faf46fad96fc1cf8497e952212a62a750`.

El archivo remoto `live_campaign.sqlite`, el manifest y el preflight coinciden con esos hashes locales. El paquete live tiene 124 archivos y 4,874,885 bytes; el manifest registra 23 artefactos requeridos y 18 `trace_id`.

## 5. Proveedor y entorno live

Se eligió NVIDIA para el cierre primario porque permite congelar con mayor precisión modelo, versión del servidor, GPU, parámetros, latencia y logs. AWS Bedrock no era necesario para cerrar Phase 0.1; queda como validación cross-provider independiente y no debe mezclarse con la misma condición experimental.

| Campo | Evidencia |
|---|---|
| Host lógico | `mit-critical-data-1` |
| Host remoto observado | `brev-pzwlliwrl` |
| GPU usada | GPU 0, NVIDIA H100 80 GB HBM3 |
| Endpoint | `http://127.0.0.1:18002/v1` mediante túnel SSH local |
| Servicio observado | vLLM `0.25.1` |
| Modelo servido | `leoclaw-qwen3-32b` |
| Contexto máximo | 16,384 tokens |
| Contrato | `POST /v1/chat/completions` |
| Preflight | `/v1/models`, `/version` y chat bounded exitosos |
| Autorización | No se registró ni exportó ninguna credencial; endpoint local sin API key configurada |

El servicio vLLM ya estaba ejecutándose en el nodo. La campaña no detuvo, reinició ni reconfiguró servicios de otros proyectos. El preflight y la campaña registran explícitamente lo que no se pudo atribuir al deployment, en vez de inventar proveniencia.

## 6. Campañas ejecutadas

| Corrida | Proveedor/modelo | Estado | Oportunidades | Invocaciones | Mensajes | Eventos | Observación |
|---|---|---:|---:|---:|---:|---:|---|
| NVIDIA baseline | `nvidia_vllm / leoclaw-qwen3-32b` | COMPLETED | 18 | 18 | 14 públicas + 4 privadas | 172 | Hash baseline |
| NVIDIA réplica | `nvidia_vllm / leoclaw-qwen3-32b` | COMPLETED | 18 | 18 | 14 públicas + 4 privadas | 171 | Mismo hash, distinto run ID |
| NVIDIA faults | `nvidia_vllm / leoclaw-qwen3-32b` | COMPLETED | 18 | 22 | 14 públicas + 4 privadas | 194 | 4 fallos del proveedor + 1 tool fault |
| NVIDIA moderator pair | agentes NVIDIA + moderator scripted | COMPLETED | 18 | 18 | 14 públicas + 4 privadas | — | 5 invocaciones scripted, 5 mensajes |

En el fault run hubo 18 éxitos, 4 invocaciones fallidas, 4 retries del proveedor y 1 retry de herramienta. Los fallos de proveedor fueron `malformed_response`, `provider_error`, `rate_limit` y `timeout`; el fallo de herramienta fue `tool_timeout` seguido de éxito.

## 7. Resultado de Gates 1–3

| Gate | Nombre | Resultado | Evidencia principal |
|---|---|---|---|
| Gate 1 | Infrastructure validated | **PASS** | 18/18 oportunidades terminales; 172 eventos contiguos; routing público/privado correcto; 46 deliveries únicas; 23 artefactos requeridos |
| Gate 2 | Failure attribution validated | **PASS** | 4 fallos de proveedor + tool fault clasificados; retries trazables; fallos separados de comportamiento; presupuesto contabilizado |
| Gate 3 | Baseline reproducible | **PASS** | snapshot completo; hash reproducible; commit/modelo/parámetros registrados; dos corridas completas con el mismo hash |

## 8. Auditoría completa M1–M30

### 8.1 M1–M8, M19 y M21 — infraestructura

| ID | Métrica y criterio | Resultado numérico live | Estado |
|---|---|---|---|
| M1 | Cobertura de oportunidades; 100% terminal | 18/18 oportunidades con resultado terminal explícito | **PASS** |
| M2 | Integridad de secuencia; 0 errores | 172 eventos, secuencia continua 1..172; mensajes unidos a evento fuente | **PASS** |
| M3 | Routing público; esperado = observado | 42/42 deliveries públicas esperadas; 14 mensajes públicos | **PASS** |
| M4 | Aislamiento privado; exposiciones no autorizadas = 0 | 4 mensajes privados; 120 referencias de contexto rederivadas; 0 fugas | **PASS** |
| M5 | Máquina de estados; transiciones ilegales = 0 | 6 transiciones legales hasta `COMPLETED`; 0 rechazadas | **PASS** |
| M6 | Ejecución acotada | Corrida `COMPLETED`; límites de duración, llamadas, tokens, timeout y retries configurados | **PASS** |
| M7 | Persistencia íntegra | Run, config, eventos, oportunidades, invocaciones, mensajes, deliveries, transiciones y proveniencia persistidos | **PASS** |
| M8 | Exportación; 100% de artefactos | 23/23 artefactos requeridos presentes y hasheados | **PASS** |
| M19 | Igualdad del contexto autorizado | 18/18 contextos exactamente iguales al conjunto visible rederivado; 0 omisiones y 0 excedentes | **PASS** |
| M21 | Unicidad de delivery | 46/46 pares mensaje-receptor distintos; 0 duplicados | **PASS** |

### 8.2 M9–M12, M20 y M22 — fallos, retries y presupuesto

| ID | Métrica y criterio | Resultado numérico live | Estado |
|---|---|---|---|
| M9 | Clasificación; 100% de fallos no exitosos clasificados | 4/4 invocaciones no exitosas con clase explícita | **PASS** |
| M10 | Separación infraestructura/comportamiento | 0 fallos de infraestructura contabilizados como conducta; 0 silencios conductuales falsos | **PASS** |
| M11 | Trazabilidad de retry; retries huérfanos = 0 | 4/4 retries del proveedor unidos a intento padre, tipo de fallo y timestamp | **PASS** |
| M12 | Fault injection controlado | 5/5 condiciones declaradas detectadas/clasificadas: cuatro del proveedor y `tool_timeout` | **PASS** |
| M20 | Idempotencia de acciones | 4 oportunidades reintentadas; cada una produjo como máximo un mensaje; 0 acciones duplicadas | **PASS** |
| M22 | Contabilidad de presupuesto | 22/22 intentos cobrados exactamente una vez, incluidos los 4 reintentos del proveedor | **PASS** |

La matriz mock adicional ejercitó las cuatro clases de herramientas: `tool_timeout`, `tool_unavailable`, `tool_invalid_response` y `permission_denied`, además de tres llamadas exitosas. La corrida live ejercitó end-to-end timeout de herramienta y recuperación posterior.

### 8.3 M13–M18 — configuración y reproducibilidad

| ID | Métrica y criterio | Resultado numérico live | Estado |
|---|---|---|---|
| M13 | Snapshot inmutable; campos requeridos = 100% | 15/15 campos requeridos presentes | **PASS** |
| M14 | Fingerprint determinista | Mismo snapshot → mismo hash; mutar parámetro → hash distinto; hash `4293a…` | **PASS** |
| M15 | Proveniencia código/deployment | Commit `af327f399fb8`; versión `0.1.0`; valores no disponibles declarados como tales | **PASS** |
| M16 | Proveniencia de invocaciones | 18/18 invocaciones con proveedor, modelo, prompt, política, contexto y outcome | **PASS** |
| M17 | Integridad de contexto | 18/18 contextos resuelven a mensajes persistidos; separación pública/privada correcta | **PASS** |
| M18 | Evidencia repetida | 2 corridas completas, IDs distintos, mismo hash `4293a…` | **PASS** |

### 8.4 M23–M30 — robustez Phase 0.1

| ID | Métrica y criterio | Resultado numérico live | Estado |
|---|---|---|---|
| M23 | Contrato de contexto | 18/18 invocaciones con joins completos de contexto, IDs autorizados, contexto renderizado y summaries | **PASS** |
| M24 | Summaries auditables | 24/24 summaries con procedencia, scope, orden e integridad extractiva; IDs/hash de fuentes registrados | **PASS** |
| M25 | Trace completeness | 18 oportunidades y registros dependientes unidos por `trace_id`; deliveries, retries y manifest verificados | **PASS** |
| M26 | Atribución de tool gateway | Corrida live: 2 llamadas, timeout + éxito; matriz mock: timeout, unavailable, invalid response y permission denied; privacidad preservada | **PASS** |
| M27 | Idempotencia de recuperación | 18 checkpoints; fixture de resume; 0 acciones duplicadas; matriz de restart de 4 puntos pasó en tests | **PASS** |
| M28 | Backup/restore | Backup de 2,183,168 bytes; SHA-256 `d0bd…`; 172 eventos restaurados; 10 tablas requeridas; replay=1; 24 hashes de artefactos restaurados | **PASS** |
| M29 | Límites del moderador | 5 invocaciones scripted y 5 mensajes; 0 contexto privado; 0 transiciones de estado atribuidas al moderador | **PASS** |
| M30 | Canary live | Baseline + réplica + fault run + moderator pair, todos completos y enlazados; Gates 1–3 PASS | **PASS** |

### 8.5 Resumen cuantitativo

| Grupo | PASS | FAIL | NOT_EXERCISED |
|---|---:|---:|---:|
| M1–M30, campaña live final | 30 | 0 | 0 |
| Gates 1–3, campaña live final | 3 | 0 | 0 |
| Mock closure | M23–M29 | 0 | M30, correctamente no aplicable a mock |

## 9. Qué se implementó para cerrar las brechas

| Brecha histórica | Implementación actual | Evidencia de cierre |
|---|---|---|
| Summaries crudos sin auditoría | summaries rolling separados por scope, IDs fuente, hashes, versión y contrato de integridad | M23/M24; 24 summaries live; rubric exportado |
| Trazabilidad parcial | `trace_id` enlaza opportunity → invocation → retry/tool → message → delivery → análisis/manifest | M25; pruebas de huérfanos |
| Tool gateway incompleto | gateway determinista, permisos por agente, resultados privados y fault injection | M26; matriz mock completa y timeout live |
| Resume no real | checkpoints persistentes, reanudación, deduplicación y restart matrix | M27; 4 cut points en tests |
| Backup débil | backup SQLite, restore, validación de tablas/eventos, regeneración de exports, hashes y replay | M28; 172 eventos restaurados |
| Mock poco informativo | `mock_deterministic` + `mock_context_contract` | M23–M29 mock PASS |
| M30 permisiva | M30 exige baseline, réplica exacta, fault run, moderator pair, exports y Gates 1–3 PASS | M30 live PASS |
| Moderador no verificable | condición scripted fija, no acceso privado, no state transitions como agente, salida registrada | M29 PASS |
| Configuración insuficiente | configs dedicadas para context contract, tool faults, restart, moderator y NVIDIA live | 6 configuraciones versionadas |
| Proveniencia NVIDIA ausente | adaptador explícito `nvidia_vllm`, probe `/v1/models`/`/version`/chat y metadata segura | preflight PASS; M15/M16 |
| CI/revisión local incompleta | workflow con Node 22, tests, build, diff check y audit de producción | `.github/workflows/phase0.yml` |
| Vulnerabilidad `nanoid` | lockfile actualizado de 3.3.17 a 3.3.18 | auditorías completa y de producción: 0 vulnerabilidades |

## 10. Validaciones ejecutadas

```text
38 test files passed
407 tests passed
npm run build                           PASS
npm audit --audit-level=high            PASS (0 vulnerabilities)
npm audit --omit=dev --audit-level=high PASS (0 vulnerabilities)
git diff --check                         PASS
```

Las pruebas específicas de robustez cubren backup/restore/replay, matriz de restart, matriz de tool faults, completitud de traces, aceptación M30 y contrato semántico de contexto.

El preflight live ejecutó, sin revelar secretos:

1. consulta de modelos en `/v1/models`;
2. lectura de versión en `/version`;
3. una llamada bounded a `/v1/chat/completions` con `max_tokens=16` y razonamiento deshabilitado.

Las tres comprobaciones fueron exitosas.

## 11. Cierre de hallazgos de la auditoría anterior

| Hallazgo | Estado final |
|---|---|
| F-01 M30 no ejecutada | **CERRADO técnicamente:** M30 live PASS; formal signoff sigue siendo gobernanza |
| F-02 protocolo draft/Table 4 ausente | **PARCIAL:** matriz canónica M1–M30 agregada; el PDF v0.9 aún requiere congelamiento/aprobación humana |
| F-03 configs prometidas ausentes | **CERRADO:** configs context, tools, restart, moderator y live agregadas |
| F-04 M30 demasiado débil | **CERRADO:** M30 exige paquete live enlazado y Gates 1–3 PASS |
| F-05 solo moderator scripted | **CERRADO para el límite de Phase 0:** scripted fue ejecutado; la comparación conductual LLM vs scripted queda fuera del cierre de aparato |
| F-06 matriz tool faults incompleta | **CERRADO:** cuatro clases en mock; timeout/recovery en live |
| F-07 restart matrix incompleta | **CERRADO:** cuatro puntos de corte en tests y resume integrado |
| F-08 backup/restore débil | **CERRADO:** restore, hashes de artefactos y replay verificados |
| F-09 trace incompleto | **CERRADO:** deliveries, retries, semantic rows y manifest incluidos |
| F-10 “fidelity” semántica sobreafirmada | **CERRADO como claim:** M24 se limita a integridad extractiva; revisión humana semántica queda explícitamente pendiente |
| F-11 CI/re-review ausentes | **PARCIAL:** CI agregado; estado de checks remotos y re-review de Simon dependen de la rama/PR en GitHub |
| F-12 bundles/conteos inconsistentes | **CERRADO en contrato actual:** 23 artefactos requeridos, manifest único y hashes; bundles de evidencia permanecen fuera del árbol Git |
| F-13 vulnerabilidad dev `nanoid` | **CERRADO:** `nanoid@3.3.18`, 0 vulnerabilidades en auditoría completa |
| F-14 `diff --check` no limpio | **CERRADO:** check limpio |
| F-15 nomenclatura/documentación divergente | **CERRADO:** `NOT_EXERCISED`, nombres de faults y configs alineados |

## 12. Límites residuales y lo que no debe afirmarse

1. **Gobernanza:** el documento fuente sigue Draft v0.9; falta la aprobación formal de la matriz si el equipo exige una versión institucional congelada.
2. **Semántica:** el summarizer es extractivo. M24 prueba procedencia e integridad criptográfica, no que el resumen preserve significado. El bundle contiene `semantic_review_rubric.md`, pero no una revisión humana completada.
3. **Comportamiento:** la campaña de 3 agentes es un canary corto de proveedor. No es Phase 1A ni evidencia de interacción social.
4. **Proveedor:** el servicio vLLM y sus pesos eran un deployment externo ya operativo. AGORA registra su identidad observada, pero no administra su ciclo de vida.
5. **AWS:** no se ejecutó Bedrock. No bloquea este cierre NVIDIA; debe usarse después como réplica cross-provider separada, con su propio hash, snapshot y paquete.
6. **Mock:** ningún resultado mock debe interpretarse como inteligencia o conducta del agente.
7. **Scope privado:** la corrida ejercitó canal privado/breakout; el caso de mensajes direct-private debe mantenerse como una prueba adicional si se incorpora ese modo al protocolo.

## 13. Decisión de cierre

**Decisión técnica:** **GO**. Phase 0 y Phase 0.1 están suficientemente robustas y reproducibles para iniciar un experimento conductual controlado, manteniendo congelados proveedor, configuración, prompts, roles, presupuesto y esquema de evidencia.

**Decisión científica:** no se emite todavía una conclusión sobre el comportamiento de los agentes. La próxima fase debe comparar agentes diferenciados por role pack contra el control de prompts/capacidades idénticas y conservar la separación entre comportamiento observado y fallos de infraestructura.

**Decisión institucional:** para declarar “cierre oficial” ante terceros, Simon/equipo debe revisar el commit final, aprobar `docs/phase0_acceptance_matrix.md` como tabla canónica y conservar el paquete live en almacenamiento inmutable. AWS Bedrock puede complementar después, pero no sustituye ni invalida la evidencia NVIDIA ya obtenida.

