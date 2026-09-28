# Ficha de Referencia 2.0

Copia independiente de Eduardo6236/ficha-de-referencia, basada en c454bc73dc310e9da878ba58d209bb8fd5e25a83. No está vinculada al repositorio ni al proyecto Vercel originales.

## Abrir

Con Node.js instalado, haz doble clic en INICIAR.cmd y abre http://127.0.0.1:4174. Mantén abierta esa ventana mientras uses la aplicación.

La edición, el guardado local y los prompts con traducciones ya guardadas funcionan sin claves. Para traducción nueva se necesita GEMINI_API_KEY en el entorno del servidor. Las generaciones requieren las claves de sus proveedores y, para Fal, instalar las dependencias con `npm install`. No se incluyen ni se copiaron claves privadas.

## Cambios

- Prompt por secciones, sin repetir instrucciones de identidad ni imponer una lente.
- Escenario y acción en Descripción. Conserva el campo interno technical.setting para importar fichas antiguas sin perderlo.
- Traducción con estado visible; generación bloqueada si hay campos pendientes o el prompt está desactualizado.
- Borrador de prompt persistente. Actualizar solicita confirmación antes de reemplazar ediciones manuales.
- Aviso al salir de la pestaña Ficha con cambios sin guardar.
- Modelo de MeiGen, duración y audio capturados antes de reconstruir los controles.
- OpenAI usa GPT Image 2.5 Sunburst con calidad alta y envía primero la referencia marcada como Principal. Se puede cambiar con OPENAI_IMAGE_MODEL y OPENAI_IMAGE_QUALITY.
- Modo «Dos personajes»: combina dos fichas guardadas en una sola escena, usa una imagen principal por persona y traduce al inglés el escenario, la interacción, las posiciones, el vestuario opcional y las indicaciones adicionales.
- Nano Banana, OpenAI y los modelos de MeiGen que aceptan al menos dos referencias están habilitados en el modo combinado. Fal.ai imagen/video queda desactivado porque la integración actual acepta una sola referencia.
- Base de datos local y caché independientes de la versión original.

## Traer tus fichas

En la aplicación original usa Exportar todo. En esta versión usa Importar para cargar ese JSON. No hay sincronización automática. Las fichas y resultados originales permanecen en su navegador y dominio.

## Publicación separada

Para usar traducción y generación desde teléfono/computadora, crea un repositorio y proyecto Vercel nuevos con estos archivos, y configura allí las variables de entorno. No vincules esta carpeta al proyecto Vercel original. Esta entrega no está publicada.

El PDF en docs corresponde a la versión anterior; esta guía describe los cambios de 2.0.

## Comprobación

`npm test` ejecuta las pruebas. Las pruebas simuladas no consumen servicios de IA ni prueban la configuración de un futuro despliegue.

