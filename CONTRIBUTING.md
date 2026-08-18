# Contribuir a La Biblia Fiel

Este repositorio es la única fuente editable de **La Biblia Fiel**.

## Licencia y CLA

Lea `LICENSE`, `NOTICE.md` y `CLA.md` antes de enviar un cambio.

- El texto bíblico se publica bajo **CC BY-NC-ND 4.0**.
- El uso comercial requiere **acuerdo escrito** con Cultivados en Gracia y Verdad.
- Al abrir un *pull request* usted acepta el `CLA.md`.

## Antes de tocar un versículo

Lea el juramento en `README.md` y el proceso en `WORKFLOW.md`.

El traductor no es el autor. No suavice, no fortalezca y no resuelva
tensiones que el texto deja abiertas.

## Dónde editar

| Trabajo | Archivo |
| --- | --- |
| Español | `translation/nt/` o `translation/ot/` |
| Alineación | `alignment/nt/` o `alignment/ot/` |
| Estado | `STATUS.md` |

No cree una segunda copia del texto bajo `apps/translator/`.
No edite `site/content/biblia/`: se genera desde `translation/`.

## Cómo ayudar

1. Abra un *issue* para un verso dudoso o un libro que quiera revisar.
2. Cambie un solo libro, o documentación, por *pull request*.
3. Cite el verso y, si puede, el hebreo o el griego que está representando.
4. Corra `python3 tools/verify.py`. Eso puede dejar el libro en `ready`.
5. No escriba `done` a menos que usted sea quien aprueba.
6. Corra `python3 tools/status.py` antes de pedir revisión.

## Qué está terminado

Solo `STATUS.md`. Estados: `none` | `draft` | `ready` | `done`.

`done` exige su nombre, una fecha, y que el script siga pasando.

Apocalipsis usa la revisión posterior contra el TR, no el borrador rápido.
Zacarías 11:2 ya lee `el cedro`.
