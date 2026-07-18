# Design System Generator (Figma Plugin)

Genera un sistema de diseño completo dentro de un archivo de Figma:

- **Tokens primitivos**: rampas de color (50→900) para primario, neutro y peligro, spacing, radios y escala tipográfica — como *Variables* nativas de Figma.
- **Tokens semánticos**: alias con soporte Light/Dark (`bg/primary`, `text/default`, `border/focus`, etc.) que apuntan a los primitivos.
- **Componentes con variantes y estados**: Button, Input, Checkbox, Badge, Tag, Card, Alert, Avatar — cada uno como un *component set* real de Figma (Size × Type × State), con todas las propiedades vinculadas a variables.
- **Documentación**: una página autogenerada con la paleta de color y las specs de cada componente.

No requiere instalar dependencias, ni Node, ni build step. Es JavaScript plano que corre directo en el motor de plugins de Figma.

## Instalación (una sola vez, por diseñador)

1. Descarga o clona este repositorio.
2. Abre Figma (desktop app).
3. Ve a **Plugins → Development → Import plugin from manifest…**
4. Selecciona el archivo `manifest.json` de esta carpeta.
5. El plugin queda disponible en **Plugins → Development → Design System Generator**.

> Figma exige este paso de importación manual para cualquier plugin que no esté publicado en la Community. Es una limitación de la plataforma, no del plugin — se hace una única vez por persona/máquina.

## Uso

1. Abre (o crea) el archivo de Figma donde quieres el sistema de diseño.
2. Corre el plugin: **Plugins → Development → Design System Generator**.
3. Configura en el panel:
   - Colores base (primario, neutro, peligro)
   - Escalas de spacing, radios y tipografía
   - Qué componentes generar, y para cada uno: sizes, types y states (todo editable como texto separado por comas)
   - Si quieres página de documentación
4. Pulsa **Generar sistema de diseño**.
5. El plugin crea una página nueva con todos los componentes y variables. Todo queda como Variables y Component Sets nativos — 100% editable después a mano, como cualquier diseño de Figma.

## Personalización

Todo el panel es configurable sin tocar código: colores, número de pasos de cada escala, y para cada componente los sizes/types/states exactos que quieras (por ejemplo, agregar un tipo `"tertiary"` a Button, o quitar el estado `"disabled"` de Input).

Si quieres ir más allá (agregar un tipo de componente nuevo, cambiar la lógica de color), toda la lógica vive en `code.js`, en el objeto `BUILDERS` — cada componente es una función independiente.

## Publicar en GitHub

```bash
git init
git add .
git commit -m "Design System Generator plugin"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/design-system-generator.git
git push -u origin main
```

Cualquier diseñador con el link del repo puede descargar el ZIP (**Code → Download ZIP**) y seguir los pasos de instalación de arriba — no necesita cuenta de GitHub, ni Node, ni permisos especiales.

## Notas técnicas

- Requiere Figma desktop (o navegador) con acceso a Variables (plan Professional/Organization/Enterprise — las Variables no están disponibles en el plan Starter).
- Las fuentes se cargan dinámicamente; si `fontFamily` no está instalada en la máquina del diseñador, el plugin usa Inter como respaldo.
- Todo el binding de variables (`setBoundVariable`, `setBoundVariableForPaint`) usa la Plugin API estable de Figma. Si Figma cambia esta API en el futuro, solo hay que actualizar `code.js`.
