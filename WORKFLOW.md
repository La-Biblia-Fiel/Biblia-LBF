# Flujo de trabajo

Lea el juramento en `README.md` antes de escribir español.

La traducción es el procedimiento de abajo. El detalle de archivos y
comandos está en `tools/pipeline/README.md`. `STATUS.md` y
`tools/verify.py` no aceptan un versículo.

## Traducir

Un capítulo a la vez. Un versículo, un paquete de fuente. No empezar
por el español ya escrito. Numeración protestante. NT: TR1894. AT:
OSHB/WLC. Español actual de Latinoamérica (`tú` / ustedes). Nombres:
`translation/PROPER_NAMES.md`.

No suavice. No fortalezca. No resuelva lo que el texto deja abierto.
No trabaje de memoria, de otra versión, ni desde la teología.

### Estaciones

| Orden | Quién | Cuándo |
| --- | --- | --- |
| 1 | paquete de fuente | siempre, un versículo |
| 2 | Cursor Auto redacta | siempre |
| 3 | lint local | siempre, sin modelo |
| 4 | Cursor Auto audita | si el lint pasó |
| 5 | Sonnet | solo si el versículo es cuestionable |
| 6 | Cursor Auto vuelve a auditar | solo el español que tocó Sonnet |

Pasa limpio: la auditoría de Auto no tiene fallos ni avisos, y el
borrador no trae incertidumbre, concepto añadido ni unidad descartada.
Ese versículo no va a Sonnet.

Es cuestionable, y entonces entra Sonnet, cuando ocurre cualquiera de
estas cosas:

- el lint marca un fallo conocido (*vosotros*, *parir*, piedras duales
  hechas banquillo u otro anti-ejemplo del lint)
- la auditoría falla o avisa
- el borrador trae incertidumbre, concepto añadido o unidad sin token

Si después de Sonnet el lint sigue fallando, o la segunda auditoría
tiene veredicto `fail`, el versículo queda apartado y el español
anterior permanece. Un `pass` entra en el archivo aunque traiga avisos;
esos avisos quedan en la auditoría para la lectura humana. Sonnet no se
repite.

GPT y Grok no entran en este comando. El script anterior está en
`python3 tools/pipeline/run_chapter-old.py <libro> <capítulo>`.

### Cómo se corre

Un capítulo. El comando llama al CLI de Cursor: Auto audita, y Sonnet
repara una sola vez cuando el versículo es cuestionable. Recorre el
capítulo y escribe el español que pasó la segunda auditoría. Cuando
termina, una persona lee el capítulo y el informe, y aprueba.

```sh
python3 tools/pipeline/auto_pass.py exodo 1
python3 tools/pipeline/auto_pass.py exodo 1 --from 1 --to 5
```

Hace falta `agent` en el PATH, con sesión iniciada:

```sh
curl https://cursor.com/install -fsS | bash
agent login
agent models
```

`LBF_CURSOR_AUTO_MODEL` vale `auto` si no se define.
`LBF_CURSOR_SONNET_MODEL` vale `claude-sonnet-5` si no se define. Si el
CLI rechaza ese id, use uno que liste `agent models`.

El español que ya está en `translation/` se audita. Un pase limpio se
queda. Un fallo o un aviso va a Sonnet. Auto vuelve a auditar ese
español. El arreglo entra en el versículo cuando el veredicto es
`pass`. Si el veredicto es `fail`, o el lint sigue fallando, el
versículo queda en el informe y el español anterior permanece.

El informe queda en
`pipeline/{ot|nt}/{libro}/_logs/{libro}-{capítulo}.auto-pass.json`.
El comando no firma `STATUS.md`.

Si el versículo todavía no tiene español, Auto lo redacta y sigue el
mismo ciclo. Entra en el archivo cuando la auditoría lo acepta.

La cola de peticiones sigue disponible para contestar dentro del
editor, un JSON a la vez:

```sh
python3 tools/pipeline/run_chapter.py exodo 1
```

Ese script escribe el paquete y las peticiones en `pipeline/`. Cada
ítem de `{libro}-{capítulo}.queue.json` trae `model`, `request` y
`reply`. `cursor-auto` lo responde Cursor Auto. `sonnet` lo responde
Sonnet. El objeto JSON se escribe en `reply` y se vuelve a correr el
mismo comando. `run_book.py` hace lo mismo, capítulo por capítulo.
`finish_book_apply.py` copia los `passed` de esa cola al archivo del
libro. El comando de arriba es el que termina el capítulo solo.

Formato del archivo:

```markdown
# Tito

## Capítulo 1

### 1:1

Pablo, siervo de Dios…
```

Un versículo, un encabezado `### capítulo:versículo`. Un archivo por
libro.

### Español que ya está en translation/

```sh
python3 tools/pipeline/auto_pass.py exodo 1
```

Ese es el comando. Audita el texto del archivo, manda a Sonnet los
fallos y los avisos, vuelve a auditar, y escribe los arreglos con
veredicto `pass`.

`audit_translation.py` solo escribe las peticiones de auditoría para
contestarlas a mano dentro del editor. No repara.

## Alinear

La alineación es un mapa hecho a mano, un capítulo a la vez.

1. Trabajar desde la columna TR (NT) o OSHB (AT) declarada.
2. Mapear cada unidad española a los tokens de fuente, o dejar una razón explícita de no cubierto.
3. Guardar un solo archivo: `alignment/{nt|ot}/{libro}/{libro}-reverse-links.json`.

Prohibido:

- zip automático de un libro entero
- `gloss-match` / gloss DP presentado como alineación
- `auto-zip` presentado como terminado
- numeración masorética como etiqueta del trabajo

`method` debe ser `hand` (o una razón explícita de no cubierto).
Cero `auto-zip`. Cero `gloss-match`. Cero frases sin caminar presentadas como listas.
Además, la frase debe tener estado humano `hand`, `manual` o
`manual-realign`. `seeded-hand` sigue siendo una semilla, no una revisión
humana, aunque sus unidades lleven `method: hand`.

Tito hoy tiene 72 frases `auto-zip`. Eso no es alineación terminada.

## Registro

`STATUS.md` guarda las palabras `none`, `draft`, `ready` y `done`.
Ese archivo no es el procedimiento. `tools/verify.py` no juzga el
español: si se corre, mira si el archivo está completo.
`tools/status.py` no escribe estados.

`ready` en esa tabla solo quiere decir que `verify.py` pasó.
`done` solo lo escribe una persona, con nombre y fecha. Ningún modelo
lo infiere. El publicador, más abajo, todavía lee esa fila. Aceptar
un versículo es la auditoría de Auto, y Sonnet cuando hizo falta.

## Proceso en Translator

Translator no reemplaza `tools/pipeline/`. La secuencia de abajo es la
entrega del libro en la aplicación, no la manera de redactar el español.

Translator presenta una sola secuencia por libro:

```text
traducir → verificar → aprobación humana → alinear → verificar → aprobación humana → revisar y commit → exportar → preparar rama → push y merge del PR
```

El trabajo frase por frase permanece en la vista de traducción. **Terminar
libro** abre una vista final separada para verificación, firmas, commit,
exportación y entrega al publicador; el flujo final no ocupa el espacio de edición de frases.

Solo la acción siguiente queda habilitada. Los botones de verificación llaman
a `tools/verify.py`; no duplican sus reglas. Las aprobaciones exigen `ready`,
nombre y confirmación humana, y escriben solamente la fila canónica del libro
en `STATUS.md`. Editar el español borra las firmas de traducción y alineación;
editar los enlaces borra la firma de alineación. **Revisar y commit** muestra
la lista exacta de archivos del libro, vuelve a ejecutar `tools/status.py` y
requiere confirmación humana. Solo entonces crea un commit con la traducción,
el directorio de alineación y la fila de ese libro en `STATUS.md`; nunca incluye
filas pendientes de otros libros ni trabajo ya preparado en el índice. Exportar
llama únicamente a `tools/export.py` y conserva todas sus negativas. **Preparar
rama del publicador** requiere otra confirmación explícita y llama únicamente a
`tools/publish.py`; crea la rama local, pero nunca usa `--push` ni abre el PR.
Translator no llama a ese estado «publicado»: el paso siguiente permanece
abierto hasta que la rama se empuje y el PR se fusione en `cgv-data/main`.

En la etapa de alineación, **Continuar alineación** abre la primera frase no
confirmada. Revise cada unidad contra los tokens de fuente, corrija cualquier
enlace incorrecto y pulse **Confirmar frase completa**. Esa acción humana marca
como `hand` solamente las unidades visibles y el estado de esa frase, y avanza a la
siguiente; nunca confirma un libro entero ni ejecuta autoalineación.

## Publicar

Publicar no es marcar `done`. Publicar es posterior:

```text
Biblia-LBF → validar → revisar y commit → exportar → PR del publicador → cgv-data
```

Son dos pasos. Primero exportar:

```sh
python3 tools/export.py filipenses
```

Eso escribe el paquete en `/tmp/lbf-export/`. No copie esos archivos a un
árbol local de `cgv-data`.

`export.py` se niega si el libro no está `done` y firmado, o si el texto, la
alineación o la fila de `STATUS.md` de ese libro no están *commiteados*. Un
`sourceCommit` debe nombrar un *commit* que contenga el trabajo, así que la
negativa llega antes de escribir el paquete, no después de intentar publicarlo.

Después publicar. `tools/publish.py` es el publicador:

```sh
python3 tools/publish.py filipenses --data-repo ../cgv-data
```

Eso corta la rama `lbf-<libro>-<fecha>` desde `origin/main` y hace un solo
*commit* con dos archivos:

| Archivo | Destino en `cgv-data` |
| --- | --- |
| `<libro>.lbf.md` | `bibles/LBF/<libro>.lbf.md` |
| `<libro>.alignment.json` | `bibles/LBF/alignments/<libro>.alignment.json` |

El *commit* se hace en un `git worktree` temporal. Su copia de trabajo de
`cgv-data` no se toca: no cambia de rama y sus archivos sucios no entran.

Sin `--push` no empuja nada. Le imprime la rama, el *commit* y el enlace para
abrir el *pull request*. Revise el `--stat` antes de empujar.

`publish.py` se niega si:

- el libro no está `done` y firmado en `STATUS.md`
- el texto, la alineación o la fila de `STATUS.md` de ese libro no están
  *commiteados* — `export.py` ya lo comprueba; `publish.py` lo vuelve a comprobar
- el paquete no coincide con `HEAD` — reexporte
- la alineación cambió después de exportar — la firma ya no la ata
- `tools/status.py` falla
- la rama ya existe
- el `--data-repo` no tiene *commits*, o su `origin` no es `cgv-data`

Ese último caso importa: un `git init` vacío llamado `cgv-data` acepta
archivos y no publica nada.

Este repositorio no importa texto desde `cgv-data`.

Translator presenta este publicador como su último paso. La app no vuelve a
implementar la publicación: entrega el libro y la ruta de la copia existente de
`cgv-data` a `tools/publish.py`, muestra su salida y se detiene después del
commit local. Ese resultado se etiqueta **rama preparada**, nunca **publicado**.
La app muestra el comando de `push` y el enlace del PR como pasos humanos
pendientes, y solo presenta la publicación como completa cuando el mismo
`sourceCommit` está presente en `cgv-data/main`. La validación de estado se
limita al libro seleccionado; trabajo pendiente de otro libro no bloquea su
publicación.

## Lo que este flujo no es

No es `STATUS.md` ni `tools/verify.py`.
No es GPT ni Grok. Ese camino es `run_chapter-old.py`.
No es Sonnet en cada versículo.
No es una máquina de aprobaciones por verso.
No es un segundo corpus bajo `apps/translator/`.
No es un zip generado por un modelo.
