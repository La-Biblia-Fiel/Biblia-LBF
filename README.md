# LA BIBLIA FIEL

Una traducción fiel de las Escrituras en español contemporáneo,
comprometida con dejar que las Escrituras hablen por sí mismas.

## Licencia

El texto se publica bajo **[CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/)**.
Puede copiarlo y compartirlo tal cual, con atribución, para uso no comercial.
No puede publicar un texto LBF adaptado bajo esa licencia pública.

La Biblia Fiel es propiedad de
**[Cultivados en Gracia y Verdad](https://github.com/Cultivados-en-Gracia-y-Verdad)**.
Ellos pueden autorizar Biblias, aplicaciones y publicaciones comerciales
**por acuerdo escrito**.

Si este repositorio publica herramientas, esas herramientas quedan bajo
**[PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)**.

Las fuentes bajo `source/` conservan su propia licencia.
Vea `LICENSE`, `NOTICE.md`, `CLA.md` y `CONTRIBUTING.md`.

## El juramento del traductor

El traductor no es el autor.

Por lo tanto, no tiene autoridad para mejorar el texto,
suavizarlo,
fortalecerlo,
resolver las tensiones que presenta,
modernizar su teología,
ni proteger al lector de aquello que las Escrituras dicen.

Al traductor se le confía una sola responsabilidad:

**dejar que las Escrituras hablen por sí mismas.**

Si el texto se repite, la traducción probablemente debería repetirse.
Si el texto pregunta, la traducción debería preguntar.
Si el texto deja una cuestión abierta, la traducción debería dejarla abierta.
Si el texto resulta incómodo, la traducción debería resultar incómoda.
Si el texto es sencillo, la traducción debería seguir siendo sencilla.
Si el texto genera tensión, la traducción debería preservar esa tensión.
Si el texto sorprende, la traducción debería sorprender.
Si el texto ofende, la traducción no debería disculparse.
Si el texto es bello, la traducción no debería ocultar esa belleza.
Si el texto es claro, la traducción no debería volverlo complejo.
Si el texto guarda silencio, la traducción también debería guardar silencio.

La traducción nunca debe decir más de lo que dice el texto, ni menos de lo que dice el texto.

## Base textual

El Nuevo Testamento se traduce del **Textus Receptus de Scrivener de 1894**.
La fuente de trabajo es `source/greek/TR1894/robinson-parsed/`.

El Antiguo Testamento se traduce del hebreo de **OSHB / WLC**.
La fuente de trabajo es `source/hebrew/OSHB/`.

La numeración de versículos es siempre **protestante**. Nunca se usa la numeración masorética como etiqueta del trabajo.

No se emplean ediciones del texto crítico para decidir el texto de LBF.

## Dónde vive el trabajo

| Qué | Dónde |
| --- | --- |
| Español | `translation/nt/` y `translation/ot/` |
| Alineación | `alignment/nt/` y `alignment/ot/` |
| Terminado | `STATUS.md` |
| Fuentes | `source/` |

Un libro, un archivo de español. Un libro, un archivo de alineación.

## Cómo se trabaja

El proceso está en [`WORKFLOW.md`](WORKFLOW.md).
Las reglas de los datos están en [`DATA_CONTRACT.md`](DATA_CONTRACT.md).

```sh
python3 tools/status.py
```

Estados: `none` | `draft` | `ready` | `done`.

```sh
python3 tools/verify.py
```

Eso mueve trabajo completo a `ready`. Nada está `done` hasta que una
persona lo firme en `STATUS.md` y `python3 tools/status.py` siga pasando.

## El sitio

El sitio público se genera con Hugo desde `site/`.
El texto bíblico no se escribe allí: `site/tools/build-content.py` lo genera
a partir de `translation/`. Nunca edite `site/content/biblia/`.

```sh
cd site && ./serve.sh      # http://localhost:1313
```
