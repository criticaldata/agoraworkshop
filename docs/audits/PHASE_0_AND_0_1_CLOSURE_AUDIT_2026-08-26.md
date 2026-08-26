# Auditoría integral de cierre de AGORA Phase 0 y Phase 0.1

| Campo | Valor |
| --- | --- |
| Identificador | AGORA-P0-P01-AUDIT-2026-08-26 |
| Fecha de corte | 2026-08-26 |
| Tipo | Auditoría técnica, de evidencia, alineación metodológica y proveniencia |
| Repositorio | denemlabs/agoraworkshop |
| Rama auditada | agent/phase0-1-robustness |
| Commit auditado | 01f7dd6b064ac1e59be8ef80b5774e25f784a159 |
| Base remota observada | origin/master en 85adbab2b0023db6e9e27b1b0d4d5a676e9eca7c |
| PR | [#2 — Harden Phase 0.1 experimental controls](https://github.com/denemlabs/agoraworkshop/pull/2) |
| Protocolo de referencia | AGORA Workshop Technical Architecture and Experimental Protocol, Draft v0.9 |
| Decisión global | **NO-GO para declarar oficialmente cerradas Phase 0 + Phase 0.1** |

## 1. Dictamen ejecutivo

La auditoría distingue cuatro afirmaciones que no deben mezclarse:

| Afirmación | Dictamen | Evidencia principal |
| --- | --- | --- |
| El núcleo determinista de Phase 0 funciona bajo mock | **PASS / validado** | Gates 1–3 y M1–M22 en PASS; baseline, réplica y fault run completados |
| El paquete mock de robustez Phase 0.1 satisface las métricas implementadas M23–M29 | **PASS condicionado** | M23–M29 en PASS en la corrida fresca |
| Phase 0.1 está validada de extremo a extremo con proveedor real | **NO** | M30 = NOT_EXERCISED; no existe paquete live canary ejecutado |
| Phase 0 y Phase 0.1 pueden declararse oficialmente cerradas y listas para Phase 1 | **NO-GO** | El propio artefacto reporta ready=false; existen brechas entre especificación y comprobación, protocolo aún Draft v0.9 y PR sin aprobación |

El resultado oficial generado por el repositorio para Phase 0.1 fue:

- Gates de Phase 0: los tres en PASS.
- M23–M29: PASS.
- M30: NOT_EXERCISED.
- phase0_validated: false.
- ready_for_controlled_behavioral_experiment: false.
- Pendiente declarado: live canary con proveedor no mock.

Por tanto, la formulación defendible es:

> Phase 0 está validada como aparato determinista bajo mock en el commit auditado. El núcleo mock de Phase 0.1 pasa M23–M29, pero Phase 0.1 operacional y el cierre conjunto permanecen abiertos hasta ejecutar M30 y resolver las brechas de conformidad documentadas en esta auditoría.

Esta auditoría no valida deliberación, persuasión, coaliciones, personalidad, inteligencia social ni equivalencia con seres humanos. Phase 0 prueba el instrumento, no el comportamiento.

## 2. Preguntas de auditoría

La revisión responde:

1. ¿Qué exige el protocolo v0.9 para Phase 0?
2. ¿Qué implementa realmente el repositorio?
3. ¿Qué se ejecutó de nuevo y con qué configuración?
4. ¿Qué resultados numéricos produjeron M1–M30?
5. ¿Los artefactos y hashes son íntegros?
6. ¿Los tests y la compilación pasan?
7. ¿Las métricas comprueban exactamente los criterios que dicen comprobar?
8. ¿La rama está sincronizada, libre de conflictos y aprobada?
9. ¿Qué soporte científico tiene el diseño y qué no demuestra ese soporte?
10. ¿Qué falta para un cierre oficial reproducible?

## 3. Alcance y método

### 3.1 Material auditado

- Protocolo PDF v0.9 y su fuente DOCX.
- Presentación técnica v1.0 y guion de presentación como material secundario.
- [README del repositorio](../../README.md).
- [Limitaciones conocidas](../known-issues.md).
- [Diseño de robustez Phase 0.1](../superpowers/specs/2026-08-18-phase0-1-robustness-design.md).
- [Plan de implementación](../superpowers/plans/2026-08-18-phase0-1-robustness-implementation.md).
- Código de configuración, orquestación, persistencia, exportación y aceptación.
- Tests automatizados.
- Estado Git local/remoto y estado del PR #2.
- Dos paquetes de validación frescos generados específicamente para esta auditoría.

### 3.2 Acciones ejecutadas

- Lectura textual y revisión visual del protocolo.
- Inspección estructural de la fuente DOCX.
- Revisión de definiciones y condiciones de M1–M30.
- Ejecución fresca de Phase 0 baseline/rerun/fault.
- Ejecución fresca de Phase 0.1 baseline/rerun/fault/recovery/backup.
- Recomputación independiente de SHA-256 y tamaños de todos los archivos enumerados por cada manifest.
- Ejecución de 382 tests y compilación TypeScript.
- Comprobación de merge con origin/master mediante git merge-tree.
- Revisión de estado del PR y ausencia de CI.
- Auditoría de dependencias npm de producción y desarrollo.
- Comprobación bibliográfica mínima contra arXiv, W3C, OpenTelemetry y metadatos DOI/Crossref.

### 3.3 Límites de esta auditoría

- No se dispuso de OPENAI_API_KEY ni ANTHROPIC_API_KEY; no hubo ejecución live.
- No se realizó pentest, fuzzing exhaustivo, load test distribuido ni auditoría formal de privacidad.
- No se reprodujo el experimento en una segunda máquina o sistema operativo.
- No se realizó revisión sistemática de literatura ni metaanálisis.
- La fuente interna [13], transcripción de la reunión del 21 de julio, no está en el repositorio y no pudo verificarse.
- Los bundles frescos son artefactos locales ignorados por Git; sus resultados y hashes quedan registrados aquí, pero deben archivarse externamente para revisión de terceros.

## 4. Proveniencia de los documentos fuente

| Documento | Bytes | SHA-256 |
| --- | ---: | --- |
| AGORA Workshop Technical Architecture and Experimental Protocol v0.9 (1).pdf | 4,543,362 | cccabfc2496af7f3630833f887159b0920a41a5bde52d6ccced88e4dc5642a6d |
| AGORA_Workshop_Technical_Architecture_and_Experimental_Protocol_v0.9.docx | 6,639,773 | 6def9c5eaa1fb2459da05010b0cde325401b340be13cff041a36c8646a99b7fa |
| AGORA_Workshop_Slide_by_Slide_Speaker_Script.pdf | 97,379 | 07ef6aa9ec2df0c63b3f21f781d9874d7c74fbfbedb200f0744c3fb21a93c6a4 |
| AGORA_Workshop_Technical_Presentation_v1.0.pptx | 5,654,650 | 056b1bd155fec29d46c0d25c977e51d89eabee3110862673ad2a084dd05509aa |

El protocolo se identifica expresamente como:

- “Technical proposal — Draft v0.9 for team review”.
- Propuesta interna de ingeniería de investigación.
- Documento que condiciona las afirmaciones científicas a experimentos replicados y prohíbe generalizarlas a humanos sin validación independiente.

### 4.1 Defecto estructural del protocolo

La revisión visual del PDF y la inspección de la fuente DOCX detectaron:

- 131 párrafos y 10 objetos de tabla en el DOCX.
- Existe la leyenda “Table 4. Minimum acceptance criteria for the first end-to-end pilot”, pero no existe la tabla de criterios.
- Existen las leyendas de Table 7 y Table 8, una seguida de la otra, sin tablas asociadas.
- Después de la leyenda de Table 4 aparece el objeto correspondiente al paquete de trabajo, no una tabla de aceptación.
- La numeración también omite leyendas de Table 2 y Table 5 en la secuencia de párrafos.

Consecuencia: el protocolo v0.9 no contiene una matriz canónica y aprobada de aceptación para cerrar el primer piloto. M1–M30 son criterios del repositorio y del diseño interno de Phase 0.1; no pueden presentarse como una transcripción exacta de una tabla de aceptación congelada en el protocolo.

Este defecto documental es un bloqueo de gobernanza para la palabra “oficialmente”. Los tests pueden demostrar que el código satisface sus reglas, pero no que esas reglas fueron formalmente aprobadas por el protocolo cuando la tabla correspondiente está ausente.

## 5. Requisitos del protocolo y alineación

La sección 3.1 del protocolo pide usar dos o tres agentes internos y un moderador para validar routing, permisos, logging, retries, persistencia de configuración, summarization de contexto y exportación; además exige inyectar timeouts, rate limits, respuestas malformadas y errores de herramientas antes de estudiar comportamiento.

| Requisito v0.9 | Evidencia actual | Estado auditado |
| --- | --- | --- |
| 2–3 agentes internos + moderador | Los paquetes frescos usan 5 participantes + moderador | **PARCIAL / desalineado en topología** |
| Routing público | M3: 100/100 entregas públicas | **CUMPLE bajo mock** |
| Permisos y aislamiento privado | M4: 0 exposiciones en 107 referencias; 5 mensajes privados | **CUMPLE bajo mock** |
| Logging estructurado | M2: 279 eventos contiguos; mensajes unidos a evento fuente | **CUMPLE bajo mock** |
| Retries visibles | Fault run: 5 retries, todos enlazados | **CUMPLE para fallos de proveedor** |
| Persistencia de configuración | Snapshot de 15 campos, hash reproducible | **CUMPLE** |
| Context summarization | 32 resúmenes extractivos con IDs y hashes | **CUMPLE como contrato infra; no como fidelidad semántica** |
| Exportación de artefactos | 21/21 archivos de manifest verificados | **CUMPLE** |
| Timeout | Inyectado y clasificado | **CUMPLE** |
| Rate limit | Inyectado y clasificado | **CUMPLE** |
| Malformed response | Inyectado y clasificado | **CUMPLE** |
| Provider error | Inyectado y clasificado | **CUMPLE adicional** |
| Tool errors | Solo tool_timeout ejercitado de extremo a extremo | **PARCIAL** |
| Live provider path | No ejecutado | **NO CUMPLE / M30 pendiente** |
| Criterios de aceptación congelados | Table 4 ausente; protocolo Draft v0.9 | **NO CUMPLE como gobernanza** |

La topología de cinco participantes pertenece a Phase 1A según la sección 3.2 del protocolo. El diseño interno de Phase 0.1 también pide una canary live de 2–3 participantes y conserva la corrida de cinco agentes como stress/compatibility test. Esa canary no existe como configuración dedicada en la rama.

## 6. Estado del repositorio y del PR

| Comprobación | Resultado |
| --- | --- |
| HEAD local | 01f7dd6b064ac1e59be8ef80b5774e25f784a159 |
| origin/agent/phase0-1-robustness | Mismo SHA; rama sincronizada |
| origin/master al auditar | 85adbab2b0023db6e9e27b1b0d4d5a676e9eca7c |
| Merge tree | Generado sin conflicto; rama técnicamente mergeable |
| GitHub mergeable | MERGEABLE |
| GitHub merge state | CLEAN |
| Estado PR #2 | OPEN y Draft |
| Decisión de review | CHANGES_REQUESTED |
| CI/checks remotos | 0 checks reportados |
| Última revisión de Simon | Sobre ca4f483; confirmó 12 hallazgos cerrados y encontró 2 blockers de resume |
| Commit posterior | 01f7dd6 corrige los dos blockers y pasa 382 tests |
| Revisión posterior de Simon sobre 01f7dd6 | No consta al corte |

La rama es integrable sin conflictos, pero “mergeable” no equivale a “aprobada”. El PR sigue en Draft, con CHANGES_REQUESTED y sin CI. Por eso no existe cierre administrativo.

El diff contra master contiene 49 archivos, 3,110 inserciones y 135 eliminaciones. git diff --check detectó dos defectos de whitespace no funcionales:

- docs/superpowers/plans/2026-08-18-phase0-1-robustness-implementation.md:121.
- tests/contextContractProvider.test.ts:45.

## 7. Entorno de ejecución

| Componente | Versión |
| --- | --- |
| Sistema | Windows / PowerShell |
| Node.js | v24.18.0 |
| npm | 11.16.0 |
| Git | 2.55.0.windows.1 |
| Paquete | agora-phase0 0.1.0 |
| Requisito declarado | Node >=22 |

Dependencias directas observadas:

- @anthropic-ai/sdk 0.115.0
- better-sqlite3 13.0.3
- cytoscape 3.34.0
- express 5.2.1
- openai 7.4.0
- yaml 2.9.0
- zod 4.4.3
- TypeScript 7.0.2
- Vitest 4.1.10

Seguridad de dependencias:

- npm audit --omit=dev: 0 vulnerabilidades.
- npm audit completo: 1 vulnerabilidad high en nanoid 3.3.17, transitiva por Vitest → Vite → PostCSS.
- Advisory: [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8).

No afecta el árbol de producción reportado por npm, pero debe resolverse antes de declarar el entorno de desarrollo completamente limpio.

## 8. Evidencia experimental fresca

### 8.1 Phase 0 core

Comando auditado:

    AGORA_DB_PATH=phase0_audit_2026-08-26_01f7dd6.sqlite
    npm run agora -- validate --config configs/agora_phase0_mock_baseline.yaml --fault-config configs/agora_phase0_faultdemo_mock.yaml --out phase0_validation/audit_2026-08-26_01f7dd6

| Elemento | Valor |
| --- | --- |
| Baseline | run_b5344a21-7905-42ba-9352-69668bef3796 |
| Réplica | run_639d0501-f9f2-4d95-a3c9-afa55572ed1b |
| Fault run | run_3ec49e66-8391-40af-8e58-d53e222ce37d |
| Baseline config hash | sha256:9aec2b3420a41a0d97835c3815cc8702b899c25bb5de2fac6e8bf4da1c57be5c |
| Fault config hash | sha256:bdc1df6f6136d364092f162dd1affceacefde6f22db2af0ec0c0b0de417a24ef |
| Commit registrado | 01f7dd6b064ac1e59be8ef80b5774e25f784a159 |
| Estado global | ready=true; phase0_validated=true |

Resultados del baseline:

| Medida | Resultado |
| --- | ---: |
| Eventos | 273 |
| Oportunidades | 25 |
| Invocaciones | 25 |
| Mensajes públicos | 20 |
| Mensajes privados | 5 |
| Entregas | 108 |
| Referencias de contexto auditadas | 272 |
| Fugas cross-channel | 0 |
| Transiciones legales | 6 |
| Input tokens mock | 11,338 |
| Output tokens mock | 733 |
| Duración registrada | 65 ms |

Resultados del fault run:

| Medida | Resultado |
| --- | ---: |
| Fallos de infraestructura observados | 6 |
| Categorías | timeout, rate_limit, provider_error, malformed_response |
| Casos inyectados | 4 |
| Clasificación correcta | 4/4 |
| Invocaciones fallidas clasificadas | 6/6 |
| Retries | 5 |
| Éxitos en intento posterior | 3 |
| Oportunidades que agotaron retries | 1 |
| Fallos de infraestructura contados como comportamiento | 0 |
| Intentos cobrados exactamente una vez | 30/30 |

### 8.2 Phase 0.1

Comando auditado:

    AGORA_DB_PATH=phase01_audit_2026-08-26_01f7dd6.sqlite
    npm run agora -- validate --config configs/agora_phase0_1_mock.yaml --fault-config configs/agora_phase0_faultdemo_mock.yaml --out phase0_1_validation/audit_2026-08-26_01f7dd6

El proceso produjo todos los artefactos y terminó con exit code 1 porque ready=false cuando M30 no fue ejercitada. No fue un crash ni un fallo de compilación.

| Elemento | Valor |
| --- | --- |
| Baseline | run_3820de9f-aa1d-4407-87d0-62f5717cf562 |
| Réplica | run_38696e7d-85be-42d5-b053-8b4b585adfe4 |
| Fault run | run_7be74bc5-0442-4e24-a797-06548546b22d |
| Config hash | sha256:eb06891f32c63b34d2d2419352275f74064cace86ad31cc13d8079b2be268f6d |
| Proveedor | mock_context_contract |
| Modelo | mock-context-contract-v1 |
| Participantes | 5 agentes + 1 moderador scripted |
| Estado del baseline | COMPLETED |
| Estado de Phase 0.1 | NOT_EXERCISED por M30 |
| Ready | false |

Resultados del baseline Phase 0.1:

| Medida | Resultado |
| --- | ---: |
| Eventos | 279 |
| Oportunidades | 25 |
| Invocaciones | 25 |
| Model calls | 20 |
| Scripted moderator calls | 5 |
| Mensajes públicos | 20 |
| Mensajes privados | 5 |
| Entregas | 108 |
| Context references auditadas | 107 |
| Fugas cross-channel | 0 |
| Resúmenes | 32 |
| Resúmenes públicos | 24 |
| Resúmenes breakout | 8 |
| Resúmenes direct-private | 0 |
| IDs de resumen distintos | 32/32 |
| Tool calls | 2 |
| Tool timeout | 1 |
| Tool retry exitoso | 1 |
| Checkpoints | 25 |
| Secuencias de checkpoint distintas | 25/25, rango 1–25 |
| Trace index | 25 |
| Trace IDs distintos | 25/25 |
| Entregas con trace_id | 108/108 |
| Backup verificado | 1 |
| Backup bytes | 995,328 |
| Backup SHA-256 | df877a6fb3e28f62af3c42739c182b278e0048d759cb9fa32f28d26e0d4512bd |
| Eventos recuperados en backup | 279 |
| Duración registrada | 150 ms |
| Tokens reportados | 0 input / 0 output |

Los tokens son cero porque el proveedor contractual y el moderador scripted no reportan uso; no representan costo o consumo de un modelo real.

## 9. Auditoría completa M1–M22

Los siguientes resultados corresponden al paquete Phase 0.1 fresco, que vuelve a ejecutar los gates de Phase 0 antes de evaluar M23–M30.

| ID | Métrica | Estado | Umbral | Resultado observado |
| --- | --- | --- | --- | --- |
| M1 | Response opportunity coverage | **PASS** | terminal outcomes / opportunities = 100% | 25/25 oportunidades con resultado terminal |
| M2 | Event sequence integrity | **PASS** | sequence errors = 0 | 279 eventos contiguos 1..279; cada mensaje enlaza a evento fuente |
| M3 | Public routing integrity | **PASS** | expected public deliveries = actual | 100/100 entregas públicas; receptores rederivados desde config |
| M4 | Private-channel isolation | **PASS** | unauthorized private exposures = 0 | 5 mensajes privados; 0 exposiciones en 107 referencias |
| M5 | State-machine integrity | **PASS** | illegal transitions = 0 | 6 transiciones en cadena hasta COMPLETED, 0 rechazadas |
| M6 | Bounded execution | **PASS** | unbounded runs = 0 | Límites de duración, llamadas, tokens, timeout y retry configurados |
| M7 | Persistence integrity | **PASS** | missing required objects = 0 | Run, config, eventos, oportunidades, invocaciones, mensajes, entregas, transiciones y proveniencia persistidos |
| M8 | Export integrity | **PASS** | 100% de artefactos requeridos | 21/21 artefactos requeridos presentes y con hash |
| M9 | Failure classification coverage | **PASS** | classified failures / unsuccessful invocations = 100% | 6/6 invocaciones fallidas clasificadas |
| M10 | Behavioural/infrastructure separation | **PASS** | infra failures counted as behavior = 0 | 0 fallos de infraestructura registrados como comportamiento |
| M11 | Retry traceability | **PASS** | orphan retries = 0 | 5/5 retries enlazados a intento padre, tipo y timestamp |
| M12 | Controlled failure validation | **PASS** | 100% precisión en casos inyectados; timeout, provider_error y malformed_response demostrados | 4/4 condiciones clasificadas correctamente; también rate_limit; 5 retries |
| M13 | Immutable configuration snapshot | **PASS** | 100% campos requeridos | 15/15 campos del snapshot presentes |
| M14 | Deterministic configuration fingerprint | **PASS** | misma config → mismo hash; cambio → hash distinto | Hash recompuesto coincide; un parámetro cambiado altera el hash |
| M15 | Code/deployment provenance | **PASS** | proveniencia registrada o ausencia explícita | Commit y versión presentes; deployment/environment quedan null, no inventados |
| M16 | Invocation provenance completeness | **PASS** | invocaciones trazables / invocaciones = 100% | 25/25 con todos los campos, contexto renderizado e IDs fuente |
| M17 | Context integrity | **PASS** | context provenance errors = 0 | 25/25 contextos resuelven a mensajes crudos persistidos |
| M18 | Repeated-run evidence | **PASS** | completed runs con mismo hash >= 2 | 2 runs completados, IDs distintos, hash idéntico |
| M19 | Authorized-context equality | **PASS** | IDs de contexto = mensajes visibles autorizados | 25/25 contextos sin omisión ni exceso, rederivados por membresía |
| M20 | Retry action idempotency | **PASS** | duplicate actions per opportunity = 0 | 4 oportunidades con múltiples intentos, máximo un mensaje por oportunidad |
| M21 | Delivery uniqueness | **PASS** | duplicate deliveries = 0 | 108 entregas y 108 pares mensaje-receptor distintos |
| M22 | Budget accounting under retry | **PASS** | cada intento cobrado exactamente una vez | 30/30 intentos cobrados una vez, incluidos 5 retries |

### 9.1 Dictamen sobre M1–M22

M1–M22 constituyen evidencia fuerte para el aparato determinista y son coherentes con los tres gates del repositorio:

1. Infrastructure integrity: PASS.
2. Failure attribution: PASS.
3. Reproducibility: PASS.

No prueban comportamiento social. Además, M9–M12, M20 y M22 toman evidencia de una fault run diferente del baseline. El paquete nombra explícitamente esa corrida, lo cual preserva trazabilidad, aunque la selección por “última corrida con fallos” sigue siendo una búsqueda y no una pareja preregistrada.

## 10. Auditoría M23–M30 contra su propia especificación

| ID | Criterio del diseño | Resultado del repositorio | Dictamen de auditoría |
| --- | --- | --- | --- |
| M23 | Igualdad del material de contexto | **PASS**: 25 invocaciones con joins completos | Suficiente para el mock contractual al combinarse con M19 |
| M24 | Scope y proveniencia de summaries | **PASS**: 32 summaries | Parcial: comprueba hashes y scope extractivo; no existe rubric/human audit de fidelidad semántica |
| M25 | Trazabilidad completa | **PASS**: 25 oportunidades | Datos frescos tienen 108/108 entregas trazadas, pero la función M25 no obliga a revisar entregas, todos los eventos, análisis derivados ni manifest por trace |
| M26 | Atribución de tool faults | **PASS**: 2 llamadas | Parcial: solo tool_timeout + retry; no evidencia end-to-end de unavailable, invalid response y permission fault |
| M27 | Idempotencia de recovery | **PASS**: un resume | Parcial: una fixture reabre la última oportunidad tras entrega; no es la restart matrix completa de cuatro puntos |
| M28 | Integridad backup/restore | **PASS**: 1 backup | Parcial: comprueba archivo, config hash y event_count; no comprueba hashes de export restaurado ni capacidad real de replay |
| M29 | Límites del moderador | **PASS**: scripted | Parcial: el diseño exige corridas scripted y LLM; solo scripted fue ejecutado |
| M30 | Live-adapter canary | **NOT_EXERCISED** | Ausente; bloquea ready y cierre operacional |

### 10.1 M23 — Context material equality

Fortalezas:

- 25/25 invocaciones tienen oportunidad, trace y contexto persistido.
- El recibo del mock contractual coincide con IDs de contexto, IDs de summary y hashes.
- M19 rederiva independientemente los mensajes autorizados desde la configuración.

Límite:

- M23 por sí sola compara el recibo con material almacenado; la independencia de autorización depende de M19. La conclusión válida es contractual, no semántica.

### 10.2 M24 — Summary scope and provenance

Evidencia:

- 32 summaries: 24 public y 8 breakout.
- 32 IDs distintos.
- Source IDs, orden cronológico y hashes verifican.
- Ninguna fuente privada aparece en un summary marcado public.

Brechas:

- El summarizer es extractivo: concatena mensajes fuente; no resume significado.
- “Fidelity audit” recomputa hashes de IDs y contenido. Esto prueba integridad criptográfica, no fidelidad semántica.
- El diseño promete una muestra exportada con rubric de revisión humana; no existe en el bundle.
- M24 usa isVisibleTo, la misma función de visibilidad que está auditando; no es una rederivación independiente como M19.
- opportunityId sigue siendo opcional en la API de summaries y conserva el fallback “unbound”, aunque el runner actual sí entrega el ID.
- No hubo mensajes direct-private, por lo que ese scope no fue ejercitado.

### 10.3 M25 — Trace completeness

Evidencia independiente reconstruida:

- 25 oportunidades y 25 trace IDs distintos.
- Invocaciones, mensajes, summaries y tool calls del baseline portan trace.
- 108/108 eventos de entrega portan trace.

Brechas:

- La función de aceptación M25 solo itera oportunidades, invocaciones, summaries, tools y mensajes.
- No hace fallar la métrica por una entrega huérfana, un retry event huérfano, un análisis derivado huérfano o un manifest sin trace.
- El diseño escrito exige trace en cada delivery, semantic extraction y manifest entry.

El dataset fresco es correcto para entregas, pero la métrica no garantiza todo el contrato para corridas futuras.

### 10.4 M26 — Tool-gateway attribution

Evidencia:

- Tool echo autorizado a agent_1.
- Máximo una acción lógica por oportunidad.
- Intento 1: tool_timeout.
- Intento 2: success.
- Resultado configurado como private y no filtrado a contextos.

Brechas:

- La especificación enumera tool_timeout, tool_unavailable, tool_malformed_result y tool_permission_denied.
- El código usa los nombres tool_timeout, tool_unavailable y tool_invalid_response; permission_denied aparece como resultado de autorización, no como fault kind inyectable.
- Solo tool_timeout fue ejecutado en la validación integral.
- Los tests unitarios cubren timeout y denegación por límite/duplicado, pero no ejercen tool_unavailable ni tool_invalid_response.

M26 demuestra el gateway y un fault path, no la matriz completa de errores de herramientas.

### 10.5 M27 — Recovery idempotency

Evidencia:

- 25 checkpoints, uno por oportunidad.
- Una oportunidad fue reabierta con el mismo opportunity_id y trace_id.
- No quedaron oportunidades sin resolver.
- No hubo pares de entrega duplicados ni transiciones terminales duplicadas.
- Los tests incluyen dangling opportunity, restauración de clasificación, reparación de delivery faltante y oportunidad inalcanzable.

Brechas:

- La validación integral crea una interrupción determinista editando el final de una corrida completada y reabre la última oportunidad después de su última entrega durable.
- No mata y reinicia realmente el proceso.
- No ejecuta toda la matriz especificada: antes de invocación, después de invocación, después de persistir mensaje y durante delivery.
- M27 no cuenta directamente mensajes finales duplicados; confía parcialmente en oportunidades y entregas.

### 10.6 M28 — Backup/restore integrity

Evidencia:

- Backup SQLite de 995,328 bytes.
- SHA-256: df877a6fb3e28f62af3c42739c182b278e0048d759cb9fa32f28d26e0d4512bd.
- Config hash restaurado coincide.
- Event log restaurado contiene 279 eventos.

Brechas:

- M28 solo exige backup existente, config hash coincidente y event_count > 0.
- El criterio escrito exige integridad SQLite, tablas requeridas, hashes de artefactos, continuidad de eventos y replay disponible.
- No se demuestra mediante M28 que un export generado desde el restore tenga los mismos hashes ni que replay.html funcione contra el restore.

### 10.7 M29 — Moderator boundary integrity

Evidencia:

- Moderador scripted con versión fija.
- 5/5 turnos scripted registrados.
- 0 tokens de moderador.
- No recibe private context cuando moderator_observes_private=false.
- No emite state transition como agente.
- Cada salida queda registrada como mensaje.

Brecha:

- El criterio del diseño exige comparar corridas de moderador scripted y LLM.
- [known-issues.md](../known-issues.md) reconoce que no se ha ejecutado comparación con moderador LLM live.

### 10.8 M30 — Live-adapter canary

Estado:

- NOT_EXERCISED.
- No hay credencial live disponible.
- No existe configs/agora_phase0_1_live_canary.yaml ni la pareja live fault prevista.
- configs/agora_phase0_v1.yaml usa OpenAI, pero no es una canary Phase 0.1 con validation.profile=live_canary y no sustituye M30.

Defecto de criterio:

- El diseño exige baseline, rerun, fault run, export y gates existentes en PASS bajo proveedor live.
- La implementación actual de M30 solo comprueba profile=live_canary, proveedor no mock, run COMPLETED y presencia de manifest.json y acceptance_report.json.
- Una única corrida live completada podría producir M30 PASS sin demostrar réplica, fault run o los tres gates.

M30 necesita endurecerse antes de usar su futuro PASS como evidencia de cierre.

## 11. Tests, build y pruebas de integración

| Verificación | Resultado |
| --- | --- |
| npm test | **PASS** |
| Archivos de test | 31/31 |
| Suites reportadas por Vitest JSON | 131/131 |
| Tests | 382/382 |
| Tests fallidos | 0 |
| npm run build | **PASS**, 0 errores TypeScript |
| Merge contra origin/master | **Sin conflictos** |
| CI remoto | **No configurado / 0 checks** |

Cobertura funcional relevante por archivo:

| Archivo | Tests | Resultado |
| --- | ---: | --- |
| acceptanceMetrics.test.ts | 57 | PASS |
| auth.test.ts | 47 | PASS |
| backupRestore.test.ts | 1 | PASS |
| checkpoints.test.ts | 6 | PASS |
| codeProvenance.test.ts | 5 | PASS |
| config.test.ts | 17 | PASS |
| contextContractProvider.test.ts | 1 | PASS |
| contextSummaries.test.ts | 3 | PASS |
| docsPage.test.ts | 14 | PASS |
| events.test.ts | 5 | PASS |
| exportBundle.test.ts | 13 | PASS |
| failureAttribution.test.ts | 13 | PASS |
| homePage.test.ts | 7 | PASS |
| interaction.test.ts | 23 | PASS |
| openaiAdapter.test.ts | 9 | PASS |
| operatorPages.test.ts | 10 | PASS |
| phase01.test.ts | 11 | PASS |
| provenance.test.ts | 6 | PASS |
| reconcile.test.ts | 6 | PASS |
| replayExport.test.ts | 10 | PASS |
| researchPages.test.ts | 28 | PASS |
| routing.test.ts | 10 | PASS |
| scriptedModerator.test.ts | 8 | PASS |
| semantic.test.ts | 18 | PASS |
| stateMachine.test.ts | 7 | PASS |
| theme.test.ts | 9 | PASS |
| toolGateway.test.ts | 5 | PASS |
| typography.test.ts | 1 | PASS |
| validationPackage.test.ts | 1 | PASS |
| validationSet.test.ts | 11 | PASS |
| viewMode.test.ts | 20 | PASS |

Los tests dan confianza en regresión de código. No sustituyen evidencia operacional live ni corridas independientes.

## 12. Integridad de bundles y artefactos

### 12.1 Resultado independiente

| Bundle | Entradas de manifest | Hashes coincidentes | Tamaños coincidentes | SHA-256 del manifest |
| --- | ---: | ---: | ---: | --- |
| Phase 0 core | 21 | 21/21 | 21/21 | 636dfd7d637157f86eb53b8e62d48fd290fd0d6d8aca6a5eae9507b7975cfc10 |
| Phase 0.1 | 21 | 21/21 | 21/21 | 8b1f5d69889e541c1de28ba9020ff96b26a46d27e22b4eadf595594736141401 |

El manifest no incluye su propio hash por diseño; esta auditoría lo calculó por separado.

### 12.2 Archivos del manifest Phase 0.1

| Archivo | Bytes | SHA-256 |
| --- | ---: | --- |
| canonical_config.yaml | 2,235 | 9b9041d509bbf2a2a697c6ce69dc1978670ec659d501054e83ce2a816500cb96 |
| canonical_config.json | 2,115 | 01e0488875332805e86121852ced1ad14a3377478d4ae8fece9fb7869e23b3c5 |
| run_metadata.json | 3,976 | 4c08d5cf00e543eb432314be96aa4bbe0b26ff5ed22ff1575765e4f3e1dd66f1 |
| events.jsonl | 235,546 | be3a6a0ab61c79016b63aa402f61a9effaf523509b9deb0cc2e3c380dde51200 |
| transcript_public.txt | 16,175 | 51b7a3d62aab86eeaa1b8b06ded5b36c3204dbeeaa55e1a667489ca7134adbc9 |
| messages_private.jsonl | 7,794 | e38604a77418ec043db4658db6ecaee847a7f97594fe7942d42ba96bfaff4c85 |
| invocations.jsonl | 266,993 | 263c3d6ef406cf541f9a721ad6abe0b93bba4f59bd2007071b324fdfd73f3f34 |
| summaries.jsonl | 118,332 | c4add4f5a5f49b03936b79f2e4b6e9d12a384462191adef8fb349f0928d6b4b6 |
| tool_calls.jsonl | 1,326 | b6918cb57215e1d64950e0563dbb21f8805bd7654e3d370141cd08163bab04d5 |
| checkpoints.jsonl | 28,531 | 998ab7402345a0fc7e6b9be59052927f3f47471e2eb9f472fce30e77031b9570 |
| backup_verifications.jsonl | 565 | 83922c40e2f343fce219c2cdabe8f5c10daae159eaf237b482bd08dafe469f89 |
| trace_index.jsonl | 6,462 | 4e7fd883ba8684dab7b154908561d248e4125808854b49ccbcfd2cd48db19ef8 |
| opportunities.jsonl | 13,187 | ca76362f6e2e6e14f441e6518f64b9741b5ca2f9e39a5529e1f46bae1f0c64e3 |
| agents.json | 1,253 | 5c9b4a70649ef27477aebf2a8d2fc3074e81809aed94079021a7b53142c6ea00 |
| messages.jsonl | 40,334 | 7cd67fa84f5640e690eb011ece1aa10512fe7247a0a2562a57b6136f7e51bfab |
| failures.jsonl | 1 | 01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b |
| analytics.json | 5,058 | 2aff037f5f1a4ef5c9e21319a7574d968a7aa68bc26c9ec29ce24f1358ab8d5e |
| phase0_1_report.json | 1,097 | 16115ad780b148d6a513cbea25d92a456cbc3060817ab70fd9407ed7488240b1 |
| acceptance_report.json | 13,650 | e7ad2b6f5f08bdf2fb7c17cb9363d2d5ba86e4016a85c3acfc515c92b491bffa |
| replay.html | 86,918 | cbdcaac5f7872d6fb460ba3b391a2761c9b27c4be2faf7cb1a3138e918148602 |
| README.md | 4,233 | 19fc601be4afc8095816df102b3cdee4bac19902e500e1cb3e04abf9d12ba678 |

### 12.3 Inconsistencia de conteo

En ambos bundles:

- acceptance_report.json dice “18 artifacts exported and hashed”.
- validation_set.json dice “22 artifacts exported and hashed”.
- manifest.json enumera 21 archivos con hash y explica que el manifest es el archivo 22 sin auto-hash.

La explicación técnica probable es el momento distinto en que se genera cada reporte durante la exportación. La integridad física fue confirmada, pero los reportes no son internamente consistentes en el conteo y deben corregirse para una auditoría oficial.

## 13. Métricas científicas del protocolo que no pertenecen al cierre técnico

El protocolo define familias de endpoints para fases conductuales:

| Endpoint | Definición | Estado en Phase 0 |
| --- | --- | --- |
| APR_i | R_i / max(1, E_i − F_i), participación ajustada por disponibilidad | Existe una versión de participación infra-ajustada en analytics, pero el mock no permite interpretación social |
| SFR_i | F_i / E_i, system failure rate | Derivable de oportunidades/fallos; no es endpoint conductual validado aquí |
| Contribution Gini | Desigualdad de turnos, tokens o contribuciones | No usado como gate Phase 0 |
| Normalized Shannon entropy | Diversidad/equidad de participación | No usado como gate Phase 0 |
| PPIS | Precursor privado-público temporal-semántico | No ejecutado |
| Newman modularity | Estructura de comunidades en red privada | No ejecutado |
| Output quality rubric | Completitud, soporte factual, diversidad, consistencia, novedad y síntesis | No ejecutado |
| Mixed-effects model | Outcomes anidados por run, agente y tiempo | No ejecutado; requiere múltiples runs |

El baseline mock arroja shares de mensajes de 0.16 para cada participante y 0.20 para el moderador porque el scheduler asigna cuatro oportunidades por agente y cinco al moderador. Eso es evidencia del turno programado, no igualdad espontánea ni comportamiento diferenciado.

El protocolo recomienda aproximadamente 5–10 runs de calibración por condición para estimar varianza y posteriormente calcular replicación por power/precision. Las dos corridas idénticas de Phase 0 satisfacen reproducibilidad técnica, no ese diseño estadístico conductual.

## 14. Proveniencia científica

### 14.1 Fuentes externas citadas por el protocolo

1. Park et al., [Generative Agents: Interactive Simulacra of Human Behavior](https://doi.org/10.1145/3586183.3606763), UIST 2023.
2. Wu et al., [AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation](https://arxiv.org/abs/2308.08155).
3. Li et al., [CAMEL: Communicative Agents for “Mind” Exploration of Large Language Model Society](https://arxiv.org/abs/2303.17760).
4. Zhou et al., [SOTOPIA: Interactive Evaluation for Social Intelligence in Language Agents](https://arxiv.org/abs/2310.11667).
5. Vezhnevets et al., [Generative agent-based modeling with Concordia](https://arxiv.org/abs/2312.03664).
6. Gao et al., [AgentScope: A Flexible yet Robust Multi-Agent Platform](https://arxiv.org/abs/2402.14034).
7. Goel and Zhu, [LIFELONG SOTOPIA](https://arxiv.org/abs/2506.12666).
8. Liu et al., [AgentBench: Evaluating LLMs as Agents](https://arxiv.org/abs/2308.03688).
9. W3C, [PROV-DM: The PROV Data Model](https://www.w3.org/TR/prov-dm/).
10. OpenTelemetry, [Specification overview](https://opentelemetry.io/docs/specs/otel/overview/).
11. Newman, [Modularity and community structure in networks](https://doi.org/10.1073/pnas.0601602103).
12. Lin, [Divergence measures based on the Shannon entropy](https://doi.org/10.1109/18.61115).

Los IDs, títulos y metadatos básicos fueron comprobados contra endpoints oficiales o Crossref. Esto confirma la proveniencia bibliográfica mínima; no equivale a verificar que cada decisión de AGORA se derive causalmente de esas publicaciones.

### 14.2 Qué soportan y qué no

Las fuentes soportan:

- La utilidad de arquitecturas multiagente observables.
- La necesidad de evaluar interacción social con escenarios y métricas explícitas.
- El uso de proveniencia y trazas.
- El uso de modularidad y entropía como herramientas analíticas.

No soportan por sí solas:

- Que la implementación AGORA sea correcta.
- Que M1–M30 sean suficientes.
- Que el mock exhiba inteligencia social.
- Que cinco agentes programados equivalgan a comportamiento humano.
- Que Phase 0 pueda producir conclusiones conductuales.

La evidencia de implementación debe provenir de logs, tests, bundles y corridas; la evidencia científica define métodos y límites, no sustituye resultados.

## 15. Hallazgos y severidad

### F-01 — CRÍTICO: M30 no ejecutada

No hay canary con proveedor real. ready=false y phase0_validated=false en el paquete Phase 0.1. Bloquea cierre operacional y avance formal a Phase 1.

### F-02 — CRÍTICO: protocolo no congelado y tabla de aceptación ausente

El documento es Draft v0.9 y la Table 4 de criterios mínimos no existe. No hay base documental final para afirmar aprobación oficial de M1–M30.

### F-03 — MAYOR: configuraciones prometidas por el diseño no existen

Faltan configuraciones dedicadas para:

- Context contract separado.
- Todos los tool faults.
- Restart matrix.
- Scripted moderator.
- LLM moderator.
- Live canary de 2–3 agentes.
- Live fault pair.

La configuración única agora_phase0_1_mock.yaml combina varios controles y usa cinco agentes.

### F-04 — MAYOR: M30 puede pasar con evidencia menor a la especificada

No exige baseline + rerun + fault run ni los gates existentes en PASS. Debe endurecerse antes de aceptar un futuro PASS.

### F-05 — MAYOR: M29 solo demuestra moderador scripted

No existe la comparación scripted-versus-LLM indicada por el diseño.

### F-06 — MAYOR: M26 no cubre toda la matriz de tool faults

Solo tool_timeout fue ejercitado end-to-end; unavailable, invalid response y permission fault no tienen paquete de aceptación completo.

### F-07 — MAYOR: M27 no ejecuta restart matrix completa

La fixture es útil y los tests corrigieron blockers reales, pero no prueba interrupción en todos los estados ni kill/restart real.

### F-08 — MAYOR: M28 es más débil que su criterio escrito

No verifica hashes de artefactos restaurados ni replay tras restore.

### F-09 — MAYOR: M25 no hace vinculante toda la trazabilidad prometida

Las entregas frescas están bien, pero la métrica no falla por todos los tipos de registros que el diseño enumera.

### F-10 — MODERADO: M24 llama “fidelity” a integridad criptográfica

El mecanismo es válido como contrato extractivo, pero no existe revisión humana/independiente de fidelidad semántica.

### F-11 — MODERADO: cierre de revisión y CI ausentes

PR en Draft, CHANGES_REQUESTED, sin re-review del commit final y sin checks automatizados remotos.

### F-12 — MODERADO: evidencia local no archivada y conteos inconsistentes

Los bundles no están versionados y los reportes difieren entre 18, 21 y 22 artefactos.

### F-13 — MODERADO: vulnerabilidad high en dependencia de desarrollo

nanoid 3.3.17 aparece en el árbol de Vitest/Vite. Producción reporta cero vulnerabilidades, pero el entorno completo no está limpio.

### F-14 — MENOR: diff --check no está limpio

Dos archivos contienen línea en blanco adicional al EOF.

### F-15 — MENOR: nomenclatura y documentación divergentes

El diseño usa NOT_EXECUTED mientras el código usa NOT_EXERCISED, y varios nombres de configs/faults no coinciden con los artefactos implementados.

## 16. Matriz de cierre

| Dominio | Criterio de cierre | Estado |
| --- | --- | --- |
| Phase 0 mock | M1–M22 PASS | **CERRADO para el commit y config auditados** |
| Phase 0.1 mock, reglas implementadas | M23–M29 PASS | **CERRADO CONDICIONADO** |
| Phase 0.1 contra detalle completo del diseño | Todas las matrices y comprobaciones dedicadas | **ABIERTO** |
| Proveedor real | M30 PASS con baseline/rerun/fault/export | **ABIERTO** |
| Protocolo | Versión final con criterios presentes y aprobados | **ABIERTO** |
| Revisión | PR aprobado, no Draft, checks verdes | **ABIERTO** |
| Evidencia | Bundle canónico archivado y verificable por terceros | **ABIERTO** |
| Inicio formal de Phase 1 | ready=true y cero blockers críticos/mayores | **NO AUTORIZADO por esta auditoría** |

## 17. Acciones necesarias para cierre oficial

Orden recomendado:

1. Publicar y aprobar protocolo v1.0, incorporando las tablas 4, 7 y 8 y una matriz canónica M1–M30.
2. Definir explícitamente si M30 es obligatorio para el cierre global. El comportamiento actual de ready indica que sí.
3. Añadir configs dedicadas de 2–3 agentes para live canary, live fault y moderadores scripted/LLM.
4. Endurecer M30 para requerir paquete enlazado baseline/rerun/fault, config hashes, export completo y Gates 1–3 PASS.
5. Ejecutar tool_timeout, tool_unavailable, tool_invalid_response/malformed y permission denial en evidencia end-to-end.
6. Ejecutar restart matrix en los cuatro puntos especificados y hacer que M27 compruebe mensajes finales duplicados.
7. Ampliar M28 para verificar SQLite integrity, tablas, continuidad, export hashes y replay desde restore.
8. Ampliar M25 para cubrir delivery, retry events, análisis derivados y manifest.
9. Incorporar rubric exportable para revisión humana/independiente de summaries; mantener la afirmación semántica separada del hash.
10. Ejecutar canary live baseline, réplica y fault con credencial deliberadamente suministrada.
11. Archivar los bundles, manifest hashes, comandos, versiones y timestamp en un release o almacén de evidencia.
12. Corregir el conteo de artefactos 18/21/22.
13. Añadir CI para build, tests, diff check, validación mock y verificación de hashes.
14. Actualizar la dependencia transitiva vulnerable y reejecutar npm audit.
15. Obtener re-review de Simon sobre el commit final; pasar PR de Draft a Ready y obtener aprobación.
16. Reejecutar esta auditoría. El cierre requiere M1–M30 PASS, ready=true y cero hallazgos críticos/mayores abiertos.

## 18. Conclusión formal

**Phase 0 está técnicamente validada bajo mock para la configuración y el commit auditados.**

**Phase 0.1 tiene una implementación sustancial y M23–M29 pasan, pero no está cerrada oficialmente de extremo a extremo.** La ausencia de M30 es explícita y suficiente para mantener ready=false. Además, varias métricas nuevas prueban una versión más estrecha que su propio criterio de diseño.

El proyecto está en un estado fuerte de ingeniería local: compila, tiene 382 tests verdes, es mergeable, preserva proveniencia y produce bundles íntegros. No está todavía en estado de “cierre oficial completo” porque falta evidencia live, aprobación documental, cierre de review/CI y cobertura completa de los criterios Phase 0.1.

Decisión final:

> **NO-GO para declarar oficialmente cerradas Phase 0 + Phase 0.1 o iniciar Phase 1 como experimento conductual.**

La decisión puede cambiar a GO cuando se cierre la lista de la sección 17 y una nueva corrida produzca ready=true con evidencia archivada.

## Apéndice A. Comandos de reproducción

    npm test
    npm run build
    git fetch origin --prune
    git merge-tree --write-tree origin/master HEAD
    git diff --check origin/master...HEAD
    npm audit --omit=dev --audit-level=high
    npm audit --audit-level=high

Phase 0:

    $env:AGORA_DB_PATH='phase0_audit_2026-08-26_01f7dd6.sqlite'
    npm run agora -- validate --config configs/agora_phase0_mock_baseline.yaml --fault-config configs/agora_phase0_faultdemo_mock.yaml --out phase0_validation/audit_2026-08-26_01f7dd6

Phase 0.1:

    $env:AGORA_DB_PATH='phase01_audit_2026-08-26_01f7dd6.sqlite'
    npm run agora -- validate --config configs/agora_phase0_1_mock.yaml --fault-config configs/agora_phase0_faultdemo_mock.yaml --out phase0_1_validation/audit_2026-08-26_01f7dd6

## Apéndice B. Fuentes internas principales

- [README](../../README.md).
- [Known limitations](../known-issues.md).
- [Phase 0.1 robustness design](../superpowers/specs/2026-08-18-phase0-1-robustness-design.md).
- [Phase 0.1 implementation plan](../superpowers/plans/2026-08-18-phase0-1-robustness-implementation.md).
- [M23–M30 implementation](../../src/acceptance/phase01.ts).
- [M1–M22 implementation](../../src/acceptance/metrics.ts).
- [Validation set](../../src/acceptance/validationSet.ts).
- [Validation package runner](../../src/scripts/validate.ts).
- [Context summaries](../../src/orchestrator/summaries.ts).
- [Tool gateway](../../src/tools/gateway.ts).
- [Backup/restore](../../src/db/backup.ts).
- [Export bundle contract](../../src/export/bundleContract.ts).

## Apéndice C. Regla de interpretación

PASS significa que una condición fue ejercitada y satisfizo la comprobación implementada.

NOT_EXERCISED significa ausencia de evidencia, no éxito.

Un PASS de código no debe ampliarse más allá del alcance exacto de la métrica. Cuando el criterio de diseño es más amplio que la implementación, esta auditoría conserva el PASS del repositorio y registra la conformidad como parcial.
