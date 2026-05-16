# GestorPro · Manual rápido

Sistema de gestión integral para tu empresa: clientes, proveedores, productos, pedidos, albaranes y facturas. Asistente IA incluido. **100 % local: tus datos no salen de tu ordenador.**

---

## 🚀 Primer arranque

1. **Descomprime el ZIP** donde quieras (Escritorio, USB, carpeta de red…). No requiere instalación.
2. **Doble click en `GestorPro.exe`** (carpeta `GestorPro-win32-x64\`).
3. La primera vez te pedirá **crear la cuenta de administrador**:
   - Usuario: ej. `admin` (3-20 caracteres, sin espacios)
   - Contraseña: mínimo 6 caracteres
   - ⚠ **Apunta bien la contraseña.** No se puede recuperar por email.

> Si la pierdes: otro administrador puede resetearla desde **Usuarios → Reset**. Si no hay otro admin, hay que borrar `gestorpro.db` (perderás los datos) o editar la BD con [DB Browser for SQLite](https://sqlitebrowser.org/).

---

## 🏢 Configurar tu empresa (haz esto antes de nada)

En el menú lateral: **Mi empresa**

Rellena:
- **Razón social** y **NIF/CIF** (obligatorios para facturar)
- **Dirección fiscal completa** (calle, CP, ciudad, provincia)
- **Teléfono y email**
- **IBAN** (sale como "Forma de pago" en las facturas)
- **Logo** (PNG/JPG/SVG · máx 500 KB · idealmente con fondo transparente)
- **IVA por defecto** (21 % España)
- **Color principal** (aparece en las facturas)
- **Pie de factura** (condiciones de pago, devoluciones, etc.)

Estos datos saldrán automáticamente en todas tus facturas, albaranes y pedidos.

---

## 📥 Cargar el histórico (clientes, productos, facturas del año pasado)

En el menú: **Importar datos** (solo admin)

1. Descarga las **plantillas CSV** del propio panel (botones al final de la sección).
2. Ábrelas con Excel, copia tus datos respetando las columnas, guarda en CSV.
3. Vuelve a GestorPro → **Importar datos** → **Selecciona el archivo**.
4. La app detecta automáticamente el tipo (clientes, productos, facturas...) y mapea las columnas.
5. Revisa la previsualización. Si algo no cuadra, ajusta el tipo en el desplegable.
6. Click **Importar X registros**.

**Orden recomendado:**
1. Clientes y proveedores
2. Productos
3. Facturas, albaranes, pedidos (necesitan que clientes/proveedores ya existan)

---

## 📝 Día a día

### Crear una factura

1. Menú **Facturas venta** → **+ Añadir**
2. Número: se rellena solo (`F-2026-0001`, `F-2026-0002`...)
3. Selecciona cliente, fecha, estado
4. Añade líneas (descripción + cantidad + precio)
5. Total con IVA se calcula al instante
6. **Guardar** → listo
7. En la lista, botón **PDF** abre la factura en una pestaña con tus datos de empresa y logo. Imprime o guarda como PDF.

### Flujo pedido → albarán → factura

- En **Pedidos venta**, botón azul **→ Albarán** genera el albarán automáticamente
- En **Albaranes venta**, botón amarillo **→ Factura** genera la factura
- El estado del documento origen se actualiza solo (enviado / facturado)

### Adjuntar DNI / contratos a un cliente

- Abre el cliente → al final del formulario, sección **Documentos adjuntos**
- Botón **+ Adjuntar** → selecciona imagen, PDF, Word, Excel
- Máx 2 MB por archivo, 8 archivos por cliente
- Botón ↓ para descargar, ✕ para quitar

### Stock automático

- Cuando un **albarán de venta** pasa a estado **entregado** → descuenta del stock
- Cuando un **albarán de compra** pasa a estado **recibido** → suma al stock

---

## 🤖 Gestor IA

Botón flotante **✦ Gestor IA** (arriba a la derecha).

Puedes pedirle cosas en lenguaje natural:
- "¿Cuánto facturé este mes?"
- "Crea un cliente nuevo: María Pérez, NIF 12345678Z, teléfono 600111222"
- "Modifica el stock del Palet Europeo a 200 unidades"
- "Muéstrame las facturas pendientes de cobro"

Para acciones de crear/modificar/eliminar, **siempre te pide confirmación** con dos botones (✓ Confirmar / Cancelar).

> Requiere internet (consulta a Claude AI). El resto de la app funciona sin internet.

---

## 👥 Multi-usuario

Menú **Administración → Usuarios** (solo admin).

Roles:
- **admin** → acceso total (incluido Importar, Usuarios, Base de datos)
- **user** → todo el trabajo diario, no ve las secciones de administración
- **viewer** → solo lectura

Acciones:
- **+ Crear usuario**
- **🔑 Reset** → cambia la contraseña de cualquiera
- **Rol** → cambia entre admin/user/viewer
- **✕** → elimina (no puedes eliminarte a ti mismo ni al último admin)

---

## 💾 Base de datos · backups

**Auto-backup diario**: la app crea automáticamente una copia de `gestorpro.db` cada día en `data/backups/`. Purga las de más de 30 días.

**Backup manual**: menú superior **Base de datos → Hacer copia de seguridad…** → eliges dónde guardar. Hazlo **antes** de operaciones importantes.

**Mover la BD**: menú **Base de datos → Cambiar ubicación**. Útil para guardarla en un NAS o carpeta de red compartida.

**Mostrar carpeta de datos**: menú **Base de datos → Mostrar carpeta de datos**. Abre el explorador donde está `gestorpro.db`.

---

## ⌘ SQL avanzado (admin)

Menú **Administración → Base de datos**. Mini editor SQL al estilo Supabase Studio.

- Consultas rápidas precargadas (Ver usuarios, Listar tablas, Schemas, etc.)
- Ctrl+Enter ejecuta
- Resultado en tabla, exportable a CSV
- Avisa antes de UPDATE/DELETE/DROP

**Importante**: las contraseñas están hasheadas (PBKDF2). NO se pueden cambiar con un simple `UPDATE`. Usa Usuarios → Reset.

---

## 🔐 Seguridad

- **Datos**: solo en `gestorpro.db` (tu ordenador). Sin nube. Sin internet salvo para la IA.
- **Contraseñas**: hash PBKDF2 + sal aleatoria por usuario.
- **IA**: solo el texto de tu BD viaja a Claude (no los DNI ni archivos adjuntos).

---

## 📞 Soporte

**Email**: rglabs.es@gmail.com
**Web**: https://rglabs.es

Si la app se cuelga: cierra desde el Administrador de tareas y vuelve a abrir. La BD no se corrompe — usa journal WAL.

Para reportar un bug: incluye una copia de `gestorpro.db` (sin datos sensibles) y captura del error.

---

© 2026 RG Labs · Tarragona
