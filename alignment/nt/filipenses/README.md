# Filipenses — alineación

Estado: **`draft`**. No es una alineación terminada.

## Qué hay aquí

| Archivo | Qué es |
| --- | --- |
| `filipenses-tr-spine.json` | Los 1641 tokens del TR con id persistente, griego acentuado, Strong's y código Robinson |
| `walk-ch1.txt` … `walk-ch4.txt` | El registro editable: una línea por unidad española, con el índice del token del TR |
| `filipenses-reverse-links.json` | El archivo canónico, ensamblado a partir de los `walk-*` |
| `dump-ch1.txt` … `dump-ch4.txt` | Hojas de trabajo: griego y español lado a lado, versículo por versículo |

Los scripts `build_*` ensamblan; los `check_*` comprueban. Ninguno escribe
`STATUS.md` ni un estado.

```sh
python3 alignment/nt/filipenses/build_filipenses_spine.py
python3 alignment/nt/filipenses/check_spine_vs_scv.py
python3 alignment/nt/filipenses/dump_filipenses_tokens.py
python3 alignment/nt/filipenses/build_filipenses_reverse_links.py
python3 alignment/nt/filipenses/check_reverse_links.py
```

## De dónde viene el espinazo

`source/greek/TR1894/robinson-parsed/PHP.UTR` es la autoridad de los tokens.
Su secuencia se comparó token por token, en los 104 versículos, contra
`scrivener-textonly/PHP.SCV`, que es una transcripción independiente de la
misma edición: **0 diferencias**.

`PHP.UTR` trae cuatro alternativas marcadas con `|`. Se conserva la lectura de
Scrivener: 1:30 `eidete`, 4:2 `euodian`, 4:12 `kai`. La suscripción editorial
posterior a 4:23 (`[prov filipphsiouv egrafh…]`) no es texto del versículo y
queda fuera.

Los acentos vienen de `tr1894.txt`, que es solo un auxiliar y resultó ser una
importación con pérdidas: se come palabras pequeñas que el TR analizado sí trae
(1:6 ὁ, 3:12 ἢ y ᾧ, 4:7 ἡ … ἡ) e imprime las formas cortas sin nu movible
(πάσι por πᾶσιν). 33 acentos se suplieron a mano y 4 erratas evidentes se
corrigieron; cada token dice de dónde salió su acento en `accentFrom`.

## Por qué está en `draft` y no en `ready`

Esta alineación la recorrió un modelo, no una persona. Todas las unidades
llevan `method: "model-walk"`, que `tools/status.py` no cuenta ni como `hand`
ni como `auto`. Por diseño, este archivo **no puede** llegar a `ready` por sí
solo. `WORKFLOW.md` prohíbe presentar trabajo de máquina como alineación
terminada, y esto no lo hace.

No se corrió zip automático, ni gloss DP, ni auto-align de libro entero. Cada
unidad se escribió una por una en los archivos `walk-*`.

## Lo que sí está comprobado

- 104/104 versículos, sin duplicados, numeración protestante
- Las 1576 unidades reconstruyen el español de `translation/nt/filipenses.md`
  carácter por carácter
- Cada unidad nombra al menos un token, y solo tokens de su propio versículo
- Los 1641 tokens del TR están cubiertos por alguna unidad española
- `charStart` / `charEnd` son contiguos y concuerdan con las superficies

Eso comprueba que el archivo es coherente. **No** comprueba que cada enlace sea
el correcto. Eso lo decide usted.

## Cómo aprobarlo

Un capítulo a la vez. Cuatro pasos, y el cuarto es suyo.

**1. Leer.** El lector pone cada unidad española al lado del token del TR que
reclama, con el número de línea del archivo `walk`:

```sh
python3 alignment/nt/filipenses/review.py 3        # un capítulo
python3 alignment/nt/filipenses/review.py 3:12     # un versículo
```

**2. Corregir.** Lo que esté mal se arregla en `walk-ch3.txt`, en la línea que
el lector indica. Cambiar los índices reasigna el token; cambiar la superficie
reparte el español distinto. Las superficies deben seguir uniéndose al español
exactamente: el `·` del lector marca dónde hay espacios.

**3. Volver a ensamblar y comprobar.**

```sh
python3 alignment/nt/filipenses/build_filipenses_reverse_links.py
python3 alignment/nt/filipenses/check_reverse_links.py
```

Si una superficie ya no reconstruye el versículo, el ensamblador lo dice y
nombra el versículo.

**4. Firmar el capítulo.** Solo cuando le convenza, ponga una línea al principio
de ese archivo `walk`:

```text
#!approved John Wry 2026-08-20
```

Vuelva a ensamblar. Las unidades de ese capítulo pasan a `method: "hand"`.
Ningún script escribe esa línea; la escribe usted, con su nombre y una fecha
ISO, igual que `STATUS.md`.

Cuando los cuatro capítulos lleven su marca, `python3 tools/verify.py filipenses`
podrá escribir `ready`. La firma de `STATUS.md` sigue siendo suya.
