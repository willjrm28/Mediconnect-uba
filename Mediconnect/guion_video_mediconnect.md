# Guion — Video de sustentación MediConnect

Dividido en dos partes completas (no alternadas): una persona lee la Parte 1 entera, la otra lee la Parte 2 entera. Asígnenlas como les convenga. Los corchetes `[así]` son indicaciones de qué mostrar en pantalla mientras se graba el audio — no se leen en voz alta.

Duración aproximada: 1:30–2:00 min por parte (~3:30 min en total). Si necesitas que alguna parte sea más corta o más larga, dime y la ajusto.

---

## PARTE 1 — Contexto, problema y arquitectura

[Mostrar en pantalla: logo de MediConnect / pantalla de login]

Buenas tardes. Somos William [apellido] y Gustavo [apellido], estudiantes de la Universidad Bicentenaria de Aragua, y en este video les presentamos MediConnect, nuestro proyecto de Aprendizaje Basado en Emprendimiento, en su tercer momento.

MediConnect es una plataforma de telemedicina pensada para un problema muy concreto: el seguimiento de pacientes con condiciones crónicas —hipertensión, diabetes, enfermedades cardiovasculares— en clínicas y comunidades de bajos recursos, donde ir al consultorio cada vez que hay que revisar una cifra de presión o un examen de laboratorio no siempre es viable.

La idea central es simple: que el médico pueda hacer seguimiento remoto y en tiempo real, y que el paciente pueda reportar sus mediciones, hablar con su médico, y —si algo se sale de control— recibir atención inmediata, sin depender únicamente de que alguien note el problema a tiempo.

[Mostrar en pantalla: diagrama de arquitectura o esquema de base de datos, si lo tienen]

A nivel técnico, el backend está construido en Node.js con Express, y la base de datos es MySQL, con dieciséis tablas que reflejan el modelo real de una consulta médica: pacientes, médicos, citas, signos vitales, resultados de laboratorio, medicamentos, alertas, y más. El frontend es HTML, CSS y JavaScript puro, sin frameworks — una decisión deliberada para mantener el proyecto ligero y que cada línea de código sea explicable en la sustentación.

Dos decisiones de arquitectura vale la pena destacar. La primera: usamos Socket.io para que las alertas médicas lleguen en tiempo real. Si un paciente registra una presión arterial peligrosamente alta, o reporta un síntoma urgente en nuestro asistente de Diagnóstico Flash, el médico correspondiente lo recibe al instante en su panel, sin tener que refrescar la página. La segunda: construimos videollamada con WebRTC nativo del navegador, para que el médico y el paciente puedan verse cara a cara cuando la situación lo amerita, con Socket.io funcionando como servidor de señalización.

Para la orientación automática de síntomas, usamos la API de Google Gemini: el paciente describe lo que siente, conversa con el asistente, y si el caso se clasifica como urgente, el sistema busca automáticamente un médico disponible en línea de la especialidad correspondiente para conectarlos de inmediato.

Ahora les mostramos cómo se ve todo esto funcionando.

---

## PARTE 2 — Demostración en vivo y cierre

[Mostrar en pantalla: pantalla de login, cambiando entre "Soy paciente" y "Soy médico"]

Como ven, el ingreso es distinto según el rol: el médico entra con su correo, y el paciente con su cédula, pensando en un público que quizás no usa el correo electrónico como identificador principal. Los médicos, además, pasan por una revisión de credenciales antes de poder acceder a la plataforma.

[Mostrar en pantalla: app de paciente — Inicio]

Esta es la aplicación del paciente. En Inicio ve sus próximas citas, sus medicamentos con un botón para marcar cada toma, y las indicaciones de su médico.

[Mostrar en pantalla: sección Salud — registrar signos vitales]

En la sección Salud, el paciente registra su presión arterial, frecuencia cardíaca, oxigenación y temperatura, siempre acompañado de una foto del aparato que usó — así queda un respaldo de la medición, ya que todavía no tenemos integración directa con dispositivos. Si un valor sale fuera de rango, el sistema genera una alerta automática para su médico, en tiempo real.

[Mostrar en pantalla: sección Diagnóstico Flash]

Aquí está el Diagnóstico Flash: el paciente conversa con el asistente describiendo sus síntomas, siempre con un aviso legal que aclara que esto no reemplaza a un médico. Si el caso se clasifica como urgente, el sistema conecta al paciente con un médico disponible o, si no hay ninguno en línea, notifica a todos los médicos de la especialidad correspondiente.

[Mostrar en pantalla: llamada de video en curso]

Y esta es la videollamada, funcionando entre dos dispositivos reales en redes distintas: el médico puede atender al paciente cara a cara desde el mismo panel de mensajes.

[Mostrar en pantalla: panel del médico — Alertas]

Del lado del médico, este es el panel de Alertas: cada alerta muestra el paciente, la prioridad, el tipo de evento y una descripción, y el médico puede marcarla como resuelta. A la derecha tiene un resumen del día: citas, mensajes sin leer y próximas citas, todo de un vistazo.

[Mostrar en pantalla: expediente de un paciente]

Y aquí está el expediente completo de un paciente: signos vitales, laboratorio, medicamentos recetados, historial de consultas e indicaciones — todo en un solo lugar, organizado por pestañas.

[Mostrar en pantalla: logo final / datos de contacto]

Esto es MediConnect hasta este momento: login, expediente clínico completo, alertas automáticas en tiempo real, diagnóstico asistido por inteligencia artificial, y videollamada — todo funcionando de punta a punta. Este es apenas el tercer momento de un proyecto de cuatro fases que pensamos llevar más allá del aula: nuestra meta es que MediConnect se convierta en una plataforma real, disponible para clínicas de nuestro país. Gracias por su atención.

---

### Notas para William (no son parte del guion)
- Los `[apellido]` en la primera línea hay que completarlos con los apellidos reales antes de grabar.
- Si alguna sección de pantalla no está lista para grabar (por ejemplo, videollamada o Diagnóstico Flash con datos reales), dime y ajusto el guion para no mencionar lo que no se vaya a mostrar.
- Puedo generar una versión más corta (ideal si el video tiene límite de tiempo) o más larga (si quieres explicar más el "por qué" de cada decisión, para reforzar la sustentación).
