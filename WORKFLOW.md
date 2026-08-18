# Flujo de trabajo

Este es el único proceso de producción. No hay puertas G0A, G0B ni
`PASS` que sustituyan a una firma humana.

Lea el juramento en `README.md` antes de escribir español.

## Estados

`STATUS.md` es el único libro mayor.

| Estado | Significado |
| --- | --- |
| `none` | No hay archivo real |
| `draft` | Hay archivo. Aún no pasa la verificación |
| `ready` | `python3 tools/verify.py` pasó. Esperando su aprobación |
| `done` | Usted lo firmó **y** `python3 tools/status.py` sigue pasando |

`ready` lo escribe solo `tools/verify.py`. Usted no verifica la alineación:
aprueba. `done` nunca se infiere. Ningún script escribe `done`.
Usted lo escribe, con su nombre y una fecha ISO.

Un libro está terminado solo cuando **traducción** y **alineación** están `done`.

Si cambia un libro `done`, borre esa firma. Vuelve a `draft`.

## Traducir

1. Leer el hebreo o el griego. No empezar por el español.
2. Observar lemas, morfología y la cláusula.
3. Consultar el contexto después de la gramática, no antes.
4. Escribir el versículo en `translation/nt/{libro}.md` o `translation/ot/{libro}.md`.
5. Revisar en voz alta contra la fuente.

Formato:

```markdown
# Tito

## Capítulo 1

### 1:1

Pablo, siervo de Dios…
```

Un versículo, un encabezado `### capítulo:versículo`.
Numeración protestante. Un archivo por libro.

No suavice. No fortalezca. No resuelva lo que el texto deja abierto.
No trabaje de memoria ni desde la teología.

La traducción queda `draft` hasta que usted lea el libro entero y firme
`STATUS.md`. El script exige que estén todos los versículos protestantes.

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

Tito hoy tiene 72 frases `auto-zip`. Eso no es alineación terminada.

## Comprobar

```sh
python3 tools/verify.py
python3 tools/status.py
```

`verify.py` mueve `draft` a `ready` cuando el archivo está completo:
todos los versículos protestantes, unidades a mano, el español se reconstruye.
Si falla, el libro sigue en `draft` y el script dice por qué.

`status.py` no escribe estados. Si `STATUS.md` dice `ready` o `done` y el
archivo falta, está corto, o todavía tiene auto/gloss, el script falla.

## Publicar

Publicar no es marcar `done`. Publicar es posterior:

```text
Biblia-LBF → validar → exportar → PR del publicador → cgv-data
```

```sh
python3 tools/export.py zacarias
```

Eso escribe el paquete en `/tmp/lbf-export/`. No copie esos archivos a un
árbol local de `cgv-data`. El siguiente paso es un *pull request* del publicador.

Este repositorio no importa texto desde `cgv-data`.

## Lo que este flujo no es

No es una máquina de aprobaciones por verso.
No es un segundo corpus bajo `apps/translator/`.
No es un zip generado por un modelo.
